#!/usr/bin/env python3
"""
默认配置文件
"""

from pathlib import Path

# 默认配置
DEFAULT_CONFIG = {
    # Jupyter 配置
    'python_executable': None,  # 将在运行时检测
    'jupyter_port': 8888,
    'project_dir': str(Path.cwd()),
    'use_notebook': False,
    'jupyterlab_version': '4.4.10',

    # API 服务器配置
    'api_port': 5123,
    'api_host': '127.0.0.1',
    'debug_mode': True,

    # AI 配置
    'ai_default_model': 'moonshot-v1-8k-vision-preview',
    'ai_base_url': 'https://api.moonshot.cn/v1',
    'ai_api_key': None,
    'ai_temperature': 0.3,
    'ai_max_tokens': 2000,

    # 功能开关
    'auto_restart': False,
    'process_protection': False,
    'enable_ai': True,
    'enable_web_server': True,
}

# 配置文件路径
CONFIG_FILE = Path(__file__).parent.parent / 'server_config.json'

# 系统信息
SYSTEM_INFO = {
    'platform': 'windows',
    'python_version': '',
    'xedu_version': '2.0.0',
}

# Jupyter 模型选择
JUPYTER_MODES = {
    'lab': {
        'module': 'jupyterlab',
        'name': 'Jupyter Lab',
        'url_suffix': '/lab'
    },
    'notebook': {
        'module': 'notebook',
        'name': 'Jupyter Notebook',
        'url_suffix': '/tree'
    }
}

# AI 模型选择
AI_MODELS = {
    'moonshot-v1-8k-vision-preview': {
        'name': 'Moonshot 8K Vision',
        'description': '8K上下文，快速响应',
        'recommended': True
    },
    'moonshot-v1-32k-vision-preview': {
        'name': 'Moonshot 32K Vision',
        'description': '32K上下文，适合长文档',
        'recommended': False
    },
    'moonshot-v1-128k-vision-preview': {
        'name': 'Moonshot 128K Vision',
        'description': '128K上下文，适合大型项目',
        'recommended': False
    }
}

# 配置管理函数
import json

def load_config():
    """加载配置文件"""
    if CONFIG_FILE.exists():
        try:
            with open(CONFIG_FILE, 'r', encoding='utf-8') as f:
                config = json.load(f)
            # 合并默认配置
            merged_config = DEFAULT_CONFIG.copy()
            merged_config.update(config)
            return merged_config
        except Exception as e:
            print(f"[WARN] 配置文件加载失败: {e}")

    return DEFAULT_CONFIG.copy()

def save_config(config):
    """保存配置文件"""
    try:
        # 确保目录存在
        CONFIG_FILE.parent.mkdir(parents=True, exist_ok=True)

        with open(CONFIG_FILE, 'w', encoding='utf-8') as f:
            json.dump(config, f, indent=2, ensure_ascii=False)
        print(f"[INFO] 配置已保存到: {CONFIG_FILE}")
        return True
    except Exception as e:
        print(f"[ERROR] 保存配置失败: {e}")
        return False
