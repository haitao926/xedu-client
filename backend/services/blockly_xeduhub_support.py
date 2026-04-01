#!/usr/bin/env python3
# -*- coding: utf-8 -*-

from __future__ import annotations

import base64
import io
import re
import traceback
from html import escape
from pathlib import Path
from typing import Any, Dict, List

TASK_MODELS = {
    'classification': ['resnet18', 'resnet50', 'mobilenetv2'],
    'detection': ['yolov5', 'yolov8n', 'fasterrcnn'],
    'segmentation': ['deeplabv3', 'unet'],
    'pose': ['hrnet', 'rtmpose'],
    'ocr': ['dbnet', 'crnn'],
    'generation': ['gpt2', 'sd-v1-5'],
    'panoptic': ['panoptic_deeplab', 'yolov8p'],
    'multimodal': ['clip', 'blip'],
    'depth': ['midas', 'dpt'],
    'custom': ['custom-model'],
}

TASK_LABELS = {
    'classification': '图像分类',
    'detection': '目标检测',
    'segmentation': '图像分割',
    'pose': '关键点识别',
    'ocr': '光学字符识别(OCR)',
    'generation': '内容生成',
    'panoptic': '全景感知',
    'multimodal': '多模态提取',
    'depth': '深度估计',
    'custom': '自定义模型',
}

PEDAGOGY_LEVELS = ('L1', 'L2', 'L3')

REQUIRED_L1_BLOCK_TYPES = (
    'xeduhub_set_input',
    'xeduhub_run_vision',
    'xeduhub_show_result_card',
    'xeduhub_show_result_image',
    'xeduhub_run_and_record',
    'xeduhub_clear_result',
)

_TOOLBOX_BLOCK_KINDS = {"block", "shadow", "label", "sep", "category"}
_UNSAFE_INPUT_PRESET_BLOCKS = {
    "text_getSubstring",
    "text_changeCase",
}


def validate_toolbox_schema(toolbox: Any) -> Dict[str, Any]:
    errors: List[str] = []
    if not isinstance(toolbox, dict):
        return {"valid": False, "errors": ["toolbox 必须是对象"], "normalized": None}
    kind = str(toolbox.get("kind") or "")
    if kind != "categoryToolbox":
        errors.append("toolbox.kind 必须为 categoryToolbox")
    contents = toolbox.get("contents")
    if not isinstance(contents, list):
        errors.append("toolbox.contents 必须是数组")
        return {"valid": False, "errors": errors, "normalized": None}

    def _validate_input_block(item: Any, path: str) -> None:
        if not isinstance(item, dict):
            errors.append(f"{path} 必须是对象")
            return
        node_kind = str(item.get("kind") or "")
        if node_kind not in {"block", "shadow"}:
            errors.append(f"{path}.kind 必须是 block 或 shadow")
            return
        block_type = str(item.get("type") or "").strip()
        if not block_type:
            errors.append(f"{path}.type 不能为空")
        fields = item.get("fields")
        if fields is not None and not isinstance(fields, dict):
            errors.append(f"{path}.fields 必须是对象")
        child_inputs = item.get("inputs")
        if child_inputs is not None:
            if not isinstance(child_inputs, dict):
                errors.append(f"{path}.inputs 必须是对象")
            else:
                for key, child in child_inputs.items():
                    if not str(key or "").strip():
                        errors.append(f"{path}.inputs 存在空 key")
                        continue
                    _validate_input_block(child, f"{path}.inputs[{key}]")

    def _validate_item(item: Any, path: str) -> None:
        if not isinstance(item, dict):
            errors.append(f"{path} 必须是对象")
            return
        node_kind = str(item.get("kind") or "")
        if node_kind not in _TOOLBOX_BLOCK_KINDS:
            errors.append(f"{path}.kind 非法: {node_kind}")
            return
        if node_kind == "category":
            name = str(item.get("name") or "").strip()
            if not name:
                errors.append(f"{path}.name 不能为空")
            children = item.get("contents")
            if children is None:
                return
            if not isinstance(children, list):
                errors.append(f"{path}.contents 必须是数组")
                return
            for index, child in enumerate(children):
                _validate_item(child, f"{path}.contents[{index}]")
        elif node_kind in {"block", "shadow"}:
            block_type = str(item.get("type") or "").strip()
            if not block_type:
                errors.append(f"{path}.type 不能为空")
            for field_name in ("fields", "inputs", "extraState"):
                value = item.get(field_name)
                if value is not None and not isinstance(value, dict):
                    errors.append(f"{path}.{field_name} 必须是对象")
            if block_type in _UNSAFE_INPUT_PRESET_BLOCKS and isinstance(item.get("inputs"), dict):
                errors.append(f"{path} 不允许为 {block_type} 预设 inputs")
            inputs = item.get("inputs")
            if isinstance(inputs, dict):
                for key, child in inputs.items():
                    if not str(key or "").strip():
                        errors.append(f"{path}.inputs 存在空 key")
                        continue
                    _validate_input_block(child, f"{path}.inputs[{key}]")

    for idx, entry in enumerate(contents):
        _validate_item(entry, f"contents[{idx}]")

    normalized = toolbox if not errors else None
    return {"valid": not errors, "errors": errors, "normalized": normalized}


