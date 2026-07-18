import base64
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


class SecurityApiTestCase(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        app = create_app(Path(self.temp_dir.name))
        app.testing = True
        self.client = app.test_client()

    def tearDown(self):
        self.temp_dir.cleanup()

    def _capability_headers(self):
        return {"X-XEdu-Client-Token": self.client.application.config["XEDU_PROCESS_CAPABILITY"]}

    def test_python_execution_requires_a_process_capability(self):
        response = self.client.post("/api/python/run", json={"code": "print('unsafe')"})

        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.get_json(), {"success": False, "message": "unauthorized"})

    def test_remaining_privileged_routes_require_a_process_capability(self):
        requests = (
            ("post", "/api/python/pip", {"json": {"action": "invalid"}}),
            ("post", "/api/reset_config", {"json": {}}),
            ("post", "/api/projects/create", {"json": {}}),
            ("post", "/api/quickform/test", {"json": {}}),
            ("post", "/api/quickform/tasks", {"json": {}}),
            ("post", "/api/quickform/tasks/create", {"json": {}}),
            ("post", "/api/ai/ask", {"json": {}}),
            ("get", "/api/debug/env", {}),
            ("get", "/api/detect_python?python_executable=/tmp/attacker-python", {}),
            ("post", "/api/system/import-image-file", {}),
        )

        for method, path, kwargs in requests:
            with self.subTest(path=path):
                response = getattr(self.client, method)(path, **kwargs)
                self.assertEqual(response.status_code, 401)
                self.assertEqual(response.get_json(), {"success": False, "message": "unauthorized"})

    def test_classroom_control_routes_require_a_process_capability(self):
        requests = (
            ("/api/classroom/sync-courses", {"courses": []}),
            ("/api/classroom/start", {"name": "test"}),
            ("/api/classroom/stop", {}),
            ("/api/classroom/verify-teacher", {"teacher_code": "test"}),
            ("/api/classroom/fetch-index", {"base_url": ""}),
            ("/api/classroom/pull", {"package_url": "", "target_path": ""}),
        )

        with patch("services.classroom_service.ClassroomService.start", return_value={}):
            for path, payload in requests:
                with self.subTest(path=path):
                    response = self.client.post(path, json=payload)
                    self.assertEqual(response.status_code, 401)
                    self.assertEqual(response.get_json(), {"success": False, "message": "unauthorized"})

    def test_python_run_ignores_request_executable_override(self):
        response = self.client.post(
            "/api/python/run",
            json={"code": "print('ok')", "python_executable": "/tmp/attacker-python"},
            headers=self._capability_headers(),
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["output"], "ok")

    def test_pip_ignores_request_executable_override(self):
        completed = SimpleNamespace(returncode=0, stdout="Package Version\n", stderr="")
        with patch("api.routes.python.subprocess.run", return_value=completed) as run_mock:
            response = self.client.post(
                "/api/python/pip",
                json={"action": "list", "python_executable": "/tmp/attacker-python"},
                headers=self._capability_headers(),
            )

        self.assertEqual(response.status_code, 200)
        self.assertNotEqual(run_mock.call_args.args[0][0], "/tmp/attacker-python")

    def test_reset_config_restores_defaults_and_keeps_a_backup(self):
        save_response = self.client.post(
            "/api/save_config",
            json={"ui": {"classroom_name": "培训课堂"}},
            headers=self._capability_headers(),
        )
        self.assertEqual(save_response.status_code, 200)

        reset_response = self.client.post("/api/reset_config", json={}, headers=self._capability_headers())

        self.assertEqual(reset_response.status_code, 200)
        self.assertTrue(reset_response.get_json()["success"])
        self.assertEqual(reset_response.get_json()["config"]["ui"]["classroom_name"], "")
        self.assertTrue(list((Path(self.temp_dir.name) / "backups").glob("config_*.json")))

    def test_process_control_requires_a_process_capability(self):
        response = self.client.post("/api/stop")

        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.get_json(), {"success": False, "message": "unauthorized"})

    def test_resource_write_requires_a_process_capability(self):
        response = self.client.post("/api/resources/save-course", json={})

        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.get_json(), {"success": False, "message": "unauthorized"})

    def test_untrusted_origin_does_not_receive_cors_access(self):
        response = self.client.open(
            "/api/python/run",
            method="OPTIONS",
            headers={
                "Origin": "https://attacker.example",
                "Access-Control-Request-Method": "POST",
            },
        )

        self.assertNotIn("Access-Control-Allow-Origin", response.headers)

    def test_config_read_does_not_return_secret_fields(self):
        response = self.client.get("/api/load_config")

        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.get_json(), {"success": False, "message": "unauthorized"})

    def test_unhandled_exception_returns_generic_message_without_secret(self):
        sentinel = "secret-from-unhandled-exception"

        def raise_secret_error():
            raise RuntimeError(sentinel)

        self.client.application.add_url_rule(
            "/api/test-secret-error",
            endpoint="test_secret_error",
            view_func=raise_secret_error,
        )

        response = self.client.get("/api/test-secret-error")

        self.assertEqual(response.status_code, 500)
        self.assertEqual(
            response.get_json(),
            {"success": False, "message": "internal server error"},
        )
        self.assertNotIn(sentinel, response.get_data(as_text=True))

    def test_forgeable_base64_path_token_cannot_read_a_local_file(self):
        private_file = Path(self.temp_dir.name) / "private.txt"
        private_file.write_text("private-content", encoding="utf-8")
        token = base64.urlsafe_b64encode(str(private_file.parent).encode("utf-8")).decode("ascii")

        response = self.client.get(f"/api/resources/local-file/{token}/{private_file.name}")

        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.get_json(), {"success": False, "message": "unauthorized"})

    def test_authorized_legacy_base64_path_token_is_expired(self):
        private_file = Path(self.temp_dir.name) / "private.txt"
        private_file.write_text("private-content", encoding="utf-8")
        token = base64.urlsafe_b64encode(str(private_file.parent).encode("utf-8")).decode("ascii")

        response = self.client.get(
            f"/api/resources/local-file/{token}/{private_file.name}",
            headers=self._capability_headers(),
        )

        self.assertEqual(response.status_code, 410)
        self.assertEqual(response.get_json(), {"success": False, "message": "资源句柄已过期"})

    def test_registered_default_course_uses_an_opaque_resource_handle(self):
        sample_response = self.client.get("/api/resources/default-sample", headers=self._capability_headers())

        self.assertEqual(sample_response.status_code, 200)
        handle = sample_response.get_json()["sample"]["resource_handle"]
        self.assertNotIn("/", handle)
        self.assertNotIn("=", handle)

        file_response = self.client.get(
            f"/api/resources/local-file/{handle}/course.json",
            headers=self._capability_headers(),
        )
        self.assertEqual(file_response.status_code, 200)

    def test_authorized_config_responses_do_not_echo_secrets(self):
        secrets = {
            "api_key": "security-test-api-key",
            "resources_publish_token": "security-test-publish-token",
            "classroom_teacher_code": "security-test-teacher-code",
            "password": "security-test-quickform-password",
        }
        payload = {
            "ai": {"api_key": secrets["api_key"]},
            "ui": {
                "resources_publish_token": secrets["resources_publish_token"],
                "classroom_teacher_code": secrets["classroom_teacher_code"],
                "quickform": {"password": secrets["password"]},
            },
        }

        save_response = self.client.post("/api/save_config", json=payload, headers=self._capability_headers())
        load_response = self.client.get("/api/load_config", headers=self._capability_headers())

        self.assertEqual(save_response.status_code, 200)
        self.assertEqual(load_response.status_code, 200)
        for secret in secrets.values():
            self.assertNotIn(secret, save_response.get_data(as_text=True))
            self.assertNotIn(secret, load_response.get_data(as_text=True))

    def test_python_run_caps_oversized_stdout(self):
        response = self.client.post(
            "/api/python/run",
            json={"code": "print('A' * 1200000, end='')", "timeout_seconds": 5},
            headers=self._capability_headers(),
        )

        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertTrue(data["success"])
        self.assertLessEqual(len(data["output"].encode("utf-8")), 1048576 + 512)
        self.assertIn("输出已截断", data["output"])
        self.assertEqual(data["error_output"], "")
        self.assertEqual(
            data["result"]["resource_events"],
            [
                {
                    "type": "output_truncated",
                    "stream": "stdout",
                    "limit_bytes": 1048576,
                }
            ],
        )

    def test_python_run_caps_oversized_stderr(self):
        response = self.client.post(
            "/api/python/run",
            json={
                "code": "import sys; sys.stderr.write('B' * 1200000)",
                "timeout_seconds": 5,
            },
            headers=self._capability_headers(),
        )

        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertTrue(data["success"])
        self.assertEqual(data["output"], "")
        self.assertLessEqual(len(data["error_output"].encode("utf-8")), 1048576 + 512)
        self.assertIn("输出已截断", data["error_output"])
        self.assertEqual(
            data["result"]["resource_events"],
            [
                {
                    "type": "output_truncated",
                    "stream": "stderr",
                    "limit_bytes": 1048576,
                }
            ],
        )


if __name__ == "__main__":
    unittest.main()
