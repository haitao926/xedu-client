# -*- coding: utf-8 -*-
"""Resource handles and Scratch project runtime helpers."""

from __future__ import annotations

import io
import json
import os
import secrets
import stat
import time
import zipfile
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from typing import Any, Dict, List

from flask import current_app

from services.gitea_client import GiteaServiceError
from services.gitea_service import build_single_course_entry, load_course_data_from_repo, load_repo_tree_data


class ResourceHandleExpired(ValueError):
    pass


class InvalidResourceHandle(ValueError):
    pass


class InvalidScratchProject(ValueError):
    pass


class ScratchProjectTooLarge(ValueError):
    pass


MAX_SCRATCH_EXPANDED_BYTES = 256 * 1024 * 1024
MAX_SCRATCH_ARCHIVE_MEMBERS = 10_000


def validate_scratch_project_archive(
    data: bytes,
    *,
    max_expanded_bytes: int = MAX_SCRATCH_EXPANDED_BYTES,
) -> None:
    """Validate an SB3 archive before it can replace a local project."""

    try:
        with zipfile.ZipFile(io.BytesIO(data), "r") as archive:
            members = archive.infolist()
            if len(members) > MAX_SCRATCH_ARCHIVE_MEMBERS:
                raise InvalidScratchProject("Scratch 项目包含过多文件")

            expanded_size = 0
            names = set()
            for member in members:
                normalized_name = member.filename.replace("\\", "/")
                relative = PurePosixPath(normalized_name)
                if (
                    not normalized_name
                    or "\x00" in normalized_name
                    or relative.is_absolute()
                    or any(part in {"", ".", ".."} for part in relative.parts)
                    or stat.S_ISLNK(member.external_attr >> 16)
                    or normalized_name in names
                ):
                    raise InvalidScratchProject("Scratch 项目包含不安全的文件路径")
                names.add(normalized_name)
                expanded_size += max(0, member.file_size)
                if expanded_size > max_expanded_bytes:
                    raise ScratchProjectTooLarge("Scratch 项目超过允许的解压大小")

            if "project.json" not in names:
                raise InvalidScratchProject("Scratch 项目缺少 project.json")
            try:
                json.loads(archive.read("project.json").decode("utf-8"))
            except (KeyError, UnicodeDecodeError, json.JSONDecodeError) as exc:
                raise InvalidScratchProject("Scratch 项目的 project.json 无法解析") from exc
    except zipfile.BadZipFile as exc:
        raise InvalidScratchProject("Scratch 项目不是有效的 ZIP 文件") from exc


_READABLE_SUFFIXES = frozenset(
    {
        ".blockly.json",
        ".blockly.xml",
        ".css",
        ".html",
        ".ipynb",
        ".jpeg",
        ".jpg",
        ".js",
        ".json",
        ".md",
        ".mp3",
        ".mp4",
        ".png",
        ".py",
        ".sb3",
        ".svg",
        ".toolbox.json",
        ".txt",
        ".webm",
        ".webp",
        ".xml",
    }
)
_WRITABLE_SUFFIXES = frozenset({".sb3", ".toolbox.json"})


@dataclass(frozen=True)
class _RegisteredRoot:
    path: Path
    kind: str
    owner: str
    expires_at: float


@dataclass(frozen=True)
class _ResourceHandle:
    root_id: str
    relative_path: str
    operation: str
    expires_at: float


