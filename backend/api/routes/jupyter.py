# -*- coding: utf-8 -*-
"""
Jupyter 管理路由模块
"""

from flask import jsonify, request
from api.config_utils import merge_jupyter_payload


def register_jupyter_routes(app, services: dict):
    """注册 Jupyter 管理相关路由"""
    jupyter_manager = services.get('jupyter_manager')
    config_service = services.get('config_service')
    
    # 辅助函数需要内联，因为它们依赖于 app 上下文中的变量
    def _serialize_status():
        """序列化状态信息"""
        from datetime import datetime
        jupyter_status = jupyter_manager.get_status()
        return {
            "timestamp": datetime.now().isoformat(),
            "jupyter": jupyter_status.to_dict() if jupyter_status else None,
            "config": services.get('app_config'),
        }
    
    def _collect_system_info():
        """收集系统信息"""
        from models.config import SystemInfo
        import platform
        import shutil
        import psutil
        
        python_path = shutil.which("python") or sys.executable
        cpu_count = psutil.cpu_count(logical=False)
        memory = psutil.virtual_memory()
        
        return SystemInfo(
            platform=platform.system(),
            platform_version=platform.version(),
            python_version=f"{platform.python_version()} ({platform.python_implementation()})",
            python_path=python_path,
            cpu_count=cpu_count,
            memory_total=memory.total,
            memory_available=memory.available,
        )
    
    def _merge_jupyter_payload(payload):
        """合并 Jupyter 配置"""
        return merge_jupyter_payload(services.get('app_config'), payload)
    
    @app.route("/api/status")
    def get_status():
        return jsonify(_serialize_status())

    @app.route("/api/start", methods=["POST"])
    def start_jupyter():
        payload = request.get_json() or {}
        merged_config = _merge_jupyter_payload(payload)
        from utils.logger import get_logger
        logger = get_logger(__name__)
        logger.info(f"启动 Jupyter，请求参数: {payload}")
        result = jupyter_manager.start(**merged_config)
        if result.get("success"):
            result["config"] = merged_config
        return jsonify(result), (200 if result.get("success") else 500)

    @app.route("/api/stop", methods=["POST"])
    def stop_jupyter():
        from utils.logger import get_logger
        logger = get_logger(__name__)
        logger.info("停止 Jupyter")
        result = jupyter_manager.stop()
        return jsonify(result), (200 if result.get("success") else 500)

    @app.route("/api/restart", methods=["POST"])
    def restart_jupyter():
        payload = request.get_json() or {}
        merged_config = _merge_jupyter_payload(payload)
        from utils.logger import get_logger
        logger = get_logger(__name__)
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