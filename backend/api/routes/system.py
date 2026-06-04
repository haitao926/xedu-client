# -*- coding: utf-8 -*-
"""
系统路由模块
"""

import os
import sys
import tempfile
from datetime import datetime
from pathlib import Path
from uuid import uuid4

from flask import jsonify, request


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

    @app.route("/api/system/select-image-file", methods=["POST"])
    def select_image_file():
        return (
            jsonify(
                {
                    "success": False,
                    "path": None,
                    "message": "请选择通过 Electron IPC 或浏览器原生文件选择器完成，后端不再直接打开系统对话框。",
                }
            ),
            501,
        )

    @app.route("/api/system/import-image-file", methods=["POST"])
    def import_image_file():
        upload = request.files.get("file")
        if upload is None or not upload.filename:
            return jsonify({"success": False, "path": None, "message": "请选择要导入的图片文件。"}), 400

        suffix = Path(upload.filename).suffix.lower()
        if suffix not in {".png", ".jpg", ".jpeg", ".bmp", ".webp", ".gif"}:
            return jsonify({"success": False, "path": None, "message": "仅支持 png、jpg、jpeg、bmp、webp、gif 图片。"}), 400
        try:
            from PIL import Image  # type: ignore

            Image.open(upload.stream).verify()
            upload.stream.seek(0)
        except Exception:
            return jsonify({"success": False, "path": None, "message": "图片文件无法解析，请重新选择。"}), 400

        config_dir = Path(config_service.config_dir) if config_service else Path(tempfile.gettempdir()) / "xedu-client"
        target_dir = config_dir / "runtime-assets" / "imported-images"
        target_dir.mkdir(parents=True, exist_ok=True)
        target = target_dir / f"{uuid4().hex}{suffix}"
        upload.save(target)
        return jsonify({"success": True, "path": str(target.resolve())}), 200
