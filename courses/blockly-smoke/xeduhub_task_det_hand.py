from XEdu.hub import Workflow as wf
from runtime import blockly_runtime as xrt

lab_result = None

xedu_flow_det_hand = wf(task="det_hand")


lab_task_id = "det_hand"
lab_flow = xedu_flow_det_hand
lab_result = lab_flow.inference(data='assets/xedu-test-scene-1.png')
lab_result = lab_result
xrt.xedu_show_result_card(lab_result, title="手部目标检测")
