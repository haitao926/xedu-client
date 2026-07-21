#!/usr/bin/env python3
import argparse
import json
import os
import platform
import shutil
import subprocess
import sys
import tarfile
import tempfile
import re
import zipfile
from pathlib import Path, PurePosixPath

PYTHON_VERSION = "3.12.8"
RELEASE_TAG = "20250106"
BASE_URL = "https://github.com/indygreg/python-build-standalone/releases/download"

TARGETS = {
    "darwin-x64": {
        "archive": f"cpython-{PYTHON_VERSION}+{RELEASE_TAG}-x86_64-apple-darwin-install_only.tar.gz",
        "platform": "darwin",
        "python_rel": ["bin/python3", "python3"],
    },
    "darwin-arm64": {
        "archive": f"cpython-{PYTHON_VERSION}+{RELEASE_TAG}-aarch64-apple-darwin-install_only.tar.gz",
        "platform": "darwin",
        "python_rel": ["bin/python3", "python3"],
    },
    "windows-x64": {
        "archive": f"python-{PYTHON_VERSION}-embed-amd64.zip",
        "archive_url": f"https://www.python.org/ftp/python/{PYTHON_VERSION}/python-{PYTHON_VERSION}-embed-amd64.zip",
        "archive_type": "zip",
        "platform": "windows",
        "python_rel": ["python.exe"],
        "pip_download": {
            "platform": "win_amd64",
            "python_version": "3.12",
            "implementation": "cp",
            "abi": "cp312",
        },
    },
}

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT / "backend") not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT / "backend"))

from utils.xedu_compat import XEDU_METADATA_MARKER, XEDU_PYTHON_VERSION, patch_xedu_metadata  # noqa: E402

REQ_FULL = PROJECT_ROOT / "backend" / "requirements_full.txt"
REQ_MINIMAL = PROJECT_ROOT / "backend" / "requirements.txt"
WINDOWS_SOURCE_WHEEL_FALLBACKS = {"pinpong"}
WINDOWS_FALLBACK_DEPENDENCIES = {
    "pinpong": ("pyserial==3.5", "freetype-py==2.1.0", "modbus-tk==1.1.2"),
}
NO_DEPS_REQUIREMENTS = {"xedu-python"}
XEDU_PYTHON_SPEC = f"xedu-python=={XEDU_PYTHON_VERSION}"
# Keep xedu-python out of normal requirements resolution. Version 2.0.0
# advertises Pillow/ONNX Runtime upper bounds that are incompatible with the
# audited Python 3.12 profile, so the installer applies a narrow, recorded
# metadata compatibility patch after installing the exact wheel.
NO_DEPS_REQUIREMENT_SPECS = (XEDU_PYTHON_SPEC,)
MODEL_SUFFIXES = {".onnx", ".pt", ".pth", ".safetensors"}
CACHE_DIRECTORY_NAMES = {"__pycache__", ".pytest_cache"}
RUNTIME_METADATA_FILE = ".portable_runtime.json"


def detect_default_target() -> str:
    system = platform.system()
    machine = platform.machine().lower()
    if system == "Darwin":
        if machine in {"arm64", "aarch64"}:
            return "darwin-arm64"
        if machine in {"x86_64", "amd64"}:
            return "darwin-x64"
    if system == "Windows" and machine in {"amd64", "x86_64"}:
        return "windows-x64"
    raise SystemExit(f"Unsupported host platform: {system}-{machine}")


def pick_requirements(kind: str) -> Path:
    if kind == "minimal":
        return REQ_MINIMAL
    return REQ_FULL if REQ_FULL.exists() else REQ_MINIMAL


def run(cmd, **kwargs):
    print("+", " ".join(str(part) for part in cmd))
    subprocess.run(cmd, check=True, **kwargs)


def requirement_name(requirement: str) -> str:
    marker_split = str(requirement or "").split(";", 1)[0].strip()
    match = re.match(r"([A-Za-z0-9_.-]+)", marker_split)
    return match.group(1).lower() if match else ""


