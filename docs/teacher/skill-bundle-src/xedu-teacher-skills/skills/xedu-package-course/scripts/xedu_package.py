#!/usr/bin/env python3
"""Deterministically inspect, stage, and build XEdu course-content ZIPs."""

from __future__ import annotations

import argparse
import hashlib
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
MAX_PACKAGE_MEMBERS = 10000
MAX_PACKAGE_BYTES = 512 * 1024 * 1024


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
    if (
        value != value.strip()
        or "\\" in value
        or value.startswith("/")
        or any(char in value for char in "?#")
    ):
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
        return (
            item
            if item.strip()
            and "://" not in item
            and not item.lstrip().lower().startswith("data:")
            else None
        )
    if isinstance(item, dict):
        for key in ("path", "file", "url"):
            value = item.get(key)
            if (
                isinstance(value, str)
                and value.strip()
                and "://" not in value
                and not value.lstrip().lower().startswith("data:")
            ):
                return value
    return None


def experiment_reference_items(experiment: dict) -> list[tuple[str, str]]:
    rows = []
    for key in ("entry", "entry_file", "cover", "cover_url"):
        value = experiment.get(key)
        reference = file_reference(value)
        if reference:
            rows.append((reference, ""))
    def add_item(item):
        reference = file_reference(item)
        if reference:
            declared_type = item.get("type", "") if isinstance(item, dict) else ""
            rows.append((reference, str(declared_type or "").lower()))
        if isinstance(item, dict) and isinstance(item.get("children"), list):
            for child in item["children"]:
                add_item(child)

    for item in experiment.get("files", []):
        add_item(item)
    deduplicated = {}
    for path, kind in rows:
        if path not in deduplicated or (not deduplicated[path] and kind):
            deduplicated[path] = kind
    return list(deduplicated.items())


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
            references.extend(path for path, _kind in experiment_reference_items(experiment))
    return list(dict.fromkeys(references))


def experiment_reference_rows(course: dict, root: Path) -> list[dict]:
    rows = []
    for section_index, section in enumerate(course.get("sections", []), 1):
        for experiment_index, experiment in enumerate(section.get("experiments", []), 1):
            raw_references = []
            typed_references = experiment_reference_items(experiment)
            raw_references.extend(path for path, _kind in typed_references)
            refs = list(dict.fromkeys(raw_references))
            declared_types = dict(typed_references)
            resources = []
            missing = []
            forms = set()
            for reference in refs:
                relative = safe_relative(reference)
                source = root.joinpath(*relative.parts)
                exists = source.exists()
                if exists:
                    ensure_plain_path(source, root)
                    form = resource_form(reference, declared_types.get(reference, ""))
                    forms.add(form)
                else:
                    form = resource_form(reference, declared_types.get(reference, ""))
                    missing.append(reference)
                resources.append({"path": reference, "form": form, "exists": exists})
            rows.append({
                "id": str(experiment.get("id") or f"experiment-{section_index}-{experiment_index}"),
                "title": str(experiment.get("title") or ""),
                "status": (
                    "missing-assets" if missing
                    else "resources-present" if resources
                    else "no-local-resources"
                ),
                "forms": sorted(forms),
                "resources": resources,
                "missing_assets": missing,
            })
    return rows


def resource_form(path: str, declared_type: str = "") -> str:
    suffix = PurePosixPath(path).suffix.lower()
    lower_path = path.lower()
    kind = (declared_type or "").lower()
    if kind == "scratch" or suffix == ".sb3":
        return "scratch"
    if kind == "blockly" or lower_path.endswith((".blockly.xml", ".blockly.json")):
        return "blockly"
    if kind in {"html", "ipynb"}:
        return kind
    if suffix in {".html", ".htm"}:
        return "html"
    if suffix == ".ipynb":
        return "ipynb"
    return "material"


