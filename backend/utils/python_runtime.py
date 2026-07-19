"""Helpers for validating the Python interpreter selected by the teacher."""

from __future__ import annotations

import os
import json
import re
import subprocess
from pathlib import Path
from typing import Any

from utils.xedu_compat import XEDU_PYTHON_VERSION, patch_xedu_metadata


MIN_PYTHON_VERSION = (3, 10)
_VERSION_PATTERN = re.compile(r"Python\s+(\d+)\.(\d+)(?:\.(\d+))?")
_ENVIRONMENT_MARKER = "__XEDU_ENVIRONMENT__="
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
    payload["xedu_expected_version"] = XEDU_PYTHON_VERSION
    payload["xedu_version_ok"] = payload.get("xedu_version") == XEDU_PYTHON_VERSION
    payload["xedu_repair_available"] = payload.get("xedu_version") == XEDU_PYTHON_VERSION and not payload.get("xedu_runtime_ok")
    return payload


def repair_xedu_python_environment(executable: str) -> dict[str, Any]:
    """Patch only the known xedu-python metadata mismatch, then re-probe."""
    environment = inspect_python_environment(executable)
    if not environment.get("success"):
        return environment
    if environment.get("xedu_version") != XEDU_PYTHON_VERSION:
        return {
            "success": False,
            "changed": False,
            "message": f"只允许修复 xedu-python=={XEDU_PYTHON_VERSION}，当前环境未满足版本要求。",
        }
    site_packages = environment.get("site_packages")
    if not site_packages:
        return {"success": False, "changed": False, "message": "无法定位所选 Python 的 site-packages。"}
    result = patch_xedu_metadata(Path(site_packages))
    if not result.get("success"):
        return result
    after = inspect_python_environment(executable)
    result["runtime"] = after
    result["success"] = bool(after.get("success") and after.get("xedu_runtime_ok"))
    if not result["success"]:
        if result.get("changed"):
            result["message"] = f"元数据已修复，但 XEduHub 探针仍失败: {after.get('xedu_runtime_message') or after.get('message', '未知错误')}"
        else:
            result["message"] = f"没有可修复的依赖元数据，XEduHub 探针仍失败: {after.get('xedu_runtime_message') or after.get('message', '未知错误')}"
    return result
