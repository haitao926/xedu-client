import json
import os
import sys
import threading
import unittest
from pathlib import Path
from unittest.mock import patch
from urllib import error as urlerror
from urllib import request as urlrequest


BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from utils.bootstrap_server import create_bootstrap_server


class BootstrapServerTestCase(unittest.TestCase):
    def setUp(self):
        self.promotion = threading.Event()
        self.repair_calls = []

        def inspect_python(executable):
            return {
                "success": True,
                "executable": executable,
                "python_version": "3.8.20",
            }

        def repair_python(executable, *, use_mirror):
            self.repair_calls.append((executable, use_mirror))
            return {
                "success": True,
                "changed": True,
                "message": "Python 环境已修复",
            }

        def promote(_server):
            self.promotion.set()

        with patch.dict(
            os.environ,
            {
                "XEDU_ALLOWED_ORIGINS": "http://127.0.0.1:3002",
                "XEDU_PIP_INDEX_URL": "https://pypi.tuna.tsinghua.edu.cn/simple",
            },
        ):
            self.server = create_bootstrap_server(
                "127.0.0.1",
                0,
                capability="test-capability",
                inspect_python=inspect_python,
                repair_python=repair_python,
                on_repair_success=promote,
            )
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.base_url = f"http://127.0.0.1:{self.server.server_port}"

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)

    def _request(self, path, *, method="GET", payload=None, token=None, origin=None):
        body = None
        headers = {}
        if payload is not None:
            body = json.dumps(payload).encode("utf-8")
            headers["Content-Type"] = "application/json"
        if token:
            headers["X-XEdu-Client-Token"] = token
        if origin:
            headers["Origin"] = origin
        request = urlrequest.Request(
            f"{self.base_url}{path}",
            data=body,
            headers=headers,
            method=method,
        )
        try:
            response = urlrequest.urlopen(request, timeout=2)
            return response.status, json.loads(response.read().decode("utf-8"))
        except urlerror.HTTPError as exc:
            return exc.code, json.loads(exc.read().decode("utf-8"))

    def test_health_is_available_without_flask_or_capability(self):
        status, payload = self._request("/api/health")

        self.assertEqual(status, 200)
        self.assertTrue(payload["bootstrap_only"])
        self.assertFalse(payload["backend_ready"])

    def test_protected_probe_requires_capability(self):
        status, payload = self._request(
            "/api/detect_python?python_executable=%2Ftmp%2Fpython"
        )

        self.assertEqual(status, 401)
        self.assertEqual(payload["message"], "unauthorized")

    def test_probe_and_repair_work_before_flask_is_installed(self):
        status, payload = self._request(
            "/api/detect_python?python_executable=%2Ftmp%2Fpython",
            token="test-capability",
            origin="http://127.0.0.1:3002",
        )
        self.assertEqual(status, 200)
        self.assertEqual(payload["info"]["python_version"], "3.8.20")

        status, payload = self._request(
            "/api/repair_xedu",
            method="POST",
            payload={"python_executable": "/tmp/python"},
            token="test-capability",
            origin="http://127.0.0.1:3002",
        )

        self.assertEqual(status, 200)
        self.assertTrue(payload["success"])
        self.assertEqual(self.repair_calls, [("/tmp/python", True)])
        self.assertTrue(self.promotion.wait(timeout=2))

    def test_normal_api_routes_report_recovery_mode_instead_of_not_found(self):
        status, payload = self._request(
            "/api/status",
            token="test-capability",
            origin="http://127.0.0.1:3002",
        )

        self.assertEqual(status, 503)
        self.assertEqual(payload["code"], "XEDU_BOOTSTRAP_MODE")
        self.assertFalse(payload["backend_ready"])

        status, payload = self._request(
            "/api/start",
            method="POST",
            payload={},
            token="test-capability",
            origin="http://127.0.0.1:3002",
        )

        self.assertEqual(status, 503)
        self.assertEqual(payload["code"], "XEDU_BOOTSTRAP_MODE")

    def test_untrusted_browser_origin_is_rejected(self):
        status, payload = self._request(
            "/api/repair_xedu",
            method="POST",
            payload={"python_executable": "/tmp/python"},
            token="test-capability",
            origin="http://evil.example",
        )

        self.assertEqual(status, 403)
        self.assertEqual(payload["message"], "forbidden")
        self.assertEqual(self.repair_calls, [])


if __name__ == "__main__":
    unittest.main()
