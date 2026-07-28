"""
Gitea publish/pull utilities for course resources.
"""

from __future__ import annotations

import base64
import hashlib
import json
import os
import re
import socket
import stat
import shutil
import tempfile
import unicodedata
import zipfile
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from pathlib import PurePosixPath
from typing import Any, Callable, Dict, Iterable, List, Optional, Tuple
from urllib import request, error, parse

from services.gitea_client import GiteaClient, GiteaServiceError
from services.gitea_course_scanner import (
    DEFAULT_EXCLUDES,
    IMAGE_EXTS,
    MAX_FILE_SIZE,
    CourseScanResult,
    _collect_local_course_file_set,
    _decode_data_url,
    _file_url_to_path,
    _generate_course_id,
    _guess_file_type,
    _iter_course_files,
    _normalize_course_data,
    _normalize_course_path,
    _persist_course_cover_to_local,
    _strip_runtime_course_fields,
    resolve_local_course_package_target_path,
    save_course_json,
    scan_course,
    scan_folder,
)
from utils.logger import get_logger

logger = get_logger(__name__)

ProgressCallback = Optional[Callable[[Dict[str, Any]], None]]
MAX_COURSE_ARCHIVE_EXPANDED_BYTES = 1024 * 1024 * 1024
MAX_COURSE_ARCHIVE_MEMBERS = 10_000
MAX_REMOTE_RESPONSE_BYTES = 256 * 1024 * 1024


def _iter_read_tokens(token: str = "", prefer_anonymous: bool = True) -> List[str]:
    clean_token = (token or "").strip()
    ordered = ["", clean_token] if prefer_anonymous else [clean_token, ""]
    deduped: List[str] = []
    for item in ordered:
        if item in deduped:
            continue
        deduped.append(item)
    return deduped


def fetch_url_bytes_with_auth_fallback(
    url: str,
    *,
    token: str = "",
    timeout: int = 30,
    prefer_anonymous: bool = True,
    on_chunk: Optional[Callable[[int, int], None]] = None,
    max_bytes: int = MAX_REMOTE_RESPONSE_BYTES,
) -> bytes:
    attempts = _iter_read_tokens(token, prefer_anonymous=prefer_anonymous)
    last_exc: Exception | None = None

    for idx, active_token in enumerate(attempts):
        req = request.Request(url)
        if active_token:
            req.add_header("Authorization", f"token {active_token}")
        try:
            with request.urlopen(req, timeout=timeout) as resp:
                byte_limit = max(1, int(max_bytes))
                try:
                    content_length = int(resp.headers.get("Content-Length") or 0)
                except (AttributeError, TypeError, ValueError):
                    content_length = 0
                if content_length > byte_limit:
                    raise GiteaServiceError("远程课程文件过大")

                chunks = []
                completed = 0
                while True:
                    chunk = resp.read(64 * 1024)
                    if not chunk:
                        break
                    completed += len(chunk)
                    if completed > byte_limit:
                        raise GiteaServiceError("远程课程文件过大")
                    chunks.append(chunk)
                    if on_chunk is not None:
                        on_chunk(len(chunk), completed)
                return b"".join(chunks)
        except error.HTTPError as exc:
            last_exc = exc
            can_retry_auth = exc.code in (401, 403) and idx < len(attempts) - 1
            if can_retry_auth:
                logger.warning(f"读取资源鉴权失败，切换请求模式重试: {url}")
                continue
            raise
        except Exception as exc:  # noqa: BLE001
            last_exc = exc
            raise

    if last_exc:
        raise last_exc
    raise GiteaServiceError("读取资源失败")


def fetch_json_with_auth_fallback(
    url: str,
    *,
    token: str = "",
    timeout: int = 30,
    prefer_anonymous: bool = True,
) -> Any:
    raw = fetch_url_bytes_with_auth_fallback(
        url,
        token=token,
        timeout=timeout,
        prefer_anonymous=prefer_anonymous,
    )
    try:
        return json.loads(raw.decode("utf-8"))
    except Exception as exc:
        raise GiteaServiceError("资源响应格式错误") from exc


def load_index_data(
    *,
    raw_base_url: str,
    index_path: str = "index.json",
    token: str = "",
) -> Dict[str, Any]:
    clean_index_path = (index_path or "index.json").strip().lstrip("/") or "index.json"
    index_url = resolve_raw_url(raw_base_url, clean_index_path)
    raw = fetch_url_bytes_with_auth_fallback(
        index_url,
        token=token,
        timeout=15,
        prefer_anonymous=True,
    )
    parsed = json.loads(raw.decode("utf-8"))
    if not isinstance(parsed, dict):
        raise GiteaServiceError("资源索引格式错误")
    return parsed


def find_course_entry_from_index(
    *,
    raw_base_url: str,
    course_id: str,
    index_path: str = "index.json",
    token: str = "",
) -> Dict[str, Any]:
    clean_id = (course_id or "").strip()
    if not clean_id:
        raise GiteaServiceError("课程 ID 不能为空")

    index_data = load_index_data(raw_base_url=raw_base_url, index_path=index_path, token=token)
    resources = index_data.get("resources") or []
    if not isinstance(resources, list):
        raise GiteaServiceError("资源索引格式错误：resources 必须为数组")

    for item in resources:
        if isinstance(item, dict) and str(item.get("id") or "").strip() == clean_id:
            return item
    raise GiteaServiceError("资源索引中未找到该课程")


