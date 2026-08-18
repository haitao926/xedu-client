#!/usr/bin/env python3
# -*- coding: utf-8 -*-

from __future__ import annotations

import base64
import io
import inspect
import json
import os
import subprocess
import queue
import re
import threading
import time
import tempfile
import traceback
import sys
from collections import OrderedDict
from pathlib import Path
from typing import Any, Dict, Iterable, List, Tuple
from urllib.parse import unquote, urlparse

from runtime.sample_assets import (
    XEDUHUB_SMOKE_IMAGE,
    XEDUHUB_SMOKE_IMAGE_ALIASES,
    ensure_xeduhub_smoke_image,
    repo_path,
    resolve_checkpoint_file,
)

PEDAGOGY_LEVELS = ("L1", "L2", "L3")
REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_XEDUHUB_SAMPLE_IMAGE = XEDUHUB_SMOKE_IMAGE
DEFAULT_XEDUHUB_SAMPLE_ALIASES = set(XEDUHUB_SMOKE_IMAGE_ALIASES)
_RUNTIME_SUPPORTED_TASKS_CACHE: Dict[str, Any] = {
    "value": None,
    "expires_at": 0.0,
}
_RUNTIME_SUPPORTED_TASKS_LOCK = threading.RLock()


class _RuntimeWorkflowEntry:
    def __init__(self, workflow: Any, inference_signature: inspect.Signature):
        self.workflow = workflow
        self.inference_signature = inference_signature
        self.inference_lock = threading.Lock()
        self.active_requests = 0


class _RuntimeWorkflowBusyError(RuntimeError):
    pass


REALTIME_TASK_IDS = frozenset({
    "cls_imagenet",
    "det_coco_l",
    "pose_face106",
    "pose_body17",
    "pose_hand21",
    "ocr",
    "segment_anything",
    "depth_anything",
})
REALTIME_MAX_FRAME_BYTES = 1024 * 1024
REALTIME_MAX_FRAME_DIMENSION = 640


def _decode_realtime_frame(frame_bytes: bytes) -> Any:
    """Decode camera JPEG bytes in memory and return the BGR ndarray XEdu expects."""
    if (
        len(frame_bytes) < 4
        or frame_bytes[:2] != b"\xff\xd8"
        or b"\xff\xd9" not in frame_bytes[-64:]
    ):
        raise ValueError("摄像头画面必须是有效的 JPEG")
    import numpy as np  # type: ignore

    cv2_error = None
    try:
        import cv2  # type: ignore

        encoded = np.frombuffer(frame_bytes, dtype=np.uint8)
        decoded = cv2.imdecode(encoded, cv2.IMREAD_COLOR)
        if decoded is not None:
            return decoded
    except Exception as exc:
        cv2_error = exc

    try:
        from PIL import Image  # type: ignore

        with Image.open(io.BytesIO(frame_bytes)) as image:
            if str(image.format or "").upper() != "JPEG":
                raise ValueError("摄像头画面必须是 JPEG")
            rgb_image = image.convert("RGB")
            return np.asarray(rgb_image)[:, :, ::-1].copy()
    except ValueError:
        raise
    except Exception as pil_error:
        detail = cv2_error or pil_error
        raise ValueError(f"摄像头画面无法解码: {detail}") from cv2_error


def _realtime_concurrency_limit() -> int:
    try:
        return max(1, min(4, int(os.environ.get("XEDU_REALTIME_MAX_CONCURRENCY", "2"))))
    except (TypeError, ValueError):
        return 2


_REALTIME_INFERENCE_SLOTS = threading.BoundedSemaphore(_realtime_concurrency_limit())


_RUNTIME_WORKFLOW_CACHE_MAX_SIZE = 4
_RUNTIME_WORKFLOW_CACHE: "OrderedDict[tuple[Any, ...], _RuntimeWorkflowEntry]" = OrderedDict()
_RUNTIME_WORKFLOW_CACHE_LOCK = threading.RLock()
_RUNTIME_WORKFLOW_INIT_LOCKS: Dict[tuple[Any, ...], threading.Lock] = {}
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
    task_id = _canonical_task_id(text)
    if task_id:
        return str(TASK_REGISTRY[task_id]["family"])
    return mapping.get(text, "classification")




