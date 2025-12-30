#!/usr/bin/env python3
import os
import sys
import platform
import shutil
import urllib.request
import tarfile
import subprocess
from pathlib import Path

# Configuration
PYTHON_VERSION = "3.12.8"
RELEASE_TAG = "20250106"
BASE_URL = "https://github.com/indygreg/python-build-standalone/releases/download"

# Mapping for OS/Arch to download filenames
# Format: {system}-{machine}: (filename, extract_dir_name)
MAPPING = {
    "Darwin-x86_64": (
        f"cpython-{PYTHON_VERSION}+{RELEASE_TAG}-x86_64-apple-darwin-install_only.tar.gz",
        "python"
    ),
    "Darwin-arm64": (
        f"cpython-{PYTHON_VERSION}+{RELEASE_TAG}-aarch64-apple-darwin-install_only.tar.gz",
        "python"
    ),
    "Windows-AMD64": (
        f"cpython-{PYTHON_VERSION}+{RELEASE_TAG}-x86_64-pc-windows-msvc-shared-install_only.tar.gz",
        "python"
    )
}

PROJECT_ROOT = Path(__file__).parent.parent
PYTHON_ENV_DIR = PROJECT_ROOT / "python_env"
REQUIREMENTS_FILE = PROJECT_ROOT / "backend" / "requirements.txt"

def get_download_url():
    system = platform.system()
    machine = platform.machine()
    key = f"{system}-{machine}"
    
    if key not in MAPPING:
        print(f"Error: Unsupported platform {key}")
        sys.exit(1)
        
    filename, _ = MAPPING[key]
    return f"{BASE_URL}/{RELEASE_TAG}/{filename}", filename

def download_file(url, dest):
    print(f"Downloading {url}...")
    try:
        # Use subprocess curl for better progress bar and reliability if available
        subprocess.run(["curl", "-L", "-o", dest, url], check=True)
    except (subprocess.SubprocessError, FileNotFoundError):
        print("curl failed or not found, falling back to python urllib...")
        urllib.request.urlretrieve(url, dest)
    print("Download complete.")

def setup_python():
    url, filename = get_download_url()
    archive_path = PROJECT_ROOT / filename
    
    # 1. Download
    if not archive_path.exists():
        download_file(url, str(archive_path))
    
    # 2. Backup existing
    if PYTHON_ENV_DIR.exists():
        backup_dir = PYTHON_ENV_DIR.with_name("python_env_old")
        if backup_dir.exists():
            shutil.rmtree(backup_dir)
        print(f"Backing up existing environment to {backup_dir}...")
        PYTHON_ENV_DIR.rename(backup_dir)
    
    # 3. Extract
    print(f"Extracting {filename}...")
    with tarfile.open(archive_path, "r:gz") as tar:
        # The archive usually contains a top-level 'python' directory
        tar.extractall(path=PROJECT_ROOT)
    
    # Rename extracted 'python' dir to 'python_env'
    extracted_dir = PROJECT_ROOT / "python"
    if extracted_dir.exists():
        extracted_dir.rename(PYTHON_ENV_DIR)
    else:
        print("Error: Expected extraction directory 'python' not found.")
        sys.exit(1)
        
    print(f"Portable Python installed to {PYTHON_ENV_DIR}")
    
    # 4. Install requirements
    print("Installing requirements...")
    if platform.system() == "Windows":
        pip_cmd = [str(PYTHON_ENV_DIR / "python.exe"), "-m", "pip"]
    else:
        pip_cmd = [str(PYTHON_ENV_DIR / "bin" / "python3"), "-m", "pip"]
        
    # Ensure pip is installed/upgraded
    # Standalone builds usually come with pip, but let's be sure
    # subprocess.run(pip_cmd + ["install", "--upgrade", "pip"], check=True)
    
    if REQUIREMENTS_FILE.exists():
        subprocess.run(pip_cmd + ["install", "-r", str(REQUIREMENTS_FILE)], check=True)
        print("Requirements installed.")
    else:
        print(f"Warning: {REQUIREMENTS_FILE} not found.")

    # Cleanup
    if archive_path.exists():
        os.remove(archive_path)
    
    # Create marker file
    (PYTHON_ENV_DIR / ".portable_ready").touch()
    
    print("Setup complete! You now have a portable python_env.")

if __name__ == "__main__":
    setup_python()