lab_input = "demo.jpg"
from XEdu.hub import Workflow as wf
lab_task_id = "det_body"
lab_flow = wf(task=lab_task_id)
lab_params = {}
lab_params = {}
face_result = lab_flow.inference(data=lab_input, **lab_params)
lab_result = face_result
print((face_result.get("result_summary", '') if isinstance(face_result, dict) else ''))
