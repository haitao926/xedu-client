# XEduHub Blockly 积木审计结果

- 来源文件：`renderer/js/blockly/xeduhub-blocks.js`
- 自定义积木总数：`88`
- 可运行积木数：`67`
- 兼容旧块数：`15`
- 机器可读明细：`docs/overview/xeduhub-block-audit.json`

## 结论摘要

- 一致：34
- 弱一致：39
- 不一致：0
- 废弃兼容：15

## 最高优先级问题

- `xeduhub_show_result_card` [P1] 该块已经不再是 print；它会触发前端结果区渲染一张结果卡。
- `xeduhub_show_result_image` [P1] 该块已经不再是 print；它会触发前端结果区渲染图片证据卡。

## 可运行块测试矩阵摘要

- `xeduhub_catch_error`：本地 Python 执行测试
- `xeduhub_classify_run`：迁移验证 + 代码生成快照
- `xeduhub_clear_result`：代码生成快照 + 浏览器/页面行为测试
- `xeduhub_create_flow`：迁移验证 + 代码生成快照
- `xeduhub_create_workflow`：迁移验证 + 代码生成快照
- `xeduhub_cv_decode_chunk`：模拟依赖测试 + 本地 Python 执行测试
- `xeduhub_cv_draw_boxes`：模拟依赖测试 + 本地 Python 执行测试
- `xeduhub_cv_loop_frames`：模拟依赖测试 + 本地 Python 执行测试
- `xeduhub_cv_open_camera`：模拟依赖测试 + 本地 Python 执行测试
- `xeduhub_cv_open_video`：模拟依赖测试 + 本地 Python 执行测试
- `xeduhub_cv_save_image`：模拟依赖测试 + 本地 Python 执行测试
- `xeduhub_cv_show_frame`：模拟依赖测试 + 本地 Python 执行测试
- `xeduhub_debug_print`：代码生成快照 + 浏览器/页面行为测试
- `xeduhub_detect_run`：迁移验证 + 代码生成快照
- `xeduhub_execute_workflow`：迁移验证 + 代码生成快照
- `xeduhub_flow_execute`：迁移验证 + 代码生成快照
- `xeduhub_flow_set_input`：迁移验证 + 代码生成快照
- `xeduhub_http_get`：模拟依赖测试 + 本地 Python 执行测试
- `xeduhub_http_iter_chunks`：模拟依赖测试 + 本地 Python 执行测试
- `xeduhub_http_loop_stream_frames`：模拟依赖测试 + 本地 Python 执行测试
- `xeduhub_http_open_stream`：模拟依赖测试 + 本地 Python 执行测试
- `xeduhub_http_send_command`：模拟依赖测试 + 本地 Python 执行测试
- `xeduhub_load_image_to_var`：浏览器/页面行为测试 + 本地 Python 执行测试
- `xeduhub_media_frames_to_video`：模拟依赖测试 + 本地 Python 执行测试
- `xeduhub_ocr_run`：迁移验证 + 代码生成快照
- `xeduhub_polyfit_quadratic`：本地 Python 执行测试
- `xeduhub_print_status`：迁移验证 + 代码生成快照
- `xeduhub_raw_create_workflow`：迁移验证 + 代码生成快照
- `xeduhub_raw_inference`：迁移验证 + 代码生成快照
- `xeduhub_run_and_record`：代码生成快照 + 浏览器/页面行为测试
- `xeduhub_run_cls_imagenet`：运行时 spec 抽取与绑定验证 + 后端接口执行测试
- `xeduhub_run_depth_anything`：运行时 spec 抽取与绑定验证 + 后端接口执行测试
- `xeduhub_run_det_body`：运行时 spec 抽取与绑定验证 + 后端接口执行测试
- `xeduhub_run_det_body_l`：运行时 spec 抽取与绑定验证 + 后端接口执行测试
- `xeduhub_run_det_coco`：运行时 spec 抽取与绑定验证 + 后端接口执行测试
- `xeduhub_run_det_coco_l`：运行时 spec 抽取与绑定验证 + 后端接口执行测试
- `xeduhub_run_drive_perception`：运行时 spec 抽取与绑定验证 + 后端接口执行测试
- `xeduhub_run_embedding_audio`：运行时 spec 抽取与绑定验证 + 后端接口执行测试
- `xeduhub_run_embedding_image`：运行时 spec 抽取与绑定验证 + 后端接口执行测试
- `xeduhub_run_embedding_text`：运行时 spec 抽取与绑定验证 + 后端接口执行测试
- `xeduhub_run_gen_color`：运行时 spec 抽取与绑定验证 + 后端接口执行测试
- `xeduhub_run_gen_style`：运行时 spec 抽取与绑定验证 + 后端接口执行测试
- `xeduhub_run_ocr`：运行时 spec 抽取与绑定验证 + 后端接口执行测试
- `xeduhub_run_pose_body17`：运行时 spec 抽取与绑定验证 + 后端接口执行测试
- `xeduhub_run_pose_body17_l`：运行时 spec 抽取与绑定验证 + 后端接口执行测试
- `xeduhub_run_pose_body26`：运行时 spec 抽取与绑定验证 + 后端接口执行测试
- `xeduhub_run_pose_face106`：运行时 spec 抽取与绑定验证 + 后端接口执行测试
- `xeduhub_run_pose_hand21`：运行时 spec 抽取与绑定验证 + 后端接口执行测试
- `xeduhub_run_pose_wholebody133`：运行时 spec 抽取与绑定验证 + 后端接口执行测试
- `xeduhub_run_segment_anything`：运行时 spec 抽取与绑定验证 + 后端接口执行测试
- `xeduhub_run_vision`：迁移验证 + 代码生成快照
- `xeduhub_servo_setup`：模拟依赖测试 + 本地 Python 执行测试
- `xeduhub_servo_write_angle`：模拟依赖测试 + 本地 Python 执行测试
- `xeduhub_set_input`：迁移验证 + 代码生成快照
- `xeduhub_set_input_list`：本地 Python 执行测试
- `xeduhub_set_input_resource`：本地 Python 执行测试
- `xeduhub_set_model`：迁移验证 + 代码生成快照
- `xeduhub_show_result`：迁移验证 + 代码生成快照
- `xeduhub_show_result_card`：代码生成快照 + 浏览器/页面行为测试
- `xeduhub_show_result_image`：代码生成快照 + 浏览器/页面行为测试
- `xeduhub_workflow_create`：代码生成快照 + 运行时 spec 抽取与绑定验证
- `xeduhub_workflow_create_var`：代码生成快照 + 运行时 spec 抽取与绑定验证
- `xeduhub_workflow_infer`：运行时 spec 抽取与绑定验证 + 后端接口执行测试
- `xeduhub_workflow_infer_pair`：运行时 spec 抽取与绑定验证 + 后端接口执行测试
- `xeduhub_workflow_infer_var`：运行时 spec 抽取与绑定验证 + 后端接口执行测试
- `xeduhub_workflow_set_params`：代码生成快照 + 运行时 spec 抽取与绑定验证
- `xeduhub_workflow_set_task`：代码生成快照 + 运行时 spec 抽取与绑定验证

