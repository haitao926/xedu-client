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
        "requests==2.33.0",
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
    probe = _run([sys.executable, "-m", "pip", "--version"], timeout=30)
    if probe.returncode == 0:
        return True, ""

    ensurepip = _run([sys.executable, "-m", "ensurepip", "--upgrade"], timeout=120)
    if ensurepip.returncode != 0:
        detail = (ensurepip.stderr or ensurepip.stdout or probe.stderr or "").strip()
        return False, f"当前 Python 没有可用 pip，无法自动安装后端依赖。{detail}"
    return True, ""


def _install_missing(packages: list[str]) -> dict[str, Any]:
    pip_ok, pip_message = _ensure_pip()
    if not pip_ok:
        return {"success": False, "message": pip_message, "missing": packages}

    command = [
        sys.executable,
        "-m",
        "pip",
        "install",
        "--disable-pip-version-check",
        "--no-input",
    ]
    # A system interpreter cannot normally write its global site-packages.
    # User installs remain visible to that interpreter and avoid requiring sudo.
    if sys.prefix == sys.base_prefix and not os.environ.get("VIRTUAL_ENV"):
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