def normalize_task_type(value: Any) -> str:
    text = str(value or '').strip().lower()
    mapping = {
        '分类': 'classification', '图像分类': 'classification', 'classification': 'classification',
        '检测': 'detection', '目标检测': 'detection', 'detection': 'detection',
        '分割': 'segmentation', '图像分割': 'segmentation', 'segmentation': 'segmentation',
        '关键点': 'pose', '姿态': 'pose', 'pose': 'pose',
        'ocr': 'ocr', '文字识别': 'ocr',
        '生成': 'generation', '内容生成': 'generation', 'generation': 'generation',
        '全景': 'panoptic', '全景感知': 'panoptic', 'panoptic': 'panoptic',
        '多模态': 'multimodal', 'multimodal': 'multimodal',
        '深度': 'depth', '深度估计': 'depth', 'depth': 'depth',
        '自定义': 'custom', 'workflow': 'custom',
    }
    return mapping.get(text, text if text in TASK_MODELS else 'classification')


def infer_task_from_text(text: str) -> str:
    source = str(text or '').lower()
    if any(token in source for token in ('检测', 'detect', 'bbox')): return 'detection'
    if any(token in source for token in ('分割', 'mask', 'segment')): return 'segmentation'
    if any(token in source for token in ('关键点', '姿态', 'pose')): return 'pose'
    if any(token in source for token in ('ocr', '文字识别')): return 'ocr'
    if any(token in source for token in ('生成', 'gpt', 'generate', 'chat')): return 'generation'
    if any(token in source for token in ('全景', 'panoptic')): return 'panoptic'
    if any(token in source for token in ('模态', 'clip')): return 'multimodal'
    if any(token in source for token in ('深度', 'depth', '估算')): return 'depth'
    return 'classification'


def recommended_model_for_task(task_type: str) -> str:
    task = normalize_task_type(task_type)
    return TASK_MODELS.get(task, ['resnet18'])[0]


def slugify(value: str, fallback: str = 'xeduhub-blockly-lab') -> str:
    text = re.sub(r'[^\w\-]+', '-', str(value or '').strip().lower()).strip('-')
    return text or fallback


def derive_title_from_request(text: str, task_type: str = '') -> str:
    cleaned = re.sub(r'^(帮我|请|做一个|创建一个|生成一个|搭一个|给我)\s*', '', str(text or '').strip())
    cleaned = cleaned[:24].strip(' ，。,.')
    if cleaned:
        return cleaned
    task = normalize_task_type(task_type)
    return f"{TASK_LABELS.get(task, 'XEduHub')} 积木实验"


