"""Jupyter Server extension exposing the local ESP32 MicroPython session."""

from __future__ import annotations

import atexit
import json
from pathlib import Path
from typing import Any

from jupyter_server.base.handlers import JupyterHandler
from jupyter_server.utils import url_path_join

from services.micropython_session import MicroPythonSessionError, MicroPythonSessionManager


_MANAGER_KEY = "xedu_micropython_manager"


def _json(handler: JupyterHandler, payload: dict[str, Any], status: int = 200) -> None:
    handler.set_status(status)
    handler.set_header("Content-Type", "application/json; charset=utf-8")
    handler.finish(json.dumps(payload, ensure_ascii=False))


def _manager(handler: JupyterHandler) -> MicroPythonSessionManager:
    manager = handler.settings.get(_MANAGER_KEY)
    if not isinstance(manager, MicroPythonSessionManager):
        raise MicroPythonSessionError("MicroPython 设备服务尚未启动。")
    return manager


class MicroPythonHandler(JupyterHandler):
    def _payload(self) -> dict[str, Any]:
        if not self.request.body:
            return {}
        try:
            payload = json.loads(self.request.body.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise MicroPythonSessionError("请求数据格式无效。") from exc
        if not isinstance(payload, dict):
            raise MicroPythonSessionError("请求数据格式无效。")
        return payload

    def _call(self, action, *, success_status: int = 200) -> None:
        try:
            result = action()
            _json(self, {"success": True, **result}, success_status)
        except MicroPythonSessionError as exc:
            _json(self, {"success": False, "message": str(exc)}, 400)
        except Exception:
            self.log.exception("MicroPython Jupyter route failed")
            _json(self, {"success": False, "message": "ESP32 操作失败。"}, 500)

    def get(self, action: str | None = None) -> None:
        if action == "ports":
            self._call(lambda: {"ports": _manager(self).list_ports()})
            return
        if action == "output":
            try:
                after = int(self.get_argument("after", "0"))
            except ValueError:
                after = 0
            self._call(lambda: _manager(self).read_output(after=after))
            return
        _json(self, {"success": False, "message": "不支持的 MicroPython 请求。"}, 404)

    def post(self, action: str | None = None) -> None:
        payload = self._payload()
        manager = lambda: _manager(self)
        if action == "connect":
            self._call(lambda: manager().connect(str(payload.get("port") or "")))
            return
        if action == "disconnect":
            self._call(lambda: manager().disconnect())
            return
        if action == "run":
            self._call(lambda: manager().run_file(str(payload.get("file") or "")))
            return
        if action == "input":
            self._call(lambda: manager().write_input(str(payload.get("text") or "")))
            return
        if action == "interrupt":
            self._call(lambda: manager().interrupt())
            return
        if action == "reset":
            self._call(lambda: manager().reset())
            return
        _json(self, {"success": False, "message": "不支持的 MicroPython 请求。"}, 404)


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
