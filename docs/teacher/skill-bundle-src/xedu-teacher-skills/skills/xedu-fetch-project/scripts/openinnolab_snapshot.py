#!/usr/bin/env python3
"""Validate an OpenInnoLab native export and create an XEdu source snapshot."""

from __future__ import annotations

import argparse
import ctypes
import errno
import hashlib
import json
import os
import re
import shutil
import stat
import sys
import tempfile
import zipfile
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath
from typing import NamedTuple
from urllib.parse import parse_qs, urlencode, urlparse


TRUSTED_HOSTS = {"openinnolab.org.cn", "www.openinnolab.org.cn"}
PROJECT_ID_PATTERN = re.compile(r"^[0-9a-f]{24}$")
ROUTE_KINDS = {
    "/pjlab/project": "project",
    "/lab/project-standalone/senseinnoblocks": "senseinnoblocks",
    "/lab/project-standalone/senseinnoblocks/": "senseinnoblocks",
}
SECRET_KEY_PARTS = (
    "authorization",
    "cookie",
    "credential",
    "password",
    "secret",
    "session",
    "token",
)
RESERVED_ARTIFACT_NAMES = {
    "course.json",
    "source-manifest.json",
    "source-metadata.json",
}
MAX_PROJECT_JSON_BYTES = 16 * 1024 * 1024
MAX_NOTEBOOK_JSON_BYTES = 128 * 1024 * 1024
MAX_ARCHIVE_MEMBERS = 10_000
MAX_ARCHIVE_UNCOMPRESSED_BYTES = 512 * 1024 * 1024
WINDOWS_DRIVE_PATTERN = re.compile(r"^[A-Za-z]:")


class SnapshotError(ValueError):
    """Raised when input cannot form a trustworthy source snapshot."""


class ProjectLink(NamedTuple):
    project_id: str
    route_kind: str
    canonical_url: str


def parse_project_url(url: str) -> ProjectLink:
    """Parse a supported OpenInnoLab project link without navigation noise."""
    if not isinstance(url, str) or not url.strip():
        raise SnapshotError("OpenInnoLab project URL is required")

    try:
        parsed = urlparse(url.strip())
        host = (parsed.hostname or "").lower()
    except ValueError as exc:
        raise SnapshotError("OpenInnoLab project URL is malformed") from exc
    if parsed.scheme != "https" or host not in TRUSTED_HOSTS:
        raise SnapshotError("Only HTTPS OpenInnoLab project URLs are supported")

    route_kind = ROUTE_KINDS.get(parsed.path)
    if route_kind is None:
        raise SnapshotError("Unsupported OpenInnoLab project route")

    project_ids = parse_qs(parsed.query, keep_blank_values=True).get("id", [])
    if len(project_ids) != 1 or not PROJECT_ID_PATTERN.fullmatch(project_ids[0]):
        raise SnapshotError("Project URL must contain one 24-character hexadecimal id")

    project_id = project_ids[0]
    canonical_path = (
        "/pjlab/project"
        if route_kind == "project"
        else "/lab/project-standalone/senseinnoblocks/"
    )
    canonical_url = (
        f"https://www.openinnolab.org.cn{canonical_path}?"
        f"{urlencode({'id': project_id})}"
    )
    return ProjectLink(project_id, route_kind, canonical_url)


def _reject_secret_keys(value, path="metadata") -> None:
    if isinstance(value, dict):
        for key, child in value.items():
            lowered = str(key).lower().replace("_", "").replace("-", "")
            if any(part in lowered for part in SECRET_KEY_PARTS):
                raise SnapshotError(f"Credential-shaped metadata key is forbidden: {path}.{key}")
            _reject_secret_keys(child, f"{path}.{key}")
    elif isinstance(value, list):
        for index, child in enumerate(value):
            _reject_secret_keys(child, f"{path}[{index}]")


