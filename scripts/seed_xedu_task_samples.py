#!/usr/bin/env python3
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
BACKEND_DIR = REPO_ROOT / "backend"
SMOKE_DIR = REPO_ROOT / "courses" / "blockly-smoke"
GENERATOR = REPO_ROOT / "scripts" / "generate_blockly_python.mjs"

if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from services.blockly_xeduhub_support import TASK_REGISTRY  # noqa: E402
from services.blockly_xeduhub_support import _get_runtime_supported_tasks, _resolve_runtime_task_id  # noqa: E402

VISUAL_FAMILIES = {"classification", "detection", "ocr", "pose", "generation", "segmentation", "depth", "panoptic", "multimodal"}
VIDEO_FAMILY_DEFAULTS = {
    "classification": "demo.mp4",
    "detection": "demo.mp4",
    "ocr": "demo.mp4",
    "pose": "demo.mp4",
    "generation": "demo.mp4",
    "segmentation": "demo.mp4",
    "depth": "demo.mp4",
    "panoptic": "demo.mp4",
    "multimodal": "demo.mp4",
}
IMAGE_FAMILY_DEFAULTS = {
    "classification": "assets/xedu-test-scene-1.png",
    "detection": "assets/xedu-test-scene-1.png",
    "pose": "assets/xedu-test-scene-1.png",
    "generation": "assets/xedu-test-scene-1.png",
    "ocr": "assets/xedu-test-ocr-1.png",
    "segmentation": "assets/xedu-test-seg-depth-1.png",
    "depth": "assets/xedu-test-seg-depth-1.png",
    "panoptic": "assets/xedu-test-scene-1.png",
    "multimodal": "assets/xedu-test-scene-1.png",
}


def _input_block_xml(task_id: str, task: dict, *, media_kind: str = "image") -> str:
    input_mode = str(task.get("input_mode") or "single_path")
    if input_mode == "text_or_list":
        return """<block type="text" id="{slug}_input_text">
              <field name="TEXT">XEduHub test text</field>
            </block>"""
    if input_mode == "path_or_list":
        if "audio" in task_id:
            value = "demo.wav"
        elif media_kind == "video":
            value = VIDEO_FAMILY_DEFAULTS.get(str(task.get("family") or ""), "demo.mp4")
        else:
            value = IMAGE_FAMILY_DEFAULTS.get(str(task.get("family") or ""), "demo.jpg")
        return f"""<block type="text" id="{{slug}}_input_path">
              <field name="TEXT">{value}</field>
            </block>"""
    if "audio" in task_id:
        value = "demo.wav"
    elif media_kind == "video":
        value = VIDEO_FAMILY_DEFAULTS.get(str(task.get("family") or ""), "demo.mp4")
    else:
        value = IMAGE_FAMILY_DEFAULTS.get(str(task.get("family") or ""), "demo.jpg")
    return f"""<block type="text" id="{{slug}}_input_path">
              <field name="TEXT">{value}</field>
            </block>"""


def write_workspace(task_id: str, label: str, *, variant: str = "image") -> Path:
    suffix = f"_{variant}" if variant != "image" else ""
    slug = f"xeduhub_task_{task_id}{suffix}"
    workspace_path = SMOKE_DIR / f"{slug}.blockly.xml"
    task = TASK_REGISTRY[task_id]
    input_block = _input_block_xml(task_id, task, media_kind=variant).format(slug=slug)
    supported_runtime_tasks = set(_get_runtime_supported_tasks())
    runtime_supported = _resolve_runtime_task_id(task_id) in supported_runtime_tasks
    run_block_type = f"xeduhub_run_{task_id}"
    title = f"{label}{' 视频' if variant == 'video' else ''}"
    if runtime_supported:
        xml = f"""<xml xmlns="https://developers.google.com/blockly/xml">
  <block type="{run_block_type}" id="{slug}_run" x="28" y="28">
    <value name="INPUT_DATA">
      {input_block}
    </value>
    <next>
      <block type="xeduhub_show_result_card" id="{slug}_show">
        <field name="TITLE">{title}</field>
      </block>
    </next>
  </block>
</xml>
"""
    else:
        xml = f"""<xml xmlns="https://developers.google.com/blockly/xml">
  <variables><variable id="lab_input_var">lab_input</variable></variables>
  <block type="xeduhub_workflow_create_var" id="{slug}_flow" x="28" y="28">
    <field name="TASK_ID">{task_id}</field>
    <field name="MODEL_VAR">lab_flow</field>
    <next>
      <block type="xeduhub_load_image_to_var" id="{slug}_input">
        <field name="INPUT">{VIDEO_FAMILY_DEFAULTS.get(str(task.get("family") or ""), "demo.mp4") if variant == 'video' else IMAGE_FAMILY_DEFAULTS.get(str(task.get("family") or ""), "demo.jpg")}</field>
        <field name="IMAGE_VAR" id="lab_input_var">lab_input</field>
        <next>
          <block type="xeduhub_show_result_card" id="{slug}_show">
            <field name="TITLE">{title}</field>
          </block>
        </next>
      </block>
    </next>
  </block>
</xml>
"""
    workspace_path.write_text(xml, encoding="utf-8")
    return workspace_path


def write_python_snapshot(workspace_path: Path) -> None:
    result = subprocess.run(
        ["node", str(GENERATOR), str(workspace_path)],
        cwd=str(REPO_ROOT),
        capture_output=True,
        text=True,
        check=True,
    )
    payload = json.loads(result.stdout)
    python_path = workspace_path.with_suffix("").with_suffix(".py")
    python_path.write_text(str(payload["generated_python"]).rstrip() + "\n", encoding="utf-8")


def main() -> int:
    SMOKE_DIR.mkdir(parents=True, exist_ok=True)
    supported_runtime_tasks = set(_get_runtime_supported_tasks())
    all_task_ids = sorted(TASK_REGISTRY)

    for stale in sorted(SMOKE_DIR.glob("xeduhub_task_*.blockly.xml")):
        stale.unlink(missing_ok=True)
        stale.with_suffix("").with_suffix(".py").unlink(missing_ok=True)

    written = 0
    for task_id in all_task_ids:
        task = TASK_REGISTRY[task_id]
        workspace_path = write_workspace(task_id, task["label"], variant="image")
        write_python_snapshot(workspace_path)
        written += 1
        if task["family"] in VISUAL_FAMILIES:
            video_workspace = write_workspace(task_id, f"{task['label']} 视频", variant="video")
            write_python_snapshot(video_workspace)
            written += 1
    supported_task_ids = [
        task_id
        for task_id in all_task_ids
        if _resolve_runtime_task_id(task_id) in supported_runtime_tasks
    ]
    print(f"Seeded {written} XEdu task workspaces in {SMOKE_DIR} ({len(supported_task_ids)} runtime-supported tasks)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
