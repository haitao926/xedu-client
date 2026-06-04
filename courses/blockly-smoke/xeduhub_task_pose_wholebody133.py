from XEdu.hub import Workflow as wf
from runtime import blockly_runtime as xrt

lab_result = None

xedu_flow_wholebody133 = wf(task="wholebody133")


lab_task_id = "wholebody133"
lab_flow = xedu_flow_wholebody133
lab_result = lab_flow.inference(data='assets/xedu-test-scene-1.png')
lab_result = lab_result
xrt.xedu_show_result_card(lab_result, title="全身关键点 133")
