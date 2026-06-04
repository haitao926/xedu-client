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
import shutil
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

MAX_FILE_SIZE = 100 * 1024 * 1024  # 100MB
IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".webp"}
TESTABLE_FILE_EXTENSIONS = (
    ".html",
    ".htm",
    ".blockly.xml",
    ".blockly.json",
    ".ipynb",
    ".py",
)


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
    ) -> Any:
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
        encoded_path = parse.quote((path or "").strip("/"), safe="/")
        try:
            return self._request(
                "GET",
                f"/repos/{self.owner}/{self.repo_name}/contents/{encoded_path}",
                params={"ref": self.branch},
            )
        except GiteaServiceError as exc:
            if "HTTP 404" in str(exc):
                return None
            raise

    def _get_content_sha_with_fallback(self, path: str) -> str:
        clean_path = (path or "").strip("/")
        encoded_path = parse.quote(clean_path, safe="/")
        candidates = [self.branch, "", "main"]
        for ref in candidates:
            params = {"ref": ref} if ref else None
            try:
                data = self._request(
                    "GET",
                    f"/repos/{self.owner}/{self.repo_name}/contents/{encoded_path}",
                    params=params,
                )
            except GiteaServiceError as exc:
                if "HTTP 404" in str(exc):
                    continue
                continue
            if isinstance(data, dict):
                sha = str(data.get("sha") or "").strip()
                if sha:
                    return sha
            # Fallback to git tree lookup for instances where contents API cannot
            # resolve nested paths with ref but still requires SHA for updates.
            tree_sha = self._get_content_sha_from_tree(clean_path, ref or self.branch)
            if tree_sha:
                return tree_sha
        return ""

    def _get_content_sha_from_tree(self, path: str, ref: str) -> str:
        clean_path = (path or "").strip("/")
        if not clean_path:
            return ""
        ref_name = (ref or self.branch or "main").strip()
        if not ref_name:
            return ""
        encoded_ref = parse.quote(ref_name, safe="")
        try:
            tree = self._request(
                "GET",
                f"/repos/{self.owner}/{self.repo_name}/git/trees/{encoded_ref}",
                params={"recursive": "1"},
            )
        except GiteaServiceError:
            return ""
        items = tree.get("tree") if isinstance(tree, dict) else None
        if not isinstance(items, list):
            return ""
        for item in items:
            if not isinstance(item, dict):
                continue
            if str(item.get("path") or "").strip("/") != clean_path:
                continue
            sha = str(item.get("sha") or "").strip()
            if sha:
                return sha
        return ""

    def upsert_file(self, path: str, content: bytes, message: str) -> Dict[str, Any]:
        encoded_path = parse.quote((path or "").strip("/"), safe="/")
        encoded = base64.b64encode(content).decode("utf-8")
        payload: Dict[str, Any] = {
            "content": encoded,
            "message": message,
            "branch": self.branch,
        }
        existing = self.get_content(path)
        method = "POST"
        if existing and existing.get("sha"):
            payload["sha"] = existing["sha"]
            method = "PUT"
        try:
            return self._request(
                method,
                f"/repos/{self.owner}/{self.repo_name}/contents/{encoded_path}",
                payload=payload,
            )
        except GiteaServiceError as exc:
            text = str(exc)
            # Some Gitea instances require SHA for updates but GET may return 404 on branch/ref.
            # Retry once with a fallback SHA lookup to avoid false publish failures.
            if "HTTP 422" in text and "SHA" in text.upper() and "REQUIRED" in text.upper() and "sha" not in payload:
                retry_sha = self._get_content_sha_with_fallback(path)
                if retry_sha:
                    payload["sha"] = retry_sha
                    return self._request(
                        "PUT",
                        f"/repos/{self.owner}/{self.repo_name}/contents/{encoded_path}",
                        payload=payload,
                    )
            raise GiteaServiceError(f"写入文件失败: {path} ({text})") from exc

    def with_branch(self, branch: str) -> "GiteaClient":
        return GiteaClient(self.base_url, self.repo, branch or self.branch, self.token)

    def branch_exists(self, branch: str) -> bool:
        encoded = parse.quote((branch or "").strip(), safe="")
        if not encoded:
            return False
        try:
            self._request("GET", f"/repos/{self.owner}/{self.repo_name}/branches/{encoded}")
            return True
        except GiteaServiceError as exc:
            if "HTTP 404" in str(exc):
                return False
            raise

    def ensure_branch(self, branch: str, from_branch: str = "") -> None:
        target = (branch or "").strip()
        source = (from_branch or self.branch or "main").strip() or "main"
        if not target:
            raise GiteaServiceError("分支名称不能为空")
        if self.branch_exists(target):
            return
        payload = {
            "new_branch_name": target,
            "old_branch_name": source,
        }
        try:
            self._request("POST", f"/repos/{self.owner}/{self.repo_name}/branches", payload=payload)
        except GiteaServiceError as exc:
            if "HTTP 409" in str(exc) and self.branch_exists(target):
                return
            raise GiteaServiceError(f"创建分支失败: {target}（基线分支: {source}）{exc}") from exc

    def create_pull_request(
        self,
        *,
        head: str,
        base: str,
        title: str,
        body: str = "",
    ) -> Dict[str, Any]:
        payload: Dict[str, Any] = {
            "title": title,
            "head": head,
            "base": base,
        }
        if body:
            payload["body"] = body
        try:
            return self._request(
                "POST",
                f"/repos/{self.owner}/{self.repo_name}/pulls",
                payload=payload,
            )
        except GiteaServiceError as exc:
            text = str(exc)
            if "HTTP 409" in text or "already exists" in text.lower():
                existing = self.find_open_pull_request(head=head, base=base)
                if existing:
                    existing["_existing"] = True
                    return existing
                raise GiteaServiceError("已存在相同分支的未合并 PR，请先处理现有 PR") from exc
            raise

    def find_open_pull_request(self, *, head: str, base: str) -> Optional[Dict[str, Any]]:
        params = {
            "state": "open",
            "base": base,
            "head": f"{self.owner}:{head}",
        }
        try:
            data = self._request(
                "GET",
                f"/repos/{self.owner}/{self.repo_name}/pulls",
                params=params,
            )
        except GiteaServiceError:
            return None
        if isinstance(data, list) and data:
            first = data[0]
            if isinstance(first, dict):
                return first
        return None

    def get_current_user(self) -> str:
        try:
            data = self._request("GET", "/user")
        except GiteaServiceError:
            return ""
        if not isinstance(data, dict):
            return ""
        return str(data.get("login") or data.get("username") or "").strip()

    def repo_exists(self) -> bool:
        try:
            self._request("GET", f"/repos/{self.owner}/{self.repo_name}")
            return True
        except GiteaServiceError as exc:
            if "HTTP 404" in str(exc):
                return False
            raise

    def get_repo_info(self) -> Dict[str, Any]:
        data = self._request("GET", f"/repos/{self.owner}/{self.repo_name}")
        return data if isinstance(data, dict) else {}

    def create_repo(self, *, private: bool = False, description: str = "") -> Dict[str, Any]:
        payload: Dict[str, Any] = {
            "name": self.repo_name,
            "private": bool(private),
            "auto_init": False,
        }
        if description:
            payload["description"] = description

        current_user = self.get_current_user()
        owner = (self.owner or "").strip()
        if current_user and owner.lower() == current_user.lower():
            path = "/user/repos"
        else:
            encoded_owner = parse.quote(owner, safe="")
            path = f"/orgs/{encoded_owner}/repos"

        try:
            return self._request("POST", path, payload=payload)
        except GiteaServiceError as exc:
            text = str(exc)
            if "HTTP 409" in text:
                return {"_existing": True}
            raise

    def ensure_repo(
        self,
        *,
        create_if_missing: bool = True,
        private: bool = False,
        description: str = "",
    ) -> Dict[str, Any]:
        exists = self.repo_exists()
        if exists:
            return {"exists": True, "created": False}
        if not create_if_missing:
            raise GiteaServiceError("目标课程仓库不存在，请先创建仓库")
        self.create_repo(private=private, description=description)
        return {"exists": False, "created": True}


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
) -> bytes:
    attempts = _iter_read_tokens(token, prefer_anonymous=prefer_anonymous)
    last_exc: Exception | None = None

    for idx, active_token in enumerate(attempts):
        req = request.Request(url)
        if active_token:
            req.add_header("Authorization", f"token {active_token}")
        try:
            with request.urlopen(req, timeout=timeout) as resp:
                return resp.read()
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
    return parsed


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


