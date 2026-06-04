from XEdu.hub import Workflow as wf
import cv2
from runtime import blockly_runtime as xrt

lab_result = None

xedu_flow_hand21 = wf(task="hand21")


lab_task_id = "hand21"
lab_flow = xedu_flow_hand21
if xedu_flow_hand21 is None:
  raise RuntimeError('当前工作区包含本地不支持的 XEdu 任务，无法执行')
xedu_video_stream = xrt.XEduCamera.video('demo.mp4', window_name="手部关键点 21 视频流")
try:
  print("视频流已启动: 手部关键点 21 视频流")
  while xedu_video_stream.is_opened():
    xedu_stream_frame = xedu_video_stream.read()
    if xedu_stream_frame is None:
      break
    xedu_stream_value = xedu_flow_hand21.inference(data=xedu_stream_frame)
    lab_result, xedu_stream_preview = xrt.xedu_split_result(xedu_stream_value)
    lab_result = lab_result
    xrt.xedu_emit_runtime_event("stream_result", result=lab_result)
    xedu_video_stream.show(xedu_stream_preview if xedu_stream_preview is not None else xedu_stream_frame)
    if xedu_video_stream.should_quit("q", delay=1):
      break
  print("视频流已结束")
except xrt.XEduStreamError as stream_error:
  xrt.xedu_emit_runtime_event("stream_error", code=getattr(stream_error, "code", "stream_error"), message=str(stream_error), stream_kind=getattr(stream_error, "stream_kind", ""))
  print(str(stream_error))
finally:
  xedu_video_stream.close()
xrt.xedu_show_result_card(lab_result, title="手部关键点 21 视频 视频")
