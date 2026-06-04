from XEdu.hub import Workflow as wf

lab_input = "assets/xedu-test-scene-1.png"
lab_task_id = "bodydetect"
lab_flow = wf(task=lab_task_id)
lab_params = {"thr": 0.3}
lab_result = lab_flow.inference(data=lab_input, **lab_params)
print("Legacy 人体检测结果", lab_result)