## 结果读取/计算类

| 积木 ID | 用户看到的输入/字段 | 生成代码摘要 | 隐式状态 | 运行入口 | 测试策略 | 结论 |
| --- | --- | --- | --- | --- | --- | --- |
| `xeduhub_bbox_center_x` | 框中心 X ? | `__result = xrt.xedu_bbox_center_x(None)` | 无 | 依附父块 | 代码生成快照 + stubbed Python 执行 | 一致 / P3 |
| `xeduhub_catch_error` | ERROR_VAR=lab_error | `try: pass except Exception as e: lab_error = str(e) print('运行失败:', lab_error)` | lab_error | /api/python/run | 本地 Python 执行测试 | 一致 / P3 |
| `xeduhub_get_result_field` | FIELD=result_summary | `__result = (lab_result.get("result_summary", '') if isinstance(lab_result, dict) else '')` | lab_result | 依附父块 | 代码生成快照 + stubbed Python 执行 | 弱一致 / P2 |
| `xeduhub_keypoint_axis` | AXIS=X | `__result = xrt.xedu_keypoint_axis([], 0, "x")` | 无 | 依附父块 | 代码生成快照 + stubbed Python 执行 | 一致 / P3 |
| `xeduhub_math_distance` | 两点距离 x1 ? y1 ? x2 ? y2 ? | `__result = xrt.xedu_distance(0, 0, 0, 0)` | 无 | 依附父块 | 代码生成快照 + stubbed Python 执行 | 一致 / P3 |
| `xeduhub_ocr_first_text` | 第一段文字 ? | `__result = xrt.xedu_first_text(lab_result)` | lab_result | 依附父块 | 代码生成快照 + stubbed Python 执行 | 弱一致 / P2 |
| `xeduhub_polyfit_quadratic` | COEFF_VAR=coeff | `coeff = np.polyfit([], [], 2)` | coeff | /api/python/run | 本地 Python 执行测试 | 弱一致 / P2 |
| `xeduhub_quadratic_eval` | 二次曲线 ? 在 ? | `__result = xrt.xedu_quadratic_eval([0, 0, 0], 0)` | 无 | 依附父块 | 代码生成快照 + stubbed Python 执行 | 一致 / P3 |
| `xeduhub_quadratic_fit` | 拟合二次曲线 X ? Y ? | `__result = np.polyfit([], [], 2)` | 无 | 依附父块 | 代码生成快照 + stubbed Python 执行 | 一致 / P3 |
| `xeduhub_result_first_box` | 第一个框 ? | `__result = xrt.xedu_first_box(lab_result)` | lab_result | 依附父块 | 代码生成快照 + stubbed Python 执行 | 弱一致 / P2 |

## 通信/设备/兼容类

