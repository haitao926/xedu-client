"""Helpers for validating the Python interpreter selected by the teacher."""

from __future__ import annotations

import os
import json
import re
import subprocess
from pathlib import Path
from typing import Any

from utils.xedu_compat import (
    XEDU_PYTHON_MIN_VERSION,
    is_supported_xedu_version,
    patch_xedu_metadata,
)


MIN_PYTHON_VERSION = (3, 8)
_VERSION_PATTERN = re.compile(r"Python\s+(\d+)\.(\d+)(?:\.(\d+))?")
_ENVIRONMENT_MARKER = "__XEDU_ENVIRONMENT__="
_JUPYTER_MODULES = {"jupyterlab": "JupyterLab", "notebook": "Notebook"}
_JUPYTER_REPAIR_PACKAGES = ("jupyterlab", "ipykernel")
# Workflow imports these modules while constructing the XEduHub registry.
# Keep this list independent from the Flask backend bootstrap: a teacher's
# selected interpreter must be repairable before the API process exists.
_XEDU_RUNTIME_REPAIR_PACKAGES = (
    "numpy",
    "matplotlib",
    "opencv-python",
    "onnx",
    "onnxruntime",
    "Pillow",
    "ftfy",
    "regex",
    "tqdm",
    "requests",
    "soundfile",
    "six",
)
# xedu-python 2.0.0 advertises dependency floors that were chosen for newer
# Python releases. These versions keep the same import surface available on
# Python 3.8, where the newest NumPy/Matplotlib wheels are not installable.
_XEDU_RUNTIME_REPAIR_SPECS_38 = (
    "numpy==1.24.4",
    "matplotlib==3.7.5",
    "opencv-python==4.10.0.84",
    "onnx==1.16.2",
    "onnxruntime==1.18.1",
    "Pillow==10.4.0",
    "ftfy==6.2.3",
    "regex==2024.11.6",
    "tqdm==4.67.1",
    "requests==2.32.3",
    "soundfile==0.12.1",
    "six==1.16.0",
)
_XEDU_REPAIR_SPEC = f"xedu-python=={XEDU_PYTHON_MIN_VERSION}"
_DEFAULT_PIP_MIRROR = "https://pypi.tuna.tsinghua.edu.cn/simple"
_PIP_INSTALL_TIMEOUT_SECONDS = 300
_ENVIRONMENT_PROBE = r'''
import importlib.metadata as metadata
import json
import platform
import site
import sys
import sysconfig
from pathlib import Path

def package_version(name):
    try:
        return metadata.version(name)
    except metadata.PackageNotFoundError:
        return None

payload = {
    "python_version": platform.python_version(),
    "python_executable": sys.executable,
    # A base interpreter may install into the user site. Prefer the location
    # reported by the distribution so metadata repair follows the package.
    "site_packages": "",
    "xedu_version": package_version("xedu-python"),
    "jupyterlab_version": package_version("jupyterlab"),
    "jupyter_notebook_version": package_version("notebook"),
    "ipykernel_version": package_version("ipykernel"),
    "xedu_runtime_ok": False,
    "xedu_runtime_message": "",
    "virtual_environment": sys.prefix != getattr(sys, "base_prefix", sys.prefix),
    "user_site_enabled": bool(getattr(site, "ENABLE_USER_SITE", False)),
    "externally_managed": False,
}
try:
    distribution = metadata.distribution("xedu-python")
    payload["site_packages"] = str(distribution.locate_file(""))
except metadata.PackageNotFoundError:
    payload["site_packages"] = sysconfig.get_paths().get("purelib", "")
try:
    stdlib = Path(sysconfig.get_path("stdlib") or "")
    payload["externally_managed"] = (stdlib / "EXTERNALLY-MANAGED").is_file()
except Exception:
    pass
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
    # Do not call Path.resolve() here. On macOS and Unix virtualenvs, the
    # selected bin/python is commonly a symlink to the base interpreter;
    # resolving it would make pip and the probe operate on the wrong site-
    # packages directory and silently escape the selected environment.
    candidate = Path(os.path.abspath(os.path.expanduser(str(executable or ""))))
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
        "executable": str(candidate),
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
    # A fresh interpreter has no xedu metadata yet, but it is still a valid
    # repair target. Older unsupported XEdu releases remain non-repairable.
    payload["xedu_repair_available"] = (
        not payload.get("xedu_version")
        or (payload["xedu_version_ok"] and not payload.get("xedu_runtime_ok"))
    )
    return payload


def _missing_jupyter_packages(environment: dict[str, Any]) -> list[str]:
    return [
        package
        for package in _JUPYTER_REPAIR_PACKAGES
        if not environment.get(f"{package}_version")
    ]


def _python_version_tuple(environment: dict[str, Any]) -> tuple[int, int]:
    value = str(environment.get("python_version") or "")
    match = re.match(r"^(\d+)\.(\d+)", value)
    if not match:
        return (0, 0)
    return int(match.group(1)), int(match.group(2))


def _jupyter_repair_specs(environment: dict[str, Any]) -> list[str]:
    """Keep the repair path installable on Python 3.8 without weakening newer profiles."""
    if _python_version_tuple(environment) == (3, 8):
        return ["jupyterlab<4.3", "ipykernel<6.30"]
    return list(_JUPYTER_REPAIR_PACKAGES)


def _xedu_runtime_repair_specs(environment: dict[str, Any]) -> list[str]:
    """Select an installable XEduHub dependency profile for the Python version."""
    if _python_version_tuple(environment) == (3, 8):
        return list(_XEDU_RUNTIME_REPAIR_SPECS_38)
    return list(_XEDU_RUNTIME_REPAIR_PACKAGES)


def _summarize_command_error(completed: subprocess.CompletedProcess[str]) -> str:
    detail = (completed.stderr or completed.stdout or "").strip()
    detail = " ".join(detail.split())
    return detail[-600:] if detail else "未知错误"


def _pip_install_options(environment: dict[str, Any]) -> list[str]:
    """Install into a selected base interpreter without requiring sudo."""
    options: list[str] = []
    if not environment.get("virtual_environment") and environment.get("user_site_enabled"):
        options.append("--user")
    if environment.get("externally_managed"):
        # PEP 668 blocks both global and user installs unless the user has
        # explicitly selected this interpreter for application use.
        options.append("--break-system-packages")
    return options


def _ensure_target_pip(executable: str) -> dict[str, Any] | None:
    """Make the target interpreter's pip available before the first install."""
    probe_error = ""
    try:
        probe = subprocess.run(
            [executable, "-m", "pip", "--version"],
            capture_output=True,
            text=True,
            timeout=30,
            check=False,
        )
        probe_error = (probe.stderr or probe.stdout or "").strip()
    except (OSError, subprocess.SubprocessError) as exc:
        probe = None
        probe_error = str(exc)

    if probe is not None and probe.returncode == 0:
        return None

    try:
        ensurepip = subprocess.run(
            [executable, "-m", "ensurepip", "--upgrade"],
            capture_output=True,
            text=True,
            timeout=120,
            check=False,
        )
    except (OSError, subprocess.SubprocessError) as exc:
        return {"success": False, "message": f"无法准备 pip: {exc}"}
    if ensurepip.returncode != 0:
        detail = _summarize_command_error(ensurepip)
        if detail == "未知错误" and probe_error:
            detail = " ".join(probe_error.split())[-600:]
        return {"success": False, "message": f"当前 Python 没有可用 pip，无法自动安装依赖。{detail}"}
    return None


def _install_jupyter_packages(
    executable: str,
    packages: list[str],
    *,
    use_mirror: bool,
    environment: dict[str, Any],
) -> dict[str, Any]:
    command = [
        executable,
        "-m",
        "pip",
        "install",
        "--disable-pip-version-check",
        "--no-input",
        *_pip_install_options(environment),
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


def _install_xedu_package(
    executable: str,
    *,
    use_mirror: bool,
    environment: dict[str, Any],
) -> dict[str, Any]:
    """Install the XEdu wheel without resolving its legacy dependency metadata.

    The portable runtime installs XEdu this way because version 2.0.0 declares
    stale upper bounds for modern Pillow and ONNX Runtime.  Keeping the same
    narrow install here also means a fresh teacher-selected environment can be
    repaired before Flask or the backend has ever been installed.
    """
    command = [
        executable,
        "-m",
        "pip",
        "install",
        "--disable-pip-version-check",
        "--no-input",
        "--no-deps",
        *_pip_install_options(environment),
        _XEDU_REPAIR_SPEC,
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
        return {"success": False, "message": "安装 xedu-python 超时。"}
    except (OSError, subprocess.SubprocessError) as exc:
        return {"success": False, "message": f"无法安装 xedu-python: {exc}"}

    if completed.returncode != 0:
        return {
            "success": False,
            "message": f"xedu-python 安装失败: {_summarize_command_error(completed)}",
        }
    return {
        "success": True,
        "message": "xedu-python 已安装",
        "installed_packages": [_XEDU_REPAIR_SPEC],
    }


def _install_xedu_runtime_packages(
    executable: str,
    *,
    use_mirror: bool,
    environment: dict[str, Any],
) -> dict[str, Any]:
    """Install XEduHub's import-time dependencies without pulling in Flask."""
    packages = _xedu_runtime_repair_specs(environment)
    command = [
        executable,
        "-m",
        "pip",
        "install",
        "--disable-pip-version-check",
        "--no-input",
        *_pip_install_options(environment),
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
        return {"success": False, "message": "安装 XEduHub 运行依赖超时。"}
    except (OSError, subprocess.SubprocessError) as exc:
        return {"success": False, "message": f"无法安装 XEduHub 运行依赖: {exc}"}

    if completed.returncode != 0:
        return {
            "success": False,
            "message": f"XEduHub 运行依赖安装失败: {_summarize_command_error(completed)}",
        }
    return {
        "success": True,
        "message": "XEduHub 运行依赖已安装",
        "installed_packages": packages,
    }


def repair_xedu_python_environment(executable: str, *, use_mirror: bool = True) -> dict[str, Any]:
    """Prepare XEdu/Jupyter without requiring Flask or a running backend."""
    environment = inspect_python_environment(executable)
    if not environment.get("success"):
        return environment

    changed = False
    installed_packages = []
    xedu_was_installed = False
    pip_ready = False

    def ensure_pip_once() -> dict[str, Any] | None:
        nonlocal pip_ready
        if pip_ready:
            return None
        pip_result = _ensure_target_pip(executable)
        if pip_result is None:
            pip_ready = True
        return pip_result

    if not environment.get("xedu_version"):
        pip_result = ensure_pip_once()
        if pip_result:
            pip_result["changed"] = False
            pip_result["runtime"] = environment
            return pip_result
        installation = _install_xedu_package(
            executable,
            use_mirror=use_mirror,
            environment=environment,
        )
        if not installation.get("success"):
            installation["changed"] = changed
            installation["runtime"] = environment
            return installation
        installed_packages.extend(installation.get("installed_packages") or [])
        changed = True
        xedu_was_installed = True
        environment = inspect_python_environment(executable)
        if not environment.get("success") or not environment.get("xedu_version"):
            return {
                "success": False,
                "changed": changed,
                "message": "xedu-python 安装后仍无法被所选 Python 识别。",
                "runtime": environment,
            }

    runtime_message = str(environment.get("xedu_runtime_message") or "")
    missing_runtime_module = "No module named" in runtime_message or "ModuleNotFoundError" in runtime_message
    needs_xedu_runtime_packages = (
        not environment.get("xedu_runtime_ok")
        and (xedu_was_installed or missing_runtime_module)
    )
    if needs_xedu_runtime_packages:
        pip_result = ensure_pip_once()
        if pip_result:
            pip_result["changed"] = changed
            pip_result["runtime"] = environment
            return pip_result
        installation = _install_xedu_runtime_packages(
            executable,
            use_mirror=use_mirror,
            environment=environment,
        )
        if not installation.get("success"):
            installation["changed"] = changed
            installation["runtime"] = environment
            return installation
        installed_packages.extend(installation.get("installed_packages") or [])
        changed = True
        environment = inspect_python_environment(executable)
        if not environment.get("success"):
            return {
                "success": False,
                "changed": changed,
                "message": "XEduHub 运行依赖安装后无法重新检查所选 Python。",
                "runtime": environment,
            }

    missing_packages = _missing_jupyter_packages(environment)
    if missing_packages:
        pip_result = ensure_pip_once()
        if pip_result:
            pip_result["changed"] = changed
            pip_result["runtime"] = environment
            return pip_result
        specs_by_name = {
            spec.split("<", 1)[0].split(">", 1)[0].split("=", 1)[0]: spec
            for spec in _jupyter_repair_specs(environment)
        }
        installed_jupyter_packages = [specs_by_name[package] for package in missing_packages]
        installation = _install_jupyter_packages(
            executable,
            installed_jupyter_packages,
            use_mirror=use_mirror,
            environment=environment,
        )
        if not installation.get("success"):
            installation["changed"] = changed
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
        installed_packages.extend(installed_jupyter_packages)

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