def build_xeduhub_toolbox_definition(task_type: str = 'classification') -> Dict[str, Any]:
    task = normalize_task_type(task_type)
    model = recommended_model_for_task(task)
    return {
        'kind': 'categoryToolbox',
        'pedagogy_level_default': 'L1',
        'required_block_types': list(REQUIRED_L1_BLOCK_TYPES),
        'contents': [
            {
                'kind': 'category',
                'name': '逻辑',
                'colour': '#5C81A6',
                'visible_by_default': True,
                'description': '条件判断与逻辑运算，编程基础积木',
                'contents': [
                    {'kind': 'block', 'type': 'controls_if'},
                    {'kind': 'block', 'type': 'logic_compare'},
                    {'kind': 'block', 'type': 'logic_operation'},
                    {'kind': 'block', 'type': 'logic_negate'},
                    {'kind': 'block', 'type': 'logic_boolean'},
                    {'kind': 'block', 'type': 'logic_null'},
                    {'kind': 'block', 'type': 'logic_ternary'},
                ],
            },
            {
                'kind': 'category',
                'name': '循环',
                'colour': '#5CA65C',
                'visible_by_default': True,
                'description': '重复执行特定代码块，编程核心概念',
                'contents': [
                    {'kind': 'block', 'type': 'controls_repeat_ext', 'inputs': {'TIMES': {'kind': 'block', 'type': 'math_number', 'fields': {'NUM': 10}}}},
                    {'kind': 'block', 'type': 'controls_whileUntil'},
                    {'kind': 'block', 'type': 'controls_for', 'inputs': {'FROM': {'kind': 'block', 'type': 'math_number', 'fields': {'NUM': 1}}, 'TO': {'kind': 'block', 'type': 'math_number', 'fields': {'NUM': 10}}, 'BY': {'kind': 'block', 'type': 'math_number', 'fields': {'NUM': 1}}}},
                    {'kind': 'block', 'type': 'controls_forEach'},
                    {'kind': 'block', 'type': 'controls_flow_statements'},
                ],
            },
            {
                'kind': 'category',
                'name': '数学',
                'colour': '#5CA68E',
                'visible_by_default': True,
                'description': '数学运算与随机数生成',
                'contents': [
                    {'kind': 'block', 'type': 'math_number', 'fields': {'NUM': 123}},
                    {'kind': 'block', 'type': 'math_arithmetic'},
                    {'kind': 'block', 'type': 'math_single'},
                    {'kind': 'block', 'type': 'math_trig'},
                    {'kind': 'block', 'type': 'math_constant'},
                    {'kind': 'block', 'type': 'math_number_property'},
                    {'kind': 'block', 'type': 'math_round'},
                    {'kind': 'block', 'type': 'math_on_list'},
                    {'kind': 'block', 'type': 'math_modulo'},
                    {'kind': 'block', 'type': 'math_constrain', 'inputs': {'LOW': {'kind': 'block', 'type': 'math_number', 'fields': {'NUM': 1}}, 'HIGH': {'kind': 'block', 'type': 'math_number', 'fields': {'NUM': 100}}}},
                    {'kind': 'block', 'type': 'math_random_int', 'inputs': {'FROM': {'kind': 'block', 'type': 'math_number', 'fields': {'NUM': 1}}, 'TO': {'kind': 'block', 'type': 'math_number', 'fields': {'NUM': 100}}}},
                    {'kind': 'block', 'type': 'math_random_float'},
                    {'kind': 'block', 'type': 'math_atan2'},
                ],
            },
            {
                'kind': 'category',
                'name': '文本',
                'colour': '#5CA699',
                'visible_by_default': True,
                'description': '文字处理与打印输出',
                'contents': [
                    {'kind': 'block', 'type': 'text'},
                    {'kind': 'block', 'type': 'text_join'},
                    {'kind': 'block', 'type': 'text_append'},
                    {'kind': 'block', 'type': 'text_length'},
                    {'kind': 'block', 'type': 'text_isEmpty'},
                    {'kind': 'block', 'type': 'text_indexOf'},
                    {'kind': 'block', 'type': 'text_charAt'},
                    {'kind': 'block', 'type': 'text_getSubstring'},
                    {'kind': 'block', 'type': 'text_changeCase'},
                    {'kind': 'block', 'type': 'text_trim'},
                    {'kind': 'block', 'type': 'text_count'},
                    {'kind': 'block', 'type': 'text_replace'},
                    {'kind': 'block', 'type': 'text_reverse'},
                    {'kind': 'block', 'type': 'text_print'},
                ],
            },
            {
                'kind': 'category',
                'name': '列表',
                'colour': '#745CA6',
                'visible_by_default': False,
                'description': '集中存储多项数据，进阶数据结构',
                'contents': [
                    {'kind': 'block', 'type': 'lists_create_with', 'extraState': {'itemCount': 3}},
                    {'kind': 'block', 'type': 'lists_create_empty'},
                    {'kind': 'block', 'type': 'lists_repeat', 'inputs': {'NUM': {'kind': 'block', 'type': 'math_number', 'fields': {'NUM': 5}}}},
                    {'kind': 'block', 'type': 'lists_length'},
                    {'kind': 'block', 'type': 'lists_isEmpty'},
                    {'kind': 'block', 'type': 'lists_indexOf'},
                    {'kind': 'block', 'type': 'lists_getIndex'},
                    {'kind': 'block', 'type': 'lists_setIndex'},
                    {'kind': 'block', 'type': 'lists_getSublist'},
                    {'kind': 'block', 'type': 'lists_split', 'inputs': {'DELIM': {'kind': 'block', 'type': 'text', 'fields': {'TEXT': ','}}}},
                    {'kind': 'block', 'type': 'lists_sort'},
                    {'kind': 'block', 'type': 'lists_reverse'},
                ],
            },
            {'kind': 'category', 'name': '变量', 'custom': 'VARIABLE', 'colour': '#A65C81', 'visible_by_default': True, 'description': '存储和修改数据变量'},
            {'kind': 'category', 'name': '函数', 'custom': 'PROCEDURE', 'colour': '#9A5CA6', 'visible_by_default': False, 'description': '代码重用与逻辑封装'},
            {'kind': 'sep'},
            {
                'kind': 'category',
                'name': 'XEduHub 推理',
                'colour': '#4D6BFF',
                'visible_by_default': True,
                'description': '一键运行 AI 推理任务，快速获取结论',
                'contents': [
                    {'kind': 'block', 'type': 'xeduhub_set_input', 'fields': {'INPUT': 'demo.jpg'}},
                    {'kind': 'block', 'type': 'xeduhub_run_vision', 'fields': {'TASK': task, 'MODEL': model, 'INPUT': 'demo.jpg'}},
                    {'kind': 'block', 'type': 'xeduhub_show_result_card', 'fields': {'TITLE': '推理结果'}},
                    {'kind': 'block', 'type': 'xeduhub_show_result_image'},
                    {'kind': 'block', 'type': 'xeduhub_run_and_record'},
                    {'kind': 'block', 'type': 'xeduhub_clear_result'},
                    {'kind': 'sep'},
                    {'kind': 'block', 'type': 'xeduhub_create_flow', 'fields': {'TASK': task, 'MODEL': model}},
                    {'kind': 'block', 'type': 'xeduhub_flow_set_input', 'fields': {'INPUT': 'demo.jpg'}},
                    {'kind': 'block', 'type': 'xeduhub_flow_execute', 'fields': {'RESULT': 'lab_result'}},
                    {'kind': 'block', 'type': 'xeduhub_get_result_field', 'fields': {'RESULT': 'lab_result', 'FIELD': 'label'}},
                ],
            },
            {
                'kind': 'category',
                'name': '模型与参数',
                'colour': '#7C4DFF',
                'visible_by_default': False,
                'description': '精细控制推理模型、置信度阈值等参数',
                'contents': [
                    {'kind': 'block', 'type': 'xeduhub_set_model', 'fields': {'MODEL': model}},
                    {'kind': 'block', 'type': 'xeduhub_set_threshold', 'fields': {'THRESHOLD': '0.35'}},
                    {'kind': 'block', 'type': 'xeduhub_set_topk', 'fields': {'TOPK': '3'}},
                ],
            },
            {
                'kind': 'category',
                'name': '底层与调试',
                'colour': '#9C27B0',
                'visible_by_default': False,
                'description': '底层 Workflow 接口与错误排查',
                'contents': [                    {'kind': 'block', 'type': 'xeduhub_raw_create_workflow'},
                    {'kind': 'block', 'type': 'xeduhub_raw_inference'},
                    {'kind': 'block', 'type': 'xeduhub_read_raw'},
                    {'kind': 'block', 'type': 'xeduhub_debug_print'},
                    {'kind': 'block', 'type': 'xeduhub_catch_error'},
                ],
            },
            {
                'kind': 'category',
                'name': '扩展包',
                'colour': '#00BFA6',
                'contents': [
                    {'kind': 'label', 'text': '点击上方“增加积木包”载入扩展'},
                ],
            },
        ],
    }


