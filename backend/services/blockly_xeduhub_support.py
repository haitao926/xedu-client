#!/usr/bin/env python3
# -*- coding: utf-8 -*-

from __future__ import annotations

import base64
import copy
import io
import inspect
import json
import os
import subprocess
import queue
import re
import threading
import time
import traceback
from html import escape
from pathlib import Path
from typing import Any, Dict, Iterable, List, Tuple
from urllib.parse import unquote, urlparse

from runtime.sample_assets import (
    BLOCKLY_SMOKE_IMAGE,
    BLOCKLY_SMOKE_IMAGE_ALIASES,
    ensure_blockly_smoke_image,
    repo_path,
    resolve_checkpoint_file,
)

PEDAGOGY_LEVELS = ("L1", "L2", "L3")
REPO_ROOT = Path(__file__).resolve().parents[2]
BLOCKLY_COLOR_CONTRACT_PATH = REPO_ROOT / "config" / "blockly-colors.json"
DEFAULT_BLOCKLY_SAMPLE_IMAGE = BLOCKLY_SMOKE_IMAGE
DEFAULT_BLOCKLY_SAMPLE_ALIASES = set(BLOCKLY_SMOKE_IMAGE_ALIASES)
_RUNTIME_SUPPORTED_TASKS_CACHE: Dict[str, Any] = {
    "value": None,
    "expires_at": 0.0,
}
FALLBACK_SUPPORTED_TASK_IDS = {
    "det_body",
    "cls_imagenet",
    "ocr",
    "gen_style",
    "gen_color",
    "segment_anything",
    "depth_anything",
    "drive_perception",
    "embedding_image",
    "embedding_text",
    "embedding_audio",
    "det_face",
    "det_hand",
    "det_coco_l",
    "pose_wholebody133",
}


def _force_noninteractive_matplotlib_backend() -> None:
    os.environ["MPLBACKEND"] = "Agg"
    try:
        import matplotlib  # type: ignore

        current_backend = str(matplotlib.get_backend() or "").lower()
        if current_backend != "agg":
            matplotlib.use("Agg", force=True)
    except Exception:
        return

def _bundled_python_executables() -> List[Path]:
    candidates = [
        REPO_ROOT / "python_env" / "bin" / "python3",
        REPO_ROOT / "python_env" / "bin" / "python",
        REPO_ROOT / "python_env" / "Scripts" / "python.exe",
    ]
    return [candidate for candidate in candidates if candidate.exists()]

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

def _load_blockly_color_contract() -> Dict[str, Any]:
    with BLOCKLY_COLOR_CONTRACT_PATH.open("r", encoding="utf-8") as handle:
        payload = json.load(handle)
    if not isinstance(payload, dict):
        raise ValueError("Blockly color contract must be a JSON object")
    return payload


BLOCKLY_COLOR_CONTRACT = _load_blockly_color_contract()
BLOCKLY_BRAND_META = copy.deepcopy(BLOCKLY_COLOR_CONTRACT.get("brand", {}))
TASK_FAMILY_META = copy.deepcopy(BLOCKLY_COLOR_CONTRACT.get("taskFamilies", {}))
TASK_FAMILY_ORDER = list(BLOCKLY_COLOR_CONTRACT.get("taskFamilyOrder", []))
CATEGORY_COLOR_PALETTE = copy.deepcopy(BLOCKLY_COLOR_CONTRACT.get("categoryPalette", {}))
TASK_FIRST_CATEGORY_META = copy.deepcopy(BLOCKLY_COLOR_CONTRACT.get("taskFirstCategories", {}))


def _category_colour(name: str, fallback: str | None = None) -> str:
    default_colour = fallback or str(BLOCKLY_BRAND_META.get("primary") or "#5f6792")
    return str(CATEGORY_COLOR_PALETTE.get(name, default_colour))

TOOLBOX_HIDDEN_TASK_IDS = {
    "det_body_l",
    "pose_body17_l",
    "pose_body26",
}

HIDDEN_TASK_FALLBACKS: Dict[str, str] = {
    "det_body_l": "det_body",
    "pose_body17_l": "pose_body17",
    "pose_body26": "pose_body17",
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
    "bodydetect": "det_body",
    "cocodetect": "det_coco",
    "body17": "pose_body17",
    "body26": "pose_body26",
    "face106": "pose_face106",
    "hand21": "pose_hand21",
    "wholebody133": "pose_wholebody133",
    "det_body": "det_body",
    "det_body_l": "det_body_l",
    "det_coco": "det_coco",
    "det_coco_l": "det_coco_l",
    "pose_body17": "pose_body17",
    "pose_body17_l": "pose_body17_l",
    "pose_body26": "pose_body26",
    "pose_face106": "pose_face106",
    "pose_hand21": "pose_hand21",
    "pose_wholebody133": "pose_wholebody133",
}

