import os
import subprocess
import sys
import unittest
from pathlib import Path
from unittest.mock import patch


BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from utils import python_bootstrap


class PythonBootstrapTestCase(unittest.TestCase):
    def test_missing_backend_packages_are_repaired_before_flask_import(self):
        with patch(
            "utils.python_bootstrap.missing_backend_packages",
            side_effect=[["Flask", "Pillow"], []],
        ), patch(
            "utils.python_bootstrap._ensure_pip",
            return_value=(True, ""),
        ), patch(
            "utils.python_bootstrap._run",
            return_value=type("Completed", (), {"returncode": 0, "stdout": "", "stderr": ""})(),
        ) as run_mock:
            result = python_bootstrap.ensure_backend_dependencies()

        self.assertTrue(result["success"], result)
        self.assertTrue(result["changed"])
        command = run_mock.call_args.args[0]
        self.assertEqual(command[:4], [sys.executable, "-m", "pip", "install"])
        self.assertIn("Flask==", " ".join(command))
        self.assertIn("Pillow==", " ".join(command))

    def test_failed_mirror_install_falls_back_to_pypi(self):
        failed = type("Completed", (), {"returncode": 1, "stdout": "", "stderr": "mirror 403"})()
        succeeded = type("Completed", (), {"returncode": 0, "stdout": "", "stderr": ""})()
        with patch(
            "utils.python_bootstrap.missing_backend_packages",
            side_effect=[["Flask"], []],
        ), patch("utils.python_bootstrap._ensure_pip", return_value=(True, "")), patch(
            "utils.python_bootstrap._run", side_effect=[failed, succeeded]
        ) as run_mock:
            result = python_bootstrap.ensure_backend_dependencies()

        self.assertTrue(result["success"], result)
        self.assertEqual(run_mock.call_count, 2)
        self.assertIn("https://pypi.org/simple", run_mock.call_args.args[0])

    def test_ready_backend_does_not_run_pip(self):
        with patch("utils.python_bootstrap.missing_backend_packages", return_value=[]), patch(
            "utils.python_bootstrap._run"
        ) as run_mock:
            result = python_bootstrap.ensure_backend_dependencies()

        self.assertEqual(result, {"success": True, "changed": False, "missing": []})
        run_mock.assert_not_called()

    def test_standalone_xedu_repair_does_not_require_flask(self):
        with patch(
            "utils.python_bootstrap._ensure_pip",
            return_value=(True, ""),
        ), patch(
            "utils.python_bootstrap.missing_runtime_support_packages",
            side_effect=AssertionError("standalone repair must not inspect Flask support packages"),
        ), patch(
            "utils.python_runtime.repair_xedu_python_environment",
            return_value={"success": True, "changed": True, "message": "已修复"},
        ) as repair_mock, patch.object(
            python_bootstrap.sys, "executable", "/tmp/selected-python"
        ):
            result = python_bootstrap.repair_xedu_environment_standalone()

        self.assertTrue(result["success"], result)
        repair_mock.assert_called_once_with("/tmp/selected-python", use_mirror=True)

    def test_standalone_repair_does_not_install_flask_when_flask_is_missing(self):
        with patch(
            "utils.python_bootstrap._ensure_pip",
            return_value=(True, ""),
        ), patch(
            "utils.python_bootstrap.missing_backend_packages",
            return_value=["Flask"],
        ), patch(
            "utils.python_runtime.repair_xedu_python_environment",
            return_value={"success": True, "changed": False, "message": "环境已就绪"},
        ), patch("utils.python_bootstrap._install_missing") as install_mock:
            result = python_bootstrap.repair_xedu_environment_standalone()

        self.assertTrue(result["success"], result)
        install_mock.assert_not_called()

    def test_runtime_support_packages_exclude_flask(self):
        with patch(
            "utils.python_bootstrap.importlib.util.find_spec",
            side_effect=lambda module: None if module in {"flask", "requests"} else object(),
        ):
            self.assertEqual(python_bootstrap.missing_runtime_support_packages(), ["requests"])

    def test_python_38_uses_compatible_bootstrap_pins(self):
        with patch.object(python_bootstrap.sys, "version_info", (3, 8, 20)):
            specs = python_bootstrap._bootstrap_specs()

        self.assertIn("Flask==2.3.3", specs)
        self.assertIn("Pillow==10.4.0", specs)
        self.assertNotIn("Flask==3.1.3", specs)

    def test_python_39_does_not_receive_python_310_only_requests(self):
        with patch.object(python_bootstrap.sys, "version_info", (3, 9, 20)):
            specs = python_bootstrap._bootstrap_specs()

        self.assertIn("requests==2.32.3", specs)
        self.assertNotIn("requests==2.33.0", specs)

    def test_standalone_bootstrap_module_does_not_import_flask(self):
        source = (BACKEND_DIR / "utils" / "python_bootstrap.py").read_text(encoding="utf-8")
        self.assertNotIn("from flask", source.lower())
        self.assertNotIn("import flask", source.lower())
        self.assertIn("--repair-xedu", source)

    def test_standalone_repair_dispatches_without_site_packages(self):
        code = (
            "from utils import python_bootstrap as bootstrap; "
            "from utils import python_runtime as runtime; "
            "bootstrap._ensure_pip=lambda:(True, ''); "
            "bootstrap.missing_runtime_support_packages=lambda:[]; "
            "runtime.repair_xedu_python_environment="
            "lambda executable, use_mirror=True: {'success': True, 'changed': False}; "
            "result=bootstrap.repair_xedu_environment_standalone(); "
            "assert result['success'], result; print(result)"
        )
        environment = {**os.environ, "PYTHONPATH": str(BACKEND_DIR)}
        completed = subprocess.run(
            [sys.executable, "-S", "-c", code],
            capture_output=True,
            text=True,
            env=environment,
            timeout=20,
            check=False,
        )

        self.assertEqual(completed.returncode, 0, completed.stderr or completed.stdout)
        self.assertNotIn("no module named 'flask'", completed.stderr.lower())


if __name__ == "__main__":
    unittest.main()
