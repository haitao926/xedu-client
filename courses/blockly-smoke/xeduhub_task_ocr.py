from XEdu.hub import Workflow as wf
from runtime import blockly_runtime as xrt

lab_result = None

xedu_flow_ocr = wf(task="ocr")


lab_task_id = "ocr"
lab_flow = xedu_flow_ocr
lab_result = lab_flow.inference(data='assets/xedu-test-ocr-1.png')
lab_result = lab_result
xrt.xedu_show_result_card(lab_result, title="光学字符识别")