SMOKE_CHECKPOINT_MAP: Dict[str, str] = {
    "det_body": "bodydetect.onnx",
    "det_body_l": "bodydetect.onnx",
    "det_coco": "cocodetect.onnx",
    "det_coco_l": "cocodetect.onnx",
    "pose_body17": "body17.onnx",
    "pose_body17_l": "body17.onnx",
    "pose_body26": "body26.onnx",
    "pose_face106": "face106.onnx",
    "pose_hand21": "hand21.onnx",
    "pose_wholebody133": "pose_wholebody133.onnx",
    "bodydetect": "bodydetect.onnx",
    "cocodetect": "cocodetect.onnx",
    "body17": "body17.onnx",
    "body26": "body26.onnx",
    "wholebody133": "pose_wholebody133.onnx",
    "face106": "face106.onnx",
    "hand21": "hand21.onnx",
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
        return HIDDEN_TASK_FALLBACKS.get(text, text)
    lowered = text.lower()
    for task_id in TASK_REGISTRY:
        if task_id.lower() == lowered:
            return HIDDEN_TASK_FALLBACKS.get(task_id, task_id)
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


def recommended_model_for_task(task_type: str, supported_tasks: List[str] | None = None) -> str:
    family = normalize_task_type(task_type)
    candidate = TASK_ID_ALIAS_MAP.get(family, "cls_imagenet")
    if _is_runtime_task_available(candidate, supported_tasks):
        return candidate
    return _default_frontend_task_id(supported_tasks)


def _get_runtime_supported_tasks() -> List[str]:
    now = time.monotonic()
    cached = _RUNTIME_SUPPORTED_TASKS_CACHE.get("value")
    expires_at = float(_RUNTIME_SUPPORTED_TASKS_CACHE.get("expires_at") or 0)
    if cached is not None and now < expires_at:
        return _normalize_supported_runtime_tasks(list(cached))

    try:
        timeout = max(0.05, float(os.environ.get("XEDU_RUNTIME_SUPPORT_TIMEOUT", "1.5") or "1.5"))
    except ValueError:
        timeout = 1.5
    try:
        ttl = max(1.0, float(os.environ.get("XEDU_RUNTIME_SUPPORT_TTL", "300") or "300"))
    except ValueError:
        ttl = 300.0

    result_queue: "queue.Queue[List[str]]" = queue.Queue(maxsize=1)

    def probe() -> None:
        try:
            executables = _bundled_python_executables()
            if not executables:
                result_queue.put([])
                return
            probe_code = (
                "import json\n"
                "from XEdu.hub import Workflow as wf\n"
                "print(json.dumps(wf.support_task(), ensure_ascii=False))\n"
            )
            for executable in executables:
                try:
                    completed = subprocess.run(
                        [str(executable), "-c", probe_code],
                        capture_output=True,
                        text=True,
                        timeout=timeout,
                        cwd=str(REPO_ROOT),
                    )
                except Exception:
                    continue
                if completed.returncode != 0:
                    continue
                lines = [line.strip() for line in str(completed.stdout or "").splitlines() if line.strip()]
                if not lines:
                    continue
                try:
                    supported = json.loads(lines[-1])
                except Exception:
                    continue
                if isinstance(supported, (list, tuple)):
                    normalized: List[str] = []
                    for item in supported:
                        text = str(item).strip()
                        if not text:
                            continue
                        runtime_task_id = _resolve_runtime_task_id(text)
                        normalized.append(runtime_task_id or text)
                    result_queue.put(list(dict.fromkeys(normalized)))
                    return
            result_queue.put([])
        except Exception:
            result_queue.put([])

    thread = threading.Thread(target=probe, name="xeduhub-runtime-support-probe", daemon=True)
    thread.start()
    try:
        resolved = result_queue.get(timeout=timeout)
    except queue.Empty:
        resolved = list(cached or [])

    _RUNTIME_SUPPORTED_TASKS_CACHE["value"] = _normalize_supported_runtime_tasks(list(resolved))
    _RUNTIME_SUPPORTED_TASKS_CACHE["expires_at"] = time.monotonic() + ttl
    return list(_RUNTIME_SUPPORTED_TASKS_CACHE["value"])


def get_nonblocking_supported_tasks_snapshot() -> List[str]:
    now = time.monotonic()
    cached = _RUNTIME_SUPPORTED_TASKS_CACHE.get("value")
    expires_at = float(_RUNTIME_SUPPORTED_TASKS_CACHE.get("expires_at") or 0)
    if cached is not None and now < expires_at:
        return _normalize_supported_runtime_tasks(list(cached))

    runtime_ids: List[str] = []
    for task_id in TASK_REGISTRY:
        runtime_task_id = _resolve_runtime_task_id(task_id)
        if runtime_task_id and _resolve_smoke_checkpoint(runtime_task_id):
            runtime_ids.append(runtime_task_id)
    return list(dict.fromkeys(runtime_ids))


def _resolve_runtime_task_id(task_id: str) -> str:
    normalized = str(task_id or "").strip()
    return RUNTIME_TASK_ID_MAP.get(normalized, normalized)


def _normalize_supported_runtime_tasks(supported_tasks: List[str] | None) -> List[str]:
    normalized: List[str] = []
    for item in supported_tasks or []:
        text = str(item or "").strip()
        if not text:
            continue
        normalized.append(_resolve_runtime_task_id(text) or text)
    return list(dict.fromkeys(normalized))


def _resolve_smoke_checkpoint(runtime_task_id: str) -> str:
    checkpoint_name = SMOKE_CHECKPOINT_MAP.get(_resolve_runtime_task_id(runtime_task_id))
    if not checkpoint_name:
        return ""
    checkpoint_path = resolve_checkpoint_file(checkpoint_name)
    return str(checkpoint_path) if checkpoint_path else ""


def _workflow_init_kwargs(runtime_task_id: str) -> Dict[str, str]:
    checkpoint_path = _resolve_smoke_checkpoint(runtime_task_id)
    return {"checkpoint": checkpoint_path} if checkpoint_path else {}


def _is_runtime_task_available(task_id: str, supported_tasks: List[str] | None = None) -> bool:
    runtime_task_id = _resolve_runtime_task_id(task_id)
    if not runtime_task_id:
        return False
    supported = _normalize_supported_runtime_tasks(supported_tasks if supported_tasks is not None else _get_runtime_supported_tasks())
    return runtime_task_id in supported


def _is_fallback_task_available(task_id: str) -> bool:
    normalized_task_id = str(task_id or "").strip()
    if normalized_task_id == "det_body":
        return _bodydetect_fallback_enabled()
    return normalized_task_id in FALLBACK_SUPPORTED_TASK_IDS


def _task_support_metadata(task_id: str, supported_tasks: List[str] | None = None) -> Dict[str, Any]:
    runtime_task_id = _resolve_runtime_task_id(task_id)
    supported = _normalize_supported_runtime_tasks(supported_tasks if supported_tasks is not None else _get_runtime_supported_tasks())
    available = bool(runtime_task_id) and runtime_task_id in supported
    if available:
        return {
            "available": True,
            "support_reason": "当前本地环境支持该任务。",
            "support_source": "runtime",
            "recommended_action": "",
        }
    if _is_fallback_task_available(task_id):
        return {
            "available": True,
            "support_reason": "当前任务将以兼容演示模式运行，可用于验证 Blockly 流程。",
            "support_source": "fallback",
            "recommended_action": "如需真实推理效果，请补齐对应模型/版本后再试。",
        }
    if runtime_task_id and _resolve_smoke_checkpoint(runtime_task_id):
        return {
            "available": False,
            "support_reason": "本地存在样例模型资源，但当前 XEdu 运行环境未声明支持该任务。",
            "support_source": "checkpoint",
            "recommended_action": "请安装或切换到支持该任务的 XEdu 版本后再试。",
        }
    return {
        "available": False,
        "support_reason": "当前本地 XEdu 运行环境不支持该任务。",
        "support_source": "unknown",
        "recommended_action": "需安装对应模型/版本后再试。",
    }


def _is_default_visible_task(task_id: str, task: Dict[str, Any], supported_tasks: List[str] | None = None) -> bool:
    if task_id in TOOLBOX_HIDDEN_TASK_IDS:
        return False
    if not _quick_block_enabled(task_id, task):
        return False
    return _is_runtime_task_available(task_id, supported_tasks)


def _default_frontend_task_id(supported_tasks: List[str] | None = None) -> str:
    preferred = "det_body"
    supported = _normalize_supported_runtime_tasks(_get_runtime_supported_tasks() if supported_tasks is None else supported_tasks)
    if preferred in TASK_REGISTRY and _is_default_visible_task(preferred, TASK_REGISTRY[preferred], supported):
        return preferred
    for task_id, task in TASK_REGISTRY.items():
        if _is_default_visible_task(task_id, task, supported):
            return task_id
    for task_id in TASK_REGISTRY:
        if _is_runtime_task_available(task_id, supported):
            return task_id
    for task_id, task in TASK_REGISTRY.items():
        if _quick_block_enabled(task_id, task):
            return task_id
    if preferred in TASK_REGISTRY:
        return preferred
    for task_id in TASK_REGISTRY:
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


def get_xeduhub_frontend_registry(supported_tasks: List[str] | None = None) -> Dict[str, Any]:
    families = []
    tasks = []
    resolved_supported_tasks = _normalize_supported_runtime_tasks(
        _get_runtime_supported_tasks() if supported_tasks is None else supported_tasks
    )
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
        support_meta = _task_support_metadata(task_id, resolved_supported_tasks)
        tasks.append(
            {
                "task_id": task_id,
                "runtime_task_id": runtime_task_id,
                "available": support_meta["available"],
                "label": task["label"],
                "family": task["family"],
                "family_label": family_meta["label"],
                "colour": family_meta["colour"],
                "description": task.get("description") or task["label"],
                "support_reason": support_meta["support_reason"],
                "support_source": support_meta["support_source"],
                "recommended_action": support_meta["recommended_action"],
                "input_mode": task["input_mode"],
                "result_kind": task["result_kind"],
                "result_shape": _result_shape_for_task(task),
                "quick_block_enabled": _quick_block_enabled(task_id, task),
                "core_api_enabled": True,
                "params": _frontend_task_params(task),
            }
        )
    return {
        "default_task_id": _default_frontend_task_id(resolved_supported_tasks),
        "supported_runtime_tasks": resolved_supported_tasks,
        "families": families,
        "tasks": tasks,
        "family_order": list(TASK_FAMILY_ORDER),
    }


def _result_shape_for_task(task: Dict[str, Any]) -> str:
    result_kind = str(task.get("result_kind") or "").strip()
    if result_kind in {"generation", "depth"}:
        return "image"
    return result_kind or "unknown"


def _quick_block_enabled(task_id: str, task: Dict[str, Any]) -> bool:
    family = str(task.get("family") or "").strip()
    if task_id in TOOLBOX_HIDDEN_TASK_IDS:
        return False
    return family in {
        "classification",
        "detection",
        "pose",
        "ocr",
        "generation",
        "segmentation",
        "depth",
    }


def _task_ids_for_family(family: str, *, supported_tasks: List[str] | None = None, default_only: bool = False) -> List[str]:
    return [
        task_id
        for task_id, task in TASK_REGISTRY.items()
        if task["family"] == family
        and (
            _is_default_visible_task(task_id, task, supported_tasks)
            if default_only
            else task_id not in TOOLBOX_HIDDEN_TASK_IDS
        )
    ]


def _build_family_category(
    family: str,
    *,
    visible_by_default: bool = True,
    supported_tasks: List[str] | None = None,
    default_only: bool = False,
) -> Dict[str, Any] | None:
    family_meta = TASK_FAMILY_META[family]
    contents: List[Dict[str, Any]] = []
    for task_id in _task_ids_for_family(family, supported_tasks=supported_tasks, default_only=default_only):
        contents.append({"kind": "block", "type": f"xeduhub_run_{task_id}"})
    if not contents:
        return None
    return {
        "kind": "category",
        "name": family_meta["label"],
        "colour": family_meta["colour"],
        "visible_by_default": visible_by_default,
        "description": family_meta["description"],
        "contents": contents,
    }


def build_xeduhub_toolbox_definition(
    task_type: str = "classification",
    *,
    supported_tasks: List[str] | None = None,
    starter_task_id: str = "",
) -> Dict[str, Any]:
    resolved_supported_tasks = _get_runtime_supported_tasks() if supported_tasks is None else supported_tasks
    starter_task_id = starter_task_id or recommended_model_for_task(task_type, resolved_supported_tasks)
    quick_task_families = ("classification", "detection", "pose", "ocr", "generation", "segmentation", "depth")

    xedu_contents: List[Dict[str, Any]] = [
        {
            "kind": "category",
            "name": "AI流程",
            "colour": _category_colour("AI流程"),
            "visible_by_default": True,
            "description": "只保留初始化任务、模型推理、结果显示三个核心步骤。",
            "contents": [
                {"kind": "block", "type": "xeduhub_workflow_create_var", "fields": {"TASK_ID": starter_task_id, "MODEL_VAR": "lab_flow"}},
                {"kind": "block", "type": "xeduhub_workflow_infer_var", "fields": {"MODEL_VAR": "lab_flow", "RESULT_VAR": "lab_result"}},
                {"kind": "block", "type": "xeduhub_workflow_infer_pair", "fields": {"MODEL_VAR": "lab_flow", "RESULT_VAR": "lab_result", "IMAGE_VAR": "display_img"}},
                {"kind": "block", "type": "xeduhub_show_result_card", "fields": {"TITLE": "运行结果"}, "inputs": {"RESULT": {"kind": "block", "type": "variables_get", "fields": {"VAR": "lab_result"}}}},
            ],
        },
    ]
    for family in quick_task_families:
        category = _build_family_category(
            family,
            visible_by_default=True,
            supported_tasks=resolved_supported_tasks,
            default_only=False,
        )
        if category:
            xedu_contents.append(category)

    image_video_contents: List[Dict[str, Any]] = [
        {"kind": "block", "type": "xeduhub_load_image_to_var", "fields": {"INPUT": DEFAULT_BLOCKLY_SAMPLE_IMAGE, "IMAGE_VAR": "lab_input"}},
        {"kind": "block", "type": "xeduhub_cv_open_camera", "fields": {"SOURCE": 0, "CAMERA_VAR": "camera", "WINDOW": "video"}},
        {"kind": "block", "type": "xeduhub_cv_loop_frames", "fields": {"CAMERA_VAR": "camera", "FRAME_VAR": "frame", "QUIT_KEY": "q", "DELAY": 1}},
        {"kind": "block", "type": "xeduhub_cv_show_frame", "fields": {"WINDOW": "video"}},
        {"kind": "block", "type": "xeduhub_cv_open_video", "fields": {"CAMERA_VAR": "video", "WINDOW": "video"}},
        {"kind": "block", "type": "xeduhub_show_result_image", "inputs": {"IMAGE": {"kind": "block", "type": "variables_get", "fields": {"VAR": "display_img"}}}},
        {"kind": "block", "type": "xeduhub_cv_save_image"},
        {"kind": "block", "type": "xeduhub_cv_resize_image"},
        {"kind": "block", "type": "xeduhub_cv_crop_image"},
        {"kind": "block", "type": "xeduhub_cv_cvt_color"},
        {"kind": "block", "type": "xeduhub_cv_put_text"},
    ]

    communication_contents: List[Dict[str, Any]] = [
        {"kind": "block", "type": "xeduhub_http_get", "fields": {"RESPONSE_VAR": "response"}},
        {"kind": "block", "type": "xeduhub_http_open_stream", "fields": {"STREAM_VAR": "response"}},
        {"kind": "block", "type": "xeduhub_http_loop_stream_frames", "fields": {"STREAM_VAR": "response", "FRAME_VAR": "frame", "CHUNK_SIZE": 16384, "MIN_SIZE": 100}},
        {"kind": "block", "type": "xeduhub_http_iter_chunks", "fields": {"STREAM_VAR": "response", "CHUNK_VAR": "chunk", "CHUNK_SIZE": 16384}},
        {"kind": "block", "type": "xeduhub_chunk_over_size"},
        {"kind": "block", "type": "xeduhub_decode_chunk_image"},
        {"kind": "block", "type": "xeduhub_cv_decode_chunk", "fields": {"IMAGE_VAR": "frame"}},
        {"kind": "block", "type": "xeduhub_http_send_command", "fields": {"RESPONSE_VAR": "response", "STOP_CMD": "S", "DELAY": 0.3}},
        {"kind": "block", "type": "xeduhub_servo_setup", "fields": {"BOARD": "uno", "PIN": "D4", "SERVO_VAR": "servo"}},
        {"kind": "block", "type": "xeduhub_servo_write_angle", "fields": {"SERVO_VAR": "servo"}},
    ]

    debug_extension_contents: List[Dict[str, Any]] = [
        {"kind": "block", "type": "xeduhub_debug_print", "inputs": {"VALUE": {"kind": "block", "type": "variables_get", "fields": {"VAR": "lab_result"}}}},
        {"kind": "block", "type": "xeduhub_catch_error", "fields": {"ERROR_VAR": "lab_error"}},
        {"kind": "block", "type": "xeduhub_run_and_record", "inputs": {"NOTE": {"kind": "block", "type": "text", "fields": {"TEXT": "本次实验结论"}}}},
    ]
    experimental_task_contents: List[Dict[str, Any]] = []
    for task_id, task in TASK_REGISTRY.items():
        if task["family"] in quick_task_families and _quick_block_enabled(task_id, task):
            continue
        if task_id in TOOLBOX_HIDDEN_TASK_IDS or not _quick_block_enabled(task_id, task):
            experimental_task_contents.append({"kind": "block", "type": f"xeduhub_run_{task_id}"})
            continue

    basic_programming_contents: List[Dict[str, Any]] = [
        {
            "kind": "category",
            "name": "逻辑",
            "colour": _category_colour("逻辑"),
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
            "colour": _category_colour("循环"),
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
            "colour": _category_colour("数学"),
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
            ],
        },
        {
            "kind": "category",
            "name": "文本",
            "colour": _category_colour("文本"),
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
            "colour": _category_colour("列表"),
            "visible_by_default": False,
            "description": "集中存储多项数据，进阶数据结构",
            "contents": [
                {"kind": "block", "type": "lists_create_with", "extraState": {"itemCount": 3}},
                {"kind": "block", "type": "lists_create_empty"},
                {"kind": "block", "type": "lists_length"},
                {"kind": "block", "type": "lists_indexOf"},
            ],
        },
        {"kind": "category", "name": "变量", "custom": "VARIABLE", "colour": _category_colour("变量"), "visible_by_default": True, "description": "存储和修改数据变量"},
        {
            "kind": "category",
            "name": "函数",
            "colour": _category_colour("函数"),
            "visible_by_default": False,
            "description": "代码重用与逻辑封装",
            "contents": [
                {"kind": "block", "type": "procedures_defnoreturn"},
                {"kind": "block", "type": "procedures_defreturn"},
            ],
        },
    ]

    contents: List[Dict[str, Any]] = [
        {
            "kind": "category",
            "name": "基础编程",
            "colour": TASK_FIRST_CATEGORY_META["基础编程"]["colour"],
            "visible_by_default": True,
            "description": TASK_FIRST_CATEGORY_META["基础编程"]["description"],
            "contents": basic_programming_contents,
        },
        {
            "kind": "category",
            "name": "XEdu",
            "colour": TASK_FIRST_CATEGORY_META["XEdu"]["colour"],
            "visible_by_default": True,
            "description": TASK_FIRST_CATEGORY_META["XEdu"]["description"],
            "contents": xedu_contents,
        },
        {
            "kind": "category",
            "name": "媒体与设备",
            "colour": TASK_FIRST_CATEGORY_META["媒体与设备"]["colour"],
            "visible_by_default": True,
            "description": TASK_FIRST_CATEGORY_META["媒体与设备"]["description"],
            "contents": [
                {
                    "kind": "category",
                    "name": "图像与视频",
                    "colour": _category_colour("图像与视频"),
                    "visible_by_default": True,
                    "description": "读取图片、OpenCV 图像处理、摄像头、视频、显示、绘图与保存",
                    "contents": image_video_contents,
                },
                {
                    "kind": "category",
                    "name": "通信控制",
                    "colour": _category_colour("通信控制"),
                    "visible_by_default": True,
                    "description": "网络视频流、设备动作与控制指令",
                    "contents": communication_contents,
                },
            ],
        },
        {
            "kind": "category",
            "name": "调试与扩展",
            "colour": TASK_FIRST_CATEGORY_META["调试与扩展"]["colour"],
            "visible_by_default": False,
            "description": TASK_FIRST_CATEGORY_META["调试与扩展"]["description"],
            "contents": [
                {
                    "kind": "category",
                    "name": "调试扩展",
                    "colour": _category_colour("调试扩展"),
                    "visible_by_default": False,
                    "description": "记录结果、打印调试信息并对流程做异常保护。",
                    "contents": debug_extension_contents,
                }
            ],
        },
    ]
    if experimental_task_contents:
        debug_contents = contents[-1]["contents"]
        debug_contents.append(
            {
                "kind": "category",
                "name": "实验性任务",
                "colour": _category_colour("实验性任务"),
                "visible_by_default": False,
                "description": "这些任务当前本地环境可能无法运行，仅供教师按需查看与兼容导入使用。",
                "teacher_only": True,
                "contents": experimental_task_contents,
            }
        )
    return {
        "kind": "categoryToolbox",
        "pedagogy_level_default": "L1",
        "required_block_types": [
            "xeduhub_load_image_to_var",
            "xeduhub_workflow_create_var",
            "xeduhub_workflow_infer_var",
            "variables_get",
        ],
        "contents": contents,
    }


