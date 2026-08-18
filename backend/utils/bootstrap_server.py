"""Small standard-library HTTP server used while the Flask backend is unavailable.

The normal API still owns all application routes. This server deliberately exposes
only the environment probe and repair operations needed to recover an interpreter
that cannot import Flask yet. After a successful repair, the caller can promote the
process back to the normal backend.
"""

from __future__ import annotations

import hmac
import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any, Callable
from urllib.parse import parse_qs, urlsplit


CAPABILITY_HEADER = "X-XEdu-Client-Token"
MAX_REQUEST_BYTES = 64 * 1024
DEFAULT_PIP_INDEX = "https://pypi.tuna.tsinghua.edu.cn/simple"
NORMAL_API_PATHS = frozenset({
    "/api/status",
    "/api/start",
    "/api/stop",
    "/api/restart",
})


def _json_bytes(payload: dict[str, Any]) -> bytes:
    return json.dumps(payload, ensure_ascii=False).encode("utf-8")


def _allowed_origins() -> set[str]:
    return {
        origin.strip().rstrip("/")
        for origin in os.environ.get("XEDU_ALLOWED_ORIGINS", "").split(",")
        if origin.strip()
    }


class BootstrapRequestHandler(BaseHTTPRequestHandler):
    """Serve only the minimal recovery API without importing Flask."""

    server_version = "XEduBootstrap/1.0"

    def log_message(self, format: str, *args: Any) -> None:
        # Keep bootstrap diagnostics in the parent process log without the
        # default noisy access-log timestamp and client address.
        self.server.bootstrap_log(f"{self.command} {self.path} - {format % args}")

    @property
    def bootstrap_server(self) -> "BootstrapHTTPServer":
        return self.server  # type: ignore[return-value]

    def _send_json(self, status: int, payload: dict[str, Any]) -> None:
        body = _json_bytes(payload)
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        origin = self.headers.get("Origin")
        if origin and origin.rstrip("/") in self.bootstrap_server.allowed_origins:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Access-Control-Allow-Headers", f"Content-Type, {CAPABILITY_HEADER}")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header("Vary", "Origin")
        self.end_headers()
        self.wfile.write(body)

    def _is_allowed_origin(self) -> bool:
        origin = self.headers.get("Origin")
        return not origin or origin.rstrip("/") in self.bootstrap_server.allowed_origins

    def _is_authorized(self) -> bool:
        expected = self.bootstrap_server.capability
        supplied = self.headers.get(CAPABILITY_HEADER, "")
        return bool(expected and supplied and hmac.compare_digest(supplied, expected))

    def _require_access(self) -> bool:
        if not self._is_allowed_origin():
            self._send_json(403, {"success": False, "message": "forbidden"})
            return False
        if not self._is_authorized():
            self._send_json(401, {"success": False, "message": "unauthorized"})
            return False
        return True

    def _send_bootstrap_mode(self) -> None:
        self._send_json(
            503,
            {
                "success": False,
                "code": "XEDU_BOOTSTRAP_MODE",
                "message": "Python 后端仍处于恢复模式，请先修复并启动完整后端。",
                "bootstrap_only": True,
                "backend_ready": False,
            },
        )

    def do_OPTIONS(self) -> None:
        if not self._is_allowed_origin():
            self._send_json(403, {"success": False, "message": "forbidden"})
            return
        self.send_response(204)
        self.send_header("Content-Length", "0")
        origin = self.headers.get("Origin")
        if origin:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Access-Control-Allow-Headers", f"Content-Type, {CAPABILITY_HEADER}")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header("Vary", "Origin")
        self.end_headers()

    def do_GET(self) -> None:
        path = urlsplit(self.path).path
        if path == "/api/health":
            self._send_json(
                200,
                {
                    "message": "XEdu Client 正在准备 Python 后端",
                    "status": "ok",
                    "bootstrap_only": True,
                    "backend_ready": False,
                },
            )
            return

        if path in NORMAL_API_PATHS:
            if self._require_access():
                self._send_bootstrap_mode()
            return

        if path != "/api/detect_python" or not self._require_access():
            if path != "/api/detect_python":
                self._send_json(404, {"success": False, "message": "not found"})
            return

        requested = (parse_qs(urlsplit(self.path).query).get("python_executable") or [""])[0].strip()
        if not requested:
            self._send_json(400, {"success": False, "message": "请先选择 Python 解释器。"})
            return
        result = self.bootstrap_server.inspect_python(requested)
        if not result.get("success"):
            self._send_json(400, result)
            return
        self._send_json(
            200,
            {
                "success": True,
                "message": "Python 环境检测成功",
                "info": result,
            },
        )

    def do_POST(self) -> None:
        path = urlsplit(self.path).path
        if path in NORMAL_API_PATHS:
            if self._require_access():
                self._send_bootstrap_mode()
            return
        if path != "/api/repair_xedu":
            self._send_json(404, {"success": False, "message": "not found"})
            return
        if not self._require_access():
            return

        try:
            content_length = int(self.headers.get("Content-Length") or "0")
        except ValueError:
            content_length = -1
        if content_length < 0 or content_length > MAX_REQUEST_BYTES:
            self._send_json(413, {"success": False, "message": "请求内容过大或无效。"})
            return
        try:
            payload = json.loads(self.rfile.read(content_length) or b"{}")
        except (UnicodeDecodeError, json.JSONDecodeError):
            self._send_json(400, {"success": False, "message": "请求正文不是有效 JSON。"})
            return
        if not isinstance(payload, dict):
            self._send_json(400, {"success": False, "message": "请求参数格式无效。"})
            return

        requested = str(payload.get("python_executable") or "").strip()
        if not requested:
            self._send_json(400, {"success": False, "message": "请先选择 Python 解释器。"})
            return
        validation = self.bootstrap_server.inspect_python(requested)
        if not validation.get("success"):
            self._send_json(400, validation)
            return

        use_mirror = payload.get("use_mirror")
        if not isinstance(use_mirror, bool):
            use_mirror = self.bootstrap_server.pip_index != "https://pypi.org/simple"
        result = self.bootstrap_server.repair_python(validation["executable"], use_mirror=use_mirror)
        self._send_json(200 if result.get("success") else 400, result)
        if result.get("success"):
            self.bootstrap_server.schedule_promotion()


