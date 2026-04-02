import json
import sys
import tempfile
import unittest
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from api.app import create_app  # noqa: E402
from services.xedu_pack_agent_service import XEduPackToolAdapter  # noqa: E402


class FakeRunner:
    def __init__(self, responses):
        self.responses = list(responses)

    def run(self, *, prompt_text, ai_config):
        if not self.responses:
            raise AssertionError("No more fake runner responses")
        return self.responses.pop(0)


class XEduPackToolAdapterTestCase(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.course_dir = Path(self.temp_dir.name) / "course"
        self.course_dir.mkdir(parents=True, exist_ok=True)
        lesson_dir = self.course_dir / "lesson1"
        lesson_dir.mkdir(parents=True, exist_ok=True)
        (lesson_dir / "guide.md").write_text("# Guide", encoding="utf-8")
        (lesson_dir / "main.ipynb").write_text("{}", encoding="utf-8")
        (lesson_dir / "app.py").write_text("print('hello')", encoding="utf-8")
        (lesson_dir / "data.csv").write_text("x,y\n1,2\n", encoding="utf-8")

        self.course = {
            "id": "course-1",
            "title": "AI导论",
            "version": "1.0",
            "local_path": str(self.course_dir),
            "source": "local",
            "sections": [
                {
                    "title": "第一课",
                    "experiments": [
                        {
                            "title": "图像分类实验",
                            "files": [
                                {"path": "lesson1/guide.md", "type": "markdown"},
                                {"path": "lesson1/main.ipynb", "type": "notebook"},
                                {"path": "lesson1/app.py", "type": "python"},
                                {"path": "lesson1/data.csv", "type": "csv"},
                            ],
                        }
                    ],
                }
            ],
        }

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_build_bundle_creates_standard_dirs(self):
        adapter = XEduPackToolAdapter(
            mutation_guard=lambda request_context: (True, ""),
            publisher=lambda local_path, options: {"result": {"ok": True}},
        )
        result = adapter.build_xedu_pack_bundle(
            request_context={"context": {"course": self.course}, "confirmed": True},
        )
        self.assertTrue(result["success"])
        output_dir = Path(result["output_dir"])
        self.assertTrue((output_dir / "01_Materials").exists())
        self.assertTrue((output_dir / "02_Lab_Env").exists())
        self.assertTrue((output_dir / "03_Data").exists())
        self.assertTrue((output_dir / "04_Notebooks").exists())
        self.assertTrue((output_dir / "README.md").exists())
        self.assertTrue(Path(result["zip_path"]).exists())


class XEduPackRouteTestCase(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.course_dir = Path(self.temp_dir.name) / "course"
        self.course_dir.mkdir(parents=True, exist_ok=True)
        lesson_dir = self.course_dir / "lesson1"
        lesson_dir.mkdir(parents=True, exist_ok=True)
        (lesson_dir / "guide.md").write_text("# Guide", encoding="utf-8")
        (lesson_dir / "main.ipynb").write_text("{}", encoding="utf-8")
        (lesson_dir / "app.py").write_text("print('hello')", encoding="utf-8")

        self.course = {
            "id": "course-1",
            "title": "AI导论",
            "version": "1.0",
            "local_path": str(self.course_dir),
            "source": "local",
            "sections": [
                {
                    "title": "第一课",
                    "experiments": [
                        {
                            "title": "图像分类实验",
                            "files": [
                                {"path": "lesson1/guide.md", "type": "markdown"},
                                {"path": "lesson1/main.ipynb", "type": "notebook"},
                                {"path": "lesson1/app.py", "type": "python"},
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

    def test_agent_route_prepare_and_build_flow(self):
        self.app.config["KIMI_AGENT_RUNNER_FACTORY"] = lambda: FakeRunner([
            json.dumps({
                "status": "tool_call",
                "assistant_message": "我先生成打包计划。",
                "tool_name": "prepare_xedu_pack_plan",
                "tool_args": {},
            }, ensure_ascii=False),
            json.dumps({
                "status": "needs_confirmation",
                "assistant_message": "将输出到 _xedu_pack 目录并生成 README 和 zip，请确认。",
            }, ensure_ascii=False),
        ])
        first = self.client.post(
            "/api/ai/ask",
            json={
                "question": "帮我把这门课按 xedu-pack 打包",
                "history": [{"role": "user", "content": "帮我把这门课按 xedu-pack 打包"}],
                "context": {"course": self.course},
                "teacher_code": "abc",
            },
        )
        self.assertEqual(first.status_code, 200)
        first_data = first.get_json()
        self.assertEqual(first_data["agent_status"], "needs_confirmation")

        self.app.config["KIMI_AGENT_RUNNER_FACTORY"] = lambda: FakeRunner([
            json.dumps({
                "status": "tool_call",
                "assistant_message": "开始生成课程包。",
                "tool_name": "build_xedu_pack_bundle",
                "tool_args": {},
            }, ensure_ascii=False),
        ])
        second = self.client.post(
            "/api/ai/ask",
            json={
                "question": "确认",
                "history": [
                    {"role": "user", "content": "帮我把这门课按 xedu-pack 打包"},
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
        self.assertIn("_xedu_pack", data["answer"])


if __name__ == "__main__":
    unittest.main()
