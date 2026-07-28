"""Course normalization and local package scanning."""

from __future__ import annotations

import base64
import hashlib
import json
import os
import re
import stat
import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple
from urllib import parse

from services.gitea_client import GiteaServiceError


DEFAULT_EXCLUDES = {
    ".git",
    ".DS_Store",
    "__pycache__",
    ".ipynb_checkpoints",
    "node_modules",
    "dist",
    "build",
}

MAX_FILE_SIZE = 100 * 1024 * 1024
IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".webp"}


def _ensure_safe_course_tree(base: Path) -> None:
    """Reject links before scanners or package builders can follow them."""
    try:
        root_stat = base.lstat()
    except OSError as exc:
        raise GiteaServiceError("课程目录不可读取") from exc
    if stat.S_ISLNK(root_stat.st_mode):
        raise GiteaServiceError("课程目录不能是符号链接")

    for root, dirs, files in os.walk(base, followlinks=False):
        for name in (*dirs, *files):
            candidate = Path(root) / name
            try:
                candidate_stat = candidate.lstat()
            except OSError as exc:
                raise GiteaServiceError("课程目录不可读取") from exc
            if stat.S_ISLNK(candidate_stat.st_mode):
                raise GiteaServiceError("课程目录包含不安全的符号链接")
            if stat.S_ISREG(candidate_stat.st_mode) and candidate_stat.st_nlink > 1:
                raise GiteaServiceError("课程目录包含不安全的硬链接")


@dataclass
class CourseScanResult:
    course: Dict[str, Any]
    summary: Dict[str, Any]


def _prefix_lesson_file_path(path: Any, experiment_root: str) -> str:
    raw = str(path or "").strip().replace("\\", "/")
    if not raw:
        return ""
    if raw.startswith(("http://", "https://", "/")):
        return raw.lstrip("/")
    if raw.startswith("./"):
        raw = raw[2:]
    normalized_root = str(experiment_root or "").strip().strip("/")
    if not normalized_root:
        return raw
    if raw.startswith(f"{normalized_root}/") or raw == normalized_root:
        return raw
    return f"{normalized_root}/{raw}".replace("//", "/")


def _normalize_lesson_files(files: Any, experiment_root: str) -> List[Any]:
    normalized_files: List[Any] = []
    if not isinstance(files, list):
        return normalized_files
    for item in files:
        if isinstance(item, str):
            normalized_files.append({
                "path": _prefix_lesson_file_path(item, experiment_root),
                "type": _guess_file_type(str(item)),
            })
            continue
        if not isinstance(item, dict):
            continue
        next_item = dict(item)
        path = next_item.get("path")
        url = next_item.get("url")
        name = next_item.get("name")
        if path:
            next_item["path"] = _prefix_lesson_file_path(path, experiment_root)
        elif not url and name:
            next_item["path"] = _prefix_lesson_file_path(name, experiment_root)
        if isinstance(next_item.get("children"), list):
            next_item["children"] = _normalize_lesson_files(next_item["children"], experiment_root)
        normalized_files.append(next_item)
    return normalized_files


def _normalize_lessons_to_sections(lessons: Any) -> List[Dict[str, Any]]:
    sections: List[Dict[str, Any]] = []
    if not isinstance(lessons, list):
        return sections
    for lesson_index, lesson in enumerate(lessons):
        if not isinstance(lesson, dict):
            continue
        lesson_id = _normalize_course_path(lesson.get("id") or f"lesson{lesson_index + 1}")
        experiments: List[Dict[str, Any]] = []
        for experiment_index, experiment in enumerate(lesson.get("experiments") or lesson.get("items") or []):
            if not isinstance(experiment, dict):
                continue
            experiment_id = _normalize_course_path(experiment.get("id") or f"exp{experiment_index + 1}")
            experiment_root = "/".join(part for part in [lesson_id, experiment_id] if part)
            next_experiment = dict(experiment)
            next_experiment["files"] = _normalize_lesson_files(
                experiment.get("files") or experiment.get("items") or experiment.get("resources") or [],
                experiment_root,
            )
            experiments.append(next_experiment)
        section = dict(lesson)
        section["experiments"] = experiments
        sections.append(section)
    return sections


