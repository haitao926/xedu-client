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
  DEFAULT_PYTHON_PLACEHOLDER,
  applyWorkspaceSnapshot,
  collectXEduHubPresentationActionsFromBlocks,
  collectXEduHubSpecFromBlocks,
  collectXEduHubTasksFromBlocks,
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
  buildSideNavModel,
} from './runtime-toolbox-ui.js';
import {
  updateTaskContext,
} from './runtime-results.js';
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
const BLOCKLY_COLOR_CONTRACT = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../config/blockly-colors.json'), 'utf8'));
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

class _Image(dict):
  def __getitem__(self, key):
    return self
  def copy(self):
    return _Image(self)

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
  def show(self, frame):
    return frame
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
cv2.COLOR_BGR2RGB = 1
cv2.COLOR_BGR2GRAY = 2
cv2.COLOR_RGB2BGR = 3
cv2.COLOR_GRAY2BGR = 4
cv2.COLOR_BGR2HSV = 5
cv2.ROTATE_90_CLOCKWISE = 6
cv2.ROTATE_90_COUNTERCLOCKWISE = 7
cv2.ROTATE_180 = 8
cv2.THRESH_BINARY = 0
cv2.FONT_HERSHEY_SIMPLEX = 0
cv2.imread = lambda *args, **kwargs: {'image': True}
cv2.imshow = lambda *args, **kwargs: None
cv2.imwrite = lambda *args, **kwargs: True
cv2.waitKey = lambda delay=1: ord('q')
cv2.cvtColor = lambda image, code: image
cv2.resize = lambda image, size: image
cv2.flip = lambda image, code: image
cv2.rotate = lambda image, code: image
cv2.GaussianBlur = lambda image, ksize, sigma: image
cv2.Canny = lambda image, threshold1, threshold2: image
cv2.threshold = lambda image, threshold, max_value, mode: (threshold, image)
cv2.putText = lambda image, text, org, font, scale, color, thickness: image
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
blockly_runtime.xedu_cv_crop = lambda image, x, y, width, height: image
blockly_runtime.xedu_decode_chunk_image = lambda chunk: {'frame': True}
blockly_runtime.xedu_frames_to_video = lambda output_dir, output_video_path, fps=30: None
blockly_runtime.xedu_send_command = lambda base_url, cmd, stop_cmd='S', delay=0.3: _DummyResponse()
blockly_runtime.xedu_quadratic_eval = lambda coeffs, x: 0
blockly_runtime.xedu_distance = lambda x1, y1, x2, y2: 0
blockly_runtime.xedu_emit_runtime_event = lambda event_type, **payload: {'type': event_type, **payload}
blockly_runtime.xedu_show_result_card = lambda result, title='运行结果': {'kind': 'result_card', 'title': title, 'result': result}
blockly_runtime.xedu_show_result_image = lambda image=None, title='结果图': {'kind': 'result_image', 'title': title, 'image': image}
blockly_runtime.xedu_record_conclusion = lambda note='教学结论已记录', result=None: {'kind': 'record_note', 'note': note, 'result': result}
blockly_runtime.xedu_clear_result = lambda: {'kind': 'clear_result'}
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
lab_input = 'courses/blockly-smoke/demo.jpg'
lab_result = {}
lab_flow = _DummyWorkflow(task='stub')
camera = _DummyCamera.camera()
video = _DummyCamera.video()
response = _DummyResponse()
servo = _DummyServo()
coeff = [0, 0, 0]
display_img = {'image': True}
frame = _Image({'frame': True})
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
  if (block.getField('MODEL_VAR')) setFieldValueSmart(block, 'MODEL_VAR', 'lab_flow', 'lab_flow');
  if (block.getField('PARAMS')) setFieldValueSmart(block, 'PARAMS', '{"thr": 0.5}');
  if (block.getField('RESULT_VAR')) setFieldValueSmart(block, 'RESULT_VAR', 'lab_result', 'lab_result');
  if (block.getField('ERROR_VAR')) setFieldValueSmart(block, 'ERROR_VAR', 'lab_error');
  if (block.getField('VAR')) setFieldValueSmart(block, 'VAR', 'lab_result', 'lab_result');
  if (block.getField('TITLE')) setFieldValueSmart(block, 'TITLE', '运行结果');
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
  if (block.getField('COLOR_CODE')) setFieldValueSmart(block, 'COLOR_CODE', 'COLOR_BGR2GRAY');
  if (block.getField('FLIP_CODE')) setFieldValueSmart(block, 'FLIP_CODE', '1');
  if (block.getField('ROTATE_CODE')) setFieldValueSmart(block, 'ROTATE_CODE', 'ROTATE_90_CLOCKWISE');
  if (block.getField('KSIZE')) setFieldValueSmart(block, 'KSIZE', '5');
  if (block.getField('TEXT')) setFieldValueSmart(block, 'TEXT', 'XEdu');
  if (block.getField('TEXT_X')) setFieldValueSmart(block, 'TEXT_X', '20');
  if (block.getField('TEXT_Y')) setFieldValueSmart(block, 'TEXT_Y', '40');
  if (block.getField('TEXT_SCALE')) setFieldValueSmart(block, 'TEXT_SCALE', '1');
  if (block.getField('TEXT_THICKNESS')) setFieldValueSmart(block, 'TEXT_THICKNESS', '2');
  if (block.getField('NOTE')) setFieldValueSmart(block, 'NOTE', '教学结论已记录');

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
  if (block.getInput('VALUE')) connectValueInput(block, 'VALUE', newTextBlock(workspace, 'lab_result'));
  if (block.getInput('BOX')) connectValueInput(block, 'BOX', newTextBlock(workspace, '[0, 0, 1, 1]'));
  if (block.getInput('POINTS')) connectValueInput(block, 'POINTS', newTextBlock(workspace, '[]'));
  if (block.getInput('INDEX')) connectValueInput(block, 'INDEX', newNumberBlock(workspace, 0));
  if (block.getInput('FRAME')) connectValueInput(block, 'FRAME', newTextBlock(workspace, 'frame'));
  if (block.getInput('IMAGE')) connectValueInput(block, 'IMAGE', newTextBlock(workspace, 'frame'));
  if (block.getInput('NOTE')) connectValueInput(block, 'NOTE', newTextBlock(workspace, '教学结论已记录'));
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
  if (block.getInput('WIDTH')) connectValueInput(block, 'WIDTH', newNumberBlock(workspace, 320));
  if (block.getInput('HEIGHT')) connectValueInput(block, 'HEIGHT', newNumberBlock(workspace, 240));
  if (block.getInput('CROP_X')) connectValueInput(block, 'CROP_X', newNumberBlock(workspace, 0));
  if (block.getInput('CROP_Y')) connectValueInput(block, 'CROP_Y', newNumberBlock(workspace, 0));
  if (block.getInput('CROP_W')) connectValueInput(block, 'CROP_W', newNumberBlock(workspace, 100));
  if (block.getInput('CROP_H')) connectValueInput(block, 'CROP_H', newNumberBlock(workspace, 100));
  if (block.getInput('THRESHOLD1')) connectValueInput(block, 'THRESHOLD1', newNumberBlock(workspace, 100));
  if (block.getInput('THRESHOLD2')) connectValueInput(block, 'THRESHOLD2', newNumberBlock(workspace, 200));
  if (block.getInput('THRESHOLD')) connectValueInput(block, 'THRESHOLD', newNumberBlock(workspace, 127));
  if (block.getInput('MAX_VALUE')) connectValueInput(block, 'MAX_VALUE', newNumberBlock(workspace, 255));
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
  const xmlText = `
<xml xmlns="https://developers.google.com/blockly/xml">
  <block type="text_print" id="print_1" x="20" y="20">
    <value name="TEXT">
      <block type="text" id="text_1">
        <field name="TEXT">你好，Blockly 课堂</field>
      </block>
    </value>
    <next>
      <block type="text_print" id="print_2">
        <value name="TEXT">
          <block type="text_join" id="join_1" inline="false">
            <mutation items="2"></mutation>
            <value name="ADD0">
              <block type="text" id="text_2">
                <field name="TEXT">今天的实验：</field>
              </block>
            </value>
            <value name="ADD1">
              <block type="text" id="text_3">
                <field name="TEXT">认识输出</field>
              </block>
            </value>
          </block>
        </value>
      </block>
    </next>
  </block>
</xml>`;

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
  const rawJson = JSON.stringify({
    variables: [{ name: 'counter', id: 'var_counter' }],
    blocks: {
      languageVersion: 0,
      blocks: [
        {
          type: 'variables_set',
          id: 'set_counter',
          fields: { VAR: { id: 'var_counter' } },
          inputs: {
            VALUE: {
              block: {
                type: 'math_number',
                id: 'num_two',
                fields: { NUM: 2 },
              },
            },
          },
          next: {
            block: {
              type: 'controls_repeat_ext',
              id: 'repeat_1',
              inputs: {
                TIMES: {
                  block: {
                    type: 'math_number',
                    id: 'num_repeat',
                    fields: { NUM: 2 },
                  },
                },
                DO: {
                  block: {
                    type: 'text_print',
                    id: 'print_loop',
                    inputs: {
                      TEXT: {
                        block: {
                          type: 'text_join',
                          id: 'join_loop',
                          extraState: { itemCount: 2 },
                          inputs: {
                            ADD0: {
                              block: {
                                type: 'text',
                                id: 'text_prefix',
                                fields: { TEXT: '第几次：' },
                              },
                            },
                            ADD1: {
                              block: {
                                type: 'variables_get',
                                id: 'get_counter',
                                fields: { VAR: { id: 'var_counter' } },
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      ],
    },
  });
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

test('resolveLegacyTaskId downgrades hidden large tasks to standard tasks', () => {
  assert.equal(resolveLegacyTaskId('detection', 'det_body_l'), 'det_body');
  assert.equal(resolveLegacyTaskId('pose', 'pose_body17_l'), 'pose_body17');
});

test('collectXEduHubSpecFromBlocks reads direct input connected to semantic run block', () => {
  const fakeBlocks = [
    {
      type: 'xeduhub_run_det_body',
      inputs: {
        INPUT_DATA: {
          block: {
            type: 'text',
            fields: { TEXT: 'demo.jpg' },
          },
        },
      },
      getFieldValue(name) {
        return name === getParamFieldName('thr') ? '0.3' : '';
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
  assert.deepEqual(spec.params, { thr: '0.3' });
});

test('collectXEduHubSpecFromBlocks reads xeduhub_input_image connected to semantic run block', () => {
  const fakeBlocks = [
    {
      type: 'xeduhub_run_det_body',
      inputs: {
        INPUT_DATA: {
          block: {
            type: 'xeduhub_input_image',
            fields: { INPUT: 'demo.jpg' },
          },
        },
      },
      getFieldValue(name) {
        return name === getParamFieldName('thr') ? '0.3' : '';
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
  assert.deepEqual(spec.params, { thr: '0.3' });
});

test('collectXEduHubSpecFromBlocks marks variable-backed semantic inputs as runtime-bound', () => {
  const fakeBlocks = [
    {
      type: 'xeduhub_run_det_body',
      inputs: {
        INPUT_DATA: {
          block: {
            type: 'variables_get',
            fields: { VAR: { id: 'frame_var', name: 'frame' } },
          },
        },
      },
      getFieldValue(name) {
        return name === getParamFieldName('thr') ? '0.3' : '';
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
  assert.equal(spec.input, '__runtime_bound__');
  assert.deepEqual(spec.params, { thr: '0.3' });
});

test('collectXEduHubSpecFromBlocks treats workflow_create_var and workflow_infer_var as runnable core syntax', () => {
  const fakeBlocks = [
    {
      type: 'xeduhub_set_input_resource',
      getFieldValue(name) {
        return name === 'INPUT' ? 'demo.jpg' : '';
      },
    },
    {
      type: 'xeduhub_workflow_create_var',
      getFieldValue(name) {
        return name === 'TASK_ID' ? 'det_body' : '';
      },
    },
    {
      type: 'xeduhub_workflow_infer_var',
      getFieldValue() {
        return '';
      },
      inputs: {},
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
  assert.equal(spec.mode, 'workflow');
  assert.equal(spec.input, 'demo.jpg');
  assert.deepEqual(spec.params, {});
});

test('collectXEduHubSpecFromBlocks resolves variables_get input back to the image path producer block', () => {
  const fakeBlocks = [
    {
      type: 'xeduhub_load_image_to_var',
      getFieldValue(name) {
        if (name === 'INPUT') return 'demo.jpg';
        if (name === 'IMAGE_VAR') return 'lab_input_var';
        return '';
      },
      getField(name) {
        if (name === 'IMAGE_VAR') {
          return { getText() { return 'lab_input'; } };
        }
        return null;
      },
    },
    {
      type: 'xeduhub_workflow_create_var',
      getFieldValue(name) {
        return name === 'TASK_ID' ? 'det_body' : '';
      },
    },
    {
      type: 'xeduhub_workflow_infer_var',
      getInputTargetBlock(name) {
        if (name !== 'INPUT_DATA') return null;
        return {
          type: 'variables_get',
          getFieldValue(fieldName) {
            return fieldName === 'VAR' ? 'lab_input_var' : '';
          },
          getField(fieldName) {
            if (fieldName === 'VAR') {
              return { getText() { return 'lab_input'; } };
            }
            return null;
          },
        };
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
  assert.equal(spec.mode, 'workflow');
  assert.equal(spec.input, 'demo.jpg');
});

test('default workspace starter chain reads image into a variable before inference', () => {
  const runtimeSource = fs.readFileSync(path.resolve(__dirname, '../blockly-workspace.runtime.js'), 'utf8');
  assert.match(runtimeSource, /type="xeduhub_load_image_to_var"/);
  assert.match(runtimeSource, /lab_input_var/);
  assert.match(runtimeSource, /type="xeduhub_workflow_infer_var"/);
  assert.match(runtimeSource, /<value name="INPUT_DATA">/);
  assert.match(runtimeSource, /type="variables_get"/);
});

test('blockly runtime raises single-line block height and padding', () => {
  const runtimeSource = fs.readFileSync(path.resolve(__dirname, '../blockly-workspace.runtime.js'), 'utf8');
  assert.match(runtimeSource, /MIN_BLOCK_HEIGHT:\s*42/);
  assert.match(runtimeSource, /EMPTY_INLINE_INPUT_HEIGHT:\s*38/);
  assert.match(runtimeSource, /MEDIUM_PADDING:\s*8/);
});

test('blockly runtime exposes resizable code dock state and bindings', () => {
  const runtimeSource = fs.readFileSync(path.resolve(__dirname, '../blockly-workspace.runtime.js'), 'utf8');
  const toolboxUiSource = fs.readFileSync(path.resolve(__dirname, './runtime-toolbox-ui.js'), 'utf8');
  const templateSource = fs.readFileSync(path.resolve(__dirname, '../../../backend/api/resource_runtime.py'), 'utf8');
  const cssSource = fs.readFileSync(path.resolve(__dirname, '../../styles/blockly-workspace.css'), 'utf8');

  assert.match(runtimeSource, /CODE_DOCK_WIDTH_STORAGE_KEY/);
  assert.match(toolboxUiSource, /export function bindCodeDockResize/);
  assert.match(runtimeSource, /codeDockWidth:/);
  assert.match(templateSource, /id="codeDockResizeHandle"/);
  assert.match(cssSource, /\.code-dock-resize-handle/);
  assert.match(cssSource, /--code-dock-open-width:\s*420px/);
});

test('blockly runtime uses a single output box for run feedback', () => {
  const runtimeSource = fs.readFileSync(path.resolve(__dirname, '../blockly-workspace.runtime.js'), 'utf8');
  const runtimeResultsSource = fs.readFileSync(path.resolve(__dirname, './runtime-results.js'), 'utf8');
  const templateSource = fs.readFileSync(path.resolve(__dirname, '../../../backend/api/resource_runtime.py'), 'utf8');
  const cssSource = fs.readFileSync(path.resolve(__dirname, '../../styles/blockly-workspace.css'), 'utf8');

  assert.match(runtimeResultsSource, /documentRef\.getElementById\('resultTerminal'\)/);
  assert.match(runtimeSource, /function openResultImageDialog\(/);
  assert.match(runtimeSource, /xeduResultImageOverlay/);
  assert.match(runtimeSource, /return lines\.join\('\\n'\)\.trim\(\) \|\| '';/);
  assert.match(runtimeResultsSource, /terminal\.textContent = normalized \|\| '没有原始终端输出';/);
  assert.match(templateSource, /id="resultTerminal"/);
  assert.match(templateSource, /运行反馈/);
  assert.match(templateSource, /一个输出框里显示 print 输出、运行结果与报错信息/);
  assert.match(templateSource, /result-output-shell/);
  assert.match(cssSource, /\.xedu-result-image-overlay/);
  assert.match(cssSource, /\.result-output-shell/);
  assert.match(cssSource, /\.terminal-output/);
});

test('blockly runtime uses the shared low-saturation color contract', () => {
  const runtimeSource = fs.readFileSync(path.resolve(__dirname, '../blockly-workspace.runtime.js'), 'utf8');
  const cssSource = fs.readFileSync(path.resolve(__dirname, '../../styles/blockly-workspace.css'), 'utf8');

  assert.match(runtimeSource, /import blocklyColorContract from '\.\.\/\.\.\/config\/blockly-colors\.json';/);
  assert.equal(BLOCKLY_COLOR_CONTRACT.brand.primary, '#6b70e8');
  assert.equal(BLOCKLY_COLOR_CONTRACT.taskFamilies.classification.colour, '#4f7ca8');
  assert.equal(BLOCKLY_COLOR_CONTRACT.basicBlockStyles.logic_blocks.colourTertiary, '#6974bb');
  assert.equal(BLOCKLY_COLOR_CONTRACT.componentStyles.cursorColour, '#5f6792');
  assert.doesNotMatch(runtimeSource, /#6366f1|#8b5cf6|#3b82f6|#f59e0b|#ec4899|#14b8a6|#0ea5e9|#10b981/);
  assert.match(cssSource, /--brand:\s*#6b70e8/);
  assert.match(cssSource, /--success:\s*#33af97/);
  assert.match(cssSource, /\.btn-primary\s*\{[\s\S]*linear-gradient\(135deg, var\(--brand\) 0%, var\(--brand-deep\) 100%\)/);
});

test('student task-first toolbox hides legacy input and old workflow entry blocks', () => {
  const runtimeSource = fs.readFileSync(path.resolve(__dirname, '../blockly-workspace.runtime.js'), 'utf8');
  const loadIdx = runtimeSource.indexOf("makeBlock('xeduhub_load_image_to_var'");
  const inputIdx = runtimeSource.indexOf("makeBlock('xeduhub_input_image'");
  const setInputIdx = runtimeSource.indexOf("makeBlock('xeduhub_set_input_resource'");
  const oldWorkflowIdx = runtimeSource.indexOf("makeBlock('xeduhub_workflow_create'");

  assert.notEqual(loadIdx, -1);
  assert.equal(inputIdx, -1);
  assert.equal(setInputIdx, -1);
  assert.equal(oldWorkflowIdx, -1);
});

test('student task-first toolbox curates image and video blocks to a compact default set', () => {
  const runtimeSource = fs.readFileSync(path.resolve(__dirname, '../blockly-workspace.runtime.js'), 'utf8');
  assert.match(runtimeSource, /makeBlock\('xeduhub_cv_loop_frames'/);
  assert.match(runtimeSource, /makeBlock\('xeduhub_show_result_image'/);
  assert.doesNotMatch(runtimeSource, /makeBlock\('xeduhub_cv_flip_image'/);
  assert.doesNotMatch(runtimeSource, /makeBlock\('xeduhub_cv_rotate_image'/);
  assert.doesNotMatch(runtimeSource, /makeBlock\('xeduhub_cv_gaussian_blur'/);
  assert.doesNotMatch(runtimeSource, /makeBlock\('xeduhub_cv_canny'/);
  assert.doesNotMatch(runtimeSource, /makeBlock\('xeduhub_cv_threshold'/);
  assert.doesNotMatch(runtimeSource, /makeBlock\('xeduhub_draw_boxes_image'/);
  assert.doesNotMatch(runtimeSource, /makeBlock\('xeduhub_media_frames_to_video'/);
});

test('blockly runtime routes stream-like XEduHub inputs through python execution', () => {
  const runtimeSource = fs.readFileSync(path.resolve(__dirname, '../blockly-workspace.runtime.js'), 'utf8');
  const executionSource = fs.readFileSync(path.resolve(__dirname, './runtime-execution.js'), 'utf8');
  assert.match(executionSource, /export function isStreamLikeInputSpec/);
  assert.match(executionSource, /deps\.hasRuntimeBoundInputSpec\(spec\) \|\| deps\.isStreamLikeInputSpec\(spec\)/);
  assert.match(executionSource, /pythonRunUrl', '\/api\/python\/run'/);
  assert.match(runtimeSource, /executeXEduHubFlow/);
});

test('updateTaskContext tolerates missing dependency injection', () => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
  assert.doesNotThrow(() => {
    updateTaskContext({ resultRunState: { lastTone: 'idle', lastPayload: null } }, {}, dom.window.document);
  });
});

test('collectXEduHubTasksFromBlocks reports experimental tasks from semantic and legacy blocks', () => {
  const fakeBlocks = [
    {
      type: 'xeduhub_run_ocr',
      getFieldValue() {
        return '';
      },
    },
    {
      type: 'xeduhub_run_vision',
      getFieldValue(name) {
        if (name === 'TASK') return 'classification';
        if (name === 'MODEL') return 'resnet18';
        return '';
      },
    },
  ];

  const tasks = collectXEduHubTasksFromBlocks(fakeBlocks, {
    getTaskById,
    getTaskIdFromRunBlockType,
    isSemanticRunBlockType,
    resolveLegacyTaskId,
  });

  assert.deepEqual(
    tasks.map((task) => task.task_id),
    ['ocr', 'cls_imagenet'],
  );
  assert.equal(tasks[0].available, false);
  assert.equal(tasks[1].available, false);
});

test('collectXEduHubPresentationActionsFromBlocks keeps top-level result action order', () => {
  const workspace = new Blockly.Workspace();
  const resultVar = ensureScenarioVariable(workspace, 'lab_result');
  const imageVar = ensureScenarioVariable(workspace, 'display_img');

  const runBlock = workspace.newBlock('xeduhub_run_det_body');
  runBlock.setFieldValue(resultVar.getId(), 'RESULT_VAR');

  const showCard = workspace.newBlock('xeduhub_show_result_card');
  showCard.setFieldValue('识别结果', 'TITLE');
  const resultGet = workspace.newBlock('variables_get');
  resultGet.setFieldValue(resultVar.getId(), 'VAR');
  showCard.getInput('RESULT')?.connection?.connect(resultGet.outputConnection);

  const showImage = workspace.newBlock('xeduhub_show_result_image');
  const imageGet = workspace.newBlock('variables_get');
  imageGet.setFieldValue(imageVar.getId(), 'VAR');
  showImage.getInput('IMAGE')?.connection?.connect(imageGet.outputConnection);

  const record = workspace.newBlock('xeduhub_run_and_record');
  const noteText = workspace.newBlock('text');
  noteText.setFieldValue('本次实验结论', 'TEXT');
  record.getInput('NOTE')?.connection?.connect(noteText.outputConnection);

  const clear = workspace.newBlock('xeduhub_clear_result');

  runBlock.nextConnection.connect(showCard.previousConnection);
  showCard.nextConnection.connect(showImage.previousConnection);
  showImage.nextConnection.connect(record.previousConnection);
  record.nextConnection.connect(clear.previousConnection);

  const actions = collectXEduHubPresentationActionsFromBlocks(workspace);
  assert.deepEqual(actions.map((action) => action.type), ['result_card', 'result_image', 'record_note', 'clear_result']);
  assert.equal(actions[0].title, '识别结果');
  assert.equal(actions[0].result.kind, 'variable');
  assert.equal(actions[0].result.value, 'lab_result');
  assert.equal(actions[1].image.value, 'display_img');
  assert.equal(actions[2].note, '本次实验结论');

  workspace.dispose();
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
  const customToolbox = {
    kind: 'categoryToolbox',
    contents: [
      {
        kind: 'category',
        name: '课堂任务',
        contents: [{ kind: 'block', type: 'text_print' }],
      },
    ],
  };
  const invalidToolbox = {
    kind: 'categoryToolbox',
    contents: [
      {
        kind: 'category',
        name: '文本',
        contents: [
          {
            kind: 'block',
            type: 'text_changeCase',
            inputs: {
              TEXT: {
                kind: 'block',
                type: 'text',
                fields: { TEXT: 'abc' },
              },
            },
          },
        ],
      },
    ],
  };
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

  assert.ok(workspaceFiles.length >= 22);
  for (const workspaceName of workspaceFiles) {
    const expectedPy = getExpectedPythonSnapshotName(workspaceName);
    assert.equal(fs.existsSync(path.join(SAMPLE_DIR, expectedPy)), true, `${expectedPy} should exist`);
    assert.notEqual(normalizeText(readSample(expectedPy)), '', `${expectedPy} should not be empty`);
    assert.ok(workspaceName.includes('xeduhub') || workspaceName === 'vision_demo.blockly.xml', `${workspaceName} should be XEduHub-focused`);
  }
});

test('sample pack includes dedicated XEduHub Blockly workspaces', () => {
  const xeduWorkspaceFiles = getXEduHubSampleWorkspaceFiles();

  assert.ok(xeduWorkspaceFiles.length >= 22, `expected at least 22 XEduHub workspace samples, got ${xeduWorkspaceFiles.length}`);
  assert.ok(xeduWorkspaceFiles.includes('vision_demo.blockly.xml'));
  assert.ok(xeduWorkspaceFiles.includes('legacy_xeduhub.blockly.xml'));
  assert.ok(xeduWorkspaceFiles.includes('xeduhub_workflow_result.blockly.xml'));
});

test('all sample Blockly workspaces roundtrip to the expected Python snapshots', () => {
  const workspace = new Blockly.Workspace();
  const workspaceFiles = getSampleWorkspaceFiles();

  assert.ok(workspaceFiles.length >= 22, 'expected an XEduHub-focused Blockly sample pack');

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
    compilePythonOrSkip(generatedPython, `${workspaceName} generated snapshot`);
    capturePythonStdoutOrSkip(
      `${PYTHON_STUB_MODULES}\n${PYTHON_STUB_ASSIGNMENTS}\n${generatedPython}`,
      `${workspaceName} generated snapshot`,
    );
    capturePythonStdoutOrSkip(
      `${PYTHON_STUB_MODULES}\n${PYTHON_STUB_ASSIGNMENTS}\n${expectedPython}`,
      `${workspaceName} expected snapshot`,
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
      expectedInput: 'assets/xedu-test-scene-1.png',
      expectedMode: 'preset',
      expectedParams: {},
      migrationChanged: 0,
      expectedPythonPatterns: [
        /xedu_flow_bodydetect = wf\(task="bodydetect"\)/,
        /lab_flow = xedu_flow_bodydetect/,
        /lab_result = lab_flow\.inference\(data=lab_input(?:, \*\*lab_params)?\)/,
        /xrt\.xedu_show_result_card\(lab_result, title="人体检测结果"\)/,
      ],
    },
    {
      workspaceName: 'legacy_xeduhub.blockly.xml',
      expectedTaskId: 'det_body',
      expectedInput: 'assets/xedu-test-scene-1.png',
      expectedMode: 'preset',
      expectedParams: {},
      migrationChanged: 2,
      expectedPythonPatterns: [
        /xedu_flow_bodydetect = wf\(task="bodydetect"\)/,
        /lab_flow = xedu_flow_bodydetect/,
        /lab_result = lab_flow\.inference\(data=lab_input(?:, \*\*lab_params)?\)/,
        /xrt\.xedu_show_result_card\(lab_result, title="Legacy 人体检测结果"\)/,
      ],
    },
    {
      workspaceName: 'xeduhub_workflow_result.blockly.xml',
      expectedTaskId: 'det_body',
      expectedInput: 'assets/xedu-test-scene-1.png',
      expectedMode: 'workflow',
      expectedParams: {},
      migrationChanged: 0,
      expectedPythonPatterns: [
        /lab_flow = wf\(task="bodydetect"\)/,
        /lab_params = \{\}/,
        /lab_result = lab_flow\.inference\(data=lab_input, \*\*lab_params\)/,
        /lab_result\.get\("result_summary", ''\)/,
      ],
    },
    {
      workspaceName: 'xeduhub_task_det_body.blockly.xml',
      expectedTaskId: 'det_body',
      expectedInput: 'assets/xedu-test-scene-1.png',
      expectedMode: 'preset',
      expectedParams: {},
      migrationChanged: 0,
      expectedPythonPatterns: [
        /xedu_flow_bodydetect = wf\(task="bodydetect"\)/,
        /lab_flow = xedu_flow_bodydetect/,
        /lab_result = lab_flow\.inference\(data='assets\/xedu-test-scene-1\.png'(?:, \*\*lab_params)?\)/,
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

test('visual sample pack includes both static image and video samples', () => {
  const workspaceFiles = getSampleWorkspaceFiles().filter((name) => name.startsWith('xeduhub_task_'));
  const taskGroups = new Map();
  for (const name of workspaceFiles) {
    const key = name
      .replace(/_video\.blockly\.xml$/, '')
      .replace(/\.blockly\.xml$/, '');
    const group = taskGroups.get(key) || new Set();
    group.add(name.endsWith('_video.blockly.xml') ? 'video' : 'image');
    taskGroups.set(key, group);
  }
  assert.ok(taskGroups.size >= 22, `expected per-task generated samples, got ${taskGroups.size}`);
  for (const [task, kinds] of taskGroups) {
    assert.ok(kinds.has('image'), `${task} should have an image sample`);
    if (task.includes('det_') || task.includes('pose_') || task.includes('ocr') || task.includes('gen_') || task.includes('segment') || task.includes('depth') || task.includes('cls_') || task.includes('drive') || task.includes('embedding')) {
      assert.ok(kinds.has('video'), `${task} should have a video sample`);
    }
  }
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

test('semantic video task blocks generate frame-loop Python for stream inputs', () => {
  const workspace = new Blockly.Workspace();
  const variablesByName = ensureScenarioVariables(workspace);
  const block = newConfiguredScenarioBlock(workspace, 'xeduhub_run_det_body', variablesByName);
  connectValueInput(block, 'INPUT_DATA', newTextBlock(workspace, 'demo.mp4'));
  chainStatementBlocks([block]);

  const script = getPythonCodeForWorkspace(workspace, pythonGenerator);
  assert.match(script, /xedu_video_stream = xrt\.XEduCamera\.video\('demo\.mp4'/);
  assert.match(script, /while xedu_video_stream\.is_opened\(\):/);
  assert.match(script, /xedu_stream_value = xedu_flow_bodydetect\.inference\(data=xedu_stream_frame\)/);
  assert.match(script, /print\("视频流已启动: 人体目标检测 视频流"\)/);
  assert.match(script, /xedu_video_stream\.show\(xedu_stream_preview if xedu_stream_preview is not None else xedu_stream_frame\)/);
  assert.match(script, /print\("视频流已结束"\)/);

  workspace.dispose();
});

test('semantic camera task blocks generate frame-loop Python for camera inputs', () => {
  const workspace = new Blockly.Workspace();
  const variablesByName = ensureScenarioVariables(workspace);
  const block = newConfiguredScenarioBlock(workspace, 'xeduhub_run_det_body', variablesByName);
  connectValueInput(block, 'INPUT_DATA', newTextBlock(workspace, '0'));
  chainStatementBlocks([block]);

  const script = getPythonCodeForWorkspace(workspace, pythonGenerator);
  assert.match(script, /xedu_camera_stream = xrt\.XEduCamera\.camera\(0, window_name="人体目标检测 视频流"\)/);
  assert.match(script, /while xedu_camera_stream\.is_opened\(\):/);
  assert.match(script, /xedu_stream_value = xedu_flow_bodydetect\.inference\(data=xedu_stream_frame\)/);
  assert.match(script, /xedu_camera_stream\.show\(xedu_stream_preview if xedu_stream_preview is not None else xedu_stream_frame\)/);

  workspace.dispose();
});

test('stream task scripts keep runtime import deduplicated', () => {
  const { script } = generateStandaloneScriptForBlock('xeduhub_cv_show_frame');
  const matches = script.match(/from runtime import blockly_runtime as xrt/g) || [];
  assert.equal(matches.length, 1);
});

test('representative helper blocks inject the imports their generated Python needs', () => {
  const importExpectations = new Map([
    ['xeduhub_workflow_create_var', /from XEdu\.hub import Workflow as wf/],
    ['xeduhub_result_first_box', /from runtime import blockly_runtime as xrt/],
    ['xeduhub_cv_show_frame', /import cv2/],
    ['xeduhub_load_image_to_var', /import cv2/],
    ['xeduhub_cv_cvt_color', /import cv2/],
    ['xeduhub_http_get', /import requests/],
    ['xeduhub_servo_setup', /from pinpong\.board import Board, Pin, Servo/],
    ['xeduhub_polyfit_quadratic', /import numpy as np/],
    ['xeduhub_quadratic_fit', /import numpy as np/],
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

test('load image to variable block emits direct variable assignment', () => {
  const { body } = generateStandaloneScriptForBlock('xeduhub_load_image_to_var');
  assert.match(body, /lab_input\s*=\s*cv2\.imread\(['"][^'"]+['"]\)/);
});

test('image path blocks expose the clickable image path field', () => {
  const workspace = new Blockly.Workspace();
  const loadBlock = workspace.newBlock('xeduhub_load_image_to_var');
  const inputBlock = workspace.newBlock('xeduhub_input_image');
  assert.ok(loadBlock.getField('INPUT'));
  assert.ok(inputBlock.getField('INPUT'));
  workspace.dispose();
});

test('default Python placeholder uses the repo sample image path', () => {
  assert.match(DEFAULT_PYTHON_PLACEHOLDER, /courses\/blockly-smoke\/demo\.jpg/);
});

test('XEduHub fallback registry prefers a runnable default detection task', () => {
  assert.equal(getXEduHubTaskRegistry().default_task_id, 'det_body');
});

test('builtin math arithmetic block preserves operator-specific Python output', () => {
  const workspace = new Blockly.Workspace();
  const makeNumber = (value) => {
    const block = workspace.newBlock('math_number');
    block.setFieldValue(String(value), 'NUM');
    return block;
  };
  const cases = [
    ['ADD', /8 \+ 2/],
    ['MINUS', /8 - 2/],
    ['MULTIPLY', /8 \* 2/],
    ['DIVIDE', /8 \/ 2/],
  ];

  for (const [operator, pattern] of cases) {
    const block = workspace.newBlock('math_arithmetic');
    block.setFieldValue(operator, 'OP');
    block.getInput('A')?.connection?.connect(makeNumber(8).outputConnection);
    block.getInput('B')?.connection?.connect(makeNumber(2).outputConnection);
    const [code] = pythonGenerator.blockToCode(block);
    assert.match(String(code), pattern);
  }

  workspace.dispose();
});

test('builtin Blockly classroom blocks prepend badge icons by category', () => {
  const workspace = new Blockly.Workspace();
  const cases = [
    'controls_if',
    'controls_repeat_ext',
    'math_number',
    'text_print',
    'lists_create_with',
    'variables_set',
    'procedures_callnoreturn',
  ];

  for (const blockType of cases) {
    const block = workspace.newBlock(blockType);
    const firstInput = block.inputList[0];
    assert.ok(firstInput, `${blockType} should have an input row`);
    assert.ok(firstInput.fieldRow[0] instanceof Blockly.FieldImage, `${blockType} should prepend a field image badge`);
    assert.equal(block.getField('XEDU_TYPE_ICON') instanceof Blockly.FieldImage, true, `${blockType} should register the badge field by name`);
  }

  workspace.dispose();
});

test('side nav model keeps nested source categories even when live toolbox only exposes leaf items', () => {
  const state = {
    categoryColors: {
      XEdu: '#4f6bff',
      '基础编程': '#4f6bff',
      '初始化任务': '#4f6bff',
      '模型推理': '#4f6bff',
      '结果显示': '#4f6bff',
    },
  };
  const sourceToolbox = {
    kind: 'categoryToolbox',
    contents: [{
      kind: 'category',
      name: 'XEdu',
      colour: '#4f6bff',
      contents: [{
        kind: 'category',
        name: 'AI流程',
        colour: '#4f6bff',
        contents: [
          { kind: 'category', name: '初始化任务', colour: '#4f6bff', contents: [{ kind: 'block', type: 'xeduhub_workflow_create_var' }] },
          { kind: 'category', name: '模型推理', colour: '#4f6bff', contents: [{ kind: 'block', type: 'xeduhub_workflow_infer_var' }] },
          { kind: 'category', name: '结果显示', colour: '#4f6bff', contents: [{ kind: 'block', type: 'xeduhub_show_result_card' }] },
        ],
      }],
    }],
  };
  const liveItems = [
    { toolboxItemDef_: { name: '初始化任务', colour: '#4f6bff' } },
    { toolboxItemDef_: { name: '模型推理', colour: '#4f6bff' } },
    { toolboxItemDef_: { name: '结果显示', colour: '#4f6bff' } },
  ];

  const sections = buildSideNavModel(state, {
    getAllItems: () => liveItems,
    getName: (item) => String(item?.toolboxItemDef_?.name || '').trim(),
    getSourceToolbox: () => sourceToolbox,
    resolveCategoryColour: (_name, colour) => colour || '#4f6bff',
    defaultCategoryColour: '#4f6bff',
    getItemColour: (item, fallbackName) => String(item?.toolboxItemDef_?.colour || state.categoryColors[fallbackName] || '#4f6bff'),
  });

  assert.equal(sections.length, 1);
  assert.equal(sections[0].name, 'XEdu');
  assert.deepEqual(sections[0].children.map((child) => child.name), ['初始化任务', '模型推理', '结果显示']);
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
