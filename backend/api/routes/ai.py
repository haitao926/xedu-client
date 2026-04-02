# -*- coding: utf-8 -*-
"""
AI / agent 路由模块
"""

from __future__ import annotations

from datetime import datetime

from flask import jsonify, request

from models.config import AIConfig


def register_ai_routes(app, services: dict):
    """注册 AI 与业务代理相关路由"""

    build_ai_service = services["build_ai_service"]
    build_quickform_agent_service = services["build_quickform_agent_service"]
    build_xedu_pack_agent_service = services["build_xedu_pack_agent_service"]
    build_blockly_builder_agent_service = services["build_blockly_builder_agent_service"]
    looks_like_confirmation = services["looks_like_confirmation"]
    looks_like_quickform_request = services["looks_like_quickform_request"]
    looks_like_xedu_pack_request = services["looks_like_xedu_pack_request"]
    looks_like_blockly_builder_request = services["looks_like_blockly_builder_request"]
    get_app_config = services["get_app_config"]
    config_service = services["config_service"]

    @app.route("/api/ai/ask", methods=["POST"])
    def ai_ask():
        payload = request.get_json() or {}
        question = (payload.get("question") or "").strip()
        if not question:
            return jsonify({"success": False, "message": "问题不能为空"}), 400

        image_data = payload.get("image")
        history = payload.get("history", [])
        overrides = payload.get("config", {})
        agent_context = payload.get("context") if isinstance(payload.get("context"), dict) else {}

        service = build_ai_service(overrides)
        if not service.config.api_key:
            return jsonify({
                "success": False,
                "message": "AI 未配置：请先在设置中填写 API Key",
            }), 400

        request_context = {
            "context": agent_context,
            "confirmed": looks_like_confirmation(question),
            "today": datetime.now().strftime("%Y-%m-%d"),
        }
        if looks_like_blockly_builder_request(question, history):
            response = build_blockly_builder_agent_service(overrides).chat(
                question=question,
                history=history,
                image_data=image_data,
                request_context=request_context,
            )
        elif looks_like_xedu_pack_request(question, history):
            response = build_xedu_pack_agent_service(overrides).chat(
                question=question,
                history=history,
                image_data=image_data,
                request_context=request_context,
            )
        elif looks_like_quickform_request(question, history):
            response = build_quickform_agent_service(overrides).chat(
                question=question,
                history=history,
                image_data=image_data,
                request_context=request_context,
            )
        else:
            response = service.ask_question(question, image_data, history)

        status_code = 200 if response.get("success") else 500
        return jsonify(response), status_code

    @app.route("/api/ai/test_config", methods=["POST"])
    def ai_test_config():
        payload = request.get_json() or {}
        overrides = payload.get("config", {})
        test_service = build_ai_service(overrides)
        result = test_service.test_connection()
        status_code = 200 if result.get("success") else 500
        return jsonify(result), status_code

    @app.route("/api/ai/save_config", methods=["POST"])
    def ai_save_config():
        app_config = get_app_config()
        payload = request.get_json() or {}

        ai_config_dict = app_config.ai.to_dict()
        if payload.get("config"):
            ai_config_dict.update(payload["config"])

        new_ai_config = AIConfig.from_dict(ai_config_dict)
        is_valid, errors = new_ai_config.validate()
        if not is_valid:
            return jsonify({
                "success": False,
                "message": "AI配置验证失败",
                "errors": errors,
            }), 400

        app_config.ai = new_ai_config
        if config_service.save_config(app_config):
            services["ai_service"].config = new_ai_config
            return jsonify({
                "success": True,
                "message": "AI配置保存成功",
                "config": new_ai_config.to_dict(),
            })

        return jsonify({"success": False, "message": "保存AI配置失败"}), 500
