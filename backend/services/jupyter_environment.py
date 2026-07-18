"""
Jupyter environment/config helpers.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

from models.config import JupyterConfig

_BOOL_OVERRIDE_FIELDS = {"use_notebook", "auto_start", "auto_restart", "debug"}
_INT_OVERRIDE_FIELDS = {"port", "check_interval", "max_restarts"}


@dataclass(frozen=True)
class EnvironmentValidationResult:
    """Pure environment validation result."""

    is_valid: bool
    python_executable: str
    project_dir_valid: bool
    used_cache: bool
    errors: tuple[str, ...]


def merge_jupyter_config(base_config: JupyterConfig, overrides: dict[str, Any]) -> JupyterConfig:
    """Merge startup overrides into a Jupyter config."""
    config_dict = base_config.to_dict()

    for key, value in overrides.items():
        if key not in config_dict:
            continue
        if key in _INT_OVERRIDE_FIELDS and isinstance(value, (int, str)):
            config_dict[key] = int(value)
        elif key in _BOOL_OVERRIDE_FIELDS and isinstance(value, (bool, str)):
            config_dict[key] = bool(value)
        else:
            config_dict[key] = value

    return JupyterConfig.from_dict(config_dict)


def evaluate_environment_validation(
    config: JupyterConfig,
    *,
    current_time: float,
    cached_python_executable: str | None,
    cached_venv_valid: bool | None,
    cached_project_dir_valid: bool | None,
    last_check: float,
    cache_duration: float,
    backend_python_executable: str,
) -> EnvironmentValidationResult:
    """Validate environment inputs while preserving manager cache semantics."""
    if (
        current_time - last_check < cache_duration
        and cached_python_executable == config.python_executable
        and cached_venv_valid is not None
    ):
        return EnvironmentValidationResult(
            is_valid=bool(cached_venv_valid),
            python_executable=cached_python_executable or "",
            project_dir_valid=bool(cached_project_dir_valid)
            if cached_project_dir_valid is not None
            else True,
            used_cache=True,
            errors=(),
        )

    errors: list[str] = []
    python_valid = True
    python_executable = config.python_executable

    if not python_executable:
        if not cached_python_executable:
            python_executable = backend_python_executable
    else:
        python_path = Path(python_executable)
        if not python_path.exists():
            errors.append(f"Python executable not found: {config.python_executable}")
            python_valid = False
        else:
            python_executable = str(python_path.resolve())

    project_dir_valid = True
    if config.project_dir:
        project_path = Path(config.project_dir)
        if not project_path.exists():
            errors.append(f"Project directory not found: {config.project_dir}")
            project_dir_valid = False
        elif not project_path.is_dir():
            errors.append(f"Project path is not a directory: {config.project_dir}")
            project_dir_valid = False

    return EnvironmentValidationResult(
        is_valid=python_valid and project_dir_valid,
        python_executable=python_executable,
        project_dir_valid=project_dir_valid,
        used_cache=False,
        errors=tuple(errors),
    )


def build_jupyter_command(
    config: JupyterConfig,
    *,
    backend_python_executable: str,
    project_root: Path,
) -> list[str]:
    """Build the Jupyter launch command."""
    python_executable = _resolve_python_executable(
        config.python_executable,
        backend_python_executable=backend_python_executable,
        project_root=project_root,
    )
    module_name = "notebook" if config.use_notebook else "jupyterlab"
    work_dir = _resolve_work_dir(config.project_dir)

    remote_access_enabled = bool(getattr(config, "allow_remote_access", False))
    bind_ip = "0.0.0.0" if remote_access_enabled else "127.0.0.1"

    cmd = [
        python_executable,
        "-m",
        module_name,
        f"--port={config.port}",
        "--no-browser",
        "--allow-root",
        f"--ServerApp.ip={bind_ip}",
        "--ServerApp.open_browser=False",
        "--LabApp.default_url=/lab",
        "--LabApp.core_mode=False",
        "--ServerApp.max_buffer_size=1000000000",
        "--ServerApp.iopub_msg_rate_limit=1000000",
        "--ServerApp.rate_limit_window=3.0",
    ]

    if not remote_access_enabled:
        cmd.extend(
            [
                "--ServerApp.token=",
                "--ServerApp.password=",
                "--ServerApp.password_required=False",
                "--IdentityProvider.token=",
                "--IdentityProvider.password_required=False",
                "--ServerApp.disable_check_xsrf=True",
                "--NotebookApp.token=",
                "--NotebookApp.password=",
                "--NotebookApp.password_required=False",
                "--NotebookApp.disable_check_xsrf=True",
            ]
        )

    if work_dir:
        cmd.append(f"--ServerApp.root_dir={work_dir}")
        cmd.append(f"--ServerApp.notebook_dir={work_dir}")

    if config.args:
        cmd.extend(config.args.split())

    if config.debug:
        cmd.append("--debug")

    return cmd


def _resolve_python_executable(
    configured_python: str,
    *,
    backend_python_executable: str,
    project_root: Path,
) -> str:
    if not configured_python:
        return backend_python_executable

    python_path = Path(configured_python)
    if python_path.is_absolute():
        return configured_python

    resolved_path = project_root / python_path
    if resolved_path.exists():
        return str(resolved_path)

    return backend_python_executable


def _resolve_work_dir(project_dir: str) -> str:
    if not project_dir.strip():
        return ""

    work_path = Path(project_dir)
    if not work_path.exists() or not work_path.is_dir():
        return ""

    return str(work_path.absolute())
