#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Flask 应用构建模块
负责拼装所有服务、注册路由，并暴露 create_app() 方法供入口脚本使用。
"""

from __future__ import annotations

import json
import mimetypes
import os
import platform
import sys
import subprocess
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime
from typing import Any, Dict, List

from flask import Flask, jsonify, request, Response, stream_with_context, send_file, after_this_request
from flask_cors import CORS
from werkzeug.exceptions import HTTPException

from models.config import (
    AppConfig,
    JupyterConfig,
    SystemInfo,
)
from services.jupyter_service import JupyterManager
from services.config_service import ConfigService
from services.ai_service import AIService
from services.document_service import get_document_service
from services.markdown_document_service import get_markdown_document_service
from services.gitea_service import (
    GiteaClient,
    GiteaServiceError,
    build_single_course_entry,
    find_course_entry_from_index,
    load_index_data,
    load_course_data_from_repo,
    publish_course,
    pull_course,
    scan_course,
    save_course_json,
    scan_folder,
)
from services.project_service import ProjectService
from services.quickform_service import (
    QuickFormService,
    QuickFormServiceError,
)
from services.quickform_agent_service import (
    QuickFormAgentService,
    QuickFormAgentToolAdapter,
    looks_like_confirmation,
    looks_like_quickform_request,
)
from services.xedu_pack_agent_service import (
    XEduPackAgentService,
    XEduPackToolAdapter,
    looks_like_xedu_pack_request,
)
from services.blockly_builder_agent_service import (
    BlocklyBuilderAgentService,
    BlocklyBuilderToolAdapter,
    looks_like_blockly_builder_request,
)
from services.classroom_service import (
    ClassroomService,
    ClassroomServiceError,
)
from utils.logger import get_logger
from .config_utils import merge_jupyter_payload, normalize_config_payload, build_ai_service
from .quickform_runtime import (
    inject_quickform_file,
    merge_quickform_config,
    normalize_quickform_public_config,
)
from .resource_runtime import (
    build_blockly_playground_html,
    build_single_course_source_entry,
    collect_resource_sources,
    decode_local_preview_token,
    derive_course_id_from_path,
    guess_blockly_notebook_path,
    guess_blockly_python_path,
    guess_blockly_toolbox_path,
    get_frontend_build_dir,
    normalize_resource_source,
    resolve_local_course_file,
    resolve_resource_source_for_request,
    execute_xeduhub_runtime,
)
from .routes.ai import register_ai_routes
from .routes.classroom import register_classroom_routes
from .routes.quickform import register_quickform_routes
from .routes.resources import register_resource_routes

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
    classroom_service = ClassroomService()

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

    def _resolve_resources_token(ui_config, token_override: str = "") -> str:
        """
        Resolve publish token with server-side fallback for classroom-wide deployment.
        Priority: request override > UI config > XEDU_GITEA_TOKEN env.
        """
        override = (token_override or "").strip()
        if override:
            return override
        config_token = (getattr(ui_config, "resources_publish_token", "") or "").strip()
        if config_token:
            return config_token
        return (os.getenv("XEDU_GITEA_TOKEN", "") or "").strip()

    def _parse_bool(value: Any, default: bool = True) -> bool:
        if isinstance(value, bool):
            return value
        if isinstance(value, str):
            text = value.strip().lower()
            if text in {"false", "0", "no", "off"}:
                return False
            if text in {"true", "1", "yes", "on"}:
                return True
        if value is None:
            return default
        return bool(value)

    def _build_quickform_service(overrides: Dict[str, Any] | None = None) -> QuickFormService:
        cfg = merge_quickform_config(app_config.ui, _parse_bool, overrides)
        if not cfg.get("enabled"):
            raise QuickFormServiceError("请先在设置中启用 QuickForm")
        return QuickFormService(
            base_url=cfg["base_url"],
            username=cfg["username"],
            password=cfg["password"],
        )

    def _save_local_course(local_path: str, course: Dict[str, Any]) -> Dict[str, Any]:
        result = save_course_json(local_path, course)
        normalized_course = dict(result.course or {})
        normalized_course["local_path"] = local_path
        normalized_course["source"] = "local"
        return {
            "course": normalized_course,
            "summary": result.summary,
        }

    def _build_quickform_tool_adapter(overrides: Dict[str, Any] | None = None) -> QuickFormAgentToolAdapter:
        def mutation_guard(request_context: Dict[str, Any]) -> tuple[bool, str]:
            if not _validate_teacher_code(request):
                return False, "教师权限校验失败"
            if not request_context.get("confirmed"):
                return False, "请先让教师明确确认后再执行写入"
            return True, ""

        return QuickFormAgentToolAdapter(
            quickform_factory=lambda: _build_quickform_service(overrides),
            mutation_guard=mutation_guard,
            html_injector=lambda local_path, html_path, quickform, create_backup=True: inject_quickform_file(
                local_path,
                html_path,
                quickform,
                create_backup,
                _parse_bool,
                resolve_local_course_file,
            ),
            course_saver=_save_local_course,
        )

    def _build_quickform_agent_service(overrides: Dict[str, Any] | None = None) -> QuickFormAgentService:
        runner_factory = app.config.get("KIMI_AGENT_RUNNER_FACTORY")
        runner = runner_factory() if callable(runner_factory) else None
        return QuickFormAgentService(
            ai_config=_build_ai_service(overrides).config,
            tool_adapter=_build_quickform_tool_adapter(overrides),
            fallback_ai_service=_build_ai_service(overrides),
            runner=runner,
        )

    def _publish_xedu_pack_output(local_path: str, options: Dict[str, Any] | None = None) -> Dict[str, Any]:
        payload = options or {}
        course_meta = payload.get("course") if isinstance(payload.get("course"), dict) else {}
        source_override = (course_meta.get("origin") if isinstance(course_meta.get("origin"), dict) else {}) or {}
        source_id = str(payload.get("source_id") or source_override.get("source_id") or "").strip()
        version = str(payload.get("version") or course_meta.get("version") or "").strip()

        selected_source = resolve_resource_source_for_request(
            app_config.ui,
            _parse_bool,
            source_id=source_id,
            source_override=source_override,
        )
        if not selected_source:
            raise GiteaServiceError("未配置可用的课程发布源")

        base_url = (selected_source.get("base_url") or "").rstrip("/")
        repo = (selected_source.get("repo") or "").strip("/")
        branch = (selected_source.get("branch") or "main").strip() or "main"
        publish_path = (selected_source.get("publish_path") or "courses").strip("/") or "courses"
        token = _resolve_resources_token(app_config.ui, "")
        single_course_repo = _parse_bool(selected_source.get("single_course_repo"), True)

        if not token:
            raise GiteaServiceError("写操作需要 Token（请在设置中填写或由服务端配置 XEDU_GITEA_TOKEN）")

        client = GiteaClient(base_url, repo, branch, token)
        repo_status = client.ensure_repo(create_if_missing=True, private=False, description="")
        result = publish_course(
            local_path=local_path,
            client=client,
            publish_path=publish_path,
            course_id=str(course_meta.get("id") or "").strip(),
            version=version,
            meta_override={
                "title": course_meta.get("title") or "",
                "description": course_meta.get("description") or "",
                "grade": course_meta.get("grade") or "",
                "subject": course_meta.get("subject") or "",
                "author": course_meta.get("author") or "",
                "tags": course_meta.get("tags") or [],
                "version": version,
            },
            publish_branch="",
            create_pr=True,
            pr_base_branch=branch,
            single_course_repo=single_course_repo,
        )
        return {
            "result": result,
            "pr_url": ((result.get("pull_request") or {}).get("url") or ""),
            "repo_created": bool(repo_status.get("created")),
            "origin": {
                "source_id": selected_source.get("id", ""),
                "base_url": base_url,
                "repo": repo,
                "branch": branch,
                "publish_path": "" if single_course_repo else publish_path,
                "single_course_repo": single_course_repo,
            },
        }

    def _build_xedu_pack_tool_adapter(overrides: Dict[str, Any] | None = None) -> XEduPackToolAdapter:
        def mutation_guard(request_context: Dict[str, Any]) -> tuple[bool, str]:
            if not _validate_teacher_code(request):
                return False, "教师权限校验失败"
            if not request_context.get("confirmed"):
                return False, "请先让教师明确确认后再执行写入"
            return True, ""

        return XEduPackToolAdapter(
            mutation_guard=mutation_guard,
            publisher=_publish_xedu_pack_output,
        )

    def _build_xedu_pack_agent_service(overrides: Dict[str, Any] | None = None) -> XEduPackAgentService:
        runner_factory = app.config.get("KIMI_AGENT_RUNNER_FACTORY")
        runner = runner_factory() if callable(runner_factory) else None
        return XEduPackAgentService(
            ai_config=_build_ai_service(overrides).config,
            tool_adapter=_build_xedu_pack_tool_adapter(overrides),
            fallback_ai_service=_build_ai_service(overrides),
            runner=runner,
        )

    def _build_blockly_builder_tool_adapter(overrides: Dict[str, Any] | None = None) -> BlocklyBuilderToolAdapter:
        def mutation_guard(request_context: Dict[str, Any]) -> tuple[bool, str]:
            if not _validate_teacher_code(request):
                return False, "教师权限校验失败"
            if not request_context.get("confirmed"):
                return False, "请先让教师明确确认后再执行写入"
            return True, ""

        return BlocklyBuilderToolAdapter(
            mutation_guard=mutation_guard,
            draft_root=config_service.config_dir / "blockly_drafts",
        )

    def _build_blockly_builder_agent_service(overrides: Dict[str, Any] | None = None) -> BlocklyBuilderAgentService:
        runner_factory = app.config.get("KIMI_AGENT_RUNNER_FACTORY")
        runner = runner_factory() if callable(runner_factory) else None
        return BlocklyBuilderAgentService(
            ai_config=_build_ai_service(overrides).config,
            tool_adapter=_build_blockly_builder_tool_adapter(overrides),
            fallback_ai_service=_build_ai_service(overrides),
            runner=runner,
        )

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

    def _resolve_api_port() -> int:
        try:
            host = request.host or ""
            if ":" in host:
                return int(host.rsplit(":", 1)[-1])
        except Exception:
            pass
        return int(os.environ.get("XEDU_API_PORT") or os.environ.get("XEDU_BACKEND_PORT") or "5123")

    def _get_teacher_code_from_request(req) -> str:
        payload = req.get_json(silent=True) or {}
        return (
            req.headers.get("X-Teacher-Code")
            or req.args.get("teacher_code")
            or payload.get("teacher_code")
            or payload.get("teacherCode")
            or ""
        )

    def _validate_teacher_code(req) -> bool:
        required = (app_config.ui.classroom_teacher_code or "").strip()
        if not required:
            return True
        provided = _get_teacher_code_from_request(req)
        return (provided or "").strip() == required

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

    register_quickform_routes(app, {
        "build_quickform_service": _build_quickform_service,
        "merge_quickform_config": lambda overrides=None: merge_quickform_config(app_config.ui, _parse_bool, overrides),
        "logger": logger,
    })

    register_ai_routes(app, {
        "ai_service": ai_service,
        "build_ai_service": _build_ai_service,
        "build_quickform_agent_service": _build_quickform_agent_service,
        "build_xedu_pack_agent_service": _build_xedu_pack_agent_service,
        "build_blockly_builder_agent_service": _build_blockly_builder_agent_service,
        "looks_like_confirmation": looks_like_confirmation,
        "looks_like_quickform_request": looks_like_quickform_request,
        "looks_like_xedu_pack_request": looks_like_xedu_pack_request,
        "looks_like_blockly_builder_request": looks_like_blockly_builder_request,
        "config_service": config_service,
        "get_app_config": lambda: app_config,
    })

    register_classroom_routes(app, {
        "classroom_service": classroom_service,
        "logger": logger,
        "validate_teacher_code": _validate_teacher_code,
        "resolve_api_port": _resolve_api_port,
    })

    register_resource_routes(app, {
        "get_app_config": lambda: app_config,
        "logger": logger,
        "parse_bool": _parse_bool,
        "resolve_resources_token": _resolve_resources_token,
        "normalize_resource_source": lambda raw, fallback_id: normalize_resource_source(raw, fallback_id, _parse_bool),
        "collect_resource_sources": lambda ui_config: collect_resource_sources(ui_config, _parse_bool),
        "resolve_resource_source_for_request": lambda ui_config, **kwargs: resolve_resource_source_for_request(
            ui_config,
            _parse_bool,
            **kwargs,
        ),
        "build_single_course_source_entry": build_single_course_source_entry,
        "derive_course_id_from_path": derive_course_id_from_path,
        "decode_local_preview_token": decode_local_preview_token,
        "resolve_local_course_file": resolve_local_course_file,
        "normalize_quickform_public_config": lambda raw: normalize_quickform_public_config(raw, _parse_bool),
        "inject_quickform_file": lambda local_path, html_path, quickform, create_backup=True: inject_quickform_file(
            local_path,
            html_path,
            quickform,
            create_backup,
            _parse_bool,
            resolve_local_course_file,
        ),
        "guess_blockly_toolbox_path": guess_blockly_toolbox_path,
        "guess_blockly_python_path": guess_blockly_python_path,
        "guess_blockly_notebook_path": guess_blockly_notebook_path,
        "get_frontend_build_dir": get_frontend_build_dir,
        "build_blockly_playground_html": build_blockly_playground_html,
        "execute_xeduhub_runtime": execute_xeduhub_runtime,
    })

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
                    yield f"__XEDU_PIP_RESULT__={json.dumps({'return_code': ret, 'success': ret == 0}, ensure_ascii=False)}\n"
                except Exception as e:
                    yield f"\n[error] {str(e)}\n"
                    yield f"__XEDU_PIP_RESULT__={json.dumps({'return_code': -1, 'success': False, 'message': str(e)}, ensure_ascii=False)}\n"

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