| 积木 ID | 用户看到的输入/字段 | 生成代码摘要 | 隐式状态 | 运行入口 | 测试策略 | 结论 |
| --- | --- | --- | --- | --- | --- | --- |
| `xeduhub_chunk_over_size` | 分块 ? 大于 ? | `__result = (len(b"") > 100)` | 无 | 依附父块 | 代码生成快照 | 一致 / P3 |
| `xeduhub_classify_run` | MODEL=cls_imagenet | `# ImageNet 图像分类 当前不可本地运行 # 当前本地 XEdu 运行环境不支持该任务。 # 需安装对应模型/版本后再试。 lab_result = {}` | lab_result | 迁移后落入 /api/resources/blockly/xeduhub/execute 或 /api/python/run | 迁移验证 + 代码生成快照 | 废弃兼容 / P3 |
| `xeduhub_create_flow` | TASK=classification、MODEL=cls_imagenet | `# ImageNet 图像分类 当前不可本地运行 # 当前本地 XEdu 运行环境不支持该任务。 # 需安装对应模型/版本后再试。 lab_flow = None` | lab_flow | 迁移后落入 /api/resources/blockly/xeduhub/execute 或 /api/python/run | 迁移验证 + 代码生成快照 | 废弃兼容 / P3 |
| `xeduhub_create_workflow` | TASK=classification、MODEL=cls_imagenet | `# ImageNet 图像分类 当前不可本地运行 # 当前本地 XEdu 运行环境不支持该任务。 # 需安装对应模型/版本后再试。 lab_flow = None` | lab_flow | 迁移后落入 /api/resources/blockly/xeduhub/execute 或 /api/python/run | 迁移验证 + 代码生成快照 | 废弃兼容 / P3 |
| `xeduhub_detect_run` | MODEL=cls_imagenet | `# ImageNet 图像分类 当前不可本地运行 # 当前本地 XEdu 运行环境不支持该任务。 # 需安装对应模型/版本后再试。 lab_result = {}` | lab_result | 迁移后落入 /api/resources/blockly/xeduhub/execute 或 /api/python/run | 迁移验证 + 代码生成快照 | 废弃兼容 / P3 |
| `xeduhub_execute_workflow` | RESULT=lab_result | `if lab_flow is None: raise RuntimeError('当前工作区包含本地不支持的 XEdu 任务，无法执行') lab_result = lab_flow.inference(data=lab_input, **{}) lab_result = ...` | lab_input、lab_result、lab_flow | 迁移后落入 /api/resources/blockly/xeduhub/execute 或 /api/python/run | 迁移验证 + 代码生成快照 | 废弃兼容 / P3 |
| `xeduhub_flow_execute` | RESULT=lab_result | `if lab_flow is None: raise RuntimeError('当前工作区包含本地不支持的 XEdu 任务，无法执行') lab_result = lab_flow.inference(data=lab_input, **{}) lab_result = ...` | lab_input、lab_result、lab_flow | 迁移后落入 /api/resources/blockly/xeduhub/execute 或 /api/python/run | 迁移验证 + 代码生成快照 | 废弃兼容 / P3 |
| `xeduhub_flow_set_input` | INPUT=demo.jpg | `lab_input = "demo.jpg"` | lab_input | 迁移后落入 /api/resources/blockly/xeduhub/execute 或 /api/python/run | 迁移验证 + 代码生成快照 | 废弃兼容 / P3 |
| `xeduhub_http_get` | RESPONSE_VAR=response | `response = requests.get("http://127.0.0.1")` | response | /api/python/run | 模拟依赖测试 + 本地 Python 执行测试 | 一致 / P3 |
| `xeduhub_http_iter_chunks` | STREAM_VAR=response、CHUNK_VAR=chunk、CHUNK_SIZE=16384 | `try: for chunk in response.iter_content(chunk_size=16384): if not chunk: continue pass finally: try: response.close() except Exception: pass` | response、chunk | /api/python/run | 模拟依赖测试 + 本地 Python 执行测试 | 弱一致 / P2 |
| `xeduhub_http_loop_stream_frames` | STREAM_VAR=response、FRAME_VAR=frame、CHUNK_SIZE=16384、MIN_SIZE=100 | `try: for xedu_chunk in response.iter_content(chunk_size=16384): if not xedu_chunk: continue if len(xedu_chunk) <= 100: continue try: fram...` | frame、response | /api/python/run | 模拟依赖测试 + 本地 Python 执行测试 | 弱一致 / P2 |
| `xeduhub_http_open_stream` | STREAM_VAR=response | `response = requests.get("http://127.0.0.1:81/stream", stream=True)` | response | /api/python/run | 模拟依赖测试 + 本地 Python 执行测试 | 一致 / P3 |
| `xeduhub_http_send_command` | RESPONSE_VAR=response、STOP_CMD=S、DELAY=1 | `response = xrt.xedu_send_command("http://127.0.0.1/state?cmd=", "S", stop_cmd="S", delay=1)` | response | /api/python/run | 模拟依赖测试 + 本地 Python 执行测试 | 弱一致 / P2 |
| `xeduhub_ocr_run` | MODEL=cls_imagenet | `# 光学字符识别 当前不可本地运行 # 当前本地 XEdu 运行环境不支持该任务。 # 需安装对应模型/版本后再试。 lab_result = {}` | lab_result | 迁移后落入 /api/resources/blockly/xeduhub/execute 或 /api/python/run | 迁移验证 + 代码生成快照 | 废弃兼容 / P3 |
| `xeduhub_print_status` | 兼容 打印 | `print('XEduHub workflow ready')` | 无 | 迁移后落入 /api/resources/blockly/xeduhub/execute 或 /api/python/run | 迁移验证 + 代码生成快照 | 废弃兼容 / P3 |
| `xeduhub_raw_create_workflow` | TASK=classification | `# ImageNet 图像分类 当前不可本地运行 # 当前本地 XEdu 运行环境不支持该任务。 # 需安装对应模型/版本后再试。 lab_flow = None` | lab_flow | 迁移后落入 /api/resources/blockly/xeduhub/execute 或 /api/python/run | 迁移验证 + 代码生成快照 | 废弃兼容 / P3 |
| `xeduhub_raw_inference` | INPUT=demo.jpg、MODEL=cls_imagenet | `# ImageNet 图像分类 当前不可本地运行 # 当前本地 XEdu 运行环境不支持该任务。 # 需安装对应模型/版本后再试。 lab_result = {}` | lab_result | 迁移后落入 /api/resources/blockly/xeduhub/execute 或 /api/python/run | 迁移验证 + 代码生成快照 | 废弃兼容 / P3 |
| `xeduhub_run_vision` | TASK=classification、MODEL=cls_imagenet、INPUT=demo.jpg | `# ImageNet 图像分类 当前不可本地运行 # 当前本地 XEdu 运行环境不支持该任务。 # 需安装对应模型/版本后再试。 lab_result = {}` | lab_result | 迁移后落入 /api/resources/blockly/xeduhub/execute 或 /api/python/run | 迁移验证 + 代码生成快照 | 废弃兼容 / P3 |
| `xeduhub_servo_setup` | BOARD=uno、PIN=D4、SERVO_VAR=servo | `Board("uno").begin() servo = Servo(Pin(Pin.D4))` | servo | /api/python/run | 模拟依赖测试 + 本地 Python 执行测试 | 一致 / P3 |
| `xeduhub_servo_write_angle` | SERVO_VAR=servo | `servo.write_angle(90)` | servo | /api/python/run | 模拟依赖测试 + 本地 Python 执行测试 | 弱一致 / P2 |
| `xeduhub_set_input` | INPUT=demo.jpg | `lab_input = "demo.jpg"` | lab_input | 迁移后落入 /api/resources/blockly/xeduhub/execute 或 /api/python/run | 迁移验证 + 代码生成快照 | 废弃兼容 / P3 |
| `xeduhub_set_model` | MODEL=cls_imagenet | `# ImageNet 图像分类 当前不可本地运行 # 当前本地 XEdu 运行环境不支持该任务。 # 需安装对应模型/版本后再试。 lab_flow = None` | lab_flow | 迁移后落入 /api/resources/blockly/xeduhub/execute 或 /api/python/run | 迁移验证 + 代码生成快照 | 废弃兼容 / P3 |
| `xeduhub_show_result` | TITLE=运行结果 | `xrt.xedu_show_result_card(lab_result, title="运行结果")` | lab_result | 迁移后落入 /api/resources/blockly/xeduhub/execute 或 /api/python/run | 迁移验证 + 代码生成快照 | 废弃兼容 / P3 |

