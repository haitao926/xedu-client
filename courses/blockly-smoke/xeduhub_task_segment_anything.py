from XEdu.hub import Workflow as wf
from runtime import blockly_runtime as xrt

lab_result = None

xedu_flow_segment_anything = wf(task="segment_anything")


lab_task_id = "segment_anything"
lab_flow = xedu_flow_segment_anything
lab_result = lab_flow.inference(data='assets/xedu-test-seg-depth-1.png')
lab_result = lab_result
xrt.xedu_show_result_card(lab_result, title="SAM 图像分割")
