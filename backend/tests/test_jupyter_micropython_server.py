import asyncio
import inspect
import json
import re
import shutil
import sys
import tempfile
import threading
import time
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
            patterns = [item[0] for item in server.web_app.handlers[0][1]]
            self.assertEqual(patterns, jupyter_micropython_server.micropython_route_patterns("/jupyter/"))
            self.assertEqual(patterns[0], "/jupyter/xedu-micropython/ports")
            self.assertIn("/jupyter/xedu-micropython/(.*)", patterns)
            self.assertEqual(patterns[-1], "/jupyter/xedu-micropython/(.*)")

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
        # The reader can deliver the REPL banner in more than one chunk.
        for _ in range(20):
            status, body = jupyter_micropython_server.dispatch_micropython_action(
                self.manager, method="GET", action="output", after=cursor
            )
            if not body["output"]:
                break
            cursor = body["cursor"]
            time.sleep(0.02)
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

    def test_stop_running_raw_program_through_handler(self):
        self.serial.execution_finishes = False
        status, body = self._invoke_handler(
            "POST", action="connect", request_path="/jupyter/xedu-micropython/connect",
            payload={"port": "COM3"},
        )
        self.assertEqual(status, 200, body)
        status, body = self._invoke_handler(
            "POST", action="run", request_path="/jupyter/xedu-micropython/run",
            payload={"file": "main.py"},
        )
        self.assertEqual(status, 200, body)
        self.assertEqual(self.manager.read_output()["running_file"], "main.py")
        self.serial.io_events.clear()
        status, body = self._invoke_handler(
            "POST", action=None, request_path="/jupyter/xedu-micropython/interrupt",
        )
        self.assertEqual(status, 200, body)
        self.assertTrue(body["interrupted"])
        self.assertEqual(self.serial.io_events, [
            ("write", b"\r\x03"), ("flush", None),
            ("write", b"\x03"), ("flush", None),
            ("write", b"\r\x02"), ("flush", None),
        ])
        status, body = self._invoke_handler(
            "GET", action="output", request_path="/jupyter/xedu-micropython/output",
        )
        self.assertEqual(status, 200, body)
        self.assertTrue(body["connected"])
        self.assertFalse(body["running"])
        self.assertEqual(body["running_file"], "")
        self.assertIn("KeyboardInterrupt", body["output"])

    def test_parse_json_object_rejects_malformed_payloads(self):
        with self.assertRaises(MicroPythonSessionError):
            jupyter_micropython_server.parse_json_object(b"{")
        with self.assertRaises(MicroPythonSessionError):
            jupyter_micropython_server.parse_json_object(b"[1]")
        self.assertEqual(jupyter_micropython_server.parse_json_object(b'{"port":"COM3"}'), {"port": "COM3"})

    def test_serial_dispatch_leaves_event_loop_heartbeat_running(self):
        started = threading.Event()
        release = threading.Event()
        response_threads = []

        def connect(port):
            started.set()
            release.wait(1)
            return {"connected": True, "port": port, "baudrate": 115200}

        async def exercise():
            loop_thread = threading.get_ident()
            operation = asyncio.create_task(self._invoke_handler_async(
                "POST", action="connect", request_path="/jupyter/xedu-micropython/connect",
                payload={"port": "COM3"}, response_threads=response_threads,
            ))
            try:
                self.assertTrue(await asyncio.to_thread(started.wait, 1))
                heartbeat = asyncio.Event()
                asyncio.get_running_loop().call_soon(heartbeat.set)
                await asyncio.wait_for(heartbeat.wait(), 0.5)
                self.assertFalse(operation.done(), "Serial dispatch blocked the event-loop heartbeat")
            finally:
                release.set()
                status, body = await operation
            self.assertEqual(status, 200)
            self.assertEqual(body, {"success": True, "connected": True, "port": "COM3", "baudrate": 115200})
            self.assertEqual(response_threads, [loop_thread])

        with patch.object(self.manager, "connect", side_effect=connect):
            asyncio.run(exercise())

    def test_concurrent_handlers_serialize_serial_operations(self):
        started = threading.Event()
        release = threading.Event()
        second_started = threading.Event()
        calls = []

        def run_file(file):
            calls.append(("run", file))
            started.set()
            release.wait(1)
            calls.append(("run-finished", file))
            return {"running": True, "file": file}

        def write_input(text):
            calls.append(("input", text))
            second_started.set()
            return {"sent": True}

        async def exercise():
            first = asyncio.create_task(self._invoke_handler_async(
                "POST", action="run", request_path="/jupyter/xedu-micropython/run",
                payload={"file": "main.py"},
            ))
            second = None
            try:
                self.assertTrue(await asyncio.to_thread(started.wait, 1))
                self.assertFalse(first.done(), "Serial dispatch must run off the event loop")
                second = asyncio.create_task(self._invoke_handler_async(
                    "POST", action="input", request_path="/jupyter/xedu-micropython/input",
                    payload={"text": "print(2)"},
                ))
                self.assertFalse(await asyncio.to_thread(second_started.wait, 0.1))
                self.assertFalse(second.done())
            finally:
                release.set()
                first_result = await first
                second_result = await second if second is not None else None
            self.assertEqual(first_result, (200, {"success": True, "running": True, "file": "main.py"}))
            self.assertEqual(second_result, (200, {"success": True, "sent": True}))
            self.assertEqual(calls, [("run", "main.py"), ("run-finished", "main.py"), ("input", "print(2)")])

        with patch.object(self.manager, "run_file", side_effect=run_file), \
                patch.object(self.manager, "write_input", side_effect=write_input):
            asyncio.run(exercise())

    def test_cancelled_handler_keeps_pending_serial_work_serialized(self):
        started = threading.Event()
        release = threading.Event()
        second_started = threading.Event()

        def run_file(file):
            started.set()
            release.wait(1)
            return {"running": True, "file": file}

        def write_input(text):
            second_started.set()
            return {"sent": True}

        async def exercise():
            first = asyncio.create_task(self._invoke_handler_async(
                "POST", action="run", request_path="/jupyter/xedu-micropython/run",
                payload={"file": "main.py"},
            ))
            second = None
            try:
                self.assertTrue(await asyncio.to_thread(started.wait, 1))
                self.assertFalse(first.done(), "Serial dispatch must run off the event loop")
                first.cancel()
                with self.assertRaises(asyncio.CancelledError):
                    await first
                second = asyncio.create_task(self._invoke_handler_async(
                    "POST", action="input", request_path="/jupyter/xedu-micropython/input",
                    payload={"text": "print(2)"},
                ))
                self.assertFalse(await asyncio.to_thread(second_started.wait, 0.1))
            finally:
                release.set()
                if not first.cancelled():
                    await first
                second_result = await second if second is not None else None
            self.assertEqual(second_result, (200, {"success": True, "sent": True}))

        with patch.object(self.manager, "run_file", side_effect=run_file), \
                patch.object(self.manager, "write_input", side_effect=write_input):
            asyncio.run(exercise())

    def test_handler_preserves_validation_and_error_response_contracts(self):
        for action, payload, message in (
            ("connect", {"port": "http://attacker"}, "串口无效。"),
            ("run", {"file": "../secret.py"}, "实验文件路径无效。"),
            ("run", [], "请求数据格式无效。"),
        ):
            with self.subTest(action=action, payload=payload):
                status, body = self._invoke_handler(
                    "POST", action=action, request_path=f"/jupyter/xedu-micropython/{action}",
                    payload=payload,
                )
                self.assertEqual(status, 400)
                self.assertEqual(body, {"success": False, "message": message})

        for error, status, message in (
            (MicroPythonSessionError("设备未连接。"), 400, "设备未连接。"),
            (RuntimeError("serial failure"), 500, "ESP32 操作失败。"),
        ):
            with self.subTest(error=error), patch.object(self.manager, "write_input", side_effect=error):
                self.assertEqual(self._invoke_handler(
                    "POST", action="input", request_path="/jupyter/xedu-micropython/input",
                    payload={"text": "print(2)"},
                ), (status, {"success": False, "message": message}))
        with patch.object(self.manager, "write_input", return_value={"sent": True}):
            self.assertEqual(self._invoke_handler(
                "POST", action="input", request_path="/jupyter/xedu-micropython/input",
                payload={"text": "print(2)"},
            ), (200, {"success": True, "sent": True}))

    def test_missing_capture_group_uses_request_path_for_every_panel_action(self):
        routes = _panel_routes_from_source()
        self.assertEqual(
            [(name, method, path) for name, method, path in routes],
            [
                ("refresh", "GET", "ports"),
                ("connect", "POST", "connect"),
                ("disconnect", "POST", "disconnect"),
                ("run", "POST", "run"),
                ("upload", "POST", "upload"),
                ("interrupt", "POST", "interrupt"),
                ("reset", "POST", "reset"),
                ("send", "POST", "input"),
                ("poll", "GET", "output"),
            ],
        )
        by_path = {path: (name, method) for name, method, path in routes}
        self.assertEqual(set(by_path), {action for _method, action in jupyter_micropython_server.PANEL_ROUTE_TABLE})
        index_source = (
            Path(__file__).resolve().parents[2] / "jupyterlab_micropython" / "src" / "index.js"
        ).read_text(encoding="utf-8")
        for name, _method, _path in routes:
            self.assertIn(f"requestRoute('{name}'", index_source)
        bodies = {
            "connect": {"port": "/dev/ttyUSB0"},
            "run": {"file": "main.py"},
            "upload": {"file": "main.py"},
            "input": {"text": "print(2)"},
        }
        for path in ("ports", "connect", "output", "run", "upload", "input", "interrupt", "reset", "disconnect"):
            _name, method = by_path[path]
            request_path = f"/jupyter/xedu-micropython/{path}"
            if path == "output":
                request_path = f"{request_path}?after=0"
            status, body = self._invoke_handler(
                method,
                action=None,
                request_path=request_path,
                payload=bodies.get(path),
            )
            self.assertEqual(status, 200, body)
            self.assertTrue(body["success"], body)

        status, body = self._invoke_handler("GET", action=None, request_path="/jupyter/xedu-micropython/foo")
        self.assertEqual(status, 404)
        self.assertEqual(body["message"], "不支持的 MicroPython 请求。")

        status, body = jupyter_micropython_server.dispatch_micropython_action(
            self.manager,
            method="GET",
            action="nope",
            request_path="/jupyter/xedu-micropython/ports",
        )
        self.assertEqual(status, 404)
        self.assertEqual(body["message"], "不支持的 MicroPython 请求。")

        status, body = self._invoke_handler(
            "GET",
            action="output?after=0",
            request_path="/jupyter/xedu-micropython/(.*)",
        )
        self.assertEqual(status, 200)
        self.assertIn("cursor", body)

        status, body = self._invoke_handler(
            "GET",
            action=None,
            request_path="/jupyter/xedu-micropython/ports/",
        )
        self.assertEqual(status, 200)
        self.assertTrue(body["ports"])

    def _invoke_handler(self, method, *, action, request_path, payload=None):
        return asyncio.run(self._invoke_handler_async(
            method, action=action, request_path=request_path, payload=payload,
        ))

    async def _invoke_handler_async(self, method, *, action, request_path, payload=None, response_threads=None):
        handler = jupyter_micropython_server.MicroPythonHandler.__new__(
            jupyter_micropython_server.MicroPythonHandler
        )
        handler.request = SimpleNamespace(
            path=request_path.split("?", 1)[0],
            uri=request_path,
            body=b"" if payload is None else json.dumps(payload).encode("utf-8"),
        )
        settings = {"xedu_micropython_manager": self.manager}
        try:
            handler.settings = settings
        except AttributeError:
            # Real JupyterHandler.settings is a read-only alias of application.settings.
            handler.application = SimpleNamespace(settings=settings)
        try:
            handler.log = None
        except AttributeError:
            pass
        handler._status = None
        handler._finished = None

        def get_argument(name, default=""):
            if "?" not in request_path:
                return default
            query = request_path.split("?", 1)[1]
            for part in query.split("&"):
                if part.startswith(f"{name}="):
                    return part.split("=", 1)[1]
            return default

        handler.get_argument = get_argument
        handler.set_status = lambda status: setattr(handler, "_status", status)
        handler.set_header = lambda _name, _value: None
        def finish(raw):
            handler._finished = raw
            if response_threads is not None:
                response_threads.append(threading.get_ident())

        handler.finish = finish
        if method == "GET":
            result = handler.get(action)
        else:
            result = handler.post(action)
        if inspect.isawaitable(result):
            await result
        return handler._status, json.loads(handler._finished)


def _panel_routes_from_source() -> list[tuple[str, str, str]]:
    source = (
        Path(__file__).resolve().parents[2] / "jupyterlab_micropython" / "src" / "panel-logic.js"
    ).read_text(encoding="utf-8")
    match = re.search(r"export const PANEL_ROUTES = Object\.freeze\(\{(.*?)\}\);", source, re.S)
    if not match:
        raise AssertionError("PANEL_ROUTES export is missing from the ESP32 panel")
    routes = re.findall(
        r"(\w+):\s*Object\.freeze\(\{\s*method:\s*'(GET|POST)',\s*path:\s*'([a-z]+)'\s*\}\)",
        match.group(1),
    )
    if not routes:
        raise AssertionError("PANEL_ROUTES did not contain any panel actions")
    return routes


if __name__ == "__main__":
    unittest.main()
