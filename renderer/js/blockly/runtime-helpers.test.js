import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { JSDOM } from 'jsdom';
import * as Blockly from 'blockly';
import * as libraryBlocks from 'blockly/blocks';
import { pythonGenerator } from 'blockly/python';

import {
  applyWorkspaceSnapshot,
  collectXEduHubSpecFromBlocks,
  getPythonCodeForWorkspace,
  getWorkspaceExportPayload,
  parseAndMigrateWorkspaceText,
  validateWorkspaceBindingsForBlocks,
} from './runtime-helpers.js';
import {
  mergeToolboxes,
  validateToolboxPayload,
} from './toolbox-utils.js';
import {
  getParamFieldName,
  getXEduHubTaskRegistry,
  defineXEduHubBlocks,
  getTaskById,
  getTaskIdFromRunBlockType,
  isSemanticRunBlockType,
  migrateXEduHubXmlText,
  migrateXEduHubSerialized,
  resolveLegacyTaskId,
} from './xeduhub-blocks.js';

void libraryBlocks;
globalThis.window = globalThis.window || { __XEDU_BLOCKLY_RUNTIME_CONFIG__: {} };
const { window: domWindow } = new JSDOM('', { url: 'http://localhost/' });
globalThis.DOMParser = globalThis.DOMParser || domWindow.DOMParser;
globalThis.XMLSerializer = globalThis.XMLSerializer || domWindow.XMLSerializer;
defineXEduHubBlocks(Blockly, pythonGenerator);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SAMPLE_DIR = path.resolve(__dirname, '../../../courses/blockly-smoke');
const HAS_PYTHON3 = spawnSync('python3', ['-c', 'import ast'], { encoding: 'utf8' }).status === 0;
const NON_GENERATED_BLOCK_TYPES = new Set([
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
const PYTHON_STUB_MODULES = `
import sys
import types

class _DummyResponse:
  def iter_content(self, chunk_size=16384):
    yield b'x' * max(int(chunk_size), 256)
  def close(self):
    return None

class _DummyWorkflow:
  def __init__(self, task=None, *args, **kwargs):
    self.task = task or 'stub'
  def inference(self, data=None, **kwargs):
    return {'task': self.task, 'data': data, 'params': kwargs}

class _DummyCamera:
  def __init__(self, source=0, window_name='video'):
    self.source = source
    self.window_name = window_name
    self._reads = 0
  @classmethod
  def camera(cls, index=0, window_name='video'):
    return cls(index, window_name)
  @classmethod
  def video(cls, path='demo.mp4', window_name='video'):
    return cls(path, window_name)
  def is_opened(self):
    return self._reads < 1
  def read(self):
    self._reads += 1
    return {'frame': self._reads}
  def should_quit(self, key='q', delay=1):
    return True
  def close(self):
    return None

class _DummyBoard:
  def __init__(self, *args, **kwargs):
    return None
  def begin(self):
    return self

class _DummyPin:
  D4 = 'D4'
  def __init__(self, *args, **kwargs):
    self.value = args[0] if args else None

class _DummyServo:
  def __init__(self, *args, **kwargs):
    self.angle = None
  def write_angle(self, angle):
    self.angle = angle

cv2 = types.ModuleType('cv2')
cv2.imshow = lambda *args, **kwargs: None
cv2.imwrite = lambda *args, **kwargs: True
cv2.waitKey = lambda delay=1: ord('q')
sys.modules['cv2'] = cv2

requests = types.ModuleType('requests')
requests.get = lambda *args, **kwargs: _DummyResponse()
sys.modules['requests'] = requests

numpy = types.ModuleType('numpy')
numpy.polyfit = lambda x, y, degree: [0, 0, 0]
sys.modules['numpy'] = numpy

pinpong = types.ModuleType('pinpong')
pinpong_board = types.ModuleType('pinpong.board')
pinpong_board.Board = _DummyBoard
pinpong_board.Pin = _DummyPin
pinpong_board.Servo = _DummyServo
pinpong.board = pinpong_board
sys.modules['pinpong'] = pinpong
sys.modules['pinpong.board'] = pinpong_board

runtime = types.ModuleType('runtime')
blockly_runtime = types.ModuleType('runtime.blockly_runtime')
blockly_runtime.XEduCamera = _DummyCamera
blockly_runtime.xedu_split_result = lambda value: (value, {'image': True})
blockly_runtime.xedu_first_box = lambda result: [0, 0, 1, 1]
blockly_runtime.xedu_bbox_center_x = lambda box: 0
blockly_runtime.xedu_keypoint_axis = lambda points, index, axis='x': 0
blockly_runtime.xedu_first_text = lambda result: ''
blockly_runtime.xedu_draw_boxes = lambda image, boxes, color=(0, 255, 0), thickness=2: image
blockly_runtime.xedu_decode_chunk_image = lambda chunk: {'frame': True}
blockly_runtime.xedu_frames_to_video = lambda output_dir, output_video_path, fps=30: None
blockly_runtime.xedu_send_command = lambda base_url, cmd, stop_cmd='S', delay=0.3: _DummyResponse()
blockly_runtime.xedu_quadratic_eval = lambda coeffs, x: 0
blockly_runtime.xedu_distance = lambda x1, y1, x2, y2: 0
runtime.blockly_runtime = blockly_runtime
sys.modules['runtime'] = runtime
sys.modules['runtime.blockly_runtime'] = blockly_runtime

XEdu = types.ModuleType('XEdu')
XEdu_hub = types.ModuleType('XEdu.hub')
XEdu_hub.Workflow = _DummyWorkflow
XEdu.hub = XEdu_hub
sys.modules['XEdu'] = XEdu
sys.modules['XEdu.hub'] = XEdu_hub
`;
const PYTHON_STUB_ASSIGNMENTS = `
lab_input = 'demo.jpg'
lab_result = {}
lab_flow = _DummyWorkflow(task='stub')
camera = _DummyCamera.camera()
video = _DummyCamera.video()
response = _DummyResponse()
servo = _DummyServo()
coeff = [0, 0, 0]
display_img = {'image': True}
frame = {'frame': True}
chunk = b'x' * 256
`;

function readSample(name) {
  return fs.readFileSync(path.join(SAMPLE_DIR, name), 'utf8');
}

function getExpectedPythonSnapshotName(workspaceName) {
  return workspaceName.endsWith('.blockly.xml')
    ? workspaceName.slice(0, -12) + '.py'
    : workspaceName.slice(0, -13) + '.py';
}

function getSampleWorkspaceFiles() {
  return fs.readdirSync(SAMPLE_DIR)
    .filter((name) => name.endsWith('.blockly.xml') || name.endsWith('.blockly.json'))
    .sort();
}

function getXEduHubSampleWorkspaceFiles() {
  return getSampleWorkspaceFiles()
    .filter((name) => readSample(name).includes('xeduhub_'));
}

function normalizeText(value) {
  return String(value || '').replace(/\r\n/g, '\n').trim();
}

function normalizePythonSemanticShape(source) {
  const text = normalizeText(source);
  if (!HAS_PYTHON3) {
    return text;
  }
  const normalized = spawnSync(
    'python3',
    ['-c', 'import ast,sys; print(ast.dump(ast.parse(sys.stdin.read()), include_attributes=False))'],
    { input: text, encoding: 'utf8' },
  );
  assert.equal(normalized.status, 0, `Python normalization should succeed:\n${normalized.stderr || normalized.stdout || ''}`);
  return normalizeText(normalized.stdout);
}

function compilePythonOrSkip(source, label) {
  if (!HAS_PYTHON3) {
    return;
  }
  const check = spawnSync(
    'python3',
    ['-c', 'import ast,sys; ast.parse(sys.stdin.read())'],
    { input: String(source || ''), encoding: 'utf8' },
  );
  assert.equal(check.status, 0, `${label} should compile as Python:\n${check.stderr || check.stdout || ''}`);
}

function generateStandaloneScriptForBlock(blockType) {
  const workspace = new Blockly.Workspace();
  const block = workspace.newBlock(blockType);
  const defaultTaskId = getXEduHubTaskRegistry().default_task_id || 'det_body';

  if (block.getField('INPUT')) setFieldValueSmart(block, 'INPUT', 'demo.jpg');
  if (block.getField('INPUTS')) setFieldValueSmart(block, 'INPUTS', '["demo1.jpg","demo2.jpg"]');
  if (block.getField('TASK_ID')) setFieldValueSmart(block, 'TASK_ID', defaultTaskId);
  if (block.getField('TASK')) setFieldValueSmart(block, 'TASK', 'classification');
  if (block.getField('MODEL')) setFieldValueSmart(block, 'MODEL', 'cls_imagenet');
  if (block.getField('PARAMS')) setFieldValueSmart(block, 'PARAMS', '{"thr": 0.5}');
  if (block.getField('RESULT')) setFieldValueSmart(block, 'RESULT', 'lab_result');
  if (block.getField('ERROR_VAR')) setFieldValueSmart(block, 'ERROR_VAR', 'lab_error');
  if (block.getField('VAR')) setFieldValueSmart(block, 'VAR', 'lab_result', 'lab_result');

  pythonGenerator.init(workspace);
  const raw = pythonGenerator.blockToCode(block);
  const body = Array.isArray(raw) ? `__result = ${raw[0]}\n` : String(raw || '');
  const script = pythonGenerator.finish(body);

  workspace.dispose();
  return { body, script };
}

function buildExecutableStubbedScript(blockType) {
  const { body, script } = generateStandaloneScriptForBlock(blockType);
  const insertionPoint = script.lastIndexOf(body);
  const preamble = insertionPoint >= 0 ? script.slice(0, insertionPoint) : script;
  return `${PYTHON_STUB_MODULES}\n${preamble}\n${PYTHON_STUB_ASSIGNMENTS}\n${body}`;
}

function ensureScenarioVariable(workspace, name) {
  const variableMap = workspace.getVariableMap();
  return variableMap.getAllVariables().find((variable) => variable.name === name) || variableMap.createVariable(name);
}

function ensureScenarioVariables(workspace) {
  const names = [
    'lab_flow',
    'lab_result',
    'display_img',
    'camera',
    'video',
    'frame',
    'response',
    'chunk',
    'servo',
    'coeff',
  ];
  return Object.fromEntries(names.map((name) => [name, ensureScenarioVariable(workspace, name)]));
}

function getFieldVariableModel(block, fieldName, fallbackName = '') {
  const field = block?.getField?.(fieldName);
  const isVariableField = field instanceof Blockly.FieldVariable
    || String(field?.constructor?.name || '').includes('FieldVariable');
  if (!isVariableField) {
    return null;
  }
  const variableName = String(fallbackName || field?.getText?.() || fieldName || 'value').trim() || 'value';
  return ensureScenarioVariable(block.workspace, variableName);
}

function setFieldValueSmart(block, fieldName, value, fallbackVariableName = '') {
  const variableModel = getFieldVariableModel(block, fieldName, fallbackVariableName || String(value || ''));
  if (variableModel) {
    block.setFieldValue(variableModel.getId(), fieldName);
    return;
  }
  block.setFieldValue(String(value), fieldName);
}

function newTextBlock(workspace, text) {
  const block = workspace.newBlock('text');
  block.setFieldValue(String(text), 'TEXT');
  return block;
}

function newNumberBlock(workspace, value) {
  const block = workspace.newBlock('math_number');
  block.setFieldValue(String(value), 'NUM');
  return block;
}

function newPrintBlock(workspace, text = 'scenario') {
  const printBlock = workspace.newBlock('text_print');
  printBlock.getInput('TEXT')?.connection?.connect(newTextBlock(workspace, text).outputConnection);
  return printBlock;
}

function connectValueInput(parentBlock, inputName, childBlock) {
  parentBlock.getInput(inputName)?.connection?.connect(childBlock.outputConnection);
}

function connectStatementInput(parentBlock, inputName, childBlock) {
  parentBlock.getInput(inputName)?.connection?.connect(childBlock.previousConnection);
}

function chainStatementBlocks(blocks) {
  const normalized = (blocks || []).filter(Boolean);
  for (let index = 0; index < normalized.length - 1; index += 1) {
    const current = normalized[index];
    const next = normalized[index + 1];
    if (current.nextConnection && next.previousConnection && !current.nextConnection.isConnected()) {
      current.nextConnection.connect(next.previousConnection);
    }
  }
  return normalized[0] || null;
}

function configureScenarioBlock(block, workspace, variablesByName) {
  const defaultTaskId = getXEduHubTaskRegistry().default_task_id || 'det_body';
  const variableFields = new Map([
    ['MODEL_VAR', 'lab_flow'],
    ['RESULT_VAR', 'lab_result'],
    ['IMAGE_VAR', 'display_img'],
    ['CAMERA_VAR', 'camera'],
    ['FRAME_VAR', 'frame'],
    ['RESPONSE_VAR', 'response'],
    ['STREAM_VAR', 'response'],
    ['CHUNK_VAR', 'chunk'],
    ['SERVO_VAR', 'servo'],
    ['COEFF_VAR', 'coeff'],
  ]);

  if (block.getField('INPUT')) setFieldValueSmart(block, 'INPUT', 'demo.jpg');
  if (block.getField('INPUTS')) setFieldValueSmart(block, 'INPUTS', '["demo1.jpg","demo2.jpg"]');
  if (block.getField('TASK_ID')) setFieldValueSmart(block, 'TASK_ID', defaultTaskId);
  if (block.getField('TASK')) setFieldValueSmart(block, 'TASK', 'classification');
  if (block.getField('MODEL')) setFieldValueSmart(block, 'MODEL', 'cls_imagenet');
  if (block.getField('PARAMS')) setFieldValueSmart(block, 'PARAMS', '{"thr": 0.5}');
  if (block.getField('RESULT')) setFieldValueSmart(block, 'RESULT', 'lab_result');
  if (block.getField('ERROR_VAR')) setFieldValueSmart(block, 'ERROR_VAR', 'lab_error');
  if (block.getField('VAR')) setFieldValueSmart(block, 'VAR', 'lab_result', 'lab_result');
  if (block.getField('SOURCE')) setFieldValueSmart(block, 'SOURCE', '0');
  if (block.getField('WINDOW')) setFieldValueSmart(block, 'WINDOW', 'video');
  if (block.getField('QUIT_KEY')) setFieldValueSmart(block, 'QUIT_KEY', 'q');
  if (block.getField('DELAY')) setFieldValueSmart(block, 'DELAY', '1');
  if (block.getField('CHUNK_SIZE')) setFieldValueSmart(block, 'CHUNK_SIZE', '16384');
  if (block.getField('MIN_SIZE')) setFieldValueSmart(block, 'MIN_SIZE', '100');
  if (block.getField('STOP_CMD')) setFieldValueSmart(block, 'STOP_CMD', 'S');
  if (block.getField('BOARD')) setFieldValueSmart(block, 'BOARD', 'uno');
  if (block.getField('PIN')) setFieldValueSmart(block, 'PIN', 'D4');
  if (block.getField('FPS')) setFieldValueSmart(block, 'FPS', '30');
  if (block.getField('AXIS')) setFieldValueSmart(block, 'AXIS', 'x');
  if (block.getField('FIELD')) setFieldValueSmart(block, 'FIELD', 'raw');

  for (const [fieldName, variableName] of variableFields.entries()) {
    if (block.getField(fieldName)) {
      const variableModel = variablesByName[variableName] || ensureScenarioVariable(workspace, variableName);
      block.setFieldValue(variableModel.getId(), fieldName);
    }
  }
}

function attachDefaultScenarioInputs(block, workspace, variablesByName) {
  if (block.getInput('INPUT_DATA')) connectValueInput(block, 'INPUT_DATA', newTextBlock(workspace, 'demo.jpg'));
  if (block.getInput('SOURCE')) connectValueInput(block, 'SOURCE', newTextBlock(workspace, 'demo.mp4'));
  if (block.getInput('RESULT')) connectValueInput(block, 'RESULT', newTextBlock(workspace, '{}'));
  if (block.getInput('BOX')) connectValueInput(block, 'BOX', newTextBlock(workspace, '[0, 0, 1, 1]'));
  if (block.getInput('POINTS')) connectValueInput(block, 'POINTS', newTextBlock(workspace, '[]'));
  if (block.getInput('INDEX')) connectValueInput(block, 'INDEX', newNumberBlock(workspace, 0));
  if (block.getInput('FRAME')) connectValueInput(block, 'FRAME', newTextBlock(workspace, 'frame'));
  if (block.getInput('IMAGE')) connectValueInput(block, 'IMAGE', newTextBlock(workspace, 'frame'));
  if (block.getInput('BOXES')) connectValueInput(block, 'BOXES', newTextBlock(workspace, '[]'));
  if (block.getInput('PATH')) connectValueInput(block, 'PATH', newTextBlock(workspace, 'output.jpg'));
  if (block.getInput('OUTPUT_DIR')) connectValueInput(block, 'OUTPUT_DIR', newTextBlock(workspace, 'output'));
  if (block.getInput('OUTPUT_VIDEO')) connectValueInput(block, 'OUTPUT_VIDEO', newTextBlock(workspace, 'output_video.mp4'));
  if (block.getInput('URL')) connectValueInput(block, 'URL', newTextBlock(workspace, 'http://127.0.0.1'));
  if (block.getInput('BASE_URL')) connectValueInput(block, 'BASE_URL', newTextBlock(workspace, 'http://127.0.0.1/state?cmd='));
  if (block.getInput('CMD')) connectValueInput(block, 'CMD', newTextBlock(workspace, 'S'));
  if (block.getInput('ANGLE')) connectValueInput(block, 'ANGLE', newNumberBlock(workspace, 90));
  if (block.getInput('CHUNK')) connectValueInput(block, 'CHUNK', newTextBlock(workspace, 'chunk'));
  if (block.getInput('SIZE')) connectValueInput(block, 'SIZE', newNumberBlock(workspace, 100));
  if (block.getInput('BBOX')) connectValueInput(block, 'BBOX', newTextBlock(workspace, '[0, 0, 1, 1]'));
  if (block.getInput('X_VALUES')) connectValueInput(block, 'X_VALUES', newTextBlock(workspace, '[0, 1, 2]'));
  if (block.getInput('Y_VALUES')) connectValueInput(block, 'Y_VALUES', newTextBlock(workspace, '[0, 1, 4]'));
  if (block.getInput('COEFFS')) connectValueInput(block, 'COEFFS', newTextBlock(workspace, '[0, 0, 0]'));
  if (block.getInput('X')) connectValueInput(block, 'X', newNumberBlock(workspace, 2));
  if (block.getInput('X1')) connectValueInput(block, 'X1', newNumberBlock(workspace, 0));
  if (block.getInput('Y1')) connectValueInput(block, 'Y1', newNumberBlock(workspace, 0));
  if (block.getInput('X2')) connectValueInput(block, 'X2', newNumberBlock(workspace, 3));
  if (block.getInput('Y2')) connectValueInput(block, 'Y2', newNumberBlock(workspace, 4));
}

function attachDefaultScenarioStatements(block, workspace) {
  if (block.getInput('DO')) connectStatementInput(block, 'DO', newPrintBlock(workspace, 'loop tick'));
  if (block.getInput('TRY')) connectStatementInput(block, 'TRY', newPrintBlock(workspace, 'safe branch'));
}

function newConfiguredScenarioBlock(workspace, blockType, variablesByName) {
  const block = workspace.newBlock(blockType);
  configureScenarioBlock(block, workspace, variablesByName);
  attachDefaultScenarioInputs(block, workspace, variablesByName);
  attachDefaultScenarioStatements(block, workspace);
  return block;
}

function createScenarioPreambleBlocks(workspace, blockType, variablesByName) {
  const preambles = [];
  const push = (type) => preambles.push(newConfiguredScenarioBlock(workspace, type, variablesByName));

  if (['xeduhub_workflow_infer', 'xeduhub_execute_workflow', 'xeduhub_flow_execute'].includes(blockType)) {
    push('xeduhub_set_input_resource');
    push('xeduhub_workflow_set_task');
  }
  if (['xeduhub_workflow_infer_var', 'xeduhub_workflow_infer_pair'].includes(blockType)) {
    push('xeduhub_workflow_create_var');
  }
  if (blockType === 'xeduhub_cv_loop_frames') {
    push('xeduhub_cv_open_camera');
  }
  if (['xeduhub_http_loop_stream_frames', 'xeduhub_http_iter_chunks'].includes(blockType)) {
    push('xeduhub_http_open_stream');
  }
  if (blockType === 'xeduhub_servo_write_angle') {
    push('xeduhub_servo_setup');
  }
  if (['xeduhub_result_first_box', 'xeduhub_ocr_first_text', 'xeduhub_get_result_field'].includes(blockType)) {
    push('xeduhub_set_input_resource');
    push('xeduhub_run_det_body');
  }

  return preambles;
}

function buildWorkspaceScenarioForBlock(blockType) {
  const workspace = new Blockly.Workspace();
  const variablesByName = ensureScenarioVariables(workspace);
  const targetBlock = newConfiguredScenarioBlock(workspace, blockType, variablesByName);
  const preambles = createScenarioPreambleBlocks(workspace, blockType, variablesByName);
  const scenarioBlocks = [...preambles];

  let terminalBlock = targetBlock;
  if (targetBlock.outputConnection) {
    const printBlock = workspace.newBlock('text_print');
    printBlock.getInput('TEXT')?.connection?.connect(targetBlock.outputConnection);
    terminalBlock = printBlock;
  }

  scenarioBlocks.push(terminalBlock);
  const rootBlock = chainStatementBlocks(scenarioBlocks) || terminalBlock;
  return { workspace, rootBlock };
}

function generateWorkspaceScenarioScriptForBlock(blockType) {
  const { workspace } = buildWorkspaceScenarioForBlock(blockType);
  const script = getPythonCodeForWorkspace(workspace, pythonGenerator);
  workspace.dispose();
  return script;
}

function executePythonOrSkip(source, label) {
  if (!HAS_PYTHON3) {
    return;
  }
  const run = spawnSync(
    'python3',
    ['-c', 'import sys; exec(sys.stdin.read(), {})'],
    { input: String(source || ''), encoding: 'utf8' },
  );
  assert.equal(run.status, 0, `${label} should execute in stubbed Python:\n${run.stderr || run.stdout || ''}`);
}

function capturePythonStdoutOrSkip(source, label) {
  if (!HAS_PYTHON3) {
    return '';
  }
  const run = spawnSync(
    'python3',
    ['-c', 'import sys; exec(sys.stdin.read(), {})'],
    { input: String(source || ''), encoding: 'utf8' },
  );
  assert.equal(run.status, 0, `${label} should execute and capture stdout:\n${run.stderr || run.stdout || ''}`);
  return normalizeText(run.stdout);
}

test('hello XML sample loads and exports through runtime helpers', () => {
  const workspace = new Blockly.Workspace();
  const xmlText = readSample('hello_classroom.blockly.xml');

  applyWorkspaceSnapshot(Blockly, workspace, { kind: 'xml', value: xmlText });
  const python = getPythonCodeForWorkspace(workspace, pythonGenerator);
  const exported = getWorkspaceExportPayload(Blockly, workspace, '/fixtures/hello_classroom.blockly.xml');

  assert.match(python, /print\('你好，Blockly 课堂'\)/);
  assert.match(python, /print\('今天的实验：' \+ '认识输出'\)/);
  assert.equal(exported.filename, 'hello_classroom.blockly.xml');
  assert.match(exported.content, /<block type="text_print"/);
});

test('JSON workspace sample survives load and export roundtrip', () => {
  const workspace = new Blockly.Workspace();
  const rawJson = readSample('workspace_json_roundtrip.blockly.json');
  const parsed = JSON.parse(rawJson);

  applyWorkspaceSnapshot(Blockly, workspace, { kind: 'json', value: rawJson });
  const python = getPythonCodeForWorkspace(workspace, pythonGenerator);
  const exported = getWorkspaceExportPayload(Blockly, workspace, '/fixtures/workspace_json_roundtrip.blockly.json');
  const exportedJson = JSON.parse(exported.content);

  assert.match(python, /counter = 2/);
  assert.match(python, /for count in range\(2\):/);
  assert.match(python, /print\('第几次：' \+ str\(counter\)\)/);
  assert.equal(exported.filename, 'workspace_json_roundtrip.blockly.json');
  assert.equal(exportedJson.blocks.blocks[0].type, parsed.blocks.blocks[0].type);
  assert.equal(exportedJson.variables[0].name, 'counter');
});

test('parseAndMigrateWorkspaceText handles XML snapshots with an injected migrator', () => {
  const result = parseAndMigrateWorkspaceText('<xml><block type="demo"></block></xml>', {
    migrateXmlText(rawText) {
      return {
        xmlText: rawText.replace('demo', 'demo_migrated'),
        report: { changed: [{ from: 'demo', to: 'demo_migrated' }], failed: [] },
      };
    },
  });

  assert.deepEqual(result.serialized, {
    kind: 'xml',
    value: '<xml><block type="demo_migrated"></block></xml>',
  });
  assert.equal(result.migrationReport.changed.length, 1);
});

test('legacy XEduHub JSON migration upgrades old run blocks to semantic blocks', () => {
  const legacyWorkspace = {
    blocks: {
      languageVersion: 0,
      blocks: [
        {
          type: 'xeduhub_run_vision',
          id: 'legacy_run',
          fields: {
            TASK: 'classification',
            MODEL: 'cls_imagenet',
            INPUT: 'demo.jpg',
          },
        },
      ],
    },
  };

  const migrated = migrateXEduHubSerialized(legacyWorkspace);
  const topBlock = migrated.data.blocks.blocks[0];
  const runBlock = topBlock.next.block;
  const spec = collectXEduHubSpecFromBlocks([topBlock, runBlock], {
    getParamFieldName,
    getTaskById,
    getTaskIdFromRunBlockType,
    isSemanticRunBlockType,
    projectRoot: '/tmp/project',
    resolveLegacyTaskId,
  });

  assert.equal(topBlock.type, 'xeduhub_set_input_resource');
  assert.equal(runBlock.type, 'xeduhub_run_cls_imagenet');
  assert.equal(spec.task_id, 'cls_imagenet');
  assert.equal(spec.input, 'demo.jpg');
  assert.equal(migrated.report.changed.length, 1);
});

test('collectXEduHubSpecFromBlocks extracts semantic task params', () => {
  const detectionTask = getTaskById('det_body');
  const paramValues = {};
  for (const param of detectionTask.params || []) {
    paramValues[getParamFieldName(param.key)] = param.key === 'thr' ? '0.45' : '';
  }
  const fakeBlocks = [
    {
      type: 'xeduhub_set_input_resource',
      getFieldValue(name) {
        return name === 'INPUT' ? 'demo.jpg' : '';
      },
    },
    {
      type: 'xeduhub_run_det_body',
      getFieldValue(name) {
        return paramValues[name] || '';
      },
    },
  ];

  const spec = collectXEduHubSpecFromBlocks(fakeBlocks, {
    getParamFieldName,
    getTaskById,
    getTaskIdFromRunBlockType,
    isSemanticRunBlockType,
    projectRoot: '/tmp/project',
    resolveLegacyTaskId,
  });

  assert.equal(spec.task_id, 'det_body');
  assert.equal(spec.input, 'demo.jpg');
  assert.deepEqual(spec.params, {
    thr: '0.45',
  });
});

test('validateWorkspaceBindingsForBlocks reports unbound camera variables', () => {
  const fakeBlocks = [
    {
      type: 'xeduhub_cv_loop_frames',
      getFieldValue(name) {
        return name === 'CAMERA_VAR' ? 'var-camera-1' : '';
      },
      getField() {
        return { getText: () => 'camera_a' };
      },
    },
  ];

  const error = validateWorkspaceBindingsForBlocks(fakeBlocks, {
    lookupVariableName() {
      return '';
    },
    buildPreflightError(code, message, hint) {
      return { code, message, hint };
    },
  });

  assert.deepEqual(error, {
    code: 'camera_var_unbound',
    message: '循环读取画面使用了未打开的摄像头变量：camera_a',
    hint: '让“打开摄像头到变量”和“循环读取画面”使用同一个摄像头变量。',
  });
});

test('toolbox fixtures validate and merge as expected', () => {
  const customToolbox = JSON.parse(readSample('custom_toolbox.toolbox.json'));
  const invalidToolbox = JSON.parse(readSample('invalid_toolbox.toolbox.json'));
  const baseToolbox = {
    kind: 'categoryToolbox',
    contents: [
      {
        kind: 'category',
        name: '逻辑',
        contents: [{ kind: 'block', type: 'logic_boolean' }],
      },
      {
        kind: 'category',
        name: 'XEduHub',
        contents: [{ kind: 'block', type: 'xeduhub_run_det_body' }],
      },
    ],
  };

  const merged = mergeToolboxes(baseToolbox, customToolbox);
  const mergedNames = merged.contents.map((item) => item.name);
  const validation = validateToolboxPayload(invalidToolbox);

  assert.equal(validateToolboxPayload(customToolbox).valid, true);
  assert.equal(validation.valid, false);
  assert.match(validation.errors[0], /text_changeCase/);
  assert.ok(mergedNames.includes('课堂任务'));
  assert.ok(mergedNames.includes('XEduHub'));
  assert.ok(mergedNames.includes('逻辑'));
});

test('sample pack keeps human-readable python snapshots next to workspaces', () => {
  const workspaceFiles = getSampleWorkspaceFiles();

  assert.ok(workspaceFiles.length >= 9);
  for (const workspaceName of workspaceFiles) {
    const expectedPy = getExpectedPythonSnapshotName(workspaceName);
    assert.equal(fs.existsSync(path.join(SAMPLE_DIR, expectedPy)), true, `${expectedPy} should exist`);
    assert.notEqual(normalizeText(readSample(expectedPy)), '', `${expectedPy} should not be empty`);
  }
});

test('sample pack includes dedicated XEduHub Blockly workspaces', () => {
  const xeduWorkspaceFiles = getXEduHubSampleWorkspaceFiles();

  assert.ok(xeduWorkspaceFiles.length >= 3, `expected at least 3 XEduHub workspace samples, got ${xeduWorkspaceFiles.length}`);
  assert.ok(xeduWorkspaceFiles.includes('vision_demo.blockly.xml'));
  assert.ok(xeduWorkspaceFiles.includes('legacy_xeduhub.blockly.xml'));
  assert.ok(xeduWorkspaceFiles.includes('xeduhub_workflow_result.blockly.xml'));
});

test('all sample Blockly workspaces roundtrip to the expected Python snapshots', () => {
  const workspace = new Blockly.Workspace();
  const xeduWorkspaceFiles = new Set(getXEduHubSampleWorkspaceFiles());
  const workspaceFiles = getSampleWorkspaceFiles().filter((name) => !xeduWorkspaceFiles.has(name));

  assert.ok(workspaceFiles.length >= 9, 'expected a representative Blockly sample pack');

  for (const workspaceName of workspaceFiles) {
    const rawText = readSample(workspaceName);
    const { serialized, migrationReport } = parseAndMigrateWorkspaceText(rawText, {
      migrateXmlText: migrateXEduHubXmlText,
      migrateSerialized: migrateXEduHubSerialized,
    });
    applyWorkspaceSnapshot(Blockly, workspace, serialized);
    const generatedPython = getPythonCodeForWorkspace(workspace, pythonGenerator);
    const migratedCount = migrationReport?.changed?.length ?? 0;

    if (migratedCount > 0) {
      compilePythonOrSkip(generatedPython, `${workspaceName} migrated snapshot`);
      capturePythonStdoutOrSkip(
        `${PYTHON_STUB_MODULES}\n${PYTHON_STUB_ASSIGNMENTS}\n${generatedPython}`,
        `${workspaceName} migrated snapshot`,
      );
      continue;
    }

    const expectedPython = readSample(getExpectedPythonSnapshotName(workspaceName));
    const generatedStdout = capturePythonStdoutOrSkip(
      `${PYTHON_STUB_MODULES}\n${PYTHON_STUB_ASSIGNMENTS}\n${generatedPython}`,
      `${workspaceName} generated snapshot`,
    );
    const expectedStdout = capturePythonStdoutOrSkip(
      `${PYTHON_STUB_MODULES}\n${PYTHON_STUB_ASSIGNMENTS}\n${expectedPython}`,
      `${workspaceName} expected snapshot`,
    );

    assert.equal(
      generatedStdout,
      expectedStdout,
      `${workspaceName} should match the behavior of its checked-in Python snapshot`,
    );
  }

  workspace.dispose();
});

test('XEduHub sample workspaces keep runnable specs and executable Python after migration', () => {
  const workspace = new Blockly.Workspace();
  const sampleExpectations = [
    {
      workspaceName: 'vision_demo.blockly.xml',
      expectedTaskId: 'det_body',
      expectedInput: 'demo.jpg',
      expectedMode: 'preset',
      expectedParams: {},
      migrationChanged: 0,
      expectedPythonPatterns: [
        /lab_flow = wf\(task=lab_task_id\)/,
        /lab_result = lab_flow\.inference\(data=lab_input(?:, \*\*lab_params)?\)/,
        /print\("人体检测结果", lab_result\)/,
      ],
    },
    {
      workspaceName: 'legacy_xeduhub.blockly.xml',
      expectedTaskId: 'det_body',
      expectedInput: 'demo.jpg',
      expectedMode: 'preset',
      expectedParams: {},
      migrationChanged: 2,
      expectedPythonPatterns: [
        /lab_flow = wf\(task=lab_task_id\)/,
        /lab_result = lab_flow\.inference\(data=lab_input(?:, \*\*lab_params)?\)/,
        /print\("Legacy 人体检测结果", lab_result\)/,
      ],
    },
    {
      workspaceName: 'xeduhub_workflow_result.blockly.xml',
      expectedTaskId: 'det_body',
      expectedInput: 'demo.jpg',
      expectedMode: 'workflow',
      expectedParams: {},
      migrationChanged: 0,
      expectedPythonPatterns: [
        /lab_task_id = "det_body"/,
        /lab_params = \{\}/,
        /face_result = lab_flow\.inference\(data=lab_input, \*\*lab_params\)/,
        /face_result\.get\("result_summary", ''\)/,
      ],
    },
  ];

  for (const sample of sampleExpectations) {
    const rawText = readSample(sample.workspaceName);
    const { serialized, migrationReport } = parseAndMigrateWorkspaceText(rawText, {
      migrateXmlText: migrateXEduHubXmlText,
      migrateSerialized: migrateXEduHubSerialized,
    });

    applyWorkspaceSnapshot(Blockly, workspace, serialized);
    const allBlocks = workspace.getAllBlocks(false);
    const spec = collectXEduHubSpecFromBlocks(allBlocks, {
      getParamFieldName,
      getTaskById,
      getTaskIdFromRunBlockType,
      isSemanticRunBlockType,
      projectRoot: '/tmp/project',
      resolveLegacyTaskId,
    });
    const python = getPythonCodeForWorkspace(workspace, pythonGenerator);

    assert.ok(spec, `${sample.workspaceName} should produce an XEduHub runnable spec`);
    assert.equal(spec.task_id, sample.expectedTaskId);
    assert.equal(spec.input, sample.expectedInput);
    assert.equal(spec.mode, sample.expectedMode);
    assert.deepEqual(spec.params, sample.expectedParams);
    assert.equal(migrationReport?.changed?.length ?? 0, sample.migrationChanged);

    for (const pattern of sample.expectedPythonPatterns) {
      assert.match(python, pattern, `${sample.workspaceName} should include ${pattern}`);
    }

    compilePythonOrSkip(python, sample.workspaceName);
    executePythonOrSkip(`${PYTHON_STUB_MODULES}\n${python}`, sample.workspaceName);
  }

  workspace.dispose();
});

test('custom XEduHub blocks generate non-empty Python for most block types', () => {
  const blockTypes = Object.keys(Blockly.Blocks)
    .filter((name) => name.startsWith('xeduhub_'))
    .sort();

  assert.ok(blockTypes.length >= 50, `expected at least 50 custom blocks, got ${blockTypes.length}`);

  for (const blockType of blockTypes) {
    const { body, script } = generateStandaloneScriptForBlock(blockType);
    assert.notEqual(normalizeText(body), '', `${blockType} should emit Python`);
    compilePythonOrSkip(script, blockType);
  }
});

test('representative helper blocks inject the imports their generated Python needs', () => {
  const importExpectations = new Map([
    ['xeduhub_workflow_create_var', /from XEdu\.hub import Workflow as wf/],
    ['xeduhub_result_first_box', /from runtime import blockly_runtime as xrt/],
    ['xeduhub_cv_show_frame', /import cv2/],
    ['xeduhub_http_get', /import requests/],
    ['xeduhub_servo_setup', /from pinpong\.board import Board, Pin, Servo/],
    ['xeduhub_polyfit_quadratic', /import numpy as np/],
  ]);

  for (const [blockType, pattern] of importExpectations.entries()) {
    const { script } = generateStandaloneScriptForBlock(blockType);
    assert.match(script, pattern, `${blockType} should include ${pattern}`);
  }
});

test('custom XEduHub blocks execute successfully in a stubbed Python runtime', () => {
  const blockTypes = Object.keys(Blockly.Blocks)
    .filter((name) => name.startsWith('xeduhub_'))
    .sort();

  assert.ok(blockTypes.length >= 50, `expected at least 50 custom blocks, got ${blockTypes.length}`);

  for (const blockType of blockTypes) {
    const source = buildExecutableStubbedScript(blockType);
    executePythonOrSkip(source, blockType);
  }
});

test('all XEduHub blocks execute from workspace-level scenarios', () => {
  const blockTypes = Object.keys(Blockly.Blocks)
    .filter((name) => name.startsWith('xeduhub_'))
    .sort();

  assert.ok(blockTypes.length >= 57, `expected at least 57 custom XEduHub blocks, got ${blockTypes.length}`);

  for (const blockType of blockTypes) {
    const script = generateWorkspaceScenarioScriptForBlock(blockType);
    assert.notEqual(normalizeText(script), '', `${blockType} should emit a non-empty workspace script`);
    compilePythonOrSkip(script, `${blockType} workspace scenario`);
    executePythonOrSkip(`${PYTHON_STUB_MODULES}\n${PYTHON_STUB_ASSIGNMENTS}\n${script}`, `${blockType} workspace scenario`);
  }
});

test('all user-facing registered Blockly blocks compile to Python', () => {
  const blockTypes = Object.keys(Blockly.Blocks)
    .filter((name) => !NON_GENERATED_BLOCK_TYPES.has(name))
    .sort();

  assert.ok(blockTypes.length >= 120, `expected at least 120 registered blocks, got ${blockTypes.length}`);

  for (const blockType of blockTypes) {
    const { script } = generateStandaloneScriptForBlock(blockType);
    assert.notEqual(normalizeText(script), '', `${blockType} should emit a non-empty Python script`);
    compilePythonOrSkip(script, blockType);
  }
});
