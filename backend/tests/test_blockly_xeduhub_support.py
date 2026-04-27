import sys
import unittest
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from services.blockly_xeduhub_support import (  # noqa: E402
    DEFAULT_BLOCKLY_SAMPLE_IMAGE,
    TASK_REGISTRY,
    _canonical_task_id,
    build_xeduhub_toolbox_definition,
    get_xeduhub_frontend_registry,
    resolve_input_path,
)


def _find_category(contents, name):
    return next(item for item in contents if item.get("kind") == "category" and item.get("name") == name)


def _block_types(contents):
    return [item.get("type") for item in contents if item.get("kind") == "block"]


class BlocklyXEduHubSupportTestCase(unittest.TestCase):
    def test_hidden_large_task_ids_canonicalize_to_standard_tasks(self):
        self.assertEqual(_canonical_task_id("det_body_l"), "det_body")
        self.assertEqual(_canonical_task_id("pose_body17_l"), "pose_body17")

    def test_legacy_demo_input_alias_resolves_to_repo_sample(self):
        resolved = Path(resolve_input_path("demo.jpg", str(BACKEND_DIR.parent)))
        self.assertTrue(resolved.exists())
        self.assertTrue(resolved.as_posix().endswith(DEFAULT_BLOCKLY_SAMPLE_IMAGE))

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
        self.assertTrue(task_map["pose_face106"]["available"])
        self.assertFalse(task_map["ocr"]["available"])
        self.assertFalse(task_map["cls_imagenet"]["available"])
        self.assertFalse(task_map["segment_anything"]["available"])

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

    def test_frontend_registry_hides_img_type_for_all_tasks(self):
        registry = get_xeduhub_frontend_registry()
        for task in registry["tasks"]:
            param_keys = {param["key"] for param in task.get("params", [])}
            self.assertNotIn("img_type", param_keys)

    def test_frontend_registry_exposes_platform_metadata(self):
        registry = get_xeduhub_frontend_registry()
        task_map = {item["task_id"]: item for item in registry["tasks"]}
        self.assertEqual(task_map["det_body"]["result_shape"], "detection")
        self.assertTrue(task_map["det_body"]["quick_block_enabled"])
        self.assertTrue(task_map["det_body"]["core_api_enabled"])
        self.assertFalse(task_map["drive_perception"]["quick_block_enabled"])
        self.assertTrue(task_map["drive_perception"]["core_api_enabled"])

    def test_toolbox_exposes_platform_sections(self):
        toolbox = build_xeduhub_toolbox_definition("detection")
        names = [item.get("name") for item in toolbox["contents"] if item.get("kind") == "category"]
        self.assertEqual(names, ["基础编程", "XEdu", "媒体与设备", "调试与扩展"])

        media = _find_category(toolbox["contents"], "媒体与设备")
        media_names = [item.get("name") for item in media.get("contents", []) if item.get("kind") == "category"]
        self.assertEqual(media_names, ["图像视频", "通信控制"])

        image_video = _find_category(media.get("contents", []), "图像视频")
        image_video_types = _block_types(image_video.get("contents", []))
        self.assertIn("xeduhub_cv_open_camera", image_video_types)
        self.assertIn("xeduhub_cv_loop_frames", image_video_types)
        self.assertIn("xeduhub_media_frames_to_video", image_video_types)

        communication = _find_category(media.get("contents", []), "通信控制")
        communication_types = _block_types(communication.get("contents", []))
        self.assertIn("xeduhub_http_open_stream", communication_types)
        self.assertIn("xeduhub_http_loop_stream_frames", communication_types)
        self.assertIn("xeduhub_http_send_command", communication_types)
        self.assertIn("xeduhub_servo_setup", communication_types)
        self.assertIn("xeduhub_http_iter_chunks", communication_types)
        self.assertIn("xeduhub_servo_write_angle", communication_types)

    def test_xedu_category_prioritizes_core_syntax_and_quick_tasks(self):
        toolbox = build_xeduhub_toolbox_definition("detection")
        xedu = _find_category(toolbox["contents"], "XEdu")
        nested_names = [item.get("name") for item in xedu.get("contents", []) if item.get("kind") == "category"]
        self.assertEqual(
            nested_names,
            ["核心语法", "结果处理", "图像分类", "目标检测", "关键点识别", "OCR", "内容生成", "图像分割", "深度估计"],
        )

        core_category = _find_category(xedu.get("contents", []), "核心语法")
        core_types = _block_types(core_category.get("contents", []))
        self.assertIn("xeduhub_set_input_resource", core_types)
        self.assertIn("xeduhub_workflow_create_var", core_types)
        self.assertIn("xeduhub_workflow_infer_var", core_types)
        self.assertIn("xeduhub_workflow_infer_pair", core_types)

        result_category = _find_category(xedu.get("contents", []), "结果处理")
        result_types = _block_types(result_category.get("contents", []))
        self.assertIn("xeduhub_result_first_box", result_types)
        self.assertIn("xeduhub_ocr_first_text", result_types)
        self.assertIn("xeduhub_show_result_card", result_types)
        self.assertNotIn("xeduhub_cv_open_camera", result_types)
        self.assertNotIn("xeduhub_http_open_stream", result_types)

        detection_category = _find_category(xedu.get("contents", []), "目标检测")
        detection_types = _block_types(detection_category.get("contents", []))
        self.assertIn("xeduhub_run_det_body", detection_types)
        self.assertIn("xeduhub_run_det_coco", detection_types)
        self.assertIn("xeduhub_run_det_face", detection_types)
        self.assertIn("xeduhub_run_det_hand", detection_types)
        self.assertNotIn("xeduhub_run_det_body_l", detection_types)
        self.assertNotIn("xeduhub_run_det_coco_l", detection_types)

        pose_category = _find_category(xedu.get("contents", []), "关键点识别")
        pose_types = _block_types(pose_category.get("contents", []))
        self.assertIn("xeduhub_run_pose_body17", pose_types)
        self.assertIn("xeduhub_run_pose_face106", pose_types)
        self.assertIn("xeduhub_run_pose_hand21", pose_types)
        self.assertNotIn("xeduhub_run_pose_body17_l", pose_types)
        self.assertNotIn("xeduhub_run_pose_body26", pose_types)
        self.assertNotIn("xeduhub_run_pose_wholebody133", pose_types)

        ocr_category = _find_category(xedu.get("contents", []), "OCR")
        self.assertIn("xeduhub_run_ocr", _block_types(ocr_category.get("contents", [])))

        classification_category = _find_category(xedu.get("contents", []), "图像分类")
        self.assertIn("xeduhub_run_cls_imagenet", _block_types(classification_category.get("contents", [])))

        segmentation_category = _find_category(xedu.get("contents", []), "图像分割")
        self.assertIn("xeduhub_run_segment_anything", _block_types(segmentation_category.get("contents", [])))

    def test_required_blocks_match_platform_starter_chain(self):
        toolbox = build_xeduhub_toolbox_definition("classification")
        required = toolbox.get("required_block_types", [])
        self.assertIn("xeduhub_set_input_resource", required)
        self.assertIn("xeduhub_workflow_create_var", required)
        self.assertIn("xeduhub_workflow_infer_var", required)
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

        function_types = category_map["函数"]
        self.assertIn("procedures_defnoreturn", function_types)
        self.assertIn("procedures_defreturn", function_types)
        self.assertNotIn("procedures_callnoreturn", function_types)
        self.assertNotIn("procedures_callreturn", function_types)
        self.assertNotIn("procedures_ifreturn", function_types)


if __name__ == "__main__":
    unittest.main()
