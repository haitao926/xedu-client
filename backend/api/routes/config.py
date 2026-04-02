# -*- coding: utf-8 -*-
"""
配置路由模块
"""

from flask import jsonify, request


def register_config_routes(app, services: dict):
    """注册配置相关路由"""
    config_service = services.get('config_service')
    jupyter_manager = services.get('jupyter_manager')
    ai_service = services.get('ai_service')
    app_config = services.get('app_config')
    
    # 用于保存配置的闭包变量
    config_storage = {'app_config': app_config}
    
    def _normalize_config_payload(payload):
        """规范化配置负载"""
        from .config_utils import normalize_config_payload
        return normalize_config_payload(services.get('app_config'), payload)
    
    @app.route("/api/save_config", methods=["POST"])
    def save_config():
        payload = request.get_json() or {}
        from utils.logger import get_logger
        logger = get_logger(__name__)
        logger.info(f"保存配置: {payload.keys()}")
        
        app_config = _normalize_config_payload(payload)
        config_storage['app_config'] = app_config
        
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
            jupyter_manager.config = app_config.jupyter
            ai_service.config = app_config.ai
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
        return jsonify(
            {
                "success": True,
                "message": "配置加载成功",
                "config": config_storage['app_config'].to_dict(),
            }
        )