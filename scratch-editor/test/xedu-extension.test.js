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

test('Scratch editor uses the original default color mode', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const guiRoot = path.join(__dirname, '../node_modules/@scratch/scratch-gui/src');
  const persistenceSource = fs.readFileSync(path.join(guiRoot, 'lib/settings/color-mode/persistence.js'), 'utf8');
  const patchSource = fs.readFileSync(path.join(__dirname, '../scripts/patch-scratch.js'), 'utf8');
  assert.ok(persistenceSource.includes('const detectColorMode = () => DEFAULT_MODE;'));
  assert.ok(patchSource.includes('const detectColorMode = () => DEFAULT_MODE;'));
});

test('embedded Scratch host controls use a token-bound message bridge', () => {
  const patchSource = fs.readFileSync(path.join(__dirname, '../scripts/patch-scratch.js'), 'utf8');
  assert.ok(patchSource.includes("request?.bridgeToken !== bridgeToken"));
  assert.ok(patchSource.includes("type: 'xedu:scratch-host-action-result'"));
  assert.ok(patchSource.includes("type === 'xedu:scratch-host-upload-project'"));
  assert.ok(patchSource.includes('bindXEduScratchHostBridge(state, xeduScratchBridge);'));
});

test('standalone Scratch bootstrap exposes the host file-operation bridge', () => {
  const copyBuildSource = fs.readFileSync(path.join(__dirname, '../scripts/copy-build.js'), 'utf8');
  assert.ok(copyBuildSource.includes('xedu:scratch-host-state-request'));
  assert.ok(copyBuildSource.includes('xedu:scratch-host-state'));
  assert.ok(copyBuildSource.includes('xedu:scratch-host-action-result'));
  assert.ok(copyBuildSource.includes('xedu:scratch-host-upload-project'));
  assert.ok(copyBuildSource.includes('GUI.requestNewProject(false)'));
});

test('embedded Scratch intercepts expired project handles before the GUI error boundary', () => {
  const copyBuildSource = fs.readFileSync(path.join(__dirname, '../scripts/copy-build.js'), 'utf8');
  assert.ok(copyBuildSource.includes("method: 'HEAD'"));
  assert.ok(copyBuildSource.includes('xedu:scratch-project-access-expired'));
  assert.ok(copyBuildSource.includes('response.status === 410'));
});

test('embedded Scratch routes library assets through the local proxy', () => {
  const patchSource = fs.readFileSync(path.join(__dirname, '../scripts/patch-scratch.js'), 'utf8');
  const copyBuildSource = fs.readFileSync(path.join(__dirname, '../scripts/copy-build.js'), 'utf8');
  const standaloneSource = fs.readFileSync(
    path.join(__dirname, '../node_modules/@scratch/scratch-gui/src/playground/render-gui-standalone.jsx'),
    'utf8'
  );
  const librarySource = fs.readFileSync(
    path.join(__dirname, '../node_modules/@scratch/scratch-gui/src/components/library/library.jsx'),
    'utf8'
  );

  assert.ok(patchSource.includes('getXEduScratchAssetHost'));
  assert.ok(standaloneSource.includes('window.__XEDU_SCRATCH_ASSET_HOST__ = getXEduScratchAssetHost();'));
  assert.ok(standaloneSource.includes('assetHost: getXEduScratchAssetHost(),'));
  assert.ok(librarySource.includes('getScratchAssetServiceBase'));
  assert.equal(librarySource.includes('https://cdn.assets.scratch.mit.edu/internalapi/asset/${item.assetId}.${item.dataFormat}/get/'), false);
  assert.equal(librarySource.includes('https://cdn.assets.scratch.mit.edu/internalapi/asset/${md5ext}/get/'), false);
  assert.ok(librarySource.includes('assetServiceUri: `${getScratchAssetServiceBase()}/${item.assetId}.${item.dataFormat}/get/`'));
  assert.ok(librarySource.includes('assetServiceUri: `${getScratchAssetServiceBase()}/${md5ext}/get/`'));
  assert.ok(copyBuildSource.includes("const getScratchAssetHost = () => getApiBase() + '/api/scratch-assets';"));
  assert.ok(copyBuildSource.includes('window.__XEDU_SCRATCH_ASSET_HOST__ = getScratchAssetHost();'));
  assert.ok(copyBuildSource.includes('assetHost: getScratchAssetHost(),'));
});