## 结果展示类

| 积木 ID | 用户看到的输入/字段 | 生成代码摘要 | 隐式状态 | 运行入口 | 测试策略 | 结论 |
| --- | --- | --- | --- | --- | --- | --- |
| `xeduhub_clear_result` | 清空结果区 | `xrt.xedu_clear_result() lab_result = {} lab_error = ''` | lab_result、lab_error | 前端结果区动作渲染 + Python 导出 helper 调用 | 代码生成快照 + 浏览器/页面行为测试 | 一致 / P3 |
| `xeduhub_debug_print` | 打印 ? | `print(lab_result)` | lab_result | 前端结果区动作渲染 + Python 导出 helper 调用 | 代码生成快照 + 浏览器/页面行为测试 | 一致 / P3 |
| `xeduhub_run_and_record` | 记录结论 ? | `xrt.xedu_record_conclusion("教学结论已记录", lab_result)` | lab_result | 前端结果区动作渲染 + Python 导出 helper 调用 | 代码生成快照 + 浏览器/页面行为测试 | 一致 / P3 |
| `xeduhub_show_result_card` | TITLE=运行结果 | `xrt.xedu_show_result_card(lab_result, title="运行结果")` | lab_result | 前端结果区动作渲染 + Python 导出 helper 调用 | 代码生成快照 + 浏览器/页面行为测试 | 弱一致 / P1 |
| `xeduhub_show_result_image` | 显示结果图片 ? | `xrt.xedu_show_result_image(None)` | 无 | 前端结果区动作渲染 + Python 导出 helper 调用 | 代码生成快照 + 浏览器/页面行为测试 | 弱一致 / P1 |

## 图像与视频处理类