def load_course_data_from_repo(
    *,
    raw_base_url: str,
    course_path: str = "course.json",
    token: str = "",
) -> Dict[str, Any]:
    clean_course_path = (course_path or "course.json").strip().lstrip("/") or "course.json"
    course_url = resolve_raw_url(raw_base_url, clean_course_path)
    raw = fetch_url_bytes_with_auth_fallback(
        course_url,
        token=token,
        timeout=20,
        prefer_anonymous=True,
    )
    parsed = json.loads(raw.decode("utf-8"))
    if not isinstance(parsed, dict):
        raise GiteaServiceError("course.json 格式错误")
    return _normalize_course_data(parsed)


def build_single_course_entry(
    *,
    course_data: Dict[str, Any],
    course_url: str = "course.json",
    package_url: str = "",
) -> Dict[str, Any]:
    normalized = _normalize_course_data(course_data)
    course_id = str(normalized.get("id") or "").strip()
    if not course_id:
        raise GiteaServiceError("course.json 缺少字段: id")
    title = str(normalized.get("title") or "").strip()
    if not title:
        raise GiteaServiceError("course.json 缺少字段: title")
    version = str(normalized.get("version") or "1.0").strip() or "1.0"
    entry = {
        "id": course_id,
        "title": title,
        "description": normalized.get("description", ""),
        "grade": normalized.get("grade", ""),
        "subject": normalized.get("subject", ""),
        "author": normalized.get("author", ""),
        "version": version,
        "updated_at": normalized.get("updated_at", ""),
        "tags": normalized.get("tags", []) or [],
        "course_url": course_url,
        "package_url": package_url,
        "single_course_repo": True,
        "sections": normalized.get("sections", []) or [],
    }
    cover = normalized.get("cover") or normalized.get("cover_url") or ""
    if isinstance(cover, str) and cover.strip():
        entry["cover_url"] = cover.strip()
    return entry


def build_repo_archive_url(*, base_url: str, repo: str, branch: str) -> str:
    clean_base = (base_url or "").rstrip("/")
    clean_repo = (repo or "").strip().strip("/")
    clean_branch = (branch or "main").strip() or "main"
    if not clean_base or not clean_repo:
        raise GiteaServiceError("课程仓库配置不完整")
    encoded_repo = "/".join(parse.quote(part, safe="") for part in clean_repo.split("/") if part)
    encoded_branch = parse.quote(clean_branch, safe="")
    return f"{clean_base}/api/v1/repos/{encoded_repo}/archive/{encoded_branch}.zip"


def build_repo_tree_api_url(*, base_url: str, repo: str, branch: str) -> str:
    clean_base = (base_url or "").rstrip("/")
    clean_repo = (repo or "").strip().strip("/")
    clean_branch = (branch or "main").strip() or "main"
    if not clean_base or not clean_repo:
        raise GiteaServiceError("课程仓库配置不完整")
    encoded_repo = "/".join(parse.quote(part, safe="") for part in clean_repo.split("/") if part)
    encoded_branch = parse.quote(clean_branch, safe="")
    return f"{clean_base}/api/v1/repos/{encoded_repo}/git/trees/{encoded_branch}?recursive=1"


def load_repo_tree_data(
    *,
    base_url: str,
    repo: str,
    branch: str,
    token: str = "",
) -> List[Dict[str, Any]]:
    tree_url = build_repo_tree_api_url(base_url=base_url, repo=repo, branch=branch)
    parsed = fetch_json_with_auth_fallback(
        tree_url,
        token=token,
        timeout=30,
        prefer_anonymous=True,
    )
    if not isinstance(parsed, dict):
        raise GiteaServiceError("仓库文件树格式错误")
    tree = parsed.get("tree")
    if not isinstance(tree, list):
        raise GiteaServiceError("仓库文件树格式错误")
    return [item for item in tree if isinstance(item, dict)]


# Course scanning, normalization and local package handling live in gitea_course_scanner.py.

def _build_index_entry(
    course: Dict[str, Any],
    course_id: str,
    version: str,
    publish_path: str,
    cover_name: Optional[str],
) -> Dict[str, Any]:
    updated_at = datetime.now(timezone.utc).strftime("%Y-%m-%d")
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
        return {"version": "1.0", "updated_at": datetime.now(timezone.utc).strftime("%Y-%m-%d"), "resources": []}
    resources = existing.get("resources")
    if not isinstance(resources, list):
        existing["resources"] = []
    return existing


def _should_fallback_to_direct_publish(branch_error: str, repo_info: Dict[str, Any]) -> bool:
    text = (branch_error or "").lower()
    if bool(repo_info.get("empty")):
        return True
    hints = [
        "branch does not exist",
        "old branch",
        "base branch",
        "reference does not exist",
        "reference not found",
    ]
    return any(item in text for item in hints)


