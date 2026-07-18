import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from models.config import JupyterConfig  # noqa: E402
from services.jupyter_environment import (  # noqa: E402
    build_jupyter_command,
    evaluate_environment_validation,
    merge_jupyter_config,
)
from services.jupyter_service import JupyterManager  # noqa: E402


class JupyterManagerUnitTestCase(unittest.TestCase):
    def make_manager(self, **config_kwargs) -> JupyterManager:
        base_config = {"port": 18888, "auto_restart": False}
        base_config.update(config_kwargs)
        config = JupyterConfig(**base_config)
        return JupyterManager(config)

    def test_start_launches_new_process_when_environment_is_valid(self):
        manager = self.make_manager()
        manager._manually_stopped = True  # noqa: SLF001
        start_result = {
            "success": True,
            "message": "started",
            "port": 18888,
            "url": "http://localhost:18888/lab?locale=en",
            "pid": 321,
            "auto_restart": False,
            "external": False,
        }

        with patch.object(JupyterConfig, "validate", return_value=(True, [])):
            with patch.object(manager, "is_running", return_value=False):
                with patch.object(manager, "_is_port_occupied", return_value=False):
                    with patch.object(manager, "_validate_environment", return_value=True) as validate_environment:
                        with patch.object(manager, "_start_process", return_value=start_result) as start_process:
                            result = manager.start()

        self.assertEqual(result, start_result)
        validate_environment.assert_called_once()
        self.assertEqual(start_process.call_args.args[0].port, 18888)
        self.assertEqual(manager.config.port, 18888)
        self.assertFalse(manager._manually_stopped)  # noqa: SLF001

    def test_start_switches_to_available_port_when_requested_port_is_occupied(self):
        manager = self.make_manager(port=18888)
        start_result = {
            "success": True,
            "message": "started",
            "port": 18890,
            "url": "http://localhost:18890/lab?locale=en",
            "pid": 654,
            "auto_restart": False,
            "external": False,
        }

        with patch.object(JupyterConfig, "validate", return_value=(True, [])):
            with patch.object(manager, "is_running", return_value=False):
                with patch.object(manager, "_is_port_occupied", return_value=True):
                    with patch.object(manager, "_find_available_port", return_value=18890) as find_available_port:
                        with patch.object(manager, "_validate_environment", return_value=True):
                            with patch.object(manager, "_start_process", return_value=start_result) as start_process:
                                result = manager.start()

        self.assertTrue(result["success"])
        self.assertEqual(result["port"], 18890)
        self.assertEqual(start_process.call_args.args[0].port, 18890)
        self.assertEqual(manager.config.port, 18890)
        find_available_port.assert_called_once_with(18888)

    def test_stop_releases_processes_and_marks_manual_stop(self):
        manager = self.make_manager()
        manager.managed_pid = 111
        manager.external_pid = 222

        with patch.object(manager, "_stop_protection") as stop_protection:
            with patch.object(manager, "_stop_process_by_pid", side_effect=[True, True]) as stop_process_by_pid:
                with patch.object(manager, "_is_port_occupied", return_value=True):
                    with patch.object(manager, "_force_release_port") as force_release_port:
                        with patch.object(manager, "_cleanup") as cleanup:
                            with patch("services.jupyter_service.time.sleep", return_value=None):
                                result = manager.stop()

        self.assertTrue(result["success"])
        stop_protection.assert_called_once()
        self.assertEqual([call.args[0] for call in stop_process_by_pid.call_args_list], [111, 222])
        force_release_port.assert_called_once_with(18888)
        cleanup.assert_called_once()
        self.assertIsNone(manager.managed_pid)
        self.assertIsNone(manager.external_pid)
        self.assertTrue(manager._manually_stopped)  # noqa: SLF001

    def test_restart_stops_then_starts_with_same_kwargs(self):
        manager = self.make_manager()
        restart_result = {"success": True, "message": "restarted"}

        with patch.object(manager, "_stop_impl", return_value={"success": True}) as stop_impl:
            with patch.object(manager, "_start_impl", return_value=restart_result) as start_impl:
                with patch("services.jupyter_service.time.sleep", return_value=None) as sleep:
                    result = manager.restart(project_dir="/tmp/course")

        self.assertEqual(result, restart_result)
        stop_impl.assert_called_once()
        sleep.assert_called_once_with(2)
        start_impl.assert_called_once_with(project_dir="/tmp/course")

    def test_is_running_cleans_up_crashed_managed_process(self):
        manager = self.make_manager()
        manager.managed_pid = 404

        with patch.object(manager, "_is_process_running", return_value=False):
            with patch("services.jupyter_service.time.sleep", return_value=None):
                running = manager.is_running()

        self.assertFalse(running)

    def test_process_protection_restarts_after_crash(self):
        manager = self.make_manager(auto_restart=True, max_restarts=2)
        manager.check_interval = 0

        def fake_start():
            manager._stop_event.set()  # noqa: SLF001
            return {"success": True, "message": "restarted"}

        with patch.object(manager, "is_running", side_effect=[False]):
            with patch.object(manager, "start", side_effect=fake_start) as start:
                with patch("services.jupyter_service.time.sleep", return_value=None):
                    manager._process_protection()  # noqa: SLF001

        self.assertEqual(manager.restart_count, 1)
        start.assert_called_once_with()


