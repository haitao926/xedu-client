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
_JUPYTERLAB_ZH_CN_PACKAGE = "jupyterlab-language-pack-zh-CN"
_JUPYTER_REPAIR_PACKAGES = (
    "jupyterlab",
    "ipykernel",
    _JUPYTERLAB_ZH_CN_PACKAGE,
)
_JUPYTER_VERSION_PROBE = """
import importlib.metadata as metadata
print(metadata.version({module_name!r}))
"""
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
_PYPI_INDEX = "https://pypi.org/simple"
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
    "pip_available": False,
    "pip_version": None,
    "pip_error": "",
    "pip_launcher_available": False,
    "ensurepip_available": False,
    "ensurepip_error": "",
    "ssl_available": False,
    "ssl_version": None,
    "ssl_error": "",
    "xedu_version": package_version("xedu-python"),
    "jupyterlab_version": package_version("jupyterlab"),
    "jupyterlab_language_pack_zh_cn_version": package_version("jupyterlab-language-pack-zh-CN"),
    "jupyter_notebook_version": package_version("notebook"),
    "ipykernel_version": package_version("ipykernel"),
    "xedu_runtime_ok": False,
    "xedu_runtime_message": "",
    "virtual_environment": sys.prefix != getattr(sys, "base_prefix", sys.prefix),
    "conda_environment": (Path(sys.prefix) / "conda-meta").is_dir(),
    "user_site_enabled": bool(getattr(site, "ENABLE_USER_SITE", False)),
    "externally_managed": False,
}
try:
    import pip
    payload["pip_available"] = True
    payload["pip_version"] = getattr(pip, "__version__", None) or package_version("pip")
except Exception as exc:
    payload["pip_error"] = f"{type(exc).__name__}: {exc}"
try:
    import ensurepip
    payload["ensurepip_available"] = True
except Exception as exc:
    payload["ensurepip_error"] = f"{type(exc).__name__}: {exc}"
try:
    import ssl
    ssl.create_default_context()
    payload["ssl_available"] = True
    payload["ssl_version"] = getattr(ssl, "OPENSSL_VERSION", None)
except Exception as exc:
    payload["ssl_error"] = f"{type(exc).__name__}: {exc}"
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


def _conda_prefix_for_executable(executable: str) -> Path | None:
    """Return the Conda/XEdu environment root that owns an interpreter, if any.

    A Conda environment is identified by the marker files that ``conda create``
    always writes (``conda-meta/history``). The teacher-selected ``python.exe``
    normally lives at the environment root on Windows and in ``bin`` elsewhere.
    """
    target = Path(os.path.abspath(os.path.expanduser(str(executable or ""))))
    for prefix in (target.parent, target.parent.parent):
        if (prefix / "conda-meta" / "history").is_file():
            return prefix
        if (prefix / "conda-meta").is_dir():
            return prefix
    return None


def _conda_activation_path_entries(prefix: Path) -> list[str]:
    """Reproduce the PATH order that conda-pack's activate.bat prepends.

    Launching ``python.exe`` directly skips activation, so the OpenSSL and other
    DLLs under ``Library\\bin`` are never placed on the loader search path and
    ``import ssl`` fails inside the client even though the same interpreter works
    from an activated shell. These are the exact directories activate.bat adds.
    """
    if os.name == "nt":
        subdirs = (
            "",
            os.path.join("Library", "mingw-w64", "bin"),
            os.path.join("Library", "usr", "bin"),
            os.path.join("Library", "bin"),
            "Scripts",
            "bin",
        )
    else:
        subdirs = ("bin",)
    entries: list[str] = []
    for subdir in subdirs:
        candidate = prefix / subdir if subdir else prefix
        if candidate.is_dir():
            entries.append(str(candidate))
    return entries