def _source_kind(project_type: str, route_kind: str) -> str:
    if project_type == "NOTEBOOK" and route_kind == "project":
        return "openinnolab-jupyter"
    if project_type == "SCRATCH" and route_kind == "senseinnoblocks":
        return "openinnolab-senseinnoblocks"
    raise SnapshotError(
        f"OpenInnoLab project type {project_type!r} does not match {route_kind!r} route"
    )


def normalize_project_metadata(payload: dict, link: ProjectLink) -> dict:
    """Select stable provenance fields and reject credentials or mismatches."""
    if not isinstance(payload, dict):
        raise SnapshotError("Project metadata must be a JSON object")
    if str(payload.get("errorCode") or "") != "1000":
        code = str(payload.get("errorCode") or "unknown")
        message = str(payload.get("errorMsg") or "OpenInnoLab metadata request failed")
        raise SnapshotError(f"OpenInnoLab error {code}: {message}")

    data = payload.get("data")
    if not isinstance(data, dict):
        raise SnapshotError("OpenInnoLab metadata response has no project data")
    _reject_secret_keys(data)

    project_id = str(data.get("id") or "")
    if project_id != link.project_id:
        raise SnapshotError("Project metadata id does not match the supplied URL")

    project_type = str(data.get("type") or "").upper()
    source_kind = _source_kind(project_type, link.route_kind)
    tags = data.get("userTags")
    if not isinstance(tags, list):
        tags = []

    return {
        "provider": "openinnolab",
        "source_url": link.canonical_url,
        "project_id": project_id,
        "source_kind": source_kind,
        "title": str(data.get("title") or "").strip(),
        "description": str(data.get("description") or "").strip(),
        "creator": str(data.get("creator") or "").strip(),
        "project_type": project_type,
        "run_env": str(data.get("runEnv") or "").upper(),
        "framework": str(data.get("framework") or "").upper(),
        "is_private": bool(data.get("isPrivate")),
        "source_updated_at_ms": data.get("updateTimeStamp"),
        "tags": [str(tag) for tag in tags if str(tag).strip()],
    }


def _read_json(path: Path) -> dict:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise SnapshotError(f"Unable to read JSON metadata: {path.name}") from exc


