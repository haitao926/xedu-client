# -*- coding: utf-8 -*-
"""XEduHub runtime routes shared by supported clients."""

from __future__ import annotations

import json

from flask import jsonify, request

from api.security import require_capability


REALTIME_MAX_FRAME_BYTES = 1024 * 1024
REALTIME_MAX_REQUEST_BYTES = REALTIME_MAX_FRAME_BYTES + 96 * 1024
REALTIME_MAX_PARAMS_BYTES = 16 * 1024


def _realtime_error(error_code: str, message: str, *, task_id: str = "") -> dict:
    """Keep every realtime failure consumable by the same Scratch client path."""
    return {
        "success": False,
        "result_type": "error",
        "error_code": error_code,
        "message": message,
        "result": {},
        "artifacts": {},
        "result_summary": {
            "headline": message,
            "metrics": [],
            "hints": [],
        },
        "result_artifacts": {
            "preview_image": "",
            "key_fields": {},
        },
        "result_error": {
            "code": error_code,
            "task_id": task_id,
            "recommended_action": message,
        },
    }


def register_xeduhub_routes(app, services: dict):
    """Register the neutral XEduHub execution endpoint."""

    logger = services["logger"]
    execute_xeduhub_runtime = services["execute_xeduhub_runtime"]
    execute_xeduhub_realtime = services.get("execute_xeduhub_realtime")

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

    @app.route("/api/resources/xeduhub/realtime", methods=["POST"])
    @require_capability("python:run")
    def resources_xeduhub_realtime():
        if execute_xeduhub_realtime is None:
            return jsonify(_realtime_error("realtime_unavailable", "实时 XEduHub 接口不可用")), 503
        try:
            if request.content_length and request.content_length > REALTIME_MAX_REQUEST_BYTES:
                return jsonify(_realtime_error("invalid_image_data", "实时请求过大，请降低摄像头画面尺寸。")), 413
            frame = request.files.get("frame")
            if frame is None:
                return jsonify(_realtime_error("invalid_image_data", "缺少摄像头画面")), 400
            if str(frame.mimetype or "").lower() != "image/jpeg":
                return jsonify(_realtime_error("invalid_image_data", "实时摄像头画面必须是 JPEG")), 400
            task_id = str(request.form.get("task_id", "")).strip()
            session_id = str(request.form.get("session_id", "")).strip()
            params = request.form.get("params", "{}")
            if not task_id or len(task_id) > 80:
                return jsonify(_realtime_error("invalid_task_id", "实时任务标识无效", task_id=task_id)), 400
            if len(session_id) > 128:
                return jsonify(_realtime_error("invalid_metadata", "实时会话标识过长", task_id=task_id)), 400
            if len(params.encode("utf-8")) > REALTIME_MAX_PARAMS_BYTES:
                return jsonify(_realtime_error("invalid_metadata", "实时参数过大", task_id=task_id)), 400
            try:
                parsed_params = json.loads(params or "{}")
            except (TypeError, json.JSONDecodeError):
                return jsonify(_realtime_error("invalid_metadata", "实时参数不是有效 JSON", task_id=task_id)), 400
            if not isinstance(parsed_params, dict):
                return jsonify(_realtime_error("invalid_metadata", "实时参数必须是 JSON 对象", task_id=task_id)), 400
            try:
                frame_seq = int(request.form.get("frame_seq", "0"))
                captured_at_ms = int(request.form.get("captured_at_ms", "0"))
            except (TypeError, ValueError):
                return jsonify(_realtime_error("invalid_metadata", "实时帧序号或采集时间无效", task_id=task_id)), 400
            if frame_seq < 0 or captured_at_ms < 0:
                return jsonify(_realtime_error("invalid_metadata", "实时帧序号或采集时间无效", task_id=task_id)), 400
            frame_bytes = frame.stream.read(REALTIME_MAX_FRAME_BYTES + 1)
            if len(frame_bytes) > REALTIME_MAX_FRAME_BYTES:
                return jsonify(_realtime_error("invalid_image_data", "摄像头画面过大")), 413
            metadata = {
                "task_id": task_id,
                "session_id": session_id,
                "frame_seq": frame_seq,
                "captured_at_ms": captured_at_ms,
                "params": parsed_params,
            }
            result = execute_xeduhub_realtime(frame_bytes, metadata)
            error_code = result.get("error_code")
            if result.get("success"):
                status = 200
            elif error_code == "runtime_busy":
                status = 429
            elif error_code == "missing_dependency":
                status = 503
            else:
                status = 400
            return jsonify(result), status
        except Exception as exc:
            logger.error(f"执行 XEduHub realtime 失败: {exc}")
            return jsonify(_realtime_error("realtime_inference_failed", "执行 XEduHub realtime 失败")), 500
