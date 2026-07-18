import sys
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from utils.python_runtime import inspect_python_executable  # noqa: E402
from services.config_service import ConfigService  # noqa: E402


class PythonRuntimeTestCase(unittest.TestCase):
    def test_current_interpreter_is_accepted(self):
        result = inspect_python_executable(sys.executable)

        self.assertTrue(result["success"], result)
        self.assertEqual(result["executable"], str(Path(sys.executable).resolve()))

    def test_missing_interpreter_is_rejected(self):
        result = inspect_python_executable("/tmp/xedu-python-does-not-exist")

        self.assertFalse(result["success"])
        self.assertIn("不存在", result["message"])

    @patch("utils.python_runtime.subprocess.run")
    def test_old_interpreter_is_rejected(self, run_mock):
        run_mock.return_value.returncode = 0
        run_mock.return_value.stdout = "Python 3.9.18"
        run_mock.return_value.stderr = ""
        with patch("utils.python_runtime.Path.is_file", return_value=True), patch(
            "utils.python_runtime.os.access", return_value=True
        ):
            result = inspect_python_executable("/tmp/python3.9")

        self.assertFalse(result["success"])
        self.assertIn("至少需要 Python 3.10.0", result["message"])

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
