lab_input = "demo.jpg"
from XEdu.hub import Workflow as wf
lab_task_id = "face106"
lab_flow = wf(task=lab_task_id)
lab_result = lab_flow.inference(data=lab_input)
print("人脸关键点 106 结果", lab_result)
