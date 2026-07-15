# -*- coding: utf-8 -*-
"""
Blockly 相关资源路由模块。
"""

from __future__ import annotations

import urllib.parse
from pathlib import Path

from flask import Response, jsonify, request

from api.resource_runtime import InvalidResourceHandle, ResourceHandleExpired
from api.security import require_capability
from services.blockly_xeduhub_support import validate_toolbox_schema


def register_resource_blockly_routes(app, services: dict):
    """注册 Blockly 相关资源路由"""

    logger = services["logger"]
    resolve_resource_handle = services["resolve_resource_handle"]
    guess_blockly_toolbox_path = services["guess_blockly_toolbox_path"]
    guess_blockly_python_path = services["guess_blockly_python_path"]
    guess_blockly_notebook_path = services["guess_blockly_notebook_path"]
    get_frontend_build_dir = services["get_frontend_build_dir"]
    build_blockly_playground_html = services["build_blockly_playground_html"]
    execute_xeduhub_runtime = services["execute_xeduhub_runtime"]
    get_nonblocking_supported_tasks_snapshot = services["get_nonblocking_supported_tasks_snapshot"]

    @app.route("/api/resources/blockly-playground/<root_token>")
    @require_capability("resource:read")
    def resources_blockly_playground(root_token):
        role = str(request.args.get("role") or "").strip().lower()
        toolbox_import_enabled = role != "student"
        workspace_rel = str(request.args.get("workspace") or "").strip().lstrip("/")
        toolbox_rel = str(request.args.get("toolbox") or "").strip().lstrip("/")
        python_rel = str(request.args.get("python") or "").strip().lstrip("/")
        practice_rel = str(request.args.get("practice") or "").strip().lstrip("/")
        try:
            if not workspace_rel:
                return jsonify({"success": False, "message": "缺少 workspace 参数"}), 400

            workspace_file = resolve_resource_handle(root_token, "read", workspace_rel)
            if not workspace_file.exists() or not workspace_file.is_file():
                return jsonify({"success": False, "message": "Blockly 工作区文件不存在"}), 404

            if not toolbox_rel:
                guessed_toolbox = guess_blockly_toolbox_path(workspace_rel)
                if guessed_toolbox:
                    toolbox_file = resolve_resource_handle(root_token, "read", guessed_toolbox)
                    if toolbox_file.exists() and toolbox_file.is_file():
                        toolbox_rel = guessed_toolbox

            if not python_rel:
                guessed_python = guess_blockly_python_path(workspace_rel)
                if guessed_python:
                    python_rel = guessed_python

            practice_kind = ""
            if not practice_rel:
                guessed_notebook = guess_blockly_notebook_path(workspace_rel)
                if guessed_notebook:
                    notebook_file = resolve_resource_handle(root_token, "read", guessed_notebook)
                    if notebook_file.exists() and notebook_file.is_file():
                        practice_rel = guessed_notebook
                        practice_kind = "notebook"
                if not practice_rel and python_rel:
                    python_file = resolve_resource_handle(root_token, "read", python_rel)
                    if python_file.exists() and python_file.is_file():
                        practice_rel = python_rel
                        practice_kind = "python"
            elif practice_rel:
                if practice_rel.lower().endswith(".ipynb"):
                    practice_kind = "notebook"
                elif practice_rel.lower().endswith(".py"):
                    practice_kind = "python"

            workspace_url = f"/api/resources/local-file/{root_token}/{workspace_rel}"
            toolbox_url = f"/api/resources/local-file/{root_token}/{toolbox_rel}" if toolbox_rel else ""
            python_url = f"/api/resources/local-file/{root_token}/{python_rel}" if python_rel else ""
            practice_url = f"/api/resources/local-file/{root_token}/{practice_rel}" if practice_rel else ""
            practice_launch_url = ""
            if practice_rel:
                practice_launch_query = urllib.parse.urlencode({
                    "file": practice_rel,
                    "kind": practice_kind,
                })
                practice_launch_url = f"xedu://open-practice?{practice_launch_query}"

            html = build_blockly_playground_html(
                workspace_url=workspace_url,
                toolbox_url=toolbox_url,
                generated_python_url=python_url,
                workspace_label=Path(workspace_rel).name,
                role=role,
                root_token=root_token,
                workspace_rel=workspace_rel,
                toolbox_rel=toolbox_rel,
                project_root="",
                practice_label=Path(practice_rel).name if practice_rel else "",
                practice_kind=practice_kind,
                practice_url=practice_url,
                practice_launch_url=practice_launch_url,
                toolbox_switch_enabled=toolbox_import_enabled,
            )
            return Response(html, mimetype="text/html")
        except ResourceHandleExpired as exc:
            return jsonify({"success": False, "message": str(exc)}), 410
        except (InvalidResourceHandle, ValueError) as exc:
            return jsonify({"success": False, "message": str(exc)}), 400
        except Exception as exc:
            logger.error(f"打开 Blockly playground 失败: {exc}")
            return jsonify({"success": False, "message": "打开 Blockly playground 失败"}), 500

    @app.route("/api/resources/blockly-playground-blank")
    def resources_blockly_playground_blank():
        try:
            role = str(request.args.get("role") or "").strip().lower()
            toolbox_import_enabled = role != "student"
            project_root = str(get_frontend_build_dir().parent)
            html = build_blockly_playground_html(
                workspace_url="",
                toolbox_url="",
                generated_python_url="",
                workspace_label="",
                role=role,
                project_root=project_root,
                practice_label="",
                practice_kind="",
                practice_url="",
                practice_launch_url="",
                toolbox_switch_enabled=toolbox_import_enabled,
                supported_runtime_tasks=get_nonblocking_supported_tasks_snapshot(),
            )
            return Response(html, mimetype="text/html")
        except Exception as exc:
            logger.error(f"打开空白 Blockly playground 失败: {exc}")
            return jsonify({"success": False, "message": "打开空白 Blockly playground 失败"}), 500

    def _execute_xeduhub_payload(route_label: str):
        try:
            payload = request.get_json(silent=True) or {}
            result = execute_xeduhub_runtime(payload)
            return jsonify(result), 200 if result.get("success") else 400
        except Exception as exc:
            logger.error(f"执行 {route_label} XEduHub runtime 失败: {exc}")
            return jsonify({
                "success": False,
                "result_type": "error",
                "message": f"执行 {route_label} XEduHub runtime 失败",
                "result": {"error": str(exc)},
                "artifacts": {},
            }), 500

    @app.route("/api/resources/xeduhub/execute", methods=["POST"])
    @require_capability("python:run")
    def resources_xeduhub_execute():
        return _execute_xeduhub_payload("XEdu")

    @app.route("/api/resources/blockly/xeduhub/execute", methods=["POST"])
    @require_capability("python:run")
    def resources_blockly_xeduhub_execute():
        return _execute_xeduhub_payload("Blockly")

    @app.route("/api/resources/blockly/validate-toolbox", methods=["POST"])
    def resources_blockly_validate_toolbox():
        try:
            payload = request.get_json(silent=True) or {}
            toolbox = payload.get("toolbox") if isinstance(payload, dict) else None
            result = validate_toolbox_schema(toolbox)
            status_code = 200 if result.get("valid") else 400
            return jsonify(result), status_code
        except Exception as exc:
            logger.error(f"校验 Blockly toolbox 失败: {exc}")
            return jsonify({
                "valid": False,
                "errors": ["校验 Blockly toolbox 失败"],
                "normalized": None,
            }), 500
