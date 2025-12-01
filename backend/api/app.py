#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Flask 应用构建模块
负责拼装所有服务、注册路由，并暴露 create_app() 方法供入口脚本使用。
"""

from __future__ import annotations

import platform
import sys
from datetime import datetime
from typing import Any, Dict

from flask import Flask, jsonify, request
from flask_cors import CORS
from werkzeug.exceptions import HTTPException

from ..models.config import (
    AppConfig,
    JupyterConfig,
    SystemInfo,
    AIConfig,
)
from ..services.jupyter_service import JupyterManager
from ..services.config_service import ConfigService
from ..services.ai_service import AIService
from ..utils.logger import get_logger

logger = get_logger(__name__)


def create_app(config_dir=None) -> Flask:
    """
    构建 Flask 应用。

    Args:
        config_dir: 可选的配置目录，默认沿用 ConfigService 的逻辑。
    """

    config_service = ConfigService(config_dir)
    app_config = config_service.load_config()
    jupyter_manager = JupyterManager(app_config.jupyter)
    ai_service = AIService(app_config.ai)

    app = Flask(__name__)
    CORS(app)

    def _persist_config() -> None:
        if not config_service.save_config(app_config):
            logger.warning("配置保存失败，使用内存中的配置继续运行")

    def _merge_jupyter_payload(payload: Dict[str, Any]) -> Dict[str, Any]:
        nonlocal app_config

        if not payload:
            return app_config.jupyter.to_dict()

        jupyter_dict = app_config.jupyter.to_dict()
        changed = False
        for key, value in payload.items():
            if key in jupyter_dict:
                jupyter_dict[key] = value
                setattr(app_config.jupyter, key, value)
                changed = True

        if changed:
            _persist_config()
            jupyter_manager.config = JupyterConfig.from_dict(jupyter_dict)

        return jupyter_dict

    def _serialize_status() -> Dict[str, Any]:
        status = jupyter_manager.get_status().to_dict()
        status["config"] = {
            "python_executable": app_config.jupyter.python_executable,
            "project_dir": app_config.jupyter.project_dir,
            "port": app_config.jupyter.port,
        }
        return status

    def _collect_system_info() -> SystemInfo:
        info = SystemInfo(
            python_version=platform.python_version(),
            python_executable=sys.executable,
            platform=platform.platform(),
        )

        try:
            import jupyterlab  # type: ignore

            info.jupyterlab_installed = True
            info.jupyterlab_version = getattr(jupyterlab, "__version__", None)
        except Exception:
            info.jupyterlab_installed = False

        try:
            import notebook  # type: ignore

            info.jupyter_notebook_version = getattr(notebook, "__version__", None)
        except Exception:
            info.jupyter_notebook_version = None

        return info

    def _normalize_config_payload(payload: Dict[str, Any]) -> AppConfig:
        """
        兼容旧版（扁平）和新版（分区）配置结构。
        """
        base = app_config.to_dict()
        if any(section in payload for section in ("jupyter", "ui", "ai")):
            for section in ("jupyter", "ui", "ai"):
                if isinstance(payload.get(section), dict):
                    base[section].update(payload[section])
        else:
            # 旧版：把所有键都认为是 jupyter 配置
            base["jupyter"].update(payload)

        return AppConfig.from_dict(base)

    def _build_ai_service(overrides: Dict[str, Any]) -> AIService:
        ai_dict = app_config.ai.to_dict()
        for key, value in (overrides or {}).items():
            if key in ai_dict:
                ai_dict[key] = value
        return AIService(AIConfig.from_dict(ai_dict))

    @app.errorhandler(Exception)
    def _handle_exception(error: Exception):
        if isinstance(error, HTTPException):
            return error
        logger.exception("后端发生未处理异常")
        return jsonify({"success": False, "message": str(error)}), 500

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
        info = _collect_system_info()
        return jsonify(
            {
                "message": "服务运行正常",
                "status": "ok",
                "system": info.to_dict(),
                "jupyter": jupyter_manager.get_status().to_dict(),
            }
        )

    @app.route("/api/status")
    def get_status():
        return jsonify(_serialize_status())

    @app.route("/api/start", methods=["POST"])
    def start_jupyter():
        payload = request.get_json() or {}
        merged_config = _merge_jupyter_payload(payload)
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
        payload = request.get_json() or {}
        merged_config = _merge_jupyter_payload(payload)
        logger.info("重启 Jupyter")
        result = jupyter_manager.restart(**merged_config)
        if result.get("success"):
            result["config"] = merged_config
        return jsonify(result), (200 if result.get("success") else 500)

    @app.route("/api/detect_python")
    def detect_python():
        info = _collect_system_info()
        return jsonify(
            {
                "success": True,
                "message": "Python 环境检测成功",
                "info": info.to_dict(),
            }
        )

    @app.route("/api/save_config", methods=["POST"])
    def save_config():
        nonlocal app_config
        payload = request.get_json() or {}
        logger.info(f"保存配置: {payload.keys()}")
        app_config = _normalize_config_payload(payload)

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
                "config": app_config.to_dict(),
            }
        )

    @app.route("/api/ai/ask", methods=["POST"])
    def ai_ask():
        payload = request.get_json() or {}
        question = (payload.get("question") or "").strip()
        if not question:
            return (
                jsonify({"success": False, "message": "问题不能为空"}),
                400,
            )

        image_data = payload.get("image")
        overrides = payload.get("config", {})
        service = _build_ai_service(overrides)
        response = service.ask_question(question, image_data)
        status_code = 200 if response.get("success") else 500
        return jsonify(response), status_code

    return app
