"""Manage one local USB MicroPython REPL session for an ESP32 board."""

from __future__ import annotations

import errno
import re
import threading
import time
from collections import deque
from pathlib import Path
from typing import Any, Callable

try:
    import serial as _serial_mod
    from serial.tools import list_ports as _list_ports
except ImportError:  # pragma: no cover - exercised when pyserial is absent
    _serial_mod = None
    _list_ports = None


class MicroPythonSessionError(ValueError):
    """Raised when a MicroPython session cannot be started or used."""


NO_BOARD_MESSAGE = "未发现 ESP32，请检查 USB 数据线和驱动。"
BUSY_PORT_MESSAGE = "串口正在被其他程序使用，请关闭串口监视器后重试。"
NO_REPL_MESSAGE = "设备没有返回 MicroPython REPL，请先准备固件。"
RUN_TIMEOUT_MESSAGE = "运行超时，已保留现有输出，请尝试停止运行或重启设备。"
MISSING_SERIAL_MESSAGE = "当前 Python 环境缺少串口组件，请在设置中修复 Jupyter 环境。"
NOT_CONNECTED_MESSAGE = "请先连接 ESP32。"

_PORT_RE = re.compile(r"^(?:COM\d+|/(?:dev|cu)[\w./-]+)$", re.IGNORECASE)
_DEFAULT_BAUDRATE = 115200
_MAX_SOURCE_BYTES = 256 * 1024
_MAX_OUTPUT_EVENTS = 400
_REPL_PROMPT = ">>>"
_BUSY_MARKERS = (
    "busy",
    "access is denied",
    "permission denied",
    "in use",
    "exclusively",
    "resource busy",
    "being used",
    "winerror 5",
    "winerror 32",
    "could not exclusively lock",
)
_MISSING_PORT_MARKERS = (
    "file not found",
    "no such file",
    "cannot find",
    "not found",
    "does not exist",
)


def _is_safe_port(port: str) -> bool:
    return bool(_PORT_RE.fullmatch(str(port or "").strip()))


def _default_ports_factory() -> list[Any]:
    if _list_ports is None:
        return []
    return list(_list_ports.comports() or [])


def _default_serial_factory(*args: Any, **kwargs: Any) -> Any:
    if _serial_mod is None:
        raise MicroPythonSessionError(MISSING_SERIAL_MESSAGE)
    try:
        return _serial_mod.Serial(*args, **kwargs)
    except TypeError:
        kwargs.pop("exclusive", None)
        return _serial_mod.Serial(*args, **kwargs)


def map_serial_open_error(exc: BaseException) -> MicroPythonSessionError:
    """Translate OS/serial failures into student-facing Chinese errors."""
    message = str(exc or "").lower()
    err = getattr(exc, "errno", None)
    if err in {errno.EBUSY, errno.EACCES, errno.EPERM, 16, 13} or any(
        marker in message for marker in _BUSY_MARKERS
    ):
        return MicroPythonSessionError(BUSY_PORT_MESSAGE)
    if err in {errno.ENOENT, errno.ENODEV} or any(marker in message for marker in _MISSING_PORT_MARKERS):
        return MicroPythonSessionError(NO_BOARD_MESSAGE)
    return MicroPythonSessionError(f"无法连接 ESP32：{exc}")


def encode_paste_source(source: str) -> bytes:
    """Encode a .py file for MicroPython paste mode (Ctrl-E)."""
    normalized = source.replace("\r\n", "\n").replace("\r", "\n")
    lines = normalized.split("\n")
    payload = bytearray()
    for index, line in enumerate(lines):
        if index == len(lines) - 1 and line == "":
            break
        payload.extend(line.encode("utf-8"))
        payload.extend(b"\r")
    return bytes(payload)


