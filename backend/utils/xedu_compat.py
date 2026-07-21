"""Narrow compatibility handling for the pinned xedu-python release."""

from __future__ import annotations

import base64
import csv
import hashlib
import re
from pathlib import Path

XEDU_PYTHON_MIN_VERSION = "2.0.0"
# Keep the historical name for the reproducible portable-runtime pin.
XEDU_PYTHON_VERSION = XEDU_PYTHON_MIN_VERSION
XEDU_METADATA_MARKER = "XEdu-Client-Compatibility: modern-python-profile"
_STALE_REQUIREMENT_PATTERNS = (
    re.compile(r"^Requires-Dist:\s*onnxruntime\s*<1\.16\.0\s*$", re.IGNORECASE),
    re.compile(r"^Requires-Dist:\s*pillow\s*<=9\.5\.0\s*$", re.IGNORECASE),
)
_ORIGINAL_REQUIREMENTS = "onnxruntime <1.16.0; Pillow <=9.5.0"


def _version_tuple(version: str | None) -> tuple[int, int, int] | None:
    if not version:
        return None
    match = re.match(r"^\s*(\d+)(?:\.(\d+))?(?:\.(\d+))?", str(version))
    if not match:
        return None
    return tuple(int(part or 0) for part in match.groups())


def is_supported_xedu_version(version: str | None) -> bool:
    parsed = _version_tuple(version)
    minimum = _version_tuple(XEDU_PYTHON_MIN_VERSION)
    return parsed is not None and minimum is not None and parsed >= minimum


def _metadata_files(site_packages: Path):
    matches = []
    for metadata in sorted(site_packages.glob("*.dist-info/METADATA")):
        text = metadata.read_text(encoding="utf-8", errors="replace")
        fields = {
            line.split(":", 1)[0].lower(): line.split(":", 1)[1].strip()
            for line in text.splitlines()
            if ":" in line
        }
        if fields.get("name", "").replace("_", "-").lower() == "xedu-python":
            matches.append((metadata, text, fields.get("version", "")))
    return matches


def _update_record(dist_info: Path, metadata_path: Path, text: str) -> bool:
    record_path = dist_info / "RECORD"
    if not record_path.exists():
        return False
    relative_path = metadata_path.relative_to(dist_info.parent).as_posix()
    digest = base64.urlsafe_b64encode(hashlib.sha256(text.encode("utf-8")).digest()).decode("ascii").rstrip("=")
    with record_path.open("r", encoding="utf-8", newline="") as handle:
        rows = list(csv.reader(handle))
    updated = False
    for row in rows:
        if row and row[0] == relative_path:
            row[1:] = [f"sha256={digest}", str(len(text.encode("utf-8")))]
            updated = True
    if updated:
        with record_path.open("w", encoding="utf-8", newline="") as handle:
            csv.writer(handle, lineterminator="\n").writerows(rows)
    return updated


def patch_xedu_metadata(site_packages: Path) -> dict:
    """Apply the recorded modern-Python compatibility patch exactly once."""
    site_packages = Path(site_packages).resolve()
    matches = _metadata_files(site_packages)
    if len(matches) != 1:
        return {
            "success": False,
            "changed": False,
            "message": f"预期找到一个 xedu-python 元数据文件，实际找到 {len(matches)} 个。",
        }

    metadata_path, text, version = matches[0]
    if not is_supported_xedu_version(version):
        return {
            "success": False,
            "changed": False,
            "message": f"只允许修复 xedu-python>={XEDU_PYTHON_MIN_VERSION}，当前为 {version or '未知版本'}。",
        }

    if XEDU_METADATA_MARKER in text:
        return {
            "success": True,
            "changed": False,
            "message": "xedu-python 已应用现代 Python 兼容配置。",
            "metadata_path": str(metadata_path),
        }

    kept = []
    removed = []
    for line in text.splitlines():
        if any(pattern.match(line) for pattern in _STALE_REQUIREMENT_PATTERNS):
            removed.append(line)
        else:
            kept.append(line)
    if not removed:
        return {
            "success": True,
            "changed": False,
            "message": "未发现需要修复的 xedu-python 旧依赖约束。",
            "metadata_path": str(metadata_path),
        }

    patched = "\n".join(kept + [XEDU_METADATA_MARKER, f"XEdu-Client-Original-Requires-Dist: {_ORIGINAL_REQUIREMENTS}"]) + "\n"
    metadata_path.write_text(patched, encoding="utf-8")
    record_updated = _update_record(metadata_path.parent, metadata_path, patched)
    return {
        "success": True,
        "changed": True,
        "record_updated": record_updated,
        "message": "已移除 xedu-python 的两条过时依赖上限，并记录兼容配置。",
        "metadata_path": str(metadata_path),
    }
