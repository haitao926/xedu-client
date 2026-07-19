"""
配置数据模型
统一管理应用配置相关的数据结构和验证
"""

from dataclasses import dataclass, asdict, field
from typing import Optional, Dict, Any, List
import json
import os
from pathlib import Path

from utils.python_runtime import inspect_python_executable


@dataclass
class JupyterConfig:
    """Jupyter 配置模型"""
    port: int = 8888
    python_executable: str = ""  # 将在__post_init__中自动设置
    project_dir: str = ""
    activate_script: str = ""  # 虚拟环境激活脚本
    use_notebook: bool = False
    auto_start: bool = False
    auto_restart: bool = True
    check_interval: int = 2000  # 毫秒
    max_restarts: int = 3
    args: str = ""
    env: Dict[str, str] = field(default_factory=dict)
    debug: bool = False
    allow_remote_access: bool = False

    def __post_init__(self):
        """初始化后的处理"""
        # 如果没有指定 Python 解释器，优先使用 Electron 传入的解释器。
        if not self.python_executable:
            # 获取项目根目录
            try:
                # 获取当前文件的路径并向上查找项目根目录
                env_python = os.environ.get("XEDU_PYTHON_EXECUTABLE", "").strip()
                if env_python and Path(env_python).is_file():
                    self.python_executable = str(Path(env_python).resolve())
                    return
                # The lightweight release does not ship a Python runtime. Keep
                # the default empty so the manager uses its own interpreter;
                # packaged or Electron-managed interpreters must be explicit.
                self.python_executable = ""
            except Exception:
                # 如果检测失败，保持为空字符串
                pass

    def validate(self) -> tuple[bool, list[str]]:
        """验证配置"""
        errors = []

        if self.port < 1024 or self.port > 65535:
            errors.append("端口号必须在 1024-65535 之间")

        if self.python_executable and not Path(self.python_executable).exists():
            errors.append(f"Python 解释器不存在: {self.python_executable}")
        elif self.python_executable:
            python_check = inspect_python_executable(self.python_executable)
            if not python_check["success"]:
                errors.append(python_check["message"])

        if self.project_dir and not Path(self.project_dir).exists():
            errors.append(f"项目目录不存在: {self.project_dir}")

        if self.check_interval < 1000:
            errors.append("检查间隔不能小于 1000 毫秒")

        if self.max_restarts < 0:
            errors.append("最大重启次数不能为负数")

        if isinstance(self.allow_remote_access, bool) is False:
            errors.append("Jupyter 远程访问开关必须为布尔值")

        return len(errors) == 0, errors

    def to_dict(self) -> Dict[str, Any]:
        """转换为字典"""
        return asdict(self)

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'JupyterConfig':
        """从字典创建实例"""
        if not isinstance(data, dict):
            data = {}
        allowed = {key: data[key] for key in cls.__dataclass_fields__ if key in data}
        return cls(**allowed)


