#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Flask 应用构建模块
负责拼装所有服务、注册路由，并暴露 create_app() 方法供入口脚本使用。
"""

from __future__ import annotations

import json
import platform
import sys
import subprocess
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path
from typing import Any, Dict

from flask import Flask, jsonify, request, Response, stream_with_context
from flask_cors import CORS
from werkzeug.exceptions import HTTPException

from models.config import (
    AppConfig,
    JupyterConfig,
    SystemInfo,
    AIConfig,
)
from services.jupyter_service import JupyterManager
from services.config_service import ConfigService
from services.ai_service import AIService
from services.document_service import get_document_service
from services.markdown_document_service import get_markdown_document_service
from services.gitea_service import (
    GiteaClient,
    GiteaServiceError,
    publish_course,
    pull_course,
    scan_course,
    save_course_json,
    scan_folder,
)
from services.project_service import ProjectService
from utils.logger import get_logger
from .config_utils import merge_jupyter_payload, normalize_config_payload, build_ai_service

logger = get_logger(__name__)


def create_app(config_dir=None) -> Flask:
    """
    构建 Flask 应用。

    Args:
        config_dir: 可选的配置目录，默认沿用 ConfigService 的逻辑。
    """

    config_service = ConfigService(config_dir)
    app_config = config_service.load_config()
    jupyter_manager = JupyterManager(app_config.jupyter)
    ai_service = AIService(app_config.ai)
    project_service = ProjectService()

    app = Flask(__name__)
    CORS(app)

    def _persist_config(target_config: AppConfig | None = None) -> bool:
        config_to_save = target_config or app_config
        if not config_service.save_config(config_to_save):
            logger.warning("配置保存失败，使用内存中的配置继续运行")
            return False
        return True

    def _serialize_status() -> Dict[str, Any]:
        status = jupyter_manager.get_status().to_dict()
        status["config"] = {
            "python_executable": app_config.jupyter.python_executable,
            "project_dir": app_config.jupyter.project_dir,
            "port": app_config.jupyter.port,
        }
        return status

    def _merge_jupyter_payload(payload: Dict[str, Any]) -> Dict[str, Any]:
        """Wrap merge helper with current config + persistence."""
        return merge_jupyter_payload(
            app_config,
            payload,
            _persist_config,
            jupyter_manager,
        )

    def _normalize_config_payload(payload: Dict[str, Any]) -> AppConfig:
        """Normalize payload into AppConfig while preserving existing values."""
        return normalize_config_payload(app_config, payload)

    def _build_ai_service(overrides: Dict[str, Any]):
        """Build AI service with overrides merged onto current config."""
        return build_ai_service(app_config, overrides)

    def _collect_system_info() -> SystemInfo:
        info = SystemInfo(
            python_version=platform.python_version(),
            python_executable=sys.executable,
            platform=platform.platform(),
        )

        try:
            import jupyterlab  # type: ignore

            info.jupyterlab_installed = True
            info.jupyterlab_version = getattr(jupyterlab, "__version__", None)
        except Exception:
            info.jupyterlab_installed = False

        try:
            import notebook  # type: ignore

            info.jupyter_notebook_version = getattr(notebook, "__version__", None)
        except Exception:
            info.jupyter_notebook_version = None

        return info

    @app.errorhandler(Exception)
    def _handle_exception(error: Exception):
        if isinstance(error, HTTPException):
            return error
        logger.exception("后端发生未处理异常")
        return jsonify({"success": False, "message": str(error)}), 500

    @app.route("/api/debug/env")
    def debug_env():
        return jsonify({
            "cwd": os.getcwd(),
            "env_docs_dir": os.environ.get("XEDU_DOCS_DIR"),
            "app_config_dir": str(config_service.config_dir),
            "python_path": sys.path,
            "docs_service_path": str(get_markdown_document_service().docs_dir) if get_markdown_document_service() else "None"
        })

    @app.route("/")
    def root():
        return jsonify(
            {
                "message": "Xedu Client API Server",
                "version": "2.1.0",
                "timestamp": datetime.utcnow().isoformat(),
            }
        )

    @app.route("/api/health")
    def health_check():
        # 仅返回最基础的存活状态，避免执行耗时的 import 操作
        # 详细的系统信息可以通过 /api/detect_python 或 /api/status 获取
        return jsonify(
            {
                "message": "服务运行正常",
                "status": "ok",
                # "jupyter": jupyter_manager.get_status().to_dict(), # 暂时移除，避免每次轮询都检查状态
            }
        )

    @app.route("/api/status")
    def get_status():
        return jsonify(_serialize_status())

    @app.route("/api/start", methods=["POST"])
    def start_jupyter():
        payload = request.get_json() or {}
        merged_config = _merge_jupyter_payload(payload)
        logger.info(f"启动 Jupyter，请求参数: {payload}")
        result = jupyter_manager.start(**merged_config)
        if result.get("success"):
            result["config"] = merged_config
        return jsonify(result), (200 if result.get("success") else 500)

    @app.route("/api/stop", methods=["POST"])
    def stop_jupyter():
        logger.info("停止 Jupyter")
        result = jupyter_manager.stop()
        return jsonify(result), (200 if result.get("success") else 500)

    @app.route("/api/restart", methods=["POST"])
    def restart_jupyter():
        payload = request.get_json() or {}
        merged_config = _merge_jupyter_payload(payload)
        logger.info("重启 Jupyter")
        result = jupyter_manager.restart(**merged_config)
        if result.get("success"):
            result["config"] = merged_config
        return jsonify(result), (200 if result.get("success") else 500)

    @app.route("/api/detect_python")
    def detect_python():
        info = _collect_system_info()
        return jsonify(
            {
                "success": True,
                "message": "Python 环境检测成功",
                "info": info.to_dict(),
            }
        )

    @app.route("/api/save_config", methods=["POST"])
    def save_config():
        nonlocal app_config
        payload = request.get_json() or {}
        logger.info(f"保存配置: {payload.keys()}")
        app_config = _normalize_config_payload(payload)

        is_valid, errors = app_config.validate()
        if not is_valid:
            return (
                jsonify(
                    {
                        "success": False,
                        "message": "配置验证失败",
                        "errors": errors,
                    }
                ),
                400,
            )

        if config_service.save_config(app_config):
            jupyter_manager.config = app_config.jupyter
            ai_service.config = app_config.ai
            return jsonify(
                {
                    "success": True,
                    "message": "配置保存成功",
                    "config": app_config.to_dict(),
                }
            )

        return jsonify({"success": False, "message": "保存配置失败"}), 500

    @app.route("/api/load_config")
    def load_config():
        return jsonify(
            {
                "success": True,
                "message": "配置加载成功",
                "config": app_config.to_dict(),
            }
        )

    @app.route("/api/ai/ask", methods=["POST"])
    def ai_ask():
        payload = request.get_json() or {}
        question = (payload.get("question") or "").strip()
        if not question:
            return (
                jsonify({"success": False, "message": "问题不能为空"}),
                400,
            )

        image_data = payload.get("image")
        history = payload.get("history", [])
        overrides = payload.get("config", {})
        
        service = _build_ai_service(overrides)
        # 未配置 API Key 时直接返回 400，避免继续请求外部接口
        if not service.config.api_key:
            return (
                jsonify(
                    {
                        "success": False,
                        "message": "AI 未配置：请先在设置中填写 API Key",
                    }
                ),
                400,
            )

        response = service.ask_question(question, image_data, history)
        status_code = 200 if response.get("success") else 500
        return jsonify(response), status_code

    @app.route("/api/ai/test_config", methods=["POST"])
    def ai_test_config():
        payload = request.get_json() or {}
        overrides = payload.get("config", {})

        # 构建临时AI服务进行测试
        test_service = _build_ai_service(overrides)

        # 测试连接
        result = test_service.test_connection()
        status_code = 200 if result.get("success") else 500
        return jsonify(result), status_code

    @app.route("/api/ai/save_config", methods=["POST"])
    def ai_save_config():
        nonlocal app_config
        payload = request.get_json() or {}

        # 更新AI配置
        ai_config_dict = app_config.ai.to_dict()
        if payload.get("config"):
            ai_config_dict.update(payload["config"])

        # 创建新的AI配置
        new_ai_config = AIConfig.from_dict(ai_config_dict)

        # 验证配置
        is_valid, errors = new_ai_config.validate()
        if not is_valid:
            return (
                jsonify({
                    "success": False,
                    "message": "AI配置验证失败",
                    "errors": errors
                }),
                400,
            )

        # 更新应用配置
        app_config.ai = new_ai_config

        # 保存配置
        if config_service.save_config(app_config):
            # 更新AI服务实例
            ai_service.config = new_ai_config
            return jsonify({
                "success": True,
                "message": "AI配置保存成功",
                "config": new_ai_config.to_dict()
            })

            return jsonify({"success": False, "message": "保存AI配置失败"}), 500

    @app.route("/api/python/pip", methods=["POST"])
    def manage_python_package():
        """
        简易 pip 包管理接口，支持安装/卸载，默认使用清华源。
        请求体:
        {
            "action": "install" | "uninstall" | "list",
            "package": "包名",
            "use_mirror": true/false,
            "index_url": "自定义源，可选",
            "python_executable": "可选，覆盖当前配置",
            "stream": true/false  是否流式返回
        }
        """
        payload = request.get_json() or {}
        action = (payload.get("action") or "").lower()
        package = (payload.get("package") or "").strip()
        use_mirror = bool(payload.get("use_mirror", True))
        index_url = payload.get("index_url")
        stream = bool(payload.get("stream"))

        if action not in {"install", "uninstall", "list", "upgrade"}:
            return jsonify({"success": False, "message": "无效的操作类型"}), 400

        if action in {"install", "uninstall", "upgrade"} and not package:
            return jsonify({"success": False, "message": "包名不能为空"}), 400

        python_path = (
            payload.get("python_executable")
            or app_config.jupyter.python_executable
            or sys.executable
        )

        cmd = [python_path, "-m", "pip"]
        if action == "install":
            cmd += ["install", package]
        elif action == "upgrade":
            cmd += ["install", "--upgrade", package]
        elif action == "uninstall":
            cmd += ["uninstall", "-y", package]
        elif action == "list":
            cmd += ["list"]

        # 安装/升级支持镜像源；pip uninstall 不支持 -i 参数
        if use_mirror and action in {"install", "upgrade"}:
            cmd += ["-i", index_url or "https://pypi.tuna.tsinghua.edu.cn/simple"]

        logger.info(f"执行 pip 命令: {' '.join(cmd)}")

        if stream:
            def generate():
                try:
                    proc = subprocess.Popen(
                        cmd,
                        stdout=subprocess.PIPE,
                        stderr=subprocess.STDOUT,
                        text=True,
                        bufsize=1,
                        universal_newlines=True,
                    )
                    if proc.stdout:
                        for line in proc.stdout:
                            yield line
                    ret = proc.wait()
                    yield f"\n=== 退出码: {ret} ===\n"
                except Exception as e:
                    yield f"\n[error] {str(e)}\n"

            return Response(stream_with_context(generate()), mimetype="text/plain")

        try:
            result = subprocess.run(
                cmd, capture_output=True, text=True, timeout=300, check=False
            )
            success = result.returncode == 0
            return (
                jsonify(
                    {
                        "success": success,
                        "message": "操作成功" if success else "操作失败",
                        "output": result.stdout,
                        "error_output": result.stderr,
                        "return_code": result.returncode,
                    }
                ),
                200 if success else 500,
            )
        except subprocess.TimeoutExpired:
            return (
                jsonify({"success": False, "message": "pip 命令执行超时"}),
                500,
            )
        except Exception as e:
            logger.error(f"pip 命令执行异常: {e}")
            return jsonify({"success": False, "message": str(e)}), 500

    @app.route("/api/documents/search")
    def search_documents():
        query = request.args.get('q', '').strip()
        limit = int(request.args.get('limit', 10))

        try:
            # 使用新的Markdown文档服务
            doc_service = get_markdown_document_service()
            results = doc_service.search(query, limit)

            return jsonify({
                "success": True,
                "results": results,
                "total": len(results)
            })
        except Exception as e:
            logger.error(f"搜索文档失败: {e}")
            return jsonify({"success": False, "message": "搜索失败"}), 500

    @app.route("/api/documents/<doc_id>")
    def get_document(doc_id):
        try:
            doc_service = get_markdown_document_service()
            doc = doc_service.get_document(doc_id)
            if doc:
                return jsonify({
                    "success": True,
                    "document": doc.to_dict()
                })
            else:
                return jsonify({"success": False, "message": "文档不存在"}), 404
        except Exception as e:
            logger.error(f"获取文档失败: {e}")
            return jsonify({"success": False, "message": "获取文档失败"}), 500

    @app.route("/api/documents/<doc_id>/render")
    def render_document(doc_id):
        """渲染Markdown文档为HTML"""
        try:
            doc_service = get_markdown_document_service()
            html_content = doc_service.render_document(doc_id)
            if html_content:
                # 明确指定 charset=utf-8
                return Response(html_content, mimetype='text/html', content_type='text/html; charset=utf-8')
            else:
                return jsonify({"success": False, "message": "文档不存在"}), 404
        except Exception as e:
            logger.error(f"渲染文档失败: {e}")
            return jsonify({"success": False, "message": "渲染失败"}), 500

    @app.route("/api/documents/<doc_id>/markdown")
    def get_markdown_content(doc_id):
        """获取原始Markdown内容"""
        try:
            doc_service = get_markdown_document_service()
            markdown_content = doc_service.get_markdown_content(doc_id)
            if markdown_content:
                return markdown_content, 200, {'Content-Type': 'text/markdown; charset=utf-8'}
            else:
                return jsonify({"success": False, "message": "文档不存在"}), 404
        except Exception as e:
            logger.error(f"获取Markdown内容失败: {e}")
            return jsonify({"success": False, "message": "获取内容失败"}), 500

    @app.route("/api/documents/categories")
    def get_document_categories():
        try:
            doc_service = get_markdown_document_service()
            categories = doc_service.get_categories()
            return jsonify({
                "success": True,
                "categories": categories
            })
        except Exception as e:
            logger.error(f"获取文档分类失败: {e}")
            return jsonify({"success": False, "message": "获取分类失败"}), 500

    @app.route("/api/documents/components")
    def get_document_components():
        try:
            doc_service = get_markdown_document_service()
            components = doc_service.get_components()
            return jsonify({
                "success": True,
                "components": components
            })
        except Exception as e:
            logger.error(f"获取文档组件失败: {e}")
            return jsonify({"success": False, "message": "获取组件失败"}), 500

    @app.route("/api/resources/index")
    def get_resources_index():
        ui_config = app_config.ui
        base_url = (ui_config.resources_base_url or "").rstrip("/")
        repo = (ui_config.resources_repo or "").strip("/")
        branch = (ui_config.resources_branch or "main").strip() or "main"
        index_path = (ui_config.resources_index_path or "index.json").lstrip("/")
        submit_url = (ui_config.resources_submit_url or "").strip()

        if not base_url or not repo:
            return jsonify({
                "success": False,
                "message": "课程资源库未配置",
                "index": {},
                "submit_url": submit_url,
                "repo_url": "",
                "raw_base_url": "",
                "branch": branch
            })

        repo_url = f"{base_url}/{repo}"
        raw_base_url = f"{repo_url}/raw/{branch}"
        index_url = f"{raw_base_url}/{index_path}"
        if not submit_url:
            submit_url = f"{repo_url}/issues/new"

        try:
            with urllib.request.urlopen(index_url, timeout=10) as response:
                raw = response.read().decode("utf-8")
            index_data = json.loads(raw)
            return jsonify({
                "success": True,
                "index": index_data,
                "source_url": index_url,
                "repo_url": repo_url,
                "raw_base_url": raw_base_url,
                "branch": branch,
                "submit_url": submit_url
            })
        except urllib.error.HTTPError as e:
            logger.error(f"获取资源索引失败: HTTP {e.code} {e.reason}")
            return jsonify({
                "success": False,
                "message": "获取资源索引失败",
                "error": f"HTTP {e.code} {e.reason}"
            }), 500
        except Exception as e:
            logger.error(f"获取资源索引失败: {e}")
            return jsonify({
                "success": False,
                "message": "获取资源索引失败",
                "error": str(e)
            }), 500

    @app.route("/api/resources/scan", methods=["POST"])
    def scan_resource_course():
        payload = request.get_json(silent=True) or {}
        local_path = payload.get("local_path", "")
        init_if_missing = bool(payload.get("init_if_missing"))
        init_meta = payload.get("meta") or {}
        auto_build = bool(payload.get("auto_build"))
        try:
            result = scan_course(
                local_path,
                init_if_missing=init_if_missing,
                init_meta=init_meta,
                auto_build=auto_build,
            )
            return jsonify({
                "success": True,
                "course": result.course,
                "summary": result.summary,
            })
        except GiteaServiceError as e:
            return jsonify({"success": False, "message": str(e)}), 400
        except Exception as e:
            logger.error(f"扫描课程失败: {e}")
            return jsonify({"success": False, "message": "扫描课程失败"}), 500

    @app.route("/api/resources/publish", methods=["POST"])
    def publish_resource_course():
        payload = request.get_json(silent=True) or {}
        local_path = payload.get("local_path", "")
        course_id = payload.get("course_id", "")
        version = payload.get("version", "")
        meta_override = payload.get("meta_override") or {}

        ui_config = app_config.ui
        base_url = (ui_config.resources_base_url or "").rstrip("/")
        repo = (ui_config.resources_repo or "").strip("/")
        branch = (ui_config.resources_branch or "main").strip() or "main"
        publish_path = (getattr(ui_config, "resources_publish_path", "") or "courses").strip("/") or "courses"
        token = (getattr(ui_config, "resources_publish_token", "") or "").strip()

        if not base_url or not repo:
            return jsonify({"success": False, "message": "课程资源库未配置"}), 400
        if not token:
            return jsonify({"success": False, "message": "未配置 Gitea Token"}), 400

        try:
            client = GiteaClient(base_url, repo, branch, token)
            result = publish_course(
                local_path=local_path,
                client=client,
                publish_path=publish_path,
                course_id=course_id,
                version=version,
                meta_override=meta_override,
            )
            return jsonify({
                "success": True,
                "result": result,
            })
        except GiteaServiceError as e:
            return jsonify({"success": False, "message": str(e)}), 400
        except Exception as e:
            logger.error(f"发布课程失败: {e}")
            return jsonify({"success": False, "message": "发布课程失败"}), 500

    @app.route("/api/resources/pull", methods=["POST"])
    def pull_resource_course():
        payload = request.get_json(silent=True) or {}
        course_url = payload.get("course_url", "")
        package_url = payload.get("package_url", "")
        target_path = payload.get("target_path", "")

        ui_config = app_config.ui
        base_url = (ui_config.resources_base_url or "").rstrip("/")
        repo = (ui_config.resources_repo or "").strip("/")
        branch = (ui_config.resources_branch or "main").strip() or "main"
        publish_path = (getattr(ui_config, "resources_publish_path", "") or "courses").strip("/") or "courses"

        if not base_url or not repo:
            return jsonify({"success": False, "message": "课程资源库未配置"}), 400

        raw_base_url = f"{base_url}/{repo}/raw/{branch}"

        if not target_path:
            default_root = Path.home() / "Documents" / "XeduCourses"
            default_root.mkdir(parents=True, exist_ok=True)
            course_id = (course_url or "").split("/")[-2] if course_url else "course"
            target_path = str(default_root / course_id)

        try:
            result = pull_course(
                raw_base_url=raw_base_url,
                course_url=course_url,
                package_url=package_url,
                target_path=target_path,
            )
            return jsonify({
                "success": True,
                "course": result.course,
                "summary": result.summary,
                "local_path": target_path,
                "publish_path": publish_path,
            })
        except GiteaServiceError as e:
            return jsonify({"success": False, "message": str(e)}), 400
        except Exception as e:
            logger.error(f"导入课程失败: {e}")
            return jsonify({"success": False, "message": "导入课程失败"}), 500

    @app.route("/api/resources/save-course", methods=["POST"])
    def save_resource_course():
        payload = request.get_json(silent=True) or {}
        local_path = payload.get("local_path", "")
        course = payload.get("course") or {}
        try:
            result = save_course_json(local_path, course)
            return jsonify({
                "success": True,
                "course": result.course,
                "summary": result.summary,
            })
        except GiteaServiceError as e:
            return jsonify({"success": False, "message": str(e)}), 400
        except Exception as e:
            logger.error(f"保存课程结构失败: {e}")
            return jsonify({"success": False, "message": "保存课程结构失败"}), 500

    @app.route("/api/resources/scan-folder", methods=["POST"])
    def scan_resource_folder():
        payload = request.get_json(silent=True) or {}
        base_path = payload.get("base_path", "")
        folder_path = payload.get("folder_path", "")
        try:
            files = scan_folder(base_path, folder_path)
            return jsonify({
                "success": True,
                "files": files
            })
        except GiteaServiceError as e:
            return jsonify({"success": False, "message": str(e)}), 400
        except Exception as e:
            logger.error(f"读取材料失败: {e}")
            return jsonify({"success": False, "message": "读取材料失败"}), 500

    @app.route("/api/projects/templates", methods=["GET"])
    def get_project_templates():
        try:
            templates = project_service.get_templates()
            default_path = project_service.get_default_project_path()
            return jsonify({
                "success": True,
                "templates": templates,
                "default_path": default_path
            })
        except Exception as e:
            logger.error(f"获取模板失败: {e}")
            return jsonify({"success": False, "message": "获取模板失败"}), 500

    @app.route("/api/projects/create", methods=["POST"])
    def create_project():
        payload = request.get_json() or {}
        name = payload.get("name", "").strip()
        path = payload.get("path", "").strip()
        template_id = payload.get("template_id", "blank").strip()
        description = payload.get("description", "").strip()

        if not name or not path:
            return jsonify({"success": False, "message": "项目名称和路径不能为空"}), 400

        result = project_service.create_project(name, path, template_id, description)
        status_code = 200 if result.get("success") else 400
        return jsonify(result), status_code

    return app
