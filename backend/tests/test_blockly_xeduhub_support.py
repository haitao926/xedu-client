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

from services.blockly_xeduhub_support import (  # noqa: E402
    DEFAULT_BLOCKLY_SAMPLE_IMAGE,
    TASK_REGISTRY,
    _RUNTIME_SUPPORTED_TASKS_CACHE,
    _canonical_task_id,
    _get_runtime_supported_tasks,
    _resolve_smoke_checkpoint,
    _patch_rapidocr_visres_compat,
    build_xeduhub_toolbox_definition,
    get_xeduhub_frontend_registry,
    resolve_input_path,
    TASK_FAMILY_META,
)


def _find_category(contents, name):
    return next(item for item in contents if item.get("kind") == "category" and item.get("name") == name)


def _block_types(contents):
    return [item.get("type") for item in contents if item.get("kind") == "block"]


class BlocklyXEduHubSupportTestCase(unittest.TestCase):
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

    def test_default_blockly_sample_input_is_generated_when_course_asset_is_missing(self):
        for raw_input in ("demo.jpg", DEFAULT_BLOCKLY_SAMPLE_IMAGE):
            with self.subTest(raw_input=raw_input):
                resolved = Path(resolve_input_path(raw_input))
                self.assertTrue(resolved.exists())
                self.assertEqual(resolved.suffix.lower(), ".jpg")

    def test_frontend_registry_has_unique_task_ids(self):
        registry = get_xeduhub_frontend_registry()
        task_ids = [item["task_id"] for item in registry["tasks"]]
        self.assertEqual(len(task_ids), len(set(task_ids)))
        self.assertIn("det_body", task_ids)
        self.assertIn("cls_imagenet", task_ids)
        self.assertIn("segment_anything", task_ids)
        self.assertIn("depth_anything", task_ids)

    def test_frontend_registry_marks_supported_vs_unsupported_tasks(self):
        registry = get_xeduhub_frontend_registry()
        task_map = {item["task_id"]: item for item in registry["tasks"]}
        self.assertTrue(task_map["det_body"]["available"])
        self.assertTrue(task_map["det_coco_l"]["available"])
        self.assertTrue(task_map["pose_face106"]["available"])
        self.assertTrue(task_map["pose_hand21"]["available"])
        self.assertTrue(task_map["pose_wholebody133"]["available"])
        self.assertTrue(task_map["ocr"]["available"])
        self.assertTrue(task_map["cls_imagenet"]["available"])
        self.assertTrue(task_map["segment_anything"]["available"])
        self.assertIn(task_map["det_body"]["support_source"], {"runtime", "checkpoint"})
        self.assertEqual(task_map["cls_imagenet"]["support_source"], "runtime")
        self.assertEqual(task_map["cls_imagenet"]["recommended_action"], "")

    def test_frontend_registry_normalizes_legacy_runtime_task_ids(self):
        registry = get_xeduhub_frontend_registry(supported_tasks=["bodydetect", "hand21", "wholebody133"])
        task_map = {item["task_id"]: item for item in registry["tasks"]}
        self.assertTrue(task_map["det_body"]["available"])
        self.assertTrue(task_map["pose_hand21"]["available"])
        self.assertTrue(task_map["pose_wholebody133"]["available"])
        self.assertEqual(registry["supported_runtime_tasks"], ["det_body", "pose_hand21", "pose_wholebody133"])

    def test_frontend_registry_marks_bodydetect_available_via_fallback_without_runtime_probe(self):
        registry = get_xeduhub_frontend_registry(supported_tasks=[])
        task_map = {item["task_id"]: item for item in registry["tasks"]}

        self.assertTrue(task_map["det_body"]["available"])
        self.assertEqual(task_map["det_body"]["support_source"], "fallback")
        self.assertIn("兼容演示模式", task_map["det_body"]["support_reason"])

    def test_bodydetect_fallback_can_be_disabled_for_runtime_diagnostics(self):
        with patch.dict("os.environ", {"XEDU_DISABLE_BODYDETECT_FALLBACK": "1"}, clear=False), patch(
            "services.blockly_xeduhub_support._resolve_smoke_checkpoint",
            return_value="",
        ):
            registry = get_xeduhub_frontend_registry(supported_tasks=[])

        task_map = {item["task_id"]: item for item in registry["tasks"]}
        self.assertFalse(task_map["det_body"]["available"])
        self.assertEqual(task_map["det_body"]["support_source"], "unknown")

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

    def test_registry_params_are_whitelisted(self):
        registry = get_xeduhub_frontend_registry()
        for task in registry["tasks"]:
            allowed = {
                param["key"]
                for param in TASK_REGISTRY[task["task_id"]].get("params", [])
                if param["key"] != "img_type"
            }
            frontend = {param["key"] for param in task.get("params", [])}
            self.assertEqual(frontend, allowed)

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

    def test_frontend_registry_hides_img_type_for_all_tasks(self):
        registry = get_xeduhub_frontend_registry()
        for task in registry["tasks"]:
            param_keys = {param["key"] for param in task.get("params", [])}
            self.assertNotIn("img_type", param_keys)

    def test_frontend_registry_exposes_platform_metadata(self):
        registry = get_xeduhub_frontend_registry()
        task_map = {item["task_id"]: item for item in registry["tasks"]}
        self.assertIn(registry["default_task_id"], TASK_REGISTRY)
        self.assertEqual(task_map["det_body"]["result_shape"], "detection")
        self.assertTrue(task_map["det_body"]["quick_block_enabled"])
        self.assertTrue(task_map["det_body"]["core_api_enabled"])
        self.assertFalse(task_map["drive_perception"]["quick_block_enabled"])
        self.assertTrue(task_map["drive_perception"]["core_api_enabled"])

    def test_frontend_registry_colors_follow_shared_contract(self):
        contract_path = BACKEND_DIR.parent / "config" / "blockly-colors.json"
        contract = json.loads(contract_path.read_text(encoding="utf-8"))
        registry = get_xeduhub_frontend_registry()
        family_map = {item["id"]: item for item in registry["families"]}

        for family_id, meta in contract["taskFamilies"].items():
            self.assertEqual(family_map[family_id]["colour"], meta["colour"])
            self.assertEqual(TASK_FAMILY_META[family_id]["colour"], meta["colour"])

        toolbox = build_xeduhub_toolbox_definition("detection")
        top_level = {
            item.get("name"): item
            for item in toolbox["contents"]
            if item.get("kind") == "category"
        }
        for category_name in ("基础编程", "XEdu", "媒体与设备", "调试与扩展"):
            self.assertEqual(top_level[category_name]["colour"], contract["taskFirstCategories"][category_name]["colour"])

        self.assertIn("行空板K10", top_level)

    def test_toolbox_exposes_platform_sections(self):
        toolbox = build_xeduhub_toolbox_definition("detection")
        names = [item.get("name") for item in toolbox["contents"] if item.get("kind") == "category"]
        self.assertEqual(names, ["基础编程", "XEdu", "媒体与设备", "行空板K10", "调试与扩展"])

        media = _find_category(toolbox["contents"], "媒体与设备")
        media_names = [item.get("name") for item in media.get("contents", []) if item.get("kind") == "category"]
        self.assertEqual(media_names, ["图像与视频", "通信控制"])

        k10 = _find_category(toolbox["contents"], "行空板K10")
        k10_types = _block_types(k10.get("contents", []))
        self.assertIn("xeduhub_k10_gpio_write", k10_types)
        self.assertIn("xeduhub_k10_pwm_write", k10_types)
        self.assertIn("xeduhub_k10_uart_send", k10_types)

        image_video = _find_category(media.get("contents", []), "图像与视频")
        image_video_types = _block_types(image_video.get("contents", []))
        self.assertIn("xeduhub_load_image_to_var", image_video_types)
        self.assertIn("xeduhub_cv_open_camera", image_video_types)
        self.assertIn("xeduhub_cv_loop_frames", image_video_types)
        self.assertIn("xeduhub_cv_open_video", image_video_types)
        self.assertIn("xeduhub_show_result_image", image_video_types)
        self.assertIn("xeduhub_cv_save_image", image_video_types)
        self.assertIn("xeduhub_cv_resize_image", image_video_types)
        self.assertIn("xeduhub_cv_crop_image", image_video_types)
        self.assertIn("xeduhub_cv_cvt_color", image_video_types)
        self.assertIn("xeduhub_cv_put_text", image_video_types)
        self.assertNotIn("xeduhub_input_image", image_video_types)
        self.assertNotIn("xeduhub_set_input_resource", image_video_types)
        self.assertNotIn("xeduhub_set_input_list", image_video_types)
        self.assertNotIn("xeduhub_cv_flip_image", image_video_types)
        self.assertNotIn("xeduhub_cv_rotate_image", image_video_types)
        self.assertNotIn("xeduhub_cv_gaussian_blur", image_video_types)
        self.assertNotIn("xeduhub_cv_canny", image_video_types)
        self.assertNotIn("xeduhub_cv_threshold", image_video_types)
        self.assertNotIn("xeduhub_draw_boxes_image", image_video_types)
        self.assertNotIn("xeduhub_media_frames_to_video", image_video_types)

        communication = _find_category(media.get("contents", []), "通信控制")
        communication_types = _block_types(communication.get("contents", []))
        self.assertIn("xeduhub_http_open_stream", communication_types)
        self.assertIn("xeduhub_http_loop_stream_frames", communication_types)
        self.assertIn("xeduhub_decode_chunk_image", communication_types)
        self.assertIn("xeduhub_http_send_command", communication_types)
        self.assertIn("xeduhub_servo_setup", communication_types)
        self.assertIn("xeduhub_http_iter_chunks", communication_types)
        self.assertIn("xeduhub_servo_write_angle", communication_types)

    def test_xedu_category_prioritizes_core_syntax_and_quick_tasks(self):
        toolbox = build_xeduhub_toolbox_definition("detection")
        xedu = _find_category(toolbox["contents"], "XEdu")
        nested_names = [item.get("name") for item in xedu.get("contents", []) if item.get("kind") == "category"]
        self.assertEqual(nested_names, ["AI流程", "图像分类", "目标检测", "关键点识别", "OCR", "内容生成", "图像分割", "深度估计"])

        flow_category = _find_category(xedu.get("contents", []), "AI流程")
        flow_types = _block_types(flow_category.get("contents", []))
        self.assertEqual(
            flow_types,
            [
                "xeduhub_workflow_create_var",
                "xeduhub_workflow_infer_var",
                "xeduhub_workflow_infer_pair",
                "xeduhub_show_result_card",
            ],
        )
        self.assertLess(len(flow_types), 5)
        self.assertNotIn("xeduhub_show_result_image", flow_types)
        self.assertNotIn("xeduhub_clear_result", flow_types)
        self.assertNotIn("xeduhub_cv_open_camera", flow_types)
        self.assertNotIn("xeduhub_http_open_stream", flow_types)

        detection_category = _find_category(xedu.get("contents", []), "目标检测")
        detection_types = _block_types(detection_category.get("contents", []))
        self.assertIn("xeduhub_run_det_body", detection_types)
        self.assertIn("xeduhub_run_det_coco", detection_types)
        self.assertIn("xeduhub_run_det_coco_l", detection_types)
        self.assertIn("xeduhub_run_det_face", detection_types)
        self.assertIn("xeduhub_run_det_hand", detection_types)
        self.assertNotIn("xeduhub_run_det_body_l", detection_types)

        pose_category = _find_category(xedu.get("contents", []), "关键点识别")
        pose_types = _block_types(pose_category.get("contents", []))
        self.assertIn("xeduhub_run_pose_body17", pose_types)
        self.assertIn("xeduhub_run_pose_face106", pose_types)
        self.assertIn("xeduhub_run_pose_hand21", pose_types)
        self.assertIn("xeduhub_run_pose_wholebody133", pose_types)
        self.assertNotIn("xeduhub_run_pose_body17_l", pose_types)
        self.assertNotIn("xeduhub_run_pose_body26", pose_types)

        ocr_category = _find_category(xedu.get("contents", []), "OCR")
        self.assertIn("xeduhub_run_ocr", _block_types(ocr_category.get("contents", [])))

        classification_category = _find_category(xedu.get("contents", []), "图像分类")
        self.assertIn("xeduhub_run_cls_imagenet", _block_types(classification_category.get("contents", [])))

        generation_category = _find_category(xedu.get("contents", []), "内容生成")
        generation_types = _block_types(generation_category.get("contents", []))
        self.assertIn("xeduhub_run_gen_style", generation_types)
        self.assertIn("xeduhub_run_gen_color", generation_types)

        segmentation_category = _find_category(xedu.get("contents", []), "图像分割")
        self.assertIn("xeduhub_run_segment_anything", _block_types(segmentation_category.get("contents", [])))

        depth_category = _find_category(xedu.get("contents", []), "深度估计")
        self.assertIn("xeduhub_run_depth_anything", _block_types(depth_category.get("contents", [])))

    def test_experimental_tasks_move_to_debug_extension_category(self):
        toolbox = build_xeduhub_toolbox_definition("detection")
        debug_category = _find_category(toolbox["contents"], "调试与扩展")
        experimental = _find_category(debug_category.get("contents", []), "实验性任务")
        task_types = _block_types(experimental.get("contents", []))

        self.assertFalse(experimental.get("visible_by_default"))
        self.assertTrue(experimental.get("teacher_only"))
        self.assertIn("xeduhub_run_det_body_l", task_types)
        self.assertIn("xeduhub_run_pose_body26", task_types)
        self.assertIn("xeduhub_run_drive_perception", task_types)
        self.assertIn("xeduhub_run_embedding_image", task_types)
        self.assertNotIn("xeduhub_run_det_coco_l", task_types)
        self.assertNotIn("xeduhub_run_pose_wholebody133", task_types)
        self.assertNotIn("xeduhub_run_det_body", task_types)
        self.assertNotIn("xeduhub_run_ocr", task_types)

    def test_required_blocks_match_platform_starter_chain(self):
        toolbox = build_xeduhub_toolbox_definition("classification")
        required = toolbox.get("required_block_types", [])
        self.assertIn("xeduhub_load_image_to_var", required)
        self.assertIn("xeduhub_workflow_create_var", required)
        self.assertIn("xeduhub_workflow_infer_var", required)
        self.assertIn("variables_get", required)
        self.assertNotIn("xeduhub_cv_open_camera", required)
        self.assertNotIn("xeduhub_http_open_stream", required)
        self.assertNotIn("xeduhub_run_det_body", required)

    def test_removed_context_only_blocks_are_hidden_from_default_toolbox(self):
        toolbox = build_xeduhub_toolbox_definition("classification")
        basic = _find_category(toolbox["contents"], "基础编程")
        category_map = {
            item.get("name"): _block_types(item.get("contents", []))
            for item in basic.get("contents", [])
            if item.get("kind") == "category" and isinstance(item.get("contents"), list)
        }

        self.assertNotIn("controls_flow_statements", category_map["循环"])
        self.assertNotIn("math_modulo", category_map["数学"])
        self.assertNotIn("lists_getIndex", category_map["列表"])
        self.assertNotIn("lists_setIndex", category_map["列表"])
        self.assertNotIn("xeduhub_quadratic_fit", category_map["数学"])
        self.assertNotIn("xeduhub_polyfit_quadratic", category_map["数学"])
        self.assertNotIn("xeduhub_quadratic_eval", category_map["数学"])

        function_types = category_map["函数"]
        self.assertIn("procedures_defnoreturn", function_types)
        self.assertIn("procedures_defreturn", function_types)
        self.assertNotIn("procedures_callnoreturn", function_types)
        self.assertNotIn("procedures_callreturn", function_types)
        self.assertNotIn("procedures_ifreturn", function_types)


if __name__ == "__main__":
    unittest.main()
