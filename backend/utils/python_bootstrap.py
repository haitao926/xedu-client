"""Bootstrap dependencies required before the Flask backend can be imported."""

from __future__ import annotations

import importlib.util
import argparse
import json
import os
import subprocess
import sys
import sysconfig
from pathlib import Path
from typing import Any


BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from utils.python_runtime import (  # noqa: E402
    _conda_activation_path_entries,
    _conda_prefix_for_executable,
    find_sibling_pip_command,
    resolve_pip_command,
)

_conda_dll_directories_added = False


def _ensure_conda_dll_directories() -> None:
    """Expose this interpreter's Conda DLL directories to its own loader.

    The bootstrap runs *inside* the teacher-selected interpreter, so a parent
    PATH tweak cannot help it. When that interpreter is a Conda/XEdu environment
    launched without activation, register its ``Library\\bin`` (and siblings) via
    ``os.add_dll_directory`` so ``import ssl`` and pip's HTTPS stack resolve the
    OpenSSL DLLs exactly as an activated shell would.
    """
    global _conda_dll_directories_added
    if _conda_dll_directories_added:
        return
    _conda_dll_directories_added = True

    prefix = _conda_prefix_for_executable(sys.executable)
    if not prefix:
        return
    entries = _conda_activation_path_entries(prefix)
    if not entries:
        return

    current_path = os.environ.get("PATH", "")
    path_parts = current_path.split(os.pathsep) if current_path else []
    seen = {os.path.normcase(part) for part in path_parts}
    prepend: list[str] = []
    for entry in entries:
        if os.path.normcase(entry) not in seen:
            prepend.append(entry)
            seen.add(os.path.normcase(entry))
        if hasattr(os, "add_dll_directory"):
            try:
                os.add_dll_directory(entry)
            except (OSError, FileNotFoundError):
                pass
    os.environ["PATH"] = os.pathsep.join([*prepend, *path_parts])
    os.environ.setdefault("CONDA_PREFIX", str(prefix))



_BOOTSTRAP_MODULES = (
    ("flask", "Flask"),
    ("requests", "requests"),
    ("dotenv", "python-dotenv"),
    ("PIL", "Pillow"),
    ("psutil", "psutil"),
    ("markdown", "markdown"),
    ("pygments", "Pygments"),
    ("yaml", "PyYAML"),
)


def _bootstrap_specs() -> list[str]:
    """Choose the newest backend-safe pins for the selected Python version."""
    if sys.version_info < (3, 10):
        return [
            "Flask==2.3.3",
            "requests==2.32.3",
            "python-dotenv==1.0.1",
            "Pillow==10.4.0",
            "psutil==5.9.8",
            "markdown==3.7",
            "Pygments==2.17.2",
            "PyYAML==6.0.1",
        ]
    return [
        "Flask==3.1.3",
        "requests==2.32.5",
        "python-dotenv==1.2.2",
        "Pillow==12.3.0",
        "psutil==5.9.8",
        "markdown==3.8.1",
        "Pygments==2.20.0",
        "PyYAML==6.0.1",
    ]


def missing_backend_packages() -> list[str]:
    """Return distributions whose imports are needed to construct the Flask app."""
    return [
        package
        for module, package in _BOOTSTRAP_MODULES
        if importlib.util.find_spec(module) is None
    ]


def missing_runtime_support_packages() -> list[str]:
    """Return repair-time packages without making Flask a repair prerequisite."""
    return [
        package
        for module, package in _BOOTSTRAP_MODULES
        if module != "flask" and importlib.util.find_spec(module) is None
    ]


def _run(command: list[str], *, timeout: int = 300) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        command,
        capture_output=True,
        text=True,
        timeout=timeout,
        check=False,
    )


def _ensure_pip() -> tuple[bool, str]:
    _ensure_conda_dll_directories()
    probe = _run([sys.executable, "-m", "pip", "--version"], timeout=30)
    if probe.returncode == 0:
        return True, ""

    if find_sibling_pip_command(sys.executable, runner=_run):
        return True, ""

    ensurepip = _run([sys.executable, "-m", "ensurepip", "--upgrade"], timeout=120)
    if ensurepip.returncode != 0:
        probe_detail = " ".join((probe.stderr or probe.stdout or "").split())[-600:] or "未返回详细错误"
        ensure_detail = " ".join((ensurepip.stderr or ensurepip.stdout or "").split())[-600:] or "未返回详细错误"
        return False, (
            "所选 Python 没有可用 pip，且无法通过 ensurepip 自动补齐。"
            f"pip 检测: {probe_detail}；ensurepip: {ensure_detail}"
        )

    reprobe = _run([sys.executable, "-m", "pip", "--version"], timeout=30)
    if reprobe.returncode == 0:
        return True, ""
    detail = " ".join((reprobe.stderr or reprobe.stdout or "").split())[-600:] or "未返回详细错误"
    return False, f"ensurepip 已执行，但所选 Python 仍无法使用 pip。{detail}"


def _ssl_support_error() -> str:
    _ensure_conda_dll_directories()
    try:
        import ssl

        ssl.create_default_context()
        return ""
    except Exception as exc:
        return f"{type(exc).__name__}: {exc}"


def _ssl_unavailable_result(detail: str, *, missing: list[str] | None = None) -> dict[str, Any]:
    return {
        "success": False,
        "changed": False,
        "error_code": "ssl_unavailable",
        "message": (
            "所选 Python 缺少 SSL 支持，pip 无法连接 HTTPS 软件源。请改用完整安装版 Python、"
            "Conda 环境或 XEdu Client 自带 Python；这不是 xedu-python 版本问题。"
            f"检测详情：{detail}"
        ),
        "missing": missing or [],
    }


