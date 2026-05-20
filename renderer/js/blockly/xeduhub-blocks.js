import blocklyColorContract from '../../../config/blockly-colors.json' with { type: 'json' };

const RUN_BLOCK_PREFIX = 'xeduhub_run_';
const TASK_FIELD_NAME = 'TASK_ID';
const PARAMS_FIELD_NAME = 'PARAMS';
const DEFAULT_XEDUHUB_SAMPLE_INPUT = 'courses/blockly-smoke/demo.jpg';
const XEDU_IMAGE_PICKER_REQUEST = 'xedu:select-image-file';
const XEDU_IMAGE_PICKER_RESPONSE = 'xedu:select-image-file:response';
const ADVANCED_PYTHON_BLOCK_TYPES = new Set([
  'xeduhub_workflow_create_var',
  'xeduhub_workflow_infer_var',
  'xeduhub_workflow_infer_pair',
  'xeduhub_cv_open_camera',
  'xeduhub_cv_open_video',
  'xeduhub_cv_loop_frames',
  'xeduhub_cv_show_frame',
  'xeduhub_cv_save_image',
  'xeduhub_cv_draw_boxes',
  'xeduhub_cv_cvt_color',
  'xeduhub_cv_resize_image',
  'xeduhub_cv_crop_image',
  'xeduhub_cv_flip_image',
  'xeduhub_cv_rotate_image',
  'xeduhub_cv_gaussian_blur',
  'xeduhub_cv_canny',
  'xeduhub_cv_threshold',
  'xeduhub_cv_put_text',
  'xeduhub_media_frames_to_video',
  'xeduhub_http_get',
  'xeduhub_http_open_stream',
  'xeduhub_http_loop_stream_frames',
  'xeduhub_http_iter_chunks',
  'xeduhub_http_send_command',
  'xeduhub_chunk_over_size',
  'xeduhub_cv_decode_chunk',
  'xeduhub_servo_setup',
  'xeduhub_servo_write_angle',
  'xeduhub_result_first_box',
  'xeduhub_bbox_center_x',
  'xeduhub_ocr_first_text',
  'xeduhub_keypoint_axis',
  'xeduhub_math_distance',
  'xeduhub_polyfit_quadratic',
  'xeduhub_quadratic_eval',
]);

const XEDU_SEMANTIC_COLOURS = Object.freeze({
  classification: blocklyColorContract.taskFamilies?.classification?.colour || '#5d99d8',
  detection: blocklyColorContract.taskFamilies?.detection?.colour || '#eda94a',
  ocr: blocklyColorContract.taskFamilies?.ocr?.colour || '#48b4a6',
  pose: blocklyColorContract.taskFamilies?.pose?.colour || '#d46ca6',
  generation: blocklyColorContract.taskFamilies?.generation?.colour || '#8d73df',
  segmentation: blocklyColorContract.taskFamilies?.segmentation?.colour || '#50bbd3',
  depth: blocklyColorContract.taskFamilies?.depth?.colour || '#6b82d8',
  panoptic: blocklyColorContract.taskFamilies?.panoptic?.colour || '#8175c0',
  multimodal: blocklyColorContract.taskFamilies?.multimodal?.colour || '#6b92c6',
  workflow: blocklyColorContract.categoryPalette?.['AI流程'] || '#6b70e8',
  input: blocklyColorContract.categoryPalette?.['图像与视频'] || '#6faadb',
  result: blocklyColorContract.categoryPalette?.['结果处理'] || '#33af97',
  video: blocklyColorContract.categoryPalette?.['媒体与设备'] || '#6faadb',
  communication: blocklyColorContract.categoryPalette?.['通信控制'] || '#51ac98',
  math: blocklyColorContract.categoryPalette?.['数学'] || '#6da4d9',
  debug: blocklyColorContract.categoryPalette?.['调试与扩展'] || '#d29a57',
});

const BLOCK_COLOUR_REMAP = Object.freeze({
  '#5A8DEE': XEDU_SEMANTIC_COLOURS.input,
  '#5F7FD7': XEDU_SEMANTIC_COLOURS.input,
  '#3F76CF': XEDU_SEMANTIC_COLOURS.input,
  '#F29C7A': XEDU_SEMANTIC_COLOURS.detection,
  '#D39A63': XEDU_SEMANTIC_COLOURS.detection,
  '#E79A5B': XEDU_SEMANTIC_COLOURS.detection,
  '#4DB6AC': XEDU_SEMANTIC_COLOURS.ocr,
  '#4FA79A': XEDU_SEMANTIC_COLOURS.ocr,
  '#2BAA9A': XEDU_SEMANTIC_COLOURS.ocr,
  '#A596C9': XEDU_SEMANTIC_COLOURS.workflow,
  '#8A7BC0': XEDU_SEMANTIC_COLOURS.workflow,
  '#8E7FD0': XEDU_SEMANTIC_COLOURS.workflow,
  '#8FA4F0': XEDU_SEMANTIC_COLOURS.depth,
  '#8798DC': XEDU_SEMANTIC_COLOURS.depth,
  '#6E9FD7': XEDU_SEMANTIC_COLOURS.multimodal,
  '#2D9C8F': XEDU_SEMANTIC_COLOURS.video,
  '#47A094': XEDU_SEMANTIC_COLOURS.video,
  '#E38B54': XEDU_SEMANTIC_COLOURS.communication,
  '#C98958': XEDU_SEMANTIC_COLOURS.communication,
  '#D88B46': XEDU_SEMANTIC_COLOURS.communication,
  '#56C7B7': XEDU_SEMANTIC_COLOURS.math,
  '#C89162': XEDU_SEMANTIC_COLOURS.pose,
  '#6AA283': XEDU_SEMANTIC_COLOURS.result,
  '#4F7CFF': XEDU_SEMANTIC_COLOURS.classification,
  '#F59B42': XEDU_SEMANTIC_COLOURS.detection,
  '#F06F7F': XEDU_SEMANTIC_COLOURS.pose,
  '#18B898': XEDU_SEMANTIC_COLOURS.ocr,
});

const TASK_SHORT_LABELS = {
  cls_imagenet: '看图分类',
  det_body: '找人体',
  det_body_l: '找人体+',
  det_face: '找人脸',
  det_hand: '找手部',
  det_coco: '找物体',
  det_coco_l: '找物体+',
  pose_body17: '看动作',
  pose_body17_l: '看动作+',
  pose_body26: '看动作26',
  pose_face106: '看脸点',
  pose_hand21: '看手势',
  pose_wholebody133: '看全身点',
  ocr: '读文字',
  gen_style: '换风格',
  gen_color: '图像上色',
  drive_perception: '驾驶感知',
  embedding_image: '图像特征',
  embedding_text: '文本特征',
  embedding_audio: '音频特征',
  segment_anything: '圈区域',
  depth_anything: '看远近',
};

const PARAM_SHORT_LABELS = {
  阈值: '灵敏度',
  目标类: '目标',
  最小尺寸: '最小',
  最大尺寸: '最大',
  缩放比: '缩放',
  邻域数: '邻域',
  检测框: '范围',
  风格: '风格',
  模式: '方式',
  提示: '提示点',
};

const SEMANTIC_PARAM_INLINE_TASK_IDS = new Set([
  // Keep semantic quick blocks classroom-first by default.
  // Advanced params can still be used through workflow/core syntax blocks.
]);

const TASK_FAMILY_SHORT_LABELS = {
  classification: '分类',
  detection: '检测',
  pose: '关键点',
  ocr: '文字',
  generation: '生成',
  segmentation: '分割',
  depth: '深度',
  multimodal: '特征',
  panoptic: '感知',
};

const FRONTEND_RUNTIME_TASK_ID_MAP = Object.freeze({
  det_body: 'bodydetect',
  det_body_l: 'bodydetect',
  det_coco: 'cocodetect',
  det_coco_l: 'cocodetect',
  pose_body17: 'body17',
  pose_body17_l: 'body17',
  pose_body26: 'body26',
  pose_face106: 'face106',
  pose_hand21: 'hand21',
  pose_wholebody133: 'wholebody133',
});

const FRONTEND_SMOKE_CHECKPOINT_MAP = Object.freeze({
  bodydetect: 'bodydetect.onnx',
  cocodetect: 'cocodetect.onnx',
  body17: 'body17.onnx',
  body26: 'body26.onnx',
  wholebody133: 'whole133.onnx',
  face106: 'face106.onnx',
  hand21: 'hand21.onnx',
});

const HIDDEN_TASK_FALLBACKS = Object.freeze({
  det_body_l: 'det_body',
  det_coco_l: 'det_coco',
  pose_body17_l: 'pose_body17',
  pose_body26: 'pose_body17',
  pose_wholebody133: 'pose_body17',
});

const TASK_VISIBLE_PARAM_KEYS = {
  cls_imagenet: [],
  det_body: [],
  det_body_l: [],
  det_face: ['minSize', 'maxSize', 'scaleFactor', 'minNeighbors'],
  det_hand: [],
  det_coco: ['target_class'],
  det_coco_l: ['target_class'],
  pose_body17: ['bbox'],
  pose_body17_l: ['bbox'],
  pose_body26: ['bbox'],
  pose_face106: ['bbox'],
  pose_hand21: ['bbox'],
  pose_wholebody133: ['bbox'],
  ocr: [],
  gen_style: ['style'],
  gen_color: [],
  drive_perception: ['thr'],
  segment_anything: ['mode', 'prompt'],
  depth_anything: [],
};

function svgToDataUri(svg) {
  try {
    const encoded = btoa(unescape(encodeURIComponent(svg)));
    return `data:image/svg+xml;base64,${encoded}`;
  } catch (_) {
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  }
}

const BADGE_GLYPHS = Object.freeze({
  input: '<rect x="6.2" y="7" width="11.6" height="10" rx="2.4" stroke="#F8FCFF" stroke-width="1.55"/><path d="m8.4 13.7 2.7-2.9 2.1 2.1 3-3.2" stroke="#F8FCFF" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round"/><circle cx="9.6" cy="10.1" r=".95" fill="#F8FCFF"/>',
  result: '<path d="M8 12.6h2.5l1.4-1.8 2.2 3.2" stroke="#F8FCFF" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round"/><path d="M7.7 9h6.6M7.7 15h8.1" stroke="#8FD3FF" stroke-width="1.15" stroke-linecap="round"/>',
  resultImage: '<rect x="6.1" y="6.6" width="11.8" height="10.8" rx="2.4" stroke="#F8FCFF" stroke-width="1.55"/><path d="m8.5 14.4 2.4-2.5 1.9 1.9 2.8-3" stroke="#F8FCFF" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round"/><circle cx="9.8" cy="9.8" r=".95" fill="#F8FCFF"/>',
  note: '<path d="M7.3 7.5h9.4a2 2 0 0 1 2 2v4.8a2 2 0 0 1-2 2h-4.5L9.4 18.3v-2H7.3a2 2 0 0 1-2-2V9.5a2 2 0 0 1 2-2Z" stroke="#FCF8FF" stroke-width="1.5" stroke-linejoin="round"/><path d="M8.8 10.5h6.1M8.8 13h3.9" stroke="#FCF8FF" stroke-width="1.45" stroke-linecap="round"/>',
  clear: '<path d="M7.5 8.1h9M9.7 8.1V6.9a1 1 0 0 1 1-1h2.6a1 1 0 0 1 1 1v1.2m-4.8 0 .7 7.7a1.2 1.2 0 0 0 1.2 1.1h2.4a1.2 1.2 0 0 0 1.2-1.1l.7-7.7" stroke="#FFF8F6" stroke-width="1.45" stroke-linecap="round" stroke-linejoin="round"/><path d="m9.4 10 5.2 5.2" stroke="#FFB39A" stroke-width="1.05" stroke-linecap="round" opacity=".95"/>',
  workflow: '<rect x="6.1" y="6.1" width="4.3" height="4.3" rx="1.05" stroke="#FBF7FF" stroke-width="1.45"/><rect x="13.6" y="6.1" width="4.3" height="4.3" rx="1.05" stroke="#FBF7FF" stroke-width="1.45"/><rect x="9.85" y="13.6" width="4.3" height="4.3" rx="1.05" stroke="#FBF7FF" stroke-width="1.45"/><path d="M10.8 8.25h2.4M12 10.45v2.2" stroke="#FBF7FF" stroke-width="1.45" stroke-linecap="round"/>',
  debug: '<path d="M9.2 6h5.6M10.1 18h3.8M6.1 10.4h1.3M16.6 10.4h1.3" stroke="#F9F8FF" stroke-width="1.45" stroke-linecap="round"/><rect x="7.2" y="7.6" width="9.6" height="8.2" rx="2.1" stroke="#F9F8FF" stroke-width="1.45"/><circle cx="12" cy="11.7" r=".9" fill="#C3B5FF"/>',
  camera: '<rect x="5.9" y="8" width="8.8" height="7.4" rx="1.9" stroke="#F4FFFD" stroke-width="1.45"/><path d="M14.7 10.2 18 8.8v5.8l-3.3-1.4" stroke="#F4FFFD" stroke-width="1.45" stroke-linecap="round" stroke-linejoin="round"/><circle cx="10.3" cy="11.7" r="1.7" stroke="#F4FFFD" stroke-width="1.35"/>',
  video: '<rect x="5.8" y="7.4" width="12.4" height="8.4" rx="2.1" stroke="#F4FFFD" stroke-width="1.45"/><path d="m10.2 9.6 3.7 2-3.7 2V9.6Z" stroke="#F4FFFD" stroke-width="1.45" stroke-linejoin="round"/>',
  http: '<rect x="6.2" y="6.5" width="11.6" height="11" rx="2.5" stroke="#FFFBEF" stroke-width="1.45"/><path d="M8.8 9.7h6.4M8.8 12h4.6M8.8 14.3h6.4" stroke="#FFFBEF" stroke-width="1.45" stroke-linecap="round"/>',
  device: '<rect x="7.1" y="7.1" width="9.8" height="9.8" rx="2.3" stroke="#FFFBEF" stroke-width="1.45"/><path d="M9.4 5.9v1.2M14.6 5.9v1.2M9.4 16.9v1.2M14.6 16.9v1.2M5.9 9.4h1.2M16.9 9.4h1.2M5.9 14.6h1.2M16.9 14.6h1.2" stroke="#FFFBEF" stroke-width="1.3" stroke-linecap="round"/><circle cx="12" cy="12" r="1.05" fill="#FFC978"/>',
  math: '<path d="M8.4 8.7h3.2M10 7.1v3.2M8.4 14.9h3.2M14.2 8.2l2.2 2.2M16.4 8.2 14.2 10.4M14.3 14.9h2.6" stroke="#F0FEFC" stroke-width="1.45" stroke-linecap="round"/>',
  save: '<path d="M7.2 6.7h7.8l1.9 2v8.6a1.65 1.65 0 0 1-1.65 1.65H8.85A1.65 1.65 0 0 1 7.2 17.3V6.7Z" stroke="#F4FFFD" stroke-width="1.45" stroke-linejoin="round"/><path d="M9.2 7v3h4.5V7M9.7 14.5h4.5" stroke="#F4FFFD" stroke-width="1.35" stroke-linecap="round"/>',
  classification: '<path d="M8.5 12.2 10.6 14.3 15 9.9" stroke="#F8FCFF" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"/><path d="M7.5 8.6h2.1M14.6 8.6h1.2" stroke="#8FD3FF" stroke-width="1.05" stroke-linecap="round"/>',
  detection: '<rect x="7.2" y="7.2" width="9.6" height="9.6" rx="2.1" stroke="#FFFBEF" stroke-width="1.35" opacity="0.55"/><rect x="9.2" y="9.2" width="5.6" height="5.6" rx="1.25" stroke="#FFFBEF" stroke-width="1.55"/><path d="M12 7.8v1M12 15.2v1M7.8 12h1M15.2 12h1" stroke="#FFC978" stroke-width="1.05" stroke-linecap="round"/>',
  ocr: '<path d="M7.4 8.8h6.1M7.4 11.9h4.3M7.4 15h6.1" stroke="#F4FFFD" stroke-width="1.45" stroke-linecap="round"/><rect x="14.1" y="8.2" width="2.6" height="7.4" rx="1.1" stroke="#F4FFFD" stroke-width="1.35"/>',
  pose: '<circle cx="12" cy="7.2" r="1.2" fill="#FFF6F2"/><circle cx="8.8" cy="10.4" r=".9" fill="#FFF6F2"/><circle cx="15.2" cy="10.4" r=".9" fill="#FFF6F2"/><path d="M12 8.8v3.8M12 9.7 9.5 10.6M12 9.7l2.5.9M12 12.6l-1.7 1.9M12 12.6l1.7 1.9" stroke="#FFF6F2" stroke-width="1.45" stroke-linecap="round" stroke-linejoin="round"/>',
  generation: '<path d="M12 6.4 13.4 9.3l3.2.4-2.4 2 .7 3.1-2.9-1.6-2.9 1.6.7-3.1-2.4-2 3.2-.4L12 6.4Z" stroke="#FBF7FF" stroke-width="1.35" stroke-linejoin="round"/>',
  segmentation: '<rect x="6.8" y="6.8" width="10.4" height="10.4" rx="2.2" stroke="#F0FEFC" stroke-width="1.45"/><path d="M9.4 9.6c1.1.2 1.9 1.1 2 2.2.1.9-.3 1.7-1 2.2m4-4.4c-1.1.2-1.9 1.1-2 2.2-.1.9.3 1.7 1 2.2" stroke="#F0FEFC" stroke-width="1.35" stroke-linecap="round"/>',
  depth: '<path d="M7.1 8.2 12 5.7l4.9 2.5v6.4L12 17l-4.9-2.4V8.2Z" stroke="#F7F5FF" stroke-width="1.45" stroke-linejoin="round"/><path d="M12 5.8v11.1" stroke="#F7F5FF" stroke-width="1.35" stroke-linecap="round"/>',
  default: '<path d="M12 6 16.6 8.4v5.2L12 16l-4.6-2.4V8.4L12 6Z" stroke="#F8FCFF" stroke-width="1.45" stroke-linejoin="round"/>',
});

const BADGE_PALETTES = Object.freeze({
  default: {
    surfaceTop: '#1e293b',
    surfaceBottom: '#3b82f6',
    accent: '#bfdbfe',
    accentSoft: '#F5F8FC',
    glow: '#60a5fa',
    rim: '#dbeafe',
  },
  ocean: {
    surfaceTop: '#1e3a8a',
    surfaceBottom: '#3b82f6',
    accent: '#bfdbfe',
    accentSoft: '#F5F8FC',
    glow: '#60a5fa',
    rim: '#dbeafe',
  },
  teal: {
    surfaceTop: '#134e4a',
    surfaceBottom: '#14b8a6',
    accent: '#99f6e4',
    accentSoft: '#F4FBFA',
    glow: '#5eead4',
    rim: '#ccfbf1',
  },
  amber: {
    surfaceTop: '#78350f',
    surfaceBottom: '#f59e0b',
    accent: '#fde68a',
    accentSoft: '#FCF8F2',
    glow: '#fbbf24',
    rim: '#fef3c7',
  },
  violet: {
    surfaceTop: '#312e81',
    surfaceBottom: '#8b5cf6',
    accent: '#ddd6fe',
    accentSoft: '#FAF8FD',
    glow: '#a78bfa',
    rim: '#ede9fe',
  },
  coral: {
    surfaceTop: '#831843',
    surfaceBottom: '#ec4899',
    accent: '#fbcfe8',
    accentSoft: '#FCF8F6',
    glow: '#f472b6',
    rim: '#fce7f3',
  },
  plum: {
    surfaceTop: '#3730a3',
    surfaceBottom: '#6366f1',
    accent: '#c7d2fe',
    accentSoft: '#F8F7FB',
    glow: '#818cf8',
    rim: '#e0e7ff',
  },
  mint: {
    surfaceTop: '#164e63',
    surfaceBottom: '#06b6d4',
    accent: '#a5f3fc',
    accentSoft: '#F4FBFB',
    glow: '#22d3ee',
    rim: '#cffafe',
  },
  green: {
    surfaceTop: '#065f46',
    surfaceBottom: '#10b981',
    accent: '#a7f3d0',
    accentSoft: '#f0fdf4',
    glow: '#34d399',
    rim: '#d1fae5',
  },
  sky: {
    surfaceTop: '#075985',
    surfaceBottom: '#0ea5e9',
    accent: '#bae6fd',
    accentSoft: '#f0f9ff',
    glow: '#38bdf8',
    rim: '#e0f2fe',
  },
  orange: {
    surfaceTop: '#7c2d12',
    surfaceBottom: '#f97316',
    accent: '#fed7aa',
    accentSoft: '#fff7ed',
    glow: '#fb923c',
    rim: '#ffedd5',
  },
});

const BADGE_PALETTE_BY_ICON = Object.freeze({
  input: 'ocean',
  result: 'green',
  resultImage: 'green',
  note: 'violet',
  clear: 'coral',
  workflow: 'violet',
  debug: 'plum',
  camera: 'sky',
  video: 'sky',
  http: 'orange',
  device: 'orange',
  math: 'mint',
  save: 'sky',
  classification: 'ocean',
  detection: 'amber',
  ocr: 'teal',
  pose: 'coral',
  generation: 'violet',
  segmentation: 'mint',
  depth: 'plum',
  default: 'default',
});

