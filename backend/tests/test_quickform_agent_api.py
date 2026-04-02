import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from api.app import create_app  # noqa: E402
from services.quickform_agent_service import QuickFormAgentToolAdapter  # noqa: E402


class FakeResponse:
    def __init__(self, status_code=200, data=None):
        self.status_code = status_code
        self._data = data or {}

    def json(self):
        return self._data


class FakeQuickFormService:
    def __init__(self):
        self.base_url = "https://quickform.cn"
        self.username = "teacher1"
        self.password = "secret"

    def list_tasks(self):
        return []

    def create_task(self, task_name, task_intro=""):
        return type(
            "Task",
            (),
            {
                "to_dict": lambda self: {
                    "apiid": "abc123",
                    "task_name": task_name,
                    "task_intro": task_intro,
                    "submit_url": "https://quickform.cn/api/abc123",
                    "query_url": "https://quickform.cn/api/abc123/all",
                    "summary_url": "https://quickform.cn/api/abc123",
                    "report_url": "",
                }
            },
        )()


class FakeRunner:
    def __init__(self, responses):
        self.responses = list(responses)

    def run(self, *, prompt_text, ai_config):
        if not self.responses:
            raise AssertionError("No more fake runner responses")
        return self.responses.pop(0)


class QuickFormAgentToolAdapterTestCase(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.course_dir = Path(self.temp_dir.name) / "course"
        self.course_dir.mkdir(parents=True, exist_ok=True)

    def tearDown(self):
        self.temp_dir.cleanup()

    def _build_adapter(self):
        return QuickFormAgentToolAdapter(
            quickform_factory=lambda: FakeQuickFormService(),
            mutation_guard=lambda request_context: (True, ""),
            html_injector=lambda local_path, html_path, quickform, create_backup: {
                "html_path": html_path,
                "backup_path": "",
            },
            course_saver=lambda local_path, course: {"course": course, "summary": {"saved": True}},
        )

    def _build_context(self, files):
        return {
            "context": {
                "course": {
                    "id": "course-1",
                    "title": "AI导论",
                    "local_path": str(self.course_dir),
                    "source": "local",
                    "sections": [
                        {
                            "title": "第一课",
                            "experiments": [
                                {
                                    "title": "图像分类实验",
                                    "files": files,
                                }
                            ],
                        }
                    ],
                }
            },
            "confirmed": False,
        }

    def test_settings_status_hides_password(self):
        adapter = self._build_adapter()
        result = adapter.get_quickform_settings_status(request_context={})
        self.assertTrue(result["success"])
        self.assertTrue(result["password_configured"])
        self.assertNotIn("secret", json.dumps(result, ensure_ascii=False))

    def test_prepare_plan_requires_html_when_multiple_candidates(self):
        adapter = self._build_adapter()
        request_context = self._build_context([
            {"path": "lesson1/a.html", "type": "html"},
            {"path": "lesson1/b.html", "type": "html"},
        ])
        result = adapter.prepare_quickform_binding_plan(
            request_context=request_context,
            section_index=1,
            experiment_index=1,
        )
        self.assertFalse(result["success"])
        self.assertTrue(result["needs_input"])
        self.assertEqual(len(result["html_candidates"]), 2)


class QuickFormAgentRouteTestCase(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.course_dir = Path(self.temp_dir.name) / "course"
        self.course_dir.mkdir(parents=True, exist_ok=True)
        html_dir = self.course_dir / "lesson1"
        html_dir.mkdir(parents=True, exist_ok=True)
        (html_dir / "index.html").write_text(
            "<html><body><form data-xedu-quickform-submit></form></body></html>",
            encoding="utf-8",
        )
        self.course = {
            "id": "course-1",
            "title": "AI导论",
            "local_path": str(self.course_dir),
            "source": "local",
            "sections": [
                {
                    "title": "第一课",
                    "experiments": [
                        {
                            "title": "图像分类实验",
                            "description": "",
                            "files": [
                                {"path": "lesson1/index.html", "type": "html"},
                            ],
                        }
                    ],
                }
            ],
        }
        app = create_app(Path(self.temp_dir.name))
        app.testing = True
        self.app = app
        self.client = app.test_client()

        self.client.post(
            "/api/save_config",
            json={
                "ui": {
                    "quickform": {
                        "enabled": True,
                        "base_url": "https://quickform.cn",
                        "username": "teacher1",
                        "password": "secret",
                    },
                    "classroom_teacher_code": "abc",
                },
                "ai": {
                    "api_key": "test-key",
                    "base_url": "https://api.moonshot.ai/v1",
                    "model": "kimi-k2-thinking-turbo",
                },
            },
        )

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_agent_route_prepare_and_apply_flow(self):
        self.app.config["KIMI_AGENT_RUNNER_FACTORY"] = lambda: FakeRunner([
            json.dumps({
                "status": "tool_call",
                "assistant_message": "我先生成执行计划。",
                "tool_name": "prepare_quickform_binding_plan",
                "tool_args": {
                    "section_index": 1,
                    "experiment_index": 1,
                },
            }, ensure_ascii=False),
            json.dumps({
                "status": "needs_confirmation",
                "assistant_message": "将为图像分类实验创建 QuickForm 任务并注入 lesson1/index.html，请确认。",
            }, ensure_ascii=False),
        ])

        first = self.client.post(
            "/api/ai/ask",
            json={
                "question": "帮我给第1课第1个实验接入 QuickForm",
                "history": [{"role": "user", "content": "帮我给第1课第1个实验接入 QuickForm"}],
                "context": {"course": self.course},
                "teacher_code": "abc",
            },
        )
        self.assertEqual(first.status_code, 200)
        first_data = first.get_json()
        self.assertTrue(first_data["success"])
        self.assertEqual(first_data["agent_status"], "needs_confirmation")

        self.app.config["KIMI_AGENT_RUNNER_FACTORY"] = lambda: FakeRunner([
            json.dumps({
                "status": "tool_call",
                "assistant_message": "开始执行绑定。",
                "tool_name": "apply_quickform_binding",
                "tool_args": {
                    "section_index": 1,
                    "experiment_index": 1,
                },
            }, ensure_ascii=False),
        ])

        with patch("services.quickform_service.requests.post") as post_mock:
            post_mock.return_value = FakeResponse(
                200,
                {
                    "success": True,
                    "apiid": "abc123",
                },
            )
            second = self.client.post(
                "/api/ai/ask",
                json={
                    "question": "确认",
                    "history": [
                        {"role": "user", "content": "帮我给第1课第1个实验接入 QuickForm"},
                        {"role": "assistant", "content": first_data["answer"]},
                        {"role": "user", "content": "确认"},
                    ],
                    "context": {"course": self.course},
                    "teacher_code": "abc",
                },
            )

        self.assertEqual(second.status_code, 200)
        data = second.get_json()
        self.assertTrue(data["success"])
        self.assertEqual(data["agent_status"], "completed")
        self.assertEqual(data["course"]["sections"][0]["experiments"][0]["quickform"]["apiid"], "abc123")
        updated_html = (self.course_dir / "lesson1" / "index.html").read_text(encoding="utf-8")
        self.assertIn("XEDU_QUICKFORM_START", updated_html)


if __name__ == "__main__":
    unittest.main()
