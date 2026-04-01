#!/usr/bin/env python3
# -*- coding: utf-8 -*-

from __future__ import annotations

import ast
import json
import re
from html import escape as html_escape
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple

from models.config import AIConfig
from services.ai_service import AIService
from services.blockly_xeduhub_support import (
    build_xeduhub_execution_config,
    build_xeduhub_toolbox_definition,
    build_xeduhub_workspace_xml,
    derive_title_from_request,
    infer_task_from_text,
    normalize_task_type,
    recommended_model_for_task,
    slugify,
    validate_toolbox_schema,
)
from services.quickform_agent_service import KimiAgentRunner
from utils.logger import get_logger

logger = get_logger(__name__)

MutationCheck = Callable[[Dict[str, Any]], Tuple[bool, str]]
_BLOCKLY_KEYWORDS = (
    'blockly', '积木', 'xeduhub', 'workflow', '模型推理', '图像分类', '目标检测', '搭积木', 'toolbox'
)


def _text(value: Any) -> str:
    return str(value or '').strip()


def _truncate(data: Any, limit: int = 4000) -> str:
    raw = json.dumps(data, ensure_ascii=False)
    return raw if len(raw) <= limit else raw[:limit] + '…'


def _xml_escape(value: Any) -> str:
    return html_escape(str(value or ""), quote=True)


def _expr_to_xml(expr: ast.AST, unsupported: List[str]) -> str:
    if isinstance(expr, ast.Constant):
        value = expr.value
        if isinstance(value, bool):
            bool_value = "TRUE" if value else "FALSE"
            return (
                '<block type="logic_boolean">'
                f'<field name="BOOL">{bool_value}</field>'
                '</block>'
            )
        if isinstance(value, (int, float)):
            return (
                '<block type="math_number">'
                f'<field name="NUM">{_xml_escape(value)}</field>'
                '</block>'
            )
        return (
            '<block type="text">'
            f'<field name="TEXT">{_xml_escape(value)}</field>'
            '</block>'
        )
    if isinstance(expr, ast.Name):
        return (
            '<block type="variables_get">'
            f'<field name="VAR">{_xml_escape(expr.id)}</field>'
            '</block>'
        )
    if isinstance(expr, ast.BinOp) and isinstance(expr.op, (ast.Add, ast.Sub, ast.Mult, ast.Div, ast.Mod)):
        op_map = {
            ast.Add: "ADD",
            ast.Sub: "MINUS",
            ast.Mult: "MULTIPLY",
            ast.Div: "DIVIDE",
            ast.Mod: "MODULO",
        }
        operator = op_map.get(type(expr.op), "ADD")
        left_xml = _expr_to_xml(expr.left, unsupported)
        right_xml = _expr_to_xml(expr.right, unsupported)
        return (
            '<block type="math_arithmetic">'
            f'<field name="OP">{operator}</field>'
            f'<value name="A">{left_xml}</value>'
            f'<value name="B">{right_xml}</value>'
            '</block>'
        )
    if isinstance(expr, ast.Compare) and len(expr.ops) == 1 and len(expr.comparators) == 1:
        op_map = {
            ast.Eq: "EQ",
            ast.NotEq: "NEQ",
            ast.Lt: "LT",
            ast.Lte: "LTE",
            ast.Gt: "GT",
            ast.Gte: "GTE",
        }
        operator = op_map.get(type(expr.ops[0]), "EQ")
        left_xml = _expr_to_xml(expr.left, unsupported)
        right_xml = _expr_to_xml(expr.comparators[0], unsupported)
        return (
            '<block type="logic_compare">'
            f'<field name="OP">{operator}</field>'
            f'<value name="A">{left_xml}</value>'
            f'<value name="B">{right_xml}</value>'
            '</block>'
        )
    unsupported.append(f"不支持表达式: {type(expr).__name__}")
    return '<block type="text"><field name="TEXT">unsupported</field></block>'