def build_xeduhub_workspace_xml(title: str, task_type: str = 'classification', model_name: str = '', input_path: str = 'demo.jpg') -> str:
    task = normalize_task_type(task_type)
    model = model_name or recommended_model_for_task(task)
    safe_title = escape(title or 'XEduHub 实验')
    safe_input = escape(input_path or 'demo.jpg')
    run_block = 'xeduhub_detect_run' if task == 'detection' else 'xeduhub_ocr_run' if task == 'ocr' else 'xeduhub_classify_run'
    return f'''<xml xmlns="https://developers.google.com/blockly/xml">
  <block type="xeduhub_set_input" id="input1" x="28" y="28">
    <field name="INPUT">{safe_input}</field>
    <next>
      <block type="{run_block}" id="run1">
        <field name="MODEL">{escape(model)}</field>
        <next>
          <block type="xeduhub_show_result_card" id="show1">
            <field name="TITLE">{safe_title}</field>
            <next>
              <block type="xeduhub_show_result_image" id="showimg1">
                <next>
                  <block type="xeduhub_run_and_record" id="record1"></block>
                </next>
              </block>
            </next>
          </block>
        </next>
      </block>
    </next>
  </block>
</xml>'''


def build_xeduhub_execution_config(task_type: str, model_name: str, title: str) -> Dict[str, Any]:
    task = normalize_task_type(task_type)
    return {
        'title': title,
        'task_type': task,
        'task_label': TASK_LABELS.get(task, '图像分类'),
        'model_name': model_name or recommended_model_for_task(task),
        'runtime': 'xeduhub',
        'supports_in_page_execution': True,
        'pedagogy_profile': {
            'level_default': 'L1',
            'levels': list(PEDAGOGY_LEVELS),
            'task_bias': 'vision_first',
            'result_mode': 'teaching_card',
        },
        'result_display': {
            'mode': 'teaching_card',
            'sections': ['conclusion', 'evidence', 'debug'],
        },
    }