| 积木 ID | 用户看到的输入/字段 | 生成代码摘要 | 隐式状态 | 运行入口 | 测试策略 | 结论 |
| --- | --- | --- | --- | --- | --- | --- |
| `xeduhub_cv_canny` | 图像 ? 边缘检测 阈值1 ? 阈值2 ? | `__result = cv2.Canny(None, 100, 200)` | 无 | 依附父块 | 代码生成快照 | 一致 / P3 |
| `xeduhub_cv_crop_image` | 图像 ? 裁剪 x ? y ? 宽 ? 高 ? | `__result = xrt.xedu_cv_crop(None, 0, 0, 100, 100)` | 无 | 依附父块 | 代码生成快照 | 一致 / P3 |
| `xeduhub_cv_cvt_color` | COLOR_CODE=BGR 转灰度 | `__result = cv2.cvtColor(None, cv2.COLOR_BGR2GRAY)` | 无 | 依附父块 | 代码生成快照 | 一致 / P3 |
| `xeduhub_cv_decode_chunk` | IMAGE_VAR=display_img | `display_img = xrt.xedu_decode_chunk_image(b"")` | display_img | /api/python/run | 模拟依赖测试 + 本地 Python 执行测试 | 弱一致 / P2 |
| `xeduhub_cv_draw_boxes` | IMAGE_VAR=display_img | `display_img = xrt.xedu_draw_boxes(None, [])` | display_img | /api/python/run | 模拟依赖测试 + 本地 Python 执行测试 | 弱一致 / P2 |
| `xeduhub_cv_flip_image` | FLIP_CODE=左右 | `__result = cv2.flip(None, 1)` | 无 | 依附父块 | 代码生成快照 | 一致 / P3 |
| `xeduhub_cv_gaussian_blur` | KSIZE=6 | `__result = cv2.GaussianBlur(None, (7, 7), 0)` | 无 | 依附父块 | 代码生成快照 | 一致 / P3 |
| `xeduhub_cv_loop_frames` | CAMERA_VAR=camera、FRAME_VAR=frame、QUIT_KEY=q、DELAY=1 | `try: while camera.is_opened(): frame = camera.read() if frame is None: break pass if camera.should_quit("q", delay=1): break finally: cam...` | camera、frame | /api/python/run | 模拟依赖测试 + 本地 Python 执行测试 | 弱一致 / P2 |
| `xeduhub_cv_open_camera` | SOURCE=0、CAMERA_VAR=camera、WINDOW=video | `camera = xrt.XEduCamera.camera(0, window_name="video")` | camera、video | /api/python/run | 模拟依赖测试 + 本地 Python 执行测试 | 一致 / P3 |
| `xeduhub_cv_open_video` | CAMERA_VAR=camera、WINDOW=video | `camera = xrt.XEduCamera.video("demo.mp4", window_name="video")` | camera、video | /api/python/run | 模拟依赖测试 + 本地 Python 执行测试 | 一致 / P3 |
| `xeduhub_cv_put_text` | TEXT=XEdu、TEXT_X=20、TEXT_Y=40、TEXT_SCALE=1、TEXT_THICKNESS=2 | `__result = cv2.putText(None, "XEdu", (20, 40), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 2)` | 无 | 依附父块 | 代码生成快照 | 一致 / P3 |
| `xeduhub_cv_resize_image` | 图像 ? 缩放 宽 ? 高 ? | `__result = cv2.resize(None, (int(640), int(480)))` | 无 | 依附父块 | 代码生成快照 | 一致 / P3 |
| `xeduhub_cv_rotate_image` | ROTATE_CODE=顺时针 90° | `__result = cv2.rotate(None, cv2.ROTATE_90_CLOCKWISE)` | 无 | 依附父块 | 代码生成快照 | 一致 / P3 |
| `xeduhub_cv_save_image` | 保存图片 ? 到 ? | `cv2.imwrite("output.jpg", None)` | 无 | /api/python/run | 模拟依赖测试 + 本地 Python 执行测试 | 一致 / P3 |
| `xeduhub_cv_show_frame` | WINDOW=video | `cv2.imshow("video", None)` | video | /api/python/run | 模拟依赖测试 + 本地 Python 执行测试 | 弱一致 / P2 |
| `xeduhub_cv_threshold` | 图像 ? 二值化 阈值 ? 最大值 ? | `__result = cv2.threshold(None, 127, 255, cv2.THRESH_BINARY)[1]` | 无 | 依附父块 | 代码生成快照 | 一致 / P3 |
| `xeduhub_decode_chunk_image` | 分块转画面 ? | `__result = xrt.xedu_decode_chunk_image(b"")` | 无 | 依附父块 | 代码生成快照 + 模拟依赖测试 | 一致 / P3 |
| `xeduhub_draw_boxes_image` | 给图像 ? 画检测框 ? | `__result = xrt.xedu_draw_boxes(None, [])` | 无 | 依附父块 | 代码生成快照 + 模拟依赖测试 | 一致 / P3 |
| `xeduhub_media_frames_to_video` | FPS=30 | `xrt.xedu_frames_to_video("output", "output_video.mp4", fps=30)` | 无 | /api/python/run | 模拟依赖测试 + 本地 Python 执行测试 | 一致 / P3 |

## 输入类