def _statement_to_block_xml(node: ast.stmt, unsupported: List[str]) -> str:
    if isinstance(node, ast.Assign) and len(node.targets) == 1 and isinstance(node.targets[0], ast.Name):
        var_name = node.targets[0].id
        value_xml = _expr_to_xml(node.value, unsupported)
        return (
            '<block type="variables_set">'
            f'<field name="VAR">{_xml_escape(var_name)}</field>'
            f'<value name="VALUE">{value_xml}</value>'
            '</block>'
        )

    if isinstance(node, ast.Expr) and isinstance(node.value, ast.Call):
        call = node.value
        if isinstance(call.func, ast.Name) and call.func.id == "print":
            arg = call.args[0] if call.args else ast.Constant(value="")
            return (
                '<block type="text_print">'
                f'<value name="TEXT">{_expr_to_xml(arg, unsupported)}</value>'
                '</block>'
            )
        unsupported.append(f"不支持函数调用: {ast.unparse(call.func) if hasattr(ast, 'unparse') else 'call'}")
        return (
            '<block type="text_print">'
            '<value name="TEXT"><block type="text"><field name="TEXT">unsupported_call</field></block></value>'
            '</block>'
        )

    if isinstance(node, ast.If):
        condition_xml = _expr_to_xml(node.test, unsupported)
        do_xml = _chain_statements_to_xml(node.body, unsupported) or (
            '<block type="text_print"><value name="TEXT"><block type="text">'
            '<field name="TEXT">if branch</field></block></value></block>'
        )
        block = (
            '<block type="controls_if">'
            f'<value name="IF0">{condition_xml}</value>'
            f'<statement name="DO0">{do_xml}</statement>'
        )
        if node.orelse:
            else_xml = _chain_statements_to_xml(node.orelse, unsupported)
            block += f'<statement name="ELSE">{else_xml}</statement>'
        block += '</block>'
        return block

    if isinstance(node, ast.For) and isinstance(node.target, ast.Name):
        if isinstance(node.iter, ast.Call) and isinstance(node.iter.func, ast.Name) and node.iter.func.id == "range":
            args = node.iter.args
            if len(args) == 1:
                from_expr, to_expr, by_expr = ast.Constant(value=0), args[0], ast.Constant(value=1)
            elif len(args) == 2:
                from_expr, to_expr, by_expr = args[0], args[1], ast.Constant(value=1)
            elif len(args) >= 3:
                from_expr, to_expr, by_expr = args[0], args[1], args[2]
            else:
                from_expr, to_expr, by_expr = ast.Constant(value=0), ast.Constant(value=10), ast.Constant(value=1)
            body_xml = _chain_statements_to_xml(node.body, unsupported) or (
                '<block type="text_print"><value name="TEXT"><block type="text">'
                '<field name="TEXT">for loop</field></block></value></block>'
            )
            return (
                '<block type="controls_for">'
                f'<field name="VAR">{_xml_escape(node.target.id)}</field>'
                f'<value name="FROM">{_expr_to_xml(from_expr, unsupported)}</value>'
                f'<value name="TO">{_expr_to_xml(to_expr, unsupported)}</value>'
                f'<value name="BY">{_expr_to_xml(by_expr, unsupported)}</value>'
                f'<statement name="DO">{body_xml}</statement>'
                '</block>'
            )
        unsupported.append("仅支持 for ... in range(...)")
        return (
            '<block type="text_print"><value name="TEXT"><block type="text">'
            '<field name="TEXT">unsupported_for</field></block></value></block>'
        )

    if isinstance(node, ast.While):
        body_xml = _chain_statements_to_xml(node.body, unsupported) or (
            '<block type="text_print"><value name="TEXT"><block type="text">'
            '<field name="TEXT">while loop</field></block></value></block>'
        )
        return (
            '<block type="controls_whileUntil">'
            '<field name="MODE">WHILE</field>'
            f'<value name="BOOL">{_expr_to_xml(node.test, unsupported)}</value>'
            f'<statement name="DO">{body_xml}</statement>'
            '</block>'
        )

    unsupported.append(f"不支持语句: {type(node).__name__}")
    return (
        '<block type="text_print"><value name="TEXT"><block type="text">'
        '<field name="TEXT">unsupported_statement</field></block></value></block>'
    )


def _chain_statements_to_xml(nodes: List[ast.stmt], unsupported: List[str]) -> str:
    if not nodes:
        return ""
    rendered = [_statement_to_block_xml(node, unsupported) for node in nodes]
    chain = rendered[-1]
    for item in reversed(rendered[:-1]):
        head, sep, tail = item.rpartition("</block>")
        chain = f"{head}<next>{chain}</next>{sep}{tail}" if sep else item
    return chain