def split_windows_requirements(requirements_file: Path):
    primary_specs = []
    fallback_specs = []
    no_deps_specs = []
    for raw_line in requirements_file.read_text(encoding="utf-8").splitlines():
        stripped = raw_line.split("#", 1)[0].strip()
        if not stripped:
            continue
        name = requirement_name(stripped)
        if name in NO_DEPS_REQUIREMENTS:
            no_deps_specs.append(stripped)
            continue
        if name in WINDOWS_SOURCE_WHEEL_FALLBACKS:
            fallback_specs.append(stripped)
        else:
            primary_specs.append(stripped)
    for spec in NO_DEPS_REQUIREMENT_SPECS:
        if spec not in no_deps_specs:
            no_deps_specs.append(spec)
    return primary_specs, fallback_specs, no_deps_specs


def install_native_packages(python_exe: Path, specs, *, no_deps: bool = False):
    for spec in specs:
        cmd = [str(python_exe), "-m", "pip", "install"]
        if no_deps:
            cmd.append("--no-deps")
        cmd.append(spec)
        run(cmd)


def download_with_curl(url: str, dest: Path):
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp_dest = dest.with_suffix(dest.suffix + ".part")
    cmd = ["curl", "-L", "--fail", "-C", "-", "-o", str(tmp_dest), url]
    run(cmd)
    tmp_dest.replace(dest)


def resolve_archive_path(target: str) -> Path:
    return PROJECT_ROOT / TARGETS[target]["archive"]


def ensure_archive(target: str) -> Path:
    archive = resolve_archive_path(target)
    if archive.exists():
        return archive
    url = TARGETS[target].get("archive_url") or f"{BASE_URL}/{RELEASE_TAG}/{archive.name}"
    print(f"Downloading {url}")
    download_with_curl(url, archive)
    return archive


def backup_and_remove_dir(target_dir: Path):
    if not target_dir.exists():
        return
    backup_dir = target_dir.with_name(target_dir.name + "_old")
    if backup_dir.exists():
        shutil.rmtree(backup_dir)
    print(f"Backing up existing environment to {backup_dir}")
    target_dir.rename(backup_dir)


def extract_archive_to_dir(archive: Path, target: str, target_dir: Path):
    backup_and_remove_dir(target_dir)
    with tempfile.TemporaryDirectory() as tmp_dir:
        tmp_root = Path(tmp_dir)
        archive_type = TARGETS[target].get("archive_type", "tar.gz")
        print(f"Extracting {archive.name}")
        if archive_type == "zip":
            with zipfile.ZipFile(archive) as zf:
                zf.extractall(tmp_root)
            target_dir.mkdir(parents=True, exist_ok=True)
            for item in tmp_root.iterdir():
                shutil.move(str(item), str(target_dir / item.name))
        else:
            with tarfile.open(archive, "r:gz") as tar:
                tar.extractall(tmp_root)
            candidates = [path for path in tmp_root.iterdir() if path.is_dir()]
            extracted_dir = tmp_root / "python"
            if not extracted_dir.exists():
                if len(candidates) != 1:
                    raise RuntimeError("Cannot determine extracted runtime directory")
                extracted_dir = candidates[0]
            shutil.move(str(extracted_dir), str(target_dir))


def resolve_python_executable(env_dir: Path, target: str) -> Path:
    for rel in TARGETS[target]["python_rel"]:
        candidate = env_dir / rel
        if candidate.exists():
            return candidate
    raise FileNotFoundError(f"Python executable not found in {env_dir}")


def install_native_requirements(env_dir: Path, target: str, requirements_file: Path):
    if not requirements_file.exists():
        print(f"Skip requirements install: {requirements_file} not found")
        return
    python_exe = resolve_python_executable(env_dir, target)
    primary_specs, fallback_specs, no_deps_specs = split_windows_requirements(requirements_file)
    with tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False, encoding="utf-8") as handle:
        if primary_specs or fallback_specs:
            handle.write("\n".join(primary_specs + fallback_specs) + "\n")
        temp_requirements = Path(handle.name)
    try:
        if primary_specs or fallback_specs:
            run([str(python_exe), "-m", "pip", "install", "-r", str(temp_requirements)])
        install_native_packages(python_exe, no_deps_specs, no_deps=True)
        patch_xedu_python_metadata(env_dir, target)
        validate_native_xedu_runtime(env_dir, target)
    finally:
        temp_requirements.unlink(missing_ok=True)


