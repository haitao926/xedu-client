import base64
import io
import sys
import unittest
from pathlib import Path
from unittest.mock import Mock

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
        payload = self.service._prepare_chat_completions_payload([
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
        self.assertEqual(set(payload), {"model", "messages"})

    def test_prepare_chat_completions_payload_uses_provider_defaults(self):
        service = AIService(
            AIConfig(
                api_key="test-key",
                base_url="https://api.moonshot.cn/v1",
                model="kimi-k3",
            )
        )

        payload = service._prepare_chat_completions_payload([
            {"role": "user", "content": "你好"},
        ])

        self.assertEqual(payload["model"], "kimi-k3")
        self.assertEqual(set(payload), {"model", "messages"})

    def test_prepare_responses_payload_converts_multimodal_message_content(self):
        payload = self.service._prepare_responses_payload([
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": "看图说话"},
                    {"type": "image_url", "image_url": {"url": "data:image/jpeg;base64,abc"}},
                ],
            }
        ])

        self.assertEqual(payload["model"], "gpt-4o-mini")
        self.assertEqual(payload["input"][0]["role"], "user")
        self.assertEqual(payload["input"][0]["content"][0]["type"], "input_text")
        self.assertEqual(payload["input"][0]["content"][1]["type"], "input_image")
        self.assertEqual(set(payload), {"model", "input"})

    def test_resolve_api_mode_auto_uses_responses_for_official_openai(self):
        self.assertEqual(self.service._resolve_api_mode(), "responses")

    def test_resolve_api_mode_explicit_responses_supports_proxy_gateways(self):
        service = AIService(
            AIConfig(
                api_key="test-key",
                base_url="https://gateway.example.com/v1",
                model="gpt-4.1-mini",
                api_mode="responses",
            )
        )
        self.assertEqual(service._resolve_api_mode(), "responses")

    def test_resolve_api_mode_uses_chat_for_native_chat_providers(self):
        providers = [
            ("https://api.moonshot.cn/v1", "kimi-k3"),
            ("https://api.deepseek.com", "deepseek-v4-pro"),
        ]

        for base_url, model in providers:
            with self.subTest(base_url=base_url):
                service = AIService(
                    AIConfig(
                        api_key="test-key",
                        base_url=base_url,
                        model=model,
                        api_mode="responses",
                    )
                )
                self.assertEqual(service._resolve_api_mode(), "chat_completions")

    def test_extract_responses_text_reads_output_text_blocks(self):
        text = self.service._extract_responses_text({
            "output": [
                {
                    "type": "message",
                    "role": "assistant",
                    "content": [
                        {"type": "output_text", "text": "第一段"},
                        {"type": "output_text", "text": "第二段"},
                    ],
                }
            ]
        })

        self.assertEqual(text, "第一段\n第二段")

    def test_call_ai_api_uses_responses_endpoint_for_openai(self):
        mocked_response = Mock()
        mocked_response.status_code = 200
        mocked_response.json.return_value = {
            "output": [
                {
                    "type": "message",
                    "role": "assistant",
                    "content": [{"type": "output_text", "text": "你好"}],
                }
            ],
            "usage": {"total_tokens": 12},
        }
        self.service.session.post = Mock(return_value=mocked_response)

        result = self.service._call_ai_api([{"role": "user", "content": "你好"}])

        self.assertTrue(result["success"])
        self.assertEqual(result["content"], "你好")
        self.service.session.post.assert_called_once()
        called_url = self.service.session.post.call_args.args[0]
        self.assertTrue(called_url.endswith("/responses"))

    def test_call_ai_api_uses_provider_defaults_for_kimi(self):
        service = AIService(
            AIConfig(
                api_key="test-key",
                base_url="https://api.moonshot.cn/v1",
                model="kimi-k3",
            )
        )
        mocked_response = Mock()
        mocked_response.status_code = 200
        mocked_response.json.return_value = {
            "choices": [{"message": {"content": "你好"}}],
            "usage": {"total_tokens": 12},
        }
        service.session.post = Mock(return_value=mocked_response)

        result = service._call_ai_api([{"role": "user", "content": "你好"}])

        self.assertTrue(result["success"])
        called_url = service.session.post.call_args.args[0]
        called_payload = service.session.post.call_args.kwargs["json"]
        self.assertTrue(called_url.endswith("/chat/completions"))
        self.assertEqual(set(called_payload), {"model", "messages"})

    def test_call_ai_api_uses_chat_completions_for_deepseek(self):
        service = AIService(
            AIConfig(
                api_key="test-key",
                base_url="https://api.deepseek.com",
                model="deepseek-v4-pro",
                api_mode="responses",
            )
        )
        mocked_response = Mock()
        mocked_response.status_code = 200
        mocked_response.json.return_value = {
            "choices": [{"message": {"content": "你好"}}],
            "usage": {"total_tokens": 12},
        }
        service.session.post = Mock(return_value=mocked_response)

        result = service._call_ai_api([{"role": "user", "content": "你好"}])

        self.assertTrue(result["success"])
        called_url = service.session.post.call_args.args[0]
        called_payload = service.session.post.call_args.kwargs["json"]
        self.assertEqual(called_url, "https://api.deepseek.com/chat/completions")
        self.assertEqual(set(called_payload), {"model", "messages"})

    def test_call_ai_api_handles_string_provider_errors(self):
        service = AIService(
            AIConfig(
                api_key="test-key",
                base_url="https://api.moonshot.cn/v1",
                model="kimi-k3",
                api_mode="responses",
            )
        )
        mocked_response = Mock()
        mocked_response.status_code = 400
        mocked_response.json.return_value = {"error": "unsupported endpoint"}
        service.session.post = Mock(return_value=mocked_response)

        result = service._call_ai_api([{"role": "user", "content": "你好"}])

        self.assertFalse(result["success"])
        self.assertEqual(result["error"], "AI API 调用失败: 400 - unsupported endpoint")


if __name__ == "__main__":
    unittest.main()
