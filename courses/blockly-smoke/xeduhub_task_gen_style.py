from XEdu.hub import Workflow as wf
from runtime import blockly_runtime as xrt

lab_result = None

xedu_flow_gen_style = wf(task="gen_style")


lab_task_id = "gen_style"
lab_flow = xedu_flow_gen_style
lab_result = lab_flow.inference(data='assets/xedu-test-scene-1.png')
lab_result = lab_result
xrt.xedu_show_result_card(lab_result, title="图像风格迁移")