def _escape_field(value: Any) -> str:
    return escape(str(value or ""))


def build_xeduhub_workspace_xml(title: str, task_type: str = "classification", model_name: str = "", input_path: str = DEFAULT_BLOCKLY_SAMPLE_IMAGE) -> str:
    del title
    preferred = model_name if _canonical_task_id(model_name) else task_type
    task_id = _canonical_task_id(preferred) or recommended_model_for_task(preferred, [])
    safe_input = _escape_field(input_path or DEFAULT_BLOCKLY_SAMPLE_IMAGE)
    return (
        '<xml xmlns="https://developers.google.com/blockly/xml">'
        '<variables><variable id="lab_input_var">lab_input</variable></variables>'
        f'<block type="xeduhub_workflow_create_var" id="flow1" x="28" y="28"><field name="TASK_ID">{task_id}</field><field name="MODEL_VAR">lab_flow</field>'
        '<next>'
        f'<block type="xeduhub_load_image_to_var" id="input1"><field name="INPUT">{safe_input}</field><field name="IMAGE_VAR" id="lab_input_var">lab_input</field>'
        '<next>'
        '<block type="xeduhub_workflow_infer_var" id="infer1"><field name="MODEL_VAR">lab_flow</field><field name="RESULT_VAR">lab_result</field><value name="INPUT_DATA"><block type="variables_get" id="input_get1"><field name="VAR" id="lab_input_var">lab_input</field></block></value>'
        '</block>'
        '</next>'
        '</block>'
        '</next>'
        '</block>'
        '</xml>'
    )