def _python_to_blockly_workspace_xml(python_code: str) -> Tuple[str, List[str]]:
    source = str(python_code or "").strip()
    if not source:
        return (
            '<xml xmlns="https://developers.google.com/blockly/xml">'
            '<block type="text_print" x="32" y="32"><value name="TEXT"><block type="text">'
            '<field name="TEXT">empty python input</field></block></value></block></xml>',
            ["输入 Python 为空，已生成占位工作区"],
        )
    unsupported: List[str] = []
    try:
        tree = ast.parse(source)
    except SyntaxError as exc:
        return (
            '<xml xmlns="https://developers.google.com/blockly/xml">'
            '<block type="text_print" x="32" y="32"><value name="TEXT"><block type="text">'
            f'<field name="TEXT">syntax error: {_xml_escape(exc.msg)}</field>'
            '</block></value></block></xml>',
            [f"Python 语法错误: {exc.msg} (line {exc.lineno})"],
        )
    chain = _chain_statements_to_xml(list(tree.body), unsupported)
    if not chain:
        chain = (
            '<block type="text_print"><value name="TEXT"><block type="text">'
            '<field name="TEXT">no executable statements</field></block></value></block>'
        )
    chain = chain.replace("<block ", '<block x="32" y="32" ', 1) if chain.startswith("<block ") else chain
    xml = f'<xml xmlns="https://developers.google.com/blockly/xml">{chain}</xml>'
    dedup_unsupported = []
    seen = set()
    for message in unsupported:
        if message in seen:
            continue
        seen.add(message)
        dedup_unsupported.append(message)
    return xml, dedup_unsupported


