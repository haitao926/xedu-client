#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
XEdu pack chat agent service and tool adapter.
"""

from __future__ import annotations

import copy
import json
import re
import shutil
import zipfile
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple

from models.config import AIConfig
from services.ai_service import AIService
from services.gitea_service import GiteaServiceError, scan_course
from services.quickform_agent_service import KimiAgentRunner
from utils.logger import get_logger

logger = get_logger(__name__)

MutationCheck = Callable[[Dict[str, Any]], Tuple[bool, str]]
Publisher = Callable[[str, Dict[str, Any]], Dict[str, Any]]

_IGNORE_DIRS = {".git", "__pycache__", ".ipynb_checkpoints", "node_modules", "dist", "build", "_xedu_pack"}
_MATERIAL_EXTS = {".md", ".doc", ".docx", ".ppt", ".pptx", ".pdf", ".txt"}
_NOTEBOOK_EXTS = {".ipynb"}
_DATA_EXTS = {".csv", ".tsv", ".xlsx", ".xls", ".jsonl", ".parquet", ".npy", ".npz"}
_PACK_KEYWORDS = ("xedu-pack", "xedu pack", "打包", "课程包", "发布课程", "推送仓库", "推送gitea")


def _text(value: Any) -> str:
    return str(value or "").strip()


def _slugify(value: str, fallback: str = "course") -> str:
    text = re.sub(r"[^\w\-]+", "-", _text(value).lower()).strip("-")
    return text or fallback


def _safe_int(value: Any) -> Optional[int]:
    try:
        if value is None or value == "":
            return None
        return int(value)
    except (TypeError, ValueError):
        return None


def _truncate(data: Any, limit: int = 4000) -> str:
    raw = json.dumps(data, ensure_ascii=False)
    return raw if len(raw) <= limit else raw[:limit] + "…"


def _classify_path(rel_path: str) -> str:
    path = Path(rel_path)
    suffix = path.suffix.lower()
    lower_name = path.name.lower()
    lower_parts = [part.lower() for part in path.parts]
    if suffix in _NOTEBOOK_EXTS:
        return "04_Notebooks"
    if suffix in _MATERIAL_EXTS:
        return "01_Materials"
    if suffix in _DATA_EXTS or "data" in lower_parts:
        return "03_Data"
    if lower_name in {"requirements.txt", "package.json", "task_spec.json", "setup.sh", "magic_ai.py"}:
        return "02_Lab_Env"
    return "02_Lab_Env"


def _iter_local_files(base: Path) -> List[str]:
    results: List[str] = []
    for root, dirs, files in os.walk(base):
        dirs[:] = [d for d in dirs if d not in _IGNORE_DIRS and not d.startswith(".")]
        for filename in files:
            if filename.startswith("."):
                continue
            rel = (Path(root) / filename).relative_to(base).as_posix()
            if rel == "course.json" or rel.startswith("_xedu_pack/"):
                continue
            results.append(rel)
    return sorted(results)


import os


class XEduPackToolAdapter:
    def __init__(
        self,
        *,
        mutation_guard: MutationCheck,
        publisher: Publisher,
    ):
        self.mutation_guard = mutation_guard
        self.publisher = publisher

    def invoke(self, tool_name: str, args: Dict[str, Any], request_context: Dict[str, Any]) -> Dict[str, Any]:
        dispatch = {
            "get_current_course_context": self.get_current_course_context,
            "inspect_xedu_pack_inputs": self.inspect_xedu_pack_inputs,
            "prepare_xedu_pack_plan": self.prepare_xedu_pack_plan,
            "build_xedu_pack_bundle": self.build_xedu_pack_bundle,
            "publish_xedu_pack_bundle": self.publish_xedu_pack_bundle,
        }
        handler = dispatch.get(tool_name)
        if not handler:
            return {"success": False, "message": f"未知工具: {tool_name}"}
        try:
            return handler(request_context=request_context, **(args or {}))
        except (ValueError, GiteaServiceError) as exc:
            return {"success": False, "message": str(exc)}
        except Exception as exc:
            logger.exception("xedu-pack tool failed: %s", tool_name)
            return {"success": False, "message": f"{tool_name} 执行失败: {exc}"}

    def _resolve_course(self, request_context: Dict[str, Any]) -> Tuple[Dict[str, Any], str]:
        context = request_context.get("context") or {}
        course = context.get("course") if isinstance(context.get("course"), dict) else {}
        local_path = _text((course or {}).get("local_path") or context.get("local_path"))
        source = _text((course or {}).get("source") or context.get("source") or "local")
        if source != "local":
            raise ValueError("仅支持本地可编辑课程打包")
        if not local_path:
            raise ValueError("缺少当前课程 local_path")
        if not course or not isinstance(course.get("sections"), list):
            course = scan_course(local_path).course
            course["local_path"] = local_path
            course["source"] = "local"
        return copy.deepcopy(course), local_path

    def _build_output_root(self, local_path: str, course: Dict[str, Any], version: str = "") -> Tuple[Path, str]:
        base = Path(local_path)
        course_id = _slugify(_text(course.get("id")) or _text(course.get("title")), "course")
        course_version = _text(version) or _text(course.get("version")) or "1.0"
        pack_name = f"{course_id}-{course_version}"
        return base / "_xedu_pack" / pack_name, pack_name

    def get_current_course_context(self, *, request_context: Dict[str, Any], **_: Any) -> Dict[str, Any]:
        course, local_path = self._resolve_course(request_context)
        sections = course.get("sections") or []
        return {
            "success": True,
            "message": "已获取当前课程上下文",
            "course": {
                "id": _text(course.get("id")),
                "title": _text(course.get("title")),
                "version": _text(course.get("version")) or "1.0",
                "local_path": local_path,
                "section_count": len(sections),
                "experiment_count": sum(len(section.get("experiments") or []) for section in sections),
                "origin": course.get("origin") or {},
            },
        }

    def inspect_xedu_pack_inputs(self, *, request_context: Dict[str, Any], **_: Any) -> Dict[str, Any]:
        course, local_path = self._resolve_course(request_context)
        base = Path(local_path)
        course_files = _iter_local_files(base)
        buckets = {
            "01_Materials": [],
            "02_Lab_Env": [],
            "03_Data": [],
            "04_Notebooks": [],
        }
        for rel in course_files:
            buckets[_classify_path(rel)].append(rel)
        return {
            "success": True,
            "message": "已分析可打包内容",
            "files": buckets,
            "counts": {key: len(value) for key, value in buckets.items()},
            "publish_available": bool((course.get("origin") or {}).get("base_url")),
        }

    def prepare_xedu_pack_plan(
        self,
        *,
        request_context: Dict[str, Any],
        version: str = "",
        publish_after_pack: Any = False,
        source_id: str = "",
        **_: Any,
    ) -> Dict[str, Any]:
        course, local_path = self._resolve_course(request_context)
        analysis = self.inspect_xedu_pack_inputs(request_context=request_context)
        output_dir, pack_name = self._build_output_root(local_path, course, version)
        course_title = _text(course.get("title")) or "当前课程"
        publish_flag = bool(publish_after_pack)
        summary = (
            f"将把《{course_title}》整理为 XEDU 标准目录，输出到 `{output_dir}`，"
            f"生成 README 和 zip 包"
            + ("，并继续发布到课程仓库。" if publish_flag else "。")
        )
        return {
            "success": True,
            "message": "已生成 xedu-pack 执行计划",
            "needs_confirmation": True,
            "summary": summary,
            "plan": {
                "local_path": local_path,
                "version": _text(version) or _text(course.get("version")) or "1.0",
                "output_dir": str(output_dir),
                "pack_name": pack_name,
                "publish_after_pack": publish_flag,
                "source_id": _text(source_id),
                "counts": analysis.get("counts") or {},
            },
        }

    def _rewrite_course_paths(self, course: Dict[str, Any], mapping: Dict[str, str]) -> Dict[str, Any]:
        next_course = copy.deepcopy(course)
        for section in next_course.get("sections") or []:
            for experiment in section.get("experiments") or []:
                next_files = []
                for item in experiment.get("files") or []:
                    if not isinstance(item, dict):
                        continue
                    path = _text(item.get("path"))
                    if not path or path.endswith("/"):
                        continue
                    new_path = mapping.get(path)
                    if not new_path:
                        continue
                    next_item = dict(item)
                    next_item["path"] = new_path
                    next_files.append(next_item)
                experiment["files"] = next_files
        if _text(next_course.get("cover")) in mapping:
            next_course["cover"] = mapping[_text(next_course.get("cover"))]
        return next_course

    def _build_readme(self, course: Dict[str, Any], counts: Dict[str, int], pack_name: str) -> str:
        lines = [
            f"# {course.get('title') or pack_name}",
            "",
            f"- 课程 ID：{course.get('id') or pack_name}",
            f"- 版本：{course.get('version') or '1.0'}",
            f"- 课节数：{len(course.get('sections') or [])}",
            f"- 实验数：{sum(len(section.get('experiments') or []) for section in course.get('sections') or [])}",
            "",
            "## 目录说明",
            "- `01_Materials`：教案、PPT、大纲、说明文档",
            "- `02_Lab_Env`：代码、HTML、依赖与环境脚本",
            "- `03_Data`：数据文件与样例数据",
            "- `04_Notebooks`：课堂 Notebook",
            "",
            "## 打包统计",
        ]
        for key, value in counts.items():
            lines.append(f"- `{key}`：{value} 个文件")
        lines.extend([
            "",
            "## 课程简介",
            _text(course.get("description")) or "暂无描述。",
        ])
        return "\n".join(lines).strip() + "\n"

    def build_xedu_pack_bundle(
        self,
        *,
        request_context: Dict[str, Any],
        version: str = "",
        **_: Any,
    ) -> Dict[str, Any]:
        allowed, reason = self.mutation_guard(request_context)
        if not allowed:
            return {"success": False, "message": reason}

        course, local_path = self._resolve_course(request_context)
        base = Path(local_path)
        output_dir, pack_name = self._build_output_root(local_path, course, version)
        if output_dir.exists():
            shutil.rmtree(output_dir)
        output_dir.mkdir(parents=True, exist_ok=True)

        mapping: Dict[str, str] = {}
        counts = {"01_Materials": 0, "02_Lab_Env": 0, "03_Data": 0, "04_Notebooks": 0}
        sections = course.get("sections") or []
        for s_idx, section in enumerate(sections, start=1):
            sec_name = _slugify(_text(section.get("title")), f"section-{s_idx}")
            for e_idx, experiment in enumerate(section.get("experiments") or [], start=1):
                exp_name = _slugify(_text(experiment.get("title")), f"experiment-{e_idx}")
                for item in experiment.get("files") or []:
                    if not isinstance(item, dict):
                        continue
                    rel = _text(item.get("path"))
                    if not rel or rel.endswith("/"):
                        continue
                    src = base / rel
                    if not src.exists() or not src.is_file():
                        continue
                    bucket = _classify_path(rel)
                    dest_rel = Path(bucket) / sec_name / exp_name / src.name
                    dest = output_dir / dest_rel
                    dest.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(src, dest)
                    mapping[rel] = dest_rel.as_posix()
                    counts[bucket] += 1

        packed_course = self._rewrite_course_paths(course, mapping)
        packed_course["version"] = _text(version) or _text(course.get("version")) or "1.0"
        (output_dir / "course.json").write_text(
            json.dumps(packed_course, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        readme = self._build_readme(packed_course, counts, pack_name)
        (output_dir / "README.md").write_text(readme, encoding="utf-8")

        zip_path = output_dir.parent / f"{pack_name}.zip"
        if zip_path.exists():
            zip_path.unlink()
        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zipf:
            for file_path in output_dir.rglob("*"):
                if file_path.is_file():
                    zipf.write(file_path, file_path.relative_to(output_dir).as_posix())

        return {
            "success": True,
            "message": "XEdu 课程包已生成",
            "output_dir": str(output_dir),
            "zip_path": str(zip_path),
            "pack_name": pack_name,
            "packed_course": packed_course,
            "counts": counts,
        }

    def publish_xedu_pack_bundle(
        self,
        *,
        request_context: Dict[str, Any],
        output_dir: str = "",
        version: str = "",
        source_id: str = "",
        **_: Any,
    ) -> Dict[str, Any]:
        allowed, reason = self.mutation_guard(request_context)
        if not allowed:
            return {"success": False, "message": reason}
        course, local_path = self._resolve_course(request_context)
        resolved_output = Path(output_dir) if _text(output_dir) else self._build_output_root(local_path, course, version)[0]
        if not resolved_output.exists():
            build_result = self.build_xedu_pack_bundle(request_context=request_context, version=version)
            if not build_result.get("success"):
                return build_result
            resolved_output = Path(build_result["output_dir"])
        result = self.publisher(
            str(resolved_output),
            {
                "course": course,
                "source_id": _text(source_id),
                "version": _text(version) or _text(course.get("version")) or "1.0",
            },
        )
        payload = {
            "success": True,
            "message": "XEdu 课程包已发布",
            **result,
        }
        return payload


class XEduPackAgentService:
    def __init__(
        self,
        *,
        ai_config: AIConfig,
        tool_adapter: XEduPackToolAdapter,
        fallback_ai_service: Optional[AIService] = None,
        runner: Any = None,
    ):
        self.ai_config = ai_config
        self.tool_adapter = tool_adapter
        self.fallback_ai_service = fallback_ai_service or AIService(ai_config)
        self.runner = runner

    def _resolve_runner(self):
        return self.runner or KimiAgentRunner()

    def _is_pack_request(self, question: str, history: List[Dict[str, str]]) -> bool:
        source = " ".join([question or "", " ".join(_text(item.get("content")) for item in history[-6:])]).lower()
        return any(keyword in source for keyword in _PACK_KEYWORDS)

    def _build_prompt(self, *, history: List[Dict[str, str]], question: str, tool_trace: List[Dict[str, Any]], request_context: Dict[str, Any]) -> str:
        course_info = self.tool_adapter.invoke("get_current_course_context", {}, request_context)
        transcript = []
        for item in history[-12:]:
            role = "用户" if item.get("role") == "user" else "助手"
            transcript.append(f"{role}: {item.get('content', '')}")
        if not history or history[-1].get("content") != question:
            transcript.append(f"用户: {question}")
        return f"""
