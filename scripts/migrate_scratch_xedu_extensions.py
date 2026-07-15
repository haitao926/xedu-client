#!/usr/bin/env python3
"""Migrate Scratch projects from removed generic XEdu extensions to task extensions."""

from __future__ import annotations

import argparse
import copy
import json
import tempfile
import zipfile
from pathlib import Path


TASK_MIGRATIONS = {
    "det_body": {
        "extension_id": "xeduBodySensing",
        "command_opcode": "xeduBodySensing_detectBodies",
        "reporter_opcode": "xeduBodySensing_bodyLastResult",
    },
}
STAGE_SENSING_BLOCK_MIGRATIONS = {
    "xeduImageClassification_classifyImage": "xeduImageClassification_enableClassification",
    "xeduImageClassification_classificationLastResult": "xeduImageClassification_classificationLabel",
    "xeduObjectSensing_detectObjects": "xeduObjectSensing_enableObjectSensing",
    "xeduObjectSensing_objectLastResult": "xeduObjectSensing_objectCount",
    "xeduFaceSensing_detectFaces": "xeduFaceSensing_enableFaceSensing",
    "xeduFaceSensing_senseFacePoints": "xeduFaceSensing_enableFaceSensing",
    "xeduFaceSensing_faceLastResult": "xeduFaceSensing_faceDetected",
    "xeduBodySensing_detectBodies": "xeduBodySensing_enableBodySensing",
    "xeduBodySensing_senseBodyPose": "xeduBodySensing_enableBodySensing",
    "xeduBodySensing_bodyLastResult": "xeduBodySensing_bodyDetected",
    "xeduHandSensing_detectHands": "xeduHandSensing_enableHandSensing",
    "xeduHandSensing_senseHandPoints": "xeduHandSensing_enableHandSensing",
    "xeduHandSensing_handLastResult": "xeduHandSensing_handDetected",
    "xeduTextRecognition_readText": "xeduTextRecognition_enableTextRecognition",
    "xeduTextRecognition_textLastResult": "xeduTextRecognition_allRecognizedText",
    "xeduImageSegmentation_segmentImage": "xeduImageSegmentation_enableSegmentation",
    "xeduImageSegmentation_segmentationLastResult": "xeduImageSegmentation_segmentationFound",
    "xeduDepthSensing_senseDepth": "xeduDepthSensing_enableDepthSensing",
    "xeduDepthSensing_depthLastResult": "xeduDepthSensing_depthReady",
}
REMOVED_EXTENSION_IDS = {
    "xeduAI",
    "xeduVision",
    "xeduWorkflow",
    "xeduImage",
    "xeduMedia",
    "xeduMath",
    "xeduResults",
}
REMOVED_OPCODE_PREFIXES = tuple(f"{extension_id}_" for extension_id in REMOVED_EXTENSION_IDS)


def unique_block_id(blocks: dict, source_id: str) -> str:
    candidate = f"xedu-task-{source_id}"
    suffix = 1
    while candidate in blocks:
        candidate = f"xedu-task-{source_id}-{suffix}"
        suffix += 1
    return candidate


def insert_command_before_reporter(blocks: dict, reporter_id: str, command_opcode: str) -> None:
    reporter = blocks[reporter_id]
    parent_id = reporter.get("parent")
    if not parent_id or parent_id not in blocks:
        raise ValueError(f"积木 {reporter_id} 缺少可迁移的父积木")

    parent = blocks[parent_id]
    previous_id = parent.get("parent")
    command_id = unique_block_id(blocks, reporter_id)
    image_input = copy.deepcopy(reporter.get("inputs", {}).get("IMAGE", [1, [10, "demo.jpg"]]))
    command = {
        "opcode": command_opcode,
        "next": parent_id,
        "parent": previous_id,
        "inputs": {"IMAGE": image_input},
        "fields": {},
        "shadow": False,
        "topLevel": not previous_id,
    }

    if previous_id:
        previous = blocks.get(previous_id)
        if not previous or previous.get("next") != parent_id:
            raise ValueError(f"积木 {parent_id} 不在可迁移的命令链中")
        previous["next"] = command_id
        parent["topLevel"] = False
    else:
        command["x"] = parent.pop("x", 0)
        command["y"] = parent.pop("y", 0)
        parent["topLevel"] = False

    parent["parent"] = command_id
    reporter["opcode"] = TASK_MIGRATIONS["det_body"]["reporter_opcode"]
    reporter["inputs"] = {}
    reporter["fields"] = {}
    blocks[command_id] = command


def insert_command_before(blocks: dict, target_id: str, command_opcode: str) -> None:
    target = blocks[target_id]
    parent_id = target.get("parent")
    command_id = unique_block_id(blocks, target_id)
    command = {
        "opcode": command_opcode,
        "next": target_id,
        "parent": parent_id,
        "inputs": {},
        "fields": {},
        "shadow": False,
        "topLevel": not parent_id,
    }
    if parent_id:
        parent = blocks.get(parent_id)
        if not parent or parent.get("next") != target_id:
            raise ValueError(f"积木 {target_id} 不在可迁移的命令链中")
        parent["next"] = command_id
    else:
        command["x"] = target.pop("x", 0)
        command["y"] = target.pop("y", 0)
        target["topLevel"] = False
    target["parent"] = command_id
    blocks[command_id] = command