def patch_windows_pth(env_dir: Path):
    pth_files = list(env_dir.glob("*._pth"))
    if not pth_files:
        return
    required_lines = ["Lib", "Lib/site-packages", "import site"]
    for pth_file in pth_files:
        existing = pth_file.read_text("utf-8").splitlines()
        cleaned = [line.strip() for line in existing if line.strip()]
        for item in required_lines:
            if item not in cleaned:
                cleaned.append(item)
        pth_file.write_text("\n".join(cleaned) + "\n", encoding="utf-8")


def download_windows_wheels(requirements_file: Path, wheelhouse: Path):
    if wheelhouse.exists():
        shutil.rmtree(wheelhouse)
    wheelhouse.mkdir(parents=True, exist_ok=True)
    target_cfg = TARGETS["windows-x64"]["pip_download"]
    primary_specs, fallback_specs, no_deps_specs = split_windows_requirements(requirements_file)
    fallback_dependency_specs = []
    for spec in fallback_specs:
        fallback_dependency_specs.extend(
            WINDOWS_FALLBACK_DEPENDENCIES.get(requirement_name(spec), ())
        )
    primary_specs = primary_specs + fallback_dependency_specs

    if primary_specs:
        with tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False, encoding="utf-8") as handle:
            handle.write("\n".join(primary_specs) + "\n")
            temp_requirements = Path(handle.name)
        try:
            cmd = [
                sys.executable,
                "-m",
                "pip",
                "download",
                "--only-binary=:all:",
                "--platform",
                target_cfg["platform"],
                "--python-version",
                target_cfg["python_version"],
                "--implementation",
                target_cfg["implementation"],
                "--abi",
                target_cfg["abi"],
                "-r",
                str(temp_requirements),
                "-d",
                str(wheelhouse),
            ]
            run(cmd)
        finally:
            temp_requirements.unlink(missing_ok=True)

    for spec in fallback_specs:
        print(f"Building universal wheel fallback for {spec}")
        cmd = [
            sys.executable,
            "-m",
            "pip",
            "wheel",
            "--no-deps",
            spec,
            "-w",
            str(wheelhouse),
        ]
        run(cmd)

    for spec in no_deps_specs:
        print(f"Downloading no-deps wheel for {spec}")
        cmd = [
            sys.executable,
            "-m",
            "pip",
            "download",
            "--no-deps",
            spec,
            "-d",
            str(wheelhouse),
        ]
        run(cmd)


def extract_wheel_to_windows_env(wheel_path: Path, env_dir: Path):
    site_packages = env_dir / "Lib" / "site-packages"
    scripts_dir = env_dir / "Scripts"
    site_packages.mkdir(parents=True, exist_ok=True)
    scripts_dir.mkdir(parents=True, exist_ok=True)

    with zipfile.ZipFile(wheel_path) as zf:
        for member in zf.infolist():
            if member.is_dir():
                continue
            posix_path = PurePosixPath(member.filename)
            parts = posix_path.parts
            if not parts:
                continue

            dest = None
            if parts[0].endswith(".data") and len(parts) >= 3:
                category = parts[1]
                rel_path = Path(*parts[2:])
                if category in {"purelib", "platlib"}:
                    dest = site_packages / rel_path
                elif category == "scripts":
                    dest = scripts_dir / rel_path
                elif category == "data":
                    dest = env_dir / rel_path
                else:
                    dest = env_dir / rel_path
            else:
                dest = site_packages / Path(*parts)

            dest.parent.mkdir(parents=True, exist_ok=True)
            with zf.open(member) as src, open(dest, "wb") as out:
                shutil.copyfileobj(src, out)


def install_windows_requirements_offline(env_dir: Path, requirements_file: Path, wheelhouse: Path):
    if not requirements_file.exists():
        print(f"Skip requirements install: {requirements_file} not found")
        return
    download_windows_wheels(requirements_file, wheelhouse)
    wheels = sorted(wheelhouse.glob("*.whl"))
    if not wheels:
        raise RuntimeError("No wheels downloaded for Windows runtime")
    incompatible_wheels = [
        wheel.name
        for wheel in wheels
        if any(marker in wheel.name.lower() for marker in ("macosx", "darwin", "linux", "manylinux"))
    ]
    if incompatible_wheels:
        raise RuntimeError(
            "Windows wheelhouse contains non-Windows wheels: " + ", ".join(incompatible_wheels)
        )
    for wheel in wheels:
        print(f"Extracting {wheel.name}")
        extract_wheel_to_windows_env(wheel, env_dir)
    patch_windows_pth(env_dir)
    patch_xedu_python_metadata(env_dir, "windows-x64")
    validate_windows_xedu_runtime(env_dir)


