#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
QuickForm chat agent service and XEdu tool adapter.
"""

from __future__ import annotations

import asyncio
import copy
import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple

from models.config import AIConfig
from services.ai_service import AIService
from services.gitea_service import GiteaServiceError, save_course_json, scan_course
from services.quickform_service import (
    QuickFormService,
    QuickFormServiceError,
    build_task_links,
)
from utils.logger import get_logger

logger = get_logger(__name__)

MutationCheck = Callable[[Dict[str, Any]], Tuple[bool, str]]
QuickFormFactory = Callable[[], QuickFormService]
HtmlInjector = Callable[[str, str, Dict[str, Any], bool], Dict[str, Any]]
CourseSaver = Callable[[str, Dict[str, Any]], Dict[str, Any]]

_HTML_EXTENSIONS = {".html", ".htm"}
_CONFIRM_PATTERNS = (
    r"^\s*(确认|可以|执行|开始吧|继续|同意|ok|okay|yes|y)\s*[！!。.]?\s*$",
    r"(请)?(确认|执行|继续).*(接入|绑定|注入)",
)
_QUICKFORM_KEYWORDS = (
    "quickform",
    "表单",
    "接入",
    "绑定",
    "注入",
    "签到",
    "实验报告",
    "apiid",
)


def _safe_int(value: Any) -> Optional[int]:
    try:
        if value is None or value == "":
            return None
        return int(value)
    except (TypeError, ValueError):
        return None


def _normalize_text(value: Any) -> str:
    return str(value or "").strip()


def _clean_json_text(text: str) -> str:
    raw = (text or "").strip()
    if raw.startswith("```"):
        raw = re.sub(r"^```(?:json)?\s*", "", raw)
        raw = re.sub(r"\s*```$", "", raw)
    return raw.strip()


def _truncate_json(data: Any, limit: int = 4000) -> str:
    text = json.dumps(data, ensure_ascii=False)
    if len(text) <= limit:
        return text
    return text[:limit] + "…"


def _extract_html_paths(experiment: Dict[str, Any]) -> List[str]:
    files = experiment.get("files") or []
    results: List[str] = []
    for item in files:
        if not isinstance(item, dict):
            continue
        file_type = _normalize_text(item.get("type")).lower()
        path = _normalize_text(item.get("path") or item.get("name"))
        if not path or path.endswith("/"):
            continue
        suffix = Path(path).suffix.lower()
        if file_type == "html" or suffix in _HTML_EXTENSIONS:
            results.append(path)
    return results


def _build_experiment_summary(section: Dict[str, Any], experiment: Dict[str, Any], section_index: int, experiment_index: int) -> Dict[str, Any]:
    return {
        "section_index": section_index + 1,
        "experiment_index": experiment_index + 1,
        "section_title": _normalize_text(section.get("title")) or f"课节 {section_index + 1}",
        "experiment_title": _normalize_text(experiment.get("title")) or f"实验 {experiment_index + 1}",
    }


@dataclass
class ToolResult:
    success: bool
    message: str = ""
    data: Optional[Dict[str, Any]] = None

    def to_dict(self) -> Dict[str, Any]:
        payload = {
            "success": self.success,
            "message": self.message,
        }
        if self.data is not None:
            payload.update(self.data)
        return payload


class QuickFormAgentToolAdapter:
    def __init__(
        self,
        *,
        quickform_factory: QuickFormFactory,
        mutation_guard: MutationCheck,
        html_injector: HtmlInjector,
        course_saver: CourseSaver,
    ):
        self.quickform_factory = quickform_factory
        self.mutation_guard = mutation_guard
        self.html_injector = html_injector
        self.course_saver = course_saver

    def invoke(self, tool_name: str, args: Dict[str, Any], request_context: Dict[str, Any]) -> Dict[str, Any]:
        dispatch = {
            "get_current_course_context": self.get_current_course_context,
            "find_experiment_by_title_or_index": self.find_experiment_by_title_or_index,
            "list_experiment_html_files": self.list_experiment_html_files,
            "get_quickform_settings_status": self.get_quickform_settings_status,
            "list_quickform_tasks": self.list_quickform_tasks,
            "create_quickform_task": self.create_quickform_task,
            "prepare_quickform_binding_plan": self.prepare_quickform_binding_plan,
            "apply_quickform_binding": self.apply_quickform_binding,
            "inject_quickform_into_html": self.inject_quickform_into_html,
            "save_course_changes": self.save_course_changes,
        }
        handler = dispatch.get(tool_name)
        if not handler:
            return ToolResult(False, f"未知工具: {tool_name}").to_dict()
        try:
            return handler(request_context=request_context, **(args or {}))
        except (GiteaServiceError, QuickFormServiceError, ValueError) as exc:
            return ToolResult(False, str(exc)).to_dict()
        except Exception as exc:
            logger.exception("QuickForm agent tool failed: %s", tool_name)
            return ToolResult(False, f"{tool_name} 执行失败: {exc}").to_dict()

    def _resolve_course(self, request_context: Dict[str, Any]) -> Tuple[Dict[str, Any], str]:
        context = request_context.get("context") or {}
        course = context.get("course") if isinstance(context.get("course"), dict) else {}
        local_path = _normalize_text((course or {}).get("local_path") or context.get("local_path"))
        source = _normalize_text((course or {}).get("source") or context.get("source") or "local")
        if source != "local":
            raise ValueError("仅支持本地可编辑课程")
        if not local_path:
            raise ValueError("缺少当前课程 local_path")
        if not course or not isinstance(course.get("sections"), list):
            course = scan_course(local_path).course
            course["local_path"] = local_path
            course["source"] = "local"
        return copy.deepcopy(course), local_path

    def _find_candidates(
        self,
        course: Dict[str, Any],
        *,
        section_index: Any = None,
        experiment_index: Any = None,
        experiment_title: str = "",
    ) -> List[Tuple[Dict[str, Any], Dict[str, Any], int, int]]:
        sections = course.get("sections") or []
        section_idx = _safe_int(section_index)
        experiment_idx = _safe_int(experiment_index)
        title = _normalize_text(experiment_title).lower()

        candidates: List[Tuple[Dict[str, Any], Dict[str, Any], int, int]] = []
        if section_idx is not None and experiment_idx is not None:
            s_idx = section_idx - 1
            e_idx = experiment_idx - 1
            if 0 <= s_idx < len(sections):
                experiments = sections[s_idx].get("experiments") or []
                if 0 <= e_idx < len(experiments):
                    return [(sections[s_idx], experiments[e_idx], s_idx, e_idx)]
            return []

        for s_idx, section in enumerate(sections):
            experiments = section.get("experiments") or []
            if section_idx is not None and section_idx - 1 != s_idx:
                continue
            for e_idx, experiment in enumerate(experiments):
                if experiment_idx is not None and experiment_idx - 1 != e_idx:
                    continue
                if title:
                    exp_title = _normalize_text(experiment.get("title")).lower()
                    if title not in exp_title:
                        continue
                candidates.append((section, experiment, s_idx, e_idx))
        return candidates

    def _resolve_single_experiment(
        self,
        course: Dict[str, Any],
        *,
        section_index: Any = None,
        experiment_index: Any = None,
        experiment_title: str = "",
    ) -> Tuple[Dict[str, Any], Dict[str, Any], int, int]:
        candidates = self._find_candidates(
            course,
            section_index=section_index,
            experiment_index=experiment_index,
            experiment_title=experiment_title,
        )
        if not candidates:
            raise ValueError("未找到匹配的实验")
        if len(candidates) > 1:
            summaries = [
                _build_experiment_summary(section, experiment, s_idx, e_idx)
                for section, experiment, s_idx, e_idx in candidates
            ]
            raise ValueError(f"找到多个匹配实验，请进一步确认: {_truncate_json(summaries, 600)}")
        return candidates[0]

    def get_current_course_context(self, *, request_context: Dict[str, Any], **_: Any) -> Dict[str, Any]:
        course, local_path = self._resolve_course(request_context)
        sections = course.get("sections") or []
        section_summaries = []
        for s_idx, section in enumerate(sections):
            section_summaries.append({
                "section_index": s_idx + 1,
                "section_title": _normalize_text(section.get("title")) or f"课节 {s_idx + 1}",
                "experiments": [
                    {
                        "experiment_index": e_idx + 1,
                        "experiment_title": _normalize_text(exp.get("title")) or f"实验 {e_idx + 1}",
                    }
                    for e_idx, exp in enumerate(section.get("experiments") or [])
                ],
            })
        return ToolResult(
            True,
            "已获取当前课程上下文",
            {
                "course": {
                    "id": _normalize_text(course.get("id")),
                    "title": _normalize_text(course.get("title")),
                    "local_path": local_path,
                    "source": "local",
                    "sections": section_summaries,
                }
            },
        ).to_dict()

    def find_experiment_by_title_or_index(
        self,
        *,
        request_context: Dict[str, Any],
        section_index: Any = None,
        experiment_index: Any = None,
        experiment_title: str = "",
        **_: Any,
    ) -> Dict[str, Any]:
        course, _ = self._resolve_course(request_context)
        candidates = self._find_candidates(
            course,
            section_index=section_index,
            experiment_index=experiment_index,
            experiment_title=experiment_title,
        )
        if not candidates:
            return ToolResult(False, "未找到匹配实验").to_dict()
        summaries = [
            {
                **_build_experiment_summary(section, experiment, s_idx, e_idx),
                "html_files": _extract_html_paths(experiment),
            }
            for section, experiment, s_idx, e_idx in candidates
        ]
        return ToolResult(
            True,
            "已找到实验候选",
            {
                "count": len(summaries),
                "ambiguous": len(summaries) > 1,
                "matches": summaries,
            },
        ).to_dict()

    def list_experiment_html_files(
        self,
        *,
        request_context: Dict[str, Any],
        section_index: Any,
        experiment_index: Any,
        experiment_title: str = "",
        **_: Any,
    ) -> Dict[str, Any]:
        course, _ = self._resolve_course(request_context)
        section, experiment, s_idx, e_idx = self._resolve_single_experiment(
            course,
            section_index=section_index,
            experiment_index=experiment_index,
            experiment_title=experiment_title,
        )
        html_files = _extract_html_paths(experiment)
        return ToolResult(
            True,
            "已获取实验 HTML 文件",
            {
                "experiment": _build_experiment_summary(section, experiment, s_idx, e_idx),
                "html_files": html_files,
            },
        ).to_dict()

    def get_quickform_settings_status(self, *, request_context: Dict[str, Any], **_: Any) -> Dict[str, Any]:
        try:
            service = self.quickform_factory()
        except QuickFormServiceError as exc:
            return ToolResult(
                False,
                str(exc),
                {
                    "available": False,
                    "enabled": False,
                },
            ).to_dict()

        return ToolResult(
            True,
            "QuickForm 配置可用",
            {
                "available": True,
                "enabled": True,
                "base_url": service.base_url,
                "username_configured": bool(service.username),
                "password_configured": bool(service.password),
            },
        ).to_dict()

    def list_quickform_tasks(self, *, request_context: Dict[str, Any], **_: Any) -> Dict[str, Any]:
        service = self.quickform_factory()
        tasks = [task.to_dict() for task in service.list_tasks()]
        return ToolResult(True, "已读取 QuickForm 任务列表", {"tasks": tasks, "count": len(tasks)}).to_dict()

    def create_quickform_task(
        self,
        *,
        request_context: Dict[str, Any],
        task_name: str,
        task_intro: str = "",
        **_: Any,
    ) -> Dict[str, Any]:
        allowed, reason = self.mutation_guard(request_context)
        if not allowed:
            return ToolResult(False, reason).to_dict()
        service = self.quickform_factory()
        task = service.create_task(task_name=task_name, task_intro=task_intro)
        return ToolResult(True, "QuickForm 任务创建成功", {"task": task.to_dict()}).to_dict()

    def prepare_quickform_binding_plan(
        self,
        *,
        request_context: Dict[str, Any],
        section_index: Any = None,
        experiment_index: Any = None,
        experiment_title: str = "",
        html_path: str = "",
        task_name: str = "",
        task_intro: str = "",
        existing_apiid: str = "",
        existing_task_name: str = "",
        create_new_task: Any = True,
        **_: Any,
    ) -> Dict[str, Any]:
        try:
            service = self.quickform_factory()
        except QuickFormServiceError as exc:
            return ToolResult(False, str(exc), {"needs_input": True}).to_dict()

        course, local_path = self._resolve_course(request_context)
        section, experiment, s_idx, e_idx = self._resolve_single_experiment(
            course,
            section_index=section_index,
            experiment_index=experiment_index,
            experiment_title=experiment_title,
        )
        html_candidates = _extract_html_paths(experiment)
        selected_html = _normalize_text(html_path)
        if not selected_html:
            current_qf = experiment.get("quickform") or {}
            defaults = course.get("quickform_defaults") or {}
            selected_html = _normalize_text(current_qf.get("html_path") or defaults.get("html_path"))
        if not selected_html and len(html_candidates) == 1:
            selected_html = html_candidates[0]
        if not selected_html:
            return ToolResult(
                False,
                "目标 HTML 文件不明确，请先确认 html_path",
                {
                    "needs_input": True,
                    "html_candidates": html_candidates,
                    "experiment": _build_experiment_summary(section, experiment, s_idx, e_idx),
                },
            ).to_dict()
        if selected_html not in html_candidates and html_candidates:
            return ToolResult(
                False,
                "指定的 HTML 文件不在实验文件列表中",
                {
                    "needs_input": True,
                    "html_candidates": html_candidates,
                },
            ).to_dict()

        use_create = bool(create_new_task)
        if _normalize_text(existing_apiid):
            use_create = False
        resolved_task_name = _normalize_text(task_name)
        if use_create and not resolved_task_name:
            resolved_task_name = f"{_normalize_text(course.get('title')) or '课程'}-{_normalize_text(experiment.get('title')) or '实验'}"

        experiment_summary = _build_experiment_summary(section, experiment, s_idx, e_idx)
        plan = {
            "local_path": local_path,
            "section_index": experiment_summary["section_index"],
            "experiment_index": experiment_summary["experiment_index"],
            "experiment_title": experiment_summary["experiment_title"],
            "section_title": experiment_summary["section_title"],
            "html_path": selected_html,
            "create_new_task": use_create,
            "task_name": resolved_task_name,
            "task_intro": _normalize_text(task_intro),
            "existing_apiid": _normalize_text(existing_apiid),
            "existing_task_name": _normalize_text(existing_task_name),
        }
        action_text = (
            f"新建 QuickForm 任务“{resolved_task_name or _normalize_text(existing_task_name) or _normalize_text(existing_apiid)}”"
            if use_create else
            f"绑定已有任务 {existing_task_name or existing_apiid}"
        )
        summary = (
            f"将为《{course.get('title') or '当前课程'}》的"
            f"第 {experiment_summary['section_index']} 课《{experiment_summary['section_title']}》"
                f"中的第 {experiment_summary['experiment_index']} 个实验《{experiment_summary['experiment_title']}》"
            f"{action_text}，并注入 HTML 文件 `{selected_html}`（QuickForm: {service.base_url}）。"
        )
        return ToolResult(
            True,
            "已生成执行计划",
            {
                "needs_confirmation": True,
                "plan": plan,
                "summary": summary,
            },
        ).to_dict()

    def apply_quickform_binding(
        self,
        *,
        request_context: Dict[str, Any],
        section_index: Any = None,
        experiment_index: Any = None,
        experiment_title: str = "",
        html_path: str = "",
        task_name: str = "",
        task_intro: str = "",
        existing_apiid: str = "",
        existing_task_name: str = "",
        create_new_task: Any = True,
        **_: Any,
    ) -> Dict[str, Any]:
        allowed, reason = self.mutation_guard(request_context)
        if not allowed:
            return ToolResult(False, reason).to_dict()

        prepared = self.prepare_quickform_binding_plan(
            request_context=request_context,
            section_index=section_index,
            experiment_index=experiment_index,
            experiment_title=experiment_title,
            html_path=html_path,
            task_name=task_name,
            task_intro=task_intro,
            existing_apiid=existing_apiid,
            existing_task_name=existing_task_name,
            create_new_task=create_new_task,
        )
        if not prepared.get("success"):
            return prepared

        plan = prepared.get("plan") or {}
        course, local_path = self._resolve_course(request_context)
        section, experiment, s_idx, e_idx = self._resolve_single_experiment(
            course,
            section_index=plan.get("section_index"),
            experiment_index=plan.get("experiment_index"),
        )

        task_payload: Dict[str, Any]
        if plan.get("create_new_task"):
            service = self.quickform_factory()
            task = service.create_task(task_name=plan.get("task_name") or "", task_intro=plan.get("task_intro") or "")
            task_payload = task.to_dict()
        else:
            apiid = _normalize_text(plan.get("existing_apiid"))
            if not apiid:
                return ToolResult(False, "缺少 existing_apiid").to_dict()
            links = build_task_links(self.quickform_factory().base_url, apiid)
            task_payload = {
                "apiid": apiid,
                "task_name": _normalize_text(plan.get("existing_task_name")) or apiid,
                "task_intro": "",
                **links,
            }

        experiment["quickform"] = {
            "enabled": True,
            "apiid": task_payload.get("apiid") or "",
            "task_name": task_payload.get("task_name") or "",
            "task_intro": task_payload.get("task_intro") or "",
            "submit_url": task_payload.get("submit_url") or "",
            "query_url": task_payload.get("query_url") or "",
            "summary_url": task_payload.get("summary_url") or "",
            "report_url": task_payload.get("report_url") or "",
            "html_path": plan.get("html_path") or "",
        }
        course["updated_at"] = request_context.get("today") or ""
        saved = self.course_saver(local_path, course)
        inject_result = self.html_injector(
            local_path,
            plan.get("html_path") or "",
            experiment["quickform"],
            True,
        )

        return ToolResult(
            True,
            "QuickForm 已绑定并注入到实验",
            {
                "course": saved.get("course"),
                "summary": saved.get("summary"),
                "backup_path": inject_result.get("backup_path") or "",
                "html_path": plan.get("html_path") or "",
                "apiid": experiment["quickform"]["apiid"],
                "submit_url": experiment["quickform"]["submit_url"],
                "query_url": experiment["quickform"]["query_url"],
                "experiment": _build_experiment_summary(section, experiment, s_idx, e_idx),
            },
        ).to_dict()

    def inject_quickform_into_html(
        self,
        *,
        request_context: Dict[str, Any],
        local_path: str,
        html_path: str,
        quickform: Dict[str, Any],
        create_backup: Any = True,
        **_: Any,
    ) -> Dict[str, Any]:
        allowed, reason = self.mutation_guard(request_context)
        if not allowed:
            return ToolResult(False, reason).to_dict()
        result = self.html_injector(local_path, html_path, quickform, bool(create_backup))
        return ToolResult(True, "QuickForm HTML 注入成功", result).to_dict()

    def save_course_changes(
        self,
        *,
        request_context: Dict[str, Any],
        course: Dict[str, Any],
        local_path: str = "",
        **_: Any,
    ) -> Dict[str, Any]:
        allowed, reason = self.mutation_guard(request_context)
        if not allowed:
            return ToolResult(False, reason).to_dict()
        target_path = _normalize_text(local_path) or _normalize_text((course or {}).get("local_path"))
        if not target_path:
            raise ValueError("缺少 local_path")
        result = self.course_saver(target_path, course or {})
        return ToolResult(True, "课程保存成功", result).to_dict()


class KimiAgentRunner:
    def __init__(self):
        try:
            from kimi_agent_sdk import Config, prompt  # type: ignore
        except Exception as exc:  # pragma: no cover - import guarded by tests
            raise RuntimeError("未安装 kimi-agent-sdk") from exc
        self._Config = Config
        self._prompt = prompt

    async def arun(self, *, prompt_text: str, ai_config: AIConfig) -> str:
        config = self._Config(
            default_model=ai_config.model,
            providers={
                "kimi": {
                    "type": "kimi",
                    "base_url": ai_config.base_url,
                    "api_key": ai_config.api_key,
                }
            },
            models={
                ai_config.model: {
                    "provider": "kimi",
                    "model": ai_config.model,
                }
            },
        )
        chunks: List[str] = []
        async for msg in self._prompt(prompt_text, config=config, yolo=False):
            try:
                chunks.append(msg.extract_text())
            except Exception:
                chunks.append(str(msg))
        return "".join(chunks).strip()

    def run(self, *, prompt_text: str, ai_config: AIConfig) -> str:
        return asyncio.run(self.arun(prompt_text=prompt_text, ai_config=ai_config))


class QuickFormAgentService:
    def __init__(
        self,
        *,
        ai_config: AIConfig,
        tool_adapter: QuickFormAgentToolAdapter,
        fallback_ai_service: Optional[AIService] = None,
        runner: Any = None,
    ):
        self.ai_config = ai_config
        self.tool_adapter = tool_adapter
        self.fallback_ai_service = fallback_ai_service or AIService(ai_config)
        self.runner = runner

    def _resolve_runner(self):
        if self.runner is not None:
            return self.runner
        return KimiAgentRunner()

    def _build_prompt(
        self,
        *,
        history: List[Dict[str, str]],
        question: str,
        tool_trace: List[Dict[str, Any]],
        request_context: Dict[str, Any],
    ) -> str:
        course_info = self.tool_adapter.invoke("get_current_course_context", {}, request_context)
        tools = [
            "get_current_course_context",
            "find_experiment_by_title_or_index",
            "list_experiment_html_files",
            "get_quickform_settings_status",
            "list_quickform_tasks",
            "create_quickform_task",
            "prepare_quickform_binding_plan",
            "apply_quickform_binding",
            "inject_quickform_into_html",
            "save_course_changes",
        ]
        transcript = []
        for item in history[-12:]:
            role = "用户" if item.get("role") == "user" else "助手"
            transcript.append(f"{role}: {item.get('content', '')}")
        if not history or history[-1].get("content") != question:
            transcript.append(f"用户: {question}")

        prompt = f"""