def _normalize_course_data(course: Dict[str, Any]) -> Dict[str, Any]:
    normalized = dict(course or {})
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
    course_id = str(course_data.get("id") or "").strip()
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


def _normalize_course_path(path: Any) -> str:
    return str(path or "").strip().replace("\\", "/").lstrip("/")


def _is_external_course_path(path: str) -> bool:
    return path.startswith("http://") or path.startswith("https://")


def _is_directory_entry(file_entry: Dict[str, Any]) -> bool:
    raw_type = str(file_entry.get("type") or file_entry.get("kind") or "").strip().lower()
    path = _normalize_course_path(file_entry.get("path") or file_entry.get("name"))
    return raw_type in {"dir", "directory", "folder"} or path.endswith("/")


def _is_testable_course_file(path: str) -> bool:
    lower = path.lower()
    return any(lower.endswith(ext) for ext in TESTABLE_FILE_EXTENSIONS)


def _entry_kind_for_course_file(path: str, file_entry: Dict[str, Any]) -> str:
    raw_type = str(file_entry.get("type") or file_entry.get("kind") or "").strip().lower()
    lower = path.lower()
    if raw_type in {"html", "htm"} or lower.endswith((".html", ".htm")):
        return "html"
    if raw_type == "blockly" or lower.endswith((".blockly.xml", ".blockly.json")):
        return "blockly"
    if raw_type in {"ipynb", "notebook"} or lower.endswith(".ipynb"):
        return "notebook"
    if raw_type in {"py", "python"} or lower.endswith(".py"):
        return "python"
    return raw_type or "file"


