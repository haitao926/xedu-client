# -*- coding: utf-8 -*-
"""
配置路由模块
"""

from flask import jsonify, request


def register_config_routes(app, services: dict):
    """注册配置相关路由"""
    config_service = services["config_service"]
    jupyter_manager = services["jupyter_manager"]
    ai_service = services["ai_service"]
    logger = services["logger"]
    get_app_config = services["get_app_config"]
    set_app_config = services["set_app_config"]
    normalize_config_payload = services["normalize_config_payload"]

    @app.route("/api/save_config", methods=["POST"])
    def save_config():
        payload = request.get_json(silent=True) or {}
        logger.info(f"保存配置: {payload.keys()}")

        app_config = normalize_config_payload(payload)
        is_valid, errors = app_config.validate()
        if not is_valid:
            return (
                jsonify(
                    {
                        "success": False,
                        "message": "配置验证失败",
                        "errors": errors,
                    }
                ),
                400,
            )

        if config_service.save_config(app_config):
            set_app_config(app_config)
            jupyter_manager.config = app_config.jupyter
            ai_service.config = app_config.ai
            app.config["ALLOW_NETWORK_ACCESS"] = bool(getattr(app_config.ui, "allow_network_access", False))
            return jsonify(
                {
                    "success": True,
                    "message": "配置保存成功",
                    "config": app_config.to_dict(),
                }
            )

        return jsonify({"success": False, "message": "保存配置失败"}), 500

    @app.route("/api/load_config")
    def load_config():
        app_config = get_app_config()
        return jsonify(
            {
                "success": True,
                "message": "配置加载成功",
                "config": app_config.to_dict(),
            }
        )