def augment_conda_environment(
    executable: str,
    env: dict[str, str] | None = None,
) -> dict[str, str]:
    """Return an environment mapping with Conda DLL search paths made available.

    This makes a teacher-selected Conda/XEdu interpreter behave the same whether
    it is launched directly or through ``activate.bat``: the environment's DLL
    directories are prepended to ``PATH`` and ``CONDA_PREFIX`` is exported so the
    interpreter can locate ``_ssl`` and the other extension modules it needs.
    """
    result = dict(os.environ if env is None else env)
    prefix = _conda_prefix_for_executable(executable)
    if not prefix:
        return result

    entries = _conda_activation_path_entries(prefix)
    if entries:
        existing = result.get("PATH", "")
        existing_parts = existing.split(os.pathsep) if existing else []
        seen = {os.path.normcase(part) for part in existing_parts}
        prepend = [entry for entry in entries if os.path.normcase(entry) not in seen]
        result["PATH"] = os.pathsep.join([*prepend, *existing_parts]) if existing_parts else os.pathsep.join(entries)

    result["CONDA_PREFIX"] = str(prefix)
    return result


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
    """Check Jupyter package metadata without launching the full CLI."""
    validation = inspect_python_executable(executable)
    if not validation["success"]:
        return validation

    module_label = _JUPYTER_MODULES.get(module)
    if not module_label:
        return {"success": False, "message": f"不支持检查的 Jupyter 模块: {module}"}

    try:
        completed = subprocess.run(
            [
                validation["executable"],
                "-c",
                _JUPYTER_VERSION_PROBE.format(module_name=module),
            ],
            capture_output=True,
            text=True,
            timeout=10,
            check=False,
            env=augment_conda_environment(validation["executable"]),
        )
    except subprocess.TimeoutExpired:
        return {
            "success": False,
            "message": f"{module_label} 检查超时，请稍后重试或点击“修复”。",
            "executable": validation["executable"],
            "module": module,
        }
    except (OSError, subprocess.SubprocessError) as exc:
        return {"success": False, "message": f"无法检查 {module_label}: {exc}"}

    version = (completed.stdout or "").strip().splitlines()[-1:] or [""]
    if completed.returncode != 0 or not version[0]:
        return {
            "success": False,
            "message": f"缺少 {module_label}，请在“Python”设置中点击“修复”。",
            "executable": validation["executable"],
            "module": module,
        }

    if module == "jupyterlab":
        try:
            language_pack = subprocess.run(
                [
                    validation["executable"],
                    "-c",
                    _JUPYTER_VERSION_PROBE.format(
                        module_name=_JUPYTERLAB_ZH_CN_PACKAGE,
                    ),
                ],
                capture_output=True,
                text=True,
                timeout=10,
                check=False,
                env=augment_conda_environment(validation["executable"]),
            )
        except subprocess.TimeoutExpired:
            return {
                "success": False,
                "message": "JupyterLab 简体中文语言包检查超时，请稍后重试或点击“修复”。",
                "executable": validation["executable"],
                "module": module,
            }
        except (OSError, subprocess.SubprocessError) as exc:
            return {
                "success": False,
                "message": f"无法检查 JupyterLab 简体中文语言包: {exc}",
            }

        language_pack_version = (
            (language_pack.stdout or "").strip().splitlines()[-1:] or [""]
        )[0]
        if language_pack.returncode != 0 or not language_pack_version:
            return {
                "success": False,
                "message": (
                    "缺少 JupyterLab 简体中文语言包，"
                    "请在“Python”设置中点击“修复”后再启动。"
                ),
                "executable": validation["executable"],
                "module": module,
            }

    return {
        "success": True,
        "message": f"{module_label} 可用",
        "executable": validation["executable"],
        "module": module,
        "version": version[0],
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
            env=augment_conda_environment(candidate),
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
    # Windows/Conda can leave a working Scripts/pip.exe beside an interpreter
    # whose `python -m pip` import path is incomplete. Keep that usable path
    # visible so the UI does not report a false pip absence.
    if not payload.get("pip_available"):
        payload["pip_launcher_available"] = any(
            launcher.is_file() for launcher in _sibling_pip_candidates(candidate)
        )
    payload["xedu_expected_version"] = XEDU_PYTHON_MIN_VERSION
    payload["xedu_version_ok"] = is_supported_xedu_version(payload.get("xedu_version"))
    payload["xedu_repair_available"] = payload.get("ssl_available") is not False and not (
        payload["xedu_version_ok"] and payload.get("xedu_runtime_ok")
    )
    return payload


def _missing_jupyter_packages(environment: dict[str, Any]) -> list[str]:
    missing = []
    if not environment.get("jupyterlab_version"):
        missing.append("jupyterlab")
    if not environment.get("ipykernel_version"):
        missing.append("ipykernel")

    language_pack_key = "jupyterlab_language_pack_zh_cn_version"
    if (
        language_pack_key in environment
        and not environment.get(language_pack_key)
    ) or not environment.get("jupyterlab_version"):
        missing.append("jupyterlab-language-pack-zh-CN")
    return missing


def _python_version_tuple(environment: dict[str, Any]) -> tuple[int, int]:
    value = str(environment.get("python_version") or "")
    match = re.match(r"^(\d+)\.(\d+)", value)
    if not match:
        return (0, 0)
    return int(match.group(1)), int(match.group(2))


def _jupyter_repair_specs(environment: dict[str, Any]) -> list[str]:
    """Keep the repair path installable on Python 3.8 without weakening newer profiles."""
    if _python_version_tuple(environment) == (3, 8):
        return [
            "jupyterlab<4.3",
            "ipykernel<6.30",
            "jupyterlab-language-pack-zh-CN<4.3",
        ]
    jupyterlab_version = str(environment.get("jupyterlab_version") or "")
    version_match = re.match(r"^(\d+)\.(\d+)", jupyterlab_version)
    if version_match:
        major, minor = (int(value) for value in version_match.groups())
        language_pack = (
            f"jupyterlab-language-pack-zh-CN>={major}.{minor},"
            f"<{major}.{minor + 1}"
        )
        return ["jupyterlab", "ipykernel", language_pack]
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
    if (
        not environment.get("virtual_environment")
        and not environment.get("conda_environment")
        and environment.get("user_site_enabled")
    ):
        options.append("--user")
    if environment.get("externally_managed"):
        # PEP 668 blocks both global and user installs unless the user has
        # explicitly selected this interpreter for application use.
        options.append("--break-system-packages")
    return options


def _sibling_pip_candidates(executable: str) -> list[Path]:
    """Find pip launchers that belong to the selected Python environment."""
    target = Path(os.path.abspath(os.path.expanduser(str(executable or ""))))
    parent = target.parent
    directories = (
        parent,
        parent / "Scripts",
        parent / "bin",
        parent.parent / "Scripts",
        parent.parent / "bin",
    )
    names = ("pip.exe", "pip3.exe", "pip", "pip3")
    candidates: list[Path] = []
    seen: set[str] = set()
    for directory in directories:
        for name in names:
            candidate = directory / name
            key = os.path.normcase(str(candidate))
            if key in seen:
                continue
            seen.add(key)
            candidates.append(candidate)
    return candidates


def find_sibling_pip_command(executable: str, *, runner=None) -> list[str] | None:
    """Return a usable pip launcher next to the selected interpreter."""
    run = runner or subprocess.run
    env = augment_conda_environment(executable)
    for candidate in _sibling_pip_candidates(executable):
        if not candidate.is_file():
            continue
        try:
            result = run(
                [str(candidate), "--version"],
                capture_output=True,
                text=True,
                timeout=30,
                check=False,
                env=env,
            )
        except (OSError, subprocess.SubprocessError):
            continue
        if result.returncode == 0:
            return [str(candidate)]
    return None


def resolve_pip_command(executable: str, *, runner=None) -> list[str] | None:
    """Resolve pip for an interpreter, including Windows/Conda launchers."""
    run = runner or subprocess.run
    module_command = [executable, "-m", "pip"]
    try:
        result = run(
            [*module_command, "--version"],
            capture_output=True,
            text=True,
            timeout=30,
            check=False,
            env=augment_conda_environment(executable),
        )
    except (OSError, subprocess.SubprocessError):
        result = None
    if result is not None and result.returncode == 0:
        return module_command
    return find_sibling_pip_command(executable, runner=run)


def _run_pip_install(command: list[str], *, use_mirror: bool) -> dict[str, Any]:
    """Run an install with a reliable official-index fallback."""
    indexes = [_DEFAULT_PIP_MIRROR, _PYPI_INDEX] if use_mirror else [None]
    # command[0] is either the interpreter (``python -m pip``) or a sibling pip
    # launcher; both live inside the selected environment, so DLL augmentation
    # keeps HTTPS reachable for the install itself.
    env = augment_conda_environment(command[0]) if command else None
    failures: list[str] = []
    for index_url in indexes:
        attempt = list(command)
        if index_url:
            attempt.extend(["-i", index_url])
        try:
            completed = subprocess.run(
                attempt,
                capture_output=True,
                text=True,
                timeout=_PIP_INSTALL_TIMEOUT_SECONDS,
                check=False,
                env=env,
            )
        except subprocess.TimeoutExpired:
            return {"success": False, "timed_out": True}
        except (OSError, subprocess.SubprocessError) as exc:
            failures.append(str(exc))
            continue
        if completed.returncode == 0:
            return {"success": True, "command": attempt}
        failures.append(_summarize_command_error(completed))
    return {"success": False, "message": " | ".join(failures) or "未知错误"}


def _ensure_target_pip(executable: str) -> dict[str, Any] | None:
    """Make the target interpreter's pip available before the first install."""
    env = augment_conda_environment(executable)
    probe_error = ""
    try:
        probe = subprocess.run(
            [executable, "-m", "pip", "--version"],
            capture_output=True,
            text=True,
            timeout=30,
            check=False,
            env=env,
        )
        probe_error = (probe.stderr or probe.stdout or "").strip()
    except (OSError, subprocess.SubprocessError) as exc:
        probe = None
        probe_error = str(exc)

    if probe is not None and probe.returncode == 0:
        return None

    # Some Windows and Conda environments ship Scripts/pip.exe while the
    # selected interpreter cannot import pip as a module. Use that launcher
    # before attempting ensurepip, which is unavailable in many Conda builds.
    if find_sibling_pip_command(executable):
        return None

    try:
        ensurepip = subprocess.run(
            [executable, "-m", "ensurepip", "--upgrade"],
            capture_output=True,
            text=True,
            timeout=120,
            check=False,
            env=env,
        )
    except (OSError, subprocess.SubprocessError) as exc:
        return {
            "success": False,
            "error_code": "pip_bootstrap_failed",
            "message": f"所选 Python 无法使用 pip，且无法启动 ensurepip 自动修复: {exc}",
        }
    if ensurepip.returncode != 0:
        detail = _summarize_command_error(ensurepip)
        probe_detail = " ".join(probe_error.split())[-600:] if probe_error else "未返回详细错误"
        return {
            "success": False,
            "error_code": "pip_unavailable",
            "message": (
                "所选 Python 没有可用 pip，且无法通过 ensurepip 自动补齐。"
                f"pip 检测: {probe_detail}；ensurepip: {detail}"
            ),
        }

    try:
        reprobe = subprocess.run(
            [executable, "-m", "pip", "--version"],
            capture_output=True,
            text=True,
            timeout=30,
            check=False,
            env=env,
        )
    except (OSError, subprocess.SubprocessError) as exc:
        return {
            "success": False,
            "error_code": "pip_unavailable",
            "message": f"ensurepip 已执行，但无法重新确认 pip: {exc}",
        }
    if reprobe.returncode == 0:
        return None

    detail = _summarize_command_error(reprobe)
    return {
        "success": False,
        "error_code": "pip_unavailable",
        "message": f"ensurepip 已执行，但所选 Python 仍无法使用 pip。{detail}",
    }


def _install_jupyter_packages(
    executable: str,
    packages: list[str],
    *,
    use_mirror: bool,
    environment: dict[str, Any],
) -> dict[str, Any]:
    pip_command = resolve_pip_command(executable) or [executable, "-m", "pip"]
    command = [
        *pip_command,
        "install",
        "--disable-pip-version-check",
        "--no-input",
        *_pip_install_options(environment),
        *packages,
    ]
    result = _run_pip_install(command, use_mirror=use_mirror)
    if result.get("timed_out"):
        return {"success": False, "message": "安装 JupyterLab 超时。"}
    if not result.get("success"):
        return {
            "success": False,
            "message": f"JupyterLab 安装失败: {result.get('message') or '未知错误'}",
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
    pip_command = resolve_pip_command(executable) or [executable, "-m", "pip"]
    command = [
        *pip_command,
        "install",
        "--disable-pip-version-check",
        "--no-input",
        "--upgrade",
        "--no-deps",
        *_pip_install_options(environment),
        _XEDU_REPAIR_SPEC,
    ]
    result = _run_pip_install(command, use_mirror=use_mirror)
    if result.get("timed_out"):
        return {"success": False, "message": "安装 xedu-python 超时。"}
    if not result.get("success"):
        return {
            "success": False,
            "message": f"xedu-python 安装失败: {result.get('message') or '未知错误'}",
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
    pip_command = resolve_pip_command(executable) or [executable, "-m", "pip"]
    command = [
        *pip_command,
        "install",
        "--disable-pip-version-check",
        "--no-input",
        *_pip_install_options(environment),
        *packages,
    ]
    result = _run_pip_install(command, use_mirror=use_mirror)
    if result.get("timed_out"):
        return {"success": False, "message": "安装 XEduHub 运行依赖超时。"}
    if not result.get("success"):
        return {
            "success": False,
            "message": f"XEduHub 运行依赖安装失败: {result.get('message') or '未知错误'}",
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
    if environment.get("ssl_available") is False:
        detail = str(environment.get("ssl_error") or "无法导入 ssl 模块")
        return {
            "success": False,
            "changed": False,
            "error_code": "ssl_unavailable",
            "message": (
                "所选 Python 缺少 SSL 支持，pip 无法连接 HTTPS 软件源，因此无法自动安装或升级"
                " Jupyter/XEdu。请改用 python.org 完整安装版、Conda 环境或 XEdu Client 自带 Python；"
                "若必须使用当前环境，请补齐与其版本和架构匹配的 _ssl.pyd 及 OpenSSL DLL。"
                f"这不是 xedu-python 版本问题。检测详情：{detail}"
            ),
            "runtime": environment,
        }

    changed = False
    installed_packages = []
    warnings: list[str] = []
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

    missing_packages = _missing_jupyter_packages(environment)
    if missing_packages:
        pip_result = ensure_pip_once()
        if pip_result:
            pip_result["changed"] = False
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
        pip_result = ensure_pip_once()
        if pip_result:
            warnings.append(f"XEdu 增强功能未安装：{pip_result.get('message') or 'pip 不可用'}")
        else:
            installation = _install_xedu_package(
                executable,
                use_mirror=use_mirror,
                environment=environment,
            )
            if not installation.get("success"):
                warnings.append(installation.get("message") or "xedu-python 安装失败")
            else:
                installed_packages.extend(installation.get("installed_packages") or [])
                changed = True
                xedu_was_installed = True
                previous_environment = environment
                inspected_environment = inspect_python_environment(executable)
                if inspected_environment.get("success"):
                    environment = inspected_environment
                else:
                    warnings.append(
                        "xedu-python 安装后无法重新检查增强功能，Python 和 Jupyter 仍可继续使用。"
                    )
                    environment = previous_environment
                if not is_supported_xedu_version(environment.get("xedu_version")):
                    warnings.append(
                        "xedu-python 安装或升级后仍未达到"
                        f" {XEDU_PYTHON_MIN_VERSION}，当前为"
                        f" {environment.get('xedu_version') or '未知版本'}。"
                    )

    runtime_message = str(environment.get("xedu_runtime_message") or "")
    missing_runtime_module = "No module named" in runtime_message or "ModuleNotFoundError" in runtime_message
    needs_xedu_runtime_packages = (
        not environment.get("xedu_runtime_ok")
        and (xedu_was_installed or missing_runtime_module)
    )
    if needs_xedu_runtime_packages:
        pip_result = ensure_pip_once()
        if pip_result:
            warnings.append(f"XEduHub 运行依赖未安装：{pip_result.get('message') or 'pip 不可用'}")
        else:
            installation = _install_xedu_runtime_packages(
                executable,
                use_mirror=use_mirror,
                environment=environment,
            )
            if not installation.get("success"):
                warnings.append(installation.get("message") or "XEduHub 运行依赖安装失败")
            else:
                installed_packages.extend(installation.get("installed_packages") or [])
                changed = True
                previous_environment = environment
                inspected_environment = inspect_python_environment(executable)
                if inspected_environment.get("success"):
                    environment = inspected_environment
                else:
                    warnings.append("XEduHub 运行依赖安装后无法重新检查增强功能。")
                    environment = previous_environment

    if not environment.get("xedu_runtime_ok"):
        site_packages = environment.get("site_packages")
        if not site_packages:
            if environment.get("xedu_version"):
                warnings.append("无法定位 XEdu 增强功能的 site-packages。")
        elif environment.get("xedu_version"):
            metadata_result = patch_xedu_metadata(Path(site_packages))
            if not metadata_result.get("success"):
                warnings.append(metadata_result.get("message") or "XEdu 兼容信息修复失败")
            else:
                changed = bool(changed or metadata_result.get("changed"))
                previous_environment = environment
                inspected_environment = inspect_python_environment(executable)
                if inspected_environment.get("success"):
                    environment = inspected_environment
                else:
                    warnings.append("XEdu 兼容信息修复后无法重新检查增强功能。")
                    environment = previous_environment

    success = bool(
        environment.get("success")
        and not _missing_jupyter_packages(environment)
    )
    if not success:
        return {
            "success": False,
            "changed": changed,
            "message": f"Jupyter 环境仍不可用: {environment.get('message', '未知错误')}",
            "runtime": environment,
        }

    return {
        "success": True,
        "changed": changed,
        "message": (
            "Jupyter 环境已就绪，XEdu 增强功能暂不可用。"
            if warnings
            else ("Python 环境已修复" if changed else "Python 环境已就绪")
        ),
        "runtime": environment,
        "installed_packages": installed_packages,
        "warnings": warnings,
    }
