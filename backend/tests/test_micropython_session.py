import queue
import sys
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import patch

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from services.micropython_session import (  # noqa: E402
    MicroPythonSessionError,
    MicroPythonSessionManager,
)


class FakeSerial:
    def __init__(self, *args, **kwargs):
        self.args = args
        self.kwargs = kwargs
        self.writes = []
        self.closed = False
        self._reads = queue.Queue()

    @property
    def is_open(self):
        return not self.closed

    def write(self, value):
        self.writes.append(value)
        return len(value)

    def read(self, _size):
        try:
            return self._reads.get(timeout=0.05)
        except queue.Empty:
            return b""

    def close(self):
        self.closed = True

    def push(self, value):
        self._reads.put(value)


class MicroPythonSessionTestCase(unittest.TestCase):
    def setUp(self):
        self.serial = FakeSerial()
        self.manager = MicroPythonSessionManager(
            serial_factory=lambda *args, **kwargs: self.serial,
            ports_factory=lambda: [
                type(
                    "Port",
                    (),
                    {
                        "device": "/dev/cu.usbserial-ESP32",
                        "description": "USB Serial",
                        "hwid": "USB VID:PID=10C4:EA60",
                    },
                )(),
                type(
                    "Port",
                    (),
                    {
                        "device": "/dev/tty.Bluetooth-Incoming-Port",
                        "description": "Bluetooth-Incoming-Port",
                        "hwid": "n/a",
                    },
                )(),
            ],
        )

    def tearDown(self):
        self.manager.close()

    def test_list_ports_skips_bluetooth_and_returns_device_metadata(self):
        self.assertEqual(
            self.manager.list_ports(),
            [
                {
                    "device": "/dev/cu.usbserial-ESP32",
                    "description": "USB Serial",
                    "hwid": "USB VID:PID=10C4:EA60",
                }
            ],
        )

    def test_connect_starts_session_and_exposes_output_cursor(self):
        result = self.manager.connect("/dev/cu.usbserial-ESP32")
        self.assertTrue(result["connected"])
        self.assertEqual(result["port"], "/dev/cu.usbserial-ESP32")
        self.assertEqual(self.serial.writes[:1], [b"\x03\x03"])

        self.serial.push("MicroPython ESP32\r\n>>> ".encode())
        for _ in range(20):
            if self.manager.read_output()["output"]:
                break
            time.sleep(0.01)
        self.assertEqual(self.manager.read_output()["output"], "MicroPython ESP32\r\n>>> ")
        cursor = self.manager.read_output()["cursor"]
        self.assertEqual(self.manager.read_output(after=cursor)["output"], "")

    def test_input_interrupt_and_reset_use_serial_session(self):
        self.manager.connect("/dev/cu.usbserial-ESP32")
        self.manager.write_input("print(1)")
        self.manager.interrupt()
        self.manager.reset()
        self.assertEqual(
            self.serial.writes,
            [b"\x03\x03", b"print(1)\r\n", b"\x03", b"\x04"],
        )

    def test_run_file_sends_python_source_to_device_repl(self):
        with tempfile.TemporaryDirectory() as directory:
            project = Path(directory)
            (project / "main.py").write_text("print('hello')\n", encoding="utf-8")
            self.manager = MicroPythonSessionManager(
                serial_factory=lambda *args, **kwargs: self.serial,
                project_root=project,
            )
            self.manager.connect("/dev/cu.usbserial-ESP32")
            result = self.manager.run_file("main.py")

        self.assertTrue(result["running"])
        self.assertIn("exec(\"print('hello')\\n\")", self.serial.writes[-1].decode())

    def test_run_file_rejects_paths_outside_project(self):
        with tempfile.TemporaryDirectory() as directory:
            project = Path(directory)
            self.manager = MicroPythonSessionManager(
                serial_factory=lambda *args, **kwargs: self.serial,
                project_root=project,
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


if __name__ == "__main__":
    unittest.main()
