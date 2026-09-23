"""Jupyter Server extension exposing the local ESP32 MicroPython session."""

from __future__ import annotations

import atexit
import json
from pathlib import Path
from typing import Any

from services.micropython_session import MicroPythonSessionError, MicroPythonSessionManager

try:
    from jupyter_server.base.handlers import JupyterHandler
    from jupyter_server.utils import url_path_join
except ImportError:  # pragma: no cover - unit tests do not require Jupyter Server
    class JupyterHandler:  # type: ignore[no-redef]
        request = None
        settings: dict[str, Any] = {}
        log = None

        def get_argument(self, name: str, default: str = "") -> str:
            return default

        def set_status(self, _status: int) -> None:
            return None

        def set_header(self, _name: str, _value: str) -> None:
            return None

        def finish(self, _payload: str) -> None:
            return None

    def url_path_join(*parts: str) -> str:
        return "/" + "/".join(part.strip("/") for part in parts if part)

try:
    from jupyter_server.auth.decorator import allow_unauthenticated
except ImportError:  # pragma: no cover
    try:
        from jupyter_server.auth import allow_unauthenticated  # type: ignore
    except ImportError:
        def allow_unauthenticated(method):  # type: ignore[misc]
            return method


_MANAGER_KEY = "xedu_micropython_manager"
_ROUTE_MARKER = "xedu-micropython/"
SUPPORTED_ACTIONS = frozenset({"ports", "output", "connect", "disconnect", "run", "input", "interrupt", "reset"})
PANEL_ROUTE_TABLE = (
    ("GET", "ports"),
    ("GET", "output"),
    ("POST", "connect"),
    ("POST", "disconnect"),
    ("POST", "run"),
    ("POST", "input"),
    ("POST", "interrupt"),
    ("POST", "reset"),
)


def _split_route_tail(value: str | None) -> tuple[str, str]:
    text = str(value or "").strip()
    if _ROUTE_MARKER in text:
        text = text.split(_ROUTE_MARKER, 1)[1]
    text = text.split("#", 1)[0].strip().lstrip("/")
    query = ""
    if "?" in text:
        text, query = text.split("?", 1)
    return text.strip().strip("/"), query


def normalize_micropython_action(action: str | None, request_path: str = "") -> str:
    """Accept a Tornado capture group or the raw request path.

    Jupyter sometimes calls the handler without the `(.*)` group, or the group
    still contains a trailing slash or `output?after=` query. An explicit
    unknown capture stays unknown so it still 404s. The path is used only when
    the capture is missing, which is what exact routes do.
    """
    captured, _captured_query = _split_route_tail(action)
    if captured:
        return captured
    from_path, _path_query = _split_route_tail(request_path)
    return from_path


def embedded_after(action: str | None, request_path: str = "") -> int | None:
    for raw in (action, request_path):
        _name, query = _split_route_tail(raw)
        if not query:
            continue
        for part in query.split("&"):
            if part.startswith("after="):
                try:
                    return max(0, int(part.split("=", 1)[1]))
                except ValueError:
                    return 0
    return None


def micropython_route_patterns(base_url: str) -> list[str]:
    patterns: list[str] = []
    for _method, action in PANEL_ROUTE_TABLE:
        exact = url_path_join(base_url, "xedu-micropython", action)
        patterns.append(exact)
        if not exact.endswith("/"):
            patterns.append(f"{exact}/")
    patterns.append(url_path_join(base_url, "xedu-micropython", "(.*)"))
    return patterns