class BootstrapHTTPServer(ThreadingHTTPServer):
    """HTTP server carrying recovery callbacks and process-scoped auth."""

    daemon_threads = True
    allow_reuse_address = True

    def __init__(
        self,
        server_address: tuple[str, int],
        *,
        capability: str,
        inspect_python: Callable[[str], dict[str, Any]],
        repair_python: Callable[..., dict[str, Any]],
        on_repair_success: Callable[["BootstrapHTTPServer"], None] | None = None,
        bootstrap_log: Callable[[str], None] | None = None,
    ) -> None:
        super().__init__(server_address, BootstrapRequestHandler)
        self.capability = capability
        self.allowed_origins = _allowed_origins()
        self.pip_index = os.environ.get("XEDU_PIP_INDEX_URL", DEFAULT_PIP_INDEX).strip()
        self.inspect_python = inspect_python
        self.repair_python = repair_python
        self.on_repair_success = on_repair_success
        self.bootstrap_log = bootstrap_log or (lambda _message: None)
        self._promotion_started = False

    def schedule_promotion(self) -> None:
        if self._promotion_started or self.on_repair_success is None:
            return
        self._promotion_started = True
        import threading

        threading.Thread(
            target=self._promote,
            name="xedu-bootstrap-promotion",
            daemon=True,
        ).start()

    def _promote(self) -> None:
        try:
            self.on_repair_success(self)
        except Exception as exc:  # pragma: no cover - defensive process boundary
            self.bootstrap_log(f"bootstrap-promotion-failed: {exc}")


def create_bootstrap_server(
    host: str,
    port: int,
    *,
    capability: str,
    inspect_python: Callable[[str], dict[str, Any]],
    repair_python: Callable[..., dict[str, Any]],
    on_repair_success: Callable[[BootstrapHTTPServer], None] | None = None,
    bootstrap_log: Callable[[str], None] | None = None,
) -> BootstrapHTTPServer:
    return BootstrapHTTPServer(
        (host, port),
        capability=capability,
        inspect_python=inspect_python,
        repair_python=repair_python,
        on_repair_success=on_repair_success,
        bootstrap_log=bootstrap_log,
    )


def run_bootstrap_server(
    host: str,
    port: int,
    *,
    capability: str,
    inspect_python: Callable[[str], dict[str, Any]],
    repair_python: Callable[..., dict[str, Any]],
    on_repair_success: Callable[[BootstrapHTTPServer], None] | None = None,
    bootstrap_log: Callable[[str], None] | None = None,
) -> None:
    server = create_bootstrap_server(
        host,
        port,
        capability=capability,
        inspect_python=inspect_python,
        repair_python=repair_python,
        on_repair_success=on_repair_success,
        bootstrap_log=bootstrap_log,
    )
    try:
        server.serve_forever()
    finally:
        server.server_close()


__all__ = [
    "BootstrapHTTPServer",
    "create_bootstrap_server",
    "run_bootstrap_server",
]
