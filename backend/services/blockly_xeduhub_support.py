#!/usr/bin/env python3
# -*- coding: utf-8 -*-

from __future__ import annotations

import base64
import copy
import io
import json
import re
import traceback
from html import escape
from pathlib import Path
from typing import Any, Dict, Iterable, List, Tuple

PEDAGOGY_LEVELS = ("L1", "L2", "L3")

_TOOLBOX_BLOCK_KINDS = {"block", "shadow", "label", "sep", "category"}
_UNSAFE_INPUT_PRESET_BLOCKS = {
    "text_getSubstring",
    "text_changeCase",
}

INPUT_BLOCK_TYPES = (
    "xeduhub_set_input_resource",
    "xeduhub_set_input_list",
)

RESULT_BLOCK_TYPES = (
    "xeduhub_show_result_card",
    "xeduhub_show_result_image",
    "xeduhub_run_and_record",
    "xeduhub_clear_result",
)

ADVANCED_BLOCK_TYPES = (
    "xeduhub_workflow_create",
    "xeduhub_workflow_infer",
    "xeduhub_get_result_field",
    "xeduhub_debug_print",
    "xeduhub_catch_error",
)

TASK_FAMILY_META = {
    "detection": {"label": "目标检测", "colour": "#F59B42", "description": "检测并定位人体、人脸、人手和 COCO 目标"},
    "pose": {"label": "关键点识别", "colour": "#F06F7F", "description": "识别人脸、人体、手部和全身关键点"},
    "ocr": {"label": "OCR", "colour": "#18B898", "description": "提取图像中的文字内容"},
    "classification": {"label": "图像分类", "colour": "#4F7CFF", "description": "识别图像类别并返回预测结果"},
    "generation": {"label": "内容生成", "colour": "#8E68F8", "description": "执行风格迁移与图像着色"},
    "panoptic": {"label": "全景感知", "colour": "#63B66E", "description": "驾驶场景的检测与区域感知"},
    "multimodal": {"label": "多模态特征", "colour": "#2F9BF4", "description": "提取图像、文本与音频向量"},
    "segmentation": {"label": "图像分割", "colour": "#37A7F7", "description": "基于提示点或框执行 SAM 分割"},
    "depth": {"label": "深度估计", "colour": "#AA6CF6", "description": "生成单目深度结果图"},
}

TASK_FAMILY_ORDER = [
    "classification",
    "detection",
    "ocr",
    "pose",
    "generation",
    "segmentation",
    "depth",
    "multimodal",
    "panoptic",
]

TOOLBOX_HIDDEN_TASK_IDS = {
    "det_body_l",
    "det_coco_l",
    "pose_body17_l",
    "pose_body26",
    "pose_wholebody133",
}

