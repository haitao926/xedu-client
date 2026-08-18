#!/usr/bin/env python3
"""Build deterministic, individually installable XEdu skill ZIP files."""

from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import zipfile
from datetime import datetime, timezone
from pathlib import Path


SKILLS = (
    "xedu-build-course",
    "xedu-build-lab",
    "xedu-package-course",
    "xedu-fetch-project",
)
EXCLUDED_PARTS = {"__pycache__", ".DS_Store"}


def source_files(skill_dir: Path):
    for path in sorted(skill_dir.rglob("*")):
        if not path.is_file() or any(part in EXCLUDED_PARTS for part in path.parts):
            continue
        if path.suffix in {".pyc", ".pyo"}:
            continue
        yield path


def digest_files(skill_dir: Path, files) -> str:
    digest = hashlib.sha256()
    for path in files:
        relative = path.relative_to(skill_dir).as_posix().encode("utf-8")
        content = path.read_bytes()
        digest.update(len(relative).to_bytes(8, "big"))
        digest.update(relative)
        digest.update(len(content).to_bytes(8, "big"))
        digest.update(content)
    return digest.hexdigest()


def build_one(skill_dir: Path, output: Path) -> dict:
    files = list(source_files(skill_dir))
    if not files or not (skill_dir / "SKILL.md").is_file():
        raise ValueError(f"Invalid skill source: {skill_dir}")
    temporary = output.with_name(f".{output.name}.tmp")
    temporary.unlink(missing_ok=True)
    with zipfile.ZipFile(
        temporary,
        "w",
        compression=zipfile.ZIP_DEFLATED,
        compresslevel=9,
    ) as archive:
        for path in files:
            relative = path.relative_to(skill_dir).as_posix()
            archive_name = f"{skill_dir.name}/{relative}"
            info = zipfile.ZipInfo(archive_name, (1980, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            archive.writestr(info, path.read_bytes())
    with zipfile.ZipFile(temporary) as archive:
        bad_member = archive.testzip()
        if bad_member:
            raise ValueError(f"Corrupt ZIP member: {bad_member}")
        expected = [
            f"{skill_dir.name}/{path.relative_to(skill_dir).as_posix()}"
            for path in files
        ]
        if archive.namelist() != expected:
            raise ValueError(f"ZIP parity mismatch: {output.name}")
    temporary.replace(output)
    content = output.read_bytes()
    return {
        "name": output.name,
        "skill": skill_dir.name,
        "size": len(content),
        "sha256": hashlib.sha256(content).hexdigest(),
        "source_sha256": digest_files(skill_dir, files),
        "files": len(files),
    }


def git_sha(root: Path) -> str:
    result = subprocess.run(
        ["git", "rev-parse", "HEAD"],
        cwd=root,
        capture_output=True,
        text=True,
        check=False,
    )
    return result.stdout.strip() if result.returncode == 0 else ""


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--version", default="2.0.0")
    args = parser.parse_args(argv)

    source = args.source.resolve()
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    packages = []
    for name in SKILLS:
        packages.append(
            build_one(
                source / "skills" / name,
                output / f"{name}-{args.version}.zip",
            )
        )
    manifest = {
        "schema": "xedu-skill-packages/v1",
        "version": args.version,
        "created_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
        "commit": git_sha(source),
        "packages": packages,
    }
    manifest_path = output / f"xedu-teacher-skills-{args.version}.manifest.json"
    manifest_path.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(json.dumps(manifest, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
