#!/usr/bin/env python3
import argparse
import os
import platform
import shutil
import subprocess
import sys
import tarfile
import tempfile
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
REQ_FULL = PROJECT_ROOT / "backend" / "requirements_full.txt"
REQ_MINIMAL = PROJECT_ROOT / "backend" / "requirements.txt"


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
    run([str(python_exe), "-m", "pip", "install", "-r", str(requirements_file)])


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
    wheelhouse.mkdir(parents=True, exist_ok=True)
    if any(wheelhouse.glob("*.whl")):
        print(f"Reusing existing wheelhouse: {wheelhouse}")
        return
    target_cfg = TARGETS["windows-x64"]["pip_download"]
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
        str(requirements_file),
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
    for wheel in wheels:
        print(f"Extracting {wheel.name}")
        extract_wheel_to_windows_env(wheel, env_dir)
    patch_windows_pth(env_dir)


def create_marker(env_dir: Path):
    (env_dir / ".portable_ready").write_text("", encoding="utf-8")


def parse_args():
    parser = argparse.ArgumentParser(description="Prepare portable Python runtime for XEdu Client")
    parser.add_argument("--target", default=detect_default_target(), choices=sorted(TARGETS.keys()))
    parser.add_argument("--output", default=None, help="Output directory name, default follows target")
    parser.add_argument("--requirements", choices=["full", "minimal"], default="full")
    parser.add_argument("--force-download", action="store_true")
    parser.add_argument("--keep-archive", action="store_true")
    parser.add_argument("--keep-wheelhouse", action="store_true")
    return parser.parse_args()


def main():
    args = parse_args()
    target = args.target
    output_name = args.output or ("python_env_win" if target == "windows-x64" else "python_env")
    env_dir = PROJECT_ROOT / output_name
    requirements_file = pick_requirements(args.requirements)

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

    create_marker(env_dir)

    if not args.keep_archive and archive.exists():
        archive.unlink()

    print(f"Portable runtime ready: {env_dir}")


if __name__ == "__main__":
    main()
