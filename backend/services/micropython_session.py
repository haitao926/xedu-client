"""Manage one local USB MicroPython REPL session for an ESP32 board."""

from __future__ import annotations

import re
import threading
from collections import deque
from pathlib import Path
from typing import Any, Callable

import serial
from serial.tools import list_ports


class MicroPythonSessionError(ValueError):
    """Raised when a MicroPython session cannot be started or used."""


_PORT_RE = re.compile(r"^(?:COM\d+|/(?:dev|cu)[\w./-]+)$", re.IGNORECASE)
_DEFAULT_BAUDRATE = 115200
_MAX_SOURCE_BYTES = 256 * 1024
_MAX_OUTPUT_EVENTS = 400


def _is_safe_port(port: str) -> bool:
    return bool(_PORT_RE.fullmatch(str(port or "").strip()))


class MicroPythonSessionManager:
    """Own a serial reader and a bounded cursor-addressable output buffer."""

    def __init__(
        self,
        *,
        serial_factory: Callable[..., Any] | None = None,
        ports_factory: Callable[[], list[Any]] | None = None,
        project_root: str | Path | None = None,
        baudrate: int = _DEFAULT_BAUDRATE,
    ) -> None:
        self._serial_factory = serial_factory or serial.Serial
        self._ports_factory = ports_factory or list_ports.comports
        self.project_root = Path(project_root).expanduser().resolve() if project_root else None
        self.baudrate = baudrate
        self._serial: Any | None = None
        self._port = ""
        self._reader: threading.Thread | None = None
        self._stop_reader = threading.Event()
        self._lock = threading.RLock()
        self._events: deque[tuple[int, str]] = deque(maxlen=_MAX_OUTPUT_EVENTS)
        self._cursor = 0
        self._running_file = ""

    def list_ports(self) -> list[dict[str, str]]:
        ports: list[dict[str, str]] = []
        for port in self._ports_factory() or []:
            device = str(getattr(port, "device", "") or "").strip()
            description = str(getattr(port, "description", "") or "").strip()
            if not _is_safe_port(device) or "bluetooth" in f"{device} {description}".lower():
                continue
            ports.append(
                {
                    "device": device,
                    "description": description or device,
                    "hwid": str(getattr(port, "hwid", "") or "").strip(),
                }
            )
        return ports

    def connect(self, port: str) -> dict[str, Any]:
        candidate = str(port or "").strip()
        if not _is_safe_port(candidate):
            raise MicroPythonSessionError("串口无效。")
        with self._lock:
            self._disconnect_locked()
            try:
                self._serial = self._serial_factory(
                    candidate,
                    self.baudrate,
                    timeout=0.1,
                    write_timeout=2,
                )
            except Exception as exc:
                self._serial = None
                raise MicroPythonSessionError(f"无法连接 ESP32：{exc}") from exc
            self._port = candidate
            self._stop_reader.clear()
            self._reader = threading.Thread(target=self._read_loop, daemon=True)
            self._reader.start()
            self._serial.write(b"\x03\x03")
            return {"connected": True, "port": candidate, "baudrate": self.baudrate}

    def disconnect(self) -> dict[str, Any]:
        with self._lock:
            self._disconnect_locked()
        return {"disconnected": True}

    def close(self) -> None:
        self.disconnect()

    def write_input(self, text: str) -> dict[str, Any]:
        value = str(text or "")
        if not value:
            return {"sent": False}
        with self._lock:
            serial_connection = self._require_serial()
            payload = value.encode("utf-8")
            if not payload.endswith(b"\n"):
                payload += b"\r\n"
            serial_connection.write(payload)
        return {"sent": True}

    def interrupt(self) -> dict[str, Any]:
        with self._lock:
            self._require_serial().write(b"\x03")
            self._running_file = ""
        return {"interrupted": True}

    def reset(self) -> dict[str, Any]:
        with self._lock:
            self._require_serial().write(b"\x04")
            self._running_file = ""
        return {"reset": True}

    def run_file(self, relative_path: str) -> dict[str, Any]:
        path = self._resolve_project_file(relative_path)
        source = path.read_text(encoding="utf-8")
        if len(source.encode("utf-8")) > _MAX_SOURCE_BYTES:
            raise MicroPythonSessionError("代码文件过大，无法发送到开发板。")
        with self._lock:
            serial_connection = self._require_serial()
            command = f"exec({source!r})\r\n".encode("utf-8")
            serial_connection.write(b"\x03")
            serial_connection.write(command)
            self._running_file = path.name
        return {"running": True, "file": path.name}

    def read_output(self, *, after: int = 0) -> dict[str, Any]:
        try:
            cursor = max(0, int(after))
        except (TypeError, ValueError):
            cursor = 0
        with self._lock:
            output = "".join(text for event_cursor, text in self._events if event_cursor > cursor)
            return {
                "connected": self._serial is not None and bool(getattr(self._serial, "is_open", True)),
                "port": self._port,
                "cursor": self._cursor,
                "output": output,
                "running_file": self._running_file,
            }

    def _read_loop(self) -> None:
        while not self._stop_reader.is_set():
            try:
                with self._lock:
                    serial_connection = self._serial
                if serial_connection is None:
                    return
                chunk = serial_connection.read(4096)
                if chunk:
                    text = bytes(chunk).decode("utf-8", errors="replace")
                    with self._lock:
                        self._cursor += 1
                        self._events.append((self._cursor, text))
            except Exception as exc:
                with self._lock:
                    self._cursor += 1
                    self._events.append((self._cursor, f"\n[串口错误] {exc}\n"))
                return

    def _require_serial(self) -> Any:
        if self._serial is None or not getattr(self._serial, "is_open", True):
            raise MicroPythonSessionError("请先连接 ESP32。")
        return self._serial

    def _resolve_project_file(self, relative_path: str) -> Path:
        if self.project_root is None:
            raise MicroPythonSessionError("当前没有可用的实验目录。")
        relative = str(relative_path or "").replace("\\", "/").strip()
        if not relative or relative.startswith("/") or any(part == ".." for part in Path(relative).parts):
            raise MicroPythonSessionError("实验文件路径无效。")
        path = (self.project_root / relative).resolve()
        try:
            path.relative_to(self.project_root)
        except ValueError as exc:
            raise MicroPythonSessionError("实验文件必须位于当前实验目录内。") from exc
        if path.suffix.lower() != ".py" or not path.is_file():
            raise MicroPythonSessionError("只能运行当前实验目录中的 .py 文件。")
        return path

    def _disconnect_locked(self) -> None:
        self._stop_reader.set()
        reader = self._reader
        self._reader = None
        serial_connection = self._serial
        self._serial = None
        self._port = ""
        self._running_file = ""
        if reader and reader.is_alive() and reader is not threading.current_thread():
            reader.join(timeout=0.5)
        if serial_connection is not None:
            try:
                serial_connection.close()
            except Exception:
                pass
