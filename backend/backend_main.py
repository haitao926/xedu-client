#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Xedu Client 后端入口

这一层只负责把 backend 包加入 sys.path，然后构建并运行 Flask 应用。
业务逻辑、路由以及服务都在 backend/api 模块中实现，方便测试和复用。
"""

from __future__ import annotations

import sys
import signal
import atexit
from pathlib import Path
import os
import subprocess

BASE_DIR = Path(__file__).resolve().parent

# 确保 backend 包可以被导入
sys.path.insert(0, str(BASE_DIR))

from api.app import create_app  # noqa: E402
from utils.logger import get_logger  # noqa: E402

logger = get_logger(__name__)


def cleanup_jupyter_processes():
    """清理所有 Jupyter 进程"""
    logger.info("清理所有 Jupyter 进程...")

    try:
        import psutil

        # 获取当前进程，避免杀死自己
        current_pid = os.getpid()
        current_process = psutil.Process(current_pid)

        # 查找所有子进程
        children = current_process.children(recursive=True)

        # 先杀死所有子进程
        for child in children:
            try:
                logger.info(f"杀死子进程: PID {child.pid}, 命令: {' '.join(child.cmdline())}")
                child.terminate()
                child.wait(timeout=3)
            except psutil.NoSuchProcess:
                pass
            except psutil.TimeoutExpired:
                child.kill()

        # 查找并杀死所有Jupyter相关进程
        for proc in psutil.process_iter(['pid', 'name', 'cmdline']):
            try:
                cmdline = ' '.join(proc.info['cmdline'] or [])
                if 'jupyter' in cmdline.lower() and proc.info['pid'] != current_pid:
                    logger.info(f"杀死Jupyter进程: PID {proc.info['pid']}")
                    proc.terminate()
                    try:
                        proc.wait(timeout=3)
                    except psutil.TimeoutExpired:
                        proc.kill()
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                pass

    except ImportError:
        # 如果没有psutil，使用传统方法
        logger.warning("psutil未安装，使用传统方法清理进程")

        if sys.platform == "win32":
            # Windows: 使用 wmi 或 taskkill
            try:
                import wmi
                c = wmi.WMI()
                for process in c.Win32_Process():
                    if process.Name == 'python.exe' and process.CommandLine and 'jupyter' in process.CommandLine.lower():
                        logger.info(f"杀死Jupyter进程: PID {process.ProcessId}")
                        process.Terminate()
            except ImportError:
                # 回退到taskkill方法
                logger.info("使用taskkill清理Jupyter进程")
                # 杀死所有在常用端口监听的Jupyter进程
                for port in range(8888, 8899):
                    try:
                        result = subprocess.run(
                            f'netstat -ano | findstr :{port}',
                            shell=True, capture_output=True, text=True
                        )
                        if result.stdout:
                            for line in result.stdout.split('\n'):
                                if 'LISTENING' in line:
                                    parts = line.split()
                                    if len(parts) >= 5:
                                        pid = parts[-1]
                                        subprocess.run(['taskkill', '/F', '/PID', pid], capture_output=True)
                    except:
                        pass
        else:
            # Unix/Linux: 使用 pkill
            subprocess.run(['pkill', '-f', 'jupyter'], capture_output=True)
            subprocess.run(['pkill', '-f', 'jupyterlab'], capture_output=True)
            subprocess.run(['pkill', '-f', 'jupyter-notebook'], capture_output=True)

    except Exception as e:
        logger.error(f"清理进程时出错: {e}")

    logger.info("Jupyter 进程清理完成")


def signal_handler(signum, frame):
    """信号处理器"""
    logger.info(f"收到信号 {signum}，正在清理...")
    cleanup_jupyter_processes()
    sys.exit(0)


def main() -> None:
    """构建并运行 Flask 应用。"""
    # 注册退出处理
    atexit.register(cleanup_jupyter_processes)
    signal.signal(signal.SIGTERM, signal_handler)
    signal.signal(signal.SIGINT, signal_handler)

    # 创建应用，优先使用环境变量指定的可写配置目录
    env_config_dir = os.environ.get("XEDU_CONFIG_DIR") or os.environ.get("XEDU_DATA_DIR")
    if env_config_dir:
        env_config_dir = Path(env_config_dir) / "config"

    app = create_app(env_config_dir)

    logger.info("Xedu Client API Server 启动中 (port=5000)")
    logger.info("进程清理已配置，退出时将自动清理所有 Jupyter 进程")

    try:
        app.run(host="0.0.0.0", port=5000, debug=False)
    finally:
        cleanup_jupyter_processes()


if __name__ == "__main__":
    main()