你是 XEdu 的 QuickForm 教学助手。你要帮助教师把实验接入 QuickForm。

严格遵守：
1. 只处理 QuickForm 接入相关问题。
2. 只能通过给定工具完成读取和写入，不能假设文件内容。
3. 在调用任何会修改状态的工具前，必须先给用户明确的执行摘要，并等待用户确认。
4. 如果实验定位不唯一或 HTML 不唯一，必须继续追问，不能猜测。
5. 回复必须是 JSON，不要输出 Markdown 代码块。

可用工具：
{json.dumps(tools, ensure_ascii=False)}

当前课程上下文：
{_truncate_json(course_info, 4000)}

已发生的工具调用：
{_truncate_json(tool_trace, 5000)}

最近对话：
{chr(10).join(transcript)}

请输出如下 JSON 之一：
1. 需要调用工具：
{{
  "status": "tool_call",
  "assistant_message": "给用户的简短解释",
  "tool_name": "工具名",
  "tool_args": {{}}
}}

2. 需要用户补充信息：
{{
  "status": "needs_input",
  "assistant_message": "请用户补充什么"
}}

3. 需要用户确认执行：
{{
  "status": "needs_confirmation",
  "assistant_message": "确认摘要，明确写出目标实验、任务名、HTML 文件，以及会写回课程并注入 HTML"
}}

