import base64
import io
import json
import sys
import tempfile
import time
import unittest
from pathlib import Path
import types
from unittest.mock import patch


BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from services.xeduhub_support import (  # noqa: E402
    DEFAULT_XEDUHUB_SAMPLE_IMAGE,
    TASK_REGISTRY,
    _RUNTIME_WORKFLOW_INIT_LOCKS,
    _RUNTIME_SUPPORTED_TASKS_CACHE,
    _canonical_task_id,
    _build_runtime_success,
    _build_depth_preview_image,
    _build_segmentation_preview_image,
    _build_xeduhub_runtime_params,
    _clear_runtime_workflow_cache,
    _compact_depth_output,
    _compact_realtime_output,
    _decode_realtime_frame,
    execute_xeduhub_realtime,
    _execute_xeduhub_runtime,
    _get_runtime_workflow,
    _get_runtime_supported_tasks,
    _normalize_params,
    _run_runtime_inference,
    _RuntimeWorkflowBusyError,
    _resolve_smoke_checkpoint,
    _patch_rapidocr_visres_compat,
    resolve_input_path,
)


def _find_category(contents, name):
    return next(item for item in contents if item.get("kind") == "category" and item.get("name") == name)


def _block_types(contents):
    return [item.get("type") for item in contents if item.get("kind") == "block"]