def publish_course(
    *,
    local_path: str,
    client: GiteaClient,
    publish_path: str,
    course_id: str,
    version: str,
    meta_override: Optional[Dict[str, Any]] = None,
    publish_branch: str = "",
    create_pr: bool = False,
    pr_base_branch: str = "",
    pr_title: str = "",
    pr_body: str = "",
    single_course_repo: bool = False,
) -> Dict[str, Any]:
    scan_result = scan_course(local_path)
    course = _strip_runtime_course_fields(scan_result.course)

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

    # Read base index once to determine course maintainer and keep metadata.
    base_existing_entry: Dict[str, Any] = {}
    base_index_content = client.get_content("index.json")
    if base_index_content and base_index_content.get("content"):
        decoded = base64.b64decode(base_index_content["content"])
        parsed_index = _load_index(json.loads(decoded.decode("utf-8")))
        for item in parsed_index.get("resources", []) or []:
            if isinstance(item, dict) and item.get("id") == course_id:
                base_existing_entry = item
                break

    publisher = client.get_current_user()
    maintainer = str((base_existing_entry or {}).get("maintainer") or "").strip()

    default_branch = client.branch or "main"
    base_branch = (pr_base_branch or default_branch).strip() or "main"
    target_branch = (publish_branch or default_branch).strip() or default_branch
    if create_pr and not publish_branch:
        course_ref = _sanitize_ref_component(course_id, "course")
        if publisher:
            user_ref = _sanitize_ref_component(publisher)
            target_branch = f"xedu/{course_ref}/{user_ref}"
        else:
            target_branch = f"xedu/{course_ref}"
    if create_pr and target_branch == base_branch:
        course_ref = _sanitize_ref_component(course_id, "course")
        target_branch = f"xedu/{course_ref}"
    direct_publish_fallback = False
    if target_branch != default_branch:
        try:
            client.ensure_branch(target_branch, from_branch=base_branch)
            publish_client = client.with_branch(target_branch)
        except GiteaServiceError as exc:
            repo_info = {}
            try:
                repo_info = client.get_repo_info()
            except Exception:
                repo_info = {}
            if create_pr and _should_fallback_to_direct_publish(str(exc), repo_info):
                effective_base_branch = (repo_info.get("default_branch") or base_branch or default_branch or "main").strip() or "main"
                logger.warning(
                    f"创建发布分支失败，降级为直发默认分支: target={target_branch} base={effective_base_branch} err={exc}"
                )
                target_branch = effective_base_branch
                publish_client = client.with_branch(target_branch)
                create_pr = False
                direct_publish_fallback = True
            else:
                raise
    else:
        publish_client = client

    base = Path(local_path)
    publish_root = "" if single_course_repo else f"{publish_path.rstrip('/')}/{course_id}"
    package_dir = "" if single_course_repo else f"{publish_root}/package"

    if single_course_repo:
        desired_files = _collect_local_course_file_set(base, cover_name=cover_name)
        tree = publish_client._request(
            "GET",
            f"/repos/{publish_client.owner}/{publish_client.repo_name}/git/trees/{parse.quote((publish_client.branch or 'main').strip(), safe='')}",
            params={"recursive": "1"},
        )
        tree_items = tree.get("tree") if isinstance(tree, dict) else []
        stale_paths = sorted(
            {
                str(item.get("path") or "").strip().strip("/")
                for item in tree_items
                if isinstance(item, dict)
                and str(item.get("type") or "").lower() == "blob"
                and _is_syncable_repo_path(str(item.get("path") or ""))
                and str(item.get("path") or "").strip().strip("/") not in desired_files
            }
        )
        for stale_path in stale_paths:
            publish_client.delete_file(stale_path, f"清理旧课程文件 {stale_path}")

    # Upload course.json (overridden)
    course_json_bytes = json.dumps(course, ensure_ascii=False, indent=2).encode("utf-8")
    if len(course_json_bytes) > MAX_FILE_SIZE:
        raise GiteaServiceError("course.json 文件过大")
    course_json_remote = "course.json" if single_course_repo else f"{publish_root}/course.json"
    publish_client.upsert_file(course_json_remote, course_json_bytes, f"更新课程 {course_id} course.json")

    # Upload cover if provided via UI
    if cover_bytes and cover_name:
        if len(cover_bytes) > MAX_FILE_SIZE:
            raise GiteaServiceError("封面图片过大")
        cover_remote = cover_name if single_course_repo else f"{publish_root}/{cover_name}"
        publish_client.upsert_file(cover_remote, cover_bytes, f"更新课程 {course_id} 封面")

    # Upload course files
    for file_path, rel_path in _iter_course_files(base):
        if rel_path == "course.json":
            continue
        if cover_bytes and cover_name and rel_path == cover_name:
            continue
        file_bytes = file_path.read_bytes()
        if len(file_bytes) > MAX_FILE_SIZE:
            raise GiteaServiceError(f"文件过大: {rel_path}")
        remote_path = rel_path if single_course_repo else f"{publish_root}/{rel_path}"
        publish_client.upsert_file(remote_path, file_bytes, f"更新课程 {course_id} 文件 {rel_path}")

    versioned_zip_remote = ""
    if not single_course_repo:
        with tempfile.TemporaryDirectory() as tmp_dir:
            zip_path = Path(tmp_dir) / f"{course_id}-{version}.zip"
            with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zipf:
                for file_path, rel_path in _iter_course_files(base):
                    if rel_path == "course.json":
                        continue
                    zipf.write(file_path, rel_path)
                zipf.writestr("course.json", course_json_bytes)
            zip_bytes = zip_path.read_bytes()
            if len(zip_bytes) > MAX_FILE_SIZE:
                raise GiteaServiceError("课程包过大，请精简内容")
            versioned_zip_remote = f"{package_dir}/{course_id}-{version}.zip"
            publish_client.upsert_file(versioned_zip_remote, zip_bytes, f"发布课程 {course_id} zip")

    if single_course_repo:
        entry = {
            "id": course_id,
            "title": course.get("title", ""),
            "description": course.get("description", ""),
            "grade": course.get("grade", ""),
            "subject": course.get("subject", ""),
            "author": course.get("author", ""),
            "version": version,
            "updated_at": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
            "tags": course.get("tags", []) or [],
            "course_url": "course.json",
            "package_url": "",
        }
        if cover_name:
            entry["cover_url"] = cover_name
        if not maintainer:
            maintainer = publisher
        if maintainer:
            entry["maintainer"] = maintainer
        if publisher:
            entry["last_publisher"] = publisher
    else:
        # Update index.json for multi-course repository mode.
        index_path = "index.json"
        existing = publish_client.get_content(index_path)
        index_data: Dict[str, Any] = {}
        if existing and existing.get("content"):
            decoded = base64.b64decode(existing["content"])
            index_data = json.loads(decoded.decode("utf-8"))
        index_data = _load_index(index_data)

        entry = _build_index_entry(course, course_id, version, publish_path, cover_name)
        if base_existing_entry:
            for key, value in base_existing_entry.items():
                if key not in entry:
                    entry[key] = value
        if not maintainer:
            maintainer = publisher
        if maintainer:
            entry["maintainer"] = maintainer
        if publisher:
            entry["last_publisher"] = publisher
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
        index_data["updated_at"] = datetime.now(timezone.utc).strftime("%Y-%m-%d")

        index_bytes = json.dumps(index_data, ensure_ascii=False, indent=2).encode("utf-8")
        publish_client.upsert_file(index_path, index_bytes, f"更新课程索引 {course_id}")

    result = {
        "course_id": course_id,
        "version": version,
        "entry": entry,
        "branch": target_branch,
        "maintainer": maintainer,
        "publisher": publisher,
        "direct_publish_fallback": direct_publish_fallback,
        "single_course_repo": bool(single_course_repo),
    }
    if create_pr:
        pr_resp = client.create_pull_request(
            head=target_branch,
            base=base_branch,
            title=pr_title or f"发布课程：{course.get('title') or course_id} ({version})",
            body=pr_body or f"自动发布课程 `{course_id}`，版本 `{version}`。",
        )
        result["pull_request"] = {
            "number": pr_resp.get("number"),
            "url": pr_resp.get("html_url") or pr_resp.get("url") or "",
            "title": pr_resp.get("title") or "",
            "existing": bool(pr_resp.get("_existing")),
        }
    return result