def _strip_removed_integration_fields(value: Any) -> Any:
    if isinstance(value, list):
        return [_strip_removed_integration_fields(item) for item in value]
    if not isinstance(value, dict):
        return value
    return {
        key: _strip_removed_integration_fields(item)
        for key, item in value.items()
        if key not in {"quickform", "quickform_defaults"}
    }


def _normalize_course_data(course: Dict[str, Any]) -> Dict[str, Any]:
    normalized = _strip_removed_integration_fields(course or {})
    if not isinstance(normalized, dict):
        normalized = {}
    normalized.setdefault("tags", [])
    sections = normalized.get("sections") or []
    if not sections and isinstance(normalized.get("lessons"), list):
        sections = _normalize_lessons_to_sections(normalized.get("lessons"))
    normalized["sections"] = sections or []
    normalized["tags"] = normalized.get("tags") or []
    return normalized


def _strip_runtime_course_fields(course: Dict[str, Any]) -> Dict[str, Any]:
    cleaned = dict(course or {})
    runtime_keys = {
        "local_path",
        "cloud_url",
        "source",
        "origin",
        "sync",
        "course_url",
        "package_url",
        "resource_handle",
        "_source_id",
        "_source_name",
        "_source_repo_url",
        "_source_raw_base_url",
        "_source_branch",
        "_source_submit_url",
    }
    for key in runtime_keys:
        cleaned.pop(key, None)
    return cleaned


def _generate_course_id(title: str) -> str:
    base = (title or "").strip().lower()
    slug = re.sub(r"[^a-z0-9]+", "-", base)
    slug = re.sub(r"-{2,}", "-", slug).strip("-")
    if slug:
        return slug
    digest = hashlib.sha1((title or "course").encode("utf-8")).hexdigest()[:8]
    return f"course-{digest}"


def _get_default_course_root() -> Path:
    root = Path.home() / "Documents" / "XeduCourses"
    root.mkdir(parents=True, exist_ok=True)
    return root


def _load_course_data_from_local_package_path(source_path: Path) -> Dict[str, Any]:
    if source_path.is_dir():
        course_file = source_path / "course.json"
        if not course_file.exists():
            children = [item for item in source_path.iterdir()]
            if len(children) == 1 and children[0].is_dir():
                course_file = children[0] / "course.json"
        if not course_file.exists():
            return {}
        try:
            return json.loads(course_file.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return {}

    if source_path.suffix.lower() != ".zip":
        return {}

    try:
        with zipfile.ZipFile(source_path, "r") as zipf:
            members = [name for name in zipf.namelist() if name and not name.endswith("/")]
            candidate_name = ""
            if "course.json" in members:
                candidate_name = "course.json"
            else:
                nested_candidates = [
                    name
                    for name in members
                    if name.count("/") == 1 and name.endswith("/course.json")
                ]
                if len(nested_candidates) == 1:
                    candidate_name = nested_candidates[0]
            if not candidate_name:
                return {}
            with zipf.open(candidate_name) as course_file:
                return json.loads(course_file.read().decode("utf-8"))
    except (OSError, KeyError, UnicodeDecodeError, zipfile.BadZipFile, json.JSONDecodeError):
        return {}
    return {}


def resolve_local_course_package_target_path(package_path: str) -> str:
    source_path = Path(package_path).expanduser()
    course_data = _load_course_data_from_local_package_path(source_path)
    raw_course_id = str(course_data.get("id") or "").strip()
    course_id = raw_course_id if re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]*", raw_course_id) else ""
    if not course_id:
        course_id = _generate_course_id(str(course_data.get("title") or "").strip())
    if not course_id:
        base_name = source_path.stem if source_path.is_file() else source_path.name
        course_id = _generate_course_id(base_name or "course")
    return str(_get_default_course_root() / course_id)


