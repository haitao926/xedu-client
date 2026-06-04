from XEdu.hub import Workflow as wf
from runtime import blockly_runtime as xrt

lab_result = None

xedu_flow_embedding_text = wf(task="embedding_text")


lab_task_id = "embedding_text"
lab_flow = xedu_flow_embedding_text
lab_result = lab_flow.inference(data='XEduHub test text')
lab_result = lab_result
xrt.xedu_show_result_card(lab_result, title="文本特征提取")