class ResourceHandleRegistry:
    """Owns resource roots and opaque handles for one backend process."""

    def __init__(self):
        self._roots: dict[str, _RegisteredRoot] = {}
        self._handles: dict[str, _ResourceHandle] = {}

    def register_root(self, root_path: Path, kind: str, owner: str, ttl_seconds: int = 3600) -> str:
        root = Path(root_path).expanduser().resolve()
        if not root.is_dir():
            raise InvalidResourceHandle("课程资源根目录不存在")
        root_id = secrets.token_urlsafe(24)
        self._roots[root_id] = _RegisteredRoot(root, str(kind), str(owner), time.monotonic() + ttl_seconds)
        return root_id

    def issue_handle(self, root_id: str, relative_path: str, operation: str, ttl_seconds: int = 300) -> str:
        root = self._get_root(root_id)
        relative = "" if not str(relative_path or "").strip() else self._validate_relative_path(root.path, relative_path, operation)
        handle = secrets.token_urlsafe(32)
        self._handles[handle] = _ResourceHandle(root_id, relative, operation, time.monotonic() + ttl_seconds)
        return handle

    def resolve(self, handle: str, operation: str, relative_path: str | None = None) -> Path:
        token = self._handles.get(str(handle or ""))
        if token is None or token.expires_at <= time.monotonic():
            self._handles.pop(str(handle or ""), None)
            raise ResourceHandleExpired("资源句柄已过期")
        # A project opened for editing also needs to be read by the Scratch VM.
        # The handle remains scoped to one registered root and, when provided,
        # one exact relative project path.
        if token.operation != operation and not (token.operation == "write" and operation == "read"):
            raise InvalidResourceHandle("资源句柄无此操作权限")
        root = self._get_root(token.root_id)
        requested = token.relative_path if relative_path is None else relative_path
        normalized = self._validate_relative_path(root.path, requested, operation)
        if token.relative_path and normalized != token.relative_path:
            raise InvalidResourceHandle("资源句柄不允许访问此文件")
        return root.path / normalized

    def _get_root(self, root_id: str) -> _RegisteredRoot:
        root = self._roots.get(root_id)
        if root is None or root.expires_at <= time.monotonic():
            self._roots.pop(root_id, None)
            raise ResourceHandleExpired("资源句柄已过期")
        return root

    @staticmethod
    def _validate_relative_path(root: Path, value: str, operation: str) -> str:
        relative = Path(str(value or "").strip())
        if relative.is_absolute() or not relative.parts or any(part in {"", ".", ".."} for part in relative.parts):
            raise InvalidResourceHandle("非法资源路径")
        target = (root / relative).resolve()
        if root != target and root not in target.parents:
            raise InvalidResourceHandle("非法资源路径")
        suffixes = "".join(target.suffixes[-2:]) if target.suffix == ".json" and len(target.suffixes) >= 2 else target.suffix.lower()
        allowed = _WRITABLE_SUFFIXES if operation == "write" else _READABLE_SUFFIXES
        if suffixes.lower() not in allowed:
            raise InvalidResourceHandle("不允许的资源类型")
        return relative.as_posix()


def _registry() -> ResourceHandleRegistry:
    return current_app.extensions["xedu_resource_handles"]


def register_resource_root(root_path: Path, kind: str, owner: str) -> str:
    return _registry().register_root(root_path, kind, owner)


def issue_resource_handle(root_id: str, relative_path: str, operation: str, ttl_seconds: int = 300) -> str:
    return _registry().issue_handle(root_id, relative_path, operation, ttl_seconds)


def resolve_resource_handle(handle: str, operation: str, relative_path: str | None = None) -> Path:
    return _registry().resolve(handle, operation, relative_path)


def resolve_local_course_file(base_path: str | Path, relpath: str) -> Path:
    base = Path(base_path).expanduser().resolve()
    target = (base / (relpath or "")).resolve()
    if base != target and base not in target.parents:
        raise ValueError("非法文件路径")
    return target




def normalize_resource_source(raw: Any, fallback_id: str, parse_bool) -> Dict[str, Any]:
    data = raw if isinstance(raw, dict) else {}
    source_id = str(data.get("id") or fallback_id).strip() or fallback_id
    base_url = str(data.get("base_url") or "").strip().rstrip("/")
    repo = str(data.get("repo") or "").strip().strip("/")
    branch = str(data.get("branch") or "main").strip() or "main"
    index_path = str(data.get("index_path") or "index.json").strip().lstrip("/")
    submit_url = str(data.get("submit_url") or "").strip()
    publish_path = str(data.get("publish_path") or "courses").strip().strip("/") or "courses"
    single_course_repo = parse_bool(data.get("single_course_repo"), False)
    name = str(data.get("name") or "").strip() or repo or source_id
    return {
        "id": source_id,
        "name": name,
        "base_url": base_url,
        "repo": repo,
        "branch": branch,
        "index_path": index_path or "index.json",
        "submit_url": submit_url,
        "publish_path": publish_path,
        "single_course_repo": single_course_repo,
        "enabled": parse_bool(data.get("enabled"), True),
    }


def legacy_resource_source(ui_config, parse_bool) -> Dict[str, Any]:
    return normalize_resource_source({
        "id": "default",
        "name": "默认课程源",
        "base_url": getattr(ui_config, "resources_base_url", ""),
        "repo": getattr(ui_config, "resources_repo", ""),
        "branch": getattr(ui_config, "resources_branch", "main"),
        "index_path": getattr(ui_config, "resources_index_path", "index.json"),
        "submit_url": getattr(ui_config, "resources_submit_url", ""),
        "publish_path": getattr(ui_config, "resources_publish_path", "courses"),
        "enabled": True,
    }, "default", parse_bool)


