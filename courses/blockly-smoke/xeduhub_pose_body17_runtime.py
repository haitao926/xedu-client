lab_input = "demo.jpg"
from XEdu.hub import Workflow as wf
lab_task_id = "body17"
lab_flow = wf(task=lab_task_id)
lab_result = lab_flow.inference(data=lab_input)
print("人体关键点 17 结果", lab_result)