def _get_runtime_supported_tasks() -> List[str]:
    with _RUNTIME_SUPPORTED_TASKS_LOCK:
        return _get_runtime_supported_tasks_locked()


def _get_runtime_supported_tasks_locked() -> List[str]:
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
            probe_code = (
                "import json\n"
                "from XEdu.hub import Workflow as wf\n"
                "print(json.dumps(wf.support_task(), ensure_ascii=False))\n"
            )
            completed = subprocess.run(
                [sys.executable, "-c", probe_code],
                capture_output=True,
                text=True,
                timeout=timeout,
                cwd=str(REPO_ROOT),
            )
            if completed.returncode != 0:
                result_queue.put([])
                return
            lines = [line.strip() for line in str(completed.stdout or "").splitlines() if line.strip()]
            if not lines:
                result_queue.put([])
                return
            try:
                supported = json.loads(lines[-1])
            except Exception:
                result_queue.put([])
                return
            if not isinstance(supported, (list, tuple)):
                result_queue.put([])
                return
            normalized: List[str] = []
            for item in supported:
                text = str(item).strip()
                if not text:
                    continue
                runtime_task_id = _resolve_runtime_task_id(text)
                normalized.append(runtime_task_id or text)
            result_queue.put(list(dict.fromkeys(normalized)))
        except Exception:
            result_queue.put([])

    thread = threading.Thread(target=probe, name="xeduhub-runtime-support-probe", daemon=True)
    thread.start()
    try:
        resolved = result_queue.get(timeout=timeout)
    except queue.Empty:
        resolved = list(cached or [])
    if not resolved and "XEDU_RUNTIME_SUPPORT_TIMEOUT" not in os.environ:
        resolved = _get_current_process_supported_tasks(max(timeout, 3.0))

    _RUNTIME_SUPPORTED_TASKS_CACHE["value"] = _normalize_supported_runtime_tasks(list(resolved))
    _RUNTIME_SUPPORTED_TASKS_CACHE["expires_at"] = time.monotonic() + ttl
    return list(_RUNTIME_SUPPORTED_TASKS_CACHE["value"])



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


def _clear_runtime_workflow_cache() -> None:
    with _RUNTIME_WORKFLOW_CACHE_LOCK:
        _RUNTIME_WORKFLOW_CACHE.clear()
        _RUNTIME_WORKFLOW_INIT_LOCKS.clear()


def _runtime_workflow_cache_key(
    workflow_factory: Any,
    runtime_task_id: str,
    workflow_kwargs: Dict[str, Any],
) -> tuple[Any, ...]:
    # Include the factory identity so tests and hot-swapped runtimes cannot reuse a stale model.
    kwargs_key = tuple(sorted((str(key), str(value)) for key, value in workflow_kwargs.items()))
    return workflow_factory, str(runtime_task_id), kwargs_key


