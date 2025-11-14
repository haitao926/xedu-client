"""
配置数据模型
统一管理应用配置相关的数据结构和验证
"""

from dataclasses import dataclass, asdict, field
from typing import Optional, Dict, Any
import json
from pathlib import Path


@dataclass
class JupyterConfig:
    """Jupyter 配置模型"""
    port: int = 8888
    python_executable: str = ""
    project_dir: str = ""
    use_notebook: bool = False
    auto_start: bool = False
    auto_restart: bool = True
    check_interval: int = 2000  # 毫秒
    max_restarts: int = 3
    args: str = ""
    env: Dict[str, str] = field(default_factory=dict)
    debug: bool = False

    def validate(self) -> tuple[bool, list[str]]:
        """验证配置"""
        errors = []

        if self.port < 1024 or self.port > 65535:
            errors.append("端口号必须在 1024-65535 之间")

        if self.python_executable and not Path(self.python_executable).exists():
            errors.append(f"Python 解释器不存在: {self.python_executable}")

        if self.project_dir and not Path(self.project_dir).exists():
            errors.append(f"项目目录不存在: {self.project_dir}")

        if self.check_interval < 1000:
            errors.append("检查间隔不能小于 1000 毫秒")

        if self.max_restarts < 0:
            errors.append("最大重启次数不能为负数")

        return len(errors) == 0, errors

    def to_dict(self) -> Dict[str, Any]:
        """转换为字典"""
        return asdict(self)

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'JupyterConfig':
        """从字典创建实例"""
        return cls(**data)


@dataclass
class UIConfig:
    """UI 配置模型"""
    theme: str = "dark"
    language: str = "zh-CN"
    auto_refresh: bool = True
    refresh_interval: int = 2000
    show_notifications: bool = True
    minimize_to_tray: bool = True
    auto_open_browser: bool = True

    def validate(self) -> tuple[bool, list[str]]:
        """验证配置"""
        errors = []

        if self.theme not in ["light", "dark", "auto"]:
            errors.append("主题必须是 'light', 'dark' 或 'auto'")

        if self.refresh_interval < 1000:
            errors.append("刷新间隔不能小于 1000 毫秒")

        return len(errors) == 0, errors

    def to_dict(self) -> Dict[str, Any]:
        """转换为字典"""
        return asdict(self)

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'UIConfig':
        """从字典创建实例"""
        return cls(**data)


@dataclass
class AIConfig:
    """AI 助手配置模型"""
    api_key: str = ""
    base_url: str = "https://api.moonshot.cn/v1"
    model: str = "moonshot-v1-8k-vision-preview"
    max_history: int = 50
    timeout: int = 30  # 秒

    def validate(self) -> tuple[bool, list[str]]:
        """验证配置"""
        errors = []

        if not self.api_key:
            errors.append("API Key 不能为空")

        if not self.base_url:
            errors.append("Base URL 不能为空")

        if self.max_history < 1:
            errors.append("最大历史记录数不能小于 1")

        if self.timeout < 1:
            errors.append("超时时间不能小于 1 秒")

        return len(errors) == 0, errors

    def to_dict(self) -> Dict[str, Any]:
        """转换为字典"""
        return asdict(self)

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'AIConfig':
        """从字典创建实例"""
        return cls(**data)


@dataclass
class AppConfig:
    """应用总配置模型"""
    jupyter: JupyterConfig = field(default_factory=JupyterConfig)
    ui: UIConfig = field(default_factory=UIConfig)
    ai: AIConfig = field(default_factory=AIConfig)

    def validate(self) -> tuple[bool, dict[str, list[str]]]:
        """验证所有配置"""
        all_errors = {}

        jupyter_valid, jupyter_errors = self.jupyter.validate()
        if not jupyter_valid:
            all_errors['jupyter'] = jupyter_errors

        ui_valid, ui_errors = self.ui.validate()
        if not ui_valid:
            all_errors['ui'] = ui_errors

        ai_valid, ai_errors = self.ai.validate()
        if not ai_valid:
            all_errors['ai'] = ai_errors

        return len(all_errors) == 0, all_errors

    def to_dict(self) -> Dict[str, Any]:
        """转换为字典"""
        return {
            'jupyter': self.jupyter.to_dict(),
            'ui': self.ui.to_dict(),
            'ai': self.ai.to_dict()
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'AppConfig':
        """从字典创建实例"""
        jupyter_data = data.get('jupyter', {})
        ui_data = data.get('ui', {})
        ai_data = data.get('ai', {})

        return cls(
            jupyter=JupyterConfig.from_dict(jupyter_data),
            ui=UIConfig.from_dict(ui_data),
            ai=AIConfig.from_dict(ai_data)
        )

    def to_json(self) -> str:
        """转换为 JSON 字符串"""
        return json.dumps(self.to_dict(), indent=2, ensure_ascii=False)

    @classmethod
    def from_json(cls, json_str: str) -> 'AppConfig':
        """从 JSON 字符串创建实例"""
        data = json.loads(json_str)
        return cls.from_dict(data)


@dataclass
class JupyterStatus:
    """Jupyter 状态模型"""
    running: bool = False
    port: Optional[int] = None
    pid: Optional[int] = None
    url: Optional[str] = None
    uptime: int = 0  # 运行时间（秒）
    auto_restart: bool = False
    process_protection: str = "disabled"
    open_file: Optional[str] = None
    last_error: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        """转换为字典"""
        return asdict(self)


@dataclass
class SystemInfo:
    """系统信息模型"""
    python_version: str = ""
    python_executable: str = ""
    platform: str = ""
    jupyterlab_installed: bool = False
    jupyterlab_version: Optional[str] = None
    jupyter_notebook_version: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        """转换为字典"""
        return asdict(self)


@dataclass
class AIRequest:
    """AI 请求模型"""
    image: str = ""  # base64 编码的图片
    question: str = ""
    config: Dict[str, Any] = field(default_factory=dict)

    def validate(self) -> tuple[bool, list[str]]:
        """验证请求"""
        errors = []

        if not self.image:
            errors.append("图片不能为空")

        if not self.question:
            errors.append("问题不能为空")

        if not self.config.get('api_key'):
            errors.append("API Key 不能为空")

        return len(errors) == 0, errors


@dataclass
class AIResponse:
    """AI 响应模型"""
    success: bool = False
    answer: Optional[str] = None
    error: Optional[str] = None
    usage: Optional[Dict[str, Any]] = None

    def to_dict(self) -> Dict[str, Any]:
        """转换为字典"""
        return asdict(self)