@dataclass
class QuickFormSettings:
    """QuickForm CLI 配置"""
    enabled: bool = False
    base_url: str = "https://quickform.cn"
    username: str = ""
    password: str = ""

    def validate(self) -> tuple[bool, list[str]]:
        errors = []

        if isinstance(self.enabled, bool) is False:
            errors.append("QuickForm 开关必须为布尔值")

        if self.enabled and not self.base_url:
            errors.append("启用 QuickForm 时 Base URL 不能为空")

        return len(errors) == 0, errors

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'QuickFormSettings':
        if not isinstance(data, dict):
            data = {}
        allowed = {key: data[key] for key in cls.__dataclass_fields__ if key in data}
        return cls(**allowed)


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
    pip_use_mirror: bool = True
    resources_base_url: str = ""
    resources_repo: str = ""
    resources_branch: str = "main"
    resources_index_path: str = "index.json"
    resources_submit_url: str = ""
    resources_publish_token: str = ""
    resources_publish_path: str = "courses"
    resources_sources: List[Dict[str, Any]] = field(default_factory=list)
    classroom_enabled: bool = False
    classroom_auto_discover: bool = True
    classroom_name: str = ""
    classroom_code: str = ""
    classroom_teacher_code: str = ""
    allow_network_access: bool = False
    quickform: QuickFormSettings = field(default_factory=QuickFormSettings)

    def validate(self) -> tuple[bool, list[str]]:
        """验证配置"""
        errors = []

        if self.theme not in ["light", "dark", "auto"]:
            errors.append("主题必须是 'light', 'dark' 或 'auto'")

        if self.refresh_interval < 1000:
            errors.append("刷新间隔不能小于 1000 毫秒")

        if isinstance(self.pip_use_mirror, bool) is False:
            errors.append("pip 镜像开关必须为布尔值")

        if not isinstance(self.resources_sources, list):
            errors.append("课程源配置必须为数组")

        if getattr(self, "classroom_enabled", None) is not None and isinstance(self.classroom_enabled, bool) is False:
            errors.append("课堂模式开关必须为布尔值")

        if getattr(self, "classroom_auto_discover", None) is not None and isinstance(self.classroom_auto_discover, bool) is False:
            errors.append("课堂自动发现开关必须为布尔值")

        if isinstance(self.allow_network_access, bool) is False:
            errors.append("网络暴露开关必须为布尔值")

        quickform_valid, quickform_errors = self.quickform.validate()
        if not quickform_valid:
            errors.extend(quickform_errors)

        return len(errors) == 0, errors

    def to_dict(self) -> Dict[str, Any]:
        """转换为字典"""
        return asdict(self)

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'UIConfig':
        """从字典创建实例"""
        if not isinstance(data, dict):
            data = {}
        allowed = {key: data[key] for key in cls.__dataclass_fields__ if key in data}
        if "quickform" in allowed:
            allowed["quickform"] = QuickFormSettings.from_dict(allowed["quickform"])
        return cls(**allowed)


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

        # API Key可以为空，此时AI功能将不可用，但不应该阻止其他功能
        # if not self.api_key:
        #     errors.append("API Key 不能为空")

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
        if not isinstance(data, dict):
            data = {}
        allowed = {key: data[key] for key in cls.__dataclass_fields__ if key in data}
        return cls(**allowed)


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

    def to_public_dict(self) -> Dict[str, Any]:
        """Return only configuration values that a Renderer may receive."""

        data = self.to_dict()
        data["ai"].pop("api_key", None)
        data["ui"].pop("resources_publish_token", None)
        data["ui"].pop("classroom_teacher_code", None)
        data["ui"]["quickform"].pop("password", None)
        data["secret_status"] = self.to_secret_refs()
        return data

    def to_secret_refs(self) -> Dict[str, bool]:
        """Expose secret presence without exposing any secret material."""

        return {
            "ai_configured": bool(self.ai.api_key),
            "resources_publish_configured": bool(self.ui.resources_publish_token),
            "classroom_teacher_configured": bool(self.ui.classroom_teacher_code),
            "quickform_password_configured": bool(self.ui.quickform.password),
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


_SECRET_CONFIG_FIELDS = {
    ("ai", "api_key"),
    ("ui", "resources_publish_token"),
    ("ui", "classroom_teacher_code"),
    ("ui.quickform", "password"),
}


def merge_config_update(
    current: AppConfig,
    payload: Dict[str, Any],
    *,
    allow_secret_write: bool,
) -> AppConfig:
    """Merge a whitelisted update without silently accepting unknown settings."""

    if not isinstance(payload, dict):
        raise ValueError("配置必须是对象")

    data = current.to_dict()
    sections = ("jupyter", "ui", "ai")
    updates = payload if any(section in payload for section in sections) else {"jupyter": payload}
    unexpected_sections = set(updates) - set(sections)
    if unexpected_sections:
        raise ValueError(f"未知配置分区: {', '.join(sorted(unexpected_sections))}")

    for section, values in updates.items():
        if not isinstance(values, dict):
            raise ValueError(f"{section} 配置必须是对象")
        if section == "ui" and "quickform" in values:
            quickform_values = values["quickform"]
            if not isinstance(quickform_values, dict):
                raise ValueError("quickform 配置必须是对象")
            unknown = set(quickform_values) - set(data["ui"]["quickform"])
            if unknown:
                raise ValueError(f"未知 QuickForm 配置: {', '.join(sorted(unknown))}")
            if ("ui.quickform", "password") in _SECRET_CONFIG_FIELDS and "password" in quickform_values and not allow_secret_write:
                raise ValueError("不允许写入 QuickForm 密码")
            data["ui"]["quickform"].update(quickform_values)

        for key, value in values.items():
            if section == "ui" and key == "quickform":
                continue
            if key not in data[section]:
                raise ValueError(f"未知 {section} 配置: {key}")
            if (section, key) in _SECRET_CONFIG_FIELDS and not allow_secret_write:
                raise ValueError(f"不允许写入秘密配置: {key}")
            data[section][key] = value

    return AppConfig.from_dict(data)


def redact_secrets(value: Any) -> Any:
    """Redact known credential fields before they reach logs or error responses."""

    sensitive_names = ("api_key", "token", "password", "teacher_code", "authorization")
    if isinstance(value, dict):
        return {
            key: "***" if any(name in str(key).lower() for name in sensitive_names) else redact_secrets(item)
            for key, item in value.items()
        }
    if isinstance(value, list):
        return [redact_secrets(item) for item in value]
    return value


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
    manually_stopped: bool = False  # 是否手动停止

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
    xedu_version: Optional[str] = None
    xedu_expected_version: Optional[str] = None
    xedu_version_ok: Optional[bool] = None
    xedu_runtime_ok: bool = False
    xedu_repair_available: bool = False
    xedu_runtime_message: Optional[str] = None

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
