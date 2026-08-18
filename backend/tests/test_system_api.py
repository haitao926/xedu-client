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
        with patch("api.app_support.inspect_python_environment") as environment_probe:
            environment_probe.return_value = {
                "success": True,
                "python_version": "3.12.8",
                "python_executable": sys.executable,
                "ssl_available": False,
                "ssl_version": None,
                "ssl_error": "ImportError: DLL load failed while importing _ssl",
                "xedu_version": "2.0.0",
                "xedu_version_ok": True,
                "xedu_runtime_ok": True,
                "xedu_runtime_message": "XEduHub 支持 3 项任务。",
                "jupyterlab_version": "4.4.0",
                "jupyter_notebook_version": None,
                "xedu_repair_available": False,
            }
            response = self.client.get(f"/api/detect_python?python_executable={sys.executable}")

        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertTrue(data["success"])
        self.assertEqual(data["info"]["xedu_version"], "2.0.0")
        self.assertTrue(data["info"]["xedu_version_ok"])
        self.assertTrue(data["info"]["xedu_runtime_ok"])
        self.assertFalse(data["info"]["ssl_available"])
        self.assertIn("_ssl", data["info"]["ssl_error"])

    def test_detect_python_rejects_missing_executable(self):
        response = self.client.get("/api/detect_python?python_executable=/tmp/not-a-python-executable")

        self.assertEqual(response.status_code, 400)
        self.assertFalse(response.get_json()["success"])
        self.assertIn("不存在", response.get_json()["message"])

    def test_detect_python_rejects_python_3_7_runtime(self):
        with patch(
            "api.routes.jupyter.inspect_python_executable",
            return_value={"success": False, "message": "Python 版本过低: 3.7.17，至少需要 Python 3.8.0"},
        ):
            response = self.client.get("/api/detect_python?python_executable=/tmp/python3.7")

        self.assertEqual(response.status_code, 400)
        self.assertFalse(response.get_json()["success"])
        self.assertIn("至少需要 Python 3.8.0", response.get_json()["message"])

    def test_save_config_persists_selected_python_interpreter(self):
        response = self.client.post(
            "/api/save_config",
            json={"jupyter": {"python_executable": sys.executable}},
        )

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.get_json()["success"])

        loaded = self.client.get("/api/load_config")
        self.assertEqual(loaded.status_code, 200)
        self.assertEqual(
            loaded.get_json()["config"]["jupyter"]["python_executable"],
            sys.executable,
        )

    def test_repair_xedu_requires_an_explicit_python_path(self):
        response = self.client.post("/api/repair_xedu", json={})

        self.assertEqual(response.status_code, 400)
        self.assertIn("选择 Python", response.get_json()["message"])

    def test_repair_xedu_returns_the_target_runtime_result(self):
        with patch(
            "api.routes.jupyter.repair_xedu_python_environment",
            return_value={"success": True, "changed": True, "message": "已修复", "runtime": {"xedu_runtime_ok": True}},
        ):
            response = self.client.post("/api/repair_xedu", json={"python_executable": sys.executable})

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.get_json()["success"])
        self.assertTrue(response.get_json()["runtime"]["xedu_runtime_ok"])


if __name__ == "__main__":
    unittest.main()
