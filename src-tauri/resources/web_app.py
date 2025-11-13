#!/usr/bin/env python3
"""
Jupyter Lab 管理 API 服务器
提供 Jupyter Lab 启动、停止、状态查询的 REST API
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import subprocess
import json
import os
import sys
import platform
from pathlib import Path
import signal
import time
import base64

# SSL 修复：在导入其他模块前设置环境变量
os.environ['PYTHONNOUSERSITE'] = '1'
dlls_path = str(Path(__file__).parent / 'XEdu' / 'env' / 'DLLs')
if os.path.exists(dlls_path):
    os.environ['PATH'] = dlls_path + os.pathsep + os.environ.get('PATH', '')

app = Flask(__name__)
app.config['DEBUG'] = True
CORS(app, resources={r"/*": {"origins": "*"}})

# 配置
API_PORT = 5000
JUPYTER_DEFAULT_PORT = 8888
config_file = Path(__file__).parent / "config.json"

# 加载配置
def load_config():
    """加载配置"""
    if config_file.exists():
        with open(config_file, 'r', encoding='utf-8') as f:
            return json.load(f)
    # 默认使用 venv 中的 Python（使用绝对路径）
    venv_python = (Path(__file__).parent / "venv" / "Scripts" / "python.exe").resolve()
    return {
        'python_executable': str(venv_python),
        'jupyter_port': JUPYTER_DEFAULT_PORT,
        'project_dir': ".",
        'use_notebook': False
    }

# 保存配置
def save_config_func(config):
    """保存配置"""
    with open(config_file, 'w', encoding='utf-8') as f:
        json.dump(config, f, indent=2, ensure_ascii=False)

# 全局配置
CONFIG = load_config()


class JupyterManager:
    """Jupyter Notebook 进程管理器"""

    def __init__(self):
        self.process = None
        self.port = JUPYTER_DEFAULT_PORT
        self.start_time = None
        # 优先使用配置的 Python，否则使用当前 Python
        self.python_executable = CONFIG.get('python_executable', sys.executable)
        self.project_dir = CONFIG.get('project_dir', str(Path.cwd()))
        self.use_notebook = CONFIG.get('use_notebook', False)  # 默认为 lab
        self.auto_restart = True  # 进程保护开关
        self.check_interval = 5   # 检查间隔（秒）
        self.max_restarts = 3     # 最大重启次数
        self.restart_count = 0    # 当前重启次数
        self.open_file = None     # 默认不自动打开文件

    def start(self, port=None, python_executable=None, project_dir=None, use_notebook=None, open_file=None):
        """启动 Jupyter Notebook（默认）或 Lab"""
        print(f"\n[DEBUG] JupyterManager.start() 被调用")
        print(f"   参数 - port: {port}, python_executable: {python_executable}, project_dir: {project_dir}, use_notebook: {use_notebook}")

        if self.is_running():
            print("[ERROR] Jupyter 已在运行中")
            return {"success": False, "message": "Jupyter 已在运行中"}

        try:
            # 使用传入的参数或配置
            self.port = port or self.port
            self.python_executable = python_executable or self.python_executable
            self.project_dir = project_dir or self.project_dir
            self.open_file = open_file

            # 默认为 lab 模式（优先使用配置中的值，然后是参数，最后是默认值 False）
            if use_notebook is None:
                use_notebook = CONFIG.get('use_notebook', False)
            self.use_notebook = use_notebook

            print(f"[DEBUG] 使用配置:")
            print(f"   端口: {self.port}")
            print(f"   Python: {self.python_executable}")
            print(f"   项目目录(原始): {self.project_dir}")
            print(f"   模式: {'Notebook (默认)' if self.use_notebook else 'Lab'}")

            # 验证 Python 解释器路径
            if not Path(self.python_executable).exists():
                print(f"[ERROR] Python 解释器不存在: {self.python_executable}")
                return {"success": False, "message": f"Python 解释器不存在: {self.python_executable}"}

            print(f"[OK] Python 解释器存在: {self.python_executable}")

            # 验证项目目录
            project_path = Path(self.project_dir).expanduser()
            if not project_path.exists():
                print(f"[ERROR] 项目目录不存在: {self.project_dir}")
                return {"success": False, "message": f"项目目录不存在: {self.project_dir}"}

            if not project_path.is_dir():
                print(f"[ERROR] 指定路径不是文件夹: {self.project_dir}")
                return {"success": False, "message": f"指定路径不是文件夹: {self.project_dir}"}

            self.project_dir = str(project_path.resolve())
            print(f"[OK] 项目目录存在: {self.project_dir}")

            # 如果需要自动打开具体文件，验证并记录
            if self.open_file:
                requested_file = Path(self.open_file).expanduser()
                if not requested_file.exists() or not requested_file.is_file():
                    print(f"[WARN] 指定的文件不存在或不可用: {self.open_file}")
                    self.open_file = None
                else:
                    self.open_file = str(requested_file.resolve())
                    print(f"[INFO] 启动后将自动打开文件: {self.open_file}")

            # 选择启动方式
            if use_notebook:
                module_name = "notebook"
                app_name = "Notebook"
            else:
                module_name = "jupyterlab"
                app_name = "Lab"

            # 直接使用配置的 Python 解释器（C:\XEdu\env\python.exe）
            python_executables = [
                self.python_executable
            ]

            last_error = None
            for py_exe in python_executables:
                if Path(py_exe).exists():
                    print(f"[INFO] 尝试使用 Python: {py_exe}")
                    # 尝试运行
                    try:
                        test_result = subprocess.run(
                            [py_exe, "-c", "import ssl; print('OK')"],
                            capture_output=True,
                            timeout=5
                        )
                        if test_result.returncode == 0:
                            print(f"[OK] Python {py_exe} SSL 工作正常")
                            self.python_executable = py_exe
                            break
                        else:
                            print(f"[WARN] Python {py_exe} SSL 有问题，但仍继续使用")
                            self.python_executable = py_exe
                            break  # 即使 SSL 有问题也使用
                    except Exception as e:
                        print(f"[WARN] 无法测试 Python {py_exe}: {e}")
                        last_error = e
                        # 即使测试失败也尝试使用
                        self.python_executable = py_exe
                        break
            else:
                print(f"[ERROR] 没有找到可用的 Python 解释器")
                return {"success": False, "message": f"没有可用的 Python 解释器，最后错误: {str(last_error)}"}

            # 使用找到的 Python 启动
            cmd = [
                self.python_executable, "-m", module_name,
                f"--ServerApp.port={self.port}",
                "--ServerApp.open_browser=False",
                "--ServerApp.allow_origin='*'",
                "--ServerApp.disable_check_xsrf=True",
                "--ServerApp.token=''",
                "--ServerApp.password=''",
                f"--ServerApp.root_dir={self.project_dir}",
            ]

            if self.open_file:
                try:
                    project_path = Path(self.project_dir)
                    rel_path = Path(self.open_file).relative_to(project_path)
                    rel_url = rel_path.as_posix()
                    url_prefix = "/tree" if self.use_notebook else "/lab/tree"
                    default_url = f"{url_prefix}/{rel_url}"
                    cmd.append(f"--ServerApp.default_url={default_url}")
                    print(f"[INFO] 默认打开路径: {default_url}")
                except ValueError:
                    print(f"[WARN] 指定文件不在项目目录内，忽略: {self.open_file}")
                    self.open_file = None

            print(f"[DEBUG] 执行命令: {' '.join(cmd)}")
            print(f"   工作目录: {self.project_dir}")

            # 确保子进程能访问 DLL 和用户 site-packages
            env = os.environ.copy()

            # 添加用户 site-packages 路径
            user_site_packages = str(Path.home() / 'AppData' / 'Roaming' / 'Python' / f'Python{sys.version_info.major}{sys.version_info.minor}' / 'site-packages')
            if os.path.exists(user_site_packages):
                env['PYTHONPATH'] = user_site_packages + os.pathsep + env.get('PYTHONPATH', '')
                print(f"[DEBUG] 添加 PYTHONPATH: {user_site_packages}")

            # 添加 XEdu DLL 路径
            dlls_path = str(Path(__file__).parent / 'XEdu' / 'env' / 'DLLs')
            if os.path.exists(dlls_path):
                env['PATH'] = dlls_path + os.pathsep + env.get('PATH', '')
                print(f"[DEBUG] 添加 PATH: {dlls_path}")

            self.process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                cwd=self.project_dir,
                env=env
            )

            print(f"[DEBUG] 进程已启动，PID: {self.process.pid}")

            # 等待启动并检查错误
            print("[DEBUG] 等待启动...")
            time.sleep(5)

            # 检查早期错误输出（只检查真正的错误，不包括警告）
            if self.process.stderr:
                error_output = self.process.stderr.read(2000)
                if error_output:
                    # 检查是否包含真正的错误关键词，而不是警告
                    error_lower = error_output.lower()
                    if any(keyword in error_lower for keyword in ['error:', 'exception', 'traceback', 'failed', 'fatal']):
                        print(f"[ERROR] 检测到错误输出:")
                        print(error_output)
                        self.process.terminate()
                        return {"success": False, "message": f"启动错误: {error_output[:500]}"}
                    else:
                        # 只是警告/信息，忽略
                        print(f"[DEBUG] 收到输出（可能是警告）: {error_output[:200]}")

            # 检查进程是否还在运行
            if not self.is_running():
                print("[ERROR] 启动失败，进程未正常运行")
                return {"success": False, "message": "启动失败"}
            print("[DEBUG] 等待启动完成...")
            time.sleep(8)

            if self.is_running():
                self.start_time = time.time()
                self.restart_count = 0  # 重置重启计数
                url_suffix = "/tree" if use_notebook else "/lab"
                print(f"[OK] Jupyter {app_name} 启动成功！")
                print(f"   URL: http://localhost:{self.port}{url_suffix}")
                print(f"   PID: {self.process.pid}")

                # 启动进程保护线程
                if self.auto_restart:
                    print(f"[INFO] 进程保护已启用，检查间隔: {self.check_interval}秒")
                    import threading
                    protection_thread = threading.Thread(target=self._process_protection, daemon=True)
                    protection_thread.start()

                return {
                    "success": True,
                    "message": f"Jupyter {app_name} 已启动",
                    "port": self.port,
                    "url": f"http://localhost:{self.port}{url_suffix}",
                    "pid": self.process.pid,
                    "auto_restart": self.auto_restart,
                    "open_file": self.open_file
                }
            else:
                print("[ERROR] 启动失败，进程未正常运行")
                return {"success": False, "message": "启动失败"}

        except Exception as e:
            print(f"[ERROR] 启动异常: {str(e)}")
            import traceback
            traceback.print_exc()
            return {"success": False, "message": f"启动异常: {str(e)}"}

    def stop(self):
        """停止 Jupyter Lab"""
        if not self.is_running():
            return {"success": False, "message": "Jupyter Lab 未运行"}

        try:
            if self.process:
                if platform.system() == "Windows":
                    self.process.terminate()
                else:
                    os.kill(self.process.pid, signal.SIGTERM)

                # 等待进程结束
                try:
                    self.process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    if platform.system() == "Windows":
                        self.process.kill()
                    else:
                        os.killpg(os.getpgid(self.process.pid), signal.SIGKILL)

            self.process = None
            self.start_time = None
            return {"success": True, "message": "Jupyter Lab 已停止"}

        except Exception as e:
            return {"success": False, "message": f"停止异常: {str(e)}"}

    def is_running(self):
        """检查 Jupyter Lab 是否在运行"""
        if not self.process:
            return False

        if self.process.poll() is None:
            return True

        self.process = None
        return False

    def _process_protection(self):
        """进程保护线程 - 监控并自动重启 Jupyter 进程"""
        print(f"[PROC-GUARD] 进程保护线程已启动，PID: {os.getpid()}")
        print(f"[PROC-GUARD] 检查间隔: {self.check_interval}秒")
        print(f"[PROC-GUARD] 最大重启次数: {self.max_restarts}")

        consecutive_failures = 0
        consecutive_successes = 0

        while self.auto_restart and self.is_running():
            try:
                time.sleep(self.check_interval)

                # 检查进程是否还在运行
                if not self.is_running():
                    consecutive_failures += 1
                    consecutive_successes = 0
                    print(f"\n[PROC-GUARD] ⚠️  检测到 Jupyter 进程异常退出 (失败次数: {consecutive_failures})")
                    print(f"[PROC-GUARD] 尝试自动重启... (第 {consecutive_failures} 次)")

                    # 检查重启次数限制
                    if self.restart_count >= self.max_restarts:
                        print(f"[PROC-GUARD] ❌ 已达到最大重启次数 ({self.max_restarts})，停止自动重启")
                        break

                    # 等待一段时间后尝试重启
                    print(f"[PROC-GUARD] 等待 {self.check_interval} 秒后重启...")
                    time.sleep(self.check_interval)

                    # 尝试重启
                    self.restart_count += 1
                    result = self.start(
                        port=self.port,
                        python_executable=self.python_executable,
                        project_dir=self.project_dir,
                        use_notebook=False,  # 使用 lab
                        open_file=self.open_file
                    )

                    if result.get("success"):
                        consecutive_failures = 0
                        consecutive_successes += 1
                        print(f"[PROC-GUARD] ✅ 重启成功！")
                        print(f"[PROC-GUARD] 成功次数: {consecutive_successes}, 失败次数: {consecutive_failures}")
                    else:
                        print(f"[PROC-GUARD] ❌ 重启失败: {result.get('message')}")

                else:
                    # 进程正常运行
                    consecutive_successes += 1
                    if consecutive_successes % 6 == 0:  # 每6次检查（约30秒）打印一次状态
                        print(f"[PROC-GUARD] ✓ Jupyter 进程运行正常 (已运行 {int((time.time() - self.start_time))} 秒)")

            except Exception as e:
                print(f"[PROC-GUARD] ❌ 进程保护异常: {str(e)}")
                import traceback
                traceback.print_exc()
                time.sleep(self.check_interval)

        print("[PROC-GUARD] 进程保护线程已退出")

    def get_status(self):
        """获取 Jupyter Notebook 状态"""
        # 判断当前是使用 notebook 还是 lab
        url_suffix = "/tree" if self.use_notebook else "/lab"
        return {
            "running": self.is_running(),
            "port": self.port,
            "url": f"http://localhost:{self.port}{url_suffix}" if self.is_running() else None,
            "pid": self.process.pid if self.process else None,
            "uptime": int(time.time() - self.start_time) if self.start_time and self.is_running() else 0,
            "auto_restart": self.auto_restart,
            "process_protection": "enabled" if self.auto_restart else "disabled",
            "open_file": self.open_file
        }


# 全局管理器实例
manager = JupyterManager()


# API 路由

@app.route('/api/health', methods=['GET'])
def health_check():
    """健康检查"""
    return jsonify({"status": "ok", "message": "Jupyter Lab API Server 运行正常"})


@app.route('/api/status', methods=['GET'])
def get_status():
    """获取 Jupyter Lab 状态"""
    status = manager.get_status()
    # 添加当前配置信息
    status['config'] = {
        'python_executable': manager.python_executable,
        'project_dir': manager.project_dir
    }
    return jsonify(status)


@app.route('/api/stop', methods=['POST'])
def stop_jupyter():
    """停止 Jupyter Lab"""
    result = manager.stop()
    return jsonify(result)


@app.route('/api/restart', methods=['POST'])
def restart_jupyter():
    """重启 Jupyter Lab"""
    data = request.get_json() or {}

    # 先停止
    manager.stop()
    time.sleep(2)

    # 重新启动（使用当前配置）
    result = manager.start()
    return jsonify(result)


@app.route('/api/detect_python', methods=['GET'])
def detect_python():
    """检测 Python 环境"""
    try:
        # 尝试导入 jupyterlab，绕过 SSL 问题
        try:
            import ssl
        except ImportError:
            # SSL 不工作，但这不应该影响 jupyterlab 检测
            pass

        import jupyterlab
        jupyterlab_version = jupyterlab.__version__
    except ImportError as e:
        jupyterlab_version = None
        print(f"JupyterLab import error: {e}")

    info = {
        "python_version": platform.python_version(),
        "python_executable": sys.executable,
        "platform": platform.platform(),
        "jupyterlab_installed": jupyterlab_version is not None,
        "jupyterlab_version": jupyterlab_version
    }

    if jupyterlab_version:
        return jsonify({
            "success": True,
            "message": "Python 环境检测成功",
            "info": info
        })
    else:
        return jsonify({
            "success": False,
            "message": "JupyterLab 未安装",
            "info": info
        })


@app.route('/api/save_config', methods=['POST'])
def save_config():
    """保存配置"""
    try:
        config = request.get_json()
        print(f"[DEBUG] 收到保存配置请求: {json.dumps(config, indent=2, ensure_ascii=False)}")

        # 验证配置
        if 'python_executable' in config:
            python_path = Path(config['python_executable'])
            print(f"[DEBUG] 验证Python路径: {config['python_executable']}")
            if not python_path.exists() or not python_path.is_file():
                print(f"[ERROR] Python路径无效: {config['python_executable']}")
                return jsonify({
                    "success": False,
                    "message": f"Python 解释器路径无效: {config['python_executable']}"
                })
            print(f"[OK] Python路径有效: {config['python_executable']}")

        if 'project_dir' in config:
            project_path = Path(config['project_dir'])
            print(f"[DEBUG] 验证项目目录: {config['project_dir']}")
            if not project_path.exists() or not project_path.is_dir():
                print(f"[ERROR] 项目目录无效: {config['project_dir']}")
                return jsonify({
                    "success": False,
                    "message": f"项目目录路径无效: {config['project_dir']}"
                })
            print(f"[OK] 项目目录有效: {config['project_dir']}")

        # 更新全局配置
        global CONFIG
        CONFIG.update(config)
        print(f"[DEBUG] 更新全局配置: {json.dumps(CONFIG, indent=2, ensure_ascii=False)}")
        save_config_func(CONFIG)

        # 更新管理器
        manager.python_executable = CONFIG.get('python_executable', sys.executable)
        manager.project_dir = CONFIG.get('project_dir', str(Path.cwd()))
        print(f"[DEBUG] 更新管理器 - Python: {manager.python_executable}")
        print(f"[DEBUG] 更新管理器 - 项目目录: {manager.project_dir}")

        print("[OK] 配置保存成功")
        return jsonify({
            "success": True,
            "message": "配置已保存",
            "config": CONFIG
        })

    except Exception as e:
        print(f"[ERROR] 保存配置异常: {str(e)}")
        return jsonify({
            "success": False,
            "message": f"保存配置失败: {str(e)}"
        })


@app.route('/api/load_config', methods=['GET'])
def load_config():
    """加载配置"""
    try:
        return jsonify({
            "success": True,
            "config": CONFIG
        })
    except Exception as e:
        return jsonify({
            "success": False,
            "message": f"加载配置失败: {str(e)}"
        })


@app.route('/api/ai/ask', methods=['POST'])
def ai_ask():
    """AI 助手 - Kimi 视觉模型"""
    try:
        data = request.get_json()
        print(f"[DEBUG] 收到AI请求")

        # 获取请求数据
        image_base64 = data.get('image')
        question = data.get('question')
        config = data.get('config', {})

        print(f"[DEBUG] 问题: {question}")
        print(f"[DEBUG] 配置: {json.dumps(config, ensure_ascii=False)}")

        # 验证必要参数
        if not image_base64:
            print("[ERROR] 缺少图片数据")
            return jsonify({
                "success": False,
                "message": "缺少图片数据"
            })

        if not question:
            print("[ERROR] 缺少问题")
            return jsonify({
                "success": False,
                "message": "缺少问题"
            })

        if not config.get('api_key'):
            print("[ERROR] 缺少API Key")
            return jsonify({
                "success": False,
                "message": "请先配置API Key"
            })

        # 获取配置
        api_key = config.get('api_key')
        base_url = config.get('base_url', 'https://api.moonshot.cn/v1')
        model = config.get('model', 'moonshot-v1-8k-vision-preview')

        print(f"[DEBUG] 使用配置:")
        print(f"   Base URL: {base_url}")
        print(f"   Model: {model}")
        print(f"   API Key: {api_key[:10]}...")

        # 检查是否需要data:前缀
        if not image_base64.startswith('data:'):
            image_base64 = f"data:image/jpeg;base64,{image_base64}"

        # 导入 OpenAI 客户端
        try:
            from openai import OpenAI
        except ImportError:
            print("[ERROR] OpenAI 客户端未安装")
            return jsonify({
                "success": False,
                "message": "OpenAI 客户端未安装，请运行: pip install openai"
            })

        # 创建客户端
        client = OpenAI(
            api_key=api_key,
            base_url=base_url
        )

        print("[DEBUG] 正在调用Kimi API...")

        # 调用Kimi API
        completion = client.chat.completions.create(
            model=model,
            messages=[
                {
                    "role": "system",
                    "content": "你是 Kimi，由 Moonshot AI 开发的 AI 助手。请用中文回答用户问题。"
                },
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": image_base64
                            }
                        },
                        {
                            "type": "text",
                            "text": question
                        }
                    ]
                }
            ]
        )

        # 获取回答
        answer = completion.choices[0].message.content

        print(f"[DEBUG] AI回答: {answer[:100]}...")

        return jsonify({
            "success": True,
            "answer": answer
        })

    except Exception as e:
        print(f"[ERROR] AI请求异常: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({
            "success": False,
            "message": f"AI请求失败: {str(e)}"
        })


@app.route('/api/start', methods=['POST'])
def start_jupyter():
    """启动 Jupyter Notebook（默认）"""
    try:
        data = request.get_json() or {}
        try:
            sys.stdout.write(f"[DEBUG] 收到启动请求: {json.dumps(data, indent=2, ensure_ascii=False)}\n")
            sys.stdout.flush()
        except Exception as print_err:
            try:
                sys.stdout.write(f"[DEBUG] 收到启动请求 (打印失败): {str(data)}\n")
                sys.stdout.flush()
            except:
                pass
    except Exception as e:
        try:
            sys.stdout.write(f"[ERROR] 解析JSON失败: {str(e)}\n")
            sys.stdout.flush()
        except:
            pass
        return jsonify({
            "success": False,
            "message": f"请求格式错误"
        })

    # 支持从请求中传入配置
    port = data.get('port', CONFIG.get('jupyter_port', JUPYTER_DEFAULT_PORT))
    python_executable = data.get('python_executable')
    requested_path = (
        data.get('project_dir')
        or data.get('work_dir')
        or data.get('root_dir')
        or data.get('target_path')
    )
    # 默认使用 lab 模式（而不是 notebook）
    use_notebook = data.get('use_notebook', False)

    # 调试：输出接收到的原始数据
    try:
        sys.stdout.write(f"[DEBUG] 接收到的原始请求数据:\n")
        sys.stdout.write(f"   {json.dumps(data, indent=2, ensure_ascii=False)}\n")
        sys.stdout.flush()
    except:
        pass

    # 将转义的双反斜杠转换回单反斜杠
    if python_executable:
        python_executable = python_executable.replace('\\\\', '\\').strip()

    resolved_project_dir = None
    file_to_open = None
    if requested_path:
        cleaned_path = requested_path.replace('\\\\', '\\').strip()
        if cleaned_path:
            path_obj = Path(cleaned_path)
            if not path_obj.exists():
                return jsonify({
                    "success": False,
                    "message": f"指定路径不存在: {cleaned_path}"
                })

            if path_obj.is_file():
                file_to_open = str(path_obj.resolve())
                resolved_project_dir = str(path_obj.parent.resolve())
            elif path_obj.is_dir():
                resolved_project_dir = str(path_obj.resolve())
            else:
                return jsonify({
                    "success": False,
                    "message": f"无法识别的路径类型: {cleaned_path}"
                })

    try:
        sys.stdout.write(f"[DEBUG] 启动参数:\n")
        sys.stdout.write(f"   端口: {port}\n")
        sys.stdout.write(f"   Python路径: {python_executable or '使用配置/默认: ' + manager.python_executable}\n")
        if resolved_project_dir:
            sys.stdout.write(f"   项目目录(请求): {resolved_project_dir}\n")
        else:
            sys.stdout.write(f"   项目目录: 使用配置/默认: {manager.project_dir}\n")
        if file_to_open:
            sys.stdout.write(f"   指定文件: {file_to_open}\n")
        sys.stdout.write(f"   模式: {'Notebook (默认)' if use_notebook else 'Lab'}\n")
        sys.stdout.flush()
    except:
        pass

    if python_executable:
        try:
            sys.stdout.write(f"[OK] 将使用自定义Python: {python_executable}\n")
            sys.stdout.flush()
        except:
            pass
    else:
        try:
            sys.stdout.write(f"[INFO] 未指定Python，使用管理器配置: {manager.python_executable}\n")
            sys.stdout.flush()
        except:
            pass

    if resolved_project_dir:
        try:
            sys.stdout.write(f"[OK] 将使用自定义项目目录: {resolved_project_dir}\n")
            sys.stdout.flush()
        except:
            pass
    else:
        try:
            sys.stdout.write(f"[INFO] 未指定项目目录，使用管理器配置: {manager.project_dir}\n")
            sys.stdout.flush()
        except:
            pass

    result = manager.start(
        port,
        python_executable,
        resolved_project_dir,
        use_notebook,
        file_to_open
    )
    try:
        sys.stdout.write(f"[DEBUG] 启动结果: {json.dumps(result, ensure_ascii=False)}\n")
        sys.stdout.flush()
    except:
        pass
    return jsonify(result)


@app.route('/', methods=['GET'])
def root():
    """根端点"""
    return jsonify({
        "name": "Jupyter Lab Web API Server",
        "version": "1.0.0",
        "status": "running",
        "endpoints": {
            "health": "GET /api/health",
            "status": "GET /api/status",
            "start": "POST /api/start",
            "stop": "POST /api/stop",
            "restart": "POST /api/restart",
            "detect_python": "GET /api/detect_python",
            "save_config": "POST /api/save_config",
            "load_config": "GET /api/load_config",
            "ai_ask": "POST /api/ai/ask"
        },
        "message": "API Server 运行正常"
    })


if __name__ == '__main__':
    print("=" * 60)
    print("Jupyter Lab Web API Server")
    print("=" * 60)
    print(f"Python 版本: {platform.python_version()}")
    print(f"平台: {platform.platform()}")
    print(f"API 端口: {API_PORT}")
    print(f"Jupyter 端口: {JUPYTER_DEFAULT_PORT}")
    print("=" * 60)

    # 检查依赖 - 支持Notebook作为JupyterLab的替代
    jupyter_available = False
    jupyter_version = None

    try:
        import jupyterlab
        jupyter_version = jupyterlab.__version__
        print(f"JupyterLab 版本: {jupyter_version}")
        jupyter_available = True
    except ImportError:
        print("警告: JupyterLab 导入失败，尝试使用 Jupyter Notebook...")
        try:
            import notebook
            jupyter_version = notebook.__version__
            print(f"Jupyter Notebook 版本: {jupyter_version}")
            jupyter_available = True
            print("注意: 将使用 Jupyter Notebook 替代 JupyterLab")
        except ImportError:
            print("错误: JupyterLab 和 Jupyter Notebook 都未安装!")
            print("请运行: pip install jupyterlab 或 pip install notebook")
            sys.exit(1)

    if not jupyter_available:
        print("错误: 没有可用的Jupyter环境!")
        sys.exit(1)

    # 打印路由
    print("\n已注册的路由:")
    for rule in app.url_map.iter_rules():
        print(f"  {rule.rule:30s} -> {rule.endpoint}")
    print("=" * 60)

    # 启动服务器
    app.run(host='0.0.0.0', port=API_PORT, debug=True)