def _install_missing(packages: list[str]) -> dict[str, Any]:
    ssl_error = _ssl_support_error()
    if ssl_error:
        return _ssl_unavailable_result(ssl_error, missing=packages)

    pip_ok, pip_message = _ensure_pip()
    if not pip_ok:
        return {"success": False, "message": pip_message, "missing": packages}

    pip_command = resolve_pip_command(sys.executable) or [sys.executable, "-m", "pip"]
    command = [
        *pip_command,
        "install",
        "--disable-pip-version-check",
        "--no-input",
    ]
    # A system interpreter cannot normally write its global site-packages.
    # User installs remain visible to that interpreter and avoid requiring sudo.
    if (
        sys.prefix == sys.base_prefix
        and not os.environ.get("VIRTUAL_ENV")
        and _conda_prefix_for_executable(sys.executable) is None
    ):
        command.append("--user")
    stdlib = Path(sysconfig.get_path("stdlib") or "")
    if (stdlib / "EXTERNALLY-MANAGED").is_file():
        command.append("--break-system-packages")
    command.extend(spec for spec in _bootstrap_specs() if spec.split("=", 1)[0] in packages)

    configured_index = (os.environ.get("XEDU_PIP_INDEX_URL") or "").strip()
    indexes = [configured_index] if configured_index else [""]
    if "https://pypi.org/simple" not in indexes:
        indexes.append("https://pypi.org/simple")

    failures: list[str] = []
    for index_url in indexes:
        attempt = list(command)
        if index_url:
            attempt.extend(["--index-url", index_url])
        try:
            result = _run(attempt)
        except (OSError, subprocess.SubprocessError) as exc:
            failures.append(str(exc))
            continue
        if result.returncode == 0:
            return {"success": True, "installed": packages}
        detail = (result.stderr or result.stdout or "").strip()
        failures.append(detail or f"pip exited with code {result.returncode}")

    return {
        "success": False,
        "message": f"自动安装后端依赖失败。{' | '.join(failures)}",
        "missing": packages,
    }


def ensure_backend_dependencies() -> dict[str, Any]:
    """Make the selected interpreter capable of importing the backend itself."""
    missing = missing_backend_packages()
    if not missing:
        return {"success": True, "changed": False, "missing": []}

    result = _install_missing(missing)
    if not result.get("success"):
        return {**result, "changed": False}

    remaining = missing_backend_packages()
    if remaining:
        return {
            "success": False,
            "changed": True,
            "missing": remaining,
            "message": f"依赖安装完成后仍无法导入: {', '.join(remaining)}",
        }
    return {"success": True, "changed": True, "missing": []}


def repair_xedu_environment_standalone() -> dict[str, Any]:
    """Repair XEdu/Jupyter in the selected interpreter without importing Flask."""
    ssl_error = _ssl_support_error()
    if ssl_error:
        return _ssl_unavailable_result(ssl_error)

    pip_ok, pip_message = _ensure_pip()
    if not pip_ok:
        return {"success": False, "changed": False, "message": pip_message}

    try:
        from utils.python_runtime import repair_xedu_python_environment

        result = repair_xedu_python_environment(
            sys.executable,
            use_mirror=(os.environ.get("XEDU_PIP_INDEX_URL", "") != "https://pypi.org/simple"),
        )
    except Exception as exc:
        return {
            "success": False,
            "changed": False,
            "message": f"XEdu 环境修复失败: {exc}",
        }

    return result


def inspect_xedu_environment_standalone() -> dict[str, Any]:
    """Probe the selected interpreter without importing Flask or starting the backend."""
    from utils.python_runtime import inspect_python_environment

    return inspect_python_environment(sys.executable)


def _cli() -> int:
    """Run standalone dependency preparation before the Flask backend exists."""
    parser = argparse.ArgumentParser(description="Prepare XEdu Client backend dependencies")
    repair_group = parser.add_mutually_exclusive_group(required=True)
    repair_group.add_argument(
        "--repair",
        action="store_true",
        help="install the small dependency set required to start the backend",
    )
    repair_group.add_argument(
        "--repair-xedu",
        action="store_true",
        help="repair XEdu/Jupyter without requiring Flask or a running backend",
    )
    repair_group.add_argument(
        "--inspect-xedu",
        action="store_true",
        help="inspect XEdu/Jupyter without requiring Flask or a running backend",
    )
    args = parser.parse_args()

    try:
        result = (
            repair_xedu_environment_standalone()
            if args.repair_xedu
            else inspect_xedu_environment_standalone()
            if args.inspect_xedu
            else ensure_backend_dependencies()
        )
    except (OSError, subprocess.SubprocessError, TimeoutError) as exc:
        result = {
            "success": False,
            "changed": False,
            "missing": missing_backend_packages(),
            "message": f"自动准备后端依赖失败: {exc}",
        }
    print("__XEDU_BOOTSTRAP__=" + json.dumps(result, ensure_ascii=False), flush=True)
    return 0 if result.get("success") else 1


if __name__ == "__main__":
    raise SystemExit(_cli())


__all__ = [
    "ensure_backend_dependencies",
    "missing_backend_packages",
    "missing_runtime_support_packages",
    "repair_xedu_environment_standalone",
    "inspect_xedu_environment_standalone",
]