def _read_safe_zip_members(
    path: Path,
    label: str,
    capture_member,
    capture_limit: int,
    allow_empty_root_marker: bool = False,
    process_captured=None,
) -> tuple[dict[str, zipfile.ZipInfo], dict[str, object]]:
    """Validate every ZIP member and retain only files needed for format checks."""
    try:
        with zipfile.ZipFile(path) as archive:
            members = archive.infolist()
            if len(members) > MAX_ARCHIVE_MEMBERS:
                raise SnapshotError(f"{label} contains too many members")

            canonical_members = {}
            directory_members = set()
            total_uncompressed = 0
            for member in members:
                raw_name = member.filename
                is_root_marker = (
                    allow_empty_root_marker
                    and raw_name == "/"
                    and member.is_dir()
                    and member.file_size == 0
                )
                if "\\" in raw_name:
                    raise SnapshotError(f"Unsafe path in {label}: {raw_name}")
                if is_root_marker:
                    canonical_name = "/"
                else:
                    normalized_name = raw_name.rstrip("/") if member.is_dir() else raw_name
                    member_path = PurePosixPath(normalized_name)
                    if (
                        not normalized_name
                        or not member_path.parts
                        or normalized_name.startswith("/")
                        or WINDOWS_DRIVE_PATTERN.match(normalized_name)
                        or ".." in member_path.parts
                    ):
                        raise SnapshotError(f"Unsafe path in {label}: {raw_name}")
                    canonical_name = member_path.as_posix()
                    if canonical_name != normalized_name:
                        raise SnapshotError(f"Ambiguous path in {label}: {raw_name}")

                if canonical_name in canonical_members:
                    raise SnapshotError(f"Ambiguous path in {label}: {raw_name}")
                canonical_members[canonical_name] = member

                if member.flag_bits & 0x1:
                    raise SnapshotError(f"Encrypted member in {label}: {raw_name}")
                named_as_directory = member.is_dir()
                if member.create_system == 3:
                    file_type = stat.S_IFMT((member.external_attr >> 16) & 0xFFFF)
                    if file_type not in (0, stat.S_IFREG, stat.S_IFDIR):
                        raise SnapshotError(f"Special file in {label}: {raw_name}")
                    typed_as_directory = file_type == stat.S_IFDIR
                    if file_type and typed_as_directory != named_as_directory:
                        raise SnapshotError(
                            f"File type does not match path in {label}: {raw_name}"
                        )
                if named_as_directory:
                    if member.file_size != 0:
                        raise SnapshotError(f"Directory contains data in {label}: {raw_name}")
                    directory_members.add(id(member))

                total_uncompressed += member.file_size
                if total_uncompressed > MAX_ARCHIVE_UNCOMPRESSED_BYTES:
                    raise SnapshotError(f"{label} expands beyond the safety limit")

            captured = {}
            bytes_read = 0
            for canonical_name, member in canonical_members.items():
                if id(member) in directory_members:
                    continue
                should_capture = capture_member(canonical_name)
                chunks = []
                member_bytes = 0
                with archive.open(member, "r") as handle:
                    while True:
                        chunk = handle.read(1024 * 1024)
                        if not chunk:
                            break
                        member_bytes += len(chunk)
                        bytes_read += len(chunk)
                        if bytes_read > MAX_ARCHIVE_UNCOMPRESSED_BYTES:
                            raise SnapshotError(f"{label} expands beyond the safety limit")
                        if should_capture:
                            if member_bytes > capture_limit:
                                raise SnapshotError(
                                    f"Validation file is unexpectedly large in {label}: "
                                    f"{canonical_name}"
                                )
                            chunks.append(chunk)
                if member_bytes != member.file_size:
                    raise SnapshotError(f"Truncated member in {label}: {member.filename}")
                if should_capture:
                    content = b"".join(chunks)
                    captured[canonical_name] = (
                        process_captured(canonical_name, content)
                        if process_captured is not None
                        else content
                    )
            return canonical_members, captured
    except SnapshotError:
        raise
    except (
        EOFError,
        NotImplementedError,
        OSError,
        RuntimeError,
        zipfile.BadZipFile,
        zipfile.LargeZipFile,
    ) as exc:
        raise SnapshotError(f"{label} is not a readable ZIP") from exc


