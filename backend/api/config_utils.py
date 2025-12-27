#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Config utility helpers for the Flask API layer.
Encapsulates parsing and normalization so create_app stays lean.
"""

from __future__ import annotations

from typing import Any, Callable, Dict

from models.config import AppConfig, JupyterConfig, AIConfig
from services.ai_service import AIService
from utils.logger import get_logger

logger = get_logger(__name__)


def parse_bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() in {"true", "1", "yes", "on"}
    return bool(value)


def merge_jupyter_payload(
    app_config: AppConfig,
    payload: Dict[str, Any],
    persist_callback: Callable[[AppConfig], bool],
    jupyter_manager,
) -> Dict[str, Any]:
    if not payload:
        return app_config.jupyter.to_dict()

    jupyter_dict = app_config.jupyter.to_dict()
    changed = False
    for key, value in payload.items():
        if not isinstance(key, str) or key not in jupyter_dict:
            continue

        # Ignore empty project_dir updates so we keep the last usable path as default
        if key == "project_dir":
            if value is None:
                continue
            if isinstance(value, str) and not value.strip():
                continue

        if key == "port" and isinstance(value, (int, str)):
            jupyter_dict[key] = int(value)
        elif key in ["use_notebook", "auto_start", "auto_restart", "debug"]:
            jupyter_dict[key] = parse_bool(value)
        elif key in ["check_interval", "max_restarts", "timeout"] and isinstance(value, (int, str)):
            jupyter_dict[key] = int(value)
        else:
            jupyter_dict[key] = value

        setattr(app_config.jupyter, key, jupyter_dict[key])
        changed = True

    if changed:
        if not persist_callback(app_config):
            logger.warning("配置保存失败，使用内存配置继续运行")
        jupyter_manager.config = JupyterConfig.from_dict(jupyter_dict)

    return jupyter_dict


def normalize_config_payload(app_config: AppConfig, payload: Dict[str, Any]) -> AppConfig:
    base = app_config.to_dict()
    if any(section in payload for section in ("jupyter", "ui", "ai")):
        for section in ("jupyter", "ui", "ai"):
            if isinstance(payload.get(section), dict):
                base[section].update(payload[section])
    else:
        base["jupyter"].update(payload)
    return AppConfig.from_dict(base)


def build_ai_service(app_config: AppConfig, overrides: Dict[str, Any]) -> AIService:
    ai_dict = app_config.ai.to_dict()
    for key, value in (overrides or {}).items():
        if key in ai_dict:
            ai_dict[key] = value
    return AIService(AIConfig.from_dict(ai_dict))
