import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock
from types import SimpleNamespace


BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from api.app import create_app  # noqa: E402
from models.config import JupyterConfig  # noqa: E402
from services.jupyter_service import JupyterManager  # noqa: E402
from utils.logger import BackendLogger  # noqa: E402


class RuntimeSafetyTestCase(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        app = create_app(Path(self.temp_dir.name))
        app.testing = True
        self.app = app
        self.client = app.test_client()

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_network_access_switch_defaults_local_only(self):
        self.assertFalse(self.app.config.get("ALLOW_NETWORK_ACCESS"))

    def test_network_access_switch_can_be_enabled_via_config(self):
        response = self.client.post(
            "/api/save_config",
            json={"ui": {"allow_network_access": True}},
        )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(self.app.config.get("ALLOW_NETWORK_ACCESS"))

    def test_jupyter_command_local_mode_keeps_insecure_flags(self):
        config = JupyterConfig(allow_remote_access=False)
        manager = JupyterManager(config)
        cmd = manager._build_command(config)  # noqa: SLF001
        cmd_text = " ".join(cmd)
        self.assertIn("--ServerApp.ip=127.0.0.1", cmd_text)
        self.assertIn("--ServerApp.token=", cmd_text)
        self.assertIn("--ServerApp.disable_check_xsrf=True", cmd_text)

    def test_jupyter_command_remote_mode_keeps_auth_defaults(self):
        config = JupyterConfig(allow_remote_access=True)
        manager = JupyterManager(config)
        cmd = manager._build_command(config)  # noqa: SLF001
        cmd_text = " ".join(cmd)
        self.assertIn("--ServerApp.ip=0.0.0.0", cmd_text)
        self.assertNotIn("--ServerApp.token=", cmd_text)
        self.assertNotIn("--NotebookApp.token=", cmd_text)
        self.assertNotIn("--ServerApp.disable_check_xsrf=True", cmd_text)

    def test_logger_ignores_closed_stream_errors(self):
        logger = BackendLogger("runtime-safety-test")
        logger.logger.log = Mock(side_effect=ValueError("I/O operation on closed file."))
        # 不应抛异常
        logger.info("hello")

    def test_force_release_port_only_targets_tracked_processes(self):
        config = JupyterConfig(port=19456)
        manager = JupyterManager(config)
        manager.managed_pid = 101
        manager.external_pid = None
        manager._all_jupyter_pids = {202}  # noqa: SLF001

        tracked_proc = Mock()
        tracked_proc.info = {
            "pid": 202,
            "connections": [SimpleNamespace(laddr=SimpleNamespace(port=19456), status="LISTEN")],
        }
        untracked_proc = Mock()
        untracked_proc.info = {
            "pid": 303,
            "connections": [SimpleNamespace(laddr=SimpleNamespace(port=19456), status="LISTEN")],
        }

        with unittest.mock.patch("services.jupyter_service.psutil.process_iter", return_value=[tracked_proc, untracked_proc]):
            with unittest.mock.patch("services.jupyter_service.time.sleep", return_value=None):
                manager._force_release_port(19456)  # noqa: SLF001

        tracked_proc.terminate.assert_called_once()
        untracked_proc.terminate.assert_not_called()

    def test_cleanup_all_jupyter_processes_only_uses_tracked_pid_set(self):
        manager = JupyterManager(JupyterConfig(port=19457))
        manager.managed_pid = 111
        manager.external_pid = 222
        manager._all_jupyter_pids = {333}  # noqa: SLF001

        stopped = []
        manager._stop_process_by_pid = lambda pid: stopped.append(pid) or True  # noqa: SLF001
        manager._stop_protection = lambda: None  # noqa: SLF001
        manager._cleanup = lambda: None  # noqa: SLF001

        manager.cleanup_all_jupyter_processes()

        self.assertEqual(set(stopped), {111, 222, 333})


if __name__ == "__main__":
    unittest.main()