class BlocklyBuilderToolAdapter:
    def __init__(self, *, mutation_guard: MutationCheck, draft_root: Path):
        self.mutation_guard = mutation_guard
        self.draft_root = Path(draft_root)

    def invoke(self, tool_name: str, args: Dict[str, Any], request_context: Dict[str, Any]) -> Dict[str, Any]:
        dispatch = {
            'inspect_blockly_builder_request': self.inspect_blockly_builder_request,
            'suggest_blockly_toolbox_plan': self.suggest_blockly_toolbox_plan,
            'suggest_blockly_workspace_plan': self.suggest_blockly_workspace_plan,
            'prepare_blockly_builder_plan': self.prepare_blockly_builder_plan,
            'apply_blockly_builder_plan': self.apply_blockly_builder_plan,
            'prepare_python_to_blockly_pack': self.prepare_python_to_blockly_pack,
            'apply_python_to_blockly_pack': self.apply_python_to_blockly_pack,
        }
        handler = dispatch.get(tool_name)
        if not handler:
            return {'success': False, 'message': f'未知工具: {tool_name}'}
        try:
            return handler(request_context=request_context, **(args or {}))
        except ValueError as exc:
            return {'success': False, 'message': str(exc)}
        except Exception as exc:
            logger.exception('Blockly builder tool failed: %s', tool_name)
            return {'success': False, 'message': f'{tool_name} 执行失败: {exc}'}

    def inspect_blockly_builder_request(
        self,
        *,
        request_context: Dict[str, Any],
        request_text: str = '',
        title: str = '',
        task_type: str = '',
        model_name: str = '',
        **_: Any,
    ) -> Dict[str, Any]:
        text = _text(request_text) or _text((request_context.get('context') or {}).get('latest_question'))
        inferred_task = normalize_task_type(task_type or infer_task_from_text(text))
        resolved_title = _text(title) or derive_title_from_request(text, inferred_task)
        resolved_model = _text(model_name) or recommended_model_for_task(inferred_task)
        draft_name = slugify(resolved_title)
        return {
            'success': True,
            'message': '已整理 Blockly 实验意图',
            'request_summary': {
                'title': resolved_title,
                'task_type': inferred_task,
                'task_label': inferred_task,
                'model_name': resolved_model,
                'draft_name': draft_name,
                'request_text': text,
            }
        }

    def suggest_blockly_toolbox_plan(self, *, request_context: Dict[str, Any], request_text: str = '', title: str = '', task_type: str = '', model_name: str = '', **_: Any) -> Dict[str, Any]:
        request_summary = self.inspect_blockly_builder_request(
            request_context=request_context,
            request_text=request_text,
            title=title,
            task_type=task_type,
            model_name=model_name,
        )['request_summary']
        toolbox = build_xeduhub_toolbox_definition(request_summary['task_type'])
        validation = validate_toolbox_schema(toolbox)
        if not validation.get('valid'):
            raise ValueError(f"默认 toolbox 校验失败: {'; '.join(validation.get('errors') or [])}")
        categories = [item.get('name', '') for item in toolbox.get('contents', []) if isinstance(item, dict)]
        return {
            'success': True,
            'message': '已生成 Blockly toolbox 方案',
            'toolbox_plan': {
                'categories': categories,
                'toolbox': validation.get('normalized') or toolbox,
                'task_type': request_summary['task_type'],
                'model_name': request_summary['model_name'],
                'pedagogy_profile': {
                    'level_default': toolbox.get('pedagogy_level_default', 'L1'),
                    'levels': ['L1', 'L2', 'L3'],
                    'result_mode': 'teaching_card',
                },
            }
        }

    def suggest_blockly_workspace_plan(self, *, request_context: Dict[str, Any], request_text: str = '', title: str = '', task_type: str = '', model_name: str = '', input_path: str = 'demo.jpg', **_: Any) -> Dict[str, Any]:
        request_summary = self.inspect_blockly_builder_request(
            request_context=request_context,
            request_text=request_text,
            title=title,
            task_type=task_type,
            model_name=model_name,
        )['request_summary']
        workspace_xml = build_xeduhub_workspace_xml(
            title=request_summary['title'],
            task_type=request_summary['task_type'],
            model_name=request_summary['model_name'],
            input_path=input_path,
        )
        return {
            'success': True,
            'message': '已生成 Blockly workspace 方案',
            'workspace_plan': {
                'workspace_xml': workspace_xml,
                'task_type': request_summary['task_type'],
                'model_name': request_summary['model_name'],
                'input_path': input_path,
            }
        }

    def prepare_blockly_builder_plan(self, *, request_context: Dict[str, Any], request_text: str = '', title: str = '', task_type: str = '', model_name: str = '', input_path: str = 'demo.jpg', **_: Any) -> Dict[str, Any]:
        request_summary = self.inspect_blockly_builder_request(
            request_context=request_context,
            request_text=request_text,
            title=title,
            task_type=task_type,
            model_name=model_name,
        )['request_summary']
        toolbox_plan = self.suggest_blockly_toolbox_plan(
            request_context=request_context,
            request_text=request_text,
            title=request_summary['title'],
            task_type=request_summary['task_type'],
            model_name=request_summary['model_name'],
        )['toolbox_plan']
        workspace_plan = self.suggest_blockly_workspace_plan(
            request_context=request_context,
            request_text=request_text,
            title=request_summary['title'],
            task_type=request_summary['task_type'],
            model_name=request_summary['model_name'],
            input_path=input_path,
        )['workspace_plan']
        runtime_config = build_xeduhub_execution_config(
            request_summary['task_type'],
            request_summary['model_name'],
            request_summary['title'],
        )
        output_dir = self.draft_root / request_summary['draft_name']
        pedagogy_profile = toolbox_plan.get('pedagogy_profile', {})
        default_level = pedagogy_profile.get('level_default', 'L1')
        result_mode = pedagogy_profile.get('result_mode', 'teaching_card')
        return {
            'success': True,
            'message': '已生成 Blockly XEduHub 草稿计划',
            'needs_confirmation': True,
            'summary': (
                f"将生成 Blockly XEduHub 草稿《{request_summary['title']}》，输出到 `{output_dir}`，"
                f"包含 toolbox、workspace 和 runtime 配置。默认层级：{default_level}，结果模式：{result_mode}。"
            ),
            'draft_name': request_summary['draft_name'],
            'output_dir': str(output_dir),
            'toolbox_plan': toolbox_plan,
            'workspace_plan': workspace_plan,
            'runtime_config': runtime_config,
            'pedagogy_profile': pedagogy_profile,
            'default_blocks': toolbox_plan.get('toolbox', {}).get('required_block_types', []),
        }

    def apply_blockly_builder_plan(self, *, request_context: Dict[str, Any], request_text: str = '', title: str = '', task_type: str = '', model_name: str = '', input_path: str = 'demo.jpg', **_: Any) -> Dict[str, Any]:
        allowed, reason = self.mutation_guard(request_context)
        if not allowed:
            return {'success': False, 'message': reason}
        prepared = self.prepare_blockly_builder_plan(
            request_context=request_context,
            request_text=request_text,
            title=title,
            task_type=task_type,
            model_name=model_name,
            input_path=input_path,
        )
        draft_name = prepared['draft_name']
        output_dir = Path(prepared['output_dir'])
        output_dir.mkdir(parents=True, exist_ok=True)
        toolbox_path = output_dir / f'{draft_name}.toolbox.json'
        workspace_path = output_dir / f'{draft_name}.blockly.xml'
        runtime_path = output_dir / f'{draft_name}.xeduhub.json'
        toolbox_path.write_text(json.dumps(prepared['toolbox_plan']['toolbox'], ensure_ascii=False, indent=2), encoding='utf-8')
        workspace_path.write_text(prepared['workspace_plan']['workspace_xml'], encoding='utf-8')
        runtime_path.write_text(json.dumps(prepared['runtime_config'], ensure_ascii=False, indent=2), encoding='utf-8')
        return {
            'success': True,
            'message': '已生成 Blockly XEduHub 草稿文件',
            'draft_name': draft_name,
            'output_dir': str(output_dir),
            'generated_files': [str(toolbox_path), str(workspace_path), str(runtime_path)],
            'toolbox_plan': prepared['toolbox_plan'],
            'workspace_plan': {
                'workspace_path': str(workspace_path),
                'task_type': prepared['workspace_plan']['task_type'],
                'model_name': prepared['workspace_plan']['model_name'],
            },
            'runtime_config': prepared['runtime_config'],
            'pedagogy_profile': prepared.get('pedagogy_profile', {}),
            'default_blocks': prepared.get('default_blocks', []),
        }

    def prepare_python_to_blockly_pack(
        self,
        *,
        request_context: Dict[str, Any],
        python_code: str = '',
        request_text: str = '',
        title: str = '',
        draft_name: str = '',
        task_type: str = 'classification',
        model_name: str = '',
        **_: Any,
    ) -> Dict[str, Any]:
        source = _text(python_code) or _text(request_text)
        if not source:
            raise ValueError('请提供 python_code 或 request_text')
        resolved_title = _text(title) or derive_title_from_request(source, task_type)
        resolved_task = normalize_task_type(task_type or infer_task_from_text(source))
        resolved_model = _text(model_name) or recommended_model_for_task(resolved_task)
        workspace_xml, unsupported = _python_to_blockly_workspace_xml(source)
        toolbox = build_xeduhub_toolbox_definition(resolved_task)
        toolbox_validation = validate_toolbox_schema(toolbox)
        if not toolbox_validation.get('valid'):
            raise ValueError(f"toolbox 校验失败: {'; '.join(toolbox_validation.get('errors') or [])}")

        slug = slugify(_text(draft_name) or resolved_title or 'python-to-blockly-pack')
        output_dir = self.draft_root / slug
        runtime_config = build_xeduhub_execution_config(resolved_task, resolved_model, resolved_title)
        runtime_config['python_to_blockly'] = {
            'source': 'python',
            'unsupported_features': unsupported,
            'convertible_subset': ['assign', 'if', 'for-range', 'while', 'print'],
        }
        return {
            'success': True,
            'message': '已生成 Python→Blockly 草稿计划',
            'needs_confirmation': True,
            'summary': (
                f"将根据 Python 生成 Blockly 积木包到 `{output_dir}`，输出 toolbox/workspace/runtime 三件套。"
                f" 不支持语法数量：{len(unsupported)}。"
            ),
            'draft_name': slug,
            'title': resolved_title,
            'output_dir': str(output_dir),
            'toolbox': toolbox_validation.get('normalized') or toolbox,
            'workspace_xml': workspace_xml,
            'runtime_config': runtime_config,
            'unsupported_syntax': unsupported,
        }

    def apply_python_to_blockly_pack(
        self,
        *,
        request_context: Dict[str, Any],
        python_code: str = '',
        request_text: str = '',
        title: str = '',
        draft_name: str = '',
        task_type: str = 'classification',
        model_name: str = '',
        **kwargs: Any,
    ) -> Dict[str, Any]:
        allowed, reason = self.mutation_guard(request_context)
        if not allowed:
            return {'success': False, 'message': reason}
        prepared = self.prepare_python_to_blockly_pack(
            request_context=request_context,
            python_code=python_code,
            request_text=request_text,
            title=title,
            draft_name=draft_name,
            task_type=task_type,
            model_name=model_name,
            **kwargs,
        )
        output_dir = Path(prepared['output_dir'])
        output_dir.mkdir(parents=True, exist_ok=True)
        slug = prepared['draft_name']
        toolbox_path = output_dir / f'{slug}.toolbox.json'
        workspace_path = output_dir / f'{slug}.blockly.xml'
        runtime_path = output_dir / f'{slug}.runtime.json'
        toolbox_path.write_text(json.dumps(prepared['toolbox'], ensure_ascii=False, indent=2), encoding='utf-8')
        workspace_path.write_text(prepared['workspace_xml'], encoding='utf-8')
        runtime_path.write_text(json.dumps(prepared['runtime_config'], ensure_ascii=False, indent=2), encoding='utf-8')
        return {
            'success': True,
            'message': '已写入 Python→Blockly 积木包草稿',
            'draft_name': slug,
            'output_dir': str(output_dir),
            'generated_files': [str(toolbox_path), str(workspace_path), str(runtime_path)],
            'unsupported_syntax': prepared.get('unsupported_syntax') or [],
            'runtime_config': prepared.get('runtime_config') or {},
        }


