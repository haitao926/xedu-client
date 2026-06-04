from XEdu.hub import Workflow as wf
from runtime import blockly_runtime as xrt

lab_result = None

xedu_flow_cls_imagenet = wf(task="cls_imagenet")


lab_task_id = "cls_imagenet"
lab_flow = xedu_flow_cls_imagenet
lab_result = lab_flow.inference(data='assets/xedu-test-scene-1.png')
lab_result = lab_result
xrt.xedu_show_result_card(lab_result, title="ImageNet 图像分类")
