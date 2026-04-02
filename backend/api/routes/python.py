# -*- coding: utf-8 -*-
"""
Python/Pip 路由模块
"""

from flask import jsonify, request
import subprocess
import sys
import shutil


def register_python_routes(app, services: dict):
    """注册 Python/Pip 相关路由"""
    
    @app.route("/api/python/pip", methods=["POST"])
    def handle_pip():
        payload = request.get_json() or {}
        command = payload.get("command", "")
        package = payload.get("package", "")
        
        from utils.logger import get_logger
        logger = get_logger(__name__)
        
        # 构建 pip 命令
        if command == "list":
            cmd = [sys.executable, "-m", "pip", "list", "--format=json"]
        elif command == "install" and package:
            cmd = [sys.executable, "-m", "pip", "install", package]
        elif command == "uninstall" and package:
            cmd = [sys.executable, "-m", "pip", "uninstall", package, "-y"]
        else:
            return jsonify({"success": False, "message": "无效的命令"}), 400
        
        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=300
            )
            
            if result.returncode == 0:
                return jsonify({
                    "success": True,
                    "output": result.stdout
                })
            else:
                return jsonify({
                    "success": False,
                    "error": result.stderr
                }), 500
                
        except subprocess.TimeoutExpired:
            return jsonify({"success": False, "message": "命令执行超时"}), 500
        except Exception as e:
            logger.error(f"Pip 命令执行失败: {e}")
            return jsonify({"success": False, "message": str(e)}), 500