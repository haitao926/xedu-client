import sys
import time
import unittest
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from services.course_transfer_jobs import CourseTransferJobManager  # noqa: E402


class CourseTransferJobManagerTestCase(unittest.TestCase):
    def setUp(self):
        self.manager = CourseTransferJobManager(max_workers=1, retention_seconds=60)

    def tearDown(self):
        self.manager.shutdown(wait=True)

    def _wait_for_terminal(self, operation_id):
        deadline = time.monotonic() + 2
        state = None
        while time.monotonic() < deadline:
            state = self.manager.get(operation_id)
            if state and state["state"] in {"success", "error"}:
                return state
            time.sleep(0.01)
        self.fail(f"operation did not finish: {state}")

    def test_job_reports_progress_and_terminal_result(self):
        def work(report):
            report({
                "phase": "downloading",
                "percent": 42,
                "completed_files": 2,
                "total_files": 5,
                "completed_bytes": 420,
                "total_bytes": 1000,
                "current_file": "lesson/demo.zip",
                "message": "正在下载",
            })
            return {"course_id": "demo-course"}

        operation_id = self.manager.start(work)
        state = self._wait_for_terminal(operation_id)

        self.assertEqual(state["state"], "success")
        self.assertEqual(state["phase"], "completed")
        self.assertEqual(state["percent"], 100)
        self.assertEqual(state["result"], {"course_id": "demo-course"})
        self.assertEqual(state["current_file"], "lesson/demo.zip")
        self.assertEqual(state["completed_files"], 2)
        self.assertEqual(state["total_files"], 5)

    def test_job_captures_worker_errors_as_terminal_state(self):
        operation_id = self.manager.start(lambda _report: (_ for _ in ()).throw(ValueError("课程包损坏")))
        state = self._wait_for_terminal(operation_id)

        self.assertEqual(state["state"], "error")
        self.assertEqual(state["phase"], "error")
        self.assertEqual(state["error"], "课程包损坏")
        self.assertIsNone(state["result"])

    def test_unknown_operation_returns_none(self):
        self.assertIsNone(self.manager.get("missing-operation"))


if __name__ == "__main__":
    unittest.main()
