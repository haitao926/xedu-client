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
import traceback
from pathlib import Path
import os

BASE_DIR = Path(__file__).resolve().parent

# 确保 backend 包可以被导入
sys.path.insert(0, str(BASE_DIR))

from utils.logger import get_logger  # noqa: E402
from utils.python_bootstrap import (  # noqa: E402
    ensure_backend_dependencies,
    missing_backend_packages,
)

logger = get_logger(__name__)
_cleanup_executed = False


def startup_marker(message: str) -> None:
    """Write startup checkpoints to stdout and backend logs for packaged diagnostics."""
    text = f"[backend-startup] {message}"
    print(text, flush=True)
    try:
        logger.info(text)
    except Exception:
        pass


def cleanup_jupyter_processes():
    """仅清理当前后端进程的子进程，避免误伤外部 Jupyter。"""
    global _cleanup_executed
    if _cleanup_executed:
        return
    _cleanup_executed = True

    logger.info("清理后端子进程...")
    try:
        import psutil
        current_process = psutil.Process(os.getpid())
        children = current_process.children(recursive=True)
        for child in children:
            try:
                child.terminate()
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                continue

        gone, alive = psutil.wait_procs(children, timeout=3)
        for child in alive:
            try:
                child.kill()
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                continue
        logger.info(f"后端子进程清理完成（terminated={len(gone)}, killed={len(alive)}）")
    except Exception as e:
        logger.error(f"清理子进程失败: {e}")


def signal_handler(signum, frame):
    """信号处理器"""
    logger.info(f"收到信号 {signum}，正在清理...")
    cleanup_jupyter_processes()
    sys.exit(0)


def run_bootstrap_recovery_server(port: int) -> None:
    """Expose environment recovery while Flask dependencies are unavailable."""
    from utils.bootstrap_server import run_bootstrap_server
    from utils.python_runtime import inspect_python_executable, repair_xedu_python_environment

    host = (
        os.environ.get("XEDU_BACKEND_BIND_HOST")
        or os.environ.get("XEDU_API_HOST")
        or os.environ.get("XEDU_BACKEND_HOST")
        or "127.0.0.1"
    ).strip()
    capability = os.environ.get("XEDU_CLIENT_CAPABILITY", "")

    def promote_backend(server) -> None:
        """Install the backend-only dependencies after repair, then re-exec normally."""
        startup_marker("bootstrap-repair-succeeded; preparing full backend")
        backend_dependencies = ensure_backend_dependencies()
        if not backend_dependencies.get("success"):
            startup_marker(
                f"bootstrap-promotion-failed: "
                f"{backend_dependencies.get('message') or '无法准备 Flask 后端依赖'}"
            )
            return

        startup_marker("bootstrap-promotion-ready")
        try:
            os.execv(
                sys.executable,
                [sys.executable, str(Path(__file__).resolve()), *sys.argv[1:]],
            )
        except OSError as exc:
            startup_marker(f"bootstrap-promotion-exec-failed: {exc}")
            server.shutdown()

    startup_marker(f"bootstrap-recovery-ready host={host} port={port}")
    run_bootstrap_server(
        host,
        port,
        capability=capability,
        inspect_python=inspect_python_executable,
        repair_python=repair_xedu_python_environment,
        on_repair_success=promote_backend,
        bootstrap_log=startup_marker,
    )


def main() -> None:
    """构建并运行 Flask 应用。"""
    print(f"Python Executable: {sys.executable}", flush=True)
    print(f"System Path: {sys.path}", flush=True)
    startup_marker("entry")

    port = int(os.environ.get("XEDU_API_PORT") or os.environ.get("XEDU_BACKEND_PORT") or "5123")

    # Do not try to import or install Flask before the recovery API exists.
    # A selected Python environment must be repairable even when it has none
    # of the backend packages yet.
    missing = missing_backend_packages()
    if missing:
        startup_marker(f"bootstrap-dependencies-missing: {', '.join(missing)}")
        run_bootstrap_recovery_server(port)
        return
    startup_marker("bootstrap-ready")

    from api.app import create_app  # noqa: E402
    
    # 注册退出处理
    atexit.register(cleanup_jupyter_processes)
    signal.signal(signal.SIGTERM, signal_handler)
    signal.signal(signal.SIGINT, signal_handler)
    startup_marker("signals-registered")

    # 创建应用，优先使用环境变量指定的可写配置目录
    env_config_dir = os.environ.get("XEDU_CONFIG_DIR") or os.environ.get("XEDU_DATA_DIR")
    if env_config_dir:
        env_config_dir = Path(env_config_dir) / "config"
    startup_marker(f"config-dir={env_config_dir or '<default>'}")

    startup_marker("create-app-start")
    app = create_app(env_config_dir)
    startup_marker("create-app-done")

    host_env = (
        os.environ.get("XEDU_BACKEND_BIND_HOST")
        or os.environ.get("XEDU_API_HOST")
        or os.environ.get("XEDU_BACKEND_HOST")
    )
    host = (host_env or "").strip()
    if not host:
        try:
            host = "0.0.0.0" if bool(app.config.get("ALLOW_NETWORK_ACCESS")) else "127.0.0.1"
        except Exception:
            host = "127.0.0.1"

    logger.info(f"Xedu Client API Server 启动中 (host={host}, port={port})")
    logger.info("进程清理已配置，退出时将自动清理所有 Jupyter 进程")

    try:
        startup_marker(f"flask-run-start host={host} port={port}")
        app.run(host=host, port=port, debug=False, threaded=True)
        startup_marker("flask-run-returned")
    finally:
        startup_marker("finally-cleanup")
        cleanup_jupyter_processes()


if __name__ == "__main__":
    try:
        main()
    except BaseException as exc:
        traceback.print_exc()
        try:
            if isinstance(exc, SystemExit):
                logger.error(f"后端启动阶段触发 SystemExit: code={exc.code!r}")
            else:
                logger.exception("后端启动阶段发生未处理异常")
        except Exception:
            pass
        raise
