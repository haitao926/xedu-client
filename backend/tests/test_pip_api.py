import json
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

    def test_install_uses_mirror(self):
        completed = SimpleNamespace(returncode=0, stdout='ok', stderr='')
        with patch('api.app.subprocess.run', return_value=completed) as run_mock:
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
        with patch('api.app.subprocess.run', return_value=completed) as run_mock:
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
        with patch('api.app.subprocess.run', return_value=completed) as run_mock:
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
        with patch('api.app.subprocess.Popen', return_value=fake_proc):
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


if __name__ == '__main__':
    unittest.main()