TASK_REGISTRY: Dict[str, Dict[str, Any]] = {
    "det_body": {
        "label": "人体目标检测",
        "family": "detection",
        "params": [
            {"key": "thr", "label": "阈值", "field": "number", "default": 0.3},
            {"key": "img_type", "label": "返回图", "field": "enum", "default": "pil", "options": [["PIL", "pil"], ["CV2", "cv2"], ["不返回", ""]]},
        ],
        "input_mode": "single_path",
        "result_kind": "detection",
    },
    "det_body_l": {
        "label": "人体目标检测 Large",
        "family": "detection",
        "params": [
            {"key": "thr", "label": "阈值", "field": "number", "default": 0.3},
            {"key": "img_type", "label": "返回图", "field": "enum", "default": "pil", "options": [["PIL", "pil"], ["CV2", "cv2"], ["不返回", ""]]},
        ],
        "input_mode": "single_path",
        "result_kind": "detection",
    },
    "det_face": {
        "label": "人脸目标检测",
        "family": "detection",
        "params": [
            {"key": "img_type", "label": "返回图", "field": "enum", "default": "pil", "options": [["PIL", "pil"], ["CV2", "cv2"], ["不返回", ""]]},
            {"key": "minSize", "label": "最小尺寸", "field": "text", "default": "[50,50]"},
            {"key": "maxSize", "label": "最大尺寸", "field": "text", "default": ""},
            {"key": "scaleFactor", "label": "缩放比", "field": "number", "default": 1.1},
            {"key": "minNeighbors", "label": "邻域数", "field": "number", "default": 5},
        ],
        "input_mode": "single_path",
        "result_kind": "detection",
    },
    "det_hand": {
        "label": "手部目标检测",
        "family": "detection",
        "params": [
            {"key": "thr", "label": "阈值", "field": "number", "default": 0.3},
            {"key": "img_type", "label": "返回图", "field": "enum", "default": "pil", "options": [["PIL", "pil"], ["CV2", "cv2"], ["不返回", ""]]},
        ],
        "input_mode": "single_path",
        "result_kind": "detection",
    },
    "det_coco": {
        "label": "COCO 目标检测",
        "family": "detection",
        "params": [
            {"key": "thr", "label": "阈值", "field": "number", "default": 0.3},
            {"key": "target_class", "label": "目标类", "field": "text", "default": ""},
            {"key": "img_type", "label": "返回图", "field": "enum", "default": "pil", "options": [["PIL", "pil"], ["CV2", "cv2"], ["不返回", ""]]},
        ],
        "input_mode": "single_path",
        "result_kind": "detection",
    },
    "det_coco_l": {
        "label": "COCO 目标检测 Large",
        "family": "detection",
        "params": [
            {"key": "thr", "label": "阈值", "field": "number", "default": 0.3},
            {"key": "target_class", "label": "目标类", "field": "text", "default": ""},
            {"key": "img_type", "label": "返回图", "field": "enum", "default": "pil", "options": [["PIL", "pil"], ["CV2", "cv2"], ["不返回", ""]]},
        ],
        "input_mode": "single_path",
        "result_kind": "detection",
    },
    "pose_body17": {
        "label": "人体关键点 17",
        "family": "pose",
        "params": [
            {"key": "bbox", "label": "检测框", "field": "text", "default": ""},
            {"key": "img_type", "label": "返回图", "field": "enum", "default": "pil", "options": [["PIL", "pil"], ["CV2", "cv2"], ["不返回", ""]]},
        ],
        "input_mode": "single_path",
        "result_kind": "pose",
    },
    "pose_body17_l": {
        "label": "人体关键点 17 Large",
        "family": "pose",
        "params": [
            {"key": "bbox", "label": "检测框", "field": "text", "default": ""},
            {"key": "img_type", "label": "返回图", "field": "enum", "default": "pil", "options": [["PIL", "pil"], ["CV2", "cv2"], ["不返回", ""]]},
        ],
        "input_mode": "single_path",
        "result_kind": "pose",
    },
    "pose_body26": {
        "label": "人体关键点 26",
        "family": "pose",
        "params": [
            {"key": "bbox", "label": "检测框", "field": "text", "default": ""},
            {"key": "img_type", "label": "返回图", "field": "enum", "default": "pil", "options": [["PIL", "pil"], ["CV2", "cv2"], ["不返回", ""]]},
        ],
        "input_mode": "single_path",
        "result_kind": "pose",
    },
    "pose_face106": {
        "label": "人脸关键点 106",
        "family": "pose",
        "params": [
            {"key": "bbox", "label": "检测框", "field": "text", "default": ""},
            {"key": "img_type", "label": "返回图", "field": "enum", "default": "pil", "options": [["PIL", "pil"], ["CV2", "cv2"], ["不返回", ""]]},
        ],
        "input_mode": "single_path",
        "result_kind": "pose",
    },
    "pose_hand21": {
        "label": "手部关键点 21",
        "family": "pose",
        "params": [
            {"key": "bbox", "label": "检测框", "field": "text", "default": ""},
            {"key": "img_type", "label": "返回图", "field": "enum", "default": "pil", "options": [["PIL", "pil"], ["CV2", "cv2"], ["不返回", ""]]},
        ],
        "input_mode": "single_path",
        "result_kind": "pose",
    },
    "pose_wholebody133": {
        "label": "全身关键点 133",
        "family": "pose",
        "params": [
            {"key": "bbox", "label": "检测框", "field": "text", "default": ""},
            {"key": "img_type", "label": "返回图", "field": "enum", "default": "pil", "options": [["PIL", "pil"], ["CV2", "cv2"], ["不返回", ""]]},
        ],
        "input_mode": "single_path",
        "result_kind": "pose",
    },
    "ocr": {
        "label": "光学字符识别",
        "family": "ocr",
        "params": [
            {"key": "img_type", "label": "返回图", "field": "enum", "default": "cv2", "options": [["CV2", "cv2"], ["PIL", "pil"], ["不返回", ""]]},
        ],
        "input_mode": "single_path",
        "result_kind": "ocr",
    },
    "cls_imagenet": {
        "label": "ImageNet 图像分类",
        "family": "classification",
        "params": [
            {"key": "img_type", "label": "返回图", "field": "enum", "default": "pil", "options": [["PIL", "pil"], ["CV2", "cv2"], ["不返回", ""]]},
        ],
        "input_mode": "single_path",
        "result_kind": "classification",
    },
    "gen_style": {
        "label": "图像风格迁移",
        "family": "generation",
        "params": [
            {"key": "style", "label": "风格", "field": "enum", "default": "mosaic", "options": [["马赛克", "mosaic"], ["糖果", "candy"], ["雨中公主", "rain-princess"], ["Udnie", "udnie"], ["点彩", "pointilism"]]},
            {"key": "img_type", "label": "返回图", "field": "enum", "default": "cv2", "options": [["CV2", "cv2"], ["PIL", "pil"], ["不返回", ""]]},
        ],
        "input_mode": "single_path",
        "result_kind": "generation",
    },
    "gen_color": {
        "label": "图像着色",
        "family": "generation",
        "params": [
            {"key": "img_type", "label": "返回图", "field": "enum", "default": "cv2", "options": [["CV2", "cv2"], ["PIL", "pil"], ["不返回", ""]]},
        ],
        "input_mode": "single_path",
        "result_kind": "generation",
    },
    "drive_perception": {
        "label": "全景驾驶感知",
        "family": "panoptic",
        "params": [
            {"key": "thr", "label": "阈值", "field": "number", "default": 0.3},
            {"key": "img_type", "label": "返回图", "field": "enum", "default": "cv2", "options": [["CV2", "cv2"], ["PIL", "pil"], ["不返回", ""]]},
        ],
        "input_mode": "single_path",
        "result_kind": "panoptic",
    },
    "embedding_image": {
        "label": "图像特征提取",
        "family": "multimodal",
        "params": [],
        "input_mode": "path_or_list",
        "result_kind": "multimodal",
    },
    "embedding_text": {
        "label": "文本特征提取",
        "family": "multimodal",
        "params": [],
        "input_mode": "text_or_list",
        "result_kind": "multimodal",
    },
    "embedding_audio": {
        "label": "音频特征提取",
        "family": "multimodal",
        "params": [],
        "input_mode": "path_or_list",
        "result_kind": "multimodal",
    },
    "segment_anything": {
        "label": "SAM 图像分割",
        "family": "segmentation",
        "params": [
            {"key": "mode", "label": "模式", "field": "enum", "default": "point", "options": [["点提示", "point"], ["框提示", "box"]]},
            {"key": "prompt", "label": "提示", "field": "text", "default": "[100,100]"},
            {"key": "img_type", "label": "返回图", "field": "enum", "default": "pil", "options": [["PIL", "pil"], ["CV2", "cv2"], ["不返回", ""]]},
        ],
        "input_mode": "single_path",
        "result_kind": "segmentation",
    },
    "depth_anything": {
        "label": "单目深度估计",
        "family": "depth",
        "params": [
            {"key": "img_type", "label": "返回图", "field": "enum", "default": "cv2", "options": [["CV2", "cv2"], ["PIL", "pil"], ["不返回", ""]]},
        ],
        "input_mode": "single_path",
        "result_kind": "depth",
    },
}

RUNTIME_TASK_ID_MAP: Dict[str, str] = {
    "det_body": "bodydetect",
    "det_body_l": "bodydetect",
    "det_coco": "cocodetect",
    "det_coco_l": "cocodetect",
    "pose_body17": "body17",
    "pose_body17_l": "body17",
    "pose_body26": "body26",
    "pose_face106": "face106",
    "pose_hand21": "hand21",
    "pose_wholebody133": "wholebody133",
}


