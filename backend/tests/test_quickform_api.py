import base64
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


BACKEND_DIR = Path(__file__).resolve().parents[1]
import sys
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from api.app import create_app  # noqa: E402


class FakeResponse:
    def __init__(self, status_code=200, data=None):
        self.status_code = status_code
        self._data = data or {}

    def json(self):
        return self._data


class QuickFormApiTestCase(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        app = create_app(Path(self.temp_dir.name))
        app.testing = True
        self.client = app.test_client()

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_save_and_load_quickform_config(self):
        save_resp = self.client.post(
            "/api/save_config",
            json={
                "ui": {
                    "quickform": {
                        "enabled": True,
                        "base_url": "https://quickform.example.com",
                        "username": "teacher1",
                        "password": "secret",
                    }
                }
            },
        )
        self.assertEqual(save_resp.status_code, 200)

        load_resp = self.client.get("/api/load_config")
        data = load_resp.get_json()
        quickform = data["config"]["ui"]["quickform"]
        self.assertTrue(quickform["enabled"])
        self.assertEqual(quickform["base_url"], "https://quickform.example.com")
        self.assertEqual(quickform["username"], "teacher1")

    @patch("services.quickform_service.requests.post")
    def test_quickform_list_tasks_route(self, post_mock):
        self.client.post(
            "/api/save_config",
            json={
                "ui": {
                    "quickform": {
                        "enabled": True,
                        "base_url": "https://quickform.cn",
                        "username": "teacher1",
                        "password": "secret",
                    }
                }
            },
        )
        post_mock.return_value = FakeResponse(
            200,
            {
                "success": True,
                "tasks": [
                    {"apiid": "a1b2", "name": "课堂签到表"},
                ],
            },
        )

        response = self.client.post("/api/quickform/tasks", json={})
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertTrue(data["success"])
        self.assertEqual(data["tasks"][0]["submit_url"], "https://quickform.cn/api/a1b2")
        self.assertEqual(data["tasks"][0]["query_url"], "https://quickform.cn/api/a1b2/all")

    def test_local_preview_route_serves_file(self):
        course_dir = Path(self.temp_dir.name) / "course"
        course_dir.mkdir(parents=True, exist_ok=True)
        html_file = course_dir / "index.html"
        html_file.write_text("<html><body>Hello</body></html>", encoding="utf-8")
        token = base64.urlsafe_b64encode(str(course_dir.resolve()).encode("utf-8")).decode("utf-8").rstrip("=")

        response = self.client.get(f"/api/resources/local-file/{token}/index.html")
        self.assertEqual(response.status_code, 200)
        self.assertIn(b"Hello", response.data)


if __name__ == "__main__":
    unittest.main()
