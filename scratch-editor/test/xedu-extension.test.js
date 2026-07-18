const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const test = require('node:test');

const {
  XEDU_BLOCK_IDS,
  XEDU_TASK_IDS,
  SENSING_EXTENSION_IDS,
  createXEduBlockInfo,
  createXEduExtensionInfos,
  createXEduSensingInfos,
  buildTaskSpec,
  evaluateMathBlock,
  summarizeXEduPayload,
} = require('../src/extensions/scratch3_xedu_ai/descriptor');

const EXPECTED_BLOCK_IDS = [
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
];

test('Scratch exposes every supported XEduHub teaching block', () => {
  assert.deepEqual([...XEDU_BLOCK_IDS].sort(), [...EXPECTED_BLOCK_IDS].sort());
  assert.equal(new Set(XEDU_BLOCK_IDS).size, 93);
});

test('XEdu is split into focused Scratch feature modules', () => {
  const modules = createXEduExtensionInfos();
  assert.deepEqual(modules.map(module => module.id), ['xeduDevice']);
  assert.equal(modules[0].name, 'XEdu 设备控制');
  assert.deepEqual(modules[0].blocks.map(block => block.opcode), [
    'xeduhub_http_send_command', 'xeduhub_k10_gpio_write', 'xeduhub_k10_pwm_write', 'xeduhub_k10_uart_send',
    'xeduhub_servo_setup', 'xeduhub_servo_write_angle',
  ]);
});

test('XEdu exposes a family of small teaching-oriented sensing extensions', () => {
  const extensions = createXEduSensingInfos();
  assert.deepEqual(extensions.map(extension => extension.id), [
    'xeduImageClassification', 'xeduObjectSensing', 'xeduFaceSensing', 'xeduBodySensing',
    'xeduHandSensing', 'xeduTextRecognition', 'xeduImageSegmentation', 'xeduDepthSensing',
  ]);
  assert.deepEqual(SENSING_EXTENSION_IDS, extensions.map(extension => extension.id));
  assert.equal(new Set(extensions.map(extension => extension.iconURI)).size, extensions.length);

  for (const extension of extensions) {
    const visibleBlocks = extension.blocks.filter(block => block !== '---' && !block.hideFromPalette);
    assert.ok(visibleBlocks.length >= 3 && visibleBlocks.length <= 9, `${extension.id} should expose 3-9 teaching blocks`);
    assert.ok(visibleBlocks.every(block => !/bbox|thr|resnet|large|兼容|原始/i.test(block.text)), `${extension.id} contains technical copy`);
    assert.ok(visibleBlocks.every(block => !/最近一次|结果摘要/i.test(block.text)), `${extension.id} exposes a generic result`);
    assert.equal(extension.blockIconURI, undefined);
    assert.ok(extension.iconURI.startsWith('data:image/svg+xml,'));
  }
});

test('extension library replaces the legacy vision card with sensing cards', () => {
  const librarySource = require('node:fs').readFileSync(
    require('node:path').join(__dirname, '../node_modules/@scratch/scratch-gui/src/lib/libraries/extensions/index.jsx'),
    'utf8'
  );
  assert.equal(librarySource.includes("name: 'XEdu 视觉识别'"), false);
  assert.equal(librarySource.includes("extensionId: 'xeduVision'"), false);
  for (const id of SENSING_EXTENSION_IDS) assert.ok(librarySource.includes(`extensionId: '${id}'`));
});

