# -*- coding: utf-8 -*-
"""
课堂路由模块
"""

from __future__ import annotations

import os

from flask import Response, after_this_request, jsonify, request, send_file

from api.security import require_capability
from services.classroom_service import ClassroomService, ClassroomServiceError


def register_classroom_routes(app, services: dict):
    """注册课堂相关路由"""

    classroom_service = services["classroom_service"]
    logger = services["logger"]
    validate_teacher_code = services["validate_teacher_code"]

    @app.route("/api/classroom/sync-courses", methods=["POST"])
    @require_capability("resource:write")
    def classroom_sync_courses():
        courses = (request.get_json(silent=True) or {}).get("courses", [])
        count = classroom_service.update_courses(courses)
        return jsonify({"success": True, "count": count})

    @app.route("/api/classroom/start", methods=["POST"])
    @require_capability("resource:write")
    def classroom_start():
        payload = request.get_json(silent=True) or {}
        if not validate_teacher_code(request):
            return jsonify({"success": False, "message": "教师口令错误"}), 403

        name = payload.get("name", "")
        code = payload.get("code", "")
        port = int(payload.get("port") or 5123)
        status = classroom_service.start(name, code, port)

        course_id = str(payload.get("course_id") or "").strip()
        section_index = payload.get("section_index")
        if course_id:
            try:
                status = classroom_service.set_active_course(course_id, section_index)
            except ClassroomServiceError as exc:
                return jsonify({"success": False, "message": str(exc)}), 400

        return jsonify({"success": True, "status": status})

    @app.route("/api/classroom/stop", methods=["POST"])
    @require_capability("resource:write")
    def classroom_stop():
        if not validate_teacher_code(request):
            return jsonify({"success": False, "message": "教师口令错误"}), 403
        status = classroom_service.stop()
        return jsonify({"success": True, "status": status})

    @app.route("/api/classroom/status")
    def classroom_status():
        return jsonify({"success": True, "status": classroom_service.status()})

    @app.route("/api/classroom/verify-teacher", methods=["POST"])
    @require_capability("config:read")
    def classroom_verify_teacher():
        return jsonify({"success": validate_teacher_code(request)})

    @app.route("/api/classroom/discover")
    def classroom_discover():
        timeout = float(request.args.get("timeout") or 1.5)
        max_results = int(request.args.get("max_results") or 6)
        results = ClassroomService.discover(timeout=timeout, max_results=max_results)
        return jsonify({"success": True, "classrooms": results})

    @app.route("/api/classroom/fetch-index", methods=["POST"])
    @require_capability("resource:read")
    def classroom_fetch_index():
        payload = request.get_json(silent=True) or {}
        base_url = payload.get("base_url", "")
        try:
            result = ClassroomService.fetch_index(base_url)
            return jsonify({"success": True, **result})
        except ClassroomServiceError as exc:
            return jsonify({"success": False, "message": str(exc)}), 400
        except Exception as exc:
            logger.error(f"获取课堂索引失败: {exc}")
            return jsonify({"success": False, "message": "获取课堂索引失败"}), 500

    @app.route("/api/classroom/index")
    def classroom_index():
        status = classroom_service.status()
        if not status.get("active"):
            return jsonify({"success": False, "message": "课堂未开启"}), 404
        base_url = f"http://127.0.0.1:{services['resolve_api_port']()}"
        index_data = classroom_service.build_index(base_url)
        return jsonify({
            "success": True,
            "index": index_data,
            "source_url": f"{base_url}/api/classroom/index",
            "branch": "classroom",
        })

    @app.route("/api/classroom/course/<course_id>/course.json")
    def classroom_course(course_id):
        status = classroom_service.status()
        if not status.get("active"):
            return jsonify({"success": False, "message": "课堂未开启"}), 404
        try:
            data = classroom_service.read_course_json_bytes(course_id)
            return Response(data, mimetype="application/json")
        except ClassroomServiceError as exc:
            return jsonify({"success": False, "message": str(exc)}), 404
        except Exception as exc:
            logger.error(f"读取课堂课程失败: {exc}")
            return jsonify({"success": False, "message": "读取课堂课程失败"}), 500

    @app.route("/api/classroom/file/<course_id>/<path:relpath>")
    def classroom_file(course_id, relpath):
        status = classroom_service.status()
        if not status.get("active"):
            return jsonify({"success": False, "message": "课堂未开启"}), 404
        try:
            file_path = classroom_service.resolve_file_path(course_id, relpath)
            return send_file(file_path)
        except ClassroomServiceError as exc:
            return jsonify({"success": False, "message": str(exc)}), 404
        except Exception as exc:
            logger.error(f"读取课堂文件失败: {exc}")
            return jsonify({"success": False, "message": "读取课堂文件失败"}), 500

    @app.route("/api/classroom/package/<course_id>/<version>.zip")
    def classroom_package(course_id, version):
        status = classroom_service.status()
        if not status.get("active"):
            return jsonify({"success": False, "message": "课堂未开启"}), 404
        try:
            zip_path = classroom_service.build_package(course_id, version)
        except ClassroomServiceError as exc:
            return jsonify({"success": False, "message": str(exc)}), 404
        except Exception as exc:
            logger.error(f"生成课堂课程包失败: {exc}")
            return jsonify({"success": False, "message": "生成课程包失败"}), 500

        @after_this_request
        def _cleanup(response):
            try:
                os.unlink(zip_path)
            except Exception:
                pass
            return response

        return send_file(
            zip_path,
            as_attachment=True,
            download_name=f"{course_id}-{version}.zip",
            mimetype="application/zip",
        )

    @app.route("/api/classroom/pull", methods=["POST"])
    @require_capability("resource:write")
    def classroom_pull():
        payload = request.get_json(silent=True) or {}
        package_url = payload.get("package_url", "")
        target_path = payload.get("target_path", "")
        try:
            result = ClassroomService.pull_package(package_url, target_path)
            return jsonify({"success": True, **result})
        except ClassroomServiceError as exc:
            return jsonify({"success": False, "message": str(exc)}), 400
        except Exception as exc:
            logger.error(f"导入课堂课程失败: {exc}")
            return jsonify({"success": False, "message": "导入课堂课程失败"}), 500
