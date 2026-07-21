#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Classroom LAN publish/discovery service.
Provides broadcast discovery, local course index building, and package generation.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
import socket
import stat
import tempfile
import threading
import time
import zipfile
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path, PurePosixPath
from typing import Any, Callable, Dict, List, Optional, Tuple
from urllib import error as urlerror, request as urlrequest
from urllib.parse import quote, urlsplit

from utils.logger import get_logger

logger = get_logger(__name__)

DISCOVERY_PORT = 39527
BROADCAST_INTERVAL = 2.0
MAX_CLASSROOM_PACKAGE_BYTES = 256 * 1024 * 1024
MAX_CLASSROOM_EXPANDED_BYTES = 1024 * 1024 * 1024
MAX_CLASSROOM_ARCHIVE_MEMBERS = 10_000
CLASSROOM_PACKAGE_CACHE_TTL_SECONDS = 300.0
CLASSROOM_PACKAGE_CACHE_MAX_ENTRIES = 8
ProgressCallback = Optional[Callable[[Dict[str, Any]], None]]

DEFAULT_EXCLUDES = {
    ".git",
    ".DS_Store",
    "__pycache__",
    ".ipynb_checkpoints",
    "node_modules",
    "dist",
    "build",
}


class ClassroomServiceError(RuntimeError):
    pass


def _validate_package_url(package_url: str) -> str:
    value = str(package_url or "").strip()
    parsed = urlsplit(value)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise ClassroomServiceError("课堂课程包仅支持 HTTP(S) 地址")
    if parsed.username is not None or parsed.password is not None:
        raise ClassroomServiceError("课堂课程包地址不得包含凭据")
    return value


def _report_transfer_progress(progress_callback: ProgressCallback, **updates: Any) -> None:
    if callable(progress_callback):
        progress_callback(updates)


def _download_package(package_url: str, progress_callback: ProgressCallback = None) -> bytes:
    request = urlrequest.Request(package_url)
    try:
        with urlrequest.urlopen(request, timeout=60) as response:
            try:
                total_bytes = max(0, int(response.headers.get("Content-Length") or 0))
            except (AttributeError, TypeError, ValueError):
                total_bytes = 0
            if total_bytes > MAX_CLASSROOM_PACKAGE_BYTES:
                raise ClassroomServiceError("课堂课程包超过允许的下载大小")
            chunks = []
            total = 0
            while True:
                chunk = response.read(64 * 1024)
                if not chunk:
                    break
                total += len(chunk)
                if total > MAX_CLASSROOM_PACKAGE_BYTES:
                    raise ClassroomServiceError("课堂课程包超过允许的下载大小")
                chunks.append(chunk)
                percent = 5 + int((total / total_bytes) * 60) if total_bytes else 10
                _report_transfer_progress(
                    progress_callback,
                    phase="downloading",
                    percent=min(65, percent),
                    completed_files=0,
                    total_files=1,
                    completed_bytes=total,
                    total_bytes=total_bytes,
                    current_file=Path(urlsplit(package_url).path).name,
                    message="正在下载课堂课程包...",
                )
            return b"".join(chunks)
    except ClassroomServiceError:
        raise
    except (urlerror.HTTPError, urlerror.URLError, TimeoutError, OSError) as exc:
        raise ClassroomServiceError("课堂课程包地址不可用") from exc


def _validated_archive_members(archive: zipfile.ZipFile) -> List[zipfile.ZipInfo]:
    members = archive.infolist()
    if len(members) > MAX_CLASSROOM_ARCHIVE_MEMBERS:
        raise ClassroomServiceError("课堂课程包包含过多文件")

    expanded_size = 0
    for member in members:
        normalized_name = member.filename.replace("\\", "/")
        relative = PurePosixPath(normalized_name)
        if (
            not normalized_name
            or "\x00" in normalized_name
            or relative.is_absolute()
            or any(part in {"", ".", ".."} for part in relative.parts)
            or stat.S_ISLNK(member.external_attr >> 16)
        ):
            raise ClassroomServiceError("课堂课程包包含不安全的文件路径")
        expanded_size += max(0, member.file_size)
        if expanded_size > MAX_CLASSROOM_EXPANDED_BYTES:
            raise ClassroomServiceError("课堂课程包超过允许的解压大小")
    return members


