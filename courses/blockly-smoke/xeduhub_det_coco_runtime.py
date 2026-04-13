lab_input = "demo.jpg"
from XEdu.hub import Workflow as wf
lab_task_id = "cocodetect"
lab_flow = wf(task=lab_task_id)
lab_result = lab_flow.inference(data=lab_input)
print("COCO 检测结果", lab_result)