def resolve_input_path(input_value: str, project_root: str = '') -> str:
    raw = str(input_value or '').strip()
    if not raw:
        return ''
    path = Path(raw)
    if path.is_absolute() or not project_root:
        return str(path)
    return str((Path(project_root) / raw).expanduser().resolve())


def _best_effort_image_to_data_url(image: Any) -> str:
    try:
        from PIL import Image  # type: ignore
        import numpy as np  # type: ignore
    except Exception:
        return ''

    try:
        if hasattr(image, 'save'):
            pil_image = image
        else:
            array = np.array(image)
            if array.ndim == 3 and array.shape[2] == 3:
                pil_image = Image.fromarray(array.astype('uint8'))
            else:
                pil_image = Image.fromarray(array.squeeze().astype('uint8'))
        buf = io.BytesIO()
        pil_image.save(buf, format='PNG')
        return 'data:image/png;base64,' + base64.b64encode(buf.getvalue()).decode('utf-8')
    except Exception:
        return ''


def _extract_key_fields(task: str, output: Any) -> Dict[str, Any]:
    if task == 'classification':
        if isinstance(output, list) and output:
            top = output[0] if isinstance(output[0], dict) else {}
            return {
                'label': top.get('label') or top.get('class') or top.get('name') or '',
                'score': top.get('score') or top.get('confidence') or '',
            }
        if isinstance(output, dict):
            return {
                'label': output.get('label') or output.get('class') or output.get('name') or '',
                'score': output.get('score') or output.get('confidence') or '',
            }
    if task == 'detection':
        boxes = output.get('boxes') if isinstance(output, dict) else output if isinstance(output, list) else []
        return {'boxes': len(boxes) if isinstance(boxes, list) else 0}
    if task == 'ocr':
        if isinstance(output, list):
            return {'text_blocks': len(output)}
        if isinstance(output, dict):
            text = output.get('text') or output.get('result') or ''
            return {'text_preview': str(text)[:120]}
    return {}


def _build_result_summary(task: str, output: Any) -> Dict[str, Any]:
    metrics: List[Dict[str, Any]] = []
    hints: List[str] = []
    headline = f"{TASK_LABELS.get(task, task)}推理完成"
    if task == 'classification':
        key = _extract_key_fields(task, output)
        label = str(key.get('label') or '').strip()
        score = key.get('score')
        if label:
            headline = f"识别结果：{label}"
            metrics.append({'label': 'Top-1', 'value': label})
        if score not in (None, ''):
            metrics.append({'label': '置信度', 'value': score})
        hints.append('可切换模型后再次运行，比较稳定性。')
    elif task == 'detection':
        boxes = _extract_key_fields(task, output).get('boxes') or 0
        headline = f"检测到 {boxes} 个目标"
        metrics.append({'label': '检测框', 'value': boxes})
        hints.append('证据区可查看标注图。')
    elif task == 'ocr':
        key = _extract_key_fields(task, output)
        blocks = key.get('text_blocks')
        if blocks is not None:
            headline = f"OCR 识别到 {blocks} 个文本块"
            metrics.append({'label': '文本块', 'value': blocks})
        preview = str(key.get('text_preview') or '').strip()
        if preview:
            metrics.append({'label': '文本预览', 'value': preview})
        hints.append('可在调试区查看完整 OCR 输出。')
    else:
        hints.append('可在调试区查看完整输出。')
    return {'headline': headline, 'metrics': metrics, 'hints': hints}