const BLOCK_ICON_URIS = {
  input: svgToDataUri('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"><rect x="4" y="5" width="16" height="14" rx="3" stroke="%23fff" stroke-width="1.8"/><path d="m7.5 14.5 3.4-3.6 2.8 2.8 2.8-3.2" stroke="%23fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><circle cx="8.4" cy="9" r="1.2" fill="%23fff"/></svg>'),
  result: svgToDataUri('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"><rect x="4.4" y="5" width="15.2" height="14" rx="3" stroke="%23fff" stroke-width="1.8"/><path d="M7.7 12.2h3.1l1.7-2.2 2.9 4" stroke="%23fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>'),
  resultImage: svgToDataUri('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"><rect x="4.2" y="5" width="15.6" height="14" rx="3" stroke="%23fff" stroke-width="1.8"/><path d="m7.5 15.2 3.1-3.3 2.3 2.3 3.6-4.1" stroke="%23fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><circle cx="8.8" cy="9.2" r="1.1" fill="%23fff"/></svg>'),
  note: svgToDataUri('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"><path d="M7 5.5h10a2 2 0 0 1 2 2v9.2a2 2 0 0 1-2 2H9.2L5 23v-5.3a2 2 0 0 1-2-2V7.5a2 2 0 0 1 2-2Z" stroke="%23fff" stroke-width="1.8" stroke-linejoin="round"/><path d="M8.4 10h7.2M8.4 13.3h4.5" stroke="%23fff" stroke-width="1.8" stroke-linecap="round"/></svg>'),
  clear: svgToDataUri('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"><path d="M6 7h12M9.2 7V5.4a1.4 1.4 0 0 1 1.4-1.4h2.8a1.4 1.4 0 0 1 1.4 1.4V7m-7.6 0 .8 11a1.6 1.6 0 0 0 1.6 1.5h4.8a1.6 1.6 0 0 0 1.6-1.5l.8-11" stroke="%23fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>'),
  workflow: svgToDataUri('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"><rect x="4.5" y="5.2" width="5.3" height="5.3" rx="1.5" stroke="%23fff" stroke-width="1.7"/><rect x="14.2" y="5.2" width="5.3" height="5.3" rx="1.5" stroke="%23fff" stroke-width="1.7"/><rect x="9.4" y="13.5" width="5.3" height="5.3" rx="1.5" stroke="%23fff" stroke-width="1.7"/><path d="M9.8 7.9h4.1M12 10.6v2.8" stroke="%23fff" stroke-width="1.7" stroke-linecap="round"/></svg>'),
  debug: svgToDataUri('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"><path d="M9 5.5h6M10.2 4h3.6v2.3h-3.6ZM8 8.2h8l1.4 2.5v4.2A4.4 4.4 0 0 1 13 19.3h-2A4.4 4.4 0 0 1 6.6 15v-4.2L8 8.2Z" stroke="%23fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M4.5 10.2h2M17.5 10.2h2M4.5 14.2h2M17.5 14.2h2" stroke="%23fff" stroke-width="1.8" stroke-linecap="round"/></svg>'),
  camera: svgToDataUri('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"><rect x="4.6" y="7.2" width="12.2" height="9.6" rx="2.1" stroke="%23fff" stroke-width="1.8"/><path d="M16.8 10.2 20 8.5v7l-3.2-1.7" stroke="%23fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><circle cx="10.7" cy="12" r="2.2" stroke="%23fff" stroke-width="1.6"/></svg>'),
  video: svgToDataUri('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"><path d="M6 6.5h12a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2Z" stroke="%23fff" stroke-width="1.8"/><path d="m10 9 4 3-4 3V9Z" stroke="%23fff" stroke-width="1.8" stroke-linejoin="round"/><path d="M7.2 19.2h9.6" stroke="%23fff" stroke-width="1.6" stroke-linecap="round"/></svg>'),
  http: svgToDataUri('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"><rect x="4.8" y="5" width="14.4" height="14" rx="3" stroke="%23fff" stroke-width="1.8"/><path d="M8 9.4h8M8 12h5.4M8 14.6h8" stroke="%23fff" stroke-width="1.7" stroke-linecap="round"/><path d="M15.7 5.6v3.3M17.4 7.2h-3.3" stroke="%23fff" stroke-width="1.5" stroke-linecap="round"/></svg>'),
  device: svgToDataUri('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"><rect x="6.2" y="7.1" width="11.6" height="9.8" rx="2.2" stroke="%23fff" stroke-width="1.8"/><path d="M9 19.3v-2.4M15 19.3v-2.4M4.8 10.1h1.4M17.8 10.1h1.4M4.8 13.9h1.4M17.8 13.9h1.4" stroke="%23fff" stroke-width="1.6" stroke-linecap="round"/><circle cx="12" cy="12" r="1.4" fill="%23fff"/></svg>'),
  math: svgToDataUri('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"><path d="M7.3 8.2h4.8M9.7 5.8v4.8M14.7 7h3.4M14.7 11h3.4M7.5 16.8l3.5-3.5M11 16.8l-3.5-3.5" stroke="%23fff" stroke-width="1.8" stroke-linecap="round"/></svg>'),
  save: svgToDataUri('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"><path d="M6 5.5h9.7L19 8.8v9.7a1.9 1.9 0 0 1-1.9 1.9H6.9A1.9 1.9 0 0 1 5 18.5V7.4A1.9 1.9 0 0 1 6.9 5.5Z" stroke="%23fff" stroke-width="1.8" stroke-linejoin="round"/><path d="M8.2 5.8v4.4h6.2V5.8M8.8 15.5h6.4" stroke="%23fff" stroke-width="1.6" stroke-linecap="round"/></svg>'),
  classification: svgToDataUri('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"><rect x="4.8" y="5" width="14.4" height="14" rx="3" stroke="%23fff" stroke-width="1.8"/><path d="m8.2 12.8 2.2 2.2 5-5" stroke="%23fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>'),
  detection: svgToDataUri('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"><rect x="5.5" y="5.5" width="13" height="13" rx="2.6" stroke="%23fff" stroke-width="1.8" opacity=".45"/><rect x="8.4" y="8.4" width="7.2" height="7.2" rx="1.6" stroke="%23fff" stroke-width="1.8"/></svg>'),
  ocr: svgToDataUri('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"><path d="M6.5 8.5h11M6.5 12h7.2M6.5 15.5h11" stroke="%23fff" stroke-width="1.8" stroke-linecap="round"/><path d="M16.2 8.8h1.8a2.2 2.2 0 1 1 0 4.4h-1.8m0-4.4v4.4m0 0 2.1 2.3" stroke="%23fff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>'),
  pose: svgToDataUri('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="6.8" r="1.6" fill="%23fff"/><circle cx="8.4" cy="10.6" r="1.2" fill="%23fff"/><circle cx="15.6" cy="10.6" r="1.2" fill="%23fff"/><circle cx="9.6" cy="16.4" r="1.2" fill="%23fff"/><circle cx="14.4" cy="16.4" r="1.2" fill="%23fff"/><path d="M12 8.4v5M12 9.4 9.1 10.7M12 9.4l2.9 1.3M12 13.4l-1.9 2.2M12 13.4l1.9 2.2" stroke="%23fff" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>'),
  generation: svgToDataUri('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"><path d="M12 4.5 13.7 9l4.8 1-3.5 2.8.9 4.7-4-2.3-4 2.3.9-4.7L5.3 10l4.8-1L12 4.5Z" stroke="%23fff" stroke-width="1.7" stroke-linejoin="round"/><path d="M12 8.2v3.2" stroke="%23fff" stroke-width="1.7" stroke-linecap="round"/></svg>'),
  segmentation: svgToDataUri('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"><path d="M6 7.4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8.8a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V7.4Z" stroke="%23fff" stroke-width="1.8"/><path d="M9 8.8c1.5.2 2.8 1.5 2.9 3.1.1 1.2-.4 2.2-1.3 2.9m4.4-6c-1.5.2-2.8 1.5-2.9 3.1-.1 1.2.4 2.2 1.3 2.9" stroke="%23fff" stroke-width="1.7" stroke-linecap="round"/></svg>'),
  depth: svgToDataUri('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"><path d="M6 8.1 12 5l6 3.1v7.8L12 19l-6-3.1V8.1Z" stroke="%23fff" stroke-width="1.8" stroke-linejoin="round"/><path d="M12 5v14M6 8.1l6 3.6 6-3.6" stroke="%23fff" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>'),
  multimodal: svgToDataUri('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"><rect x="5" y="5.2" width="5" height="5" rx="1.3" stroke="%23fff" stroke-width="1.7"/><rect x="14" y="5.2" width="5" height="5" rx="1.3" stroke="%23fff" stroke-width="1.7"/><rect x="9.5" y="13.8" width="5" height="5" rx="1.3" stroke="%23fff" stroke-width="1.7"/><path d="M10 9.3h4M12 10v3.1" stroke="%23fff" stroke-width="1.7" stroke-linecap="round"/></svg>'),
  panoptic: svgToDataUri('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"><path d="M6.5 15.5c1.5-2.4 3.4-3.6 5.5-3.6s4 1.2 5.5 3.6" stroke="%23fff" stroke-width="1.8" stroke-linecap="round"/><path d="M7.2 14V9.3a2 2 0 0 1 2-2h5.6a2 2 0 0 1 2 2V14" stroke="%23fff" stroke-width="1.8" stroke-linecap="round"/><circle cx="8.8" cy="16.4" r="1.1" fill="%23fff"/><circle cx="15.2" cy="16.4" r="1.1" fill="%23fff"/></svg>'),
  default: svgToDataUri('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"><path d="M12 5.2 18 8.5v7L12 18.8 6 15.5v-7L12 5.2Z" stroke="%23fff" stroke-width="1.8" stroke-linejoin="round"/></svg>'),
};

const TASK_ICON_OVERRIDES = {
  cls_imagenet: svgToDataUri('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"><rect x="4.8" y="5" width="14.4" height="14" rx="3" stroke="%23fff" stroke-width="1.8"/><path d="m8.1 14.7 2.4-2.6 2 2 3.3-3.5" stroke="%23fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><circle cx="9" cy="9" r="1.1" fill="%23fff"/></svg>'),
  det_body: svgToDataUri('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8.1" r="1.5" fill="%23fff"/><path d="M12 10.2v5.1M9.4 12.1 12 10.9l2.6 1.2M10.3 17.2l1.7-1.9 1.7 1.9" stroke="%23fff" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><rect x="5.3" y="5.3" width="13.4" height="13.4" rx="2.8" stroke="%23fff" stroke-width="1.5" opacity=".42"/></svg>'),
  det_body_l: svgToDataUri('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8.1" r="1.5" fill="%23fff"/><path d="M12 10.2v5.1M9.4 12.1 12 10.9l2.6 1.2M10.3 17.2l1.7-1.9 1.7 1.9" stroke="%23fff" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><path d="M16.8 6.3v4.4M19 8.5h-4.4" stroke="%23fff" stroke-width="1.6" stroke-linecap="round"/><rect x="5.3" y="5.3" width="13.4" height="13.4" rx="2.8" stroke="%23fff" stroke-width="1.5" opacity=".38"/></svg>'),
  det_face: svgToDataUri('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"><path d="M12 5.7c2.7 0 4.9 2.3 4.9 5.1v1.8c0 3.2-2.2 5.7-4.9 5.7s-4.9-2.5-4.9-5.7v-1.8c0-2.8 2.2-5.1 4.9-5.1Z" stroke="%23fff" stroke-width="1.8"/><circle cx="10.1" cy="11.4" r="1" fill="%23fff"/><circle cx="13.9" cy="11.4" r="1" fill="%23fff"/><path d="M10.3 14.8c.6.5 1.1.7 1.7.7s1.1-.2 1.7-.7" stroke="%23fff" stroke-width="1.6" stroke-linecap="round"/></svg>'),
  det_hand: svgToDataUri('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"><path d="M8.2 12.3V8.6a1 1 0 1 1 2 0v2.8m0 .9V7.8a1 1 0 1 1 2 0v4.5m0-.2V8.7a1 1 0 1 1 2 0v4.4m0 0v-2a1 1 0 1 1 2 0v4.2c0 2-1.5 3.7-3.5 3.7h-1.4c-2.8 0-5.1-2.2-5.1-5v-1.7a1 1 0 1 1 2 0Z" stroke="%23fff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>'),
  det_coco: svgToDataUri('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"><rect x="5" y="5" width="6" height="6" rx="1.7" stroke="%23fff" stroke-width="1.7"/><rect x="13" y="5" width="6" height="6" rx="1.7" stroke="%23fff" stroke-width="1.7"/><rect x="9" y="13" width="6" height="6" rx="1.7" stroke="%23fff" stroke-width="1.7"/><path d="M11 8h2M12 11v2" stroke="%23fff" stroke-width="1.6" stroke-linecap="round"/></svg>'),
  det_coco_l: svgToDataUri('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"><rect x="5" y="5" width="6" height="6" rx="1.7" stroke="%23fff" stroke-width="1.7"/><rect x="13" y="5" width="6" height="6" rx="1.7" stroke="%23fff" stroke-width="1.7"/><rect x="9" y="13" width="6" height="6" rx="1.7" stroke="%23fff" stroke-width="1.7"/><path d="M17.5 13.5v4M19.5 15.5h-4" stroke="%23fff" stroke-width="1.6" stroke-linecap="round"/></svg>'),
  pose_body17: svgToDataUri('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="6.8" r="1.5" fill="%23fff"/><circle cx="8.3" cy="10.7" r="1.1" fill="%23fff"/><circle cx="15.7" cy="10.7" r="1.1" fill="%23fff"/><circle cx="9.6" cy="16.2" r="1.1" fill="%23fff"/><circle cx="14.4" cy="16.2" r="1.1" fill="%23fff"/><path d="M12 8.5v4.7M12 9.6 9.2 10.7M12 9.6l2.8 1.1M12 13.2l-1.8 2.1M12 13.2l1.8 2.1" stroke="%23fff" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>'),
  pose_body17_l: svgToDataUri('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="6.8" r="1.5" fill="%23fff"/><circle cx="8.3" cy="10.7" r="1.1" fill="%23fff"/><circle cx="15.7" cy="10.7" r="1.1" fill="%23fff"/><circle cx="9.6" cy="16.2" r="1.1" fill="%23fff"/><circle cx="14.4" cy="16.2" r="1.1" fill="%23fff"/><path d="M12 8.5v4.7M12 9.6 9.2 10.7M12 9.6l2.8 1.1M12 13.2l-1.8 2.1M12 13.2l1.8 2.1" stroke="%23fff" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><path d="M17.2 6.2v4M19.2 8.2h-4" stroke="%23fff" stroke-width="1.5" stroke-linecap="round"/></svg>'),
  pose_body26: svgToDataUri('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="6.8" r="1.5" fill="%23fff"/><circle cx="7.9" cy="10.6" r="1.1" fill="%23fff"/><circle cx="16.1" cy="10.6" r="1.1" fill="%23fff"/><circle cx="9.2" cy="14.1" r="1" fill="%23fff"/><circle cx="14.8" cy="14.1" r="1" fill="%23fff"/><circle cx="8.8" cy="17.5" r="1" fill="%23fff"/><circle cx="15.2" cy="17.5" r="1" fill="%23fff"/><path d="M12 8.5v4.3M12 9.5 9.1 10.6M12 9.5l2.9 1.1M12 12.8l-2 2M12 12.8l2 2" stroke="%23fff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>'),
  pose_face106: svgToDataUri('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"><path d="M12 5.8c2.9 0 5 2.3 5 5.2v1.6c0 3.3-2.3 5.7-5 5.7s-5-2.4-5-5.7V11c0-2.9 2.1-5.2 5-5.2Z" stroke="%23fff" stroke-width="1.8"/><circle cx="10.1" cy="11.2" r=".9" fill="%23fff"/><circle cx="13.9" cy="11.2" r=".9" fill="%23fff"/><circle cx="12" cy="13.2" r=".8" fill="%23fff"/><path d="M10.1 15.2c.6.4 1.2.6 1.9.6s1.3-.2 1.9-.6" stroke="%23fff" stroke-width="1.5" stroke-linecap="round"/></svg>'),
  pose_hand21: svgToDataUri('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"><path d="M8.3 12.4V8.8a.9.9 0 1 1 1.8 0v2.7m0 .8V7.6a.9.9 0 1 1 1.8 0v4.7m0-.2V8.4a.9.9 0 1 1 1.8 0v4.6m0 .1v-2a.9.9 0 1 1 1.8 0v4c0 2-1.5 3.6-3.4 3.6h-1.3c-2.7 0-4.9-2.1-4.9-4.8v-1.5a.9.9 0 1 1 1.8 0Z" stroke="%23fff" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round"/><circle cx="8.3" cy="8" r=".8" fill="%23fff"/><circle cx="10.1" cy="6.9" r=".8" fill="%23fff"/><circle cx="11.9" cy="6.4" r=".8" fill="%23fff"/><circle cx="13.7" cy="7.2" r=".8" fill="%23fff"/></svg>'),
  pose_wholebody133: svgToDataUri('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="5.9" r="1.4" fill="%23fff"/><circle cx="9.1" cy="8.9" r=".9" fill="%23fff"/><circle cx="14.9" cy="8.9" r=".9" fill="%23fff"/><circle cx="8.4" cy="12.8" r=".9" fill="%23fff"/><circle cx="15.6" cy="12.8" r=".9" fill="%23fff"/><circle cx="9.6" cy="17.4" r=".9" fill="%23fff"/><circle cx="14.4" cy="17.4" r=".9" fill="%23fff"/><path d="M12 7.4v7.1M12 8.5 9.6 9.4M12 8.5l2.4.9M12 11.6l-2.1 2.6M12 11.6l2.1 2.6M12 14.4l-1.7 2.1M12 14.4l1.7 2.1" stroke="%23fff" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round"/></svg>'),
  ocr: svgToDataUri('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"><path d="M6.4 8.2h7.7M6.4 12h5.4M6.4 15.8h8.8" stroke="%23fff" stroke-width="1.8" stroke-linecap="round"/><rect x="14.7" y="7.2" width="3.9" height="9.6" rx="1.6" stroke="%23fff" stroke-width="1.6"/><path d="M15.9 12h1.5" stroke="%23fff" stroke-width="1.6" stroke-linecap="round"/></svg>'),
  gen_style: svgToDataUri('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"><path d="M12 4.7c3.6 0 6.5 2.8 6.5 6.2 0 5-5.2 8.4-8.5 8.4-1.9 0-3.2-1-3.2-2.6 0-1.4 1-2.3 2.5-2.3h1.3c1 0 1.7-.7 1.7-1.6 0-.7-.5-1.3-1.2-1.6l-1-.4A3.8 3.8 0 0 1 7.7 7c0-1.3 1.1-2.3 2.5-2.3H12Z" stroke="%23fff" stroke-width="1.7"/><circle cx="9.1" cy="8.4" r=".9" fill="%23fff"/><circle cx="12.1" cy="7.7" r=".9" fill="%23fff"/><circle cx="14.9" cy="9.2" r=".9" fill="%23fff"/></svg>'),
  gen_color: svgToDataUri('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"><path d="M12 5.3c2.6 3 5 5.6 5 8.3a5 5 0 1 1-10 0c0-2.7 2.4-5.3 5-8.3Z" stroke="%23fff" stroke-width="1.7"/><path d="M12 7.5c1.4 1.8 2.9 3.4 2.9 5.2A2.9 2.9 0 0 1 12 15.6" stroke="%23fff" stroke-width="1.6" stroke-linecap="round"/></svg>'),
  drive_perception: svgToDataUri('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"><path d="M6.4 15.6c1.5-2.3 3.4-3.4 5.6-3.4 2.1 0 4 1.1 5.6 3.4" stroke="%23fff" stroke-width="1.7" stroke-linecap="round"/><path d="M7.2 14V9.4A2.1 2.1 0 0 1 9.3 7.3h5.4a2.1 2.1 0 0 1 2.1 2.1V14" stroke="%23fff" stroke-width="1.7" stroke-linecap="round"/><circle cx="9" cy="16.4" r="1" fill="%23fff"/><circle cx="15" cy="16.4" r="1" fill="%23fff"/><path d="M12 9.2v2.2" stroke="%23fff" stroke-width="1.6" stroke-linecap="round"/></svg>'),
  embedding_image: svgToDataUri('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"><rect x="5" y="5" width="14" height="14" rx="3" stroke="%23fff" stroke-width="1.8"/><path d="m8.3 14.8 2.5-2.7 2.1 2.1 2.9-3.2" stroke="%23fff" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><path d="M16 8.5h2.2M17.1 7.4v2.2" stroke="%23fff" stroke-width="1.5" stroke-linecap="round"/></svg>'),
  embedding_text: svgToDataUri('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"><path d="M7 7.8h10M7 11.9h10M7 16h6" stroke="%23fff" stroke-width="1.8" stroke-linecap="round"/><path d="M15.8 14.3h2.8M17.2 12.9v2.8" stroke="%23fff" stroke-width="1.5" stroke-linecap="round"/></svg>'),
  embedding_audio: svgToDataUri('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"><path d="M8.2 10.5v3a2.3 2.3 0 1 0 1.8 2.2v-6.6l5-1.1v3.7a2.3 2.3 0 1 0 1.8 2.2V6.4L10 7.9" stroke="%23fff" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>'),
  segment_anything: svgToDataUri('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"><rect x="5.4" y="5.4" width="13.2" height="13.2" rx="2.7" stroke="%23fff" stroke-width="1.7"/><path d="M8.6 12h6.8M12 8.6v6.8" stroke="%23fff" stroke-width="1.6" stroke-linecap="round"/><circle cx="12" cy="12" r="2.6" stroke="%23fff" stroke-width="1.4" opacity=".55"/></svg>'),
  depth_anything: svgToDataUri('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"><path d="M6.2 8.3 12 5.2l5.8 3.1v7.4L12 18.8l-5.8-3.1V8.3Z" stroke="%23fff" stroke-width="1.8" stroke-linejoin="round"/><path d="M12 5.2v13.6M8 10.3l4 2.2 4-2.2" stroke="%23fff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>'),
};

