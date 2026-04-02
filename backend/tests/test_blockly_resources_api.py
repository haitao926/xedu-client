import base64
import tempfile
import unittest
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[1]
REPO_DIR = Path(__file__).resolve().parents[2]
import sys
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from api.app import create_app  # noqa: E402
from services.gitea_service import _guess_file_type  # noqa: E402


class BlocklyResourcesApiTestCase(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        app = create_app(Path(self.temp_dir.name))
        app.testing = True
        self.client = app.test_client()

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_guess_file_type_marks_blockly(self):
        self.assertEqual(_guess_file_type("lesson1/demo.blockly.xml"), "blockly")
        self.assertEqual(_guess_file_type("lesson1/demo.blockly.json"), "blockly")
        self.assertEqual(_guess_file_type("lesson1/demo.ipynb"), "ipynb")

    def test_blockly_playground_route_infers_notebook_practice(self):
        course_dir = Path(self.temp_dir.name) / "course"
        course_dir.mkdir(parents=True, exist_ok=True)
        (course_dir / "demo.blockly.xml").write_text("<xml xmlns=\"https://developers.google.com/blockly/xml\"></xml>", encoding="utf-8")
        (course_dir / "demo.ipynb").write_text("{\"cells\": [], \"metadata\": {}, \"nbformat\": 4, \"nbformat_minor\": 5}", encoding="utf-8")
        token = base64.urlsafe_b64encode(str(course_dir.resolve()).encode("utf-8")).decode("utf-8").rstrip("=")

        response = self.client.get(f"/api/resources/blockly-playground/{token}?workspace=demo.blockly.xml")
        self.assertEqual(response.status_code, 200)
        text = response.get_data(as_text=True)
        self.assertIn("XEdu Blockly 教学实验台", text)
        self.assertIn("demo.ipynb", text)
        self.assertIn("在 Jupyter 打开关联代码", text)
        self.assertIn("toolbarMoreMenu", text)
        self.assertIn("controlPanelToggleBtn", text)
        self.assertIn("Python 实时生成", text)
        self.assertIn("运行结果卡", text)
        self.assertIn('accept=".zip,.json,.toolbox.json"', text)
        self.assertIn("__XEDU_BLOCKLY_RUNTIME_CONFIG__", text)
        self.assertIn("blockly-workspace.js", text)

    def test_blockly_playground_route_falls_back_without_toolbox(self):
        course_dir = Path(self.temp_dir.name) / "course"
        course_dir.mkdir(parents=True, exist_ok=True)
        (course_dir / "loop.blockly.xml").write_text("<xml xmlns=\"https://developers.google.com/blockly/xml\"></xml>", encoding="utf-8")
        (course_dir / "loop.py").write_text("print('hello')\n", encoding="utf-8")
        token = base64.urlsafe_b64encode(str(course_dir.resolve()).encode("utf-8")).decode("utf-8").rstrip("=")

        response = self.client.get(f"/api/resources/blockly-playground/{token}?workspace=loop.blockly.xml")
        self.assertEqual(response.status_code, 200)
        text = response.get_data(as_text=True)
        self.assertIn("defaultXEduHubToolbox", text)
        self.assertIn("loop.py", text)
        self.assertTrue(
            "/api/resources/frontend-assets/assets/blockly-workspace.js" in text
            or "http://127.0.0.1:3000/js/blockly-workspace.js" in text
        )

    def test_blockly_blank_playground_route_is_available(self):
        response = self.client.get("/api/resources/blockly-playground-blank")
        self.assertEqual(response.status_code, 200)
        text = response.get_data(as_text=True)
        self.assertIn("空白 Blockly 实验台", text)
        self.assertIn("defaultXEduHubToolbox", text)
        self.assertIn("运行程序", text)
        self.assertIn("__XEDU_BLOCKLY_RUNTIME_CONFIG__", text)

    def test_frontend_asset_route_serves_build_file(self):
        asset_dir = REPO_DIR / "build" / "assets"
        asset_dir.mkdir(parents=True, exist_ok=True)
        asset_file = asset_dir / "__blockly_route_test__.txt"
        asset_file.write_text("ok", encoding="utf-8")
        response = None
        try:
            response = self.client.get("/api/resources/frontend-assets/assets/__blockly_route_test__.txt")
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.get_data(as_text=True), "ok")
        finally:
            if response is not None:
                response.close()
            asset_file.unlink(missing_ok=True)

    def test_blockly_xeduhub_execute_route_reports_missing_package(self):
        image_path = Path(self.temp_dir.name) / "demo.jpg"
        image_path.write_bytes(b"fake-image")
        response = self.client.post(
            "/api/resources/blockly/xeduhub/execute",
            json={
                "code": "print('demo')",
                "spec": {
                    "task": "classification",
                    "model": "resnet18",
                    "input": str(image_path),
                },
            },
        )
        self.assertEqual(response.status_code, 400)
        data = response.get_json()
        self.assertFalse(data["success"])
        self.assertEqual(data["result_type"], "error")
        self.assertIn("XEduHub", data["message"])
        self.assertIn(data["error_code"], {"missing_dependency", "runtime_exception"})
        self.assertIn("result_summary", data)
        self.assertIn("result_artifacts", data)

    def test_blockly_xeduhub_execute_route_rejects_invalid_model(self):
        image_path = Path(self.temp_dir.name) / "demo.jpg"
        image_path.write_bytes(b"fake-image")
        response = self.client.post(
            "/api/resources/blockly/xeduhub/execute",
            json={
                "code": "print('demo')",
                "spec": {
                    "task": "classification",
                    "model": "bad-model",
                    "input": str(image_path),
                },
            },
        )
        self.assertEqual(response.status_code, 400)
        data = response.get_json()
        self.assertFalse(data["success"])
        self.assertEqual(data["error_code"], "model_unavailable")
        self.assertEqual(data["result_summary"]["headline"], "模型不可用")

    def test_blockly_validate_toolbox_route_rejects_unsafe_inputs(self):
        response = self.client.post(
            "/api/resources/blockly/validate-toolbox",
            json={
                "toolbox": {
                    "kind": "categoryToolbox",
                    "contents": [
                        {
                            "kind": "category",
                            "name": "文本",
                            "contents": [
                                {
                                    "kind": "block",
                                    "type": "text_changeCase",
                                    "inputs": {
                                        "TEXT": {
                                            "kind": "block",
                                            "type": "text",
                                            "fields": {"TEXT": "abc"},
                                        }
                                    },
                                }
                            ],
                        }
                    ],
                }
            },
        )
        self.assertEqual(response.status_code, 400)
        data = response.get_json()
        self.assertFalse(data["valid"])
        self.assertTrue(any("text_changeCase" in item for item in data["errors"]))


if __name__ == "__main__":
    unittest.main()
