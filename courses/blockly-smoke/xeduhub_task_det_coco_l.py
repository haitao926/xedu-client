from XEdu.hub import Workflow as wf
from runtime import blockly_runtime as xrt

lab_result = None

xedu_flow_cocodetect = wf(task="cocodetect")


lab_task_id = "cocodetect"
lab_flow = xedu_flow_cocodetect
lab_result = lab_flow.inference(data='assets/xedu-test-scene-1.png')
lab_result = lab_result
xrt.xedu_show_result_card(lab_result, title="COCO 目标检测 Large")
