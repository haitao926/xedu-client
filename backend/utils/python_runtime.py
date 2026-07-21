"""Helpers for validating the Python interpreter selected by the teacher."""

from __future__ import annotations

import os
import json
import re
import subprocess
from pathlib import Path
from typing import Any

from utils.xedu_compat import XEDU_PYTHON_MIN_VERSION, is_supported_xedu_version, patch_xedu_metadata


MIN_PYTHON_VERSION = (3, 10)
_VERSION_PATTERN = re.compile(r"Python\s+(\d+)\.(\d+)(?:\.(\d+))?")
_ENVIRONMENT_MARKER = "__XEDU_ENVIRONMENT__="
_JUPYTER_MODULES = {"jupyterlab": "JupyterLab", "notebook": "Notebook"}
_JUPYTER_REPAIR_PACKAGES = ("jupyterlab", "ipykernel")
_DEFAULT_PIP_MIRROR = "https://pypi.tuna.tsinghua.edu.cn/simple"
_PIP_INSTALL_TIMEOUT_SECONDS = 300
_ENVIRONMENT_PROBE = r'''
import importlib.metadata as metadata
import json
import platform
import sys
import sysconfig

def package_version(name):
    try:
        return metadata.version(name)
    except metadata.PackageNotFoundError:
        return None

payload = {
    "python_version": platform.python_version(),
    "python_executable": sys.executable,
    "site_packages": sysconfig.get_paths().get("purelib", ""),
    "xedu_version": package_version("xedu-python"),
    "jupyterlab_version": package_version("jupyterlab"),
    "jupyter_notebook_version": package_version("notebook"),
    "ipykernel_version": package_version("ipykernel"),
    "xedu_runtime_ok": False,
    "xedu_runtime_message": "",
}
try:
    from XEdu.hub import Workflow
    tasks = Workflow.support_task()
    payload["xedu_runtime_ok"] = isinstance(tasks, (list, tuple)) and bool(tasks)
    payload["xedu_runtime_message"] = f"XEduHub 支持 {len(tasks)} 项任务。"
except Exception as exc:
    payload["xedu_runtime_message"] = f"XEduHub 运行探针失败: {exc}"
print("__XEDU_ENVIRONMENT__=" + json.dumps(payload, ensure_ascii=False))
'''


def inspect_python_executable(executable: str) -> dict[str, Any]:
    """Return a user-facing validation result without importing the target environment."""
    candidate = Path(str(executable or "")).expanduser()
    if not candidate.is_file():
        return {"success": False, "message": f"Python 解释器不存在: {candidate}"}
    if os.name != "nt" and not os.access(candidate, os.X_OK):
        return {"success": False, "message": f"Python 解释器不可执行: {candidate}"}

    try:
        completed = subprocess.run(
            [str(candidate), "--version"],
            capture_output=True,
            text=True,
            timeout=5,
            check=False,
        )
    except (OSError, subprocess.SubprocessError) as exc:
        return {"success": False, "message": f"无法运行 Python 解释器: {exc}"}

    version_text = "\n".join(part for part in (completed.stdout, completed.stderr) if part).strip()
    match = _VERSION_PATTERN.search(version_text)
    if completed.returncode != 0 or not match:
        return {"success": False, "message": f"无法读取 Python 版本: {candidate}"}

    version = tuple(int(part or 0) for part in match.groups())
    version_display = ".".join(str(part) for part in version)
    minimum_display = ".".join(str(part) for part in (*MIN_PYTHON_VERSION, 0))
    if version[:2] < MIN_PYTHON_VERSION:
        return {
            "success": False,
            "message": f"Python 版本过低: {version_display}，至少需要 Python {minimum_display}",
            "version": version_display,
        }

    return {
        "success": True,
        "message": f"Python {version_display} 可用",
        "version": version_display,
        "executable": str(candidate.resolve()),
    }


def inspect_jupyter_module(executable: str, module: str = "jupyterlab") -> dict[str, Any]:
    """Check that the selected interpreter can launch the requested Jupyter module."""
    validation = inspect_python_executable(executable)
    if not validation["success"]:
        return validation

    module_label = _JUPYTER_MODULES.get(module)
    if not module_label:
        return {"success": False, "message": f"不支持检查的 Jupyter 模块: {module}"}

    try:
        completed = subprocess.run(
            [validation["executable"], "-m", module, "--version"],
            capture_output=True,
            text=True,
            timeout=10,
            check=False,
        )
    except (OSError, subprocess.SubprocessError) as exc:
        return {"success": False, "message": f"无法检查 {module_label}: {exc}"}

    if completed.returncode != 0:
        return {
            "success": False,
            "message": f"缺少 {module_label}，请在“Python”设置中点击“修复”。",
            "executable": validation["executable"],
            "module": module,
        }

    return {
        "success": True,
        "message": f"{module_label} 可用",
        "executable": validation["executable"],
        "module": module,
    }


