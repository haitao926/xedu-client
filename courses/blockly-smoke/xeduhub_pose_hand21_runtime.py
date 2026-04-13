lab_input = "demo.jpg"
from XEdu.hub import Workflow as wf
lab_task_id = "hand21"
lab_flow = wf(task=lab_task_id)
lab_result = lab_flow.inference(data=lab_input)
print("手部关键点 21 结果", lab_result)
