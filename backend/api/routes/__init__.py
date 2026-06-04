# -*- coding: utf-8 -*-
"""
API 路由模块
"""

from .system import register_system_routes
from .jupyter import register_jupyter_routes
from .config import register_config_routes
from .ai import register_ai_routes
from .python import register_python_routes
from .documents import register_document_routes
from .classroom import register_classroom_routes
from .resources import register_resource_routes
from .resources_blockly import register_resource_blockly_routes
from .projects import register_project_routes
from .quickform import register_quickform_routes


def register_all_routes(app, services: dict):
    """
    注册所有路由
    
    Args:
        app: Flask 应用实例
        services: 服务字典，包含 jupyter_manager, ai_service, config_service 等
    """
    register_system_routes(app, services)
    register_jupyter_routes(app, services)
    register_config_routes(app, services)
    register_ai_routes(app, services)
    register_python_routes(app, services)
    register_document_routes(app, services)
    register_classroom_routes(app, services)
    register_resource_routes(app, services)
    register_resource_blockly_routes(app, services)
    register_project_routes(app, services)
    register_quickform_routes(app, services)