def _validate_senseinnoblocks_artifact(path: Path) -> dict:
    if path.suffix.lower() != ".ib":
        raise SnapshotError("SenseInnoBlocks native export must use the .ib suffix")

    members, captured = _read_safe_zip_members(
        path,
        "SenseInnoBlocks export",
        lambda name: name == "project.json",
        MAX_PROJECT_JSON_BYTES,
    )
    if "project.json" not in members:
        raise SnapshotError("SenseInnoBlocks export must contain one root project.json")

    try:
        project = json.loads(captured["project.json"].decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise SnapshotError("SenseInnoBlocks project.json is not valid JSON") from exc
    if not isinstance(project, dict):
        raise SnapshotError("SenseInnoBlocks project.json must be a JSON object")
    if not isinstance(project.get("targets"), list):
        raise SnapshotError("SenseInnoBlocks project.json has no targets list")
    if not isinstance(project.get("extensions", []), list):
        raise SnapshotError("SenseInnoBlocks project.json has an invalid extensions list")
    return {"profile": "senseinnoblocks-ib"}


def _validate_notebook_document(content: bytes, name: str) -> None:
    try:
        notebook = json.loads(content.decode("utf-8-sig"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise SnapshotError(f"Jupyter notebook is not valid JSON: {name}") from exc
    if not isinstance(notebook, dict):
        raise SnapshotError(f"Jupyter notebook must be a JSON object: {name}")
    if type(notebook.get("nbformat")) is not int or notebook["nbformat"] < 1:
        raise SnapshotError(f"Jupyter notebook has an invalid nbformat: {name}")
    if type(notebook.get("nbformat_minor")) is not int or notebook["nbformat_minor"] < 0:
        raise SnapshotError(f"Jupyter notebook has an invalid nbformat_minor: {name}")
    if not isinstance(notebook.get("metadata"), dict):
        raise SnapshotError(f"Jupyter notebook has invalid metadata: {name}")
    cells = notebook.get("cells")
    if not isinstance(cells, list):
        raise SnapshotError(f"Jupyter notebook has no cells list: {name}")
    for index, cell in enumerate(cells):
        if not isinstance(cell, dict):
            raise SnapshotError(f"Jupyter notebook cell {index} is not an object: {name}")
        cell_type = cell.get("cell_type")
        if cell_type not in {"code", "markdown", "raw"}:
            raise SnapshotError(f"Jupyter notebook cell {index} has no type: {name}")
        if not isinstance(cell.get("metadata"), dict):
            raise SnapshotError(
                f"Jupyter notebook cell {index} has invalid metadata: {name}"
            )
        source = cell.get("source")
        if not (
            isinstance(source, str)
            or isinstance(source, list)
            and all(isinstance(line, str) for line in source)
        ):
            raise SnapshotError(f"Jupyter notebook cell {index} has invalid source: {name}")
        if cell_type == "code":
            execution_count = cell.get("execution_count")
            if execution_count is not None and type(execution_count) is not int:
                raise SnapshotError(
                    f"Jupyter notebook code cell {index} has invalid execution_count: {name}"
                )
            if not isinstance(cell.get("outputs"), list):
                raise SnapshotError(
                    f"Jupyter notebook code cell {index} has no outputs list: {name}"
                )


def _validate_jupyter_artifact(path: Path) -> dict:
    if path.suffix.lower() != ".zip":
        raise SnapshotError("OpenInnoLab Jupyter native export must use the .zip suffix")

    _, notebooks = _read_safe_zip_members(
        path,
        "OpenInnoLab Jupyter export",
        lambda name: name.lower().endswith(".ipynb"),
        MAX_NOTEBOOK_JSON_BYTES,
        allow_empty_root_marker=True,
        process_captured=lambda name, content: _validate_notebook_document(
            content, name
        ),
    )
    if not notebooks:
        raise SnapshotError("OpenInnoLab Jupyter export contains no .ipynb notebook")
    return {"profile": "jupyter-project-zip", "notebook_count": len(notebooks)}


def _validate_artifact(path: Path, source_kind: str) -> dict:
    if not path.is_file() or path.is_symlink():
        raise SnapshotError("Native export must be a regular file")
    if path.name in RESERVED_ARTIFACT_NAMES or path.name in {"", ".", ".."}:
        raise SnapshotError(f"Reserved native export name: {path.name}")

    size = path.stat().st_size
    if size <= 0:
        raise SnapshotError("Native export is empty")

    with path.open("rb") as handle:
        prefix = handle.read(4096)
    normalized = prefix.lstrip().lower()
    if normalized.startswith((b"<!doctype html", b"<html", b"<head", b"<body")):
        raise SnapshotError("Native export is an HTML page, not project source")

    if normalized.startswith(b"{"):
        error_payload = None
        if size <= MAX_PROJECT_JSON_BYTES:
            try:
                error_payload = json.loads(path.read_text(encoding="utf-8"))
            except (UnicodeDecodeError, json.JSONDecodeError):
                pass
        if isinstance(error_payload, dict) and "errorCode" in error_payload:
            code = str(error_payload.get("errorCode") or "unknown")
            if code != "1000":
                message = str(error_payload.get("errorMsg") or "export failed")
                raise SnapshotError(f"OpenInnoLab export error {code}: {message}")

    if source_kind == "openinnolab-senseinnoblocks":
        validation = _validate_senseinnoblocks_artifact(path)
    elif source_kind == "openinnolab-jupyter":
        validation = _validate_jupyter_artifact(path)
    else:
        raise SnapshotError(f"Unsupported OpenInnoLab source kind: {source_kind}")
    return {"bytes": size, **validation}


def _copy_and_hash(source: Path, destination: Path) -> tuple[int, str]:
    digest = hashlib.sha256()
    total = 0
    with source.open("rb") as input_handle, destination.open("xb") as output_handle:
        while True:
            chunk = input_handle.read(1024 * 1024)
            if not chunk:
                break
            output_handle.write(chunk)
            digest.update(chunk)
            total += len(chunk)
    return total, digest.hexdigest()


def _hash_file(path: Path) -> tuple[int, str]:
    digest = hashlib.sha256()
    total = 0
    with path.open("rb") as handle:
        while True:
            chunk = handle.read(1024 * 1024)
            if not chunk:
                break
            digest.update(chunk)
            total += len(chunk)
    return total, digest.hexdigest()


def _write_json(path: Path, payload: dict) -> None:
    path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


def _utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _raise_rename_error(error_number: int, destination: Path) -> None:
    if error_number in (errno.EEXIST, errno.ENOTEMPTY):
        raise SnapshotError(f"Snapshot destination already exists: {destination.name}")
    raise OSError(error_number, os.strerror(error_number), str(destination))


def _rename_no_replace(source: Path, destination: Path) -> None:
    """Atomically rename a directory only when the destination name is unused."""
    source_bytes = os.fsencode(source)
    destination_bytes = os.fsencode(destination)

    if sys.platform == "darwin":
        libc = ctypes.CDLL(None, use_errno=True)
        rename_exclusive = libc.renamex_np
        rename_exclusive.argtypes = [ctypes.c_char_p, ctypes.c_char_p, ctypes.c_uint]
        rename_exclusive.restype = ctypes.c_int
        if rename_exclusive(source_bytes, destination_bytes, 0x00000004) == 0:
            return
        _raise_rename_error(ctypes.get_errno(), destination)

    if sys.platform.startswith("linux"):
        libc = ctypes.CDLL(None, use_errno=True)
        rename_no_replace = getattr(libc, "renameat2", None)
        if rename_no_replace is None:
            raise SnapshotError("Atomic no-replace rename is unavailable on this system")
        rename_no_replace.argtypes = [
            ctypes.c_int,
            ctypes.c_char_p,
            ctypes.c_int,
            ctypes.c_char_p,
            ctypes.c_uint,
        ]
        rename_no_replace.restype = ctypes.c_int
        if rename_no_replace(-100, source_bytes, -100, destination_bytes, 0x1) == 0:
            return
        _raise_rename_error(ctypes.get_errno(), destination)

    if os.name == "nt":
        try:
            os.rename(source, destination)
            return
        except FileExistsError as exc:
            raise SnapshotError(
                f"Snapshot destination already exists: {destination.name}"
            ) from exc

    raise SnapshotError("Atomic no-replace rename is unavailable on this system")


def create_snapshot(
    source_url: str,
    metadata_path,
    artifact_path,
    output_dir,
    fetched_at: str | None = None,
) -> dict:
    """Create an atomic, credential-free source snapshot."""
    link = parse_project_url(source_url)
    metadata_file = Path(metadata_path)
    artifact = Path(artifact_path)
    output = Path(output_dir)

    if os.path.lexists(output):
        raise SnapshotError(f"Snapshot destination already exists: {output.name}")
    metadata = normalize_project_metadata(_read_json(metadata_file), link)
    source_validation = _validate_artifact(artifact, metadata["source_kind"])

    output.parent.mkdir(parents=True, exist_ok=True)
    temp_dir = Path(
        tempfile.mkdtemp(prefix=f".{output.name}.tmp-", dir=str(output.parent))
    )
    committed = False
    try:
        raw_dir = temp_dir / "raw"
        raw_dir.mkdir()
        artifact_relative = Path("raw") / artifact.name
        copied_artifact = temp_dir / artifact_relative
        copied_size, copied_sha256 = _copy_and_hash(artifact, copied_artifact)
        staged_validation = _validate_artifact(
            copied_artifact, metadata["source_kind"]
        )
        staged_size, staged_sha256 = _hash_file(copied_artifact)
        source_size, source_sha256 = _hash_file(artifact)
        if (
            source_validation != staged_validation
            or staged_validation["bytes"] != copied_size
            or staged_size != copied_size
            or source_size != copied_size
            or staged_sha256 != copied_sha256
            or source_sha256 != copied_sha256
        ):
            raise SnapshotError("Native export changed while the snapshot was being created")

        source_metadata = dict(metadata)
        source_metadata["fetched_at"] = fetched_at or _utc_now()
        _write_json(temp_dir / "source-metadata.json", source_metadata)

        handoff = {
            "version": 2,
            "route": "xedu-package-course",
            "intent": "convert",
            "input_type": "source-snapshot",
            "form": (
                "scratch"
                if metadata["source_kind"] == "openinnolab-senseinnoblocks"
                else "jupyter"
            ),
            "target_ref": "source-manifest.json",
            "constraints": ["preserve-source-artifact"],
            "next_action": "Inspect and convert this source snapshot with xedu-package-course.",
        }
        if metadata["source_kind"] == "openinnolab-senseinnoblocks":
            handoff["constraints"].extend(
                [
                    "scratch-compatibility-report-required",
                    "block-on-unsupported-opcode",
                ]
            )
        else:
            handoff["constraints"].extend(
                [
                    "inspect-notebook-entrypoints",
                    "inspect-python-dependencies",
                    "inspect-runtime-services",
                    "inspect-local-assets",
                ]
            )

        manifest = {
            "schema": "xedu-source-snapshot/v1",
            "source": {
                "provider": metadata["provider"],
                "url": metadata["source_url"],
                "project_id": metadata["project_id"],
                "kind": metadata["source_kind"],
            },
            "snapshot": {
                "fetched_at": source_metadata["fetched_at"],
                "metadata": "source-metadata.json",
                "artifact": {
                    "path": artifact_relative.as_posix(),
                    "bytes": copied_size,
                    "sha256": staged_sha256,
                    "validation": {
                        key: value
                        for key, value in staged_validation.items()
                        if key != "bytes"
                    },
                },
            },
            "xedu_handoff": handoff,
        }
        _write_json(temp_dir / "source-manifest.json", manifest)

        _rename_no_replace(temp_dir, output)
        committed = True
        return manifest
    finally:
        if not committed and temp_dir.exists():
            shutil.rmtree(temp_dir)


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Validate OpenInnoLab exports and create XEdu source snapshots."
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    inspect_url = subparsers.add_parser("inspect-url")
    inspect_url.add_argument("url")

    inspect_metadata = subparsers.add_parser("inspect-metadata")
    inspect_metadata.add_argument("--url", required=True)
    inspect_metadata.add_argument("--metadata", required=True)

    snapshot_parser = subparsers.add_parser("snapshot")
    snapshot_parser.add_argument("--url", required=True)
    snapshot_parser.add_argument("--metadata", required=True)
    snapshot_parser.add_argument("--artifact", required=True)
    snapshot_parser.add_argument("--output", required=True)
    snapshot_parser.add_argument("--fetched-at")
    return parser


def main(argv=None) -> int:
    args = _build_parser().parse_args(argv)
    try:
        if args.command == "inspect-url":
            link = parse_project_url(args.url)
            payload = link._asdict()
        elif args.command == "inspect-metadata":
            link = parse_project_url(args.url)
            payload = normalize_project_metadata(_read_json(Path(args.metadata)), link)
        else:
            payload = create_snapshot(
                args.url,
                args.metadata,
                args.artifact,
                args.output,
                fetched_at=args.fetched_at,
            )
        print(json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True))
        return 0
    except SnapshotError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