class BlocklyBuilderAgentService:
    def __init__(self, *, ai_config: AIConfig, tool_adapter: BlocklyBuilderToolAdapter, fallback_ai_service: Optional[AIService] = None, runner: Any = None):
        self.ai_config = ai_config
        self.tool_adapter = tool_adapter
        self.fallback_ai_service = fallback_ai_service or AIService(ai_config)
        self.runner = runner

    def _resolve_runner(self):
        return self.runner if self.runner is not None else KimiAgentRunner()

    def _build_prompt(self, *, history: List[Dict[str, str]], question: str, tool_trace: List[Dict[str, Any]], request_context: Dict[str, Any]) -> str:
        tools = [
            'inspect_blockly_builder_request',
            'suggest_blockly_toolbox_plan',
            'suggest_blockly_workspace_plan',
            'prepare_blockly_builder_plan',
            'apply_blockly_builder_plan',
            'prepare_python_to_blockly_pack',
            'apply_python_to_blockly_pack',
        ]
        transcript = []
        for item in history[-10:]:
            role = '用户' if item.get('role') == 'user' else '助手'
            transcript.append(f"{role}: {item.get('content', '')}")
        if not history or history[-1].get('content') != question:
            transcript.append(f'用户: {question}')
        return f"""
你是 XEdu 的 Blockly XEduHub 构建助手，负责帮教师生成 Blockly 实验草稿。

严格遵守：
1. 只处理 Blockly / XEduHub / Workflow / 积木实验生成相关请求。
2. 先整理需求，再生成 toolbox 和 workspace 方案。
3. 在调用任何写入工具（apply_*）前，必须先给出执行摘要并等待教师确认。
4. 回复必须是 JSON，不要输出 Markdown 代码块。

可用工具：
{json.dumps(tools, ensure_ascii=False)}

已发生的工具调用：
{_truncate(tool_trace, 5000)}

最近对话：
{chr(10).join(transcript)}

请输出如下 JSON 之一：
1. 需要调用工具：
{{"status":"tool_call","assistant_message":"给用户的简短解释","tool_name":"工具名","tool_args":{{"request_text":{json.dumps(question, ensure_ascii=False)}}}}}

2. 需要用户补充信息：
{{"status":"needs_input","assistant_message":"请用户补充什么"}}

3. 需要用户确认执行：
{{"status":"needs_confirmation","assistant_message":"确认摘要，明确写出会生成 toolbox、workspace 和 runtime 配置，以及写入位置"}}

4. 已完成：
{{"status":"completed","assistant_message":"结果摘要"}}

5. 出错：
{{"status":"error","assistant_message":"错误原因"}}
""".strip()

    def _parse_runner_response(self, raw: str) -> Dict[str, Any]:
        cleaned = (raw or '').strip()
        if cleaned.startswith('```'):
            cleaned = re.sub(r'^```(?:json)?\s*', '', cleaned)
            cleaned = re.sub(r'\s*```$', '', cleaned)
        try:
            data = json.loads(cleaned)
        except json.JSONDecodeError:
            return {'status': 'completed', 'assistant_message': cleaned or '已完成'}
        return data if isinstance(data, dict) else {'status': 'completed', 'assistant_message': cleaned or '已完成'}

    def chat(self, *, question: str, history: Optional[List[Dict[str, str]]] = None, image_data: Optional[str] = None, request_context: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        history = history or []
        request_context = dict(request_context or {})
        request_context['confirmed'] = bool(request_context.get('confirmed'))
        if not looks_like_blockly_builder_request(question, history):
            return self.fallback_ai_service.ask_question(question, image_data, history)
        if not self.ai_config.api_key:
            return {'success': False, 'error': 'AI 未配置：请先在设置中填写 API Key'}
        try:
            runner = self._resolve_runner()
        except Exception as exc:
            return {'success': False, 'error': f'Kimi Agent 不可用: {exc}'}

        tool_trace: List[Dict[str, Any]] = []
        last_tool_result: Dict[str, Any] = {}
        for _ in range(6):
            raw = runner.run(
                prompt_text=self._build_prompt(history=history, question=question, tool_trace=tool_trace, request_context=request_context),
                ai_config=self.ai_config,
            )
            action = self._parse_runner_response(raw)
            status = action.get('status')
            assistant_message = _text(action.get('assistant_message')) or '我先帮你整理 Blockly 积木实验方案。'
            if status in {'needs_input', 'needs_confirmation', 'completed', 'error'}:
                payload = {
                    'success': status != 'error',
                    'answer': assistant_message,
                    'agent_status': status,
                    'tool_trace': tool_trace,
                }
                if last_tool_result:
                    payload['agent_result'] = last_tool_result
                if status == 'error':
                    payload['error'] = assistant_message
                return payload
            if status != 'tool_call':
                return {'success': True, 'answer': assistant_message, 'agent_status': 'completed', 'tool_trace': tool_trace}
            tool_name = _text(action.get('tool_name'))
            tool_args = action.get('tool_args') if isinstance(action.get('tool_args'), dict) else {}
            tool_result = self.tool_adapter.invoke(tool_name, tool_args, request_context)
            last_tool_result = tool_result
            tool_trace.append({'tool_name': tool_name, 'tool_args': tool_args, 'tool_result': tool_result})
            if tool_name in {'apply_blockly_builder_plan', 'apply_python_to_blockly_pack'} and tool_result.get('success'):
                return {
                    'success': True,
                    'answer': (
                        f"{tool_result.get('message')}\n\n"
                        f"- 草稿名：{tool_result.get('draft_name') or ''}\n"
                        f"- 输出目录：{tool_result.get('output_dir') or ''}\n"
                        f"- 文件数：{len(tool_result.get('generated_files') or [])}"
                    ).strip(),
                    'agent_status': 'completed',
                    'agent_result': tool_result,
                    'tool_trace': tool_trace,
                }
        return {
            'success': False,
            'error': 'Blockly 构建对话轮次过多，请换一种更明确的说法重试',
            'answer': 'Blockly 构建对话轮次过多，请换一种更明确的说法重试。',
            'agent_status': 'error',
            'tool_trace': tool_trace,
        }


def looks_like_blockly_builder_request(text: str, history: Optional[List[Dict[str, str]]] = None) -> bool:
    history = history or []
    source = ' '.join([
        text or '',
        ' '.join(_text(item.get('content')) for item in history[-6:]),
    ]).lower()
    return any(keyword in source for keyword in _BLOCKLY_KEYWORDS)
