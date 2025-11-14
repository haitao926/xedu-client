#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
重构后的后端 API 服务器
基于新的模块化架构实现
"""

import sys
import json
import time
import threading
import subprocess
import os
from pathlib import Path
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
from datetime import datetime

# 添加 src 目录到 Python 路径
sys.path.insert(0, str(Path(__file__).parent / "src" / "backend"))

try:
    from models.config import JupyterStatus, SystemInfo
    from services.jupyter_service import JupyterManager
    from utils.logger import get_logger
except ImportError as e:
    print(f"导入错误: {e}")
    print("正在使用简化模式运行...")

    # 简化模式下的数据结构
    class JupyterStatus:
        def __init__(self):
            self.running = False
            self.port = None
            self.pid = None
            self.url = None
            self.uptime = 0
            self.auto_restart = False
            self.process_protection = "disabled"

        def to_dict(self):
            return {
                "running": self.running,
                "port": self.port,
                "pid": self.pid,
                "url": self.url,
                "uptime": self.uptime,
                "auto_restart": self.auto_restart,
                "process_protection": self.process_protection
            }

    # 简化日志
    import logging
    logging.basicConfig(level=logging.INFO)

    class SimpleLogger:
        def info(self, msg):
            print(f"[INFO] {msg}")
        def error(self, msg):
            print(f"[ERROR] {msg}")
        def warning(self, msg):
            print(f"[WARNING] {msg}")
        def exception(self, msg):
            print(f"[EXCEPTION] {msg}")

    logger = SimpleLogger()

    # 简化的 Jupyter 管理器
    class SimpleJupyterManager:
        def __init__(self):
            self.config = type('Config', (), {
                'port': 8888,
                'python_executable': '',
                'project_dir': '',
                'use_notebook': False,
                'auto_restart': False,
                'check_interval': 2000,
                'max_restarts': 3
            })()
            self.process = None
            self.start_time = None

        def get_status(self):
            status = JupyterStatus()
            if self.process and self.process.poll() is None:
                status.running = True
                status.port = self.config.port
                status.pid = self.process.pid
                suffix = "/tree" if self.config.use_notebook else "/lab"
                status.url = f"http://localhost:{self.config.port}{suffix}"
                if self.start_time:
                    status.uptime = int(time.time() - self.start_time)
                status.auto_restart = self.config.auto_restart
            return status

        def start(self, **kwargs):
            try:
                # 更新配置
                for key, value in kwargs.items():
                    if hasattr(self.config, key):
                        setattr(self.config, key, value)

                # 构建 Jupyter 命令
                module = "notebook" if self.config.use_notebook else "jupyterlab"
                cmd = [
                    "python", "-m", module,
                    f"--port={self.config.port}",
                    "--no-browser",
                    "--allow-root",
                    "--ServerApp.token=''",
                    "--ServerApp.password=''"
                ]

                # 启动进程
                self.process = subprocess.Popen(cmd, cwd=self.config.project_dir or ".")
                self.start_time = time.time()

                status = self.get_status()
                return {
                    "success": True,
                    "message": f"Jupyter {module} 启动成功",
                    "port": status.port,
                    "url": status.url,
                    "pid": status.pid
                }
            except Exception as e:
                return {"success": False, "message": f"启动失败: {str(e)}"}

        def stop(self):
            if self.process:
                try:
                    self.process.terminate()
                    self.process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    self.process.kill()
                self.process = None
                self.start_time = None
            return {"success": True, "message": "Jupyter 已停止"}

        def restart(self, **kwargs):
            self.stop()
            time.sleep(2)
            return self.start(**kwargs)

# 创建 Flask 应用
app = Flask(__name__)
CORS(app)

# 创建管理器实例
try:
    jupyter_config = type('Config', (), {
        'port': 8888,
        'python_executable': '',
        'project_dir': '',
        'use_notebook': False,
        'auto_restart': False,
        'check_interval': 2000,
        'max_restarts': 3
    })()
    manager = JupyterManager(jupyter_config)
except:
    manager = SimpleJupyterManager()

# 配置存储
config_storage = {}

@app.route('/')
def root():
    """根路径"""
    return jsonify({
        "message": "XEdu Client API Server",
        "version": "2.0.0",
        "timestamp": datetime.now().isoformat()
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
    try:
        status = manager.get_status()
        result = status.to_dict()
        result['config'] = {
            'python_executable': manager.config.python_executable,
            'project_dir': manager.config.project_dir
        }
        return jsonify(result)
    except Exception as e:
        logger.error(f"获取状态失败: {e}")
        return jsonify({
            "success": False,
            "message": f"获取状态失败: {str(e)}"
        }), 500

@app.route('/api/start', methods=['POST'])
def start_jupyter():
    """启动 Jupyter"""
    try:
        config = request.get_json() or {}
        logger.info(f"启动 Jupyter，配置: {config}")

        result = manager.start(**config)
        return jsonify(result)
    except Exception as e:
        logger.error(f"启动 Jupyter 失败: {e}")
        return jsonify({
            "success": False,
            "message": f"启动失败: {str(e)}"
        }), 500

@app.route('/api/stop', methods=['POST'])
def stop_jupyter():
    """停止 Jupyter"""
    try:
        logger.info("停止 Jupyter")
        result = manager.stop()
        return jsonify(result)
    except Exception as e:
        logger.error(f"停止 Jupyter 失败: {e}")
        return jsonify({
            "success": False,
            "message": f"停止失败: {str(e)}"
        }), 500

@app.route('/api/restart', methods=['POST'])
def restart_jupyter():
    """重启 Jupyter"""
    try:
        config = request.get_json() or {}
        logger.info(f"重启 Jupyter，配置: {config}")

        result = manager.restart(**config)
        return jsonify(result)
    except Exception as e:
        logger.error(f"重启 Jupyter 失败: {e}")
        return jsonify({
            "success": False,
            "message": f"重启失败: {str(e)}"
        }), 500

@app.route('/api/detect_python')
def detect_python():
    """检测 Python 环境"""
    try:
        import platform
        import sys

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
        logger.error(f"检测 Python 环境失败: {e}")
        return jsonify({
            "success": False,
            "message": f"检测失败: {str(e)}"
        }), 500

@app.route('/api/save_config', methods=['POST'])
def save_config():
    """保存配置"""
    try:
        config = request.get_json()
        config_storage.update(config)
        logger.info(f"配置已保存: {list(config.keys())}")
        return jsonify({
            "success": True,
            "message": "配置保存成功"
        })
    except Exception as e:
        logger.error(f"保存配置失败: {e}")
        return jsonify({
            "success": False,
            "message": f"保存失败: {str(e)}"
        }), 500

@app.route('/api/load_config')
def load_config():
    """加载配置"""
    try:
        return jsonify({
            "success": True,
            "message": "配置加载成功",
            "config": config_storage
        })
    except Exception as e:
        logger.error(f"加载配置失败: {e}")
        return jsonify({
            "success": False,
            "message": f"加载失败: {str(e)}"
        }), 500

@app.route('/api/ai/ask', methods=['POST'])
def ai_ask():
    """AI 助手接口"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({
                "success": False,
                "message": "缺少请求数据"
            }), 400

        image = data.get('image', '')
        question = data.get('question', '')

        if not image or not question:
            return jsonify({
                "success": False,
                "message": "图片和问题不能为空"
            }), 400

        # 这里应该调用真实的 AI API
        # 现在返回模拟响应
        return jsonify({
            "success": True,
            "answer": f"这是对问题 '{question}' 的模拟回答。注意：这是重构版本的演示响应。"
        })
    except Exception as e:
        logger.error(f"AI 请求失败: {e}")
        return jsonify({
            "success": False,
            "message": f"AI 请求失败: {str(e)}"
        }), 500

if __name__ == '__main__':
    print("=" * 80)
    print("XEdu Client Backend API Server - 重构版本")
    print("=" * 80)
    print(f"Python 版本: {sys.version.split()[0]}")
    print(f"平台: {sys.platform}")
    print(f"API 端口: 5000")
    print("=" * 80)
    print("API 端点:")
    print("  /api/health                    -> 健康检查")
    print("  /api/status                    -> 获取状态")
    print("  /api/start                     -> 启动 Jupyter")
    print("  /api/stop                      -> 停止 Jupyter")
    print("  /api/restart                   -> 重启 Jupyter")
    print("  /api/detect_python             -> 检测 Python 环境")
    print("  /api/save_config               -> 保存配置")
    print("  /api/load_config               -> 加载配置")
    print("  /api/ai/ask                    -> AI 助手")
    print("=" * 80)

    app.run(host='0.0.0.0', port=5000, debug=False)