def _get_runtime_workflow(
    workflow_factory: Any,
    runtime_task_id: str,
    workflow_kwargs: Dict[str, Any],
) -> _RuntimeWorkflowEntry:
    cache_key = _runtime_workflow_cache_key(workflow_factory, runtime_task_id, workflow_kwargs)
    with _RUNTIME_WORKFLOW_CACHE_LOCK:
        entry = _RUNTIME_WORKFLOW_CACHE.get(cache_key)
        if entry is not None:
            _RUNTIME_WORKFLOW_CACHE.move_to_end(cache_key)
            entry.active_requests += 1
            return entry
        init_lock = _RUNTIME_WORKFLOW_INIT_LOCKS.setdefault(cache_key, threading.Lock())

    # Model construction is serialized per cache key, not across unrelated tasks.
    try:
        with init_lock:
            with _RUNTIME_WORKFLOW_CACHE_LOCK:
                entry = _RUNTIME_WORKFLOW_CACHE.get(cache_key)
                if entry is not None:
                    _RUNTIME_WORKFLOW_CACHE.move_to_end(cache_key)
                    entry.active_requests += 1
                    return entry
            workflow = workflow_factory(task=runtime_task_id, **workflow_kwargs)
            new_entry = _RuntimeWorkflowEntry(workflow, inspect.signature(workflow.inference))
            with _RUNTIME_WORKFLOW_CACHE_LOCK:
                entry = _RUNTIME_WORKFLOW_CACHE.get(cache_key)
                if entry is None:
                    entry = new_entry
                    _RUNTIME_WORKFLOW_CACHE[cache_key] = entry
                else:
                    _RUNTIME_WORKFLOW_CACHE.move_to_end(cache_key)
                entry.active_requests += 1
                _trim_runtime_workflow_cache()
                return entry
    except Exception:
        with _RUNTIME_WORKFLOW_CACHE_LOCK:
            if _RUNTIME_WORKFLOW_INIT_LOCKS.get(cache_key) is init_lock:
                _RUNTIME_WORKFLOW_INIT_LOCKS.pop(cache_key, None)
        raise


def _trim_runtime_workflow_cache() -> None:
    while len(_RUNTIME_WORKFLOW_CACHE) > _RUNTIME_WORKFLOW_CACHE_MAX_SIZE:
        evicted_key = None
        for key, entry in _RUNTIME_WORKFLOW_CACHE.items():
            if entry.active_requests == 0:
                evicted_key = key
                break
        if evicted_key is None:
            return
        _RUNTIME_WORKFLOW_CACHE.pop(evicted_key, None)
        _RUNTIME_WORKFLOW_INIT_LOCKS.pop(evicted_key, None)


def _release_runtime_workflow(workflow_entry: _RuntimeWorkflowEntry) -> None:
    with _RUNTIME_WORKFLOW_CACHE_LOCK:
        workflow_entry.active_requests = max(0, workflow_entry.active_requests - 1)
        _trim_runtime_workflow_cache()


def _run_runtime_inference(
    workflow_entry: _RuntimeWorkflowEntry,
    prepared_input: Any,
    runtime_params: Dict[str, Any],
    *,
    realtime: bool,
) -> Any:
    acquired = workflow_entry.inference_lock.acquire(blocking=not realtime)
    if not acquired:
        _release_runtime_workflow(workflow_entry)
        raise _RuntimeWorkflowBusyError("上一个实时画面仍在检测")
    try:
        call_params = dict(runtime_params)
        img_type = call_params.pop("img_type", None)
        inference_signature = workflow_entry.inference_signature
        workflow = workflow_entry.workflow
        if img_type not in (None, ""):
            if "img_type" in inference_signature.parameters:
                return workflow.inference(data=prepared_input, img_type=img_type, **call_params)
            if "get_img" in inference_signature.parameters:
                return workflow.inference(data=prepared_input, get_img=img_type, **call_params)
        return workflow.inference(data=prepared_input, **call_params)
    finally:
        workflow_entry.inference_lock.release()
        _release_runtime_workflow(workflow_entry)


def _is_runtime_task_available(task_id: str, supported_tasks: List[str] | None = None) -> bool:
    runtime_task_id = _resolve_runtime_task_id(task_id)
    if not runtime_task_id:
        return False
    supported = _normalize_supported_runtime_tasks(supported_tasks if supported_tasks is not None else _get_runtime_supported_tasks())
    return runtime_task_id in supported


def _get_current_process_supported_tasks(timeout: float) -> List[str]:
    result_queue: "queue.Queue[List[str]]" = queue.Queue(maxsize=1)

    def probe() -> None:
        try:
            from XEdu.hub import Workflow as wf  # type: ignore

            supported = wf.support_task()
            if isinstance(supported, (list, tuple)):
                result_queue.put(_normalize_supported_runtime_tasks([str(item) for item in supported]))
            else:
                result_queue.put([])
        except Exception:
            result_queue.put([])

    thread = threading.Thread(target=probe, name="xeduhub-current-process-support-probe", daemon=True)
    thread.start()
    try:
        return _normalize_supported_runtime_tasks(result_queue.get(timeout=timeout))
    except queue.Empty:
        return []