def _xedu_site_packages(env_dir: Path, target: str) -> Path:
    if target == "windows-x64":
        return env_dir / "Lib" / "site-packages"
    python_exe = resolve_python_executable(env_dir, target)
    return (python_exe.parent.parent / "lib" / f"python{sys.version_info.major}.{sys.version_info.minor}" / "site-packages").resolve()


def patch_xedu_python_metadata(env_dir: Path, target: str) -> bool:
    """Remove only stale upstream bounds and record the compatibility profile.

    xedu-python 2.0.0 imports and runs with the modern pinned Pillow and ONNX
    Runtime versions, but its wheel metadata prevents pip from representing
    that supported combination. The patch is intentionally narrow and leaves
    every other dependency declaration untouched.
    """
    site_packages = _xedu_site_packages(env_dir, target)
    result = patch_xedu_metadata(site_packages)
    if not result["success"]:
        raise RuntimeError(result["message"])
    if result["changed"]:
        print(f"Patched xedu-python metadata for modern profile: {result.get('metadata_path', site_packages)}")
    return bool(result["changed"])


def validate_native_xedu_runtime(env_dir: Path, target: str):
    python_exe = resolve_python_executable(env_dir, target)
    probe = (
        "from XEdu.hub import Workflow as wf\n"
        "tasks = wf.support_task()\n"
        "assert isinstance(tasks, (list, tuple)) and tasks\n"
        "print('XEduHub runtime probe passed:', len(tasks), 'tasks')\n"
    )
    completed = subprocess.run([str(python_exe), "-c", probe], check=False, text=True)
    if completed.returncode != 0:
        raise RuntimeError("native xedu-python runtime probe failed")


def validate_windows_xedu_runtime(env_dir: Path, expected_version: str = XEDU_PYTHON_VERSION):
    site_packages = env_dir / "Lib" / "site-packages"
    version_file = site_packages / "XEdu" / "version.py"
    if not version_file.exists():
        raise RuntimeError("Windows runtime missing XEdu/version.py")

    version_text = version_file.read_text(encoding="utf-8", errors="replace")
    quoted_versions = {
        f"__version__='{expected_version}'",
        f'__version__="{expected_version}"',
    }
    if not any(marker in version_text for marker in quoted_versions):
        raise RuntimeError(
            f"Windows runtime must install xedu-python=={expected_version}; "
            f"found {version_file} without expected __version__"
        )

    metadata_files = sorted(site_packages.glob("*.dist-info/METADATA"))
    xedu_metadata = []
    for metadata in metadata_files:
        text = metadata.read_text(encoding="utf-8", errors="replace")
        lowered = text.lower()
        if "name: xedu-python" in lowered or "name: xedu_python" in lowered:
            xedu_metadata.append(text)
    if not xedu_metadata:
        raise RuntimeError("Windows runtime missing xedu-python package metadata")
    if not any(f"version: {expected_version}" in text.lower() for text in xedu_metadata):
        raise RuntimeError(f"Windows runtime must install xedu-python=={expected_version}")


def _path_size(target: Path) -> int:
    if target.is_file():
        return target.stat().st_size
    return sum(path.stat().st_size for path in target.rglob("*") if path.is_file())


def _remove_path(target: Path, stats: dict):
    if not target.exists():
        return
    stats["bytes"] += _path_size(target)
    if target.is_dir():
        shutil.rmtree(target)
        stats["directories"] += 1
    else:
        target.unlink()
        stats["files"] += 1


def _is_python_path_config(file_path: Path, site_packages: Path) -> bool:
    return file_path.suffix.lower() == ".pth" and file_path.parent == site_packages