def remove_retired_extension_blocks(blocks: dict) -> bool:
    removed_ids = [
        block_id for block_id, block in blocks.items()
        if str(block.get("opcode") or "").startswith(REMOVED_OPCODE_PREFIXES)
    ]
    for block_id in removed_ids:
        block = blocks.get(block_id)
        if not block:
            continue
        parent_id = block.get("parent")
        next_id = block.get("next")
        parent = blocks.get(parent_id)
        if parent and parent.get("next") == block_id:
            parent["next"] = next_id
        if next_id in blocks:
            next_block = blocks[next_id]
            next_block["parent"] = parent_id
            if block.get("topLevel"):
                next_block["topLevel"] = True
                next_block["x"] = block.get("x", 0)
                next_block["y"] = block.get("y", 0)
        for container in blocks.values():
            inputs = container.get("inputs") or {}
            for name, input_value in list(inputs.items()):
                if isinstance(input_value, list) and block_id in input_value:
                    inputs.pop(name)
        blocks.pop(block_id, None)
    return bool(removed_ids)


def migrate_manifest(manifest: dict) -> bool:
    migrated_extensions: set[str] = set()
    migrated = False
    uses_stage_sensing = False
    for target in manifest.get("targets", []):
        blocks = target.get("blocks") or {}
        for block_id, block in list(blocks.items()):
            if block.get("opcode") != "xeduAI_runTask":
                continue
            task_id = str((block.get("fields") or {}).get("TASK", [""])[0] or "").strip()
            migration = TASK_MIGRATIONS.get(task_id)
            if not migration:
                raise ValueError(f"不支持迁移的 XEdu AI 任务: {task_id or '未指定'}")
            insert_command_before_reporter(blocks, block_id, migration["command_opcode"])
            migrated_extensions.add(migration["extension_id"])
            migrated = True
        for block in blocks.values():
            replacement = STAGE_SENSING_BLOCK_MIGRATIONS.get(block.get("opcode"))
            if not replacement:
                continue
            block["opcode"] = replacement
            block["inputs"] = {
                key: value for key, value in (block.get("inputs") or {}).items()
                if key != "IMAGE"
            }
            migrated = True
        migrated = remove_retired_extension_blocks(blocks) or migrated
        sensing_commands = [
            block_id for block_id, block in blocks.items()
            if str(block.get("opcode") or "").startswith("xedu")
            and "Sensing_enable" in str(block.get("opcode") or "")
        ]
        if sensing_commands:
            uses_stage_sensing = True
            if not any(block.get("opcode") == "xeduCamera_enableCamera" for block in blocks.values()):
                insert_command_before(blocks, sensing_commands[0], "xeduCamera_enableCamera")
                migrated = True

    extensions = [item for item in manifest.get("extensions", []) if item not in REMOVED_EXTENSION_IDS]
    for extension_id in sorted(migrated_extensions):
        if extension_id not in extensions:
            extensions.append(extension_id)
    if uses_stage_sensing and "xeduCamera" not in extensions:
        extensions.append("xeduCamera")
    if extensions != manifest.get("extensions", []):
        manifest["extensions"] = extensions
        migrated = True
    return migrated


def rewrite_project(project_path: Path) -> bool:
    with zipfile.ZipFile(project_path, "r") as source:
        entries = [(info, source.read(info.filename)) for info in source.infolist()]
    manifest_index = next((index for index, (info, _) in enumerate(entries) if info.filename == "project.json"), None)
    if manifest_index is None:
        raise ValueError("Scratch 项目缺少 project.json")

    info, data = entries[manifest_index]
    manifest = json.loads(data.decode("utf-8"))
    if not migrate_manifest(manifest):
        return False
    entries[manifest_index] = (info, json.dumps(manifest, ensure_ascii=False, separators=(",", ":")).encode("utf-8"))

    with tempfile.NamedTemporaryFile(dir=project_path.parent, delete=False) as temporary:
        temporary_path = Path(temporary.name)
    try:
        with zipfile.ZipFile(temporary_path, "w") as destination:
            for original_info, entry_data in entries:
                destination.writestr(original_info, entry_data)
        temporary_path.replace(project_path)
    finally:
        temporary_path.unlink(missing_ok=True)
    return True


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("roots", nargs="*", type=Path, default=[Path("backend/sasu"), Path("sasu")])
    args = parser.parse_args()
    projects = sorted({project for root in args.roots if root.exists() for project in root.rglob("*.sb3")})
    migrated = 0
    for project in projects:
        if rewrite_project(project):
            migrated += 1
            print(f"migrated {project}")
    print(f"migrated {migrated}/{len(projects)} Scratch projects")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
