"""Manage one local USB MicroPython REPL session for an ESP32 board."""

from __future__ import annotations

import re
import threading
import time
from collections import deque
from pathlib import Path
from typing import Any, Callable

try:
    import serial
    from serial.tools import list_ports as _list_ports
except ImportError:  # pragma: no cover - tests inject serial fakes
    serial = None  # type: ignore[assignment]
    _list_ports = None  # type: ignore[assignment]


class MicroPythonSessionError(ValueError):
    """Raised when a MicroPython session cannot be started or used."""


_PORT_RE = re.compile(r"^(?:COM\d+|\\\\\.\\COM\d+|/(?:dev|cu)[\w./-]+)$", re.IGNORECASE)
_DEFAULT_BAUDRATE = 115200
_MAX_SOURCE_BYTES = 256 * 1024
_MAX_OUTPUT_EVENTS = 400
_RAW_REPL_BANNER = b"raw REPL; CTRL-B to exit"
_PREFERRED_VIDS = {
    0x10C4,  # Silicon Labs CP210x
    0x1A86,  # WCH CH340 / CH9102
    0x0403,  # FTDI
    0x303A,  # Espressif native USB-CDC
    0x239A,  # Adafruit
}
_BUSY_HINTS = (
    "busy",
    "access is denied",
    "permission denied",
    "in use",
    "exclusively",
    "resource busy",
    "could not exclusively",
)
_MISSING_HINTS = ("file not found", "no such file", "cannot find", "not exist")


def _is_safe_port(port: str) -> bool:
    return bool(_PORT_RE.fullmatch(str(port or "").strip()))


def _drop_tty_callout_twins(ports: list[dict[str, str]]) -> list[dict[str, str]]:
    """Keep macOS callout devices when both tty and cu nodes exist.

    ESP32-S3 USB-Serial/JTAG shows up as /dev/cu.usbmodem* and /dev/tty.usbmodem*.
    Thonny and mpremote connect to the cu node.
    """
    devices = {item["device"] for item in ports}
    kept: list[dict[str, str]] = []
    for item in ports:
        device = item["device"]
        if device.startswith("/dev/tty."):
            twin = "/dev/cu." + device[len("/dev/tty.") :]
            if twin in devices:
                continue
        kept.append(item)
    return kept


def _looks_like_bluetooth(device: str, description: str, hwid: str) -> bool:
    blob = f"{device} {description} {hwid}".lower()
    return "bluetooth" in blob or "bthenum" in blob


def _decode_output(data: bytes) -> str:
    cleaned = bytes(char for char in data if char in (9, 10, 13) or char >= 32)
    return cleaned.decode("utf-8", errors="replace")


def _apply_control_lines(connection: Any, *, dtr: bool, rts: bool, rts_first: bool = False) -> None:
    try:
        if rts_first:
            connection.rts = rts
            connection.dtr = dtr
        else:
            connection.dtr = dtr
            connection.rts = rts
    except Exception:
        pass


def _close_serial(connection: Any) -> None:
    if connection is None:
        return
    _apply_control_lines(connection, dtr=False, rts=False, rts_first=True)
    try:
        connection.close()
    except Exception:
        pass


def _default_ports_factory() -> list[Any]:
    if _list_ports is None:
        raise MicroPythonSessionError("当前 Python 环境缺少 pyserial，无法访问串口。")
    return list(_list_ports.comports() or [])


def _default_serial_factory(port: str, **kwargs: Any) -> Any:
    if serial is None:
        raise MicroPythonSessionError("当前 Python 环境缺少 pyserial，无法访问串口。")
    serial_kwargs = dict(kwargs)
    exclusive = serial_kwargs.pop("exclusive", True)
    try:
        connection = serial.serial_for_url(port, do_not_open=True, exclusive=exclusive, **serial_kwargs)
    except TypeError:
        connection = serial.serial_for_url(port, do_not_open=True, **serial_kwargs)
    _apply_control_lines(connection, dtr=False, rts=False)
    connection.open()
    _apply_control_lines(connection, dtr=False, rts=False)
    return connection


def _translate_open_error(exc: BaseException) -> MicroPythonSessionError:
    message = str(exc).lower()
    errno = getattr(exc, "errno", None)
    if isinstance(exc, PermissionError) or errno in {11, 13, 16} or any(hint in message for hint in _BUSY_HINTS):
        return MicroPythonSessionError("串口正在被其他程序使用，请关闭串口监视器后重试。")
    if isinstance(exc, FileNotFoundError) or any(hint in message for hint in _MISSING_HINTS):
        return MicroPythonSessionError("未发现 ESP32，请检查 USB 数据线和驱动。")
    return MicroPythonSessionError(f"无法连接 ESP32：{exc}")