| 积木 ID | 用户看到的输入/字段 | 生成代码摘要 | 隐式状态 | 运行入口 | 测试策略 | 结论 |
| --- | --- | --- | --- | --- | --- | --- |
| `xeduhub_input_image` | INPUT=demo.jpg | `__result = "demo.jpg"` | 无 | 依附父块 | 代码生成快照 + 运行时 spec 抽取与绑定验证 | 一致 / P3 |
| `xeduhub_load_image_to_var` | INPUT=demo.jpg、IMAGE_VAR=display_img | `display_img = cv2.imread("demo.jpg")` | display_img | /api/python/run | 浏览器/页面行为测试 + 本地 Python 执行测试 | 一致 / P3 |
| `xeduhub_set_input_list` | INPUTS=["demo1.jpg","demo2.jpg"] | `lab_input = ["demo1.jpg", "demo2.jpg"]` | lab_input | /api/python/run | 本地 Python 执行测试 | 弱一致 / P2 |
| `xeduhub_set_input_resource` | INPUT=demo.jpg | `lab_input = "demo.jpg"` | lab_input | /api/python/run | 本地 Python 执行测试 | 弱一致 / P2 |

## 执行类

| 积木 ID | 用户看到的输入/字段 | 生成代码摘要 | 隐式状态 | 运行入口 | 测试策略 | 结论 |
| --- | --- | --- | --- | --- | --- | --- |
| `xeduhub_run_cls_imagenet` | RESULT_VAR=lab_result | `# ImageNet 图像分类 当前不可本地运行 # 当前本地 XEdu 运行环境不支持该任务。 # 需安装对应模型/版本后再试。 lab_result = {}` | lab_result | /api/resources/blockly/xeduhub/execute | 运行时 spec 抽取与绑定验证 + 后端接口执行测试 | 弱一致 / P2 |
| `xeduhub_run_depth_anything` | RESULT_VAR=lab_result | `# 单目深度估计 当前不可本地运行 # 当前本地 XEdu 运行环境不支持该任务。 # 需安装对应模型/版本后再试。 lab_result = {}` | lab_result | /api/resources/blockly/xeduhub/execute | 运行时 spec 抽取与绑定验证 + 后端接口执行测试 | 弱一致 / P2 |
| `xeduhub_run_det_body` | RESULT_VAR=lab_result | `lab_task_id = "bodydetect" lab_flow = xedu_flow_bodydetect lab_result = lab_flow.inference(data=lab_input) lab_result = lab_result` | lab_input、lab_result、lab_flow | /api/resources/blockly/xeduhub/execute | 运行时 spec 抽取与绑定验证 + 后端接口执行测试 | 弱一致 / P2 |
| `xeduhub_run_det_body_l` | RESULT_VAR=lab_result | `lab_task_id = "bodydetect" lab_flow = xedu_flow_bodydetect lab_result = lab_flow.inference(data=lab_input) lab_result = lab_result` | lab_input、lab_result、lab_flow | /api/resources/blockly/xeduhub/execute | 运行时 spec 抽取与绑定验证 + 后端接口执行测试 | 弱一致 / P2 |
| `xeduhub_run_det_coco` | RESULT_VAR=lab_result | `lab_task_id = "cocodetect" lab_flow = xedu_flow_cocodetect lab_result = lab_flow.inference(data=lab_input) lab_result = lab_result` | lab_input、lab_result、lab_flow | /api/resources/blockly/xeduhub/execute | 运行时 spec 抽取与绑定验证 + 后端接口执行测试 | 弱一致 / P2 |
| `xeduhub_run_det_coco_l` | RESULT_VAR=lab_result | `lab_task_id = "cocodetect" lab_flow = xedu_flow_cocodetect lab_result = lab_flow.inference(data=lab_input) lab_result = lab_result` | lab_input、lab_result、lab_flow | /api/resources/blockly/xeduhub/execute | 运行时 spec 抽取与绑定验证 + 后端接口执行测试 | 弱一致 / P2 |
| `xeduhub_run_drive_perception` | RESULT_VAR=lab_result | `# 全景驾驶感知 当前不可本地运行 # 当前本地 XEdu 运行环境不支持该任务。 # 需安装对应模型/版本后再试。 lab_result = {}` | lab_result | /api/resources/blockly/xeduhub/execute | 运行时 spec 抽取与绑定验证 + 后端接口执行测试 | 弱一致 / P2 |
| `xeduhub_run_embedding_audio` | RESULT_VAR=lab_result | `# 音频特征提取 当前不可本地运行 # 当前本地 XEdu 运行环境不支持该任务。 # 需安装对应模型/版本后再试。 lab_result = {}` | lab_result | /api/resources/blockly/xeduhub/execute | 运行时 spec 抽取与绑定验证 + 后端接口执行测试 | 弱一致 / P2 |
| `xeduhub_run_embedding_image` | RESULT_VAR=lab_result | `# 图像特征提取 当前不可本地运行 # 当前本地 XEdu 运行环境不支持该任务。 # 需安装对应模型/版本后再试。 lab_result = {}` | lab_result | /api/resources/blockly/xeduhub/execute | 运行时 spec 抽取与绑定验证 + 后端接口执行测试 | 弱一致 / P2 |
| `xeduhub_run_embedding_text` | RESULT_VAR=lab_result | `# 文本特征提取 当前不可本地运行 # 当前本地 XEdu 运行环境不支持该任务。 # 需安装对应模型/版本后再试。 lab_result = {}` | lab_result | /api/resources/blockly/xeduhub/execute | 运行时 spec 抽取与绑定验证 + 后端接口执行测试 | 弱一致 / P2 |
| `xeduhub_run_gen_color` | RESULT_VAR=lab_result | `# 图像着色 当前不可本地运行 # 当前本地 XEdu 运行环境不支持该任务。 # 需安装对应模型/版本后再试。 lab_result = {}` | lab_result | /api/resources/blockly/xeduhub/execute | 运行时 spec 抽取与绑定验证 + 后端接口执行测试 | 弱一致 / P2 |
| `xeduhub_run_gen_style` | RESULT_VAR=lab_result | `# 图像风格迁移 当前不可本地运行 # 当前本地 XEdu 运行环境不支持该任务。 # 需安装对应模型/版本后再试。 lab_result = {}` | lab_result | /api/resources/blockly/xeduhub/execute | 运行时 spec 抽取与绑定验证 + 后端接口执行测试 | 弱一致 / P2 |
| `xeduhub_run_ocr` | RESULT_VAR=lab_result | `# 光学字符识别 当前不可本地运行 # 当前本地 XEdu 运行环境不支持该任务。 # 需安装对应模型/版本后再试。 lab_result = {}` | lab_result | /api/resources/blockly/xeduhub/execute | 运行时 spec 抽取与绑定验证 + 后端接口执行测试 | 弱一致 / P2 |
| `xeduhub_run_pose_body17` | RESULT_VAR=lab_result | `lab_task_id = "body17" lab_flow = xedu_flow_body17 lab_result = lab_flow.inference(data=lab_input) lab_result = lab_result` | lab_input、lab_result、lab_flow | /api/resources/blockly/xeduhub/execute | 运行时 spec 抽取与绑定验证 + 后端接口执行测试 | 弱一致 / P2 |
| `xeduhub_run_pose_body17_l` | RESULT_VAR=lab_result | `lab_task_id = "body17" lab_flow = xedu_flow_body17 lab_result = lab_flow.inference(data=lab_input) lab_result = lab_result` | lab_input、lab_result、lab_flow | /api/resources/blockly/xeduhub/execute | 运行时 spec 抽取与绑定验证 + 后端接口执行测试 | 弱一致 / P2 |
| `xeduhub_run_pose_body26` | RESULT_VAR=lab_result | `lab_task_id = "body26" lab_flow = xedu_flow_body26 lab_result = lab_flow.inference(data=lab_input) lab_result = lab_result` | lab_input、lab_result、lab_flow | /api/resources/blockly/xeduhub/execute | 运行时 spec 抽取与绑定验证 + 后端接口执行测试 | 弱一致 / P2 |
| `xeduhub_run_pose_face106` | RESULT_VAR=lab_result | `lab_task_id = "face106" lab_flow = xedu_flow_face106 lab_result = lab_flow.inference(data=lab_input) lab_result = lab_result` | lab_input、lab_result、lab_flow | /api/resources/blockly/xeduhub/execute | 运行时 spec 抽取与绑定验证 + 后端接口执行测试 | 弱一致 / P2 |
| `xeduhub_run_pose_hand21` | RESULT_VAR=lab_result | `lab_task_id = "hand21" lab_flow = xedu_flow_hand21 lab_result = lab_flow.inference(data=lab_input) lab_result = lab_result` | lab_input、lab_result、lab_flow | /api/resources/blockly/xeduhub/execute | 运行时 spec 抽取与绑定验证 + 后端接口执行测试 | 弱一致 / P2 |
| `xeduhub_run_pose_wholebody133` | RESULT_VAR=lab_result | `lab_task_id = "wholebody133" lab_flow = xedu_flow_wholebody133 lab_result = lab_flow.inference(data=lab_input) lab_result = lab_result` | lab_input、lab_result、lab_flow | /api/resources/blockly/xeduhub/execute | 运行时 spec 抽取与绑定验证 + 后端接口执行测试 | 弱一致 / P2 |
| `xeduhub_run_segment_anything` | RESULT_VAR=lab_result | `# SAM 图像分割 当前不可本地运行 # 当前本地 XEdu 运行环境不支持该任务。 # 需安装对应模型/版本后再试。 lab_result = {}` | lab_result | /api/resources/blockly/xeduhub/execute | 运行时 spec 抽取与绑定验证 + 后端接口执行测试 | 弱一致 / P2 |
| `xeduhub_workflow_create` | TASK_ID=人体目标检测、MODEL_VAR=lab_flow | `lab_flow = wf(task="bodydetect")` | lab_flow | /api/resources/blockly/xeduhub/execute | 代码生成快照 + 运行时 spec 抽取与绑定验证 | 弱一致 / P2 |
| `xeduhub_workflow_create_var` | TASK_ID=人体目标检测、MODEL_VAR=lab_flow | `lab_flow = wf(task="bodydetect")` | lab_flow | /api/resources/blockly/xeduhub/execute | 代码生成快照 + 运行时 spec 抽取与绑定验证 | 一致 / P3 |
| `xeduhub_workflow_infer` | MODEL_VAR=lab_flow、RESULT_VAR=lab_result、PARAMS={"thr": 0.5} | `lab_params = {"thr": 0.5} lab_result = lab_flow.inference(data=lab_input, **lab_params) lab_result = lab_result` | lab_input、lab_result、lab_flow | /api/resources/blockly/xeduhub/execute | 运行时 spec 抽取与绑定验证 + 后端接口执行测试 | 弱一致 / P2 |
| `xeduhub_workflow_infer_pair` | MODEL_VAR=lab_flow、RESULT_VAR=lab_result、IMAGE_VAR=display_img、PARAMS={"thr": 0.5} | `if lab_flow is None: raise RuntimeError('当前工作区包含本地不支持的 XEdu 任务，无法执行') xedu_params = {"thr": 0.5} xedu_pair_value = lab_flow.inference(dat...` | lab_input、lab_result、lab_flow、display_img、xedu_pair_value、xedu_params | /api/resources/blockly/xeduhub/execute | 运行时 spec 抽取与绑定验证 + 后端接口执行测试 | 一致 / P3 |
| `xeduhub_workflow_infer_var` | MODEL_VAR=lab_flow、RESULT_VAR=lab_result、PARAMS={"thr": 0.5} | `if lab_flow is None: raise RuntimeError('当前工作区包含本地不支持的 XEdu 任务，无法执行') xedu_params = {"thr": 0.5} lab_result = lab_flow.inference(data=lab...` | lab_input、lab_result、lab_flow、xedu_params | /api/resources/blockly/xeduhub/execute | 运行时 spec 抽取与绑定验证 + 后端接口执行测试 | 一致 / P3 |
| `xeduhub_workflow_set_params` | PARAMS={"thr": 0.5} | `lab_params = {"thr": 0.5}` | 无 | /api/resources/blockly/xeduhub/execute | 代码生成快照 + 运行时 spec 抽取与绑定验证 | 一致 / P3 |
| `xeduhub_workflow_set_task` | MODEL_VAR=lab_flow、TASK_ID=人体目标检测 | `lab_flow = wf(task="bodydetect")` | lab_flow | /api/resources/blockly/xeduhub/execute | 代码生成快照 + 运行时 spec 抽取与绑定验证 | 弱一致 / P2 |

