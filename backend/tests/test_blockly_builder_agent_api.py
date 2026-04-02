import json
import sys
import tempfile
import unittest
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from api.app import create_app  # noqa: E402


class FakeRunner:
    def __init__(self, responses):
        self.responses = list(responses)

    def run(self, *, prompt_text, ai_config):
        if not self.responses:
            raise AssertionError('No more fake runner responses')
        return self.responses.pop(0)


class BlocklyBuilderRouteTestCase(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        app = create_app(Path(self.temp_dir.name))
        app.testing = True
        self.app = app
        self.client = app.test_client()
        self.client.post(
            '/api/save_config',
            json={
                'ui': {'classroom_teacher_code': 'abc'},
                'ai': {
                    'api_key': 'test-key',
                    'base_url': 'https://api.moonshot.ai/v1',
                    'model': 'kimi-k2-thinking-turbo',
                },
            },
        )

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_blockly_builder_prepare_and_apply_flow(self):
        self.app.config['KIMI_AGENT_RUNNER_FACTORY'] = lambda: FakeRunner([
            json.dumps({
                'status': 'tool_call',
                'assistant_message': '我先生成 Blockly 方案。',
                'tool_name': 'prepare_blockly_builder_plan',
                'tool_args': {'request_text': '帮我生成一个 XEduHub Blockly 图像分类实验'},
            }, ensure_ascii=False),
            json.dumps({
                'status': 'needs_confirmation',
                'assistant_message': '将生成 toolbox、workspace 和 runtime 配置，请确认。',
            }, ensure_ascii=False),
        ])
        first = self.client.post(
            '/api/ai/ask',
            json={
                'question': '帮我生成一个 XEduHub Blockly 图像分类实验',
                'history': [{'role': 'user', 'content': '帮我生成一个 XEduHub Blockly 图像分类实验'}],
                'context': {'teacher_mode': {'unlocked': True, 'code': 'abc'}},
                'teacher_code': 'abc',
            },
        )
        self.assertEqual(first.status_code, 200)
        first_data = first.get_json()
        self.assertEqual(first_data['agent_status'], 'needs_confirmation')
        self.assertIn('toolbox', first_data['answer'])

        self.app.config['KIMI_AGENT_RUNNER_FACTORY'] = lambda: FakeRunner([
            json.dumps({
                'status': 'tool_call',
                'assistant_message': '开始生成草稿文件。',
                'tool_name': 'apply_blockly_builder_plan',
                'tool_args': {'request_text': '帮我生成一个 XEduHub Blockly 图像分类实验'},
            }, ensure_ascii=False),
        ])
        second = self.client.post(
            '/api/ai/ask',
            json={
                'question': '确认',
                'history': [
                    {'role': 'user', 'content': '帮我生成一个 XEduHub Blockly 图像分类实验'},
                    {'role': 'assistant', 'content': first_data['answer']},
                    {'role': 'user', 'content': '确认'},
                ],
                'context': {'teacher_mode': {'unlocked': True, 'code': 'abc'}},
                'teacher_code': 'abc',
            },
        )
        self.assertEqual(second.status_code, 200)
        data = second.get_json()
        self.assertTrue(data['success'])
        self.assertEqual(data['agent_status'], 'completed')
        result = data['agent_result']
        self.assertTrue(Path(result['output_dir']).exists())
        self.assertEqual(len(result['generated_files']), 3)
        self.assertTrue(any(path.endswith('.toolbox.json') for path in result['generated_files']))
        self.assertTrue(any(path.endswith('.blockly.xml') for path in result['generated_files']))
        self.assertIn('pedagogy_profile', result)
        self.assertEqual(result['pedagogy_profile'].get('level_default'), 'L1')
        self.assertTrue(isinstance(result.get('default_blocks'), list))

    def test_blockly_builder_python_to_blockly_pack_flow(self):
        self.app.config['KIMI_AGENT_RUNNER_FACTORY'] = lambda: FakeRunner([
            json.dumps({
                'status': 'tool_call',
                'assistant_message': '先做 Python 到 Blockly 的转换计划。',
                'tool_name': 'prepare_python_to_blockly_pack',
                'tool_args': {
                    'title': '循环与条件示例',
                    'python_code': 'x=1\\nfor i in range(0,3):\\n  print(i)\\nif x>0:\\n  print(\"ok\")',
                },
            }, ensure_ascii=False),
            json.dumps({
                'status': 'needs_confirmation',
                'assistant_message': '将写入三件套，请确认。',
            }, ensure_ascii=False),
        ])
        first = self.client.post(
            '/api/ai/ask',
            json={
                'question': '把这段 Python 生成 Blockly 积木包',
                'history': [{'role': 'user', 'content': '把这段 Python 生成 Blockly 积木包'}],
                'context': {'teacher_mode': {'unlocked': True, 'code': 'abc'}},
                'teacher_code': 'abc',
            },
        )
        self.assertEqual(first.status_code, 200)
        first_data = first.get_json()
        self.assertEqual(first_data['agent_status'], 'needs_confirmation')

        self.app.config['KIMI_AGENT_RUNNER_FACTORY'] = lambda: FakeRunner([
            json.dumps({
                'status': 'tool_call',
                'assistant_message': '开始写入 Python->Blockly 草稿。',
                'tool_name': 'apply_python_to_blockly_pack',
                'tool_args': {
                    'title': '循环与条件示例',
                    'python_code': 'x=1\\nfor i in range(0,3):\\n  print(i)\\nif x>0:\\n  print(\"ok\")',
                },
            }, ensure_ascii=False),
        ])
        second = self.client.post(
            '/api/ai/ask',
            json={
                'question': '确认',
                'history': [
                    {'role': 'user', 'content': '把这段 Python 生成 Blockly 积木包'},
                    {'role': 'assistant', 'content': first_data['answer']},
                    {'role': 'user', 'content': '确认'},
                ],
                'context': {'teacher_mode': {'unlocked': True, 'code': 'abc'}},
                'teacher_code': 'abc',
            },
        )
        self.assertEqual(second.status_code, 200)
        data = second.get_json()
        self.assertTrue(data['success'])
        self.assertEqual(data['agent_status'], 'completed')
        result = data['agent_result']
        self.assertEqual(len(result['generated_files']), 3)
        self.assertTrue(any(path.endswith('.toolbox.json') for path in result['generated_files']))
        self.assertTrue(any(path.endswith('.blockly.xml') for path in result['generated_files']))
        self.assertTrue(any(path.endswith('.runtime.json') for path in result['generated_files']))
        self.assertIn('pedagogy_profile', result)
        self.assertEqual(result['pedagogy_profile'].get('level_default'), 'L1')
        self.assertTrue(isinstance(result.get('default_blocks'), list))


if __name__ == '__main__':
    unittest.main()
