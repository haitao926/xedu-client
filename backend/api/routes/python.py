# -*- coding: utf-8 -*-
"""
Python/Pip 路由模块
"""

from __future__ import annotations

import ast
import json
import os
import re
import signal
import subprocess
import sys
import threading
from pathlib import Path

from flask import Response, jsonify, request, stream_with_context
from api.security import require_capability
from services.xeduhub_support import SMOKE_CHECKPOINT_MAP
from runtime.sample_assets import resolve_checkpoint_file

PYTHON_OUTPUT_LIMIT_BYTES = 1024 * 1024
_OUTPUT_TRUNCATION_NOTICE = "\n...[{stream} 输出已截断，已达到 1 MiB 上限]"


def _create_output_state(limit_bytes: int):
    return {
        "limit_bytes": limit_bytes,
        "remaining_bytes": limit_bytes,
        "buffers": {"stdout": [], "stderr": []},
        "truncated": {"stdout": False, "stderr": False},
        "lock": threading.Lock(),
    }


def _append_capped_output(state, stream_name: str, text: str):
    if not text:
        return

    encoded = str(text).encode("utf-8", errors="replace")
    with state["lock"]:
        remaining = state["remaining_bytes"]
        kept_bytes = encoded[:remaining] if remaining > 0 else b""
        if kept_bytes:
            state["buffers"][stream_name].append(kept_bytes.decode("utf-8", errors="ignore"))
            state["remaining_bytes"] -= len(kept_bytes)
        if len(kept_bytes) < len(encoded):
            state["truncated"][stream_name] = True


def _drain_process_stream(stream, stream_name: str, state):
    if stream is None:
        return

    try:
        while True:
            chunk = stream.read(8192)
            if not chunk:
                break
            _append_capped_output(state, stream_name, chunk)
    finally:
        stream.close()


def _finalize_capped_output(state):
    resource_events = []
    outputs = {}
    for stream_name in ("stdout", "stderr"):
        text = "".join(state["buffers"][stream_name])
        if state["truncated"][stream_name]:
            text = f"{text}{_OUTPUT_TRUNCATION_NOTICE.format(stream=stream_name)}"
            resource_events.append(
                {
                    "type": "output_truncated",
                    "stream": stream_name,
                    "limit_bytes": state["limit_bytes"],
                }
            )
        outputs[stream_name] = text
    return outputs, resource_events


def _terminate_python_process_tree(proc, logger):
    process_exited = proc.poll() is not None

    if os.name == "nt":
        try:
            subprocess.run(
                ["taskkill", "/F", "/T", "/PID", str(proc.pid)],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                check=False,
                timeout=5,
            )
        except Exception as exc:
            logger.warning(f"taskkill 终止 Python 进程树失败: {exc}")
        try:
            proc.wait(timeout=3)
        except subprocess.TimeoutExpired:
            try:
                proc.kill()
            except Exception:
                pass
        return

    try:
        pgid = os.getpgid(proc.pid)
    except ProcessLookupError:
        # POSIX runs use start_new_session=True, so the Popen PID is also the
        # process-group ID even if the parent exited just before cleanup.
        if os.name != "nt" and process_exited:
            pgid = proc.pid
        else:
            return
    except Exception as exc:
        logger.warning(f"获取 Python 进程组失败: {exc}")
        pgid = None

    if pgid is None:
        try:
            proc.terminate()
            proc.wait(timeout=3)
        except Exception:
            try:
                proc.kill()
            except Exception:
                pass
        return

    try:
        os.killpg(pgid, signal.SIGTERM)
        try:
            proc.wait(timeout=3)
        except subprocess.TimeoutExpired:
            pass

        # The parent can exit after SIGTERM while child processes remain in
        # the session. Escalate only if the captured process group still
        # exists, so timeouts cannot leave camera/model workers behind.
        try:
            os.killpg(pgid, 0)
        except ProcessLookupError:
            return
        else:
            os.killpg(pgid, signal.SIGKILL)
            try:
                proc.wait(timeout=3)
            except Exception:
                pass
    except ProcessLookupError:
        return
    except Exception as exc:
        logger.warning(f"终止 Python 进程组失败: {exc}")
        try:
            proc.kill()
        except Exception:
            pass