def build_xeduhub_execution_config(task_type: str, model_name: str, title: str) -> Dict[str, Any]:
    supported_tasks: List[str] = []
    task_id = _canonical_task_id(model_name) or recommended_model_for_task(task_type, supported_tasks)
    family = normalize_task_type(task_id)
    return {
        "title": title,
        "task_type": family,
        "task_id": task_id,
        "task_label": TASK_REGISTRY.get(task_id, {}).get("label", TASK_FAMILY_META.get(family, {}).get("label", "XEdu")),
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
        "xeduhub_task_registry": get_xeduhub_frontend_registry(supported_tasks=supported_tasks),
    }


def resolve_input_path(input_value: str, project_root: str = "") -> str:
    raw = str(input_value or "").strip()
    if not raw:
        return ""
    if raw.lower().startswith("file://"):
        parsed = urlparse(raw)
        raw_path = unquote(parsed.path or "")
        if parsed.netloc and parsed.netloc.lower() not in {"localhost"}:
            raw_path = f"//{parsed.netloc}{raw_path}"
        if re.match(r"^/[A-Za-z]:[\\/]", raw_path):
            raw_path = raw_path[1:]
        raw = raw_path or raw
    normalized = raw.replace("\\", "/").strip()
    sample_inputs = {
        DEFAULT_BLOCKLY_SAMPLE_IMAGE.replace("\\", "/").strip(),
        "demo.jpg",
        "./demo.jpg",
        "demo.jpeg",
        "./demo.jpeg",
        "demo.png",
        "./demo.png",
        *DEFAULT_BLOCKLY_SAMPLE_ALIASES,
    }
    if normalized in sample_inputs:
        sample_path = ensure_blockly_smoke_image()
        if sample_path:
            return str(sample_path)
    path = Path(raw)
    if path.is_absolute() or not project_root:
        return str(path)
    resolved = (Path(project_root) / raw).expanduser().resolve()
    if resolved.exists():
        return str(resolved)
    return str(resolved)


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


