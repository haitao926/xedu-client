#!/usr/bin/env python3
# -*- coding: utf-8 -*-

from __future__ import annotations

import os
import platform
import sys
from pathlib import Path
from typing import Any, Dict

from flask import request

from models.config import AppConfig, SystemInfo
from utils.python_runtime import inspect_python_environment, inspect_python_executable
from services.ai_service import AIService
from services.config_service import ConfigService
from services.xeduhub_support import execute_xeduhub_realtime, execute_xeduhub_runtime
from .config_utils import build_ai_service, merge_jupyter_payload, normalize_config_payload
from .resource_runtime import (
    build_single_course_source_entry,
    collect_resource_sources,
    derive_course_id_from_path,
    issue_resource_handle,
    register_resource_root,
    resolve_resource_handle,
    get_frontend_build_dir,
    get_scratch_editor_build_dir,
    normalize_resource_source,
    resolve_local_course_file,
    resolve_resource_source_for_request,
)

EXPECTED_XEDU_VERSION = "2.0.0"


def parse_bool(value: Any, default: bool = True) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        text = value.strip().lower()
        if text in {"false", "0", "no", "off"}:
            return False
        if text in {"true", "1", "yes", "on"}:
            return True
    if value is None:
        return default
    return bool(value)


def resolve_resources_token(ui_config, token_override: str = "") -> str:
    override = (token_override or "").strip()
    if override:
        return override
    config_token = (getattr(ui_config, "resources_publish_token", "") or "").strip()
    if config_token:
        return config_token
    return (os.getenv("XEDU_GITEA_TOKEN", "") or "").strip()


def _read_xedu_version_from_site_packages(site_packages: Path) -> str | None:
    version_file = site_packages / "XEdu" / "version.py"
    if version_file.exists():
        try:
            text = version_file.read_text(encoding="utf-8", errors="replace")
            for quote in ("'", '"'):
                marker = f"__version__={quote}"
                if marker in text:
                    start = text.index(marker) + len(marker)
                    end = text.find(quote, start)
                    if end > start:
                        return text[start:end].strip()
        except Exception:
            pass

    metadata_files = sorted(site_packages.glob("*.dist-info/METADATA"))
    for metadata in metadata_files:
        try:
            text = metadata.read_text(encoding="utf-8", errors="replace")
        except Exception:
            continue
        lowered = text.lower()
        if "name: xedu-python" not in lowered and "name: xedu_python" not in lowered:
            continue
        for line in text.splitlines():
            if line.lower().startswith("version:"):
                return line.split(":", 1)[1].strip()
    return None


def _resolve_site_packages(python_executable: str) -> Path | None:
    executable = Path(python_executable or "")
    if not executable.exists():
        return None

    candidates = []
    if platform.system() == "Windows":
        candidates.extend([
            executable.parent / "Lib" / "site-packages",
            executable.parent.parent / "Lib" / "site-packages",
        ])
    else:
        version_bits = f"python{sys.version_info.major}.{sys.version_info.minor}"
        candidates.extend([
            executable.parent.parent / "lib" / version_bits / "site-packages",
            executable.parent / ".." / "lib" / version_bits / "site-packages",
        ])

    for candidate in candidates:
        resolved = candidate.resolve()
        if resolved.exists():
            return resolved
    return None


def collect_system_info(python_executable: str | None = None) -> SystemInfo:
    executable = python_executable or sys.executable
    python_check = inspect_python_executable(executable)
    info = SystemInfo(
        python_version=python_check.get("version") or platform.python_version(),
        python_executable=python_check.get("executable") or executable,
        platform=platform.platform(),
        xedu_expected_version=EXPECTED_XEDU_VERSION,
    )

    if not python_check["success"]:
        info.xedu_version_ok = False
        info.xedu_runtime_message = python_check["message"]
        return info

    environment = inspect_python_environment(info.python_executable)
    if environment.get("success"):
        info.python_version = environment.get("python_version") or info.python_version
        info.python_executable = environment.get("python_executable") or info.python_executable
        info.ssl_available = environment.get("ssl_available")
        info.ssl_version = environment.get("ssl_version")
        info.ssl_error = environment.get("ssl_error") or ""
        info.jupyterlab_version = environment.get("jupyterlab_version")
        info.jupyterlab_installed = bool(info.jupyterlab_version)
        info.jupyterlab_language_pack_zh_cn_version = environment.get(
            "jupyterlab_language_pack_zh_cn_version"
        )
        info.jupyter_notebook_version = environment.get("jupyter_notebook_version")
        info.xedu_version = environment.get("xedu_version")
        info.xedu_version_ok = bool(environment.get("xedu_version_ok"))
        info.xedu_runtime_ok = bool(environment.get("xedu_runtime_ok"))
        info.xedu_repair_available = bool(environment.get("xedu_repair_available"))
        info.xedu_runtime_message = environment.get("xedu_runtime_message") or ""
        if info.xedu_version and not info.xedu_version_ok:
            info.xedu_runtime_message = f"检测到 xedu-python {info.xedu_version}，最低要求为 {EXPECTED_XEDU_VERSION}。"
    else:
        info.xedu_version_ok = False
        info.xedu_runtime_ok = False
        info.xedu_runtime_message = environment.get("message") or "无法检查所选 Python 环境。"

    return info