def _is_runtime_task_available_in_current_process(task_id: str) -> bool:
    runtime_task_id = _resolve_runtime_task_id(task_id)
    if not runtime_task_id:
        return False
    try:
        default_timeout = "1.5" if "XEDU_RUNTIME_SUPPORT_TIMEOUT" in os.environ else "3.0"
        timeout = max(0.05, float(os.environ.get("XEDU_RUNTIME_SUPPORT_TIMEOUT", default_timeout) or default_timeout))
    except ValueError:
        timeout = 3.0
    return runtime_task_id in _get_current_process_supported_tasks(timeout)


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
            "support_reason": "当前任务将以兼容演示模式运行，仅用于验证执行链路。",
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
        DEFAULT_XEDUHUB_SAMPLE_IMAGE.replace("\\", "/").strip(),
        "demo.jpg",
        "./demo.jpg",
        "demo.jpeg",
        "./demo.jpeg",
        "demo.png",
        "./demo.png",
        *DEFAULT_XEDUHUB_SAMPLE_ALIASES,
    }
    if normalized in sample_inputs:
        sample_path = ensure_xeduhub_smoke_image()
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


def _build_segmentation_preview_image(
    prepared_input: Any,
    output: Any,
    *,
    transparent_only: bool = False,
) -> str:
    image = _load_image_for_preview(prepared_input)
    if image is None:
        return ""
    try:
        import numpy as np  # type: ignore
        from PIL import Image, ImageDraw  # type: ignore

        if isinstance(output, dict):
            output = next((output.get(key) for key in ("掩码", "masks", "mask") if output.get(key) is not None), [])
        payload = np.array(output)
        if payload.ndim == 3:
            mask = payload[0]
        else:
            mask = payload
        mask = np.array(mask).squeeze()
        if mask.size == 0:
            if transparent_only:
                return _best_effort_image_to_data_url(Image.new("RGBA", image.size, (0, 0, 0, 0)))
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
        if transparent_only:
            return _best_effort_image_to_data_url(overlay)
        composed = Image.alpha_composite(image.convert("RGBA"), overlay).convert("RGB")
        return _best_effort_image_to_data_url(composed)
    except Exception:
        return _best_effort_image_to_data_url(image)


def _build_depth_preview_image(output: Any) -> str:
    try:
        import numpy as np  # type: ignore

        if isinstance(output, dict):
            output = output.get("深度图") if output.get("深度图") is not None else output.get("depth")
        payload = np.array(output).astype("float32").squeeze()
        if payload.size == 0:
            return ""
        min_v = float(np.min(payload))
        max_v = float(np.max(payload))
        if max_v - min_v < 1e-6:
            normalized = np.zeros_like(payload, dtype="float32")
        else:
            normalized = ((payload - min_v) / (max_v - min_v)).clip(0, 1).astype("float32")
        red = np.where(normalized < 0.5, 0, (normalized - 0.5) * 2 * 255)
        green = np.where(normalized < 0.5, normalized * 2 * 255, (1 - normalized) * 2 * 255)
        blue = np.where(normalized < 0.5, (1 - normalized * 2) * 255, 0)
        heatmap = np.stack((red, green, blue), axis=-1).clip(0, 255).astype("uint8")
        return _best_effort_image_to_data_url(heatmap)
    except Exception:
        return ""


def _segmentation_mask_count(output: Any) -> int:
    try:
        import numpy as np  # type: ignore

        if isinstance(output, dict):
            for count_key in ("掩码数", "mask_count", "maskCount", "count"):
                if output.get(count_key) is not None:
                    return max(0, int(output[count_key]))
            output = next((output.get(key) for key in ("掩码", "masks", "mask") if output.get(key) is not None), [])
        payload = np.array(output)
        if payload.size == 0:
            return 0
        if payload.ndim <= 2:
            return 1 if bool(np.any(payload)) else 0
        return int(payload.shape[0])
    except Exception:
        return 0


