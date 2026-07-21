# XEdu Scratch Capability Directory

Source of truth: `scratch-editor/src/extensions/scratch3_xedu_ai/descriptor.js`, `index.js`, and `stage-sensing.js`. Re-check those files before changing this directory. The project's extension test confirms the current library exposes the extensions below and removes the generic technical extensions.

Tables list the extension method ID. In a saved `.sb3` `project.json`, Scratch serializes it as `<extensionId>_<methodId>`; for example, `xeduCamera_enableCamera` and `xeduBodySensing_bodyDetected`. Validate the complete serialized opcode, not only the method suffix.

## Status

| Category | New Scratch experiments | Status |
| --- | --- | --- |
| Scratch native blocks | Events, control, motion, looks, variables, lists, operators, sensing | Available in Scratch |
| Camera input and stage preview | `xeduCamera` | Available |
| XEdu camera sensing and result readers | Eight `xedu*` sensing extensions below | Available |
| Network/device control | `xeduDevice` K10 blocks | Available with hardware |
| Generic XEdu AI tasks, results, math, workflow, image, media, network helpers | Historical `scratch3_xedu_ai` descriptor blocks | Not registered; do not use in new projects |

## Camera Input

| Extension ID | Block ID and Chinese text | Type and parameters | Result / dependency |
| --- | --- | --- | --- |
| `xeduCamera` | `enableCamera` `开启摄像头` | Command | Requires Scratch video device and camera permission |
| `xeduCamera` | `disableCamera` `关闭摄像头` | Command | Stops camera and active sensing |
| `xeduCamera` | `showCameraPreview` `摄像头画面显示在 [DISPLAY]` | Command; `DISPLAY`: `stage` or `hidden` | Shows or hides stage preview |
| `xeduCamera` | `setCameraTransparency` `摄像头透明度设为 [TRANSPARENCY]` | Command; numeric transparency | Changes stage preview transparency |

## Camera Sensing

All sensing extensions capture stage camera frames, call the local XEduHub endpoint, and refresh while enabled. Start `xeduCamera` first, then use the extension's `enable*` block and guard reads with its `*Ready` boolean. They require camera permission, `http://127.0.0.1:5123/api/resources/xeduhub/execute`, and the mapped backend task to be available.

