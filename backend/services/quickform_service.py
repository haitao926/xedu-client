#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
QuickForm CLI service helpers.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List

import requests


class QuickFormServiceError(Exception):
    """QuickForm API error."""


@dataclass
class QuickFormTask:
    apiid: str
    task_name: str
    task_intro: str = ""
    submit_url: str = ""
    query_url: str = ""
    summary_url: str = ""
    report_url: str = ""

    def to_dict(self) -> Dict[str, Any]:
        return {
            "apiid": self.apiid,
            "task_name": self.task_name,
            "task_intro": self.task_intro,
            "submit_url": self.submit_url,
            "query_url": self.query_url,
            "summary_url": self.summary_url,
            "report_url": self.report_url,
        }


def normalize_base_url(base_url: str) -> str:
    text = (base_url or "").strip().rstrip("/")
    if not text:
        return "https://quickform.cn"
    return text


def build_task_links(base_url: str, apiid: str) -> Dict[str, str]:
    clean_base = normalize_base_url(base_url)
    clean_apiid = (apiid or "").strip()
    if not clean_apiid:
        raise QuickFormServiceError("缺少 apiid")
    submit_url = f"{clean_base}/api/{clean_apiid}"
    return {
        "submit_url": submit_url,
        "query_url": f"{submit_url}/all",
        "summary_url": submit_url,
        "report_url": "",
    }


class QuickFormService:
    def __init__(
        self,
        *,
        base_url: str,
        username: str,
        password: str,
        timeout: int = 20,
    ):
        self.base_url = normalize_base_url(base_url)
        self.username = (username or "").strip()
        self.password = password or ""
        self.timeout = timeout

    def validate_credentials(self) -> None:
        if not self.username:
            raise QuickFormServiceError("QuickForm 用户名不能为空")
        if not self.password:
            raise QuickFormServiceError("QuickForm 密码不能为空")

    def _post_json(self, path: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        self.validate_credentials()
        url = f"{self.base_url}{path}"
        try:
            response = requests.post(
                url,
                json=payload,
                timeout=self.timeout,
            )
        except requests.RequestException as exc:
            raise QuickFormServiceError(f"请求 QuickForm 失败: {exc}") from exc

        try:
            data = response.json()
        except ValueError as exc:
            raise QuickFormServiceError("QuickForm 返回了无效 JSON") from exc

        if response.status_code >= 400 or not data.get("success", False):
            message = (data.get("message") or f"QuickForm 请求失败（HTTP {response.status_code}）").strip()
            raise QuickFormServiceError(message)

        return data

    def list_tasks(self) -> List[QuickFormTask]:
        data = self._post_json(
            "/cli/list",
            {
                "username": self.username,
                "password": self.password,
            },
        )
        tasks = []
        for item in data.get("tasks") or []:
            apiid = str(item.get("apiid") or "").strip()
            task_name = str(item.get("name") or item.get("task_name") or "").strip()
            if not apiid:
                continue
            tasks.append(
                QuickFormTask(
                    apiid=apiid,
                    task_name=task_name or apiid,
                    **build_task_links(self.base_url, apiid),
                )
            )
        return tasks

    def create_task(self, task_name: str, task_intro: str = "") -> QuickFormTask:
        clean_name = (task_name or "").strip()
        if not clean_name:
            raise QuickFormServiceError("任务名称不能为空")

        data = self._post_json(
            "/cli/add",
            {
                "username": self.username,
                "password": self.password,
                "task_name": clean_name,
                "task_intro": (task_intro or "").strip(),
            },
        )
        apiid = str(data.get("apiid") or "").strip()
        if not apiid:
            raise QuickFormServiceError("QuickForm 未返回 apiid")
        return QuickFormTask(
            apiid=apiid,
            task_name=clean_name,
            task_intro=(task_intro or "").strip(),
            **build_task_links(self.base_url, apiid),
        )
