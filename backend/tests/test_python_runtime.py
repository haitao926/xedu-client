import sys
import json
import tempfile
import unittest
import os
import subprocess
from pathlib import Path
from unittest.mock import patch


BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from utils.python_runtime import (  # noqa: E402
    _ensure_target_pip,
    _install_jupyter_packages,
    _install_xedu_package,
    _jupyter_repair_specs,
    _pip_install_options,
    _xedu_runtime_repair_specs,
    resolve_pip_command,
    inspect_python_environment,
    inspect_python_executable,
    inspect_jupyter_module,
    repair_xedu_python_environment,
    augment_conda_environment,
    _conda_prefix_for_executable,
)
from services.config_service import ConfigService  # noqa: E402


class PythonRuntimeTestCase(unittest.TestCase):
    @patch("utils.python_runtime.inspect_python_executable")
    @patch("utils.python_runtime.subprocess.run")
    def test_jupyter_check_reads_package_metadata_without_starting_cli(self, run_mock, validation_mock):
        validation_mock.return_value = {
            "success": True,
            "executable": "C:/Python312/python.exe",
        }
        run_mock.return_value = type(
            "Completed",
            (),
            {"returncode": 0, "stdout": "4.5.9\n", "stderr": ""},
        )()

        result = inspect_jupyter_module("C:/Python312/python.exe", "jupyterlab")

        self.assertTrue(result["success"], result)
        self.assertEqual(result["version"], "4.5.9")
        command = run_mock.call_args.args[0]
        self.assertEqual(command[:2], ["C:/Python312/python.exe", "-c"])
        self.assertNotIn("jupyterlab", command)
        self.assertIn("importlib.metadata", command[2])

    @patch("utils.python_runtime.inspect_python_executable")
    @patch("utils.python_runtime.subprocess.run")
    def test_jupyter_check_reports_timeout_as_a_readable_message(self, run_mock, validation_mock):
        validation_mock.return_value = {
            "success": True,
            "executable": "C:/Python312/python.exe",
        }
        run_mock.side_effect = subprocess.TimeoutExpired(
            cmd=["C:/Python312/python.exe", "-c"], timeout=10,
        )

        result = inspect_jupyter_module("C:/Python312/python.exe", "jupyterlab")

        self.assertFalse(result["success"])
        self.assertIn("JupyterLab 检查超时", result["message"])
        self.assertNotIn("Command [", result["message"])

    @patch("utils.python_runtime.inspect_python_executable")
    @patch("utils.python_runtime.subprocess.run")
    def test_jupyterlab_check_requires_simplified_chinese_language_pack(
        self,
        run_mock,
        validation_mock,
    ):
        validation_mock.return_value = {
            "success": True,
            "executable": "C:/Python312/python.exe",
        }
        run_mock.side_effect = [
            type(
                "Completed",
                (),
                {"returncode": 0, "stdout": "4.5.9\n", "stderr": ""},
            )(),
            type(
                "Completed",
                (),
                {"returncode": 1, "stdout": "", "stderr": "not installed"},
            )(),
        ]

        result = inspect_jupyter_module("C:/Python312/python.exe", "jupyterlab")

        self.assertFalse(result["success"])
        self.assertIn("简体中文语言包", result["message"])
        self.assertIn("修复", result["message"])

    def test_current_interpreter_is_accepted(self):
        result = inspect_python_executable(sys.executable)

        self.assertTrue(result["success"], result)
        self.assertEqual(result["executable"], os.path.abspath(sys.executable))

    def test_environment_probe_reports_ssl_capability(self):
        result = inspect_python_environment(sys.executable)

        self.assertTrue(result["success"], result)
        self.assertTrue(result["ssl_available"], result)
        self.assertTrue(result["ssl_version"], result)

    def test_virtualenv_symlink_keeps_the_selected_interpreter_path(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            selected = Path(temp_dir) / "bin" / "python"
            selected.parent.mkdir()
            selected.symlink_to(sys.executable)

            result = inspect_python_executable(str(selected))

        self.assertTrue(result["success"], result)
        self.assertEqual(result["executable"], os.path.abspath(selected))
        self.assertNotEqual(result["executable"], os.path.realpath(selected))

    def test_missing_interpreter_is_rejected(self):
        result = inspect_python_executable("/tmp/xedu-python-does-not-exist")

        self.assertFalse(result["success"])
        self.assertIn("不存在", result["message"])

    @patch("utils.python_runtime.subprocess.run")
    def test_python_3_7_is_rejected(self, run_mock):
        run_mock.return_value.returncode = 0
        run_mock.return_value.stdout = "Python 3.7.17"
        run_mock.return_value.stderr = ""
        with patch("utils.python_runtime.Path.is_file", return_value=True), patch(
            "utils.python_runtime.os.access", return_value=True
        ):
            result = inspect_python_executable("/tmp/python3.7")

        self.assertFalse(result["success"])
        self.assertIn("至少需要 Python 3.8.0", result["message"])

    @patch("utils.python_runtime.subprocess.run")
    def test_python_3_8_is_accepted(self, run_mock):
        run_mock.return_value.returncode = 0
        run_mock.return_value.stdout = "Python 3.8.20"
        run_mock.return_value.stderr = ""
        with patch("utils.python_runtime.Path.is_file", return_value=True), patch(
            "utils.python_runtime.os.access", return_value=True
        ):
            result = inspect_python_executable("/tmp/python3.8")

        self.assertTrue(result["success"], result)

    def test_environment_probe_runs_in_selected_interpreter(self):
        version_result = type("Completed", (), {"returncode": 0, "stdout": "Python 3.12.8", "stderr": ""})()
        probe_result = type(
            "Completed",
            (),
            {
                "returncode": 0,
                "stdout": '__XEDU_ENVIRONMENT__={"python_version":"3.12.8","python_executable":"/tmp/selected-python","site_packages":"/tmp/site-packages","pip_available":true,"pip_version":"24.3.1","pip_error":"","ensurepip_available":true,"xedu_version":"2.0.0","jupyterlab_version":"4.4.0","jupyter_notebook_version":null,"ipykernel_version":"6.29.3","xedu_runtime_ok":true,"xedu_runtime_message":"XEduHub 支持 3 项任务。"}\n',
                "stderr": "",
            },
        )()
        with patch("utils.python_runtime.Path.is_file", return_value=True), patch(
            "utils.python_runtime.os.access", return_value=True
        ), patch("utils.python_runtime.subprocess.run", side_effect=[version_result, probe_result]) as run_mock:
            result = inspect_python_environment("/tmp/selected-python")

        self.assertTrue(result["success"], result)
        self.assertTrue(result["xedu_version_ok"])
        self.assertTrue(result["xedu_runtime_ok"])
        self.assertTrue(result["pip_available"])
        self.assertEqual(result["pip_version"], "24.3.1")
        self.assertEqual(run_mock.call_args_list[1].args[0][0], os.path.abspath("/tmp/selected-python"))
        self.assertIn("_XEDU_ENVIRONMENT_", run_mock.call_args_list[1].args[0][2])

    def test_pipless_environment_keeps_the_actual_probe_error(self):
        version_result = type("Completed", (), {"returncode": 0, "stdout": "Python 3.12.8", "stderr": ""})()
        probe_result = type(
            "Completed",
            (),
            {
                "returncode": 0,
                "stdout": '__XEDU_ENVIRONMENT__={"python_version":"3.12.8","python_executable":"C:/Python312/python.exe","site_packages":"C:/Python312/Lib/site-packages","pip_available":false,"pip_version":null,"pip_error":"No module named pip","ensurepip_available":false,"xedu_version":null,"jupyterlab_version":null,"jupyter_notebook_version":null,"ipykernel_version":null,"xedu_runtime_ok":false,"xedu_runtime_message":"No module named XEdu"}\n',
                "stderr": "",
            },
        )()
        with patch("utils.python_runtime.Path.is_file", return_value=True), patch(
            "utils.python_runtime.os.access", return_value=True
        ), patch("utils.python_runtime.subprocess.run", side_effect=[version_result, probe_result]):
            result = inspect_python_environment("C:/Python312/python.exe")

        self.assertFalse(result["pip_available"])
        self.assertFalse(result["ensurepip_available"])
        self.assertEqual(result["pip_error"], "No module named pip")

    def test_pipless_probe_accepts_a_working_sibling_launcher(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            environment_dir = Path(temp_dir)
            executable = environment_dir / "python.exe"
            sibling_pip = environment_dir / "Scripts" / "pip.exe"
            executable.touch()
            sibling_pip.parent.mkdir()
            sibling_pip.touch()
            version_result = type("Completed", (), {"returncode": 0, "stdout": "Python 3.12.8", "stderr": ""})()
            probe_result = type(
                "Completed",
                (),
                {
                    "returncode": 0,
                    "stdout": '__XEDU_ENVIRONMENT__={"python_version":"3.12.8","python_executable":"C:/Python312/python.exe","site_packages":"C:/Python312/Lib/site-packages","pip_available":false,"pip_version":null,"pip_error":"No module named pip","ensurepip_available":false,"xedu_version":null,"jupyterlab_version":null,"ipykernel_version":null,"xedu_runtime_ok":false,"xedu_runtime_message":"No module named XEdu"}\n',
                    "stderr": "",
                },
            )()
            with patch(
                "utils.python_runtime.os.access",
                return_value=True,
            ), patch(
                "utils.python_runtime.subprocess.run",
                side_effect=[version_result, probe_result],
            ):
                result = inspect_python_environment(str(executable))

        self.assertTrue(result["success"], result)
        self.assertFalse(result["pip_available"])
        self.assertTrue(result["pip_launcher_available"])

    def test_ensurepip_success_is_reprobed_before_pip_is_accepted(self):
        missing = type("Completed", (), {"returncode": 1, "stdout": "", "stderr": "No module named pip"})()
        bootstrapped = type("Completed", (), {"returncode": 0, "stdout": "installed pip", "stderr": ""})()
        still_missing = type("Completed", (), {"returncode": 1, "stdout": "", "stderr": "pip remains unavailable"})()

        with patch(
            "utils.python_runtime.subprocess.run",
            side_effect=[missing, bootstrapped, still_missing],
        ) as run_mock:
            result = _ensure_target_pip("C:/Python312/python.exe")

        self.assertFalse(result["success"])
        self.assertEqual(result["error_code"], "pip_unavailable")
        self.assertIn("pip remains unavailable", result["message"])
        self.assertEqual(run_mock.call_count, 3)

    def test_ensurepip_recovers_a_pipless_standard_python(self):
        missing = type("Completed", (), {"returncode": 1, "stdout": "", "stderr": "No module named pip"})()
        bootstrapped = type("Completed", (), {"returncode": 0, "stdout": "installed pip", "stderr": ""})()
        ready = type("Completed", (), {"returncode": 0, "stdout": "pip 24.3.1", "stderr": ""})()

        with patch(
            "utils.python_runtime.subprocess.run",
            side_effect=[missing, bootstrapped, ready],
        ):
            result = _ensure_target_pip("C:/Python312/python.exe")

        self.assertIsNone(result)

    def test_windows_sibling_pip_launcher_is_used_before_ensurepip(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            environment_dir = Path(temp_dir)
            executable = environment_dir / "python.exe"
            sibling_pip = environment_dir / "Scripts" / "pip.exe"
            executable.touch()
            sibling_pip.parent.mkdir()
            sibling_pip.touch()
            missing = type("Completed", (), {"returncode": 1, "stdout": "", "stderr": "No module named pip"})()
            ready = type("Completed", (), {"returncode": 0, "stdout": "pip 24.3.1", "stderr": ""})()

            with patch(
                "utils.python_runtime.subprocess.run",
                side_effect=[missing, ready],
            ) as run_mock:
                result = _ensure_target_pip(str(executable))

        self.assertIsNone(result)
        self.assertEqual(run_mock.call_args_list[1].args[0], [str(sibling_pip), "--version"])

    def test_repair_uses_sibling_pip_launcher_for_install(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            environment_dir = Path(temp_dir)
            executable = environment_dir / "python.exe"
            sibling_pip = environment_dir / "Scripts" / "pip.exe"
            executable.touch()
            sibling_pip.parent.mkdir()
            sibling_pip.touch()
            before = {
                "success": True,
                "python_version": "3.12.8",
                "xedu_version": "2.1.0",
                "jupyterlab_version": None,
                "ipykernel_version": None,
                "xedu_runtime_ok": True,
                "virtual_environment": True,
                "user_site_enabled": False,
                "externally_managed": False,
            }
            after = {**before, "jupyterlab_version": "4.5.0", "ipykernel_version": "6.29.3"}
            missing = type("Completed", (), {"returncode": 1, "stdout": "", "stderr": "No module named pip"})()
            ready = type("Completed", (), {"returncode": 0, "stdout": "pip 24.3.1", "stderr": ""})()
            installed = type("Completed", (), {"returncode": 0, "stdout": "installed", "stderr": ""})()

            with patch(
                "utils.python_runtime.inspect_python_environment",
                side_effect=[before, after],
            ), patch(
                "utils.python_runtime.subprocess.run",
                side_effect=[missing, ready, missing, ready, installed],
            ) as run_mock:
                result = repair_xedu_python_environment(str(executable), use_mirror=False)

        self.assertTrue(result["success"], result)
        self.assertEqual(
            run_mock.call_args_list[-1].args[0],
            [
                str(sibling_pip),
                "install",
                "--disable-pip-version-check",
                "--no-input",
                "jupyterlab",
                "ipykernel",
                "jupyterlab-language-pack-zh-CN",
            ],
        )

    def test_resolve_pip_command_prefers_python_module_when_available(self):
        ready = type("Completed", (), {"returncode": 0, "stdout": "pip 24.3.1", "stderr": ""})()
        with patch("utils.python_runtime.subprocess.run", return_value=ready):
            result = resolve_pip_command("/tmp/selected-python")

        self.assertEqual(result, ["/tmp/selected-python", "-m", "pip"])

    def test_jupyter_install_falls_back_to_pypi_after_mirror_failure(self):
        pip_ready = type("Completed", (), {"returncode": 0, "stdout": "pip 24.3.1", "stderr": ""})()
        failed = type("Completed", (), {"returncode": 1, "stdout": "", "stderr": "mirror 403"})()
        succeeded = type("Completed", (), {"returncode": 0, "stdout": "installed", "stderr": ""})()
        with patch(
            "utils.python_runtime.subprocess.run",
            side_effect=[pip_ready, failed, succeeded],
        ) as run_mock:
            result = _install_jupyter_packages(
                "/tmp/selected-python",
                ["jupyterlab"],
                use_mirror=True,
                environment={"virtual_environment": True},
            )

        self.assertTrue(result["success"], result)
        self.assertEqual(run_mock.call_count, 3)
        self.assertIn("https://pypi.tuna.tsinghua.edu.cn/simple", run_mock.call_args_list[-2].args[0])
        self.assertIn("https://pypi.org/simple", run_mock.call_args_list[-1].args[0])

    def test_xedu_install_falls_back_to_pypi_after_mirror_failure(self):
        pip_ready = type("Completed", (), {"returncode": 0, "stdout": "pip 24.3.1", "stderr": ""})()
        failed = type("Completed", (), {"returncode": 1, "stdout": "", "stderr": "package 404"})()
        succeeded = type("Completed", (), {"returncode": 0, "stdout": "installed", "stderr": ""})()
        with patch(
            "utils.python_runtime.subprocess.run",
            side_effect=[pip_ready, failed, succeeded],
        ) as run_mock:
            result = _install_xedu_package(
                "/tmp/selected-python",
                use_mirror=True,
                environment={"virtual_environment": True},
            )

        self.assertTrue(result["success"], result)
        self.assertIn("xedu-python==2.0.0", result["installed_packages"])
        self.assertIn("https://pypi.org/simple", run_mock.call_args_list[-1].args[0])

    def test_newer_xedu_version_meets_the_minimum_requirement(self):
        version_result = type("Completed", (), {"returncode": 0, "stdout": "Python 3.12.8", "stderr": ""})()
        probe_result = type(
            "Completed",
            (),
            {
                "returncode": 0,
                "stdout": '__XEDU_ENVIRONMENT__={"python_version":"3.12.8","python_executable":"/tmp/selected-python","site_packages":"/tmp/site-packages","xedu_version":"2.1.0","jupyterlab_version":"4.5.0","jupyter_notebook_version":"7.5.0","ipykernel_version":"6.29.3","xedu_runtime_ok":true,"xedu_runtime_message":"XEduHub 支持 33 项任务。"}\n',
                "stderr": "",
            },
        )
        with patch("utils.python_runtime.Path.is_file", return_value=True), patch(
            "utils.python_runtime.os.access", return_value=True
        ), patch("utils.python_runtime.subprocess.run", side_effect=[version_result, probe_result]):
            result = inspect_python_environment("/tmp/selected-python")

        self.assertTrue(result["xedu_version_ok"])
        self.assertTrue(result["xedu_runtime_ok"])

    def test_missing_xedu_package_is_reported_as_repairable(self):
        version_result = type("Completed", (), {"returncode": 0, "stdout": "Python 3.12.8", "stderr": ""})()
        probe_result = type(
            "Completed",
            (),
            {
                "returncode": 0,
                "stdout": '__XEDU_ENVIRONMENT__={"python_version":"3.12.8","python_executable":"/tmp/selected-python","site_packages":"/tmp/site-packages","xedu_version":null,"jupyterlab_version":null,"jupyter_notebook_version":null,"ipykernel_version":null,"xedu_runtime_ok":false,"xedu_runtime_message":"XEduHub 运行探针失败: No module named \'XEdu\'"}\n',
                "stderr": "",
            },
        )()
        with patch("utils.python_runtime.Path.is_file", return_value=True), patch(
            "utils.python_runtime.os.access", return_value=True
        ), patch("utils.python_runtime.subprocess.run", side_effect=[version_result, probe_result]):
            result = inspect_python_environment("/tmp/selected-python")

        self.assertFalse(result["xedu_version_ok"])
        self.assertTrue(result["xedu_repair_available"])

    def test_repair_rejects_python_without_ssl_before_running_pip(self):
        environment = {
            "success": True,
            "python_version": "3.12.8",
            "ssl_available": False,
            "ssl_error": "ImportError: DLL load failed while importing _ssl",
            "xedu_version": None,
            "jupyterlab_version": None,
            "ipykernel_version": None,
            "xedu_runtime_ok": False,
        }
        with patch(
            "utils.python_runtime.inspect_python_environment",
            return_value=environment,
        ), patch("utils.python_runtime.subprocess.run") as run_mock:
            result = repair_xedu_python_environment("C:/XEdu/env/python.exe")

        self.assertFalse(result["success"])
        self.assertEqual(result["error_code"], "ssl_unavailable")
        self.assertIn("缺少 SSL", result["message"])
        self.assertIn("不是 xedu-python 版本问题", result["message"])
        run_mock.assert_not_called()

    def test_newer_xedu_version_can_use_the_compatibility_repair(self):
        before = {"success": True, "xedu_version": "2.1.0", "site_packages": "/tmp/site-packages", "jupyterlab_version": "4.5.0", "ipykernel_version": "6.29.3", "xedu_runtime_ok": False}
        after = {"success": True, "xedu_version": "2.1.0", "site_packages": "/tmp/site-packages", "jupyterlab_version": "4.5.0", "ipykernel_version": "6.29.3", "xedu_runtime_ok": True}
        with patch("utils.python_runtime.inspect_python_environment", side_effect=[before, after]), patch(
            "utils.python_runtime.patch_xedu_metadata",
            return_value={"success": True, "changed": True, "message": "patched"},
        ):
            result = repair_xedu_python_environment("/tmp/selected-python")

        self.assertTrue(result["success"], result)
        self.assertTrue(result["runtime"]["xedu_runtime_ok"])

    def test_xedu_version_below_minimum_is_upgraded_during_repair(self):
        before = {
            "success": True,
            "python_version": "3.12.8",
            "xedu_version": "1.9.0",
            "site_packages": "/tmp/site-packages",
            "jupyterlab_version": "4.5.0",
            "ipykernel_version": "6.29.3",
            "xedu_runtime_ok": False,
            "virtual_environment": True,
        }
        after = {**before, "xedu_version": "2.0.0", "xedu_runtime_ok": True}
        completed = type("Completed", (), {"returncode": 0, "stdout": "installed", "stderr": ""})()

        with patch(
            "utils.python_runtime.inspect_python_environment",
            side_effect=[before, after],
        ), patch(
            "utils.python_runtime.subprocess.run",
            return_value=completed,
        ) as run_mock:
            result = repair_xedu_python_environment("/tmp/selected-python", use_mirror=False)

        self.assertTrue(result["success"], result)
        self.assertEqual(result["runtime"]["xedu_version"], "2.0.0")
        self.assertEqual(result["installed_packages"], ["xedu-python==2.0.0"])
        self.assertIn("--upgrade", run_mock.call_args_list[-1].args[0])

    def test_repair_requires_a_passing_xeduhub_probe_after_metadata_change(self):
        before = {"success": True, "xedu_version": "2.0.0", "site_packages": "/tmp/site-packages", "jupyterlab_version": "4.5.0", "ipykernel_version": "6.29.3", "xedu_runtime_ok": False}
        after = {"success": True, "xedu_version": "2.0.0", "site_packages": "/tmp/site-packages", "jupyterlab_version": "4.5.0", "ipykernel_version": "6.29.3", "xedu_runtime_ok": True}
        with patch("utils.python_runtime.inspect_python_environment", side_effect=[before, after]), patch(
            "utils.python_runtime.patch_xedu_metadata",
            return_value={"success": True, "changed": True, "message": "patched"},
        ):
            result = repair_xedu_python_environment("/tmp/selected-python")

        self.assertTrue(result["success"], result)
        self.assertTrue(result["runtime"]["xedu_runtime_ok"])

    def test_repair_installs_missing_jupyterlab_and_ipykernel(self):
        before = {
            "success": True,
            "xedu_version": "2.1.0",
            "site_packages": "/tmp/site-packages",
            "jupyterlab_version": None,
            "ipykernel_version": None,
            "xedu_runtime_ok": True,
        }
        after = {
            **before,
            "jupyterlab_version": "4.5.0",
            "ipykernel_version": "6.29.3",
        }
        completed = type("Completed", (), {"returncode": 0, "stdout": "installed", "stderr": ""})()

        with patch("utils.python_runtime.inspect_python_environment", side_effect=[before, after]), patch(
            "utils.python_runtime.subprocess.run", return_value=completed
        ) as run_mock:
            result = repair_xedu_python_environment("/tmp/selected-python", use_mirror=False)

        self.assertTrue(result["success"], result)
        self.assertTrue(result["changed"])
        self.assertEqual(
            result["installed_packages"],
            ["jupyterlab", "ipykernel", "jupyterlab-language-pack-zh-CN"],
        )
        self.assertEqual(
            run_mock.call_args.args[0],
            [
                "/tmp/selected-python",
                "-m",
                "pip",
                "install",
                "--disable-pip-version-check",
                "--no-input",
                "jupyterlab",
                "ipykernel",
                "jupyterlab-language-pack-zh-CN",
            ],
        )

    def test_repair_installs_missing_simplified_chinese_language_pack(self):
        before = {
            "success": True,
            "python_version": "3.12.8",
            "ssl_available": True,
            "pip_available": True,
            "xedu_version": "2.0.0",
            "site_packages": "/tmp/site-packages",
            "jupyterlab_version": "4.5.0",
            "jupyterlab_language_pack_zh_cn_version": None,
            "ipykernel_version": "6.29.3",
            "xedu_runtime_ok": True,
        }
        after = {
            **before,
            "jupyterlab_language_pack_zh_cn_version": "4.5.post3",
        }
        completed = type("Completed", (), {"returncode": 0, "stdout": "installed", "stderr": ""})()

        with patch("utils.python_runtime.inspect_python_environment", side_effect=[before, after]), patch(
            "utils.python_runtime.subprocess.run", return_value=completed
        ) as run_mock:
            result = repair_xedu_python_environment("/tmp/selected-python", use_mirror=False)

        self.assertTrue(result["success"], result)
        self.assertEqual(
            result["installed_packages"],
            ["jupyterlab-language-pack-zh-CN>=4.5,<4.6"],
        )
        self.assertEqual(
            run_mock.call_args.args[0][-1],
            "jupyterlab-language-pack-zh-CN>=4.5,<4.6",
        )

    def test_repair_installs_xedu_without_flask_when_xedu_is_missing(self):
        before = {
            "success": True,
            "python_version": "3.12.8",
            "xedu_version": None,
            "site_packages": "/tmp/site-packages",
            "jupyterlab_version": "4.5.0",
            "ipykernel_version": "6.29.3",
            "xedu_runtime_ok": False,
            "virtual_environment": False,
            "user_site_enabled": True,
            "externally_managed": True,
        }
        after = {
            **before,
            "xedu_version": "2.0.0",
            "xedu_runtime_ok": True,
        }
        completed = type("Completed", (), {"returncode": 0, "stdout": "installed", "stderr": ""})()

        with patch(
            "utils.python_runtime.inspect_python_environment",
            side_effect=[before, after],
        ), patch(
            "utils.python_runtime.subprocess.run",
            return_value=completed,
        ) as run_mock:
            result = repair_xedu_python_environment("/tmp/selected-python", use_mirror=False)

        self.assertTrue(result["success"], result)
        self.assertTrue(result["changed"])
        self.assertEqual(result["installed_packages"], ["xedu-python==2.0.0"])
        self.assertEqual(
            run_mock.call_args_list[-1].args[0],
            [
                "/tmp/selected-python",
                "-m",
                "pip",
                "install",
                "--disable-pip-version-check",
                "--no-input",
                "--upgrade",
                "--no-deps",
                "--user",
                "--break-system-packages",
                "xedu-python==2.0.0",
            ],
        )

    def test_repair_keeps_jupyter_usable_when_optional_xedu_install_fails(self):
        before = {
            "success": True,
            "python_version": "3.12.8",
            "ssl_available": True,
            "pip_available": True,
            "xedu_version": None,
            "site_packages": "/tmp/site-packages",
            "jupyterlab_version": None,
            "ipykernel_version": None,
            "xedu_runtime_ok": False,
            "xedu_runtime_message": "No module named 'XEdu'",
        }
        jupyter_ready = {
            **before,
            "jupyterlab_version": "4.5.0",
            "ipykernel_version": "6.29.3",
        }

        with patch(
            "utils.python_runtime.inspect_python_environment",
            side_effect=[before, jupyter_ready],
        ), patch(
            "utils.python_runtime._ensure_target_pip",
            return_value=None,
        ), patch(
            "utils.python_runtime._install_jupyter_packages",
            return_value={
                "success": True,
                "message": "JupyterLab 已安装",
                "installed_packages": [
                    "jupyterlab",
                    "ipykernel",
                    "jupyterlab-language-pack-zh-CN",
                ],
            },
        ) as install_jupyter, patch(
            "utils.python_runtime._install_xedu_package",
            return_value={"success": False, "message": "xedu-python 安装失败: package unavailable"},
        ) as install_xedu:
            result = repair_xedu_python_environment("/tmp/selected-python", use_mirror=False)

        self.assertTrue(result["success"], result)
        self.assertTrue(result["changed"])
        self.assertEqual(result["runtime"], jupyter_ready)
        self.assertEqual(
            result["installed_packages"],
            ["jupyterlab", "ipykernel", "jupyterlab-language-pack-zh-CN"],
        )
        self.assertIn("xedu-python 安装失败", " ".join(result["warnings"]))
        install_jupyter.assert_called_once()
        install_xedu.assert_called_once()

    def test_repair_installs_xedu_runtime_dependencies_without_flask(self):
        before = {
            "success": True,
            "python_version": "3.8.20",
            "xedu_version": "2.0.0",
            "site_packages": "/tmp/site-packages",
            "jupyterlab_version": "4.2.5",
            "ipykernel_version": "6.29.5",
            "xedu_runtime_ok": False,
            "xedu_runtime_message": "XEduHub 运行探针失败: No module named 'cv2'",
        }
        after_dependencies = {
            **before,
            "xedu_runtime_ok": True,
        }
        completed = type("Completed", (), {"returncode": 0, "stdout": "installed", "stderr": ""})()

        with patch(
            "utils.python_runtime.inspect_python_environment",
            side_effect=[before, after_dependencies, after_dependencies],
        ), patch(
            "utils.python_runtime.subprocess.run",
            return_value=completed,
        ) as run_mock:
            result = repair_xedu_python_environment("/tmp/selected-python", use_mirror=False)

        self.assertTrue(result["success"], result)
        self.assertTrue(result["changed"])
        self.assertIn("numpy==1.24.4", result["installed_packages"])
        self.assertNotIn("Flask", result["installed_packages"])
        self.assertNotIn("flask", " ".join(run_mock.call_args.args[0]).lower())

    def test_python_3_8_repair_uses_compatible_jupyter_specs(self):
        specs = _jupyter_repair_specs({"python_version": "3.8.20"})

        self.assertEqual(
            specs,
            ["jupyterlab<4.3", "ipykernel<6.30", "jupyterlab-language-pack-zh-CN<4.3"],
        )

    def test_newer_python_repair_keeps_unpinned_jupyter_specs(self):
        self.assertEqual(
            _jupyter_repair_specs({"python_version": "3.12.8"}),
            ["jupyterlab", "ipykernel", "jupyterlab-language-pack-zh-CN"],
        )

    def test_repair_matches_language_pack_to_existing_jupyterlab_minor_version(self):
        self.assertEqual(
            _jupyter_repair_specs(
                {"python_version": "3.12.8", "jupyterlab_version": "4.4.7"}
            ),
            [
                "jupyterlab",
                "ipykernel",
                "jupyterlab-language-pack-zh-CN>=4.4,<4.5",
            ],
        )

    def test_python_3_8_repair_uses_installable_xedu_runtime_specs(self):
        specs = _xedu_runtime_repair_specs({"python_version": "3.8.20"})

        self.assertIn("numpy==1.24.4", specs)
        self.assertIn("matplotlib==3.7.5", specs)
        self.assertIn("onnxruntime==1.18.1", specs)
        self.assertNotIn("numpy", specs)
        self.assertNotIn("Flask", specs)

    def test_externally_managed_base_python_uses_user_install_override(self):
        self.assertEqual(
            _pip_install_options(
                {
                    "virtual_environment": False,
                    "user_site_enabled": True,
                    "externally_managed": True,
                }
            ),
            ["--user", "--break-system-packages"],
        )

    def test_virtualenv_does_not_receive_base_interpreter_install_flags(self):
        self.assertEqual(
            _pip_install_options(
                {
                    "virtual_environment": True,
                    "user_site_enabled": True,
                    "externally_managed": True,
                }
            ),
            ["--break-system-packages"],
        )

    def test_conda_base_environment_installs_into_the_selected_prefix(self):
        self.assertEqual(
            _pip_install_options(
                {
                    "virtual_environment": False,
                    "conda_environment": True,
                    "user_site_enabled": True,
                    "externally_managed": False,
                }
            ),
            [],
        )

    def test_newer_python_repair_keeps_xedu_runtime_package_names(self):
        self.assertEqual(
            _xedu_runtime_repair_specs({"python_version": "3.12.8"}),
            [
                "numpy",
                "matplotlib",
                "opencv-python",
                "onnx",
                "onnxruntime",
                "Pillow",
                "ftfy",
                "regex",
                "tqdm",
                "requests",
                "soundfile",
                "six",
            ],
        )

    def test_selected_interpreter_is_persisted_when_existing_config_is_empty(self):
        with tempfile.TemporaryDirectory() as temp_dir, patch.dict(
            "os.environ", {"XEDU_PYTHON_EXECUTABLE": sys.executable}, clear=False
        ):
            config_service = ConfigService(Path(temp_dir))
            config_service.config_file.write_text(
                json.dumps({"version": "2.0.0", "jupyter": {"python_executable": ""}, "ui": {}, "ai": {}}),
                encoding="utf-8",
            )

            config_service.load_config()
            persisted = json.loads(config_service.config_file.read_text(encoding="utf-8"))

        self.assertEqual(persisted["jupyter"]["python_executable"], str(Path(sys.executable).resolve()))


class CondaEnvironmentAugmentationTestCase(unittest.TestCase):
    """A directly-launched Conda/XEdu interpreter must see its activation PATH."""

    def _make_conda_env(self) -> tuple[Path, Path]:
        root = Path(tempfile.mkdtemp())
        prefix = root / "env"
        (prefix / "conda-meta").mkdir(parents=True)
        (prefix / "conda-meta" / "history").write_text("", encoding="utf-8")
        for sub in ("Library/mingw-w64/bin", "Library/usr/bin", "Library/bin", "Scripts", "bin"):
            (prefix / sub).mkdir(parents=True, exist_ok=True)
        executable = prefix / ("python.exe" if os.name == "nt" else "bin/python")
        executable.parent.mkdir(parents=True, exist_ok=True)
        executable.write_text("", encoding="utf-8")
        return prefix, executable

    def test_detects_conda_prefix_from_marker(self):
        prefix, executable = self._make_conda_env()
        self.assertEqual(_conda_prefix_for_executable(str(executable)), prefix)

    def test_non_conda_interpreter_is_left_untouched(self):
        root = Path(tempfile.mkdtemp())
        executable = root / "python3"
        executable.write_text("", encoding="utf-8")
        env = augment_conda_environment(str(executable), {"PATH": "/usr/bin"})
        self.assertNotIn("CONDA_PREFIX", env)
        self.assertEqual(env["PATH"], "/usr/bin")

    def test_augmented_path_exports_prefix_and_prepends_entries(self):
        prefix, executable = self._make_conda_env()
        env = augment_conda_environment(str(executable), {"PATH": "/existing"})
        self.assertEqual(env["CONDA_PREFIX"], str(prefix))
        parts = env["PATH"].split(os.pathsep)
        # The activation entries are prepended ahead of the inherited PATH.
        dll_dir = str(prefix / ("Library" / Path("bin") if os.name == "nt" else Path("bin")))
        self.assertIn(dll_dir, parts)
        self.assertLess(parts.index(dll_dir), parts.index("/existing"))

    def test_augmented_path_preserves_activate_bat_entry_order(self):
        prefix, executable = self._make_conda_env()
        activation_entries = [
            str(prefix),
            str(prefix / "Library" / "mingw-w64" / "bin"),
            str(prefix / "Library" / "usr" / "bin"),
            str(prefix / "Library" / "bin"),
            str(prefix / "Scripts"),
        ]
        with patch(
            "utils.python_runtime._conda_activation_path_entries",
            return_value=activation_entries,
        ):
            env = augment_conda_environment(str(executable), {"PATH": "/existing"})

        self.assertEqual(env["PATH"].split(os.pathsep), [*activation_entries, "/existing"])

    @unittest.skipIf(os.name != "nt", "Library/bin DLL layout only applies on Windows")
    def test_windows_layout_places_library_bin_before_scripts(self):
        prefix, executable = self._make_conda_env()
        parts = augment_conda_environment(str(executable), {"PATH": ""})["PATH"].split(os.pathsep)
        self.assertLess(
            parts.index(str(prefix / "Library" / "bin")),
            parts.index(str(prefix / "Scripts")),
        )


if __name__ == "__main__":
    unittest.main()
