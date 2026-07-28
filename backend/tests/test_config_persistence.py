import json
import sys
import tempfile
import unittest
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from models.config import AppConfig  # noqa: E402
from services.config_service import ConfigService  # noqa: E402


class ConfigPersistenceTestCase(unittest.TestCase):
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