test('Scratch VM registers every XEdu extension once', () => {
  const managerSource = fs.readFileSync(
    path.join(__dirname, '../node_modules/@scratch/scratch-vm/src/extension-support/extension-manager.js'),
    'utf8'
  );
  const registrations = managerSource.match(/^    xedu[A-Za-z]+: \(\) => require\(/gm) || [];
  assert.equal(registrations.length, new Set(registrations).size);
});

test('extension library presents only student AI tasks and K10 hardware', () => {
  const librarySource = require('node:fs').readFileSync(
    require('node:path').join(__dirname, '../node_modules/@scratch/scratch-gui/src/lib/libraries/extensions/index.jsx'),
    'utf8'
  );
  const visibleIds = [
    'xeduCamera',
    ...SENSING_EXTENSION_IDS,
    'xeduDevice',
  ];
  const hiddenIds = [
    'xeduWorkflow', 'xeduImage', 'xeduMedia', 'xeduMath', 'xeduResults',
  ];

  for (const id of visibleIds) assert.ok(librarySource.includes(`extensionId: '${id}'`));
  for (const id of visibleIds) {
    assert.equal((librarySource.match(new RegExp(`extensionId: '${id}'`, 'g')) || []).length, 1, `${id} appears more than once`);
  }
  for (const id of hiddenIds) assert.equal(librarySource.includes(`extensionId: '${id}'`), false);
  assert.ok(librarySource.includes("name: '行空板 K10'"));
  assert.ok(librarySource.includes("description: '控制引脚、PWM、串口和舵机。'"));
});

test('Scratch VM no longer registers removed technical extensions', () => {
  const vmRoot = path.join(__dirname, '../node_modules/@scratch/scratch-vm');
  const managerSource = fs.readFileSync(path.join(vmRoot, 'src/extension-support/extension-manager.js'), 'utf8');
  const removedExtensions = [
    'xeduAI', 'xeduVision', 'xeduWorkflow', 'xeduImage', 'xeduMedia', 'xeduMath', 'xeduResults',
  ];
  const removedModules = [
    'xedu_vision.js', 'xedu_workflow.js', 'xedu_image.js', 'xedu_media.js', 'xedu_math.js', 'xedu_results.js',
  ];

  for (const id of removedExtensions) assert.equal(managerSource.includes(`${id}: () =>`), false);
  for (const fileName of removedModules) {
    assert.equal(fs.existsSync(path.join(vmRoot, 'src/extensions', fileName)), false);
  }
});

test('Scratch course projects use available task extensions', () => {
  const repoRoot = path.join(__dirname, '..', '..');
  const projectRoots = [
    path.join(repoRoot, 'backend/sasu'),
    path.join(repoRoot, 'sasu'),
  ];
  const projects = projectRoots.flatMap(root => fs.readdirSync(root, {recursive: true})
    .filter(entry => entry.endsWith('.sb3'))
    .map(entry => path.join(root, entry)));
  const removedExtensions = new Set([
    'xeduAI', 'xeduVision', 'xeduWorkflow', 'xeduImage', 'xeduMedia', 'xeduMath', 'xeduResults',
  ]);
  const removedOpcodePrefixes = [...removedExtensions].map(extension => `${extension}_`);

  assert.ok(projects.length > 0);
  for (const project of projects) {
    const manifest = JSON.parse(execFileSync('unzip', ['-p', project, 'project.json'], {encoding: 'utf8'}));
    assert.ok(!manifest.extensions.some(extension => removedExtensions.has(extension)), `${project} still declares a removed extension`);
    for (const target of manifest.targets || []) {
      for (const block of Object.values(target.blocks || {})) {
        assert.ok(!String(block.opcode || '').startsWith('xeduAI_'), `${project} still uses a legacy XEdu AI block`);
        assert.ok(!removedOpcodePrefixes.some(prefix => String(block.opcode || '').startsWith(prefix)), `${project} still uses a removed XEdu extension block: ${block.opcode}`);
        if (String(block.opcode || '').startsWith('xedu') && String(block.opcode || '').includes('Sensing_')) {
          assert.ok(!Object.hasOwn(block.inputs || {}, 'IMAGE'), `${project} still passes an image path to ${block.opcode}`);
          assert.notEqual(block.opcode, 'xeduBodySensing_detectBodies', `${project} still uses the old one-shot body command`);
          assert.notEqual(block.opcode, 'xeduBodySensing_bodyLastResult', `${project} still exposes a generic body result`);
        }
      }
    }
    const usesSensing = (manifest.targets || []).some(target => Object.values(target.blocks || {}).some(block =>
      String(block.opcode || '').startsWith('xedu') && String(block.opcode || '').includes('Sensing_')
    ));
    if (usesSensing) {
      assert.ok(manifest.extensions.includes('xeduCamera'), `${project} is missing the camera extension`);
      assert.ok((manifest.targets || []).some(target => Object.values(target.blocks || {}).some(block =>
        block.opcode === 'xeduCamera_enableCamera'
      )), `${project} starts sensing without opening the camera`);
    }
  }
});

test('high contrast mode preserves XEdu colors while official extensions use the shared palette', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const guiRoot = path.join(__dirname, '../node_modules/@scratch/scratch-gui/src');
  const blocksSource = fs.readFileSync(path.join(guiRoot, 'containers/blocks.jsx'), 'utf8');
  const helpersSource = fs.readFileSync(path.join(guiRoot, 'lib/settings/color-mode/blockHelpers.js'), 'utf8');
  assert.ok(blocksSource.includes("!String(categoryInfo.id).startsWith('xedu')"));
  assert.ok(helpersSource.includes("if (String(extension.id).startsWith('xedu')) return extension;"));
});

