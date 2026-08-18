#!/usr/bin/env python3
"""Inspect, stage, build, and audit Scratch resources for XEdu courses."""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import stat
import sys
import tempfile
import zipfile
from collections import Counter
from pathlib import Path, PurePosixPath
from typing import Optional


NATIVE_PREFIXES = (
    "control_", "data_", "event_", "looks_", "motion_", "operator_",
    "procedures_", "sensing_", "sound_",
)
WINDOWS_DRIVE = re.compile(r"^[A-Za-z]:")
MAX_ARCHIVE_MEMBERS = 10000
MAX_ARCHIVE_BYTES = 512 * 1024 * 1024


class PackageError(ValueError):
    pass


def read_json(path: Path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise PackageError(f"Unable to read JSON: {path}") from exc


def safe_relative(value: str) -> PurePosixPath:
    if not isinstance(value, str) or not value.strip():
        raise PackageError("Resource path is empty")
    if value != value.strip() or "\\" in value or value.startswith("/"):
        raise PackageError(f"Unsafe resource path: {value}")
    if WINDOWS_DRIVE.match(value):
        raise PackageError(f"Unsafe resource path: {value}")
    path = PurePosixPath(value)
    if not path.parts or any(part in {"", ".", ".."} for part in path.parts):
        raise PackageError(f"Unsafe resource path: {value}")
    if path.as_posix() != value.rstrip("/"):
        raise PackageError(f"Ambiguous resource path: {value}")
    return path


def ensure_plain_path(path: Path, root: Path) -> None:
    current = root
    for part in path.relative_to(root).parts:
        current = current / part
        if current.is_symlink():
            raise PackageError(f"Symlinks are not packageable: {current}")


def file_reference(item):
    if isinstance(item, str):
        return item
    if isinstance(item, dict):
        for key in ("path", "file", "url"):
            value = item.get(key)
            if isinstance(value, str) and value.strip() and "://" not in value:
                return value
    return None


def course_references(course: dict) -> list[str]:
    if not isinstance(course, dict):
        raise PackageError("course.json must contain an object")
    if not isinstance(course.get("title"), str) or not course["title"].strip():
        raise PackageError("course.json requires title")
    sections = course.get("sections")
    if not isinstance(sections, list):
        raise PackageError("course.json requires a sections array")
    references = []
    cover = course.get("cover") or course.get("cover_url")
    if isinstance(cover, str) and cover.strip() and "://" not in cover and not cover.startswith("data:"):
        references.append(cover)
    for section in sections:
        if not isinstance(section, dict):
            raise PackageError("Each section must be an object")
        experiments = section.get("experiments", [])
        if not isinstance(experiments, list):
            raise PackageError("Each section experiments value must be an array")
        for experiment in experiments:
            if not isinstance(experiment, dict):
                raise PackageError("Each experiment must be an object")
            files = experiment.get("files", [])
            if not isinstance(files, list):
                raise PackageError("Each experiment files value must be an array")
            for item in files:
                reference = file_reference(item)
                if reference:
                    references.append(reference)
    return list(dict.fromkeys(references))


def expand_references(root: Path, references: list[str]) -> list[tuple[Path, str]]:
    root = root.resolve()
    files = [(root / "course.json", "course.json")]
    seen = {"course.json"}
    for reference in references:
        relative = safe_relative(reference)
        source = root.joinpath(*relative.parts)
        if not source.exists():
            raise PackageError(f"Referenced resource does not exist: {reference}")
        ensure_plain_path(source, root)
        candidates = [source]
        if source.is_dir():
            candidates = sorted(
                path for path in source.rglob("*")
                if path.is_file() and not any(part.startswith(".") for part in path.relative_to(root).parts)
            )
        for candidate in candidates:
            ensure_plain_path(candidate, root)
            if not candidate.is_file():
                continue
            name = candidate.relative_to(root).as_posix()
            if name not in seen:
                seen.add(name)
                files.append((candidate, name))
    return files


def validate_scratch_archive(path: Path) -> dict:
    try:
        with zipfile.ZipFile(path) as archive:
            infos = archive.infolist()
            if len(infos) > MAX_ARCHIVE_MEMBERS:
                raise PackageError(f"Scratch archive has too many members: {path}")
            names = []
            total = 0
            for info in infos:
                name = info.filename
                if name in names or "\\" in name or name.startswith("/") or ".." in PurePosixPath(name).parts:
                    raise PackageError(f"Unsafe Scratch archive member: {name}")
                names.append(name)
                total += info.file_size
                if total > MAX_ARCHIVE_BYTES:
                    raise PackageError(f"Scratch archive expands beyond safety limit: {path}")
                if info.flag_bits & 1:
                    raise PackageError(f"Encrypted Scratch archive member: {name}")
                if info.create_system == 3:
                    kind = stat.S_IFMT((info.external_attr >> 16) & 0xFFFF)
                    if kind not in (0, stat.S_IFREG, stat.S_IFDIR):
                        raise PackageError(f"Special Scratch archive member: {name}")
            if names.count("project.json") != 1:
                raise PackageError(f"Scratch archive requires one root project.json: {path}")
            project = json.loads(archive.read("project.json").decode("utf-8"))
    except PackageError:
        raise
    except (OSError, UnicodeDecodeError, json.JSONDecodeError, zipfile.BadZipFile) as exc:
        raise PackageError(f"Unreadable Scratch archive: {path}") from exc
    if not isinstance(project, dict) or not isinstance(project.get("targets"), list):
        raise PackageError(f"Invalid Scratch project.json: {path}")
    extensions = project.get("extensions", [])
    if not isinstance(extensions, list):
        raise PackageError(f"Invalid Scratch extensions: {path}")
    opcodes = Counter()
    for target in project["targets"]:
        if not isinstance(target, dict):
            continue
        blocks = target.get("blocks", {})
        if not isinstance(blocks, dict):
            continue
        for block in blocks.values():
            if isinstance(block, dict) and isinstance(block.get("opcode"), str):
                opcodes[block["opcode"]] += 1
    return {"extensions": [str(item) for item in extensions], "opcodes": dict(sorted(opcodes.items()))}


def inspect_course(root: Path) -> dict:
    root = root.resolve()
    if not root.is_dir():
        raise PackageError(f"Course root is not a directory: {root}")
    course_path = root / "course.json"
    if not course_path.is_file() or course_path.is_symlink():
        raise PackageError("Course root requires a plain course.json file")
    course = read_json(course_path)
    references = course_references(course)
    files = expand_references(root, references)
    scratch = []
    for source, name in files:
        if source.suffix.lower() in {".sb3", ".ib"}:
            scratch.append({"path": name, **validate_scratch_archive(source)})
    return {
        "course_root": str(root),
        "course_id": str(course.get("id") or ""),
        "title": course["title"],
        "referenced_paths": references,
        "package_files": [name for _, name in files],
        "scratch": scratch,
    }


def reject_output(root: Path, output: Path) -> None:
    root = root.resolve()
    output = output.resolve()
    if output.exists():
        raise PackageError(f"Output already exists: {output}")
    if output == root or root in output.parents:
        raise PackageError("Output must not be inside the authoring course")


def stage_course(root: Path, output: Path) -> dict:
    report = inspect_course(root)
    root = root.resolve()
    reject_output(root, output)
    output = output.resolve()
    temporary = Path(tempfile.mkdtemp(prefix=f".{output.name}.tmp-", dir=output.parent))
    try:
        for name in report["package_files"]:
            source = root.joinpath(*PurePosixPath(name).parts)
            target = temporary.joinpath(*PurePosixPath(name).parts)
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, target)
        temporary.rename(output)
    except Exception:
        shutil.rmtree(temporary, ignore_errors=True)
        raise
    return {**report, "staged_path": str(output)}


