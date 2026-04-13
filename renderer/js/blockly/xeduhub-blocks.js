const RUN_BLOCK_PREFIX = 'xeduhub_run_';
const TASK_FIELD_NAME = 'TASK_ID';
const PARAMS_FIELD_NAME = 'PARAMS';
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

const BLOCK_COLOUR_REMAP = Object.freeze({
  '#5A8DEE': '#4F7CFF',
  '#5F7FD7': '#4F7CFF',
  '#3F76CF': '#4F7CFF',
  '#F29C7A': '#F59B42',
  '#D39A63': '#F59B42',
  '#E79A5B': '#F59B42',
  '#4DB6AC': '#18B898',
  '#4FA79A': '#18B898',
  '#2BAA9A': '#18B898',
  '#A596C9': '#8E68F8',
  '#8A7BC0': '#8E68F8',
  '#8E7FD0': '#8E68F8',
  '#8FA4F0': '#37A7F7',
  '#8798DC': '#37A7F7',
  '#6E9FD7': '#2F9BF4',
  '#2D9C8F': '#11B59C',
  '#47A094': '#11B59C',
  '#E38B54': '#F18A31',
  '#C98958': '#F18A31',
  '#D88B46': '#DC741F',
  '#56C7B7': '#22C7A1',
  '#C89162': '#F06F7F',
  '#6AA283': '#63B66E',
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

const BADGE_PALETTES = Object.freeze({
  default: {
    surfaceTop: '#172338',
    surfaceBottom: '#3A5682',
    accent: '#B7CEF3',
    accentSoft: '#F5F8FC',
    glow: '#8FB2E2',
    rim: '#C6D5EA',
  },
  ocean: {
    surfaceTop: '#18253A',
    surfaceBottom: '#4668A0',
    accent: '#B5D2F8',
    accentSoft: '#F5F8FC',
    glow: '#8FB9F3',
    rim: '#C6D9EF',
  },
  teal: {
    surfaceTop: '#162827',
    surfaceBottom: '#448680',
    accent: '#B6E2DB',
    accentSoft: '#F4FBFA',
    glow: '#86C8BC',
    rim: '#C6E6E0',
  },
  amber: {
    surfaceTop: '#2B1F17',
    surfaceBottom: '#946544',
    accent: '#F0CF9E',
    accentSoft: '#FCF8F2',
    glow: '#D7A46B',
    rim: '#EFD8B7',
  },
  violet: {
    surfaceTop: '#241F36',
    surfaceBottom: '#7368A1',
    accent: '#D5C7F0',
    accentSoft: '#FAF8FD',
    glow: '#AA9BD1',
    rim: '#E1D9EF',
  },
  coral: {
    surfaceTop: '#2B1C1A',
    surfaceBottom: '#8A655D',
    accent: '#EDC4B7',
    accentSoft: '#FCF8F6',
    glow: '#CF9A8C',
    rim: '#EED8D0',
  },
  plum: {
    surfaceTop: '#232235',
    surfaceBottom: '#6E6B93',
    accent: '#D1CCE8',
    accentSoft: '#F8F7FB',
    glow: '#A7A1C8',
    rim: '#E2DDF0',
  },
  mint: {
    surfaceTop: '#172628',
    surfaceBottom: '#4A7E84',
    accent: '#C0E5E1',
    accentSoft: '#F4FBFB',
    glow: '#94C8C3',
    rim: '#D4ECE9',
  },
});

const BADGE_PALETTE_BY_ICON = Object.freeze({
  input: 'ocean',
  result: 'ocean',
  resultImage: 'ocean',
  note: 'violet',
  clear: 'coral',
  workflow: 'violet',
  debug: 'plum',
  camera: 'teal',
  video: 'teal',
  http: 'amber',
  device: 'amber',
  math: 'mint',
  save: 'teal',
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

const FIELD_BADGE_ICON_URIS = {
  input: makeBadgeIcon('<rect x="6" y="6.5" width="12" height="11" rx="2.6" stroke="#F8FCFF" stroke-width="1.6"/><path d="m8.1 14.3 2.8-2.9 2 2 3-3.1" stroke="#F8FCFF" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><circle cx="9.2" cy="9.8" r="1" fill="#F8FCFF"/>', BADGE_PALETTE_BY_ICON.input),
  result: makeBadgeIcon('<rect x="6.2" y="6.2" width="11.6" height="11.6" rx="2.8" stroke="#F8FCFF" stroke-width="1.6"/><path d="M8.8 12.2h2.2l1.3-1.7 2.1 3.1" stroke="#F8FCFF" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><circle cx="15.7" cy="14.7" r=".9" fill="#8FD3FF"/>', BADGE_PALETTE_BY_ICON.result),
  resultImage: makeBadgeIcon('<rect x="6.1" y="6.1" width="11.8" height="11.8" rx="2.6" stroke="#F8FCFF" stroke-width="1.6"/><path d="m8.5 15 2.5-2.5 1.8 1.8 2.8-3" stroke="#F8FCFF" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><circle cx="9.8" cy="9.4" r="1" fill="#F8FCFF"/><path d="M13.9 8.5h2.3" stroke="#8FD3FF" stroke-width="1.2" stroke-linecap="round"/>', BADGE_PALETTE_BY_ICON.resultImage),
  note: makeBadgeIcon('<path d="M7 7.3h10a2.1 2.1 0 0 1 2.1 2.1v5.2A2.1 2.1 0 0 1 17 16.7h-4.8l-3 2.2v-2.2H7a2.1 2.1 0 0 1-2.1-2.1V9.4A2.1 2.1 0 0 1 7 7.3Z" stroke="#FCF8FF" stroke-width="1.5" stroke-linejoin="round"/><path d="M8.7 10.4h6.5M8.7 13h4.1" stroke="#FCF8FF" stroke-width="1.5" stroke-linecap="round"/><circle cx="16.5" cy="12.9" r=".8" fill="#C9ACFF"/>', BADGE_PALETTE_BY_ICON.note),
  clear: makeBadgeIcon('<path d="M7.3 8.2h9.4M9.6 8.2V6.8a1 1 0 0 1 1-1h2.8a1 1 0 0 1 1 1v1.4m-5.2 0 .7 8.2a1.3 1.3 0 0 0 1.3 1.1h2.6a1.3 1.3 0 0 0 1.3-1.1l.7-8.2" stroke="#FFF8F6" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="m9.1 9.8 5.8 5.8" stroke="#FFB39A" stroke-width="1.15" stroke-linecap="round" opacity=".95"/>', BADGE_PALETTE_BY_ICON.clear),
  workflow: makeBadgeIcon('<rect x="6" y="6" width="4.6" height="4.6" rx="1.1" stroke="#FBF7FF" stroke-width="1.5"/><rect x="13.4" y="6" width="4.6" height="4.6" rx="1.1" stroke="#FBF7FF" stroke-width="1.5"/><rect x="9.7" y="13.4" width="4.6" height="4.6" rx="1.1" stroke="#FBF7FF" stroke-width="1.5"/><path d="M10.7 8.3h2.6M12 10.6v2.3" stroke="#FBF7FF" stroke-width="1.5" stroke-linecap="round"/><circle cx="16.3" cy="8.3" r=".75" fill="#C9ACFF"/>', BADGE_PALETTE_BY_ICON.workflow),
  debug: makeBadgeIcon('<rect x="7.2" y="7.6" width="9.6" height="8.8" rx="2.2" stroke="#F9F8FF" stroke-width="1.5"/><path d="M9.2 5.9h5.6M9.8 18.1h4.4M5.8 10.2h1.4M16.8 10.2h1.4" stroke="#F9F8FF" stroke-width="1.5" stroke-linecap="round"/><circle cx="12" cy="12.1" r=".95" fill="#C3B5FF"/>', BADGE_PALETTE_BY_ICON.debug),
  camera: makeBadgeIcon('<rect x="5.8" y="7.8" width="8.8" height="7.8" rx="2" stroke="#F4FFFD" stroke-width="1.5"/><path d="M14.6 10.2 18 8.7v6.1l-3.4-1.5" stroke="#F4FFFD" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="10.2" cy="11.7" r="1.8" stroke="#F4FFFD" stroke-width="1.4"/><circle cx="10.2" cy="11.7" r=".8" fill="#6DE7D8"/>', BADGE_PALETTE_BY_ICON.camera),
  video: makeBadgeIcon('<rect x="5.8" y="7.2" width="12.4" height="8.8" rx="2.2" stroke="#F4FFFD" stroke-width="1.5"/><path d="m10 9.6 4 2.1-4 2.1V9.6Z" stroke="#F4FFFD" stroke-width="1.5" stroke-linejoin="round"/><path d="M15.6 8.9h1.4" stroke="#6DE7D8" stroke-width="1.15" stroke-linecap="round"/>', BADGE_PALETTE_BY_ICON.video),
  http: makeBadgeIcon('<rect x="6.2" y="6.3" width="11.6" height="11.4" rx="2.6" stroke="#FFFBEF" stroke-width="1.5"/><path d="M8.8 9.6h6.4M8.8 12h4.5M8.8 14.4h6.4" stroke="#FFFBEF" stroke-width="1.5" stroke-linecap="round"/><path d="M14.7 8.6h2.1" stroke="#FFC978" stroke-width="1.2" stroke-linecap="round"/>', BADGE_PALETTE_BY_ICON.http),
  device: makeBadgeIcon('<rect x="7.1" y="7.1" width="9.8" height="9.8" rx="2.4" stroke="#FFFBEF" stroke-width="1.5"/><path d="M9.4 5.8v1.3M14.6 5.8v1.3M9.4 16.9v1.3M14.6 16.9v1.3M5.8 9.4h1.3M16.9 9.4h1.3M5.8 14.6h1.3M16.9 14.6h1.3" stroke="#FFFBEF" stroke-width="1.4" stroke-linecap="round"/><circle cx="12" cy="12" r="1.1" fill="#FFC978"/>', BADGE_PALETTE_BY_ICON.device),
  math: makeBadgeIcon('<path d="M8.2 8.7h3.6M10 6.9v3.6M8.2 15.1h3.6M14.5 8.1l2.4 2.4M16.9 8.1l-2.4 2.4M14.5 15.1h2.8" stroke="#F0FEFC" stroke-width="1.5" stroke-linecap="round"/><circle cx="16.7" cy="15.1" r=".8" fill="#8EF0E7"/>', BADGE_PALETTE_BY_ICON.math),
  save: makeBadgeIcon('<path d="M7 6.5h8.1l2 2.1v8.9a1.7 1.7 0 0 1-1.7 1.7H8.7A1.7 1.7 0 0 1 7 17.5V6.5Z" stroke="#F4FFFD" stroke-width="1.5" stroke-linejoin="round"/><path d="M9 6.8v3.2h4.8V6.8M9.6 14.7h4.8" stroke="#F4FFFD" stroke-width="1.4" stroke-linecap="round"/><path d="M14.8 9.1h1.7" stroke="#6DE7D8" stroke-width="1.15" stroke-linecap="round"/>', BADGE_PALETTE_BY_ICON.save),
  classification: makeBadgeIcon('<rect x="6.2" y="6.2" width="11.6" height="11.6" rx="2.6" stroke="#F8FCFF" stroke-width="1.5"/><path d="m8.8 12.1 2 2 4.4-4.4" stroke="#F8FCFF" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><circle cx="15.6" cy="8.6" r=".85" fill="#8FD3FF"/>', BADGE_PALETTE_BY_ICON.classification),
  detection: makeBadgeIcon('<rect x="6" y="6" width="12" height="12" rx="2.6" stroke="#FFFBEF" stroke-width="1.3" opacity="0.45"/><rect x="8.8" y="8.8" width="6.4" height="6.4" rx="1.4" stroke="#FFFBEF" stroke-width="1.6"/><path d="M12 7.3v1.1M12 15.6v1.1M7.3 12h1.1M15.6 12h1.1" stroke="#FFC978" stroke-width="1.05" stroke-linecap="round"/>', BADGE_PALETTE_BY_ICON.detection),
  ocr: makeBadgeIcon('<path d="M7.4 8.7h6.3M7.4 12h4.6M7.4 15.3h6.3" stroke="#F4FFFD" stroke-width="1.5" stroke-linecap="round"/><rect x="14.2" y="8.1" width="2.8" height="7.8" rx="1.2" stroke="#F4FFFD" stroke-width="1.4"/><circle cx="15.6" cy="12" r=".75" fill="#6DE7D8"/>', BADGE_PALETTE_BY_ICON.ocr),
  pose: makeBadgeIcon('<circle cx="12" cy="7.2" r="1.3" fill="#FFF6F2"/><circle cx="8.6" cy="10.4" r="1" fill="#FFF6F2"/><circle cx="15.4" cy="10.4" r="1" fill="#FFF6F2"/><path d="M12 8.8v4.2M12 9.8 9.4 10.6M12 9.8l2.6.8M12 13l-1.8 2M12 13l1.8 2" stroke="#FFF6F2" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="13.2" r=".75" fill="#FFB39A"/>', BADGE_PALETTE_BY_ICON.pose),
  generation: makeBadgeIcon('<path d="M12 6.2 13.5 9.5l3.6.4-2.7 2.2.8 3.5-3.2-1.8-3.2 1.8.8-3.5-2.7-2.2 3.6-.4L12 6.2Z" stroke="#FBF7FF" stroke-width="1.4" stroke-linejoin="round"/><circle cx="12" cy="12.1" r=".8" fill="#C9ACFF"/>', BADGE_PALETTE_BY_ICON.generation),
  segmentation: makeBadgeIcon('<rect x="6.4" y="6.4" width="11.2" height="11.2" rx="2.4" stroke="#F0FEFC" stroke-width="1.5"/><path d="M9 9.2c1.3.2 2.2 1.2 2.4 2.5.1 1-.4 1.8-1.1 2.4m4.8-4.9c-1.3.2-2.2 1.2-2.4 2.5-.1 1 .4 1.8 1.1 2.4" stroke="#F0FEFC" stroke-width="1.4" stroke-linecap="round"/><path d="M12 7.9v1.5" stroke="#8EF0E7" stroke-width="1.1" stroke-linecap="round"/>', BADGE_PALETTE_BY_ICON.segmentation),
  depth: makeBadgeIcon('<path d="M7 8.2 12 5.7l5 2.5v6.6L12 17.3l-5-2.5V8.2Z" stroke="#F7F5FF" stroke-width="1.5" stroke-linejoin="round"/><path d="M12 5.8v11.4" stroke="#F7F5FF" stroke-width="1.4" stroke-linecap="round"/><path d="M8.7 9.6h6.6" stroke="#C3B5FF" stroke-width="1.05" stroke-linecap="round" opacity=".95"/>', BADGE_PALETTE_BY_ICON.depth),
  default: makeBadgeIcon('<path d="M12 5.8 17 8.4v6.8L12 17.8 7 15.2V8.4L12 5.8Z" stroke="#F8FCFF" stroke-width="1.5" stroke-linejoin="round"/><circle cx="12" cy="11.8" r=".9" fill="#8FD3FF"/>', BADGE_PALETTE_BY_ICON.default),
};

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

function formatBlockTitle(label) {
  const text = String(label || '').trim();
  return text ? `【${text}】` : '';
}

function getCompactParamLabel(param) {
  const label = String(param?.label || '').trim();
  return PARAM_SHORT_LABELS[label] || label;
}

function getVisibleTaskParams(task) {
  const taskId = String(task?.task_id || '').trim();
  const params = Array.isArray(task?.params) ? task.params : [];
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
  default_task_id: 'cls_imagenet',
  families: [
    { id: 'classification', label: '图像分类', colour: '#4F7CFF', description: '识别图像类别' },
    { id: 'detection', label: '目标检测', colour: '#F59B42', description: '检测目标位置' },
    { id: 'ocr', label: 'OCR', colour: '#18B898', description: '提取图像文字' },
  ],
  tasks: [
    {
      task_id: 'cls_imagenet',
      label: 'ImageNet 图像分类',
      family: 'classification',
      colour: '#4F7CFF',
      input_mode: 'single_path',
      result_kind: 'classification',
      params: [],
    },
    {
      task_id: 'det_body',
      label: '人体目标检测',
      family: 'detection',
      colour: '#F59B42',
      input_mode: 'single_path',
      result_kind: 'detection',
      params: [{ key: 'thr', label: '阈值', field: 'number', default: 0.3 }],
    },
    {
      task_id: 'ocr',
      label: '光学字符识别',
      family: 'ocr',
      colour: '#18B898',
      input_mode: 'single_path',
      result_kind: 'ocr',
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
  return String(task?.runtime_task_id || task?.task_id || taskId || '').trim();
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
    return explicitTaskId;
  }
  const family = normalizeLegacyFamily(taskOrFamily);
  const modelKey = String(modelName || '').trim().toLowerCase();
  if (modelKey && taskMap.has(modelKey)) {
    return modelKey;
  }
  const familyModels = LEGACY_MODEL_MAP[family] || {};
  if (modelKey && familyModels[modelKey] && taskMap.has(familyModels[modelKey])) {
    return familyModels[modelKey];
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
  defineBlocksWithXEduPalette(Blockly, [
    {
      type: 'xeduhub_set_input_resource',
      message0: '%1 选图 %2',
      args0: [buildIconField('input'), { type: 'field_input', name: 'INPUT', text: 'demo.jpg' }],
      previousStatement: null,
      nextStatement: null,
      colour: '#5A8DEE',
    },
    {
      type: 'xeduhub_set_input_list',
      message0: '%1 多图 %2',
      args0: [buildIconField('input'), { type: 'field_input', name: 'INPUTS', text: '["demo1.jpg","demo2.jpg"]' }],
      previousStatement: null,
      nextStatement: null,
      colour: '#5A8DEE',
    },
    {
      type: 'xeduhub_show_result_card',
      message0: '%1 结果 %2',
      args0: [buildIconField('result'), { type: 'field_input', name: 'TITLE', text: '运行结果' }],
      previousStatement: null,
      nextStatement: null,
      colour: '#5A8DEE',
    },
    {
      type: 'xeduhub_show_result_image',
      message0: '%1 结果图',
      args0: [buildIconField('resultImage')],
      previousStatement: null,
      nextStatement: null,
      colour: '#5A8DEE',
    },
    {
      type: 'xeduhub_run_and_record',
      message0: '%1 结论',
      args0: [buildIconField('note')],
      previousStatement: null,
      nextStatement: null,
      colour: '#5A8DEE',
    },
    {
      type: 'xeduhub_clear_result',
      message0: '%1 清空',
      args0: [buildIconField('clear')],
      previousStatement: null,
      nextStatement: null,
      colour: '#5A8DEE',
    },
    {
      type: 'xeduhub_workflow_create',
      message0: '%1 Workflow %2',
      args0: [buildIconField('workflow'), { type: 'field_dropdown', name: TASK_FIELD_NAME, options: getTaskOptions }],
      previousStatement: null,
      nextStatement: null,
      colour: '#A596C9',
    },
    {
      type: 'xeduhub_workflow_set_task',
      message0: '%1 任务 %2',
      args0: [buildIconField('workflow'), { type: 'field_dropdown', name: TASK_FIELD_NAME, options: getTaskOptions }],
      previousStatement: null,
      nextStatement: null,
      colour: '#A596C9',
    },
    {
      type: 'xeduhub_workflow_set_params',
      message0: '%1 参数 %2',
      args0: [buildIconField('workflow'), { type: 'field_input', name: PARAMS_FIELD_NAME, text: '{}' }],
      previousStatement: null,
      nextStatement: null,
      colour: '#A596C9',
    },
    {
      type: 'xeduhub_workflow_infer',
      message0: '%1 运行 %2 高级参数 %3',
      args0: [
        buildIconField('workflow'),
        { type: 'field_input', name: 'RESULT', text: 'lab_result' },
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
        { type: 'field_input', name: 'RESULT', text: 'lab_result' },
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
      args0: [buildIconField('debug'), { type: 'field_input', name: 'VAR', text: 'lab_result' }],
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
      args0: [buildDirectIconField('input'), { type: 'field_input', name: 'INPUT', text: 'demo.jpg' }],
      previousStatement: null,
      nextStatement: null,
      colour: '#5A8DEE',
    },
    {
      type: 'xeduhub_flow_set_input',
      message0: '%1 兼容 输入 %2',
      args0: [buildDirectIconField('input'), { type: 'field_input', name: 'INPUT', text: 'demo.jpg' }],
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
        { type: 'field_input', name: 'INPUT', text: 'demo.jpg' },
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
        { type: 'field_input', name: 'INPUT', text: 'demo.jpg' },
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
    const args = [buildIconField(getTaskIconKey(task)), { type: 'input_value', name: 'INPUT_DATA' }];
    const parts = [`%1 ${formatBlockTitle(getCompactTaskLabel(task))}`, '图像 %2'];
    getVisibleTaskParams(task).forEach((param, index) => {
      const argIndex = index + 3;
      if (param.field === 'enum') {
        args.push({
          type: 'field_dropdown',
          name: getParamFieldName(param.key),
          options: () => (param.options || []).map(([label, value]) => [String(label), String(value)]),
        });
      } else {
        args.push({
          type: 'field_input',
          name: getParamFieldName(param.key),
          text: String(param.default ?? ''),
        });
      }
      parts.push(`${getCompactParamLabel(param)} %${argIndex}`);
    });
    return {
      type: getSemanticRunBlockType(task.task_id),
      colour: task.colour || '#5A8DEE',
      message0: parts.join('  '),
      args0: args,
      previousStatement: null,
      nextStatement: null,
    };
  });
  if (blockDefs.length > 0) {
    defineBlocksWithXEduPalette(Blockly, blockDefs);
  }
}

function defineAdvancedBlocks(Blockly) {
  defineBlocksWithXEduPalette(Blockly, [
    {
      type: 'xeduhub_workflow_create_var',
      message0: '%1 创建模型 %2 到 %3',
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
      message0: '%1 用模型 %2 输入 %3 结果到 %4',
      args0: [
        buildIconField('workflow'),
        { type: 'field_variable', name: 'MODEL_VAR', variable: 'lab_flow' },
        { type: 'input_value', name: 'INPUT_DATA' },
        { type: 'field_variable', name: 'RESULT_VAR', variable: 'lab_result' },
      ],
      message1: '检测框 %1 更多参数 %2',
      args1: [{ type: 'input_value', name: 'BBOX' }, { type: 'field_input', name: PARAMS_FIELD_NAME, text: '{}' }],
      previousStatement: null,
      nextStatement: null,
      colour: '#5A8DEE',
    },
    {
      type: 'xeduhub_workflow_infer_pair',
      message0: '%1 用模型 %2 输入 %3 结果到 %4 图像到 %5',
      args0: [
        buildIconField('workflow'),
        { type: 'field_variable', name: 'MODEL_VAR', variable: 'lab_flow' },
        { type: 'input_value', name: 'INPUT_DATA' },
        { type: 'field_variable', name: 'RESULT_VAR', variable: 'lab_result' },
        { type: 'field_variable', name: 'IMAGE_VAR', variable: 'display_img' },
      ],
      message1: '检测框 %1 更多参数 %2',
      args1: [{ type: 'input_value', name: 'BBOX' }, { type: 'field_input', name: PARAMS_FIELD_NAME, text: '{}' }],
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
      message0: '%1 关键点 %2 第 %3 个 %4',
      args0: [
        buildIconField('pose'),
        { type: 'input_value', name: 'POINTS' },
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
      message0: '%1 打开摄像头 %2 到 %3 窗口 %4',
      args0: [
        buildIconField('camera'),
        { type: 'field_number', name: 'SOURCE', value: 0, min: 0, precision: 1 },
        { type: 'field_variable', name: 'CAMERA_VAR', variable: 'camera' },
        { type: 'field_input', name: 'WINDOW', text: 'video' },
      ],
      previousStatement: null,
      nextStatement: null,
      colour: '#2D9C8F',
    },
    {
      type: 'xeduhub_cv_open_video',
      message0: '%1 打开视频 %2 到 %3 窗口 %4',
      args0: [
        buildIconField('video'),
        { type: 'input_value', name: 'SOURCE' },
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
      message0: '%1 给图像 %2 画检测框 %3 输出到 %4',
      args0: [
        buildIconField('resultImage'),
        { type: 'input_value', name: 'IMAGE' },
        { type: 'input_value', name: 'BOXES' },
        { type: 'field_variable', name: 'IMAGE_VAR', variable: 'display_img' },
      ],
      previousStatement: null,
      nextStatement: null,
      colour: '#2D9C8F',
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
      message0: '%1 图片目录 %2 合成视频 %3 帧率 %4',
      args0: [
        buildIconField('video'),
        { type: 'input_value', name: 'OUTPUT_DIR' },
        { type: 'input_value', name: 'OUTPUT_VIDEO' },
        { type: 'field_number', name: 'FPS', value: 30, min: 1, precision: 1 },
      ],
      previousStatement: null,
      nextStatement: null,
      colour: '#2D9C8F',
    },
    {
      type: 'xeduhub_http_get',
      message0: '%1 GET %2 保存到 %3',
      args0: [
        buildIconField('http'),
        { type: 'input_value', name: 'URL' },
        { type: 'field_variable', name: 'RESPONSE_VAR', variable: 'response' },
      ],
      previousStatement: null,
      nextStatement: null,
      colour: '#E38B54',
    },
    {
      type: 'xeduhub_http_open_stream',
      message0: '%1 打开网络视频流 %2 到 %3',
      args0: [
        buildIconField('http'),
        { type: 'input_value', name: 'URL' },
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
      message0: '%1 遍历网络分块 %2 到 %3 大小 %4',
      args0: [
        buildIconField('http'),
        { type: 'field_variable', name: 'STREAM_VAR', variable: 'response' },
        { type: 'field_variable', name: 'CHUNK_VAR', variable: 'chunk' },
        { type: 'field_number', name: 'CHUNK_SIZE', value: 16384, min: 1, precision: 1 },
      ],
      message1: '执行 %1',
      args1: [{ type: 'input_statement', name: 'DO' }],
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
      type: 'xeduhub_http_send_command',
      message0: '%1 发送设备指令 %2 动作 %3 响应到 %4',
      args0: [
        buildIconField('device'),
        { type: 'input_value', name: 'BASE_URL' },
        { type: 'input_value', name: 'CMD' },
        { type: 'field_variable', name: 'RESPONSE_VAR', variable: 'response' },
      ],
      message1: '停止指令 %1 延时 %2 秒',
      args1: [
        { type: 'field_input', name: 'STOP_CMD', text: 'S' },
        { type: 'field_number', name: 'DELAY', value: 0.3, min: 0, precision: 0.1 },
      ],
      previousStatement: null,
      nextStatement: null,
      colour: '#E38B54',
    },
    {
      type: 'xeduhub_servo_setup',
      message0: '%1 初始化舵机 开发板 %2 引脚 %3 到 %4',
      args0: [
        buildIconField('device'),
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
      message0: '%1 拟合二次曲线 X %2 Y %3 到 %4',
      args0: [
        buildIconField('math'),
        { type: 'input_value', name: 'X_VALUES' },
        { type: 'input_value', name: 'Y_VALUES' },
        { type: 'field_variable', name: 'COEFF_VAR', variable: 'coeff' },
      ],
      previousStatement: null,
      nextStatement: null,
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
      message0: '%1 两点距离 x1 %2 y1 %3 x2 %4 y2 %5',
      args0: [
        buildIconField('math'),
        { type: 'input_value', name: 'X1' },
        { type: 'input_value', name: 'Y1' },
        { type: 'input_value', name: 'X2' },
        { type: 'input_value', name: 'Y2' },
      ],
      output: 'Number',
      colour: '#56C7B7',
    },
  ]);
}

function defineBaseGenerators(pythonGenerator) {
  pythonGenerator.forBlock.xeduhub_set_input_resource = (block) => `lab_input = ${JSON.stringify(block.getFieldValue('INPUT') || 'demo.jpg')}\n`;
  pythonGenerator.forBlock.xeduhub_set_input_list = (block) => {
    const raw = block.getFieldValue('INPUTS') || '[]';
    const parsed = parseJsonish(raw, raw);
    return `lab_input = ${toPythonLiteral(parsed)}\n`;
  };
  pythonGenerator.forBlock.xeduhub_show_result_card = (block) => `print(${JSON.stringify(block.getFieldValue('TITLE') || '推理结果')}, lab_result)\n`;
  pythonGenerator.forBlock.xeduhub_show_result_image = () => "print('结果图将在 Blockly 结果区显示')\n";
  pythonGenerator.forBlock.xeduhub_run_and_record = () => "print('教学结论已记录')\n";
  pythonGenerator.forBlock.xeduhub_clear_result = () => "lab_result = {}\nlab_error = ''\n";
  pythonGenerator.forBlock.xeduhub_workflow_create = (block) => [
    'from XEdu.hub import Workflow as wf',
    `lab_task_id = ${JSON.stringify(getRuntimeTaskId(block.getFieldValue(TASK_FIELD_NAME) || getXEduHubTaskRegistry().default_task_id || 'det_body'))}`,
    'lab_flow = wf(task=lab_task_id)',
  ].join('\n') + '\n';
  pythonGenerator.forBlock.xeduhub_workflow_set_task = (block) => [
    'from XEdu.hub import Workflow as wf',
    `lab_task_id = ${JSON.stringify(getRuntimeTaskId(block.getFieldValue(TASK_FIELD_NAME) || getXEduHubTaskRegistry().default_task_id || 'det_body'))}`,
    'lab_flow = wf(task=lab_task_id)',
  ].join('\n') + '\n';
  pythonGenerator.forBlock.xeduhub_workflow_set_params = (block) => {
    const params = parseJsonish(block.getFieldValue(PARAMS_FIELD_NAME) || '{}', {});
    return `lab_params = ${toPythonLiteral(params)}\n`;
  };
  pythonGenerator.forBlock.xeduhub_workflow_infer = (block) => {
    const resultName = String(block.getFieldValue('RESULT') || 'lab_result').trim() || 'lab_result';
    const params = parseJsonish(block.getFieldValue(PARAMS_FIELD_NAME) || '{}', {});
    return [
      `lab_params = ${toPythonLiteral(params)}`,
      `${resultName} = lab_flow.inference(data=lab_input, **lab_params)`,
      `lab_result = ${resultName}`,
    ].join('\n') + '\n';
  };
  pythonGenerator.forBlock.xeduhub_get_result_field = (block) => {
    const resultName = String(block.getFieldValue('RESULT') || 'lab_result').trim() || 'lab_result';
    const fieldName = String(block.getFieldValue('FIELD') || 'raw').trim() || 'raw';
    if (fieldName === 'raw') {
      return [`str(${resultName})`, pythonGenerator.ORDER_ATOMIC];
    }
    return [`(${resultName}.get(${JSON.stringify(fieldName)}, '') if isinstance(${resultName}, dict) else '')`, pythonGenerator.ORDER_ATOMIC];
  };
  pythonGenerator.forBlock.xeduhub_debug_print = (block) => `print(${JSON.stringify(block.getFieldValue('VAR') || 'lab_result')})\n`;
  pythonGenerator.forBlock.xeduhub_catch_error = (block) => {
    const tryPart = pythonGenerator.statementToCode(block, 'TRY') || 'pass\n';
    const errVar = block.getFieldValue('ERROR_VAR') || 'lab_error';
    return `try:\n${pythonGenerator.prefixLines(tryPart, '  ')}except Exception as e:\n  ${errVar} = str(e)\n  print('运行失败:', ${errVar})\n`;
  };

  pythonGenerator.forBlock.xeduhub_set_input = (block) => pythonGenerator.forBlock.xeduhub_set_input_resource(block);
  pythonGenerator.forBlock.xeduhub_flow_set_input = (block) => pythonGenerator.forBlock.xeduhub_set_input_resource(block);
  pythonGenerator.forBlock.xeduhub_classify_run = (block) => {
    const task = getTaskById(resolveLegacyTaskId('classification', block.getFieldValue('MODEL') || '')) || getTaskById('cls_imagenet');
    return [
      'from XEdu.hub import Workflow as wf',
      `lab_task_id = ${JSON.stringify(getRuntimeTaskId(task?.task_id || 'cls_imagenet'))}`,
      'lab_flow = wf(task=lab_task_id)',
      'lab_params = {}',
      'lab_result = lab_flow.inference(data=lab_input, **lab_params)',
    ].join('\n') + '\n';
  };
  pythonGenerator.forBlock.xeduhub_detect_run = (block) => {
    const task = getTaskById(resolveLegacyTaskId('detection', block.getFieldValue('MODEL') || '')) || getTaskById('det_body');
    return [
      'from XEdu.hub import Workflow as wf',
      `lab_task_id = ${JSON.stringify(getRuntimeTaskId(task?.task_id || 'det_body'))}`,
      'lab_flow = wf(task=lab_task_id)',
      'lab_params = {}',
      'lab_result = lab_flow.inference(data=lab_input, **lab_params)',
    ].join('\n') + '\n';
  };
  pythonGenerator.forBlock.xeduhub_ocr_run = (block) => {
    const task = getTaskById(resolveLegacyTaskId('ocr', block.getFieldValue('MODEL') || '')) || getTaskById('ocr');
    return [
      'from XEdu.hub import Workflow as wf',
      `lab_task_id = ${JSON.stringify(getRuntimeTaskId(task?.task_id || 'ocr'))}`,
      'lab_flow = wf(task=lab_task_id)',
      'lab_params = {}',
      'lab_result = lab_flow.inference(data=lab_input, **lab_params)',
    ].join('\n') + '\n';
  };
  pythonGenerator.forBlock.xeduhub_run_vision = (block) => {
    const taskId = resolveLegacyTaskId(block.getFieldValue('TASK') || '', block.getFieldValue('MODEL') || '');
    const directInput = block.getFieldValue('INPUT') || 'demo.jpg';
    return [
      'from XEdu.hub import Workflow as wf',
      `lab_input = ${JSON.stringify(directInput)}`,
      `lab_task_id = ${JSON.stringify(getRuntimeTaskId(taskId))}`,
      'lab_flow = wf(task=lab_task_id)',
      'lab_params = {}',
      'lab_result = lab_flow.inference(data=lab_input, **lab_params)',
    ].join('\n') + '\n';
  };
  pythonGenerator.forBlock.xeduhub_set_model = (block) => {
    const taskId = resolveLegacyTaskId('', block.getFieldValue('MODEL') || '');
    return [
      'from XEdu.hub import Workflow as wf',
      `lab_task_id = ${JSON.stringify(getRuntimeTaskId(taskId))}`,
      'lab_flow = wf(task=lab_task_id)',
    ].join('\n') + '\n';
  };
  pythonGenerator.forBlock.xeduhub_create_flow = (block) => {
    const taskId = resolveLegacyTaskId(block.getFieldValue('TASK') || '', block.getFieldValue('MODEL') || '');
    return [
      'from XEdu.hub import Workflow as wf',
      `lab_task_id = ${JSON.stringify(getRuntimeTaskId(taskId))}`,
      'lab_flow = wf(task=lab_task_id)',
    ].join('\n') + '\n';
  };
  pythonGenerator.forBlock.xeduhub_create_workflow = (block) => pythonGenerator.forBlock.xeduhub_create_flow(block);
  pythonGenerator.forBlock.xeduhub_execute_workflow = (block) => {
    const resultName = String(block.getFieldValue('RESULT') || 'lab_result').trim() || 'lab_result';
    return `${resultName} = lab_flow.inference(data=lab_input, **{})\nlab_result = ${resultName}\n`;
  };
  pythonGenerator.forBlock.xeduhub_flow_execute = (block) => pythonGenerator.forBlock.xeduhub_execute_workflow(block);
  pythonGenerator.forBlock.xeduhub_raw_create_workflow = (block) => {
    const taskId = resolveLegacyTaskId(block.getFieldValue('TASK') || '', '');
    return [
      'from XEdu.hub import Workflow as wf',
      `lab_task_id = ${JSON.stringify(getRuntimeTaskId(taskId))}`,
      'lab_flow = wf(task=lab_task_id)',
    ].join('\n') + '\n';
  };
  pythonGenerator.forBlock.xeduhub_raw_inference = (block) => {
    const taskId = resolveLegacyTaskId('', block.getFieldValue('MODEL') || '');
    const inputValue = block.getFieldValue('INPUT') || 'demo.jpg';
    return [
      'from XEdu.hub import Workflow as wf',
      `lab_task_id = ${JSON.stringify(getRuntimeTaskId(taskId))}`,
      'lab_flow = wf(task=lab_task_id)',
      `lab_input = ${JSON.stringify(inputValue)}`,
      'lab_result = lab_flow.inference(data=lab_input, **{})',
    ].join('\n') + '\n';
  };
  pythonGenerator.forBlock.xeduhub_show_result = (block) => pythonGenerator.forBlock.xeduhub_show_result_card(block);
  pythonGenerator.forBlock.xeduhub_print_status = () => "print('XEduHub workflow ready')\n";
}

function defineSemanticRunGenerators(pythonGenerator) {
  (getXEduHubTaskRegistry().tasks || []).forEach((task) => {
    pythonGenerator.forBlock[getSemanticRunBlockType(task.task_id)] = (block) => {
      const paramLines = buildParamPythonLines(task, block);
      const inputCode = getValueCode(block, 'INPUT_DATA', pythonGenerator, 'lab_input', pythonGenerator.ORDER_NONE);
      const extraArgs = paramLines.length ? ', **lab_params' : '';
      return [
        'from XEdu.hub import Workflow as wf',
        `lab_task_id = ${JSON.stringify(getRuntimeTaskId(task.task_id))}`,
        'lab_flow = wf(task=lab_task_id)',
        ...paramLines,
        `lab_result = lab_flow.inference(data=${inputCode}${extraArgs})`,
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
    return `${modelVar} = wf(task=${quotePythonString(getRuntimeTaskId(taskId))})\n`;
  };

  pythonGenerator.forBlock.xeduhub_workflow_infer_var = (block) => {
    const modelVar = getVariableName(block, 'MODEL_VAR', 'lab_flow');
    const resultVar = getVariableName(block, 'RESULT_VAR', 'lab_result');
    const inputCode = getValueCode(block, 'INPUT_DATA', pythonGenerator, 'lab_input', pythonGenerator.ORDER_NONE);
    const lines = buildInferParamsLines(block, pythonGenerator);
    const extraArgs = lines.length ? ', **xedu_params' : '';
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
    const body = pythonGenerator.prefixLines(branch, '    ');
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
    const body = pythonGenerator.prefixLines(branch, '    ');
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
    const body = pythonGenerator.prefixLines(branch, '    ');
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
    const inputBlock = createXmlBlock(doc, 'xeduhub_set_input_resource', { INPUT: inputValue || 'demo.jpg' });
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
    const inputBlock = { type: 'xeduhub_set_input_resource', fields: { INPUT: nextBlock.fields?.INPUT || 'demo.jpg' } };
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