def _extract_archive(
    archive: zipfile.ZipFile,
    members: List[zipfile.ZipInfo],
    staging_dir: Path,
    progress_callback: ProgressCallback = None,
) -> None:
    staging_root = staging_dir.resolve()
    completed_bytes = 0
    total_bytes = sum(max(0, member.file_size) for member in members)
    for index, member in enumerate(members, start=1):
        relative = PurePosixPath(member.filename.replace("\\", "/"))
        destination = (staging_root / Path(*relative.parts)).resolve()
        if staging_root != destination and staging_root not in destination.parents:
            raise ClassroomServiceError("课堂课程包包含不安全的文件路径")
        if member.is_dir():
            destination.mkdir(parents=True, exist_ok=True)
        else:
            destination.parent.mkdir(parents=True, exist_ok=True)
            with archive.open(member, "r") as source, destination.open("wb") as target:
                shutil.copyfileobj(source, target)
            completed_bytes += max(0, member.file_size)
        percent = 68 + int((completed_bytes / total_bytes) * 17) if total_bytes else 85
        _report_transfer_progress(
            progress_callback,
            phase="extracting",
            percent=min(85, percent),
            completed_files=index,
            total_files=len(members),
            completed_bytes=completed_bytes,
            total_bytes=total_bytes,
            current_file=relative.as_posix(),
            message=f"正在解压 {relative.as_posix()}",
        )


def _copy_staged_course(
    staging_dir: Path,
    target_dir: Path,
    progress_callback: ProgressCallback = None,
) -> None:
    target_root = target_dir.resolve()
    target_root.mkdir(parents=True, exist_ok=True)
    sources = list(staging_dir.rglob("*"))
    for index, source in enumerate(sources, start=1):
        relative = source.relative_to(staging_dir)
        destination = target_root / relative
        resolved_parent = destination.parent.resolve()
        if target_root != resolved_parent and target_root not in resolved_parent.parents:
            raise ClassroomServiceError("课堂课程目标目录包含不安全的符号链接")
        if destination.is_symlink():
            raise ClassroomServiceError("课堂课程目标目录包含不安全的符号链接")
        if source.is_dir():
            destination.mkdir(parents=True, exist_ok=True)
        else:
            destination.parent.mkdir(parents=True, exist_ok=True)
            with tempfile.NamedTemporaryFile(
                mode="wb",
                dir=destination.parent,
                prefix=f".{destination.name}.",
                delete=False,
            ) as temp_file, source.open("rb") as source_file:
                shutil.copyfileobj(source_file, temp_file)
                temp_path = Path(temp_file.name)
            os.replace(temp_path, destination)
        _report_transfer_progress(
            progress_callback,
            phase="writing",
            percent=min(97, 92 + int((index / max(1, len(sources))) * 5)),
            completed_files=index,
            total_files=len(sources),
            current_file=relative.as_posix(),
            message=f"正在写入 {relative.as_posix()}",
        )


def _generate_course_id(title: str) -> str:
    base = (title or "").strip().lower()
    slug = re.sub(r"[^a-z0-9]+", "-", base)
    slug = re.sub(r"-{2,}", "-", slug).strip("-")
    if slug:
        return slug
    digest = hashlib.sha1((title or "course").encode("utf-8")).hexdigest()[:8]
    return f"course-{digest}"


def _normalize_tags(value: Any) -> List[str]:
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    if isinstance(value, str):
        return [item.strip() for item in value.split(",") if item.strip()]
    return []


def _safe_share_id(course_id: str, title: str, fallback: str) -> str:
    base = (course_id or "").strip()
    if not base:
        base = _generate_course_id(title or fallback)
    safe = base.replace("/", "-").strip()
    if not safe:
        safe = _generate_course_id(title or fallback)
    return safe


