import json
import sys
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
    _RUNTIME_SUPPORTED_TASKS_CACHE,
    _canonical_task_id,
    _get_runtime_supported_tasks,
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

    def test_hidden_large_task_ids_canonicalize_to_standard_tasks(self):
        self.assertEqual(_canonical_task_id("det_body_l"), "det_body")
        self.assertEqual(_canonical_task_id("pose_body17_l"), "pose_body17")
        self.assertEqual(_canonical_task_id("det_coco_l"), "det_coco_l")
        self.assertEqual(_canonical_task_id("pose_wholebody133"), "pose_wholebody133")

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
