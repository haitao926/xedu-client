import sys
import tempfile
import threading
import time
import unittest
from pathlib import Path
from types import SimpleNamespace

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from services.micropython_session import (  # noqa: E402
    MicroPythonSessionError,
    MicroPythonSessionManager,
)


class FakeMicroPythonSerial:
    """Enough of a MicroPython board to exercise raw/paste REPL without hardware."""

    def __init__(self, *args, **kwargs):
        self.args = args
        self.kwargs = kwargs
        self.writes = []
        self.closed = False
        self.timeout = kwargs.get("timeout", 0.1)
        self.dtr = True
        self.rts = True
        self.exec_output = b"hello from board\r\n"
        self._buffer = bytearray()
        self._buffer_lock = threading.Lock()
        self._raw = False
        self._raw_buffer = bytearray()

    @property
    def is_open(self):
        return not self.closed

    @property
    def in_waiting(self):
        with self._buffer_lock:
            return len(self._buffer)

    def write(self, value):
        data = bytes(value)
        self.writes.append(data)
        index = 0
        while index < len(data):
            if data[index : index + 3] == b"\x05A\x01":
                self._queue(b"R\x00")
                index += 3
                continue
            byte = data[index : index + 1]
            if byte == b"\x03":
                self._raw = False
                self._raw_buffer.clear()
                self._queue(b"\r\n>>> ")
            elif byte == b"\x01":
                self._raw = True
                self._raw_buffer.clear()
                self._queue(b"raw REPL; CTRL-B to exit\r\n>")
            elif byte == b"\x02":
                self._raw = False
                self._raw_buffer.clear()
                self._queue(b"\r\nMicroPython v1.23.0 on ESP32\r\n>>> ")
            elif byte == b"\x04":
                if self._raw and self._raw_buffer:
                    self._queue(b"OK" + self.exec_output + b"\x04\x04>")
                    self._raw_buffer.clear()
                elif self._raw:
                    self._queue(b"MPY: soft reboot\r\nraw REPL; CTRL-B to exit\r\n>")
                else:
                    self._queue(b"MPY: soft reboot\r\nMicroPython v1.23.0 on ESP32\r\n>>> ")
            elif self._raw and byte not in {b"\r"}:
                self._raw_buffer.extend(byte)
            index += 1
        return len(data)

    def read(self, size):
        remaining = max(1, int(size or 1))
        timeout = 0 if self.timeout in {0, 0.0} else (self.timeout or 0.05)
        deadline = time.monotonic() + timeout
        while True:
            with self._buffer_lock:
                if self._buffer:
                    data = bytes(self._buffer[:remaining])
                    del self._buffer[: len(data)]
                    return data
            if timeout == 0 or time.monotonic() >= deadline:
                return b""
            time.sleep(0.005)

    def flush(self):
        return None

    def open(self):
        self.closed = False

    def close(self):
        self.closed = True

    def push(self, value):
        self._queue(value)

    def _queue(self, value):
        with self._buffer_lock:
            self._buffer.extend(bytes(value))


class SilentSerial(FakeMicroPythonSerial):
    def write(self, value):
        self.writes.append(bytes(value))
        return len(value)


