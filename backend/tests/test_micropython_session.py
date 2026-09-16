import errno
import queue
import sys
import tempfile
import time
import unittest
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from services.micropython_session import (  # noqa: E402
    BUSY_PORT_MESSAGE,
    NO_REPL_MESSAGE,
    RUN_TIMEOUT_MESSAGE,
    MicroPythonSessionError,
    MicroPythonSessionManager,
    encode_paste_source,
    map_serial_open_error,
)


class FakeSerial:
    def __init__(self, *args, **kwargs):
        self.args = args
        self.kwargs = kwargs
        self.writes = []
        self.closed = False
        self.dtr = True
        self.rts = True
        self.reply_repl = True
        self._reads = queue.Queue()

    @property
    def is_open(self):
        return not self.closed

    def write(self, value):
        self.writes.append(value)
        if self.reply_repl and b"\x03" in value:
            self.push(b"\r\n>>> ")
        elif self.reply_repl and value == b"\x04":
            self.push(b"MPY: soft reboot\r\n>>> ")
        elif self.reply_repl and value == b"\x05":
            self.push(b"paste mode; Ctrl-C to cancel, Ctrl-D to finish\r\n=== ")
        return len(value)

    def read(self, _size):
        try:
            return self._reads.get(timeout=0.05)
        except queue.Empty:
            return b""

    def flush(self):
        return None

    def close(self):
        self.closed = True

    def reset_input_buffer(self):
        return None

    def reset_output_buffer(self):
        return None

    def push(self, value):
        self._reads.put(value)


