const XEDU_BLOCK_IDS = Object.freeze([
    'xeduhub_bbox_center_x', 'xeduhub_catch_error', 'xeduhub_chunk_over_size',
    'xeduhub_classify_run', 'xeduhub_clear_result', 'xeduhub_create_flow',
    'xeduhub_create_workflow', 'xeduhub_cv_canny', 'xeduhub_cv_crop_image',
    'xeduhub_cv_cvt_color', 'xeduhub_cv_decode_chunk', 'xeduhub_cv_draw_boxes',
    'xeduhub_cv_flip_image', 'xeduhub_cv_gaussian_blur', 'xeduhub_cv_loop_frames',
    'xeduhub_cv_open_camera', 'xeduhub_cv_open_video', 'xeduhub_cv_put_text',
    'xeduhub_cv_resize_image', 'xeduhub_cv_rotate_image', 'xeduhub_cv_save_image',
    'xeduhub_cv_show_frame', 'xeduhub_cv_threshold', 'xeduhub_debug_print',
    'xeduhub_decode_chunk_image', 'xeduhub_detect_run', 'xeduhub_draw_boxes_image',
    'xeduhub_execute_workflow', 'xeduhub_flow_execute', 'xeduhub_flow_set_input',
    'xeduhub_get_result_field', 'xeduhub_http_get', 'xeduhub_http_iter_chunks',
    'xeduhub_http_loop_stream_frames', 'xeduhub_http_open_stream',
    'xeduhub_http_send_command', 'xeduhub_input_image', 'xeduhub_k10_gpio_write',
    'xeduhub_k10_pwm_write', 'xeduhub_k10_uart_send', 'xeduhub_keypoint_axis',
    'xeduhub_load_image_to_var', 'xeduhub_math_distance', 'xeduhub_media_frames_to_video',
    'xeduhub_ocr_first_text', 'xeduhub_ocr_run', 'xeduhub_polyfit_quadratic',
    'xeduhub_print_status', 'xeduhub_quadratic_eval', 'xeduhub_quadratic_fit',
    'xeduhub_raw_create_workflow', 'xeduhub_raw_inference', 'xeduhub_result_first_box',
    'xeduhub_run_and_record', 'xeduhub_run_cls_imagenet', 'xeduhub_run_depth_anything',
    'xeduhub_run_det_body', 'xeduhub_run_det_body_l', 'xeduhub_run_det_coco',
    'xeduhub_run_det_coco_l', 'xeduhub_run_det_face', 'xeduhub_run_det_hand',
    'xeduhub_run_drive_perception', 'xeduhub_run_embedding_audio',
    'xeduhub_run_embedding_image', 'xeduhub_run_embedding_text', 'xeduhub_run_gen_color',
    'xeduhub_run_gen_style', 'xeduhub_run_ocr', 'xeduhub_run_pose_body17',
    'xeduhub_run_pose_body17_l', 'xeduhub_run_pose_body26', 'xeduhub_run_pose_face106',
    'xeduhub_run_pose_hand21', 'xeduhub_run_pose_wholebody133',
    'xeduhub_run_segment_anything', 'xeduhub_run_vision', 'xeduhub_servo_setup',
    'xeduhub_servo_write_angle', 'xeduhub_set_input', 'xeduhub_set_input_list',
    'xeduhub_set_input_resource', 'xeduhub_set_model', 'xeduhub_show_result',
    'xeduhub_show_result_card', 'xeduhub_show_result_image', 'xeduhub_workflow_create',
    'xeduhub_workflow_create_var', 'xeduhub_workflow_infer', 'xeduhub_workflow_infer_pair',
    'xeduhub_workflow_infer_var', 'xeduhub_workflow_set_params', 'xeduhub_workflow_set_task',
]);

const TASKS = Object.freeze({
    cls_imagenet: {label: '图像分类', family: 'classification', params: []},
    det_body: {label: '人体目标检测', family: 'detection', params: ['thr']},
    det_body_l: {label: '人体目标检测 Large', family: 'detection', params: ['thr']},
    det_face: {label: '人脸目标检测', family: 'detection', params: ['minSize', 'maxSize', 'scaleFactor', 'minNeighbors']},
    det_hand: {label: '手部目标检测', family: 'detection', params: ['thr']},
    det_coco: {label: 'COCO 目标检测', family: 'detection', params: ['thr', 'targetClass']},
    det_coco_l: {label: 'COCO 目标检测 Large', family: 'detection', params: ['thr', 'targetClass']},
    pose_body17: {label: '人体关键点 17', family: 'pose', params: ['bbox']},
    pose_body17_l: {label: '人体关键点 17 Large', family: 'pose', params: ['bbox']},
    pose_body26: {label: '人体关键点 26', family: 'pose', params: ['bbox']},
    pose_face106: {label: '人脸关键点 106', family: 'pose', params: ['bbox']},
    pose_hand21: {label: '手部关键点 21', family: 'pose', params: ['bbox']},
    pose_wholebody133: {label: '全身关键点 133', family: 'pose', params: ['bbox']},
    ocr: {label: '光学字符识别', family: 'ocr', params: []},
    gen_style: {label: '图像风格迁移', family: 'generation', params: ['style']},
    gen_color: {label: '图像着色', family: 'generation', params: []},
    drive_perception: {label: '全景驾驶感知', family: 'panoptic', params: ['thr']},
    embedding_image: {label: '图像特征提取', family: 'multimodal', params: []},
    embedding_text: {label: '文本特征提取', family: 'multimodal', params: []},
    embedding_audio: {label: '音频特征提取', family: 'multimodal', params: []},
    segment_anything: {label: 'SAM 图像分割', family: 'segmentation', params: ['mode', 'prompt']},
    depth_anything: {label: '单目深度估计', family: 'depth', params: []},
});

