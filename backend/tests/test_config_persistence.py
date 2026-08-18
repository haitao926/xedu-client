import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from models.config import AppConfig  # noqa: E402
from services.config_service import ConfigService  # noqa: E402


class ConfigPersistenceTestCase(unittest.TestCase):
    def test_unconfirmed_legacy_python_path_migrates_to_electron_runtime(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            config_dir = Path(temp_dir)
            legacy_python = config_dir / "legacy" / "python.exe"
            bundled_python = config_dir / "resources" / "python_env" / "python.exe"
            legacy_python.parent.mkdir(parents=True)
            bundled_python.parent.mkdir(parents=True)
            legacy_python.touch()
            bundled_python.touch()
            (config_dir / "config.json").write_text(
                json.dumps({
                    "version": "2.0.0",
                    "jupyter": {"python_executable": str(legacy_python)},
                    "ui": {},
                    "ai": {},
                }),
                encoding="utf-8",
            )

            with patch.dict(
                "os.environ",
                {"XEDU_PYTHON_EXECUTABLE": str(bundled_python)},
                clear=False,
            ):
                reloaded = ConfigService(config_dir).load_config()

        self.assertEqual(reloaded.jupyter.python_executable, str(bundled_python.resolve()))

    def test_confirmed_external_python_path_survives_reload(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            config_dir = Path(temp_dir)
            external_python = config_dir / "external" / "python.exe"
            bundled_python = config_dir / "resources" / "python_env" / "python.exe"
            external_python.parent.mkdir(parents=True)
            bundled_python.parent.mkdir(parents=True)
            external_python.touch()
            bundled_python.touch()
            (config_dir / "config.json").write_text(
                json.dumps({
                    "version": "2.0.0",
                    "jupyter": {
                        "python_executable": str(external_python),
                        "python_selection_confirmed": True,
                    },
                    "ui": {},
                    "ai": {},
                }),
                encoding="utf-8",
            )

            with patch.dict(
                "os.environ",
                {"XEDU_PYTHON_EXECUTABLE": str(bundled_python)},
                clear=False,
            ):
                reloaded = ConfigService(config_dir).load_config()

        self.assertEqual(reloaded.jupyter.python_executable, str(external_python))
        self.assertTrue(reloaded.jupyter.python_selection_confirmed)

    def test_saved_teacher_code_survives_a_fresh_service_load(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            config_dir = Path(temp_dir)
            config = AppConfig()
            config.ui.classroom_teacher_code = "teacher-code"

            self.assertTrue(ConfigService(config_dir).save_config(config))

            persisted = json.loads((config_dir / "config.json").read_text(encoding="utf-8"))
            reloaded = ConfigService(config_dir).load_config()

        self.assertEqual(persisted["version"], "2.0.0")
        self.assertEqual(reloaded.ui.classroom_teacher_code, "teacher-code")

    def test_unversioned_nested_config_is_not_treated_as_flat_v1_config(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            config_dir = Path(temp_dir)
            (config_dir / "config.json").write_text(
                json.dumps({
                    "jupyter": {"python_executable": sys.executable},
                    "ui": {
                        "classroom_name": "信息技术课堂",
                        "classroom_teacher_code": "teacher-code",
                    },
                    "ai": {"model": "local-model"},
                }),
                encoding="utf-8",
            )

            reloaded = ConfigService(config_dir).load_config()

        self.assertEqual(reloaded.ui.classroom_name, "信息技术课堂")
        self.assertEqual(reloaded.ui.classroom_teacher_code, "teacher-code")
        self.assertEqual(reloaded.ai.model, "local-model")


if __name__ == "__main__":
    unittest.main()