class MicroPythonSessionTestCase(unittest.TestCase):
    def setUp(self):
        self.serial = FakeSerial()
        self.manager = self._make_manager(lambda *args, **kwargs: self.serial)

    def tearDown(self):
        self.manager.close()

    def _make_manager(self, factory, **kwargs):
        options = {
            "serial_factory": factory,
            "boot_settle": 0,
            "repl_timeout": 0.6,
            "reset_timeout": 0.6,
            "poll_interval": 0.01,
            "ports_factory": lambda: [
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
                        "device": "COM3",
                        "description": "USB-SERIAL CH340",
                        "hwid": "USB VID:PID=1A86:7523",
                    },
                )(),
                type(
                    "Port",
                    (),
                    {
                        "device": "/dev/ttyUSB0",
                        "description": "CP2102 USB to UART Bridge Controller",
                        "hwid": "USB VID:PID=10C4:EA60",
                    },
                )(),
                type(
                    "Port",
                    (),
                    {
                        "device": "/dev/ttyS0",
                        "description": "n/a",
                        "hwid": "n/a",
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
        }
        options.update(kwargs)
        return MicroPythonSessionManager(**options)

    def test_list_ports_skips_bluetooth_platform_uarts_and_returns_usb_metadata(self):
        self.assertEqual(
            self.manager.list_ports(),
            [
                {
                    "device": "/dev/cu.usbserial-ESP32",
                    "description": "USB Serial",
                    "hwid": "USB VID:PID=10C4:EA60",
                },
                {
                    "device": "COM3",
                    "description": "USB-SERIAL CH340",
                    "hwid": "USB VID:PID=1A86:7523",
                },
                {
                    "device": "/dev/ttyUSB0",
                    "description": "CP2102 USB to UART Bridge Controller",
                    "hwid": "USB VID:PID=10C4:EA60",
                },
            ],
        )

    def test_connect_waits_for_repl_and_exposes_output_cursor(self):
        result = self.manager.connect("/dev/cu.usbserial-ESP32")
        self.assertTrue(result["connected"])
        self.assertEqual(result["port"], "/dev/cu.usbserial-ESP32")
        self.assertEqual(self.serial.writes[0], b"\r\x03\x03")
        self.assertFalse(self.serial.dtr)
        self.assertFalse(self.serial.rts)

        for _ in range(30):
            if ">>>" in self.manager.read_output()["output"]:
                break
            time.sleep(0.01)
        self.assertIn(">>>", self.manager.read_output()["output"])
        cursor = self.manager.read_output()["cursor"]
        self.assertEqual(self.manager.read_output(after=cursor)["output"], "")

    def test_connect_rejects_device_without_micropython_repl(self):
        self.serial.reply_repl = False
        with self.assertRaises(MicroPythonSessionError) as raised:
            self.manager.connect("/dev/cu.usbserial-ESP32")
        self.assertEqual(str(raised.exception), NO_REPL_MESSAGE)
        self.assertTrue(self.serial.closed)
        self.assertFalse(self.manager.read_output()["connected"])

    def test_connect_maps_busy_port_errors(self):
        def factory(*_args, **_kwargs):
            raise OSError(errno.EBUSY, "Device or resource busy")

        self.manager = self._make_manager(factory)
        with self.assertRaises(MicroPythonSessionError) as raised:
            self.manager.connect("/dev/cu.usbserial-ESP32")
        self.assertEqual(str(raised.exception), BUSY_PORT_MESSAGE)

    def test_input_interrupt_and_reset_use_serial_session(self):
        self.manager.connect("/dev/cu.usbserial-ESP32")
        self.serial.writes.clear()
        self.manager.write_input("print(1)")
        self.manager.interrupt()
        self.manager.reset()
        self.assertEqual(self.serial.writes[0], b"print(1)\r")
        self.assertEqual(self.serial.writes[1], b"\x03")
        self.assertIn(b"\x04", self.serial.writes)

    def test_run_file_uses_paste_mode_instead_of_exec_repr(self):
        with tempfile.TemporaryDirectory() as directory:
            project = Path(directory)
            (project / "main.py").write_text("print('hello')\n", encoding="utf-8")
            self.manager = self._make_manager(
                lambda *args, **kwargs: self.serial,
                project_root=project,
            )
            self.manager.connect("/dev/cu.usbserial-ESP32")
            self.serial.writes.clear()
            result = self.manager.run_file("main.py")

        self.assertTrue(result["running"])
        self.assertEqual(result["file"], "main.py")
        self.assertIn(b"\x05", self.serial.writes)
        self.assertIn(encode_paste_source("print('hello')\n"), self.serial.writes)
        self.assertEqual(self.serial.writes[-1], b"\x04")
        joined = b"".join(self.serial.writes)
        self.assertNotIn(b"exec(", joined)

    def test_run_file_rejects_paths_outside_project(self):
        with tempfile.TemporaryDirectory() as directory:
            project = Path(directory)
            self.manager = self._make_manager(
                lambda *args, **kwargs: self.serial,
                project_root=project,
            )
            self.manager.connect("/dev/cu.usbserial-ESP32")
            with self.assertRaises(MicroPythonSessionError):
                self.manager.run_file("../outside.py")

    def test_run_file_times_out_when_repl_does_not_return(self):
        with tempfile.TemporaryDirectory() as directory:
            project = Path(directory)
            (project / "main.py").write_text("print(1)\n", encoding="utf-8")
            self.manager = self._make_manager(
                lambda *args, **kwargs: self.serial,
                project_root=project,
                repl_timeout=0.12,
            )
            self.manager.connect("/dev/cu.usbserial-ESP32")
            self.serial.reply_repl = False
            with self.assertRaises(MicroPythonSessionError) as raised:
                self.manager.run_file("main.py")
        self.assertEqual(str(raised.exception), RUN_TIMEOUT_MESSAGE)

    def test_connect_rejects_unsafe_port_and_disconnect_closes_serial(self):
        with self.assertRaises(MicroPythonSessionError):
            self.manager.connect("http://attacker")
        self.manager.connect("/dev/cu.usbserial-ESP32")
        result = self.manager.disconnect()
        self.assertTrue(result["disconnected"])
        self.assertTrue(self.serial.closed)
        self.assertFalse(self.manager.read_output()["connected"])

    def test_reconnect_closes_the_previous_serial_handle(self):
        created = []

        def factory(*args, **kwargs):
            serial = FakeSerial(*args, **kwargs)
            created.append(serial)
            return serial

        self.manager = self._make_manager(factory)
        self.manager.connect("/dev/cu.usbserial-ESP32")
        self.manager.connect("/dev/cu.usbserial-ESP32")
        self.assertTrue(created[0].closed)
        self.assertFalse(created[1].closed)

    def test_map_serial_open_error_uses_student_facing_chinese(self):
        self.assertEqual(
            str(map_serial_open_error(OSError(errno.EACCES, "Permission denied"))),
            BUSY_PORT_MESSAGE,
        )
        self.assertEqual(
            str(map_serial_open_error(FileNotFoundError("No such file or directory"))),
            "未发现 ESP32，请检查 USB 数据线和驱动。",
        )


if __name__ == "__main__":
    unittest.main()
