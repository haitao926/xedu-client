import os
import tempfile
import unittest
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[1]
import sys
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from services.project_service import ProjectService  # noqa: E402


class ProjectServiceTestCase(unittest.TestCase):
    def test_default_templates_dir_uses_writable_data_dir_when_available(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            original_data_dir = os.environ.get("XEDU_DATA_DIR")
            original_templates_dir = os.environ.get("XEDU_PROJECT_TEMPLATES_DIR")
            try:
                os.environ["XEDU_DATA_DIR"] = temp_dir
                os.environ.pop("XEDU_PROJECT_TEMPLATES_DIR", None)

                service = ProjectService()

                self.assertEqual(service.templates_dir, Path(temp_dir) / "data" / "templates")
                self.assertTrue((service.templates_dir / "blank" / "template.json").exists())
            finally:
                if original_data_dir is None:
                    os.environ.pop("XEDU_DATA_DIR", None)
                else:
                    os.environ["XEDU_DATA_DIR"] = original_data_dir
                if original_templates_dir is None:
                    os.environ.pop("XEDU_PROJECT_TEMPLATES_DIR", None)
                else:
                    os.environ["XEDU_PROJECT_TEMPLATES_DIR"] = original_templates_dir


if __name__ == "__main__":
    unittest.main()