const TASK_LABELS = Object.freeze({
    cls_imagenet: '看图分类', det_body: '找人体', det_body_l: '找人体+', det_face: '找人脸',
    det_hand: '找手部', det_coco: '找物体', det_coco_l: '找物体+', pose_body17: '看动作',
    pose_body17_l: '看动作+', pose_body26: '看动作26', pose_face106: '看脸点',
    pose_hand21: '看手势', pose_wholebody133: '看全身点', ocr: '读文字', gen_style: '换风格',
    gen_color: '图像上色', drive_perception: '驾驶感知', embedding_image: '图像特征',
    embedding_text: '文本特征', embedding_audio: '音频特征', segment_anything: '圈区域',
    depth_anything: '看远近',
});

const TASK_ALIASES = Object.freeze({
    bodydetect: 'det_body', cocodetect: 'det_coco', body17: 'pose_body17', body26: 'pose_body26',
    face106: 'pose_face106', hand21: 'pose_hand21', wholebody133: 'pose_wholebody133',
    classification: 'cls_imagenet', detection: 'det_body', pose: 'pose_body17',
    segmentation: 'segment_anything', generation: 'gen_style', panoptic: 'drive_perception',
    multimodal: 'embedding_image', depth: 'depth_anything',
});

const COLORS = Object.freeze({
    input: '#4F8FD7', task: '#5865D8', result: '#2E9B86', workflow: '#7C67C8',
    media: '#2E9B86', network: '#D88345', math: '#3EAF9E', debug: '#8A70B5',
});

const REPORTER_BLOCKS = new Set([
    'xeduhub_bbox_center_x', 'xeduhub_chunk_over_size', 'xeduhub_cv_canny',
    'xeduhub_cv_crop_image', 'xeduhub_cv_cvt_color', 'xeduhub_cv_draw_boxes',
    'xeduhub_cv_flip_image', 'xeduhub_cv_gaussian_blur', 'xeduhub_cv_put_text',
    'xeduhub_cv_resize_image', 'xeduhub_cv_rotate_image', 'xeduhub_cv_threshold',
    'xeduhub_decode_chunk_image', 'xeduhub_draw_boxes_image', 'xeduhub_get_result_field',
    'xeduhub_input_image', 'xeduhub_keypoint_axis', 'xeduhub_ocr_first_text',
    'xeduhub_quadratic_eval', 'xeduhub_quadratic_fit', 'xeduhub_result_first_box',
]);

const BOOLEAN_BLOCKS = new Set(['xeduhub_chunk_over_size']);

const TASK_BLOCKS = Object.freeze(Object.fromEntries(
    Object.keys(TASKS).map(taskId => [`xeduhub_run_${taskId}`, taskId]),
));

const MODULE_BLOCK_GROUPS = Object.freeze({
    device: [
        'xeduhub_http_send_command', 'xeduhub_k10_gpio_write', 'xeduhub_k10_pwm_write', 'xeduhub_k10_uart_send',
        'xeduhub_servo_setup', 'xeduhub_servo_write_angle',
    ],
});

