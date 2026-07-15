import base64
import sys
import tempfile
import unittest
from pathlib import Path


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


if __name__ == "__main__":
    unittest.main()
