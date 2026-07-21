#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
学生端聊天边界检测。

用于识别落在教师侧内容生产范围内的问题（课程打包/发布），
从而让 /api/ai/ask 返回边界提示而不是把问题转发给
学生学习助手。这些能力现在完全由 Claude skill（xedu-pack /
xedu-course-builder）承接，聊天助手只负责识别并拒绝，不再执行任何操作。
"""

from __future__ import annotations

import re
from typing import Any, Dict, List, Optional

_CONFIRM_PATTERNS = (
    r"^\s*(确认|可以|执行|开始吧|继续|同意|ok|okay|yes|y)\s*[！!。.]?\s*$",
    r"(请)?(确认|执行|继续).*(接入|绑定|注入)",
)
_PACK_KEYWORDS = ("xedu-pack", "xedu pack", "打包", "课程包", "发布课程", "推送仓库", "推送gitea")


def _normalize_text(value: Any) -> str:
    return str(value or "").strip()


def looks_like_confirmation(text: str) -> bool:
    clean = _normalize_text(text)
    if not clean:
        return False
    return any(re.search(pattern, clean, flags=re.IGNORECASE) for pattern in _CONFIRM_PATTERNS)


def looks_like_xedu_pack_request(text: str, history: Optional[List[Dict[str, str]]] = None) -> bool:
    history = history or []
    source = " ".join([
        text or "",
        " ".join(_normalize_text(item.get("content")) for item in history[-6:]),
    ]).lower()
    return any(keyword in source for keyword in _PACK_KEYWORDS)
