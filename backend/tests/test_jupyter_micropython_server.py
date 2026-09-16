import json
import queue
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from services import jupyter_micropython_server  # noqa: E402
from services.jupyter_micropython_server import (  # noqa: E402
    dispatch_micropython_request,
    parse_json_body,
)
from services.micropython_session import MicroPythonSessionManager  # noqa: E402


class FakeSerial:
    def __init__(self, *args, **kwargs):
        self.writes = []
        self.closed = False
        self.dtr = True
        self.rts = True
        self._reads = queue.Queue()

    @property
    def is_open(self):
        return not self.closed

    def write(self, value):
        self.writes.append(value)
        if b"\x03" in value or value in {b"\x04", b"\x05"}:
            self._reads.put(b"\r\n>>> ")
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


class FakeWebApp:
    def __init__(self):
        self.settings = {"base_url": "/jupyter/"}
        self.handlers = []

    def add_handlers(self, host_pattern, handlers):
        self.handlers.append((host_pattern, handlers))


class FakeServerApp:
    def __init__(self, root):
        self.web_app = FakeWebApp()
        self.contents_manager = type("Contents", (), {"root_dir": str(root)})()


class JupyterMicroPythonServerTestCase(unittest.TestCase):
    def setUp(self):
        self.serial = FakeSerial()
        self.project = Path(tempfile.mkdtemp())
        (self.project / "main.py").write_text("print('hello')\n", encoding="utf-8")
        self.manager = MicroPythonSessionManager(
            serial_factory=lambda *args, **kwargs: self.serial,
            project_root=self.project,
            boot_settle=0,
            repl_timeout=0.6,
            reset_timeout=0.6,
            poll_interval=0.01,
            ports_factory=lambda: [
                type(
                    "Port",
                    (),
                    {
                        "device": "/dev/cu.usbserial-ESP32",
                        "description": "USB Serial",
                        "hwid": "USB VID:PID=10C4:EA60",
                    },
                )()
            ],
        )

    def tearDown(self):
        self.manager.close()

    def test_extension_points_use_the_xedu_server_module(self):
        self.assertEqual(
            jupyter_micropython_server._jupyter_server_extension_points(),
            [{"module": "services.jupyter_micropython_server"}],
        )

    def test_server_extension_registers_same_origin_routes_and_project_root(self):
        with tempfile.TemporaryDirectory() as directory:
            server = FakeServerApp(directory)
            with patch.object(jupyter_micropython_server.atexit, "register"):
                jupyter_micropython_server._load_jupyter_server_extension(server)
            manager = server.web_app.settings["xedu_micropython_manager"]
            self.assertIsInstance(manager, MicroPythonSessionManager)
            self.assertEqual(manager.project_root, Path(directory).resolve())
            self.assertEqual(server.web_app.handlers[0][1][0][0], "/jupyter/xedu-micropython/(.*)")

    def test_ports_connect_output_and_disconnect_routes(self):
        status, body = dispatch_micropython_request(self.manager, method="GET", action="ports")
        self.assertEqual(status, 200)
        self.assertEqual(body["ports"][0]["device"], "/dev/cu.usbserial-ESP32")

        status, body = dispatch_micropython_request(
            self.manager,
            method="POST",
            action="connect",
            payload={"port": "/dev/cu.usbserial-ESP32"},
        )
        self.assertEqual(status, 200)
        self.assertTrue(body["success"])
        self.assertTrue(body["connected"])

        status, body = dispatch_micropython_request(
            self.manager,
            method="GET",
            action="output",
            after=0,
        )
        self.assertEqual(status, 200)
        self.assertTrue(body["connected"])
        self.assertGreaterEqual(body["cursor"], 1)

        status, body = dispatch_micropython_request(self.manager, method="POST", action="disconnect")
        self.assertEqual(status, 200)
        self.assertTrue(body["disconnected"])
        self.assertTrue(self.serial.closed)

    def test_run_input_interrupt_and_reset_routes(self):
        dispatch_micropython_request(
            self.manager,
            method="POST",
            action="connect",
            payload={"port": "/dev/cu.usbserial-ESP32"},
        )
        status, body = dispatch_micropython_request(
            self.manager,
            method="POST",
            action="run",
            payload={"file": "main.py"},
        )
        self.assertEqual(status, 200)
        self.assertTrue(body["running"])
        self.assertEqual(body["file"], "main.py")

        status, body = dispatch_micropython_request(
            self.manager,
            method="POST",
            action="input",
            payload={"text": "print(2)"},
        )
        self.assertEqual(status, 200)
        self.assertTrue(body["sent"])

        status, body = dispatch_micropython_request(self.manager, method="POST", action="interrupt")
        self.assertEqual(status, 200)
        self.assertTrue(body["interrupted"])

        status, body = dispatch_micropython_request(self.manager, method="POST", action="reset")
        self.assertEqual(status, 200)
        self.assertTrue(body["reset"])

    def test_malformed_json_missing_port_and_path_traversal_are_rejected(self):
        with self.assertRaises(Exception):
            parse_json_body(b"{")
        with self.assertRaises(Exception) as raised:
            parse_json_body(b"{")
        self.assertIn("无效", str(raised.exception))

        status, body = dispatch_micropython_request(
            self.manager,
            method="POST",
            action="connect",
            payload={},
        )
        self.assertEqual(status, 400)
        self.assertFalse(body["success"])
        self.assertIn("串口无效", body["message"])

        dispatch_micropython_request(
            self.manager,
            method="POST",
            action="connect",
            payload={"port": "/dev/cu.usbserial-ESP32"},
        )
        status, body = dispatch_micropython_request(
            self.manager,
            method="POST",
            action="run",
            payload={"file": "../secret.py"},
        )
        self.assertEqual(status, 400)
        self.assertFalse(body["success"])
        self.assertNotIn(b"\x05", b"".join(self.serial.writes[-3:]))

        status, body = dispatch_micropython_request(
            self.manager,
            method="POST",
            action="run",
            payload={"file": "missing.py"},
        )
        self.assertEqual(status, 400)
        self.assertIn(".py", body["message"])

        status, body = dispatch_micropython_request(self.manager, method="GET", action="unknown")
        self.assertEqual(status, 404)

    def test_parse_json_body_accepts_empty_disconnect_payload(self):
        self.assertEqual(parse_json_body(b""), {})
        self.assertEqual(parse_json_body(json.dumps({"port": "COM3"}).encode()), {"port": "COM3"})


if __name__ == "__main__":
    unittest.main()
