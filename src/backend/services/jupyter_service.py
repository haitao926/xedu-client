"""
Jupyter 服务管理模块
提供 Jupyter Notebook/Lab 的启动、停止、状态监控等功能
"""

import os
import sys
import time
import signal
import platform
import subprocess
import threading
import json
from pathlib import Path
from typing import Optional, Dict, Any, Tuple
import psutil

from ..models.config import JupyterConfig, JupyterStatus
from ..utils.logger import get_logger

logger = get_logger(__name__)


class JupyterManager:
    """Jupyter Notebook/Lab 管理器"""

    def __init__(self, config: JupyterConfig):
        self.config = config
        self.process: Optional[subprocess.Popen] = None
        self.managed_pid: Optional[int] = None
        self.start_time: Optional[float] = None
        self.auto_restart = config.auto_restart
        self.check_interval = config.check_interval / 1000  # 转换为秒
        self.max_restarts = config.max_restarts
        self.restart_count = 0
        self.protection_thread: Optional[threading.Thread] = None
        self._stop_event = threading.Event()

        logger.info(f"JupyterManager initialized with config: port={config.port}")

    def start(self, **kwargs) -> Dict[str, Any]:
        """启动 Jupyter Notebook/Lab"""
        logger.info("Starting Jupyter...")

        # 合并配置参数
        merged_config = self._merge_config(**kwargs)

        # 验证配置
        valid, errors = merged_config.validate()
        if not valid:
            logger.error(f"Configuration validation failed: {errors}")
            return {
                "success": False,
                "message": f"配置验证失败: {', '.join(errors)}",
                "errors": errors
            }

        # 检查是否已在运行
        if self.is_running():
            logger.info("Jupyter is already running, stopping first...")
            self.stop()

        try:
            # 验证环境和路径
            if not self._validate_environment(merged_config):
                return {
                    "success": False,
                    "message": "环境验证失败"
                }

            # 启动进程
            result = self._start_process(merged_config)
            if result["success"]:
                self.config = merged_config
                logger.info(f"Jupyter started successfully: PID={result['pid']}, URL={result['url']}")
                return result
            else:
                return result

        except Exception as e:
            logger.exception("Failed to start Jupyter")
            return {
                "success": False,
                "message": f"启动失败: {str(e)}"
            }

    def stop(self) -> Dict[str, Any]:
        """停止 Jupyter"""
        logger.info("Stopping Jupyter...")

        try:
            # 停止进程保护
            self._stop_protection()

            # 停止 Jupyter 进程
            success = self._stop_process()

            # 清理状态
            self._cleanup()

            if success:
                logger.info("Jupyter stopped successfully")
                return {
                    "success": True,
                    "message": "Jupyter 已停止"
                }
            else:
                logger.warning("Jupyter process was not running")
                return {
                    "success": True,
                    "message": "Jupyter 未运行"
                }

        except Exception as e:
            logger.exception("Failed to stop Jupyter")
            return {
                "success": False,
                "message": f"停止失败: {str(e)}"
            }

    def restart(self, **kwargs) -> Dict[str, Any]:
        """重启 Jupyter"""
        logger.info("Restarting Jupyter...")

        # 先停止
        stop_result = self.stop()
        if not stop_result["success"]:
            logger.warning("Failed to stop before restart, continuing anyway...")

        # 等待一段时间
        time.sleep(2)

        # 重新启动
        return self.start(**kwargs)

    def get_status(self) -> JupyterStatus:
        """获取运行状态"""
        running = self.is_running()
        uptime = 0

        if running and self.start_time:
            uptime = int(time.time() - self.start_time)

        status = JupyterStatus(
            running=running,
            port=self.config.port if running else None,
            pid=self.managed_pid,
            url=self._get_jupyter_url() if running else None,
            uptime=uptime,
            auto_restart=self.auto_restart,
            process_protection="enabled" if self._is_protection_running() else "disabled"
        )

        logger.debug(f"Jupyter status: running={running}, pid={status.pid}, uptime={uptime}")
        return status

    def is_running(self) -> bool:
        """检查 Jupyter 是否在运行"""
        if self.managed_pid:
            try:
                # 检查进程是否存在
                os.kill(self.managed_pid, 0)  # 发送信号0，不杀死进程，只检查是否存在
                return True
            except OSError:
                logger.debug(f"Process {self.managed_pid} is no longer running")
                self.managed_pid = None
                self.process = None
                self.start_time = None
                return False

        # 检查内部进程对象
        if self.process and hasattr(self.process, 'poll') and self.process.poll() is None:
            return True

        # 检查端口是否被占用
        return self._is_port_occupied()

    def _merge_config(self, **kwargs) -> JupyterConfig:
        """合并启动参数"""
        # 从当前配置创建新配置
        config_dict = self.config.to_dict()

        # 更新传入的参数
        for key, value in kwargs.items():
            if hasattr(self.config, key):
                config_dict[key] = value

        return JupyterConfig.from_dict(config_dict)

    def _validate_environment(self, config: JupyterConfig) -> bool:
        """验证运行环境"""
        logger.debug("Validating environment...")

        # 检查 Python 解释器
        if config.python_executable:
            python_path = Path(config.python_executable)
            if not python_path.exists():
                logger.error(f"Python executable not found: {config.python_executable}")
                return False

            # 测试 Python 是否可用
            try:
                test_result = subprocess.run(
                    [str(python_path), "-c", "import sys; print('OK')"],
                    capture_output=True,
                    timeout=5
                )
                if test_result.returncode != 0:
                    logger.error(f"Python executable test failed: {test_result.stderr.decode()}")
                    return False
            except Exception as e:
                logger.error(f"Python executable test error: {e}")
                return False

        # 检查项目目录
        if config.project_dir:
            project_path = Path(config.project_dir)
            if not project_path.exists():
                logger.error(f"Project directory not found: {config.project_dir}")
                return False

            if not project_path.is_dir():
                logger.error(f"Project path is not a directory: {config.project_dir}")
                return False

        logger.debug("Environment validation passed")
        return True

    def _start_process(self, config: JupyterConfig) -> Dict[str, Any]:
        """启动 Jupyter 进程"""
        logger.debug("Starting Jupyter process...")

        try:
            # 构建命令
            cmd = self._build_command(config)
            logger.debug(f"Command: {' '.join(cmd)}")

            # 设置环境变量
            env = self._prepare_environment(config)

            # 启动进程
            self.process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                cwd=config.project_dir or Path.cwd(),
                env=env
            )

            self.managed_pid = self.process.pid
            self.start_time = time.time()
            self.restart_count = 0

            logger.info(f"Jupyter process started: PID={self.managed_pid}")

            # 等待启动
            if self._wait_for_startup():
                # 启动进程保护
                if self.auto_restart:
                    self._start_protection()

                return {
                    "success": True,
                    "message": f"Jupyter {config.project_dir if config.use_notebook else 'Lab'} 已启动",
                    "port": config.port,
                    "url": self._get_jupyter_url(),
                    "pid": self.managed_pid,
                    "auto_restart": self.auto_restart
                }
            else:
                # 启动失败，清理进程
                self._stop_process()
                return {
                    "success": False,
                    "message": "Jupyter 启动超时或失败"
                }

        except Exception as e:
            logger.exception("Failed to start Jupyter process")
            return {
                "success": False,
                "message": f"进程启动失败: {str(e)}"
            }

    def _build_command(self, config: JupyterConfig) -> list[str]:
        """构建启动命令"""
        python_exe = config.python_executable or sys.executable
        module_name = "notebook" if config.use_notebook else "jupyterlab"

        cmd = [
            python_exe, "-m", module_name,
            f"--port={config.port}",
            "--no-browser",
            "--allow-root",
            f"--ServerApp.notebook_dir={config.project_dir or Path.cwd()}",
            "--ServerApp.token=''",
            "--ServerApp.password=''",
            "--ServerApp.disable_check_xsrf=True",
            "--ServerApp.allow_origin='*'",
            "--ServerApp.ip='0.0.0.0'"
        ]

        # 添加额外参数
        if config.args:
            cmd.extend(config.args.split())

        if config.debug:
            cmd.append("--debug")

        return cmd

    def _prepare_environment(self, config: JupyterConfig) -> dict:
        """准备环境变量"""
        env = os.environ.copy()

        # 添加自定义环境变量
        if config.env:
            env.update(config.env)

        # 添加 Jupyter 相关的环境变量
        env['JUPYTER_ENABLE_LAB'] = 'yes' if not config.use_notebook else 'no'

        return env

    def _wait_for_startup(self, timeout: int = 30) -> bool:
        """等待 Jupyter 启动"""
        logger.debug("Waiting for Jupyter to start...")

        start_time = time.time()
        while time.time() - start_time < timeout:
            if self.is_running():
                # 检查是否有错误输出
                if self.process and self.process.stderr:
                    try:
                        stderr_output = self.process.stderr.read(1000)
                        if stderr_output and any(keyword in stderr_output.lower() for keyword in ['error:', 'exception', 'traceback']):
                            logger.error(f"Jupyter startup error: {stderr_output}")
                            return False
                    except:
                        pass

                logger.debug("Jupyter appears to be running")
                return True

            time.sleep(1)

        logger.warning(f"Jupyter startup timeout after {timeout} seconds")
        return False

    def _stop_process(self) -> bool:
        """停止 Jupyter 进程"""
        if not self.managed_pid and not self.process:
            return False

        try:
            if self.process:
                logger.debug(f"Terminating process: {self.process.pid}")
                if platform.system() == "Windows":
                    self.process.terminate()
                else:
                    self.process.terminate()

                # 等待进程结束
                try:
                    self.process.wait(timeout=5)
                    logger.debug("Process terminated gracefully")
                except subprocess.TimeoutExpired:
                    logger.debug("Process timeout, force killing")
                    if platform.system() == "Windows":
                        self.process.kill()
                    else:
                        self.process.kill()

            elif self.managed_pid:
                logger.debug(f"Killing process by PID: {self.managed_pid}")
                if platform.system() == "Windows":
                    os.kill(self.managed_pid, signal.SIGTERM)
                else:
                    os.kill(self.managed_pid, signal.SIGTERM)

                # 等待一下看是否退出
                time.sleep(2)

                # 检查进程是否还在，如果还在就强制杀死
                try:
                    os.kill(self.managed_pid, 0)
                    logger.debug("Process still running, force killing")
                    if platform.system() == "Windows":
                        os.kill(self.managed_pid, signal.SIGKILL)
                    else:
                        os.kill(self.managed_pid, signal.SIGKILL)
                except OSError:
                    logger.debug("Process has exited")

            return True

        except Exception as e:
            logger.exception(f"Failed to stop process: {e}")
            return False

    def _cleanup(self):
        """清理状态"""
        self.process = None
        self.managed_pid = None
        self.start_time = None
        self.restart_count = 0

    def _is_port_occupied(self) -> bool:
        """检查端口是否被占用"""
        try:
            import socket
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            result = sock.connect_ex(('127.0.0.1', self.config.port))
            sock.close()
            return result == 0
        except Exception as e:
            logger.debug(f"Port check error: {e}")
            return False

    def _get_jupyter_url(self) -> str:
        """获取 Jupyter URL"""
        suffix = "/tree" if self.config.use_notebook else "/lab"
        return f"http://localhost:{self.config.port}{suffix}"

    def _start_protection(self):
        """启动进程保护线程"""
        if self._is_protection_running():
            return

        self._stop_event.clear()
        self.protection_thread = threading.Thread(target=self._process_protection, daemon=True)
        self.protection_thread.start()
        logger.info("Process protection thread started")

    def _stop_protection(self):
        """停止进程保护"""
        self._stop_event.set()
        if self.protection_thread and self.protection_thread.is_alive():
            self.protection_thread.join(timeout=5)
        logger.info("Process protection thread stopped")

    def _is_protection_running(self) -> bool:
        """检查进程保护是否在运行"""
        return self.protection_thread and self.protection_thread.is_alive()

    def _process_protection(self):
        """进程保护线程"""
        logger.info(f"Process protection started - check interval: {self.check_interval}s, max restarts: {self.max_restarts}")

        while not self._stop_event.is_set() and self.is_running():
            try:
                self._stop_event.wait(self.check_interval)

                if self._stop_event.is_set():
                    break

                if not self.is_running():
                    if self.restart_count < self.max_restarts:
                        self.restart_count += 1
                        logger.warning(f"Jupyter process died, attempting restart {self.restart_count}/{self.max_restarts}")

                        # 等待一段时间后重启
                        time.sleep(self.check_interval)

                        result = self.start()
                        if not result["success"]:
                            logger.error(f"Failed to restart Jupyter: {result.get('message')}")
                    else:
                        logger.error(f"Maximum restart count ({self.max_restarts}) reached, stopping auto-restart")
                        break

            except Exception as e:
                logger.exception(f"Process protection error: {e}")
                time.sleep(self.check_interval)

        logger.info("Process protection thread exited")