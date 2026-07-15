import base64
import io
import sys
import unittest
from pathlib import Path

from PIL import Image


BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from models.config import AIConfig  # noqa: E402
from services.ai_service import AIService  # noqa: E402


class AIServiceTestCase(unittest.TestCase):
    def setUp(self):
        self.service = AIService(
            AIConfig(
                api_key="test-key",
                base_url="https://api.openai.com/v1",
                model="gpt-4o-mini",
            )
        )

    def test_process_image_supports_rgba_input(self):
        image = Image.new("RGBA", (16, 16), (255, 0, 0, 128))
        buffer = io.BytesIO()
        image.save(buffer, format="PNG")
        image_data = base64.b64encode(buffer.getvalue()).decode("utf-8")

        processed = self.service._process_image(image_data)

        self.assertTrue(processed)
        decoded = base64.b64decode(processed)
        converted = Image.open(io.BytesIO(decoded))
        self.assertEqual(converted.mode, "RGB")

    def test_prepare_messages_keeps_openai_compatible_image_content(self):
        image = Image.new("RGB", (8, 8), (0, 255, 0))
        buffer = io.BytesIO()
        image.save(buffer, format="PNG")
        image_data = base64.b64encode(buffer.getvalue()).decode("utf-8")

        messages = self.service._prepare_messages(
            "请识别这张图片",
            image_data=image_data,
            history=[],
            request_context={"experience_mode": "student"},
        )

        user_message = messages[-1]
        self.assertEqual(user_message["role"], "user")
        self.assertIsInstance(user_message["content"], list)
        self.assertEqual(user_message["content"][0]["type"], "text")
        self.assertEqual(user_message["content"][1]["type"], "image_url")
        self.assertTrue(user_message["content"][1]["image_url"]["url"].startswith("data:image/jpeg;base64,"))

    def test_prepare_messages_includes_student_experiment_context(self):
        messages = self.service._prepare_messages(
            "这个实验要做什么？",
            request_context={
                "experience_mode": "student",
                "context": {
                    "course": {"id": "demo", "title": "图像识别"},
                    "experiment_context": {
                        "section": {"title": "第1课"},
                        "experiment": {
                            "title": "像素魔术师",
                            "description": "理解像素和 RGB",
                        },
                        "entries": {
                            "html": {"path": "lesson1/exp1/index.html"},
                            "blockly": {"path": "lesson1/exp1/blockly/workspace.json"},
                            "notebook": {"path": "lesson1/exp1/main.ipynb"},
                            "python": None,
                        },
                    },
                },
            },
        )

        joined = "\n".join(str(message.get("content", "")) for message in messages)
        self.assertIn("XEdu 学习助手", joined)
        self.assertIn("像素魔术师", joined)
        self.assertIn("lesson1/exp1/main.ipynb", joined)
        self.assertIn("不要执行教师管理", joined)

    def test_prepare_openai_payload_preserves_multimodal_message_content(self):
        payload = self.service._prepare_openai_payload([
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": "看图说话"},
                    {"type": "image_url", "image_url": {"url": "data:image/jpeg;base64,abc"}},
                ],
            }
        ])

        self.assertEqual(payload["model"], "gpt-4o-mini")
        self.assertIsInstance(payload["messages"][0]["content"], list)
        self.assertEqual(payload["messages"][0]["content"][1]["type"], "image_url")


if __name__ == "__main__":
    unittest.main()