def _frontend_task_params(task: Dict[str, Any]) -> List[Dict[str, Any]]:
    return [
        copy.deepcopy(param)
        for param in (task.get("params") or [])
        if str(param.get("key") or "").strip() != "img_type"
    ]

TASK_ID_ALIAS_MAP = {
    "classification": "cls_imagenet",
    "detection": "det_body",
    "segmentation": "segment_anything",
    "pose": "pose_body17",
    "ocr": "ocr",
    "generation": "gen_style",
    "panoptic": "drive_perception",
    "multimodal": "embedding_image",
    "depth": "depth_anything",
    "custom": "cls_imagenet",
}

LEGACY_SPEC_MODEL_MAP = {
    "classification": {"resnet18": "cls_imagenet", "resnet50": "cls_imagenet", "mobilenetv2": "cls_imagenet"},
    "detection": {
        "det_body": "det_body",
        "det_body_l": "det_body_l",
        "det_face": "det_face",
        "det_hand": "det_hand",
        "det_coco": "det_coco",
        "det_coco_l": "det_coco_l",
        "yolov5": "det_body",
        "yolov8n": "det_body",
        "fasterrcnn": "det_body",
    },
    "segmentation": {"segment_anything": "segment_anything", "deeplabv3": "segment_anything", "unet": "segment_anything"},
    "pose": {
        "pose_body": "pose_body17",
        "pose_body17": "pose_body17",
        "pose_body17_l": "pose_body17_l",
        "pose_body26": "pose_body26",
        "pose_face": "pose_face106",
        "pose_face106": "pose_face106",
        "pose_hand": "pose_hand21",
        "pose_hand21": "pose_hand21",
        "pose_wholebody": "pose_wholebody133",
        "pose_wholebody133": "pose_wholebody133",
        "hrnet": "pose_body17",
        "rtmpose": "pose_body17",
    },
    "ocr": {"ocr": "ocr", "dbnet": "ocr", "crnn": "ocr"},
    "generation": {"gen_style": "gen_style", "gen_color": "gen_color", "gpt2": "gen_style", "sd-v1-5": "gen_style"},
    "panoptic": {"drive_perception": "drive_perception", "panoptic_deeplab": "drive_perception", "yolov8p": "drive_perception"},
    "multimodal": {"embedding_image": "embedding_image", "embedding_text": "embedding_text", "embedding_audio": "embedding_audio", "clip": "embedding_image", "blip": "embedding_image"},
    "depth": {"depth_anything": "depth_anything", "midas": "depth_anything", "dpt": "depth_anything"},
}