def resolve_raw_url(raw_base_url: str, path_or_url: str) -> str:
    if path_or_url.startswith("http://") or path_or_url.startswith("https://"):
        base = parse.urlsplit(raw_base_url)
        parsed = parse.urlsplit(path_or_url)
        base_path = parse.unquote(base.path).rstrip("/")
        target_path = parse.unquote(parsed.path)
        within_repo = target_path == base_path or target_path.startswith(f"{base_path}/")
        if (
            parsed.scheme.lower() != base.scheme.lower()
            or parsed.netloc.lower() != base.netloc.lower()
            or not within_repo
            or any(part in {"", ".", ".."} for part in target_path[len(base_path):].split("/") if part)
        ):
            raise GiteaServiceError("远程课程文件必须位于已选择的仓库路径内")
        encoded_path = parse.quote(
            parsed.path,
            safe="/%:@!$&'()*+,;=-._~",
        )
        return parse.urlunsplit(
            (parsed.scheme, parsed.netloc, encoded_path, parsed.query, parsed.fragment)
        )
    clean = path_or_url.replace("\\", "/").lstrip("/")
    decoded_path = parse.unquote(clean)
    relative = PurePosixPath(decoded_path)
    if not clean or relative.is_absolute() or any(part in {"", ".", ".."} for part in relative.parts):
        raise GiteaServiceError("远程课程文件必须位于已选择的仓库路径内")
    encoded_path = parse.quote(
        clean,
        safe="/%:@!$&'()*+,;=-._~",
    )
    return f"{raw_base_url.rstrip('/')}/{encoded_path}"


def _is_syncable_repo_path(rel_path: str) -> bool:
    clean = (rel_path or "").strip().strip("/")
    if not clean:
        return False
    parts = [part for part in clean.split("/") if part]
    if not parts:
        return False
    for part in parts:
        if part in DEFAULT_EXCLUDES or part.startswith("."):
            return False
    return True


def _report_progress(progress_callback: ProgressCallback, **updates: Any) -> None:
    if callable(progress_callback):
        progress_callback(updates)