def expand_references(root: Path, references: list[str]) -> tuple[list[tuple[Path, str]], list[str]]:
    root = root.resolve()
    files = [(root / "course.json", "course.json")]
    seen = {"course.json"}
    missing = []
    for reference in references:
        relative = safe_relative(reference)
        source = root.joinpath(*relative.parts)
        if not source.exists():
            missing.append(reference)
            continue
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
    return files, missing


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
    experiment_rows = experiment_reference_rows(course, root)
    missing_assets = list(dict.fromkeys(
        [path for row in experiment_rows for path in row["missing_assets"]]
    ))
    files, missing_references = expand_references(root, references)
    missing_assets = list(dict.fromkeys([*missing_assets, *missing_references]))
    scratch = []
    for source, name in files:
        if source.suffix.lower() in {".sb3", ".ib"}:
            scratch.append({"path": name, **validate_scratch_archive(source)})
    return {
        "input_type": "course-root",
        "course_root": str(root),
        "course_id": str(course.get("id") or ""),
        "title": course["title"],
        "version": str(course.get("version") or ""),
        "referenced_paths": references,
        "package_files": [name for _, name in files],
        "resource_status_by_experiment": experiment_rows,
        "scratch_validation": scratch,
        "legacy_blockly_gaps": [
            name for source, name in files
            if source.name.lower().endswith((".blockly.xml", ".blockly.json"))
        ],
        "missing_assets": missing_assets,
        "recommended_next_action": "stop_with_gaps" if missing_assets else "stage_for_pack",
        "version_policy": "preserved; packaging does not increment or rewrite course.json version",
    }


def inspect_package(path: Path) -> dict:
    path = path.resolve()
    if not path.is_file() or path.suffix.lower() != ".zip":
        raise PackageError(f"Package input must be a readable .zip file: {path}")
    try:
        with zipfile.ZipFile(path) as archive:
            infos = archive.infolist()
            if len(infos) > MAX_PACKAGE_MEMBERS:
                raise PackageError(f"Course package has too many members: {len(infos)}")
            names = []
            total_size = 0
            for info in infos:
                name = info.filename
                normalized = name[:-1] if name.endswith("/") else name
                if (
                    not normalized
                    or "\\" in name
                    or name.startswith("/")
                    or WINDOWS_DRIVE.match(name)
                    or any(part in {"", ".", ".."} for part in normalized.split("/"))
                    or any(char in name for char in "?#")
                ):
                    raise PackageError(f"Unsafe course package member: {name}")
                if name in names:
                    raise PackageError(f"Duplicate course package member: {name}")
                names.append(name)
                total_size += info.file_size
                if total_size > MAX_PACKAGE_BYTES:
                    raise PackageError("Course package expands beyond the 512 MB safety limit")
                if info.flag_bits & 1:
                    raise PackageError(f"Encrypted course package member: {name}")
                if info.create_system == 3:
                    kind = stat.S_IFMT((info.external_attr >> 16) & 0xFFFF)
                    if kind not in (0, stat.S_IFREG, stat.S_IFDIR):
                        raise PackageError(f"Special course package member: {name}")
            if "course.json" not in names:
                raise PackageError("XEdu course package requires root-level course.json")
            file_names = {info.filename for info in infos if not info.is_dir()}
            directory_names = {info.filename.rstrip("/") for info in infos if info.is_dir()}
            conflicts = file_names & directory_names
            if conflicts:
                raise PackageError(f"Course package has file/directory path conflicts: {sorted(conflicts)}")
            for name in file_names:
                parts = PurePosixPath(name).parts
                if any("/".join(parts[:index]) in file_names for index in range(1, len(parts))):
                    raise PackageError(f"Course package file is also used as a directory: {name}")
            bad_member = archive.testzip()
            if bad_member:
                raise PackageError(f"Course package ZIP integrity check failed at: {bad_member}")
            file_names = [info.filename for info in infos if not info.is_dir()]
            with tempfile.TemporaryDirectory(prefix="xedu-package-inspect-") as temp_dir:
                extraction_root = Path(temp_dir)
                try:
                    archive.extractall(extraction_root)
                except (OSError, RuntimeError, ValueError) as exc:
                    raise PackageError("Course package members cannot be safely extracted") from exc
                report = inspect_course(extraction_root)
            unreferenced = sorted(set(file_names) - set(report["package_files"]))
    except zipfile.BadZipFile as exc:
        raise PackageError(f"Unreadable XEdu course ZIP: {path}") from exc

    report["input_type"] = "pack-output"
    report["course_root"] = str(path)
    report["package_path"] = str(path)
    report["package_sha256"] = hashlib.sha256(path.read_bytes()).hexdigest()
    report["unreferenced_files"] = unreferenced
    report["verification"] = {
        "status": "passed" if not report["missing_assets"] else "failed",
        "zip_integrity": "passed",
        "course_json": "parsed",
        "referenced_resources": "missing" if report["missing_assets"] else "present",
        "unreferenced_files": len(unreferenced),
    }
    if report["missing_assets"]:
        report["recommended_next_action"] = "stop_with_gaps"
    elif unreferenced:
        report["recommended_next_action"] = "stage_for_pack"
    else:
        report["recommended_next_action"] = "publish"
    return report