def build_course(root: Path, output: Path) -> dict:
    report = inspect_course(root)
    root = root.resolve()
    reject_output(root, output)
    output = output.resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_name(f".{output.name}.tmp")
    if temporary.exists():
        raise PackageError(f"Temporary output already exists: {temporary}")
    try:
        with zipfile.ZipFile(temporary, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
            for name in sorted(report["package_files"]):
                source = root.joinpath(*PurePosixPath(name).parts)
                info = zipfile.ZipInfo(name, (1980, 1, 1, 0, 0, 0))
                info.compress_type = zipfile.ZIP_DEFLATED
                info.external_attr = 0o100644 << 16
                archive.writestr(info, source.read_bytes())
        with zipfile.ZipFile(temporary) as archive:
            if sorted(archive.namelist()) != sorted(report["package_files"]):
                raise PackageError("Built ZIP content does not match inspection")
            archive.testzip()
        temporary.rename(output)
    except Exception:
        temporary.unlink(missing_ok=True)
        raise
    return {**report, "built_path": str(output)}


def scratch_audit(
    project_path: Path,
    catalog_path: Path,
    mappings_path: Optional[Path],
) -> dict:
    inventory = validate_scratch_archive(project_path)
    catalog = read_json(catalog_path)
    mappings = read_json(mappings_path) if mappings_path else {"mappings": {}}
    catalog_extensions = catalog.get("extensions", {}) if isinstance(catalog, dict) else {}
    mapping_entries = mappings.get("mappings", {}) if isinstance(mappings, dict) else {}
    exact = set()
    runtime_by_opcode = {}
    for extension in catalog_extensions.values() if isinstance(catalog_extensions, dict) else []:
        if not isinstance(extension, dict):
            continue
        dependencies = [str(item) for item in extension.get("runtime_dependencies", [])]
        for opcode in extension.get("opcodes", []):
            exact.add(str(opcode))
            runtime_by_opcode[str(opcode)] = dependencies
    rows = []
    blocking = False
    for opcode, count in inventory["opcodes"].items():
        classifications = []
        targets = []
        conditions = []
        dependencies = []
        evidence = ""
        if opcode.startswith(NATIVE_PREFIXES):
            classifications.append("exact-match")
            targets = [opcode]
            evidence = "Scratch native opcode; verify signature in the target editor"
        elif opcode in exact:
            classifications.append("exact-match")
            targets = [opcode]
            dependencies = runtime_by_opcode.get(opcode, [])
            evidence = f"Current XEdu catalog: {catalog_path.name}"
        else:
            mapping = mapping_entries.get(opcode) if isinstance(mapping_entries, dict) else None
            if isinstance(mapping, dict) and mapping.get("target_opcodes") and mapping.get("evidence"):
                classifications.append("renamed-mappable")
                targets = [str(item) for item in mapping["target_opcodes"]]
                conditions = [str(item) for item in mapping.get("conditions", [])]
                dependencies = [str(item) for item in mapping.get("runtime_dependencies", [])]
                evidence = str(mapping["evidence"])
            else:
                classifications.append("unsupported")
                evidence = "No evidence-backed target opcode or mapping"
                blocking = True
        if dependencies:
            classifications.append("runtime-dependency")
        rows.append({
            "source_opcode": opcode,
            "count": count,
            "classifications": classifications,
            "target_opcodes": targets,
            "conditions": conditions,
            "runtime_dependencies": dependencies,
            "evidence": evidence,
        })
    return {
        "schema": "xedu-scratch-compatibility/v1",
        "source_artifact": project_path.name,
        "extensions": inventory["extensions"],
        "opcodes": rows,
        "blocking": blocking,
    }


def parser() -> argparse.ArgumentParser:
    root = argparse.ArgumentParser(description=__doc__)
    commands = root.add_subparsers(dest="command", required=True)
    for name in ("inspect", "stage", "build"):
        command = commands.add_parser(name)
        command.add_argument("--course-root", type=Path, required=True)
        if name != "inspect":
            command.add_argument("--output", type=Path, required=True)
    audit = commands.add_parser("scratch-audit")
    audit.add_argument("--project", type=Path, required=True)
    audit.add_argument("--catalog", type=Path, required=True)
    audit.add_argument("--mappings", type=Path)
    audit.add_argument("--output", type=Path)
    return root


def main(argv=None) -> int:
    args = parser().parse_args(argv)
    try:
        if args.command == "inspect":
            result = inspect_course(args.course_root)
        elif args.command == "stage":
            result = stage_course(args.course_root, args.output)
        elif args.command == "build":
            result = build_course(args.course_root, args.output)
        else:
            result = scratch_audit(args.project, args.catalog, args.mappings)
            if args.output:
                if args.output.exists():
                    raise PackageError(f"Output already exists: {args.output}")
                args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0
    except PackageError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
