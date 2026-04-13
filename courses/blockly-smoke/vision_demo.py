from XEdu.hub import Workflow as wf

lab_input = "demo.jpg"
lab_task_id = "bodydetect"
lab_flow = wf(task=lab_task_id)
lab_params = {"thr": 0.3}
lab_result = lab_flow.inference(data=lab_input, **lab_params)
print("人体检测结果", lab_result)
print("结果图将在 Blockly 结果区显示")
print("教学结论已记录")
