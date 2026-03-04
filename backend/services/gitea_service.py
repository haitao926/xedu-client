"""
Gitea publish/pull utilities for course resources.
"""

from __future__ import annotations

import base64
import hashlib
import json
import os
import re
import tempfile
import zipfile
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple
from urllib import request, error, parse

from utils.logger import get_logger

logger = get_logger(__name__)


DEFAULT_EXCLUDES = {
    ".git",
    ".DS_Store",
    "__pycache__",
    ".ipynb_checkpoints",
    "node_modules",
    "dist",
    "build",
}

MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB
IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".webp"}


@dataclass
class CourseScanResult:
    course: Dict[str, Any]
    summary: Dict[str, Any]


class GiteaServiceError(RuntimeError):
    pass


class GiteaClient:
    def __init__(self, base_url: str, repo: str, branch: str, token: str):
        if not base_url or not repo:
            raise GiteaServiceError("资源库配置不完整")
        if "/" not in repo:
            raise GiteaServiceError("资源库格式应为 owner/repo")
        self.base_url = base_url.rstrip("/")
        self.repo = repo.strip("/")
        self.branch = branch or "main"
        self.token = token or ""
        self.owner, self.repo_name = self.repo.split("/", 1)

    @property
    def raw_base_url(self) -> str:
        return f"{self.base_url}/{self.repo}/raw/{self.branch}"

    def _api_url(self, path: str) -> str:
        return f"{self.base_url}/api/v1{path}"

    def _request(
        self,
        method: str,
        path: str,
        payload: Optional[Dict[str, Any]] = None,
        params: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        url = self._api_url(path)
        if params:
            url = f"{url}?{parse.urlencode(params)}"

        data = None
        if payload is not None:
            data = json.dumps(payload).encode("utf-8")

        req = request.Request(url, data=data, method=method)
        req.add_header("Content-Type", "application/json")
        if self.token:
            req.add_header("Authorization", f"token {self.token}")

        try:
            with request.urlopen(req, timeout=30) as resp:
                raw = resp.read().decode("utf-8")
                return json.loads(raw) if raw else {}
        except error.HTTPError as exc:
            msg = exc.read().decode("utf-8") if exc.fp else ""
            raise GiteaServiceError(f"Gitea 请求失败: HTTP {exc.code} {exc.reason} {msg}") from exc
        except Exception as exc:
            raise GiteaServiceError(f"Gitea 请求失败: {exc}") from exc

    def get_content(self, path: str) -> Optional[Dict[str, Any]]:
        try:
            return self._request(
                "GET",
                f"/repos/{self.owner}/{self.repo_name}/contents/{path}",
                params={"ref": self.branch},
            )
        except GiteaServiceError as exc:
            if "HTTP 404" in str(exc):
                return None
            raise

    def upsert_file(self, path: str, content: bytes, message: str) -> Dict[str, Any]:
        encoded = base64.b64encode(content).decode("utf-8")
        payload: Dict[str, Any] = {
            "content": encoded,
            "message": message,
            "branch": self.branch,
        }
        existing = self.get_content(path)
        if existing and existing.get("sha"):
            payload["sha"] = existing["sha"]
        return self._request(
            "PUT",
            f"/repos/{self.owner}/{self.repo_name}/contents/{path}",
            payload=payload,
        )


def _normalize_course_data(course: Dict[str, Any]) -> Dict[str, Any]:
    normalized = dict(course or {})
    normalized.setdefault("sections", [])
    normalized.setdefault("tags", [])
    normalized["sections"] = normalized.get("sections") or []
    normalized["tags"] = normalized.get("tags") or []
    return normalized


def _generate_course_id(title: str) -> str:
    base = (title or "").strip().lower()
    slug = re.sub(r"[^a-z0-9]+", "-", base)
    slug = re.sub(r"-{2,}", "-", slug).strip("-")
    if slug:
        return slug
    digest = hashlib.sha1((title or "course").encode("utf-8")).hexdigest()[:8]
    return f"course-{digest}"


def _summarize_course(course: Dict[str, Any]) -> Dict[str, Any]:
    sections = course.get("sections") or []
    exp_count = 0
    file_count = 0
    for section in sections:
        experiments = section.get("experiments") or []
        exp_count += len(experiments)
        for exp in experiments:
            file_count += len(exp.get("files") or [])
    return {
        "section_count": len(sections),
        "experiment_count": exp_count,
        "file_count": file_count,
    }


def _normalize_tags_from_meta(value: Any) -> List[str]:
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    if isinstance(value, str):
        return [item.strip() for item in value.split(",") if item.strip()]
    return []


def _init_course_json(base: Path, meta: Dict[str, Any]) -> Dict[str, Any]:
    title = (meta.get("title") or "").strip()
    if not title:
        raise GiteaServiceError("未找到 course.json，且课程名称为空，无法初始化")

    course_id = (meta.get("id") or meta.get("course_id") or "").strip()
    if not course_id:
        course_id = _generate_course_id(title)

    version = (meta.get("version") or "1.0").strip() or "1.0"

    course_data = {
        "id": course_id,
        "title": title,
        "description": (meta.get("description") or "").strip(),
        "grade": (meta.get("grade") or "").strip(),
        "subject": (meta.get("subject") or "").strip(),
        "author": (meta.get("author") or "").strip(),
        "version": version,
        "tags": _normalize_tags_from_meta(meta.get("tags")),
        "sections": [],
    }

    _write_course_json(base / "course.json", course_data)

    return course_data


def _write_course_json(path: Path, course_data: Dict[str, Any]) -> None:
    with path.open("w", encoding="utf-8") as f:
        json.dump(course_data, f, ensure_ascii=False, indent=2)


def _guess_file_type(path: str) -> str:
    lower = path.lower()
    if lower.endswith(".ipynb"):
        return "ipynb"
    if lower.endswith(".html"):
        return "html"
    return "file"


def _find_cover_in_dir(root: Path, base: Path) -> str:
    if not root.exists() or not root.is_dir():
        return ""
    preferred = [
        "cover.png",
        "cover.jpg",
        "cover.jpeg",
        "cover.webp",
        "thumb.png",
        "thumbnail.png",
    ]
    for name in preferred:
        candidate = root / name
        if candidate.exists() and candidate.is_file():
            return candidate.relative_to(base).as_posix()
    for item in root.iterdir():
        if item.is_file() and item.suffix.lower() in IMAGE_EXTS:
            return item.relative_to(base).as_posix()
    return ""


def _fill_experiment_covers(base: Path, course_data: Dict[str, Any]) -> bool:
    changed = False
    sections = course_data.get("sections") or []
    for section in sections:
        experiments = section.get("experiments") or []
        for exp in experiments:
            if exp.get("cover") or exp.get("cover_url"):
                continue
            exp_files = exp.get("files") or []
            exp_dir = None
            for file in exp_files:
                path = file.get("path") if isinstance(file, dict) else None
                if path:
                    exp_dir = (base / path).parent
                    break
            if exp_dir:
                cover = _find_cover_in_dir(exp_dir, base)
                if cover:
                    exp["cover"] = cover
                    changed = True
    return changed


def _build_sections_from_fs(base: Path) -> List[Dict[str, Any]]:
    sections: List[Dict[str, Any]] = []
    top_level_dirs = [p for p in base.iterdir() if p.is_dir() and p.name not in DEFAULT_EXCLUDES and not p.name.startswith(".")]
    top_level_files = [p for p in base.iterdir() if p.is_file() and p.name not in DEFAULT_EXCLUDES and not p.name.startswith(".")]

    def make_file_entries(root: Path, recursive: bool = True) -> List[Dict[str, Any]]:
        entries: List[Dict[str, Any]] = []
        if recursive:
            for dirpath, dirs, files in os.walk(root):
                dirs[:] = [d for d in dirs if d not in DEFAULT_EXCLUDES and not d.startswith(".")]
                for filename in files:
                    if filename in DEFAULT_EXCLUDES or filename.startswith("."):
                        continue
                    file_path = Path(dirpath) / filename
                    rel = file_path.relative_to(base).as_posix()
                    entries.append({"path": rel, "type": _guess_file_type(rel)})
        else:
            for file_path in root.iterdir():
                if not file_path.is_file():
                    continue
                if file_path.name in DEFAULT_EXCLUDES or file_path.name.startswith("."):
                    continue
                rel = file_path.relative_to(base).as_posix()
                entries.append({"path": rel, "type": _guess_file_type(rel)})
        if root != base:
            rel_dir = root.relative_to(base).as_posix().rstrip("/") + "/"
            entries.insert(0, {"path": rel_dir, "type": "dir"})
        return entries

    # Build from top-level directories
    for section_dir in sorted(top_level_dirs, key=lambda p: p.name):
        exp_dirs = [p for p in section_dir.iterdir() if p.is_dir() and p.name not in DEFAULT_EXCLUDES and not p.name.startswith(".")]
        experiments: List[Dict[str, Any]] = []
        if exp_dirs:
            for exp_dir in sorted(exp_dirs, key=lambda p: p.name):
                files = make_file_entries(exp_dir)
                cover = _find_cover_in_dir(exp_dir, base)
                experiments.append({
                    "title": exp_dir.name,
                    "description": "",
                    "files": files,
                    "cover": cover,
                })
        else:
            files = make_file_entries(section_dir)
            if files:
                cover = _find_cover_in_dir(section_dir, base)
                experiments.append({
                    "title": section_dir.name,
                    "description": "",
                    "files": files,
                    "cover": cover,
                })
        if experiments:
            sections.append({
                "title": section_dir.name,
                "description": "",
                "experiments": experiments,
            })

    # If files exist at root, append a fallback section
    if top_level_files:
        files = make_file_entries(base, recursive=False)
        sections.append({
            "title": "课程文件",
            "description": "",
            "experiments": [
                {
                    "title": "课程资源",
                    "description": "",
                    "files": files,
                }
            ],
        })

    # If still empty, build a minimal section from any file in the folder
    if not sections:
        files = make_file_entries(base, recursive=True)
        if files:
            sections.append({
                "title": "课程内容",
                "description": "",
                "experiments": [
                    {
                        "title": "实验一",
                        "description": "",
                        "files": files,
                    }
                ],
            })

    return sections


def scan_course(
    local_path: str,
    init_if_missing: bool = False,
    init_meta: Optional[Dict[str, Any]] = None,
    auto_build: bool = False
) -> CourseScanResult:
    base = Path(local_path or "")
    if not base.exists() or not base.is_dir():
        raise GiteaServiceError("课程目录不存在")

    course_file = base / "course.json"
    initialized = False
    if not course_file.exists():
        if not init_if_missing:
            raise GiteaServiceError("未找到 course.json")
        course_data = _init_course_json(base, init_meta or {})
        initialized = True
    else:
        try:
            with course_file.open("r", encoding="utf-8") as f:
                course_data = json.load(f)
        except json.JSONDecodeError as exc:
            raise GiteaServiceError(f"course.json 格式错误: {exc}") from exc

    if not course_data.get("title"):
        raise GiteaServiceError("course.json 缺少字段: title")

    if not course_data.get("id"):
        course_data["id"] = _generate_course_id(course_data.get("title", ""))

    if "sections" not in course_data:
        if auto_build:
            course_data["sections"] = []
        else:
            raise GiteaServiceError("course.json 缺少字段: sections")
    if not isinstance(course_data.get("sections"), list):
        raise GiteaServiceError("course.json 字段 sections 必须为数组")

    auto_built = False
    if auto_build and (not course_data.get("sections")):
        course_data["sections"] = _build_sections_from_fs(base)
        auto_built = True
        _write_course_json(course_file, course_data)

    if auto_build:
        if _fill_experiment_covers(base, course_data):
            _write_course_json(course_file, course_data)

    normalized = _normalize_course_data(course_data)
    summary = _summarize_course(normalized)
    if initialized:
        summary["initialized"] = True
    if auto_built:
        summary["auto_built"] = True
    return CourseScanResult(course=normalized, summary=summary)


def save_course_json(local_path: str, course_data: Dict[str, Any]) -> CourseScanResult:
    base = Path(local_path or "")
    if not base.exists() or not base.is_dir():
        raise GiteaServiceError("课程目录不存在")

    if not course_data.get("title"):
        raise GiteaServiceError("课程名称不能为空")

    if not course_data.get("id"):
        course_data["id"] = _generate_course_id(course_data.get("title", ""))

    if "sections" not in course_data:
        course_data["sections"] = []
    if not isinstance(course_data.get("sections"), list):
        raise GiteaServiceError("课程结构 sections 必须为数组")

    course_file = base / "course.json"
    _write_course_json(course_file, course_data)

    normalized = _normalize_course_data(course_data)
    summary = _summarize_course(normalized)
    return CourseScanResult(course=normalized, summary=summary)


def scan_folder(base_path: str, folder_path: str) -> List[Dict[str, Any]]:
    base = Path(base_path or "").resolve()
    folder = Path(folder_path or "").resolve()
    if not base.exists() or not base.is_dir():
        raise GiteaServiceError("课程目录不存在")
    if not folder.exists() or not folder.is_dir():
        raise GiteaServiceError("材料目录不存在")
    if base not in folder.parents and folder != base:
        raise GiteaServiceError("材料目录必须在课程目录内")

    files: List[Dict[str, Any]] = []
    for root, dirs, filenames in os.walk(folder):
        dirs[:] = [d for d in dirs if d not in DEFAULT_EXCLUDES and not d.startswith(".")]
        for filename in filenames:
            if filename in DEFAULT_EXCLUDES or filename.startswith("."):
                continue
            file_path = Path(root) / filename
            rel = file_path.relative_to(base).as_posix()
            files.append({"path": rel, "type": _guess_file_type(rel)})

    if folder != base:
        rel_dir = folder.relative_to(base).as_posix().rstrip("/") + "/"
        files.insert(0, {"path": rel_dir, "type": "dir"})

    return files


def _iter_course_files(base: Path) -> Iterable[Tuple[Path, str]]:
    for root, dirs, files in os.walk(base):
        dirs[:] = [d for d in dirs if d not in DEFAULT_EXCLUDES and not d.startswith(".")]
        for filename in files:
            if filename in DEFAULT_EXCLUDES or filename.startswith("."):
                continue
            file_path = Path(root) / filename
            rel = file_path.relative_to(base).as_posix()
            yield file_path, rel


def _decode_data_url(data_url: str) -> Tuple[bytes, str]:
    if not data_url.startswith("data:"):
        raise GiteaServiceError("封面数据格式错误")
    header, b64data = data_url.split(",", 1)
    mime = header.split(";")[0].replace("data:", "")
    ext = "png"
    if "jpeg" in mime or "jpg" in mime:
        ext = "jpg"
    elif "webp" in mime:
        ext = "webp"
    return base64.b64decode(b64data), ext


def _build_index_entry(
    course: Dict[str, Any],
    course_id: str,
    version: str,
    publish_path: str,
    cover_name: Optional[str],
) -> Dict[str, Any]:
    updated_at = datetime.utcnow().strftime("%Y-%m-%d")
    entry = {
        "id": course_id,
        "title": course.get("title", ""),
        "description": course.get("description", ""),
        "grade": course.get("grade", ""),
        "subject": course.get("subject", ""),
        "author": course.get("author", ""),
        "version": version,
        "updated_at": updated_at,
        "tags": course.get("tags", []) or [],
        "course_url": f"{publish_path}/{course_id}/course.json",
        "package_url": f"{publish_path}/{course_id}/package/{course_id}-{version}.zip",
    }
    if cover_name:
        entry["cover_url"] = f"{publish_path}/{course_id}/{cover_name}"
    return entry


def _load_index(existing: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    if not existing:
        return {"version": "1.0", "updated_at": datetime.utcnow().strftime("%Y-%m-%d"), "resources": []}
    resources = existing.get("resources")
    if not isinstance(resources, list):
        existing["resources"] = []
    return existing


def publish_course(
    *,
    local_path: str,
    client: GiteaClient,
    publish_path: str,
    course_id: str,
    version: str,
    meta_override: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    scan_result = scan_course(local_path)
    course = dict(scan_result.course)

    overrides = meta_override or {}
    for key in ["title", "description", "grade", "subject", "author", "tags", "version"]:
        if overrides.get(key) is not None and overrides.get(key) != "":
            course[key] = overrides[key]

    if course_id:
        course["id"] = course_id
    course_id = course.get("id", course_id)
    version = overrides.get("version") or course.get("version") or version or "1.0"
    course["version"] = version

    cover_name = None
    cover_bytes = None
    cover_data_url = overrides.get("cover_data_url") or ""
    if cover_data_url:
        cover_bytes, cover_ext = _decode_data_url(cover_data_url)
        cover_name = f"cover.{cover_ext}"
        course["cover"] = cover_name
    elif course.get("cover"):
        cover_name = Path(course["cover"]).name

    base = Path(local_path)
    publish_root = f"{publish_path.rstrip('/')}/{course_id}"

    # Upload course.json (overridden)
    course_json_bytes = json.dumps(course, ensure_ascii=False, indent=2).encode("utf-8")
    if len(course_json_bytes) > MAX_FILE_SIZE:
        raise GiteaServiceError("course.json 文件过大")
    client.upsert_file(f"{publish_root}/course.json", course_json_bytes, f"更新课程 {course_id} course.json")

    # Upload cover if provided via UI
    if cover_bytes and cover_name:
        if len(cover_bytes) > MAX_FILE_SIZE:
            raise GiteaServiceError("封面图片过大")
        client.upsert_file(f"{publish_root}/{cover_name}", cover_bytes, f"更新课程 {course_id} 封面")

    # Upload course files
    for file_path, rel_path in _iter_course_files(base):
        if rel_path == "course.json":
            continue
        if cover_bytes and cover_name and rel_path == cover_name:
            continue
        file_bytes = file_path.read_bytes()
        if len(file_bytes) > MAX_FILE_SIZE:
            raise GiteaServiceError(f"文件过大: {rel_path}")
        remote_path = f"{publish_root}/{rel_path}"
        client.upsert_file(remote_path, file_bytes, f"更新课程 {course_id} 文件 {rel_path}")

    # Create zip package
    with tempfile.TemporaryDirectory() as tmp_dir:
        zip_path = Path(tmp_dir) / f"{course_id}-{version}.zip"
        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zipf:
            for file_path, rel_path in _iter_course_files(base):
                zipf.write(file_path, rel_path)
            # Ensure updated course.json inside zip
            zipf.writestr("course.json", course_json_bytes)
        zip_bytes = zip_path.read_bytes()
        if len(zip_bytes) > MAX_FILE_SIZE:
            raise GiteaServiceError("课程包过大，请精简内容")
        client.upsert_file(
            f"{publish_root}/package/{course_id}-{version}.zip",
            zip_bytes,
            f"发布课程 {course_id} zip",
        )

    # Update index.json
    index_path = "index.json"
    existing = client.get_content(index_path)
    index_data: Dict[str, Any] = {}
    if existing and existing.get("content"):
        decoded = base64.b64decode(existing["content"])
        index_data = json.loads(decoded.decode("utf-8"))
    index_data = _load_index(index_data)

    entry = _build_index_entry(course, course_id, version, publish_path, cover_name)
    resources = index_data.get("resources", [])
    replaced = False
    for i, item in enumerate(resources):
        if item.get("id") == course_id:
            resources[i] = entry
            replaced = True
            break
    if not replaced:
        resources.append(entry)
    index_data["resources"] = resources
    index_data["updated_at"] = datetime.utcnow().strftime("%Y-%m-%d")

    index_bytes = json.dumps(index_data, ensure_ascii=False, indent=2).encode("utf-8")
    client.upsert_file(index_path, index_bytes, f"更新课程索引 {course_id}")

    return {
        "course_id": course_id,
        "version": version,
        "entry": entry,
    }


def resolve_raw_url(raw_base_url: str, path_or_url: str) -> str:
    if path_or_url.startswith("http://") or path_or_url.startswith("https://"):
        return path_or_url
    clean = path_or_url.lstrip("/")
    return f"{raw_base_url}/{clean}"


def pull_course(
    *,
    raw_base_url: str,
    course_url: str,
    package_url: str,
    target_path: str,
) -> CourseScanResult:
    target_dir = Path(target_path)
    target_dir.mkdir(parents=True, exist_ok=True)

    if not package_url:
        raise GiteaServiceError("课程包地址为空")

    download_url = resolve_raw_url(raw_base_url, package_url)
    with request.urlopen(download_url, timeout=60) as resp:
        data = resp.read()

    with tempfile.TemporaryDirectory() as tmp_dir:
        zip_path = Path(tmp_dir) / "course.zip"
        zip_path.write_bytes(data)
        with zipfile.ZipFile(zip_path, "r") as zipf:
            zipf.extractall(target_dir)

    # Validate course.json after extraction
    scan_result = scan_course(str(target_dir))
    return scan_result
