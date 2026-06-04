import json
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch


BACKEND_DIR = Path(__file__).resolve().parents[1]
import sys
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from api.app import create_app  # noqa: E402
from services.classroom_service import ClassroomServiceError  # noqa: E402


class ClassroomApiTestCase(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        app = create_app(Path(self.temp_dir.name))
        app.testing = True
        self.client = app.test_client()

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_fetch_index_returns_flattened_contract(self):
        upstream = {
            "index": {"resources": [{"id": "course-1"}], "classroom": {"name": "课堂A", "code": "abc123"}},
            "repo_url": "http://127.0.0.1:5123",
            "raw_base_url": "http://127.0.0.1:5123",
            "branch": "classroom",
        }
        with patch("api.routes.classroom.ClassroomService.fetch_index", return_value=upstream):
            response = self.client.post("/api/classroom/fetch-index", json={"base_url": "http://127.0.0.1:5123"})

        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertTrue(data["success"])
        self.assertEqual(data["index"]["resources"][0]["id"], "course-1")
        self.assertEqual(data["index"]["classroom"]["code"], "abc123")
        self.assertEqual(data["repo_url"], "http://127.0.0.1:5123")
        self.assertEqual(data["raw_base_url"], "http://127.0.0.1:5123")
        self.assertEqual(data["branch"], "classroom")

    def test_fetch_index_surfaces_service_errors(self):
        with patch("api.routes.classroom.ClassroomService.fetch_index", side_effect=ClassroomServiceError("课堂索引不可用: HTTP 404")):
            response = self.client.post("/api/classroom/fetch-index", json={"base_url": "http://127.0.0.1:5123"})

        self.assertEqual(response.status_code, 400)
        data = response.get_json()
        self.assertFalse(data["success"])
        self.assertEqual(data["message"], "课堂索引不可用: HTTP 404")

    def test_start_broadcast_status_and_index_include_classroom_code(self):
        self.client.post("/api/save_config", json={"ui": {"classroom_teacher_code": ""}})
        response = self.client.post(
            "/api/classroom/start",
            json={"name": "课堂A", "code": "abc123", "port": 5123},
        )
        self.assertEqual(response.status_code, 200)
        start_data = response.get_json()
        self.assertTrue(start_data["success"])
        self.assertEqual(start_data["status"]["code"], "abc123")

        status_response = self.client.get("/api/classroom/status")
        self.assertEqual(status_response.status_code, 200)
        status_data = status_response.get_json()
        self.assertTrue(status_data["success"])
        self.assertEqual(status_data["status"]["code"], "abc123")

        index_response = self.client.get("/api/classroom/index")
        self.assertEqual(index_response.status_code, 200)
        index_data = index_response.get_json()
        self.assertTrue(index_data["success"])
        self.assertEqual(index_data["index"]["classroom"]["code"], "abc123")

    def test_classroom_package_keeps_full_course_sections_for_students(self):
        course_dir = Path(self.temp_dir.name) / "course"
        course_dir.mkdir(parents=True, exist_ok=True)
        (course_dir / "lesson1" / "exp1").mkdir(parents=True, exist_ok=True)
        (course_dir / "lesson2" / "exp1").mkdir(parents=True, exist_ok=True)
        (course_dir / "lesson1" / "exp1" / "main.ipynb").write_text("{}", encoding="utf-8")
        (course_dir / "lesson2" / "exp1" / "main.ipynb").write_text("{}", encoding="utf-8")
        (course_dir / "course.json").write_text(
            json.dumps(
                {
                    "id": "course-full",
                    "title": "完整课程",
                    "version": "1.0",
                    "sections": [
                        {
                            "title": "第1课",
                            "experiments": [
                                {
                                    "title": "实验1",
                                    "files": [{"path": "lesson1/exp1/main.ipynb", "type": "ipynb"}],
                                }
                            ],
                        },
                        {
                            "title": "第2课",
                            "experiments": [
                                {
                                    "title": "实验1",
                                    "files": [{"path": "lesson2/exp1/main.ipynb", "type": "ipynb"}],
                                }
                            ],
                        },
                    ],
                },
                ensure_ascii=False,
            ),
            encoding="utf-8",
        )

        sync_response = self.client.post(
            "/api/classroom/sync-courses",
            json={
                "courses": [
                    {
                        "id": "course-full",
                        "title": "完整课程",
                        "local_path": str(course_dir),
                    }
                ]
            },
        )
        self.assertEqual(sync_response.status_code, 200)

        self.client.post("/api/save_config", json={"ui": {"classroom_teacher_code": ""}})
        start_response = self.client.post(
            "/api/classroom/start",
            json={"name": "课堂A", "code": "abc123", "port": 5123, "course_id": "course-full", "section_index": 1},
        )
        self.assertEqual(start_response.status_code, 200)

        index_response = self.client.get("/api/classroom/index")
        self.assertEqual(index_response.status_code, 200)
        index_data = index_response.get_json()
        self.assertTrue(index_data["success"])
        self.assertEqual(index_data["index"]["classroom"]["active_section_index"], 1)
        self.assertEqual(len(index_data["index"]["resources"][0]["sections"]), 2)

        course_response = self.client.get("/api/classroom/course/course-full/course.json")
        self.assertEqual(course_response.status_code, 200)
        course_data = json.loads(course_response.data.decode("utf-8"))
        self.assertEqual(len(course_data["sections"]), 2)

        package_response = self.client.get("/api/classroom/package/course-full/1.0.zip")
        self.assertEqual(package_response.status_code, 200)
        with tempfile.NamedTemporaryFile(suffix=".zip") as temp_zip:
            temp_zip.write(package_response.data)
            temp_zip.flush()
            with zipfile.ZipFile(temp_zip.name, "r") as zipf:
                package_course = json.loads(zipf.read("course.json").decode("utf-8"))
        self.assertEqual(len(package_course["sections"]), 2)


if __name__ == "__main__":
    unittest.main()
