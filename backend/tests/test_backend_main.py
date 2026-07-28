import os
import socket
import subprocess
import sys
import tempfile
import time
from urllib import parse as urlparse
from urllib import request as urlrequest
import unittest
from pathlib import Path
from unittest.mock import patch


BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

import backend_main


class BackendBootstrapEntryTestCase(unittest.TestCase):
    def test_missing_backend_dependencies_enter_recovery_before_installing_flask(self):
        with patch.dict(os.environ, {"XEDU_API_PORT": "5198"}, clear=False), patch(
            "backend_main.missing_backend_packages",
            return_value=["Flask"],
        ), patch("backend_main.ensure_backend_dependencies") as install_mock, patch(
            "backend_main.run_bootstrap_recovery_server"
        ) as recovery_mock:
            backend_main.main()

        install_mock.assert_not_called()
        recovery_mock.assert_called_once_with(5198)

    def test_backend_entry_exposes_recovery_api_without_site_packages(self):
        """The real entry point must remain repairable before Flask is importable."""
        with socket.socket() as probe_socket:
            probe_socket.bind(("127.0.0.1", 0))
            port = probe_socket.getsockname()[1]

        with tempfile.TemporaryDirectory() as temp_dir:
            environment = {
                **os.environ,
                "PYTHONPATH": str(BACKEND_DIR),
                "XEDU_API_PORT": str(port),
                "XEDU_BACKEND_BIND_HOST": "127.0.0.1",
                "XEDU_CLIENT_CAPABILITY": "backend-test-capability",
                "XEDU_ALLOWED_ORIGINS": "http://127.0.0.1:3002",
                "XEDU_LOG_DIR": temp_dir,
                "XEDU_DATA_DIR": temp_dir,
            }
            process = subprocess.Popen(
                [sys.executable, "-S", str(BACKEND_DIR / "backend_main.py")],
                cwd=str(BACKEND_DIR.parent),
                env=environment,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
            )
            output = ""
            try:
                deadline = time.monotonic() + 8
                health = None
                while time.monotonic() < deadline:
                    try:
                        with urlrequest.urlopen(
                            f"http://127.0.0.1:{port}/api/health",
                            timeout=0.5,
                        ) as response:
                            health = response.read().decode("utf-8")
                            break
                    except OSError:
                        if process.poll() is not None:
                            break
                        time.sleep(0.1)

                self.assertIsNotNone(health, "bootstrap server did not start")
                self.assertIn('"bootstrap_only": true', health)

                probe_url = (
                    f"http://127.0.0.1:{port}/api/detect_python?python_executable="
                    f"{urlparse.quote(sys.executable, safe='')}"
                )
                probe_request = urlrequest.Request(
                    probe_url,
                    headers={
                        "X-XEdu-Client-Token": "backend-test-capability",
                        "Origin": "http://127.0.0.1:3002",
                    },
                )
                with urlrequest.urlopen(probe_request, timeout=2) as response:
                    self.assertEqual(response.status, 200)
                    self.assertIn('"success": true', response.read().decode("utf-8"))
            finally:
                process.terminate()
                try:
                    output = process.communicate(timeout=3)[0]
                except subprocess.TimeoutExpired:
                    process.kill()
                    output = process.communicate()[0]
                if process.returncode not in (0, -15):
                    self.fail(f"bootstrap process exited unexpectedly: {process.returncode}\n{output}")


if __name__ == "__main__":
    unittest.main()
