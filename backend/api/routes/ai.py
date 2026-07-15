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
    build_quickform_agent_service = services["build_quickform_agent_service"]
    build_xedu_pack_agent_service = services["build_xedu_pack_agent_service"]
    build_blockly_builder_agent_service = services["build_blockly_builder_agent_service"]
    looks_like_confirmation = services["looks_like_confirmation"]
    looks_like_quickform_request = services["looks_like_quickform_request"]
    looks_like_xedu_pack_request = services["looks_like_xedu_pack_request"]
    looks_like_blockly_builder_request = services["looks_like_blockly_builder_request"]
    validate_teacher_code = services.get("validate_teacher_code")
    get_app_config = services["get_app_config"]
    config_service = services["config_service"]

    def _teacher_navigation_answer(question: str) -> str:
        lowered = (question or "").lower()
        if "quickform" in lowered or "表单" in question:
            return (
                "教师侧 AI 当前只负责说明和导航，不会直接执行 QuickForm 接入。"
                "建议先到“课程资源”中打开本地课程，确认实验已经挂好 HTML 文件，"
                "再使用课程详情里的 QuickForm 绑定和注入入口完成接入。"
            )
        if "pack" in lowered or "打包" in question or "发布" in question:
            return (
                "教师侧 AI 当前只负责说明和导航，不会直接执行课程打包智能流程。"
                "建议先在“课程资源”中完成课程目录、课节结构和实验材料检查，"
                "确认至少有 1 个实验后，再使用资源页的发布流程把当前课程目录发布出去。"
            )
        if "blockly" in lowered or "积木" in question:
            return (
                "教师侧 AI 当前只负责说明和导航，不会直接生成 Blockly 草稿。"
                "建议先准备好课程目录，再进入 Blockly 实验台做调试预演；"
                "如果已有实验文件，也可以先在“课程资源”中挂载到对应实验。"
            )
        return (
            "教师侧 AI 当前只负责说明和导航，不会直接执行外部技能。"
            "建议先到“课程资源”中选择整门课程目录，读取 course.json，"
            "再按需整理课节结构、为每个实验挂载材料文件夹，最后运行或发布课程。"
        )

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
            "experience_mode": str(agent_context.get("experience_mode") or "").strip().lower(),
        }
        explicit_student_mode = request_context["experience_mode"] == "student"
        explicit_teacher_mode = request_context["experience_mode"] == "teacher"
        teacher_mode_unlocked = bool(agent_context.get("teacher_mode", {}).get("unlocked"))
        teacher_code_valid = bool(validate_teacher_code(request)) if callable(validate_teacher_code) else False
        is_teacher_mode = explicit_teacher_mode or teacher_mode_unlocked or teacher_code_valid
        quickform_request = looks_like_quickform_request(question, history)
        xedu_pack_request = looks_like_xedu_pack_request(question, history)
        blockly_builder_request = looks_like_blockly_builder_request(question, history)
        matched_teacher_agent = quickform_request or xedu_pack_request or blockly_builder_request

        if matched_teacher_agent and explicit_student_mode and not is_teacher_mode:
            response = {
                "success": True,
                "answer": "当前处于学习模式。我可以继续帮你理解实验目标、解释概念、分析报错或整理下一步；QuickForm、课程打包、Blockly 草稿构建等教师操作需要先解锁教师模式。",
            }
        elif matched_teacher_agent and is_teacher_mode:
            if quickform_request:
                response = build_quickform_agent_service(overrides).chat(
                    question=question,
                    history=history,
                    image_data=image_data,
                    request_context=request_context,
                )
            elif xedu_pack_request:
                response = build_xedu_pack_agent_service(overrides).chat(
                    question=question,
                    history=history,
                    image_data=image_data,
                    request_context=request_context,
                )
            elif blockly_builder_request:
                response = build_blockly_builder_agent_service(overrides).chat(
                    question=question,
                    history=history,
                    image_data=image_data,
                    request_context=request_context,
                )
            else:
                response = {
                    "success": True,
                    "answer": _teacher_navigation_answer(question),
                    "agent_status": "completed",
                }
        elif matched_teacher_agent:
            response = {
                "success": True,
                "answer": _teacher_navigation_answer(question),
                "agent_status": "completed",
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