def collect_resource_sources(ui_config, parse_bool) -> List[Dict[str, Any]]:
    raw_sources = getattr(ui_config, "resources_sources", []) or []
    collected: List[Dict[str, Any]] = []
    if isinstance(raw_sources, list):
        for idx, raw in enumerate(raw_sources):
            src = normalize_resource_source(raw, f"source-{idx + 1}", parse_bool)
            if src["enabled"]:
                collected.append(src)

    legacy = legacy_resource_source(ui_config, parse_bool)
    if legacy["base_url"] and legacy["repo"]:
        legacy_key = (legacy["base_url"].lower(), legacy["repo"].lower(), legacy["branch"], legacy["index_path"])
        has_same = any((item["base_url"].lower(), item["repo"].lower(), item["branch"], item["index_path"]) == legacy_key for item in collected)
        if not has_same:
            collected.insert(0, legacy)

    seen_ids = set()
    for idx, item in enumerate(collected):
        sid = item.get("id") or f"source-{idx + 1}"
        if sid in seen_ids:
            sid = f"{sid}-{idx + 1}"
        item["id"] = sid
        seen_ids.add(sid)
    return collected


def pick_source_by_id(sources: List[Dict[str, Any]], source_id: str) -> Dict[str, Any] | None:
    if not source_id:
        return None
    for item in sources:
        if (item.get("id") or "") == source_id:
            return item
    return None


def resolve_resource_source_for_request(ui_config, parse_bool, *, source_id: str = "", source_override: Any = None) -> Dict[str, Any] | None:
    override = normalize_resource_source(source_override, "override", parse_bool)
    if override.get("base_url") and override.get("repo"):
        return override
    sources = collect_resource_sources(ui_config, parse_bool)
    selected = pick_source_by_id(sources, source_id)
    if selected:
        return selected
    legacy_source = legacy_resource_source(ui_config, parse_bool)
    if legacy_source.get("base_url") and legacy_source.get("repo"):
        return legacy_source
    for candidate in sources:
        if candidate.get("base_url") and candidate.get("repo"):
            return candidate
    return None


def derive_course_id_from_path(value: str) -> str:
    if not value:
        return ""
    clean = value.strip().split("?", 1)[0].strip("/")
    if not clean:
        return ""
    parts = [segment for segment in clean.split("/") if segment]
    if len(parts) >= 2:
        return parts[-2]
    return ""



def get_frontend_build_dir() -> Path:
    return Path(__file__).resolve().parents[2] / "build"


def get_scratch_editor_build_dir() -> Path:
    """Return the bundled Scratch editor build directory."""
    return Path(__file__).resolve().parents[2] / "scratch-editor" / "build"


def build_single_course_source_entry(*, base_url: str, repo: str, branch: str, raw_base_url: str, token: str) -> Dict[str, Any]:
    tree_items = load_repo_tree_data(base_url=base_url, repo=repo, branch=branch, token=token)
    paths = sorted(
        str(item.get("path") or "").strip().strip("/")
        for item in tree_items
        if str(item.get("type") or "").lower() == "blob"
    )
    if "course.json" in paths:
        course_path = "course.json"
    else:
        candidates = [path for path in paths if path.endswith("/course.json")]
        if len(candidates) != 1:
            if len(candidates) > 1:
                raise GiteaServiceError("仓库包含多个课程，请配置明确的 course_url 或 index.json")
            raise GiteaServiceError("仓库中未找到 course.json")
        course_path = candidates[0]

    course_data = load_course_data_from_repo(raw_base_url=raw_base_url, course_path=course_path, token=token)
    course_prefix = course_path.rsplit("/", 1)[0] if "/" in course_path else ""
    course_id = str(course_data.get("id") or "").strip()
    course_version = str(course_data.get("version") or "").strip()
    preferred_package_name = (
        f"{course_id}-{course_version}.zip".casefold()
        if course_id and course_version
        else ""
    )
    package_candidates = [
        path
        for path in paths
        if preferred_package_name
        and Path(path).name.casefold() == preferred_package_name
        and (not course_prefix or path.startswith(f"{course_prefix}/package/"))
    ]
    package_url = package_candidates[0] if package_candidates else ""
    return build_single_course_entry(
        course_data=course_data,
        course_url=course_path,
        package_url=package_url,
    )