def _iter_course_files(base: Path):
    for root, dirs, files in os.walk(base):
        dirs[:] = [d for d in dirs if d not in DEFAULT_EXCLUDES and not d.startswith(".")]
        for filename in files:
            if filename in DEFAULT_EXCLUDES or filename.startswith("."):
                continue
            file_path = Path(root) / filename
            rel = file_path.relative_to(base).as_posix()
            yield file_path, rel


@dataclass
class ClassroomConfig:
    active: bool = False
    name: str = ""
    code: str = ""
    port: int = 5123
    active_course_id: str = ""
    active_course_origin_id: str = ""
    active_course_title: str = ""
    active_section_index: Optional[int] = None
    active_section_title: str = ""


@dataclass
class _PackageCacheEntry:
    share_id: str
    version: str
    summary_digest: str
    master_path: Path
    building: bool = True
    build_error: Optional[BaseException] = None
    last_accessed_at: float = 0.0


class ClassroomService:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._package_cache_lock = threading.Lock()
        self._package_cache_condition = threading.Condition(self._package_cache_lock)
        self._package_cache_dir = Path(tempfile.mkdtemp(prefix="xedu-classroom-package-cache-"))
        self._package_cache: Dict[str, _PackageCacheEntry] = {}
        self._config = ClassroomConfig()
        self._courses: List[Dict[str, Any]] = []
        self._course_map: Dict[str, Dict[str, Any]] = {}
        self._course_id_map: Dict[str, str] = {}
        self._broadcast_thread: Optional[threading.Thread] = None
        self._broadcast_stop = threading.Event()
        self._server_id = f"srv-{int(time.time())}-{os.getpid()}"
        self._last_broadcast_at: Optional[float] = None

    def update_courses(self, courses: Any) -> int:
        cleaned: List[Dict[str, Any]] = []
        course_map: Dict[str, Dict[str, Any]] = {}
        course_id_map: Dict[str, str] = {}
        if not isinstance(courses, list):
            courses = []
        for idx, course in enumerate(courses):
            if not isinstance(course, dict):
                continue
            local_path = (course.get("local_path") or course.get("localPath") or "").strip()
            if not local_path:
                continue
            base = Path(local_path)
            if not base.exists() or not base.is_dir():
                continue
            title = str(course.get("title") or "").strip() or "未命名课程"
            course_id = str(course.get("id") or "").strip()
            share_id = _safe_share_id(course_id, title, f"course-{idx + 1}")
            entry = dict(course)
            entry["title"] = title
            entry["id"] = course_id or share_id
            entry["local_path"] = str(base)
            entry["share_id"] = share_id
            cleaned.append(entry)
            course_map[share_id] = entry
            if entry.get("id"):
                course_id_map[entry["id"]] = share_id

        with self._lock:
            self._courses = cleaned
            self._course_map = course_map
            self._course_id_map = course_id_map
            if self._config.active_course_id and self._config.active_course_id not in course_map:
                self._clear_active_course()

        return len(cleaned)

    def _resolve_share_id(self, course_id: str) -> Optional[str]:
        if not course_id:
            return None
        if course_id in self._course_map:
            return course_id
        return self._course_id_map.get(course_id)

    def _clear_active_course(self) -> None:
        self._config.active_course_id = ""
        self._config.active_course_origin_id = ""
        self._config.active_course_title = ""
        self._config.active_section_index = None
        self._config.active_section_title = ""

    def set_active_course(self, course_id: str, section_index: Any = None) -> Dict[str, Any]:
        with self._lock:
            share_id = self._resolve_share_id(course_id)
            course = self._course_map.get(share_id) if share_id else None

        if not course:
            raise ClassroomServiceError("未找到课程")

        data = self._load_course_data(course)
        sections = data.get("sections") or []
        section_idx: Optional[int] = None
        section_title = ""

        if section_index is not None and section_index != "":
            try:
                section_idx = int(section_index)
            except Exception:
                raise ClassroomServiceError("节次参数错误")
            if section_idx < 0 or section_idx >= len(sections):
                raise ClassroomServiceError("节次不存在")
            section = sections[section_idx] if section_idx < len(sections) else {}
            if isinstance(section, dict):
                section_title = section.get("title") or ""

        with self._lock:
            self._config.active_course_id = course.get("share_id") or share_id or ""
            self._config.active_course_origin_id = data.get("id") or course.get("id") or ""
            self._config.active_course_title = data.get("title") or course.get("title") or ""
            self._config.active_section_index = section_idx
            self._config.active_section_title = section_title

        return self.status()

    def start(self, name: str, code: str, port: int) -> Dict[str, Any]:
        with self._lock:
            self._config.active = True
            self._config.name = (name or "").strip()
            self._config.code = (code or "").strip()
            if port:
                self._config.port = int(port)

            if not self._broadcast_thread or not self._broadcast_thread.is_alive():
                self._broadcast_stop.clear()
                self._broadcast_thread = threading.Thread(
                    target=self._broadcast_loop,
                    name="classroom-broadcast",
                    daemon=True,
                )
                self._broadcast_thread.start()

        return self.status()

    def stop(self) -> Dict[str, Any]:
        with self._lock:
            self._config.active = False
            self._config.code = ""
            self._broadcast_stop.set()
            self._clear_active_course()
        self._clear_package_cache()
        return self.status()

    def _clear_package_cache(self) -> None:
        """Drop shared masters while leaving active request leases readable."""
        with self._package_cache_condition:
            entries = list(self._package_cache.values())
            self._package_cache.clear()
            for entry in entries:
                try:
                    entry.master_path.unlink(missing_ok=True)
                except OSError:
                    pass
            self._package_cache_condition.notify_all()

    def status(self) -> Dict[str, Any]:
        with self._lock:
            return {
                "active": self._config.active,
                "name": self._config.name,
                "code": self._config.code,
                "port": self._config.port,
                "course_count": len(self._courses),
                "server_id": self._server_id,
                "last_broadcast_at": self._last_broadcast_at,
                "active_course_id": self._config.active_course_id,
                "active_course_origin_id": self._config.active_course_origin_id,
                "active_course_title": self._config.active_course_title,
                "active_section_index": self._config.active_section_index,
                "active_section_title": self._config.active_section_title,
            }

    def _broadcast_loop(self) -> None:
        while not self._broadcast_stop.is_set():
            try:
                payload = self._build_broadcast_payload()
                data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
                with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
                    sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
                    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
                    sock.sendto(data, ("255.255.255.255", DISCOVERY_PORT))
                self._last_broadcast_at = time.time()
            except Exception as exc:
                logger.warning(f"课堂广播失败: {exc}")
            time.sleep(BROADCAST_INTERVAL)

    def _build_broadcast_payload(self) -> Dict[str, Any]:
        with self._lock:
            payload = {
                "type": "xedu-classroom",
                "server_id": self._server_id,
                "name": self._config.name or "课堂",
                "code": self._config.code,
                "port": self._config.port,
                "course_count": len(self._courses),
                "timestamp": int(time.time()),
                "version": "1",
            }
        return payload

    def get_course(self, share_id: str) -> Optional[Dict[str, Any]]:
        return self._course_map.get(share_id)

    def build_index(self, base_url: str) -> Dict[str, Any]:
        base = (base_url or "").rstrip("/")
        resources: List[Dict[str, Any]] = []
        with self._lock:
            courses = list(self._courses)
            config = ClassroomConfig(
                active=self._config.active,
                name=self._config.name,
                code=self._config.code,
                port=self._config.port,
                active_course_id=self._config.active_course_id,
                active_course_origin_id=self._config.active_course_origin_id,
                active_course_title=self._config.active_course_title,
                active_section_index=self._config.active_section_index,
                active_section_title=self._config.active_section_title,
            )

        for entry in courses:
            local_path = entry.get("local_path") or ""
            if not local_path:
                continue
            share_id = entry.get("share_id") or entry.get("id")
            if config.active_course_id and share_id != config.active_course_id:
                continue
            data = self._load_course_data(entry)
            share_id = entry.get("share_id") or data.get("id") or entry.get("id")
            if not share_id:
                continue
            version = str(data.get("version") or "1.0").strip() or "1.0"
            updated_at = (data.get("updated_at") or entry.get("updated_at") or datetime.utcnow().strftime("%Y-%m-%d"))

            safe_id = quote(str(share_id), safe="")
            safe_version = quote(version, safe="")
            course_url = f"{base}/api/classroom/course/{safe_id}/course.json"
            package_url = f"{base}/api/classroom/package/{safe_id}/{safe_version}.zip"

            item = {
                "id": share_id,
                "origin_id": entry.get("id") if entry.get("id") != share_id else entry.get("id"),
                "title": data.get("title", ""),
                "description": data.get("description", ""),
                "grade": data.get("grade", ""),
                "subject": data.get("subject", ""),
                "author": data.get("author", ""),
                "version": version,
                "updated_at": updated_at,
                "tags": _normalize_tags(data.get("tags")),
                "sections": data.get("sections") or [],
                "course_url": course_url,
                "package_url": package_url,
            }

            cover = data.get("cover") or entry.get("cover") or ""
            if isinstance(cover, str) and cover.strip():
                if cover.startswith("data:"):
                    item["cover_url"] = cover
                else:
                    cover_path = cover.strip().lstrip("/")
                    safe_cover = quote(cover_path, safe="/")
                    item["cover_url"] = f"{base}/api/classroom/file/{safe_id}/{safe_cover}"

            resources.append(item)

        index_data = {
            "version": "1.0",
            "updated_at": datetime.utcnow().strftime("%Y-%m-%d"),
            "resources": resources,
            "classroom": {
                "name": config.name or "课堂",
                "code": config.code,
                "course_count": len(resources),
                "server_id": self._server_id,
                "active_course_id": config.active_course_id,
                "active_course_origin_id": config.active_course_origin_id,
                "active_course_title": config.active_course_title,
                "active_section_index": config.active_section_index,
                "active_section_title": config.active_section_title,
            },
        }
        return index_data

    def _load_course_data(self, entry: Dict[str, Any]) -> Dict[str, Any]:
        local_path = Path(entry.get("local_path") or "")
        data: Dict[str, Any] = {}
        fallback = dict(entry)
        fallback.pop("share_id", None)

        course_file = local_path / "course.json"
        if course_file.exists():
            try:
                with course_file.open("r", encoding="utf-8") as f:
                    loaded = json.load(f)
                if isinstance(loaded, dict):
                    data.update(loaded)
            except Exception as exc:
                logger.warning(f"读取 course.json 失败: {course_file} {exc}")

        if not data:
            data.update(fallback)
        else:
            # Merge fallback for missing fields
            for key, value in fallback.items():
                if data.get(key) in (None, "") and value not in (None, ""):
                    data[key] = value

        if not data.get("title"):
            data["title"] = fallback.get("title") or "未命名课程"
        if not data.get("id"):
            data["id"] = fallback.get("id") or _generate_course_id(data.get("title", ""))

        if "sections" not in data or not isinstance(data.get("sections"), list):
            data["sections"] = fallback.get("sections") if isinstance(fallback.get("sections"), list) else []

        data["tags"] = _normalize_tags(data.get("tags"))
        return data

    def _summarize_package_content(self, local_path: Path, course_json_bytes: bytes) -> str:
        digest = hashlib.sha256()
        digest.update(course_json_bytes)
        for file_path, rel_path in sorted(_iter_course_files(local_path), key=lambda item: item[1]):
            if rel_path == "course.json":
                continue
            try:
                stat_result = file_path.stat()
                file_bytes = file_path.read_bytes()
            except OSError as exc:
                raise ClassroomServiceError("课程目录不可读") from exc
            digest.update(rel_path.encode("utf-8"))
            digest.update(b"\0")
            digest.update(str(stat_result.st_size).encode("utf-8"))
            digest.update(b"\0")
            digest.update(file_bytes)
            digest.update(b"\0")
        return digest.hexdigest()

    @staticmethod
    def _package_cache_key(share_id: str, version: str, summary_digest: str) -> str:
        return f"{share_id}:{version}:{summary_digest}"

    def _package_cache_master_path(self, cache_key: str) -> Path:
        safe_name = hashlib.sha1(cache_key.encode("utf-8")).hexdigest()
        return self._package_cache_dir / f"master-{safe_name}.zip"

    def _lease_package_path(self, master_path: Path) -> Path:
        with tempfile.NamedTemporaryFile(
            delete=False,
            dir=self._package_cache_dir,
            prefix="lease-",
            suffix=".zip",
        ) as temp_file:
            lease_path = Path(temp_file.name)
        lease_path.unlink(missing_ok=True)
        try:
            os.link(master_path, lease_path)
        except OSError:
            shutil.copyfile(master_path, lease_path)
        return lease_path

    def _write_package_zip(self, local_path: Path, course_json_bytes: bytes, target_path: Path) -> None:
        with zipfile.ZipFile(target_path, "w", zipfile.ZIP_DEFLATED) as zipf:
            for file_path, rel_path in _iter_course_files(local_path):
                if rel_path == "course.json":
                    continue
                zipf.write(file_path, rel_path)
            zipf.writestr("course.json", course_json_bytes)

    def _prune_package_cache_locked(
        self,
        *,
        keep_key: Optional[str] = None,
        active_scope: Optional[Tuple[str, str]] = None,
    ) -> None:
        now = time.monotonic()
        removable: List[str] = []
        scope_key = active_scope or ("", "")

        for cache_key, entry in self._package_cache.items():
            if cache_key == keep_key or entry.building:
                continue
            expired = now - entry.last_accessed_at > CLASSROOM_PACKAGE_CACHE_TTL_SECONDS
            missing = not entry.master_path.exists()
            superseded = (
                active_scope is not None
                and (entry.share_id, entry.version) == scope_key
                and cache_key != keep_key
            )
            if expired or missing or superseded:
                removable.append(cache_key)

        ready_entries = [
            key
            for key, entry in self._package_cache.items()
            if not entry.building and key not in removable
        ]
        if len(ready_entries) > CLASSROOM_PACKAGE_CACHE_MAX_ENTRIES:
            ready_entries.sort(key=lambda key: self._package_cache[key].last_accessed_at)
            removable.extend(ready_entries[: len(ready_entries) - CLASSROOM_PACKAGE_CACHE_MAX_ENTRIES])

        for cache_key in set(removable):
            entry = self._package_cache.pop(cache_key, None)
            if not entry:
                continue
            try:
                entry.master_path.unlink(missing_ok=True)
            except OSError:
                pass

    def _get_cached_package_path(
        self,
        *,
        share_id: str,
        version: str,
        local_path: Path,
        course_json_bytes: bytes,
    ) -> Path:
        summary_digest = self._summarize_package_content(local_path, course_json_bytes)
        cache_key = self._package_cache_key(share_id, version, summary_digest)
        scope = (share_id, version)
        builder = False
        master_path = self._package_cache_master_path(cache_key)

        while True:
            with self._package_cache_condition:
                self._prune_package_cache_locked(keep_key=cache_key, active_scope=scope)
                entry = self._package_cache.get(cache_key)
                if entry and not entry.building and entry.build_error is None and entry.master_path.exists():
                    entry.last_accessed_at = time.monotonic()
                    return self._lease_package_path(entry.master_path)
                if entry and entry.build_error is not None:
                    error = entry.build_error
                    self._package_cache.pop(cache_key, None)
                    raise ClassroomServiceError("生成课程包失败") from error
                if entry and entry.building:
                    self._package_cache_condition.wait()
                    continue

                self._package_cache[cache_key] = _PackageCacheEntry(
                    share_id=share_id,
                    version=version,
                    summary_digest=summary_digest,
                    master_path=master_path,
                    building=True,
                    last_accessed_at=time.monotonic(),
                )
                builder = True
                break

        if builder:
            temp_master = self._package_cache_dir / f".{master_path.name}.{os.getpid()}.{threading.get_ident()}.tmp"
            try:
                self._write_package_zip(local_path, course_json_bytes, temp_master)
                os.replace(temp_master, master_path)
            except Exception as exc:
                try:
                    temp_master.unlink(missing_ok=True)
                except OSError:
                    pass
                with self._package_cache_condition:
                    entry = self._package_cache.get(cache_key)
                    if entry:
                        entry.building = False
                        entry.build_error = exc
                    self._package_cache_condition.notify_all()
                raise

            with self._package_cache_condition:
                entry = self._package_cache.get(cache_key)
                if not entry:
                    entry = _PackageCacheEntry(
                        share_id=share_id,
                        version=version,
                        summary_digest=summary_digest,
                        master_path=master_path,
                        building=False,
                        last_accessed_at=time.monotonic(),
                    )
                    self._package_cache[cache_key] = entry
                entry.building = False
                entry.build_error = None
                entry.last_accessed_at = time.monotonic()
                self._prune_package_cache_locked(keep_key=cache_key, active_scope=scope)
                lease_path = self._lease_package_path(entry.master_path)
                self._package_cache_condition.notify_all()
                return lease_path

    def build_package(self, share_id: str, version: str) -> Path:
        with self._lock:
            active_course_id = self._config.active_course_id
        if active_course_id and share_id != active_course_id:
            raise ClassroomServiceError("课程未发布")
        course = self.get_course(share_id)
        if not course:
            raise ClassroomServiceError("未找到课程")
        local_path = Path(course.get("local_path") or "")
        if not local_path.exists() or not local_path.is_dir():
            raise ClassroomServiceError("课程目录不存在")

        data = self._load_course_data(course)
        data["id"] = data.get("id") or share_id
        data["version"] = version or data.get("version") or "1.0"
        course_json_bytes = json.dumps(data, ensure_ascii=False, indent=2).encode("utf-8")
        try:
            return self._get_cached_package_path(
                share_id=share_id,
                version=str(data["version"]),
                local_path=local_path,
                course_json_bytes=course_json_bytes,
            )
        except ClassroomServiceError:
            raise
        except Exception as exc:
            raise ClassroomServiceError("生成课程包失败") from exc

    def read_course_json_bytes(self, share_id: str) -> bytes:
        with self._lock:
            active_course_id = self._config.active_course_id
        if active_course_id and share_id != active_course_id:
            raise ClassroomServiceError("课程未发布")
        course = self.get_course(share_id)
        if not course:
            raise ClassroomServiceError("未找到课程")
        data = self._load_course_data(course)
        return json.dumps(data, ensure_ascii=False, indent=2).encode("utf-8")

    def resolve_file_path(self, share_id: str, rel_path: str) -> Path:
        with self._lock:
            active_course_id = self._config.active_course_id
        if active_course_id and share_id != active_course_id:
            raise ClassroomServiceError("课程未发布")
        course = self.get_course(share_id)
        if not course:
            raise ClassroomServiceError("未找到课程")
        base = Path(course.get("local_path") or "")
        if not base.exists() or not base.is_dir():
            raise ClassroomServiceError("课程目录不存在")
        clean_rel = (rel_path or "").replace("\\", "/").lstrip("/")
        if ".." in clean_rel.split("/"):
            raise ClassroomServiceError("非法路径")
        target = (base / clean_rel).resolve()
        if not str(target).startswith(str(base.resolve())):
            raise ClassroomServiceError("非法路径")
        return target

    @staticmethod
    def discover(timeout: float = 1.5, max_results: int = 6) -> List[Dict[str, Any]]:
        results: Dict[str, Dict[str, Any]] = {}
        end_time = time.time() + max(0.2, timeout)

        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        try:
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEPORT, 1)
            except Exception:
                pass
            try:
                sock.bind(("", DISCOVERY_PORT))
            except Exception:
                return []
            sock.settimeout(0.3)

            while time.time() < end_time and len(results) < max_results:
                try:
                    data, addr = sock.recvfrom(4096)
                except socket.timeout:
                    continue
                except Exception:
                    break
                try:
                    payload = json.loads(data.decode("utf-8"))
                except Exception:
                    continue
                if not isinstance(payload, dict) or payload.get("type") != "xedu-classroom":
                    continue

                host = addr[0]
                server_id = payload.get("server_id") or f"{host}:{payload.get('port')}"
                if server_id in results:
                    results[server_id]["last_seen"] = int(time.time())
                    continue
                results[server_id] = {
                    "server_id": server_id,
                    "name": payload.get("name") or "课堂",
                    "code": str(payload.get("code") or "").strip(),
                    "host": host,
                    "port": int(payload.get("port") or 5123),
                    "course_count": int(payload.get("course_count") or 0),
                    "last_seen": int(time.time()),
                }
        finally:
            try:
                sock.close()
            except Exception:
                pass

        return list(results.values())

    @staticmethod
    def fetch_index(base_url: str) -> Dict[str, Any]:
        if not base_url:
            raise ClassroomServiceError("课堂地址为空")
        base = base_url.rstrip("/")
        req = urlrequest.Request(f"{base}/api/classroom/index")
        try:
            with urlrequest.urlopen(req, timeout=10) as resp:
                raw = resp.read().decode("utf-8")
            payload = json.loads(raw)
            if not isinstance(payload, dict):
                raise ClassroomServiceError("课堂索引格式错误")
            if not payload.get("success"):
                raise ClassroomServiceError(str(payload.get("message") or "课堂索引不可用"))
            index = payload.get("index")
            if not isinstance(index, dict):
                raise ClassroomServiceError("课堂索引格式错误")
            return {
                "index": index,
                "source_url": payload.get("source_url") or f"{base}/api/classroom/index",
                "branch": payload.get("branch") or "classroom",
                "repo_url": base,
                "raw_base_url": base,
            }
        except urlerror.HTTPError as exc:
            raise ClassroomServiceError(f"课堂索引不可用: HTTP {exc.code}") from exc
        except (urlerror.URLError, TimeoutError, OSError) as exc:
            raise ClassroomServiceError(f"课堂地址不可达: {base}") from exc
        except json.JSONDecodeError as exc:
            raise ClassroomServiceError("课堂索引格式错误") from exc

    @staticmethod
    def pull_package(
        package_url: str,
        target_path: str,
        progress_callback: ProgressCallback = None,
    ) -> Dict[str, Any]:
        package_url = _validate_package_url(package_url)

        if not target_path:
            default_root = Path.home() / "Documents" / "XeduCourses"
            default_root.mkdir(parents=True, exist_ok=True)
            target_path = str(default_root / "course")

        target_dir = Path(target_path).expanduser()
        _report_transfer_progress(
            progress_callback,
            phase="downloading",
            percent=5,
            completed_files=0,
            total_files=1,
            message="正在下载课堂课程包...",
        )
        data = _download_package(package_url, progress_callback)

        with tempfile.TemporaryDirectory() as tmp_dir:
            zip_path = Path(tmp_dir) / "course.zip"
            zip_path.write_bytes(data)
            staging_dir = Path(tmp_dir) / "extracted"
            staging_dir.mkdir()
            try:
                with zipfile.ZipFile(zip_path, "r") as archive:
                    members = _validated_archive_members(archive)
                    _report_transfer_progress(
                        progress_callback,
                        phase="extracting",
                        percent=68,
                        completed_files=0,
                        total_files=len(members),
                        message="正在解压课堂课程包...",
                    )
                    _extract_archive(archive, members, staging_dir, progress_callback)
            except (zipfile.BadZipFile, OSError) as exc:
                raise ClassroomServiceError("课堂课程包格式错误") from exc

            course_json_path = staging_dir / "course.json"
            if not course_json_path.is_file():
                raise ClassroomServiceError("课程包缺少 course.json")
            _report_transfer_progress(
                progress_callback,
                phase="validating",
                percent=88,
                message="正在校验课堂课程结构...",
            )
            try:
                with course_json_path.open("r", encoding="utf-8") as course_file:
                    course_data = json.load(course_file)
            except (OSError, UnicodeError, json.JSONDecodeError) as exc:
                raise ClassroomServiceError("课程包 course.json 无法解析") from exc
            _report_transfer_progress(
                progress_callback,
                phase="writing",
                percent=92,
                completed_files=0,
                message="正在写入本地课程...",
            )
            _copy_staged_course(staging_dir, target_dir, progress_callback)

        return {
            "course": course_data,
            "local_path": str(target_dir),
            "summary": {
                "section_count": len(course_data.get("sections") or []),
            },
        }