function makeBadgeIcon(innerSvg, paletteName = 'default') {
  const palette = BADGE_PALETTES[paletteName] || BADGE_PALETTES.default;
  return svgToDataUri(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none">
      <defs>
        <linearGradient id="badgeSurface" x1="4" y1="3" x2="20" y2="22" gradientUnits="userSpaceOnUse">
          <stop offset="0" stop-color="${palette.surfaceTop}"/>
          <stop offset="1" stop-color="${palette.surfaceBottom}"/>
        </linearGradient>
        <linearGradient id="badgeRim" x1="4" y1="2" x2="19.5" y2="23" gradientUnits="userSpaceOnUse">
          <stop offset="0" stop-color="rgba(255,255,255,0.84)"/>
          <stop offset=".35" stop-color="${palette.rim}"/>
          <stop offset="1" stop-color="rgba(255,255,255,0.12)"/>
        </linearGradient>
        <radialGradient id="badgeGlow" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(17.6 6.3) rotate(90) scale(6.1)">
          <stop offset="0" stop-color="${palette.glow}" stop-opacity=".9"/>
          <stop offset="1" stop-color="${palette.glow}" stop-opacity="0"/>
        </radialGradient>
        <linearGradient id="badgeGlass" x1="5.1" y1="4.2" x2="16.8" y2="19.6" gradientUnits="userSpaceOnUse">
          <stop offset="0" stop-color="rgba(255,255,255,0.34)"/>
          <stop offset=".45" stop-color="rgba(255,255,255,0.08)"/>
          <stop offset="1" stop-color="rgba(255,255,255,0)"/>
        </linearGradient>
        <filter id="badgeShadow" x="-15%" y="-15%" width="130%" height="130%" color-interpolation-filters="sRGB">
          <feDropShadow dx="0" dy="1.2" stdDeviation="1.2" flood-color="#020617" flood-opacity=".26"/>
        </filter>
      </defs>
      <g filter="url(#badgeShadow)">
        <rect x="1.5" y="1.5" width="21" height="21" rx="6.4" fill="url(#badgeSurface)"/>
        <rect x="1.5" y="1.5" width="21" height="21" rx="6.4" fill="url(#badgeGlass)" opacity=".92"/>
        <rect x="1.5" y="1.5" width="21" height="21" rx="6.4" stroke="url(#badgeRim)" stroke-width=".95"/>
        <circle cx="17.6" cy="6.3" r="5.8" fill="url(#badgeGlow)" opacity=".92"/>
        <path d="M5.4 5.6h7.1" stroke="${palette.accentSoft}" stroke-width=".9" stroke-linecap="round" opacity=".22"/>
        <path d="M5.5 18.1h4.4" stroke="${palette.accent}" stroke-width=".95" stroke-linecap="round" opacity=".3"/>
        <circle cx="17.65" cy="6.25" r="1.18" fill="${palette.accent}"/>
        <circle cx="17.65" cy="6.25" r=".5" fill="${palette.accentSoft}" opacity=".9"/>
      </g>
      ${innerSvg}
    </svg>`,
  );
}

const FIELD_BADGE_ICON_URIS = Object.fromEntries(
  Object.entries(BADGE_GLYPHS).map(([iconKey, glyph]) => [iconKey, makeBadgeIcon(glyph, BADGE_PALETTE_BY_ICON[iconKey])]),
);

function buildIconField(iconKey) {
  return {
    type: 'field_image',
    src: FIELD_BADGE_ICON_URIS[iconKey] || FIELD_BADGE_ICON_URIS.default,
    width: 20,
    height: 20,
    alt: 'icon',
  };
}

function getTaskIconKey(task) {
  const taskId = String(task?.task_id || '').trim();
  return taskId || String(task?.family || '').trim() || 'default';
}

function getIconUri(iconKey) {
  return TASK_ICON_OVERRIDES[iconKey] || BLOCK_ICON_URIS[iconKey] || BLOCK_ICON_URIS.default;
}

function buildDirectIconField(iconKey) {
  return {
    type: 'field_image',
    src: FIELD_BADGE_ICON_URIS[iconKey] || FIELD_BADGE_ICON_URIS.default,
    width: 20,
    height: 20,
    alt: 'icon',
  };
}

function getCompactTaskLabel(task) {
  const taskId = String(task?.task_id || '').trim();
  return TASK_SHORT_LABELS[taskId] || String(task?.label || taskId || '运行');
}

function isTaskAvailable(task) {
  return task?.available !== false;
}

function getTaskUnavailableComment(taskId) {
  const task = getTaskById(taskId);
  const label = String(task?.label || taskId || '当前任务').trim();
  const reason = String(task?.support_reason || '当前本地 XEdu 运行环境不支持该任务。').trim();
  const action = String(task?.recommended_action || '需安装对应模型/版本后再试。').trim();
  return `# ${label} 当前不可本地运行\n# ${reason}\n# ${action}`;
}

function buildUnavailableTaskPython(taskId, trailingLine = 'lab_flow = None') {
  return `${getTaskUnavailableComment(taskId)}\n${trailingLine}\n`;
}

function isTaskQuickEnabled(task) {
  return task?.quick_block_enabled !== false;
}

function isExperimentalTask(task) {
  return !isTaskAvailable(task) || !isTaskQuickEnabled(task);
}

function formatBlockTitle(label) {
  const text = String(label || '').trim();
  return text ? `〔${text}〕` : '';
}

function getCompactParamLabel(param) {
  const label = String(param?.label || '').trim();
  return PARAM_SHORT_LABELS[label] || label;
}

function getVisibleTaskParams(task) {
  const taskId = String(task?.task_id || '').trim();
  const params = Array.isArray(task?.params) ? task.params : [];
  if (!SEMANTIC_PARAM_INLINE_TASK_IDS.has(taskId)) {
    return [];
  }
  const visibleKeys = TASK_VISIBLE_PARAM_KEYS[taskId];
  if (!Array.isArray(visibleKeys)) {
    return params;
  }
  if (visibleKeys.length === 0) {
    return [];
  }
  const rank = new Map(visibleKeys.map((key, index) => [String(key), index]));
  return params
    .filter((param) => rank.has(String(param?.key || '')))
    .sort((a, b) => (rank.get(String(a?.key || '')) || 0) - (rank.get(String(b?.key || '')) || 0));
}

function getTaskFamilyCaption(task) {
  const familyId = String(task?.family || '').trim();
  return TASK_FAMILY_SHORT_LABELS[familyId] || String(task?.family_label || familyId || '任务');
}

function getTaskInferenceTargetLabel(task) {
  const inputMode = String(task?.input_mode || 'single_path').trim();
  const taskId = String(task?.task_id || '').trim();
  if (inputMode === 'text_or_list') {
    return '文本';
  }
  if (inputMode === 'path_or_list' && taskId.includes('audio')) {
    return '音频';
  }
  if (inputMode === 'path_or_list') {
    return '输入资源';
  }
  if (taskId.includes('audio')) {
    return '音频';
  }
  return '图片';
}

function getTaskTooltip(task) {
  const title = String(task?.label || task?.task_id || 'XEduHub 任务').trim();
  const params = getVisibleTaskParams(task);
  const paramText = params.length
    ? `可微调：${params.map((param) => String(param?.label || param?.key || '').trim()).filter(Boolean).join('、')}`
    : '默认可以直接运行';
  const availabilityText = isExperimentalTask(task)
    ? '当前本地环境默认不建议使用，可能无法运行。'
    : '适合课堂里的标准演示与预演。';
  return `${title}。对${getTaskInferenceTargetLabel(task)}进行推理，${paramText}。${availabilityText}`;
}

function getVariableName(block, fieldName, fallback = 'value') {
  const variableId = String(block?.getFieldValue?.(fieldName) || '').trim();
  const variableMap = typeof block?.workspace?.getVariableMap === 'function'
    ? block.workspace.getVariableMap()
    : null;
  const fromWorkspace = variableMap?.getVariableById?.(variableId)?.name;
  const fromField = block?.getField?.(fieldName)?.getText?.();
  const rawName = String(fromWorkspace || fromField || fallback).trim() || fallback;
  const sanitized = rawName
    .replace(/[^\w\u3400-\u9fff]+/g, '_')
    .replace(/^(\d)/, '_$1');
  return sanitized || fallback;
}

function getFieldText(block, fieldName, fallback = '') {
  return String(block?.getFieldValue?.(fieldName) ?? fallback).trim() || String(fallback || '');
}

function defineBlocksWithXEduPalette(Blockly, defs) {
  Blockly.defineBlocksWithJsonArray(
    (defs || []).map((def) => {
      if (!def || !def.colour) {
        return def;
      }
      return { ...def, colour: BLOCK_COLOUR_REMAP[def.colour] || def.colour };
    }),
  );
}

function getNumberField(block, fieldName, fallback = '0') {
  const value = String(block?.getFieldValue?.(fieldName) ?? fallback).trim();
  return value || String(fallback);
}

function quotePythonString(value, fallback = '') {
  return JSON.stringify(String(value ?? fallback));
}

function maybePythonKeywordArg(label, rawValue) {
  const text = String(rawValue ?? '').trim();
  if (!text) {
    return '';
  }
  return `, ${label}=${text}`;
}

function maybePythonLiteralArg(label, rawValue) {
  const text = String(rawValue ?? '').trim();
  if (!text) {
    return '';
  }
  return `, ${label}=${JSON.stringify(text)}`;
}

function maybePythonEnumArg(label, rawValue) {
  const text = String(rawValue ?? '').trim();
  if (!text) {
    return '';
  }
  return `, ${label}=${JSON.stringify(text)}`;
}

const FALLBACK_REGISTRY = {
  default_task_id: 'det_body',
  families: [
    { id: 'classification', label: '图像分类', colour: XEDU_SEMANTIC_COLOURS.classification, description: '识别图像类别' },
    { id: 'detection', label: '目标检测', colour: XEDU_SEMANTIC_COLOURS.detection, description: '检测目标位置' },
    { id: 'ocr', label: 'OCR', colour: XEDU_SEMANTIC_COLOURS.ocr, description: '提取图像文字' },
    { id: 'pose', label: '关键点识别', colour: XEDU_SEMANTIC_COLOURS.pose, description: '识别人脸、人体、手部和全身关键点' },
    { id: 'generation', label: '内容生成', colour: XEDU_SEMANTIC_COLOURS.generation, description: '执行风格迁移与图像着色' },
    { id: 'segmentation', label: '图像分割', colour: XEDU_SEMANTIC_COLOURS.segmentation, description: '执行图像区域分割' },
    { id: 'depth', label: '深度估计', colour: XEDU_SEMANTIC_COLOURS.depth, description: '生成单目深度结果图' },
    { id: 'multimodal', label: '多模态特征', colour: XEDU_SEMANTIC_COLOURS.multimodal, description: '提取图像、文本与音频向量' },
    { id: 'panoptic', label: '全景感知', colour: XEDU_SEMANTIC_COLOURS.panoptic, description: '驾驶场景的检测与区域感知' },
  ],
  tasks: [
    {
      task_id: 'cls_imagenet',
      runtime_task_id: 'cls_imagenet',
      label: 'ImageNet 图像分类',
      family: 'classification',
      family_label: '图像分类',
      colour: XEDU_SEMANTIC_COLOURS.classification,
      available: false,
      support_reason: '当前本地 XEdu 运行环境不支持该任务。',
      support_source: 'unknown',
      recommended_action: '需安装对应模型/版本后再试。',
      input_mode: 'single_path',
      result_kind: 'classification',
      result_shape: 'classification',
      quick_block_enabled: true,
      core_api_enabled: true,
      params: [],
    },
    {
      task_id: 'det_body',
      runtime_task_id: 'bodydetect',
      label: '人体目标检测',
      family: 'detection',
      family_label: '目标检测',
      colour: XEDU_SEMANTIC_COLOURS.detection,
      available: true,
      support_reason: '当前本地环境支持该任务。',
      support_source: 'runtime',
      recommended_action: '',
      input_mode: 'single_path',
      result_kind: 'detection',
      result_shape: 'detection',
      quick_block_enabled: true,
      core_api_enabled: true,
      params: [{ key: 'thr', label: '阈值', field: 'number', default: 0.3 }],
    },
    {
      task_id: 'det_body_l',
      runtime_task_id: 'bodydetect',
      label: '人体目标检测 Large',
      family: 'detection',
      family_label: '目标检测',
      colour: XEDU_SEMANTIC_COLOURS.detection,
      available: true,
      support_reason: '当前本地环境支持该任务。',
      support_source: 'runtime',
      recommended_action: '',
      input_mode: 'single_path',
      result_kind: 'detection',
      result_shape: 'detection',
      quick_block_enabled: false,
      core_api_enabled: true,
      params: [{ key: 'thr', label: '阈值', field: 'number', default: 0.3 }],
    },
    {
      task_id: 'det_coco',
      runtime_task_id: 'cocodetect',
      label: 'COCO 目标检测',
      family: 'detection',
      family_label: '目标检测',
      colour: XEDU_SEMANTIC_COLOURS.detection,
      available: true,
      support_reason: '当前本地环境支持该任务。',
      support_source: 'runtime',
      recommended_action: '',
      input_mode: 'single_path',
      result_kind: 'detection',
      result_shape: 'detection',
      quick_block_enabled: true,
      core_api_enabled: true,
      params: [
        { key: 'thr', label: '阈值', field: 'number', default: 0.3 },
        { key: 'target_class', label: '目标类', field: 'text', default: '' },
      ],
    },
    {
      task_id: 'det_coco_l',
      runtime_task_id: 'cocodetect',
      label: 'COCO 目标检测 Large',
      family: 'detection',
      family_label: '目标检测',
      colour: XEDU_SEMANTIC_COLOURS.detection,
      available: true,
      support_reason: '当前本地环境支持该任务。',
      support_source: 'runtime',
      recommended_action: '',
      input_mode: 'single_path',
      result_kind: 'detection',
      result_shape: 'detection',
      quick_block_enabled: false,
      core_api_enabled: true,
      params: [
        { key: 'thr', label: '阈值', field: 'number', default: 0.3 },
        { key: 'target_class', label: '目标类', field: 'text', default: '' },
      ],
    },
    {
      task_id: 'pose_body17',
      runtime_task_id: 'body17',
      label: '人体关键点 17',
      family: 'pose',
      family_label: '关键点识别',
      colour: XEDU_SEMANTIC_COLOURS.pose,
      available: true,
      support_reason: '当前本地环境支持该任务。',
      support_source: 'runtime',
      recommended_action: '',
      input_mode: 'single_path',
      result_kind: 'pose',
      result_shape: 'pose',
      quick_block_enabled: true,
      core_api_enabled: true,
      params: [{ key: 'bbox', label: '检测框', field: 'text', default: '' }],
    },
    {
      task_id: 'pose_body17_l',
      runtime_task_id: 'body17',
      label: '人体关键点 17 Large',
      family: 'pose',
      family_label: '关键点识别',
      colour: XEDU_SEMANTIC_COLOURS.pose,
      available: true,
      support_reason: '当前本地环境支持该任务。',
      support_source: 'runtime',
      recommended_action: '',
      input_mode: 'single_path',
      result_kind: 'pose',
      result_shape: 'pose',
      quick_block_enabled: false,
      core_api_enabled: true,
      params: [{ key: 'bbox', label: '检测框', field: 'text', default: '' }],
    },
    {
      task_id: 'pose_body26',
      runtime_task_id: 'body26',
      label: '人体关键点 26',
      family: 'pose',
      family_label: '关键点识别',
      colour: XEDU_SEMANTIC_COLOURS.pose,
      available: true,
      support_reason: '当前本地环境支持该任务。',
      support_source: 'runtime',
      recommended_action: '',
      input_mode: 'single_path',
      result_kind: 'pose',
      result_shape: 'pose',
      quick_block_enabled: false,
      core_api_enabled: true,
      params: [{ key: 'bbox', label: '检测框', field: 'text', default: '' }],
    },
    {
      task_id: 'pose_face106',
      runtime_task_id: 'face106',
      label: '人脸关键点 106',
      family: 'pose',
      family_label: '关键点识别',
      colour: XEDU_SEMANTIC_COLOURS.pose,
      available: true,
      support_reason: '当前本地环境支持该任务。',
      support_source: 'runtime',
      recommended_action: '',
      input_mode: 'single_path',
      result_kind: 'pose',
      result_shape: 'pose',
      quick_block_enabled: true,
      core_api_enabled: true,
      params: [{ key: 'bbox', label: '检测框', field: 'text', default: '' }],
    },
    {
      task_id: 'pose_hand21',
      runtime_task_id: 'hand21',
      label: '手部关键点 21',
      family: 'pose',
      family_label: '关键点识别',
      colour: XEDU_SEMANTIC_COLOURS.pose,
      available: true,
      support_reason: '当前本地环境支持该任务。',
      support_source: 'runtime',
      recommended_action: '',
      input_mode: 'single_path',
      result_kind: 'pose',
      result_shape: 'pose',
      quick_block_enabled: true,
      core_api_enabled: true,
      params: [{ key: 'bbox', label: '检测框', field: 'text', default: '' }],
    },
    {
      task_id: 'pose_wholebody133',
      runtime_task_id: 'wholebody133',
      label: '全身关键点 133',
      family: 'pose',
      family_label: '关键点识别',
      colour: XEDU_SEMANTIC_COLOURS.pose,
      available: true,
      support_reason: '当前本地环境支持该任务。',
      support_source: 'runtime',
      recommended_action: '',
      input_mode: 'single_path',
      result_kind: 'pose',
      result_shape: 'pose',
      quick_block_enabled: false,
      core_api_enabled: true,
      params: [{ key: 'bbox', label: '检测框', field: 'text', default: '' }],
    },
    {
      task_id: 'ocr',
      runtime_task_id: 'ocr',
      label: '光学字符识别',
      family: 'ocr',
      family_label: 'OCR',
      colour: XEDU_SEMANTIC_COLOURS.ocr,
      available: false,
      support_reason: '当前本地 XEdu 运行环境不支持该任务。',
      support_source: 'unknown',
      recommended_action: '需安装对应模型/版本后再试。',
      input_mode: 'single_path',
      result_kind: 'ocr',
      result_shape: 'ocr',
      quick_block_enabled: true,
      core_api_enabled: true,
      params: [],
    },
    {
      task_id: 'gen_style',
      runtime_task_id: 'gen_style',
      label: '图像风格迁移',
      family: 'generation',
      family_label: '内容生成',
      colour: XEDU_SEMANTIC_COLOURS.generation,
      available: false,
      support_reason: '当前本地 XEdu 运行环境不支持该任务。',
      support_source: 'unknown',
      recommended_action: '需安装对应模型/版本后再试。',
      input_mode: 'single_path',
      result_kind: 'generation',
      result_shape: 'image',
      quick_block_enabled: true,
      core_api_enabled: true,
      params: [{ key: 'style', label: '风格', field: 'enum', default: 'mosaic', options: [['马赛克', 'mosaic']] }],
    },
    {
      task_id: 'gen_color',
      runtime_task_id: 'gen_color',
      label: '图像着色',
      family: 'generation',
      family_label: '内容生成',
      colour: XEDU_SEMANTIC_COLOURS.generation,
      available: false,
      support_reason: '当前本地 XEdu 运行环境不支持该任务。',
      support_source: 'unknown',
      recommended_action: '需安装对应模型/版本后再试。',
      input_mode: 'single_path',
      result_kind: 'generation',
      result_shape: 'image',
      quick_block_enabled: true,
      core_api_enabled: true,
      params: [],
    },
    {
      task_id: 'drive_perception',
      runtime_task_id: 'drive_perception',
      label: '全景驾驶感知',
      family: 'panoptic',
      family_label: '全景感知',
      colour: XEDU_SEMANTIC_COLOURS.panoptic,
      available: false,
      support_reason: '当前本地 XEdu 运行环境不支持该任务。',
      support_source: 'unknown',
      recommended_action: '需安装对应模型/版本后再试。',
      input_mode: 'single_path',
      result_kind: 'panoptic',
      result_shape: 'panoptic',
      quick_block_enabled: false,
      core_api_enabled: true,
      params: [{ key: 'thr', label: '阈值', field: 'number', default: 0.3 }],
    },
    {
      task_id: 'embedding_image',
      runtime_task_id: 'embedding_image',
      label: '图像特征提取',
      family: 'multimodal',
      family_label: '多模态特征',
      colour: XEDU_SEMANTIC_COLOURS.multimodal,
      available: false,
      support_reason: '当前本地 XEdu 运行环境不支持该任务。',
      support_source: 'unknown',
      recommended_action: '需安装对应模型/版本后再试。',
      input_mode: 'path_or_list',
      result_kind: 'multimodal',
      result_shape: 'multimodal',
      quick_block_enabled: false,
      core_api_enabled: true,
      params: [],
    },
    {
      task_id: 'embedding_text',
      runtime_task_id: 'embedding_text',
      label: '文本特征提取',
      family: 'multimodal',
      family_label: '多模态特征',
      colour: XEDU_SEMANTIC_COLOURS.multimodal,
      available: false,
      support_reason: '当前本地 XEdu 运行环境不支持该任务。',
      support_source: 'unknown',
      recommended_action: '需安装对应模型/版本后再试。',
      input_mode: 'text_or_list',
      result_kind: 'multimodal',
      result_shape: 'multimodal',
      quick_block_enabled: false,
      core_api_enabled: true,
      params: [],
    },
    {
      task_id: 'embedding_audio',
      runtime_task_id: 'embedding_audio',
      label: '音频特征提取',
      family: 'multimodal',
      family_label: '多模态特征',
      colour: XEDU_SEMANTIC_COLOURS.multimodal,
      available: false,
      support_reason: '当前本地 XEdu 运行环境不支持该任务。',
      support_source: 'unknown',
      recommended_action: '需安装对应模型/版本后再试。',
      input_mode: 'path_or_list',
      result_kind: 'multimodal',
      result_shape: 'multimodal',
      quick_block_enabled: false,
      core_api_enabled: true,
      params: [],
    },
    {
      task_id: 'segment_anything',
      runtime_task_id: 'segment_anything',
      label: 'SAM 图像分割',
      family: 'segmentation',
      family_label: '图像分割',
      colour: XEDU_SEMANTIC_COLOURS.segmentation,
      available: false,
      support_reason: '当前本地 XEdu 运行环境不支持该任务。',
      support_source: 'unknown',
      recommended_action: '需安装对应模型/版本后再试。',
      input_mode: 'single_path',
      result_kind: 'segmentation',
      result_shape: 'segmentation',
      quick_block_enabled: true,
      core_api_enabled: true,
      params: [{ key: 'mode', label: '模式', field: 'enum', default: 'point', options: [['点提示', 'point']] }],
    },
    {
      task_id: 'depth_anything',
      runtime_task_id: 'depth_anything',
      label: '单目深度估计',
      family: 'depth',
      family_label: '深度估计',
      colour: XEDU_SEMANTIC_COLOURS.depth,
      available: false,
      support_reason: '当前本地 XEdu 运行环境不支持该任务。',
      support_source: 'unknown',
      recommended_action: '需安装对应模型/版本后再试。',
      input_mode: 'single_path',
      result_kind: 'depth',
      result_shape: 'image',
      quick_block_enabled: true,
      core_api_enabled: true,
      params: [],
    },
  ],
};

const LEGACY_MODEL_MAP = {
  classification: { resnet18: 'cls_imagenet', resnet50: 'cls_imagenet', mobilenetv2: 'cls_imagenet' },
  detection: {
    det_body: 'det_body',
    det_body_l: 'det_body_l',
    det_face: 'det_face',
    det_hand: 'det_hand',
    det_coco: 'det_coco',
    det_coco_l: 'det_coco_l',
    yolov5: 'det_body',
    yolov8n: 'det_body',
    fasterrcnn: 'det_body',
  },
  segmentation: { segment_anything: 'segment_anything', deeplabv3: 'segment_anything', unet: 'segment_anything' },
  pose: {
    pose_body: 'pose_body17',
    pose_body17: 'pose_body17',
    pose_body17_l: 'pose_body17_l',
    pose_body26: 'pose_body26',
    pose_face: 'pose_face106',
    pose_face106: 'pose_face106',
    pose_hand: 'pose_hand21',
    pose_hand21: 'pose_hand21',
    pose_wholebody: 'pose_wholebody133',
    pose_wholebody133: 'pose_wholebody133',
    hrnet: 'pose_body17',
    rtmpose: 'pose_body17',
  },
  ocr: { ocr: 'ocr', dbnet: 'ocr', crnn: 'ocr' },
  generation: { gen_style: 'gen_style', gen_color: 'gen_color', 'sd-v1-5': 'gen_style', gpt2: 'gen_style' },
  panoptic: { drive_perception: 'drive_perception', panoptic_deeplab: 'drive_perception', yolov8p: 'drive_perception' },
  multimodal: { embedding_image: 'embedding_image', embedding_text: 'embedding_text', embedding_audio: 'embedding_audio', clip: 'embedding_image', blip: 'embedding_image' },
  depth: { depth_anything: 'depth_anything', midas: 'depth_anything', dpt: 'depth_anything' },
};

const LEGACY_TASK_ALIAS = {
  classification: 'cls_imagenet',
  detection: 'det_body',
  segmentation: 'segment_anything',
  pose: 'pose_body17',
  ocr: 'ocr',
  generation: 'gen_style',
  panoptic: 'drive_perception',
  multimodal: 'embedding_image',
  depth: 'depth_anything',
  custom: 'cls_imagenet',
};

function getRuntimeConfig() {
  return window.__XEDU_BLOCKLY_RUNTIME_CONFIG__ || {};
}

function getXEduHubTaskRegistry() {
  const runtime = getRuntimeConfig();
  const registry = runtime.xeduhubTaskRegistry || runtime.xeduhub_task_registry || FALLBACK_REGISTRY;
  if (!registry || !Array.isArray(registry.tasks) || registry.tasks.length === 0) {
    return FALLBACK_REGISTRY;
  }
  return registry;
}

function getTaskMap() {
  return new Map((getXEduHubTaskRegistry().tasks || []).map((task) => [String(task.task_id || ''), task]));
}

function getTaskById(taskId) {
  return getTaskMap().get(String(taskId || '')) || null;
}

function getRuntimeTaskId(taskId) {
  const task = getTaskById(taskId);
  const direct = FRONTEND_RUNTIME_TASK_ID_MAP[String(taskId || '').trim()];
  return String(direct || task?.runtime_task_id || task?.task_id || taskId || '').trim();
}

function getTaskOptions() {
  return (getXEduHubTaskRegistry().tasks || []).map((task) => [String(task.label || task.task_id || ''), String(task.task_id || '')]);
}

function getSemanticRunBlockType(taskId) {
  return `${RUN_BLOCK_PREFIX}${String(taskId || '').trim()}`;
}

function getTaskIdFromRunBlockType(blockType) {
  const type = String(blockType || '');
  if (!type.startsWith(RUN_BLOCK_PREFIX)) {
    return '';
  }
  const taskId = type.slice(RUN_BLOCK_PREFIX.length);
  return getTaskById(taskId) ? taskId : '';
}

function isSemanticRunBlockType(blockType) {
  return Boolean(getTaskIdFromRunBlockType(blockType));
}

function getParamFieldName(paramKey) {
  return `PARAM_${String(paramKey || '').trim()}`;
}

function normalizeLegacyFamily(value) {
  const text = String(value || '').trim().toLowerCase();
  const mapping = {
    classification: 'classification',
    detection: 'detection',
    segmentation: 'segmentation',
    pose: 'pose',
    ocr: 'ocr',
    generation: 'generation',
    panoptic: 'panoptic',
    multimodal: 'multimodal',
    depth: 'depth',
    图像分类: 'classification',
    目标检测: 'detection',
    图像分割: 'segmentation',
    关键点识别: 'pose',
    文字识别: 'ocr',
    内容生成: 'generation',
    全景感知: 'panoptic',
    多模态: 'multimodal',
    深度估计: 'depth',
  };
  return mapping[text] || 'classification';
}

function resolveLegacyTaskId(taskOrFamily, modelName) {
  const taskMap = getTaskMap();
  const explicitTaskId = String(taskOrFamily || '').trim();
  if (taskMap.has(explicitTaskId)) {
    return HIDDEN_TASK_FALLBACKS[explicitTaskId] || explicitTaskId;
  }
  const family = normalizeLegacyFamily(taskOrFamily);
  const modelKey = String(modelName || '').trim().toLowerCase();
  if (modelKey && taskMap.has(modelKey)) {
    return HIDDEN_TASK_FALLBACKS[modelKey] || modelKey;
  }
  const familyModels = LEGACY_MODEL_MAP[family] || {};
  if (modelKey && familyModels[modelKey] && taskMap.has(familyModels[modelKey])) {
    return HIDDEN_TASK_FALLBACKS[familyModels[modelKey]] || familyModels[modelKey];
  }
  return LEGACY_TASK_ALIAS[family] || getXEduHubTaskRegistry().default_task_id || FALLBACK_REGISTRY.default_task_id;
}

function parseJsonish(text, fallback = null) {
  const raw = String(text ?? '').trim();
  if (!raw) {
    return fallback;
  }
  try {
    return JSON.parse(raw);
  } catch (_) {
    return fallback;
  }
}

function coerceJsonishLikeBackend(value) {
  const text = String(value ?? '').trim();
  if (!text) {
    return '';
  }
  if (text.startsWith('[') || text.startsWith('{')) {
    try {
      return JSON.parse(text);
    } catch (_) {
      return text;
    }
  }
  return text;
}

function coerceParamValue(param, rawValue) {
  if (rawValue === undefined || rawValue === null || rawValue === '') {
    return null;
  }
  const fieldType = String(param?.field || 'text');
  if (fieldType === 'number') {
    const text = String(rawValue).trim();
    if (/^-?\d+$/.test(text)) {
      return Number.parseInt(text, 10);
    }
    const parsed = Number.parseFloat(text);
    return Number.isFinite(parsed) ? parsed : rawValue;
  }
  if (fieldType === 'enum') {
    return String(rawValue);
  }
  return coerceJsonishLikeBackend(rawValue);
}

function toPythonLiteral(value) {
  if (value === null || value === undefined) {
    return 'None';
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => toPythonLiteral(item)).join(', ')}]`;
  }
  if (typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : 'None';
  }
  if (typeof value === 'boolean') {
    return value ? 'True' : 'False';
  }
  if (typeof value === 'object') {
    return `{${Object.entries(value).map(([key, item]) => `${JSON.stringify(String(key))}: ${toPythonLiteral(item)}`).join(', ')}}`;
  }
  return JSON.stringify(String(value));
}

function buildParamsObjectFromBlock(task, block) {
  const params = {};
  getVisibleTaskParams(task).forEach((param) => {
    const fieldName = getParamFieldName(param.key);
    const raw = block.getFieldValue(fieldName);
    const coerced = coerceParamValue(param, raw);
    if (coerced === undefined || coerced === null || coerced === '') {
      return;
    }
    params[param.key] = coerced;
  });
  return params;
}

function buildParamPythonLines(task, block, targetName = 'lab_params') {
  const params = buildParamsObjectFromBlock(task, block);
  if (Object.keys(params).length === 0) {
    return [];
  }
  return [`${targetName} = ${toPythonLiteral(params)}`];
}

function makeIconField(Blockly, iconKey) {
  return new Blockly.FieldImage(getIconUri(iconKey), 18, 18, '');
}

async function requestImageFilePath() {
  if (globalThis.window?.electronAPI && typeof globalThis.window.electronAPI.invoke === 'function') {
    return await globalThis.window.electronAPI.invoke('select-image-file');
  }
  if (globalThis.window?.parent && globalThis.window.parent !== globalThis.window) {
    try {
      return await requestImageFilePathFromParentWindow();
    } catch (_) {
      // Fall through to backend HTTP bridge when the parent window cannot serve the picker.
    }
  }
  const response = await globalThis.fetch('/api/system/select-image-file', { method: 'POST' });
  if (!response.ok) {
    throw new Error(`select-image-file failed: ${response.status}`);
  }
  const payload = await response.json().catch(() => ({}));
  return payload?.path || null;
}

function requestImageFilePathFromParentWindow(timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const parentWindow = globalThis.window?.parent;
    if (!parentWindow || parentWindow === globalThis.window || typeof parentWindow.postMessage !== 'function') {
      reject(new Error('parent-window-unavailable'));
      return;
    }

    const requestId = `xedu-image-picker-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    let settled = false;

    const cleanup = () => {
      globalThis.window?.removeEventListener('message', handleMessage);
      globalThis.clearTimeout(timeoutId);
    };

    const finish = (callback, value) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      callback(value);
    };

    const handleMessage = (event) => {
      if (event.source !== parentWindow) {
        return;
      }
      const payload = event.data;
      if (!payload || payload.type !== XEDU_IMAGE_PICKER_RESPONSE || payload.requestId !== requestId) {
        return;
      }
      if (payload.error) {
        finish(reject, new Error(String(payload.error)));
        return;
      }
      finish(resolve, payload.path || null);
    };

    const timeoutId = globalThis.setTimeout(() => {
      finish(reject, new Error('parent-window-timeout'));
    }, timeoutMs);

    globalThis.window?.addEventListener('message', handleMessage);
    parentWindow.postMessage({ type: XEDU_IMAGE_PICKER_REQUEST, requestId }, '*');
  });
}

