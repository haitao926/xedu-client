import io
import json
import os
import stat
from types import SimpleNamespace
import sys
import tempfile
import time
from email.message import Message
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch


BACKEND_DIR = Path(__file__).resolve().parents[1]
REPO_DIR = Path(__file__).resolve().parents[2]
import sys
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from api.app import create_app  # noqa: E402
from api.routes.resources import _safe_course_storage_id  # noqa: E402
from api.resource_runtime import InvalidResourceHandle, issue_resource_handle, register_resource_root  # noqa: E402
from services.gitea_service import (  # noqa: E402
    GiteaServiceError,
    _guess_file_type,
    fetch_url_bytes_with_auth_fallback,
    pull_course,
    resolve_raw_url,
)
from api.resource_runtime import build_single_course_source_entry  # noqa: E402
from services.xeduhub_support import _materialize_image_data_url  # noqa: E402
from api_test_utils import authorized_test_client, issue_test_resource_handle  # noqa: E402


class XEduHubResourcesApiTestCase(unittest.TestCase):
    @staticmethod
    def _write_test_image(path: Path) -> None:
        from PIL import Image

        Image.new("RGB", (64, 64), color=(240, 240, 240)).save(path)

    @staticmethod
    def _scratch_project_bytes(marker="initial") -> bytes:
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
            archive.writestr(
                "project.json",
                json.dumps({"targets": [], "monitors": [], "extensions": [], "meta": {"marker": marker}}),
            )
        return buffer.getvalue()

    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        app = create_app(Path(self.temp_dir.name))
        app.testing = True
        self.app = app
        self.client = authorized_test_client(app)

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_frontend_asset_route_serves_build_file(self):
        asset_dir = REPO_DIR / "build" / "assets"
        asset_dir.mkdir(parents=True, exist_ok=True)
        asset_file = asset_dir / "__frontend_asset_route_test__.txt"
        asset_file.write_text("ok", encoding="utf-8")
        response = None
        try:
            response = self.client.get("/api/resources/frontend-assets/assets/__frontend_asset_route_test__.txt")
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.get_data(as_text=True), "ok")
        finally:
            if response is not None:
                response.close()
            asset_file.unlink(missing_ok=True)

    def test_scan_issues_a_restart_safe_local_preview_handle(self):
        course_dir = Path(self.temp_dir.name) / "local-course"
        course_dir.mkdir()
        (course_dir / "course.json").write_text(
            json.dumps({"id": "local-course", "title": "Local Course", "sections": []}),
            encoding="utf-8",
        )
        (course_dir / "index.html").write_text("<h1>local preview</h1>", encoding="utf-8")

        scan_response = self.client.post(
            "/api/resources/scan",
            json={"local_path": str(course_dir)},
        )

        self.assertEqual(scan_response.status_code, 200)
        scan_body = scan_response.get_json()
        handle = scan_body["course"]["resource_handle"]
        self.assertEqual(scan_body["source"], "local")
        self.assertEqual(scan_body["local_path"], str(course_dir))
        self.assertEqual(scan_body["resource_handle"], handle)
        self.assertEqual(scan_body["course"]["local_path"], str(course_dir))
        self.assertNotIn("/", handle)
        self.assertNotIn("=", handle)

        preview_response = self.app.test_client().get(
            f"/api/resources/local-file/{handle}/index.html"
        )
        self.assertEqual(preview_response.status_code, 200)
        self.assertIn(b"local preview", preview_response.data)

    def test_local_file_proxy_rejects_traversal_expired_handles_and_disallowed_types(self):
        course_dir = Path(self.temp_dir.name) / "protected-local-course"
        course_dir.mkdir()
        (course_dir / "index.html").write_text("<h1>preview</h1>", encoding="utf-8")
        (course_dir / "cover.png").write_bytes(b"png")
        (course_dir / "payload.exe").write_bytes(b"binary")
        outside_file = Path(self.temp_dir.name) / "outside.txt"
        outside_file.write_text("private", encoding="utf-8")

        with self.app.app_context():
            root_id = register_resource_root(course_dir, "test-course", "backend-test")
            handle = issue_resource_handle(root_id, "", "read")
            expired_handle = issue_resource_handle(root_id, "", "read", ttl_seconds=-1)

        self.assertEqual(
            self.client.get(f"/api/resources/local-file/{handle}/index.html").status_code,
            200,
        )
        self.assertEqual(
            self.client.get(f"/api/resources/local-file/{handle}/cover.png").status_code,
            200,
        )
        traversal = self.client.get(
            f"/api/resources/local-file/{handle}/%2e%2e%2f{outside_file.name}"
        )
        self.assertEqual(traversal.status_code, 400)
        self.assertEqual(traversal.get_json()["message"], "非法资源路径")
        disallowed = self.client.get(
            f"/api/resources/local-file/{handle}/payload.exe"
        )
        self.assertEqual(disallowed.status_code, 400)
        self.assertEqual(disallowed.get_json()["message"], "不允许的资源类型")
        expired = self.client.get(
            f"/api/resources/local-file/{expired_handle}/index.html"
        )
        self.assertEqual(expired.status_code, 410)
        self.assertEqual(expired.get_json()["message"], "资源句柄已过期")

    def test_scan_route_initializes_a_selected_course_directory_when_requested(self):
        course_dir = Path(self.temp_dir.name) / "new-local-course"
        course_dir.mkdir()

        response = self.client.post(
            "/api/resources/scan",
            json={
                "local_path": str(course_dir),
                "init_if_missing": True,
                "auto_build": False,
                "meta": {"title": "新课程"},
            },
        )

        self.assertEqual(response.status_code, 200)
        body = response.get_json()
        self.assertEqual(body["course"]["title"], "新课程")
        self.assertTrue((course_dir / "course.json").is_file())

    def test_local_handle_route_issues_a_fresh_handle_without_returning_file_bytes(self):
        course_dir = Path(self.temp_dir.name) / "local-handle-course"
        course_dir.mkdir()
        (course_dir / "cover.png").write_bytes(b"png")

        response = self.client.post(
            "/api/resources/local-handle",
            json={"local_path": str(course_dir)},
        )

        self.assertEqual(response.status_code, 200)
        body = response.get_json()
        self.assertTrue(body["success"])
        self.assertEqual(body["local_path"], str(course_dir))
        self.assertIsInstance(body["resource_handle"], str)
        self.assertNotIn("png", body)
        preview = self.client.get(
            f"/api/resources/local-file/{body['resource_handle']}/cover.png"
        )
        self.assertEqual(preview.status_code, 200)

    def test_local_handle_route_rejects_a_file_as_course_root(self):
        file_path = Path(self.temp_dir.name) / "not-a-course"
        file_path.write_text("not a directory", encoding="utf-8")

        response = self.client.post(
            "/api/resources/local-handle",
            json={"local_path": str(file_path)},
        )

        self.assertEqual(response.status_code, 400)
        self.assertFalse(response.get_json()["success"])

    def test_scratch_editor_route_has_fallback_when_build_missing(self):
        response = self.client.get("/api/scratch-editor/index.html")
        self.assertEqual(response.status_code, 200)
        text = response.get_data(as_text=True)
        self.assertIn("XEdu Scratch", text)
        if "scratch-gui-standalone.js" in text:
            self.assertIn("api/resources/scratch-project", text)
        else:
            self.assertIn("npm run build:scratch", text)

    def test_scratch_asset_proxy_streams_official_asset_bytes(self):
        view = self.app.view_functions["resources_scratch_asset_proxy"]
        original_urlopen = view.__globals__["urllib_request"].urlopen

        class FakeResponse:
            def __init__(self, payload: bytes, content_type: str):
                self._payload = payload
                self.headers = Message()
                self.headers["Content-Type"] = content_type
                self.headers["Cache-Control"] = "max-age=60"

            def read(self):
                return self._payload

            def __enter__(self):
                return self

            def __exit__(self, exc_type, exc, tb):
                return False

        try:
            view.__globals__["urllib_request"].urlopen = lambda request, timeout=0: FakeResponse(b"asset-bytes", "image/svg+xml")
            response = self.client.get("/api/scratch-assets/internalapi/asset/809d9b47347a6af2860e7a3a35bce057.svg/get/")
        finally:
            view.__globals__["urllib_request"].urlopen = original_urlopen

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_data(), b"asset-bytes")
        self.assertEqual(response.mimetype, "image/svg+xml")
        self.assertEqual(response.headers.get("Cache-Control"), "max-age=60")

    def test_scratch_asset_proxy_rejects_invalid_paths(self):
        response = self.client.get("/api/scratch-assets/internalapi/asset/not-valid.exe/get/")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.get_json()["success"], False)

    def test_pull_resource_course_route_uses_imported_service(self):
        view = self.app.view_functions["pull_resource_course"].__wrapped__
        original_pull_course = view.__globals__["pull_course"]
        captured = {}

        def fake_pull_course(**kwargs):
            captured.update(kwargs)
            return SimpleNamespace(
                course={"id": "demo-course", "title": "Demo Course"},
                summary={"files": 1},
            )

        payload = {
            "course_url": "courses/demo-course/course.json",
            "target_path": str(Path(self.temp_dir.name) / "courses" / "demo-course"),
            "source_override": {
                "id": "test-source",
                "base_url": "https://gitea.example.com",
                "repo": "xedu/courses",
                "branch": "main",
                "single_course_repo": True,
            },
        }
        Path(payload["target_path"]).mkdir(parents=True)

        try:
            view.__globals__["pull_course"] = fake_pull_course
            response = self.client.post("/api/resources/pull", json=payload)
        finally:
            view.__globals__["pull_course"] = original_pull_course

        self.assertEqual(response.status_code, 200)
        body = response.get_json()
        self.assertTrue(body["success"])
        self.assertEqual(body["source"], "local")
        self.assertEqual(body["course"]["id"], "demo-course")
        self.assertEqual(body["course"]["source"], "local")
        self.assertIsInstance(body["resource_handle"], str)
        self.assertEqual(body["local_path"], payload["target_path"])
        self.assertEqual(body["origin"]["source_id"], "test-source")
        self.assertEqual(body["origin"]["course_url"], "courses/demo-course/course.json")
        self.assertEqual(body["origin"]["single_course_repo"], True)
        self.assertEqual(captured["course_url"], "courses/demo-course/course.json")
        self.assertEqual(captured["repo"], "xedu/courses")
        self.assertEqual(captured["branch"], "main")
        self.assertTrue(captured["single_course_repo"])

    def test_remote_course_storage_id_cannot_escape_default_root(self):
        safe_id = _safe_course_storage_id("../../outside/course")

        self.assertNotIn("/", safe_id)
        self.assertNotIn("\\", safe_id)
        self.assertNotIn("..", safe_id)
        self.assertNotEqual(safe_id, "")

    def test_async_pull_resource_course_returns_pollable_operation(self):
        view = self.app.view_functions["pull_resource_course"].__wrapped__
        original_pull_course = view.__globals__["pull_course"]
        target_path = Path(self.temp_dir.name) / "async-course"
        target_path.mkdir(parents=True)

        def fake_pull_course(**kwargs):
            progress = kwargs["progress_callback"]
            progress({
                "phase": "downloading",
                "percent": 45,
                "completed_files": 1,
                "total_files": 2,
                "message": "正在下载",
            })
            return SimpleNamespace(
                course={"id": "async-course", "title": "Async Course"},
                summary={"files": 2},
            )

        payload = {
            "async": True,
            "course_url": "course.json",
            "target_path": str(target_path),
            "source_override": {
                "id": "async-source",
                "base_url": "https://gitea.example.com",
                "repo": "xedu/async-course",
                "branch": "main",
                "single_course_repo": True,
            },
        }

        try:
            view.__globals__["pull_course"] = fake_pull_course
            response = self.client.post("/api/resources/pull", json=payload)
            self.assertEqual(response.status_code, 200)
            body = response.get_json()
            self.assertTrue(body["success"])
            self.assertIsInstance(body["operation_id"], str)

            operation_id = body["operation_id"]
            deadline = time.monotonic() + 2
            operation_body = None
            while time.monotonic() < deadline:
                operation_response = self.client.get(f"/api/resources/operations/{operation_id}")
                self.assertEqual(operation_response.status_code, 200)
                operation_body = operation_response.get_json()
                if operation_body["operation"]["state"] == "success":
                    break
                time.sleep(0.01)

            self.assertIsNotNone(operation_body)
            operation = operation_body["operation"]
            self.assertEqual(operation["state"], "success")
            self.assertEqual(operation["result"]["course"]["id"], "async-course")
            self.assertEqual(operation["result"]["local_path"], str(target_path))
        finally:
            view.__globals__["pull_course"] = original_pull_course

    def test_save_and_local_package_import_return_standardized_local_fields(self):
        save_dir = Path(self.temp_dir.name) / "saved-course"
        save_dir.mkdir()
        save_response = self.client.post(
            "/api/resources/save-course",
            json={
                "local_path": str(save_dir),
                "course": {"id": "saved-course", "title": "Saved Course", "sections": []},
            },
        )

        self.assertEqual(save_response.status_code, 200)
        save_body = save_response.get_json()
        self.assertTrue(save_body["success"])
        self.assertEqual(save_body["source"], "local")
        self.assertEqual(save_body["local_path"], str(save_dir))
        self.assertEqual(save_body["course"]["source"], "local")
        self.assertEqual(save_body["course"]["resource_handle"], save_body["resource_handle"])

        package_path = Path(self.temp_dir.name) / "course-package.zip"
        with zipfile.ZipFile(package_path, "w", zipfile.ZIP_DEFLATED) as archive:
            archive.writestr(
                "course.json",
                json.dumps({"id": "imported-course", "title": "Imported Course", "sections": []}),
            )
            archive.writestr("index.html", "<h1>Imported</h1>")
        import_dir = Path(self.temp_dir.name) / "imported-course"
        import_response = self.client.post(
            "/api/resources/import-package-local",
            json={"package_path": str(package_path), "target_path": str(import_dir)},
        )

        self.assertEqual(import_response.status_code, 200)
        import_body = import_response.get_json()
        self.assertTrue(import_body["success"])
        self.assertEqual(import_body["source"], "local")
        self.assertEqual(import_body["local_path"], str(import_dir))
        self.assertEqual(import_body["course"]["source"], "local")
        self.assertEqual(import_body["course"]["resource_handle"], import_body["resource_handle"])

    def test_async_local_package_import_returns_pollable_operation(self):
        view = self.app.view_functions["import_local_resource_package"].__wrapped__
        original_import = view.__globals__["import_local_course_package"]
        package_path = Path(self.temp_dir.name) / "async-package.zip"
        package_path.write_bytes(b"placeholder")
        target_path = Path(self.temp_dir.name) / "async-imported-course"

        def fake_import_local_course_package(**kwargs):
            progress = kwargs["progress_callback"]
            progress({
                "phase": "extracting",
                "percent": 66,
                "completed_files": 3,
                "total_files": 4,
                "message": "正在解压",
            })
            target_path.mkdir(parents=True, exist_ok=True)
            return SimpleNamespace(
                course={"id": "async-imported-course", "title": "Async Imported Course"},
                summary={"files": 4},
            )

        try:
            view.__globals__["import_local_course_package"] = fake_import_local_course_package
            response = self.client.post(
                "/api/resources/import-package-local",
                json={
                    "async": True,
                    "package_path": str(package_path),
                    "target_path": str(target_path),
                },
            )
            self.assertEqual(response.status_code, 200)
            operation_id = response.get_json()["operation_id"]

            deadline = time.monotonic() + 2
            operation = None
            while time.monotonic() < deadline:
                operation_response = self.client.get(f"/api/resources/operations/{operation_id}")
                self.assertEqual(operation_response.status_code, 200)
                operation = operation_response.get_json()["operation"]
                if operation["state"] == "success":
                    break
                time.sleep(0.01)

            self.assertIsNotNone(operation)
            self.assertEqual(operation["state"], "success")
            self.assertEqual(operation["result"]["course"]["id"], "async-imported-course")
            self.assertNotIn("package_path", operation.get("metadata", {}))
        finally:
            view.__globals__["import_local_course_package"] = original_import

    def test_local_package_import_rejects_traversal_and_symlink_members(self):
        unsafe_packages = []

        traversal_path = Path(self.temp_dir.name) / "traversal.zip"
        with zipfile.ZipFile(traversal_path, "w", zipfile.ZIP_DEFLATED) as archive:
            archive.writestr("course.json", json.dumps({"id": "unsafe", "title": "Unsafe", "sections": []}))
            archive.writestr("../outside.txt", "must not escape")
        unsafe_packages.append(traversal_path)

        symlink_path = Path(self.temp_dir.name) / "symlink.zip"
        symlink = zipfile.ZipInfo("course-link")
        symlink.create_system = 3
        symlink.external_attr = (stat.S_IFLNK | 0o777) << 16
        with zipfile.ZipFile(symlink_path, "w", zipfile.ZIP_DEFLATED) as archive:
            archive.writestr("course.json", json.dumps({"id": "unsafe", "title": "Unsafe", "sections": []}))
            archive.writestr(symlink, "../../outside")
        unsafe_packages.append(symlink_path)

        duplicate_case_path = Path(self.temp_dir.name) / "duplicate-case.zip"
        with zipfile.ZipFile(duplicate_case_path, "w", zipfile.ZIP_DEFLATED) as archive:
            archive.writestr("course.json", json.dumps({"id": "unsafe", "title": "Unsafe", "sections": []}))
            archive.writestr("COURSE.JSON", "must not replace course metadata")
        unsafe_packages.append(duplicate_case_path)

        for package_path in unsafe_packages:
            with self.subTest(package=package_path.name):
                target_path = Path(self.temp_dir.name) / f"target-{package_path.stem}"
                target_path.mkdir()
                sentinel = target_path / "keep.txt"
                sentinel.write_text("old", encoding="utf-8")
                response = self.client.post(
                    "/api/resources/import-package-local",
                    json={"package_path": str(package_path), "target_path": str(target_path)},
                )
                self.assertEqual(response.status_code, 400)
                self.assertIn("不安全", response.get_json()["message"])
                self.assertEqual(sentinel.read_text(encoding="utf-8"), "old")

    def test_local_package_import_replaces_and_backs_up_existing_non_course_directory(self):
        package_path = Path(self.temp_dir.name) / "replacement.zip"
        with zipfile.ZipFile(package_path, "w", zipfile.ZIP_DEFLATED) as archive:
            archive.writestr(
                "course.json",
                json.dumps({"id": "replacement", "title": "Replacement", "sections": []}),
            )
            archive.writestr("new.html", "new")

        target_path = Path(self.temp_dir.name) / "replacement"
        target_path.mkdir()
        (target_path / "stale.txt").write_text("stale", encoding="utf-8")
        response = self.client.post(
            "/api/resources/import-package-local",
            json={"package_path": str(package_path), "target_path": str(target_path)},
        )

        self.assertEqual(response.status_code, 200)
        self.assertFalse((target_path / "stale.txt").exists())
        self.assertTrue((target_path / "new.html").exists())
        backup_path = response.get_json()["summary"].get("backup_path")
        self.assertTrue(backup_path)
        self.assertTrue((Path(backup_path) / "stale.txt").exists())

    def test_local_package_import_refuses_an_existing_target_when_replace_is_disabled(self):
        package_path = Path(self.temp_dir.name) / "no-replace.zip"
        with zipfile.ZipFile(package_path, "w", zipfile.ZIP_DEFLATED) as archive:
            archive.writestr(
                "course.json",
                json.dumps({"id": "no-replace", "title": "No Replace", "sections": []}),
            )
            archive.writestr("new.html", "new")

        target_path = Path(self.temp_dir.name) / "existing-course"
        target_path.mkdir()
        sentinel = target_path / "keep.txt"
        sentinel.write_text("keep", encoding="utf-8")

        response = self.client.post(
            "/api/resources/import-package-local",
            json={
                "package_path": str(package_path),
                "target_path": str(target_path),
                "replace_existing": False,
            },
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("已存在", response.get_json()["message"])
        self.assertEqual(sentinel.read_text(encoding="utf-8"), "keep")
        self.assertFalse((target_path / "new.html").exists())

    def test_local_directory_package_rejects_links_without_replacing_target(self):
        outside_file = Path(self.temp_dir.name) / "outside.txt"
        outside_file.write_text("private", encoding="utf-8")

        for link_kind in ("symlink", "hardlink"):
            with self.subTest(link_kind=link_kind):
                source_path = Path(self.temp_dir.name) / f"source-{link_kind}"
                source_path.mkdir()
                (source_path / "course.json").write_text(
                    json.dumps({"id": "unsafe", "title": "Unsafe", "sections": []}),
                    encoding="utf-8",
                )
                linked_file = source_path / "linked.txt"
                if link_kind == "symlink":
                    linked_file.symlink_to(outside_file)
                else:
                    os.link(outside_file, linked_file)

                target_path = Path(self.temp_dir.name) / f"target-{link_kind}"
                target_path.mkdir()
                sentinel = target_path / "keep.txt"
                sentinel.write_text("old", encoding="utf-8")

                response = self.client.post(
                    "/api/resources/import-package-local",
                    json={"package_path": str(source_path), "target_path": str(target_path)},
                )

                self.assertEqual(response.status_code, 400)
                self.assertIn("不安全", response.get_json()["message"])
                self.assertEqual(sentinel.read_text(encoding="utf-8"), "old")

    def test_local_directory_package_is_staged_before_import(self):
        source_path = Path(self.temp_dir.name) / "source-directory"
        source_path.mkdir()
        (source_path / "course.json").write_text(
            json.dumps({"id": "directory-course", "title": "Directory Course", "sections": []}),
            encoding="utf-8",
        )
        (source_path / "lesson.html").write_text("<h1>lesson</h1>", encoding="utf-8")
        target_path = Path(self.temp_dir.name) / "target-directory"

        response = self.client.post(
            "/api/resources/import-package-local",
            json={"package_path": str(source_path), "target_path": str(target_path)},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["course"]["id"], "directory-course")
        self.assertEqual((target_path / "lesson.html").read_text(encoding="utf-8"), "<h1>lesson</h1>")

    @patch("api.resource_runtime.load_course_data_from_repo")
    @patch("api.resource_runtime.load_repo_tree_data")
    def test_single_course_source_entry_discovers_nested_course_and_package(self, load_tree, load_course):
        load_tree.return_value = [
            {"type": "blob", "path": "courses/nested/course.json", "size": 100},
            {"type": "blob", "path": "courses/nested/package/nested-0.9.zip", "size": 150},
            {"type": "blob", "path": "courses/nested/package/nested-1.0.zip", "size": 200},
        ]
        load_course.return_value = {
            "id": "nested",
            "title": "Nested Course",
            "version": "1.0",
            "sections": [],
        }

        entry = build_single_course_source_entry(
            base_url="https://gitea.example.com",
            repo="owner/repo",
            branch="main",
            raw_base_url="https://gitea.example.com/owner/repo/raw/main",
            token="",
        )

        self.assertEqual(entry["course_url"], "courses/nested/course.json")
        self.assertEqual(entry["package_url"], "courses/nested/package/nested-1.0.zip")
        load_course.assert_called_once_with(
            raw_base_url="https://gitea.example.com/owner/repo/raw/main",
            course_path="courses/nested/course.json",
            token="",
        )

    @patch("api.resource_runtime.load_course_data_from_repo")
    @patch("api.resource_runtime.load_repo_tree_data")
    def test_root_single_course_source_ignores_an_unrelated_zip(self, load_tree, load_course):
        load_tree.return_value = [
            {"type": "blob", "path": "course.json", "size": 100},
            {"type": "blob", "path": "source-code.zip", "size": 200},
        ]
        load_course.return_value = {
            "id": "root-course",
            "title": "Root Course",
            "version": "1.0",
            "sections": [],
        }

        entry = build_single_course_source_entry(
            base_url="https://gitea.example.com",
            repo="owner/root-course",
            branch="main",
            raw_base_url="https://gitea.example.com/owner/root-course/raw/main",
            token="",
        )

        self.assertEqual(entry["course_url"], "course.json")
        self.assertEqual(entry["package_url"], "")

    def test_remote_bytes_download_reports_streamed_chunks(self):
        class FakeResponse:
            def __init__(self):
                self.chunks = [b"abc", b"de", b""]

            def __enter__(self):
                return self

            def __exit__(self, exc_type, exc, traceback):
                return False

            def read(self, _size):
                return self.chunks.pop(0)

        chunks = []
        with patch("services.gitea_service.request.urlopen", return_value=FakeResponse()):
            payload = fetch_url_bytes_with_auth_fallback(
                "https://gitea.example.com/course.zip",
                on_chunk=lambda chunk_size, completed: chunks.append((chunk_size, completed)),
            )

        self.assertEqual(payload, b"abcde")
        self.assertEqual(chunks, [(3, 3), (2, 5)])

    def test_raw_url_encodes_unicode_paths_without_double_encoding(self):
        base_url = "https://gitea.example.com/owner/repo/raw/main"

        self.assertEqual(
            resolve_raw_url(base_url, "teacher/教案（两课时）.pdf"),
            f"{base_url}/teacher/%E6%95%99%E6%A1%88%EF%BC%88%E4%B8%A4%E8%AF%BE%E6%97%B6%EF%BC%89.pdf",
        )
        self.assertEqual(
            resolve_raw_url(
                base_url,
                f"{base_url}/teacher/%E6%95%99%E6%A1%88.pdf?download=1",
            ),
            f"{base_url}/teacher/%E6%95%99%E6%A1%88.pdf?download=1",
        )
        with self.assertRaisesRegex(GiteaServiceError, "仓库路径"):
            resolve_raw_url(base_url, "http://127.0.0.1:5123/private")

    def test_remote_bytes_download_rejects_response_over_limit(self):
        class FakeResponse:
            headers = {"Content-Length": "5"}

            def __enter__(self):
                return self

            def __exit__(self, exc_type, exc, traceback):
                return False

            def read(self, _size):
                return b""

        with patch("services.gitea_service.request.urlopen", return_value=FakeResponse()):
            with self.assertRaisesRegex(GiteaServiceError, "过大"):
                fetch_url_bytes_with_auth_fallback(
                    "https://gitea.example.com/course.zip",
                    max_bytes=4,
                )

    @patch("services.gitea_service.fetch_url_bytes_with_auth_fallback")
    @patch("services.gitea_service.load_repo_tree_data")
    def test_single_course_pull_strips_nested_repository_prefix(self, load_tree, fetch_bytes):
        load_tree.return_value = [
            {"type": "blob", "path": "courses/nested/course.json", "size": 80},
            {"type": "blob", "path": "courses/nested/lesson/index.html", "size": 20},
        ]

        def fetch_side_effect(url, **kwargs):
            if url.endswith("course.json"):
                return json.dumps({"id": "nested", "title": "Nested", "sections": []}).encode("utf-8")
            return b"<h1>nested</h1>"

        fetch_bytes.side_effect = fetch_side_effect
        target_path = Path(self.temp_dir.name) / "nested"
        progress = []

        result = pull_course(
            raw_base_url="https://gitea.example.com/owner/repo/raw/main",
            course_url="courses/nested/course.json",
            package_url="",
            target_path=str(target_path),
            single_course_repo=True,
            base_url="https://gitea.example.com",
            repo="owner/repo",
            branch="main",
            progress_callback=progress.append,
        )

        self.assertEqual(result.course["id"], "nested")
        self.assertTrue((target_path / "course.json").is_file())
        self.assertTrue((target_path / "lesson" / "index.html").is_file())
        self.assertFalse((target_path / "courses").exists())
        self.assertTrue(any(item.get("phase") == "downloading" for item in progress))

    def test_pull_resource_course_prefers_index_package_over_single_repo_hint(self):
        view = self.app.view_functions["pull_resource_course"].__wrapped__
        original_pull_course = view.__globals__["pull_course"]
        captured = {}

        def fake_pull_course(**kwargs):
            captured.update(kwargs)
            return SimpleNamespace(
                course={"id": "indexed-course", "title": "Indexed Course"},
                summary={"files": 1},
            )

        payload = {
            "course_id": "indexed-course",
            "course_url": "courses/indexed-course/course.json",
            "package_url": "courses/indexed-course/package/indexed-course-1.0.zip",
            "target_path": str(Path(self.temp_dir.name) / "courses" / "indexed-course"),
            "source_override": {
                "id": "override",
                "base_url": "https://gitea.example.com",
                "repo": "owner/course-repo",
                "branch": "main",
                "single_course_repo": True,
            },
        }
        Path(payload["target_path"]).mkdir(parents=True)

        try:
            view.__globals__["pull_course"] = fake_pull_course
            response = self.client.post("/api/resources/pull", json=payload)
        finally:
            view.__globals__["pull_course"] = original_pull_course

        self.assertEqual(response.status_code, 200)
        body = response.get_json()
        self.assertFalse(captured["single_course_repo"])
        self.assertEqual(captured["package_url"], payload["package_url"])
        self.assertFalse(body["origin"]["single_course_repo"])
        self.assertEqual(body["origin"]["course_url"], payload["course_url"])
        self.assertEqual(body["origin"]["package_url"], payload["package_url"])

    def test_scratch_project_route_reads_and_saves_sb3(self):
        course_dir = Path(self.temp_dir.name) / "course-scratch"
        course_dir.mkdir(parents=True, exist_ok=True)
        project_rel = "lesson1/demo.sb3"
        project_file = course_dir / project_rel
        project_file.parent.mkdir(parents=True, exist_ok=True)
        initial_project = self._scratch_project_bytes("initial")
        updated_project = self._scratch_project_bytes("updated")
        project_file.write_bytes(initial_project)
        token = issue_test_resource_handle(self.app, course_dir, project_rel, "write")

        read_response = self.client.get(f"/api/resources/scratch-project/{token}/{project_rel}")
        self.assertEqual(read_response.status_code, 200)
        self.assertEqual(read_response.get_data(), initial_project)
        self.assertEqual(read_response.mimetype, "application/x.scratch.sb3")

        save_response = self.client.put(
            f"/api/resources/scratch-project/{token}/{project_rel}",
            data=updated_project,
            content_type="application/x.scratch.sb3",
        )
        self.assertEqual(save_response.status_code, 200)
        payload = save_response.get_json()
        self.assertTrue(payload["success"])
        self.assertEqual(payload["path"], project_rel)
        self.assertEqual(project_file.read_bytes(), updated_project)

    def test_scratch_project_save_rejects_untrusted_origin(self):
        course_dir = Path(self.temp_dir.name) / "course-scratch-origin"
        course_dir.mkdir(parents=True, exist_ok=True)
        project_rel = "lesson1/demo.sb3"
        token = issue_test_resource_handle(self.app, course_dir, project_rel, "write")

        response = self.client.put(
            f"/api/resources/scratch-project/{token}/{project_rel}",
            data=self._scratch_project_bytes(),
            content_type="application/x.scratch.sb3",
            headers={"Origin": "https://attacker.example"},
        )

        self.assertEqual(response.status_code, 403)

    def test_scratch_project_save_rejects_oversized_body(self):
        course_dir = Path(self.temp_dir.name) / "course-scratch-large"
        course_dir.mkdir(parents=True, exist_ok=True)
        project_rel = "lesson1/demo.sb3"
        token = issue_test_resource_handle(self.app, course_dir, project_rel, "write")

        with patch("api.routes.resources.MAX_SCRATCH_PROJECT_BYTES", 10, create=True):
            response = self.client.put(
                f"/api/resources/scratch-project/{token}/{project_rel}",
                data=b"01234567890",
                content_type="application/x.scratch.sb3",
            )

        self.assertEqual(response.status_code, 413)

    def test_scratch_project_save_rejects_invalid_archive(self):
        course_dir = Path(self.temp_dir.name) / "course-scratch-invalid-archive"
        course_dir.mkdir(parents=True, exist_ok=True)
        project_rel = "lesson1/demo.sb3"
        token = issue_test_resource_handle(self.app, course_dir, project_rel, "write")

        response = self.client.put(
            f"/api/resources/scratch-project/{token}/{project_rel}",
            data=b"not-a-zip",
            content_type="application/x.scratch.sb3",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("Scratch", response.get_json()["message"])

    def test_scratch_project_save_rejects_expired_or_mismatched_handles(self):
        course_dir = Path(self.temp_dir.name) / "course-scratch-handles"
        course_dir.mkdir(parents=True, exist_ok=True)
        project_rel = "lesson1/demo.sb3"
        with self.app.app_context():
            root_id = register_resource_root(course_dir, "test-course", "backend-test")
            expired = issue_resource_handle(root_id, project_rel, "write", ttl_seconds=-1)
            read_only = issue_resource_handle(root_id, project_rel, "read")
            wrong_path = issue_resource_handle(root_id, project_rel, "write")

        requests = (
            (expired, project_rel, 410),
            (read_only, project_rel, 400),
            (wrong_path, "lesson1/other.sb3", 400),
        )
        for token, path, expected_status in requests:
            with self.subTest(expected_status=expected_status, path=path):
                response = self.client.put(
                    f"/api/resources/scratch-project/{token}/{path}",
                    data=self._scratch_project_bytes(),
                    content_type="application/x.scratch.sb3",
                )
                self.assertEqual(response.status_code, expected_status)

    def test_scratch_project_route_rejects_non_sb3(self):
        course_dir = Path(self.temp_dir.name) / "course-scratch-invalid"
        course_dir.mkdir(parents=True, exist_ok=True)
        token = issue_test_resource_handle(self.app, course_dir, "lesson1/demo.sb3", "write")

        response = self.client.put(
            f"/api/resources/scratch-project/{token}/lesson1/not-scratch.txt",
            data=b"not scratch",
            content_type="text/plain",
        )
        self.assertEqual(response.status_code, 400)
        self.assertFalse(response.get_json()["success"])

    def test_legacy_blockly_resources_are_read_only(self):
        course_dir = Path(self.temp_dir.name) / "course-legacy-blockly"
        course_dir.mkdir(parents=True, exist_ok=True)

        issue_test_resource_handle(self.app, course_dir, "lesson1/demo.blockly.xml", "read")
        with self.assertRaises(InvalidResourceHandle):
            issue_test_resource_handle(self.app, course_dir, "lesson1/demo.blockly.xml", "write")

    def test_xeduhub_neutral_execute_route_runs_without_legacy_alias(self):
        image_path = Path(self.temp_dir.name) / "demo-neutral.jpg"
        self._write_test_image(image_path)
        payload = {
            "code": "print('demo')",
            "spec": {
                "task_id": "det_body",
                "input": str(image_path),
                "params": {"thr": 0.4, "img_type": "pil"},
                "mode": "preset",
            },
        }
        class _FakeWorkflow:
            def __init__(self, task, **kwargs):
                self.task = task

            def inference(self, data=None, **kwargs):
                return [{"bbox": [1, 2, 20, 22], "score": 0.9, "label": "person"}]

        with patch(
            "services.xeduhub_support._patch_openxlab_repo_parser",
            return_value=None,
        ), patch(
            "services.xeduhub_support._get_runtime_supported_tasks",
            return_value=["det_body"],
        ), patch.dict(
            "sys.modules",
            {"XEdu.hub": type("FakeHubModule", (), {"Workflow": _FakeWorkflow})},
        ):
            neutral_response = self.client.post("/api/resources/xeduhub/execute", json=payload)
        self.assertEqual(neutral_response.status_code, 200)
        neutral = neutral_response.get_json()
        self.assertTrue(neutral["success"])
        self.assertEqual(
            self.client.post("/api/resources/blockly/xeduhub/execute", json=payload).status_code,
            404,
        )

    def test_xeduhub_legacy_route_is_removed(self):
        response = self.client.post(
            "/api/resources/blockly/xeduhub/execute",
            json={"spec": {"task_id": "det_body"}},
        )
        self.assertEqual(response.status_code, 404)

    def test_xeduhub_neutral_execute_route_materializes_camera_frame_temporarily(self):
        temporary_paths = []
        try:
            path = Path(_materialize_image_data_url(
                "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL0XQAAAABJRU5ErkJggg==",
                temporary_paths,
            ))
            self.assertTrue(path.is_file())
            self.assertEqual(path.suffix, ".png")
        finally:
            for temporary_path in temporary_paths:
                temporary_path.unlink(missing_ok=True)
        self.assertFalse(path.exists())

    def test_default_sample_course_route_returns_sample(self):
        response = self.client.get("/api/resources/default-sample")
        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertTrue(payload["success"])
        self.assertEqual(payload["sample"]["label"], "默认测试样例")
        self.assertIn("course", payload["sample"])
        self.assertIn("resource_handle", payload["sample"])
        self.assertNotIn("path", payload["sample"])

    def test_xeduhub_execute_route_reports_missing_package(self):
        image_path = Path(self.temp_dir.name) / "demo.jpg"
        self._write_test_image(image_path)
        class _FakeWorkflow:
            def __init__(self, task, **kwargs):
                self.task = task

            def inference(self, data=None, **kwargs):
                return {"label": "demo", "score": 0.99}

        with patch(
            "services.xeduhub_support._patch_openxlab_repo_parser",
            return_value=None,
        ), patch(
            "services.xeduhub_support._get_runtime_supported_tasks",
            return_value=["cls_imagenet"],
        ), patch.dict(
            "sys.modules",
            {"XEdu.hub": type("FakeHubModule", (), {"Workflow": _FakeWorkflow})},
        ):
            response = self.client.post(
                "/api/resources/xeduhub/execute",
                json={
                    "code": "print('demo')",
                    "spec": {
                        "task": "classification",
                        "model": "resnet18",
                        "input": str(image_path),
                    },
                },
            )
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertTrue(data["success"])
        self.assertEqual(data["result"]["task_id"], "cls_imagenet")
        self.assertEqual(data["result"].get("runtime_mode"), "real")
        self.assertEqual(data["result"].get("result_truthfulness"), "verified")

    def test_xeduhub_execute_route_rejects_invalid_model(self):
        image_path = Path(self.temp_dir.name) / "demo.jpg"
        self._write_test_image(image_path)
        response = self.client.post(
            "/api/resources/xeduhub/execute",
            json={
                "code": "print('demo')",
                "spec": {
                    "task": "classification",
                    "model": "bad-model",
                    "input": str(image_path),
                },
            },
        )
        self.assertEqual(response.status_code, 400)
        data = response.get_json()
        self.assertFalse(data["success"])
        self.assertEqual(data["error_code"], "model_unavailable")
        self.assertEqual(data["result_summary"]["headline"], "模型不可用")

    def test_xeduhub_execute_route_rejects_invalid_task_id(self):
        image_path = Path(self.temp_dir.name) / "demo.jpg"
        self._write_test_image(image_path)
        response = self.client.post(
            "/api/resources/xeduhub/execute",
            json={
                "code": "print('demo')",
                "spec": {
                    "task_id": "not-a-real-task",
                    "input": str(image_path),
                    "params": {},
                    "mode": "preset",
                },
            },
        )
        self.assertEqual(response.status_code, 400)
        data = response.get_json()
        self.assertFalse(data["success"])
        self.assertEqual(data["error_code"], "invalid_task_id")
        self.assertEqual(data["result_summary"]["headline"], "任务不可用")

    def test_xeduhub_execute_route_accepts_new_spec_shape(self):
        image_path = Path(self.temp_dir.name) / "demo.jpg"
        self._write_test_image(image_path)
        class _FakeWorkflow:
            def __init__(self, task, **kwargs):
                self.task = task

            def inference(self, data=None, **kwargs):
                return [{"bbox": [1, 2, 20, 22], "score": 0.9, "label": "person"}]

        with patch(
            "services.xeduhub_support._patch_openxlab_repo_parser",
            return_value=None,
        ), patch(
            "services.xeduhub_support._get_runtime_supported_tasks",
            return_value=["det_body"],
        ), patch.dict(
            "sys.modules",
            {"XEdu.hub": type("FakeHubModule", (), {"Workflow": _FakeWorkflow})},
        ):
            response = self.client.post(
                "/api/resources/xeduhub/execute",
                json={
                    "code": "print('demo')",
                    "spec": {
                        "task_id": "det_body",
                        "input": str(image_path),
                        "params": {"thr": 0.4, "img_type": "pil"},
                        "mode": "preset",
                    },
                },
            )
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertTrue(data["success"])
        self.assertEqual(data["result"]["task_id"], "det_body")
        self.assertIn("result_summary", data)
        self.assertIn("result_artifacts", data)
        self.assertTrue(data["result_artifacts"]["preview_image"].startswith("data:image/png;base64,"))
        self.assertEqual(data["artifacts"]["image_data"], data["result_artifacts"]["preview_image"])
        self.assertIn("弹窗", data["result_summary"]["hints"][0])

    def test_xeduhub_execute_route_reports_missing_openxlab_auth_for_auto_download(self):
        image_path = Path(self.temp_dir.name) / "demo.jpg"
        self._write_test_image(image_path)

        class _FakeWorkflow:
            @staticmethod
            def support_task():
                return ["bodydetect"]

            def __init__(self, task):
                raise ValueError("Local config must not be empty before get token via api. Please use the 'openxlab config' command to set the config")

        with patch.dict(os.environ, {"XEDU_DISABLE_BODYDETECT_FALLBACK": "1"}, clear=False), patch("services.xeduhub_support._resolve_smoke_checkpoint", return_value=""), patch("services.xeduhub_support._patch_openxlab_repo_parser", return_value=None), patch.dict("sys.modules", {"XEdu.hub": type("FakeHubModule", (), {"Workflow": _FakeWorkflow})}):
            response = self.client.post(
                "/api/resources/xeduhub/execute",
                json={
                    "code": "print('demo')",
                    "spec": {
                        "task_id": "det_body",
                        "input": str(image_path),
                        "params": {},
                        "mode": "preset",
                    },
                },
            )

        self.assertEqual(response.status_code, 400)
        data = response.get_json()
        self.assertFalse(data["success"])
        self.assertEqual(data["error_code"], "model_download_auth_missing")
        self.assertEqual(data["result_summary"]["headline"], "自动下载需要 OpenXLab 配置")

    def test_xeduhub_execute_route_falls_back_for_bodydetect_when_model_missing(self):
        image_path = Path(self.temp_dir.name) / "demo.jpg"
        self._write_test_image(image_path)

        with patch("services.xeduhub_support._get_runtime_supported_tasks", return_value=[]), patch(
            "services.xeduhub_support._resolve_smoke_checkpoint",
            return_value="",
        ):
            response = self.client.post(
                "/api/resources/xeduhub/execute",
                json={
                    "code": "print('demo')",
                    "spec": {
                        "task_id": "det_body",
                        "input": str(image_path),
                        "params": {},
                        "mode": "preset",
                    },
                },
            )

        data = response.get_json()
        self.assertEqual(response.status_code, 200)
        self.assertTrue(data["success"])
        self.assertEqual(data["result"]["task_id"], "det_body")
        self.assertEqual(data["result"].get("runtime_mode"), "opencv_fallback")
        self.assertEqual(data["result"].get("result_truthfulness"), "demo_only")
        self.assertEqual(data["result_summary"]["headline"], "兼容演示结果")

    def test_xeduhub_execute_route_falls_back_for_bodydetect_when_repo_format_error_occurs(self):
        image_path = Path(self.temp_dir.name) / "demo.jpg"
        self._write_test_image(image_path)

        class _FakeWorkflow:
            @staticmethod
            def support_task():
                return ["bodydetect"]

            def __init__(self, task):
                raise ValueError("The input string must be in the format 'didi12/test-d-1'")

        with patch("services.xeduhub_support._resolve_smoke_checkpoint", return_value=""), patch(
            "services.xeduhub_support._patch_openxlab_repo_parser", return_value=None
        ), patch.dict("sys.modules", {"XEdu.hub": type("FakeHubModule", (), {"Workflow": _FakeWorkflow})}):
            response = self.client.post(
                "/api/resources/xeduhub/execute",
                json={
                    "code": "print('demo')",
                    "spec": {
                        "task_id": "det_body",
                        "input": str(image_path),
                        "params": {},
                        "mode": "preset",
                    },
                },
            )

        data = response.get_json()
        self.assertEqual(response.status_code, 200)
        self.assertTrue(data["success"])
        self.assertEqual(data["result"]["task_id"], "det_body")
        self.assertIn(data["result"].get("runtime_mode"), {"fallback", "opencv_fallback"})
        self.assertEqual(data["result"].get("result_truthfulness"), "demo_only")

    def test_xeduhub_execute_route_uses_local_smoke_checkpoint_for_runtime_task(self):
        image_path = Path(self.temp_dir.name) / "demo.jpg"
        self._write_test_image(image_path)
        init_calls = []

        class _FakeWorkflow:
            @staticmethod
            def support_task():
                return ["bodydetect"]

            def __init__(self, task, checkpoint=None):
                init_calls.append({"task": task, "checkpoint": checkpoint})

            def inference(self, data=None, **kwargs):
                return [{"bbox": [1, 2, 3, 4], "score": 0.9, "label": "person"}]

        with patch("services.xeduhub_support._get_runtime_supported_tasks", return_value=["det_body"]), patch(
            "services.xeduhub_support._resolve_smoke_checkpoint",
            return_value="/tmp/smoke-det_body.onnx",
        ), patch("services.xeduhub_support._patch_openxlab_repo_parser", return_value=None), patch.dict(
            "sys.modules",
            {"XEdu.hub": type("FakeHubModule", (), {"Workflow": _FakeWorkflow})},
        ):
            response = self.client.post(
                "/api/resources/xeduhub/execute",
                json={
                    "code": "print('demo')",
                    "spec": {
                        "task_id": "det_body",
                        "input": str(image_path),
                        "params": {},
                        "mode": "preset",
                    },
                },
            )

        data = response.get_json()
        self.assertEqual(response.status_code, 200)
        self.assertTrue(data["success"])
        self.assertEqual(len(init_calls), 1)
        self.assertEqual(init_calls[0]["task"], "det_body")
        self.assertEqual(init_calls[0]["checkpoint"], "/tmp/smoke-det_body.onnx")
        self.assertEqual(data["result"]["checkpoint"], "/tmp/smoke-det_body.onnx")

    def test_xeduhub_execute_route_shows_verified_empty_detection_result(self):
        image_path = Path(self.temp_dir.name) / "empty-detection.jpg"
        self._write_test_image(image_path)

        class _FakeWorkflow:
            @staticmethod
            def support_task():
                return ["bodydetect"]

            def __init__(self, task, checkpoint=None):
                self.task = task
                self.checkpoint = checkpoint

            def inference(self, data=None, **kwargs):
                return []

        with patch("services.xeduhub_support._get_runtime_supported_tasks", return_value=["det_body"]), patch(
            "services.xeduhub_support._resolve_smoke_checkpoint",
            return_value="/tmp/smoke-det_body.onnx",
        ), patch("services.xeduhub_support._patch_openxlab_repo_parser", return_value=None), patch.dict(
            "sys.modules",
            {"XEdu.hub": type("FakeHubModule", (), {"Workflow": _FakeWorkflow})},
        ):
            response = self.client.post(
                "/api/resources/xeduhub/execute",
                json={
                    "code": "print('demo')",
                    "spec": {
                        "task_id": "det_body",
                        "input": str(image_path),
                        "params": {},
                        "mode": "preset",
                    },
                },
            )

        data = response.get_json()
        self.assertEqual(response.status_code, 200)
        self.assertTrue(data["success"])
        self.assertEqual(data["result"]["runtime_mode"], "real")
        self.assertEqual(data["result"]["result_truthfulness"], "verified")
        self.assertEqual(data["result"]["checkpoint"], "/tmp/smoke-det_body.onnx")
        self.assertEqual(data["result_summary"]["headline"], "检测到 0 个目标")
        self.assertIn("模型已完成推理", data["result_summary"]["hints"][0])
        self.assertTrue(data["result_artifacts"]["preview_image"].startswith("data:image/png;base64,"))

    def test_xeduhub_execute_route_rejects_missing_custom_image_without_demo_fallback(self):
        missing_image = Path(self.temp_dir.name) / "picked-by-browser.jpg"
        response = self.client.post(
            "/api/resources/xeduhub/execute",
            json={
                "code": "print('demo')",
                "project_root": self.temp_dir.name,
                "spec": {
                    "task_id": "det_body",
                    "input": missing_image.name,
                    "params": {},
                    "mode": "preset",
                },
            },
        )

        data = response.get_json()
        self.assertEqual(response.status_code, 400)
        self.assertFalse(data["success"])
        self.assertEqual(data["error_code"], "input_not_found")
        self.assertIn("picked-by-browser.jpg", data["message"])

    def test_xeduhub_execute_route_accepts_default_sample_input_without_course_asset(self):
        init_calls = []

        class _FakeWorkflow:
            @staticmethod
            def support_task():
                return ["bodydetect"]

            def __init__(self, task, checkpoint=None):
                init_calls.append({"task": task, "checkpoint": checkpoint})

            def inference(self, data=None, **kwargs):
                self.data_seen = data
                return [{"bbox": [1, 2, 3, 4], "score": 0.9, "label": "person"}]

        with patch("services.xeduhub_support._get_runtime_supported_tasks", return_value=["det_body"]), patch(
            "services.xeduhub_support._resolve_smoke_checkpoint",
            return_value="/tmp/smoke-det_body.onnx",
        ), patch("services.xeduhub_support._patch_openxlab_repo_parser", return_value=None), patch.dict(
            "sys.modules",
            {"XEdu.hub": type("FakeHubModule", (), {"Workflow": _FakeWorkflow})},
        ):
            response = self.client.post(
                "/api/resources/xeduhub/execute",
                json={
                    "code": "print('demo')",
                    "spec": {
                        "task_id": "det_body",
                        "input": "demo.jpg",
                        "params": {},
                        "mode": "preset",
                    },
                },
            )

        data = response.get_json()
        self.assertEqual(response.status_code, 200)
        self.assertTrue(data["success"])
        self.assertEqual(data["result"]["task_id"], "det_body")
        self.assertTrue(Path(data["result"]["input"]).exists())
        self.assertEqual(init_calls[0]["checkpoint"], "/tmp/smoke-det_body.onnx")

    def test_xeduhub_execute_forces_noninteractive_matplotlib_backend(self):
        image_path = Path(self.temp_dir.name) / "demo.jpg"
        self._write_test_image(image_path)
        backend_seen = {"value": None}

        class _FakeWorkflow:
            @staticmethod
            def support_task():
                return ["segment_anything"]

            def __init__(self, task):
                self.task = task

            def inference(self, data=None, **kwargs):
                backend_seen["value"] = os.environ.get("MPLBACKEND")
                return {"mask_count": 1, "task": self.task}

        with patch("services.xeduhub_support._patch_openxlab_repo_parser", return_value=None), patch.dict(
            "sys.modules",
            {"XEdu.hub": type("FakeHubModule", (), {"Workflow": _FakeWorkflow})},
        ):
            response = self.client.post(
                "/api/resources/xeduhub/execute",
                json={
                    "code": "print('demo')",
                    "spec": {
                        "task_id": "segment_anything",
                        "input": str(image_path),
                        "params": {},
                        "mode": "preset",
                    },
                },
            )

        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertTrue(data["success"])
        self.assertEqual(data["result"]["task_id"], "segment_anything")
        self.assertEqual(backend_seen["value"], "Agg")

    def test_xeduhub_supported_runtime_tasks_return_verified_results_or_grounded_errors(self):
        image_path = Path(self.temp_dir.name) / "demo.jpg"
        self._write_test_image(image_path)
        for task_id in (
            "det_body",
            "det_coco",
            "det_coco_l",
            "pose_body17",
            "pose_body26",
            "pose_face106",
            "pose_hand21",
            "pose_wholebody133",
        ):
            with self.subTest(task_id=task_id):
                response = self.client.post(
                    "/api/resources/xeduhub/execute",
                    json={
                        "code": f"# smoke {task_id}",
                        "project_root": str(REPO_DIR),
                        "spec": {
                            "task_id": task_id,
                            "input": str(image_path),
                            "params": {},
                            "mode": "preset",
                        },
                    },
                )
                data = response.get_json()
                self.assertIn(response.status_code, {200, 400})
                if response.status_code == 200:
                    self.assertTrue(data["success"])
                    expected_task_id = {
                        "pose_body26": "pose_body17",
                    }.get(task_id, task_id)
                    self.assertEqual(data["result"]["task_id"], expected_task_id)
                    self.assertIn(data["result"].get("result_truthfulness"), {"verified", "demo_only"})
                    self.assertIn("result_summary", data)
                else:
                    self.assertFalse(data["success"])
                    self.assertIn(
                        data.get("error_code"),
                        {"missing_dependency", "runtime_exception", "model_download_auth_missing", "model_artifact_missing", "runtime_task_unavailable"},
                    )

    def test_xeduhub_execute_route_reports_runtime_task_unavailable(self):
        image_path = Path(self.temp_dir.name) / "demo.jpg"
        self._write_test_image(image_path)
        with patch(
            "services.xeduhub_support._get_runtime_supported_tasks",
            return_value=["det_body", "pose_body17"],
        ):
            response = self.client.post(
                "/api/resources/xeduhub/execute",
                json={
                    "code": "print('demo')",
                    "spec": {
                        "task_id": "ocr",
                        "input": str(image_path),
                        "params": {},
                        "mode": "preset",
                    },
                },
            )
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertTrue(data["success"])
        self.assertEqual(data["result"]["task_id"], "ocr")
        self.assertEqual(data["result"].get("runtime_mode"), "fallback")
        self.assertEqual(data["result"].get("result_truthfulness"), "demo_only")
        self.assertIn("兼容演示", data["result_summary"]["headline"])

    def test_inspect_course_reports_ready_for_complete_local_experiment(self):
        course_dir = Path(self.temp_dir.name) / "ready-course"
        course_dir.mkdir(parents=True, exist_ok=True)
        (course_dir / "index.html").write_text("<html></html>", encoding="utf-8")
        (course_dir / "demo.blockly.xml").write_text("<xml></xml>", encoding="utf-8")
        (course_dir / "course.json").write_text(
            json.dumps({
                "id": "ready-course",
                "title": "Ready Course",
                "sections": [
                    {
                        "title": "第一课",
                        "experiments": [
                            {
                                "title": "实验一",
                                "files": [
                                    {"path": "index.html", "type": "html"},
                                    {"path": "demo.blockly.xml", "type": "blockly"},
                                ],
                            }
                        ],
                    }
                ],
            }),
            encoding="utf-8",
        )

        response = self.client.post("/api/resources/inspect-course", json={"local_path": str(course_dir)})
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertTrue(data["success"])
        self.assertEqual(data["summary"]["ready_count"], 1)
        self.assertEqual(data["summary"]["broken_count"], 0)
        experiment = data["inspection"]["sections"][0]["experiments"][0]
        self.assertEqual(experiment["status"], "ready")
        self.assertEqual([entry["kind"] for entry in experiment["entries"]], ["html", "blockly"])

    def test_inspect_course_normalizes_lessons_schema_with_experiment_relative_files(self):
        course_dir = Path(self.temp_dir.name) / "lesson-course"
        exp_dir = course_dir / "lesson10" / "exp1"
        exp_dir.mkdir(parents=True, exist_ok=True)
        (exp_dir / "index.html").write_text("<html></html>", encoding="utf-8")
        (exp_dir / "main.blockly.xml").write_text("<xml></xml>", encoding="utf-8")
        (exp_dir / "main.ipynb").write_text(
            "{\"cells\": [], \"metadata\": {}, \"nbformat\": 4, \"nbformat_minor\": 5}",
            encoding="utf-8",
        )
        (course_dir / "course.json").write_text(
            json.dumps({
                "id": "ai-referee",
                "title": "运动会上的AI裁判",
                "lessons": [
                    {
                        "id": "lesson10",
                        "title": "第10课 模型评估",
                        "experiments": [
                            {
                                "id": "exp1",
                                "title": "实验1：模型推理",
                                "files": ["index.html", "main.blockly.xml", "main.ipynb"],
                            }
                        ],
                    }
                ],
            }),
            encoding="utf-8",
        )

        response = self.client.post("/api/resources/inspect-course", json={"local_path": str(course_dir)})
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertTrue(data["success"])
        self.assertEqual(data["summary"]["ready_count"], 1)
        self.assertEqual(data["course"]["sections"][0]["title"], "第10课 模型评估")
        experiment = data["inspection"]["sections"][0]["experiments"][0]
        self.assertEqual(experiment["status"], "ready")
        self.assertEqual(
            [entry["path"] for entry in experiment["entries"]],
            [
                "lesson10/exp1/index.html",
                "lesson10/exp1/main.blockly.xml",
                "lesson10/exp1/main.ipynb",
            ],
        )
        self.assertEqual(
            [entry["kind"] for entry in experiment["entries"]],
            ["html", "blockly", "notebook"],
        )

    def test_inspect_course_reports_broken_for_missing_local_file(self):
        course_dir = Path(self.temp_dir.name) / "broken-course"
        course_dir.mkdir(parents=True, exist_ok=True)
        (course_dir / "course.json").write_text(
            json.dumps({
                "id": "broken-course",
                "title": "Broken Course",
                "sections": [
                    {
                        "title": "第一课",
                        "experiments": [
                            {
                                "title": "实验一",
                                "files": [{"path": "missing.ipynb", "type": "ipynb"}],
                            }
                        ],
                    }
                ],
            }),
            encoding="utf-8",
        )

        response = self.client.post("/api/resources/inspect-course", json={"local_path": str(course_dir)})
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertEqual(data["summary"]["broken_count"], 1)
        experiment = data["inspection"]["sections"][0]["experiments"][0]
        self.assertEqual(experiment["status"], "broken")
        self.assertIn("missing.ipynb", experiment["missing_files"])

    @patch("api.routes.resources.load_repo_tree_data")
    @patch("api.routes.resources.load_course_data_from_repo")
    @patch("api.routes.resources.find_course_entry_from_index")
    def test_inspect_remote_course_loads_course_json_from_index_entry(self, find_entry, load_course, load_tree):
        find_entry.return_value = {
            "id": "remote-course",
            "course_url": "courses/remote-course/course.json",
            "package_url": "courses/remote-course/package.zip",
        }
        load_course.return_value = {
            "id": "remote-course",
            "title": "Remote Course",
            "sections": [
                {
                    "title": "第一课",
                    "experiments": [
                        {
                            "title": "实验一",
                            "files": [{"path": "lessons/one/index.html", "type": "html"}],
                        }
                    ],
                }
            ],
        }
        load_tree.return_value = [
            {"path": "courses/remote-course/course.json", "type": "blob"},
            {"path": "lessons/one/index.html", "type": "blob"},
        ]

        response = self.client.post(
            "/api/resources/inspect-course",
            json={
                "source_override": {
                    "id": "override",
                    "base_url": "https://git.example.com",
                    "repo": "owner/repo",
                    "branch": "main",
                    "index_path": "index.json",
                },
                "course_id": "remote-course",
            },
        )
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertEqual(data["course"]["sections"][0]["experiments"][0]["title"], "实验一")
        self.assertEqual(data["summary"]["ready_count"], 1)
        find_entry.assert_called_once()
        load_course.assert_called_once()

    @patch("api.routes.resources.load_repo_tree_data")
    @patch("api.routes.resources.load_course_data_from_repo")
    def test_inspect_remote_course_reports_broken_when_tree_missing_file(self, load_course, load_tree):
        load_course.return_value = {
            "id": "remote-missing",
            "title": "Remote Missing",
            "sections": [
                {
                    "title": "第一课",
                    "experiments": [
                        {
                            "title": "实验一",
                            "files": [{"path": "lesson/demo.py", "type": "python"}],
                        }
                    ],
                }
            ],
        }
        load_tree.return_value = [{"path": "course.json", "type": "blob"}]

        response = self.client.post(
            "/api/resources/inspect-course",
            json={
                "source_override": {
                    "id": "override",
                    "base_url": "https://git.example.com",
                    "repo": "owner/repo",
                    "branch": "main",
                },
                "course_url": "course.json",
            },
        )
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertEqual(data["summary"]["broken_count"], 1)
        experiment = data["inspection"]["sections"][0]["experiments"][0]
        self.assertEqual(experiment["status"], "broken")
        self.assertIn("lesson/demo.py", experiment["missing_files"])

    @patch("api.routes.resources.load_repo_tree_data")
    @patch("api.routes.resources.load_course_data_from_repo")
    def test_inspect_single_course_repo_defaults_to_root_course_json(self, load_course, load_tree):
        load_course.return_value = {
            "id": "single-course",
            "title": "Single Course",
            "sections": [
                {
                    "title": "第一课",
                    "experiments": [
                        {
                            "title": "实验一",
                            "files": [{"path": "demo.ipynb", "type": "ipynb"}],
                        }
                    ],
                }
            ],
        }
        load_tree.return_value = [
            {"path": "course.json", "type": "blob"},
            {"path": "demo.ipynb", "type": "blob"},
        ]

        response = self.client.post(
            "/api/resources/inspect-course",
            json={
                "source_override": {
                    "id": "override",
                    "base_url": "https://git.example.com",
                    "repo": "owner/course",
                    "branch": "main",
                    "single_course_repo": True,
                }
            },
        )
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertEqual(data["course"]["course_url"], "course.json")
        self.assertTrue(data["course"]["single_course_repo"])
        self.assertEqual(data["summary"]["ready_count"], 1)