| Extension ID / backend task | Blocks: ID and Chinese text | Parameters | Returned value / use |
| --- | --- | --- | --- |
| `xeduImageClassification` / `cls_imagenet` | `enableClassification` `开启图像分类`; `classificationReady` `图像分类准备好？`; `classificationLabel` `识别到的类别`; `classificationConfidence` `识别置信度`; `classificationIs` `识别结果是 [TARGET]？` | `TARGET` text | Label, confidence, or boolean match |
| `xeduObjectSensing` / `det_coco_l` | `enableObjectSensing` `开启物体感知`; `objectReady` `物体感知准备好？`; `objectDetected` `检测到 [TARGET]？`; `objectCount` `[TARGET] 的数量`; `objectField` `第 [INDEX] 个目标的 [FIELD]`; `objectPosition` `第 [INDEX] 个目标的 [POSITION]` | `TARGET`; 1-based `INDEX`; `FIELD`: label/confidence; `POSITION`: centerX/centerY/width/height | Detection boolean, count, metadata, or box value |
| `xeduFaceSensing` / `pose_face106` | `enableFaceSensing` `开启人脸感知`; `faceReady` `人脸感知准备好？`; `faceDetected` `检测到人脸？`; `faceCount` `人脸数量`; `facePosition` `第 [INDEX] 张人脸的 [POSITION]`; `facePointAxis` `第 [INDEX] 个面部关键点的 [AXIS]` | 1-based `INDEX`; `POSITION`; `AXIS`: X/Y | Boolean, count, box value, or face-point coordinate |
| `xeduBodySensing` / `pose_body17` | `enableBodySensing` `开启人体感知`; `bodyReady` `人体感知准备好？`; `bodyDetected` `检测到人体？`; `bodyCount` `人体数量`; `bodyPosition` `第 [INDEX] 个人体的 [POSITION]`; `bodyPointAxis` `第 [POINT] 个身体关键点的 [AXIS]` | 1-based `INDEX`; `POINT`: nose, left/right wrist, left/right ankle; `POSITION`; `AXIS`: X/Y | Boolean, count, box value, or body-point coordinate |
| `xeduHandSensing` / `pose_hand21` | `enableHandSensing` `开启手部感知`; `handReady` `手部感知准备好？`; `handDetected` `检测到手部？`; `handCount` `手部数量`; `handPosition` `第 [INDEX] 只手的 [POSITION]`; `handPointAxis` `第 [POINT] 个手部关键点的 [AXIS]` | 1-based `INDEX`; `POINT`: wrist or fingertip menu; `POSITION`; `AXIS`: X/Y | Boolean, count, box value, or hand-point coordinate |
| `xeduTextRecognition` / `ocr` | `enableTextRecognition` `开启文字识别`; `textReady` `文字识别准备好？`; `textRecognized` `识别到文字？`; `textCount` `文字块数量`; `textBlock` `第 [INDEX] 个文字块`; `allRecognizedText` `识别到的全部文字` | 1-based `INDEX` | Boolean, count, text block, or joined text |
| `xeduImageSegmentation` / `segment_anything` | `enableSegmentation` `开启图像分割`; `segmentationReady` `图像分割准备好？`; `segmentationFound` `生成了分割区域？`; `segmentationCount` `分割区域数量` | None | Boolean or region count |
| `xeduDepthSensing` / `depth_anything` | `enableDepthSensing` `开启深度感知`; `depthReady` `深度感知准备好？`; `depthValue` `位置 X [X] Y [Y] 的相对深度` | Stage coordinates `X`, `Y` | Numeric relative depth |

## Device Control

| Extension ID | Block ID and Chinese text | Parameters | Dependency / status |
| --- | --- | --- | --- |
| `xeduDevice` | `xeduhub_http_send_command` `发送设备指令 [BASE_URL] 动作 [CMD]` | `BASE_URL`, `CMD`, optional stop command/delay fields | Network-reachable device endpoint |
| `xeduDevice` | `xeduhub_k10_gpio_write` `K10 引脚 [PIN] 写入 [VALUE]` | Pin, value | K10 hardware/runtime |
| `xeduDevice` | `xeduhub_k10_pwm_write` `K10 PWM [PIN] 占空比 [DUTY] 频率 [FREQ]` | Pin, duty, frequency | K10 hardware/runtime |
| `xeduDevice` | `xeduhub_k10_uart_send` `K10 串口 [PORT] 发送 [TEXT]` | Port, text | K10 serial runtime |
| `xeduDevice` | `xeduhub_servo_setup` `初始化舵机 [BOARD] 引脚 [PIN] 记为 [SERVO_VAR]` | Board, pin, variable name | K10 hardware/runtime |
| `xeduDevice` | `xeduhub_servo_write_angle` `舵机 [SERVO_VAR] 设置角度 [ANGLE]` | Servo variable, angle | Initialized K10 servo |

## Historical Compatibility Boundary

The descriptor still defines 93 generic `xeduhub_*` blocks and task IDs including classification, detection, pose, OCR, segmentation, depth, generation, embedding, and workflow helpers. The current extension manager and library explicitly remove `xeduAI`, `xeduVision`, `xeduWorkflow`, `xeduImage`, `xeduMedia`, `xeduMath`, and `xeduResults`. Treat those blocks as unsupported historical compatibility code: do not place them in a new `.sb3` and do not claim they are available to students.

## Project Validation

1. `unzip -p path/to/project.sb3 project.json` must succeed and produce JSON.
2. Compare `project.json.extensions` and each `xedu*` opcode with the tables above.
3. Open, run, save, and reopen in the local Scratch editor.
4. For sensing, verify camera startup, a ready-state guard, one visible feedback path, and a local XEduHub response.