def _safe_archive_members(archive: zipfile.ZipFile) -> List[zipfile.ZipInfo]:
    members = archive.infolist()
    if len(members) > MAX_COURSE_ARCHIVE_MEMBERS:
        raise GiteaServiceError("课程包包含过多文件")

    expanded_size = 0
    names = set()
    for member in members:
        normalized_name = member.filename.replace("\\", "/")
        name_key = unicodedata.normalize("NFC", normalized_name).casefold()
        relative = PurePosixPath(normalized_name)
        if (
            not normalized_name
            or "\x00" in normalized_name
            or relative.is_absolute()
            or any(part in {"", ".", ".."} for part in relative.parts)
            or stat.S_ISLNK(member.external_attr >> 16)
            or name_key in names
        ):
            raise GiteaServiceError("课程包包含不安全的文件路径")
        names.add(name_key)
        expanded_size += max(0, member.file_size)
        if expanded_size > MAX_COURSE_ARCHIVE_EXPANDED_BYTES:
            raise GiteaServiceError("课程包超过允许的解压大小")
    return members


def _extract_course_archive(
    archive: zipfile.ZipFile,
    staging_dir: Path,
    *,
    progress_callback: ProgressCallback = None,
    percent_start: int = 0,
    percent_end: int = 80,
) -> Path:
    members = _safe_archive_members(archive)
    staging_root = staging_dir.resolve()
    total_bytes = sum(max(0, member.file_size) for member in members)
    completed_bytes = 0

    for member in members:
        relative = PurePosixPath(member.filename.replace("\\", "/"))
        destination = (staging_root / Path(*relative.parts)).resolve()
        if staging_root != destination and staging_root not in destination.parents:
            raise GiteaServiceError("课程包包含不安全的文件路径")
        if member.is_dir():
            destination.mkdir(parents=True, exist_ok=True)
            continue

        destination.parent.mkdir(parents=True, exist_ok=True)
        with archive.open(member, "r") as source, destination.open("wb") as target:
            while True:
                chunk = source.read(64 * 1024)
                if not chunk:
                    break
                target.write(chunk)
                completed_bytes += len(chunk)
                percent = percent_start
                if total_bytes:
                    percent += int((completed_bytes / total_bytes) * (percent_end - percent_start))
                _report_progress(
                    progress_callback,
                    phase="extracting",
                    percent=percent,
                    completed_bytes=completed_bytes,
                    total_bytes=total_bytes,
                    current_file=member.filename,
                    message=f"正在解压 {member.filename}",
                )

    extracted_root = staging_dir
    if not (extracted_root / "course.json").is_file():
        top_level = list(extracted_root.iterdir())
        if len(top_level) == 1 and top_level[0].is_dir() and (top_level[0] / "course.json").is_file():
            extracted_root = top_level[0]
    if not (extracted_root / "course.json").is_file():
        raise GiteaServiceError("课程包缺少 course.json")
    return extracted_root


def _stage_local_course_directory(
    source_dir: Path,
    staging_dir: Path,
    *,
    progress_callback: ProgressCallback = None,
) -> Path:
    if source_dir.is_symlink():
        raise GiteaServiceError("已解压课程目录包含不安全的链接或文件")

    source_root = source_dir.resolve()
    directories: List[Tuple[Path, Path]] = []
    files: List[Tuple[Path, Path, os.stat_result]] = []
    names = set()
    total_bytes = 0

    def raise_walk_error(_error: OSError) -> None:
        raise GiteaServiceError("无法安全读取已解压课程目录")

    for root, dir_names, file_names in os.walk(
        source_root,
        topdown=True,
        followlinks=False,
        onerror=raise_walk_error,
    ):
        dir_names.sort()
        file_names.sort()
        root_path = Path(root)
        for name, expected_directory in (
            [(item, True) for item in dir_names]
            + [(item, False) for item in file_names]
        ):
            source_path = root_path / name
            try:
                file_stat = source_path.lstat()
                relative_path = source_path.relative_to(source_root)
            except (OSError, ValueError) as exc:
                raise GiteaServiceError("无法安全读取已解压课程目录") from exc

            normalized_name = relative_path.as_posix()
            name_key = unicodedata.normalize("NFC", normalized_name).casefold()
            unsafe_type = (
                stat.S_ISLNK(file_stat.st_mode)
                or (expected_directory and not stat.S_ISDIR(file_stat.st_mode))
                or (not expected_directory and not stat.S_ISREG(file_stat.st_mode))
                or (not expected_directory and file_stat.st_nlink > 1)
                or name_key in names
            )
            if unsafe_type:
                raise GiteaServiceError("已解压课程目录包含不安全的链接或文件")

            names.add(name_key)
            if len(names) > MAX_COURSE_ARCHIVE_MEMBERS:
                raise GiteaServiceError("课程包包含过多文件")
            if expected_directory:
                directories.append((source_path, relative_path))
                continue

            total_bytes += max(0, file_stat.st_size)
            if total_bytes > MAX_COURSE_ARCHIVE_EXPANDED_BYTES:
                raise GiteaServiceError("课程包超过允许的解压大小")
            files.append((source_path, relative_path, file_stat))

    for _source_path, relative_path in directories:
        (staging_dir / relative_path).mkdir(parents=True, exist_ok=True)

    completed_bytes = 0
    completed_files = 0
    open_flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0)
    for source_path, relative_path, expected_stat in files:
        destination = staging_dir / relative_path
        destination.parent.mkdir(parents=True, exist_ok=True)
        try:
            descriptor = os.open(source_path, open_flags)
        except OSError as exc:
            raise GiteaServiceError("已解压课程目录包含不安全的链接或文件") from exc

        try:
            opened_stat = os.fstat(descriptor)
            if (
                not stat.S_ISREG(opened_stat.st_mode)
                or opened_stat.st_nlink > 1
                or opened_stat.st_dev != expected_stat.st_dev
                or opened_stat.st_ino != expected_stat.st_ino
            ):
                raise GiteaServiceError("已解压课程目录包含不安全的链接或文件")
            source = os.fdopen(descriptor, "rb")
            descriptor = -1
            with source, destination.open("wb") as target:
                while True:
                    chunk = source.read(64 * 1024)
                    if not chunk:
                        break
                    completed_bytes += len(chunk)
                    if completed_bytes > MAX_COURSE_ARCHIVE_EXPANDED_BYTES:
                        raise GiteaServiceError("课程包超过允许的解压大小")
                    target.write(chunk)
        finally:
            if descriptor >= 0:
                os.close(descriptor)

        completed_files += 1
        percent = 10 + int((completed_bytes / total_bytes) * 68) if total_bytes else 78
        _report_progress(
            progress_callback,
            phase="extracting",
            percent=min(78, percent),
            completed_files=completed_files,
            total_files=len(files),
            completed_bytes=completed_bytes,
            total_bytes=total_bytes,
            current_file=relative_path.as_posix(),
            message=f"正在读取 {relative_path.as_posix()}",
        )

    return staging_dir