4. 已完成：
{{
  "status": "completed",
  "assistant_message": "结果摘要"
}}

5. 出错：
{{
  "status": "error",
  "assistant_message": "错误原因"
}}
""".strip()
        return prompt

    def _parse_runner_response(self, raw: str) -> Dict[str, Any]:
        cleaned = _clean_json_text(raw)
        try:
            data = json.loads(cleaned)
        except json.JSONDecodeError:
            return {
                "status": "completed",
                "assistant_message": cleaned or "已完成",
            }
        if not isinstance(data, dict):
            return {
                "status": "completed",
                "assistant_message": cleaned or "已完成",
            }
        return data

    def _is_quickform_request(self, question: str, history: List[Dict[str, str]]) -> bool:
        source = " ".join([
            question or "",
            " ".join(_normalize_text(item.get("content")) for item in history[-6:]),
        ]).lower()
        return any(keyword in source for keyword in _QUICKFORM_KEYWORDS)

    def chat(
        self,
        *,
        question: str,
        history: Optional[List[Dict[str, str]]] = None,
        image_data: Optional[str] = None,
        request_context: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        history = history or []
        request_context = dict(request_context or {})
        request_context["confirmed"] = bool(request_context.get("confirmed"))

        if not self._is_quickform_request(question, history):
            return self.fallback_ai_service.ask_question(question, image_data, history)

        if not self.ai_config.api_key:
            return {
                "success": False,
                "error": "AI 未配置：请先在设置中填写 API Key",
            }

        try:
            runner = self._resolve_runner()
        except Exception as exc:
            return {
                "success": False,
                "error": f"Kimi Agent 不可用: {exc}",
            }

        tool_trace: List[Dict[str, Any]] = []
        last_message = "我先帮你看一下 QuickForm 接入信息。"
        last_tool_result: Dict[str, Any] = {}

        for _ in range(6):
            prompt_text = self._build_prompt(
                history=history,
                question=question,
                tool_trace=tool_trace,
                request_context=request_context,
            )
            raw = runner.run(prompt_text=prompt_text, ai_config=self.ai_config)
            action = self._parse_runner_response(raw)
            status = action.get("status")
            assistant_message = _normalize_text(action.get("assistant_message")) or last_message
            if status in {"needs_input", "needs_confirmation", "completed", "error"}:
                response = {
                    "success": status != "error",
                    "answer": assistant_message,
                    "agent_status": status,
                    "tool_trace": tool_trace,
                }
                if last_tool_result.get("course"):
                    response["course"] = last_tool_result.get("course")
                if last_tool_result:
                    response["agent_result"] = last_tool_result
                if status == "error":
                    response["error"] = assistant_message
                return response

            if status != "tool_call":
                return {
                    "success": True,
                    "answer": assistant_message,
                    "agent_status": "completed",
                    "tool_trace": tool_trace,
                }

            tool_name = _normalize_text(action.get("tool_name"))
            tool_args = action.get("tool_args") if isinstance(action.get("tool_args"), dict) else {}
            tool_result = self.tool_adapter.invoke(tool_name, tool_args, request_context)
            last_message = assistant_message
            last_tool_result = tool_result
            tool_trace.append({
                "tool_name": tool_name,
                "tool_args": tool_args,
                "tool_result": tool_result,
            })

            if tool_name == "apply_quickform_binding" and tool_result.get("success"):
                return {
                    "success": True,
                    "answer": (
                        f"{tool_result.get('message')}\n\n"
                        f"- 实验：{(((tool_result.get('experiment') or {}).get('experiment_title')) or '')}\n"
                        f"- apiid：{tool_result.get('apiid') or ''}\n"
                        f"- 提交地址：{tool_result.get('submit_url') or ''}\n"
                        f"- 查询地址：{tool_result.get('query_url') or ''}\n"
                        f"- HTML：{tool_result.get('html_path') or ''}"
                    ).strip(),
                    "agent_status": "completed",
                    "course": tool_result.get("course"),
                    "agent_result": tool_result,
                    "tool_trace": tool_trace,
                }

        return {
            "success": False,
            "error": "QuickForm 对话轮次过多，请换一种更明确的说法重试",
            "answer": "QuickForm 对话轮次过多，请换一种更明确的说法重试。",
            "agent_status": "error",
            "tool_trace": tool_trace,
        }


def looks_like_confirmation(text: str) -> bool:
    clean = _normalize_text(text)
    if not clean:
        return False
    return any(re.search(pattern, clean, flags=re.IGNORECASE) for pattern in _CONFIRM_PATTERNS)


def looks_like_quickform_request(text: str, history: Optional[List[Dict[str, str]]] = None) -> bool:
    history = history or []
    source = " ".join([
        text or "",
        " ".join(_normalize_text(item.get("content")) for item in history[-6:]),
    ]).lower()
    return any(keyword in source for keyword in _QUICKFORM_KEYWORDS)
