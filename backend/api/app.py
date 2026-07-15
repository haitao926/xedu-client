#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Flask 应用构建模块
负责拼装所有服务、注册路由，并暴露 create_app() 方法供入口脚本使用。
"""

from __future__ import annotations

import os
from typing import Any, Dict

from flask import Flask, jsonify, request
from werkzeug.exceptions import HTTPException

from models.config import AppConfig
from services.config_service import ConfigService
from services.ai_service import AIService
from services.project_service import ProjectService
from services.quickform_agent_service import (
    looks_like_confirmation,
    looks_like_quickform_request,
)
from services.xedu_pack_agent_service import (
    looks_like_xedu_pack_request,
)
from services.blockly_builder_agent_service import (
    looks_like_blockly_builder_request,
)
from services.classroom_service import (
    ClassroomService,
)
from services.jupyter_service import JupyterManager
from services.blockly_xeduhub_support import get_nonblocking_supported_tasks_snapshot
from utils.logger import get_logger
from .app_support import (
    build_route_services,
    register_app_routes,
)
from .security import configure_security
from .resource_runtime import ResourceHandleRegistry

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
    project_service = ProjectService()
    classroom_service = ClassroomService()

    app = Flask(__name__)
    configure_security(app)
    app.extensions["xedu_resource_handles"] = ResourceHandleRegistry()

    def _persist_config(target_config: AppConfig | None = None) -> bool:
        config_to_save = target_config or app_config
        if not config_service.save_config(config_to_save):
            logger.warning("配置保存失败，使用内存中的配置继续运行")
            return False
        return True

    def _serialize_status() -> Dict[str, Any]:
        status = jupyter_manager.get_status().to_dict()
        status["config"] = {
            "python_executable": app_config.jupyter.python_executable,
            "project_dir": app_config.jupyter.project_dir,
            "port": app_config.jupyter.port,
        }
        return status

    def _set_app_config(new_config: AppConfig) -> None:
        nonlocal app_config
        app_config = new_config

    services = build_route_services(
        app=app,
        app_config=app_config,
        config_service=config_service,
        jupyter_manager=jupyter_manager,
        ai_service=ai_service,
        project_service=project_service,
        classroom_service=classroom_service,
        set_app_config=_set_app_config,
        persist_config=_persist_config,
        serialize_status=_serialize_status,
        get_app_config=lambda: app_config,
        looks_like_confirmation=looks_like_confirmation,
        looks_like_quickform_request=looks_like_quickform_request,
        looks_like_xedu_pack_request=looks_like_xedu_pack_request,
        looks_like_blockly_builder_request=looks_like_blockly_builder_request,
        get_nonblocking_supported_tasks_snapshot=get_nonblocking_supported_tasks_snapshot,
    )

    services["logger"] = logger
    register_app_routes(app, services, app_config)

    @app.errorhandler(Exception)
    def _handle_exception(error: Exception):
        if isinstance(error, HTTPException):
            return error
        logger.exception("后端发生未处理异常")
        return jsonify({"success": False, "message": str(error)}), 500

    return app
