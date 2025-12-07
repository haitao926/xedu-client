#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
自动配置服务
提供安装后自动环境配置功能
"""

import os
import sys
import json
import subprocess
import shutil
from pathlib import Path
from typing import Dict, Any, Optional, List, Tuple
import tempfile

from models.config import AppConfig
from utils.logger import get_logger

logger = get_logger(__name__)


class AutoConfigService:
    """自动配置服务"""

    def __init__(self):
        self.detected_config = {}
        self.installation_errors = []

    def run_full_auto_config(self) -> Dict[str, Any]:
        """
        运行完整的自动配置流程

        Returns:
            Dict[str, Any]: 配置结果
        """
        logger.info("开始自动配置流程...")

        result = {
            'success': False,
            'python_detected': False,
            'dependencies_installed': False,
            'jupyter_configured': False,
            'virtual_env_created': False,
            'config_saved': False,
            'errors': [],
            'config': {}
        }

        try:
            # 步骤1: 检测Python环境
            python_info = self._detect_python_environment()
            if not python_info['found']:
                result['errors'].append("未找到有效的Python环境")
                return result

            result['python_detected'] = True
            result['config'].update(python_info)

            # 步骤2: 安装必要的依赖
            if self._install_dependencies(python_info['path']):
                result['dependencies_installed'] = True
            else:
                result['errors'].append("依赖安装失败")
                return result

            # 步骤3: 创建默认项目目录
            project_dir = self._create_default_project_directory()
            if project_dir:
                result['config']['project_dir'] = project_dir

            # 步骤4: 检测并配置虚拟环境
            venv_info = self._detect_virtual_environments()
            if venv_info:
                result['config'].update(venv_info)
                result['virtual_env_created'] = True

            # 步骤5: 配置Jupyter
            jupyter_config = self._configure_jupyter(python_info['path'])
            if jupyter_config:
                result['config'].update(jupyter_config)
                result['jupyter_configured'] = True

            # 步骤6: 保存配置
            if self._save_auto_config(result['config']):
                result['config_saved'] = True

            # 步骤7: 创建启动脚本
            self._create_launch_scripts(result['config'])

            result['success'] = True
            logger.info("自动配置流程完成")

        except Exception as e:
            logger.error(f"自动配置流程失败: {e}")
            result['errors'].append(f"配置过程异常: {str(e)}")

        return result

    def _detect_python_environment(self) -> Dict[str, Any]:
        """检测Python环境"""
        logger.info("检测Python环境...")

        candidates = []

        # 检查系统PATH中的Python
        for cmd in ['python', 'python3', 'py']:
            try:
                result = subprocess.run([cmd, '--version'],
                                      capture_output=True, text=True, timeout=5)
                if result.returncode == 0:
                    python_path = shutil.which(cmd)
                    version_info = result.stdout.strip()
                    candidates.append({
                        'path': python_path,
                        'version': version_info,
                        'type': 'system'
                    })
            except:
                continue

        # 检查常见安装位置
        common_paths = [
            r"C:\Python313\python.exe",
            r"C:\Python312\python.exe",
            r"C:\Python311\python.exe",
            r"C:\Python310\python.exe",
            r"C:\Program Files\Python313\python.exe",
            r"C:\Program Files\Python312\python.exe",
            r"C:\Program Files\Python311\python.exe",
            r"C:\Program Files\Python310\python.exe"
        ]

        for path in common_paths:
            if os.path.exists(path):
                try:
                    result = subprocess.run([path, '--version'],
                                          capture_output=True, text=True, timeout=5)
                    if result.returncode == 0:
                        candidates.append({
                            'path': path,
                            'version': result.stdout.strip(),
                            'type': 'installation'
                        })
                except:
                    continue

        # 选择最佳候选（优先选择安装版本，其次是系统版本）
        if candidates:
            # 优先选择版本较新的Python
            candidates.sort(key=lambda x: x['version'], reverse=True)
            best = candidates[0]

            logger.info(f"检测到Python: {best['version']} at {best['path']}")

            return {
                'found': True,
                'path': best['path'],
                'version': best['version'],
                'type': best['type']
            }

        return {'found': False}

    def _install_dependencies(self, python_path: str) -> bool:
        """安装依赖"""
        logger.info("安装依赖包...")

        required_packages = [
            'jupyter',
            'jupyterlab',
            'notebook',
            'ipykernel',
            'pip'
        ]

        try:
            # 升级pip
            self._run_python_command(python_path, ['-m', 'pip', 'install', '--upgrade', 'pip'])

            # 安装包
            for package in required_packages:
                logger.info(f"安装 {package}...")
                success = self._run_python_command(python_path, ['-m', 'pip', 'install', package])
                if not success:
                    logger.warning(f"安装 {package} 失败")
                else:
                    logger.info(f"安装 {package} 成功")

            return True

        except Exception as e:
            logger.error(f"安装依赖失败: {e}")
            return False

    def _run_python_command(self, python_path: str, args: List[str], timeout: int = 300) -> bool:
        """运行Python命令"""
        try:
            cmd = [python_path] + args
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
            return result.returncode == 0
        except subprocess.TimeoutExpired:
            logger.error(f"命令执行超时: {' '.join(cmd)}")
            return False
        except Exception as e:
            logger.error(f"命令执行失败: {e}")
            return False

    def _create_default_project_directory(self) -> Optional[str]:
        """创建默认项目目录"""
        try:
            # 在用户文档目录下创建XeduProjects目录
            if sys.platform == "win32":
                import winreg
                with winreg.OpenKey(winreg.HKEY_CURRENT_USER,
                                 r"Software\Microsoft\Windows\CurrentVersion\Explorer\Shell Folders") as key:
                    documents = winreg.QueryValueEx(key, "Personal")[0]
            else:
                documents = Path.home() / "Documents"

            project_dir = Path(documents) / "XeduProjects"
            project_dir.mkdir(parents=True, exist_ok=True)

            # 创建示例笔记本
            sample_notebook = project_dir / "Welcome.ipynb"
            if not sample_notebook.exists():
                self._create_sample_notebook(sample_notebook)

            logger.info(f"创建项目目录: {project_dir}")
            return str(project_dir)

        except Exception as e:
            logger.error(f"创建项目目录失败: {e}")
            return None

    def _create_sample_notebook(self, file_path: Path):
        """创建示例笔记本"""
        sample_notebook = {
            "cells": [
                {
                    "cell_type": "markdown",
                    "metadata": {},
                    "source": [
                        "# 欢迎使用 Xedu Client!\n",
                        "\n",
                        "这是您的第一个 Jupyter Notebook。开始探索数据分析、机器学习和科学计算吧！\n",
                        "\n",
                        "## 快速开始\n",
                        "\n",
                        "1. 在下面的单元格中输入 Python 代码\n",
                        "2. 按 `Shift + Enter` 运行代码\n",
                        "3. 点击工具栏中的 + 按钮添加新的单元格\n",
                        "\n",
                        "## 有用的链接\n",
                        "- [Jupyter文档](https://jupyter.org/documentation)\n",
                        "- [Python教程](https://docs.python.org/3/tutorial/)\n",
                        "- [NumPy文档](https://numpy.org/doc/)"
                    ]
                },
                {
                    "cell_type": "code",
                    "execution_count": None,
                    "metadata": {},
                    "outputs": [],
                    "source": [
                        "# 让我们开始吧！\n",
                        "import sys\n",
                        "import numpy as np\n",
                        "import pandas as pd\n",
                        "\n",
                        "print(f\"Python 版本: {sys.version}\")\n",
                        "print(f\"NumPy 版本: {np.__version__}\")\n",
                        "print(f\"Pandas 版本: {pd.__version__}\")\n",
                        "\n",
                        "# 创建一些示例数据\n",
                        "data = {\n",
                        "    'name': ['Alice', 'Bob', 'Charlie'],\n",
                        "    'age': [25, 30, 35],\n",
                        "    'city': ['Beijing', 'Shanghai', 'Guangzhou']\n",
                        "}\n",
                        "\n",
                        "df = pd.DataFrame(data)\n",
                        "print(\"\\n示例数据:\")\n",
                        "print(df)"
                    ]
                }
            ],
            "metadata": {
                "kernelspec": {
                    "display_name": "Python 3",
                    "language": "python",
                    "name": "python3"
                },
                "language_info": {
                    "name": "python",
                    "version": "3.x"
                }
            },
            "nbformat": 4,
            "nbformat_minor": 4
        }

        with open(file_path, 'w', encoding='utf-8') as f:
            json.dump(sample_notebook, f, indent=2, ensure_ascii=False)

    def _detect_virtual_environments(self) -> Optional[Dict[str, Any]]:
        """检测虚拟环境"""
        venv_dirs = [
            Path.cwd() / "venv",
            Path.cwd() / "env",
            Path.cwd() / ".venv",
            Path.home() / "venv"
        ]

        for venv_dir in venv_dirs:
            if venv_dir.exists():
                # 检测不同平台的激活脚本
                if sys.platform == "win32":
                    activate_script = venv_dir / "Scripts" / "activate.bat"
                    python_exe = venv_dir / "Scripts" / "python.exe"
                else:
                    activate_script = venv_dir / "bin" / "activate"
                    python_exe = venv_dir / "bin" / "python"

                if activate_script.exists() and python_exe.exists():
                    logger.info(f"检测到虚拟环境: {venv_dir}")
                    return {
                        'python_executable': str(python_exe),
                        'activate_script': str(activate_script),
                        'virtual_env_path': str(venv_dir)
                    }

        return None

    def _configure_jupyter(self, python_path: str) -> Dict[str, Any]:
        """配置Jupyter"""
        logger.info("配置Jupyter...")

        config = {
            'python_executable': python_path,
            'jupyter_port': 8888,
            'use_notebook': False,  # 默认使用JupyterLab
            'auto_restart': True,
            'check_interval': 2000,
            'max_restarts': 3
        }

        try:
            # 检查Jupyter是否正常工作
            result = subprocess.run([python_path, '-m', 'jupyter', '--version'],
                                  capture_output=True, text=True, timeout=10)
            if result.returncode == 0:
                logger.info(f"Jupyter已配置: {result.stdout.strip()}")
                return config
            else:
                logger.warning("Jupyter配置失败")
                return {}

        except Exception as e:
            logger.error(f"配置Jupyter时出错: {e}")
            return {}

    def _save_auto_config(self, config_data: Dict[str, Any]) -> bool:
        """保存自动配置"""
        try:
            from .config_service import get_config_service

            config_service = get_config_service()
            app_config = config_service.load_config()

            # 更新配置
            for key, value in config_data.items():
                if hasattr(app_config, key):
                    setattr(app_config, key, value)

            # 保存配置
            return config_service.save_config(app_config)

        except Exception as e:
            logger.error(f"保存自动配置失败: {e}")
            return False

    def _create_launch_scripts(self, config: Dict[str, Any]):
        """创建启动脚本"""
        try:
            if sys.platform == "win32":
                self._create_windows_launch_script(config)
            else:
                self._create_unix_launch_script(config)
        except Exception as e:
            logger.error(f"创建启动脚本失败: {e}")

    def _create_windows_launch_script(self, config: Dict[str, Any]):
        """创建Windows启动脚本"""
        script_content = f'''@echo off
echo Starting Xedu Client...
echo.

REM 设置Python路径
set PYTHON_PATH="{config.get('python_executable', 'python')}"

REM 激活虚拟环境（如果有）
if exist "{config.get('activate_script', '')}" (
    echo Activating virtual environment...
    call "{config.get('activate_script', '')}"
)

REM 启动后端API服务器
echo Starting backend API server...
cd /d "{os.getcwd()}"
%PYTHON_PATH% backend_api.py

pause
'''

        script_path = Path("start_xedu_client.bat")
        with open(script_path, 'w', encoding='utf-8') as f:
            f.write(script_content)

        logger.info(f"创建Windows启动脚本: {script_path}")

    def _create_unix_launch_script(self, config: Dict[str, Any]):
        """创建Unix/Linux/macOS启动脚本"""
        script_content = f'''#!/bin/bash

echo "Starting Xedu Client..."
echo

# 设置Python路径
PYTHON_PATH="{config.get('python_executable', 'python3')}"

# 激活虚拟环境（如果有）
if [ -f "{config.get('activate_script', '')}" ]; then
    echo "Activating virtual environment..."
    source "{config.get('activate_script', '')}"
fi

# 启动后端API服务器
echo "Starting backend API server..."
cd "$(dirname "$0")"
$PYTHON_PATH backend_api.py
'''

        script_path = Path("start_xedu_client.sh")
        with open(script_path, 'w', encoding='utf-8') as f:
            f.write(script_content)

        # 设置执行权限
        os.chmod(script_path, 0o755)
        logger.info(f"创建Unix启动脚本: {script_path}")

    def get_config_summary(self) -> Dict[str, Any]:
        """获取配置摘要"""
        try:
            from .config_service import get_config_service
            config_service = get_config_service()
            config = config_service.load_config()

            return {
                'python_configured': bool(config.python_executable),
                'project_dir_configured': bool(config.project_dir),
                'venv_configured': bool(config.activate_script),
                'config_file_exists': config_service.config_file.exists(),
                'config_path': str(config_service.config_file),
                'config_preview': config.to_dict()
            }

        except Exception as e:
            logger.error(f"获取配置摘要失败: {e}")
            return {'error': str(e)}


def run_auto_config() -> Dict[str, Any]:
    """运行自动配置的便捷函数"""
    service = AutoConfigService()
    return service.run_full_auto_config()


def get_auto_config_summary() -> Dict[str, Any]:
    """获取自动配置摘要的便捷函数"""
    service = AutoConfigService()
    return service.get_config_summary()