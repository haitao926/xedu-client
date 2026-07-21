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
import psutil
import socket
import importlib.util
from pathlib import Path
from typing import Optional, Dict, Any, Tuple

from models.config import JupyterConfig, JupyterStatus
from services.jupyter_environment import (
    build_jupyter_command,
    evaluate_environment_validation,
    merge_jupyter_config,
)
from utils.logger import get_logger

logger = get_logger(__name__)
_JUPYTER_MANAGER_ATEXIT_REGISTERED = False


class JupyterManager:
    """Jupyter Notebook/Lab 管理器"""

    def __init__(self, config: JupyterConfig):
        global _JUPYTER_MANAGER_ATEXIT_REGISTERED
        self.config = config
        self.process: Optional[subprocess.Popen] = None
        self.managed_pid: Optional[int] = None  # 我们启动的进程PID
        self.external_pid: Optional[int] = None  # 外部已有的Jupyter进程PID
        self.start_time: Optional[float] = None
        self.auto_restart = config.auto_restart
        self.check_interval = config.check_interval / 1000  # 转换为秒
        self.max_restarts = config.max_restarts
        self.restart_count = 0
        self.protection_thread: Optional[threading.Thread] = None
        self._stop_event = threading.Event()
        self._lock = threading.RLock()  # 序列化 start/stop/restart，避免 threaded=True 后的并发状态破坏
        self._manually_stopped = False  # 标记是否手动停止

        # 全局Jupyter进程跟踪
        self._all_jupyter_pids: set[int] = set()

        # 环境缓存机制
        self._env_cache = {
            'python_exe': None,
            'venv_valid': None,
            'project_dir_valid': None,
            'last_check': 0,
            'cache_duration': 300  # 缓存5分钟
        }
        self._last_environment_errors: tuple[str, ...] = ()

        # HTTP 探测失败计数，用于避免短暂波动引发误判重启
        self._http_failure_count = 0
        self._http_failure_threshold = 30
        self._log_handles: Dict[str, Any] = {}

        # 注册退出处理器。只注册一次，避免多次 create_app/test client 初始化时堆积清理回调。
        if not _JUPYTER_MANAGER_ATEXIT_REGISTERED:
            import atexit
            atexit.register(self.cleanup_all_jupyter_processes)
            _JUPYTER_MANAGER_ATEXIT_REGISTERED = True

        logger.info(f"JupyterManager initialized with config: port={config.port}")

    def start(self, **kwargs) -> Dict[str, Any]:
        """启动 Jupyter Notebook/Lab（线程安全，串行化并发请求）"""
        with self._lock:
            return self._start_impl(**kwargs)

    def _start_impl(self, **kwargs) -> Dict[str, Any]:
        logger.info("Starting Jupyter...")

        # 合并配置参数
        merged_config = self._merge_config(**kwargs)
        logger.info(f"DEBUG: merged_config.python_executable = {merged_config.python_executable}")

        # 验证配置
        valid, errors = merged_config.validate()
        if not valid:
            logger.error(f"Configuration validation failed: {errors}")
            return {
                "success": False,
                "message": f"配置验证失败: {', '.join(errors)}",
                "errors": errors
            }

        # 如果我们自己管理的进程已在运行
        if self.is_running():
            actual_port = self._get_actual_jupyter_port() or self.config.port or merged_config.port

            # 若用户更改了项目路径，先停止再按新目录重启
            current_dir = self.config.project_dir
            target_dir = merged_config.project_dir
            if current_dir and target_dir:
                try:
                    if Path(current_dir).resolve() != Path(target_dir).resolve():
                        logger.info("Project directory changed, restarting Jupyter with new directory")
                        self._stop_impl()
                    else:
                        return {
                            "success": True,
                            "message": "Jupyter 已在运行，直接挂载",
                            "port": actual_port,
                            "url": self._get_jupyter_url(actual_port),
                            "pid": self.managed_pid or self.external_pid,
                            "auto_restart": self.auto_restart,
                            "external": bool(self.external_pid and not self.managed_pid),
                        }
                except Exception:
                    # 如果路径解析异常，回退到重启
                    self._stop_impl()
            else:
                return {
                    "success": True,
                    "message": "Jupyter 已在运行，直接挂载",
                    "port": actual_port,
                    "url": self._get_jupyter_url(actual_port),
                    "pid": self.managed_pid or self.external_pid,
                    "auto_restart": self.auto_restart,
                    "external": bool(self.external_pid and not self.managed_pid),
                }

        # 跳过端口扫描外部实例，直接尝试启动

        # 端口占用直接报错，避免长时间扫描或误判外部实例
        if self._is_port_occupied(merged_config.port):
            # 尝试自动寻找可用端口
            logger.info(f"Port {merged_config.port} is occupied, searching for available port...")
            new_port = self._find_available_port(merged_config.port)
            
            if new_port:
                logger.info(f"Found available port: {new_port}, switching from {merged_config.port}")
                merged_config.port = new_port
            else:
                return {
                    "success": False,
                    "message": f"端口被占用: {merged_config.port}，且在 {merged_config.port}-{merged_config.port+20} 范围内未找到可用端口，请先释放或更换端口"
                }

        try:
            # 快速模式：如果最近启动过且环境没变，跳过详细验证
            is_recent_restart = (
                self.start_time and
                (time.time() - self.start_time) < 60 and  # 1分钟内
                self._env_cache['venv_valid'] is True
            )

            if is_recent_restart:
                logger.debug("Using fast restart mode - skipping full environment validation")
            else:
                if not self._validate_environment(merged_config):
                    return {
                        "success": False,
                        "message": self._last_environment_errors[0] if self._last_environment_errors else "环境验证失败",
                        "errors": list(self._last_environment_errors),
                        "error_code": "environment_not_ready",
                    }

            result = self._start_process(merged_config)
            if result["success"]:
                self.config = merged_config
                self._manually_stopped = False  # 清除手动停止标志

                # 快速重启时减少等待时间
                if is_recent_restart:
                    time.sleep(0.2)  # 快速重启时只等待200ms

                if self.auto_restart:
                    self._start_protection()

                logger.info(f"Jupyter started successfully: PID={result['pid']}, URL={result['url']}")
                return result
            return result

        except Exception as e:
            logger.exception("Failed to start Jupyter")
            return {
                "success": False,
                "message": f"启动失败: {str(e)}"
            }

    def stop(self) -> Dict[str, Any]:
        """停止 Jupyter（线程安全，串行化并发请求）"""
        with self._lock:
            return self._stop_impl()

    def _stop_impl(self) -> Dict[str, Any]:
        logger.info("Stopping Jupyter...")

        try:
            # 停止进程保护
            self._stop_protection()

            stopped_managed = False
            stopped_external = False

            # 停止我们管理的进程
            if self.managed_pid:
                logger.info(f"Stopping managed Jupyter process: PID {self.managed_pid}")
                stopped_managed = self._stop_process_by_pid(self.managed_pid)
                if stopped_managed:
                    self.managed_pid = None
                    logger.info(f"Successfully stopped managed process")

            # 如果是我们启动的外部进程，也停止它
            if self.external_pid:
                logger.info(f"Stopping external Jupyter process: PID {self.external_pid}")
                stopped_external = self._stop_process_by_pid(self.external_pid)
                if stopped_external:
                    self.external_pid = None
                    logger.info(f"Successfully stopped external process")

            # 快速等待端口释放（减少等待时间）
            if stopped_managed or stopped_external:
                logger.info("Waiting for ports to be released...")
                port_released = False

                # 更积极的端口检查，减少等待时间
                for i in range(10):  # 最多等待3秒，检查10次
                    time.sleep(0.3)  # 每300ms检查一次

                    # 检查我们管理的端口是否还被占用
                    if not self._is_port_occupied(self.config.port):
                        logger.info(f"Port {self.config.port} is now free after {(i+1)*0.3:.1f}s")
                        port_released = True
                        break

                    # 检查是否有我们的进程还在监听
                    if self.managed_pid or self.external_pid:
                        # 再次检查进程是否真的死了
                        if self.managed_pid and not self._is_process_running(self.managed_pid):
                            self.managed_pid = None
                        if self.external_pid and not self._is_process_running(self.external_pid):
                            self.external_pid = None
                        if not self.managed_pid and not self.external_pid:
                            break

                # 如果端口还没有释放，尝试强制释放
                if not port_released:
                    logger.warning(f"Port {self.config.port} still occupied, forcing cleanup...")
                    self._force_release_port(self.config.port)

            # 清理状态
            self._cleanup()
            self._manually_stopped = True  # 标记为手动停止

            if stopped_managed or stopped_external:
                logger.info("Jupyter stopped successfully")
                return {
                    "success": True,
                    "message": "Jupyter 已停止"
                }
            else:
                logger.warning("No Jupyter process was stopped")
                return {
                    "success": False,
                    "message": "未找到正在运行的 Jupyter 进程"
                }

        except Exception as e:
            logger.exception("Failed to stop Jupyter")
            return {
                "success": False,
                "message": f"停止失败: {str(e)}"
            }

    def restart(self, **kwargs) -> Dict[str, Any]:
        """重启 Jupyter（线程安全，串行化并发请求）"""
        with self._lock:
            logger.info("Restarting Jupyter...")

            # 先停止
            stop_result = self._stop_impl()
            if not stop_result["success"]:
                logger.warning("Failed to stop before restart, continuing anyway...")

            # 等待一段时间
            time.sleep(2)

            # 重新启动
            return self._start_impl(**kwargs)

    def get_status(self) -> JupyterStatus:
        """获取运行状态"""
        running = self.is_running()
        uptime = 0

        if running and self.start_time:
            uptime = int(time.time() - self.start_time)

        # 获取实际运行的端口
        actual_port = self._get_actual_jupyter_port() if running else None
        if not actual_port:
            actual_port = self.config.port

        # 确定当前PID（优先显示我们管理的PID）
        current_pid = self.managed_pid or self.external_pid

        status = JupyterStatus(
            running=running,
            port=actual_port if running else None,
            pid=current_pid,
            url=self._get_jupyter_url(actual_port) if running else None,
            uptime=uptime,
            auto_restart=self.auto_restart,
            process_protection="enabled" if self._is_protection_running() else "disabled",
            manually_stopped=self._manually_stopped
        )

        logger.debug(f"Jupyter status: running={running}, pid={status.pid}, port={actual_port}, uptime={uptime}")
        return status

    def is_running(self) -> bool:
        """检查 Jupyter 是否在运行（带重试机制）"""
        max_retries = 3
        retry_delay = 0.2  # 200ms

        # 如果手动停止了，不扫描外部进程
        if self._manually_stopped:
            logger.debug("Jupyter was manually stopped, not checking for external processes")
            return False

        for attempt in range(max_retries):
            try:
                # 首先检查我们管理的进程
                if self.managed_pid:
                    if self._is_process_running(self.managed_pid):
                        # 进一步验证是否是Jupyter进程
                        if self._is_jupyter_process(self.managed_pid):
                            logger.debug(f"Managed Jupyter process {self.managed_pid} is running")
                            return True
                        else:
                            logger.warning(f"Managed PID {self.managed_pid} is not a Jupyter process")
                            # 不立即清理，给点时间观察
                            if attempt == max_retries - 1:
                                self._cleanup()
                    else:
                        logger.debug(f"Managed process {self.managed_pid} is not running")
                        if attempt == max_retries - 1:
                            self._cleanup()

                # 检查外部进程
                if self.external_pid:
                    if self._is_process_running(self.external_pid):
                        if self._is_jupyter_process(self.external_pid):
                            logger.debug(f"External Jupyter process {self.external_pid} is running")
                            return True
                        else:
                            logger.warning(f"External PID {self.external_pid} is not a Jupyter process")
                            if attempt == max_retries - 1:
                                self.external_pid = None
                    else:
                        logger.debug(f"External process {self.external_pid} is not running")
                        if attempt == max_retries - 1:
                            self.external_pid = None

                # 如果没有已知PID，扫描查找Jupyter（但不是在手动停止后）
                # 只有当我们之前启动过Jupyter时才扫描外部进程
                if not self._manually_stopped and (self.managed_pid or self.external_pid):
                    actual_port = self._get_actual_jupyter_port()
                    if actual_port:
                        return True

                # 检查内部进程对象并验证端口可用性
                if self.process and hasattr(self.process, 'poll') and self.process.poll() is None:
                    if self._is_jupyter_process(self.process.pid):
                        return True

                return False

            except Exception as e:
                logger.debug(f"Error checking Jupyter status (attempt {attempt + 1}): {e}")
                if attempt < max_retries - 1:
                    time.sleep(retry_delay)

        return False

    def _is_process_running(self, pid: int) -> bool:
        """使用psutil检查进程是否存在"""
        try:
            return psutil.pid_exists(pid)
        except Exception as e:
            logger.debug(f"Error checking process {pid}: {e}")
            return False

    def _is_jupyter_process(self, pid: int) -> bool:
        """使用psutil检查进程是否是Jupyter，需验证端口可用性"""
        try:
            process = psutil.Process(pid)

            # 检查进程名
            if 'python' not in process.name().lower():
                return False

            # 检查命令行参数
            cmdline = process.cmdline()
            cmdline_str = ' '.join(cmdline).lower()
            if 'jupyter' in cmdline_str:
                return True

            # 优先通过监听端口验证服务可用性
            port = self._get_process_port(pid)
            if port:
                if self._verify_jupyter_on_port(port):
                    self._http_failure_count = 0
                    return True

                # 探测失败但端口仍然打开，给定宽限，避免短暂波动误判
                self._http_failure_count += 1
                if self._http_failure_count < self._http_failure_threshold and self._is_port_occupied(port):
                    logger.debug(f"HTTP check failed on port {port}, treating as alive (grace {self._http_failure_count}/{self._http_failure_threshold})")
                    return True
                return False

            # 命令行包含 jupyter 但未找到可用端口，继续做端口级校验

            # 检查是否在常用的Jupyter端口上监听
            try:
                for conn in process.connections():
                    if conn.status == 'LISTEN' and 8888 <= conn.laddr.port <= 8898:
                        # 验证端口上的服务
                        if self._verify_jupyter_on_port(conn.laddr.port):
                            self._http_failure_count = 0
                            return True
                        else:
                            self._http_failure_count += 1
                            if self._http_failure_count < self._http_failure_threshold:
                                logger.debug(f"Grace on port {conn.laddr.port} after verification failure ({self._http_failure_count}/{self._http_failure_threshold})")
                                return True
            except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
                pass

            return False
        except psutil.NoSuchProcess:
            return False
        except Exception as e:
            logger.debug(f"Error checking if process {pid} is Jupyter: {e}")
            return False

    def _verify_jupyter_on_port(self, port: int, timeout: float = 3.0) -> bool:
        """Quick TCP reachability check for the target port"""
        try:
            with socket.create_connection(("127.0.0.1", port), timeout=timeout):
                return True
        except Exception:
            return False

    def _find_external_jupyter(self) -> Optional[Dict[str, int]]:
        """查找外部启动的Jupyter进程"""
        try:
            # 扫描常用端口范围
            for port in range(8888, 8899):
                try:
                    # 检查端口是否被占用
                    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                    result = sock.connect_ex(('127.0.0.1', port))
                    sock.close()

                    if result == 0:
                        # 找到占用端口的进程
                        for proc in psutil.process_iter(['pid', 'name', 'cmdline']):
                            try:
                                cmdline = ' '.join(proc.cmdline()).lower()
                                if 'jupyter' in cmdline and proc.pid != self.managed_pid:
                                    # 验证是否是Jupyter服务
                                    if self._verify_jupyter_on_port(port):
                                        logger.info(f"Found external Jupyter: PID={proc.pid}, port={port}")
                                        return {
                                            'pid': proc.pid,
                                            'port': port
                                        }
                            except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
                                continue
                except (psutil.NoSuchProcess, psutil.AccessDenied):
                    pass
        except Exception as e:
            logger.debug(f"Error finding external Jupyter: {e}")

        return None

    def _find_available_port(self, start_port: int, max_tries: int = 20) -> Optional[int]:
        """寻找可用端口"""
        for port in range(start_port, start_port + max_tries):
            if not self._is_port_occupied(port):
                return port
        return None

    def _get_actual_jupyter_port(self) -> Optional[int]:
        """获取Jupyter实际运行的端口"""
        # 首先检查已知进程的端口
        if self.managed_pid:
            port = self._get_process_port(self.managed_pid)
            if port:
                return port

        if self.external_pid:
            port = self._get_process_port(self.external_pid)
            if port:
                return port

        # 优化：优先检查目标端口，然后缩小扫描范围
        target_port = self.config.port

        # 首先检查目标端口
        if self._is_port_occupied(target_port):
            if self._verify_jupyter_on_port(target_port):
                return target_port

        # 扫描更小的端口范围（目标端口前后各3个）
        start_port = max(8888, target_port - 3)
        end_port = min(8898, target_port + 3)

        for port in range(start_port, end_port + 1):
            if port == target_port:  # 已经检查过了
                continue

            try:
                if self._is_port_occupied(port):
                    # 快速验证是否是Jupyter
                    if self._verify_jupyter_on_port(port):
                        return port
            except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
                continue

        return None

    def _get_process_port(self, pid: int) -> Optional[int]:
        """获取进程监听的端口"""
        try:
            process = psutil.Process(pid)
            for conn in process.connections():
                if conn.status == 'LISTEN' and 8888 <= conn.laddr.port <= 8898:
                    return conn.laddr.port
        except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
            pass
        return None

    def _merge_config(self, **kwargs) -> JupyterConfig:
        """合并启动参数"""
        return merge_jupyter_config(self.config, kwargs)

    def _validate_environment(self, config: JupyterConfig) -> bool:
        """验证运行环境（带缓存优化）"""
        logger.debug("Validating environment...")
        current_time = time.time()

        validation_result = evaluate_environment_validation(
            config,
            current_time=current_time,
            cached_python_executable=self._env_cache['python_exe'],
            cached_venv_valid=self._env_cache['venv_valid'],
            cached_project_dir_valid=self._env_cache['project_dir_valid'],
            last_check=self._env_cache['last_check'],
            cache_duration=self._env_cache['cache_duration'],
            backend_python_executable=sys.executable,
        )

        if validation_result.used_cache:
            logger.debug("Using cached environment validation")
            self._last_environment_errors = ()
            return validation_result.is_valid

        if (
            not config.python_executable
            and not self._env_cache['python_exe']
            and validation_result.python_executable
        ):
            logger.info(f"Using backend Python: {validation_result.python_executable}")

        for error in validation_result.errors:
            logger.error(error)

        self._last_environment_errors = validation_result.errors

        self._env_cache.update({
            'python_exe': validation_result.python_executable,
            'venv_valid': validation_result.is_valid,
            'project_dir_valid': validation_result.project_dir_valid,
            'last_check': current_time
        })

        if validation_result.is_valid:
            logger.debug("Environment validation passed (cached)")
            return True

        logger.debug("Environment validation failed")
        return False

    def _start_process(self, config: JupyterConfig) -> Dict[str, Any]:
        """启动 Jupyter 进程"""
        logger.debug("Starting Jupyter process...")

        try:
            stdout_handle, stderr_handle = self._open_jupyter_logs()

            # 构建命令
            cmd = self._build_command(config)
            logger.debug(f"Command: {' '.join(cmd)}")

            # 设置环境变量
            env = self._prepare_environment(config)
            # 确保默认 python3 内核指向当前 Python，避免旧 kernelspec（如 C:\\aisoft\\XEdu\\env）导致模块缺失
            self._ensure_default_kernel(cmd[0], env)

            # 确定工作目录
            work_dir = config.project_dir or Path.cwd()
            work_path = Path(work_dir)
            if not work_path.exists():
                logger.warning(f"工作目录不存在: {work_dir}，使用当前目录")
                work_dir = Path.cwd()

            logger.info(f"启动 Jupyter 进程，工作目录: {work_dir}")
            logger.info(f"启动命令: {' '.join(cmd)}")

            # 启动进程 - 优化进程优先级
            try:
                # 在Windows上设置高优先级
                if platform.system() == "Windows":
                    creation_flags = subprocess.HIGH_PRIORITY_CLASS
                else:
                    creation_flags = 0

                self.process = subprocess.Popen(
                    cmd,
                    stdout=stdout_handle,
                    stderr=stderr_handle,
                    text=True,
                    cwd=str(work_dir),
                    env=env,
                    creationflags=creation_flags if platform.system() == "Windows" else 0
                )

                # 在Unix系统上设置进程优先级
                if platform.system() != "Windows":
                    try:
                        import os
                        os.nice(-5)  # 提高优先级
                    except (OSError, PermissionError):
                        pass
            except Exception as e:
                logger.warning(f"无法设置高优先级，使用默认优先级: {e}")
                # 回退到标准启动
                self.process = subprocess.Popen(
                    cmd,
                    stdout=stdout_handle,
                    stderr=stderr_handle,
                    text=True,
                    cwd=str(work_dir),
                    env=env
                )

            self.managed_pid = self.process.pid
            self._all_jupyter_pids.add(self.managed_pid)
            self.start_time = time.time()
            self.restart_count = 0

            logger.info(f"Jupyter process started: PID={self.managed_pid}")

            # 等待启动
            if self._wait_for_startup():
                # 获取实际运行的端口
                actual_port = self._get_actual_jupyter_port() or config.port

                return {
                    "success": True,
                    "message": f"Jupyter {config.project_dir if config.use_notebook else 'Lab'} 已启动",
                    "port": actual_port,
                    "url": self._get_jupyter_url(actual_port),
                    "pid": self.managed_pid,
                    "auto_restart": self.auto_restart,
                    "external": False
                }
            else:
                # 启动失败，清理进程
                self._stop_process()
                self._close_jupyter_logs()
                return {
                    "success": False,
                    "message": "Jupyter 启动超时或失败"
                }

        except Exception as e:
            self._close_jupyter_logs()
            logger.exception("Failed to start Jupyter process")
            return {
                "success": False,
                "message": f"进程启动失败: {str(e)}"
            }

    def _build_command(self, config: JupyterConfig) -> list[str]:
        """构建启动命令"""
        return build_jupyter_command(
            config,
            backend_python_executable=sys.executable,
            project_root=Path(__file__).parent.parent.parent,
        )

    def _prepare_environment(self, config: JupyterConfig) -> dict:
        """准备环境变量"""
        env = os.environ.copy()

        # 如果配置指向标准虚拟环境，设置必要的环境变量。
        if config.python_executable:
            executable_path = Path(config.python_executable)
            scripts_path = executable_path.parent
            venv_root = scripts_path.parent if scripts_path.name.lower() in {"scripts", "bin"} else None
            if not venv_root or not (venv_root / "pyvenv.cfg").is_file():
                venv_root = None

            if venv_root:
                logger.info(f"使用虚拟环境 Python: {scripts_path}")
                env['VIRTUAL_ENV'] = str(venv_root)
                env['PYTHONHOME'] = ''

                current_path = env.get('PATH', '')
                new_paths = [str(scripts_path), str(venv_root)]
                for p in new_paths:
                    if p not in current_path:
                        current_path = p + os.pathsep + current_path
                env['PATH'] = current_path

                logger.info(f"虚拟环境环境变量设置完成: VIRTUAL_ENV={venv_root}")

        # 如果配置了激活脚本（兼容旧配置）
        if not venv_root and config.activate_script:
            # 处理相对路径，使其基于项目根目录
            activate_script_path = Path(config.activate_script)
            if not activate_script_path.is_absolute():
                # 如果是相对路径，基于项目根目录解析
                project_root = Path(__file__).parent.parent.parent
                activate_script_path = project_root / config.activate_script

            if activate_script_path.exists():
                logger.info(f"激活虚拟环境: {activate_script_path}")
                venv_env = self._activate_virtual_environment(str(activate_script_path))
                if venv_env:
                    env.update(venv_env)
                    logger.info("虚拟环境激活成功")
                else:
                    logger.warning("虚拟环境激活失败，继续使用系统环境")
            else:
                logger.warning(f"激活脚本不存在: {activate_script_path}")

        # 添加自定义环境变量
        if config.env:
            env.update(config.env)

        # 统一语言环境，避免 JupyterLab 读取到 Windows 的非标准语言字符串（如 "Chinese (Simplified)_China"）导致语言包报错
        env["LANG"] = "en_US.UTF-8"
        env["LC_ALL"] = "en_US.UTF-8"
        env["LANGUAGE"] = "en"
        app_language = self._resolve_jupyter_locale()
        env["JUPYTER_CONFIG_DATA"] = json.dumps({"appLanguage": app_language})
        # 本地回环不走代理，避免健康检查被代理截断
        env["NO_PROXY"] = "127.0.0.1,localhost"
        # 让 Jupyter 优先使用当前环境的 kernelspec
        env["JUPYTER_PREFER_ENV_PATH"] = "1"

        # 添加 Jupyter 相关的环境变量
        env['JUPYTER_ENABLE_LAB'] = 'yes' if not config.use_notebook else 'no'
        # 显式关闭 token/密码，防止读取旧配置时重新生成
        env['JUPYTER_TOKEN'] = ''
        env['JUPYTER_PASSWORD'] = ''

        # 将配置/运行时目录固定到用户可写目录，避免继承用户主目录下的旧配置再次开启 token
        data_root = env.get('XEDU_DATA_DIR') or env.get('XEDU_LOG_DIR')
        if data_root:
            try:
                cfg_dir = Path(data_root) / "jupyter_config"
                runtime_dir = Path(data_root) / "jupyter_runtime"
                cfg_dir.mkdir(parents=True, exist_ok=True)
                runtime_dir.mkdir(parents=True, exist_ok=True)
                env['JUPYTER_CONFIG_DIR'] = str(cfg_dir)
                env['JUPYTER_RUNTIME_DIR'] = str(runtime_dir)
            except Exception as e:
                logger.warning(f"Failed to prepare Jupyter config/runtime dirs: {e}")

        return env

    def _ensure_default_kernel(self, python_exe: str, env: dict) -> None:
        """
        确保 python3 kernelspec 指向当前 Python，避免使用用户目录下的旧内核路径。
        """
        try:
            data_root = env.get('XEDU_DATA_DIR') or env.get('XEDU_LOG_DIR')
            if data_root:
                kernel_base = Path(data_root) / "jupyter_kernels"
            else:
                kernel_base = Path(os.environ.get("APPDATA", str(Path.home()))) / "jupyter" / "kernels"

            kernel_dir = kernel_base / "python3"
            if kernel_dir.exists():
                try:
                    for item in kernel_dir.iterdir():
                        if item.is_file():
                            item.unlink(missing_ok=True)
                except Exception:
                    pass
            kernel_dir.mkdir(parents=True, exist_ok=True)

            kernel_json = {
                "argv": [
                    str(Path(python_exe).resolve()),
                    "-m",
                    "ipykernel_launcher",
                    "-f",
                    "{connection_file}"
                ],
                "display_name": "Python 3 (bundled)",
                "language": "python",
                "metadata": {"debugger": True}
            }

            with open(kernel_dir / "kernel.json", "w", encoding="utf-8") as f:
                json.dump(kernel_json, f, ensure_ascii=False, indent=2)

            # 仅暴露自有 kernelspec，避免优先加载旧路径
            env['JUPYTER_PATH'] = str(kernel_base)
            logger.info(f"Kernelspec refreshed: {kernel_dir} -> {python_exe}")
        except Exception as e:
            logger.warning(f"Failed to refresh kernelspec: {e}")

    def _activate_virtual_environment(self, activate_script: str) -> Optional[Dict[str, str]]:
        """
        激活虚拟环境并返回环境变量

        Args:
            activate_script: 激活脚本路径

        Returns:
            Optional[Dict[str, str]]: 虚拟环境的环境变量，失败时返回None
        """
        try:
            script_path = Path(activate_script)
            if not script_path.exists():
                logger.error(f"激活脚本不存在: {activate_script}")
                return None

            # 检测脚本类型
            if script_path.suffix.lower() == '.bat':
                return self._activate_windows_venv(script_path)
            elif script_path.suffix.lower() == '.sh':
                return self._activate_unix_venv(script_path)
            else:
                logger.error(f"不支持的激活脚本类型: {script_path.suffix}")
                return None

        except Exception as e:
            logger.error(f"激活虚拟环境失败: {e}")
            return None

    def _activate_windows_venv(self, activate_script: Path) -> Optional[Dict[str, str]]:
        """激活Windows虚拟环境"""
        try:
            # 创建临时的批处理文件来捕获环境变量
            temp_bat = Path.cwd() / 'temp_activate_env.bat'

            # 写入批处理文件
            bat_content = f'''@echo off
call "{activate_script}"
set
'''
            with open(temp_bat, 'w', encoding='utf-8') as f:
                f.write(bat_content)

            # 执行批处理文件并捕获输出
            result = subprocess.run(
                [str(temp_bat)],
                capture_output=True,
                text=True,
                shell=True,
                cwd=Path.cwd()
            )

            # 清理临时文件
            try:
                temp_bat.unlink()
            except (OSError, FileNotFoundError):
                pass

            if result.returncode == 0:
                # 解析环境变量输出
                env_vars = {}
                for line in result.stdout.splitlines():
                    if '=' in line:
                        key, value = line.split('=', 1)
                        env_vars[key] = value

                logger.debug(f"Windows虚拟环境激活成功，捕获到 {len(env_vars)} 个环境变量")
                return env_vars
            else:
                logger.error(f"Windows虚拟环境激活失败: {result.stderr}")
                return None

        except Exception as e:
            logger.error(f"激活Windows虚拟环境异常: {e}")
            return None

    def _activate_unix_venv(self, activate_script: Path) -> Optional[Dict[str, str]]:
        """激活Unix/Linux虚拟环境"""
        try:
            # 使用source命令激活虚拟环境并导出环境变量
            shell_command = f'''
source "{activate_script}"
env
'''

            result = subprocess.run(
                shell_command,
                capture_output=True,
                text=True,
                shell=True,
                executable='/bin/bash',
                cwd=Path.cwd()
            )

            if result.returncode == 0:
                # 解析环境变量输出
                env_vars = {}
                for line in result.stdout.splitlines():
                    if '=' in line and not line.startswith('_'):
                        key, value = line.split('=', 1)
                        # 过滤一些不需要的环境变量
                        if not key.startswith(('BASH_', 'SHLVL', '_')):
                            env_vars[key] = value

                logger.debug(f"Unix虚拟环境激活成功，捕获到 {len(env_vars)} 个环境变量")
                return env_vars
            else:
                logger.error(f"Unix虚拟环境激活失败: {result.stderr}")
                return None

        except Exception as e:
            logger.error(f"激活Unix虚拟环境异常: {e}")
            return None

    def _wait_for_startup(self, timeout: int = 20) -> bool:
        """等待 Jupyter 启动"""
        logger.info(f"⏳ 等待 Jupyter 启动完成（最长等待 {timeout} 秒）...")

        start_time = time.time()
        last_progress_report = 0
        check_interval = 0.1  # 初始检查间隔100ms，逐渐增加
        max_check_interval = 1.0  # 最大检查间隔1秒

        progress_messages = [
            (2, "🔍 检查进程状态..."),
            (4, "📦 Jupyter 正在初始化..."),
            (8, "📚 加载 Jupyter 扩展..."),
            (12, "🔧 配置服务参数..."),
            (16, "⚡ 启动内核服务..."),
        ]

        while time.time() - start_time < timeout:
            elapsed = time.time() - start_time

            # 定期报告进度
            for progress_time, message in progress_messages:
                if elapsed >= progress_time and progress_time > last_progress_report:
                    logger.info(f"{message} ({elapsed:.1f}s)")
                    last_progress_report = progress_time

            # 检查进程是否还在
            if self.process:
                poll_result = self.process.poll()
                if poll_result is not None:
                    # 进程已经退出
                    logger.error(f"❌ Jupyter 进程意外退出，退出码: {poll_result}")

                    # 尝试读取错误输出
                    try:
                        stdout_data = self.process.stdout.read() if self.process.stdout else ""
                        stderr_data = self.process.stderr.read() if self.process.stderr else ""

                        if stdout_data:
                            logger.error(f"📄 Jupyter 输出: {stdout_data[:500]}")
                        if stderr_data:
                            logger.error(f"❌ Jupyter 错误: {stderr_data[:500]}")
                    except Exception as e:
                        logger.error(f"读取进程输出失败: {e}")

                    return False

            # 首先快速检查目标端口
            if self._is_port_occupied(self.config.port):
                # 验证是否是Jupyter服务
                if self._verify_jupyter_on_port(self.config.port):
                    logger.info(f"✅ Jupyter 启动成功！端口: {self.config.port}, 耗时: {elapsed:.1f}秒")
                    return True
                else:
                    logger.debug(f"端口 {self.config.port} 被占用，但不是Jupyter服务")

            # 如果目标端口不可用，再检查其他端口（范围缩小）
            if elapsed > 5:  # 5秒后才检查其他端口
                actual_port = self._get_actual_jupyter_port()
                if actual_port and actual_port != self.config.port:
                    logger.info(f"✅ Jupyter 启动成功！端口: {actual_port}, 耗时: {elapsed:.1f}秒")
                    return True

            # 动态调整检查间隔：开始频繁检查，后来减少频率
            time.sleep(check_interval)
            check_interval = min(check_interval * 1.1, max_check_interval)

        # 超时处理
        total_time = time.time() - start_time
        logger.error(f"⏰ Jupyter 启动超时！已等待 {total_time:.1f} 秒")

        # 快速最终检查
        if self.process and self.process.poll() is None:
            logger.warning("⚠️ 进程仍在运行，最后检查端口...")
            # 最后快速检查5秒
            for i in range(10):
                if self._is_port_occupied(self.config.port) and self._verify_jupyter_on_port(self.config.port):
                    logger.info(f"✅ Jupyter 最终启动成功！总耗时: {total_time + i * 0.5:.1f}秒")
                    return True
                time.sleep(0.5)

        return False

    def _stop_process(self) -> bool:
        """停止当前进程"""
        pid_to_stop = self.managed_pid or self.external_pid
        if not pid_to_stop:
            return False

        return self._stop_process_by_pid(pid_to_stop)

    def _stop_process_by_pid(self, pid: int) -> bool:
        """通过PID停止进程"""
        logger.info(f"Stopping process: PID {pid}")

        try:
            # 使用psutil停止进程（更可靠）
            try:
                process = psutil.Process(pid)

                # 获取所有子进程
                children = process.children(recursive=True)
                logger.info(f"Found {len(children)} child processes to stop")

                # 先优雅终止所有子进程
                for child in children:
                    try:
                        child.terminate()
                        logger.debug(f"Terminated child process: PID {child.pid}")
                    except (psutil.NoSuchProcess, psutil.AccessDenied):
                        pass

                # 优雅终止主进程
                process.terminate()
                logger.debug(f"Terminated main process: PID {pid}")

                # 等待进程结束（减少等待时间）
                try:
                    # 等待主进程结束
                    process.wait(timeout=3)
                    logger.debug(f"Process {pid} terminated gracefully")

                    # 确保所有子进程也结束
                    for child in children:
                        try:
                            child.wait(timeout=1)
                        except psutil.TimeoutExpired:
                            try:
                                child.kill()
                                logger.debug(f"Force killed child process: PID {child.pid}")
                            except (psutil.NoSuchProcess, psutil.AccessDenied):
                                pass

                except psutil.TimeoutExpired:
                    logger.warning(f"Process {pid} timeout, force killing all processes")
                    # 强制终止所有进程
                    for child in children:
                        try:
                            child.kill()
                        except (psutil.NoSuchProcess, psutil.AccessDenied):
                            pass
                    process.kill()

                # 额外清理：检查是否还有相关进程
                self._cleanup_related_processes(pid)
                self._all_jupyter_pids.discard(pid)

                return True

            except psutil.NoSuchProcess:
                logger.debug(f"Process {pid} no longer exists")
                self._all_jupyter_pids.discard(pid)
                return True

        except Exception as e:
            logger.exception(f"Failed to stop process {pid}: {e}")
            return False

    def _cleanup_related_processes(self, parent_pid: int):
        """清理可能相关的Jupyter进程"""
        try:
            # 仅清理 parent_pid 的子进程，避免误杀外部实例
            for proc in psutil.process_iter(['pid', 'name', 'cmdline', 'ppid']):
                try:
                    if proc.info['ppid'] == parent_pid:
                        logger.info(f"Found related process: PID {proc.pid}, terminating...")
                        proc.terminate()
                except (psutil.NoSuchProcess, psutil.AccessDenied):
                    continue
        except Exception as e:
            logger.debug(f"Error in cleanup_related_processes: {e}")

    def _force_release_port(self, port: int):
        """强制释放指定端口"""
        try:
            logger.info(f"Force releasing port {port}...")
            tracked = {self.managed_pid, self.external_pid} | set(self._all_jupyter_pids)
            tracked.discard(None)
            # 仅终止 tracked PID 对应进程
            for proc in psutil.process_iter(['pid', 'name', 'connections']):
                try:
                    for conn in proc.info['connections'] or []:
                        if conn.laddr.port == port and conn.status == 'LISTEN':
                            if proc.info['pid'] not in tracked:
                                logger.warning(
                                    f"Port {port} occupied by untracked PID {proc.info['pid']}, skip force kill"
                                )
                                continue
                            logger.info(f"Found process occupying port {port}: PID {proc.info['pid']}, terminating...")
                            proc.terminate()
                            # 等待一下让进程释放端口
                            time.sleep(0.5)
                except (psutil.NoSuchProcess, psutil.AccessDenied):
                    continue
        except Exception as e:
            logger.debug(f"Error force releasing port: {e}")

    def _open_jupyter_logs(self) -> Tuple[Any, Any]:
        # 优先写入用户可写目录：XEDU_LOG_DIR（main 传入 userData/logs）或 XEDU_DATA_DIR
        env_log_dir = os.environ.get("XEDU_LOG_DIR") or os.environ.get("XEDU_DATA_DIR")
        if env_log_dir:
            log_dir = Path(env_log_dir)
            # 如果传入的是 data 目录而非 logs 目录，补一个 logs
            if log_dir.name.lower() != "logs":
                log_dir = log_dir / "logs"
        else:
            log_dir = Path(__file__).parent.parent.parent / "logs"

        log_dir.mkdir(parents=True, exist_ok=True)
        stdout_path = log_dir / "jupyter_stdout.log"
        stderr_path = log_dir / "jupyter_stderr.log"
        stdout_handle = open(stdout_path, "a", encoding="utf-8", errors="replace")
        stderr_handle = open(stderr_path, "a", encoding="utf-8", errors="replace")
        self._log_handles = {"stdout": stdout_handle, "stderr": stderr_handle}
        return stdout_handle, stderr_handle

    def _close_jupyter_logs(self) -> None:
        for handle in self._log_handles.values():
            try:
                handle.close()
            except Exception:
                pass
        self._log_handles = {}

    def _cleanup(self):
        """清理状态"""
        self.process = None
        self.managed_pid = None
        self.external_pid = None
        self.start_time = None
        self.restart_count = 0
        self._close_jupyter_logs()

        # 注意：不要在这里设置 _manually_stopped，因为它应该在 stop() 中设置
        # 保留环境缓存以加速下次启动

    def clear_env_cache(self):
        """清除环境缓存（当环境发生变化时调用）"""
        self._env_cache = {
            'python_exe': None,
            'venv_valid': None,
            'project_dir_valid': None,
            'last_check': 0,
            'cache_duration': 300  # 缓存5分钟
        }
        self._last_environment_errors = ()
        logger.info("Environment cache cleared")

    def _is_port_occupied(self, port: int = None) -> bool:
        """检查端口是否被占用"""
        try:
            import socket
            check_port = port or self.config.port
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            result = sock.connect_ex(('127.0.0.1', check_port))
            sock.close()
            return result == 0
        except Exception as e:
            logger.debug(f"Port check error: {e}")
            return False

    def _get_jupyter_url(self, port: int = None) -> str:
        """获取 Jupyter URL"""
        suffix = "/tree" if self.config.use_notebook else "/lab"
        # 使用指定的端口或配置的端口
        actual_port = port or self.config.port
        locale = self._resolve_jupyter_locale()
        return f"http://localhost:{actual_port}{suffix}?locale={locale}"

    def _resolve_jupyter_locale(self) -> str:
        """Resolve locale for JupyterLab/Notebook UI."""
        env_locale = os.environ.get("XEDU_JUPYTER_LOCALE") or os.environ.get("JUPYTER_LOCALE")
        locale = (env_locale or "zh-CN").strip() or "en"

        if locale.lower().startswith("zh"):
            if importlib.util.find_spec("jupyterlab_language_pack_zh_CN") is None:
                logger.warning("未检测到中文语言包，回退到英文界面")
                return "en"
            return "zh-CN"

        return locale

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

        # 先等待一个检查周期，避免立即检查启动中的进程
        self._stop_event.wait(self.check_interval)

        while not self._stop_event.is_set():
            try:
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

                # 等待下一个检查周期
                self._stop_event.wait(self.check_interval)

            except Exception as e:
                logger.exception(f"Process protection error: {e}")
                time.sleep(self.check_interval)

        logger.info("Process protection thread exited")

    def cleanup_all_jupyter_processes(self):
        """清理所有由本管理器启动的Jupyter进程"""
        logger.info("清理所有由JupyterManager启动的进程...")

        # 停止进程保护
        self._stop_protection()

        # 清理所有跟踪的进程
        all_pids = {self.managed_pid, self.external_pid} | self._all_jupyter_pids
        all_pids.discard(None)

        for pid in all_pids:
            if pid:
                self._stop_process_by_pid(pid)

        # 清理状态
        self._cleanup()

        logger.info(f"已清理 {len(all_pids)} 个Jupyter进程")