def _compact_depth_output(output: Any) -> Dict[str, Any]:
    try:
        import numpy as np  # type: ignore

        if isinstance(output, dict):
            raw_depth = output.get("深度图") if output.get("深度图") is not None else output.get("depth")
        else:
            raw_depth = output
        depth = np.asarray(raw_depth, dtype="float32").squeeze()
        if depth.ndim != 2 or depth.size == 0:
            return {"深度图": []}
        height, width = depth.shape[:2]
        scale = min(160 / width, 120 / height, 1.0)
        target_width = max(1, int(round(width * scale)))
        target_height = max(1, int(round(height * scale)))
        if target_width != width or target_height != height:
            y_indices = np.linspace(0, height - 1, target_height).astype("int32")
            x_indices = np.linspace(0, width - 1, target_width).astype("int32")
            depth = depth[np.ix_(y_indices, x_indices)]
        depth = np.nan_to_num(depth, nan=0.0, posinf=0.0, neginf=0.0)
        return {"深度图": np.round(depth, 3).tolist()}
    except Exception:
        return {"深度图": []}


def _compact_realtime_output(task_id: str, output: Any) -> Any:
    result_kind = TASK_REGISTRY[task_id].get("result_kind")
    if result_kind == "depth":
        return _compact_depth_output(output)
    if result_kind == "segmentation":
        return {"掩码数": _segmentation_mask_count(output)}
    return output


def _realtime_overlay_image(task_id: str, prepared_input: Any, output: Any) -> str:
    result_kind = TASK_REGISTRY[task_id].get("result_kind")
    if result_kind == "segmentation":
        return _build_segmentation_preview_image(prepared_input, output, transparent_only=True)
    if result_kind == "depth":
        return _build_depth_preview_image(output)
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
        if key == "img_type" and raw_value == "":
            normalized[key] = ""
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
    if "img_type" not in params:
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


_IMAGE_DATA_URL_PATTERN = re.compile(
    r"^data:image/(?P<format>png|jpe?g|webp|gif);base64,(?P<data>[A-Za-z0-9+/=\s]+)$",
    re.IGNORECASE,
)
_IMAGE_DATA_URL_MAX_BYTES = 8 * 1024 * 1024


def _materialize_image_data_url(input_value: Any, temporary_paths: List[Path]) -> str:
    """Store one browser camera frame long enough for the synchronous runtime call."""
    match = _IMAGE_DATA_URL_PATTERN.fullmatch(str(input_value or "").strip())
    if not match:
        raise ValueError("摄像头画面格式无效")
    try:
        image_bytes = base64.b64decode(match.group("data"), validate=True)
    except ValueError as exc:
        raise ValueError("摄像头画面无法解码") from exc
    if not image_bytes or len(image_bytes) > _IMAGE_DATA_URL_MAX_BYTES:
        raise ValueError("摄像头画面大小无效")
    suffix = ".jpg" if match.group("format").lower() in {"jpg", "jpeg"} else f".{match.group('format').lower()}"
    with tempfile.NamedTemporaryFile(prefix="xedu-camera-", suffix=suffix, delete=False) as image_file:
        image_file.write(image_bytes)
        temporary_path = Path(image_file.name)
    temporary_paths.append(temporary_path)
    return str(temporary_path)


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

    # 当前环境无法自动补齐 XEduHub 官方 bodydetect 模型时，返回稳定的兼容结果，
    # 保证课堂演示链路可验证。
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


