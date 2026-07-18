"""
Gitea API client primitives shared by resource services.
"""

from __future__ import annotations

import base64
import json
from typing import Any, Dict, Optional
from urllib import error, parse, request


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
            except GiteaServiceError:
                continue
            if isinstance(data, dict):
                sha = str(data.get("sha") or "").strip()
                if sha:
                    return sha
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

    def delete_file(self, path: str, message: str) -> Dict[str, Any]:
        clean_path = (path or "").strip("/")
        if not clean_path:
            raise GiteaServiceError("删除文件路径不能为空")
        existing = self.get_content(clean_path)
        if not existing or not existing.get("sha"):
            return {"skipped": True, "path": clean_path}
        encoded_path = parse.quote(clean_path, safe="/")
        payload: Dict[str, Any] = {
            "sha": existing["sha"],
            "message": message,
            "branch": self.branch,
        }
        try:
            return self._request(
                "DELETE",
                f"/repos/{self.owner}/{self.repo_name}/contents/{encoded_path}",
                payload=payload,
            )
        except GiteaServiceError as exc:
            raise GiteaServiceError(f"删除文件失败: {clean_path} ({exc})") from exc

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