function xeduCategoryIconUri(color, symbol) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40">
        <rect width="40" height="40" rx="10" fill="${color}"/>
        <circle cx="31" cy="9" r="10" fill="#fff" opacity=".18"/>
        <circle cx="9" cy="32" r="8" fill="#111827" opacity=".10"/>
        ${symbol}
    </svg>`;
    return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

const MODULE_ICONS = Object.freeze({
    ai: xeduCategoryIconUri('#6366F1', `
        <path d="M12 14h8m0 0v12m0-12 8 4m-8 8 8-4" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
        <circle cx="12" cy="14" r="4" fill="#fff"/>
        <circle cx="20" cy="26" r="4" fill="#fff"/>
        <circle cx="28" cy="18" r="4" fill="#fff"/>
        <circle cx="28" cy="22" r="4" fill="#fff" opacity=".74"/>
    `),
    vision: xeduCategoryIconUri('#0EA5E9', `
        <path d="M7 20s5-8 13-8 13 8 13 8-5 8-13 8S7 20 7 20Z" fill="#fff"/>
        <circle cx="20" cy="20" r="6" fill="#075985"/>
        <circle cx="22" cy="18" r="2" fill="#fff"/>
        <path d="M8 10h6M26 10h6M8 30h6M26 30h6" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/>
    `),
    workflow: xeduCategoryIconUri('#6366F1', `
        <rect x="7" y="8" width="10" height="9" rx="2.5" fill="#fff"/>
        <rect x="23" y="16" width="10" height="9" rx="2.5" fill="#fff"/>
        <rect x="7" y="25" width="10" height="7" rx="2.5" fill="#fff" opacity=".82"/>
        <path d="M17 12.5h4c3 0 4 1.5 4 3.5M23 20.5h-4c-3 0-4 1.5-4 4.5" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/>
    `),
    image: xeduCategoryIconUri('#22C55E', `
        <rect x="8" y="10" width="24" height="20" rx="4" fill="#fff"/>
        <path d="m10 27 7-8 5 5 3-4 5 7H10Z" fill="#15803D"/>
        <circle cx="25.5" cy="15.5" r="3" fill="#86EFAC"/>
        <path d="M12 7v6M9 10h6M28 27v6M25 30h6" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/>
    `),
    media: xeduCategoryIconUri('#06B6D4', `
        <rect x="7" y="12" width="18" height="14" rx="3" fill="#fff"/>
        <path d="m25 17 7-4v12l-7-4v-4Z" fill="#fff"/>
        <path d="M13 29h8" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/>
        <rect x="16" y="26" width="2" height="5" rx="1" fill="#fff"/>
        <circle cx="14" cy="19" r="3.5" fill="#0891B2"/>
    `),
    device: xeduCategoryIconUri('#F97316', `
        <rect x="11" y="11" width="18" height="18" rx="4" fill="#fff"/>
        <rect x="16" y="16" width="8" height="8" rx="2" fill="#C2410C"/>
        <path d="M8 15h4M8 20h4M8 25h4M28 15h4M28 20h4M28 25h4M15 8v4M20 8v4M25 8v4M15 28v4M20 28v4M25 28v4" stroke="#fff" stroke-width="2" stroke-linecap="round"/>
    `),
    math: xeduCategoryIconUri('#475569', `
        <path d="M9 29h22M11 29V11" stroke="#fff" stroke-width="2.8" stroke-linecap="round"/>
        <path d="M11 24c4-10 8-10 11-4s5 4 8-5" stroke="#38BDF8" stroke-width="3" stroke-linecap="round" fill="none"/>
        <circle cx="18" cy="18" r="2.5" fill="#fff"/>
        <circle cx="25" cy="22" r="2.5" fill="#fff"/>
        <path d="M27 10h6M30 7v6" stroke="#FDE68A" stroke-width="2.4" stroke-linecap="round"/>
    `),
    results: xeduCategoryIconUri('#16A34A', `
        <rect x="9" y="8" width="22" height="25" rx="4" fill="#fff"/>
        <path d="m13 18 3 3 6-7" stroke="#15803D" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M14 26h13M22 16h5" stroke="#86EFAC" stroke-width="2.6" stroke-linecap="round"/>
        <circle cx="29" cy="9" r="5" fill="#FACC15"/>
    `),
});

const SENSING_ICONS = Object.freeze({
    imageClassification: xeduCategoryIconUri('#2563EB', `
        <rect x="8" y="9" width="24" height="22" rx="4" fill="#fff"/>
        <circle cx="15" cy="16" r="3" fill="#FBBF24"/>
        <path d="m10 28 7-8 5 5 4-5 4 8Z" fill="#60A5FA"/>
    `),
    objectSensing: xeduCategoryIconUri('#F97316', `
        <path d="M8 14V8h6M26 8h6v6M8 26v6h6M32 26v6h-6" stroke="#fff" stroke-width="2.8" stroke-linecap="round"/>
        <rect x="14" y="13" width="12" height="15" rx="3" fill="#fff"/>
    `),
    faceSensing: xeduCategoryIconUri('#F43F5E', `
        <circle cx="20" cy="20" r="12" fill="#fff"/>
        <circle cx="16" cy="18" r="1.7" fill="#881337"/><circle cx="24" cy="18" r="1.7" fill="#881337"/>
        <path d="M16 24c2.4 2 5.6 2 8 0" stroke="#881337" stroke-width="2.2" stroke-linecap="round"/>
    `),
    bodySensing: xeduCategoryIconUri('#4F46E5', `
        <circle cx="20" cy="9" r="4" fill="#fff"/>
        <path d="M20 14v11m0-8-8 5m8-5 8 5m-8 3-6 7m6-7 6 7" stroke="#fff" stroke-width="3" stroke-linecap="round"/>
    `),
    handSensing: xeduCategoryIconUri('#D97706', `
        <path d="M13 21v-8a2 2 0 0 1 4 0v5-8a2 2 0 0 1 4 0v8-6a2 2 0 0 1 4 0v8-4a2 2 0 0 1 4 0v9c0 5-4 8-9 8s-9-4-9-9v-3a2 2 0 0 1 4 0" fill="#fff"/>
    `),
    textRecognition: xeduCategoryIconUri('#0D9488', `
        <rect x="8" y="9" width="24" height="22" rx="3" fill="#fff"/>
        <path d="M13 15h14M13 20h14M13 25h9" stroke="#0F766E" stroke-width="2.5" stroke-linecap="round"/>
    `),
    imageSegmentation: xeduCategoryIconUri('#16A34A', `
        <path d="M8 27c5-12 8-17 15-17 4 0 7 3 11 2v17H8Z" fill="#fff"/>
        <path d="M9 28c7-5 10-6 15-4 4 2 7 4 10 2v5H9Z" fill="#86EFAC"/>
        <circle cx="22" cy="18" r="3" fill="#15803D"/>
    `),
    depthSensing: xeduCategoryIconUri('#0F766E', `
        <ellipse cx="20" cy="20" rx="13" ry="9" fill="#fff"/>
        <ellipse cx="20" cy="20" rx="9" ry="6" fill="#5EEAD4"/>
        <ellipse cx="20" cy="20" rx="4" ry="3" fill="#115E59"/>
    `),
});

const SENSING_DEFINITIONS = Object.freeze([
    {
        key: 'imageClassification', id: 'xeduImageClassification', name: 'XEdu 图像分类',
        color1: '#2563EB', color2: '#1D4ED8', color3: '#1E3A8A', iconURI: SENSING_ICONS.imageClassification,
        blocks: [
            ['enableClassification', '开启图像分类', 'command'],
            ['classificationReady', '图像分类准备好？', 'boolean'],
            ['classificationLabel', '识别到的类别', 'reporter'],
            ['classificationConfidence', '识别置信度', 'reporter'],
            ['classificationIs', '识别结果是 [TARGET]？', 'boolean', ['TARGET']],
        ],
    },
    {
        key: 'objectSensing', id: 'xeduObjectSensing', name: 'XEdu 物体感知',
        color1: '#F97316', color2: '#EA580C', color3: '#9A3412', iconURI: SENSING_ICONS.objectSensing,
        blocks: [
            ['enableObjectSensing', '开启物体感知', 'command'],
            ['objectReady', '物体感知准备好？', 'boolean'],
            ['objectDetected', '检测到 [TARGET]？', 'boolean', ['TARGET']],
            ['objectCount', '[TARGET] 的数量', 'reporter', ['TARGET']],
            ['objectField', '第 [INDEX] 个目标的 [FIELD]', 'reporter', ['INDEX', 'FIELD']],
            ['objectPosition', '第 [INDEX] 个目标的 [POSITION]', 'reporter', ['INDEX', 'POSITION']],
        ],
    },
    {
        key: 'faceSensing', id: 'xeduFaceSensing', name: 'XEdu 人脸感知',
        color1: '#F43F5E', color2: '#E11D48', color3: '#881337', iconURI: SENSING_ICONS.faceSensing,
        blocks: [
            ['enableFaceSensing', '开启人脸感知', 'command'],
            ['faceReady', '人脸感知准备好？', 'boolean'],
            ['faceDetected', '检测到人脸？', 'boolean'],
            ['faceCount', '人脸数量', 'reporter'],
            ['facePosition', '第 [INDEX] 张人脸的 [POSITION]', 'reporter', ['INDEX', 'POSITION']],
            ['facePointAxis', '第 [INDEX] 个面部关键点的 [AXIS]', 'reporter', ['INDEX', 'AXIS']],
        ],
    },
    {
        key: 'bodySensing', id: 'xeduBodySensing', name: 'XEdu 人体感知',
        color1: '#4F46E5', color2: '#4338CA', color3: '#312E81', iconURI: SENSING_ICONS.bodySensing,
        blocks: [
            ['enableBodySensing', '开启人体感知', 'command'],
            ['bodyReady', '人体感知准备好？', 'boolean'],
            ['bodyDetected', '检测到人体？', 'boolean'],
            ['bodyCount', '人体数量', 'reporter'],
            ['bodyPosition', '第 [INDEX] 个人体的 [POSITION]', 'reporter', ['INDEX', 'POSITION']],
            ['bodyPointAxis', '第 [POINT] 个身体关键点的 [AXIS]', 'reporter', ['POINT', 'AXIS']],
        ],
    },
    {
        key: 'handSensing', id: 'xeduHandSensing', name: 'XEdu 手部感知',
        color1: '#D97706', color2: '#B45309', color3: '#78350F', iconURI: SENSING_ICONS.handSensing,
        blocks: [
            ['enableHandSensing', '开启手部感知', 'command'],
            ['handReady', '手部感知准备好？', 'boolean'],
            ['handDetected', '检测到手部？', 'boolean'],
            ['handCount', '手部数量', 'reporter'],
            ['handPosition', '第 [INDEX] 只手的 [POSITION]', 'reporter', ['INDEX', 'POSITION']],
            ['handPointAxis', '第 [POINT] 个手部关键点的 [AXIS]', 'reporter', ['POINT', 'AXIS']],
        ],
    },
    {
        key: 'textRecognition', id: 'xeduTextRecognition', name: 'XEdu 文字识别',
        color1: '#0D9488', color2: '#0F766E', color3: '#134E4A', iconURI: SENSING_ICONS.textRecognition,
        blocks: [
            ['enableTextRecognition', '开启文字识别', 'command'],
            ['textReady', '文字识别准备好？', 'boolean'],
            ['textRecognized', '识别到文字？', 'boolean'],
            ['textCount', '文字块数量', 'reporter'],
            ['textBlock', '第 [INDEX] 个文字块', 'reporter', ['INDEX']],
            ['allRecognizedText', '识别到的全部文字', 'reporter'],
        ],
    },
    {
        key: 'imageSegmentation', id: 'xeduImageSegmentation', name: 'XEdu 图像分割',
        color1: '#16A34A', color2: '#15803D', color3: '#14532D', iconURI: SENSING_ICONS.imageSegmentation,
        blocks: [
            ['enableSegmentation', '开启图像分割', 'command'],
            ['segmentationReady', '图像分割准备好？', 'boolean'],
            ['segmentationFound', '生成了分割区域？', 'boolean'],
            ['segmentationCount', '分割区域数量', 'reporter'],
        ],
    },
    {
        key: 'depthSensing', id: 'xeduDepthSensing', name: 'XEdu 深度感知',
        color1: '#0F766E', color2: '#115E59', color3: '#134E4A', iconURI: SENSING_ICONS.depthSensing,
        blocks: [
            ['enableDepthSensing', '开启深度感知', 'command'],
            ['depthReady', '深度感知准备好？', 'boolean'],
            ['depthValue', '位置 X [X] Y [Y] 的相对深度', 'reporter', ['X', 'Y']],
        ],
    },
]);

const CAMERA_DEFINITION = Object.freeze({
    id: 'xeduCamera', name: 'XEdu 摄像头', color1: '#0EA5A4', color2: '#0F766E', color3: '#134E4A', iconURI: MODULE_ICONS.device,
    blocks: [
        ['enableCamera', '开启摄像头', 'command'],
        ['disableCamera', '关闭摄像头', 'command'],
        ['showCameraPreview', '摄像头画面显示在 [DISPLAY]', 'command', ['DISPLAY']],
        ['setCameraTransparency', '摄像头透明度设为 [TRANSPARENCY]', 'command', ['TRANSPARENCY']],
    ],
});

const MODULE_DEFINITIONS = Object.freeze([
    {key: 'device', id: 'xeduDevice', name: 'XEdu 设备控制', color1: '#F97316', color2: '#EA580C', color3: '#9A3412', iconURI: MODULE_ICONS.device},
]);

const TEXTS = Object.freeze({
    xeduhub_bbox_center_x: 'XEdu 第一个框中心 X %BOX%',
    xeduhub_catch_error: 'XEdu 捕获错误 %ERROR_VAR%',
    xeduhub_chunk_over_size: '分块 %CHUNK% 大于 %SIZE%',
    xeduhub_classify_run: '兼容分类 %MODEL%', xeduhub_clear_result: '清空 XEdu 结果区',
    xeduhub_create_flow: '兼容创建流程 %TASK% 模型 %MODEL%',
    xeduhub_create_workflow: '兼容创建 Workflow %TASK% 模型 %MODEL%',
    xeduhub_cv_canny: '图像边缘检测 %IMAGE% 阈值 %THRESHOLD1% %THRESHOLD2%',
    xeduhub_cv_crop_image: '图像裁剪 %IMAGE% x %CROP_X% y %CROP_Y% 宽 %CROP_W% 高 %CROP_H%',
    xeduhub_cv_cvt_color: '图像颜色转换 %IMAGE% %COLOR_CODE%',
    xeduhub_cv_decode_chunk: '分块转画面 %CHUNK% 到 %IMAGE_VAR%',
    xeduhub_cv_draw_boxes: '图像 %IMAGE% 画框 %BOXES% 到 %IMAGE_VAR%',
    xeduhub_cv_flip_image: '图像翻转 %IMAGE% %FLIP_CODE%',
    xeduhub_cv_gaussian_blur: '图像高斯模糊 %IMAGE% 核 %KSIZE%',
    xeduhub_cv_loop_frames: '循环读取 %CAMERA_VAR% 到 %FRAME_VAR%',
    xeduhub_cv_open_camera: '打开摄像头 %SOURCE% 记为 %CAMERA_VAR%',
    xeduhub_cv_open_video: '打开视频 %SOURCE% 记为 %CAMERA_VAR%',
    xeduhub_cv_put_text: '图像写字 %IMAGE% %TEXT%',
    xeduhub_cv_resize_image: '图像缩放 %IMAGE% 宽 %WIDTH% 高 %HEIGHT%',
    xeduhub_cv_rotate_image: '图像旋转 %IMAGE% %ROTATE_CODE%',
    xeduhub_cv_save_image: '保存图片 %IMAGE% 到 %PATH%',
    xeduhub_cv_show_frame: '显示画面 %FRAME% 窗口 %WINDOW%',
    xeduhub_cv_threshold: '图像二值化 %IMAGE% 阈值 %THRESHOLD% 最大值 %MAX_VALUE%',
    xeduhub_debug_print: '打印 XEdu 值 %VALUE%', xeduhub_decode_chunk_image: '分块转画面 %CHUNK%',
    xeduhub_detect_run: '兼容检测 %MODEL%', xeduhub_draw_boxes_image: '图像画框 %IMAGE% %BOXES%',
    xeduhub_execute_workflow: '兼容执行 Workflow %RESULT%', xeduhub_flow_execute: '兼容执行流程 %RESULT%',
    xeduhub_flow_set_input: '兼容输入 %INPUT%', xeduhub_get_result_field: '读取结果 %RESULT% 的 %FIELD%',
    xeduhub_http_get: 'GET %URL% 保存到 %RESPONSE_VAR%',
    xeduhub_http_iter_chunks: '遍历网络分块 %STREAM_VAR% 到 %CHUNK_VAR%',
    xeduhub_http_loop_stream_frames: '循环读取流 %STREAM_VAR% 到 %FRAME_VAR%',
    xeduhub_http_open_stream: '打开网络视频流 %URL% 记为 %STREAM_VAR%',
    xeduhub_http_send_command: '发送设备指令 %BASE_URL% 动作 %CMD%',
    xeduhub_input_image: '图片路径 %INPUT%', xeduhub_k10_gpio_write: 'K10 引脚 %PIN% 写入 %VALUE%',
    xeduhub_k10_pwm_write: 'K10 PWM %PIN% 占空比 %DUTY% 频率 %FREQ%',
    xeduhub_k10_uart_send: 'K10 串口 %PORT% 发送 %TEXT%', xeduhub_keypoint_axis: '关键点 %POINTS% 第 %INDEX% 个 %AXIS%',
    xeduhub_load_image_to_var: '读取图片 %INPUT% 赋值给 %IMAGE_VAR%',
    xeduhub_math_distance: '两点距离 %X1% %Y1% 到 %X2% %Y2%',
    xeduhub_media_frames_to_video: '图片目录 %OUTPUT_DIR% 合成视频 %OUTPUT_VIDEO%',
    xeduhub_ocr_first_text: '第一段文字 %RESULT%', xeduhub_ocr_run: '兼容 OCR %MODEL%',
    xeduhub_polyfit_quadratic: '拟合二次曲线 X %X_VALUES% Y %Y_VALUES% 到 %COEFF_VAR%',
    xeduhub_print_status: '打印 XEdu 状态', xeduhub_quadratic_eval: '二次曲线 %COEFFS% 在 %X%',
    xeduhub_quadratic_fit: '拟合二次曲线 X %X_VALUES% Y %Y_VALUES%',
    xeduhub_raw_create_workflow: '兼容底层流程 %TASK%', xeduhub_raw_inference: '兼容推理 %INPUT% 模型 %MODEL%',
    xeduhub_result_first_box: '第一个检测框 %RESULT%', xeduhub_run_and_record: '记录结论 %NOTE%',
    xeduhub_run_vision: '兼容运行 %TASK% 模型 %MODEL% 输入 %INPUT%',
    xeduhub_servo_setup: '初始化舵机 %BOARD% 引脚 %PIN% 记为 %SERVO_VAR%',
    xeduhub_servo_write_angle: '舵机 %SERVO_VAR% 设置角度 %ANGLE%',
    xeduhub_set_input: '兼容选图 %INPUT%', xeduhub_set_input_list: '输入序列 %INPUTS%',
    xeduhub_set_input_resource: '设置输入路径 %INPUT%', xeduhub_set_model: '兼容模型 %MODEL%',
    xeduhub_show_result: '兼容结果 %TITLE%', xeduhub_show_result_card: '结果显示 %TITLE% 内容 %RESULT%',
    xeduhub_show_result_image: '显示结果图片 %IMAGE%', xeduhub_workflow_create: '初始化任务 %TASK_ID% 记为 %MODEL_VAR%',
    xeduhub_workflow_create_var: '新建任务 %TASK_ID% 记为 %MODEL_VAR%',
    xeduhub_workflow_infer: '模型推理 %MODEL_VAR% 输入 %INPUT_DATA% 输出 %RESULT_VAR%',
    xeduhub_workflow_infer_pair: '识别流程 %MODEL_VAR% 输入 %INPUT_DATA% 输出 %RESULT_VAR% 图片 %IMAGE_VAR%',
    xeduhub_workflow_infer_var: '识别流程 %MODEL_VAR% 输入 %INPUT_DATA% 输出 %RESULT_VAR%',
    xeduhub_workflow_set_params: '更多参数 %PARAMS%', xeduhub_workflow_set_task: '流程 %MODEL_VAR% 切换到 %TASK_ID%',
});

const ARGUMENTS = Object.freeze({
    xeduhub_bbox_center_x: ['BOX'], xeduhub_catch_error: ['ERROR_VAR'], xeduhub_chunk_over_size: ['CHUNK', 'SIZE'],
    xeduhub_classify_run: ['MODEL'], xeduhub_create_flow: ['TASK', 'MODEL'], xeduhub_create_workflow: ['TASK', 'MODEL'],
    xeduhub_cv_canny: ['IMAGE', 'THRESHOLD1', 'THRESHOLD2'], xeduhub_cv_crop_image: ['IMAGE', 'CROP_X', 'CROP_Y', 'CROP_W', 'CROP_H'],
    xeduhub_cv_cvt_color: ['IMAGE', 'COLOR_CODE'], xeduhub_cv_decode_chunk: ['CHUNK', 'IMAGE_VAR'],
    xeduhub_cv_draw_boxes: ['IMAGE', 'BOXES', 'IMAGE_VAR'], xeduhub_cv_flip_image: ['IMAGE', 'FLIP_CODE'],
    xeduhub_cv_gaussian_blur: ['IMAGE', 'KSIZE'], xeduhub_cv_loop_frames: ['CAMERA_VAR', 'FRAME_VAR'],
    xeduhub_cv_open_camera: ['SOURCE', 'CAMERA_VAR'], xeduhub_cv_open_video: ['SOURCE', 'CAMERA_VAR'],
    xeduhub_cv_put_text: ['IMAGE', 'TEXT', 'TEXT_X', 'TEXT_Y', 'TEXT_SCALE', 'TEXT_THICKNESS'],
    xeduhub_cv_resize_image: ['IMAGE', 'WIDTH', 'HEIGHT'], xeduhub_cv_rotate_image: ['IMAGE', 'ROTATE_CODE'],
    xeduhub_cv_save_image: ['IMAGE', 'PATH'], xeduhub_cv_show_frame: ['FRAME', 'WINDOW'],
    xeduhub_cv_threshold: ['IMAGE', 'THRESHOLD', 'MAX_VALUE'], xeduhub_debug_print: ['VALUE'],
    xeduhub_decode_chunk_image: ['CHUNK'], xeduhub_detect_run: ['MODEL'], xeduhub_draw_boxes_image: ['IMAGE', 'BOXES'],
    xeduhub_execute_workflow: ['RESULT'], xeduhub_flow_execute: ['RESULT'], xeduhub_flow_set_input: ['INPUT'],
    xeduhub_get_result_field: ['RESULT', 'FIELD'], xeduhub_http_get: ['URL', 'RESPONSE_VAR'],
    xeduhub_http_iter_chunks: ['STREAM_VAR', 'CHUNK_VAR'], xeduhub_http_loop_stream_frames: ['STREAM_VAR', 'FRAME_VAR'],
    xeduhub_http_open_stream: ['URL', 'STREAM_VAR'], xeduhub_http_send_command: ['BASE_URL', 'CMD', 'STOP_CMD', 'DELAY'],
    xeduhub_input_image: ['INPUT'], xeduhub_k10_gpio_write: ['PIN', 'VALUE'], xeduhub_k10_pwm_write: ['PIN', 'DUTY', 'FREQ'],
    xeduhub_k10_uart_send: ['PORT', 'TEXT'], xeduhub_keypoint_axis: ['POINTS', 'INDEX', 'AXIS'],
    xeduhub_load_image_to_var: ['INPUT', 'IMAGE_VAR'], xeduhub_math_distance: ['X1', 'Y1', 'X2', 'Y2'],
    xeduhub_media_frames_to_video: ['OUTPUT_DIR', 'OUTPUT_VIDEO', 'FPS'], xeduhub_ocr_first_text: ['RESULT'],
    xeduhub_ocr_run: ['MODEL'], xeduhub_polyfit_quadratic: ['X_VALUES', 'Y_VALUES', 'COEFF_VAR'],
    xeduhub_quadratic_eval: ['COEFFS', 'X'], xeduhub_quadratic_fit: ['X_VALUES', 'Y_VALUES'],
    xeduhub_raw_create_workflow: ['TASK'], xeduhub_raw_inference: ['INPUT', 'MODEL'],
    xeduhub_result_first_box: ['RESULT'], xeduhub_run_and_record: ['NOTE'], xeduhub_run_vision: ['TASK', 'MODEL', 'INPUT'],
    xeduhub_servo_setup: ['BOARD', 'PIN', 'SERVO_VAR'], xeduhub_servo_write_angle: ['SERVO_VAR', 'ANGLE'],
    xeduhub_set_input: ['INPUT'], xeduhub_set_input_list: ['INPUTS'], xeduhub_set_input_resource: ['INPUT'],
    xeduhub_set_model: ['MODEL'], xeduhub_show_result: ['TITLE'], xeduhub_show_result_card: ['TITLE', 'RESULT'],
    xeduhub_show_result_image: ['IMAGE'], xeduhub_workflow_create: ['TASK_ID', 'MODEL_VAR'],
    xeduhub_workflow_create_var: ['TASK_ID', 'MODEL_VAR'], xeduhub_workflow_infer: ['MODEL_VAR', 'INPUT_DATA', 'RESULT_VAR', 'PARAMS'],
    xeduhub_workflow_infer_pair: ['MODEL_VAR', 'INPUT_DATA', 'RESULT_VAR', 'IMAGE_VAR', 'BBOX', 'PARAMS'],
    xeduhub_workflow_infer_var: ['MODEL_VAR', 'INPUT_DATA', 'RESULT_VAR', 'BBOX', 'PARAMS'],
    xeduhub_workflow_set_params: ['PARAMS'], xeduhub_workflow_set_task: ['MODEL_VAR', 'TASK_ID'],
});

function numberOrString(value) {
    const text = String(value ?? '').trim();
    if (!text) return '';
    const number = Number(text);
    return Number.isFinite(number) ? number : value;
}

function parseJsonish(value, fallback = value) {
    if (typeof value !== 'string') return value;
    try { return JSON.parse(value); } catch (_) { return fallback; }
}

function canonicalTaskId(taskId) {
    const text = String(taskId || '').trim().toLowerCase();
    return TASKS[text] ? text : TASK_ALIASES[text] || 'cls_imagenet';
}

function buildTaskSpec(taskId, args = {}) {
    const canonical = canonicalTaskId(taskId);
    const task = TASKS[canonical];
    const input = args.IMAGE ?? args.INPUT_DATA ?? args.INPUT ?? args.SOURCE ?? '';
    const params = {};
    const sourceNames = {
        targetClass: 'TARGET_CLASS', minSize: 'MIN_SIZE', maxSize: 'MAX_SIZE',
        scaleFactor: 'SCALE_FACTOR', minNeighbors: 'MIN_NEIGHBORS', bbox: 'BBOX',
        style: 'STYLE', thr: 'THR', mode: 'MODE', prompt: 'PROMPT', img_type: 'IMG_TYPE',
    };
    for (const key of task.params) {
        const raw = args[sourceNames[key]];
        if (raw !== undefined && raw !== '') params[key] = key === 'prompt' || key === 'bbox' ? parseJsonish(raw) : numberOrString(raw);
    }
    if (args.IMG_TYPE) params.img_type = String(args.IMG_TYPE);
    return {task_id: canonical, input, params};
}

function solveLinearSystem(matrix, vector) {
    const n = vector.length;
    const rows = matrix.map((row, index) => [...row, vector[index]]);
    for (let pivot = 0; pivot < n; pivot += 1) {
        let best = pivot;
        for (let row = pivot + 1; row < n; row += 1) {
            if (Math.abs(rows[row][pivot]) > Math.abs(rows[best][pivot])) best = row;
        }
        if (Math.abs(rows[best][pivot]) < 1e-12) return [0, 0, 0];
        [rows[pivot], rows[best]] = [rows[best], rows[pivot]];
        for (let row = pivot + 1; row < n; row += 1) {
            const scale = rows[row][pivot] / rows[pivot][pivot];
            for (let col = pivot; col <= n; col += 1) rows[row][col] -= scale * rows[pivot][col];
        }
    }
    const result = Array(n).fill(0);
    for (let row = n - 1; row >= 0; row -= 1) {
        let value = rows[row][n];
        for (let col = row + 1; col < n; col += 1) value -= rows[row][col] * result[col];
        result[row] = value / rows[row][row];
    }
    return result;
}

function quadraticFit(xValues, yValues) {
    const x = Array.isArray(xValues) ? xValues.map(Number).filter(Number.isFinite) : [];
    const y = Array.isArray(yValues) ? yValues.map(Number).filter(Number.isFinite) : [];
    const count = Math.min(x.length, y.length);
    if (count < 3) return [0, 0, 0];
    const matrix = Array.from({length: 3}, () => Array(3).fill(0));
    const vector = Array(3).fill(0);
    for (let index = 0; index < count; index += 1) {
        const row = [x[index] ** 2, x[index], 1];
        for (let left = 0; left < 3; left += 1) {
            vector[left] += row[left] * y[index];
            for (let right = 0; right < 3; right += 1) matrix[left][right] += row[left] * row[right];
        }
    }
    return solveLinearSystem(matrix, vector).map(value => Math.abs(value - Math.round(value)) < 1e-10 ? Math.round(value) : value);
}

function evaluateMathBlock(kind, args = {}) {
    if (kind === 'distance') return Math.hypot(Number(args.x2) - Number(args.x1), Number(args.y2) - Number(args.y1));
    if (kind === 'quadraticFit') return quadraticFit(args.x, args.y);
    if (kind === 'quadraticEval') {
        const coeffs = Array.isArray(args.coeffs) ? args.coeffs.map(Number) : [0, 0, 0];
        const x = Number(args.x) || 0;
        return (coeffs[0] || 0) * x * x + (coeffs[1] || 0) * x + (coeffs[2] || 0);
    }
    return 0;
}

function summarizeXEduPayload(payload) {
    if (!payload || payload.success === false) return String(payload?.message || 'XEdu 任务失败');
    if (payload.result_summary?.headline) return String(payload.result_summary.headline);
    const fields = payload.result_artifacts?.key_fields;
    if (fields && typeof fields === 'object') {
        const entries = Object.entries(fields).filter(([, value]) => value !== undefined && value !== null && value !== '');
        if (entries.length) return entries.map(([key, value]) => `${key}: ${value}`).join(', ');
    }
    return String(payload.message || 'XEdu 任务完成');
}

function argument(name, defaultValue = '') {
    return {name, type: 'string', defaultValue: String(defaultValue)};
}

function argumentName(param) {
    return String(param).replace(/([a-z])([A-Z])/g, '$1_$2').toUpperCase();
}

function toScratchText(text) {
    return String(text || '').replace(/%([A-Z0-9_]+)%/g, '[$1]');
}

function createXEduBlockDescriptors() {
    const blocks = XEDU_BLOCK_IDS.map(opcode => {
        const taskId = TASK_BLOCKS[opcode];
        const names = ARGUMENTS[opcode] || (taskId ? ['IMAGE', ...TASKS[taskId].params.map(argumentName)] : []);
        const defaults = {IMAGE: 'demo.jpg', INPUT: 'demo.jpg', INPUT_DATA: 'demo.jpg', TASK: 'classification', MODEL: 'resnet18',
            TASK_ID: 'cls_imagenet', TITLE: '运行结果', FIELD: 'result_summary', STYLE: 'mosaic', MODE: 'point', PROMPT: '[100,100]',
            THR: '0.3', FPS: '30', FREQ: '1000', DELAY: '0.3', SIZE: '100'};
        const blockType = BOOLEAN_BLOCKS.has(opcode) ? 'boolean' : REPORTER_BLOCKS.has(opcode) ? 'reporter' : 'command';
        return {
            opcode,
            text: toScratchText(taskId ? `${TASK_LABELS[taskId]}：图像 %IMAGE%${TASKS[taskId].params.map(param => ` ${param} %${argumentName(param)}%`).join('')}` : (TEXTS[opcode] || opcode)),
            blockType,
            arguments: Object.fromEntries(names.map(name => [name, argument(name, defaults[name] ?? '')])),
            color: taskId ? COLORS.task : COLORS.input,
            taskId: taskId || undefined,
        };
    });
    return blocks;
}

function sensingArgument(name, pointMenu = '') {
    const defaults = {TARGET: '全部', INDEX: '1', POINT: '1', X: '100', Y: '100', DISPLAY: 'stage', TRANSPARENCY: '50'};
    const menus = {FIELD: 'objectFields', POSITION: 'positions', AXIS: 'axes', DISPLAY: 'cameraDisplays', ...(pointMenu ? {POINT: pointMenu} : {})};
    return {...argument(name, defaults[name] ?? ''), ...(menus[name] ? {menu: menus[name]} : {})};
}

function createXEduSensingInfo(moduleKey) {
    const definition = SENSING_DEFINITIONS.find(module => module.key === moduleKey);
    if (!definition) throw new Error(`Unknown XEdu sensing module: ${moduleKey}`);
    const pointMenu = moduleKey === 'bodySensing' ? 'bodyPoints' : moduleKey === 'handSensing' ? 'handPoints' : '';
    return {
        id: definition.id,
        name: definition.name,
        color1: definition.color1,
        color2: definition.color2,
        color3: definition.color3,
        iconURI: definition.iconURI,
        blocks: definition.blocks.map(block => block === '---' ? block : {
            opcode: block[0],
            text: block[1],
            blockType: block[2],
            arguments: Object.fromEntries((block[3] || []).map(name => [name, sensingArgument(name, pointMenu)])),
        }),
        menus: {},
    };
}

function createXEduSensingInfos() {
    return SENSING_DEFINITIONS.map(module => createXEduSensingInfo(module.key));
}

function createXEduBlockInfo() {
    const blocks = createXEduBlockDescriptors();
    return {
        id: 'xeduAI', name: 'XEdu AI',
        color1: '#6366F1', color2: '#4F46E5', color3: '#3730A3', iconURI: MODULE_ICONS.ai, blocks,
        menus: {tasks: Object.keys(TASKS).map(taskId => ({text: TASK_LABELS[taskId], value: taskId}))},
    };
}

function createXEduBlockInfoForModule(moduleKey) {
    if (SENSING_DEFINITIONS.some(module => module.key === moduleKey)) return createXEduSensingInfo(moduleKey);
    if (moduleKey === 'camera') return {
        ...CAMERA_DEFINITION,
        blocks: CAMERA_DEFINITION.blocks.map(block => ({
            opcode: block[0], text: block[1], blockType: block[2],
            arguments: Object.fromEntries((block[3] || []).map(name => [name, sensingArgument(name)])),
        })),
    };
    const definition = MODULE_DEFINITIONS.find(module => module.key === moduleKey);
    if (!definition) throw new Error(`Unknown XEdu module: ${moduleKey}`);
    const blocksByOpcode = new Map(createXEduBlockDescriptors().map(block => [block.opcode, block]));
    return {
        id: definition.id,
        name: definition.name,
        color1: definition.color1,
        color2: definition.color2,
        color3: definition.color3,
        iconURI: definition.iconURI,
        blocks: MODULE_BLOCK_GROUPS[moduleKey].map(opcode => ({
            ...blocksByOpcode.get(opcode),
            ...(moduleKey === 'vision' ? {hideFromPalette: true} : {}),
        })),
        menus: {tasks: Object.keys(TASKS).map(taskId => ({text: TASK_LABELS[taskId], value: taskId}))},
    };
}

function createXEduExtensionInfos() {
    return MODULE_DEFINITIONS.map(module => createXEduBlockInfoForModule(module.key));
}

const XEDU_TASK_IDS = Object.freeze(Object.keys(TASKS));
const SENSING_EXTENSION_IDS = Object.freeze(SENSING_DEFINITIONS.map(module => module.id));

module.exports = {
    XEDU_BLOCK_IDS, XEDU_TASK_IDS, TASKS, TASK_BLOCKS, MODULE_BLOCK_GROUPS, MODULE_DEFINITIONS,
    SENSING_DEFINITIONS, SENSING_EXTENSION_IDS, CAMERA_DEFINITION, createXEduBlockInfo, createXEduBlockInfoForModule,
    createXEduExtensionInfos, createXEduSensingInfo, createXEduSensingInfos,
    buildTaskSpec, evaluateMathBlock, summarizeXEduPayload, canonicalTaskId,
};