## 重点块详细说明

### `xeduhub_clear_result`

- 用户可见：清空结果区
- Tooltip：清空当前运行结果与错误状态。
- 生成代码：`xrt.xedu_clear_result()<br>lab_result = {}<br>lab_error = ''`
- 运行入口：前端结果区动作渲染 + Python 导出 helper 调用
- 结论：一致 / P3
- 发现：该块会直接清空右侧结果区展示，并把状态回退到已清空。
- 修复建议：如需更细粒度清理，可后续区分“清空证据卡”和“重置整次运行状态”。

### `xeduhub_debug_print`

- 用户可见：打印 ?
- Tooltip：无
- 生成代码：`print(lab_result)`
- 运行入口：前端结果区动作渲染 + Python 导出 helper 调用
- 结论：一致 / P3
- 发现：当前实现与主要可见字段基本一致。
- 修复建议：保持现有行为，同时依赖自动审计防止后续语义漂移。

### `xeduhub_print_status`

- 用户可见：兼容 打印
- Tooltip：无
- 生成代码：`print('XEduHub workflow ready')`
- 运行入口：迁移后落入 /api/resources/blockly/xeduhub/execute 或 /api/python/run
- 结论：废弃兼容 / P3
- 发现：兼容块名称仍然指向“状态”，但迁移后实际打印的是 lab_result。
- 修复建议：继续仅作为迁移块保留，不应在新用户工具箱中暴露。