def _classification_key_fields(output: Any) -> Dict[str, Any]:
    """Extract a stable teaching result from XEdu's classification formats."""
    payload = _jsonable(output)
    candidates = payload
    if isinstance(payload, list) and len(payload) == 1 and isinstance(payload[0], list):
        candidates = payload[0]
    if isinstance(candidates, dict):
        label = candidates.get("预测类别") or candidates.get("label") or candidates.get("class")
        score = candidates.get("分数")
        if score is None:
            score = candidates.get("score")
        return {"预测类别": label, "分数": score}
    if isinstance(candidates, list) and candidates and all(isinstance(value, (int, float)) for value in candidates):
        top_index = max(range(len(candidates)), key=lambda index: candidates[index])
        return {
            "预测类别": f"ImageNet 类别 {top_index}",
            "分数": float(candidates[top_index]),
        }
    if isinstance(candidates, list) and candidates and isinstance(candidates[0], dict):
        return _classification_key_fields(candidates[0])
    return {"预测类别": None, "分数": None}


def _extract_key_fields(task_id: str, output: Any) -> Dict[str, Any]:
    result_kind = TASK_REGISTRY[task_id].get("result_kind")
    payload = _jsonable(output)
    if result_kind == "classification":
        return _classification_key_fields(payload)
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
        if isinstance(payload, dict) and payload.get("掩码数") is not None:
            return {"掩码数": int(payload.get("掩码数") or 0)}
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
    include_input: bool = True,
    preview_image_override: str | None = None,
) -> Dict[str, Any]:
    task = TASK_REGISTRY[task_id]
    normalized_result = _jsonable(output)
    preview_image = preview_image_override if preview_image_override is not None else (
        "" if params.get("img_type") == "" else _ensure_preview_image_for_result(
            task_id,
            prepared_input,
            output,
            image_data,
        )
    )
    result_payload = {
        "task_id": task_id,
        "runtime_task_id": runtime_task_id,
        "runtime_mode": "real",
        "result_truthfulness": "verified",
        "task_label": task["label"],
        "task_family": task["family"],
        "input": _jsonable(prepared_input) if include_input else {
            "source": "camera",
            "width": int(getattr(prepared_input, "shape", [0, 0])[1]) if getattr(prepared_input, "shape", None) is not None else 0,
            "height": int(getattr(prepared_input, "shape", [0, 0])[0]) if getattr(prepared_input, "shape", None) is not None else 0,
        },
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


def execute_xeduhub_realtime(frame_bytes: bytes, metadata: Dict[str, Any]) -> Dict[str, Any]:
    """Run one camera frame without materializing it as a temporary file."""
    started_at = time.perf_counter()
    task_id = _canonical_task_id(metadata.get("task_id"))
    if task_id not in REALTIME_TASK_IDS:
        return _build_runtime_error(
            code="realtime_task_unavailable",
            message="当前任务不支持实时摄像头感知",
            headline="实时任务不可用",
            task_id=task_id,
            hints=["请使用当前 Scratch 摄像头感知扩展支持的任务。"],
        )
    if not isinstance(frame_bytes, (bytes, bytearray, memoryview)) or not frame_bytes:
        return _build_runtime_error(
            code="invalid_image_data",
            message="摄像头画面为空",
            headline="摄像头画面无效",
            task_id=task_id,
            hints=["请重新开启摄像头后再试。"],
        )
    frame_bytes = bytes(frame_bytes)
    if len(frame_bytes) > REALTIME_MAX_FRAME_BYTES:
        return _build_runtime_error(
            code="invalid_image_data",
            message="摄像头画面过大",
            headline="摄像头画面过大",
            task_id=task_id,
            hints=["请降低摄像头画面尺寸后重试。"],
        )
    try:
        prepared_input = _decode_realtime_frame(frame_bytes)
        if prepared_input is None or prepared_input.ndim != 3:
            raise ValueError("摄像头画面无法解码")
        height, width = prepared_input.shape[:2]
        if max(width, height) > REALTIME_MAX_FRAME_DIMENSION:
            raise ValueError("摄像头画面尺寸超过限制")
    except ValueError as exc:
        return _build_runtime_error(
            code="invalid_image_data",
            message=str(exc),
            headline="摄像头画面无效",
            task_id=task_id,
            hints=["请重新开启摄像头后再试。"],
        )
    except Exception as exc:
        return _build_runtime_error(
            code="invalid_image_data",
            message=f"摄像头画面无法解码: {exc}",
            headline="摄像头画面无效",
            task_id=task_id,
            hints=["请重新开启摄像头后再试。"],
        )
    decode_ms = round((time.perf_counter() - started_at) * 1000, 2)

    raw_params = metadata.get("params")
    if isinstance(raw_params, str):
        try:
            raw_params = json.loads(raw_params or "{}")
        except json.JSONDecodeError:
            raw_params = {}
    params = dict(raw_params) if isinstance(raw_params, dict) else {}
    params["img_type"] = ""
    params = _normalize_params(task_id, params)
    runtime_params = _build_xeduhub_runtime_params(task_id, params)
    session_id = str(metadata.get("session_id") or "")[:128]
    try:
        frame_seq = int(metadata.get("frame_seq") or 0)
    except (TypeError, ValueError):
        frame_seq = 0
    try:
        captured_at_ms = int(metadata.get("captured_at_ms") or 0)
    except (TypeError, ValueError):
        captured_at_ms = 0

    try:
        _force_noninteractive_matplotlib_backend()
        _patch_rapidocr_visres_compat()
        _patch_openxlab_repo_parser()
        from XEdu.hub import Workflow as wf  # type: ignore

        supported_runtime_tasks = _get_runtime_supported_tasks()
        if not _is_runtime_task_available(task_id, supported_runtime_tasks):
            return _build_runtime_error(
                code="runtime_task_unavailable",
                message=f"当前本地 XEdu 运行环境暂不支持：{TASK_REGISTRY[task_id]['label']}",
                headline="实时运行环境不支持该任务",
                task_id=task_id,
                hints=["请安装对应 XEdu 模型后再重试。"],
            )
        if not _REALTIME_INFERENCE_SLOTS.acquire(blocking=False):
            raise _RuntimeWorkflowBusyError("实时推理并发槽已满")
        try:
            workflow_kwargs = _workflow_init_kwargs(task_id)
            workflow_entry = _get_runtime_workflow(wf, task_id, workflow_kwargs)
            inference_started = time.perf_counter()
            result = _run_runtime_inference(
                workflow_entry,
                prepared_input,
                runtime_params,
                realtime=True,
            )
        finally:
            _REALTIME_INFERENCE_SLOTS.release()
        inference_ms = round((time.perf_counter() - inference_started) * 1000, 2)
        normalized_result = result[0] if isinstance(result, (list, tuple)) and len(result) == 2 else result
        compact_output = _compact_realtime_output(task_id, normalized_result)
        overlay_image = _realtime_overlay_image(task_id, prepared_input, normalized_result)
        payload = _build_runtime_success(
            code="",
            task_id=task_id,
            runtime_task_id=task_id,
            prepared_input=prepared_input,
            params=params,
            output=compact_output,
            image_data=overlay_image,
            include_input=False,
            preview_image_override=overlay_image,
            extra_result={
                "session_id": session_id,
                "frame_seq": frame_seq,
                "captured_at_ms": captured_at_ms,
                "frame_size": {"width": int(width), "height": int(height)},
            },
        )
        payload.update({
            "session_id": session_id,
            "frame_seq": frame_seq,
            "captured_at_ms": captured_at_ms,
            "frame_size": {"width": int(width), "height": int(height)},
            "decode_ms": decode_ms,
            "inference_ms": inference_ms,
            "total_ms": round((time.perf_counter() - started_at) * 1000, 2),
            "timings_ms": {
                "decode": decode_ms,
                "inference": inference_ms,
                "total": round((time.perf_counter() - started_at) * 1000, 2),
            },
        })
        return payload
    except _RuntimeWorkflowBusyError as exc:
        return _build_runtime_error(
            code="runtime_busy",
            message=str(exc),
            headline="实时检测繁忙",
            task_id=task_id,
            hints=["已跳过过期画面，请稍候获取下一帧。"],
        ) | {"session_id": session_id, "frame_seq": frame_seq, "captured_at_ms": captured_at_ms}
    except (ModuleNotFoundError, ImportError) as exc:
        return _build_runtime_error(
            code="missing_dependency",
            message=f"XEduHub 运行依赖缺失: {exc}",
            headline="运行时缺少 XEduHub 依赖",
            task_id=task_id,
            hints=["请检查本地 Python 环境中的 XEduHub 及其推理依赖。"],
        )
    except Exception as exc:
        return _build_runtime_error(
            code="realtime_inference_failed",
            message=str(exc),
            headline="实时感知失败",
            task_id=task_id,
            hints=["请检查模型文件和本地 XEduHub 运行环境。"],
        )


def execute_xeduhub_runtime(payload: Dict[str, Any]) -> Dict[str, Any]:
    temporary_paths: List[Path] = []
    try:
        return _execute_xeduhub_runtime(payload, temporary_paths)
    finally:
        for path in temporary_paths:
            path.unlink(missing_ok=True)


def _execute_xeduhub_runtime(payload: Dict[str, Any], temporary_paths: List[Path]) -> Dict[str, Any]:
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
            hints=["请重新选择一个可用的 XEduHub 预置任务。"],
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
    try:
        prepared_input = (
            compat_input
            if compat_input == "__runtime_bound__"
            else _materialize_image_data_url(compat_input, temporary_paths)
            if str(compat_input or "").strip().lower().startswith("data:image/")
            else _normalize_input_for_task(task_id, compat_input, project_root)
        )
    except ValueError as exc:
        return _build_runtime_error(
            code="invalid_image_data",
            message=str(exc),
            headline="摄像头画面无效",
            task_id=task_id,
            hints=["请重新开启摄像头后再试。"],
            artifacts={"generated_python": code},
        )
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
    cached_supported_tasks = _normalize_supported_runtime_tasks(
        list(_RUNTIME_SUPPORTED_TASKS_CACHE.get("value") or [])
    )
    support_list_came_from_cache = bool(supported_runtime_tasks) and cached_supported_tasks == supported_runtime_tasks
    if not runtime_available and (not supported_runtime_tasks or support_list_came_from_cache):
        missing_det_body_checkpoint_with_fallback = (
            task_id == "det_body"
            and _bodydetect_fallback_enabled()
            and not _resolve_smoke_checkpoint(runtime_task_id)
        )
        if not missing_det_body_checkpoint_with_fallback:
            runtime_available = _is_runtime_task_available_in_current_process(task_id)
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
            message="当前环境未安装 XEduHub，无法执行该任务。请先安装 XEdu 后再重试。",
            headline="运行时缺少 XEduHub 依赖",
            task_id=task_id,
            metrics=[{"label": "任务", "value": task["label"]}],
            hints=["先在平台 Python 环境安装 XEdu/XEduHub，再重新运行。"],
            result={"task_id": task_id, "input": _jsonable(prepared_input)},
            artifacts={"generated_python": code},
        )

    try:
        workflow_kwargs = _workflow_init_kwargs(runtime_task_id)
        workflow_entry = _get_runtime_workflow(wf, runtime_task_id, workflow_kwargs)
        result = _run_runtime_inference(
            workflow_entry,
            prepared_input,
            runtime_params,
            realtime=params.get("img_type") == "",
        )
        image_data = ""
        normalized_result = result
        if isinstance(result, (list, tuple)) and len(result) == 2:
            normalized_result = result[0]
            if params.get("img_type") != "":
                image_data = _best_effort_image_to_data_url(result[1])
        elif isinstance(result, dict):
            for key in ("image", "result_image", "visualization"):
                if key in result and params.get("img_type") != "":
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
        if isinstance(exc, _RuntimeWorkflowBusyError):
            return _build_runtime_error(
                code="runtime_busy",
                message=str(exc),
                headline="实时检测繁忙",
                task_id=task_id,
                hints=["已跳过过期画面，请稍候获取下一帧。"],
                artifacts={"generated_python": code},
            )
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