class JupyterEnvironmentHelpersTestCase(unittest.TestCase):
    def test_merge_jupyter_config_coerces_known_override_fields(self):
        base_config = JupyterConfig(port=18888, auto_restart=False)

        merged = merge_jupyter_config(
            base_config,
            {
                "port": "18900",
                "use_notebook": "1",
                "check_interval": "3000",
                "unknown": "ignored",
            },
        )

        self.assertEqual(merged.port, 18900)
        self.assertTrue(merged.use_notebook)
        self.assertEqual(merged.check_interval, 3000)
        self.assertFalse(hasattr(merged, "unknown"))

    def test_evaluate_environment_validation_uses_matching_cache_entry(self):
        config = JupyterConfig(port=18888, auto_restart=False)
        config.python_executable = ""

        result = evaluate_environment_validation(
            config,
            current_time=100.0,
            cached_python_executable="",
            cached_venv_valid=True,
            cached_project_dir_valid=True,
            last_check=50.0,
            cache_duration=300.0,
            backend_python_executable="/usr/bin/python3",
        )

        self.assertTrue(result.used_cache)
        self.assertTrue(result.is_valid)
        self.assertEqual(result.errors, ())

    def test_evaluate_environment_validation_reports_missing_paths(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            missing_python = Path(tmp_dir) / "missing-python"
            missing_project_dir = Path(tmp_dir) / "missing-project"
            config = JupyterConfig(
                port=18888,
                auto_restart=False,
                python_executable=str(missing_python),
                project_dir=str(missing_project_dir),
            )

            result = evaluate_environment_validation(
                config,
                current_time=100.0,
                cached_python_executable=None,
                cached_venv_valid=None,
                cached_project_dir_valid=None,
                last_check=0.0,
                cache_duration=300.0,
                backend_python_executable=sys.executable,
            )

        self.assertFalse(result.used_cache)
        self.assertFalse(result.is_valid)
        self.assertFalse(result.project_dir_valid)
        self.assertIn(f"Python executable not found: {missing_python}", result.errors)
        self.assertIn(f"Project directory not found: {missing_project_dir}", result.errors)

    def test_build_jupyter_command_uses_relative_python_and_local_auth_bypass(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            project_root = Path(tmp_dir)
            python_executable = project_root / "venv" / "bin" / "python3"
            python_executable.parent.mkdir(parents=True)
            python_executable.write_text("", encoding="utf-8")
            work_dir = project_root / "course"
            work_dir.mkdir()
            config = JupyterConfig(
                port=18888,
                auto_restart=False,
                python_executable="venv/bin/python3",
                project_dir=str(work_dir),
                args="--Example.flag=1",
                debug=True,
            )

            command = build_jupyter_command(
                config,
                backend_python_executable="/usr/bin/python3",
                project_root=project_root,
            )

        self.assertEqual(command[0], str(python_executable))
        self.assertEqual(command[1:3], ["-m", "jupyterlab"])
        self.assertIn("--ServerApp.ip=127.0.0.1", command)
        self.assertIn("--ServerApp.token=", command)
        self.assertIn(f"--ServerApp.root_dir={work_dir}", command)
        self.assertIn(f"--ServerApp.notebook_dir={work_dir}", command)
        self.assertIn("--Example.flag=1", command)
        self.assertEqual(command[-1], "--debug")

    def test_build_jupyter_command_remote_access_keeps_auth_enabled(self):
        config = JupyterConfig(
            port=18888,
            auto_restart=False,
            use_notebook=True,
            allow_remote_access=True,
        )
        config.python_executable = ""

        command = build_jupyter_command(
            config,
            backend_python_executable="/usr/bin/python3",
            project_root=BACKEND_DIR.parent,
        )

        self.assertEqual(command[0], "/usr/bin/python3")
        self.assertEqual(command[1:3], ["-m", "notebook"])
        self.assertIn("--ServerApp.ip=0.0.0.0", command)
        self.assertNotIn("--ServerApp.token=", command)
        self.assertFalse(any(part.startswith("--ServerApp.root_dir=") for part in command))


if __name__ == "__main__":
    unittest.main()