def _backup_and_replace_course_dir(
    *,
    staged_dir: Path,
    target_dir: Path,
    replace_existing: bool = True,
    backup_before_replace: bool = True,
    progress_callback: ProgressCallback = None,
) -> str:
    target_dir = target_dir.expanduser()
    target_dir.parent.mkdir(parents=True, exist_ok=True)
    if target_dir.exists() and not target_dir.is_dir():
        raise GiteaServiceError("课程保存位置不是目录")

    backup_path = ""
    old_target = None
    existing = target_dir.exists()
    if existing and not replace_existing:
        raise GiteaServiceError("课程保存位置已存在，请选择覆盖或其他目录")

    if existing:
        _report_progress(progress_callback, phase="backing_up", percent=88, message="正在备份旧课程...")
        if backup_before_replace:
            stamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S%f")
            backup_root = target_dir.parent / ".xedu_backup" / target_dir.name
            backup_root.mkdir(parents=True, exist_ok=True)
            backup_target = backup_root / stamp
            while backup_target.exists():
                backup_target = backup_root / f"{stamp}-{os.getpid()}"
            shutil.copytree(target_dir, backup_target, symlinks=True)
            backup_path = str(backup_target)
        old_target = target_dir.parent / f".{target_dir.name}.xedu-old-{os.getpid()}-{id(target_dir)}"
        if old_target.exists():
            shutil.rmtree(old_target)
        target_dir.rename(old_target)

    try:
        _report_progress(progress_callback, phase="writing", percent=94, message="正在写入本地课程...")
        shutil.copytree(staged_dir, target_dir, symlinks=False)
    except Exception as exc:
        if target_dir.exists():
            shutil.rmtree(target_dir)
        if old_target and old_target.exists():
            old_target.rename(target_dir)
        raise GiteaServiceError("替换本地课程失败，已保留旧课程") from exc
    else:
        if old_target and old_target.exists():
            shutil.rmtree(old_target)
    return backup_path


