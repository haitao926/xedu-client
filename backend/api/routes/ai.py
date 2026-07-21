# -*- coding: utf-8 -*-
"""
AI / agent 路由模块
"""

from __future__ import annotations

from datetime import datetime

from flask import jsonify, request

from models.config import AIConfig
from api.security import require_capability


def register_ai_routes(app, services: dict):
    """注册 AI 与业务代理相关路由"""

    build_ai_service = services["build_ai_service"]
    looks_like_confirmation = services["looks_like_confirmation"]
    looks_like_xedu_pack_request = services["looks_like_xedu_pack_request"]
    get_app_config = services["get_app_config"]
    config_service = services["config_service"]

    def _student_boundary_answer(question: str) -> str:
        lowered = (question or "").lower()
        if "pack" in lowered or "打包" in question or "发布" in question:
            return (
                "这个聊天助手现在聚焦学生实验答疑，不负责课程打包或发布。"
                "如果你是在学习当前实验，我可以帮你梳理实验目标、代码含义和下一步操作。"
            )
        return (
            "这个聊天助手现在聚焦学生实验答疑。"
            "我可以帮你理解当前实验、解释概念、分析报错，或整理下一步学习操作。"
        )

    @app.route("/api/ai/ask", methods=["POST"])
    @require_capability("python:run")
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
            "experience_mode": str(agent_context.get("experience_mode") or "").strip().lower(),
        }
        xedu_pack_request = looks_like_xedu_pack_request(question, history)
        matched_teacher_agent = xedu_pack_request

        if matched_teacher_agent:
            response = {
                "success": True,
                "answer": _student_boundary_answer(question),
            }
        else:
            response = service.ask_question(question, image_data, history, request_context=request_context)

        status_code = 200 if response.get("success") else 500
        return jsonify(response), status_code

    @app.route("/api/ai/test_config", methods=["POST"])
    @require_capability("config:write")
    def ai_test_config():
        payload = request.get_json() or {}
        overrides = payload.get("config", {})
        test_service = build_ai_service(overrides)
        result = test_service.test_connection()
        status_code = 200 if result.get("success") else 500
        return jsonify(result), status_code

    @app.route("/api/ai/save_config", methods=["POST"])
    @require_capability("config:write")
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
                "config": app_config.to_public_dict()["ai"],
            })

        return jsonify({"success": False, "message": "保存AI配置失败"}), 500