def _sanitize_ref_component(value: str, fallback: str = "user") -> str:
    text = (value or "").strip().lower()
    text = re.sub(r"[^a-z0-9._-]+", "-", text)
    text = re.sub(r"-{2,}", "-", text).strip("-")
    return text or fallback


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


def normalize_course_data(course: Dict[str, Any]) -> Dict[str, Any]:
    return _normalize_course_data(course)


def summarize_course(course: Dict[str, Any]) -> Dict[str, Any]:
    return _summarize_course(course)


def _normalize_course_path(path: Any) -> str:
    return str(path or "").strip().replace("\\", "/").lstrip("/")


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
    if lower.endswith(".blockly.xml") or lower.endswith(".blockly.json"):
        return "blockly"
    if lower.endswith(".sb3"):
        return "scratch"
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
    _ensure_safe_course_tree(base)

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

    course_data = _normalize_course_data(course_data)

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
    _ensure_safe_course_tree(base)

    if not course_data.get("title"):
        raise GiteaServiceError("课程名称不能为空")

    if not course_data.get("id"):
        course_data["id"] = _generate_course_id(course_data.get("title", ""))

    course_data = _normalize_course_data(course_data)

    if "sections" not in course_data:
        course_data["sections"] = []
    if not isinstance(course_data.get("sections"), list):
        raise GiteaServiceError("课程结构 sections 必须为数组")

    _persist_course_cover_to_local(base, course_data)

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
    _ensure_safe_course_tree(base)
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


def _collect_local_course_file_set(base: Path, *, cover_name: str = "") -> set[str]:
    files: set[str] = {"course.json"}
    clean_cover = str(cover_name or "").strip().strip("/")
    if clean_cover:
        files.add(clean_cover)
    for _, rel in _iter_course_files(base):
        files.add(rel)
    return files


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


def _file_url_to_path(url: str) -> Path:
    parsed = parse.urlparse(url)
    if parsed.scheme.lower() != "file":
        raise GiteaServiceError("封面文件地址格式错误")
    raw_path = parse.unquote(parsed.path or "")
    if os.name == "nt" and re.match(r"^/[A-Za-z]:", raw_path):
        raw_path = raw_path[1:]
    return Path(raw_path)


def _persist_course_cover_to_local(base: Path, course_data: Dict[str, Any]) -> None:
    raw_cover = course_data.get("cover")
    if not raw_cover:
        raw_cover = course_data.get("cover_url")
    if not isinstance(raw_cover, str) or not raw_cover.strip():
        return
    cover = raw_cover.strip()
    cover_ext = ""
    cover_bytes: Optional[bytes] = None

    if cover.startswith("data:"):
        cover_bytes, cover_ext = _decode_data_url(cover)
    elif cover.startswith("file://"):
        source = _file_url_to_path(cover)
        if source.exists() and source.is_file():
            ext = source.suffix.lower()
            if ext in IMAGE_EXTS:
                cover_ext = ".jpg" if ext == ".jpeg" else ext
                cover_bytes = source.read_bytes()
    else:
        source = Path(cover)
        if source.is_absolute() and source.exists() and source.is_file():
            ext = source.suffix.lower()
            if ext in IMAGE_EXTS:
                cover_ext = ".jpg" if ext == ".jpeg" else ext
                cover_bytes = source.read_bytes()

    if not cover_bytes or not cover_ext:
        return
    if not cover_ext.startswith("."):
        cover_ext = f".{cover_ext}"
    if len(cover_bytes) > MAX_FILE_SIZE:
        raise GiteaServiceError("封面图片过大")

    cover_name = f"cover{cover_ext}"
    cover_path = base / cover_name
    cover_path.write_bytes(cover_bytes)
    course_data["cover"] = cover_name
    if "cover_url" in course_data:
        course_data.pop("cover_url", None)
