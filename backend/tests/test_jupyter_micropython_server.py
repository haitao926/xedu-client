import shutil
import sys
import tempfile
import unittest
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

BACKEND_DIR = Path(__file__).resolve().parents[1]
TESTS_DIR = Path(__file__).resolve().parent
for directory in (BACKEND_DIR, TESTS_DIR):
    if str(directory) not in sys.path:
        sys.path.insert(0, str(directory))

from services import jupyter_micropython_server  # noqa: E402
from services.micropython_session import MicroPythonSessionError, MicroPythonSessionManager  # noqa: E402
from test_micropython_session import FakeMicroPythonSerial  # noqa: E402


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
        self.serial = FakeMicroPythonSerial()
        self.project = Path(tempfile.mkdtemp())
        (self.project / "main.py").write_text("print(1)\n", encoding="utf-8")
        self.manager = MicroPythonSessionManager(
            serial_factory=lambda *args, **kwargs: self.serial,
            ports_factory=lambda: [
                SimpleNamespace(
                    device="/dev/ttyUSB0",
                    description="USB Serial",
                    hwid="USB VID:PID=10C4:EA60",
                    vid=0x10C4,
                )
            ],
            project_root=self.project,
            connect_settle_s=0,
            repl_timeout_s=0.4,
            raw_repl_timeout_s=0.8,
        )

    def tearDown(self):
        self.manager.close()
        shutil.rmtree(self.project, ignore_errors=True)

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

    def test_dispatch_ports_connect_output_run_interrupt_reset_disconnect(self):
        status, body = jupyter_micropython_server.dispatch_micropython_action(
            self.manager, method="GET", action="ports"
        )
        self.assertEqual(status, 200)
        self.assertEqual(body["ports"][0]["device"], "/dev/ttyUSB0")

        status, body = jupyter_micropython_server.dispatch_micropython_action(
            self.manager, method="POST", action="connect", payload={"port": "/dev/ttyUSB0"}
        )
        self.assertEqual(status, 200)
        self.assertTrue(body["connected"])

        status, body = jupyter_micropython_server.dispatch_micropython_action(
            self.manager, method="GET", action="output", after=0
        )
        self.assertEqual(status, 200)
        self.assertIn(">>>", body["output"])
        cursor = body["cursor"]
        status, body = jupyter_micropython_server.dispatch_micropython_action(
            self.manager, method="GET", action="output", after=cursor
        )
        self.assertEqual(body["output"], "")

        status, body = jupyter_micropython_server.dispatch_micropython_action(
            self.manager, method="POST", action="run", payload={"file": "main.py"}
        )
        self.assertEqual(status, 200)
        self.assertTrue(body["running"])

        status, body = jupyter_micropython_server.dispatch_micropython_action(
            self.manager, method="POST", action="input", payload={"text": "print(2)"}
        )
        self.assertEqual(status, 200)
        self.assertTrue(body["sent"])

        status, body = jupyter_micropython_server.dispatch_micropython_action(
            self.manager, method="POST", action="interrupt"
        )
        self.assertTrue(body["interrupted"])
        status, body = jupyter_micropython_server.dispatch_micropython_action(
            self.manager, method="POST", action="reset"
        )
        self.assertTrue(body["reset"])
        status, body = jupyter_micropython_server.dispatch_micropython_action(
            self.manager, method="POST", action="disconnect"
        )
        self.assertTrue(body["disconnected"])
        self.assertTrue(self.serial.closed)

    def test_dispatch_rejects_malformed_routes_and_path_traversal(self):
        status, body = jupyter_micropython_server.dispatch_micropython_action(
            self.manager, method="GET", action="unknown"
        )
        self.assertEqual(status, 404)
        self.assertFalse(body["success"])

        status, body = jupyter_micropython_server.dispatch_micropython_action(
            self.manager, method="POST", action="connect", payload={"port": "http://attacker"}
        )
        self.assertEqual(status, 400)
        self.assertIn("串口无效", body["message"])

        jupyter_micropython_server.dispatch_micropython_action(
            self.manager, method="POST", action="connect", payload={"port": "/dev/ttyUSB0"}
        )
        status, body = jupyter_micropython_server.dispatch_micropython_action(
            self.manager, method="POST", action="run", payload={"file": "../secret.py"}
        )
        self.assertEqual(status, 400)
        self.assertIn("路径", body["message"])

    def test_parse_json_object_rejects_malformed_payloads(self):
        with self.assertRaises(MicroPythonSessionError):
            jupyter_micropython_server.parse_json_object(b"{")
        with self.assertRaises(MicroPythonSessionError):
            jupyter_micropython_server.parse_json_object(b"[1]")
        self.assertEqual(jupyter_micropython_server.parse_json_object(b'{"port":"COM3"}'), {"port": "COM3"})


if __name__ == "__main__":
    unittest.main()
