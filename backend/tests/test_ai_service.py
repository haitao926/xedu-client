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