### `xeduhub_run_and_record`

- 用户可见：记录结论 ?
- Tooltip：记录当前实验结论，便于课堂展示与复盘。
- 生成代码：`xrt.xedu_record_conclusion("教学结论已记录", lab_result)`
- 运行入口：前端结果区动作渲染 + Python 导出 helper 调用
- 结论：一致 / P3
- 发现：该块会把备注内容追加到结果证据区，成为本次运行的补充结论。
- 修复建议：如需跨运行持久化，可在后续接入课堂记录或日志存储链路。

### `xeduhub_show_result_card`

- 用户可见：结果显示 运行结果 结果 ?
- Tooltip：把当前识别结果整理成一张易读的结果卡片。
- 生成代码：`xrt.xedu_show_result_card(lab_result, title="运行结果")`
- 运行入口：前端结果区动作渲染 + Python 导出 helper 调用
- 结论：弱一致 / P1
- 发现：该块已经不再是 print；它会触发前端结果区渲染一张结果卡。；当前结果卡主体仍然来自本次运行 payload，而不是严格消费连接进来的 RESULT 输入值。
- 修复建议：后续如需完全显式数据流，应让 RESULT 输入真正决定卡片使用的数据源。

### `xeduhub_show_result_image`

- 用户可见：显示结果图片 ?
- Tooltip：显示当前任务返回的结果图片或标注图。
- 生成代码：`xrt.xedu_show_result_image(None)`
- 运行入口：前端结果区动作渲染 + Python 导出 helper 调用
- 结论：弱一致 / P1
- 发现：该块已经不再是 print；它会触发前端结果区渲染图片证据卡。；当前图片区默认使用本次运行 payload.preview_image，而不是严格消费连接进来的 IMAGE 输入值。
- 修复建议：后续如需完全显式数据流，应让 IMAGE 输入真正决定图片来源，而不只使用当前运行 payload。