def _run_python_subprocess(command, *, cwd, env, timeout_seconds, logger):
    popen_kwargs = {
        "stdout": subprocess.PIPE,
        "stderr": subprocess.PIPE,
        "text": True,
        "cwd": cwd,
        "env": env,
        "bufsize": 1,
    }
    if os.name == "nt":
        popen_kwargs["creationflags"] = getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0)
    else:
        popen_kwargs["start_new_session"] = True

    proc = subprocess.Popen(command, **popen_kwargs)
    output_state = _create_output_state(PYTHON_OUTPUT_LIMIT_BYTES)
    threads = []
    for stream_name, stream in (("stdout", proc.stdout), ("stderr", proc.stderr)):
        thread = threading.Thread(
            target=_drain_process_stream,
            args=(stream, stream_name, output_state),
            daemon=True,
        )
        thread.start()
        threads.append(thread)

    timed_out = False
    try:
        return_code = proc.wait(timeout=timeout_seconds)
    except subprocess.TimeoutExpired:
        timed_out = True
        return_code = -1
        _terminate_python_process_tree(proc, logger)
    finally:
        for thread in threads:
            thread.join(timeout=5)

    outputs, resource_events = _finalize_capped_output(output_state)
    return {
        "return_code": return_code,
        "stdout": outputs["stdout"],
        "stderr": outputs["stderr"],
        "resource_events": resource_events,
        "timed_out": timed_out,
    }


