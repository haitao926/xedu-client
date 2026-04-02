# -*- coding: utf-8 -*-
"""
项目路由模块
"""

from flask import jsonify, request


def register_project_routes(app, services: dict):
    """注册项目相关路由"""
    project_service = services.get('project_service')
    
    @app.route("/api/projects/templates", methods=["GET"])
    def get_project_templates():
        templates = project_service.get_templates()
        return jsonify({
            "success": True,
            "templates": templates
        })

    @app.route("/api/projects/create", methods=["POST"])
    def create_project():
        payload = request.get_json() or {}
        result = project_service.create_project(payload)
        return jsonify(result)