def execute_xeduhub_runtime(payload: Dict[str, Any]) -> Dict[str, Any]:
    code = str(payload.get('code') or '').strip()
    spec = payload.get('spec') if isinstance(payload.get('spec'), dict) else {}
    task = normalize_task_type(spec.get('task') or spec.get('task_type'))
    model_name = str(spec.get('model') or spec.get('model_name') or recommended_model_for_task(task)).strip()
    input_value = str(spec.get('input') or spec.get('input_path') or '').strip()
    project_root = str(payload.get('project_root') or spec.get('project_root') or '').strip()
    resolved_input = resolve_input_path(input_value, project_root)

    if not task:
        return {
            'success': False,
            'result_type': 'error',
            'message': '缺少任务类型',
            'result': None,
            'artifacts': {'generated_python': code},
            'result_summary': {
                'headline': '缺少任务类型',
                'metrics': [],
                'hints': ['请先选择分类、检测或 OCR 任务积木。'],
            },
            'result_artifacts': {'preview_image': '', 'key_fields': {}},
        }
    if not resolved_input:
        return {
            'success': False,
            'result_type': 'error',
            'message': '请先在积木中填写输入图片路径',
            'result': None,
            'artifacts': {'generated_python': code},
            'result_summary': {
                'headline': '输入缺失',
                'metrics': [],
                'hints': ['先使用“选择输入图片”积木填写本地图片路径。'],
            },
            'result_artifacts': {'preview_image': '', 'key_fields': {}},
        }
    if not Path(resolved_input).exists():
        return {
            'success': False,
            'result_type': 'error',
            'message': f'输入资源不存在: {resolved_input}',
            'result': None,
            'artifacts': {'generated_python': code},
            'result_summary': {
                'headline': '输入文件不存在',
                'metrics': [{'label': '路径', 'value': resolved_input}],
                'hints': ['请检查路径是否正确，或改为绝对路径。'],
            },
            'result_artifacts': {'preview_image': '', 'key_fields': {}},
        }

    try:
        from XEdu.hub import Workflow as wf  # type: ignore
    except Exception:
        return {
            'success': False,
            'result_type': 'error',
            'message': '当前环境未安装 XEduHub，无法在 Blockly 页内执行。请先安装 XEdu 后再重试。',
            'result': {
                'task_type': task,
                'model_name': model_name,
                'input_path': resolved_input,
            },
            'artifacts': {'generated_python': code},
            'result_summary': {
                'headline': '运行时缺少 XEduHub 依赖',
                'metrics': [
                    {'label': '任务', 'value': TASK_LABELS.get(task, task)},
                    {'label': '模型', 'value': model_name},
                ],
                'hints': ['先在平台 Python 环境安装 XEdu/XEduHub，再重新运行。'],
            },
            'result_artifacts': {'preview_image': '', 'key_fields': {}},
        }

    try:
        workflow = wf(task=task)
        result = workflow.inference(data=resolved_input, model=model_name)
        image_data = ''
        normalized_result = result
        if isinstance(result, (list, tuple)) and len(result) == 2:
            normalized_result = result[0]
            image_data = _best_effort_image_to_data_url(result[1])
        elif isinstance(result, dict):
            for key in ('image', 'result_image', 'visualization'):
                if key in result:
                    image_data = _best_effort_image_to_data_url(result[key])
                    break

        return {
            'success': True,
            'result_type': 'vision',
            'message': f"已完成 {TASK_LABELS.get(task, task)} 推理",
            'result': {
                'task_type': task,
                'task_label': TASK_LABELS.get(task, task),
                'model_name': model_name,
                'input_path': resolved_input,
                'output': normalized_result,
            },
            'artifacts': {
                'generated_python': code,
                'image_data': image_data,
            },
            'result_summary': _build_result_summary(task, normalized_result),
            'result_artifacts': {
                'preview_image': image_data,
                'key_fields': _extract_key_fields(task, normalized_result),
            },
        }
    except Exception as exc:
        return {
            'success': False,
            'result_type': 'error',
            'message': f'XEduHub 推理失败: {exc}',
            'result': {
                'task_type': task,
                'model_name': model_name,
                'traceback': traceback.format_exc(limit=4),
            },
            'artifacts': {'generated_python': code},
            'result_summary': {
                'headline': '推理执行失败',
                'metrics': [
                    {'label': '任务', 'value': TASK_LABELS.get(task, task)},
                    {'label': '模型', 'value': model_name},
                ],
                'hints': ['请检查模型名、输入资源及环境依赖。'],
            },
            'result_artifacts': {'preview_image': '', 'key_fields': {}},
        }
