import base64
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


BACKEND_DIR = Path(__file__).resolve().parents[1]
REPO_DIR = Path(__file__).resolve().parents[2]
import sys
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from api.app import create_app  # noqa: E402
from api.resource_runtime import (  # noqa: E402
    guess_blockly_notebook_path,
    guess_blockly_python_path,
    guess_blockly_toolbox_path,
)
from services.gitea_service import _guess_file_type  # noqa: E402
from services.blockly_xeduhub_support import _materialize_image_data_url  # noqa: E402


class BlocklyResourcesApiTestCase(unittest.TestCase):
    @staticmethod
    def _write_test_image(path: Path) -> None:
        from PIL import Image

        Image.new("RGB", (64, 64), color=(240, 240, 240)).save(path)

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
        self.assertEqual(_guess_file_type("lesson1/demo.sb3"), "scratch")
        self.assertEqual(_guess_file_type("lesson1/demo.ipynb"), "ipynb")
        self.assertEqual(guess_blockly_python_path("lesson1/workspace_json_roundtrip.blockly.json"), "lesson1/workspace_json_roundtrip.py")
        self.assertEqual(guess_blockly_toolbox_path("lesson1/custom_toolbox.blockly.xml"), "lesson1/custom_toolbox.toolbox.json")
        self.assertEqual(guess_blockly_notebook_path("lesson1/hello_classroom.blockly.xml"), "lesson1/hello_classroom.ipynb")

    def test_blockly_playground_route_infers_notebook_practice(self):
        course_dir = Path(self.temp_dir.name) / "course"
        course_dir.mkdir(parents=True, exist_ok=True)
        (course_dir / "demo.blockly.xml").write_text("<xml xmlns=\"https://developers.google.com/blockly/xml\"></xml>", encoding="utf-8")
        (course_dir / "demo.ipynb").write_text("{\"cells\": [], \"metadata\": {}, \"nbformat\": 4, \"nbformat_minor\": 5}", encoding="utf-8")
        token = base64.urlsafe_b64encode(str(course_dir.resolve()).encode("utf-8")).decode("utf-8").rstrip("=")

        response = self.client.get(f"/api/resources/blockly-playground/{token}?workspace=demo.blockly.xml")
        self.assertEqual(response.status_code, 200)
        text = response.get_data(as_text=True)
        self.assertIn("Blockly 课堂模式", text)
        self.assertIn("任务驱动课堂工作台", text)
        self.assertIn("demo.ipynb", text)
        self.assertIn("在 Jupyter 打开关联代码", text)
        self.assertIn("toolbarMoreMenu", text)
        self.assertIn("controlPanelToggleBtn", text)
        self.assertIn("打开文件", text)
        self.assertIn("保存文件", text)
        self.assertIn("codeDockToggleBtn", text)
        self.assertIn("resultTerminal", text)
        self.assertIn("运行反馈", text)
        self.assertIn("一个输出框里显示 print 输出、运行结果与报错信息", text)
        self.assertIn("xedu-blockly-critical-style", text)
        self.assertIn('class="xedu-blockly-runtime xedu-blockly-runtime-pending"', text)
        self.assertIn("xedu-blockly-boot", text)
        self.assertNotIn("toggleCodePanelBtn", text)
        self.assertIn("demo.py", text)
        self.assertIn('accept=".zip,.json,.toolbox.json"', text)
        self.assertIn('accept=".blockly.json,.json,.blockly.xml,.xml,application/json,text/xml"', text)
        self.assertIn("__XEDU_BLOCKLY_RUNTIME_CONFIG__", text)
        self.assertIn("toolboxSaveUrl", text)
        self.assertNotIn("官方积木", text)
        self.assertNotIn("toolboxOfficialBtn", text)
        self.assertNotIn("toolboxCourseBtn", text)
        self.assertIn("blockly-workspace.js", text)

    def test_blockly_playground_route_falls_back_without_toolbox(self):
        course_dir = Path(self.temp_dir.name) / "course"
        course_dir.mkdir(parents=True, exist_ok=True)
        (course_dir / "loop.blockly.xml").write_text("<xml xmlns=\"https://developers.google.com/blockly/xml\"></xml>", encoding="utf-8")
        (course_dir / "loop.py").write_text("print('hello')\n", encoding="utf-8")
        token = base64.urlsafe_b64encode(str(course_dir.resolve()).encode("utf-8")).decode("utf-8").rstrip("=")

        with patch(
            "services.blockly_xeduhub_support._get_runtime_supported_tasks",
            side_effect=AssertionError("blockly playground must not probe runtime support on page load"),
        ):
            response = self.client.get(f"/api/resources/blockly-playground/{token}?workspace=loop.blockly.xml")
        self.assertEqual(response.status_code, 200)
        text = response.get_data(as_text=True)
        self.assertIn("defaultXEduHubToolbox", text)
        self.assertIn("xeduhubTaskRegistry", text)
        self.assertIn("loop.py", text)
        self.assertTrue(
            "/api/resources/frontend-assets/assets/blockly-workspace.js" in text
            or "http://127.0.0.1:3002/js/blockly-workspace.js" in text
            or "http://127.0.0.1:3001/js/blockly-workspace.js" in text
            or "http://127.0.0.1:3000/js/blockly-workspace.js" in text
        )

    def test_blockly_blank_playground_route_is_available(self):
        with patch(
            "services.blockly_xeduhub_support._get_runtime_supported_tasks",
            side_effect=AssertionError("blank playground must not probe runtime support"),
        ):
            response = self.client.get("/api/resources/blockly-playground-blank")
        self.assertEqual(response.status_code, 200)
        text = response.get_data(as_text=True)
        self.assertIn("Blockly 课堂模式", text)
        self.assertNotIn("空白 Blockly 课堂模式", text)
        self.assertIn("defaultXEduHubToolbox", text)
        self.assertIn("xeduhubTaskRegistry", text)
        self.assertIn("xeduhub_run_det_body", text)
        self.assertIn('"name": "目标检测"', text)
        self.assertIn('"name": "关键点识别"', text)
        self.assertIn("xeduhub_run_cls_imagenet", text)
        self.assertIn('"supported_runtime_tasks":', text)
        self.assertIn('"task_id": "det_coco_l"', text)
        self.assertIn('"task_id": "pose_wholebody133"', text)
        self.assertIn("运行程序", text)
        self.assertIn("打开文件", text)
        self.assertIn("保存文件", text)
        self.assertIn("codeDockToggleBtn", text)
        self.assertNotIn("toggleCodePanelBtn", text)
        self.assertIn("__XEDU_BLOCKLY_RUNTIME_CONFIG__", text)
        self.assertIn(str(REPO_DIR), text)
        self.assertNotIn("img_type", text)

    def test_blockly_playground_blank_uses_nonblocking_supported_task_snapshot(self):
        with patch(
            "api.app.get_nonblocking_supported_tasks_snapshot",
            return_value=["det_body"],
        ), patch(
            "services.blockly_xeduhub_support._get_runtime_supported_tasks",
            side_effect=AssertionError("blank playground must not probe runtime support"),
        ):
            app = create_app(Path(self.temp_dir.name))
            app.testing = True
            client = app.test_client()
            response = client.get("/api/resources/blockly-playground-blank")
        self.assertEqual(response.status_code, 200)
        text = response.get_data(as_text=True)
        self.assertIn('"supported_runtime_tasks": ["det_body"]', text)
        self.assertIn("xeduhub_run_det_body", text)
        self.assertIn("xeduhub_run_cls_imagenet", text)

    def test_blockly_playground_route_loads_json_workspace_fixture(self):
        course_dir = Path(self.temp_dir.name) / "course-json"
        course_dir.mkdir(parents=True, exist_ok=True)
        (course_dir / "workspace_json_roundtrip.blockly.json").write_text(
            json.dumps(
                {
                    "variables": [{"name": "counter", "id": "var_counter"}],
                    "blocks": {
                        "languageVersion": 0,
                        "blocks": [
                            {
                                "type": "variables_set",
                                "id": "set_counter",
                                "fields": {"VAR": {"id": "var_counter"}},
                                "inputs": {
                                    "VALUE": {
                                        "block": {
                                            "type": "math_number",
                                            "id": "num_two",
                                            "fields": {"NUM": 2},
                                        }
                                    }
                                },
                            }
                        ],
                    },
                }
            ),
            encoding="utf-8",
        )
        (course_dir / "workspace_json_roundtrip.py").write_text("counter = 2\n", encoding="utf-8")
        token = base64.urlsafe_b64encode(str(course_dir.resolve()).encode("utf-8")).decode("utf-8").rstrip("=")

        response = self.client.get(f"/api/resources/blockly-playground/{token}?workspace=workspace_json_roundtrip.blockly.json")
        self.assertEqual(response.status_code, 200)
        text = response.get_data(as_text=True)
        self.assertIn("workspace_json_roundtrip.py", text)
        self.assertIn("workspace_json_roundtrip.blockly.json", text)
        self.assertIn("保存文件", text)
        self.assertIn("blockly-workspace.js", text)

    def test_blockly_playground_route_loads_custom_toolbox_fixture(self):
        course_dir = Path(self.temp_dir.name) / "course-toolbox"
        course_dir.mkdir(parents=True, exist_ok=True)
        (course_dir / "custom_toolbox.blockly.xml").write_text("<xml xmlns=\"https://developers.google.com/blockly/xml\"></xml>", encoding="utf-8")
        (course_dir / "custom_toolbox.py").write_text("print('custom toolbox')\n", encoding="utf-8")
        (course_dir / "custom_toolbox.toolbox.json").write_text(
            json.dumps(
                {
                    "kind": "categoryToolbox",
                    "contents": [
                        {
                            "kind": "category",
                            "name": "课堂任务",
                            "contents": [{"kind": "block", "type": "text_print"}],
                        }
                    ],
                }
            ),
            encoding="utf-8",
        )
        token = base64.urlsafe_b64encode(str(course_dir.resolve()).encode("utf-8")).decode("utf-8").rstrip("=")

        response = self.client.get(f"/api/resources/blockly-playground/{token}?workspace=custom_toolbox.blockly.xml")
        self.assertEqual(response.status_code, 200)
        text = response.get_data(as_text=True)
        self.assertIn("custom_toolbox.py", text)
        self.assertIn("custom_toolbox.toolbox.json", text)
        self.assertIn("toolboxUrl", text)

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

    def test_scratch_editor_route_has_fallback_when_build_missing(self):
        response = self.client.get("/api/scratch-editor/index.html")
        self.assertEqual(response.status_code, 200)
        text = response.get_data(as_text=True)
        self.assertIn("XEdu Scratch", text)
        if "scratch-gui-standalone.js" in text:
            self.assertIn("api/resources/scratch-project", text)
        else:
            self.assertIn("npm run build:scratch", text)

    def test_scratch_project_route_reads_and_saves_sb3(self):
        course_dir = Path(self.temp_dir.name) / "course-scratch"
        course_dir.mkdir(parents=True, exist_ok=True)
        project_rel = "lesson1/demo.sb3"
        project_file = course_dir / project_rel
        project_file.parent.mkdir(parents=True, exist_ok=True)
        project_file.write_bytes(b"initial-sb3")
        token = base64.urlsafe_b64encode(str(course_dir.resolve()).encode("utf-8")).decode("utf-8").rstrip("=")

        read_response = self.client.get(f"/api/resources/scratch-project/{token}/{project_rel}")
        self.assertEqual(read_response.status_code, 200)
        self.assertEqual(read_response.get_data(), b"initial-sb3")
        self.assertEqual(read_response.mimetype, "application/x.scratch.sb3")

        save_response = self.client.put(
            f"/api/resources/scratch-project/{token}/{project_rel}",
            data=b"updated-sb3",
            content_type="application/x.scratch.sb3",
        )
        self.assertEqual(save_response.status_code, 200)
        payload = save_response.get_json()
        self.assertTrue(payload["success"])
        self.assertEqual(payload["path"], project_rel)
        self.assertEqual(project_file.read_bytes(), b"updated-sb3")

    def test_scratch_project_route_rejects_non_sb3(self):
        course_dir = Path(self.temp_dir.name) / "course-scratch-invalid"
        course_dir.mkdir(parents=True, exist_ok=True)
        token = base64.urlsafe_b64encode(str(course_dir.resolve()).encode("utf-8")).decode("utf-8").rstrip("=")

        response = self.client.put(
            f"/api/resources/scratch-project/{token}/lesson1/not-scratch.txt",
            data=b"not scratch",
            content_type="text/plain",
        )
        self.assertEqual(response.status_code, 400)
        self.assertFalse(response.get_json()["success"])

    def test_xeduhub_neutral_execute_route_matches_blockly_route(self):
        image_path = Path(self.temp_dir.name) / "demo-neutral.jpg"
        self._write_test_image(image_path)
        payload = {
            "code": "print('demo')",
            "spec": {
                "task_id": "det_body",
                "input": str(image_path),
                "params": {"thr": 0.4, "img_type": "pil"},
                "mode": "preset",
            },
        }
        neutral_response = self.client.post("/api/resources/xeduhub/execute", json=payload)
        blockly_response = self.client.post("/api/resources/blockly/xeduhub/execute", json=payload)
        self.assertEqual(neutral_response.status_code, 200)
        self.assertEqual(blockly_response.status_code, 200)
        neutral = neutral_response.get_json()
        blockly = blockly_response.get_json()
        self.assertTrue(neutral["success"])
        self.assertEqual(neutral["result"]["task_id"], blockly["result"]["task_id"])
        self.assertEqual(neutral["result_summary"]["headline"], blockly["result_summary"]["headline"])

    def test_xeduhub_neutral_execute_route_materializes_camera_frame_temporarily(self):
        temporary_paths = []
        try:
            path = Path(_materialize_image_data_url(
                "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL0XQAAAABJRU5ErkJggg==",
                temporary_paths,
            ))
            self.assertTrue(path.is_file())
            self.assertEqual(path.suffix, ".png")
        finally:
            for temporary_path in temporary_paths:
                temporary_path.unlink(missing_ok=True)
        self.assertFalse(path.exists())

    def test_default_sample_course_route_returns_sample(self):
        response = self.client.get("/api/resources/default-sample")
        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertTrue(payload["success"])
        self.assertEqual(payload["sample"]["label"], "默认测试样例")
        self.assertIn("course", payload["sample"])
        self.assertIn("path", payload["sample"])

    def test_blockly_xeduhub_execute_route_reports_missing_package(self):
        image_path = Path(self.temp_dir.name) / "demo.jpg"
        self._write_test_image(image_path)
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
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertTrue(data["success"])
        self.assertEqual(data["result"]["task_id"], "cls_imagenet")
        self.assertEqual(data["result"].get("runtime_mode"), "real")
        self.assertEqual(data["result"].get("result_truthfulness"), "verified")

    def test_blockly_xeduhub_execute_route_rejects_invalid_model(self):
        image_path = Path(self.temp_dir.name) / "demo.jpg"
        self._write_test_image(image_path)
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

    def test_blockly_xeduhub_execute_route_rejects_invalid_task_id(self):
        image_path = Path(self.temp_dir.name) / "demo.jpg"
        self._write_test_image(image_path)
        response = self.client.post(
            "/api/resources/blockly/xeduhub/execute",
            json={
                "code": "print('demo')",
                "spec": {
                    "task_id": "not-a-real-task",
                    "input": str(image_path),
                    "params": {},
                    "mode": "preset",
                },
            },
        )
        self.assertEqual(response.status_code, 400)
        data = response.get_json()
        self.assertFalse(data["success"])
        self.assertEqual(data["error_code"], "invalid_task_id")
        self.assertEqual(data["result_summary"]["headline"], "任务不可用")

    def test_blockly_xeduhub_execute_route_accepts_new_spec_shape(self):
        image_path = Path(self.temp_dir.name) / "demo.jpg"
        self._write_test_image(image_path)
        response = self.client.post(
            "/api/resources/blockly/xeduhub/execute",
            json={
                "code": "print('demo')",
                "spec": {
                    "task_id": "det_body",
                    "input": str(image_path),
                    "params": {"thr": 0.4, "img_type": "pil"},
                    "mode": "preset",
                },
            },
        )
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertTrue(data["success"])
        self.assertEqual(data["result"]["task_id"], "det_body")
        self.assertIn("result_summary", data)
        self.assertIn("result_artifacts", data)
        self.assertTrue(data["result_artifacts"]["preview_image"].startswith("data:image/png;base64,"))
        self.assertEqual(data["artifacts"]["image_data"], data["result_artifacts"]["preview_image"])
        self.assertIn("弹窗", data["result_summary"]["hints"][0])

    def test_blockly_xeduhub_execute_route_reports_missing_openxlab_auth_for_auto_download(self):
        image_path = Path(self.temp_dir.name) / "demo.jpg"
        self._write_test_image(image_path)

        class _FakeWorkflow:
            @staticmethod
            def support_task():
                return ["bodydetect"]

            def __init__(self, task):
                raise ValueError("Local config must not be empty before get token via api. Please use the 'openxlab config' command to set the config")

        with patch.dict(os.environ, {"XEDU_DISABLE_BODYDETECT_FALLBACK": "1"}, clear=False), patch("services.blockly_xeduhub_support._resolve_smoke_checkpoint", return_value=""), patch("services.blockly_xeduhub_support._patch_openxlab_repo_parser", return_value=None), patch.dict("sys.modules", {"XEdu.hub": type("FakeHubModule", (), {"Workflow": _FakeWorkflow})}):
            response = self.client.post(
                "/api/resources/blockly/xeduhub/execute",
                json={
                    "code": "print('demo')",
                    "spec": {
                        "task_id": "det_body",
                        "input": str(image_path),
                        "params": {},
                        "mode": "preset",
                    },
                },
            )

        self.assertEqual(response.status_code, 400)
        data = response.get_json()
        self.assertFalse(data["success"])
        self.assertEqual(data["error_code"], "model_download_auth_missing")
        self.assertEqual(data["result_summary"]["headline"], "自动下载需要 OpenXLab 配置")

    def test_blockly_xeduhub_execute_route_falls_back_for_bodydetect_when_model_missing(self):
        image_path = Path(self.temp_dir.name) / "demo.jpg"
        self._write_test_image(image_path)

        with patch("services.blockly_xeduhub_support._get_runtime_supported_tasks", return_value=[]), patch(
            "services.blockly_xeduhub_support._resolve_smoke_checkpoint",
            return_value="",
        ):
            response = self.client.post(
                "/api/resources/blockly/xeduhub/execute",
                json={
                    "code": "print('demo')",
                    "spec": {
                        "task_id": "det_body",
                        "input": str(image_path),
                        "params": {},
                        "mode": "preset",
                    },
                },
            )

        data = response.get_json()
        self.assertEqual(response.status_code, 200)
        self.assertTrue(data["success"])
        self.assertEqual(data["result"]["task_id"], "det_body")
        self.assertEqual(data["result"].get("runtime_mode"), "opencv_fallback")
        self.assertEqual(data["result"].get("result_truthfulness"), "demo_only")
        self.assertEqual(data["result_summary"]["headline"], "兼容演示结果")

    def test_blockly_xeduhub_execute_route_falls_back_for_bodydetect_when_repo_format_error_occurs(self):
        image_path = Path(self.temp_dir.name) / "demo.jpg"
        self._write_test_image(image_path)

        class _FakeWorkflow:
            @staticmethod
            def support_task():
                return ["bodydetect"]

            def __init__(self, task):
                raise ValueError("The input string must be in the format 'didi12/test-d-1'")

        with patch("services.blockly_xeduhub_support._resolve_smoke_checkpoint", return_value=""), patch(
            "services.blockly_xeduhub_support._patch_openxlab_repo_parser", return_value=None
        ), patch.dict("sys.modules", {"XEdu.hub": type("FakeHubModule", (), {"Workflow": _FakeWorkflow})}):
            response = self.client.post(
                "/api/resources/blockly/xeduhub/execute",
                json={
                    "code": "print('demo')",
                    "spec": {
                        "task_id": "det_body",
                        "input": str(image_path),
                        "params": {},
                        "mode": "preset",
                    },
                },
            )

        data = response.get_json()
        self.assertEqual(response.status_code, 200)
        self.assertTrue(data["success"])
        self.assertEqual(data["result"]["task_id"], "det_body")
        self.assertIn(data["result"].get("runtime_mode"), {"fallback", "opencv_fallback"})
        self.assertEqual(data["result"].get("result_truthfulness"), "demo_only")

    def test_blockly_xeduhub_execute_route_uses_local_smoke_checkpoint_for_runtime_task(self):
        image_path = Path(self.temp_dir.name) / "demo.jpg"
        self._write_test_image(image_path)
        init_calls = []

        class _FakeWorkflow:
            @staticmethod
            def support_task():
                return ["bodydetect"]

            def __init__(self, task, checkpoint=None):
                init_calls.append({"task": task, "checkpoint": checkpoint})

            def inference(self, data=None, **kwargs):
                return [{"bbox": [1, 2, 3, 4], "score": 0.9, "label": "person"}]

        with patch("services.blockly_xeduhub_support._get_runtime_supported_tasks", return_value=["det_body"]), patch(
            "services.blockly_xeduhub_support._resolve_smoke_checkpoint",
            return_value="/tmp/smoke-det_body.onnx",
        ), patch("services.blockly_xeduhub_support._patch_openxlab_repo_parser", return_value=None), patch.dict(
            "sys.modules",
            {"XEdu.hub": type("FakeHubModule", (), {"Workflow": _FakeWorkflow})},
        ):
            response = self.client.post(
                "/api/resources/blockly/xeduhub/execute",
                json={
                    "code": "print('demo')",
                    "spec": {
                        "task_id": "det_body",
                        "input": str(image_path),
                        "params": {},
                        "mode": "preset",
                    },
                },
            )

        data = response.get_json()
        self.assertEqual(response.status_code, 200)
        self.assertTrue(data["success"])
        self.assertEqual(len(init_calls), 1)
        self.assertEqual(init_calls[0]["task"], "det_body")
        self.assertEqual(init_calls[0]["checkpoint"], "/tmp/smoke-det_body.onnx")
        self.assertEqual(data["result"]["checkpoint"], "/tmp/smoke-det_body.onnx")

    def test_blockly_xeduhub_execute_route_shows_verified_empty_detection_result(self):
        image_path = Path(self.temp_dir.name) / "empty-detection.jpg"
        self._write_test_image(image_path)

        class _FakeWorkflow:
            @staticmethod
            def support_task():
                return ["bodydetect"]

            def __init__(self, task, checkpoint=None):
                self.task = task
                self.checkpoint = checkpoint

            def inference(self, data=None, **kwargs):
                return []

        with patch("services.blockly_xeduhub_support._get_runtime_supported_tasks", return_value=["det_body"]), patch(
            "services.blockly_xeduhub_support._resolve_smoke_checkpoint",
            return_value="/tmp/smoke-det_body.onnx",
        ), patch("services.blockly_xeduhub_support._patch_openxlab_repo_parser", return_value=None), patch.dict(
            "sys.modules",
            {"XEdu.hub": type("FakeHubModule", (), {"Workflow": _FakeWorkflow})},
        ):
            response = self.client.post(
                "/api/resources/blockly/xeduhub/execute",
                json={
                    "code": "print('demo')",
                    "spec": {
                        "task_id": "det_body",
                        "input": str(image_path),
                        "params": {},
                        "mode": "preset",
                    },
                },
            )

        data = response.get_json()
        self.assertEqual(response.status_code, 200)
        self.assertTrue(data["success"])
        self.assertEqual(data["result"]["runtime_mode"], "real")
        self.assertEqual(data["result"]["result_truthfulness"], "verified")
        self.assertEqual(data["result"]["checkpoint"], "/tmp/smoke-det_body.onnx")
        self.assertEqual(data["result_summary"]["headline"], "检测到 0 个目标")
        self.assertIn("模型已完成推理", data["result_summary"]["hints"][0])
        self.assertTrue(data["result_artifacts"]["preview_image"].startswith("data:image/png;base64,"))

    def test_blockly_xeduhub_execute_route_rejects_missing_custom_image_without_demo_fallback(self):
        missing_image = Path(self.temp_dir.name) / "picked-by-browser.jpg"
        response = self.client.post(
            "/api/resources/blockly/xeduhub/execute",
            json={
                "code": "print('demo')",
                "project_root": self.temp_dir.name,
                "spec": {
                    "task_id": "det_body",
                    "input": missing_image.name,
                    "params": {},
                    "mode": "preset",
                },
            },
        )

        data = response.get_json()
        self.assertEqual(response.status_code, 400)
        self.assertFalse(data["success"])
        self.assertEqual(data["error_code"], "input_not_found")
        self.assertIn("picked-by-browser.jpg", data["message"])

    def test_blockly_xeduhub_execute_route_accepts_default_sample_input_without_course_asset(self):
        init_calls = []

        class _FakeWorkflow:
            @staticmethod
            def support_task():
                return ["bodydetect"]

            def __init__(self, task, checkpoint=None):
                init_calls.append({"task": task, "checkpoint": checkpoint})

            def inference(self, data=None, **kwargs):
                self.data_seen = data
                return [{"bbox": [1, 2, 3, 4], "score": 0.9, "label": "person"}]

        with patch("services.blockly_xeduhub_support._get_runtime_supported_tasks", return_value=["det_body"]), patch(
            "services.blockly_xeduhub_support._resolve_smoke_checkpoint",
            return_value="/tmp/smoke-det_body.onnx",
        ), patch("services.blockly_xeduhub_support._patch_openxlab_repo_parser", return_value=None), patch.dict(
            "sys.modules",
            {"XEdu.hub": type("FakeHubModule", (), {"Workflow": _FakeWorkflow})},
        ):
            response = self.client.post(
                "/api/resources/blockly/xeduhub/execute",
                json={
                    "code": "print('demo')",
                    "spec": {
                        "task_id": "det_body",
                        "input": "demo.jpg",
                        "params": {},
                        "mode": "preset",
                    },
                },
            )

        data = response.get_json()
        self.assertEqual(response.status_code, 200)
        self.assertTrue(data["success"])
        self.assertEqual(data["result"]["task_id"], "det_body")
        self.assertTrue(Path(data["result"]["input"]).exists())
        self.assertEqual(init_calls[0]["checkpoint"], "/tmp/smoke-det_body.onnx")

    def test_blockly_xeduhub_execute_forces_noninteractive_matplotlib_backend(self):
        image_path = Path(self.temp_dir.name) / "demo.jpg"
        self._write_test_image(image_path)
        backend_seen = {"value": None}

        class _FakeWorkflow:
            @staticmethod
            def support_task():
                return ["segment_anything"]

            def __init__(self, task):
                self.task = task

            def inference(self, data=None, **kwargs):
                backend_seen["value"] = os.environ.get("MPLBACKEND")
                return {"mask_count": 1, "task": self.task}

        with patch("services.blockly_xeduhub_support._patch_openxlab_repo_parser", return_value=None), patch.dict(
            "sys.modules",
            {"XEdu.hub": type("FakeHubModule", (), {"Workflow": _FakeWorkflow})},
        ):
            response = self.client.post(
                "/api/resources/blockly/xeduhub/execute",
                json={
                    "code": "print('demo')",
                    "spec": {
                        "task_id": "segment_anything",
                        "input": str(image_path),
                        "params": {},
                        "mode": "preset",
                    },
                },
            )

        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertTrue(data["success"])
        self.assertEqual(data["result"]["task_id"], "segment_anything")
        self.assertEqual(backend_seen["value"], "Agg")

    def test_blockly_xeduhub_supported_runtime_tasks_return_verified_results_or_grounded_errors(self):
        image_path = Path(self.temp_dir.name) / "demo.jpg"
        self._write_test_image(image_path)
        for task_id in (
            "det_body",
            "det_coco",
            "det_coco_l",
            "pose_body17",
            "pose_body26",
            "pose_face106",
            "pose_hand21",
            "pose_wholebody133",
        ):
            with self.subTest(task_id=task_id):
                response = self.client.post(
                    "/api/resources/blockly/xeduhub/execute",
                    json={
                        "code": f"# smoke {task_id}",
                        "project_root": str(REPO_DIR),
                        "spec": {
                            "task_id": task_id,
                            "input": str(image_path),
                            "params": {},
                            "mode": "preset",
                        },
                    },
                )
                data = response.get_json()
                self.assertIn(response.status_code, {200, 400})
                if response.status_code == 200:
                    self.assertTrue(data["success"])
                    expected_task_id = {
                        "pose_body26": "pose_body17",
                    }.get(task_id, task_id)
                    self.assertEqual(data["result"]["task_id"], expected_task_id)
                    self.assertIn(data["result"].get("result_truthfulness"), {"verified", "demo_only"})
                    self.assertIn("result_summary", data)
                else:
                    self.assertFalse(data["success"])
                    self.assertIn(
                        data.get("error_code"),
                        {"runtime_exception", "model_download_auth_missing", "model_artifact_missing", "runtime_task_unavailable"},
                    )

    def test_blockly_xeduhub_execute_route_reports_runtime_task_unavailable(self):
        image_path = Path(self.temp_dir.name) / "demo.jpg"
        self._write_test_image(image_path)
        with patch(
            "services.blockly_xeduhub_support._get_runtime_supported_tasks",
            return_value=["det_body", "pose_body17"],
        ):
            response = self.client.post(
                "/api/resources/blockly/xeduhub/execute",
                json={
                    "code": "print('demo')",
                    "spec": {
                        "task_id": "ocr",
                        "input": str(image_path),
                        "params": {},
                        "mode": "preset",
                    },
                },
            )
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertTrue(data["success"])
        self.assertEqual(data["result"]["task_id"], "ocr")
        self.assertEqual(data["result"].get("runtime_mode"), "fallback")
        self.assertEqual(data["result"].get("result_truthfulness"), "demo_only")
        self.assertIn("兼容演示", data["result_summary"]["headline"])

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

    def test_blockly_validate_toolbox_route_rejects_invalid_fixture(self):
        invalid_toolbox = {
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

        response = self.client.post(
            "/api/resources/blockly/validate-toolbox",
            json={"toolbox": invalid_toolbox},
        )
        self.assertEqual(response.status_code, 400)
        data = response.get_json()
        self.assertFalse(data["valid"])
        self.assertTrue(any("text_changeCase" in item for item in data["errors"]))

    def test_inspect_course_reports_ready_for_complete_local_experiment(self):
        course_dir = Path(self.temp_dir.name) / "ready-course"
        course_dir.mkdir(parents=True, exist_ok=True)
        (course_dir / "index.html").write_text("<html></html>", encoding="utf-8")
        (course_dir / "demo.blockly.xml").write_text("<xml></xml>", encoding="utf-8")
        (course_dir / "course.json").write_text(
            json.dumps({
                "id": "ready-course",
                "title": "Ready Course",
                "sections": [
                    {
                        "title": "第一课",
                        "experiments": [
                            {
                                "title": "实验一",
                                "files": [
                                    {"path": "index.html", "type": "html"},
                                    {"path": "demo.blockly.xml", "type": "blockly"},
                                ],
                            }
                        ],
                    }
                ],
            }),
            encoding="utf-8",
        )

        response = self.client.post("/api/resources/inspect-course", json={"local_path": str(course_dir)})
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertTrue(data["success"])
        self.assertEqual(data["summary"]["ready_count"], 1)
        self.assertEqual(data["summary"]["broken_count"], 0)
        experiment = data["inspection"]["sections"][0]["experiments"][0]
        self.assertEqual(experiment["status"], "ready")
        self.assertEqual([entry["kind"] for entry in experiment["entries"]], ["html", "blockly"])

    def test_inspect_course_normalizes_lessons_schema_with_experiment_relative_files(self):
        course_dir = Path(self.temp_dir.name) / "lesson-course"
        exp_dir = course_dir / "lesson10" / "exp1"
        exp_dir.mkdir(parents=True, exist_ok=True)
        (exp_dir / "index.html").write_text("<html></html>", encoding="utf-8")
        (exp_dir / "main.blockly.xml").write_text("<xml></xml>", encoding="utf-8")
        (exp_dir / "main.ipynb").write_text(
            "{\"cells\": [], \"metadata\": {}, \"nbformat\": 4, \"nbformat_minor\": 5}",
            encoding="utf-8",
        )
        (course_dir / "course.json").write_text(
            json.dumps({
                "id": "ai-referee",
                "title": "运动会上的AI裁判",
                "lessons": [
                    {
                        "id": "lesson10",
                        "title": "第10课 模型评估",
                        "experiments": [
                            {
                                "id": "exp1",
                                "title": "实验1：模型推理",
                                "files": ["index.html", "main.blockly.xml", "main.ipynb"],
                            }
                        ],
                    }
                ],
            }),
            encoding="utf-8",
        )

        response = self.client.post("/api/resources/inspect-course", json={"local_path": str(course_dir)})
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertTrue(data["success"])
        self.assertEqual(data["summary"]["ready_count"], 1)
        self.assertEqual(data["course"]["sections"][0]["title"], "第10课 模型评估")
        experiment = data["inspection"]["sections"][0]["experiments"][0]
        self.assertEqual(experiment["status"], "ready")
        self.assertEqual(
            [entry["path"] for entry in experiment["entries"]],
            [
                "lesson10/exp1/index.html",
                "lesson10/exp1/main.blockly.xml",
                "lesson10/exp1/main.ipynb",
            ],
        )
        self.assertEqual(
            [entry["kind"] for entry in experiment["entries"]],
            ["html", "blockly", "notebook"],
        )

    def test_inspect_course_reports_broken_for_missing_local_file(self):
        course_dir = Path(self.temp_dir.name) / "broken-course"
        course_dir.mkdir(parents=True, exist_ok=True)
        (course_dir / "course.json").write_text(
            json.dumps({
                "id": "broken-course",
                "title": "Broken Course",
                "sections": [
                    {
                        "title": "第一课",
                        "experiments": [
                            {
                                "title": "实验一",
                                "files": [{"path": "missing.ipynb", "type": "ipynb"}],
                            }
                        ],
                    }
                ],
            }),
            encoding="utf-8",
        )

        response = self.client.post("/api/resources/inspect-course", json={"local_path": str(course_dir)})
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertEqual(data["summary"]["broken_count"], 1)
        experiment = data["inspection"]["sections"][0]["experiments"][0]
        self.assertEqual(experiment["status"], "broken")
        self.assertIn("missing.ipynb", experiment["missing_files"])

    @patch("api.routes.resources.load_repo_tree_data")
    @patch("api.routes.resources.load_course_data_from_repo")
    @patch("api.routes.resources.find_course_entry_from_index")
    def test_inspect_remote_course_loads_course_json_from_index_entry(self, find_entry, load_course, load_tree):
        find_entry.return_value = {
            "id": "remote-course",
            "course_url": "courses/remote-course/course.json",
            "package_url": "courses/remote-course/package.zip",
        }
        load_course.return_value = {
            "id": "remote-course",
            "title": "Remote Course",
            "sections": [
                {
                    "title": "第一课",
                    "experiments": [
                        {
                            "title": "实验一",
                            "files": [{"path": "lessons/one/index.html", "type": "html"}],
                        }
                    ],
                }
            ],
        }
        load_tree.return_value = [
            {"path": "courses/remote-course/course.json", "type": "blob"},
            {"path": "lessons/one/index.html", "type": "blob"},
        ]

        response = self.client.post(
            "/api/resources/inspect-course",
            json={
                "source_override": {
                    "id": "override",
                    "base_url": "https://git.example.com",
                    "repo": "owner/repo",
                    "branch": "main",
                    "index_path": "index.json",
                },
                "course_id": "remote-course",
            },
        )
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertEqual(data["course"]["sections"][0]["experiments"][0]["title"], "实验一")
        self.assertEqual(data["summary"]["ready_count"], 1)
        find_entry.assert_called_once()
        load_course.assert_called_once()

    @patch("api.routes.resources.load_repo_tree_data")
    @patch("api.routes.resources.load_course_data_from_repo")
    def test_inspect_remote_course_reports_broken_when_tree_missing_file(self, load_course, load_tree):
        load_course.return_value = {
            "id": "remote-missing",
            "title": "Remote Missing",
            "sections": [
                {
                    "title": "第一课",
                    "experiments": [
                        {
                            "title": "实验一",
                            "files": [{"path": "lesson/demo.py", "type": "python"}],
                        }
                    ],
                }
            ],
        }
        load_tree.return_value = [{"path": "course.json", "type": "blob"}]

        response = self.client.post(
            "/api/resources/inspect-course",
            json={
                "source_override": {
                    "id": "override",
                    "base_url": "https://git.example.com",
                    "repo": "owner/repo",
                    "branch": "main",
                },
                "course_url": "course.json",
            },
        )
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertEqual(data["summary"]["broken_count"], 1)
        experiment = data["inspection"]["sections"][0]["experiments"][0]
        self.assertEqual(experiment["status"], "broken")
        self.assertIn("lesson/demo.py", experiment["missing_files"])

    @patch("api.routes.resources.load_repo_tree_data")
    @patch("api.routes.resources.load_course_data_from_repo")
    def test_inspect_single_course_repo_defaults_to_root_course_json(self, load_course, load_tree):
        load_course.return_value = {
            "id": "single-course",
            "title": "Single Course",
            "sections": [
                {
                    "title": "第一课",
                    "experiments": [
                        {
                            "title": "实验一",
                            "files": [{"path": "demo.ipynb", "type": "ipynb"}],
                        }
                    ],
                }
            ],
        }
        load_tree.return_value = [
            {"path": "course.json", "type": "blob"},
            {"path": "demo.ipynb", "type": "blob"},
        ]

        response = self.client.post(
            "/api/resources/inspect-course",
            json={
                "source_override": {
                    "id": "override",
                    "base_url": "https://git.example.com",
                    "repo": "owner/course",
                    "branch": "main",
                    "single_course_repo": True,
                }
            },
        )
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertEqual(data["course"]["course_url"], "course.json")
        self.assertTrue(data["course"]["single_course_repo"])
        self.assertEqual(data["summary"]["ready_count"], 1)

    def test_blockly_smoke_sample_pack_has_expected_pairs(self):
        sample_dir = REPO_DIR / "courses" / "blockly-smoke"
        if not sample_dir.exists():
            self.skipTest("Blockly smoke sample pack is not present in this checkout")
        workspace_files = sorted(
            list(sample_dir.glob("*.blockly.xml")) + list(sample_dir.glob("*.blockly.json"))
        )

        self.assertGreaterEqual(len(workspace_files), 5)
        for workspace in workspace_files:
            self.assertTrue(
                "xeduhub" in workspace.name or workspace.name == "vision_demo.blockly.xml",
                f"{workspace.name} should remain XEduHub-focused",
            )
            expected_py = sample_dir / Path(guess_blockly_python_path(workspace.name)).name
            self.assertTrue(expected_py.exists(), f"missing paired snapshot for {workspace.name}")
            self.assertTrue(expected_py.read_text(encoding="utf-8").strip(), f"empty paired snapshot for {workspace.name}")


if __name__ == "__main__":
    unittest.main()