test('Scratch task blocks produce the shared XEduHub execution spec', () => {
  const info = createXEduBlockInfo();
  const block = info.blocks.find(item => item.opcode === 'xeduhub_run_det_body');
  assert.equal(block.blockType, 'command');
  const spec = buildTaskSpec('det_body', {
    IMAGE: 'assets/person.jpg',
    THR: '0.45',
  });
  assert.deepEqual(spec, {
    task_id: 'det_body',
    input: 'assets/person.jpg',
    params: {thr: 0.45},
  });
  assert.ok(XEDU_TASK_IDS.includes('segment_anything'));
});

test('Scratch VM loads the K10 hardware extension', () => {
  const Extension = require('../node_modules/@scratch/scratch-vm/src/extensions/xedu_device');
  const info = new Extension().getInfo();
  assert.equal(info.id, 'xeduDevice');
  assert.equal(info.blocks.length, 6);
});

test('Scratch VM loads the stage camera extension', () => {
  const Extension = require('../node_modules/@scratch/scratch-vm/src/extensions/xedu_camera');
  const videoCalls = [];
  const extension = new Extension({ioDevices: {video: {
    enableVideo () { videoCalls.push('enable'); },
    disableVideo () { videoCalls.push('disable'); },
    setPreviewGhost (value) { videoCalls.push(value); },
  }}});
  const info = extension.getInfo();
  assert.equal(info.id, 'xeduCamera');
  assert.equal(info.blocks.length, 4);
  extension.enableCamera();
  extension.setCameraTransparency({TRANSPARENCY: '50'});
  extension.disableCamera();
  assert.deepEqual(videoCalls, ['enable', 50, 'disable']);
});

test('stage sensing shares camera frames and never overlaps requests for one task', async () => {
  const {StageSensingSession} = require('../src/extensions/scratch3_xedu_ai/stage-sensing');
  let resolveRequest;
  let requests = 0;
  const runtime = {ioDevices: {video: {enableVideo () {}}}};
  const session = new StageSensingSession(runtime, {
    autoRefresh: false,
    getFrame: async () => 'data:image/png;base64,frame',
    request: () => {
      requests += 1;
      return new Promise(resolve => { resolveRequest = resolve; });
    },
  });

  const first = session.enable('pose_hand21');
  const second = session.refresh('pose_hand21');
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(session.isReady('pose_hand21'), false);
  assert.equal(requests, 1);
  resolveRequest({success: true, result: {output: {keypoints: [[12, 34]]}}});
  await Promise.all([first, second]);
  assert.equal(session.isReady('pose_hand21'), true);
  assert.deepEqual(session.result('pose_hand21').result.output.keypoints, [[12, 34]]);
});

test('student sensing blocks enable a stage sensor without image path inputs', () => {
  const extensions = createXEduSensingInfos();
  for (const extension of extensions) {
    const visible = extension.blocks.filter(block => block !== '---' && !block.hideFromPalette);
    assert.ok(visible.some(block => block.blockType === 'command' && /^开启/.test(block.text)), `${extension.id} needs an enable block`);
    assert.ok(visible.some(block => block.blockType === 'boolean' && /准备好/.test(block.text)), `${extension.id} needs a ready block`);
    assert.ok(visible.every(block => !Object.hasOwn(block.arguments || {}, 'IMAGE')), `${extension.id} exposes an image path`);
  }
  const hand = extensions.find(extension => extension.id === 'xeduHandSensing');
  const handPoint = hand.blocks.find(block => block.opcode === 'handPointAxis');
  assert.equal(handPoint.arguments.POINT.menu, 'handPoints');
});

test('Scratch VM loads every teaching-oriented sensing extension', () => {
  const moduleFiles = [
    ['xedu_image_classification', 'xeduImageClassification'],
    ['xedu_object_sensing', 'xeduObjectSensing'],
    ['xedu_face_sensing', 'xeduFaceSensing'],
    ['xedu_body_sensing', 'xeduBodySensing'],
    ['xedu_hand_sensing', 'xeduHandSensing'],
    ['xedu_text_recognition', 'xeduTextRecognition'],
    ['xedu_image_segmentation', 'xeduImageSegmentation'],
    ['xedu_depth_sensing', 'xeduDepthSensing'],
  ];
  for (const [fileName, id] of moduleFiles) {
    const Extension = require(`../node_modules/@scratch/scratch-vm/src/extensions/${fileName}`);
    const info = new Extension().getInfo();
    assert.equal(info.id, id);
    assert.ok(info.blocks.filter(block => block !== '---' && !block.hideFromPalette).length <= 9);
    assert.equal(info.blockIconURI, undefined);
  }
});

