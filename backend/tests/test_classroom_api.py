import io
import json
import socket
import stat
import tempfile
import threading
import time
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch
from urllib import error as urlerror


BACKEND_DIR = Path(__file__).resolve().parents[1]
import sys
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from api.app import create_app  # noqa: E402
from services.classroom_service import ClassroomService, ClassroomServiceError  # noqa: E402
from api_test_utils import authorized_test_client  # noqa: E402


class ClassroomApiTestCase(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        app = create_app(Path(self.temp_dir.name))
        app.testing = True
        self.client = authorized_test_client(app)

    def tearDown(self):
        self.temp_dir.cleanup()

    @staticmethod
    def _package_bytes(entries):
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
            for name, data in entries:
                if isinstance(name, zipfile.ZipInfo):
                    archive.writestr(name, data)
                else:
                    archive.writestr(name, data)
        return buffer.getvalue()

    def _write_local_course(self, *, course_id: str, version: str = "1.0") -> Path:
        course_dir = Path(self.temp_dir.name) / course_id
        (course_dir / "lesson").mkdir(parents=True, exist_ok=True)
        (course_dir / "lesson" / "readme.txt").write_text("hello", encoding="utf-8")
        (course_dir / "course.json").write_text(
            json.dumps(
                {
                    "id": course_id,
                    "title": f"课程 {course_id}",
                    "version": version,
                    "sections": [],
                },
                ensure_ascii=False,
            ),
            encoding="utf-8",
        )
        return course_dir

    def test_discover_ignores_malformed_datagrams_and_accepts_valid_payload(self):
        class FakeSocket:
            def __init__(self):
                self.payloads = [
                    (b"not-json", ("192.168.1.10", 39527)),
                    (json.dumps({"type": "xedu-classroom", "port": "invalid"}).encode(), ("192.168.1.11", 39527)),
                    (json.dumps({
                        "type": "xedu-classroom",
                        "server_id": "teacher-1",
                        "name": "教师机",
                        "code": "room-a",
                        "port": 5123,
                        "course_count": 2,
                    }).encode(), ("192.168.1.12", 39527)),
                ]

            def setsockopt(self, *_args):
                return None

            def bind(self, *_args):
                return None

            def settimeout(self, *_args):
                return None

            def sendto(self, *_args):
                return None

            def recvfrom(self, *_args):
                if self.payloads:
                    return self.payloads.pop(0)
                raise socket.timeout

            def close(self):
                return None

        with patch("services.classroom_service._iter_discovery_broadcast_targets", return_value=["255.255.255.255"]), patch("services.classroom_service.socket.socket", return_value=FakeSocket()):
            results = ClassroomService.discover(timeout=0.5)

        self.assertEqual(results, [{
            "server_id": "teacher-1",
            "name": "教师机",
            "code": "room-a",
            "host": "192.168.1.12",
            "port": 5123,
            "course_count": 2,
            "last_seen": results[0]["last_seen"],
        }])

    def test_discover_retries_probes_and_deduplicates_classrooms(self):
        class FakeSocket:
            def __init__(self):
                self.sent = []
                self.payloads = [
                    socket.timeout(),
                    socket.timeout(),
                    (
                        json.dumps({
                            "type": "xedu-classroom",
                            "server_id": "teacher-1",
                            "name": "教师机",
                            "code": "room-a",
                            "port": 5123,
                            "course_count": 1,
                        }).encode(),
                        ("192.168.1.12", 39527),
                    ),
                    (
                        json.dumps({
                            "type": "xedu-classroom",
                            "server_id": "teacher-1",
                            "name": "教师机",
                            "code": "room-a",
                            "port": 5123,
                            "course_count": 3,
                        }).encode(),
                        ("192.168.1.12", 39527),
                    ),
                ]

            def setsockopt(self, *_args):
                return None

            def bind(self, *_args):
                return None

            def settimeout(self, *_args):
                return None

            def sendto(self, data, addr):
                self.sent.append((json.loads(data.decode("utf-8")), addr))
                return None

            def recvfrom(self, *_args):
                if not self.payloads:
                    raise socket.timeout
                item = self.payloads.pop(0)
                if isinstance(item, BaseException):
                    raise item
                return item

            def close(self):
                return None

        fake_socket = FakeSocket()
        monotonic_state = {"value": 0.0}

        def fake_monotonic():
            monotonic_state["value"] += 0.2
            return monotonic_state["value"]

        with patch("services.classroom_service._iter_discovery_broadcast_targets", return_value=["255.255.255.255"]), patch("services.classroom_service.time.monotonic", side_effect=fake_monotonic), patch("services.classroom_service.socket.socket", return_value=fake_socket):
            results = ClassroomService.discover(timeout=1.5, classroom_code="room-a")

        probe_payloads = [payload for payload, _addr in fake_socket.sent]
        self.assertGreaterEqual(len(probe_payloads), 2)
        self.assertTrue(all(payload["type"] == "xedu-classroom-probe" for payload in probe_payloads))
        self.assertTrue(all(payload["code"] == "room-a" for payload in probe_payloads))
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["server_id"], "teacher-1")
        self.assertEqual(results[0]["course_count"], 3)

    def test_discover_returns_empty_after_timeout_when_no_classroom_responds(self):
        class FakeSocket:
            def __init__(self):
                self.sent = []

            def setsockopt(self, *_args):
                return None

            def bind(self, *_args):
                return None

            def settimeout(self, *_args):
                return None

            def sendto(self, data, addr):
                self.sent.append((json.loads(data.decode("utf-8")), addr))
                return None

            def recvfrom(self, *_args):
                raise socket.timeout

            def close(self):
                return None

        fake_socket = FakeSocket()
        monotonic_state = {"value": 0.0}

        def fake_monotonic():
            monotonic_state["value"] += 0.2
            return monotonic_state["value"]

        with patch("services.classroom_service._iter_discovery_broadcast_targets", return_value=["255.255.255.255"]), patch("services.classroom_service.time.monotonic", side_effect=fake_monotonic), patch("services.classroom_service.socket.socket", return_value=fake_socket):
            results = ClassroomService.discover(timeout=1.5, classroom_code="room-a")

        self.assertEqual(results, [])
        self.assertGreaterEqual(len(fake_socket.sent), 2)

    @staticmethod
    def _read_zip_member(zip_path: Path, member: str) -> str:
        with zipfile.ZipFile(zip_path, "r") as archive:
            return archive.read(member).decode("utf-8")

    def test_teacher_verification_fails_closed_until_a_code_is_configured(self):
        response = self.client.post(
            "/api/classroom/verify-teacher",
            json={"teacher_code": ""},
        )

        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.get_json()["success"])

    def test_pull_package_rejects_non_http_url(self):
        target = Path(self.temp_dir.name) / "course"

        with self.assertRaisesRegex(ClassroomServiceError, "HTTP"):
            ClassroomService.pull_package("file:///etc/passwd", str(target))

    def test_pull_package_rejects_url_credentials(self):
        target = Path(self.temp_dir.name) / "course"

        with self.assertRaisesRegex(ClassroomServiceError, "凭据"):
            ClassroomService.pull_package("http://user:password@example.test/course.zip", str(target))

    def test_pull_package_rejects_oversized_download(self):
        target = Path(self.temp_dir.name) / "course"
        response = io.BytesIO(b"01234567890")

        with patch("services.classroom_service.MAX_CLASSROOM_PACKAGE_BYTES", 10), patch(
            "services.classroom_service.urlrequest.urlopen",
            return_value=response,
        ), self.assertRaisesRegex(ClassroomServiceError, "下载大小"):
            ClassroomService.pull_package("http://classroom.test/course.zip", str(target))

    def test_pull_package_rejects_unsafe_archive_members(self):
        target = Path(self.temp_dir.name) / "course"
        symlink = zipfile.ZipInfo("lesson/link")
        symlink.create_system = 3
        symlink.external_attr = (stat.S_IFLNK | 0o777) << 16
        unsafe_packages = (
            self._package_bytes((("course.json", "{}"), ("../escape.txt", "escape"))),
            self._package_bytes((("course.json", "{}"), (symlink, "../../escape"))),
        )

        for package in unsafe_packages:
            with self.subTest(size=len(package)), patch(
                "services.classroom_service.urlrequest.urlopen",
                return_value=io.BytesIO(package),
            ), self.assertRaisesRegex(ClassroomServiceError, "不安全"):
                ClassroomService.pull_package("http://classroom.test/course.zip", str(target))

    def test_pull_package_rejects_oversized_expanded_archive(self):
        target = Path(self.temp_dir.name) / "course"
        package = self._package_bytes((("course.json", "{}"), ("lesson/data.txt", "01234567890")))

        with patch("services.classroom_service.MAX_CLASSROOM_EXPANDED_BYTES", 10), patch(
            "services.classroom_service.urlrequest.urlopen",
            return_value=io.BytesIO(package),
        ), self.assertRaisesRegex(ClassroomServiceError, "解压大小"):
            ClassroomService.pull_package("http://classroom.test/course.zip", str(target))

    def test_pull_package_extracts_valid_classroom_archive(self):
        target = Path(self.temp_dir.name) / "course"
        package = self._package_bytes(
            (
                ("course.json", json.dumps({"id": "course-1", "title": "课堂课程"})),
                ("lesson/readme.txt", "hello"),
            )
        )
        progress = []

        with patch(
            "services.classroom_service.urlrequest.urlopen",
            return_value=io.BytesIO(package),
        ):
            result = ClassroomService.pull_package(
                "http://classroom.test/course.zip",
                str(target),
                progress_callback=progress.append,
            )

        self.assertEqual(result["course"]["id"], "course-1")
        self.assertEqual((target / "lesson" / "readme.txt").read_text(encoding="utf-8"), "hello")
        self.assertEqual(
            {item.get("phase") for item in progress},
            {"downloading", "extracting", "validating", "writing"},
        )

    def test_classroom_pull_route_returns_a_pollable_job_before_transfer_finishes(self):
        release_worker = threading.Event()
        progress_reported = threading.Event()
        target = Path(self.temp_dir.name) / "async-classroom-course"

        def fake_pull_package(package_url, target_path, progress_callback=None):
            self.assertEqual(package_url, "http://classroom.test/course.zip")
            self.assertEqual(target_path, str(target))
            release_worker.wait(timeout=2)
            if progress_callback:
                progress_callback({
                    "phase": "downloading",
                    "percent": 50,
                    "message": "正在下载课堂课程包...",
                })
                progress_reported.set()
            target.mkdir(parents=True, exist_ok=True)
            return {
                "course": {"id": "classroom-course", "title": "课堂课程"},
                "local_path": str(target),
                "summary": {"section_count": 0},
            }

        release_timer = threading.Timer(1, release_worker.set)
        try:
            with patch.object(ClassroomService, "pull_package", side_effect=fake_pull_package):
                release_timer.start()
                response = self.client.post(
                    "/api/classroom/pull",
                    json={
                        "async": "true",
                        "package_url": "http://classroom.test/course.zip",
                        "target_path": str(target),
                    },
                )
                returned_before_worker_finished = not release_worker.is_set()
                body = response.get_json()

                self.assertEqual(response.status_code, 200)
                self.assertTrue(returned_before_worker_finished)
                self.assertIsInstance(body.get("operation_id"), str)

                release_worker.set()
                deadline = time.monotonic() + 2
                operation = None
                while time.monotonic() < deadline:
                    operation_response = self.client.get(
                        f"/api/resources/operations/{body['operation_id']}"
                    )
                    self.assertEqual(operation_response.status_code, 200)
                    operation = operation_response.get_json()["operation"]
                    if operation["state"] == "success":
                        break
                    time.sleep(0.01)

                self.assertIsNotNone(operation)
                self.assertEqual(operation["state"], "success")
                self.assertEqual(operation["result"]["course"]["id"], "classroom-course")
                self.assertTrue(progress_reported.is_set())
        finally:
            release_worker.set()
            release_timer.cancel()

    def test_fetch_index_returns_flattened_contract(self):
        upstream = {
            "index": {"resources": [{"id": "course-1"}], "classroom": {"name": "课堂A", "code": "abc123"}},
            "repo_url": "http://127.0.0.1:5123",
            "raw_base_url": "http://127.0.0.1:5123",
            "branch": "classroom",
        }
        with patch("api.routes.classroom.ClassroomService.fetch_index", return_value=upstream) as fetch_index:
            response = self.client.post(
                "/api/classroom/fetch-index",
                json={"base_url": "http://127.0.0.1:5123", "classroom_code": "abc123"},
            )

        self.assertEqual(response.status_code, 200)
        fetch_index.assert_called_once_with("http://127.0.0.1:5123", classroom_code="abc123")
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

    def test_fetch_index_validates_course_reachability(self):
        index_payload = {
            "success": True,
            "index": {
                "resources": [
                    {
                        "id": "course-1",
                        "course_url": "http://127.0.0.1:5123/api/classroom/course/course-1/course.json",
                    }
                ],
                "classroom": {
                    "name": "课堂A",
                    "code": "abc123",
                    "active_course_id": "course-1",
                },
            },
        }

        class FakeResponse(io.BytesIO):
            def __enter__(self):
                return self

            def __exit__(self, exc_type, exc, tb):
                self.close()
                return False

        def fake_urlopen(request, timeout=10):
            url = request.full_url
            if url.endswith("/api/classroom/index"):
                return FakeResponse(json.dumps(index_payload).encode("utf-8"))
            raise urlerror.HTTPError(url, 404, "Not Found", hdrs=None, fp=None)

        with patch("services.classroom_service.urlrequest.urlopen", side_effect=fake_urlopen):
            with self.assertRaisesRegex(ClassroomServiceError, "课堂课程不可达: HTTP 404"):
                ClassroomService.fetch_index("http://127.0.0.1:5123", classroom_code="abc123")

    def test_start_broadcast_status_and_index_include_classroom_code(self):
        teacher_code = "test-teacher-code"
        self.client.post("/api/save_config", json={"ui": {"classroom_teacher_code": teacher_code}})
        response = self.client.post(
            "/api/classroom/start",
            json={"name": "课堂A", "code": "abc123", "port": 5123, "teacher_code": teacher_code},
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

        lan_index_response = self.client.get(
            "/api/classroom/index",
            headers={"Host": "192.168.1.20:5123"},
        )
        self.assertEqual(lan_index_response.status_code, 200)
        lan_index_data = lan_index_response.get_json()
        self.assertEqual(lan_index_data["source_url"], "http://192.168.1.20:5123/api/classroom/index")

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

        teacher_code = "test-teacher-code"
        self.client.post("/api/save_config", json={"ui": {"classroom_teacher_code": teacher_code}})
        start_response = self.client.post(
            "/api/classroom/start",
            json={
                "name": "课堂A",
                "code": "abc123",
                "port": 5123,
                "course_id": "course-full",
                "section_index": 1,
                "teacher_code": teacher_code,
            },
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

    def test_build_package_concurrent_requests_generate_single_shared_zip(self):
        service = ClassroomService()
        course_dir = self._write_local_course(course_id="course-cache")
        service.update_courses(
            [
                {
                    "id": "course-cache",
                    "title": "缓存课程",
                    "local_path": str(course_dir),
                }
            ]
        )

        paths = []
        errors = []
        path_lock = threading.Lock()
        start_barrier = threading.Barrier(2)
        write_count = 0
        write_count_lock = threading.Lock()
        real_write_package_zip = ClassroomService._write_package_zip

        def instrumented_write(service_self, local_path, course_json_bytes, target_path):
            nonlocal write_count
            with write_count_lock:
                write_count += 1
                current_count = write_count
            if current_count == 1:
                time.sleep(0.2)
            return real_write_package_zip(service_self, local_path, course_json_bytes, target_path)

        def worker():
            try:
                start_barrier.wait(timeout=2)
                zip_path = service.build_package("course-cache", "1.0")
                with path_lock:
                    paths.append(zip_path)
            except Exception as exc:
                errors.append(exc)

        threads = [threading.Thread(target=worker) for _ in range(2)]
        with patch.object(ClassroomService, "_write_package_zip", autospec=True, side_effect=instrumented_write):
            for thread in threads:
                thread.start()
            for thread in threads:
                thread.join(timeout=5)

        self.assertEqual(errors, [])
        self.assertEqual(len(paths), 2)
        self.assertEqual(write_count, 1)
        self.assertNotEqual(paths[0], paths[1])

        payload_a = paths[0].read_bytes()
        paths[0].unlink(missing_ok=True)
        payload_b = paths[1].read_bytes()
        self.assertEqual(payload_a, payload_b)
        paths[1].unlink(missing_ok=True)

    def test_build_package_regenerates_when_content_summary_changes(self):
        service = ClassroomService()
        course_dir = self._write_local_course(course_id="course-cache-refresh")
        lesson_file = course_dir / "lesson" / "readme.txt"
        service.update_courses(
            [
                {
                    "id": "course-cache-refresh",
                    "title": "缓存课程",
                    "local_path": str(course_dir),
                }
            ]
        )

        write_count = 0
        real_write_package_zip = ClassroomService._write_package_zip

        def instrumented_write(service_self, local_path, course_json_bytes, target_path):
            nonlocal write_count
            write_count += 1
            return real_write_package_zip(service_self, local_path, course_json_bytes, target_path)

        with patch.object(ClassroomService, "_write_package_zip", autospec=True, side_effect=instrumented_write):
            first_zip = service.build_package("course-cache-refresh", "1.0")
            second_zip = service.build_package("course-cache-refresh", "1.0")
            time.sleep(0.01)
            lesson_file.write_text("updated", encoding="utf-8")
            third_zip = service.build_package("course-cache-refresh", "1.0")

        self.assertEqual(write_count, 2)
        self.assertEqual(self._read_zip_member(first_zip, "lesson/readme.txt"), "hello")
        self.assertEqual(self._read_zip_member(second_zip, "lesson/readme.txt"), "hello")
        self.assertEqual(self._read_zip_member(third_zip, "lesson/readme.txt"), "updated")

        first_zip.unlink(missing_ok=True)
        second_zip.unlink(missing_ok=True)
        third_zip.unlink(missing_ok=True)

    def test_stopping_classroom_clears_shared_cache_but_keeps_active_lease(self):
        service = ClassroomService()
        course_dir = self._write_local_course(course_id="course-cache-stop")
        service.update_courses([{"id": "course-cache-stop", "title": "缓存课程", "local_path": str(course_dir)}])
        lease = service.build_package("course-cache-stop", "1.0")

        service.stop()

        self.assertEqual(service._package_cache, {})
        self.assertTrue(lease.exists())
        with zipfile.ZipFile(lease, "r") as archive:
            self.assertIn("course.json", archive.namelist())
        lease.unlink(missing_ok=True)

    def test_classroom_package_rejects_symlink_and_hardlink_files(self):
        service = ClassroomService()
        course_dir = self._write_local_course(course_id="unsafe-classroom-course")
        service.update_courses([
            {
                "id": "unsafe-classroom-course",
                "title": "不安全课堂课程",
                "local_path": str(course_dir),
            }
        ])
        outside = Path(self.temp_dir.name) / "classroom-outside.txt"
        outside.write_text("private", encoding="utf-8")

        symlink_path = course_dir / "lesson" / "linked.txt"
        try:
            symlink_path.symlink_to(outside)
        except (OSError, NotImplementedError):
            self.skipTest("当前文件系统不支持符号链接")
        with self.assertRaisesRegex(ClassroomServiceError, "符号链接"):
            service.build_package("unsafe-classroom-course", "1.0")
        symlink_path.unlink()

        hardlink_path = course_dir / "lesson" / "hardlink.txt"
        try:
            hardlink_path.hardlink_to(outside)
        except (OSError, NotImplementedError):
            self.skipTest("当前文件系统不支持硬链接")
        with self.assertRaisesRegex(ClassroomServiceError, "硬链接"):
            service.build_package("unsafe-classroom-course", "1.0")

    def test_classroom_file_rejects_linked_public_files(self):
        service = ClassroomService()
        course_dir = self._write_local_course(course_id="public-file-course")
        service.update_courses([
            {
                "id": "public-file-course",
                "title": "公开文件课程",
                "local_path": str(course_dir),
            }
        ])
        outside = Path(self.temp_dir.name) / "public-outside.txt"
        outside.write_text("private", encoding="utf-8")
        linked = course_dir / "lesson" / "linked.txt"
        try:
            linked.symlink_to(outside)
        except (OSError, NotImplementedError):
            self.skipTest("当前文件系统不支持符号链接")
        with self.assertRaisesRegex(ClassroomServiceError, "符号链接"):
            service.resolve_file_path("public-file-course", "lesson/linked.txt")

        linked.unlink()
        hardlink = course_dir / "lesson" / "hardlink.txt"
        try:
            hardlink.hardlink_to(outside)
        except (OSError, NotImplementedError):
            self.skipTest("当前文件系统不支持硬链接")
        with self.assertRaisesRegex(ClassroomServiceError, "硬链接"):
            service.resolve_file_path("public-file-course", "lesson/hardlink.txt")


if __name__ == "__main__":
    unittest.main()