def get_teacher_code_from_request(req) -> str:
    payload = req.get_json(silent=True) or {}
    return (
        req.headers.get("X-Teacher-Code")
        or req.args.get("teacher_code")
        or payload.get("teacher_code")
        or payload.get("teacherCode")
        or ""
    )


def validate_teacher_code(req, app_config: AppConfig) -> bool:
    required = (app_config.ui.classroom_teacher_code or "").strip()
    if not required:
        return False
    provided = get_teacher_code_from_request(req)
    return (provided or "").strip() == required


def resolve_api_port_from_request() -> int:
    try:
        host = request.host or ""
        if ":" in host:
            return int(host.rsplit(":", 1)[-1])
    except Exception:
        pass
    return int(os.environ.get("XEDU_API_PORT") or os.environ.get("XEDU_BACKEND_PORT") or "5123")


def register_app_routes(app, services: dict, app_config: AppConfig) -> None:
    from .routes import register_all_routes

    register_all_routes(app, services)
    app.config["ALLOW_NETWORK_ACCESS"] = bool(getattr(app_config.ui, "allow_network_access", True))


def get_scratch_editor_build_dir() -> Path:
    resources_root = Path(__file__).resolve().parents[2]
    build_dir = resources_root / "scratch-editor" / "build"
    if build_dir.exists():
        return build_dir
    legacy_packaged_dir = resources_root / "scratch-editor"
    if (legacy_packaged_dir / "index.html").exists():
        return legacy_packaged_dir
    return build_dir


def build_route_services(
    *,
    app,
    app_config: AppConfig,
    config_service: ConfigService,
    jupyter_manager,
    ai_service: AIService,
    project_service,
    classroom_service,
    set_app_config,
    persist_config,
    serialize_status,
    get_app_config,
    looks_like_confirmation,
    looks_like_xedu_pack_request,
) -> dict:
    def _merge_jupyter_payload(payload: Dict[str, Any]) -> Dict[str, Any]:
        return merge_jupyter_payload(
            get_app_config(),
            payload,
            persist_config,
            jupyter_manager,
        )

    def _normalize_config_payload(payload: Dict[str, Any]) -> AppConfig:
        return normalize_config_payload(get_app_config(), payload)

    def _build_ai_service(overrides: Dict[str, Any]):
        return build_ai_service(get_app_config(), overrides)

    return {
        "logger": app.logger if hasattr(app, "logger") else None,
        "config_service": config_service,
        "jupyter_manager": jupyter_manager,
        "ai_service": ai_service,
        "project_service": project_service,
        "classroom_service": classroom_service,
        "get_app_config": get_app_config,
        "set_app_config": set_app_config,
        "normalize_config_payload": _normalize_config_payload,
        "merge_jupyter_payload": _merge_jupyter_payload,
        "serialize_status": serialize_status,
        "collect_system_info": collect_system_info,
        "resolve_api_port": resolve_api_port_from_request,
        "validate_teacher_code": lambda req: validate_teacher_code(req, get_app_config()),
        "build_ai_service": _build_ai_service,
        "looks_like_confirmation": looks_like_confirmation,
        "looks_like_xedu_pack_request": looks_like_xedu_pack_request,
        "parse_bool": parse_bool,
        "resolve_resources_token": resolve_resources_token,
        "normalize_resource_source": lambda raw, fallback_id: normalize_resource_source(raw, fallback_id, parse_bool),
        "collect_resource_sources": lambda ui_config: collect_resource_sources(ui_config, parse_bool),
        "resolve_resource_source_for_request": lambda ui_config, **kwargs: resolve_resource_source_for_request(
            ui_config,
            parse_bool,
            **kwargs,
        ),
        "build_single_course_source_entry": build_single_course_source_entry,
        "derive_course_id_from_path": derive_course_id_from_path,
        "issue_resource_handle": issue_resource_handle,
        "register_resource_root": register_resource_root,
        "resolve_resource_handle": resolve_resource_handle,
        "get_frontend_build_dir": get_frontend_build_dir,
        "get_scratch_editor_build_dir": get_scratch_editor_build_dir,
        "execute_xeduhub_runtime": execute_xeduhub_runtime,
        "execute_xeduhub_realtime": execute_xeduhub_realtime,
    }