FAMILY_KEYWORDS = {
    "detection": ("检测", "detect", "bbox"),
    "segmentation": ("分割", "mask", "segment"),
    "pose": ("关键点", "姿态", "pose"),
    "ocr": ("ocr", "文字识别"),
    "generation": ("生成", "风格", "着色", "generate"),
    "panoptic": ("全景", "驾驶", "panoptic"),
    "multimodal": ("模态", "embedding", "向量", "特征"),
    "depth": ("深度", "depth", "估算"),
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
            return
        if node_kind not in {"block", "shadow"}:
            return
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

    for index, entry in enumerate(contents):
        _validate_item(entry, f"contents[{index}]")
    normalized = toolbox if not errors else None
    return {"valid": not errors, "errors": errors, "normalized": normalized}


def _canonical_task_id(value: Any) -> str:
    text = str(value or "").strip()
    if text in TASK_REGISTRY:
        return text
    lowered = text.lower()
    for task_id in TASK_REGISTRY:
        if task_id.lower() == lowered:
            return task_id
    return ""


def normalize_task_type(value: Any) -> str:
    text = str(value or "").strip().lower()
    mapping = {
        "分类": "classification",
        "图像分类": "classification",
        "classification": "classification",
        "检测": "detection",
        "目标检测": "detection",
        "detection": "detection",
        "分割": "segmentation",
        "图像分割": "segmentation",
        "segmentation": "segmentation",
        "关键点": "pose",
        "姿态": "pose",
        "pose": "pose",
        "ocr": "ocr",
        "文字识别": "ocr",
        "生成": "generation",
        "内容生成": "generation",
        "generation": "generation",
        "全景": "panoptic",
        "全景感知": "panoptic",
        "panoptic": "panoptic",
        "多模态": "multimodal",
        "multimodal": "multimodal",
        "深度": "depth",
        "深度估计": "depth",
        "depth": "depth",
        "自定义": "custom",
        "workflow": "custom",
    }
    if text in TASK_FAMILY_META:
        return text
    task_id = _canonical_task_id(text)
    if task_id:
        return str(TASK_REGISTRY[task_id]["family"])
    return mapping.get(text, "classification")


def infer_task_from_text(text: str) -> str:
    source = str(text or "").lower()
    for family, keywords in FAMILY_KEYWORDS.items():
        if any(token in source for token in keywords):
            return family
    return "classification"


def recommended_model_for_task(task_type: str) -> str:
    family = normalize_task_type(task_type)
    candidate = TASK_ID_ALIAS_MAP.get(family, "cls_imagenet")
    if _is_runtime_task_available(candidate):
        return candidate
    return _default_frontend_task_id()


def _get_runtime_supported_tasks() -> List[str]:
    try:
        from XEdu.hub import Workflow as wf  # type: ignore

        supported = wf.support_task()
        if isinstance(supported, (list, tuple)):
            return [str(item).strip() for item in supported if str(item).strip()]
    except Exception:
        return []
    return []


def _resolve_runtime_task_id(task_id: str) -> str:
    normalized = str(task_id or "").strip()
    return RUNTIME_TASK_ID_MAP.get(normalized, normalized)


def _is_runtime_task_available(task_id: str, supported_tasks: List[str] | None = None) -> bool:
    runtime_task_id = _resolve_runtime_task_id(task_id)
    if not runtime_task_id:
        return False
    supported = supported_tasks if supported_tasks is not None else _get_runtime_supported_tasks()
    if not supported:
        return True
    return runtime_task_id in supported


def _default_frontend_task_id() -> str:
    preferred = "cls_imagenet"
    supported = _get_runtime_supported_tasks()
    if _is_runtime_task_available(preferred, supported):
        return preferred
    for task_id in TASK_REGISTRY:
        if _is_runtime_task_available(task_id, supported):
            return task_id
    return preferred


def slugify(value: str, fallback: str = "xeduhub-blockly-lab") -> str:
    text = re.sub(r"[^\w\-]+", "-", str(value or "").strip().lower()).strip("-")
    return text or fallback


def derive_title_from_request(text: str, task_type: str = "") -> str:
    cleaned = re.sub(r"^(帮我|请|做一个|创建一个|生成一个|搭一个|给我)\s*", "", str(text or "").strip())
    cleaned = cleaned[:24].strip(" ，。,.")
    if cleaned:
        return cleaned
    family = normalize_task_type(task_type)
    family_label = TASK_FAMILY_META.get(family, {}).get("label", "XEduHub")
    return f"{family_label} 积木实验"


def get_xeduhub_frontend_registry() -> Dict[str, Any]:
    families = []
    tasks = []
    supported_tasks = _get_runtime_supported_tasks()
    for family_id in TASK_FAMILY_ORDER:
        meta = TASK_FAMILY_META[family_id]
        families.append(
            {
                "id": family_id,
                "label": meta["label"],
                "colour": meta["colour"],
                "description": meta["description"],
            }
        )
    for task_id, task in TASK_REGISTRY.items():
        family_meta = TASK_FAMILY_META[task["family"]]
        runtime_task_id = _resolve_runtime_task_id(task_id)
        available = _is_runtime_task_available(task_id, supported_tasks)
        tasks.append(
            {
                "task_id": task_id,
                "runtime_task_id": runtime_task_id,
                "available": available,
                "label": task["label"],
                "family": task["family"],
                "family_label": family_meta["label"],
                "colour": family_meta["colour"],
                "description": task.get("description") or task["label"],
                "input_mode": task["input_mode"],
                "result_kind": task["result_kind"],
                "params": _frontend_task_params(task),
            }
        )
    return {
        "default_task_id": _default_frontend_task_id(),
        "supported_runtime_tasks": supported_tasks,
        "families": families,
        "tasks": tasks,
        "family_order": list(TASK_FAMILY_ORDER),
    }


def _task_ids_for_family(family: str) -> List[str]:
    supported_tasks = _get_runtime_supported_tasks()
    return [
        task_id
        for task_id, task in TASK_REGISTRY.items()
        if task["family"] == family
        and task_id not in TOOLBOX_HIDDEN_TASK_IDS
        and _is_runtime_task_available(task_id, supported_tasks)
    ]


def _build_family_category(family: str, *, visible_by_default: bool = True) -> Dict[str, Any]:
    family_meta = TASK_FAMILY_META[family]
    contents: List[Dict[str, Any]] = []
    for task_id in _task_ids_for_family(family):
        contents.append({"kind": "block", "type": f"xeduhub_run_{task_id}"})
    return {
        "kind": "category",
        "name": family_meta["label"],
        "colour": family_meta["colour"],
        "visible_by_default": visible_by_default,
        "description": family_meta["description"],
        "contents": contents,
    }


def build_xeduhub_toolbox_definition(task_type: str = "classification") -> Dict[str, Any]:
    starter_task_id = recommended_model_for_task(task_type)
    xeduhub_families = ("classification", "detection", "pose", "ocr", "generation", "segmentation", "depth")
    xeduhub_contents: List[Dict[str, Any]] = [
        {"kind": "block", "type": "xeduhub_workflow_create_var", "fields": {"TASK_ID": starter_task_id, "MODEL_VAR": "lab_flow"}},
        {"kind": "sep"},
        {"kind": "block", "type": "xeduhub_result_first_box"},
        {"kind": "block", "type": "xeduhub_bbox_center_x"},
        {"kind": "block", "type": "xeduhub_keypoint_axis", "fields": {"AXIS": "x"}},
        {"kind": "block", "type": "xeduhub_ocr_first_text"},
        {"kind": "sep"},
    ]
    for family in xeduhub_families:
        xeduhub_contents.append(_build_family_category(family, visible_by_default=True))

    image_video_contents: List[Dict[str, Any]] = [
        {"kind": "block", "type": "xeduhub_cv_open_camera", "fields": {"SOURCE": 0, "CAMERA_VAR": "camera", "WINDOW": "video"}},
        {"kind": "block", "type": "xeduhub_cv_open_video", "fields": {"CAMERA_VAR": "video", "WINDOW": "video"}},
        {"kind": "block", "type": "xeduhub_cv_show_frame", "fields": {"WINDOW": "video"}},
        {"kind": "block", "type": "xeduhub_cv_draw_boxes", "fields": {"IMAGE_VAR": "display_img"}},
        {"kind": "block", "type": "xeduhub_cv_save_image"},
        {"kind": "block", "type": "xeduhub_media_frames_to_video", "fields": {"FPS": 30}},
    ]

    communication_contents: List[Dict[str, Any]] = [
        {"kind": "block", "type": "xeduhub_http_open_stream", "fields": {"STREAM_VAR": "response"}},
        {"kind": "block", "type": "xeduhub_http_send_command", "fields": {"RESPONSE_VAR": "response", "STOP_CMD": "S", "DELAY": 0.3}},
        {"kind": "sep"},
        {"kind": "block", "type": "xeduhub_servo_setup", "fields": {"BOARD": "uno", "PIN": "D4", "SERVO_VAR": "servo"}},
        {"kind": "sep"},
        {"kind": "block", "type": "xeduhub_http_get", "fields": {"RESPONSE_VAR": "response"}},
        {"kind": "block", "type": "xeduhub_chunk_over_size"},
        {"kind": "block", "type": "xeduhub_cv_decode_chunk", "fields": {"IMAGE_VAR": "frame"}},
    ]

    contents: List[Dict[str, Any]] = [
        {
            "kind": "category",
            "name": "逻辑",
            "colour": "#4F7CFF",
            "visible_by_default": True,
            "description": "条件判断与逻辑运算，编程基础积木",
            "contents": [
                {"kind": "block", "type": "controls_if"},
                {"kind": "block", "type": "logic_compare"},
                {"kind": "block", "type": "logic_operation"},
                {"kind": "block", "type": "logic_negate"},
                {"kind": "block", "type": "logic_boolean"},
                {"kind": "block", "type": "logic_null"},
                {"kind": "block", "type": "logic_ternary"},
            ],
        },
        {
            "kind": "category",
            "name": "循环",
            "colour": "#F59B42",
            "visible_by_default": True,
            "description": "重复执行特定代码块，编程核心概念",
            "contents": [
                {"kind": "block", "type": "controls_repeat_ext", "inputs": {"TIMES": {"kind": "block", "type": "math_number", "fields": {"NUM": 10}}}},
                {"kind": "block", "type": "controls_whileUntil"},
                {"kind": "block", "type": "controls_for", "inputs": {"FROM": {"kind": "block", "type": "math_number", "fields": {"NUM": 1}}, "TO": {"kind": "block", "type": "math_number", "fields": {"NUM": 10}}, "BY": {"kind": "block", "type": "math_number", "fields": {"NUM": 1}}}},
                {"kind": "block", "type": "controls_forEach"},
            ],
        },
        {
            "kind": "category",
            "name": "数学",
            "colour": "#22C7A1",
            "visible_by_default": True,
            "description": "数学运算与随机数生成",
            "contents": [
                {"kind": "block", "type": "math_number", "fields": {"NUM": 123}},
                {"kind": "block", "type": "math_arithmetic"},
                {"kind": "block", "type": "math_single"},
                {"kind": "block", "type": "math_trig"},
                {"kind": "block", "type": "math_constant"},
                {"kind": "block", "type": "math_number_property"},
                {"kind": "block", "type": "math_round"},
                {"kind": "block", "type": "math_random_int", "inputs": {"FROM": {"kind": "block", "type": "math_number", "fields": {"NUM": 1}}, "TO": {"kind": "block", "type": "math_number", "fields": {"NUM": 100}}}},
                {"kind": "block", "type": "xeduhub_math_distance"},
                {"kind": "block", "type": "xeduhub_polyfit_quadratic", "fields": {"COEFF_VAR": "coeff"}},
                {"kind": "block", "type": "xeduhub_quadratic_eval"},
            ],
        },
        {
            "kind": "category",
            "name": "文本",
            "colour": "#8E68F8",
            "visible_by_default": True,
            "description": "文字处理与打印输出",
            "contents": [
                {"kind": "block", "type": "text"},
                {"kind": "block", "type": "text_join"},
                {"kind": "block", "type": "text_append"},
                {"kind": "block", "type": "text_length"},
                {"kind": "block", "type": "text_isEmpty"},
                {"kind": "block", "type": "text_print"},
            ],
        },
        {
            "kind": "category",
            "name": "列表",
            "colour": "#37A7F7",
            "visible_by_default": False,
            "description": "集中存储多项数据，进阶数据结构",
            "contents": [
                {"kind": "block", "type": "lists_create_with", "extraState": {"itemCount": 3}},
                {"kind": "block", "type": "lists_create_empty"},
                {"kind": "block", "type": "lists_length"},
                {"kind": "block", "type": "lists_indexOf"},
            ],
        },
        {"kind": "category", "name": "变量", "custom": "VARIABLE", "colour": "#F06F7F", "visible_by_default": True, "description": "存储和修改数据变量"},
        {
            "kind": "category",
            "name": "函数",
            "colour": "#AA6CF6",
            "visible_by_default": False,
            "description": "代码重用与逻辑封装",
            "contents": [
                {"kind": "block", "type": "procedures_defnoreturn"},
                {"kind": "block", "type": "procedures_defreturn"},
            ],
        },
        {
            "kind": "category",
            "name": "图像视频",
            "colour": "#11B59C",
            "visible_by_default": True,
            "description": "摄像头、视频、显示、绘图与保存",
            "contents": image_video_contents,
        },
        {
            "kind": "category",
            "name": "通信控制",
            "colour": "#F18A31",
            "visible_by_default": True,
            "description": "网络视频流、设备动作与控制指令",
            "contents": communication_contents,
        },
        {
            "kind": "category",
            "name": "XEduHub",
            "colour": "#4F7CFF",
            "visible_by_default": True,
            "description": "XEduHub 算法工具箱",
            "contents": xeduhub_contents,
        },
    ]
    return {
        "kind": "categoryToolbox",
        "pedagogy_level_default": "L1",
        "required_block_types": [
            "xeduhub_workflow_create_var",
            "xeduhub_cv_open_camera",
            "xeduhub_http_open_stream",
            f"xeduhub_run_{starter_task_id}",
        ],
        "contents": contents,
    }


def _escape_field(value: Any) -> str:
    return escape(str(value or ""))


def build_xeduhub_workspace_xml(title: str, task_type: str = "classification", model_name: str = "", input_path: str = "demo.jpg") -> str:
    del title
    preferred = model_name if _canonical_task_id(model_name) else task_type
    task_id = _canonical_task_id(preferred) or recommended_model_for_task(preferred)
    safe_input = _escape_field(input_path or "demo.jpg")
    return (
        '<xml xmlns="https://developers.google.com/blockly/xml">'
        f'<block type="xeduhub_set_input_resource" id="input1" x="28" y="28"><field name="INPUT">{safe_input}</field>'
        '<next>'
        f'<block type="xeduhub_run_{task_id}" id="run1">'
        '</block>'
        '</next>'
        '</block>'
        '</xml>'
    )


def build_xeduhub_execution_config(task_type: str, model_name: str, title: str) -> Dict[str, Any]:
    task_id = _canonical_task_id(model_name) or recommended_model_for_task(task_type)
    family = normalize_task_type(task_id)
    return {
        "title": title,
        "task_type": family,
        "task_id": task_id,
        "task_label": TASK_REGISTRY.get(task_id, {}).get("label", TASK_FAMILY_META.get(family, {}).get("label", "XEduHub")),
        "model_name": task_id,
        "runtime": "xeduhub",
        "supports_in_page_execution": True,
        "pedagogy_profile": {
            "level_default": "L1",
            "levels": list(PEDAGOGY_LEVELS),
            "task_bias": "preset_first",
            "result_mode": "teaching_card",
        },
        "result_display": {
            "mode": "teaching_card",
            "sections": ["conclusion", "evidence", "debug"],
        },
        "xeduhub_task_registry": get_xeduhub_frontend_registry(),
    }


def resolve_input_path(input_value: str, project_root: str = "") -> str:
    raw = str(input_value or "").strip()
    if not raw:
        return ""
    path = Path(raw)
    if path.is_absolute() or not project_root:
        return str(path)
    return str((Path(project_root) / raw).expanduser().resolve())


def _best_effort_image_to_data_url(image: Any) -> str:
    try:
        from PIL import Image  # type: ignore
        import numpy as np  # type: ignore
    except Exception:
        return ""
    try:
        if hasattr(image, "save"):
            pil_image = image
        else:
            array = np.array(image)
            if array.ndim == 3 and array.shape[2] == 3:
                pil_image = Image.fromarray(array.astype("uint8"))
            else:
                pil_image = Image.fromarray(array.squeeze().astype("uint8"))
        buf = io.BytesIO()
        pil_image.save(buf, format="PNG")
        return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode("utf-8")
    except Exception:
        return ""


def _coerce_jsonish(value: str) -> Any:
    text = str(value or "").strip()
    if not text:
        return ""
    if text[0] in "[{":
        try:
            return json.loads(text)
        except Exception:
            return text
    return text


def _coerce_param_value(param_spec: Dict[str, Any], raw_value: Any) -> Any:
    if raw_value in (None, ""):
        return None
    field_type = str(param_spec.get("field") or "text")
    if field_type == "number":
        try:
            text = str(raw_value).strip()
            return int(text) if re.fullmatch(r"-?\d+", text) else float(text)
        except Exception:
            return raw_value
    if field_type == "enum":
        return str(raw_value)
    return _coerce_jsonish(str(raw_value))


def _jsonable(value: Any) -> Any:
    try:
        import numpy as np  # type: ignore
    except Exception:
        np = None  # type: ignore

    if np is not None and isinstance(value, np.ndarray):
        return value.tolist()
    if np is not None and isinstance(value, np.generic):
        return value.item()
    if isinstance(value, dict):
        return {str(key): _jsonable(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_jsonable(item) for item in value]
    return value


def _shape_of(value: Any) -> str:
    shape = getattr(value, "shape", None)
    if shape is None:
        return ""
    try:
        return "x".join(str(int(item)) for item in shape)
    except Exception:
        return str(shape)


def _resolve_task_id_from_legacy(task_type: str, model_name: str) -> str:
    family = normalize_task_type(task_type)
    model_key = str(model_name or "").strip().lower()
    family_map = LEGACY_SPEC_MODEL_MAP.get(family, {})
    if model_key and model_key in family_map:
        return family_map[model_key]
    return TASK_ID_ALIAS_MAP.get(family, "cls_imagenet")


def _resolve_task_config(spec: Dict[str, Any]) -> Tuple[str, Dict[str, Any]]:
    explicit_task_id = _canonical_task_id(spec.get("task_id"))
    if explicit_task_id:
        return explicit_task_id, TASK_REGISTRY[explicit_task_id]
    legacy_task = str(spec.get("task") or spec.get("task_type") or "").strip()
    legacy_model = str(spec.get("model") or spec.get("model_name") or "").strip()
    resolved_task_id = _resolve_task_id_from_legacy(legacy_task, legacy_model)
    return resolved_task_id, TASK_REGISTRY[resolved_task_id]


def _is_supported_legacy_model(task_type: str, model_name: str) -> bool:
    model_key = str(model_name or "").strip()
    if not model_key:
        return True
    if _canonical_task_id(model_key):
        return True
    family = normalize_task_type(task_type)
    return model_key.lower() in LEGACY_SPEC_MODEL_MAP.get(family, {})


def _normalize_params(task_id: str, params: Dict[str, Any]) -> Dict[str, Any]:
    task = TASK_REGISTRY[task_id]
    allowed = {param["key"]: param for param in task.get("params") or []}
    normalized: Dict[str, Any] = {}
    for key, raw_value in (params or {}).items():
        if key not in allowed:
            continue
        coerced = _coerce_param_value(allowed[key], raw_value)
        if coerced in (None, ""):
            continue
        normalized[key] = coerced
    return normalized


def _normalize_input_for_task(task_id: str, input_value: Any, project_root: str = "") -> Any:
    task = TASK_REGISTRY[task_id]
    input_mode = task.get("input_mode") or "single_path"
    if input_mode == "text_or_list":
        parsed = _coerce_jsonish(str(input_value or ""))
        return parsed
    if input_mode == "path_or_list":
        parsed = _coerce_jsonish(str(input_value or ""))
        if isinstance(parsed, list):
            return [resolve_input_path(str(item), project_root) for item in parsed if str(item).strip()]
        return resolve_input_path(str(parsed), project_root)
    return resolve_input_path(str(input_value or ""), project_root)


def _input_exists(task_id: str, prepared_input: Any) -> bool:
    input_mode = TASK_REGISTRY[task_id].get("input_mode") or "single_path"
    if input_mode == "text_or_list":
        if isinstance(prepared_input, list):
            return any(str(item).strip() for item in prepared_input)
        return bool(str(prepared_input or "").strip())
    if isinstance(prepared_input, list):
        return bool(prepared_input) and all(Path(str(item)).exists() for item in prepared_input)
    return bool(str(prepared_input or "").strip()) and Path(str(prepared_input)).exists()


def _extract_key_fields(task_id: str, output: Any) -> Dict[str, Any]:
    result_kind = TASK_REGISTRY[task_id].get("result_kind")
    payload = _jsonable(output)
    if result_kind == "classification":
        if isinstance(payload, dict):
            return {"预测类别": payload.get("预测类别") or payload.get("label") or payload.get("class"), "分数": payload.get("分数") or payload.get("score")}
        if isinstance(payload, list) and payload:
            top = payload[0] if isinstance(payload[0], dict) else {}
            return {"预测类别": top.get("预测类别") or top.get("label") or top.get("class"), "分数": top.get("分数") or top.get("score")}
    if result_kind == "detection":
        if isinstance(payload, dict) and isinstance(payload.get("检测框"), list):
            return {"检测框数": len(payload.get("检测框") or [])}
        if isinstance(payload, list):
            return {"检测框数": len(payload)}
    if result_kind == "pose":
        if isinstance(payload, dict) and isinstance(payload.get("关键点坐标"), list):
            return {"关键点数": len(payload.get("关键点坐标") or [])}
        if isinstance(payload, list):
            return {"关键点数": len(payload)}
    if result_kind == "ocr":
        if isinstance(payload, dict):
            texts = payload.get("文本")
            if isinstance(texts, list):
                return {"文本块数": len(texts), "文本预览": str(texts[0])[:60] if texts else ""}
        if isinstance(payload, list):
            return {"文本块数": len(payload), "文本预览": str(payload[0][0])[:60] if payload and isinstance(payload[0], (list, tuple)) else ""}
    if result_kind == "segmentation":
        if isinstance(payload, list):
            return {"掩码数": len(payload)}
        if isinstance(payload, dict):
            masks = payload.get("掩码")
            if isinstance(masks, list):
                return {"掩码数": len(masks)}
    if result_kind == "multimodal":
        return {"向量形状": _shape_of(output)}
    if result_kind == "panoptic":
        if isinstance(payload, dict) and isinstance(payload.get("检测框"), list):
            return {"检测框数": len(payload.get("检测框") or [])}
        if isinstance(payload, list):
            return {"输出项数": len(payload)}
    if result_kind == "depth":
        return {"深度图尺寸": _shape_of(output)}
    return {}


def _build_result_summary(task_id: str, output: Any) -> Dict[str, Any]:
    task = TASK_REGISTRY[task_id]
    result_kind = task.get("result_kind")
    key_fields = _extract_key_fields(task_id, output)
    metrics = [{"label": str(key), "value": value} for key, value in key_fields.items() if value not in ("", None)]
    headline = f"{task['label']}完成"
    hints = ["可在调试区查看完整输出。"]
    if result_kind == "classification" and key_fields.get("预测类别"):
        headline = f"识别结果：{key_fields['预测类别']}"
        hints = ["可更换图片后比较分类差异。"]
    elif result_kind == "detection" and key_fields.get("检测框数") is not None:
        headline = f"检测到 {key_fields['检测框数']} 个目标"
        hints = ["证据区可查看标注结果图。"]
    elif result_kind == "pose" and key_fields.get("关键点数") is not None:
        headline = f"识别到 {key_fields['关键点数']} 个关键点"
        hints = ["关键点任务建议配合检测框一起使用。"]
    elif result_kind == "ocr":
        headline = f"OCR 识别到 {key_fields.get('文本块数', 0)} 个文本块"
        hints = ["证据区可查看带文字标注的结果图。"]
    elif result_kind == "multimodal":
        headline = "向量提取完成"
        hints = ["可结合相似度计算继续做检索或分类。"]
    elif result_kind == "segmentation":
        headline = f"生成 {key_fields.get('掩码数', 0)} 个分割掩码"
        hints = ["提示点或框会影响分割质量。"]
    elif result_kind == "depth":
        headline = "深度估计完成"
        hints = ["结果为相对深度，不是绝对距离。"]
    elif result_kind == "generation":
        headline = f"{task['label']}完成"
        hints = ["证据区可查看生成后的图像。"]
    elif result_kind == "panoptic":
        headline = "驾驶感知完成"
        hints = ["结果包含检测框、车道线和可行驶区域。"]
    return {"headline": headline, "metrics": metrics, "hints": hints}


def _build_runtime_error(
    *,
    code: str,
    message: str,
    headline: str,
    task_id: str = "",
    hints: List[str] | None = None,
    metrics: List[Dict[str, Any]] | None = None,
    result: Any = None,
    artifacts: Dict[str, Any] | None = None,
) -> Dict[str, Any]:
    task = TASK_REGISTRY.get(task_id or "", {})
    return {
        "success": False,
        "result_type": "error",
        "error_code": code,
        "message": message,
        "result": result,
        "artifacts": artifacts or {},
        "result_summary": {
            "headline": headline,
            "metrics": metrics or [],
            "hints": hints or [],
        },
        "result_artifacts": {"preview_image": "", "key_fields": {}},
        "result_error": {
            "code": code,
            "task_id": task_id,
            "task_label": task.get("label", ""),
        },
    }


def execute_xeduhub_runtime(payload: Dict[str, Any]) -> Dict[str, Any]:
    code = str(payload.get("code") or "").strip()
    spec = payload.get("spec") if isinstance(payload.get("spec"), dict) else {}
    explicit_task_id = str(spec.get("task_id") or "").strip()
    if explicit_task_id and not _canonical_task_id(explicit_task_id):
        return _build_runtime_error(
            code="invalid_task_id",
            message=f"未知 task_id: {explicit_task_id}",
            headline="任务不可用",
            hints=["请从当前 Blockly 语义积木重新选择一个预置任务。"],
            metrics=[{"label": "task_id", "value": explicit_task_id}],
            artifacts={"generated_python": code},
        )
    legacy_task = str(spec.get("task") or spec.get("task_type") or "").strip()
    legacy_model = str(spec.get("model") or spec.get("model_name") or "").strip()
    if not explicit_task_id and legacy_model and not _is_supported_legacy_model(legacy_task, legacy_model):
        return _build_runtime_error(
            code="model_unavailable",
            message=f"当前任务不支持模型: {legacy_model}",
            headline="模型不可用",
            hints=["请改用支持的预置任务模型，或直接使用新的 task_id 规范。"],
            metrics=[{"label": "任务", "value": normalize_task_type(legacy_task)}, {"label": "模型", "value": legacy_model}],
            result={"task": legacy_task, "model": legacy_model},
            artifacts={"generated_python": code},
        )
    task_id, task = _resolve_task_config(spec)
    runtime_task_id = _resolve_runtime_task_id(task_id)
    supported_runtime_tasks = _get_runtime_supported_tasks()
    raw_params = spec.get("params") if isinstance(spec.get("params"), dict) else {}
    compat_input = spec.get("input") if spec.get("input") is not None else spec.get("input_path")
    project_root = str(payload.get("project_root") or spec.get("project_root") or "").strip()
    prepared_input = _normalize_input_for_task(task_id, compat_input, project_root)
    params = _normalize_params(task_id, raw_params)

    if not spec.get("task_id") and any(spec.get(key) for key in ("task", "task_type", "model", "model_name")):
        compat_params = {}
        legacy_model = str(spec.get("model") or spec.get("model_name") or "").strip()
        if legacy_model and legacy_model not in TASK_REGISTRY:
            if task["family"] == "detection" and spec.get("task") in ("detection", "目标检测"):
                compat_params["target_class"] = ""
        params = {**compat_params, **params}

    if not task_id:
        return _build_runtime_error(
            code="missing_task",
            message="缺少任务类型",
            headline="缺少任务类型",
            hints=["请先放入一个 XEduHub 任务积木。"],
            artifacts={"generated_python": code},
        )
    if not _is_runtime_task_available(task_id, supported_runtime_tasks):
        return _build_runtime_error(
            code="runtime_task_unavailable",
            message=f"当前本地 XEdu 运行环境暂不支持任务: {task_id}",
            headline="本地运行环境不支持该任务",
            task_id=task_id,
            metrics=[
                {"label": "task_id", "value": task_id},
                {"label": "runtime_task_id", "value": runtime_task_id},
            ],
            hints=["请切换到当前环境支持的任务，或安装对应 XEdu 模型/版本后再试。"],
            artifacts={"generated_python": code},
        )
    if prepared_input in ("", None, []):
        return _build_runtime_error(
            code="missing_input",
            message="请先填写输入资源",
            headline="输入缺失",
            task_id=task_id,
            hints=["先使用“设置输入资源”或“设置输入列表”积木提供输入。"],
            artifacts={"generated_python": code},
        )
    if not _input_exists(task_id, prepared_input):
        metrics = [{"label": "输入", "value": _jsonable(prepared_input)}]
        hint = "请检查路径是否正确。" if task.get("input_mode") != "text_or_list" else "请检查文本输入是否为空。"
        return _build_runtime_error(
            code="input_not_found",
            message=f"输入资源不存在或无效: {prepared_input}",
            headline="输入无效",
            task_id=task_id,
            metrics=metrics,
            hints=[hint],
            artifacts={"generated_python": code},
        )

    try:
        from XEdu.hub import Workflow as wf  # type: ignore
    except Exception:
        return _build_runtime_error(
            code="missing_dependency",
            message="当前环境未安装 XEduHub，无法在 Blockly 页内执行。请先安装 XEdu 后再重试。",
            headline="运行时缺少 XEduHub 依赖",
            task_id=task_id,
            metrics=[{"label": "任务", "value": task["label"]}],
            hints=["先在平台 Python 环境安装 XEdu/XEduHub，再重新运行。"],
            result={"task_id": task_id, "input": _jsonable(prepared_input)},
            artifacts={"generated_python": code},
        )

    try:
        workflow = wf(task=runtime_task_id)
        result = workflow.inference(data=prepared_input, **params)
        image_data = ""
        normalized_result = result
        if isinstance(result, (list, tuple)) and len(result) == 2:
            normalized_result = result[0]
            image_data = _best_effort_image_to_data_url(result[1])
        elif isinstance(result, dict):
            for key in ("image", "result_image", "visualization"):
                if key in result:
                    image_data = _best_effort_image_to_data_url(result[key])
                    break
        jsonable_output = _jsonable(normalized_result)
        return {
            "success": True,
            "result_type": task.get("result_kind") or "vision",
            "message": f"已完成 {task['label']}",
            "result": {
                "task_id": task_id,
                "runtime_task_id": runtime_task_id,
                "task_label": task["label"],
                "task_family": task["family"],
                "input": _jsonable(prepared_input),
                "params": _jsonable(params),
                "output": jsonable_output,
            },
            "artifacts": {
                "generated_python": code,
                "image_data": image_data,
            },
            "result_summary": _build_result_summary(task_id, normalized_result),
            "result_artifacts": {
                "preview_image": image_data,
                "key_fields": _extract_key_fields(task_id, normalized_result),
            },
        }
    except Exception as exc:
        if isinstance(exc, (ModuleNotFoundError, ImportError)):
            return _build_runtime_error(
                code="missing_dependency",
                message=f"XEduHub 运行依赖缺失: {exc}",
                headline="运行时缺少 XEduHub 依赖",
                task_id=task_id,
                metrics=[{"label": "任务", "value": task["label"]}],
                hints=["请先检查平台 Python 环境中的 XEdu/XEduHub 及其推理依赖。"],
                result={"task_id": task_id, "traceback": traceback.format_exc(limit=4)},
                artifacts={"generated_python": code},
            )
        error_text = str(exc)
        if "NoSuchFile" in error_text or "File doesn't exist" in error_text or "checkpoints/" in error_text:
            return _build_runtime_error(
                code="model_artifact_missing",
                message=f"XEdu 模型文件缺失，无法执行任务: {task_id}",
                headline="模型文件缺失",
                task_id=task_id,
                metrics=[
                    {"label": "任务", "value": task["label"]},
                    {"label": "runtime_task_id", "value": runtime_task_id},
                ],
                hints=["请先准备对应 checkpoint 模型文件，或确认当前环境支持自动下载。"],
                result={"task_id": task_id, "runtime_task_id": runtime_task_id, "traceback": traceback.format_exc(limit=4)},
                artifacts={"generated_python": code},
            )
        return _build_runtime_error(
            code="runtime_exception",
            message=f"XEduHub 推理失败: {exc}",
            headline="推理执行失败",
            task_id=task_id,
            metrics=[{"label": "任务", "value": task["label"]}],
            hints=["请检查输入、参数以及当前 Python 环境依赖。"],
            result={"task_id": task_id, "traceback": traceback.format_exc(limit=4)},
            artifacts={"generated_python": code},
        )
