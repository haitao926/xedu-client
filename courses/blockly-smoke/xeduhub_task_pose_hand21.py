from XEdu.hub import Workflow as wf
from runtime import blockly_runtime as xrt

lab_result = None

xedu_flow_hand21 = wf(task="hand21")


lab_task_id = "hand21"
lab_flow = xedu_flow_hand21
lab_result = lab_flow.inference(data='assets/xedu-test-scene-1.png')
lab_result = lab_result
xrt.xedu_show_result_card(lab_result, title="手部关键点 21")
