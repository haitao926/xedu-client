from XEdu.hub import Workflow as wf
from runtime import blockly_runtime as xrt

lab_result = None

xedu_flow_embedding_audio = wf(task="embedding_audio")


lab_task_id = "embedding_audio"
lab_flow = xedu_flow_embedding_audio
lab_result = lab_flow.inference(data='demo.wav')
lab_result = lab_result
xrt.xedu_show_result_card(lab_result, title="音频特征提取")