def inspect_input(path: Path) -> dict:
    if path.is_dir():
        return inspect_course(path)
    if path.is_file() and path.suffix.lower() == ".zip":
        return inspect_package(path)
    raise PackageError(f"Inspect input must be a course directory or .zip file: {path}")


def reject_output(root: Path, output: Path) -> None:
    root = root.resolve()
    output = output.resolve()
    if output.exists():
        raise PackageError(f"Output already exists: {output}")
    if output == root or root in output.parents:
        raise PackageError("Output must not be inside the authoring course")


def stage_course(root: Path, output: Path) -> dict:
    report = inspect_course(root)
    if report["missing_assets"]:
        raise PackageError(f"Referenced resources do not exist: {report['missing_assets']}")
    root = root.resolve()
    reject_output(root, output)
    output = output.resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
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
    staged_report = inspect_course(output)
    if staged_report["missing_assets"]:
        shutil.rmtree(output, ignore_errors=True)
        raise PackageError(f"Staged course has missing resources: {staged_report['missing_assets']}")
    return {
        **report,
        "staged_path": str(output),
        "verification": {
            "status": "passed",
            "files": len(report["package_files"]),
            "referenced_resources": "present",
        },
        "recommended_next_action": "build_pack",
    }


def verify_built_package(path: Path, expected_files: list[str]) -> dict:
    try:
        with zipfile.ZipFile(path) as archive:
            names = archive.namelist()
            bad_member = archive.testzip()
            if bad_member:
                raise PackageError(f"ZIP integrity check failed at: {bad_member}")
            if len(names) != len(set(names)):
                raise PackageError("Built ZIP contains duplicate paths")
            if sorted(names) != sorted(expected_files):
                raise PackageError("Built ZIP content does not match inspection")
            try:
                course = json.loads(archive.read("course.json").decode("utf-8"))
            except (KeyError, UnicodeDecodeError, json.JSONDecodeError) as exc:
                raise PackageError("Built ZIP course.json cannot be parsed") from exc
            references = course_references(course)
            names_set = set(names)
            for reference in references:
                relative = safe_relative(reference).as_posix()
                exact = relative in names_set
                descendants = any(name.startswith(relative.rstrip("/") + "/") for name in names)
                if not exact and not descendants:
                    raise PackageError(f"Built ZIP is missing a declared resource: {reference}")
    except zipfile.BadZipFile as exc:
        raise PackageError("Built ZIP is unreadable") from exc
    return {
        "status": "passed",
        "files": len(expected_files),
        "zip_integrity": "passed",
        "course_json": "parsed",
        "referenced_resources": "present",
    }


def build_course(root: Path, output: Path) -> dict:
    report = inspect_course(root)
    if report["missing_assets"]:
        raise PackageError(f"Referenced resources do not exist: {report['missing_assets']}")
    root = root.resolve()
    reject_output(root, output)
    output = output.resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    handle, temporary_name = tempfile.mkstemp(prefix=f".{output.name}.tmp-", dir=output.parent)
    os.close(handle)
    temporary = Path(temporary_name)
    try:
        with zipfile.ZipFile(temporary, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
            for name in sorted(report["package_files"]):
                source = root.joinpath(*PurePosixPath(name).parts)
                info = zipfile.ZipInfo(name, (1980, 1, 1, 0, 0, 0))
                info.compress_type = zipfile.ZIP_DEFLATED
                info.external_attr = 0o100644 << 16
                archive.writestr(info, source.read_bytes())
        verification = verify_built_package(temporary, report["package_files"])
        digest = hashlib.sha256(temporary.read_bytes()).hexdigest()
        temporary.rename(output)
    except Exception:
        temporary.unlink(missing_ok=True)
        raise
    return {
        **report,
        "built_path": str(output),
        "sha256": digest,
        "verification": verification,
        "recommended_next_action": "publish",
    }


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
        if name == "inspect":
            command.add_argument(
                "--input",
                "--course-root",
                dest="input_path",
                type=Path,
                required=True,
                help="Course root directory or an existing XEdu .zip package",
            )
        else:
            command.add_argument("--course-root", type=Path, required=True)
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
            result = inspect_input(args.input_path)
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
