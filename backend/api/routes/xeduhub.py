# -*- coding: utf-8 -*-
"""XEduHub runtime routes shared by supported clients."""

from __future__ import annotations

from flask import jsonify, request

from api.security import require_capability


def register_xeduhub_routes(app, services: dict):
    """Register the neutral XEduHub execution endpoint."""

    logger = services["logger"]
    execute_xeduhub_runtime = services["execute_xeduhub_runtime"]

    @app.route("/api/resources/xeduhub/execute", methods=["POST"])
    @require_capability("python:run")
    def resources_xeduhub_execute():
        try:
            payload = request.get_json(silent=True) or {}
            result = execute_xeduhub_runtime(payload)
            return jsonify(result), 200 if result.get("success") else 400
        except Exception as exc:
            logger.error(f"执行 XEduHub runtime 失败: {exc}")
            return jsonify({
                "success": False,
                "result_type": "error",
                "message": "执行 XEduHub runtime 失败",
                "result": {"error": "XEduHub runtime 执行失败"},
                "artifacts": {},
            }), 500