def _sync_single_course_repo(
    *,
    base_url: str,
    repo: str,
    branch: str,
    raw_base_url: str,
    target_path: str,
    course_path: str = "course.json",
    token: str = "",
    replace_existing: bool = True,
    backup_before_replace: bool = True,
    progress_callback: ProgressCallback = None,
) -> CourseScanResult:
    target_dir = Path(target_path)
    tree_items = load_repo_tree_data(
        base_url=base_url,
        repo=repo,
        branch=branch,
        token=token,
    )
    blob_items = [
        item
        for item in tree_items
        if str(item.get("type") or "").lower() == "blob"
        and _is_syncable_repo_path(str(item.get("path") or ""))
    ]
    path_map = {
        str(item.get("path") or "").strip().strip("/"): item
        for item in blob_items
    }
    requested_path = str(course_path or "course.json").strip().strip("/") or "course.json"
    if requested_path.startswith(f"{raw_base_url}/"):
        requested_path = requested_path[len(raw_base_url) + 1:]

    if requested_path in path_map and requested_path.endswith("course.json"):
        selected_course_path = requested_path
    elif requested_path == "course.json" and "course.json" in path_map:
        selected_course_path = "course.json"
    else:
        candidates = sorted(path for path in path_map if path.endswith("/course.json"))
        if len(candidates) == 1:
            selected_course_path = candidates[0]
        elif len(candidates) > 1:
            raise GiteaServiceError("仓库包含多个课程，请配置明确的 course_url 或 package_url")
        else:
            raise GiteaServiceError("仓库中未找到 course.json")

    prefix = selected_course_path.rsplit("/", 1)[0] if "/" in selected_course_path else ""
    selected_items = []
    for item in blob_items:
        full_path = str(item.get("path") or "").strip().strip("/")
        if prefix:
            prefix_marker = f"{prefix}/"
            if not full_path.startswith(prefix_marker):
                continue
            relative_path = full_path[len(prefix_marker):]
        else:
            relative_path = full_path
        if _is_syncable_repo_path(relative_path):
            selected_items.append((relative_path, item))
    selected_items.sort(key=lambda pair: pair[0])
    if not any(relative_path == "course.json" for relative_path, _item in selected_items):
        raise GiteaServiceError("课程目录中未找到 course.json")

    total_files = len(selected_items)
    total_bytes = sum(max(0, int(item.get("size") or 0)) for _path, item in selected_items)
    completed_files = 0
    completed_bytes = 0
    _report_progress(
        progress_callback,
        phase="downloading",
        percent=5,
        completed_files=0,
        total_files=total_files,
        completed_bytes=0,
        total_bytes=total_bytes,
        message="正在下载课程文件...",
    )

    with tempfile.TemporaryDirectory() as tmp_dir:
        staged_dir = Path(tmp_dir) / "course"
        staged_dir.mkdir(parents=True, exist_ok=True)

        for rel_path, item in selected_items:
            full_path = str(item.get("path") or "").strip().strip("/")
            download_url = resolve_raw_url(raw_base_url, full_path)
            base_completed_bytes = completed_bytes

            def on_chunk(chunk_size, current_file_bytes):
                current_total = base_completed_bytes + current_file_bytes
                percent = 5
                if total_bytes:
                    percent += int((current_total / total_bytes) * 75)
                _report_progress(
                    progress_callback,
                    phase="downloading",
                    percent=min(80, percent),
                    completed_files=completed_files,
                    total_files=total_files,
                    completed_bytes=current_total,
                    total_bytes=total_bytes,
                    current_file=rel_path,
                    message=f"正在下载 {rel_path}",
                )

            try:
                data = fetch_url_bytes_with_auth_fallback(
                    download_url,
                    token=token,
                    timeout=60,
                    prefer_anonymous=True,
                    on_chunk=on_chunk,
                )
            except error.HTTPError as exc:
                if exc.code in (401, 403):
                    raise GiteaServiceError("资源库认证失败，请检查 Gitea Token") from exc
                if exc.code == 404:
                    raise GiteaServiceError(f"仓库文件不存在: {rel_path}") from exc
                raise GiteaServiceError(f"读取仓库文件失败: HTTP {exc.code} {exc.reason}") from exc
            except (error.URLError, TimeoutError, socket.timeout) as exc:
                raise GiteaServiceError("拉取超时，请稍后重试") from exc

            destination = staged_dir / rel_path
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_bytes(data)
            completed_files += 1
            completed_bytes += len(data)
            _report_progress(
                progress_callback,
                phase="downloading",
                percent=min(80, 5 + int((completed_bytes / total_bytes) * 75)) if total_bytes else 80,
                completed_files=completed_files,
                total_files=total_files,
                completed_bytes=completed_bytes,
                total_bytes=total_bytes,
                current_file=rel_path,
                message=f"已下载 {rel_path}",
            )

        _report_progress(progress_callback, phase="validating", percent=84, message="正在校验课程结构...")
        scan_course(str(staged_dir))
        backup_path = _backup_and_replace_course_dir(
            staged_dir=staged_dir,
            target_dir=target_dir,
            replace_existing=replace_existing,
            backup_before_replace=backup_before_replace,
            progress_callback=progress_callback,
        )
        _report_progress(progress_callback, phase="validating", percent=98, message="正在确认本地课程...")
        final_result = scan_course(str(target_dir))
        if backup_path:
            final_result.summary["backup_path"] = backup_path
        return final_result


def _find_remote_file_size(*, base_url: str, repo: str, branch: str, raw_base_url: str, path: str, token: str) -> int:
    clean_path = str(path or "").strip().strip("/")
    if clean_path.startswith(f"{raw_base_url}/"):
        clean_path = clean_path[len(raw_base_url) + 1:]
    if clean_path.startswith(("http://", "https://")):
        clean_path = parse.urlparse(clean_path).path.strip("/")
    try:
        tree_items = load_repo_tree_data(base_url=base_url, repo=repo, branch=branch, token=token)
    except Exception:
        return 0
    for item in tree_items:
        item_path = str(item.get("path") or "").strip().strip("/")
        if item_path == clean_path:
            try:
                return max(0, int(item.get("size") or 0))
            except (TypeError, ValueError):
                return 0
    return 0