class MicroPythonSessionManager:
    """Own a serial reader and a bounded cursor-addressable output buffer."""

    def __init__(
        self,
        *,
        serial_factory: Callable[..., Any] | None = None,
        ports_factory: Callable[[], list[Any]] | None = None,
        project_root: str | Path | None = None,
        baudrate: int = _DEFAULT_BAUDRATE,
        repl_timeout: float = 4.0,
        reset_timeout: float = 8.0,
        boot_settle: float = 0.25,
        poll_interval: float = 0.02,
        sleeper: Callable[[float], None] | None = None,
    ) -> None:
        self._serial_factory = serial_factory or _default_serial_factory
        self._ports_factory = ports_factory or _default_ports_factory
        self.project_root = Path(project_root).expanduser().resolve() if project_root else None
        self.baudrate = baudrate
        self.repl_timeout = repl_timeout
        self.reset_timeout = reset_timeout
        self.boot_settle = boot_settle
        self.poll_interval = poll_interval
        self._sleep = sleeper or time.sleep
        self._serial: Any | None = None
        self._port = ""
        self._reader: threading.Thread | None = None
        self._stop_reader = threading.Event()
        self._lock = threading.RLock()
        self._events: deque[tuple[int, str]] = deque(maxlen=_MAX_OUTPUT_EVENTS)
        self._cursor = 0
        self._running_file = ""

    def list_ports(self) -> list[dict[str, str]]:
        if _list_ports is None and self._ports_factory is _default_ports_factory:
            return []
        ports: list[dict[str, str]] = []
        for port in self._ports_factory() or []:
            device = str(getattr(port, "device", "") or "").strip()
            description = str(getattr(port, "description", "") or "").strip()
            if not _is_safe_port(device):
                continue
            blob = f"{device} {description}".lower()
            if "bluetooth" in blob or re.search(r"(?:^|/)ttys\d+$", device.lower()):
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
                self._serial = self._open_serial(candidate)
            except MicroPythonSessionError:
                self._serial = None
                raise
            except Exception as exc:
                self._serial = None
                raise map_serial_open_error(exc) from exc
            self._apply_idle_flow_control(self._serial)
            self._port = candidate
            self._running_file = ""
            self._events.clear()
            self._cursor = 0
            self._stop_reader.clear()
            self._reader = threading.Thread(target=self._read_loop, daemon=True, name="xedu-mp-reader")
            self._reader.start()
        if self.boot_settle > 0:
            self._sleep(self.boot_settle)
        try:
            self._enter_repl(timeout=self.repl_timeout, reset_if_needed=True)
        except MicroPythonSessionError:
            with self._lock:
                self._disconnect_locked()
            raise
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
        payload = value.encode("utf-8")
        if not payload.endswith(b"\r") and not payload.endswith(b"\n"):
            payload += b"\r"
        self._write_bytes(payload)
        return {"sent": True}

    def interrupt(self) -> dict[str, Any]:
        self._write_bytes(b"\x03")
        with self._lock:
            self._running_file = ""
        return {"interrupted": True}

    def reset(self) -> dict[str, Any]:
        start = self._cursor
        self._write_bytes(b"\x03")
        self._write_bytes(b"\x04")
        with self._lock:
            self._running_file = ""
        try:
            self._wait_for_output(_REPL_PROMPT, timeout=self.reset_timeout, after=start)
        except MicroPythonSessionError:
            pass
        return {"reset": True}

    def run_file(self, relative_path: str) -> dict[str, Any]:
        path = self._resolve_project_file(relative_path)
        source = path.read_text(encoding="utf-8")
        encoded_source = source.encode("utf-8")
        if len(encoded_source) > _MAX_SOURCE_BYTES:
            raise MicroPythonSessionError("代码文件过大，无法发送到开发板。")
        start = self._cursor
        self._write_bytes(b"\r\x03\x03")
        try:
            self._wait_for_output(_REPL_PROMPT, timeout=self.repl_timeout, after=start)
        except MicroPythonSessionError as exc:
            raise MicroPythonSessionError(RUN_TIMEOUT_MESSAGE) from exc
        paste = encode_paste_source(source)
        self._write_bytes(b"\x05")
        if paste:
            self._write_bytes(paste)
        self._write_bytes(b"\x04")
        with self._lock:
            self._running_file = path.name
        return {"running": True, "file": path.name}

    def read_output(self, *, after: int = 0) -> dict[str, Any]:
        try:
            cursor = max(0, int(after))
        except (TypeError, ValueError):
            cursor = 0
        with self._lock:
            output = "".join(text for event_cursor, text in self._events if event_cursor > cursor)
            connected = self._serial is not None and bool(getattr(self._serial, "is_open", True))
            return {
                "connected": connected,
                "port": self._port,
                "cursor": self._cursor,
                "output": output,
                "running_file": self._running_file,
                "running": bool(self._running_file),
            }

    def _open_serial(self, port: str) -> Any:
        return self._serial_factory(
            port,
            baudrate=self.baudrate,
            timeout=0.1,
            write_timeout=2,
            exclusive=True,
        )

    def _apply_idle_flow_control(self, serial_connection: Any) -> None:
        for name in ("dtr", "rts"):
            if hasattr(serial_connection, name):
                try:
                    setattr(serial_connection, name, False)
                except Exception:
                    pass

    def _enter_repl(self, *, timeout: float, reset_if_needed: bool) -> None:
        start = self._cursor
        self._write_bytes(b"\r\x03\x03")
        try:
            self._wait_for_output(_REPL_PROMPT, timeout=timeout, after=start)
            return
        except MicroPythonSessionError:
            if not reset_if_needed:
                raise MicroPythonSessionError(NO_REPL_MESSAGE)
        start = self._cursor
        self._write_bytes(b"\x04")
        try:
            self._wait_for_output(_REPL_PROMPT, timeout=self.reset_timeout, after=start)
        except MicroPythonSessionError as exc:
            raise MicroPythonSessionError(NO_REPL_MESSAGE) from exc

    def _wait_for_output(self, needle: str, *, timeout: float, after: int = 0) -> str:
        deadline = time.monotonic() + max(0.0, timeout)
        while True:
            snapshot = self.read_output(after=after)
            if needle in snapshot["output"]:
                return snapshot["output"]
            if not snapshot["connected"]:
                raise MicroPythonSessionError(NOT_CONNECTED_MESSAGE)
            if time.monotonic() >= deadline:
                raise MicroPythonSessionError(NO_REPL_MESSAGE)
            self._sleep(self.poll_interval)

    def _write_bytes(self, data: bytes) -> None:
        with self._lock:
            serial_connection = self._require_serial()
            serial_connection.write(data)
            flush = getattr(serial_connection, "flush", None)
            if callable(flush):
                try:
                    flush()
                except Exception:
                    pass

    def _read_loop(self) -> None:
        while not self._stop_reader.is_set():
            try:
                with self._lock:
                    serial_connection = self._serial
                if serial_connection is None:
                    return
                chunk = serial_connection.read(4096)
                if not chunk:
                    continue
                text = bytes(chunk).decode("utf-8", errors="replace")
                with self._lock:
                    self._cursor += 1
                    self._events.append((self._cursor, text))
                    if self._running_file and _REPL_PROMPT in text:
                        self._running_file = ""
            except Exception as exc:
                with self._lock:
                    self._cursor += 1
                    self._events.append((self._cursor, f"\n[串口错误] {exc}\n"))
                    self._serial = None
                    self._port = ""
                    self._running_file = ""
                return

    def _require_serial(self) -> Any:
        if self._serial is None or not getattr(self._serial, "is_open", True):
            raise MicroPythonSessionError(NOT_CONNECTED_MESSAGE)
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
            reader.join(timeout=0.8)
        if serial_connection is not None:
            for closer in ("reset_input_buffer", "reset_output_buffer", "close"):
                method = getattr(serial_connection, closer, None)
                if not callable(method):
                    continue
                try:
                    method()
                except Exception:
                    pass
        self._stop_reader = threading.Event()