def _flatten_course_files(files: Any, bucket: Optional[List[Dict[str, Any]]] = None) -> List[Dict[str, Any]]:
    items = bucket if bucket is not None else []
    if not isinstance(files, list):
        return items
    for item in files:
        if isinstance(item, str):
            items.append({"path": item})
            continue
        if not isinstance(item, dict):
            continue
        items.append(item)
        children = item.get("children")
        if isinstance(children, list):
            _flatten_course_files(children, items)
    return items


def _course_file_exists(
    *,
    path: str,
    local_base: Optional[Path] = None,
    remote_paths: Optional[set[str]] = None,
) -> bool:
    clean_path = _normalize_course_path(path)
    if not clean_path:
        return False
    if _is_external_course_path(clean_path):
        return True
    if local_base is not None:
        target = (local_base / clean_path).resolve()
        try:
            base = local_base.resolve()
            if target != base and base not in target.parents:
                return False
        except OSError:
            return False
        return target.exists() and target.is_file()
    if remote_paths is not None:
        return clean_path in remote_paths
    return True


def _inspect_course_experiment(
    *,
    experiment: Dict[str, Any],
    section_index: int,
    experiment_index: int,
    local_base: Optional[Path] = None,
    remote_paths: Optional[set[str]] = None,
) -> Dict[str, Any]:
    files = _flatten_course_files(experiment.get("files") or experiment.get("items") or experiment.get("resources") or [])
    file_entries = []
    entries = []
    missing_files = []

    for file_entry in files:
        if not isinstance(file_entry, dict) or _is_directory_entry(file_entry):
            continue
        path = _normalize_course_path(file_entry.get("path") or file_entry.get("url") or file_entry.get("name"))
        if not path:
            continue
        exists = _course_file_exists(path=path, local_base=local_base, remote_paths=remote_paths)
        kind = _entry_kind_for_course_file(path, file_entry)
        file_entries.append({"path": path, "kind": kind, "exists": exists})
        if not exists:
            missing_files.append(path)
        if _is_testable_course_file(path):
            entries.append({"path": path, "kind": kind, "exists": exists})

    issues: List[str] = []
    if not file_entries:
        issues.append("实验未配置文件")
    if missing_files:
        issues.append("存在缺失文件")
    if file_entries and not entries:
        issues.append("未配置可测试入口")
    if entries and not any(entry.get("exists") for entry in entries):
        issues.append("可测试入口文件缺失")

    if not file_entries or missing_files or (entries and not any(entry.get("exists") for entry in entries)):
        status = "broken"
    elif not entries:
        status = "partial"
    else:
        status = "ready"

    return {
        "section_index": section_index,
        "experiment_index": experiment_index,
        "title": experiment.get("title") or experiment.get("name") or f"实验 {experiment_index + 1}",
        "status": status,
        "issues": issues,
        "entries": entries,
        "missing_files": missing_files,
        "file_count": len(file_entries),
    }