function registerImagePathField(Blockly) {
  if (!Blockly?.fieldRegistry || Blockly.fieldRegistry.__xeduImagePathRegistered__) {
    return;
  }
  class XEduImagePathField extends Blockly.FieldTextInput {
    constructor(value = DEFAULT_XEDUHUB_SAMPLE_INPUT) {
      super(String(value || DEFAULT_XEDUHUB_SAMPLE_INPUT));
    }

    showEditor_() {
      void this.openPicker_();
    }

    async openPicker_() {
      try {
        const selectedPath = await requestImageFilePath();
        if (selectedPath) {
          this.setValue(String(selectedPath));
        }
      } catch (_) {
        // Keep current path when picker is cancelled or unavailable.
      }
    }

    static fromJson(options) {
      return new this(options?.text || DEFAULT_XEDUHUB_SAMPLE_INPUT);
    }
  }
  Blockly.fieldRegistry.register('field_xedu_image_path', XEduImagePathField);
  Blockly.fieldRegistry.__xeduImagePathRegistered__ = true;
}

function buildImagePathFieldConfig() {
  return { type: 'field_xedu_image_path', name: 'INPUT', text: DEFAULT_XEDUHUB_SAMPLE_INPUT };
}

const BUILTIN_BLOCK_ICON_FIELD_NAME = 'XEDU_TYPE_ICON';
const BUILTIN_BLOCK_ICON_EXCLUDED_TYPES = new Set([
  'controls_if_else',
  'controls_if_elseif',
  'controls_if_if',
  'lists_create_with_container',
  'lists_create_with_item',
  'procedures_mutatorarg',
  'procedures_mutatorcontainer',
  'text_create_join_container',
  'text_create_join_item',
]);

function getBuiltinBlockIconKey(blockType) {
  const type = String(blockType || '').trim();
  if (!type || type.startsWith('xeduhub_') || BUILTIN_BLOCK_ICON_EXCLUDED_TYPES.has(type)) {
    return '';
  }
  if (type.startsWith('logic_') || type === 'controls_if') {
    return 'debug';
  }
  if (
    type === 'controls_repeat_ext'
    || type === 'controls_whileUntil'
    || type === 'controls_for'
    || type === 'controls_forEach'
    || type === 'controls_flow_statements'
  ) {
    return 'workflow';
  }
  if (type.startsWith('math_')) {
    return 'math';
  }
  if (type.startsWith('text_') || type === 'text') {
    return 'note';
  }
  if (type.startsWith('lists_')) {
    return 'result';
  }
  if (type.startsWith('variables_')) {
    return 'default';
  }
  if (
    type === 'procedures_defnoreturn'
    || type === 'procedures_defreturn'
    || type === 'procedures_callnoreturn'
    || type === 'procedures_callreturn'
    || type === 'procedures_ifreturn'
  ) {
    return 'workflow';
  }
  return '';
}

function buildBadgeFieldImage(Blockly, iconKey) {
  return new Blockly.FieldImage(
    FIELD_BADGE_ICON_URIS[iconKey] || FIELD_BADGE_ICON_URIS.default,
    20,
    20,
    '',
  );
}

function pickBuiltinIconInput(block) {
  if (!block || !Array.isArray(block.inputList)) {
    return null;
  }
  return block.inputList.find((input) => typeof input?.insertFieldAt === 'function')
    || null;
}

function prependBuiltinTypeIcon(block, Blockly, iconKey) {
  if (!block || !Blockly || !iconKey || typeof block.getField === 'function' && block.getField(BUILTIN_BLOCK_ICON_FIELD_NAME)) {
    return;
  }
  const targetInput = pickBuiltinIconInput(block);
  if (!targetInput) {
    return;
  }
  targetInput.insertFieldAt(0, buildBadgeFieldImage(Blockly, iconKey), BUILTIN_BLOCK_ICON_FIELD_NAME);
}

function decorateBuiltinBlocklyBlocksWithIcons(Blockly) {
  Object.entries(Blockly?.Blocks || {}).forEach(([blockType, definition]) => {
    const iconKey = getBuiltinBlockIconKey(blockType);
    if (!iconKey || !definition || typeof definition.init !== 'function' || definition.__xeduTypeIconWrapped__) {
      return;
    }
    const originalInit = definition.init;
    definition.init = function wrappedBuiltinInit(...args) {
      originalInit.apply(this, args);
      prependBuiltinTypeIcon(this, Blockly, iconKey);
    };
    definition.__xeduTypeIconWrapped__ = true;
  });
}

function getValueCode(block, name, pythonGenerator, fallback = 'None', order = pythonGenerator.ORDER_NONE) {
  const code = pythonGenerator.valueToCode(block, name, order);
  return code || fallback;
}

function ensureDefinitions(pythonGenerator) {
  if (!pythonGenerator.definitions_) {
    pythonGenerator.definitions_ = Object.create(null);
  }
  return pythonGenerator.definitions_;
}

function definePythonSnippet(pythonGenerator, key, code) {
  ensureDefinitions(pythonGenerator)[key] = code;
}

function ensureWorkflowImport(pythonGenerator) {
  definePythonSnippet(pythonGenerator, 'import_xedu_workflow', 'from XEdu.hub import Workflow as wf');
}

function ensureCheckpointSupport(pythonGenerator) {
  definePythonSnippet(pythonGenerator, 'import_pathlib_path', 'from pathlib import Path');
  definePythonSnippet(
    pythonGenerator,
    'xedu_checkpoint_helper',
    [
      'def xedu_smoke_checkpoint(name):',
      '    for root in (Path.cwd(), *Path.cwd().parents):',
      '        candidate = root / "courses" / "blockly-smoke" / "checkpoints" / name',
      '        if candidate.exists():',
      '            return str(candidate)',
      '    return ""',
    ].join('\n'),
  );
}

function getWorkflowVarNameForTask(taskId) {
  const runtimeTaskId = String(getRuntimeTaskId(taskId) || taskId || 'lab_flow').trim();
  const sanitized = runtimeTaskId
    .replace(/[^\w\u3400-\u9fff]+/g, '_')
    .replace(/^(\d)/, '_$1');
  return `xedu_flow_${sanitized || 'default'}`;
}

function ensureWorkflowInstance(pythonGenerator, taskId) {
  const task = getTaskById(taskId);
  if (task?.available === false) {
    const flowVar = getWorkflowVarNameForTask(taskId);
    definePythonSnippet(
      pythonGenerator,
      `workflow_instance_unavailable_${flowVar}`,
      `${getTaskUnavailableComment(taskId)}\n${flowVar} = None`,
    );
    return { flowVar, runtimeTaskId: String(getRuntimeTaskId(taskId) || taskId || '').trim(), unavailable: true };
  }
  const runtimeTaskId = String(getRuntimeTaskId(taskId) || taskId || '').trim();
  const flowVar = getWorkflowVarNameForTask(taskId);
  const checkpointName = FRONTEND_SMOKE_CHECKPOINT_MAP[runtimeTaskId] || '';
  ensureWorkflowImport(pythonGenerator);
  if (checkpointName) {
    ensureCheckpointSupport(pythonGenerator);
  }
  definePythonSnippet(
    pythonGenerator,
    `workflow_instance_${flowVar}`,
    checkpointName
      ? `${flowVar} = wf(task=${quotePythonString(runtimeTaskId)}, checkpoint=xedu_smoke_checkpoint(${quotePythonString(checkpointName)}))`
      : `${flowVar} = wf(task=${quotePythonString(runtimeTaskId)})`,
  );
  return { flowVar, runtimeTaskId };
}

function ensureCvSupport(pythonGenerator) {
  definePythonSnippet(pythonGenerator, 'import_cv2', 'import cv2');
  definePythonSnippet(
    pythonGenerator,
    'import_xedu_blockly_cv_runtime',
    'from runtime import blockly_runtime as xrt',
  );
}

function ensureRequestSupport(pythonGenerator) {
  definePythonSnippet(pythonGenerator, 'import_requests', 'import requests');
  definePythonSnippet(pythonGenerator, 'import_xedu_blockly_request_runtime', 'from runtime import blockly_runtime as xrt');
}

function ensureMathSupport(pythonGenerator) {
  definePythonSnippet(pythonGenerator, 'import_math', 'import math');
  definePythonSnippet(pythonGenerator, 'import_numpy', 'import numpy as np');
}

function ensureServoSupport(pythonGenerator) {
  definePythonSnippet(pythonGenerator, 'import_pinpong', 'from pinpong.board import Board, Pin, Servo');
}

function ensureResultHelpers(pythonGenerator) {
  definePythonSnippet(
    pythonGenerator,
    'import_xedu_blockly_result_runtime',
    'from runtime import blockly_runtime as xrt',
  );
}

function getPythonParamsObject(block, fieldName = 'PARAMS') {
  const raw = String(block.getFieldValue(fieldName) || '').trim();
  if (!raw) {
    return {};
  }
  const parsed = parseJsonish(raw, {});
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
}