test('sensing extensions keep independent camera-backed results while sharing the runtime', async () => {
  const ObjectSensing = require('../node_modules/@scratch/scratch-vm/src/extensions/xedu_object_sensing');
  const TextRecognition = require('../node_modules/@scratch/scratch-vm/src/extensions/xedu_text_recognition');
  const runtime = {ioDevices: {video: {
    enableVideo () {},
    getFrame () { return 'data:image/png;base64,frame'; },
  }}};
  const objects = new ObjectSensing(runtime);
  const text = new TextRecognition(runtime);
  const originalFetch = global.fetch;
  const payloads = [
    {
      success: true,
      result_summary: {headline: '检测到 2 个目标'},
      result: {output: [{label: 'person', score: 0.92, bbox: [10, 20, 50, 80]}, {label: 'cat', score: 0.85, bbox: [60, 30, 90, 70]}]},
      result_artifacts: {key_fields: {'检测框数': 2}},
    },
    {
      success: true,
      result_summary: {headline: 'OCR 识别到 1 个文本块'},
      result: {output: {'文本': ['XEdu']}},
      result_artifacts: {key_fields: {'文本块数': 1, '文本预览': 'XEdu'}},
    },
  ];
  global.fetch = async () => ({json: async () => payloads.shift()});
  try {
    await objects.enableObjectSensing();
    await text.enableTextRecognition();
    assert.equal(objects.objectReady(), true);
    assert.equal(text.textReady(), true);
    assert.equal(objects.objectCount({TARGET: '*'}), 2);
    assert.equal(objects.objectField({INDEX: 1, FIELD: 'label'}), 'person');
    assert.equal(text.textBlock({INDEX: 1}), 'XEdu');
  } finally {
    global.fetch = originalFetch;
  }
});

test('Scratch AI execution calls the neutral XEduHub endpoint', async () => {
  const Extension = require('../node_modules/@scratch/scratch-vm/src/extensions/scratch3_xedu_ai');
  const extension = new Extension();
  const originalFetch = global.fetch;
  let request;
  global.fetch = async (url, options) => {
    request = {url, options, body: JSON.parse(options.body)};
    return {json: async () => ({success: true, result_summary: {headline: '人体检测完成'}})};
  };
  try {
    const result = await extension.runTask({TASK: 'det_body', IMAGE: 'demo.jpg', THR: '0.4'});
    assert.equal(result, '人体检测完成');
    assert.equal(request.url, 'http://127.0.0.1:5123/api/resources/xeduhub/execute');
    assert.deepEqual(request.body.spec, {task_id: 'det_body', input: 'demo.jpg', params: {thr: 0.4}});
  } finally {
    global.fetch = originalFetch;
  }
});

test('embedded Scratch routes XEduHub execution through the host bridge', () => {
  const extensionSource = fs.readFileSync(path.join(__dirname, '../src/extensions/scratch3_xedu_ai/index.js'), 'utf8');
  const sensingSource = fs.readFileSync(path.join(__dirname, '../src/extensions/scratch3_xedu_ai/stage-sensing.js'), 'utf8');
  const patchSource = fs.readFileSync(path.join(__dirname, '../scripts/patch-scratch.js'), 'utf8');
  assert.match(extensionSource, /requestXEduApi/);
  assert.match(sensingSource, /requestXEduApi/);
  assert.match(patchSource, /'api-request\.js'/);
});

test('Scratch keeps deterministic XEdu math and result helpers', () => {
  assert.equal(evaluateMathBlock('distance', {x1: 0, y1: 0, x2: 3, y2: 4}), 5);
  assert.deepEqual(evaluateMathBlock('quadraticFit', {x: [0, 1, 2], y: [1, 3, 7]}), [1, 1, 1]);
  assert.equal(evaluateMathBlock('quadraticEval', {coeffs: [1, 1, 1], x: 2}), 7);
  assert.equal(summarizeXEduPayload({success: true, result_summary: {headline: '识别完成'}}), '识别完成');
  assert.equal(summarizeXEduPayload({success: false, message: '模型不可用'}), '模型不可用');
});