def register_python_routes(app, services: dict):
    """注册 Python/Pip 相关路由"""
    get_app_config = services["get_app_config"]
    logger = services["logger"]

    def _inject_smoke_checkpoints(code: str) -> str:
        text = str(code or "")
        if "checkpoint=" in text:
            return text

        for runtime_task_id, checkpoint_name in SMOKE_CHECKPOINT_MAP.items():
            checkpoint_path = resolve_checkpoint_file(checkpoint_name)
            if not checkpoint_path:
                continue
            pattern = rf'wf\(\s*task\s*=\s*([\'"]){re.escape(runtime_task_id)}\1\s*\)'
            replacement = f'wf(task="{runtime_task_id}", checkpoint={repr(str(checkpoint_path))})'
            text = re.sub(pattern, replacement, text)
        return text

    def _parse_runtime_markers(text: str):
        events = []
        passthrough_lines = []
        for raw_line in str(text or "").splitlines():
            line = raw_line.strip()
            if line.startswith("__XEDU_RUNTIME__="):
                marker = line.split("=", 1)[1]
                try:
                    payload = ast.literal_eval(marker)
                except Exception:
                    passthrough_lines.append(raw_line)
                    continue
                if isinstance(payload, dict):
                    events.append(payload)
                    continue
            passthrough_lines.append(raw_line)
        cleaned = "\n".join(passthrough_lines).strip()
        return events, cleaned

    def _is_stream_python(code: str) -> bool:
        text = str(code or "")
        return "XEduCamera.camera(" in text or "XEduCamera.video(" in text

    def _stream_summary_from_events(events, stdout, stderr, return_code):
        summary = {
            "is_stream_run": True,
            "stream_status": "success" if return_code == 0 else "runtime_exception",
            "stream_kind": "",
            "source": "",
            "headline": "视频流执行完成" if return_code == 0 else "视频流执行失败",
            "hints": [],
            "metrics": [],
            "last_result": None,
        }
        opened = next((event for event in events if event.get("type") == "stream_opened"), None)
        closed = next((event for event in reversed(events) if event.get("type") == "stream_closed"), None)
        last_result_event = next((event for event in reversed(events) if event.get("type") == "stream_result"), None)
        stream_error_event = next((event for event in reversed(events) if event.get("type") == "stream_error"), None)
        if opened:
            summary["stream_kind"] = str(opened.get("stream_kind") or "").strip()
            summary["source"] = str(opened.get("source") or "").strip()
        if last_result_event and "result" in last_result_event:
            summary["last_result"] = last_result_event.get("result")
        if stream_error_event:
            summary["stream_status"] = str(stream_error_event.get("code") or "stream_error").strip() or "stream_error"
            summary["headline"] = str(stream_error_event.get("message") or "视频流执行异常").strip() or "视频流执行异常"
        if closed:
            reason = str(closed.get("reason") or "").strip()
            if reason in {"user_stopped", "window_closed"}:
                summary["stream_status"] = "stopped"
                summary["headline"] = "视频流已停止"
            elif reason == "stream_ended":
                summary["stream_status"] = "stream_ended"
                summary["headline"] = "视频流已自然结束"
            elif reason:
                summary["stream_status"] = reason
                summary["headline"] = "视频流执行异常"
        stderr_text = str(stderr or "")
        stdout_text = str(stdout or "")
        combined = "\n".join([stdout_text, stderr_text]).lower()
        if "not authorized to capture video" in combined:
            summary["stream_status"] = "permission_denied"
            summary["headline"] = "摄像头权限未授权"
            summary["hints"] = ["请在系统设置中授予摄像头权限后重试。"]
        elif "camera failed to properly initialize" in combined:
            summary["stream_status"] = "stream_open_failed"
            summary["headline"] = "摄像头初始化失败"
            summary["hints"] = ["请检查摄像头是否可用、是否被其他程序占用。"]
        elif return_code != 0:
            summary["stream_status"] = "runtime_exception"
            summary["headline"] = "视频流运行异常"
        if summary["stream_kind"]:
            summary["metrics"].append({"label": "视频源", "value": "摄像头" if summary["stream_kind"] == "camera" else "本地视频"})
        if summary["source"]:
            summary["metrics"].append({"label": "来源", "value": summary["source"]})
        if not summary["hints"]:
            if summary["stream_status"] == "stream_ended":
                summary["hints"] = ["视频已播放到结尾。"]
            elif summary["stream_status"] == "stopped":
                summary["hints"] = ["可重新运行以继续测试视频流任务。"]
            elif summary["stream_status"] == "success":
                summary["hints"] = ["视频流任务已完成，可查看最后一帧结果摘要。"]
            else:
                summary["hints"] = ["请检查视频源、模型加载以及当前 Python/OpenCV 环境。"]
        return summary

    def _visual_result_artifacts(events):
        preview_image = ""
        cards = []
        for event in events or []:
            event_type = str(event.get("type") or "").strip()
            if event_type == "result_image":
                image = str(event.get("image") or "").strip()
                if image.startswith("data:image/"):
                    preview_image = image
            elif event_type == "result_card":
                cards.append({
                    "title": str(event.get("title") or "运行结果"),
                    "result": event.get("result"),
                })
        return {
            "preview_image": preview_image,
            "result_cards": cards,
        }

    def _visual_result_summary(artifacts):
        cards = artifacts.get("result_cards") or []
        if cards:
            return {
                "headline": cards[-1]["title"],
                "metrics": [],
                "hints": ["结果卡已写入输出区。"],
            }
        if artifacts.get("preview_image"):
            return {
                "headline": "结果图已生成",
                "metrics": [],
                "hints": ["结果图已写入输出区。"],
            }
        return None

    @app.route("/api/python/run", methods=["POST"])
    @require_capability("python:run")
    def run_python_code():
        payload = request.get_json(silent=True) or {}
        code = _inject_smoke_checkpoints(str(payload.get("code") or ""))
        if not code.strip():
            return jsonify({"success": False, "message": "代码不能为空"}), 400

        app_config = get_app_config()
        python_path = (
            app_config.jupyter.python_executable
            or sys.executable
        )
        timeout_seconds = int(payload.get("timeout_seconds") or 20)
        timeout_seconds = max(1, min(timeout_seconds, 120))
        if _is_stream_python(code):
            timeout_seconds = max(timeout_seconds, 90)

        project_root = str(payload.get("project_root") or "").strip()
        cwd = None
        if project_root:
            if not os.path.isdir(project_root):
                return jsonify({"success": False, "message": "运行目录不存在"}), 400
            cwd = project_root
        elif app_config.jupyter.project_dir and os.path.isdir(app_config.jupyter.project_dir):
            cwd = app_config.jupyter.project_dir

        env = dict(os.environ)
        env.setdefault("PYTHONIOENCODING", "utf-8")
        env.setdefault("MPLBACKEND", "Agg")
        backend_dir = str(Path(__file__).resolve().parents[2])
        existing_pythonpath = str(env.get("PYTHONPATH") or "").strip()
        env["PYTHONPATH"] = (
            f"{backend_dir}{os.pathsep}{existing_pythonpath}"
            if existing_pythonpath
            else backend_dir
        )

        try:
            result = _run_python_subprocess(
                [python_path, "-c", code],
                cwd=cwd,
                env=env,
                timeout_seconds=timeout_seconds,
                logger=logger,
            )
            if result["timed_out"]:
                resource_events = list(result["resource_events"])
                resource_events.append(
                    {
                        "type": "timeout_terminated",
                        "limit_seconds": timeout_seconds,
                    }
                )
                return jsonify({
                    "success": False,
                    "message": "Python 代码执行超时",
                    "result": {
                        "stdout": str(result["stdout"] or "").strip(),
                        "stderr": str(result["stderr"] or "").strip(),
                        "return_code": -1,
                        "resource_events": resource_events,
                    },
                    "result_summary": {
                        "headline": "视频流执行超时" if _is_stream_python(code) else "Python 代码执行超时",
                        "metrics": [],
                        "hints": ["请缩短视频样例时长，或检查是否未手动关闭摄像头/视频窗口。"] if _is_stream_python(code) else [],
                    },
                }), 500

            success = result["return_code"] == 0
            runtime_events, cleaned_stdout = _parse_runtime_markers(result["stdout"])
            cleaned_stderr = str(result["stderr"] or "").strip()
            visual_artifacts = _visual_result_artifacts(runtime_events)
            response_payload = {
                "success": success,
                "message": "运行成功" if success else "运行失败",
                "output": cleaned_stdout,
                "error_output": cleaned_stderr,
                "return_code": result["return_code"],
                "result": {
                    "stdout": cleaned_stdout,
                    "stderr": cleaned_stderr,
                    "return_code": result["return_code"],
                    "runtime_events": runtime_events,
                    "resource_events": result["resource_events"],
                    "result_artifacts": visual_artifacts,
                },
            }
            if visual_artifacts["preview_image"]:
                response_payload["artifacts"] = {"image_data": visual_artifacts["preview_image"]}
            visual_summary = _visual_result_summary(visual_artifacts)
            if visual_summary:
                response_payload["result_summary"] = visual_summary
            if _is_stream_python(code):
                stream_summary = _stream_summary_from_events(runtime_events, cleaned_stdout, cleaned_stderr, result["return_code"])
                response_payload["message"] = stream_summary["headline"]
                response_payload["result"]["is_stream_run"] = True
                response_payload["result"]["stream_status"] = stream_summary["stream_status"]
                response_payload["result"]["stream_kind"] = stream_summary["stream_kind"]
                response_payload["result"]["stream_source"] = stream_summary["source"]
                response_payload["result"]["output"] = stream_summary["last_result"]
                response_payload["success"] = stream_summary["stream_status"] in {"success", "stream_ended", "stopped"}
                response_payload["result_summary"] = {
                    "headline": stream_summary["headline"],
                    "metrics": stream_summary["metrics"],
                    "hints": stream_summary["hints"],
                }
                if not response_payload["success"] and response_payload["result"]["return_code"] == 0:
                    response_payload["return_code"] = 1
                    response_payload["result"]["return_code"] = 1
            return (
                jsonify(response_payload),
                200 if response_payload["success"] else 400,
            )
        except Exception as exc:
            logger.error(f"Python 代码执行异常: {exc}")
            return jsonify({"success": False, "message": "Python 代码执行失败"}), 500

    @app.route("/api/python/pip", methods=["POST"])
    @require_capability("python:run")
    def manage_python_package():
        payload = request.get_json(silent=True) or {}
        action = (payload.get("action") or "").lower()
        package = (payload.get("package") or "").strip()
        use_mirror = bool(payload.get("use_mirror", True))
        index_url = payload.get("index_url")
        stream = bool(payload.get("stream"))

        if action not in {"install", "uninstall", "list", "upgrade"}:
            return jsonify({"success": False, "message": "无效的操作类型"}), 400

        if action in {"install", "uninstall", "upgrade"} and not package:
            return jsonify({"success": False, "message": "包名不能为空"}), 400

        app_config = get_app_config()
        python_path = (
            app_config.jupyter.python_executable
            or sys.executable
        )

        cmd = [python_path, "-m", "pip"]
        if action == "install":
            cmd += ["install", package]
        elif action == "upgrade":
            cmd += ["install", "--upgrade", package]
        elif action == "uninstall":
            cmd += ["uninstall", "-y", package]
        elif action == "list":
            cmd += ["list"]

        if use_mirror and action in {"install", "upgrade"}:
            cmd += ["-i", index_url or "https://pypi.tuna.tsinghua.edu.cn/simple"]

        logger.info(f"执行 pip 命令: {' '.join(cmd)}")

        if stream:
            def generate():
                try:
                    proc = subprocess.Popen(
                        cmd,
                        stdout=subprocess.PIPE,
                        stderr=subprocess.STDOUT,
                        text=True,
                        bufsize=1,
                        universal_newlines=True,
                    )
                    if proc.stdout:
                        for line in proc.stdout:
                            yield line
                    ret = proc.wait()
                    yield f"\n=== 退出码: {ret} ===\n"
                    payload = {'return_code': ret, 'success': ret == 0}
                    yield f"__XEDU_PIP_RESULT__={json.dumps(payload, ensure_ascii=False)}\n"
                except Exception as exc:
                    logger.error(f"pip 流式命令执行异常: {exc}")
                    yield "\n[error] pip 命令执行失败\n"
                    payload = {'return_code': -1, 'success': False, 'message': "pip 命令执行失败"}
                    yield f"__XEDU_PIP_RESULT__={json.dumps(payload, ensure_ascii=False)}\n"

            return Response(stream_with_context(generate()), mimetype="text/plain")

        try:
            result = subprocess.run(
                cmd, capture_output=True, text=True, timeout=300, check=False
            )
            success = result.returncode == 0
            return (
                jsonify(
                    {
                        "success": success,
                        "message": "操作成功" if success else "操作失败",
                        "output": result.stdout,
                        "error_output": result.stderr,
                        "return_code": result.returncode,
                    }
                ),
                200 if success else 500,
            )
        except subprocess.TimeoutExpired:
            return jsonify({"success": False, "message": "pip 命令执行超时"}), 500
        except Exception as exc:
            logger.error(f"pip 命令执行异常: {exc}")
            return jsonify({"success": False, "message": "pip 命令执行失败"}), 500