def _load_image_for_preview(prepared_input: Any):
    try:
        from PIL import Image  # type: ignore
        import numpy as np  # type: ignore
    except Exception:
        return None
    try:
        if isinstance(prepared_input, str):
            return Image.open(prepared_input).convert("RGB")
        if hasattr(prepared_input, "save"):
            return prepared_input.convert("RGB") if hasattr(prepared_input, "convert") else prepared_input
        array = np.array(prepared_input)
        if array.ndim == 3 and array.shape[2] == 3:
            return Image.fromarray(array.astype("uint8")).convert("RGB")
        return Image.fromarray(array.squeeze().astype("uint8")).convert("RGB")
    except Exception:
        return None


def _iter_detection_boxes(output: Any) -> Iterable[Tuple[float, float, float, float]]:
    payload = _jsonable(output)
    if isinstance(payload, dict):
        candidates = payload.get("检测框") or payload.get("boxes") or payload.get("bboxes") or []
    else:
        candidates = payload
    if not isinstance(candidates, list):
        return []
    boxes: List[Tuple[float, float, float, float]] = []
    for item in candidates:
        raw_box = item
        if isinstance(item, dict):
            raw_box = item.get("bbox") or item.get("box") or item.get("检测框") or item.get("坐标")
        if not isinstance(raw_box, (list, tuple)) or len(raw_box) < 4:
            continue
        try:
            x1, y1, x2, y2 = [float(raw_box[index]) for index in range(4)]
        except Exception:
            continue
        boxes.append((x1, y1, x2, y2))
    return boxes


def _build_detection_preview_image(prepared_input: Any, output: Any) -> str:
    image = _load_image_for_preview(prepared_input)
    boxes = list(_iter_detection_boxes(output))
    if image is None or not boxes:
        return ""
    try:
        from PIL import ImageDraw  # type: ignore

        draw = ImageDraw.Draw(image)
        width, height = image.size
        for x1, y1, x2, y2 in boxes:
            left = max(0, min(width, x1))
            top = max(0, min(height, y1))
            right = max(0, min(width, x2))
            bottom = max(0, min(height, y2))
            if right <= left or bottom <= top:
                continue
            draw.rectangle((left, top, right, bottom), outline=(255, 82, 82), width=3)
        return _best_effort_image_to_data_url(image)
    except Exception:
        return ""


