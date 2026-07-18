# -*- coding: utf-8 -*-
"""
资源核心路由模块。
"""

from __future__ import annotations

import os
import tempfile
import urllib.error
from datetime import datetime
from pathlib import Path

from flask import Response, jsonify, request, send_file
from api.resource_runtime import (
    InvalidResourceHandle,
    InvalidScratchProject,
    ResourceHandleExpired,
    ScratchProjectTooLarge,
    validate_scratch_project_archive,
)
from api.security import require_capability, require_same_origin_or_native

from services.gitea_service import (
    GiteaServiceError,
    find_course_entry_from_index,
    inspect_course,
    load_course_data_from_repo,
    load_index_data,
    load_repo_tree_data,
    scan_course,
    scan_folder,
)


MAX_SCRATCH_PROJECT_BYTES = 64 * 1024 * 1024


def register_resource_routes(app, services: dict):
    """注册资源相关路由"""

    get_app_config = services["get_app_config"]
    logger = services["logger"]
    parse_bool = services["parse_bool"]
    resolve_resources_token = services["resolve_resources_token"]
    normalize_resource_source = services["normalize_resource_source"]
    collect_resource_sources = services["collect_resource_sources"]
    resolve_resource_source_for_request = services["resolve_resource_source_for_request"]
    build_single_course_source_entry = services["build_single_course_source_entry"]
    derive_course_id_from_path = services["derive_course_id_from_path"]
    resolve_resource_handle = services["resolve_resource_handle"]
    register_resource_root = services["register_resource_root"]
    issue_resource_handle = services["issue_resource_handle"]
    get_frontend_build_dir = services["get_frontend_build_dir"]

    def _get_scratch_editor_build_dir() -> Path:
        configured = services.get("get_scratch_editor_build_dir")
        if callable(configured):
            return configured()
        return Path(__file__).resolve().parents[3] / "scratch-editor" / "build"

    def _send_scratch_editor_asset(asset_path: str):
        build_dir = _get_scratch_editor_build_dir().resolve()
        target = (build_dir / asset_path).resolve()
        if build_dir != target and build_dir not in target.parents:
            return jsonify({"success": False, "message": "非法 Scratch 资源路径"}), 400
        if not target.exists() or not target.is_file():
            return jsonify({"success": False, "message": "Scratch 编辑器资源不存在"}), 404
        return send_file(target)

    @app.route("/api/resources/frontend-assets/<path:asset_path>")
    def resources_frontend_assets(asset_path):
        try:
            build_dir = get_frontend_build_dir()
            target = (build_dir / asset_path).resolve()
            if build_dir.resolve() != target and build_dir.resolve() not in target.parents:
                return jsonify({"success": False, "message": "非法资源路径"}), 400
            if not target.exists() or not target.is_file():
                return jsonify({"success": False, "message": "前端资源不存在"}), 404
            return send_file(target)
        except Exception as exc:
            logger.error(f"读取前端资源失败: {exc}")
            return jsonify({"success": False, "message": "读取前端资源失败"}), 500

    @app.route("/api/scratch-editor/")
    @app.route("/api/scratch-editor/index.html")
    def resources_scratch_editor_index():
        try:
            build_dir = _get_scratch_editor_build_dir()
            index_file = build_dir / "index.html"
            if index_file.exists() and index_file.is_file():
                return send_file(index_file)
            return Response(
                """<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>XEdu Scratch</title>
  <style>
    html, body { height: 100%; margin: 0; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f4f7fb; color: #1f2937; }
    main { height: 100%; display: grid; place-items: center; padding: 24px; box-sizing: border-box; }
    section { max-width: 680px; padding: 28px; border: 1px solid #d9e2ef; border-radius: 12px; background: white; box-shadow: 0 12px 36px rgba(15, 23, 42, .08); }
    h1 { margin: 0 0 12px; font-size: 24px; }
    p { margin: 8px 0; line-height: 1.65; }
    code { padding: 2px 6px; border-radius: 6px; background: #eef3fb; }
  </style>
</head>
<body>
  <main>
    <section>
      <h1>XEdu Scratch 编辑器尚未构建</h1>
      <p>请先在项目根目录运行 <code>npm run build:scratch</code> 生成本地 Scratch 编辑器产物。</p>
      <p>第一版会在这里加载内置 Scratch，并提供 XEdu AI 扩展积木。</p>
    </section>
  </main>
</body>
</html>""",
                mimetype="text/html",
            )
        except Exception as exc:
            logger.error(f"读取 Scratch 编辑器首页失败: {exc}")
            return jsonify({"success": False, "message": "读取 Scratch 编辑器首页失败"}), 500

    @app.route("/api/scratch-editor/<path:asset_path>")
    def resources_scratch_editor_asset(asset_path):
        try:
            return _send_scratch_editor_asset(asset_path)
        except Exception as exc:
            logger.error(f"读取 Scratch 编辑器资源失败: {exc}")
            return jsonify({"success": False, "message": "读取 Scratch 编辑器资源失败"}), 500

    @app.route("/api/resources/default-sample", methods=["GET"])
    @require_capability("resource:read")
    def get_default_sample_course():
        try:
            backend_root = Path(__file__).resolve().parents[2]
            sample_dir = backend_root / "sasu" / "zhangjiang-image-recognition"
            course_file = sample_dir / "course.json"
            if not course_file.exists():
                return jsonify({"success": False, "message": "默认测试样例不存在"}), 404
            result = scan_course(str(sample_dir), init_if_missing=False, init_meta=None, auto_build=False)
            root_id = register_resource_root(sample_dir, "course", "default-sample")
            resource_handle = issue_resource_handle(root_id, "", "read")
            return jsonify({
                "success": True,
                "sample": {
                    "label": "默认测试样例",
                    "resource_handle": resource_handle,
                    "course": result.course,
                    "summary": result.summary,
                },
            })
        except GiteaServiceError as exc:
            return jsonify({"success": False, "message": str(exc)}), 400
        except Exception as exc:
            logger.error(f"读取默认测试样例失败: {exc}")
            return jsonify({"success": False, "message": "读取默认测试样例失败"}), 500

    @app.route("/api/resources/local-file/<root_token>/<path:relpath>")
    @require_capability("resource:read")
    def resources_local_file(root_token, relpath):
        try:
            file_path = resolve_resource_handle(root_token, "read", relpath)
            if not file_path.exists() or not file_path.is_file():
                return jsonify({"success": False, "message": "文件不存在"}), 404
            return send_file(file_path)
        except ResourceHandleExpired as exc:
            return jsonify({"success": False, "message": str(exc)}), 410
        except (InvalidResourceHandle, ValueError) as exc:
            return jsonify({"success": False, "message": str(exc)}), 400
        except Exception as exc:
            logger.error(f"读取本地预览文件失败: {exc}")
            return jsonify({"success": False, "message": "读取本地预览文件失败"}), 500

    @app.route("/api/resources/scratch-project/<root_token>/<path:relpath>", methods=["GET"])
    @require_same_origin_or_native()
    def resources_scratch_project_file(root_token, relpath):
        try:
            clean_relpath = str(relpath or "").strip().lstrip("/")
            if not clean_relpath.lower().endswith(".sb3"):
                return jsonify({"success": False, "message": "仅支持 Scratch .sb3 项目文件"}), 400
            file_path = resolve_resource_handle(root_token, "read", clean_relpath)
            if not file_path.exists() or not file_path.is_file():
                return jsonify({"success": False, "message": "Scratch 项目文件不存在"}), 404
            return send_file(file_path, mimetype="application/x.scratch.sb3", as_attachment=False)
        except ResourceHandleExpired as exc:
            return jsonify({"success": False, "message": str(exc)}), 410
        except (InvalidResourceHandle, ValueError) as exc:
            return jsonify({"success": False, "message": str(exc)}), 400
        except Exception as exc:
            logger.error(f"读取 Scratch 项目文件失败: {exc}")
            return jsonify({"success": False, "message": "读取 Scratch 项目文件失败"}), 500

    @app.route("/api/resources/scratch-project/<root_token>/<path:relpath>", methods=["PUT", "POST"])
    @require_same_origin_or_native()
    def resources_scratch_project_save(root_token, relpath):
        temp_path = None
        try:
            clean_relpath = str(relpath or "").strip().lstrip("/")
            if not clean_relpath.lower().endswith(".sb3"):
                return jsonify({"success": False, "message": "仅支持保存 Scratch .sb3 项目文件"}), 400
            file_path = resolve_resource_handle(root_token, "write", clean_relpath)
            if request.content_length is not None and request.content_length > MAX_SCRATCH_PROJECT_BYTES:
                return jsonify({"success": False, "message": "Scratch 项目超过允许的上传大小"}), 413
            data = request.stream.read(MAX_SCRATCH_PROJECT_BYTES + 1)
            if not data:
                return jsonify({"success": False, "message": "Scratch 项目内容为空"}), 400
            if len(data) > MAX_SCRATCH_PROJECT_BYTES:
                return jsonify({"success": False, "message": "Scratch 项目超过允许的上传大小"}), 413
            try:
                validate_scratch_project_archive(data)
            except ScratchProjectTooLarge as exc:
                return jsonify({"success": False, "message": str(exc)}), 413
            except InvalidScratchProject as exc:
                return jsonify({"success": False, "message": str(exc)}), 400

            file_path.parent.mkdir(parents=True, exist_ok=True)
            with tempfile.NamedTemporaryFile(
                mode="wb", dir=file_path.parent, prefix=f".{file_path.name}.", delete=False
            ) as temp_file:
                temp_file.write(data)
                temp_path = Path(temp_file.name)
            os.replace(temp_path, file_path)
            temp_path = None
            return jsonify({
                "success": True,
                "message": "Scratch 项目已保存",
                "path": clean_relpath,
                "size": len(data),
                "updated_at": datetime.now().isoformat(timespec="seconds"),
            })
        except ResourceHandleExpired as exc:
            return jsonify({"success": False, "message": str(exc)}), 410
        except (InvalidResourceHandle, ValueError) as exc:
            return jsonify({"success": False, "message": str(exc)}), 400
        except Exception as exc:
            logger.error(f"保存 Scratch 项目文件失败: {exc}")
            return jsonify({"success": False, "message": "保存 Scratch 项目文件失败"}), 500
        finally:
            if temp_path is not None:
                try:
                    temp_path.unlink(missing_ok=True)
                except OSError:
                    logger.warning("清理 Scratch 临时文件失败: %s", temp_path)

    @app.route("/api/resources/scratch-workspace", methods=["POST"])
    @require_capability("resource:write")
    def create_scratch_workspace_handle():
        """Issue an opaque, single-project handle for a local Scratch work copy."""
        payload = request.get_json(silent=True) or {}
        local_path = Path(str(payload.get("local_path") or "").strip()).expanduser()
        project_path = str(payload.get("project_path") or "").strip().lstrip("/")
        if not project_path.lower().endswith(".sb3"):
            return jsonify({"success": False, "message": "Scratch 项目路径必须是 .sb3 文件"}), 400
        if not local_path.is_dir():
            return jsonify({"success": False, "message": "Scratch 项目目录不存在"}), 400
        try:
            root_id = register_resource_root(local_path, "scratch-workspace", "electron-client")
            project_handle = issue_resource_handle(root_id, project_path, "write", 3600)
            return jsonify({"success": True, "project_handle": project_handle})
        except (InvalidResourceHandle, ValueError) as exc:
            return jsonify({"success": False, "message": str(exc)}), 400

    @app.route("/api/resources/index", methods=["GET", "POST"])
    @require_capability("resource:read")
    def get_resources_index():
        payload = request.get_json(silent=True) or {}
        ui_config = get_app_config().ui
        source_override = payload.get("source_override") if isinstance(payload, dict) else None
        token_override = (payload.get("token_override") or "") if isinstance(payload, dict) else ""

        if source_override:
            override_source = normalize_resource_source(source_override, "override")
            if not override_source.get("base_url") or not override_source.get("repo"):
                return jsonify({
                    "success": False,
                    "message": "临时课程源配置不完整",
                    "index": {},
                    "submit_url": "",
                    "repo_url": "",
                    "raw_base_url": "",
                    "branch": "main",
                    "sources": [],
                }), 400
            sources = [override_source]
        else:
            sources = collect_resource_sources(ui_config)

        token = resolve_resources_token(ui_config, token_override)
        if not sources:
            return jsonify({
                "success": False,
                "message": "课程资源库未配置",
                "index": {},
                "submit_url": "",
                "repo_url": "",
                "raw_base_url": "",
                "branch": "main",
                "sources": [],
            })

        def _item_priority(item):
            return str(item.get("updated_at") or "").strip(), str(item.get("version") or "").strip()

        merged_map = {}
        source_infos = []
        success_count = 0
        first_repo_url = ""
        first_raw_base_url = ""
        first_branch = ""
        first_submit_url = ""

        for src in sources:
            base_url = src.get("base_url", "")
            repo = src.get("repo", "")
            branch = src.get("branch", "main")
            index_path = src.get("index_path", "index.json")
            source_id = src.get("id", "")
            source_name = src.get("name", source_id)

            if not base_url or not repo:
                source_infos.append({"id": source_id, "name": source_name, "success": False, "message": "课程源配置不完整", "resource_count": 0})
                continue

            repo_url = f"{base_url}/{repo}"
            raw_base_url = f"{repo_url}/raw/{branch}"
            index_url = f"{raw_base_url}/{index_path}"
            submit_url = (src.get("submit_url") or "").strip() or f"{repo_url}/pulls"

            if not first_repo_url:
                first_repo_url, first_raw_base_url, first_branch, first_submit_url = repo_url, raw_base_url, branch, submit_url

            try:
                index_data = load_index_data(raw_base_url=raw_base_url, index_path=index_path, token=token)
                resources = index_data.get("resources") if isinstance(index_data, dict) else []
                resources = resources if isinstance(resources, list) else []
                for item in resources:
                    if not isinstance(item, dict):
                        continue
                    normalized = dict(item)
                    normalized["_source_id"] = source_id
                    normalized["_source_name"] = source_name
                    normalized["_source_repo_url"] = repo_url
                    normalized["_source_raw_base_url"] = raw_base_url
                    normalized["_source_branch"] = branch
                    normalized["_source_submit_url"] = submit_url
                    key = str(normalized.get("id") or "").strip() or str(normalized.get("course_url") or "").strip() or str(normalized.get("package_url") or "").strip()
                    if not key:
                        continue
                    existing = merged_map.get(key)
                    if not existing or _item_priority(normalized) >= _item_priority(existing):
                        merged_map[key] = normalized

                success_count += 1
                source_infos.append({
                    "id": source_id, "name": source_name, "success": True, "message": "",
                    "repo_url": repo_url, "raw_base_url": raw_base_url, "branch": branch,
                    "submit_url": submit_url, "resource_count": len(resources), "source_url": index_url,
                })
            except urllib.error.HTTPError as exc:
                if exc.code == 404:
                    try:
                        single_entry = build_single_course_source_entry(
                            base_url=base_url, repo=repo, branch=branch, raw_base_url=raw_base_url, token=token
                        )
                        normalized = dict(single_entry)
                        normalized["_source_id"] = source_id
                        normalized["_source_name"] = source_name
                        normalized["_source_repo_url"] = repo_url
                        normalized["_source_raw_base_url"] = raw_base_url
                        normalized["_source_branch"] = branch
                        normalized["_source_submit_url"] = submit_url
                        merged_map[str(normalized.get("id") or "").strip() or "course.json"] = normalized
                        success_count += 1
                        source_infos.append({
                            "id": source_id, "name": source_name, "success": True, "message": "已按单课程仓库读取",
                            "repo_url": repo_url, "raw_base_url": raw_base_url, "branch": branch,
                            "submit_url": submit_url, "resource_count": 1, "source_url": f"{raw_base_url}/course.json",
                        })
                        continue
                    except Exception:
                        pass
                message = "认证失败，请检查 Token" if exc.code in (401, 403) else "索引文件不存在，且未找到单课程 course.json" if exc.code == 404 else f"HTTP {exc.code}"
                logger.error(f"获取资源索引失败: {source_name} HTTP {exc.code} {exc.reason}")
                source_infos.append({
                    "id": source_id, "name": source_name, "success": False, "message": message,
                    "repo_url": repo_url, "raw_base_url": raw_base_url, "branch": branch,
                    "submit_url": submit_url, "resource_count": 0, "source_url": index_url,
                })
            except GiteaServiceError as exc:
                logger.error(f"获取资源索引失败: {source_name} {exc}")
                source_infos.append({
                    "id": source_id, "name": source_name, "success": False, "message": str(exc),
                    "repo_url": repo_url, "raw_base_url": raw_base_url, "branch": branch,
                    "submit_url": submit_url, "resource_count": 0, "source_url": index_url,
                })
            except Exception as exc:
                logger.error(f"获取资源索引失败: {source_name} {exc}")
                source_infos.append({
                    "id": source_id, "name": source_name, "success": False, "message": str(exc),
                    "repo_url": repo_url, "raw_base_url": raw_base_url, "branch": branch,
                    "submit_url": submit_url, "resource_count": 0, "source_url": index_url,
                })

        merged_resources = list(merged_map.values())
        merged_resources.sort(key=lambda item: str(item.get("title") or item.get("id") or ""))
        merged_index = {"version": "aggregated-1.0", "updated_at": datetime.utcnow().strftime("%Y-%m-%d"), "resources": merged_resources}
        if success_count == 0:
            return jsonify({
                "success": False, "message": "所有课程源均加载失败，请检查配置", "index": merged_index,
                "sources": source_infos, "submit_url": first_submit_url, "repo_url": first_repo_url,
                "raw_base_url": first_raw_base_url, "branch": first_branch or "main",
            })
        message = f"已加载 {success_count}/{len(sources)} 个课程源" if success_count < len(sources) else ""
        return jsonify({
            "success": True, "message": message, "index": merged_index, "sources": source_infos,
            "submit_url": first_submit_url, "repo_url": first_repo_url,
            "raw_base_url": first_raw_base_url, "branch": first_branch or "main",
        })

    @app.route("/api/resources/scan", methods=["POST"])
    @require_capability("resource:read")
    def scan_resource_course():
        # 仅保留只读扫描：解析已存在的 course.json，不创建/不自动构建结构。
        # 课程创建与自动构建结构已迁移到 Claude skills（xedu-pack / xedu-course-builder），
        # 它们直接以库的方式调用 services.gitea_service.scan_course。
        payload = request.get_json(silent=True) or {}
        try:
            result = scan_course(
                payload.get("local_path", ""),
                init_if_missing=False,
                init_meta=None,
                auto_build=False,
            )
            return jsonify({"success": True, "course": result.course, "summary": result.summary})
        except GiteaServiceError as exc:
            return jsonify({"success": False, "message": str(exc)}), 400
        except Exception as exc:
            logger.error(f"扫描课程失败: {exc}")
            return jsonify({"success": False, "message": "扫描课程失败"}), 500

    @app.route("/api/resources/inspect-course", methods=["POST"])
    @require_capability("resource:read")
    def inspect_resource_course():
        payload = request.get_json(silent=True) or {}
        try:
            local_path = str(payload.get("local_path") or "").strip()
            if local_path:
                result = scan_course(local_path, init_if_missing=False, init_meta=None, auto_build=False)
                inspection = inspect_course(result.course, local_path=local_path)
                return jsonify({"success": True, **inspection})

            ui_config = get_app_config().ui
            source_id = str(payload.get("source_id") or "").strip()
            source_override = payload.get("source_override")
            token_override = str(payload.get("token_override") or "").strip()
            course_id = str(payload.get("course_id") or "").strip()
            course_url = str(payload.get("course_url") or "").strip()
            package_url = str(payload.get("package_url") or "").strip()

            selected = resolve_resource_source_for_request(ui_config, source_id=source_id, source_override=source_override)
            if not selected:
                return jsonify({"success": False, "message": "课程资源库未配置"}), 400

            base_url = (selected.get("base_url") or "").rstrip("/")
            repo = (selected.get("repo") or "").strip("/")
            branch = (selected.get("branch") or "main").strip() or "main"
            index_path = (selected.get("index_path") or "index.json").strip().lstrip("/") or "index.json"
            single_course_repo = parse_bool(selected.get("single_course_repo"), False)
            token = resolve_resources_token(ui_config, token_override)
            if not base_url or not repo:
                return jsonify({"success": False, "message": "课程资源库未配置"}), 400

            raw_base_url = f"{base_url}/{repo}/raw/{branch}"
            if single_course_repo:
                course_url = course_url or "course.json"
            elif (not course_url) and course_id:
                entry = find_course_entry_from_index(
                    raw_base_url=raw_base_url,
                    course_id=course_id,
                    index_path=index_path,
                    token=token,
                )
                course_url = entry.get("course_url") or course_url
                package_url = entry.get("package_url") or package_url
            if not course_url:
                return jsonify({"success": False, "message": "缺少 course_url，无法读取课程结构"}), 400

            course = load_course_data_from_repo(raw_base_url=raw_base_url, course_path=course_url, token=token)
            remote_tree = load_repo_tree_data(base_url=base_url, repo=repo, branch=branch, token=token)
            course_path_for_root = course_url
            if course_path_for_root.startswith(raw_base_url):
                course_path_for_root = course_path_for_root[len(raw_base_url):].lstrip("/")
            if course_path_for_root.startswith(("http://", "https://")):
                course_path_for_root = ""
            course_root = str(Path(course_path_for_root).parent).replace("\\", "/").strip(".").strip("/")
            if course_root:
                prefix = f"{course_root}/"
                remote_tree = [
                    *remote_tree,
                    *[
                        {**item, "path": str(item.get("path") or "")[len(prefix):]}
                        for item in remote_tree
                        if str(item.get("path") or "").startswith(prefix)
                    ],
                ]
            inspection = inspect_course(course, remote_tree=remote_tree)
            normalized_course = {
                **(inspection.get("course") or {}),
                "course_url": course_url,
                "package_url": package_url,
                "_source_id": selected.get("id", source_id),
                "_source_name": selected.get("name", ""),
                "_source_repo_url": f"{base_url}/{repo}",
                "_source_raw_base_url": raw_base_url,
                "_source_branch": branch,
                "single_course_repo": single_course_repo,
            }
            return jsonify({
                "success": True,
                "course": normalized_course,
                "summary": inspection.get("summary") or {},
                "inspection": inspection.get("inspection") or {},
            })
        except urllib.error.HTTPError as exc:
            if exc.code in (401, 403):
                return jsonify({"success": False, "message": "资源库认证失败，请检查 Gitea Token"}), 400
            if exc.code == 404:
                return jsonify({"success": False, "message": "未找到课程文件或仓库文件树"}), 404
            return jsonify({"success": False, "message": f"读取课程失败: HTTP {exc.code}"}), 400
        except GiteaServiceError as exc:
            return jsonify({"success": False, "message": str(exc)}), 400
        except Exception as exc:
            logger.error(f"巡检课程失败: {exc}")
            return jsonify({"success": False, "message": "巡检课程失败"}), 500

    @app.route("/api/resources/publish", methods=["POST"])
    @require_capability("resource:write")
    def publish_resource_course():
        payload = request.get_json(silent=True) or {}
        ui_config = get_app_config().ui
        local_path = payload.get("local_path", "")
        course_id = payload.get("course_id", "")
        version = payload.get("version", "")
        meta_override = payload.get("meta_override") or {}
        publish_mode = (payload.get("publish_mode") or "pr").strip().lower()
        publish_branch = (payload.get("publish_branch") or "").strip()
        pr_base_branch = (payload.get("pr_base_branch") or "").strip()
        source_id = str(payload.get("source_id") or "").strip()
        publish_source = payload.get("publish_source")
        origin_source = payload.get("origin_source") or payload.get("origin")
        token_override = str(payload.get("token_override") or "").strip()
        create_repo_if_missing = parse_bool(payload.get("create_repo_if_missing"), True)
        repo_private = parse_bool(payload.get("repo_private"), False)
        repo_description = str(payload.get("repo_description") or "").strip()
        single_course_repo = parse_bool(payload.get("single_course_repo"), parse_bool((publish_source or {}).get("single_course_repo"), False))

        selected_source = resolve_resource_source_for_request(ui_config, source_id=source_id, source_override=publish_source or origin_source)
        if not selected_source:
            return jsonify({"success": False, "message": "课程资源库未配置"}), 400

        base_url = (selected_source.get("base_url") or "").rstrip("/")
        repo = (selected_source.get("repo") or "").strip("/")
        branch = (selected_source.get("branch") or "main").strip() or "main"
        publish_path = (selected_source.get("publish_path") or "courses").strip("/") or "courses"
        index_path = (selected_source.get("index_path") or "index.json").strip().lstrip("/") or "index.json"
        token = resolve_resources_token(ui_config, token_override)
        if not base_url or not repo:
            return jsonify({"success": False, "message": "课程资源库未配置"}), 400
        if not token:
            return jsonify({"success": False, "message": "写操作需要 Token（请在设置中填写或由服务端配置 XEDU_GITEA_TOKEN）"}), 400

        try:
            course_scan = scan_course(local_path, init_if_missing=False, init_meta=None, auto_build=False)
            experiment_count = int((course_scan.summary or {}).get("experiment_count") or 0)
            if experiment_count < 1:
                return jsonify({"success": False, "message": "课程至少包含 1 个实验后才能发布"}), 400
            client = GiteaClient(base_url, repo, branch, token)
            repo_status = client.ensure_repo(create_if_missing=create_repo_if_missing, private=repo_private, description=repo_description)
            result = publish_course(
                local_path=local_path, client=client, publish_path=publish_path, course_id=course_id, version=version,
                meta_override=meta_override, publish_branch=publish_branch, create_pr=publish_mode != "direct",
                pr_base_branch=pr_base_branch or branch, single_course_repo=single_course_repo,
            )
            entry = result.get("entry") or {}
            final_course_id = (result.get("course_id") or course_id or "").strip()
            origin = {
                "source_id": selected_source.get("id", ""), "base_url": base_url, "repo": repo, "branch": branch,
                "index_path": index_path, "publish_path": "" if single_course_repo else publish_path,
                "course_id": final_course_id, "course_url": entry.get("course_url", ""), "package_url": entry.get("package_url", ""),
                "single_course_repo": single_course_repo,
            }
            pull_request = result.get("pull_request") or {}
            return jsonify({"success": True, "result": result, "pr_url": pull_request.get("url", ""), "origin": origin, "repo_created": bool(repo_status.get("created"))})
        except GiteaServiceError as exc:
            msg = str(exc)
            low = msg.lower()
            if "http 401" in low or "http 403" in low:
                msg = "写操作认证失败，请检查访问令牌是否有效且具备仓库写权限"
            logger.warning(f"发布课程失败: course_id={course_id} repo={base_url}/{repo} branch={branch} error={msg}")
            return jsonify({"success": False, "message": msg}), 400
        except Exception as exc:
            logger.error(f"发布课程失败: {exc}")
            return jsonify({"success": False, "message": "发布课程失败"}), 500

    @app.route("/api/resources/pull", methods=["POST"])
    @require_capability("resource:write")
    def pull_resource_course():
        payload = request.get_json(silent=True) or {}
        ui_config = get_app_config().ui
        course_url = payload.get("course_url", "")
        package_url = payload.get("package_url", "")
        target_path = payload.get("target_path", "")
        replace_existing = payload.get("replace_existing", True)
        source_id = str(payload.get("source_id") or "").strip()
        source_override = payload.get("source_override")
        token_override = str(payload.get("token_override") or "").strip()
        course_id = str(payload.get("course_id") or "").strip()
        resolve_latest = parse_bool(payload.get("resolve_latest"), False)
        backup_before_replace = parse_bool(payload.get("backup_before_replace"), True)

        selected = resolve_resource_source_for_request(ui_config, source_id=source_id, source_override=source_override)
        if not selected:
            return jsonify({"success": False, "message": "课程资源库未配置"}), 400

        base_url = (selected.get("base_url") or "").rstrip("/")
        repo = (selected.get("repo") or "").strip("/")
        branch = (selected.get("branch") or "main").strip() or "main"
        index_path = (selected.get("index_path") or "index.json").strip().lstrip("/") or "index.json"
        publish_path = (selected.get("publish_path") or "courses").strip("/") or "courses"
        single_course_repo = parse_bool(selected.get("single_course_repo"), False)
        token = resolve_resources_token(ui_config, token_override)
        if not base_url or not repo:
            return jsonify({"success": False, "message": "课程资源库未配置"}), 400

        raw_base_url = f"{base_url}/{repo}/raw/{branch}"
        derived_course_id = course_id or derive_course_id_from_path(course_url) or derive_course_id_from_path(package_url)
        resolved_entry = None
        if resolve_latest and derived_course_id and not single_course_repo:
            try:
                resolved_entry = find_course_entry_from_index(raw_base_url=raw_base_url, course_id=derived_course_id, index_path=index_path, token=token)
                course_url = resolved_entry.get("course_url") or course_url
                package_url = resolved_entry.get("package_url") or package_url
            except GiteaServiceError as exc:
                if not (single_course_repo and "索引文件不存在" in str(exc)):
                    return jsonify({"success": False, "message": str(exc)}), 400
            except urllib.error.HTTPError as exc:
                if exc.code in (401, 403):
                    return jsonify({"success": False, "message": "资源库认证失败，请检查 Gitea Token"}), 400
                if exc.code == 404 and not single_course_repo:
                    return jsonify({"success": False, "message": "索引文件不存在"}), 400
                if exc.code != 404:
                    return jsonify({"success": False, "message": f"读取索引失败: HTTP {exc.code}"}), 400

        if single_course_repo:
            course_url = course_url or "course.json"
        elif not package_url and derived_course_id:
            try:
                resolved_entry = find_course_entry_from_index(raw_base_url=raw_base_url, course_id=derived_course_id, index_path=index_path, token=token)
                course_url = resolved_entry.get("course_url") or course_url
                package_url = resolved_entry.get("package_url") or package_url
            except Exception:
                resolved_entry = None

        if not target_path:
            default_root = Path.home() / "Documents" / "XeduCourses"
            default_root.mkdir(parents=True, exist_ok=True)
            target_path = str(default_root / (derived_course_id or "course"))

        try:
            result = pull_course(
                raw_base_url=raw_base_url, course_url=course_url, package_url=package_url, target_path=target_path, token=token,
                replace_existing=bool(replace_existing), backup_before_replace=backup_before_replace,
                single_course_repo=single_course_repo, base_url=base_url, repo=repo, branch=branch,
            )
            origin = {
                "source_id": selected.get("id", ""), "base_url": base_url, "repo": repo, "branch": branch,
                "index_path": index_path, "publish_path": "" if single_course_repo else publish_path,
                "course_id": derived_course_id or str((result.course or {}).get("id") or ""),
                "course_url": "course.json" if single_course_repo else (course_url or (resolved_entry or {}).get("course_url", "")),
                "package_url": "" if single_course_repo else (package_url or (resolved_entry or {}).get("package_url", "")),
                "single_course_repo": single_course_repo,
            }
            return jsonify({
                "success": True, "course": result.course, "summary": result.summary, "local_path": target_path,
                "publish_path": publish_path, "source_id": selected.get("id", ""), "origin": origin,
            })
        except GiteaServiceError as exc:
            return jsonify({"success": False, "message": str(exc)}), 400
        except Exception as exc:
            logger.error(f"导入课程失败: {exc}")
            return jsonify({"success": False, "message": "导入课程失败"}), 500

    @app.route("/api/resources/ensure-repo", methods=["POST"])
    @require_capability("resource:write")
    def ensure_resource_repo():
        payload = request.get_json(silent=True) or {}
        ui_config = get_app_config().ui
        source_override = payload.get("source_override") or {
            "id": str(payload.get("source_id") or "").strip() or "override",
            "base_url": payload.get("base_url", ""),
            "repo": payload.get("repo", ""),
            "branch": payload.get("branch", "main"),
        }
        source_id = str(payload.get("source_id") or "").strip()
        token_override = str(payload.get("token_override") or "").strip()
        create_if_missing = parse_bool(payload.get("create_if_missing"), True)
        private = parse_bool(payload.get("private"), False)
        description = str(payload.get("description") or "").strip()

        selected = resolve_resource_source_for_request(ui_config, source_id=source_id, source_override=source_override)
        if not selected:
            return jsonify({"success": False, "message": "课程资源库未配置"}), 400
        base_url = (selected.get("base_url") or "").rstrip("/")
        repo = (selected.get("repo") or "").strip("/")
        branch = (selected.get("branch") or "main").strip() or "main"
        token = resolve_resources_token(ui_config, token_override)
        if not token:
            return jsonify({"success": False, "message": "写操作需要 Token（请在设置中填写或由服务端配置 XEDU_GITEA_TOKEN）"}), 400

        try:
            client = GiteaClient(base_url, repo, branch, token)
            status = client.ensure_repo(create_if_missing=create_if_missing, private=private, description=description)
            return jsonify({"success": True, "repo": {"base_url": base_url, "repo": repo, "branch": branch}, "status": status})
        except GiteaServiceError as exc:
            return jsonify({"success": False, "message": str(exc)}), 400
        except Exception as exc:
            logger.error(f"检查课程仓库失败: {exc}")
            return jsonify({"success": False, "message": "检查课程仓库失败"}), 500

    @app.route("/api/resources/save-course", methods=["POST"])
    @require_capability("resource:write")
    def save_resource_course():
        payload = request.get_json(silent=True) or {}
        try:
            result = save_course_json(payload.get("local_path", ""), payload.get("course") or {})
            return jsonify({"success": True, "course": result.course, "summary": result.summary})
        except GiteaServiceError as exc:
            return jsonify({"success": False, "message": str(exc)}), 400
        except Exception as exc:
            logger.error(f"保存课程结构失败: {exc}")
            return jsonify({"success": False, "message": "保存课程结构失败"}), 500

    @app.route("/api/resources/import-package-local", methods=["POST"])
    @require_capability("resource:write")
    def import_local_resource_package():
        payload = request.get_json(silent=True) or {}
        package_path = str(payload.get("package_path") or "").strip()
        target_path = str(payload.get("target_path") or "").strip()
        replace_existing = parse_bool(payload.get("replace_existing"), True)
        backup_before_replace = parse_bool(payload.get("backup_before_replace"), True)
        if not package_path:
            return jsonify({"success": False, "message": "缺少 package_path"}), 400
        if not target_path:
            target_path = resolve_local_course_package_target_path(package_path)
        try:
            result = import_local_course_package(
                package_path=package_path,
                target_path=target_path,
                replace_existing=replace_existing,
                backup_before_replace=backup_before_replace,
            )
            return jsonify({"success": True, "course": result.course, "summary": result.summary, "local_path": target_path})
        except GiteaServiceError as exc:
            return jsonify({"success": False, "message": str(exc)}), 400
        except Exception as exc:
            logger.error(f"导入本地课程包失败: {exc}")
            return jsonify({"success": False, "message": "导入本地课程包失败"}), 500

    @app.route("/api/resources/quickform/inject", methods=["POST"])
    @require_capability("resource:write")
    def inject_quickform_script():
        payload = request.get_json(silent=True) or {}
        local_path = str(payload.get("local_path") or "").strip()
        html_path = str(payload.get("html_path") or "").strip().lstrip("/")
        quickform = normalize_quickform_public_config(payload.get("quickform") or {})
        create_backup = parse_bool(payload.get("create_backup"), True)
        if not local_path:
            return jsonify({"success": False, "message": "缺少 local_path"}), 400
        if not html_path:
            return jsonify({"success": False, "message": "缺少 html_path"}), 400
        if not html_path.lower().endswith((".html", ".htm")):
            return jsonify({"success": False, "message": "仅支持注入 HTML 文件"}), 400
        if not quickform.get("submit_url"):
            return jsonify({"success": False, "message": "QuickForm submit_url 未配置"}), 400
        try:
            injected = inject_quickform_file(local_path, html_path, quickform, create_backup)
            return jsonify({"success": True, "message": "QuickForm 脚本已注入", "html_path": injected.get("html_path") or html_path, "backup_path": injected.get("backup_path") or ""})
        except ValueError as exc:
            return jsonify({"success": False, "message": str(exc)}), 400
        except FileNotFoundError:
            return jsonify({"success": False, "message": "HTML 文件不存在"}), 404
        except UnicodeDecodeError:
            return jsonify({"success": False, "message": "HTML 文件编码不受支持，请使用 UTF-8"}), 400
        except Exception as exc:
            logger.error(f"注入 QuickForm 失败: {exc}")
            return jsonify({"success": False, "message": "注入 QuickForm 失败"}), 500

    @app.route("/api/resources/scan-folder", methods=["POST"])
    @require_capability("resource:read")
    def scan_resource_folder():
        payload = request.get_json(silent=True) or {}
        try:
            files = scan_folder(payload.get("base_path", ""), payload.get("folder_path", ""))
            return jsonify({"success": True, "files": files})
        except GiteaServiceError as exc:
            return jsonify({"success": False, "message": str(exc)}), 400
        except Exception as exc:
            logger.error(f"读取材料失败: {exc}")
            return jsonify({"success": False, "message": "读取材料失败"}), 500
