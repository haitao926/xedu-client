"""Jupyter Server extension exposing the local ESP32 MicroPython session."""

from __future__ import annotations

import asyncio
import atexit
import json
from pathlib import Path
from typing import Any

try:
    from jupyter_server.base.handlers import JupyterHandler
    from jupyter_server.utils import url_path_join
except ImportError:  # pragma: no cover - unit tests stub the Jupyter host
    JupyterHandler = object

    def url_path_join(*pieces: str) -> str:
        initial = pieces[0] if pieces else ""
        trailing = pieces[-1] if pieces else ""
        joined = "/".join(part.strip("/") for part in pieces if part and part.strip("/"))
        if initial.startswith("/"):
            joined = f"/{joined}"
        if trailing.endswith("/") and joined and not joined.endswith("/"):
            joined += "/"
        return joined or "/"

from services.micropython_session import MicroPythonSessionError, MicroPythonSessionManager


_MANAGER_KEY = "xedu_micropython_manager"


def _json(handler: Any, payload: dict[str, Any], status: int = 200) -> None:
    handler.set_status(status)
    handler.set_header("Content-Type", "application/json; charset=utf-8")
    handler.finish(json.dumps(payload, ensure_ascii=False))


def _manager(handler: Any) -> MicroPythonSessionManager:
    manager = getattr(handler, "settings", {}).get(_MANAGER_KEY)
    if not isinstance(manager, MicroPythonSessionManager):
        raise MicroPythonSessionError("MicroPython 设备服务尚未启动。")
    return manager


def parse_json_body(body: bytes | str | None) -> dict[str, Any]:
    if not body:
        return {}
    if isinstance(body, bytes):
        try:
            text = body.decode("utf-8")
        except UnicodeDecodeError as exc:
            raise MicroPythonSessionError("请求数据格式无效。") from exc
    else:
        text = str(body)
    try:
        payload = json.loads(text)
    except json.JSONDecodeError as exc:
        raise MicroPythonSessionError("请求数据格式无效。") from exc
    if not isinstance(payload, dict):
        raise MicroPythonSessionError("请求数据格式无效。")
    return payload


def dispatch_micropython_request(
    manager: MicroPythonSessionManager,
    *,
    method: str,
    action: str,
    payload: dict[str, Any] | None = None,
    after: int = 0,
) -> tuple[int, dict[str, Any]]:
    """Handle a same-origin device request without touching Jupyter internals."""
    verb = str(method or "").upper()
    route = str(action or "").strip().strip("/")
    payload = payload or {}
    try:
        if verb == "GET" and route == "ports":
            return 200, {"success": True, "ports": manager.list_ports()}
        if verb == "GET" and route == "output":
            return 200, {"success": True, **manager.read_output(after=after)}
        if verb == "POST" and route == "connect":
            return 200, {"success": True, **manager.connect(str(payload.get("port") or ""))}
        if verb == "POST" and route == "disconnect":
            return 200, {"success": True, **manager.disconnect()}
        if verb == "POST" and route == "run":
            return 200, {"success": True, **manager.run_file(str(payload.get("file") or ""))}
        if verb == "POST" and route == "input":
            return 200, {"success": True, **manager.write_input(str(payload.get("text") or ""))}
        if verb == "POST" and route == "interrupt":
            return 200, {"success": True, **manager.interrupt()}
        if verb == "POST" and route == "reset":
            return 200, {"success": True, **manager.reset()}
        return 404, {"success": False, "message": "不支持的 MicroPython 请求。"}
    except MicroPythonSessionError as exc:
        return 400, {"success": False, "message": str(exc)}


class MicroPythonHandler(JupyterHandler):
    def _payload(self) -> dict[str, Any]:
        return parse_json_body(getattr(getattr(self, "request", None), "body", b""))

    async def _dispatch(self, method: str, action: str | None, payload: dict[str, Any] | None = None) -> None:
        try:
            after = 0
            if method == "GET" and action == "output":
                try:
                    after = int(self.get_argument("after", "0"))
                except (TypeError, ValueError):
                    after = 0
            manager = _manager(self)
            loop = asyncio.get_running_loop()
            status, body = await loop.run_in_executor(
                None,
                lambda: dispatch_micropython_request(
                    manager,
                    method=method,
                    action=action or "",
                    payload=payload,
                    after=after,
                ),
            )
            _json(self, body, status)
        except MicroPythonSessionError as exc:
            _json(self, {"success": False, "message": str(exc)}, 400)
        except Exception:
            log = getattr(self, "log", None)
            if log is not None:
                log.exception("MicroPython Jupyter route failed")
            _json(self, {"success": False, "message": "ESP32 操作失败。"}, 500)

    async def get(self, action: str | None = None) -> None:
        await self._dispatch("GET", action)

    async def post(self, action: str | None = None) -> None:
        try:
            payload = self._payload()
        except MicroPythonSessionError as exc:
            _json(self, {"success": False, "message": str(exc)}, 400)
            return
        await self._dispatch("POST", action, payload)


def _load_jupyter_server_extension(server_app) -> None:
    web_app = server_app.web_app
    root_dir = Path(getattr(server_app.contents_manager, "root_dir", "") or ".").resolve()
    manager = MicroPythonSessionManager(project_root=root_dir)
    web_app.settings[_MANAGER_KEY] = manager
    atexit.register(manager.close)
    host_pattern = ".*$"
    base_url = web_app.settings.get("base_url", "/")
    route_pattern = url_path_join(base_url, "/xedu-micropython/(.*)")
    web_app.add_handlers(host_pattern, [(route_pattern, MicroPythonHandler)])


def _jupyter_server_extension_points() -> list[dict[str, str]]:
    return [{"module": "services.jupyter_micropython_server"}]


load_jupyter_server_extension = _load_jupyter_server_extension