class MicroPythonSessionManager:
    """Own a serial reader and a bounded cursor-addressable output buffer."""

    def __init__(
        self,
        *,
        serial_factory: Callable[..., Any] | None = None,
        ports_factory: Callable[[], list[Any]] | None = None,
        project_root: str | Path | None = None,
        baudrate: int = _DEFAULT_BAUDRATE,
        connect_settle_s: float = 0.25,
        repl_timeout_s: float = 3.0,
        raw_repl_timeout_s: float = 5.0,
    ) -> None:
        self._serial_factory = serial_factory or _default_serial_factory
        self._ports_factory = ports_factory or _default_ports_factory
        self.project_root = Path(project_root).expanduser().resolve() if project_root else None
        self.baudrate = baudrate
        self.connect_settle_s = connect_settle_s
        self.repl_timeout_s = repl_timeout_s
        self.raw_repl_timeout_s = raw_repl_timeout_s
        self._serial: Any | None = None
        self._port = ""
        self._reader: threading.Thread | None = None
        self._stop_reader = threading.Event()
        self._lock = threading.RLock()
        self._events: deque[tuple[int, str]] = deque(maxlen=_MAX_OUTPUT_EVENTS)
        self._cursor = 0
        self._running_file = ""
        self._in_raw_repl = False
        self._follow_tail = b""

    def list_ports(self) -> list[dict[str, str]]:
        ports: list[dict[str, str]] = []
        for port in self._ports_factory() or []:
            device = str(getattr(port, "device", "") or "").strip()
            description = str(getattr(port, "description", "") or "").strip()
            hwid = str(getattr(port, "hwid", "") or "").strip()
            if not _is_safe_port(device) or _looks_like_bluetooth(device, description, hwid):
                continue
            vid = getattr(port, "vid", None)
            ports.append(
                {
                    "device": device,
                    "description": description or device,
                    "hwid": hwid,
                    "preferred": "1" if vid in _PREFERRED_VIDS else "0",
                }
            )
        ports = _drop_tty_callout_twins(ports)
        ports.sort(key=lambda item: (item["preferred"] != "1", item["device"]))
        for item in ports:
            item.pop("preferred", None)
        return ports

    def connect(self, port: str) -> dict[str, Any]:
        candidate = str(port or "").strip()
        if not _is_safe_port(candidate):
            raise MicroPythonSessionError("串口无效。")
        self._disconnect_unlocked()
        try:
            connection = self._serial_factory(
                candidate,
                baudrate=self.baudrate,
                timeout=0.1,
                write_timeout=2,
                rtscts=False,
                dsrdtr=False,
                exclusive=True,
            )
        except MicroPythonSessionError:
            raise
        except Exception as exc:
            raise _translate_open_error(exc) from exc
        _apply_control_lines(connection, dtr=False, rts=False)
        if not getattr(connection, "is_open", True):
            try:
                opener = getattr(connection, "open", None)
                if not callable(opener):
                    raise MicroPythonSessionError("无法连接 ESP32：串口无法打开。")
                opener()
            except MicroPythonSessionError:
                raise
            except Exception as exc:
                _close_serial(connection)
                raise _translate_open_error(exc) from exc
            _apply_control_lines(connection, dtr=False, rts=False)
        try:
            if self.connect_settle_s > 0:
                time.sleep(self.connect_settle_s)
            boot = self._drain(connection)
            greeting = self._ensure_friendly_repl(connection)
            with self._lock:
                self._serial = connection
                self._port = candidate
                self._in_raw_repl = False
                self._running_file = ""
                self._follow_tail = b""
                self._events.clear()
                self._cursor = 0
                if boot or greeting:
                    self._append_bytes_locked(boot + greeting)
            self._start_reader()
            return {"connected": True, "port": candidate, "baudrate": self.baudrate}
        except Exception:
            _close_serial(connection)
            with self._lock:
                self._serial = None
                self._port = ""
            raise

    def disconnect(self) -> dict[str, Any]:
        self._disconnect_unlocked()
        return {"disconnected": True}

    def close(self) -> None:
        self.disconnect()

    def write_input(self, text: str) -> dict[str, Any]:
        value = str(text or "")
        if not value:
            return {"sent": False}
        with self._lock:
            serial_connection = self._require_serial()
            if self._in_raw_repl:
                serial_connection.write(b"\r\x02")
                self._in_raw_repl = False
            payload = value.encode("utf-8")
            if not payload.endswith(b"\r"):
                payload += b"\r"
            serial_connection.write(payload)
        return {"sent": True}

    def interrupt(self) -> dict[str, Any]:
        with self._lock:
            serial_connection = self._require_serial()
            serial_connection.write(b"\r\x03\x03")
            serial_connection.write(b"\r\x02")
            self._in_raw_repl = False
            self._running_file = ""
        return {"interrupted": True}

    def reset(self) -> dict[str, Any]:
        with self._lock:
            serial_connection = self._require_serial()
            serial_connection.write(b"\r\x03")
            serial_connection.write(b"\r\x02")
            serial_connection.write(b"\x04")
            self._in_raw_repl = False
            self._running_file = ""
        return {"reset": True}

    def run_file(self, relative_path: str) -> dict[str, Any]:
        path = self._resolve_project_file(relative_path)
        source = path.read_text(encoding="utf-8").replace("\r\n", "\n").replace("\r", "\n")
        source_bytes = source.encode("utf-8")
        if len(source_bytes) > _MAX_SOURCE_BYTES:
            raise MicroPythonSessionError("代码文件过大，无法发送到开发板。")
        self._pause_reader()
        try:
            with self._lock:
                serial_connection = self._require_serial()
            self._enter_raw_repl(serial_connection, soft_reset=True)
            self._exec_raw_no_follow(serial_connection, source_bytes)
            with self._lock:
                self._running_file = path.name
                self._in_raw_repl = True
        except MicroPythonSessionError:
            raise
        except Exception as exc:
            raise MicroPythonSessionError("无法在开发板上运行代码，请重新连接后重试。") from exc
        finally:
            if self._serial is not None:
                self._start_reader()
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
                "running": bool(self._running_file),
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
                    with self._lock:
                        self._append_bytes_locked(bytes(chunk))
            except Exception as exc:
                if self._stop_reader.is_set():
                    return
                with self._lock:
                    self._cursor += 1
                    self._events.append((self._cursor, f"\n[串口错误] {exc}\n"))
                    self._serial = None
                    self._port = ""
                    self._running_file = ""
                return

    def _append_bytes_locked(self, data: bytes) -> None:
        if not data:
            return
        self._follow_tail = (self._follow_tail + data)[-32:]
        if b"\x04\x04>" in self._follow_tail:
            self._running_file = ""
            self._follow_tail = b""
        text = _decode_output(data)
        if not text:
            return
        self._cursor += 1
        self._events.append((self._cursor, text))

    def _require_serial(self) -> Any:
        if self._serial is None or not getattr(self._serial, "is_open", True):
            raise MicroPythonSessionError("请先连接 ESP32。")
        return self._serial

    def _resolve_project_file(self, relative_path: str) -> Path:
        if self.project_root is None:
            raise MicroPythonSessionError("当前没有可用的实验目录。")
        relative = str(relative_path or "").replace("\\", "/").strip()
        if relative.startswith("./"):
            relative = relative[2:]
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

    def _pause_reader(self) -> None:
        with self._lock:
            self._stop_reader.set()
            reader = self._reader
            self._reader = None
        if reader and reader.is_alive() and reader is not threading.current_thread():
            reader.join(timeout=1.0)

    def _start_reader(self) -> None:
        with self._lock:
            if self._serial is None:
                return
            self._stop_reader.clear()
            self._reader = threading.Thread(target=self._read_loop, daemon=True)
            self._reader.start()

    def _disconnect_unlocked(self) -> None:
        with self._lock:
            self._stop_reader.set()
            reader = self._reader
            serial_connection = self._serial
            self._reader = None
            self._serial = None
            self._port = ""
            self._running_file = ""
            self._in_raw_repl = False
            self._follow_tail = b""
        if reader and reader.is_alive() and reader is not threading.current_thread():
            reader.join(timeout=1.0)
        _close_serial(serial_connection)

    def _write(self, serial_connection: Any, data: bytes) -> None:
        serial_connection.write(data)
        flush = getattr(serial_connection, "flush", None)
        if callable(flush):
            try:
                flush()
            except Exception:
                pass

    def _drain(self, serial_connection: Any) -> bytes:
        waiting = getattr(serial_connection, "in_waiting", 0)
        try:
            waiting = int(waiting or 0)
        except (TypeError, ValueError):
            waiting = 0
        if waiting > 0:
            return bytes(serial_connection.read(waiting) or b"")
        previous_timeout = getattr(serial_connection, "timeout", None)
        try:
            serial_connection.timeout = 0
        except Exception:
            previous_timeout = None
        try:
            return bytes(serial_connection.read(4096) or b"")
        finally:
            if previous_timeout is not None:
                try:
                    serial_connection.timeout = previous_timeout
                except Exception:
                    pass

    def _read_until(self, serial_connection: Any, ending: bytes, timeout: float) -> bytes:
        deadline = time.monotonic() + timeout
        buf = b""
        while time.monotonic() < deadline:
            if ending and ending in buf:
                return buf
            chunk = serial_connection.read(1)
            if chunk:
                buf += bytes(chunk)
            else:
                time.sleep(0.01)
        return buf

    def _read_exact(self, serial_connection: Any, size: int, timeout: float) -> bytes:
        deadline = time.monotonic() + timeout
        buf = b""
        while len(buf) < size and time.monotonic() < deadline:
            chunk = serial_connection.read(size - len(buf))
            if chunk:
                buf += bytes(chunk)
            else:
                time.sleep(0.01)
        return buf

    def _ensure_friendly_repl(self, serial_connection: Any) -> bytes:
        collected = b""
        self._write(serial_connection, b"\r\x03\x03")
        collected += self._read_until(serial_connection, b">>>", self.repl_timeout_s)
        if b">>>" in collected:
            self._in_raw_repl = False
            return collected
        if _RAW_REPL_BANNER in collected or b">" in collected:
            self._write(serial_connection, b"\r\x02")
            collected += self._read_until(serial_connection, b">>>", self.repl_timeout_s)
            if b">>>" in collected:
                self._in_raw_repl = False
                return collected
        self._write(serial_connection, b"\r\x01")
        collected += self._read_until(serial_connection, _RAW_REPL_BANNER, self.repl_timeout_s)
        if _RAW_REPL_BANNER in collected:
            self._write(serial_connection, b"\r\x02")
            collected += self._read_until(serial_connection, b">>>", self.repl_timeout_s)
            if b">>>" in collected or _RAW_REPL_BANNER in collected:
                self._in_raw_repl = False
                return collected
        raise MicroPythonSessionError("设备没有返回 MicroPython REPL，请先准备固件。")

    def _enter_raw_repl(self, serial_connection: Any, *, soft_reset: bool) -> None:
        self._write(serial_connection, b"\r\x03")
        self._drain(serial_connection)
        self._write(serial_connection, b"\r\x01")
        timeout = self.raw_repl_timeout_s
        banner = self._read_until(serial_connection, _RAW_REPL_BANNER + b"\r\n>", timeout)
        if _RAW_REPL_BANNER not in banner:
            raise MicroPythonSessionError("设备没有返回 MicroPython REPL，请先准备固件。")
        if soft_reset:
            self._write(serial_connection, b"\x04")
            reboot = self._read_until(serial_connection, b"soft reboot", timeout)
            if b"soft reboot" not in reboot:
                raise MicroPythonSessionError("设备没有返回 MicroPython REPL，请先准备固件。")
            banner = self._read_until(serial_connection, _RAW_REPL_BANNER, timeout)
            if _RAW_REPL_BANNER not in banner:
                raise MicroPythonSessionError("设备没有返回 MicroPython REPL，请先准备固件。")
            self._read_until(serial_connection, b">", min(1.0, timeout))
        self._in_raw_repl = True

    def _exec_raw_no_follow(self, serial_connection: Any, source: bytes) -> None:
        self._write(serial_connection, b"\x05A\x01")
        header = self._read_exact(serial_connection, 2, 0.4)
        if header == b"R\x01":
            self._raw_paste_write(serial_connection, source)
            ack = self._read_exact(serial_connection, 2, 1.0)
            if ack and ack != b"OK":
                with self._lock:
                    self._append_bytes_locked(ack)
            return
        if header and header != b"R\x00":
            leftover = self._read_until(serial_connection, b">", 1.0)
            if _RAW_REPL_BANNER not in header + leftover and not leftover.endswith(b">"):
                raise MicroPythonSessionError("无法在开发板上运行代码，请重新连接后重试。")
        for index in range(0, len(source), 256):
            self._write(serial_connection, source[index : index + 256])
            time.sleep(0.01)
        self._write(serial_connection, b"\x04")
        ack = self._read_exact(serial_connection, 2, 2.0)
        if ack != b"OK":
            raise MicroPythonSessionError("无法在开发板上运行代码，请重新连接后重试。")

    def _raw_paste_write(self, serial_connection: Any, source: bytes) -> None:
        header = self._read_exact(serial_connection, 2, 1.0)
        if len(header) != 2:
            raise MicroPythonSessionError("无法在开发板上运行代码，请重新连接后重试。")
        window_size = int.from_bytes(header, "little") or 256
        remaining = window_size
        offset = 0
        while offset < len(source):
            while remaining <= 0:
                flag = self._read_exact(serial_connection, 1, 1.0)
                if flag == b"\x01":
                    remaining += window_size
                elif flag == b"\x04":
                    self._write(serial_connection, b"\x04")
                    return
                else:
                    raise MicroPythonSessionError("无法在开发板上运行代码，请重新连接后重试。")
            chunk = source[offset : offset + remaining]
            self._write(serial_connection, chunk)
            remaining -= len(chunk)
            offset += len(chunk)
        self._write(serial_connection, b"\x04")
        self._read_until(serial_connection, b"\x04", 1.0)
