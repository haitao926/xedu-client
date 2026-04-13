import sys
import unittest
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from services.blockly_xeduhub_support import (  # noqa: E402
    TASK_REGISTRY,
    build_xeduhub_toolbox_definition,
    get_xeduhub_frontend_registry,
)


def _find_category(contents, name):
    return next(item for item in contents if item.get("kind") == "category" and item.get("name") == name)


def _block_types(contents):
    return [item.get("type") for item in contents if item.get("kind") == "block"]


class BlocklyXEduHubSupportTestCase(unittest.TestCase):
    def test_frontend_registry_has_unique_task_ids(self):
        registry = get_xeduhub_frontend_registry()
        task_ids = [item["task_id"] for item in registry["tasks"]]
        self.assertEqual(len(task_ids), len(set(task_ids)))
        self.assertIn("det_body", task_ids)
        self.assertIn("cls_imagenet", task_ids)
        self.assertIn("segment_anything", task_ids)
        self.assertIn("depth_anything", task_ids)

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

    def test_toolbox_exposes_core_and_split_extension_domains(self):
        toolbox = build_xeduhub_toolbox_definition("detection")
        names = [item.get("name") for item in toolbox["contents"] if item.get("kind") == "category"]
        self.assertIn("逻辑", names)
        self.assertIn("循环", names)
        self.assertIn("数学", names)
        self.assertIn("文本", names)
        self.assertIn("列表", names)
        self.assertIn("变量", names)
        self.assertIn("函数", names)
        self.assertIn("图像视频", names)
        self.assertIn("通信控制", names)
        self.assertIn("XEduHub", names)
        self.assertNotIn("扩展包", names)

        image_video = _find_category(toolbox["contents"], "图像视频")
        image_video_types = _block_types(image_video.get("contents", []))
        self.assertIn("xeduhub_cv_open_camera", image_video_types)
        self.assertNotIn("xeduhub_cv_loop_frames", image_video_types)
        self.assertIn("xeduhub_media_frames_to_video", image_video_types)

        communication = _find_category(toolbox["contents"], "通信控制")
        communication_types = _block_types(communication.get("contents", []))
        self.assertIn("xeduhub_http_open_stream", communication_types)
        self.assertNotIn("xeduhub_http_loop_stream_frames", communication_types)
        self.assertIn("xeduhub_http_send_command", communication_types)
        self.assertIn("xeduhub_servo_setup", communication_types)
        self.assertNotIn("xeduhub_http_iter_chunks", communication_types)
        self.assertNotIn("xeduhub_servo_write_angle", communication_types)

    def test_xeduhub_category_is_algorithm_only(self):
        toolbox = build_xeduhub_toolbox_definition("detection")
        xeduhub = _find_category(toolbox["contents"], "XEduHub")
        nested_names = [item.get("name") for item in xeduhub.get("contents", []) if item.get("kind") == "category"]
        self.assertEqual(
            nested_names,
            ["图像分类", "目标检测", "关键点识别", "OCR", "内容生成", "图像分割", "深度估计"],
        )

        top_level_types = _block_types(xeduhub.get("contents", []))
        self.assertIn("xeduhub_workflow_create_var", top_level_types)
        self.assertNotIn("xeduhub_workflow_infer_var", top_level_types)
        self.assertNotIn("xeduhub_workflow_infer_pair", top_level_types)
        self.assertIn("xeduhub_result_first_box", top_level_types)
        self.assertNotIn("xeduhub_cv_open_camera", top_level_types)
        self.assertNotIn("xeduhub_http_open_stream", top_level_types)

        detection_category = _find_category(xeduhub.get("contents", []), "目标检测")
        detection_types = _block_types(detection_category.get("contents", []))
        self.assertIn("xeduhub_run_det_body", detection_types)
        self.assertNotIn("xeduhub_run_det_body_l", detection_types)
        self.assertNotIn("xeduhub_run_det_coco_l", detection_types)

        pose_category = _find_category(xeduhub.get("contents", []), "关键点识别")
        pose_types = _block_types(pose_category.get("contents", []))
        self.assertIn("xeduhub_run_pose_body17", pose_types)
        self.assertNotIn("xeduhub_run_pose_body17_l", pose_types)
        self.assertNotIn("xeduhub_run_pose_body26", pose_types)
        self.assertNotIn("xeduhub_run_pose_wholebody133", pose_types)

    def test_required_blocks_follow_new_python_first_path(self):
        toolbox = build_xeduhub_toolbox_definition("classification")
        required = toolbox.get("required_block_types", [])
        self.assertIn("xeduhub_workflow_create_var", required)
        self.assertNotIn("xeduhub_workflow_infer_var", required)
        self.assertIn("xeduhub_cv_open_camera", required)
        self.assertIn("xeduhub_http_open_stream", required)
        self.assertIn("xeduhub_run_det_body", required)

    def test_removed_context_only_blocks_are_hidden_from_default_toolbox(self):
        toolbox = build_xeduhub_toolbox_definition("classification")
        category_map = {
            item.get("name"): _block_types(item.get("contents", []))
            for item in toolbox["contents"]
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
