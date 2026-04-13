#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path

import numpy as np
import onnx
import onnx.helper as oh
import onnx.numpy_helper as nh


REPO_ROOT = Path(__file__).resolve().parents[1]
CHECKPOINTS_DIR = REPO_ROOT / "checkpoints"

POSE_MODEL_SPECS = {
    "body17.onnx": 17,
    "body26.onnx": 26,
    "whole133.onnx": 133,
    "face106.onnx": 106,
    "hand21.onnx": 21,
}

DETECTION_MODEL_SPECS = {
    "bodydetect.onnx": 0,
    "cocodetect.onnx": 0,
}


def save_model(model: onnx.ModelProto, target: Path) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    onnx.checker.check_model(model)
    onnx.save(model, target)


def build_detection_model(class_index: int) -> onnx.ModelProto:
    input_info = oh.make_tensor_value_info("input", onnx.TensorProto.FLOAT, [1, 3, 224, 224])
    boxes_info = oh.make_tensor_value_info("boxes", onnx.TensorProto.FLOAT, [1, 1, 5])
    classes_info = oh.make_tensor_value_info("classes", onnx.TensorProto.INT64, [1, 1])
    boxes = nh.from_array(np.array([[[24.0, 24.0, 200.0, 220.0, 0.95]]], dtype=np.float32), name="boxes_const")
    classes = nh.from_array(np.array([[class_index]], dtype=np.int64), name="classes_const")
    graph = oh.make_graph(
        [
            oh.make_node("Constant", [], ["boxes"], value=boxes),
            oh.make_node("Constant", [], ["classes"], value=classes),
        ],
        "xedu_detection_smoke",
        [input_info],
        [boxes_info, classes_info],
    )
    model = oh.make_model(graph, producer_name="xedu-client-smoke", opset_imports=[oh.make_operatorsetid("", 11)])
    model.ir_version = 7
    return model


def build_pose_model(keypoints_count: int) -> onnx.ModelProto:
    input_info = oh.make_tensor_value_info("input", onnx.TensorProto.FLOAT, [1, 3, 256, 192])
    simcc_x_info = oh.make_tensor_value_info("simcc_x", onnx.TensorProto.FLOAT, [1, keypoints_count, 384])
    simcc_y_info = oh.make_tensor_value_info("simcc_y", onnx.TensorProto.FLOAT, [1, keypoints_count, 512])
    simcc_x = np.zeros((1, keypoints_count, 384), dtype=np.float32)
    simcc_y = np.zeros((1, keypoints_count, 512), dtype=np.float32)
    for index in range(keypoints_count):
        simcc_x[0, index, min(20 + index * 3, 383)] = 1.0
        simcc_y[0, index, min(30 + index * 4, 511)] = 1.0
    const_x = nh.from_array(simcc_x, name="simcc_x_const")
    const_y = nh.from_array(simcc_y, name="simcc_y_const")
    graph = oh.make_graph(
        [
            oh.make_node("Constant", [], ["simcc_x"], value=const_x),
            oh.make_node("Constant", [], ["simcc_y"], value=const_y),
        ],
        "xedu_pose_smoke",
        [input_info],
        [simcc_x_info, simcc_y_info],
    )
    model = oh.make_model(graph, producer_name="xedu-client-smoke", opset_imports=[oh.make_operatorsetid("", 11)])
    model.ir_version = 7
    return model


def main() -> int:
    CHECKPOINTS_DIR.mkdir(parents=True, exist_ok=True)
    for filename, class_index in DETECTION_MODEL_SPECS.items():
        save_model(build_detection_model(class_index), CHECKPOINTS_DIR / filename)
    for filename, keypoints_count in POSE_MODEL_SPECS.items():
        save_model(build_pose_model(keypoints_count), CHECKPOINTS_DIR / filename)
    print(f"Seeded {len(DETECTION_MODEL_SPECS) + len(POSE_MODEL_SPECS)} smoke checkpoint models in {CHECKPOINTS_DIR}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