function defineBaseBlocks(Blockly) {
  registerImagePathField(Blockly);
  defineBlocksWithXEduPalette(Blockly, [
    {
      type: 'xeduhub_set_input_resource',
      message0: '%1 设置输入路径 %2',
      args0: [buildIconField('input'), buildImagePathFieldConfig()],
      previousStatement: null,
      nextStatement: null,
      colour: '#5A8DEE',
      tooltip: '兼容旧流程：设置单张图像或单个资源路径，供后续 XEduHub 任务使用。',
    },
    {
      type: 'xeduhub_load_image_to_var',
      message0: '%1 读取图片 %2 赋值给 %3',
      args0: [
        buildIconField('input'),
        buildImagePathFieldConfig(),
        { type: 'field_variable', name: 'IMAGE_VAR', variable: 'lab_input' },
      ],
      previousStatement: null,
      nextStatement: null,
      colour: '#5A8DEE',
      tooltip: '点击中间路径会弹出文件选择，并把读入的图片数据保存到变量。',
    },
    {
      type: 'xeduhub_input_image',
      message0: '%1 图片路径 %2',
      args0: [buildIconField('input'), buildImagePathFieldConfig()],
      output: 'String',
      colour: '#5A8DEE',
      tooltip: '点击路径会弹出文件选择，并返回单张图片路径。',
    },
    {
      type: 'xeduhub_set_input_list',
      message0: '%1 输入序列 %2',
      args0: [buildIconField('input'), { type: 'field_input', name: 'INPUTS', text: '["demo1.jpg","demo2.jpg"]' }],
      previousStatement: null,
      nextStatement: null,
      colour: '#5A8DEE',
      tooltip: '设置多张图像或多个资源，适合批量或多输入任务。',
    },
    {
      type: 'xeduhub_show_result_card',
      message0: '%1 结果显示 %2',
      args0: [buildIconField('result'), { type: 'field_input', name: 'TITLE', text: '运行结果' }],
      message1: '结果 %1',
      args1: [{ type: 'input_value', name: 'RESULT' }],
      previousStatement: null,
      nextStatement: null,
      colour: '#5A8DEE',
      tooltip: '把当前识别结果整理成一张易读的结果卡片。',
    },
    {
      type: 'xeduhub_show_result_image',
      message0: '%1 显示结果图片 %2',
      args0: [buildIconField('resultImage'), { type: 'input_value', name: 'IMAGE' }],
      previousStatement: null,
      nextStatement: null,
      colour: '#5A8DEE',
      tooltip: '显示当前任务返回的结果图片或标注图。',
    },
    {
      type: 'xeduhub_run_and_record',
      message0: '%1 记录结论 %2',
      args0: [buildIconField('note'), { type: 'input_value', name: 'NOTE' }],
      previousStatement: null,
      nextStatement: null,
      colour: '#5A8DEE',
      tooltip: '记录当前实验结论，便于课堂展示与复盘。',
    },
    {
      type: 'xeduhub_clear_result',
      message0: '%1 清空结果区',
      args0: [buildIconField('clear')],
      previousStatement: null,
      nextStatement: null,
      colour: '#5A8DEE',
      tooltip: '清空当前运行结果与错误状态。',
    },
    {
      type: 'xeduhub_workflow_create',
      message0: '%1 初始化任务 %2 记为 %3',
      args0: [
        buildIconField('workflow'),
        { type: 'field_dropdown', name: TASK_FIELD_NAME, options: getTaskOptions },
        { type: 'field_variable', name: 'MODEL_VAR', variable: 'lab_flow' },
      ],
      previousStatement: null,
      nextStatement: null,
      colour: '#A596C9',
    },
    {
      type: 'xeduhub_workflow_set_task',
      message0: '%1 让流程 %2 切换到 %3',
      args0: [
        buildIconField('workflow'),
        { type: 'field_variable', name: 'MODEL_VAR', variable: 'lab_flow' },
        { type: 'field_dropdown', name: TASK_FIELD_NAME, options: getTaskOptions },
      ],
      previousStatement: null,
      nextStatement: null,
      colour: '#A596C9',
    },
    {
      type: 'xeduhub_workflow_set_params',
      message0: '%1 更多参数 %2',
      args0: [buildIconField('workflow'), { type: 'field_input', name: PARAMS_FIELD_NAME, text: '{}' }],
      previousStatement: null,
      nextStatement: null,
      colour: '#A596C9',
    },
    {
      type: 'xeduhub_workflow_infer',
      message0: '%1 模型推理 %2 输入 %3',
      args0: [
        buildIconField('workflow'),
        { type: 'field_variable', name: 'MODEL_VAR', variable: 'lab_flow' },
        { type: 'input_value', name: 'INPUT_DATA' },
      ],
      message1: '结果保存到 %1 更多参数 %2',
      args1: [
        { type: 'field_variable', name: 'RESULT_VAR', variable: 'lab_result' },
        { type: 'field_input', name: PARAMS_FIELD_NAME, text: '{}' },
      ],
      previousStatement: null,
      nextStatement: null,
      colour: '#A596C9',
    },
    {
      type: 'xeduhub_get_result_field',
      message0: '%1 读取 %2 %3',
      args0: [
        buildIconField('result'),
        { type: 'input_value', name: 'RESULT' },
        {
          type: 'field_dropdown',
          name: 'FIELD',
          options: [['raw', 'raw'], ['output', 'output'], ['result_summary', 'result_summary'], ['result_artifacts', 'result_artifacts']],
        },
      ],
      output: null,
      colour: '#8FA4F0',
    },
    {
      type: 'xeduhub_debug_print',
      message0: '%1 打印 %2',
      args0: [buildIconField('debug'), { type: 'input_value', name: 'VALUE' }],
      previousStatement: null,
      nextStatement: null,
      colour: '#A596C9',
    },
    {
      type: 'xeduhub_catch_error',
      message0: '%1 错误 %2',
      args0: [buildIconField('debug'), { type: 'field_input', name: 'ERROR_VAR', text: 'lab_error' }],
      message1: '尝试 %1',
      args1: [{ type: 'input_statement', name: 'TRY' }],
      previousStatement: null,
      nextStatement: null,
      colour: '#A596C9',
    },
  ]);
}

function defineLegacyCompatibilityBlocks(Blockly) {
  defineBlocksWithXEduPalette(Blockly, [
    {
      type: 'xeduhub_set_input',
      message0: '%1 兼容 选图 %2',
      args0: [buildDirectIconField('input'), { type: 'field_input', name: 'INPUT', text: DEFAULT_XEDUHUB_SAMPLE_INPUT }],
      previousStatement: null,
      nextStatement: null,
      colour: '#5A8DEE',
    },
    {
      type: 'xeduhub_flow_set_input',
      message0: '%1 兼容 输入 %2',
      args0: [buildDirectIconField('input'), { type: 'field_input', name: 'INPUT', text: DEFAULT_XEDUHUB_SAMPLE_INPUT }],
      previousStatement: null,
      nextStatement: null,
      colour: '#5A8DEE',
    },
    {
      type: 'xeduhub_classify_run',
      message0: '%1 兼容 分类 %2',
      args0: [buildDirectIconField('cls_imagenet'), { type: 'field_input', name: 'MODEL', text: 'resnet18' }],
      previousStatement: null,
      nextStatement: null,
      colour: '#5A8DEE',
    },
    {
      type: 'xeduhub_detect_run',
      message0: '%1 兼容 检测 %2',
      args0: [buildDirectIconField('det_body'), { type: 'field_input', name: 'MODEL', text: 'det_body' }],
      previousStatement: null,
      nextStatement: null,
      colour: '#5A8DEE',
    },
    {
      type: 'xeduhub_ocr_run',
      message0: '%1 兼容 OCR %2',
      args0: [buildDirectIconField('ocr'), { type: 'field_input', name: 'MODEL', text: 'ocr' }],
      previousStatement: null,
      nextStatement: null,
      colour: '#5A8DEE',
    },
    {
      type: 'xeduhub_run_vision',
      message0: '%1 兼容 运行 %2 模型 %3 输入 %4',
      args0: [
        buildDirectIconField('workflow'),
        { type: 'field_input', name: 'TASK', text: 'classification' },
        { type: 'field_input', name: 'MODEL', text: 'resnet18' },
        { type: 'field_input', name: 'INPUT', text: DEFAULT_XEDUHUB_SAMPLE_INPUT },
      ],
      previousStatement: null,
      nextStatement: null,
      colour: '#5A8DEE',
    },
    {
      type: 'xeduhub_set_model',
      message0: '%1 兼容 模型 %2',
      args0: [buildDirectIconField('workflow'), { type: 'field_input', name: 'MODEL', text: 'resnet18' }],
      previousStatement: null,
      nextStatement: null,
      colour: '#A596C9',
    },
    {
      type: 'xeduhub_create_flow',
      message0: '%1 兼容 流程 %2 模型 %3',
      args0: [
        buildDirectIconField('workflow'),
        { type: 'field_input', name: 'TASK', text: 'classification' },
        { type: 'field_input', name: 'MODEL', text: 'resnet18' },
      ],
      previousStatement: null,
      nextStatement: null,
      colour: '#A596C9',
    },
    {
      type: 'xeduhub_create_workflow',
      message0: '%1 兼容 Workflow %2 模型 %3',
      args0: [
        buildDirectIconField('workflow'),
        { type: 'field_input', name: 'TASK', text: 'classification' },
        { type: 'field_input', name: 'MODEL', text: 'resnet18' },
      ],
      previousStatement: null,
      nextStatement: null,
      colour: '#A596C9',
    },
    {
      type: 'xeduhub_execute_workflow',
      message0: '%1 兼容 执行 %2',
      args0: [buildDirectIconField('workflow'), { type: 'field_input', name: 'RESULT', text: 'lab_result' }],
      previousStatement: null,
      nextStatement: null,
      colour: '#A596C9',
    },
    {
      type: 'xeduhub_flow_execute',
      message0: '%1 兼容 执行 %2',
      args0: [buildDirectIconField('workflow'), { type: 'field_input', name: 'RESULT', text: 'lab_result' }],
      previousStatement: null,
      nextStatement: null,
      colour: '#A596C9',
    },
    {
      type: 'xeduhub_raw_create_workflow',
      message0: '%1 兼容 底层 %2',
      args0: [buildDirectIconField('workflow'), { type: 'field_input', name: 'TASK', text: 'classification' }],
      previousStatement: null,
      nextStatement: null,
      colour: '#A596C9',
    },
    {
      type: 'xeduhub_raw_inference',
      message0: '%1 兼容 推理 %2 模型 %3',
      args0: [
        buildDirectIconField('workflow'),
        { type: 'field_input', name: 'INPUT', text: DEFAULT_XEDUHUB_SAMPLE_INPUT },
        { type: 'field_input', name: 'MODEL', text: 'resnet18' },
      ],
      previousStatement: null,
      nextStatement: null,
      colour: '#A596C9',
    },
    {
      type: 'xeduhub_show_result',
      message0: '%1 兼容 结果 %2',
      args0: [buildDirectIconField('result'), { type: 'field_input', name: 'TITLE', text: '推理结果' }],
      previousStatement: null,
      nextStatement: null,
      colour: '#5A8DEE',
    },
    {
      type: 'xeduhub_print_status',
      message0: '%1 兼容 打印',
      args0: [buildDirectIconField('debug')],
      previousStatement: null,
      nextStatement: null,
      colour: '#A596C9',
    },
  ]);
}

function defineSemanticRunBlocks(Blockly) {
  const tasks = getXEduHubTaskRegistry().tasks || [];
  const blockDefs = tasks.map((task) => {
    const visibleParams = getVisibleTaskParams(task);
    const args0 = [buildIconField(getTaskIconKey(task))];
    const args1 = [{ type: 'input_value', name: 'INPUT_DATA' }];
    const args2 = [{ type: 'field_variable', name: 'RESULT_VAR', variable: 'lab_result' }];
    const args3 = [];
    visibleParams.forEach((param) => {
      if (param.field === 'enum') {
        args3.push({
          type: 'field_dropdown',
          name: getParamFieldName(param.key),
          options: () => (param.options || []).map(([label, value]) => [String(label), String(value)]),
        });
      } else {
        args3.push({
          type: 'field_input',
          name: getParamFieldName(param.key),
          text: String(param.default ?? ''),
        });
      }
    });
    const blockDef = {
      type: getSemanticRunBlockType(task.task_id),
      colour: task.colour || XEDU_SEMANTIC_COLOURS.input,
      message0: `%1 ${formatBlockTitle(getCompactTaskLabel(task))} · ${getTaskFamilyCaption(task)}`,
      args0,
      message1: `对%1进行推理`,
      args1,
      previousStatement: null,
      nextStatement: null,
      inputsInline: false,
      tooltip: getTaskTooltip(task),
    };
    if (visibleParams.length > 0) {
      blockDef.message2 = '结果保存到 %1';
      blockDef.args2 = args2;
      blockDef.message3 = `调参  ${visibleParams.map((param, index) => `${getCompactParamLabel(param)} %${index + 1}`).join('  ')}`;
      blockDef.args3 = args3;
    } else {
      blockDef.message2 = '结果保存到 %1';
      blockDef.args2 = args2;
    }
    return blockDef;
  });
  if (blockDefs.length > 0) {
    defineBlocksWithXEduPalette(Blockly, blockDefs);
  }
}

function defineAdvancedBlocks(Blockly) {
  defineBlocksWithXEduPalette(Blockly, [
    {
      type: 'xeduhub_workflow_create_var',
      message0: '%1 初始化任务 %2 记为 %3',
      args0: [
        buildIconField('workflow'),
        { type: 'field_dropdown', name: TASK_FIELD_NAME, options: getTaskOptions },
        { type: 'field_variable', name: 'MODEL_VAR', variable: 'lab_flow' },
      ],
      previousStatement: null,
      nextStatement: null,
      colour: '#5A8DEE',
    },
    {
      type: 'xeduhub_workflow_infer_var',
      message0: '%1 模型推理 %2',
      args0: [
        buildIconField('workflow'),
        { type: 'field_variable', name: 'MODEL_VAR', variable: 'lab_flow' },
      ],
      message1: '对%1进行推理',
      args1: [{ type: 'input_value', name: 'INPUT_DATA' }],
      message2: '结果保存到 %1',
      args2: [{ type: 'field_variable', name: 'RESULT_VAR', variable: 'lab_result' }],
      message3: '可选检测框 %1 参数 %2',
      args3: [{ type: 'input_value', name: 'BBOX' }, { type: 'field_input', name: PARAMS_FIELD_NAME, text: '{}' }],
      previousStatement: null,
      nextStatement: null,
      colour: '#5A8DEE',
    },
    {
      type: 'xeduhub_workflow_infer_pair',
      message0: '%1 模型推理 %2',
      args0: [
        buildIconField('workflow'),
        { type: 'field_variable', name: 'MODEL_VAR', variable: 'lab_flow' },
      ],
      message1: '对%1进行推理',
      args1: [{ type: 'input_value', name: 'INPUT_DATA' }],
      message2: '结果保存到 %1 图片保存到 %2',
      args2: [
        { type: 'field_variable', name: 'RESULT_VAR', variable: 'lab_result' },
        { type: 'field_variable', name: 'IMAGE_VAR', variable: 'display_img' },
      ],
      message3: '可选检测框 %1 参数 %2',
      args3: [{ type: 'input_value', name: 'BBOX' }, { type: 'field_input', name: PARAMS_FIELD_NAME, text: '{}' }],
      previousStatement: null,
      nextStatement: null,
      colour: '#5A8DEE',
    },
    {
      type: 'xeduhub_result_first_box',
      message0: '%1 第一个框 %2',
      args0: [buildIconField('result'), { type: 'input_value', name: 'RESULT' }],
      output: null,
      colour: '#8FA4F0',
    },
    {
      type: 'xeduhub_bbox_center_x',
      message0: '%1 框中心 X %2',
      args0: [buildIconField('result'), { type: 'input_value', name: 'BOX' }],
      output: 'Number',
      colour: '#8FA4F0',
    },
    {
      type: 'xeduhub_keypoint_axis',
      message0: '%1 关键点 %2',
      args0: [
        buildIconField('pose'),
        { type: 'input_value', name: 'POINTS' },
      ],
      message1: '第 %1 个 %2',
      args1: [
        { type: 'input_value', name: 'INDEX' },
        { type: 'field_dropdown', name: 'AXIS', options: [['X', 'x'], ['Y', 'y']] },
      ],
      output: 'Number',
      colour: '#8FA4F0',
    },
    {
      type: 'xeduhub_ocr_first_text',
      message0: '%1 第一段文字 %2',
      args0: [buildIconField('ocr'), { type: 'input_value', name: 'RESULT' }],
      output: 'String',
      colour: '#8FA4F0',
    },
    {
      type: 'xeduhub_cv_open_camera',
      message0: '%1 打开摄像头 %2',
      args0: [
        buildIconField('camera'),
        { type: 'field_number', name: 'SOURCE', value: 0, min: 0, precision: 1 },
      ],
      message1: '记为 %1 窗口 %2',
      args1: [
        { type: 'field_variable', name: 'CAMERA_VAR', variable: 'camera' },
        { type: 'field_input', name: 'WINDOW', text: 'video' },
      ],
      previousStatement: null,
      nextStatement: null,
      colour: '#2D9C8F',
    },
    {
      type: 'xeduhub_cv_open_video',
      message0: '%1 打开视频 %2',
      args0: [
        buildIconField('video'),
        { type: 'input_value', name: 'SOURCE' },
      ],
      message1: '记为 %1 窗口 %2',
      args1: [
        { type: 'field_variable', name: 'CAMERA_VAR', variable: 'video' },
        { type: 'field_input', name: 'WINDOW', text: 'video' },
      ],
      previousStatement: null,
      nextStatement: null,
      colour: '#2D9C8F',
    },
    {
      type: 'xeduhub_cv_loop_frames',
      message0: '%1 循环读取 %2 到 %3',
      args0: [
        buildIconField('camera'),
        { type: 'field_variable', name: 'CAMERA_VAR', variable: 'camera' },
        { type: 'field_variable', name: 'FRAME_VAR', variable: 'frame' },
      ],
      message1: '按键 %1 退出 延时 %2 ms',
      args1: [
        { type: 'field_input', name: 'QUIT_KEY', text: 'q' },
        { type: 'field_number', name: 'DELAY', value: 1, min: 1, precision: 1 },
      ],
      message2: '执行 %1',
      args2: [{ type: 'input_statement', name: 'DO' }],
      previousStatement: null,
      nextStatement: null,
      colour: '#2D9C8F',
    },
    {
      type: 'xeduhub_cv_show_frame',
      message0: '%1 显示画面 %2 窗口 %3',
      args0: [
        buildIconField('camera'),
        { type: 'input_value', name: 'FRAME' },
        { type: 'field_input', name: 'WINDOW', text: 'video' },
      ],
      previousStatement: null,
      nextStatement: null,
      colour: '#2D9C8F',
    },
    {
      type: 'xeduhub_cv_draw_boxes',
      message0: '%1 图像 %2 画检测框 %3',
      args0: [
        buildIconField('resultImage'),
        { type: 'input_value', name: 'IMAGE' },
        { type: 'input_value', name: 'BOXES' },
      ],
      message1: '输出到 %1',
      args1: [
        { type: 'field_variable', name: 'IMAGE_VAR', variable: 'display_img' },
      ],
      previousStatement: null,
      nextStatement: null,
      colour: '#2D9C8F',
    },
    {
      type: 'xeduhub_draw_boxes_image',
      message0: '%1 给图像 %2 画检测框 %3',
      args0: [
        buildIconField('resultImage'),
        { type: 'input_value', name: 'IMAGE' },
        { type: 'input_value', name: 'BOXES' },
      ],
      output: null,
      colour: '#2D9C8F',
    },
    {
      type: 'xeduhub_cv_cvt_color',
      message0: '%1 图像 %2 颜色转换 %3',
      args0: [
        buildIconField('resultImage'),
        { type: 'input_value', name: 'IMAGE' },
        {
          type: 'field_dropdown',
          name: 'COLOR_CODE',
          options: [
            ['BGR 转 RGB', 'COLOR_BGR2RGB'],
            ['BGR 转灰度', 'COLOR_BGR2GRAY'],
            ['RGB 转 BGR', 'COLOR_RGB2BGR'],
            ['灰度转 BGR', 'COLOR_GRAY2BGR'],
            ['BGR 转 HSV', 'COLOR_BGR2HSV'],
          ],
        },
      ],
      output: null,
      colour: '#2D9C8F',
      tooltip: '使用 cv2.cvtColor 转换图像颜色空间。',
    },
    {
      type: 'xeduhub_cv_resize_image',
      message0: '%1 图像 %2 缩放',
      args0: [
        buildIconField('resultImage'),
        { type: 'input_value', name: 'IMAGE' },
      ],
      message1: '宽 %1 高 %2',
      args1: [
        { type: 'input_value', name: 'WIDTH' },
        { type: 'input_value', name: 'HEIGHT' },
      ],
      output: null,
      colour: '#2D9C8F',
      tooltip: '使用 cv2.resize 调整图像大小。',
    },
    {
      type: 'xeduhub_cv_crop_image',
      message0: '%1 图像 %2 裁剪',
      args0: [
        buildIconField('resultImage'),
        { type: 'input_value', name: 'IMAGE' },
      ],
      message1: 'x %1 y %2 宽 %3 高 %4',
      args1: [
        { type: 'input_value', name: 'CROP_X' },
        { type: 'input_value', name: 'CROP_Y' },
        { type: 'input_value', name: 'CROP_W' },
        { type: 'input_value', name: 'CROP_H' },
      ],
      output: null,
      colour: '#2D9C8F',
      tooltip: '按 x、y、宽、高裁剪图像区域。',
    },
    {
      type: 'xeduhub_cv_flip_image',
      message0: '%1 图像 %2 翻转 %3',
      args0: [
        buildIconField('resultImage'),
        { type: 'input_value', name: 'IMAGE' },
        { type: 'field_dropdown', name: 'FLIP_CODE', options: [['左右', '1'], ['上下', '0'], ['上下左右', '-1']] },
      ],
      output: null,
      colour: '#2D9C8F',
      tooltip: '使用 cv2.flip 翻转图像。',
    },
    {
      type: 'xeduhub_cv_rotate_image',
      message0: '%1 图像 %2 旋转 %3',
      args0: [
        buildIconField('resultImage'),
        { type: 'input_value', name: 'IMAGE' },
        {
          type: 'field_dropdown',
          name: 'ROTATE_CODE',
          options: [
            ['顺时针 90°', 'ROTATE_90_CLOCKWISE'],
            ['逆时针 90°', 'ROTATE_90_COUNTERCLOCKWISE'],
            ['180°', 'ROTATE_180'],
          ],
        },
      ],
      output: null,
      colour: '#2D9C8F',
      tooltip: '使用 cv2.rotate 旋转图像。',
    },
    {
      type: 'xeduhub_cv_gaussian_blur',
      message0: '%1 图像 %2 高斯模糊 核大小 %3',
      args0: [
        buildIconField('resultImage'),
        { type: 'input_value', name: 'IMAGE' },
        { type: 'field_number', name: 'KSIZE', value: 5, min: 1, precision: 2 },
      ],
      output: null,
      colour: '#2D9C8F',
      tooltip: '使用 cv2.GaussianBlur 做平滑去噪。',
    },
    {
      type: 'xeduhub_cv_canny',
      message0: '%1 图像 %2 边缘检测',
      args0: [
        buildIconField('resultImage'),
        { type: 'input_value', name: 'IMAGE' },
      ],
      message1: '阈值1 %1 阈值2 %2',
      args1: [
        { type: 'input_value', name: 'THRESHOLD1' },
        { type: 'input_value', name: 'THRESHOLD2' },
      ],
      output: null,
      colour: '#2D9C8F',
      tooltip: '使用 cv2.Canny 提取图像边缘。',
    },
    {
      type: 'xeduhub_cv_threshold',
      message0: '%1 图像 %2 二值化',
      args0: [
        buildIconField('resultImage'),
        { type: 'input_value', name: 'IMAGE' },
      ],
      message1: '阈值 %1 最大值 %2',
      args1: [
        { type: 'input_value', name: 'THRESHOLD' },
        { type: 'input_value', name: 'MAX_VALUE' },
      ],
      output: null,
      colour: '#2D9C8F',
      tooltip: '使用 cv2.threshold 对图像做二值化。',
    },
    {
      type: 'xeduhub_cv_put_text',
      message0: '%1 图像 %2 写字 %3',
      args0: [
        buildIconField('resultImage'),
        { type: 'input_value', name: 'IMAGE' },
        { type: 'field_input', name: 'TEXT', text: 'XEdu' },
      ],
      message1: 'x %1 y %2 大小 %3 粗细 %4',
      args1: [
        { type: 'field_number', name: 'TEXT_X', value: 20, min: 0, precision: 1 },
        { type: 'field_number', name: 'TEXT_Y', value: 40, min: 0, precision: 1 },
        { type: 'field_number', name: 'TEXT_SCALE', value: 1, min: 0.1, precision: 0.1 },
        { type: 'field_number', name: 'TEXT_THICKNESS', value: 2, min: 1, precision: 1 },
      ],
      output: null,
      colour: '#2D9C8F',
      tooltip: '使用 cv2.putText 在图像上绘制文字。',
    },
    {
      type: 'xeduhub_cv_save_image',
      message0: '%1 保存图片 %2 到 %3',
      args0: [
        buildIconField('save'),
        { type: 'input_value', name: 'IMAGE' },
        { type: 'input_value', name: 'PATH' },
      ],
      previousStatement: null,
      nextStatement: null,
      colour: '#2D9C8F',
    },
    {
      type: 'xeduhub_media_frames_to_video',
      message0: '%1 图片目录 %2 合成视频 %3',
      args0: [
        buildIconField('video'),
        { type: 'input_value', name: 'OUTPUT_DIR' },
        { type: 'input_value', name: 'OUTPUT_VIDEO' },
      ],
      message1: '帧率 %1',
      args1: [
        { type: 'field_number', name: 'FPS', value: 30, min: 1, precision: 1 },
      ],
      previousStatement: null,
      nextStatement: null,
      colour: '#2D9C8F',
    },
    {
      type: 'xeduhub_http_get',
      message0: '%1 GET %2',
      args0: [
        buildIconField('http'),
        { type: 'input_value', name: 'URL' },
      ],
      message1: '结果到 %1',
      args1: [
        { type: 'field_variable', name: 'RESPONSE_VAR', variable: 'response' },
      ],
      previousStatement: null,
      nextStatement: null,
      colour: '#E38B54',
    },
    {
      type: 'xeduhub_http_open_stream',
      message0: '%1 打开网络视频流 %2',
      args0: [
        buildIconField('http'),
        { type: 'input_value', name: 'URL' },
      ],
      message1: '记为 %1',
      args1: [
        { type: 'field_variable', name: 'STREAM_VAR', variable: 'response' },
      ],
      previousStatement: null,
      nextStatement: null,
      colour: '#E38B54',
    },
    {
      type: 'xeduhub_http_loop_stream_frames',
      message0: '%1 循环读取流画面 %2 到 %3',
      args0: [
        buildIconField('http'),
        { type: 'field_variable', name: 'STREAM_VAR', variable: 'response' },
        { type: 'field_variable', name: 'FRAME_VAR', variable: 'frame' },
      ],
      message1: '分块大小 %1 最小长度 %2',
      args1: [
        { type: 'field_number', name: 'CHUNK_SIZE', value: 16384, min: 1, precision: 1 },
        { type: 'field_number', name: 'MIN_SIZE', value: 100, min: 1, precision: 1 },
      ],
      message2: '执行 %1',
      args2: [{ type: 'input_statement', name: 'DO' }],
      previousStatement: null,
      nextStatement: null,
      colour: '#E38B54',
    },
    {
      type: 'xeduhub_http_iter_chunks',
      message0: '%1 遍历网络分块 %2',
      args0: [
        buildIconField('http'),
        { type: 'field_variable', name: 'STREAM_VAR', variable: 'response' },
      ],
      message1: '到 %1 大小 %2',
      args1: [
        { type: 'field_variable', name: 'CHUNK_VAR', variable: 'chunk' },
        { type: 'field_number', name: 'CHUNK_SIZE', value: 16384, min: 1, precision: 1 },
      ],
      message2: '执行 %1',
      args2: [{ type: 'input_statement', name: 'DO' }],
      previousStatement: null,
      nextStatement: null,
      colour: '#E38B54',
    },
    {
      type: 'xeduhub_chunk_over_size',
      message0: '%1 分块 %2 大于 %3',
      args0: [
        buildIconField('http'),
        { type: 'input_value', name: 'CHUNK' },
        { type: 'input_value', name: 'SIZE' },
      ],
      output: 'Boolean',
      colour: '#D88B46',
    },
    {
      type: 'xeduhub_cv_decode_chunk',
      message0: '%1 分块转画面 %2 到 %3',
      args0: [
        buildIconField('camera'),
        { type: 'input_value', name: 'CHUNK' },
        { type: 'field_variable', name: 'IMAGE_VAR', variable: 'frame' },
      ],
      previousStatement: null,
      nextStatement: null,
      colour: '#E38B54',
    },
    {
      type: 'xeduhub_decode_chunk_image',
      message0: '%1 分块转画面 %2',
      args0: [
        buildIconField('camera'),
        { type: 'input_value', name: 'CHUNK' },
      ],
      output: null,
      colour: '#E38B54',
    },
    {
      type: 'xeduhub_http_send_command',
      message0: '%1 发送设备指令 %2',
      args0: [
        buildIconField('device'),
        { type: 'input_value', name: 'BASE_URL' },
      ],
      message1: '动作 %1 响应到 %2',
      args1: [
        { type: 'input_value', name: 'CMD' },
        { type: 'field_variable', name: 'RESPONSE_VAR', variable: 'response' },
      ],
      message2: '停止指令 %1 延时 %2 秒',
      args2: [
        { type: 'field_input', name: 'STOP_CMD', text: 'S' },
        { type: 'field_number', name: 'DELAY', value: 0.3, min: 0, precision: 0.1 },
      ],
      previousStatement: null,
      nextStatement: null,
      colour: '#E38B54',
    },
    {
      type: 'xeduhub_servo_setup',
      message0: '%1 初始化舵机',
      args0: [
        buildIconField('device'),
      ],
      message1: '开发板 %1 引脚 %2 记为 %3',
      args1: [
        { type: 'field_input', name: 'BOARD', text: 'uno' },
        { type: 'field_input', name: 'PIN', text: 'D4' },
        { type: 'field_variable', name: 'SERVO_VAR', variable: 'servo' },
      ],
      previousStatement: null,
      nextStatement: null,
      colour: '#E38B54',
    },
    {
      type: 'xeduhub_servo_write_angle',
      message0: '%1 舵机 %2 设置角度 %3',
      args0: [
        buildIconField('device'),
        { type: 'field_variable', name: 'SERVO_VAR', variable: 'servo' },
        { type: 'input_value', name: 'ANGLE' },
      ],
      previousStatement: null,
      nextStatement: null,
      colour: '#E38B54',
    },
    {
      type: 'xeduhub_polyfit_quadratic',
      message0: '%1 拟合二次曲线',
      args0: [
        buildIconField('math'),
      ],
      message1: 'X %1 Y %2',
      args1: [
        { type: 'input_value', name: 'X_VALUES' },
        { type: 'input_value', name: 'Y_VALUES' },
      ],
      message2: '结果到 %1',
      args2: [
        { type: 'field_variable', name: 'COEFF_VAR', variable: 'coeff' },
      ],
      previousStatement: null,
      nextStatement: null,
      colour: '#56C7B7',
    },
    {
      type: 'xeduhub_quadratic_fit',
      message0: '%1 拟合二次曲线',
      args0: [
        buildIconField('math'),
      ],
      message1: 'X %1 Y %2',
      args1: [
        { type: 'input_value', name: 'X_VALUES' },
        { type: 'input_value', name: 'Y_VALUES' },
      ],
      output: null,
      colour: '#56C7B7',
    },
    {
      type: 'xeduhub_quadratic_eval',
      message0: '%1 二次曲线 %2 在 %3',
      args0: [
        buildIconField('math'),
        { type: 'input_value', name: 'COEFFS' },
        { type: 'input_value', name: 'X' },
      ],
      output: 'Number',
      colour: '#56C7B7',
    },
    {
      type: 'xeduhub_math_distance',
      message0: '%1 两点距离',
      args0: [
        buildIconField('math'),
      ],
      message1: 'x1 %1 y1 %2',
      args1: [
        { type: 'input_value', name: 'X1' },
        { type: 'input_value', name: 'Y1' },
      ],
      message2: 'x2 %1 y2 %2',
      args2: [
        { type: 'input_value', name: 'X2' },
        { type: 'input_value', name: 'Y2' },
      ],
      output: 'Number',
      colour: '#56C7B7',
    },
  ]);
}