def inspect_course(
    course: Dict[str, Any],
    *,
    local_path: str = "",
    remote_tree: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    normalized = _normalize_course_data(course)
    local_base = Path(local_path).resolve() if local_path else None
    remote_paths: Optional[set[str]] = None
    if remote_tree is not None:
        remote_paths = {
            _normalize_course_path(item.get("path"))
            for item in remote_tree
            if isinstance(item, dict)
            and str(item.get("type") or "").lower() == "blob"
            and _normalize_course_path(item.get("path"))
        }

    section_results = []
    ready_count = 0
    partial_count = 0
    broken_count = 0

    sections = normalized.get("sections") or []
    for section_index, section in enumerate(sections):
        experiments = section.get("experiments") or section.get("items") or []
        experiment_results = []
        if isinstance(experiments, list):
            for experiment_index, experiment in enumerate(experiments):
                if not isinstance(experiment, dict):
                    continue
                result = _inspect_course_experiment(
                    experiment=experiment,
                    section_index=section_index,
                    experiment_index=experiment_index,
                    local_base=local_base,
                    remote_paths=remote_paths,
                )
                ready_count += 1 if result["status"] == "ready" else 0
                partial_count += 1 if result["status"] == "partial" else 0
                broken_count += 1 if result["status"] == "broken" else 0
                experiment_results.append(result)
        section_results.append({
            "section_index": section_index,
            "title": section.get("title") or section.get("name") or f"第 {section_index + 1} 课",
            "experiments": experiment_results,
        })

    summary = _summarize_course(normalized)
    summary.update({
        "ready_count": ready_count,
        "partial_count": partial_count,
        "broken_count": broken_count,
    })
    return {
        "course": normalized,
        "summary": summary,
        "inspection": {
            "sections": section_results,
        },
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
    if lower.endswith(".blockly.xml") or lower.endswith(".blockly.json"):
        return "blockly"
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
            "updated_at": datetime.utcnow().strftime("%Y-%m-%d"),
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
        index_data["updated_at"] = datetime.utcnow().strftime("%Y-%m-%d")

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
        return path_or_url
    clean = path_or_url.lstrip("/")
    return f"{raw_base_url}/{clean}"


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


def _backup_and_replace_course_dir(
    *,
    staged_dir: Path,
    target_dir: Path,
    replace_existing: bool = True,
    backup_before_replace: bool = True,
) -> str:
    target_dir.mkdir(parents=True, exist_ok=True)
    backup_path = ""
    existing_items = list(target_dir.iterdir())
    has_course_json = (target_dir / "course.json").exists()
    if replace_existing and existing_items and has_course_json:
        if backup_before_replace:
            stamp = datetime.utcnow().strftime("%Y%m%d%H%M%S")
            backup_root = target_dir.parent / ".xedu_backup" / target_dir.name
            backup_root.mkdir(parents=True, exist_ok=True)
            backup_target = backup_root / stamp
            shutil.copytree(target_dir, backup_target)
            backup_path = str(backup_target)
        for item in existing_items:
            if item.is_dir():
                shutil.rmtree(item)
            else:
                item.unlink(missing_ok=True)

    for item in staged_dir.iterdir():
        destination = target_dir / item.name
        if item.is_dir():
            shutil.copytree(item, destination, dirs_exist_ok=True)
        else:
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(item, destination)
    return backup_path


def _sync_single_course_repo(
    *,
    base_url: str,
    repo: str,
    branch: str,
    raw_base_url: str,
    target_path: str,
    token: str = "",
    replace_existing: bool = True,
    backup_before_replace: bool = True,
) -> CourseScanResult:
    target_dir = Path(target_path)
    tree_items = load_repo_tree_data(
        base_url=base_url,
        repo=repo,
        branch=branch,
        token=token,
    )
    file_paths = sorted(
        {
            str(item.get("path") or "").strip().strip("/")
            for item in tree_items
            if str(item.get("type") or "").lower() == "blob"
            and _is_syncable_repo_path(str(item.get("path") or ""))
        }
    )
    if "course.json" not in file_paths:
        raise GiteaServiceError("仓库根目录未找到 course.json")

    with tempfile.TemporaryDirectory() as tmp_dir:
        staged_dir = Path(tmp_dir) / "course"
        staged_dir.mkdir(parents=True, exist_ok=True)

        for rel_path in file_paths:
            download_url = resolve_raw_url(raw_base_url, rel_path)
            try:
                data = fetch_url_bytes_with_auth_fallback(
                    download_url,
                    token=token,
                    timeout=60,
                    prefer_anonymous=True,
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

        scan_course(str(staged_dir))
        backup_path = _backup_and_replace_course_dir(
            staged_dir=staged_dir,
            target_dir=target_dir,
            replace_existing=replace_existing,
            backup_before_replace=backup_before_replace,
        )
        final_result = scan_course(str(target_dir))
        if backup_path:
            final_result.summary["backup_path"] = backup_path
        return final_result


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
) -> CourseScanResult:
    target_dir = Path(target_path)
    target_dir.mkdir(parents=True, exist_ok=True)

    if single_course_repo:
        return _sync_single_course_repo(
            base_url=base_url,
            repo=repo,
            branch=branch,
            raw_base_url=raw_base_url,
            target_path=target_path,
            token=token,
            replace_existing=replace_existing,
            backup_before_replace=backup_before_replace,
        )

    if not package_url:
        raise GiteaServiceError("课程包地址为空")

    download_url = resolve_raw_url(raw_base_url, package_url)

    try:
        data = fetch_url_bytes_with_auth_fallback(
            download_url,
            token=token,
            timeout=60,
            prefer_anonymous=True,
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
                zipf.extractall(extract_dir)
                extracted_root = extract_dir
                if not (extracted_root / "course.json").exists():
                    top_level = [item for item in extract_dir.iterdir()]
                    if len(top_level) == 1 and top_level[0].is_dir() and (top_level[0] / "course.json").exists():
                        extracted_root = top_level[0]
                backup_path = _backup_and_replace_course_dir(
                    staged_dir=extracted_root,
                    target_dir=target_dir,
                    replace_existing=replace_existing,
                    backup_before_replace=backup_before_replace,
                )
        except zipfile.BadZipFile as exc:
            raise GiteaServiceError("课程包格式错误，无法解压") from exc

    # Validate course.json after extraction
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
) -> CourseScanResult:
    source_path = Path(package_path).expanduser()
    if not source_path.exists():
        raise GiteaServiceError("课程包不存在")

    target_dir = Path(target_path).expanduser()
    target_dir.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory() as tmp_dir:
        staged_dir = Path(tmp_dir) / "course"
        staged_dir.mkdir(parents=True, exist_ok=True)

        if source_path.is_dir():
            if source_path.resolve() == target_dir.resolve():
                raise GiteaServiceError("课程包目录与本地保存位置不能相同")
            extracted_root = source_path
        else:
            if source_path.suffix.lower() != ".zip":
                raise GiteaServiceError("仅支持导入 zip 课程包或已解压目录")
            try:
                with zipfile.ZipFile(source_path, "r") as zipf:
                    zipf.extractall(staged_dir)
            except zipfile.BadZipFile as exc:
                raise GiteaServiceError("课程包格式错误，无法解压") from exc
            extracted_root = staged_dir
            if not (extracted_root / "course.json").exists():
                top_level = [item for item in staged_dir.iterdir()]
                if len(top_level) == 1 and top_level[0].is_dir() and (top_level[0] / "course.json").exists():
                    extracted_root = top_level[0]

        if not (extracted_root / "course.json").exists():
            raise GiteaServiceError("课程包缺少 course.json")

        scan_course(str(extracted_root))
        backup_path = _backup_and_replace_course_dir(
            staged_dir=extracted_root,
            target_dir=target_dir,
            replace_existing=replace_existing,
            backup_before_replace=backup_before_replace,
        )

    scan_result = scan_course(str(target_dir))
    if backup_path:
        scan_result.summary["backup_path"] = backup_path
    return scan_result