def _build_input_preview_image(prepared_input: Any) -> str:
    image = _load_image_for_preview(prepared_input)
    if image is None:
        return ""
    return _best_effort_image_to_data_url(image)


def _build_segmentation_preview_image(prepared_input: Any, output: Any) -> str:
    image = _load_image_for_preview(prepared_input)
    if image is None:
        return ""
    try:
        import numpy as np  # type: ignore
        from PIL import Image, ImageDraw  # type: ignore

        payload = np.array(output)
        if payload.ndim == 3:
            mask = payload[0]
        else:
            mask = payload
        mask = np.array(mask).squeeze()
        if mask.size == 0:
            return _best_effort_image_to_data_url(image)
        mask = (mask > 0.5).astype("uint8") * 255
        width, height = image.size
        if mask.shape[0] != height or mask.shape[1] != width:
            mask = np.array(Image.fromarray(mask).resize((width, height)))
        overlay = Image.new("RGBA", image.size, (0, 0, 0, 0))
        draw = ImageDraw.Draw(overlay)
        ys, xs = np.where(mask > 0)
        step = max(1, len(xs) // 4000 + 1)
        for x, y in zip(xs[::step], ys[::step]):
            draw.point((int(x), int(y)), fill=(64, 196, 255, 96))
        composed = Image.alpha_composite(image.convert("RGBA"), overlay).convert("RGB")
        return _best_effort_image_to_data_url(composed)
    except Exception:
        return _best_effort_image_to_data_url(image)


def _build_depth_preview_image(output: Any) -> str:
    try:
        import numpy as np  # type: ignore

        payload = np.array(output).astype("float32").squeeze()
        if payload.size == 0:
            return ""
        min_v = float(np.min(payload))
        max_v = float(np.max(payload))
        if max_v - min_v < 1e-6:
            normalized = np.zeros_like(payload, dtype="uint8")
        else:
            normalized = ((payload - min_v) / (max_v - min_v) * 255.0).clip(0, 255).astype("uint8")
        return _best_effort_image_to_data_url(normalized)
    except Exception:
        return ""


def _ensure_preview_image_for_result(task_id: str, prepared_input: Any, output: Any, image_data: str) -> str:
    if image_data:
        return image_data
    result_kind = TASK_REGISTRY.get(task_id, {}).get("result_kind")
    if result_kind == "detection":
        return _build_detection_preview_image(prepared_input, output) or _build_input_preview_image(prepared_input)
    if result_kind == "segmentation":
        return _build_segmentation_preview_image(prepared_input, output)
    if result_kind == "depth":
        return _build_depth_preview_image(output) or _build_input_preview_image(prepared_input)
    if result_kind == "generation":
        return _best_effort_image_to_data_url(output) or _build_input_preview_image(prepared_input)
    if result_kind in {"classification", "ocr", "pose", "panoptic", "multimodal"}:
        return _build_input_preview_image(prepared_input)
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


def _build_xeduhub_runtime_params(task_id: str, params: Dict[str, Any]) -> Dict[str, Any]:
    task = TASK_REGISTRY[task_id]
    runtime_params: Dict[str, Any] = {}
    if task.get("result_kind") == "detection":
        if "thr" in params:
            runtime_params["threshold"] = params["thr"]
        if params.get("target_class") not in (None, ""):
            runtime_params["target_class"] = params["target_class"]
    if task.get("result_kind") == "pose":
        if params.get("bbox") not in (None, ""):
            runtime_params["bbox"] = params["bbox"]
    if task_id == "segment_anything":
        if params.get("mode") not in (None, ""):
            runtime_params["mode"] = params["mode"]
        if params.get("prompt") not in (None, ""):
            runtime_params["prompt"] = _coerce_jsonish(str(params["prompt"]))
    if task_id == "gen_style" and params.get("style") not in (None, ""):
        runtime_params["style"] = params["style"]
    img_type = params.get("img_type")
    if img_type in (None, ""):
        for spec in task.get("params") or []:
            if spec.get("key") == "img_type":
                img_type = spec.get("default") or ""
                break
    if img_type not in (None, ""):
        runtime_params["img_type"] = img_type
    return runtime_params


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


def _patch_openxlab_repo_parser() -> None:
    try:
        from openxlab.model.handler import download_file  # type: ignore
    except Exception:
        return

    if getattr(download_file, "_xedu_repo_parser_patched", False):
        return

    original_split_repo = getattr(download_file, "_split_repo", None)
    if not callable(original_split_repo):
        return

    def _patched_split_repo(model_repo: str) -> Tuple[str, str]:
        text = str(model_repo or "").strip()
        match = re.match(r"^([a-zA-Z0-9]+)\/([a-zA-Z0-9._\-]+)$", text)
        if not match:
            return original_split_repo(model_repo)
        return match.group(1), match.group(2)

    download_file._split_repo = _patched_split_repo  # type: ignore[attr-defined]
    download_file._xedu_repo_parser_patched = True  # type: ignore[attr-defined]


def _patch_rapidocr_visres_compat() -> None:
    try:
        from rapidocr_onnxruntime import VisRes as RapidOCRVisRes  # type: ignore
        from rapidocr_onnxruntime.utils.vis_res import VisRes as RapidOCRVisResImpl  # type: ignore
    except Exception:
        return

    def _patch_visres_class(visres_cls) -> None:
        if getattr(visres_cls, "_xedu_font_path_compat_patched", False):
            return
        original_init = getattr(visres_cls, "__init__", None)
        original_get_font_path = getattr(visres_cls, "get_font_path", None)
        if not callable(original_init):
            return

        def _patched_init(self, *args, **kwargs):
            self._xedu_default_font_path = kwargs.pop("font_path", None)
            return original_init(self, *args, **kwargs)

        def _patched_get_font_path(self, font_path=None):
            candidates = [font_path, getattr(self, "_xedu_default_font_path", None)]
            for candidate in candidates:
                if candidate and Path(candidate).exists():
                    return str(candidate)
            try:
                import matplotlib  # type: ignore

                bundled_font = Path(matplotlib.get_data_path()) / "fonts/ttf/DejaVuSans.ttf"
                if bundled_font.exists():
                    return str(bundled_font)
            except Exception:
                pass
            if callable(original_get_font_path):
                return original_get_font_path(font_path)
            raise FileNotFoundError(f"The {font_path} does not exists!")

        visres_cls.__init__ = _patched_init
        visres_cls.get_font_path = _patched_get_font_path
        visres_cls._xedu_font_path_compat_patched = True

    _patch_visres_class(RapidOCRVisRes)
    if RapidOCRVisResImpl is not RapidOCRVisRes:
        _patch_visres_class(RapidOCRVisResImpl)


def _run_builtin_bodydetect_fallback(prepared_input: Any, params: Dict[str, Any]) -> Tuple[Any, str]:
    try:
        from PIL import Image  # type: ignore
    except Exception as exc:  # pragma: no cover - depends on runtime env
        raise RuntimeError(f"Pillow 不可用，无法使用人体检测兼容模式: {exc}") from exc

    if isinstance(prepared_input, str):
        try:
            preview_image = Image.open(prepared_input).convert("RGB")
        except Exception as exc:
            raise RuntimeError(f"无法读取输入图像，人体检测兼容模式执行失败: {exc}") from exc
    elif hasattr(prepared_input, "save"):
        preview_image = prepared_input
    else:
        try:
            preview_image = Image.fromarray(prepared_input).convert("RGB")
        except Exception as exc:
            raise RuntimeError(f"无法解析输入图像，人体检测兼容模式执行失败: {exc}") from exc

    image_data = ""
    if str(params.get("img_type") or "pil").strip() in ("pil", "cv2"):
        image_data = _best_effort_image_to_data_url(preview_image)

    # 当前环境无法自动补齐 XEduHub 官方 bodydetect 模型时，返回一个稳定的兼容结果，
    # 保证 Blockly 运行链路不断裂，后续仍可在课堂上继续调试积木流程。
    return [], image_data


def _load_preview_image_data(prepared_input: Any) -> str:
    image = _load_image_for_preview(prepared_input)
    return _best_effort_image_to_data_url(image) if image is not None else ""


def _run_generic_demo_fallback(task_id: str, prepared_input: Any, params: Dict[str, Any]) -> Tuple[Any, str]:
    del params
    result_kind = TASK_REGISTRY.get(task_id, {}).get("result_kind")
    image_data = _load_preview_image_data(prepared_input)
    if result_kind == "classification":
        return {"预测类别": "demo_only", "分数": 0.0}, image_data
    if result_kind == "ocr":
        return {"文本": ["DEMO OCR"], "检测框": []}, image_data
    if result_kind == "generation":
        return {"status": "demo_only_image_generated"}, image_data
    if result_kind == "segmentation":
        return {"掩码": []}, image_data
    if result_kind == "depth":
        return {"深度图": "demo_only"}, image_data
    if result_kind == "panoptic":
        return {"检测框": []}, image_data
    if result_kind == "multimodal":
        return {"向量": [0.0] * 8}, image_data
    if result_kind == "detection":
        return [], image_data
    if result_kind == "pose":
        return {"关键点": []}, image_data
    return {"status": "demo_only"}, image_data


def _bodydetect_fallback_enabled() -> bool:
    return os.environ.get("XEDU_DISABLE_BODYDETECT_FALLBACK", "").strip().lower() not in {"1", "true", "yes", "on"}


def _is_openxlab_auth_error(error_text: str) -> bool:
    return "Local config must not be empty" in error_text and "openxlab config" in error_text


def _is_bodydetect_model_bootstrap_error(error_text: str) -> bool:
    text = str(error_text or "")
    return (
        "NoSuchFile" in text
        or "File doesn't exist" in text
        or "checkpoints/" in text
        or "The input string must be in the format 'didi12/test-d-1'" in text
        or _is_openxlab_auth_error(text)
    )


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
        if int(key_fields["检测框数"] or 0) == 0:
            hints = ["模型已完成推理，图片预览会在弹窗中显示；当前图片未检测到目标，请确认图片内容与任务类型是否匹配。"]
        else:
            hints = ["标注结果图会在弹窗中显示。"]
    elif result_kind == "pose" and key_fields.get("关键点数") is not None:
        headline = f"识别到 {key_fields['关键点数']} 个关键点"
        hints = ["关键点任务建议配合检测框一起使用。"]
    elif result_kind == "ocr":
        headline = f"OCR 识别到 {key_fields.get('文本块数', 0)} 个文本块"
        hints = ["带文字标注的结果图会在弹窗中显示。"]
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
        hints = ["生成后的图像会在弹窗中显示。"]
    elif result_kind == "panoptic":
        headline = "驾驶感知完成"
        hints = ["结果包含检测框、车道线和可行驶区域。"]
    return {"headline": headline, "metrics": metrics, "hints": hints}


def _build_runtime_success(
    *,
    code: str,
    task_id: str,
    runtime_task_id: str,
    prepared_input: Any,
    params: Dict[str, Any],
    output: Any,
    image_data: str = "",
    message: str | None = None,
    extra_result: Dict[str, Any] | None = None,
) -> Dict[str, Any]:
    task = TASK_REGISTRY[task_id]
    normalized_result = _jsonable(output)
    preview_image = _ensure_preview_image_for_result(task_id, prepared_input, output, image_data)
    result_payload = {
        "task_id": task_id,
        "runtime_task_id": runtime_task_id,
        "runtime_mode": "real",
        "result_truthfulness": "verified",
        "task_label": task["label"],
        "task_family": task["family"],
        "input": _jsonable(prepared_input),
        "params": _jsonable(params),
        "output": normalized_result,
    }
    if extra_result:
        result_payload.update(_jsonable(extra_result))
    return {
        "success": True,
        "result_type": task.get("result_kind") or "vision",
        "message": message or f"已完成 {task['label']}",
        "result": result_payload,
        "artifacts": {
            "generated_python": code,
            "image_data": preview_image,
        },
        "result_summary": _build_result_summary(task_id, output),
        "result_artifacts": {
            "preview_image": preview_image,
            "key_fields": _extract_key_fields(task_id, output),
        },
    }


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
    visible_metrics = []
    for metric in metrics or []:
        label = str(metric.get("label") if isinstance(metric, dict) else "").strip()
        if label.lower() in {"task_id", "runtime_task_id"}:
            continue
        visible_metrics.append(metric)
    return {
        "success": False,
        "result_type": "error",
        "error_code": code,
        "message": message,
        "result": result,
        "artifacts": artifacts or {},
        "result_summary": {
            "headline": headline,
            "metrics": visible_metrics,
            "hints": hints or [],
        },
        "result_artifacts": {"preview_image": "", "key_fields": {}},
        "result_error": {
            "code": code,
            "task_id": task_id,
            "task_label": task.get("label", ""),
            "recommended_action": (hints or [""])[0],
        },
    }


def execute_xeduhub_runtime(payload: Dict[str, Any]) -> Dict[str, Any]:
    _force_noninteractive_matplotlib_backend()
    _patch_rapidocr_visres_compat()
    code = str(payload.get("code") or "").strip()
    spec = payload.get("spec") if isinstance(payload.get("spec"), dict) else {}
    explicit_task_id = str(spec.get("task_id") or "").strip()
    if explicit_task_id and not _canonical_task_id(explicit_task_id):
        return _build_runtime_error(
            code="invalid_task_id",
            message="当前任务不可用",
            headline="任务不可用",
            hints=["请从当前 Blockly 语义积木重新选择一个预置任务。"],
            metrics=[{"label": "任务", "value": explicit_task_id}],
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
    allows_runtime_bound_input = (
        str(spec.get("mode") or "").strip() == "workflow"
        or compat_input == "__runtime_bound__"
    )
    prepared_input = compat_input if compat_input == "__runtime_bound__" else _normalize_input_for_task(task_id, compat_input, project_root)
    params = _normalize_params(task_id, raw_params)
    runtime_params = _build_xeduhub_runtime_params(task_id, params)

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
    runtime_available = _is_runtime_task_available(task_id, supported_runtime_tasks)
    fallback_available = _is_fallback_task_available(task_id)
    if not runtime_available and not fallback_available:
        support_meta = _task_support_metadata(task_id, supported_runtime_tasks)
        return _build_runtime_error(
            code="runtime_task_unavailable",
            message=f"当前本地 XEdu 运行环境暂不支持：{task.get('label') or task_id}",
            headline="本地运行环境不支持该任务",
            task_id=task_id,
            metrics=[{"label": "任务", "value": task.get("label") or task_id}],
            hints=[support_meta["recommended_action"] or "请切换到当前环境支持的任务，或安装对应 XEdu 模型/版本后再试。"],
            artifacts={"generated_python": code},
        )
    if prepared_input in ("", None, []) and not allows_runtime_bound_input:
        return _build_runtime_error(
            code="missing_input",
            message="请先填写输入资源",
            headline="输入缺失",
            task_id=task_id,
            hints=["先使用“设置输入资源”或“设置输入列表”积木提供输入。"],
            artifacts={"generated_python": code},
        )
    if prepared_input not in ("", None, [], "__runtime_bound__") and not _input_exists(task_id, prepared_input):
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

    if not runtime_available and fallback_available:
        if task_id == "det_body" and _bodydetect_fallback_enabled():
            fallback_output, fallback_image = _run_builtin_bodydetect_fallback(prepared_input, params)
            fallback_message = "已完成 人体目标检测（已自动切换到本地兼容模式）"
            fallback_mode = "opencv_fallback"
            fallback_headline = "兼容演示结果"
        else:
            fallback_output, fallback_image = _run_generic_demo_fallback(task_id, prepared_input, params)
            fallback_message = f"已完成 {task['label']}（兼容演示模式）"
            fallback_mode = "fallback"
            fallback_headline = f"{task['label']}（兼容演示）"
        payload = _build_runtime_success(
            code=code,
            task_id=task_id,
            runtime_task_id=runtime_task_id,
            prepared_input=prepared_input,
            params=params,
            output=fallback_output,
            image_data=fallback_image,
            message=fallback_message,
        )
        payload["result"]["runtime_mode"] = fallback_mode
        payload["result"]["result_truthfulness"] = "demo_only"
        payload["result_summary"]["headline"] = fallback_headline
        payload["result_summary"]["hints"] = ["兼容演示结果，仅用于验证流程，不代表真实识别。"]
        return payload

    try:
        _patch_openxlab_repo_parser()
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
        workflow_kwargs = _workflow_init_kwargs(runtime_task_id)
        workflow = wf(task=runtime_task_id, **workflow_kwargs)
        inference_signature = inspect.signature(workflow.inference)
        call_params = dict(runtime_params)
        img_type = call_params.pop("img_type", None)
        if img_type not in (None, ""):
            if "img_type" in inference_signature.parameters:
                result = workflow.inference(data=prepared_input, img_type=img_type, **call_params)
            elif "get_img" in inference_signature.parameters:
                result = workflow.inference(data=prepared_input, get_img=img_type, **call_params)
            else:
                result = workflow.inference(data=prepared_input, **call_params)
        else:
            result = workflow.inference(data=prepared_input, **call_params)
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
        return _build_runtime_success(
            code=code,
            task_id=task_id,
            runtime_task_id=runtime_task_id,
            prepared_input=prepared_input,
            params=params,
            output=normalized_result,
            image_data=image_data,
            extra_result={"checkpoint": workflow_kwargs.get("checkpoint", "")},
        )
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
        if task_id == "det_body" and _bodydetect_fallback_enabled() and _is_bodydetect_model_bootstrap_error(error_text):
            fallback_output, fallback_image = _run_builtin_bodydetect_fallback(prepared_input, params)
            payload = _build_runtime_success(
                code=code,
                task_id=task_id,
                runtime_task_id=runtime_task_id,
                prepared_input=prepared_input,
                params=params,
                output=fallback_output,
                image_data=fallback_image,
                message="已完成 人体目标检测（已自动切换到本地兼容模式）",
                extra_result={"runtime_mode": "opencv_fallback"},
            )
            payload["result"]["runtime_mode"] = "fallback"
            payload["result"]["result_truthfulness"] = "demo_only"
            payload["result_summary"]["headline"] = "兼容演示结果"
            payload["result_summary"]["hints"] = ["兼容演示结果，仅用于验证流程，不代表真实识别。"]
            return payload
        if _is_openxlab_auth_error(error_text):
            return _build_runtime_error(
                code="model_download_auth_missing",
                message="当前环境尚未配置 OpenXLab 登录，XEduHub 自动下载模型失败。",
                headline="自动下载需要 OpenXLab 配置",
                task_id=task_id,
                metrics=[{"label": "任务", "value": task["label"]}],
                hints=["请先执行 `openxlab config` 完成 AK/SK 配置，或手动准备对应 checkpoint 模型文件。"],
                result={"task_id": task_id, "runtime_task_id": runtime_task_id, "traceback": traceback.format_exc(limit=4)},
                artifacts={"generated_python": code},
            )
        if "NoSuchFile" in error_text or "File doesn't exist" in error_text or "checkpoints/" in error_text:
            return _build_runtime_error(
                code="model_artifact_missing",
                message=f"XEdu 模型文件缺失，无法执行任务: {task_id}",
                headline="模型文件缺失",
                task_id=task_id,
                metrics=[{"label": "任务", "value": task["label"]}],
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