你是 XEdu 的 xedu-pack 助手，负责把课程整理为 XEDU 标准目录并在需要时发布。

严格遵守：
1. 只处理课程打包 / xedu-pack / 发布课程包。
2. 只能通过工具读取和写入。
3. 在任何写入前，必须先生成计划摘要并等待用户确认。
4. 如果缺少当前课程上下文，必须请用户先打开课程详情页。
5. 回复必须为 JSON，不要输出 Markdown 代码块。

可用工具：
["get_current_course_context","inspect_xedu_pack_inputs","prepare_xedu_pack_plan","build_xedu_pack_bundle","publish_xedu_pack_bundle"]

当前课程上下文：
{_truncate(course_info, 3000)}

已发生的工具调用：
{_truncate(tool_trace, 5000)}

最近对话：
{chr(10).join(transcript)}

输出 JSON 格式之一：
{{"status":"tool_call","assistant_message":"说明","tool_name":"工具名","tool_args":{{}}}}
{{"status":"needs_input","assistant_message":"请用户补充什么"}}
{{"status":"needs_confirmation","assistant_message":"确认摘要，明确输出目录、是否发布、会生成 README 和 zip"}}
{{"status":"completed","assistant_message":"结果摘要"}}
{{"status":"error","assistant_message":"错误原因"}}
""".strip()

    def _parse_response(self, raw: str) -> Dict[str, Any]:
        cleaned = (raw or "").strip()
        if cleaned.startswith("```"):
            cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
            cleaned = re.sub(r"\s*```$", "", cleaned)
        try:
            data = json.loads(cleaned)
            return data if isinstance(data, dict) else {"status": "completed", "assistant_message": cleaned}
        except json.JSONDecodeError:
            return {"status": "completed", "assistant_message": cleaned or "已完成"}

    def chat(self, *, question: str, history: Optional[List[Dict[str, str]]] = None, image_data: Optional[str] = None, request_context: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        history = history or []
        request_context = dict(request_context or {})
        if not self._is_pack_request(question, history):
            return self.fallback_ai_service.ask_question(question, image_data, history)
        if not self.ai_config.api_key:
            return {"success": False, "error": "AI 未配置：请先在设置中填写 API Key"}
        try:
            runner = self._resolve_runner()
        except Exception as exc:
            return {"success": False, "error": f"Kimi Agent 不可用: {exc}"}

        tool_trace: List[Dict[str, Any]] = []
        last_tool_result: Dict[str, Any] = {}
        for _ in range(6):
            raw = runner.run(prompt_text=self._build_prompt(history=history, question=question, tool_trace=tool_trace, request_context=request_context), ai_config=self.ai_config)
            action = self._parse_response(raw)
            status = action.get("status")
            message = _text(action.get("assistant_message")) or "我先看看打包信息。"
            if status in {"needs_input", "needs_confirmation", "completed", "error"}:
                payload = {
                    "success": status != "error",
                    "answer": message,
                    "agent_status": status,
                    "tool_trace": tool_trace,
                }
                if last_tool_result:
                    payload["agent_result"] = last_tool_result
                    if last_tool_result.get("course"):
                        payload["course"] = last_tool_result.get("course")
                if status == "error":
                    payload["error"] = message
                return payload
            if status != "tool_call":
                return {"success": True, "answer": message, "agent_status": "completed", "tool_trace": tool_trace}
            tool_name = _text(action.get("tool_name"))
            tool_args = action.get("tool_args") if isinstance(action.get("tool_args"), dict) else {}
            tool_result = self.tool_adapter.invoke(tool_name, tool_args, request_context)
            last_tool_result = tool_result
            tool_trace.append({"tool_name": tool_name, "tool_args": tool_args, "tool_result": tool_result})
            if tool_name in {"build_xedu_pack_bundle", "publish_xedu_pack_bundle"} and tool_result.get("success"):
                summary_lines = [
                    tool_result.get("message") or "",
                    f"- 输出目录：{tool_result.get('output_dir') or ''}",
                ]
                if tool_result.get("zip_path"):
                    summary_lines.append(f"- 压缩包：{tool_result.get('zip_path')}")
                if tool_result.get("pr_url"):
                    summary_lines.append(f"- PR：{tool_result.get('pr_url')}")
                return {
                    "success": True,
                    "answer": "\n".join(line for line in summary_lines if line).strip(),
                    "agent_status": "completed",
                    "agent_result": tool_result,
                    "course": tool_result.get("course"),
                    "tool_trace": tool_trace,
                }
        return {
            "success": False,
            "error": "xedu-pack 对话轮次过多，请换一种更明确的说法重试",
            "answer": "xedu-pack 对话轮次过多，请换一种更明确的说法重试。",
            "agent_status": "error",
            "tool_trace": tool_trace,
        }


def looks_like_xedu_pack_request(text: str, history: Optional[List[Dict[str, str]]] = None) -> bool:
    history = history or []
    source = " ".join([text or "", " ".join(_text(item.get("content")) for item in history[-6:])]).lower()
    return any(keyword in source for keyword in _PACK_KEYWORDS)