class XEduHubSupportTestCase(unittest.TestCase):
    def tearDown(self):
        _RUNTIME_SUPPORTED_TASKS_CACHE["value"] = None
        _RUNTIME_SUPPORTED_TASKS_CACHE["expires_at"] = 0.0
        _clear_runtime_workflow_cache()

    def test_hidden_large_task_ids_canonicalize_to_standard_tasks(self):
        self.assertEqual(_canonical_task_id("det_body_l"), "det_body")
        self.assertEqual(_canonical_task_id("pose_body17_l"), "pose_body17")
        self.assertEqual(_canonical_task_id("det_coco_l"), "det_coco_l")
        self.assertEqual(_canonical_task_id("pose_wholebody133"), "pose_wholebody133")

    def test_explicit_empty_image_type_disables_realtime_preview(self):
        params = _normalize_params("pose_body17", {"img_type": ""})
        self.assertEqual(params["img_type"], "")
        self.assertNotIn("img_type", _build_xeduhub_runtime_params("pose_body17", params))

    def test_omitted_image_type_keeps_task_default(self):
        params = _normalize_params("pose_body17", {})
        self.assertEqual(_build_xeduhub_runtime_params("pose_body17", params)["img_type"], "pil")

    def test_explicit_empty_image_type_skips_result_preview_generation(self):
        with patch(
            "services.xeduhub_support._ensure_preview_image_for_result",
            side_effect=AssertionError("realtime requests must not build a preview"),
        ):
            payload = _build_runtime_success(
                code="",
                task_id="pose_body17",
                runtime_task_id="pose_body17",
                prepared_input="unused.jpg",
                params={"img_type": ""},
                output={"关键点": []},
            )

        self.assertEqual(payload["artifacts"]["image_data"], "")
        self.assertEqual(payload["result_artifacts"]["preview_image"], "")

    def test_realtime_decodes_jpeg_in_memory_and_keeps_result_compact(self):
        from PIL import Image

        image_buffer = __import__("io").BytesIO()
        Image.new("RGB", (32, 24), color=(20, 40, 60)).save(image_buffer, format="JPEG")
        seen = {}

        class _FakeWorkflow:
            def __init__(self, task, **kwargs):
                seen["task"] = task

            def inference(self, data=None, **kwargs):
                seen["data"] = data
                seen["params"] = kwargs
                return {"关键点": [[3, 4]]}

        with patch("services.xeduhub_support._get_runtime_supported_tasks", return_value=["pose_body17"]), patch(
            "services.xeduhub_support._resolve_smoke_checkpoint", return_value=""
        ), patch("services.xeduhub_support._patch_openxlab_repo_parser", return_value=None), patch(
            "services.xeduhub_support.tempfile.NamedTemporaryFile",
            side_effect=AssertionError("realtime frames must not use temporary files"),
        ), patch.dict(
            "sys.modules",
            {"XEdu.hub": type("FakeHubModule", (), {"Workflow": _FakeWorkflow})},
        ):
            payload = execute_xeduhub_realtime(
                image_buffer.getvalue(),
                {
                    "task_id": "pose_body17",
                    "session_id": "test-session",
                    "frame_seq": "7",
                    "captured_at_ms": "1234",
                    "params": "{}",
                },
            )

        self.assertTrue(payload["success"])
        self.assertEqual(payload["session_id"], "test-session")
        self.assertEqual(payload["frame_seq"], 7)
        self.assertEqual(seen["task"], "pose_body17")
        self.assertEqual(seen["data"].shape, (24, 32, 3))
        self.assertEqual(seen["params"], {})
        self.assertEqual(payload["result"]["input"]["source"], "camera")
        self.assertEqual(payload["result"]["output"], {"关键点": [[3, 4]]})
        self.assertIn("inference", payload["timings_ms"])
        self.assertGreaterEqual(payload["decode_ms"], 0)
        self.assertGreaterEqual(payload["inference_ms"], 0)
        self.assertGreaterEqual(payload["total_ms"], payload["inference_ms"])

    def test_realtime_frame_decoder_returns_bgr_without_using_temporary_files(self):
        from PIL import Image
        import numpy as np

        image_buffer = io.BytesIO()
        Image.new("RGB", (2, 1), color=(20, 40, 60)).save(image_buffer, format="JPEG")
        decoded = _decode_realtime_frame(image_buffer.getvalue())

        self.assertIsInstance(decoded, np.ndarray)
        self.assertEqual(decoded.shape, (1, 2, 3))
        self.assertLess(abs(int(decoded[0, 0, 0]) - 60), 5)
        self.assertLess(abs(int(decoded[0, 0, 1]) - 40), 5)
        self.assertLess(abs(int(decoded[0, 0, 2]) - 20), 5)

    def test_realtime_segmentation_and_depth_outputs_are_compact_previews(self):
        import numpy as np
        from PIL import Image

        camera_frame = np.zeros((24, 32, 3), dtype="uint8")
        segmentation_preview = _build_segmentation_preview_image(
            camera_frame,
            np.ones((2, 12, 16), dtype="float32"),
            transparent_only=True,
        )
        segmentation_image = Image.open(io.BytesIO(base64.b64decode(segmentation_preview.split(",", 1)[1])))
        self.assertEqual(segmentation_image.mode, "RGBA")
        self.assertGreater(segmentation_image.getchannel("A").getbbox()[2], 0)
        self.assertEqual(_compact_realtime_output("segment_anything", {"mask_count": 3}), {"掩码数": 3})

        compact_depth = _compact_depth_output(np.arange(240 * 320, dtype="float32").reshape(240, 320))
        depth_grid = compact_depth["深度图"]
        self.assertLessEqual(len(depth_grid), 120)
        self.assertLessEqual(len(depth_grid[0]), 160)
        self.assertTrue(all(len(str(value).split(".")[-1]) <= 3 for row in depth_grid for value in row))

        depth_preview = _build_depth_preview_image(compact_depth)
        depth_image = Image.open(io.BytesIO(base64.b64decode(depth_preview.split(",", 1)[1])))
        self.assertEqual(depth_image.mode, "RGB")
        self.assertGreater(len(np.unique(np.asarray(depth_image).reshape(-1, 3), axis=0)), 1)

    def test_runtime_workflow_cache_reuses_one_workflow_for_realtime_frames(self):
        init_calls = []

        class _FakeWorkflow:
            def __init__(self, task, **kwargs):
                init_calls.append((task, kwargs))

            def inference(self, data=None, **kwargs):
                return {"data": data, "params": kwargs}

        first = _get_runtime_workflow(_FakeWorkflow, "pose_body17", {"checkpoint": "/tmp/pose.onnx"})
        second = _get_runtime_workflow(_FakeWorkflow, "pose_body17", {"checkpoint": "/tmp/pose.onnx"})

        self.assertIs(first, second)
        self.assertEqual(init_calls, [("pose_body17", {"checkpoint": "/tmp/pose.onnx"})])
        self.assertIn("data", first.inference_signature.parameters)

    def test_failed_workflow_initialization_does_not_leave_a_stale_init_lock(self):
        class _BrokenWorkflow:
            def __init__(self, task, **kwargs):
                raise RuntimeError("model init failed")

        with self.assertRaisesRegex(RuntimeError, "model init failed"):
            _get_runtime_workflow(_BrokenWorkflow, "pose_body17", {})

        self.assertEqual(_RUNTIME_WORKFLOW_INIT_LOCKS, {})

    def test_realtime_inference_does_not_encode_unrequested_result_image(self):
        class _FakeWorkflow:
            def __init__(self, task, **kwargs):
                self.task = task

            def inference(self, data=None, **kwargs):
                return {"关键点": []}, object()

        with patch("services.xeduhub_support._get_runtime_supported_tasks", return_value=["pose_body17"]), patch(
            "services.xeduhub_support._normalize_input_for_task", return_value="/tmp/realtime-frame.jpg"
        ), patch("services.xeduhub_support._input_exists", return_value=True), patch(
            "services.xeduhub_support._resolve_smoke_checkpoint", return_value=""
        ), patch("services.xeduhub_support._patch_openxlab_repo_parser", return_value=None), patch(
            "services.xeduhub_support._best_effort_image_to_data_url",
            side_effect=AssertionError("realtime requests must not encode a result image"),
        ), patch.dict(
            "sys.modules",
            {"XEdu.hub": type("FakeHubModule", (), {"Workflow": _FakeWorkflow})},
        ):
            payload = _execute_xeduhub_runtime(
                {"code": "", "spec": {"task_id": "pose_body17", "input": "frame.jpg", "params": {"img_type": ""}}},
                [],
            )

        self.assertTrue(payload["success"])
        self.assertEqual(payload["result_artifacts"]["preview_image"], "")

    def test_realtime_inference_drops_busy_frame_without_waiting_for_old_frame(self):
        class _FakeWorkflow:
            def __init__(self, task, **kwargs):
                pass

            def inference(self, data=None, **kwargs):
                return {"ok": True}

        entry = _get_runtime_workflow(_FakeWorkflow, "pose_body17", {})
        entry.inference_lock.acquire()
        try:
            with self.assertRaises(_RuntimeWorkflowBusyError):
                _run_runtime_inference(entry, "/tmp/frame.jpg", {}, realtime=True)
        finally:
            entry.inference_lock.release()

    def test_realtime_global_busy_slot_does_not_initialize_a_model(self):
        from PIL import Image
        from types import SimpleNamespace

        image_buffer = io.BytesIO()
        Image.new("RGB", (8, 8), color=(20, 40, 60)).save(image_buffer, format="JPEG")
        slots = SimpleNamespace(acquire=lambda blocking=False: False, release=lambda: None)
        with patch("services.xeduhub_support._get_runtime_supported_tasks", return_value=["pose_body17"]), patch(
            "services.xeduhub_support._get_runtime_workflow",
            side_effect=AssertionError("busy requests must not initialize a workflow"),
        ), patch("services.xeduhub_support._REALTIME_INFERENCE_SLOTS", slots), patch.dict(
            "sys.modules",
            {"XEdu.hub": type("FakeHubModule", (), {"Workflow": object})},
        ):
            payload = execute_xeduhub_realtime(
                image_buffer.getvalue(),
                {"task_id": "pose_body17", "session_id": "busy", "frame_seq": "1"},
            )

        self.assertFalse(payload["success"])
        self.assertEqual(payload["error_code"], "runtime_busy")

    def test_runtime_supported_tasks_probe_times_out_and_caches_fallback(self):
        class _SlowWorkflow:
            @staticmethod
            def support_task():
                time.sleep(0.2)
                return ["bodydetect"]

        fake_module = type("FakeHubModule", (), {"Workflow": _SlowWorkflow})
        with patch.dict("sys.modules", {"XEdu.hub": fake_module}), patch.dict(
            "os.environ",
            {"XEDU_RUNTIME_SUPPORT_TIMEOUT": "0.01", "XEDU_RUNTIME_SUPPORT_TTL": "30"},
        ):
            started = time.monotonic()
            self.assertEqual(_get_runtime_supported_tasks(), [])
            elapsed = time.monotonic() - started
            self.assertLess(elapsed, 0.15)

            _RUNTIME_SUPPORTED_TASKS_CACHE["value"] = ["cached-task"]
            _RUNTIME_SUPPORTED_TASKS_CACHE["expires_at"] = time.monotonic() + 30
            self.assertEqual(_get_runtime_supported_tasks(), ["cached-task"])

    def test_runtime_supported_tasks_probe_uses_flask_python_on_windows(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            repo_root = Path(temp_dir)
            flask_python = repo_root / "python_env" / "python.exe"
            external_python = repo_root / "external" / "python.exe"
            flask_python.parent.mkdir(parents=True)
            external_python.parent.mkdir(parents=True)
            flask_python.touch()
            external_python.touch()

            completed = types.SimpleNamespace(
                returncode=0,
                stdout='["pose_body17"]\n',
            )
            with patch("sys.executable", str(flask_python)), patch(
                "services.xeduhub_support.REPO_ROOT", repo_root
            ), patch.dict(
                "os.environ",
                {
                    "XEDU_PYTHON_EXECUTABLE": str(external_python),
                    "XEDU_RUNTIME_SUPPORT_TIMEOUT": "0.2",
                },
                clear=False,
            ), patch(
                "services.xeduhub_support.subprocess.run",
                return_value=completed,
            ) as run_mock:
                supported = _get_runtime_supported_tasks()

        self.assertEqual(supported, ["pose_body17"])
        run_mock.assert_called_once()
        self.assertEqual(run_mock.call_args.args[0][0], str(flask_python))
        self.assertNotEqual(run_mock.call_args.args[0][0], str(external_python))

    def test_legacy_demo_input_alias_resolves_to_repo_sample(self):
        resolved = Path(resolve_input_path("demo.jpg", str(BACKEND_DIR.parent)))
        self.assertTrue(resolved.exists())
        self.assertTrue(resolved.as_posix().endswith("demo.jpg"))

    def test_default_xeduhub_sample_input_is_generated_when_course_asset_is_missing(self):
        for raw_input in ("demo.jpg", DEFAULT_XEDUHUB_SAMPLE_IMAGE):
            with self.subTest(raw_input=raw_input):
                resolved = Path(resolve_input_path(raw_input))
                self.assertTrue(resolved.exists())
                self.assertEqual(resolved.suffix.lower(), ".jpg")

    def test_packaged_checkpoint_roots_resolve_core_xeduhub_models(self):
        for runtime_task_id, expected_name in {
            "det_body": "bodydetect.onnx",
            "det_coco_l": "cocodetect.onnx",
            "pose_hand21": "hand21.onnx",
            "pose_wholebody133": "pose_wholebody133.onnx",
            "bodydetect": "bodydetect.onnx",
            "wholebody133": "pose_wholebody133.onnx",
        }.items():
            with self.subTest(runtime_task_id=runtime_task_id):
                resolved = Path(_resolve_smoke_checkpoint(runtime_task_id))
                self.assertTrue(resolved.exists(), f"missing checkpoint for {runtime_task_id}")
                self.assertEqual(resolved.name, expected_name)

    def test_rapidocr_visres_compat_patch_accepts_font_path_kwarg(self):
        fake_module = types.ModuleType("rapidocr_onnxruntime")
        fake_utils_module = types.ModuleType("rapidocr_onnxruntime.utils")
        fake_vis_res_module = types.ModuleType("rapidocr_onnxruntime.utils.vis_res")

        class FakeVisRes:
            def __init__(self, text_score=0.5):
                self.text_score = text_score
                self.calls = []

            @staticmethod
            def get_font_path(font_path=None):
                raise FileNotFoundError(font_path)

            def __call__(self, *args, **kwargs):
                resolved = self.get_font_path(kwargs.get("font_path"))
                self.calls.append(resolved)
                return "ok"

        fake_module.VisRes = FakeVisRes
        fake_vis_res_module.VisRes = FakeVisRes
        fake_utils_module.vis_res = fake_vis_res_module
        fake_module.utils = fake_utils_module

        with patch.dict(
            sys.modules,
            {
                "rapidocr_onnxruntime": fake_module,
                "rapidocr_onnxruntime.utils": fake_utils_module,
                "rapidocr_onnxruntime.utils.vis_res": fake_vis_res_module,
            },
            clear=False,
        ):
            _patch_rapidocr_visres_compat()
            vis = fake_module.VisRes(font_path="ignored-by-compat-layer")
            self.assertTrue(Path(vis.get_font_path(None)).exists())
            vis("img", [], ["a"], [1.0])

        self.assertIsInstance(vis, FakeVisRes)
        self.assertEqual(len(vis.calls), 1)
        self.assertTrue(Path(vis.calls[0]).exists())
