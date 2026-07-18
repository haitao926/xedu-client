# -*- coding: utf-8 -*-
"""
QuickForm 路由模块
"""

from __future__ import annotations

from flask import jsonify, request

from api.security import require_capability
from services.quickform_service import QuickFormServiceError


def register_quickform_routes(app, services: dict):
    """注册 QuickForm 相关路由"""

    build_quickform_service = services["build_quickform_service"]
    merge_quickform_config = services["merge_quickform_config"]
    logger = services["logger"]

    @app.route("/api/quickform/test", methods=["POST"])
    @require_capability("config:read")
    def quickform_test():
        payload = request.get_json(silent=True) or {}
        overrides = payload.get("config") if isinstance(payload.get("config"), dict) else payload
        try:
            service = build_quickform_service(overrides)
            tasks = service.list_tasks()
            cfg = merge_quickform_config(overrides)
            return jsonify({
                "success": True,
                "message": "QuickForm 连接成功",
                "count": len(tasks),
                "config": {
                    "enabled": cfg.get("enabled", False),
                    "base_url": cfg.get("base_url", ""),
                    "username": cfg.get("username", ""),
                },
            })
        except QuickFormServiceError as exc:
            return jsonify({"success": False, "message": str(exc)}), 400
        except Exception as exc:
            logger.error(f"QuickForm 测试失败: {exc}")
            return jsonify({"success": False, "message": "QuickForm 测试失败"}), 500

    @app.route("/api/quickform/tasks", methods=["POST"])
    @require_capability("config:read")
    def quickform_tasks():
        payload = request.get_json(silent=True) or {}
        overrides = payload.get("config") if isinstance(payload.get("config"), dict) else payload
        try:
            service = build_quickform_service(overrides)
            tasks = [task.to_dict() for task in service.list_tasks()]
            return jsonify({
                "success": True,
                "tasks": tasks,
            })
        except QuickFormServiceError as exc:
            return jsonify({"success": False, "message": str(exc)}), 400
        except Exception as exc:
            logger.error(f"读取 QuickForm 任务失败: {exc}")
            return jsonify({"success": False, "message": "读取 QuickForm 任务失败"}), 500

    @app.route("/api/quickform/tasks/create", methods=["POST"])
    @require_capability("config:write")
    def quickform_create_task():
        payload = request.get_json(silent=True) or {}
        overrides = payload.get("config") if isinstance(payload.get("config"), dict) else None
        task_name = str(payload.get("task_name") or payload.get("title") or "").strip()
        task_intro = str(payload.get("task_intro") or payload.get("description") or "").strip()
        try:
            service = build_quickform_service(overrides)
            task = service.create_task(task_name=task_name, task_intro=task_intro)
            return jsonify({
                "success": True,
                "message": "QuickForm 任务创建成功",
                "task": task.to_dict(),
            })
        except QuickFormServiceError as exc:
            return jsonify({"success": False, "message": str(exc)}), 400
        except Exception as exc:
            logger.error(f"创建 QuickForm 任务失败: {exc}")
            return jsonify({"success": False, "message": "创建 QuickForm 任务失败"}), 500