def prune_portable_runtime(env_dir: Path, target: str) -> dict:
    if not env_dir.is_dir():
        raise FileNotFoundError(f"Portable runtime not found: {env_dir}")

    stats = {"bytes": 0, "directories": 0, "files": 0}
    site_packages = _xedu_site_packages(env_dir, target)

    for relative_path in (
        Path("include"),
        Path("share/man"),
        Path("share/icons"),
        Path("share/applications"),
    ):
        _remove_path(env_dir / relative_path, stats)

    if site_packages.is_dir():
        test_directories = [path for path in site_packages.rglob("tests") if path.is_dir()]
        test_directories.extend(
            site_packages / relative_path
            for relative_path in (
                Path("onnx/test"),
                Path("onnx/backend/test"),
                Path("onnxruntime/datasets"),
                Path("rapidocr_onnxruntime/models"),
                Path("tornado/test"),
            )
        )
        for directory in sorted(set(test_directories), key=lambda path: len(path.parts), reverse=True):
            _remove_path(directory, stats)

    cache_directories = [
        path for path in env_dir.rglob("*")
        if path.is_dir() and path.name in CACHE_DIRECTORY_NAMES
    ]
    for directory in sorted(cache_directories, key=lambda path: len(path.parts), reverse=True):
        _remove_path(directory, stats)

    for file_path in list(env_dir.rglob("*")):
        if not file_path.is_file():
            continue
        suffix = file_path.suffix.lower()
        if suffix == ".pyc":
            _remove_path(file_path, stats)
            continue
        if suffix in MODEL_SUFFIXES and not _is_python_path_config(file_path, site_packages):
            _remove_path(file_path, stats)

    empty_model_directories = [
        path for path in env_dir.rglob("*")
        if path.is_dir() and path.name.lower() in {"checkpoint", "checkpoints", "model", "models"}
    ]
    for directory in sorted(empty_model_directories, key=lambda path: len(path.parts), reverse=True):
        if not any(directory.iterdir()):
            directory.rmdir()
            stats["directories"] += 1

    removed_mb = stats["bytes"] / (1024 * 1024)
    print(
        "Pruned portable runtime: "
        f"{stats['directories']} directories, {stats['files']} files, {removed_mb:.1f} MiB"
    )
    return stats


def create_marker(env_dir: Path, target: str, requirements_kind: str):
    (env_dir / ".portable_ready").write_text("", encoding="utf-8")
    metadata = {
        "python_version": PYTHON_VERSION,
        "target": target,
        "requirements": requirements_kind,
        "models_bundled": False,
    }
    (env_dir / RUNTIME_METADATA_FILE).write_text(
        json.dumps(metadata, ensure_ascii=True, indent=2) + "\n",
        encoding="utf-8",
    )


def parse_args():
    parser = argparse.ArgumentParser(description="Prepare portable Python runtime for XEdu Client")
    parser.add_argument("--target", default=detect_default_target(), choices=sorted(TARGETS.keys()))
    parser.add_argument("--output", default=None, help="Output directory name, default follows target")
    parser.add_argument("--requirements", choices=["full", "minimal"], default="minimal")
    parser.add_argument("--force-download", action="store_true")
    parser.add_argument("--keep-archive", action="store_true")
    parser.add_argument("--keep-wheelhouse", action="store_true")
    parser.add_argument("--prune-only", action="store_true")
    return parser.parse_args()


def main():
    args = parse_args()
    target = args.target
    output_name = args.output or ("python_env_win" if target == "windows-x64" else "python_env")
    env_dir = PROJECT_ROOT / output_name
    requirements_file = pick_requirements(args.requirements)

    if args.prune_only:
        prune_portable_runtime(env_dir, target)
        create_marker(env_dir, target, args.requirements)
        print(f"Portable runtime ready: {env_dir}")
        return

    archive = resolve_archive_path(target)
    if args.force_download and archive.exists():
        archive.unlink()
    archive = ensure_archive(target)
    extract_archive_to_dir(archive, target, env_dir)

    host_system = platform.system()
    target_platform = TARGETS[target]["platform"]
    can_run_native = (
        (target_platform == "windows" and host_system == "Windows")
        or (target_platform == "darwin" and host_system == "Darwin")
    )

    if target_platform == "windows" and not can_run_native:
        wheelhouse = PROJECT_ROOT / "wheelhouse_win"
        install_windows_requirements_offline(env_dir, requirements_file, wheelhouse)
        if not args.keep_wheelhouse and wheelhouse.exists():
            shutil.rmtree(wheelhouse)
    else:
        install_native_requirements(env_dir, target, requirements_file)

    prune_portable_runtime(env_dir, target)
    create_marker(env_dir, target, args.requirements)

    if not args.keep_archive and archive.exists():
        archive.unlink()

    print(f"Portable runtime ready: {env_dir}")


if __name__ == "__main__":
    main()
