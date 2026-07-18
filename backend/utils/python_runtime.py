"""Helpers for validating the Python interpreter selected by the teacher."""

from __future__ import annotations

import os
import re
import subprocess
from pathlib import Path
from typing import Any


MIN_PYTHON_VERSION = (3, 10)
_VERSION_PATTERN = re.compile(r"Python\s+(\d+)\.(\d+)(?:\.(\d+))?")


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
