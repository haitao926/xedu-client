#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
XEdu Client 演示 API 服务器
简化版本，用于展示重构后的架构
"""

from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
import sys
import time
import threading
import subprocess
from datetime import datetime
import json

# 创建 Flask 应用
app = Flask(__name__)
CORS(app)

# 全局状态
jupyter_status = {
    "running": False,
    "port": 8888,
    "pid": None,
    "url": None,
    "uptime": 0,
    "auto_restart": False,
    "process_protection": "disabled"
}

config_data = {
    "jupyter_port": 8888,
    "python_executable": "",
    "project_dir": "",
    "use_notebook": False,
    "auto_start": False,
    "auto_restart": True,
    "check_interval": 2000,
    "max_restarts": 3
}

@app.route('/')
def root():
    """根路径"""
    return jsonify({
        "message": "XEdu Client Demo API",
        "version": "2.0.0",
        "timestamp": datetime.now().isoformat(),
        "status": "running"
    })

@app.route('/api/health')
def health_check():
    """健康检查"""
    return jsonify({
        "message": "XEdu Client API Server 运行正常",
        "status": "ok",
        "timestamp": datetime.now().isoformat()
    })

@app.route('/api/status')
def get_status():
    """获取 Jupyter 状态"""
    global jupyter_status

    return jsonify({
        **jupyter_status,
        "config": {
            "python_executable": config_data.get("python_executable", ""),
            "project_dir": config_data.get("project_dir", "")
        }
    })

@app.route('/api/start', methods=['POST'])
def start_jupyter():
    """启动 Jupyter"""
    global jupyter_status

    try:
        data = request.get_json() or {}

        # 更新配置
        config_data.update(data)

        # 模拟启动
        jupyter_status["running"] = True
        jupyter_status["port"] = config_data.get("port", 8888)
        jupyter_status["pid"] = 12345  # 模拟 PID
        suffix = "/tree" if config_data.get("use_notebook", False) else "/lab"
        jupyter_status["url"] = f"http://localhost:{jupyter_status['port']}{suffix}"
        jupyter_status["uptime"] = 0
        jupyter_status["auto_restart"] = config_data.get("auto_restart", False)
        jupyter_status["process_protection"] = "enabled" if config_data.get("auto_restart", False) else "disabled"

        print(f"[INFO] Jupyter 启动成功: {jupyter_status}")

        return jsonify({
            "success": True,
            "message": f"Jupyter {'Notebook' if config_data.get('use_notebook') else 'Lab'} 启动成功",
            "port": jupyter_status["port"],
            "url": jupyter_status["url"],
            "pid": jupyter_status["pid"],
            "auto_restart": jupyter_status["auto_restart"]
        })
    except Exception as e:
        return jsonify({
            "success": False,
            "message": f"启动失败: {str(e)}"
        }), 500

@app.route('/api/stop', methods=['POST'])
def stop_jupyter():
    """停止 Jupyter"""
    global jupyter_status

    jupyter_status["running"] = False
    jupyter_status["port"] = None
    jupyter_status["pid"] = None
    jupyter_status["url"] = None
    jupyter_status["uptime"] = 0
    jupyter_status["process_protection"] = "disabled"

    print("[INFO] Jupyter 已停止")

    return jsonify({
        "success": True,
        "message": "Jupyter 已停止"
    })

@app.route('/api/restart', methods=['POST'])
def restart_jupyter():
    """重启 Jupyter"""
    # 模拟重启过程
    print("[INFO] 重启 Jupyter")

    # 先停止
    stop_result = stop_jupyter()

    # 模拟等待
    time.sleep(0.1)

    # 再启动
    return start_jupyter()

@app.route('/api/detect_python')
def detect_python():
    """检测 Python 环境"""
    try:
        import platform

        python_version = f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}"
        python_executable = sys.executable
        platform_name = platform.platform()

        # 检查 JupyterLab
        jupyterlab_version = None
        try:
            import jupyterlab
            jupyterlab_version = jupyterlab.__version__
        except ImportError:
            pass

        # 检查 Jupyter Notebook
        jupyter_notebook_version = None
        try:
            import notebook
            jupyter_notebook_version = notebook.__version__
        except ImportError:
            pass

        return jsonify({
            "success": True,
            "message": "Python 环境检测成功",
            "info": {
                "python_version": python_version,
                "python_executable": python_executable,
                "platform": platform_name,
                "jupyterlab_installed": jupyterlab_version is not None,
                "jupyterlab_version": jupyterlab_version,
                "jupyter_notebook_installed": jupyter_notebook_version is not None,
                "jupyter_notebook_version": jupyter_notebook_version
            }
        })
    except Exception as e:
        return jsonify({
            "success": False,
            "message": f"检测失败: {str(e)}"
        }), 500

@app.route('/api/save_config', methods=['POST'])
def save_config():
    """保存配置"""
    try:
        data = request.get_json() or {}
        config_data.update(data)
        print(f"[INFO] 配置已保存: {list(data.keys())}")
        return jsonify({
            "success": True,
            "message": "配置保存成功"
        })
    except Exception as e:
        return jsonify({
            "success": False,
            "message": f"保存失败: {str(e)}"
        }), 500

@app.route('/api/load_config')
def load_config():
    """加载配置"""
    return jsonify({
        "success": True,
        "message": "配置加载成功",
        "config": config_data
    })

@app.route('/api/ai/ask', methods=['POST'])
def ai_ask():
    """AI 助手接口"""
    try:
        data = request.get_json() or {}
        image = data.get('image', '')
        question = data.get('question', '')

        if not image or not question:
            return jsonify({
                "success": False,
                "message": "图片和问题不能为空"
            }), 400

        # 模拟 AI 响应
        return jsonify({
            "success": True,
            "answer": f"这是重构版本对问题 '{question}' 的模拟回答。XEdu Client 2.0 已成功重构，采用了现代化的模块化架构，具有更好的可维护性和扩展性。",
            "usage": {
                "tokens": 150,
                "model": "demo-model"
            }
        })
    except Exception as e:
        return jsonify({
            "success": False,
            "message": f"AI 请求失败: {str(e)}"
        }), 500

if __name__ == '__main__':
    print("=" * 80)
    print("XEdu Client Demo API Server - Refactored Version")
    print("=" * 80)
    print(f"Python Version: {sys.version.split()[0]}")
    print(f"Platform: {sys.platform}")
    print(f"API Port: 5001")
    print("=" * 80)
    print("Features:")
    print("  [OK] Modular Architecture")
    print("  [OK] Modern Frontend")
    print("  [OK] Unified Configuration")
    print("  [OK] Error Handling")
    print("  [OK] AI Assistant Integration")
    print("=" * 80)
    print("API Endpoints:")
    print("  /api/health                    -> Health Check")
    print("  /api/status                    -> Get Status")
    print("  /api/start                     -> Start Jupyter")
    print("  /api/stop                      -> Stop Jupyter")
    print("  /api/restart                   -> Restart Jupyter")
    print("  /api/detect_python             -> Detect Python")
    print("  /api/save_config               -> Save Config")
    print("  /api/load_config               -> Load Config")
    print("  /api/ai/ask                    -> AI Assistant")
    print("=" * 80)
    print("Starting XEdu Client 2.0 Demo Server...")

    app.run(host='0.0.0.0', port=5001, debug=False)