test('XEdu toolbox refresh removes stale Blockly definitions before redefining blocks', () => {
  const blocksSource = fs.readFileSync(
    path.join(__dirname, '../node_modules/@scratch/scratch-gui/src/containers/blocks.jsx'),
    'utf8'
  );
  const patchSource = fs.readFileSync(path.join(__dirname, '../scripts/patch-scratch.js'), 'utf8');
  for (const source of [blocksSource, patchSource]) {
    assert.ok(source.includes("String(categoryInfo.id).startsWith('xedu')"));
    assert.ok(source.includes('delete this.ScratchBlocks.Blocks[blockInfo.json.type]'));
  }
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

test('camera enable returns the video readiness promise', async () => {
  const Extension = require('../node_modules/@scratch/scratch-vm/src/extensions/xedu_camera');
  let resolveVideo;
  const ready = new Promise(resolve => { resolveVideo = resolve; });
  const runtime = {ioDevices: {video: {
    enableVideo () { return ready; },
    disableVideo () {},
  }}};
  const extension = new Extension(runtime);
  const result = extension.enableCamera();
  assert.equal(result, ready);
  resolveVideo();
  await result;
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

test('stage sensing waits for the first camera frame before issuing one pose request', async () => {
  const {StageSensingSession} = require('../src/extensions/scratch3_xedu_ai/stage-sensing');
  let frameAttempts = 0;
  let requests = 0;
  const session = new StageSensingSession({ioDevices: {video: {enableVideo () { return Promise.resolve(); }}}}, {
    autoRefresh: false,
    firstFrameRetryDelayMs: 1,
    firstFrameMaxRetries: 4,
    getFrame: async () => {
      frameAttempts += 1;
      if (frameAttempts < 4) return null;
      return 'data:image/png;base64,frame';
    },
    request: async () => {
      requests += 1;
      return {success: true, result: {output: {keypoints: [[12, 34]]}}};
    },
  });

  const first = session.enable('pose_body17');
  const second = session.refresh('pose_body17');
  await Promise.all([first, second]);

  assert.equal(frameAttempts, 4);
  assert.equal(requests, 1);
  assert.equal(session.isReady('pose_body17'), true);
  assert.deepEqual(session.result('pose_body17').result.output.keypoints, [[12, 34]]);
});

test('stage sensing gives up after bounded retries when the camera never produces a frame', async () => {
  const {StageSensingSession} = require('../src/extensions/scratch3_xedu_ai/stage-sensing');
  let frameAttempts = 0;
  let requests = 0;
  const session = new StageSensingSession({ioDevices: {video: {enableVideo () { return Promise.resolve(); }}}}, {
    autoRefresh: false,
    firstFrameRetryDelayMs: 1,
    firstFrameMaxRetries: 3,
    getFrame: async () => {
      frameAttempts += 1;
      return null;
    },
    request: async () => {
      requests += 1;
      return {success: true, result: {output: {keypoints: [[12, 34]]}}};
    },
  });

  const result = await session.enable('pose_body17');

  assert.equal(result, null);
  assert.equal(frameAttempts, 4);
  assert.equal(requests, 0);
  assert.equal(session.isReady('pose_body17'), false);
    assert.equal(session._task('pose_body17').error, '未取得摄像头画面');
});

test('stage sensing can restart camera-backed sensing across three runs', async () => {
  const {StageSensingSession} = require('../src/extensions/scratch3_xedu_ai/stage-sensing');
  let cameraCycle = 0;
  let activeCycle = 0;
  let requests = 0;
  let disableCalls = 0;
  const video = {
    videoReady: false,
    enableVideo () {
      cameraCycle += 1;
      const cycle = cameraCycle;
      activeCycle = cycle;
      this.videoReady = false;
      setTimeout(() => {
        if (activeCycle === cycle) this.videoReady = true;
      }, 5);
      return Promise.resolve();
    },
    disableVideo () {
      disableCalls += 1;
      activeCycle = 0;
      this.videoReady = false;
    },
  };
  const session = new StageSensingSession({ioDevices: {video}}, {
    autoRefresh: false,
    getFrame: async () => 'data:image/png;base64,frame',
    request: async () => {
      requests += 1;
      return {success: true, result: {output: [[requests, 34]]}};
    },
  });

  for (let run = 1; run <= 3; run += 1) {
    await session.enable('pose_body17');
    assert.equal(session.isReady('pose_body17'), true);
    assert.equal(requests, run);
    session.disableCamera();
    assert.equal(session.isReady('pose_body17'), false);
  }

  assert.equal(cameraCycle, 3);
  assert.equal(disableCalls, 3);
});

test('a stale camera enable failure cannot disable a newer sensing run', async () => {
  const {StageSensingSession} = require('../src/extensions/scratch3_xedu_ai/stage-sensing');
  let rejectFirst;
  let enableCalls = 0;
  let requests = 0;
  const video = {
    videoReady: true,
    enableVideo () {
      enableCalls += 1;
      if (enableCalls === 1) return new Promise((resolve, reject) => { rejectFirst = reject; });
      return Promise.resolve();
    },
    disableVideo () {},
  };
  const session = new StageSensingSession({ioDevices: {video}}, {
    autoRefresh: false,
    getFrame: async () => 'data:image/png;base64,frame',
    request: async () => {
      requests += 1;
      return {success: true, result: {output: [[12, 34]]}};
    },
  });

  const first = session.enable('pose_body17');
  session.disableCamera();
  const second = session.enable('pose_body17');
  rejectFirst(new Error('old camera setup failed'));

  await second;
  await first;
  assert.equal(enableCalls, 2);
  assert.equal(requests, 1);
  assert.equal(session.isReady('pose_body17'), true);
});

test('stage sensing refreshes with distinct frames after each completed request', async () => {
  const {StageSensingSession} = require('../src/extensions/scratch3_xedu_ai/stage-sensing');
  const frames = ['frame-1', 'frame-2', 'frame-3'];
  const requests = [];
  const session = new StageSensingSession({
    ioDevices: {video: {enableVideo () { return Promise.resolve(); }, disableVideo () {}}},
  }, {
    autoRefresh: true,
    intervalMs: 1,
    getFrame: async () => `data:image/jpeg;base64,${frames[Math.min(requests.length, frames.length - 1)]}`,
    request: async (_taskId, frame) => {
      requests.push(frame);
      return {success: true, result: {output: [[requests.length, 34]]}};
    },
  });

  await session.enable('pose_body17');
  await new Promise((resolve, reject) => {
    const deadline = Date.now() + 1000;
    const check = () => {
      if (requests.length >= 3) return resolve();
      if (Date.now() >= deadline) return reject(new Error(`only received ${requests.length} pose requests`));
      setTimeout(check, 5);
    };
    check();
  });
  session.disableCamera();

  assert.equal(new Set(requests.slice(0, 3)).size, 3);
  assert.match(requests[0], /frame-1/);
  assert.match(requests[1], /frame-2/);
  assert.match(requests[2], /frame-3/);
});

test('stage sensing continues refreshing after one failed pose response', async () => {
  const {StageSensingSession} = require('../src/extensions/scratch3_xedu_ai/stage-sensing');
  let requests = 0;
  const session = new StageSensingSession({
    ioDevices: {video: {enableVideo () { return Promise.resolve(); }, disableVideo () {}}},
  }, {
    autoRefresh: true,
    intervalMs: 1,
    getFrame: async () => `data:image/jpeg;base64,frame-${requests + 1}`,
    request: async () => {
      requests += 1;
      if (requests === 2) return {success: false, message: 'request too large'};
      return {success: true, result: {output: [[requests, 34]]}};
    },
  });

  await session.enable('pose_body17');
  await new Promise((resolve, reject) => {
    const deadline = Date.now() + 1000;
    const check = () => {
      if (requests >= 3) return resolve();
      if (Date.now() >= deadline) return reject(new Error(`only received ${requests} pose requests`));
      setTimeout(check, 5);
    };
    check();
  });
  const finalResult = session.result('pose_body17');
  assert.equal(requests >= 3, true);
  assert.deepEqual(finalResult.result.output, [[3, 34]]);
  assert.equal(session.isReady('pose_body17'), true);
  session.disableCamera();
});

test('stage sensing keeps the last successful result after a busy response', async () => {
  const {StageSensingSession} = require('../src/extensions/scratch3_xedu_ai/stage-sensing');
  let requests = 0;
  const session = new StageSensingSession({
    ioDevices: {video: {enableVideo () { return Promise.resolve(); }, disableVideo () {}}},
  }, {
    autoRefresh: false,
    getFrame: async () => 'data:image/jpeg;base64,frame',
    request: async () => {
      requests += 1;
      return requests === 1
        ? {success: true, result: {output: [[11, 22]]}}
        : {success: false, error_code: 'runtime_busy', message: '模型繁忙'};
    },
  });

  await session.enable('pose_body17');
  const firstPayload = session.result('pose_body17');
  session._task('pose_body17').nextDueAt = 0;
  await session.refresh('pose_body17', true);

  assert.equal(requests, 2);
  assert.strictEqual(session.result('pose_body17'), firstPayload);
  assert.deepEqual(session.result('pose_body17').result.output, [[11, 22]]);
  assert.equal(session.isReady('pose_body17'), true);
  session.disableCamera();
});

test('stage sensing ignores a response with the wrong session or frame sequence', async () => {
  const {StageSensingSession} = require('../src/extensions/scratch3_xedu_ai/stage-sensing');
  let requests = 0;
  const session = new StageSensingSession({
    ioDevices: {video: {enableVideo () { return Promise.resolve(); }, disableVideo () {}}},
  }, {
    autoRefresh: false,
    getFrame: async () => 'data:image/jpeg;base64,frame',
    request: async (_taskId, _frame, metadata) => {
      requests += 1;
      return requests === 1
        ? {success: true, result: {output: [[1, 2]]}, session_id: metadata.sessionId, frame_seq: metadata.frameSequence + 1}
        : {success: true, result: {output: [[3, 4]]}, session_id: `old-${metadata.sessionId}`, frame_seq: metadata.frameSequence};
    },
  });

  await session.enable('pose_body17');
  assert.equal(session.result('pose_body17'), null);
  session._task('pose_body17').nextDueAt = 0;
  await session.refresh('pose_body17', true);
  assert.equal(session.result('pose_body17'), null);
  assert.equal(session.isReady('pose_body17'), false);
  session.disableCamera();
});

test('stage sensing rotates due tasks fairly when one request slot is available', async () => {
  const {StageSensingSession} = require('../src/extensions/scratch3_xedu_ai/stage-sensing');
  const requests = [];
  const session = new StageSensingSession({}, {
    autoRefresh: false,
    maxConcurrentRequests: 1,
    getFrame: async () => 'data:image/jpeg;base64,frame',
    request: async taskId => {
      requests.push(taskId);
      return {success: true, result: {output: [[requests.length, 1]]}};
    },
  });
  for (const taskId of ['pose_body17', 'pose_hand21', 'ocr']) {
    const task = session._task(taskId);
    task.enabled = true;
    task.nextDueAt = 0;
  }

  for (let index = 0; index < 3; index += 1) {
    session._pump(true);
    await session.captureInFlight;
    for (const task of session.tasks.values()) task.nextDueAt = 0;
  }

  assert.deepEqual(requests, ['pose_body17', 'pose_hand21', 'ocr']);
  session.disableCamera();
});

test('stage sensing keeps the hardware default but allows an explicit concurrency override', () => {
  const {StageSensingSession} = require('../src/extensions/scratch3_xedu_ai/stage-sensing');
  const session = new StageSensingSession({}, {autoRefresh: false, maxConcurrentRequests: 4});

  assert.equal(session.maxConcurrentRequests, 4);
  session.disableCamera();
});

test('slow realtime inference resumes immediately without a fixed 500ms wait', async () => {
  const {StageSensingSession} = require('../src/extensions/scratch3_xedu_ai/stage-sensing');
  let requests = 0;
  const startedAt = Date.now();
  const session = new StageSensingSession({
    ioDevices: {video: {enableVideo () { return Promise.resolve(); }, disableVideo () {}}},
  }, {
    autoRefresh: true,
    intervalMs: 100,
    getFrame: async () => `data:image/jpeg;base64,frame-${requests}`,
    request: async () => {
      requests += 1;
      await new Promise(resolve => setTimeout(resolve, 250));
      return {success: true, result: {output: [[requests, 1]]}};
    },
  });

  await session.enable('pose_body17');
  await new Promise((resolve, reject) => {
    const deadline = Date.now() + 900;
    const check = () => {
      if (requests >= 3) return resolve();
      if (Date.now() >= deadline) return reject(new Error(`only received ${requests} requests`));
      setTimeout(check, 10);
    };
    check();
  });
  assert.ok(Date.now() - startedAt < 900);
  session.disableCamera();
});

test('stage sensing encodes large image frames as bounded JPEG input', async () => {
  const {StageSensingSession} = require('../src/extensions/scratch3_xedu_ai/stage-sensing');
  const originalDocument = global.document;
  const imageData = new Uint8ClampedArray(960 * 720 * 4);
  const canvasCalls = [];
  let requestFrame = '';
  global.document = {
    createElement (tagName) {
      assert.equal(tagName, 'canvas');
      return {
        width: 0,
        height: 0,
        getContext () {
          return {
            putImageData (frame) { canvasCalls.push({type: 'putImageData', width: frame.width, height: frame.height}); },
            drawImage (...args) { canvasCalls.push({type: 'drawImage', args}); },
          };
        },
        toDataURL (mimeType, quality) {
          canvasCalls.push({type: 'toDataURL', mimeType, quality});
          return `data:${mimeType};base64,${'a'.repeat(1000)}`;
        },
      };
    },
  };

  try {
    const session = new StageSensingSession({ioDevices: {video: {enableVideo () {}}}}, {
      autoRefresh: false,
      getFrame: async () => ({data: imageData, width: 960, height: 720}),
      request: async (_taskId, frame) => {
        requestFrame = frame;
        return {success: true, result: {output: [[320, 240]]}};
      },
    });

    await session.enable('pose_body17');
    const encoding = canvasCalls.find(call => call.type === 'toDataURL');
    const draw = canvasCalls.find(call => call.type === 'drawImage');
    assert.equal(encoding.mimeType, 'image/jpeg');
    assert.equal(encoding.quality, 0.75);
    assert.deepEqual(draw.args.slice(-2), [640, 480]);
    assert.equal(session.frameSize('pose_body17').width, 640);
    assert.equal(session.frameSize('pose_body17').height, 480);
    assert.match(requestFrame, /^data:image\/jpeg;base64,/);
    assert.ok(Buffer.byteLength(JSON.stringify({spec: {input: requestFrame}}), 'utf8') < 800 * 1024);
  } finally {
    global.document = originalDocument;
  }
});

test('stage sensing uses an asynchronous JPEG Blob and carries frame metadata', async () => {
  const {StageSensingSession} = require('../src/extensions/scratch3_xedu_ai/stage-sensing');
  const originalDocument = global.document;
  const requests = [];
  global.document = {
    createElement () {
      return {
        width: 0,
        height: 0,
        getContext () {
          return {putImageData () {}, drawImage () {}};
        },
        toBlob (callback) {
          setTimeout(() => callback(new Blob(['jpeg-frame'], {type: 'image/jpeg'})), 0);
        },
      };
    },
  };
  try {
    const session = new StageSensingSession({ioDevices: {video: {enableVideo () {}}}}, {
      autoRefresh: false,
      getFrame: async () => ({data: new Uint8ClampedArray(8 * 6 * 4), width: 8, height: 6}),
      request: async (taskId, frame, metadata) => {
        requests.push({taskId, frame, metadata});
        return {success: true, result: {output: {keypoints: [[2, 3]]}}};
      },
    });

    await session.enable('pose_body17');

    assert.equal(session.intervalMs, 100);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].taskId, 'pose_body17');
    assert.equal(requests[0].frame instanceof Blob, true);
    assert.equal(requests[0].frame.type, 'image/jpeg');
    assert.equal(requests[0].metadata.sessionId, session.sessionId);
    assert.equal(requests[0].metadata.frameSequence, 1);
    assert.equal(typeof requests[0].metadata.capturedAtMs, 'number');
  } finally {
    global.document = originalDocument;
  }
});

test('Scratch stop button disables stage video and stops direct camera streams', async () => {
  const Scratch3XEduAI = require('../node_modules/@scratch/scratch-vm/src/extensions/scratch3_xedu_ai/index.js');
  const videoCalls = [];
  const trackStops = [];
  const originalNavigator = global.navigator;
  Object.defineProperty(global, 'navigator', {
    configurable: true,
    writable: true,
    value: {
    mediaDevices: {
      async getUserMedia () {
        return {
          getTracks () {
            return [{
              stop () {
                trackStops.push('stop');
              },
            }];
          },
        };
      },
    },
    },
  });

  const runtimeEvents = {};
  const runtime = {
    on (event, handler) {
      runtimeEvents[event] = handler;
    },
    ioDevices: {
      video: {
        disableVideo () {
          videoCalls.push('disable');
        },
      },
    },
  };

  try {
    const extension = new Scratch3XEduAI(runtime, 'camera');
    await extension._openCamera('0');
    runtimeEvents.PROJECT_STOP_ALL();

    assert.deepEqual(videoCalls, ['disable']);
    assert.deepEqual(trackStops, ['stop']);
    assert.equal(extension._cameraStreams.size, 0);
  } finally {
    Object.defineProperty(global, 'navigator', {
      configurable: true,
      writable: true,
      value: originalNavigator,
    });
  }
});

test('stage sensing draws pose keypoints on a dedicated overlay layer', async () => {
  const {StageSensingSession} = require('../src/extensions/scratch3_xedu_ai/stage-sensing');
  const originalDocument = global.document;
  const arcs = [];
  const visibleCalls = [];
  const bitmapUpdates = [];
  let redraws = 0;
  global.document = {
    createElement (tagName) {
      assert.equal(tagName, 'canvas');
      return {
        width: 0,
        height: 0,
        getContext () {
          return {
            putImageData () {},
            clearRect () {},
            beginPath () {},
            arc (x, y, radius) { arcs.push([x, y, radius]); },
            fill () {},
            stroke () {},
            set fillStyle (_) {},
            set lineWidth (_) {},
            set strokeStyle (_) {},
          };
        },
        toDataURL () {
          return 'data:image/png;base64,frame';
        },
      };
    },
  };

  const runtime = {
    ioDevices: {video: {enableVideo () {}}},
    renderer: {
      createBitmapSkin (bitmap, resolution) {
        bitmapUpdates.push({bitmap, resolution});
        return 11;
      },
      createDrawable (group) {
        assert.equal(group, 'video');
        return 12;
      },
      updateDrawableSkinId () {},
      setDrawableOrder (drawableId, order, group) {
        assert.equal(drawableId, 12);
        assert.equal(group, 'video');
        assert.equal(order, Infinity);
      },
      updateBitmapSkin (skinId, bitmap, resolution) {
        assert.equal(skinId, 11);
        bitmapUpdates.push({bitmap, resolution});
      },
      updateDrawableVisible (drawableId, visible) {
        assert.equal(drawableId, 12);
        visibleCalls.push(visible);
      },
    },
    requestRedraw () {
      redraws += 1;
    },
  };

  try {
    const session = new StageSensingSession(runtime, {
      autoRefresh: false,
      getFrame: async () => ({data: new Uint8ClampedArray(100 * 50 * 4), width: 100, height: 50}),
      request: async () => ({success: true, result: {output: [[25, 10], [75, 20]]}}),
    });

    await session.enable('pose_body17');
    await session.showKeypoints('pose_body17');
    assert.ok(arcs.some(([x, y, radius]) => Math.abs(x - 120) < 0.01 && Math.abs(y - 72) < 0.01 && radius === 5));
    assert.ok(arcs.some(([x, y]) => Math.abs(x - 360) < 0.01 && Math.abs(y - 144) < 0.01));
    assert.equal(visibleCalls.includes(true), true);
    assert.ok(bitmapUpdates.some(call => call.bitmap.width === 480 && call.bitmap.height === 360 && call.resolution === 1));

    session.hideKeypoints('pose_body17');
    assert.equal(visibleCalls.at(-1), false);
    assert.ok(redraws > 0);
  } finally {
    global.document = originalDocument;
  }
});

test('stage sensing publishes every completed result frame to the renderer', async () => {
  const {StageSensingSession} = require('../src/extensions/scratch3_xedu_ai/stage-sensing');
  const originalDocument = global.document;
  const arcsInCurrentFrame = [];
  const renderedFrames = [];
  let frameNumber = 0;
  global.document = {
    createElement (tagName) {
      assert.equal(tagName, 'canvas');
      return {
        width: 0,
        height: 0,
        getContext () {
          return {
            putImageData () {},
            clearRect () { arcsInCurrentFrame.length = 0; },
            beginPath () {},
            arc (x, y, radius) { arcsInCurrentFrame.push([x, y, radius]); },
            fill () {},
            stroke () {},
            set fillStyle (_) {},
            set lineWidth (_) {},
            set strokeStyle (_) {},
          };
        },
        toDataURL () { return 'data:image/jpeg;base64,camera-frame'; },
      };
    },
  };
  const runtime = {
    ioDevices: {video: {enableVideo () {}}},
    renderer: {
      createBitmapSkin () { return 31; },
      createDrawable () { return 32; },
      updateDrawableSkinId () {},
      setDrawableOrder () {},
      updateBitmapSkin () { renderedFrames.push(arcsInCurrentFrame.slice()); },
      updateDrawableVisible () {},
    },
    requestRedraw () {},
  };

  try {
    const session = new StageSensingSession(runtime, {
      autoRefresh: false,
      getFrame: async () => ({data: new Uint8ClampedArray(100 * 50 * 4), width: 100, height: 50}),
      request: async () => {
        frameNumber += 1;
        return {success: true, result: {output: [[frameNumber === 1 ? 25 : 75, frameNumber === 1 ? 10 : 20]]}};
      },
    });

    await session.enable('pose_body17');
    await session.showKeypoints('pose_body17');

    const frames = renderedFrames.filter(frame => frame.length);
    assert.deepEqual(frames.slice(-2).map(frame => frame[0].slice(0, 2)), [[120, 72], [360, 144]]);
  } finally {
    global.document = originalDocument;
  }
});

test('stage sensing assigns one frame sequence to every task sharing a capture', async () => {
  const {StageSensingSession} = require('../src/extensions/scratch3_xedu_ai/stage-sensing');
  const requests = [];
  const session = new StageSensingSession({}, {
    autoRefresh: false,
    maxConcurrentRequests: 2,
    getFrame: async () => 'data:image/png;base64,shared-frame',
    request: async (taskId, _frame, metadata) => {
      requests.push({taskId, metadata});
      return {success: true, result: {output: [[1, 2]]}, session_id: metadata.sessionId, frame_seq: metadata.frameSequence};
    },
  });
  session._task('pose_body17').enabled = true;
  session._task('pose_hand21').enabled = true;

  session._pump(true);
  await session.captureInFlight;

  assert.equal(requests.length, 2);
  assert.equal(requests[0].metadata.frameSequence, requests[1].metadata.frameSequence);
});

test('stage sensing includes every enabled sensing task in the overlay', () => {
  const {StageSensingSession} = require('../src/extensions/scratch3_xedu_ai/stage-sensing');
  const session = new StageSensingSession({}, {autoRefresh: false});
  const taskIds = [
    'cls_imagenet', 'det_coco_l', 'pose_face106', 'pose_body17',
    'pose_hand21', 'ocr', 'segment_anything', 'depth_anything',
  ];
  const entries = [];
  session.overlay = {draw: value => entries.push(value), clear () {}};
  for (const taskId of taskIds) {
    const task = session._task(taskId);
    task.enabled = true;
    task.ready = true;
    task.payload = {success: true, result: {output: []}};
    task.overlayVisible = true;
  }

  session._renderOverlay();

  assert.deepEqual(entries.at(-1).map(entry => entry.taskId), taskIds);
});

test('stage sensing does not let an old request decrement a new session counter', async () => {
  const {StageSensingSession} = require('../src/extensions/scratch3_xedu_ai/stage-sensing');
  const resolvers = [];
  const session = new StageSensingSession({}, {
    autoRefresh: false,
    getFrame: async () => 'data:image/png;base64:frame',
    request: () => new Promise(resolve => resolvers.push(resolve)),
  });

  session._task('pose_body17').enabled = true;
  session._pump(true);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(session.activeRequests, 1);
  session.disableCamera();
  session._task('pose_hand21').enabled = true;
  session._pump(true);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(session.activeRequests, 1);

  resolvers[0]({success: true, result: {output: [[1, 2]]}});
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(session.activeRequests, 1);
  resolvers[1]({success: true, result: {output: [[3, 4]]}});
});

test('stage sensing ignores an obsolete preview image callback', () => {
  const {StageSensingSession} = require('../src/extensions/scratch3_xedu_ai/stage-sensing');
  const originalDocument = global.document;
  const originalImage = global.Image;
  const images = [];
  const previews = [];
  const visibility = [];
  global.Image = class FakeImage {
    constructor () { images.push(this); }
    set src (value) { this.source = value; }
    get width () { return 100; }
    get height () { return 100; }
  };
  global.document = {
    createElement (tagName) {
      assert.equal(tagName, 'canvas');
      return {
        width: 0,
        height: 0,
        getContext () {
          return {
            clearRect () {},
            drawImage (image) { previews.push(image.source); },
          };
        },
      };
    },
  };
  const runtime = {
    renderer: {
      createBitmapSkin () { return 41; },
      createDrawable () { return 42; },
      updateDrawableSkinId () {},
      setDrawableOrder () {},
      updateBitmapSkin () {},
      updateDrawableVisible (_drawableId, visible) { visibility.push(visible); },
    },
    requestRedraw () {},
  };

  try {
    const session = new StageSensingSession(runtime, {autoRefresh: false});
    session.showResult('det_body', {success: true, result_artifacts: {preview_image: 'preview-1'}});
    session.showResult('det_body', {success: true, result_artifacts: {preview_image: 'preview-2'}});

    assert.equal(visibility.at(-1), false);
    images[0].onload();
    assert.deepEqual(previews, []);
    images[1].onload();
    assert.deepEqual(previews, ['preview-2']);
  } finally {
    global.document = originalDocument;
    global.Image = originalImage;
  }
});

test('XEdu results draw detection boxes and summaries on the Scratch stage', () => {
  const {StageSensingSession} = require('../src/extensions/scratch3_xedu_ai/stage-sensing');
  const originalDocument = global.document;
  const rectangles = [];
  const labels = [];
  const visibleCalls = [];
  global.document = {
    createElement (tagName) {
      assert.equal(tagName, 'canvas');
      return {
        width: 0,
        height: 0,
        getContext () {
          return {
            clearRect () {},
            strokeRect (...args) { rectangles.push(args); },
            fillText (text, x, y) { labels.push([text, x, y]); },
          };
        },
      };
    },
  };
  const runtime = {
    renderer: {
      createBitmapSkin () { return 21; },
      createDrawable () { return 22; },
      updateDrawableSkinId () {},
      setDrawableOrder () {},
      updateBitmapSkin () {},
      updateDrawableVisible (_drawableId, visible) { visibleCalls.push(visible); },
    },
    requestRedraw () {},
  };

  try {
    const session = new StageSensingSession(runtime, {autoRefresh: false});
    session.showResult('det_body', {
      success: true,
      result_type: 'detection',
      result_summary: {headline: '检测到 1 个目标'},
      result: {output: [{bbox: [10, 20, 50, 80], label: 'person'}]},
    }, {width: 100, height: 100});

    assert.deepEqual(rectangles, [[48, 72, 192, 216]]);
    assert.deepEqual(labels[0], ['person', 52, 68]);
    assert.equal(visibleCalls.includes(true), true);
    session.clearResult();
    assert.equal(visibleCalls.at(-1), false);
  } finally {
    global.document = originalDocument;
  }
});

test('OCR results draw text regions and labels on the Scratch stage', () => {
  const {StageSensingSession} = require('../src/extensions/scratch3_xedu_ai/stage-sensing');
  const originalDocument = global.document;
  const rectangles = [];
  const labels = [];
  global.document = {
    createElement (tagName) {
      assert.equal(tagName, 'canvas');
      return {
        width: 0,
        height: 0,
        getContext () {
          return {
            clearRect () {},
            strokeRect (...args) { rectangles.push(args); },
            fillText (text, x, y) { labels.push([text, x, y]); },
          };
        },
      };
    },
  };
  const runtime = {
    renderer: {
      createBitmapSkin () { return 23; },
      createDrawable () { return 24; },
      updateDrawableSkinId () {},
      setDrawableOrder () {},
      updateBitmapSkin () {},
      updateDrawableVisible () {},
    },
    requestRedraw () {},
  };

  try {
    const session = new StageSensingSession(runtime, {autoRefresh: false});
    session.showResult('ocr', {
      success: true,
      result: {output: [[[[10, 20], [50, 20], [50, 80], [10, 80]], 'hello', 0.97]]},
    }, {width: 100, height: 100});

    assert.deepEqual(rectangles, [[48, 72, 192, 216]]);
    assert.deepEqual(labels[0], ['hello', 52, 68]);
  } finally {
    global.document = originalDocument;
  }
});

test('body sensing reads backend pose arrays as people and keypoints', async () => {
  const Scratch3XEduAI = require('../node_modules/@scratch/scratch-vm/src/extensions/scratch3_xedu_ai/index.js');
  const runtime = {ioDevices: {video: {enableVideo () {}}}};
  const extension = new Scratch3XEduAI(runtime, 'bodySensing');
  const session = extension._sensingSession();
  session.options.autoRefresh = false;
  session.options.getFrame = async () => 'data:image/png;base64,frame';
  session.options.request = async () => ({success: true, result: {output: [[100, 40], [110, 60]]}});

  await extension.enableBodySensing();
  assert.equal(extension.bodyDetected(), true);
  assert.equal(extension.bodyCount(), 1);
  assert.equal(extension.bodyPointAxis({POINT: '1', AXIS: 'x'}), 100);
  assert.equal(extension.bodyPointAxis({POINT: '2', AXIS: 'y'}), 60);

  session._task('pose_body17').payload = {success: true, result: {output: [
    [[100, 40], [110, 60]],
    [[300, 50], [310, 70]],
  ]}};
  assert.equal(extension.bodyCount(), 2);
  assert.equal(extension.bodyPointAxis({POINT: '1', AXIS: 'x'}), 100);
});

test('pose sensing derives subject positions from keypoint arrays', () => {
  const Scratch3XEduAI = require('../node_modules/@scratch/scratch-vm/src/extensions/scratch3_xedu_ai/index.js');
  const runtime = {ioDevices: {video: {enableVideo () {}}}};
  const extension = new Scratch3XEduAI(runtime, 'bodySensing');
  const session = extension._sensingSession();
  session._task('pose_body17').payload = {success: true, result: {output: [
    [[100, 40], [200, 140]],
  ]}};
  session._task('pose_body17').frameSize = {width: 400, height: 200};
  assert.equal(extension.bodyPosition({INDEX: '1', POSITION: 'centerX'}), -60);
  assert.equal(extension.bodyPosition({INDEX: '1', POSITION: 'centerY'}), 18);
  assert.equal(extension.bodyPosition({INDEX: '1', POSITION: 'width'}), 120);
  assert.equal(extension.bodyPosition({INDEX: '1', POSITION: 'height'}), 180);
});

test('depth sensing reads a direct two-dimensional backend output', () => {
  const Scratch3XEduAI = require('../node_modules/@scratch/scratch-vm/src/extensions/scratch3_xedu_ai/index.js');
  const runtime = {ioDevices: {video: {enableVideo () {}}}};
  const extension = new Scratch3XEduAI(runtime, 'depthSensing');
  const session = extension._sensingSession();
  session._task('depth_anything').payload = {success: true, result: {output: [
    [0.1, 0.2],
    [0.3, 0.4],
  ]}};
  assert.equal(extension.depthValue({X: '240', Y: '180'}), 0.2);
});

test('classification sensing reads a backend probability vector', () => {
  const Scratch3XEduAI = require('../node_modules/@scratch/scratch-vm/src/extensions/scratch3_xedu_ai/index.js');
  const runtime = {ioDevices: {video: {enableVideo () {}}}};
  const extension = new Scratch3XEduAI(runtime, 'imageClassification');
  const session = extension._sensingSession();
  session._task('cls_imagenet').payload = {success: true, result: {output: [[0.1, 0.7, 0.2]]}};
  assert.equal(extension.classificationLabel(), 'ImageNet 类别 1');
  assert.equal(extension.classificationConfidence(), 0.7);
  assert.equal(extension.classificationIs({TARGET: 'ImageNet 类别 1'}), true);
});

test('disabling camera clears stale sensing results and ignores late responses', async () => {
  const {StageSensingSession} = require('../src/extensions/scratch3_xedu_ai/stage-sensing');
  let resolveRequest;
  const session = new StageSensingSession({ioDevices: {video: {enableVideo () {}, disableVideo () {}}}}, {
    autoRefresh: false,
    getFrame: async () => 'data:image/png;base64,frame',
    request: () => new Promise(resolve => { resolveRequest = resolve; }),
  });
  const request = session.enable('pose_body17');
  await new Promise(resolve => setImmediate(resolve));
  session.disableCamera();
  resolveRequest({success: true, result: {output: [[1, 2]]}});
  await request;
  assert.equal(session.isReady('pose_body17'), false);
  assert.equal(session.result('pose_body17'), null);
});

test('a late request from an old camera session cannot resolve a new first result', async () => {
  const {StageSensingSession} = require('../src/extensions/scratch3_xedu_ai/stage-sensing');
  let resolveFirstRequest;
  let resolveSecondRequest;
  let requestCount = 0;
  const session = new StageSensingSession({ioDevices: {video: {enableVideo () {}, disableVideo () {}}}}, {
    autoRefresh: false,
    getFrame: async () => 'data:image/png;base64,frame',
    request: () => {
      requestCount += 1;
      return new Promise(resolve => {
        if (requestCount === 1) resolveFirstRequest = resolve;
        else resolveSecondRequest = resolve;
      });
    },
  });

  const first = session.enable('pose_body17');
  await new Promise(resolve => setImmediate(resolve));
  session.disableCamera();
  const second = session.enable('pose_body17');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(requestCount, 2);

  resolveFirstRequest({success: true, result: {output: [[1, 2]]}});
  await first;
  let secondSettled = false;
  void second.then(() => { secondSettled = true; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(secondSettled, false);

  resolveSecondRequest({success: true, result: {output: [[3, 4]]}});
  await second;
  assert.deepEqual(session.result('pose_body17').result.output, [[3, 4]]);
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
  for (const [id, showOpcode, hideOpcode] of [
    ['xeduFaceSensing', 'showFaceKeypoints', 'hideFaceKeypoints'],
    ['xeduBodySensing', 'showBodyKeypoints', 'hideBodyKeypoints'],
    ['xeduHandSensing', 'showHandKeypoints', 'hideHandKeypoints'],
  ]) {
    const extension = extensions.find(item => item.id === id);
    assert.ok(extension.blocks.some(block => block.opcode === showOpcode), `${id} is missing ${showOpcode}`);
    assert.ok(extension.blocks.some(block => block.opcode === hideOpcode), `${id} is missing ${hideOpcode}`);
  }
});

test('every visible XEdu block has a callable runtime implementation', async () => {
  const modules = [
    ['xedu_camera', 'camera'],
    ['xedu_image_classification', 'imageClassification'],
    ['xedu_object_sensing', 'objectSensing'],
    ['xedu_face_sensing', 'faceSensing'],
    ['xedu_body_sensing', 'bodySensing'],
    ['xedu_hand_sensing', 'handSensing'],
    ['xedu_text_recognition', 'textRecognition'],
    ['xedu_image_segmentation', 'imageSegmentation'],
    ['xedu_depth_sensing', 'depthSensing'],
    ['xedu_device', 'device'],
  ];
  const runtime = {ioDevices: {video: {enableVideo () {}, disableVideo () {}, setPreviewGhost () {}}}};
  for (const [fileName, moduleKey] of modules) {
    const Extension = require(`../node_modules/@scratch/scratch-vm/src/extensions/${fileName}`);
    const extension = new Extension(runtime);
    const info = extension.getInfo();
    for (const block of info.blocks.filter(item => item !== '---' && !item.hideFromPalette)) {
      assert.equal(typeof extension[block.opcode], 'function', `${moduleKey}.${block.opcode} is not callable`);
    }
  }
});

test('visible sensing extensions map to their backend task ids', async () => {
  const modules = [
    ['xedu_image_classification', 'cls_imagenet', 'enableClassification'],
    ['xedu_object_sensing', 'det_coco_l', 'enableObjectSensing'],
    ['xedu_face_sensing', 'pose_face106', 'enableFaceSensing'],
    ['xedu_body_sensing', 'pose_body17', 'enableBodySensing'],
    ['xedu_hand_sensing', 'pose_hand21', 'enableHandSensing'],
    ['xedu_text_recognition', 'ocr', 'enableTextRecognition'],
    ['xedu_image_segmentation', 'segment_anything', 'enableSegmentation'],
    ['xedu_depth_sensing', 'depth_anything', 'enableDepthSensing'],
  ];
  for (const [fileName, taskId, method] of modules) {
    const Extension = require(`../node_modules/@scratch/scratch-vm/src/extensions/${fileName}`);
    const runtime = {ioDevices: {video: {enableVideo () {}}}};
    const extension = new Extension(runtime);
    const session = extension._sensingSession();
    session.options.autoRefresh = false;
    session.options.getFrame = async () => 'data:image/png;base64,frame';
    let requestedTask;
    session.options.request = async actualTask => {
      requestedTask = actualTask;
      return {success: true, result: {output: []}};
    };
    await extension[method]();
    assert.equal(requestedTask, taskId);
  }
});

test('device blocks send the expected command payloads', async () => {
  const Extension = require('../node_modules/@scratch/scratch-vm/src/extensions/xedu_device');
  const extension = new Extension({});
  const originalFetch = global.fetch;
  const originalWindow = global.window;
  const requests = [];
  global.window = {location: {search: '?deviceBase=http%3A%2F%2Fk10.local'}};
  global.fetch = async (url, options) => {
    requests.push({url, options, body: JSON.parse(options.body)});
    return {text: async () => 'ok'};
  };
  try {
    await extension._dispatch('xeduhub_http_send_command', {BASE_URL: 'http://k10.local', CMD: '{"pin":"D4"}'});
    await extension._dispatch('xeduhub_k10_gpio_write', {PIN: 'D4', VALUE: '1'});
    await extension._dispatch('xeduhub_k10_pwm_write', {PIN: 'D5', DUTY: '0.5', FREQ: '1000'});
    await extension._dispatch('xeduhub_k10_uart_send', {PORT: 'uart1', TEXT: 'hello'});
    await extension._dispatch('xeduhub_servo_write_angle', {SERVO_VAR: 'servo', ANGLE: '90'});
    assert.equal(requests.length, 5);
    assert.deepEqual(requests.map(request => request.url), [
      'http://k10.local/command', 'http://k10.local/command', 'http://k10.local/command',
      'http://k10.local/command', 'http://k10.local/command',
    ]);
    assert.deepEqual(requests[1].body, {command: {pin: 'D4', value: '1'}});
    assert.deepEqual(requests[2].body, {command: {pin: 'D5', duty: '0.5', frequency: '1000'}});
    assert.deepEqual(requests[3].body, {command: {port: 'uart1', text: 'hello'}});
    assert.deepEqual(requests[4].body, {command: {servo: 'servo', angle: '90'}});
  } finally {
    global.fetch = originalFetch;
    global.window = originalWindow;
  }
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
