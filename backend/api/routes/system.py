# -*- coding: utf-8 -*-
"""
系统路由模块
"""

import os
import sys
from datetime import datetime
from flask import jsonify


def register_system_routes(app, services: dict):
    """注册系统相关路由"""
    config_service = services.get('config_service')
    
    @app.route("/api/debug/env")
    def debug_env():
        from services.markdown_document_service import get_markdown_document_service
        return jsonify({
            "cwd": os.getcwd(),
            "env_docs_dir": os.environ.get("XEDU_DOCS_DIR"),
            "app_config_dir": str(config_service.config_dir) if config_service else "None",
            "python_path": sys.path,
            "docs_service_path": str(get_markdown_document_service().docs_dir) if get_markdown_document_service() else "None"
        })

    @app.route("/")
    def root():
        return jsonify(
            {
                "message": "Xedu Client API Server",
                "version": "2.1.0",
                "timestamp": datetime.utcnow().isoformat(),
            }
        )

    @app.route("/api/health")
    def health_check():
        return jsonify(
            {
                "message": "服务运行正常",
                "status": "ok",
            }
        )