class MicroPythonSessionTestCase(unittest.TestCase):
    def setUp(self):
        self.serial = FakeMicroPythonSerial()
        self.manager = MicroPythonSessionManager(
            serial_factory=lambda *args, **kwargs: self.serial,
            ports_factory=lambda: [
                SimpleNamespace(
                    device="/dev/cu.usbserial-ESP32",
                    description="USB Serial",
                    hwid="USB VID:PID=10C4:EA60",
                    vid=0x10C4,
                ),
                SimpleNamespace(
                    device="\\\\.\\COM10",
                    description="USB-SERIAL CH340 (COM10)",
                    hwid="USB VID:PID=1A86:7523",
                    vid=0x1A86,
                ),
                SimpleNamespace(
                    device="/dev/ttyUSB0",
                    description="CP2102 USB to UART Bridge Controller",
                    hwid="USB VID:PID=10C4:EA60",
                    vid=0x10C4,
                ),
                SimpleNamespace(
                    device="/dev/tty.Bluetooth-Incoming-Port",
                    description="Bluetooth-Incoming-Port",
                    hwid="n/a",
                    vid=None,
                ),
            ],
            connect_settle_s=0,
            repl_timeout_s=0.4,
            raw_repl_timeout_s=0.8,
        )

    def tearDown(self):
        self.manager.close()

    def test_list_ports_skips_bluetooth_and_keeps_common_esp32_adapters(self):
        devices = [port["device"] for port in self.manager.list_ports()]
        self.assertEqual(
            devices,
            ["/dev/cu.usbserial-ESP32", "/dev/ttyUSB0", "\\\\.\\COM10"],
        )
        self.assertTrue(all("Bluetooth" not in port["description"] for port in self.manager.list_ports()))

    def test_connect_starts_session_and_exposes_output_cursor(self):
        result = self.manager.connect("/dev/cu.usbserial-ESP32")
        self.assertTrue(result["connected"])
        self.assertEqual(result["port"], "/dev/cu.usbserial-ESP32")
        self.assertTrue(any(b"\x03" in chunk for chunk in self.serial.writes))
        self.assertEqual(self.serial.dtr, False)
        self.assertEqual(self.serial.rts, False)

        output = self._wait_output()
        self.assertIn(">>>", output)
        cursor = self.manager.read_output()["cursor"]
        self.assertEqual(self.manager.read_output(after=cursor)["output"], "")

    def test_input_interrupt_and_reset_use_serial_session(self):
        self.manager.connect("/dev/cu.usbserial-ESP32")
        self.serial.writes.clear()
        self.manager.write_input("print(1)")
        self.manager.interrupt()
        self.manager.reset()
        self.assertEqual(self.serial.writes[0], b"print(1)\r")
        self.assertTrue(any(b"\x03" in chunk for chunk in self.serial.writes))
        self.assertTrue(any(chunk.endswith(b"\x04") or chunk == b"\x04" for chunk in self.serial.writes))

    def test_run_file_uses_raw_repl_instead_of_friendly_exec(self):
        with tempfile.TemporaryDirectory() as directory:
            project = Path(directory)
            (project / "main.py").write_text("print('hello')\n", encoding="utf-8")
            self.manager = MicroPythonSessionManager(
                serial_factory=lambda *args, **kwargs: self.serial,
                project_root=project,
                connect_settle_s=0,
                repl_timeout_s=0.4,
                raw_repl_timeout_s=0.8,
            )
            self.manager.connect("/dev/cu.usbserial-ESP32")
            result = self.manager.run_file("main.py")

        self.assertTrue(result["running"])
        self.assertEqual(result["file"], "main.py")
        payload = b"".join(self.serial.writes)
        self.assertIn(b"\x01", payload)
        self.assertIn(b"print('hello')\n", payload)
        self.assertIn(b"\x04", payload)
        self.assertNotIn(b"exec(", payload)
        output = self._wait_output("hello from board")
        self.assertIn("hello from board", output)

    def test_run_file_rejects_paths_outside_project(self):
        with tempfile.TemporaryDirectory() as directory:
            project = Path(directory)
            self.manager = MicroPythonSessionManager(
                serial_factory=lambda *args, **kwargs: self.serial,
                project_root=project,
                connect_settle_s=0,
                repl_timeout_s=0.4,
            )
            self.manager.connect("/dev/cu.usbserial-ESP32")
            with self.assertRaises(MicroPythonSessionError):
                self.manager.run_file("../outside.py")

    def test_connect_rejects_unsafe_port_and_disconnect_closes_serial(self):
        with self.assertRaises(MicroPythonSessionError):
            self.manager.connect("http://attacker")
        self.manager.connect("/dev/cu.usbserial-ESP32")
        result = self.manager.disconnect()
        self.assertTrue(result["disconnected"])
        self.assertTrue(self.serial.closed)

    def test_busy_port_uses_student_facing_chinese_error(self):
        def factory(*_args, **_kwargs):
            raise PermissionError("Access is denied")

        manager = MicroPythonSessionManager(serial_factory=factory, connect_settle_s=0)
        with self.assertRaises(MicroPythonSessionError) as raised:
            manager.connect("/dev/ttyUSB0")
        self.assertIn("串口正在被其他程序使用", str(raised.exception))

    def test_missing_repl_closes_serial_and_explains_firmware(self):
        silent = SilentSerial()
        manager = MicroPythonSessionManager(
            serial_factory=lambda *args, **kwargs: silent,
            connect_settle_s=0,
            repl_timeout_s=0.05,
            raw_repl_timeout_s=0.05,
        )
        with self.assertRaises(MicroPythonSessionError) as raised:
            manager.connect("/dev/ttyUSB0")
        self.assertIn("没有返回 MicroPython REPL", str(raised.exception))
        self.assertTrue(silent.closed)
        self.assertFalse(manager.read_output()["connected"])

    def test_connect_clears_previous_output_cursor(self):
        self.manager.connect("/dev/cu.usbserial-ESP32")
        self.serial.push(b"old output\n")
        self._wait_output("old output")
        self.assertGreater(self.manager.read_output()["cursor"], 0)
        self.manager.connect("/dev/cu.usbserial-ESP32")
        snapshot = self.manager.read_output()
        self.assertNotIn("old output", snapshot["output"])

    def _wait_output(self, needle=">>>"):
        for _ in range(40):
            output = self.manager.read_output()["output"]
            if needle in output:
                return output
            time.sleep(0.02)
        self.fail(f"did not observe {needle!r} in {self.manager.read_output()['output']!r}")


if __name__ == "__main__":
    unittest.main()
