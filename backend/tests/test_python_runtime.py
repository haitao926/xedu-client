import sys
import json
import tempfile
import unittest
import os
from pathlib import Path
from unittest.mock import patch


BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from utils.python_runtime import (  # noqa: E402
    _jupyter_repair_specs,
    _pip_install_options,
    _xedu_runtime_repair_specs,
    inspect_python_environment,
    inspect_python_executable,
    repair_xedu_python_environment,
)
from services.config_service import ConfigService  # noqa: E402


class PythonRuntimeTestCase(unittest.TestCase):
    def test_current_interpreter_is_accepted(self):
        result = inspect_python_executable(sys.executable)

        self.assertTrue(result["success"], result)
        self.assertEqual(result["executable"], os.path.abspath(sys.executable))

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
                "stdout": '__XEDU_ENVIRONMENT__={"python_version":"3.12.8","python_executable":"/tmp/selected-python","site_packages":"/tmp/site-packages","xedu_version":"2.0.0","jupyterlab_version":"4.4.0","jupyter_notebook_version":null,"ipykernel_version":"6.29.3","xedu_runtime_ok":true,"xedu_runtime_message":"XEduHub 支持 3 项任务。"}\n',
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
        self.assertEqual(run_mock.call_args_list[1].args[0][0], os.path.abspath("/tmp/selected-python"))
        self.assertIn("_XEDU_ENVIRONMENT_", run_mock.call_args_list[1].args[0][2])

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

    def test_xedu_version_below_minimum_is_rejected_for_repair(self):
        before = {"success": True, "xedu_version": "1.9.0", "site_packages": "/tmp/site-packages", "jupyterlab_version": "4.5.0", "ipykernel_version": "6.29.3", "xedu_runtime_ok": False}
        with patch("utils.python_runtime.inspect_python_environment", return_value=before), patch(
            "utils.python_runtime.patch_xedu_metadata"
        ) as patch_metadata:
            result = repair_xedu_python_environment("/tmp/selected-python")

        self.assertFalse(result["success"])
        self.assertIn("xedu-python>=2.0.0", result["message"])
        patch_metadata.assert_not_called()

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
        self.assertEqual(result["installed_packages"], ["jupyterlab", "ipykernel"])
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
            ],
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
                "--no-deps",
                "--user",
                "--break-system-packages",
                "xedu-python==2.0.0",
            ],
        )

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

        self.assertEqual(specs, ["jupyterlab<4.3", "ipykernel<6.30"])

    def test_newer_python_repair_keeps_unpinned_jupyter_specs(self):
        self.assertEqual(
            _jupyter_repair_specs({"python_version": "3.12.8"}),
            ["jupyterlab", "ipykernel"],
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


if __name__ == "__main__":
    unittest.main()
