import tempfile
import unittest
import sys
from io import BytesIO
from pathlib import Path
from unittest.mock import patch


BACKEND_DIR = Path(__file__).resolve().parents[1]
import sys
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from api.app import create_app  # noqa: E402
from api_test_utils import authorized_test_client  # noqa: E402


class SystemApiTestCase(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        app = create_app(Path(self.temp_dir.name))
        app.testing = True
        self.client = authorized_test_client(app)

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_select_image_file_route_is_safe_without_electron_bridge(self):
        response = self.client.post("/api/system/select-image-file")
        self.assertEqual(response.status_code, 501)
        data = response.get_json()
        self.assertFalse(data["success"])
        self.assertEqual(data["path"], None)
        self.assertIn("Electron", data["message"])

    def test_import_image_file_saves_uploaded_browser_file(self):
        from PIL import Image

        image_buffer = BytesIO()
        Image.new("RGB", (8, 8), color=(255, 255, 255)).save(image_buffer, format="JPEG")
        image_buffer.seek(0)
        response = self.client.post(
            "/api/system/import-image-file",
            data={"file": (image_buffer, "picked-human.jpg")},
            content_type="multipart/form-data",
        )

        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertTrue(data["success"])
        saved_path = Path(data["path"])
        self.assertTrue(saved_path.exists())
        self.assertEqual(saved_path.suffix, ".jpg")
        self.assertIn("runtime-assets", saved_path.parts)

    def test_import_image_file_rejects_non_image_suffix(self):
        response = self.client.post(
            "/api/system/import-image-file",
            data={"file": (BytesIO(b"not-image"), "notes.txt")},
            content_type="multipart/form-data",
        )

        self.assertEqual(response.status_code, 400)
        data = response.get_json()
        self.assertFalse(data["success"])
        self.assertEqual(data["path"], None)

    def test_import_image_file_rejects_broken_image_content(self):
        response = self.client.post(
            "/api/system/import-image-file",
            data={"file": (BytesIO(b"not-an-image"), "picked-human.jpg")},
            content_type="multipart/form-data",
        )

        self.assertEqual(response.status_code, 400)
        data = response.get_json()
        self.assertFalse(data["success"])
        self.assertEqual(data["path"], None)
        self.assertIn("无法解析", data["message"])

    def test_detect_python_returns_xedu_runtime_status(self):
        with patch("api.app_support._resolve_site_packages") as mock_site_packages, patch(
            "api.app_support._read_xedu_version_from_site_packages"
        ) as mock_xedu_version:
            mock_site_packages.return_value = Path(self.temp_dir.name)
            mock_xedu_version.return_value = "2.0.0"
            response = self.client.get(f"/api/detect_python?python_executable={sys.executable}")

        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertTrue(data["success"])
        self.assertEqual(data["info"]["xedu_version"], "2.0.0")
        self.assertTrue(data["info"]["xedu_version_ok"])

    def test_detect_python_rejects_missing_executable(self):
        response = self.client.get("/api/detect_python?python_executable=/tmp/not-a-python-executable")

        self.assertEqual(response.status_code, 400)
        self.assertFalse(response.get_json()["success"])
        self.assertIn("不存在", response.get_json()["message"])


if __name__ == "__main__":
    unittest.main()
