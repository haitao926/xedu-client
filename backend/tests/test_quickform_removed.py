import json
import sys
import tempfile
import unittest
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from api.app import create_app  # noqa: E402
from api_test_utils import authorized_test_client  # noqa: E402
from services.gitea_course_scanner import save_course_json, scan_course  # noqa: E402


class QuickFormRemovedTestCase(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.app = create_app(Path(self.temp_dir.name))
        self.app.testing = True
        self.client = authorized_test_client(self.app)

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_quickform_routes_are_not_registered(self):
        for path in (
            "/api/quickform/test",
            "/api/quickform/tasks",
            "/api/quickform/tasks/create",
            "/api/resources/quickform/inject",
        ):
            with self.subTest(path=path):
                response = self.client.post(path, json={})
                self.assertEqual(response.status_code, 404)

    def test_legacy_quickform_config_is_dropped_from_public_config(self):
        legacy_dir = Path(self.temp_dir.name) / "legacy-config"
        legacy_dir.mkdir()
        config_path = legacy_dir / "config.json"
        config_path.write_text(
            json.dumps({"ui": {"quickform": {"enabled": True, "password": "secret"}}}),
            encoding="utf-8",
        )
        legacy_app = create_app(legacy_dir)
        legacy_app.testing = True
        response = authorized_test_client(legacy_app).get("/api/load_config")

        self.assertEqual(response.status_code, 200)
        config = response.get_json()["config"]
        self.assertNotIn("quickform", config.get("ui", {}))
        self.assertNotIn("quickform_password_configured", config.get("secret_status", {}))

    def test_legacy_course_metadata_is_dropped_when_scanned_and_saved(self):
        course_dir = Path(self.temp_dir.name) / "legacy-course"
        course_dir.mkdir()
        course_file = course_dir / "course.json"
        course_file.write_text(json.dumps({
            "id": "legacy-course",
            "title": "旧课程",
            "quickform_defaults": {"enabled": True},
            "sections": [{
                "title": "第一课",
                "experiments": [{"title": "实验", "quickform": {"apiid": "old"}}],
            }],
        }), encoding="utf-8")

        scanned = scan_course(str(course_dir))
        self.assertNotIn("quickform_defaults", scanned.course)
        self.assertNotIn("quickform", scanned.course["sections"][0]["experiments"][0])

        saved = save_course_json(str(course_dir), scanned.course)
        persisted = json.loads(course_file.read_text(encoding="utf-8"))
        self.assertNotIn("quickform_defaults", persisted)
        self.assertNotIn("quickform", persisted["sections"][0]["experiments"][0])
        self.assertNotIn("quickform_defaults", saved.course)


if __name__ == "__main__":
    unittest.main()
