import sys
import unittest
from pathlib import Path
from types import SimpleNamespace

from flask import Flask


BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from api.routes.ai import register_ai_routes  # noqa: E402


class _FakeAIService:
    def __init__(self):
        self.config = SimpleNamespace(api_key="test-key")

    def ask_question(self, question, image_data, history, request_context=None):
        return {"success": True, "route": "default", "question": question}

    def test_connection(self):
        return {"success": True}


class _FakeAgentService:
    def __init__(self, route_name: str):
        self.route_name = route_name

    def chat(self, **kwargs):
        return {"success": True, "route": self.route_name}


class AIRoutingAPITestCase(unittest.TestCase):
    def setUp(self):
        self.app = Flask(__name__)
        self.app.testing = True

        def _build_services(looks_quickform, looks_blockly):
            return {
                "build_ai_service": lambda overrides=None: _FakeAIService(),
                "build_quickform_agent_service": lambda overrides=None: _FakeAgentService("quickform"),
                "build_xedu_pack_agent_service": lambda overrides=None: _FakeAgentService("xedu-pack"),
                "build_blockly_builder_agent_service": lambda overrides=None: _FakeAgentService("blockly"),
                "looks_like_confirmation": lambda text: False,
                "looks_like_quickform_request": looks_quickform,
                "looks_like_xedu_pack_request": lambda text, history=None: False,
                "looks_like_blockly_builder_request": looks_blockly,
                "get_app_config": lambda: SimpleNamespace(ai=None),
                "config_service": SimpleNamespace(save_config=lambda _: True),
                "ai_service": _FakeAIService(),
            }

        self._build_services = _build_services

    def _build_client(self, looks_quickform, looks_blockly):
        app = Flask(__name__)
        app.testing = True
        register_ai_routes(app, self._build_services(looks_quickform, looks_blockly))
        return app.test_client()

    def test_quickform_has_priority_when_multiple_match(self):
        client = self._build_client(
            looks_quickform=lambda text, history=None: True,
            looks_blockly=lambda text, history=None: True,
        )
        response = client.post("/api/ai/ask", json={"question": "帮我绑定 quickform"})
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertNotIn("route", data)
        self.assertIn("说明和导航", data["answer"])

    def test_teacher_skill_like_request_returns_navigation_guidance(self):
        client = self._build_client(
            looks_quickform=lambda text, history=None: False,
            looks_blockly=lambda text, history=None: True,
        )
        response = client.post("/api/ai/ask", json={"question": "生成积木实验"})
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertNotIn("route", data)
        self.assertIn("不会直接生成 Blockly 草稿", data["answer"])

    def test_fallback_to_default_ai_when_no_agent_route_matches(self):
        client = self._build_client(
            looks_quickform=lambda text, history=None: False,
            looks_blockly=lambda text, history=None: False,
        )
        response = client.post("/api/ai/ask", json={"question": "你好"})
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertEqual(data["route"], "default")

    def test_student_mode_blocks_teacher_agent_routes(self):
        client = self._build_client(
            looks_quickform=lambda text, history=None: True,
            looks_blockly=lambda text, history=None: False,
        )
        response = client.post("/api/ai/ask", json={
            "question": "帮我接入 quickform",
            "context": {
                "experience_mode": "student",
                "teacher_mode": {"unlocked": False},
            },
        })
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertNotIn("route", data)
        self.assertIn("学习模式", data["answer"])


if __name__ == "__main__":
    unittest.main()
