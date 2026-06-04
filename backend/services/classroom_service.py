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
import socket
import tempfile
import threading
import time
import zipfile
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional
from urllib import error as urlerror, request as urlrequest
from urllib.parse import quote

from utils.logger import get_logger

logger = get_logger(__name__)

DISCOVERY_PORT = 39527
BROADCAST_INTERVAL = 2.0

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


class ClassroomService:
    def __init__(self) -> None:
        self._lock = threading.Lock()
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
        return self.status()

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

        tmp_file = tempfile.NamedTemporaryFile(delete=False, suffix=".zip")
        tmp_file.close()
        zip_path = Path(tmp_file.name)

        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zipf:
            for file_path, rel_path in _iter_course_files(local_path):
                if rel_path == "course.json":
                    continue
                zipf.write(file_path, rel_path)
            zipf.writestr("course.json", course_json_bytes)

        return zip_path

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
    def pull_package(package_url: str, target_path: str) -> Dict[str, Any]:
        if not package_url:
            raise ClassroomServiceError("课程包地址为空")

        if not target_path:
            default_root = Path.home() / "Documents" / "XeduCourses"
            default_root.mkdir(parents=True, exist_ok=True)
            target_path = str(default_root / "course")

        target_dir = Path(target_path)
        target_dir.mkdir(parents=True, exist_ok=True)

        req = urlrequest.Request(package_url)
        with urlrequest.urlopen(req, timeout=60) as resp:
            data = resp.read()

        with tempfile.TemporaryDirectory() as tmp_dir:
            zip_path = Path(tmp_dir) / "course.zip"
            zip_path.write_bytes(data)
            with zipfile.ZipFile(zip_path, "r") as zipf:
                zipf.extractall(target_dir)

        # Load course.json for response
        course_json_path = target_dir / "course.json"
        if not course_json_path.exists():
            raise ClassroomServiceError("课程包缺少 course.json")
        with course_json_path.open("r", encoding="utf-8") as f:
            course_data = json.load(f)

        return {
            "course": course_data,
            "local_path": str(target_dir),
            "summary": {
                "section_count": len(course_data.get("sections") or []),
            },
        }
