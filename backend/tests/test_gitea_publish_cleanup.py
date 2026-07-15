import json
import sys
import tempfile
import unittest
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from services.gitea_service import publish_course  # noqa: E402


class PublishCourseCleanupTestCase(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.course_dir = Path(self.temp_dir.name) / "course"
        self.course_dir.mkdir(parents=True, exist_ok=True)
        lesson_dir = self.course_dir / "课程代码"
        lesson_dir.mkdir(parents=True, exist_ok=True)
        (self.course_dir / "course.json").write_text(
            json.dumps(
                {
                    "id": "course-1",
                    "title": "AI导论",
                    "version": "1.0",
                    "sections": [
                        {
                            "title": "第一课",
                            "experiments": [
                                {
                                    "title": "实验1",
                                    "files": [
                                        {"path": "课程代码/main.ipynb", "type": "ipynb"},
                                        {"path": "guide.md", "type": "file"},
                                    ],
                                }
                            ],
                        }
                    ],
                },
                ensure_ascii=False,
                indent=2,
            ),
            encoding="utf-8",
        )
        (self.course_dir / "guide.md").write_text("# Guide", encoding="utf-8")
        (lesson_dir / "main.ipynb").write_text("{}", encoding="utf-8")

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_single_course_repo_publish_removes_stale_remote_files(self):
        class FakeClient:
            def __init__(self):
                self.base_url = "http://example.com"
                self.repo = "admin/test"
                self.branch = "main"
                self.owner = "admin"
                self.repo_name = "test"
                self.deleted = []
                self.updated = []

            def get_content(self, path):
                clean = (path or "").strip("/")
                if clean == "index.json":
                    return None
                return {"sha": f"sha-{clean}", "content": ""}

            def get_current_user(self):
                return "admin"

            def with_branch(self, branch):
                return self

            def upsert_file(self, path, content, message):
                self.updated.append(((path or "").strip("/"), message))
                return {"content": {"path": path}}

            def delete_file(self, path, message):
                self.deleted.append(((path or "").strip("/"), message))
                return {"content": {"path": path}}

            def _request(self, method, path, payload=None, params=None):
                if method == "GET" and "/git/trees/" in path:
                    return {
                        "tree": [
                            {"path": "course.json", "type": "blob"},
                            {"path": "guide.md", "type": "blob"},
                            {"path": "课程代码/main.ipynb", "type": "blob"},
                            {"path": "lesson1/exp1/main.ipynb", "type": "blob"},
                            {"path": "package/old.zip", "type": "blob"},
                        ]
                    }
                raise AssertionError(f"Unexpected request: {method} {path}")

        client = FakeClient()
        result = publish_course(
            local_path=str(self.course_dir),
            client=client,
            publish_path="",
            course_id="course-1",
            version="1.0",
            single_course_repo=True,
        )
        self.assertEqual(result["course_id"], "course-1")
        self.assertEqual(
            [item[0] for item in client.deleted],
            ["lesson1/exp1/main.ipynb", "package/old.zip"],
        )
        updated_paths = [item[0] for item in client.updated]
        self.assertIn("course.json", updated_paths)
        self.assertIn("guide.md", updated_paths)
        self.assertIn("课程代码/main.ipynb", updated_paths)


if __name__ == "__main__":
    unittest.main()
