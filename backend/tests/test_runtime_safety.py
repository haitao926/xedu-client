import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock
from types import SimpleNamespace

import psutil


BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from api.app import create_app  # noqa: E402
from api.routes.python import _append_capped_output, _create_output_state, _finalize_capped_output  # noqa: E402
from models.config import JupyterConfig  # noqa: E402
from services.jupyter_service import JupyterManager  # noqa: E402
from utils.logger import BackendLogger  # noqa: E402
from api_test_utils import authorized_test_client  # noqa: E402


class RuntimeSafetyTestCase(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        app = create_app(Path(self.temp_dir.name))
        app.testing = True
        self.app = app
        self.client = authorized_test_client(app)

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_network_access_switch_defaults_to_lan_access(self):
        self.assertTrue(self.app.config.get("ALLOW_NETWORK_ACCESS"))

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

    def test_jupyter_command_remote_mode_is_ignored_and_keeps_local_flags(self):
        config = JupyterConfig(allow_remote_access=True)
        manager = JupyterManager(config)
        cmd = manager._build_command(config)  # noqa: SLF001
        cmd_text = " ".join(cmd)
        self.assertIn("--ServerApp.ip=127.0.0.1", cmd_text)
        self.assertIn("--ServerApp.token=", cmd_text)
        self.assertIn("--NotebookApp.token=", cmd_text)
        self.assertIn("--ServerApp.disable_check_xsrf=True", cmd_text)

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

    def test_python_timeout_terminates_spawned_child_process_tree(self):
        child_pid_file = Path(self.temp_dir.name) / "python-run-child.pid"
        code = (
            "import subprocess, sys, time\n"
            f"pid_file = {str(child_pid_file)!r}\n"
            "child = subprocess.Popen([sys.executable, '-c', 'import time; time.sleep(30)'])\n"
            "with open(pid_file, 'w', encoding='utf-8') as handle:\n"
            "    handle.write(str(child.pid))\n"
            "    handle.flush()\n"
            "time.sleep(30)\n"
        )

        response = self.client.post(
            "/api/python/run",
            json={"code": code, "timeout_seconds": 1},
        )

        self.assertEqual(response.status_code, 500)
        self.assertTrue(child_pid_file.exists())
        child_pid = int(child_pid_file.read_text(encoding="utf-8").strip())

        try:
            self.assertFalse(psutil.pid_exists(child_pid))
        finally:
            if psutil.pid_exists(child_pid):
                process = psutil.Process(child_pid)
                for descendant in process.children(recursive=True):
                    descendant.kill()
                process.kill()
                process.wait(timeout=3)

    def test_python_output_limit_reports_truncation_at_byte_boundary(self):
        state = _create_output_state(5)
        _append_capped_output(state, "stdout", "你好")
        _append_capped_output(state, "stdout", "!")

        outputs, events = _finalize_capped_output(state)

        self.assertEqual(outputs["stdout"], "你\n...[stdout 输出已截断，已达到 1 MiB 上限]")
        self.assertEqual(outputs["stderr"], "")
        self.assertEqual(events, [{"type": "output_truncated", "stream": "stdout", "limit_bytes": 5}])

    def test_python_output_limit_keeps_exact_limit_without_truncation_event(self):
        state = _create_output_state(3)
        _append_capped_output(state, "stderr", "abc")

        outputs, events = _finalize_capped_output(state)

        self.assertEqual(outputs["stderr"], "abc")
        self.assertEqual(events, [])


if __name__ == "__main__":
    unittest.main()