def inspect_python_environment(executable: str, timeout_seconds: int = 20) -> dict[str, Any]:
    """Run a minimal probe inside the selected interpreter."""
    validation = inspect_python_executable(executable)
    if not validation["success"]:
        return validation
    candidate = validation["executable"]
    try:
        completed = subprocess.run(
            [candidate, "-c", _ENVIRONMENT_PROBE],
            capture_output=True,
            text=True,
            timeout=timeout_seconds,
            check=False,
        )
    except (OSError, subprocess.SubprocessError) as exc:
        return {"success": False, "message": f"无法检查所选 Python 环境: {exc}"}

    payload = None
    for line in reversed((completed.stdout or "").splitlines()):
        if line.startswith(_ENVIRONMENT_MARKER):
            try:
                payload = json.loads(line[len(_ENVIRONMENT_MARKER):])
            except json.JSONDecodeError:
                payload = None
            break
    if completed.returncode != 0 or not isinstance(payload, dict):
        return {
            "success": False,
            "message": "所选 Python 环境探针失败，请确认环境可执行且依赖没有损坏。",
        }
    payload["success"] = True
    payload["executable"] = candidate
    payload["xedu_expected_version"] = XEDU_PYTHON_MIN_VERSION
    payload["xedu_version_ok"] = is_supported_xedu_version(payload.get("xedu_version"))
    payload["xedu_repair_available"] = payload["xedu_version_ok"] and not payload.get("xedu_runtime_ok")
    return payload


def _missing_jupyter_packages(environment: dict[str, Any]) -> list[str]:
    return [
        package
        for package in _JUPYTER_REPAIR_PACKAGES
        if not environment.get(f"{package}_version")
    ]


def _summarize_command_error(completed: subprocess.CompletedProcess[str]) -> str:
    detail = (completed.stderr or completed.stdout or "").strip()
    detail = " ".join(detail.split())
    return detail[-600:] if detail else "未知错误"


def _install_jupyter_packages(
    executable: str,
    packages: list[str],
    *,
    use_mirror: bool,
) -> dict[str, Any]:
    command = [
        executable,
        "-m",
        "pip",
        "install",
        "--disable-pip-version-check",
        "--no-input",
        *packages,
    ]
    if use_mirror:
        command.extend(["-i", _DEFAULT_PIP_MIRROR])

    try:
        completed = subprocess.run(
            command,
            capture_output=True,
            text=True,
            timeout=_PIP_INSTALL_TIMEOUT_SECONDS,
            check=False,
        )
    except subprocess.TimeoutExpired:
        return {"success": False, "message": "安装 JupyterLab 超时。"}
    except (OSError, subprocess.SubprocessError) as exc:
        return {"success": False, "message": f"无法安装 JupyterLab: {exc}"}

    if completed.returncode != 0:
        return {
            "success": False,
            "message": f"JupyterLab 安装失败: {_summarize_command_error(completed)}",
        }

    return {"success": True, "message": "JupyterLab 已安装", "installed_packages": packages}


def repair_xedu_python_environment(executable: str, *, use_mirror: bool = True) -> dict[str, Any]:
    """Install missing Jupyter dependencies and repair a known XEdu metadata mismatch."""
    environment = inspect_python_environment(executable)
    if not environment.get("success"):
        return environment

    changed = False
    installed_packages = _missing_jupyter_packages(environment)
    if installed_packages:
        installation = _install_jupyter_packages(
            executable,
            installed_packages,
            use_mirror=use_mirror,
        )
        if not installation.get("success"):
            installation["changed"] = False
            installation["runtime"] = environment
            return installation
        changed = True
        environment = inspect_python_environment(executable)
        if not environment.get("success") or _missing_jupyter_packages(environment):
            return {
                "success": False,
                "changed": changed,
                "message": "JupyterLab 安装后仍不可用。",
                "runtime": environment,
            }

    if not is_supported_xedu_version(environment.get("xedu_version")):
        return {
            "success": False,
            "changed": changed,
            "message": f"只允许修复 xedu-python>={XEDU_PYTHON_MIN_VERSION}，当前环境未满足版本要求。",
            "runtime": environment,
        }

    if not environment.get("xedu_runtime_ok"):
        site_packages = environment.get("site_packages")
        if not site_packages:
            return {
                "success": False,
                "changed": changed,
                "message": "无法定位所选 Python 的 site-packages。",
                "runtime": environment,
            }
        metadata_result = patch_xedu_metadata(Path(site_packages))
        if not metadata_result.get("success"):
            metadata_result["changed"] = bool(changed or metadata_result.get("changed"))
            metadata_result["runtime"] = environment
            return metadata_result
        changed = bool(changed or metadata_result.get("changed"))
        environment = inspect_python_environment(executable)

    success = bool(
        environment.get("success")
        and not _missing_jupyter_packages(environment)
        and environment.get("xedu_runtime_ok")
    )
    if not success:
        return {
            "success": False,
            "changed": changed,
            "message": f"XEduHub 探针仍失败: {environment.get('xedu_runtime_message') or environment.get('message', '未知错误')}",
            "runtime": environment,
        }

    return {
        "success": True,
        "changed": changed,
        "message": "Python 环境已修复" if changed else "Python 环境已就绪",
        "runtime": environment,
        "installed_packages": installed_packages,
    }
