import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch


BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from api.app import create_app  # noqa: E402
from runtime.blockly_runtime import XEduCamera  # noqa: E402


class FakePopen:
    def __init__(self, lines, return_code):
        self.stdout = lines
        self._return_code = return_code

    def wait(self):
        return self._return_code


class PipApiTestCase(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.python_path = '/tmp/xedu-python'
        app = create_app(Path(self.temp_dir.name))
        app.testing = True
        self.client = app.test_client()

    def tearDown(self):
        self.temp_dir.cleanup()

    def post(self, payload, buffered=True):
        return self.client.post('/api/python/pip', json=payload, buffered=buffered)

    def post_run(self, payload):
        return self.client.post('/api/python/run', json=payload)

    def test_install_uses_mirror(self):
        completed = SimpleNamespace(returncode=0, stdout='ok', stderr='')
        with patch('api.routes.python.subprocess.run', return_value=completed) as run_mock:
            response = self.post({
                'action': 'install',
                'package': 'pyfiglet==1.0.4',
                'use_mirror': True,
                'index_url': 'https://mirror.example/simple',
                'python_executable': self.python_path,
            })

        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertTrue(data['success'])
        self.assertEqual(
            run_mock.call_args.args[0],
            [
                self.python_path,
                '-m',
                'pip',
                'install',
                'pyfiglet==1.0.4',
                '-i',
                'https://mirror.example/simple',
            ],
        )

    def test_upgrade_uses_upgrade_flag(self):
        completed = SimpleNamespace(returncode=0, stdout='ok', stderr='')
        with patch('api.routes.python.subprocess.run', return_value=completed) as run_mock:
            response = self.post({
                'action': 'upgrade',
                'package': 'pyfiglet',
                'use_mirror': True,
                'python_executable': self.python_path,
            })

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            run_mock.call_args.args[0],
            [
                self.python_path,
                '-m',
                'pip',
                'install',
                '--upgrade',
                'pyfiglet',
                '-i',
                'https://pypi.tuna.tsinghua.edu.cn/simple',
            ],
        )

    def test_uninstall_does_not_append_mirror(self):
        completed = SimpleNamespace(returncode=0, stdout='ok', stderr='')
        with patch('api.routes.python.subprocess.run', return_value=completed) as run_mock:
            response = self.post({
                'action': 'uninstall',
                'package': 'pyfiglet',
                'use_mirror': True,
                'python_executable': self.python_path,
            })

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            run_mock.call_args.args[0],
            [
                self.python_path,
                '-m',
                'pip',
                'uninstall',
                '-y',
                'pyfiglet',
            ],
        )

    def test_stream_response_includes_machine_readable_result(self):
        fake_proc = FakePopen(['line 1\n', 'line 2\n'], 1)
        with patch('api.routes.python.subprocess.Popen', return_value=fake_proc):
            response = self.post({
                'action': 'install',
                'package': 'missing-package',
                'use_mirror': False,
                'stream': True,
                'python_executable': self.python_path,
            }, buffered=False)

            body = ''.join(
                chunk.decode('utf-8') if isinstance(chunk, bytes) else chunk
                for chunk in response.response
            )

        self.assertEqual(response.status_code, 200)
        self.assertIn('=== 退出码: 1 ===', body)
        marker_line = next(
            line for line in body.splitlines() if line.startswith('__XEDU_PIP_RESULT__=')
        )
        result = json.loads(marker_line.split('=', 1)[1])
        self.assertEqual(result, {'return_code': 1, 'success': False})

    def test_run_python_executes_code(self):
        completed = SimpleNamespace(returncode=0, stdout='你好\n', stderr='')
        with patch('api.routes.python.subprocess.run', return_value=completed) as run_mock:
            response = self.post_run({
                'code': "print('你好')",
                'python_executable': self.python_path,
                'project_root': self.temp_dir.name,
            })

        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertTrue(data['success'])
        self.assertEqual(data['output'], '你好')
        self.assertEqual(run_mock.call_args.args[0], [self.python_path, '-c', "print('你好')"])
        self.assertEqual(run_mock.call_args.kwargs['cwd'], self.temp_dir.name)

    def test_run_python_injects_backend_pythonpath(self):
        completed = SimpleNamespace(returncode=0, stdout='ok\n', stderr='')
        with patch('api.routes.python.subprocess.run', return_value=completed) as run_mock:
            response = self.post_run({
                'code': "print('ok')",
                'python_executable': self.python_path,
                'project_root': self.temp_dir.name,
            })

        self.assertEqual(response.status_code, 200)
        env = run_mock.call_args.kwargs['env']
        pythonpath = env.get('PYTHONPATH', '')
        self.assertIn(str(BACKEND_DIR), pythonpath.split(os.pathsep))
        self.assertEqual(env.get('MPLBACKEND'), 'Agg')

    def test_run_python_stream_payload_is_structured_for_camera_permission_failure(self):
        completed = SimpleNamespace(
            returncode=0,
            stdout="__XEDU_RUNTIME__={'type': 'stream_opened', 'stream_kind': 'camera', 'source': '0', 'window': 'demo'}\n",
            stderr="OpenCV: not authorized to capture video (status 0), requesting...\nOpenCV: camera failed to properly initialize!\n",
        )
        with patch('api.routes.python.subprocess.run', return_value=completed):
            response = self.post_run({
                'code': "camera = xrt.XEduCamera.camera(0)\n",
                'python_executable': self.python_path,
                'project_root': self.temp_dir.name,
            })

        self.assertEqual(response.status_code, 400)
        data = response.get_json()
        self.assertFalse(data['success'])
        self.assertEqual(data['result']['stream_status'], 'permission_denied')
        self.assertEqual(data['result']['stream_kind'], 'camera')
        self.assertEqual(data['result_summary']['headline'], '摄像头权限未授权')
        self.assertTrue(any('摄像头权限' in hint for hint in data['result_summary']['hints']))

    def test_run_python_stream_payload_marks_video_end(self):
        completed = SimpleNamespace(
            returncode=0,
            stdout="\n".join([
                "__XEDU_RUNTIME__={'type': 'stream_opened', 'stream_kind': 'video', 'source': 'demo.mp4', 'window': 'demo'}",
                "__XEDU_RUNTIME__={'type': 'stream_result', 'result': {'boxes': 1}}",
                "__XEDU_RUNTIME__={'type': 'stream_closed', 'stream_kind': 'video', 'source': 'demo.mp4', 'reason': 'stream_ended'}",
                "视频流已结束",
            ]),
            stderr="",
        )
        with patch('api.routes.python.subprocess.run', return_value=completed):
            response = self.post_run({
                'code': "video = xrt.XEduCamera.video('demo.mp4')\n",
                'python_executable': self.python_path,
                'project_root': self.temp_dir.name,
            })

        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertEqual(data['result']['stream_status'], 'stream_ended')
        self.assertEqual(data['result_summary']['headline'], '视频流已自然结束')
        self.assertEqual(data['result']['output'], {'boxes': 1})

    def test_runtime_video_alias_resolves_repo_sample_path(self):
        camera = XEduCamera.__new__(XEduCamera)
        resolved = camera._normalize_source('demo.mp4', stream_kind='video')
        self.assertTrue(str(resolved).endswith('.mp4'))
        self.assertTrue(Path(resolved).exists())

    def test_runtime_video_alias_enables_generated_demo_video(self):
        camera = XEduCamera.__new__(XEduCamera)
        self.assertTrue(camera._should_materialize_demo_video('demo.mp4'))
        self.assertFalse(camera._should_materialize_demo_video('lesson.mp4'))

    def test_run_python_rejects_empty_code(self):
        response = self.post_run({'code': '   '})
        self.assertEqual(response.status_code, 400)
        data = response.get_json()
        self.assertFalse(data['success'])
        self.assertIn('代码不能为空', data['message'])


if __name__ == '__main__':
    unittest.main()
