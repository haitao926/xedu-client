lab_input = "demo.jpg"
from XEdu.hub import Workflow as wf
lab_task_id = "wholebody133"
lab_flow = wf(task=lab_task_id)
lab_result = lab_flow.inference(data=lab_input)
print("全身关键点 133 结果", lab_result)
