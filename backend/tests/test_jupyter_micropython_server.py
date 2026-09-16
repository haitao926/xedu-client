import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from services import jupyter_micropython_server  # noqa: E402
from services.micropython_session import MicroPythonSessionManager  # noqa: E402


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


if __name__ == "__main__":
    unittest.main()
