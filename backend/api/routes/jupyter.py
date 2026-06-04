# -*- coding: utf-8 -*-
"""
Jupyter 管理路由模块
"""

from flask import jsonify, request


def register_jupyter_routes(app, services: dict):
    """注册 Jupyter 管理相关路由"""
    jupyter_manager = services["jupyter_manager"]
    merge_jupyter_payload = services["merge_jupyter_payload"]
    serialize_status = services["serialize_status"]
    collect_system_info = services["collect_system_info"]
    logger = services["logger"]

    @app.route("/api/status")
    def get_status():
        return jsonify(serialize_status())

    @app.route("/api/start", methods=["POST"])
    def start_jupyter():
        payload = request.get_json(silent=True) or {}
        merged_config = merge_jupyter_payload(payload)
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
        payload = request.get_json(silent=True) or {}
        merged_config = merge_jupyter_payload(payload)
        logger.info("重启 Jupyter")
        result = jupyter_manager.restart(**merged_config)
        if result.get("success"):
            result["config"] = merged_config
        return jsonify(result), (200 if result.get("success") else 500)

    @app.route("/api/detect_python")
    def detect_python():
        requested_python = (request.args.get("python_executable") or "").strip()
        info = collect_system_info(requested_python or None)
        return jsonify(
            {
                "success": True,
                "message": "Python 环境检测成功",
                "info": info.to_dict(),
            }
        )
