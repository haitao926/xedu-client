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
from services.ai_service import AIService
from services.blockly_builder_agent_service import (
    BlocklyBuilderAgentService,
    BlocklyBuilderToolAdapter,
)
from services.config_service import ConfigService
from services.gitea_service import GiteaClient, GiteaServiceError, publish_course, save_course_json
from services.quickform_agent_service import QuickFormAgentService, QuickFormAgentToolAdapter
from services.quickform_service import QuickFormService, QuickFormServiceError
from services.xedu_pack_agent_service import XEduPackAgentService, XEduPackToolAdapter
from .config_utils import build_ai_service, merge_jupyter_payload, normalize_config_payload
from .quickform_runtime import inject_quickform_file, merge_quickform_config, normalize_quickform_public_config
from .resource_runtime import (
    build_blockly_playground_html,
    build_single_course_source_entry,
    collect_resource_sources,
    issue_resource_handle,
    register_resource_root,
    resolve_resource_handle,
    derive_course_id_from_path,
    execute_xeduhub_runtime,
    get_frontend_build_dir,
    guess_blockly_notebook_path,
    guess_blockly_python_path,
    guess_blockly_toolbox_path,
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
    info = SystemInfo(
        python_version=platform.python_version(),
        python_executable=python_executable or sys.executable,
        platform=platform.platform(),
        xedu_expected_version=EXPECTED_XEDU_VERSION,
    )

    try:
        import jupyterlab  # type: ignore

        info.jupyterlab_installed = True
        info.jupyterlab_version = getattr(jupyterlab, "__version__", None)
    except Exception:
        info.jupyterlab_installed = False

    try:
        import notebook  # type: ignore

        info.jupyter_notebook_version = getattr(notebook, "__version__", None)
    except Exception:
        info.jupyter_notebook_version = None

    try:
        site_packages = _resolve_site_packages(info.python_executable)
        if site_packages is None:
            info.xedu_runtime_message = "未找到 site-packages，无法检查 XEdu 运行时。"
        else:
            version = _read_xedu_version_from_site_packages(site_packages)
            info.xedu_version = version
            info.xedu_version_ok = version == EXPECTED_XEDU_VERSION
            if version:
                info.xedu_runtime_message = (
                    f"已检测到 xedu-python {version}。"
                    if info.xedu_version_ok
                    else f"检测到 xedu-python {version}，预期应为 {EXPECTED_XEDU_VERSION}。"
                )
            else:
                info.xedu_runtime_message = "当前 Python 环境未检测到 xedu-python / XEduHub 运行时。"
                info.xedu_version_ok = False
    except Exception as exc:
        info.xedu_runtime_message = f"检查 XEdu 运行时失败: {exc}"
        info.xedu_version_ok = False

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
        return True
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


def save_local_course(local_path: str, course: Dict[str, Any]) -> Dict[str, Any]:
    result = save_course_json(local_path, course)
    normalized_course = dict(result.course or {})
    normalized_course["local_path"] = local_path
    normalized_course["source"] = "local"
    return {
        "course": normalized_course,
        "summary": result.summary,
    }


def build_quickform_service(app_config: AppConfig, overrides: Dict[str, Any] | None = None) -> QuickFormService:
    cfg = merge_quickform_config(app_config.ui, parse_bool, overrides)
    if not cfg.get("enabled"):
        raise QuickFormServiceError("请先在设置中启用 QuickForm")
    return QuickFormService(
        base_url=cfg["base_url"],
        username=cfg["username"],
        password=cfg["password"],
    )


def build_quickform_tool_adapter(
    *,
    app_config: AppConfig,
    validate_teacher_code_fn,
    overrides: Dict[str, Any] | None = None,
) -> QuickFormAgentToolAdapter:
    def mutation_guard(request_context: Dict[str, Any]) -> tuple[bool, str]:
        if not validate_teacher_code_fn(request, app_config):
            return False, "教师权限校验失败"
        if not request_context.get("confirmed"):
            return False, "请先让教师明确确认后再执行写入"
        return True, ""

    return QuickFormAgentToolAdapter(
        quickform_factory=lambda: build_quickform_service(app_config, overrides),
        mutation_guard=mutation_guard,
        html_injector=lambda local_path, html_path, quickform, create_backup=True: inject_quickform_file(
            local_path,
            html_path,
            quickform,
            create_backup,
            parse_bool,
            resolve_local_course_file,
        ),
        course_saver=save_local_course,
    )


def build_quickform_agent_service(
    *,
    app,
    app_config: AppConfig,
    overrides: Dict[str, Any] | None = None,
    validate_teacher_code_fn=validate_teacher_code,
) -> QuickFormAgentService:
    runner_factory = app.config.get("KIMI_AGENT_RUNNER_FACTORY")
    runner = runner_factory() if callable(runner_factory) else None
    return QuickFormAgentService(
        ai_config=build_ai_service(app_config, overrides).config,
        tool_adapter=build_quickform_tool_adapter(
            app_config=app_config,
            validate_teacher_code_fn=validate_teacher_code_fn,
            overrides=overrides,
        ),
        fallback_ai_service=build_ai_service(app_config, overrides),
        runner=runner,
    )


def publish_xedu_pack_output(app_config: AppConfig, local_path: str, options: Dict[str, Any] | None = None) -> Dict[str, Any]:
    payload = options or {}
    course_meta = payload.get("course") if isinstance(payload.get("course"), dict) else {}
    source_override = (course_meta.get("origin") if isinstance(course_meta.get("origin"), dict) else {}) or {}
    source_id = str(payload.get("source_id") or source_override.get("source_id") or "").strip()
    version = str(payload.get("version") or course_meta.get("version") or "").strip()

    selected_source = resolve_resource_source_for_request(
        app_config.ui,
        parse_bool,
        source_id=source_id,
        source_override=source_override,
    )
    if not selected_source:
        raise GiteaServiceError("未配置可用的课程发布源")

    base_url = (selected_source.get("base_url") or "").rstrip("/")
    repo = (selected_source.get("repo") or "").strip("/")
    branch = (selected_source.get("branch") or "main").strip() or "main"
    publish_path = (selected_source.get("publish_path") or "courses").strip("/") or "courses"
    token = resolve_resources_token(app_config.ui, "")
    single_course_repo = parse_bool(selected_source.get("single_course_repo"), True)

    if not token:
        raise GiteaServiceError("写操作需要 Token（请在设置中填写或由服务端配置 XEDU_GITEA_TOKEN）")

    client = GiteaClient(base_url, repo, branch, token)
    repo_status = client.ensure_repo(create_if_missing=True, private=False, description="")
    result = publish_course(
        local_path=local_path,
        client=client,
        publish_path=publish_path,
        course_id=str(course_meta.get("id") or "").strip(),
        version=version,
        meta_override={
            "title": course_meta.get("title") or "",
            "description": course_meta.get("description") or "",
            "grade": course_meta.get("grade") or "",
            "subject": course_meta.get("subject") or "",
            "author": course_meta.get("author") or "",
            "tags": course_meta.get("tags") or [],
            "version": version,
        },
        publish_branch="",
        create_pr=True,
        pr_base_branch=branch,
        single_course_repo=single_course_repo,
    )
    return {
        "result": result,
        "pr_url": ((result.get("pull_request") or {}).get("url") or ""),
        "repo_created": bool(repo_status.get("created")),
        "origin": {
            "source_id": selected_source.get("id", ""),
            "base_url": base_url,
            "repo": repo,
            "branch": branch,
            "publish_path": "" if single_course_repo else publish_path,
            "single_course_repo": single_course_repo,
        },
    }


def build_xedu_pack_tool_adapter(app_config: AppConfig, validate_teacher_code_fn=validate_teacher_code) -> XEduPackToolAdapter:
    def mutation_guard(request_context: Dict[str, Any]) -> tuple[bool, str]:
        if not validate_teacher_code_fn(request, app_config):
            return False, "教师权限校验失败"
        if not request_context.get("confirmed"):
            return False, "请先让教师明确确认后再执行写入"
        return True, ""

    return XEduPackToolAdapter(
        mutation_guard=mutation_guard,
        publisher=lambda local_path, options=None: publish_xedu_pack_output(app_config, local_path, options),
    )


def build_xedu_pack_agent_service(*, app, app_config: AppConfig, overrides: Dict[str, Any] | None = None) -> XEduPackAgentService:
    runner_factory = app.config.get("KIMI_AGENT_RUNNER_FACTORY")
    runner = runner_factory() if callable(runner_factory) else None
    return XEduPackAgentService(
        ai_config=build_ai_service(app_config, overrides).config,
        tool_adapter=build_xedu_pack_tool_adapter(app_config),
        fallback_ai_service=build_ai_service(app_config, overrides),
        runner=runner,
    )


def build_blockly_builder_tool_adapter(
    *,
    app_config: AppConfig,
    config_service: ConfigService,
    validate_teacher_code_fn=validate_teacher_code,
) -> BlocklyBuilderToolAdapter:
    def mutation_guard(request_context: Dict[str, Any]) -> tuple[bool, str]:
        if not validate_teacher_code_fn(request, app_config):
            return False, "教师权限校验失败"
        if not request_context.get("confirmed"):
            return False, "请先让教师明确确认后再执行写入"
        return True, ""

    return BlocklyBuilderToolAdapter(
        mutation_guard=mutation_guard,
        draft_root=config_service.config_dir / "blockly_drafts",
    )


def build_blockly_builder_agent_service(
    *,
    app,
    app_config: AppConfig,
    config_service: ConfigService,
    overrides: Dict[str, Any] | None = None,
) -> BlocklyBuilderAgentService:
    runner_factory = app.config.get("KIMI_AGENT_RUNNER_FACTORY")
    runner = runner_factory() if callable(runner_factory) else None
    return BlocklyBuilderAgentService(
        ai_config=build_ai_service(app_config, overrides).config,
        tool_adapter=build_blockly_builder_tool_adapter(
            app_config=app_config,
            config_service=config_service,
        ),
        fallback_ai_service=build_ai_service(app_config, overrides),
        runner=runner,
    )


def register_app_routes(app, services: dict, app_config: AppConfig) -> None:
    from .routes import register_all_routes

    register_all_routes(app, services)
    app.config["ALLOW_NETWORK_ACCESS"] = bool(getattr(app_config.ui, "allow_network_access", False))


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
    looks_like_quickform_request,
    looks_like_xedu_pack_request,
    looks_like_blockly_builder_request,
    get_nonblocking_supported_tasks_snapshot,
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
        "build_quickform_service": lambda overrides=None: build_quickform_service(get_app_config(), overrides),
        "merge_quickform_config": lambda overrides=None: merge_quickform_config(get_app_config().ui, parse_bool, overrides),
        "build_ai_service": _build_ai_service,
        "build_quickform_agent_service": lambda overrides=None: build_quickform_agent_service(
            app=app,
            app_config=get_app_config(),
            overrides=overrides,
        ),
        "build_xedu_pack_agent_service": lambda overrides=None: build_xedu_pack_agent_service(
            app=app,
            app_config=get_app_config(),
            overrides=overrides,
        ),
        "build_blockly_builder_agent_service": lambda overrides=None: build_blockly_builder_agent_service(
            app=app,
            app_config=get_app_config(),
            config_service=config_service,
            overrides=overrides,
        ),
        "looks_like_confirmation": looks_like_confirmation,
        "looks_like_quickform_request": looks_like_quickform_request,
        "looks_like_xedu_pack_request": looks_like_xedu_pack_request,
        "looks_like_blockly_builder_request": looks_like_blockly_builder_request,
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
        "resolve_local_course_file": resolve_local_course_file,
        "normalize_quickform_public_config": lambda raw: normalize_quickform_public_config(raw, parse_bool),
        "inject_quickform_file": lambda local_path, html_path, quickform, create_backup=True: inject_quickform_file(
            local_path,
            html_path,
            quickform,
            create_backup,
            parse_bool,
            resolve_local_course_file,
        ),
        "guess_blockly_toolbox_path": guess_blockly_toolbox_path,
        "guess_blockly_python_path": guess_blockly_python_path,
        "guess_blockly_notebook_path": guess_blockly_notebook_path,
        "get_frontend_build_dir": get_frontend_build_dir,
        "build_blockly_playground_html": build_blockly_playground_html,
        "execute_xeduhub_runtime": execute_xeduhub_runtime,
        "get_nonblocking_supported_tasks_snapshot": get_nonblocking_supported_tasks_snapshot,
    }