function defineBaseGenerators(pythonGenerator) {
  pythonGenerator.forBlock.xeduhub_set_input_resource = (block) => `lab_input = ${JSON.stringify(block.getFieldValue('INPUT') || DEFAULT_XEDUHUB_SAMPLE_INPUT)}\n`;
  pythonGenerator.forBlock.xeduhub_load_image_to_var = (block) => {
    ensureCvSupport(pythonGenerator);
    const imageVar = getVariableName(block, 'IMAGE_VAR', 'lab_input');
    return `${imageVar} = cv2.imread(${JSON.stringify(block.getFieldValue('INPUT') || DEFAULT_XEDUHUB_SAMPLE_INPUT)})\n`;
  };
  pythonGenerator.forBlock.xeduhub_input_image = (block) => [
    JSON.stringify(block.getFieldValue('INPUT') || DEFAULT_XEDUHUB_SAMPLE_INPUT),
    pythonGenerator.ORDER_ATOMIC,
  ];
  pythonGenerator.forBlock.xeduhub_set_input_list = (block) => {
    const raw = block.getFieldValue('INPUTS') || '[]';
    const parsed = parseJsonish(raw, raw);
    return `lab_input = ${toPythonLiteral(parsed)}\n`;
  };
  pythonGenerator.forBlock.xeduhub_show_result_card = (block) => {
    ensureResultHelpers(pythonGenerator);
    const titleCode = JSON.stringify(block.getFieldValue('TITLE') || '运行结果');
    const legacyResultName = String(block.getFieldValue('RESULT') || '').trim();
    const resultCode = getValueCode(block, 'RESULT', pythonGenerator, legacyResultName || 'lab_result', pythonGenerator.ORDER_NONE);
    return `xrt.xedu_show_result_card(${resultCode}, title=${titleCode})\n`;
  };
  pythonGenerator.forBlock.xeduhub_show_result_image = (block) => {
    ensureResultHelpers(pythonGenerator);
    const imageCode = getValueCode(block, 'IMAGE', pythonGenerator, 'None', pythonGenerator.ORDER_NONE);
    return `xrt.xedu_show_result_image(${imageCode})\n`;
  };
  pythonGenerator.forBlock.xeduhub_run_and_record = (block) => {
    ensureResultHelpers(pythonGenerator);
    const legacyNote = String(block.getFieldValue('NOTE') || '').trim();
    const noteCode = getValueCode(block, 'NOTE', pythonGenerator, JSON.stringify(legacyNote || '教学结论已记录'), pythonGenerator.ORDER_NONE);
    return `xrt.xedu_record_conclusion(${noteCode}, lab_result)\n`;
  };
  pythonGenerator.forBlock.xeduhub_clear_result = () => {
    ensureResultHelpers(pythonGenerator);
    return "xrt.xedu_clear_result()\nlab_result = {}\nlab_error = ''\n";
  };
  pythonGenerator.forBlock.xeduhub_workflow_create = (block) => {
    ensureWorkflowImport(pythonGenerator);
    const modelVar = getVariableName(block, 'MODEL_VAR', 'lab_flow');
    const taskId = getFieldText(block, TASK_FIELD_NAME, getXEduHubTaskRegistry().default_task_id || 'det_body');
    const task = getTaskById(taskId);
    if (task?.available === false) {
      return `${getTaskUnavailableComment(taskId)}\n${modelVar} = None\n`;
    }
    return `${modelVar} = wf(task=${quotePythonString(getRuntimeTaskId(taskId))})\n`;
  };
  pythonGenerator.forBlock.xeduhub_workflow_set_task = (block) => {
    ensureWorkflowImport(pythonGenerator);
    const modelVar = getVariableName(block, 'MODEL_VAR', 'lab_flow');
    const taskId = getFieldText(block, TASK_FIELD_NAME, getXEduHubTaskRegistry().default_task_id || 'det_body');
    const task = getTaskById(taskId);
    if (task?.available === false) {
      return `${getTaskUnavailableComment(taskId)}\n${modelVar} = None\n`;
    }
    return `${modelVar} = wf(task=${quotePythonString(getRuntimeTaskId(taskId))})\n`;
  };
  pythonGenerator.forBlock.xeduhub_workflow_set_params = (block) => {
    const params = parseJsonish(block.getFieldValue(PARAMS_FIELD_NAME) || '{}', {});
    return `lab_params = ${toPythonLiteral(params)}\n`;
  };
  pythonGenerator.forBlock.xeduhub_workflow_infer = (block) => {
    const modelVar = getVariableName(block, 'MODEL_VAR', 'lab_flow');
    const resultName = getVariableName(block, 'RESULT_VAR', String(block.getFieldValue('RESULT') || 'lab_result').trim() || 'lab_result');
    const inputCode = getValueCode(block, 'INPUT_DATA', pythonGenerator, 'lab_input', pythonGenerator.ORDER_NONE);
    const params = parseJsonish(block.getFieldValue(PARAMS_FIELD_NAME) || '{}', {});
    return [
      `lab_params = ${toPythonLiteral(params)}`,
      `${resultName} = ${modelVar}.inference(data=${inputCode}, **lab_params)`,
      `lab_result = ${resultName}`,
    ].join('\n') + '\n';
  };
  pythonGenerator.forBlock.xeduhub_get_result_field = (block) => {
    const legacyResultName = String(block.getFieldValue('RESULT') || '').trim();
    const resultName = getValueCode(block, 'RESULT', pythonGenerator, legacyResultName || 'lab_result', pythonGenerator.ORDER_NONE);
    const fieldName = String(block.getFieldValue('FIELD') || 'raw').trim() || 'raw';
    if (fieldName === 'raw') {
      return [resultName, pythonGenerator.ORDER_ATOMIC];
    }
    return [`(${resultName}.get(${JSON.stringify(fieldName)}, '') if isinstance(${resultName}, dict) else '')`, pythonGenerator.ORDER_ATOMIC];
  };
  pythonGenerator.forBlock.xeduhub_debug_print = (block) => {
    const legacyValueName = String(block.getFieldValue('VAR') || '').trim();
    const valueCode = getValueCode(block, 'VALUE', pythonGenerator, legacyValueName || 'lab_result', pythonGenerator.ORDER_NONE);
    return `print(${valueCode})\n`;
  };
  pythonGenerator.forBlock.xeduhub_catch_error = (block) => {
    const tryPart = pythonGenerator.statementToCode(block, 'TRY') || 'pass\n';
    const errVar = block.getFieldValue('ERROR_VAR') || 'lab_error';
    return `try:\n${pythonGenerator.prefixLines(tryPart, '  ')}except Exception as e:\n  ${errVar} = str(e)\n  print('运行失败:', ${errVar})\n`;
  };

  pythonGenerator.forBlock.xeduhub_set_input = (block) => pythonGenerator.forBlock.xeduhub_set_input_resource(block);
  pythonGenerator.forBlock.xeduhub_flow_set_input = (block) => pythonGenerator.forBlock.xeduhub_set_input_resource(block);
  pythonGenerator.forBlock.xeduhub_classify_run = (block) => {
    const task = getTaskById(resolveLegacyTaskId('classification', block.getFieldValue('MODEL') || '')) || getTaskById('cls_imagenet');
    if (task?.available === false) {
      return buildUnavailableTaskPython(task?.task_id || 'cls_imagenet', 'lab_result = {}');
    }
    const { flowVar, runtimeTaskId } = ensureWorkflowInstance(pythonGenerator, task?.task_id || 'cls_imagenet');
    return [
      `lab_task_id = ${JSON.stringify(runtimeTaskId)}`,
      `lab_flow = ${flowVar}`,
      'lab_params = {}',
      'lab_result = lab_flow.inference(data=lab_input, **lab_params)',
    ].join('\n') + '\n';
  };
  pythonGenerator.forBlock.xeduhub_detect_run = (block) => {
    const task = getTaskById(resolveLegacyTaskId('detection', block.getFieldValue('MODEL') || '')) || getTaskById('det_body');
    if (task?.available === false) {
      return buildUnavailableTaskPython(task?.task_id || 'det_body', 'lab_result = {}');
    }
    const { flowVar, runtimeTaskId } = ensureWorkflowInstance(pythonGenerator, task?.task_id || 'det_body');
    return [
      `lab_task_id = ${JSON.stringify(runtimeTaskId)}`,
      `lab_flow = ${flowVar}`,
      'lab_params = {}',
      'lab_result = lab_flow.inference(data=lab_input, **lab_params)',
    ].join('\n') + '\n';
  };
  pythonGenerator.forBlock.xeduhub_ocr_run = (block) => {
    const task = getTaskById(resolveLegacyTaskId('ocr', block.getFieldValue('MODEL') || '')) || getTaskById('ocr');
    if (task?.available === false) {
      return buildUnavailableTaskPython(task?.task_id || 'ocr', 'lab_result = {}');
    }
    const { flowVar, runtimeTaskId } = ensureWorkflowInstance(pythonGenerator, task?.task_id || 'ocr');
    return [
      `lab_task_id = ${JSON.stringify(runtimeTaskId)}`,
      `lab_flow = ${flowVar}`,
      'lab_params = {}',
      'lab_result = lab_flow.inference(data=lab_input, **lab_params)',
    ].join('\n') + '\n';
  };
  pythonGenerator.forBlock.xeduhub_run_vision = (block) => {
    const taskId = resolveLegacyTaskId(block.getFieldValue('TASK') || '', block.getFieldValue('MODEL') || '');
    const task = getTaskById(taskId);
    if (task?.available === false) {
      return buildUnavailableTaskPython(taskId, 'lab_result = {}');
    }
    const directInput = block.getFieldValue('INPUT') || DEFAULT_XEDUHUB_SAMPLE_INPUT;
    const { flowVar, runtimeTaskId } = ensureWorkflowInstance(pythonGenerator, taskId);
    return [
      `lab_input = ${JSON.stringify(directInput)}`,
      `lab_task_id = ${JSON.stringify(runtimeTaskId)}`,
      `lab_flow = ${flowVar}`,
      'lab_params = {}',
      'lab_result = lab_flow.inference(data=lab_input, **lab_params)',
    ].join('\n') + '\n';
  };
  pythonGenerator.forBlock.xeduhub_set_model = (block) => {
    const taskId = resolveLegacyTaskId('', block.getFieldValue('MODEL') || '');
    const task = getTaskById(taskId);
    if (task?.available === false) {
      return buildUnavailableTaskPython(taskId);
    }
    const { flowVar, runtimeTaskId } = ensureWorkflowInstance(pythonGenerator, taskId);
    return [
      `lab_task_id = ${JSON.stringify(runtimeTaskId)}`,
      `lab_flow = ${flowVar}`,
    ].join('\n') + '\n';
  };
  pythonGenerator.forBlock.xeduhub_create_flow = (block) => {
    const taskId = resolveLegacyTaskId(block.getFieldValue('TASK') || '', block.getFieldValue('MODEL') || '');
    const task = getTaskById(taskId);
    if (task?.available === false) {
      return buildUnavailableTaskPython(taskId);
    }
    const { flowVar, runtimeTaskId } = ensureWorkflowInstance(pythonGenerator, taskId);
    return [
      `lab_task_id = ${JSON.stringify(runtimeTaskId)}`,
      `lab_flow = ${flowVar}`,
    ].join('\n') + '\n';
  };
  pythonGenerator.forBlock.xeduhub_create_workflow = (block) => pythonGenerator.forBlock.xeduhub_create_flow(block);
  pythonGenerator.forBlock.xeduhub_execute_workflow = (block) => {
    const resultName = String(block.getFieldValue('RESULT') || 'lab_result').trim() || 'lab_result';
    return `if lab_flow is None:\n  raise RuntimeError('当前工作区包含本地不支持的 XEdu 任务，无法执行')\n${resultName} = lab_flow.inference(data=lab_input, **{})\nlab_result = ${resultName}\n`;
  };
  pythonGenerator.forBlock.xeduhub_flow_execute = (block) => pythonGenerator.forBlock.xeduhub_execute_workflow(block);
  pythonGenerator.forBlock.xeduhub_raw_create_workflow = (block) => {
    const taskId = resolveLegacyTaskId(block.getFieldValue('TASK') || '', '');
    const task = getTaskById(taskId);
    if (task?.available === false) {
      return buildUnavailableTaskPython(taskId);
    }
    const { flowVar, runtimeTaskId } = ensureWorkflowInstance(pythonGenerator, taskId);
    return [
      `lab_task_id = ${JSON.stringify(runtimeTaskId)}`,
      `lab_flow = ${flowVar}`,
    ].join('\n') + '\n';
  };
  pythonGenerator.forBlock.xeduhub_raw_inference = (block) => {
    const taskId = resolveLegacyTaskId('', block.getFieldValue('MODEL') || '');
    const task = getTaskById(taskId);
    if (task?.available === false) {
      return buildUnavailableTaskPython(taskId, 'lab_result = {}');
    }
    const inputValue = block.getFieldValue('INPUT') || DEFAULT_XEDUHUB_SAMPLE_INPUT;
    const { flowVar, runtimeTaskId } = ensureWorkflowInstance(pythonGenerator, taskId);
    return [
      `lab_task_id = ${JSON.stringify(runtimeTaskId)}`,
      `lab_flow = ${flowVar}`,
      `lab_input = ${JSON.stringify(inputValue)}`,
      'lab_result = lab_flow.inference(data=lab_input, **{})',
    ].join('\n') + '\n';
  };
  pythonGenerator.forBlock.xeduhub_show_result = (block) => {
    ensureResultHelpers(pythonGenerator);
    return `xrt.xedu_show_result_card(lab_result, title=${JSON.stringify(block.getFieldValue('TITLE') || '推理结果')})\n`;
  };
  pythonGenerator.forBlock.xeduhub_print_status = () => "print('XEduHub workflow ready')\n";
}

