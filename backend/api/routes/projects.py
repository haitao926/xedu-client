# -*- coding: utf-8 -*-
"""
项目路由模块
"""

from flask import jsonify, request

from api.security import require_capability


def register_project_routes(app, services: dict):
    """注册项目相关路由"""
    project_service = services["project_service"]
    logger = services["logger"]

    @app.route("/api/projects/templates", methods=["GET"])
    def get_project_templates():
        try:
            templates = project_service.get_templates()
            default_path = project_service.get_default_project_path()
            return jsonify({
                "success": True,
                "templates": templates,
                "default_path": default_path,
            })
        except Exception as exc:
            logger.error(f"获取模板失败: {exc}")
            return jsonify({"success": False, "message": "获取模板失败"}), 500

    @app.route("/api/projects/create", methods=["POST"])
    @require_capability("resource:write")
    def create_project():
        payload = request.get_json(silent=True) or {}
        name = payload.get("name", "").strip()
        path = payload.get("path", "").strip()
        template_id = payload.get("template_id", "blank").strip()
        description = payload.get("description", "").strip()

        if not name or not path:
            return jsonify({"success": False, "message": "项目名称和路径不能为空"}), 400

        result = project_service.create_project(name, path, template_id, description)
        status_code = 200 if result.get("success") else 400
        return jsonify(result), status_code