def pull_course(
    *,
    raw_base_url: str,
    course_url: str,
    package_url: str,
    target_path: str,
    token: str = "",
    replace_existing: bool = True,
    backup_before_replace: bool = True,
    single_course_repo: bool = False,
    base_url: str = "",
    repo: str = "",
    branch: str = "",
    progress_callback: ProgressCallback = None,
) -> CourseScanResult:
    target_dir = Path(target_path)
    target_dir.parent.mkdir(parents=True, exist_ok=True)

    if single_course_repo:
        return _sync_single_course_repo(
            base_url=base_url,
            repo=repo,
            branch=branch,
            raw_base_url=raw_base_url,
            target_path=target_path,
            course_path=course_url,
            token=token,
            replace_existing=replace_existing,
            backup_before_replace=backup_before_replace,
            progress_callback=progress_callback,
        )

    if not package_url:
        raise GiteaServiceError("课程包地址为空")

    download_url = resolve_raw_url(raw_base_url, package_url)
    total_bytes = _find_remote_file_size(
        base_url=base_url,
        repo=repo,
        branch=branch,
        raw_base_url=raw_base_url,
        path=package_url,
        token=token,
    )
    _report_progress(
        progress_callback,
        phase="downloading",
        percent=5,
        completed_files=0,
        total_files=1,
        completed_bytes=0,
        total_bytes=total_bytes,
        current_file=package_url,
        message="正在下载课程包...",
    )

    def on_package_chunk(_chunk_size, completed):
        percent = 5 + int((completed / total_bytes) * 75) if total_bytes else 10
        _report_progress(
            progress_callback,
            phase="downloading",
            percent=min(80, percent),
            completed_files=0,
            total_files=1,
            completed_bytes=completed,
            total_bytes=total_bytes,
            current_file=package_url,
            message="正在下载课程包...",
        )

    try:
        data = fetch_url_bytes_with_auth_fallback(
            download_url,
            token=token,
            timeout=60,
            prefer_anonymous=True,
            on_chunk=on_package_chunk,
        )
    except error.HTTPError as exc:
        if exc.code in (401, 403):
            raise GiteaServiceError("资源库认证失败，请检查 Gitea Token") from exc
        if exc.code == 404:
            raise GiteaServiceError("课程包不存在或索引配置错误") from exc
        raise GiteaServiceError(f"拉取课程包失败: HTTP {exc.code} {exc.reason}") from exc
    except (error.URLError, TimeoutError, socket.timeout) as exc:
        raise GiteaServiceError("拉取超时，请稍后重试") from exc

    with tempfile.TemporaryDirectory() as tmp_dir:
        zip_path = Path(tmp_dir) / "course.zip"
        extract_dir = Path(tmp_dir) / "extract"
        extract_dir.mkdir(parents=True, exist_ok=True)
        zip_path.write_bytes(data)
        try:
            with zipfile.ZipFile(zip_path, "r") as zipf:
                _report_progress(progress_callback, phase="extracting", percent=82, message="正在解压课程包...")
                extracted_root = _extract_course_archive(
                    zipf,
                    extract_dir,
                    progress_callback=progress_callback,
                    percent_start=82,
                    percent_end=90,
                )
                _report_progress(progress_callback, phase="validating", percent=92, message="正在校验课程结构...")
                scan_course(str(extracted_root))
                backup_path = _backup_and_replace_course_dir(
                    staged_dir=extracted_root,
                    target_dir=target_dir,
                    replace_existing=replace_existing,
                    backup_before_replace=backup_before_replace,
                    progress_callback=progress_callback,
                )
        except zipfile.BadZipFile as exc:
            raise GiteaServiceError("课程包格式错误，无法解压") from exc

    _report_progress(progress_callback, phase="validating", percent=98, message="正在确认本地课程...")
    scan_result = scan_course(str(target_dir))
    if backup_path:
        scan_result.summary["backup_path"] = backup_path
    return scan_result


def import_local_course_package(
    *,
    package_path: str,
    target_path: str,
    replace_existing: bool = True,
    backup_before_replace: bool = True,
    progress_callback: ProgressCallback = None,
) -> CourseScanResult:
    source_path = Path(package_path).expanduser()
    if not source_path.exists():
        raise GiteaServiceError("课程包不存在")

    target_dir = Path(target_path).expanduser()
    target_dir.parent.mkdir(parents=True, exist_ok=True)
    _report_progress(progress_callback, phase="preparing", percent=3, message="正在准备本地课程包...")

    with tempfile.TemporaryDirectory() as tmp_dir:
        staged_dir = Path(tmp_dir) / "course"
        staged_dir.mkdir(parents=True, exist_ok=True)

        if source_path.is_dir():
            source_root = source_path.resolve()
            target_root = target_dir.resolve()
            if (
                source_root == target_root
                or source_root in target_root.parents
                or target_root in source_root.parents
            ):
                raise GiteaServiceError("课程包目录与本地保存位置不能重叠")
            extracted_root = _stage_local_course_directory(
                source_path,
                staged_dir,
                progress_callback=progress_callback,
            )
        else:
            if source_path.suffix.lower() != ".zip":
                raise GiteaServiceError("仅支持导入 zip 课程包或已解压目录")
            try:
                with zipfile.ZipFile(source_path, "r") as zipf:
                    extracted_root = _extract_course_archive(
                        zipf,
                        staged_dir,
                        progress_callback=progress_callback,
                        percent_start=10,
                        percent_end=78,
                    )
            except zipfile.BadZipFile as exc:
                raise GiteaServiceError("课程包格式错误，无法解压") from exc

        if not (extracted_root / "course.json").exists():
            raise GiteaServiceError("课程包缺少 course.json")

        _report_progress(progress_callback, phase="validating", percent=84, message="正在校验课程结构...")
        scan_course(str(extracted_root))
        backup_path = _backup_and_replace_course_dir(
            staged_dir=extracted_root,
            target_dir=target_dir,
            replace_existing=replace_existing,
            backup_before_replace=backup_before_replace,
            progress_callback=progress_callback,
        )

    _report_progress(progress_callback, phase="validating", percent=98, message="正在确认本地课程...")
    scan_result = scan_course(str(target_dir))
    if backup_path:
        scan_result.summary["backup_path"] = backup_path
    return scan_result