function defineSemanticRunGenerators(pythonGenerator) {
  (getXEduHubTaskRegistry().tasks || []).forEach((task) => {
    pythonGenerator.forBlock[getSemanticRunBlockType(task.task_id)] = (block) => {
      if (task?.available === false) {
        return buildUnavailableTaskPython(task.task_id, 'lab_result = {}');
      }
      const { flowVar, runtimeTaskId } = ensureWorkflowInstance(pythonGenerator, task.task_id);
      const paramLines = buildParamPythonLines(task, block);
      const inputCode = getValueCode(block, 'INPUT_DATA', pythonGenerator, 'lab_input', pythonGenerator.ORDER_NONE);
      const resultVar = getVariableName(block, 'RESULT_VAR', 'lab_result');
      const extraArgs = paramLines.length ? ', **lab_params' : '';
      return [
        `lab_task_id = ${JSON.stringify(runtimeTaskId)}`,
        `lab_flow = ${flowVar}`,
        ...paramLines,
        `${resultVar} = lab_flow.inference(data=${inputCode}${extraArgs})`,
        `lab_result = ${resultVar}`,
      ].join('\n') + '\n';
    };
  });
}

function buildInferParamsLines(block, pythonGenerator, paramsName = 'xedu_params') {
  const params = getPythonParamsObject(block);
  const bboxCode = getValueCode(block, 'BBOX', pythonGenerator, 'None', pythonGenerator.ORDER_NONE);
  const hasParams = Object.keys(params).length > 0;
  const lines = hasParams ? [`${paramsName} = ${toPythonLiteral(params)}`] : [];
  if (bboxCode !== 'None') {
    if (!hasParams) {
      lines.push(`${paramsName} = {}`);
    }
    lines.push(`if ${bboxCode} is not None:`);
    lines.push(`  ${paramsName}['bbox'] = ${bboxCode}`);
  }
  return lines;
}

function defineAdvancedGenerators(pythonGenerator) {
  pythonGenerator.forBlock.xeduhub_workflow_create_var = (block) => {
    ensureWorkflowImport(pythonGenerator);
    const modelVar = getVariableName(block, 'MODEL_VAR', 'lab_flow');
    const taskId = getFieldText(block, TASK_FIELD_NAME, getXEduHubTaskRegistry().default_task_id || 'det_body');
    const task = getTaskById(taskId);
    if (task?.available === false) {
      return `${getTaskUnavailableComment(taskId)}\n${modelVar} = None\n`;
    }
    return `${modelVar} = wf(task=${quotePythonString(getRuntimeTaskId(taskId))})\n`;
  };

  pythonGenerator.forBlock.xeduhub_workflow_infer_var = (block) => {
    const modelVar = getVariableName(block, 'MODEL_VAR', 'lab_flow');
    const resultVar = getVariableName(block, 'RESULT_VAR', 'lab_result');
    const inputCode = getValueCode(block, 'INPUT_DATA', pythonGenerator, 'lab_input', pythonGenerator.ORDER_NONE);
    const lines = buildInferParamsLines(block, pythonGenerator);
    const extraArgs = lines.length ? ', **xedu_params' : '';
    lines.unshift(`if ${modelVar} is None:`);
    lines.splice(1, 0, "  raise RuntimeError('当前工作区包含本地不支持的 XEdu 任务，无法执行')");
    lines.push(`${resultVar} = ${modelVar}.inference(data=${inputCode}${extraArgs})`);
    lines.push(`lab_result = ${resultVar}`);
    return `${lines.join('\n')}\n`;
  };

  pythonGenerator.forBlock.xeduhub_workflow_infer_pair = (block) => {
    ensureResultHelpers(pythonGenerator);
    const modelVar = getVariableName(block, 'MODEL_VAR', 'lab_flow');
    const resultVar = getVariableName(block, 'RESULT_VAR', 'lab_result');
    const imageVar = getVariableName(block, 'IMAGE_VAR', 'display_img');
    const inputCode = getValueCode(block, 'INPUT_DATA', pythonGenerator, 'lab_input', pythonGenerator.ORDER_NONE);
    const lines = buildInferParamsLines(block, pythonGenerator);
    const extraArgs = lines.length ? ', **xedu_params' : '';
    lines.unshift(`if ${modelVar} is None:`);
    lines.splice(1, 0, "  raise RuntimeError('当前工作区包含本地不支持的 XEdu 任务，无法执行')");
    lines.push(`xedu_pair_value = ${modelVar}.inference(data=${inputCode}${extraArgs})`);
    lines.push(`${resultVar}, ${imageVar} = xrt.xedu_split_result(xedu_pair_value)`);
    lines.push(`lab_result = ${resultVar}`);
    return `${lines.join('\n')}\n`;
  };

  pythonGenerator.forBlock.xeduhub_result_first_box = (block) => {
    ensureResultHelpers(pythonGenerator);
    const resultCode = getValueCode(block, 'RESULT', pythonGenerator, 'lab_result', pythonGenerator.ORDER_NONE);
    return [`xrt.xedu_first_box(${resultCode})`, pythonGenerator.ORDER_FUNCTION_CALL];
  };

  pythonGenerator.forBlock.xeduhub_bbox_center_x = (block) => {
    ensureResultHelpers(pythonGenerator);
    const boxCode = getValueCode(block, 'BOX', pythonGenerator, 'None', pythonGenerator.ORDER_NONE);
    return [`xrt.xedu_bbox_center_x(${boxCode})`, pythonGenerator.ORDER_FUNCTION_CALL];
  };

  pythonGenerator.forBlock.xeduhub_keypoint_axis = (block) => {
    ensureResultHelpers(pythonGenerator);
    const pointsCode = getValueCode(block, 'POINTS', pythonGenerator, '[]', pythonGenerator.ORDER_NONE);
    const indexCode = getValueCode(block, 'INDEX', pythonGenerator, '0', pythonGenerator.ORDER_NONE);
    const axis = getFieldText(block, 'AXIS', 'x');
    return [`xrt.xedu_keypoint_axis(${pointsCode}, ${indexCode}, ${quotePythonString(axis)})`, pythonGenerator.ORDER_FUNCTION_CALL];
  };

  pythonGenerator.forBlock.xeduhub_ocr_first_text = (block) => {
    ensureResultHelpers(pythonGenerator);
    const resultCode = getValueCode(block, 'RESULT', pythonGenerator, 'lab_result', pythonGenerator.ORDER_NONE);
    return [`xrt.xedu_first_text(${resultCode})`, pythonGenerator.ORDER_FUNCTION_CALL];
  };

  pythonGenerator.forBlock.xeduhub_cv_open_camera = (block) => {
    ensureCvSupport(pythonGenerator);
    const cameraVar = getVariableName(block, 'CAMERA_VAR', 'camera');
    const source = getNumberField(block, 'SOURCE', '0');
    const windowName = getFieldText(block, 'WINDOW', 'video');
    return `${cameraVar} = xrt.XEduCamera.camera(${source}, window_name=${quotePythonString(windowName)})\n`;
  };

  pythonGenerator.forBlock.xeduhub_cv_open_video = (block) => {
    ensureCvSupport(pythonGenerator);
    const cameraVar = getVariableName(block, 'CAMERA_VAR', 'video');
    const sourceCode = getValueCode(block, 'SOURCE', pythonGenerator, quotePythonString('demo.mp4'), pythonGenerator.ORDER_NONE);
    const windowName = getFieldText(block, 'WINDOW', 'video');
    return `${cameraVar} = xrt.XEduCamera.video(${sourceCode}, window_name=${quotePythonString(windowName)})\n`;
  };

  pythonGenerator.forBlock.xeduhub_cv_loop_frames = (block) => {
    ensureCvSupport(pythonGenerator);
    const cameraVar = getVariableName(block, 'CAMERA_VAR', 'camera');
    const frameVar = getVariableName(block, 'FRAME_VAR', 'frame');
    const quitKey = getFieldText(block, 'QUIT_KEY', 'q') || 'q';
    const delay = getNumberField(block, 'DELAY', '1');
    const branch = pythonGenerator.statementToCode(block, 'DO') || 'pass\n';
    const body = pythonGenerator.prefixLines(branch || 'pass\n', '    ');
    return [
      'try:',
      `  while ${cameraVar}.is_opened():`,
      `    ${frameVar} = ${cameraVar}.read()`,
      `    if ${frameVar} is None:`,
      '      break',
      body.trimEnd() ? body.trimEnd() : '    pass',
      `    if ${cameraVar}.should_quit(${quotePythonString(quitKey)}, delay=${delay}):`,
      '      break',
      'finally:',
      `  ${cameraVar}.close()`,
    ].join('\n') + '\n';
  };

  pythonGenerator.forBlock.xeduhub_cv_show_frame = (block) => {
    ensureCvSupport(pythonGenerator);
    const frameCode = getValueCode(block, 'FRAME', pythonGenerator, 'None', pythonGenerator.ORDER_NONE);
    const windowName = getFieldText(block, 'WINDOW', 'video');
    return `cv2.imshow(${quotePythonString(windowName)}, ${frameCode})\n`;
  };

  pythonGenerator.forBlock.xeduhub_cv_draw_boxes = (block) => {
    ensureCvSupport(pythonGenerator);
    const imageVar = getVariableName(block, 'IMAGE_VAR', 'display_img');
    const imageCode = getValueCode(block, 'IMAGE', pythonGenerator, 'None', pythonGenerator.ORDER_NONE);
    const boxesCode = getValueCode(block, 'BOXES', pythonGenerator, '[]', pythonGenerator.ORDER_NONE);
    return `${imageVar} = xrt.xedu_draw_boxes(${imageCode}, ${boxesCode})\n`;
  };

  pythonGenerator.forBlock.xeduhub_draw_boxes_image = (block) => {
    ensureCvSupport(pythonGenerator);
    const imageCode = getValueCode(block, 'IMAGE', pythonGenerator, 'None', pythonGenerator.ORDER_NONE);
    const boxesCode = getValueCode(block, 'BOXES', pythonGenerator, '[]', pythonGenerator.ORDER_NONE);
    return [`xrt.xedu_draw_boxes(${imageCode}, ${boxesCode})`, pythonGenerator.ORDER_FUNCTION_CALL];
  };

  pythonGenerator.forBlock.xeduhub_cv_cvt_color = (block) => {
    ensureCvSupport(pythonGenerator);
    const imageCode = getValueCode(block, 'IMAGE', pythonGenerator, 'None', pythonGenerator.ORDER_NONE);
    const colorCode = getFieldText(block, 'COLOR_CODE', 'COLOR_BGR2RGB');
    return [`cv2.cvtColor(${imageCode}, cv2.${colorCode})`, pythonGenerator.ORDER_FUNCTION_CALL];
  };

  pythonGenerator.forBlock.xeduhub_cv_resize_image = (block) => {
    ensureCvSupport(pythonGenerator);
    const imageCode = getValueCode(block, 'IMAGE', pythonGenerator, 'None', pythonGenerator.ORDER_NONE);
    const widthCode = getValueCode(block, 'WIDTH', pythonGenerator, '640', pythonGenerator.ORDER_NONE);
    const heightCode = getValueCode(block, 'HEIGHT', pythonGenerator, '480', pythonGenerator.ORDER_NONE);
    return [`cv2.resize(${imageCode}, (int(${widthCode}), int(${heightCode})))`, pythonGenerator.ORDER_FUNCTION_CALL];
  };

  pythonGenerator.forBlock.xeduhub_cv_crop_image = (block) => {
    ensureCvSupport(pythonGenerator);
    const imageCode = getValueCode(block, 'IMAGE', pythonGenerator, 'None', pythonGenerator.ORDER_NONE);
    const xCode = getValueCode(block, 'CROP_X', pythonGenerator, '0', pythonGenerator.ORDER_NONE);
    const yCode = getValueCode(block, 'CROP_Y', pythonGenerator, '0', pythonGenerator.ORDER_NONE);
    const widthCode = getValueCode(block, 'CROP_W', pythonGenerator, '100', pythonGenerator.ORDER_NONE);
    const heightCode = getValueCode(block, 'CROP_H', pythonGenerator, '100', pythonGenerator.ORDER_NONE);
    return [`xrt.xedu_cv_crop(${imageCode}, ${xCode}, ${yCode}, ${widthCode}, ${heightCode})`, pythonGenerator.ORDER_FUNCTION_CALL];
  };

  pythonGenerator.forBlock.xeduhub_cv_flip_image = (block) => {
    ensureCvSupport(pythonGenerator);
    const imageCode = getValueCode(block, 'IMAGE', pythonGenerator, 'None', pythonGenerator.ORDER_NONE);
    const flipCode = getFieldText(block, 'FLIP_CODE', '1');
    return [`cv2.flip(${imageCode}, ${flipCode})`, pythonGenerator.ORDER_FUNCTION_CALL];
  };

  pythonGenerator.forBlock.xeduhub_cv_rotate_image = (block) => {
    ensureCvSupport(pythonGenerator);
    const imageCode = getValueCode(block, 'IMAGE', pythonGenerator, 'None', pythonGenerator.ORDER_NONE);
    const rotateCode = getFieldText(block, 'ROTATE_CODE', 'ROTATE_90_CLOCKWISE');
    return [`cv2.rotate(${imageCode}, cv2.${rotateCode})`, pythonGenerator.ORDER_FUNCTION_CALL];
  };

  pythonGenerator.forBlock.xeduhub_cv_gaussian_blur = (block) => {
    ensureCvSupport(pythonGenerator);
    const imageCode = getValueCode(block, 'IMAGE', pythonGenerator, 'None', pythonGenerator.ORDER_NONE);
    const size = Math.max(1, Number(getNumberField(block, 'KSIZE', '5')) || 5);
    const oddSize = size % 2 === 0 ? size + 1 : size;
    return [`cv2.GaussianBlur(${imageCode}, (${oddSize}, ${oddSize}), 0)`, pythonGenerator.ORDER_FUNCTION_CALL];
  };

  pythonGenerator.forBlock.xeduhub_cv_canny = (block) => {
    ensureCvSupport(pythonGenerator);
    const imageCode = getValueCode(block, 'IMAGE', pythonGenerator, 'None', pythonGenerator.ORDER_NONE);
    const threshold1Code = getValueCode(block, 'THRESHOLD1', pythonGenerator, '100', pythonGenerator.ORDER_NONE);
    const threshold2Code = getValueCode(block, 'THRESHOLD2', pythonGenerator, '200', pythonGenerator.ORDER_NONE);
    return [`cv2.Canny(${imageCode}, ${threshold1Code}, ${threshold2Code})`, pythonGenerator.ORDER_FUNCTION_CALL];
  };

  pythonGenerator.forBlock.xeduhub_cv_threshold = (block) => {
    ensureCvSupport(pythonGenerator);
    const imageCode = getValueCode(block, 'IMAGE', pythonGenerator, 'None', pythonGenerator.ORDER_NONE);
    const thresholdCode = getValueCode(block, 'THRESHOLD', pythonGenerator, '127', pythonGenerator.ORDER_NONE);
    const maxValueCode = getValueCode(block, 'MAX_VALUE', pythonGenerator, '255', pythonGenerator.ORDER_NONE);
    return [`cv2.threshold(${imageCode}, ${thresholdCode}, ${maxValueCode}, cv2.THRESH_BINARY)[1]`, pythonGenerator.ORDER_FUNCTION_CALL];
  };

  pythonGenerator.forBlock.xeduhub_cv_put_text = (block) => {
    ensureCvSupport(pythonGenerator);
    const imageCode = getValueCode(block, 'IMAGE', pythonGenerator, 'None', pythonGenerator.ORDER_NONE);
    const text = getFieldText(block, 'TEXT', 'XEdu');
    const x = getNumberField(block, 'TEXT_X', '20');
    const y = getNumberField(block, 'TEXT_Y', '40');
    const scale = getNumberField(block, 'TEXT_SCALE', '1');
    const thickness = getNumberField(block, 'TEXT_THICKNESS', '2');
    return [`cv2.putText(${imageCode}, ${quotePythonString(text)}, (${x}, ${y}), cv2.FONT_HERSHEY_SIMPLEX, ${scale}, (0, 255, 0), ${thickness})`, pythonGenerator.ORDER_FUNCTION_CALL];
  };

  pythonGenerator.forBlock.xeduhub_cv_save_image = (block) => {
    ensureCvSupport(pythonGenerator);
    const imageCode = getValueCode(block, 'IMAGE', pythonGenerator, 'None', pythonGenerator.ORDER_NONE);
    const pathCode = getValueCode(block, 'PATH', pythonGenerator, quotePythonString('output.jpg'), pythonGenerator.ORDER_NONE);
    return `cv2.imwrite(${pathCode}, ${imageCode})\n`;
  };

  pythonGenerator.forBlock.xeduhub_media_frames_to_video = (block) => {
    ensureCvSupport(pythonGenerator);
    const dirCode = getValueCode(block, 'OUTPUT_DIR', pythonGenerator, quotePythonString('output'), pythonGenerator.ORDER_NONE);
    const videoCode = getValueCode(block, 'OUTPUT_VIDEO', pythonGenerator, quotePythonString('output_video.mp4'), pythonGenerator.ORDER_NONE);
    const fps = getNumberField(block, 'FPS', '30');
    return `xrt.xedu_frames_to_video(${dirCode}, ${videoCode}, fps=${fps})\n`;
  };

  pythonGenerator.forBlock.xeduhub_http_get = (block) => {
    ensureRequestSupport(pythonGenerator);
    const responseVar = getVariableName(block, 'RESPONSE_VAR', 'response');
    const urlCode = getValueCode(block, 'URL', pythonGenerator, quotePythonString('http://127.0.0.1'), pythonGenerator.ORDER_NONE);
    return `${responseVar} = requests.get(${urlCode})\n`;
  };

  pythonGenerator.forBlock.xeduhub_http_open_stream = (block) => {
    ensureRequestSupport(pythonGenerator);
    const streamVar = getVariableName(block, 'STREAM_VAR', 'response');
    const urlCode = getValueCode(block, 'URL', pythonGenerator, quotePythonString('http://127.0.0.1:81/stream'), pythonGenerator.ORDER_NONE);
    return `${streamVar} = requests.get(${urlCode}, stream=True)\n`;
  };

  pythonGenerator.forBlock.xeduhub_http_loop_stream_frames = (block) => {
    ensureCvSupport(pythonGenerator);
    const streamVar = getVariableName(block, 'STREAM_VAR', 'response');
    const frameVar = getVariableName(block, 'FRAME_VAR', 'frame');
    const chunkSize = getNumberField(block, 'CHUNK_SIZE', '16384');
    const minSize = getNumberField(block, 'MIN_SIZE', '100');
    const branch = pythonGenerator.statementToCode(block, 'DO') || 'pass\n';
    const body = pythonGenerator.prefixLines(branch, '  ');
    return [
      'try:',
      `  for xedu_chunk in ${streamVar}.iter_content(chunk_size=${chunkSize}):`,
      '    if not xedu_chunk:',
      '      continue',
      `    if len(xedu_chunk) <= ${minSize}:`,
      '      continue',
      '    try:',
      '      ' + `${frameVar} = xrt.xedu_decode_chunk_image(xedu_chunk)`,
      '    except Exception:',
      '      continue',
      `    if ${frameVar} is None:`,
      '      continue',
      body.trimEnd() ? body.trimEnd() : '    pass',
      'finally:',
      '  try:',
      `    ${streamVar}.close()`,
      '  except Exception:',
      '    pass',
    ].join('\n') + '\n';
  };

  pythonGenerator.forBlock.xeduhub_http_iter_chunks = (block) => {
    const streamVar = getVariableName(block, 'STREAM_VAR', 'response');
    const chunkVar = getVariableName(block, 'CHUNK_VAR', 'chunk');
    const chunkSize = getNumberField(block, 'CHUNK_SIZE', '16384');
    const branch = pythonGenerator.statementToCode(block, 'DO') || 'pass\n';
    const body = pythonGenerator.prefixLines(branch, '  ');
    return [
      'try:',
      `  for ${chunkVar} in ${streamVar}.iter_content(chunk_size=${chunkSize}):`,
      `    if not ${chunkVar}:`,
      '      continue',
      body.trimEnd() ? body.trimEnd() : '    pass',
      'finally:',
      '  try:',
      `    ${streamVar}.close()`,
      '  except Exception:',
      '    pass',
    ].join('\n') + '\n';
  };

  pythonGenerator.forBlock.xeduhub_chunk_over_size = (block) => {
    const chunkCode = getValueCode(block, 'CHUNK', pythonGenerator, 'b""', pythonGenerator.ORDER_NONE);
    const sizeCode = getValueCode(block, 'SIZE', pythonGenerator, '100', pythonGenerator.ORDER_NONE);
    return [`(len(${chunkCode}) > ${sizeCode})`, pythonGenerator.ORDER_RELATIONAL];
  };

  pythonGenerator.forBlock.xeduhub_cv_decode_chunk = (block) => {
    ensureCvSupport(pythonGenerator);
    const imageVar = getVariableName(block, 'IMAGE_VAR', 'frame');
    const chunkCode = getValueCode(block, 'CHUNK', pythonGenerator, 'b""', pythonGenerator.ORDER_NONE);
    return `${imageVar} = xrt.xedu_decode_chunk_image(${chunkCode})\n`;
  };

  pythonGenerator.forBlock.xeduhub_decode_chunk_image = (block) => {
    ensureCvSupport(pythonGenerator);
    const chunkCode = getValueCode(block, 'CHUNK', pythonGenerator, 'b""', pythonGenerator.ORDER_NONE);
    return [`xrt.xedu_decode_chunk_image(${chunkCode})`, pythonGenerator.ORDER_FUNCTION_CALL];
  };

  pythonGenerator.forBlock.xeduhub_http_send_command = (block) => {
    ensureRequestSupport(pythonGenerator);
    const responseVar = getVariableName(block, 'RESPONSE_VAR', 'response');
    const baseUrlCode = getValueCode(block, 'BASE_URL', pythonGenerator, quotePythonString('http://127.0.0.1/state?cmd='), pythonGenerator.ORDER_NONE);
    const cmdCode = getValueCode(block, 'CMD', pythonGenerator, quotePythonString('S'), pythonGenerator.ORDER_NONE);
    const stopCmd = getFieldText(block, 'STOP_CMD', 'S');
    const delay = getNumberField(block, 'DELAY', '0.3');
    return `${responseVar} = xrt.xedu_send_command(${baseUrlCode}, ${cmdCode}, stop_cmd=${quotePythonString(stopCmd)}, delay=${delay})\n`;
  };

  pythonGenerator.forBlock.xeduhub_servo_setup = (block) => {
    ensureServoSupport(pythonGenerator);
    const board = getFieldText(block, 'BOARD', 'uno');
    const pin = getFieldText(block, 'PIN', 'D4');
    const servoVar = getVariableName(block, 'SERVO_VAR', 'servo');
    return [
      `Board(${quotePythonString(board)}).begin()`,
      `${servoVar} = Servo(Pin(Pin.${pin}))`,
    ].join('\n') + '\n';
  };

  pythonGenerator.forBlock.xeduhub_servo_write_angle = (block) => {
    const servoVar = getVariableName(block, 'SERVO_VAR', 'servo');
    const angleCode = getValueCode(block, 'ANGLE', pythonGenerator, '90', pythonGenerator.ORDER_NONE);
    return `${servoVar}.write_angle(${angleCode})\n`;
  };

  pythonGenerator.forBlock.xeduhub_polyfit_quadratic = (block) => {
    ensureMathSupport(pythonGenerator);
    const coeffVar = getVariableName(block, 'COEFF_VAR', 'coeff');
    const xCode = getValueCode(block, 'X_VALUES', pythonGenerator, '[]', pythonGenerator.ORDER_NONE);
    const yCode = getValueCode(block, 'Y_VALUES', pythonGenerator, '[]', pythonGenerator.ORDER_NONE);
    return `${coeffVar} = np.polyfit(${xCode}, ${yCode}, 2)\n`;
  };

  pythonGenerator.forBlock.xeduhub_quadratic_fit = (block) => {
    ensureMathSupport(pythonGenerator);
    const xCode = getValueCode(block, 'X_VALUES', pythonGenerator, '[]', pythonGenerator.ORDER_NONE);
    const yCode = getValueCode(block, 'Y_VALUES', pythonGenerator, '[]', pythonGenerator.ORDER_NONE);
    return [`np.polyfit(${xCode}, ${yCode}, 2)`, pythonGenerator.ORDER_FUNCTION_CALL];
  };

  pythonGenerator.forBlock.xeduhub_quadratic_eval = (block) => {
    ensureResultHelpers(pythonGenerator);
    const coeffCode = getValueCode(block, 'COEFFS', pythonGenerator, '[0, 0, 0]', pythonGenerator.ORDER_NONE);
    const xCode = getValueCode(block, 'X', pythonGenerator, '0', pythonGenerator.ORDER_NONE);
    return [`xrt.xedu_quadratic_eval(${coeffCode}, ${xCode})`, pythonGenerator.ORDER_FUNCTION_CALL];
  };

  pythonGenerator.forBlock.xeduhub_math_distance = (block) => {
    ensureResultHelpers(pythonGenerator);
    const x1 = getValueCode(block, 'X1', pythonGenerator, '0', pythonGenerator.ORDER_NONE);
    const y1 = getValueCode(block, 'Y1', pythonGenerator, '0', pythonGenerator.ORDER_NONE);
    const x2 = getValueCode(block, 'X2', pythonGenerator, '0', pythonGenerator.ORDER_NONE);
    const y2 = getValueCode(block, 'Y2', pythonGenerator, '0', pythonGenerator.ORDER_NONE);
    return [`xrt.xedu_distance(${x1}, ${y1}, ${x2}, ${y2})`, pythonGenerator.ORDER_FUNCTION_CALL];
  };
}

