import os
import sys
import shutil
import urllib.request
import zipfile
import subprocess
from pathlib import Path

# Config
PYTHON_VERSION = "3.12.1"
PYTHON_URL = f"https://www.python.org/ftp/python/{PYTHON_VERSION}/python-{PYTHON_VERSION}-embed-amd64.zip"
GET_PIP_URL = "https://bootstrap.pypa.io/get-pip.py"
PROJECT_ROOT = Path(__file__).parent.parent
PYTHON_ENV_DIR = PROJECT_ROOT / "python_env"
DOWNLOADS_DIR = PROJECT_ROOT / "downloads"
DOWNLOADS_DIR.mkdir(exist_ok=True)
REQUIREMENTS_FILE = PROJECT_ROOT / "backend" / "requirements.txt"

def download_file(url, dest):
    print(f"Downloading {url}...")
    with urllib.request.urlopen(url) as response, open(dest, 'wb') as out_file:
        shutil.copyfileobj(response, out_file)
    print("Download complete.")

def setup_portable_python():
    print(f"Setting up portable Python {PYTHON_VERSION} environment...")

    # 1. Clean existing python_env
    if PYTHON_ENV_DIR.exists():
        # ... (keep existing cleanup logic) ...
        print(f"Removing existing {PYTHON_ENV_DIR}...")
        try:
            shutil.rmtree(PYTHON_ENV_DIR)
        except Exception as e:
            # ... (keep existing error handling) ...
            print(f"Warning: Failed to remove directory directly: {e}")
            print("Attempting to rename and proceed...")
            try:
                import time
                timestamp = int(time.time())
                trash_dir = PYTHON_ENV_DIR.parent / f"python_env_trash_{timestamp}"
                PYTHON_ENV_DIR.rename(trash_dir)
                print(f"Renamed locked directory to {trash_dir}")
                try:
                    shutil.rmtree(trash_dir)
                except:
                    pass
            except Exception as rename_error:
                print(f"Error: Could not remove or rename existing python_env: {rename_error}")
                print("Please close any applications using this environment and try again.")
                return

    PYTHON_ENV_DIR.mkdir(parents=True, exist_ok=True)

    # 2. Download and extract Python embeddable
    zip_path = DOWNLOADS_DIR / f"python-{PYTHON_VERSION}-embed-amd64.zip"
    if not zip_path.exists() or zip_path.stat().st_size < 1000000:
        download_file(PYTHON_URL, zip_path)
    else:
        print("Using cached python.zip")

    print("Extracting Python...")
    with zipfile.ZipFile(zip_path, 'r') as zip_ref:
        zip_ref.extractall(PYTHON_ENV_DIR)

    # 3. Enable site-packages (modify python._pth)
    pth_file = list(PYTHON_ENV_DIR.glob("python*._pth"))[0]
    print(f"Modifying {pth_file.name} to enable site-packages...")
    
    with open(pth_file, 'r') as f:
        content = f.read()
    
    # Uncomment 'import site'
    content = content.replace("#import site", "import site")
    
    with open(pth_file, 'w') as f:
        f.write(content)

    # 4. Install pip
    print("Installing pip...")
    get_pip_path = DOWNLOADS_DIR / "get-pip.py"
    if not get_pip_path.exists() or get_pip_path.stat().st_size < 1000000:
        download_file(GET_PIP_URL, get_pip_path)
    else:
        print("Using cached get-pip.py")

    python_exe = PYTHON_ENV_DIR / "python.exe"
    
    subprocess.run([str(python_exe), str(get_pip_path)], check=True)
    
    # Ensure setuptools and wheel are installed (crucial for embeddable python)
    print("Installing setuptools and wheel...")
    subprocess.run([str(python_exe), "-m", "pip", "install", "setuptools", "wheel"], check=True)

    # 5. Install requirements
    print("Installing requirements...")
    
    # Install backend requirements
    subprocess.run([str(python_exe), "-m", "pip", "install", "-r", str(REQUIREMENTS_FILE)], check=True)
    
    # Install Jupyter (critical for the app)
    # Pin notebook to >=7.0.0 to avoid dependency resolution hell and backtracking to ancient versions
    print("Installing JupyterLab and Notebook...")
    subprocess.run([str(python_exe), "-m", "pip", "install", "jupyterlab", "notebook>=7.0.0"], check=True)

    # 6. Create Scripts directory alias (optional but good for compatibility)
    # Some tools look for Scripts/python.exe. We can't easily symlink on Windows without Admin,
    # but we can copy python.exe to Scripts/python.exe if needed, or just rely on our code changes.
    # Since we updated the code to look in root, we don't need to duplicate python.exe.
    # However, pip installs scripts into Scripts/, so that directory will exist.

    # 7. Create marker file
    (PYTHON_ENV_DIR / ".portable_ready").touch()

    print("Portable Python environment setup complete!")
    print(f"Location: {PYTHON_ENV_DIR}")

if __name__ == "__main__":
    setup_portable_python()