def dispatch_micropython_action(
    manager: MicroPythonSessionManager,
    *,
    method: str,
    action: str | None,
    payload: dict[str, Any] | None = None,
    after: int = 0,
    request_path: str = "",
) -> tuple[int, dict[str, Any]]:
    """Route a device action without requiring a live Jupyter request."""
    payload = payload or {}
    verb = str(method or "").upper()
    name = normalize_micropython_action(action, request_path)
    try:
        if verb == "GET" and name == "ports":
            return 200, {"success": True, "ports": manager.list_ports()}
        if verb == "GET" and name == "output":
            return 200, {"success": True, **manager.read_output(after=after)}
        if verb == "POST" and name == "connect":
            return 200, {"success": True, **manager.connect(str(payload.get("port") or ""))}
        if verb == "POST" and name == "disconnect":
            return 200, {"success": True, **manager.disconnect()}
        if verb == "POST" and name == "run":
            return 200, {"success": True, **manager.run_file(str(payload.get("file") or ""))}
        if verb == "POST" and name == "input":
            return 200, {"success": True, **manager.write_input(str(payload.get("text") or ""))}
        if verb == "POST" and name == "interrupt":
            return 200, {"success": True, **manager.interrupt()}
        if verb == "POST" and name == "reset":
            return 200, {"success": True, **manager.reset()}
        return 404, {"success": False, "message": "不支持的 MicroPython 请求。"}
    except MicroPythonSessionError as exc:
        return 400, {"success": False, "message": str(exc)}
    except Exception:
        return 500, {"success": False, "message": "ESP32 操作失败。"}


def parse_json_object(raw_body: bytes | str | None) -> dict[str, Any]:
    if not raw_body:
        return {}
    if isinstance(raw_body, bytes):
        try:
            text = raw_body.decode("utf-8")
        except UnicodeDecodeError as exc:
            raise MicroPythonSessionError("请求数据格式无效。") from exc
    else:
        text = raw_body
    try:
        payload = json.loads(text)
    except json.JSONDecodeError as exc:
        raise MicroPythonSessionError("请求数据格式无效。") from exc
    if not isinstance(payload, dict):
        raise MicroPythonSessionError("请求数据格式无效。")
    return payload


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
        return parse_json_object(getattr(self.request, "body", b"") or b"")

    def _request_path(self) -> str:
        request = getattr(self, "request", None)
        if request is None:
            return ""
        return str(getattr(request, "path", "") or getattr(request, "uri", "") or "")

    def _call(self, method: str, action: str | None) -> None:
        try:
            request_path = self._request_path()
            payload = self._payload() if method == "POST" else {}
            try:
                after = int(self.get_argument("after", "0"))
            except ValueError:
                after = 0
            if after == 0:
                hinted = embedded_after(action, request_path)
                if hinted:
                    after = hinted
            status, body = dispatch_micropython_action(
                _manager(self),
                method=method,
                action=action,
                payload=payload,
                after=after,
                request_path=request_path,
            )
            if status == 404:
                log = getattr(self, "log", None)
                if log is not None:
                    log.warning(
                        "Unsupported MicroPython route %s %s",
                        method,
                        normalize_micropython_action(action, request_path) or request_path,
                    )
            _json(self, body, status)
        except MicroPythonSessionError as exc:
            _json(self, {"success": False, "message": str(exc)}, 400)
        except Exception:
            log = getattr(self, "log", None)
            if log is not None:
                log.exception("MicroPython Jupyter route failed")
            _json(self, {"success": False, "message": "ESP32 操作失败。"}, 500)

    @allow_unauthenticated
    def get(self, action: str | None = None) -> None:
        self._call("GET", action)

    @allow_unauthenticated
    def post(self, action: str | None = None) -> None:
        self._call("POST", action)


def _load_jupyter_server_extension(server_app) -> None:
    web_app = server_app.web_app
    root_dir = Path(getattr(server_app.contents_manager, "root_dir", "") or ".").resolve()
    manager = MicroPythonSessionManager(project_root=root_dir)
    web_app.settings[_MANAGER_KEY] = manager
    atexit.register(manager.close)
    host_pattern = ".*$"
    base_url = web_app.settings.get("base_url", "/")
    web_app.add_handlers(
        host_pattern,
        [(pattern, MicroPythonHandler) for pattern in micropython_route_patterns(base_url)],
    )


def _jupyter_server_extension_points() -> list[dict[str, str]]:
    return [{"module": "services.jupyter_micropython_server"}]


load_jupyter_server_extension = _load_jupyter_server_extension