function defineXEduHubBlocks(Blockly, pythonGenerator) {
  decorateBuiltinBlocklyBlocksWithIcons(Blockly);
  defineBaseBlocks(Blockly);
  defineLegacyCompatibilityBlocks(Blockly);
  defineSemanticRunBlocks(Blockly);
  defineAdvancedBlocks(Blockly);
  defineBaseGenerators(pythonGenerator);
  defineSemanticRunGenerators(pythonGenerator);
  defineAdvancedGenerators(pythonGenerator);
}

function createMigrationReport() {
  return { changed: [], failed: [] };
}

function pushChanged(report, from, to, detail = '') {
  report.changed.push({ from, to, detail });
}

function pushFailed(report, from, detail = '') {
  report.failed.push({ from, detail });
}

function createXmlBlock(doc, type, fields = {}) {
  const block = doc.createElement('block');
  block.setAttribute('type', type);
  Object.entries(fields || {}).forEach(([name, value]) => {
    const field = doc.createElement('field');
    field.setAttribute('name', name);
    field.textContent = String(value ?? '');
    block.appendChild(field);
  });
  return block;
}

function findDirectChild(element, tagName) {
  return Array.from(element.children || []).find((child) => child.tagName === tagName) || null;
}

function findDirectChildBlock(element) {
  return Array.from(element.children || []).find((child) => child.tagName === 'block') || null;
}

function getXmlFieldValue(block, fieldName) {
  const match = Array.from(block.children || []).find((child) => child.tagName === 'field' && child.getAttribute('name') === fieldName);
  return match ? String(match.textContent || '') : '';
}

function setXmlFieldValue(doc, block, fieldName, value) {
  let field = Array.from(block.children || []).find((child) => child.tagName === 'field' && child.getAttribute('name') === fieldName);
  if (!field) {
    field = doc.createElement('field');
    field.setAttribute('name', fieldName);
    block.appendChild(field);
  }
  field.textContent = String(value ?? '');
}

function removeXmlField(block, fieldName) {
  Array.from(block.children || [])
    .filter((child) => child.tagName === 'field' && child.getAttribute('name') === fieldName)
    .forEach((child) => child.remove());
}

function attachXmlNext(doc, tailBlock, headBlock) {
  if (!tailBlock || !headBlock) {
    return;
  }
  let next = findDirectChild(tailBlock, 'next');
  if (!next) {
    next = doc.createElement('next');
    tailBlock.appendChild(next);
  } else {
    next.innerHTML = '';
  }
  next.appendChild(headBlock);
}

function transformXmlBlockSelf(block, doc, report) {
  const type = String(block.getAttribute('type') || '');
  const clone = block.cloneNode(true);
  const cloneNext = findDirectChild(clone, 'next');
  if (cloneNext) {
    cloneNext.remove();
  }
  const familyTask = (task, model) => resolveLegacyTaskId(task, model);
  if (type === 'xeduhub_set_input' || type === 'xeduhub_flow_set_input') {
    clone.setAttribute('type', 'xeduhub_set_input_resource');
    pushChanged(report, type, 'xeduhub_set_input_resource');
    return { head: clone, tail: clone };
  }
  if (type === 'xeduhub_classify_run') {
    const nextType = getSemanticRunBlockType(familyTask('classification', getXmlFieldValue(block, 'MODEL')));
    clone.setAttribute('type', nextType);
    removeXmlField(clone, 'MODEL');
    pushChanged(report, type, nextType);
    return { head: clone, tail: clone };
  }
  if (type === 'xeduhub_detect_run') {
    const nextType = getSemanticRunBlockType(familyTask('detection', getXmlFieldValue(block, 'MODEL')));
    clone.setAttribute('type', nextType);
    removeXmlField(clone, 'MODEL');
    pushChanged(report, type, nextType);
    return { head: clone, tail: clone };
  }
  if (type === 'xeduhub_ocr_run') {
    const nextType = getSemanticRunBlockType(familyTask('ocr', getXmlFieldValue(block, 'MODEL')));
    clone.setAttribute('type', nextType);
    removeXmlField(clone, 'MODEL');
    pushChanged(report, type, nextType);
    return { head: clone, tail: clone };
  }
  if (type === 'xeduhub_run_vision') {
    const taskId = familyTask(getXmlFieldValue(block, 'TASK'), getXmlFieldValue(block, 'MODEL'));
    const runBlock = clone;
    runBlock.setAttribute('type', getSemanticRunBlockType(taskId));
    removeXmlField(runBlock, 'TASK');
    removeXmlField(runBlock, 'MODEL');
    const inputValue = getXmlFieldValue(block, 'INPUT');
    removeXmlField(runBlock, 'INPUT');
    if (!inputValue) {
      pushChanged(report, type, getSemanticRunBlockType(taskId), '保留运行块');
      return { head: runBlock, tail: runBlock };
    }
    const inputBlock = createXmlBlock(doc, 'xeduhub_set_input_resource', { INPUT: inputValue });
    attachXmlNext(doc, inputBlock, runBlock);
    pushChanged(report, type, `${inputBlock.getAttribute('type')} + ${runBlock.getAttribute('type')}`, '拆分为输入块和运行块');
    return { head: inputBlock, tail: runBlock };
  }
  if (type === 'xeduhub_create_flow' || type === 'xeduhub_create_workflow' || type === 'xeduhub_raw_create_workflow') {
    const taskId = familyTask(getXmlFieldValue(block, 'TASK'), getXmlFieldValue(block, 'MODEL'));
    clone.setAttribute('type', 'xeduhub_workflow_create');
    removeXmlField(clone, 'TASK');
    removeXmlField(clone, 'MODEL');
    setXmlFieldValue(doc, clone, TASK_FIELD_NAME, taskId);
    pushChanged(report, type, 'xeduhub_workflow_create');
    return { head: clone, tail: clone };
  }
  if (type === 'xeduhub_set_model') {
    const taskId = familyTask('', getXmlFieldValue(block, 'MODEL'));
    clone.setAttribute('type', 'xeduhub_workflow_set_task');
    removeXmlField(clone, 'MODEL');
    setXmlFieldValue(doc, clone, TASK_FIELD_NAME, taskId);
    pushChanged(report, type, 'xeduhub_workflow_set_task');
    return { head: clone, tail: clone };
  }
  if (type === 'xeduhub_execute_workflow' || type === 'xeduhub_flow_execute') {
    clone.setAttribute('type', 'xeduhub_workflow_infer');
    setXmlFieldValue(doc, clone, PARAMS_FIELD_NAME, '{}');
    pushChanged(report, type, 'xeduhub_workflow_infer');
    return { head: clone, tail: clone };
  }
  if (type === 'xeduhub_raw_inference') {
    const taskId = familyTask('', getXmlFieldValue(block, 'MODEL'));
    const inputValue = getXmlFieldValue(block, 'INPUT');
    const inputBlock = createXmlBlock(doc, 'xeduhub_set_input_resource', { INPUT: inputValue || DEFAULT_XEDUHUB_SAMPLE_INPUT });
    const taskBlock = createXmlBlock(doc, 'xeduhub_workflow_set_task', { [TASK_FIELD_NAME]: taskId });
    const inferBlock = createXmlBlock(doc, 'xeduhub_workflow_infer', {
      RESULT: 'lab_result',
      [PARAMS_FIELD_NAME]: '{}',
    });
    attachXmlNext(doc, inputBlock, taskBlock);
    attachXmlNext(doc, taskBlock, inferBlock);
    pushChanged(report, type, 'xeduhub_set_input_resource + xeduhub_workflow_set_task + xeduhub_workflow_infer');
    return { head: inputBlock, tail: inferBlock };
  }
  if (type === 'xeduhub_show_result') {
    clone.setAttribute('type', 'xeduhub_show_result_card');
    pushChanged(report, type, 'xeduhub_show_result_card');
    return { head: clone, tail: clone };
  }
  if (type === 'xeduhub_print_status') {
    clone.setAttribute('type', 'xeduhub_debug_print');
    removeXmlField(clone, 'STATUS');
    setXmlFieldValue(doc, clone, 'VAR', 'lab_result');
    pushChanged(report, type, 'xeduhub_debug_print');
    return { head: clone, tail: clone };
  }
  return { head: clone, tail: clone };
}

function migrateXmlBlockTree(block, doc, report) {
  const migrated = transformXmlBlockSelf(block, doc, report);
  const originalNext = findDirectChildBlock(findDirectChild(block, 'next') || { children: [] });
  const directContainers = Array.from(migrated.head.children || []).filter((child) => ['statement', 'value'].includes(child.tagName));
  directContainers.forEach((container) => {
    const name = container.getAttribute('name');
    const originalContainer = Array.from(block.children || []).find((child) => child.tagName === container.tagName && child.getAttribute('name') === name);
    const originalChildBlock = originalContainer ? findDirectChildBlock(originalContainer) : null;
    if (!originalChildBlock) {
      return;
    }
    const migratedChild = migrateXmlBlockTree(originalChildBlock, doc, report);
    container.innerHTML = '';
    if (migratedChild.head) {
      container.appendChild(migratedChild.head);
    }
  });
  if (originalNext) {
    const migratedNext = migrateXmlBlockTree(originalNext, doc, report);
    attachXmlNext(doc, migrated.tail, migratedNext.head);
    migrated.tail = migratedNext.tail || migrated.tail;
  }
  return migrated;
}

function migrateXEduHubXmlText(xmlText) {
  const report = createMigrationReport();
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'text/xml');
  const root = doc.documentElement;
  if (!root || root.tagName !== 'xml') {
    pushFailed(report, 'workspace', 'XML 根节点不是 xml');
    return { xmlText, report };
  }
  const topBlocks = Array.from(root.children || []).filter((child) => child.tagName === 'block');
  if (topBlocks.length === 0) {
    return { xmlText, report };
  }
  const nextTopBlocks = [];
  topBlocks.forEach((block) => {
    nextTopBlocks.push(migrateXmlBlockTree(block, doc, report).head);
  });
  root.innerHTML = '';
  nextTopBlocks.forEach((block) => root.appendChild(block));
  return { xmlText: new XMLSerializer().serializeToString(doc), report };
}

function attachJsonNext(tailBlock, headBlock) {
  if (!tailBlock || !headBlock) {
    return;
  }
  tailBlock.next = { block: headBlock };
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function transformJsonBlockSelf(block, report) {
  const type = String(block?.type || '');
  const nextBlock = cloneJson(block);
  delete nextBlock.next;
  const familyTask = (task, model) => resolveLegacyTaskId(task, model);
  if (type === 'xeduhub_set_input' || type === 'xeduhub_flow_set_input') {
    nextBlock.type = 'xeduhub_set_input_resource';
    pushChanged(report, type, 'xeduhub_set_input_resource');
    return { head: nextBlock, tail: nextBlock };
  }
  if (type === 'xeduhub_classify_run') {
    nextBlock.type = getSemanticRunBlockType(familyTask('classification', nextBlock.fields?.MODEL));
    delete nextBlock.fields?.MODEL;
    pushChanged(report, type, nextBlock.type);
    return { head: nextBlock, tail: nextBlock };
  }
  if (type === 'xeduhub_detect_run') {
    nextBlock.type = getSemanticRunBlockType(familyTask('detection', nextBlock.fields?.MODEL));
    delete nextBlock.fields?.MODEL;
    pushChanged(report, type, nextBlock.type);
    return { head: nextBlock, tail: nextBlock };
  }
  if (type === 'xeduhub_ocr_run') {
    nextBlock.type = getSemanticRunBlockType(familyTask('ocr', nextBlock.fields?.MODEL));
    delete nextBlock.fields?.MODEL;
    pushChanged(report, type, nextBlock.type);
    return { head: nextBlock, tail: nextBlock };
  }
  if (type === 'xeduhub_run_vision') {
    const taskId = familyTask(nextBlock.fields?.TASK, nextBlock.fields?.MODEL);
    const runBlock = nextBlock;
    const inputValue = runBlock.fields?.INPUT || '';
    runBlock.type = getSemanticRunBlockType(taskId);
    delete runBlock.fields?.TASK;
    delete runBlock.fields?.MODEL;
    delete runBlock.fields?.INPUT;
    if (!inputValue) {
      pushChanged(report, type, runBlock.type);
      return { head: runBlock, tail: runBlock };
    }
    const inputBlock = { type: 'xeduhub_set_input_resource', fields: { INPUT: inputValue } };
    attachJsonNext(inputBlock, runBlock);
    pushChanged(report, type, `xeduhub_set_input_resource + ${runBlock.type}`, '拆分为输入块和运行块');
    return { head: inputBlock, tail: runBlock };
  }
  if (type === 'xeduhub_create_flow' || type === 'xeduhub_create_workflow' || type === 'xeduhub_raw_create_workflow') {
    nextBlock.type = 'xeduhub_workflow_create';
    nextBlock.fields = nextBlock.fields || {};
    nextBlock.fields[TASK_FIELD_NAME] = familyTask(nextBlock.fields.TASK, nextBlock.fields.MODEL);
    delete nextBlock.fields.TASK;
    delete nextBlock.fields.MODEL;
    pushChanged(report, type, 'xeduhub_workflow_create');
    return { head: nextBlock, tail: nextBlock };
  }
  if (type === 'xeduhub_set_model') {
    nextBlock.type = 'xeduhub_workflow_set_task';
    nextBlock.fields = nextBlock.fields || {};
    nextBlock.fields[TASK_FIELD_NAME] = familyTask('', nextBlock.fields.MODEL);
    delete nextBlock.fields.MODEL;
    pushChanged(report, type, 'xeduhub_workflow_set_task');
    return { head: nextBlock, tail: nextBlock };
  }
  if (type === 'xeduhub_execute_workflow' || type === 'xeduhub_flow_execute') {
    nextBlock.type = 'xeduhub_workflow_infer';
    nextBlock.fields = nextBlock.fields || {};
    nextBlock.fields[PARAMS_FIELD_NAME] = nextBlock.fields[PARAMS_FIELD_NAME] || '{}';
    pushChanged(report, type, 'xeduhub_workflow_infer');
    return { head: nextBlock, tail: nextBlock };
  }
  if (type === 'xeduhub_raw_inference') {
    const taskId = familyTask('', nextBlock.fields?.MODEL);
    const inputBlock = { type: 'xeduhub_set_input_resource', fields: { INPUT: nextBlock.fields?.INPUT || DEFAULT_XEDUHUB_SAMPLE_INPUT } };
    const taskBlock = { type: 'xeduhub_workflow_set_task', fields: { [TASK_FIELD_NAME]: taskId } };
    const inferBlock = { type: 'xeduhub_workflow_infer', fields: { RESULT: 'lab_result', [PARAMS_FIELD_NAME]: '{}' } };
    attachJsonNext(inputBlock, taskBlock);
    attachJsonNext(taskBlock, inferBlock);
    pushChanged(report, type, 'xeduhub_set_input_resource + xeduhub_workflow_set_task + xeduhub_workflow_infer');
    return { head: inputBlock, tail: inferBlock };
  }
  if (type === 'xeduhub_show_result') {
    nextBlock.type = 'xeduhub_show_result_card';
    pushChanged(report, type, 'xeduhub_show_result_card');
    return { head: nextBlock, tail: nextBlock };
  }
  if (type === 'xeduhub_print_status') {
    nextBlock.type = 'xeduhub_debug_print';
    nextBlock.fields = { VAR: 'lab_result' };
    pushChanged(report, type, 'xeduhub_debug_print');
    return { head: nextBlock, tail: nextBlock };
  }
  return { head: nextBlock, tail: nextBlock };
}

function migrateJsonBlockTree(block, report) {
  const originalNext = block?.next?.block ? cloneJson(block.next.block) : null;
  const migrated = transformJsonBlockSelf(block, report);
  Object.entries(migrated.head.inputs || {}).forEach(([key, inputConfig]) => {
    if (!inputConfig?.block) {
      return;
    }
    inputConfig.block = migrateJsonBlockTree(inputConfig.block, report).head;
    migrated.head.inputs[key] = inputConfig;
  });
  Object.entries(migrated.head.statements || {}).forEach(([key, statementConfig]) => {
    if (!statementConfig?.block) {
      return;
    }
    statementConfig.block = migrateJsonBlockTree(statementConfig.block, report).head;
    migrated.head.statements[key] = statementConfig;
  });
  if (originalNext) {
    const migratedNext = migrateJsonBlockTree(originalNext, report);
    attachJsonNext(migrated.tail, migratedNext.head);
    migrated.tail = migratedNext.tail || migrated.tail;
  }
  return migrated;
}

function migrateXEduHubSerialized(serialized) {
  const report = createMigrationReport();
  if (!serialized || typeof serialized !== 'object') {
    pushFailed(report, 'workspace', 'JSON workspace 非对象');
    return { data: serialized, report };
  }
  const nextData = cloneJson(serialized);
  const topBlocks = nextData?.blocks?.blocks;
  if (!Array.isArray(topBlocks)) {
    return { data: nextData, report };
  }
  nextData.blocks.blocks = topBlocks.map((block) => migrateJsonBlockTree(block, report).head);
  return { data: nextData, report };
}

export {
  defineXEduHubBlocks,
  getParamFieldName,
  getSemanticRunBlockType,
  getTaskById,
  getTaskIdFromRunBlockType,
  getXEduHubTaskRegistry,
  isSemanticRunBlockType,
  migrateXEduHubSerialized,
  migrateXEduHubXmlText,
  resolveLegacyTaskId,
};
