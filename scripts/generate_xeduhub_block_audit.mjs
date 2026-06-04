import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { JSDOM } from 'jsdom';
import * as Blockly from 'blockly';
import * as libraryBlocks from 'blockly/blocks';
import { pythonGenerator } from 'blockly/python';

import { RUNNABLE_BLOCK_TYPES } from '../renderer/js/blockly/toolbox-utils.js';
import {
  defineXEduHubBlocks,
  getSemanticRunBlockType,
  getTaskById,
  getTaskIdFromRunBlockType,
  getXEduHubTaskRegistry,
  isSemanticRunBlockType,
} from '../renderer/js/blockly/xeduhub-blocks.js';

void libraryBlocks;

const REPO_ROOT = process.cwd();
const OUTPUT_JSON = path.join(REPO_ROOT, 'docs/overview/xeduhub-block-audit.json');
const OUTPUT_MD = path.join(REPO_ROOT, 'docs/overview/xeduhub-block-audit.md');
const RUNTIME_TEST_PATH = path.join(REPO_ROOT, 'renderer/js/blockly/runtime-helpers.test.js');
const BACKEND_TEST_PATH = path.join(REPO_ROOT, 'backend/tests/test_blockly_resources_api.py');
const SAMPLE_DIR = path.join(REPO_ROOT, 'courses/blockly-smoke');

const LEGACY_COMPAT_BLOCK_TYPES = new Set([
  'xeduhub_set_input',
  'xeduhub_flow_set_input',
  'xeduhub_classify_run',
  'xeduhub_detect_run',
  'xeduhub_ocr_run',
  'xeduhub_run_vision',
  'xeduhub_set_model',
  'xeduhub_create_flow',
  'xeduhub_create_workflow',
  'xeduhub_execute_workflow',
  'xeduhub_flow_execute',
  'xeduhub_raw_create_workflow',
  'xeduhub_raw_inference',
  'xeduhub_show_result',
  'xeduhub_print_status',
]);

const RESULT_DISPLAY_BLOCK_TYPES = new Set([
  'xeduhub_show_result_card',
  'xeduhub_show_result_image',
  'xeduhub_run_and_record',
  'xeduhub_clear_result',
  'xeduhub_debug_print',
]);

const RESULT_COMPUTE_BLOCK_TYPES = new Set([
  'xeduhub_get_result_field',
  'xeduhub_result_first_box',
  'xeduhub_bbox_center_x',
  'xeduhub_keypoint_axis',
  'xeduhub_ocr_first_text',
  'xeduhub_polyfit_quadratic',
  'xeduhub_quadratic_fit',
  'xeduhub_quadratic_eval',
  'xeduhub_math_distance',
]);

const INPUT_BLOCK_TYPES = new Set([
  'xeduhub_set_input_resource',
  'xeduhub_load_image_to_var',
  'xeduhub_input_image',
  'xeduhub_set_input_list',
]);

const EXECUTION_BLOCK_PREFIXES = [
  'xeduhub_workflow_',
  'xeduhub_run_',
];

const CV_MEDIA_BLOCK_PREFIXES = [
  'xeduhub_cv_',
  'xeduhub_media_',
];

const HTTP_DEVICE_BLOCK_PREFIXES = [
  'xeduhub_http_',
  'xeduhub_servo_',
];

const HIDDEN_GLOBAL_NAMES = [
  'lab_input',
  'lab_result',
  'lab_error',
  'lab_flow',
  'display_img',
  'camera',
  'video',
  'frame',
  'response',
  'chunk',
  'servo',
  'coeff',
  'xedu_pair_value',
  'xedu_params',
];

const VISIBILITY_EXEMPT_BLOCK_TYPES = new Set([
  'xeduhub_load_image_to_var',
  'xeduhub_workflow_create_var',
  'xeduhub_workflow_infer_var',
  'xeduhub_workflow_infer_pair',
  'xeduhub_debug_print',
  'xeduhub_catch_error',
  'xeduhub_cv_open_camera',
  'xeduhub_cv_open_video',
  'xeduhub_http_get',
  'xeduhub_http_open_stream',
  'xeduhub_servo_setup',
]);

const MANUAL_AUDIT_OVERRIDES = {
  xeduhub_show_result_card: {
    audit_conclusion: '弱一致',
    issue_level: 'P1',
    ui_behavior: '在 Blockly 结果区渲染结果卡；常见 runnable flow 由前端根据工作区动作和当前 payload 自动渲染',
    findings: [
      '该块已经不再是 print；它会触发前端结果区渲染一张结果卡。',
      '当前结果卡主体仍然来自本次运行 payload，而不是严格消费连接进来的 RESULT 输入值。',
    ],
    remediation: [
      '后续如需完全显式数据流，应让 RESULT 输入真正决定卡片使用的数据源。',
    ],
  },
  xeduhub_show_result_image: {
    audit_conclusion: '弱一致',
    issue_level: 'P1',
    ui_behavior: '在 Blockly 结果区渲染结果图片区；常见 runnable flow 由前端根据工作区动作和当前 payload 自动渲染',
    findings: [
      '该块已经不再是 print；它会触发前端结果区渲染图片证据卡。',
      '当前图片区默认使用本次运行 payload.preview_image，而不是严格消费连接进来的 IMAGE 输入值。',
    ],
    remediation: [
      '后续如需完全显式数据流，应让 IMAGE 输入真正决定图片来源，而不只使用当前运行 payload。',
    ],
  },
  xeduhub_run_and_record: {
    audit_conclusion: '一致',
    issue_level: 'P3',
    ui_behavior: '在 Blockly 结果区追加结论备注卡，作为自动结果展示的补充说明',
    findings: [
      '该块会把备注内容追加到结果证据区，成为本次运行的补充结论。',
    ],
    remediation: [
      '如需跨运行持久化，可在后续接入课堂记录或日志存储链路。',
    ],
  },
  xeduhub_clear_result: {
    audit_conclusion: '一致',
    issue_level: 'P3',
    ui_behavior: '清空当前 Blockly 结果区的证据卡和运行态展示',
    findings: [
      '该块会直接清空右侧结果区展示，并把状态回退到已清空。',
    ],
    remediation: [
      '如需更细粒度清理，可后续区分“清空证据卡”和“重置整次运行状态”。',
    ],
  },
  xeduhub_print_status: {
    audit_conclusion: '废弃兼容',
    issue_level: 'P3',
    ui_behavior: '迁移后等价于 xeduhub_debug_print(VAR=lab_result)',
    findings: [
      '兼容块名称仍然指向“状态”，但迁移后实际打印的是 lab_result。',
    ],
    remediation: [
      '继续仅作为迁移块保留，不应在新用户工具箱中暴露。',
    ],
  },
};

function setupBlocklyRuntime() {
  globalThis.window = globalThis.window || { __XEDU_BLOCKLY_RUNTIME_CONFIG__: {} };
  const { window } = new JSDOM('', { url: 'http://localhost/' });
  globalThis.DOMParser = globalThis.DOMParser || window.DOMParser;
  globalThis.XMLSerializer = globalThis.XMLSerializer || window.XMLSerializer;
  defineXEduHubBlocks(Blockly, pythonGenerator);
}

function normalizeText(value) {
  return String(value || '').replace(/\r\n/g, '\n').trim();
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function ensureScenarioVariable(workspace, name) {
  const variableMap = workspace.getVariableMap();
  return variableMap.getAllVariables().find((variable) => variable.name === name) || variableMap.createVariable(name);
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

function configureBlockForAudit(block, workspace) {
  const defaultTaskId = getXEduHubTaskRegistry().default_task_id || 'det_body';
  if (block.getField('INPUT')) setFieldValueSmart(block, 'INPUT', 'demo.jpg');
  if (block.getField('INPUTS')) setFieldValueSmart(block, 'INPUTS', '["demo1.jpg","demo2.jpg"]');
  if (block.getField('TASK_ID')) setFieldValueSmart(block, 'TASK_ID', defaultTaskId);
  if (block.getField('TASK')) setFieldValueSmart(block, 'TASK', 'classification');
  if (block.getField('MODEL')) setFieldValueSmart(block, 'MODEL', 'cls_imagenet');
  if (block.getField('PARAMS')) setFieldValueSmart(block, 'PARAMS', '{"thr": 0.5}');
  if (block.getField('RESULT')) setFieldValueSmart(block, 'RESULT', 'lab_result');
  if (block.getField('TITLE')) setFieldValueSmart(block, 'TITLE', '运行结果');
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
  if (block.getField('FIELD')) setFieldValueSmart(block, 'FIELD', 'result_summary');
  if (block.getField('COLOR_CODE')) setFieldValueSmart(block, 'COLOR_CODE', 'COLOR_BGR2GRAY');
  if (block.getField('FLIP_CODE')) setFieldValueSmart(block, 'FLIP_CODE', '1');
  if (block.getField('ROTATE_CODE')) setFieldValueSmart(block, 'ROTATE_CODE', 'ROTATE_90_CLOCKWISE');
  if (block.getField('KSIZE')) setFieldValueSmart(block, 'KSIZE', '5');
  if (block.getField('TEXT')) setFieldValueSmart(block, 'TEXT', 'XEdu');
  if (block.getField('TEXT_X')) setFieldValueSmart(block, 'TEXT_X', '20');
  if (block.getField('TEXT_Y')) setFieldValueSmart(block, 'TEXT_Y', '40');
  if (block.getField('TEXT_SCALE')) setFieldValueSmart(block, 'TEXT_SCALE', '1');
  if (block.getField('TEXT_THICKNESS')) setFieldValueSmart(block, 'TEXT_THICKNESS', '2');
  if (block.getField('IMAGE_VAR')) setFieldValueSmart(block, 'IMAGE_VAR', 'display_img', 'display_img');
  if (block.getField('MODEL_VAR')) setFieldValueSmart(block, 'MODEL_VAR', 'lab_flow', 'lab_flow');
  if (block.getField('RESULT_VAR')) setFieldValueSmart(block, 'RESULT_VAR', 'lab_result', 'lab_result');
  if (block.getField('CAMERA_VAR')) setFieldValueSmart(block, 'CAMERA_VAR', 'camera', 'camera');
  if (block.getField('FRAME_VAR')) setFieldValueSmart(block, 'FRAME_VAR', 'frame', 'frame');
  if (block.getField('RESPONSE_VAR')) setFieldValueSmart(block, 'RESPONSE_VAR', 'response', 'response');
  if (block.getField('STREAM_VAR')) setFieldValueSmart(block, 'STREAM_VAR', 'response', 'response');
  if (block.getField('CHUNK_VAR')) setFieldValueSmart(block, 'CHUNK_VAR', 'chunk', 'chunk');
  if (block.getField('SERVO_VAR')) setFieldValueSmart(block, 'SERVO_VAR', 'servo', 'servo');
  if (block.getField('COEFF_VAR')) setFieldValueSmart(block, 'COEFF_VAR', 'coeff', 'coeff');

  // Ensure commonly referenced variables exist even for standalone blocks.
  [
    'lab_flow',
    'lab_result',
    'display_img',
    'camera',
    'frame',
    'response',
    'chunk',
    'servo',
    'coeff',
  ].forEach((name) => ensureScenarioVariable(workspace, name));
}

function generateStandaloneAuditCode(blockType) {
  const workspace = new Blockly.Workspace();
  const block = workspace.newBlock(blockType);
  configureBlockForAudit(block, workspace);
  pythonGenerator.init(workspace);
  const raw = pythonGenerator.blockToCode(block);
  const body = Array.isArray(raw) ? `__result = ${raw[0]}\n` : String(raw || '');
  const script = pythonGenerator.finish(body);
  const title = normalizeText(block.toString()).replace(/^icon\s+/i, '') || blockType;
  const tooltip = normalizeText(typeof block.getTooltip === 'function' ? block.getTooltip() : block.tooltip || '');
  const fieldSummary = collectFieldSummary(block);
  workspace.dispose();
  return {
    title,
    tooltip,
    fieldSummary,
    raw,
    body: normalizeText(body),
    script: normalizeText(script),
  };
}

function collectFieldSummary(block) {
  const fields = [];
  for (const input of block.inputList || []) {
    for (const field of input.fieldRow || []) {
      const fieldName = String(field?.name || '').trim();
      const constructorName = String(field?.constructor?.name || '');
      if (constructorName === 'FieldImage') {
        continue;
      }
      const text = normalizeText(typeof field?.getText === 'function' ? field.getText() : '');
      if (fieldName) {
        fields.push({
          name: fieldName,
          text: text || normalizeText(block.getFieldValue(fieldName)),
          editable: typeof field?.showEditor_ === 'function',
        });
      } else if (text) {
        fields.push({
          name: '',
          text,
          editable: false,
        });
      }
    }
  }
  return fields;
}

function classifyBlock(blockType, isLegacyCompat) {
  if (isLegacyCompat || HTTP_DEVICE_BLOCK_PREFIXES.some((prefix) => blockType.startsWith(prefix)) || blockType === 'xeduhub_chunk_over_size') {
    return '通信/设备/兼容类';
  }
  if (INPUT_BLOCK_TYPES.has(blockType)) {
    return '输入类';
  }
  if (RESULT_DISPLAY_BLOCK_TYPES.has(blockType)) {
    return '结果展示类';
  }
  if (RESULT_COMPUTE_BLOCK_TYPES.has(blockType)) {
    return '结果读取/计算类';
  }
  if (CV_MEDIA_BLOCK_PREFIXES.some((prefix) => blockType.startsWith(prefix)) || blockType === 'xeduhub_draw_boxes_image' || blockType === 'xeduhub_decode_chunk_image') {
    return '图像与视频处理类';
  }
  if (EXECUTION_BLOCK_PREFIXES.some((prefix) => blockType.startsWith(prefix)) || blockType === 'xeduhub_set_model') {
    return '执行类';
  }
  return '结果读取/计算类';
}

function detectHiddenGlobals(source) {
  return HIDDEN_GLOBAL_NAMES.filter((name) => new RegExp(`\\b${escapeRegExp(name)}\\b`).test(source));
}

function summarizeCode(source) {
  const compact = normalizeText(source).replace(/\s+/g, ' ');
  if (!compact) {
    return '不生成代码';
  }
  return compact.length > 140 ? `${compact.slice(0, 137)}...` : compact;
}

function countMatches(text, needle) {
  const matches = String(text || '').match(new RegExp(escapeRegExp(needle), 'g'));
  return matches ? matches.length : 0;
}

function getCoverageSummary(blockType, runtimeTestSource, backendTestSource, sampleSource) {
  const runtimeHits = countMatches(runtimeTestSource, blockType);
  const backendHits = countMatches(backendTestSource, blockType);
  const sampleHits = countMatches(sampleSource, blockType);
  const items = ['runtime-helpers.test.js: 全量 compile/stub/workspace scenario sweep'];
  if (runtimeHits > 0) {
    items.push(`runtime-helpers.test.js: 定向命中 ${runtimeHits} 次`);
  }
  if (backendHits > 0) {
    items.push(`test_blockly_resources_api.py: 定向命中 ${backendHits} 次`);
  }
  if (sampleHits > 0) {
    items.push(`courses/blockly-smoke: 示例工作区/快照命中 ${sampleHits} 次`);
  }
  return {
    status: runtimeHits > 0 || backendHits > 0 || sampleHits > 0 ? '已覆盖（含定向断言）' : '已覆盖（主要依赖全量 sweep）',
    items,
  };
}

function resolveRuntimeEntrypoint(blockType, isStatement, isLegacyCompat) {
  if (!isStatement) {
    return '依附父块';
  }
  if (RESULT_DISPLAY_BLOCK_TYPES.has(blockType)) {
    return '前端结果区动作渲染 + Python 导出 helper 调用';
  }
  if (isSemanticRunBlockType(blockType)) {
    return '/api/resources/blockly/xeduhub/execute';
  }
  if (blockType === 'xeduhub_workflow_create' || blockType === 'xeduhub_workflow_set_task' || blockType === 'xeduhub_workflow_set_params' || blockType === 'xeduhub_workflow_infer' || blockType === 'xeduhub_workflow_create_var' || blockType === 'xeduhub_workflow_infer_var' || blockType === 'xeduhub_workflow_infer_pair') {
    return '/api/resources/blockly/xeduhub/execute';
  }
  if (isLegacyCompat) {
    return '迁移后落入 /api/resources/blockly/xeduhub/execute 或 /api/python/run';
  }
  return '/api/python/run';
}

function resolveTestStrategy(blockType, category, isRunnable, isLegacyCompat) {
  if (isLegacyCompat) {
    return '迁移验证 + 代码生成快照';
  }
  if (!isRunnable) {
    if (INPUT_BLOCK_TYPES.has(blockType)) {
      return '代码生成快照 + 运行时 spec 抽取与绑定验证';
    }
    if (RESULT_COMPUTE_BLOCK_TYPES.has(blockType)) {
      return '代码生成快照 + stubbed Python 执行';
    }
    if (blockType === 'xeduhub_draw_boxes_image' || blockType === 'xeduhub_decode_chunk_image') {
      return '代码生成快照 + 模拟依赖测试';
    }
    return '代码生成快照';
  }
  if (isSemanticRunBlockType(blockType) || blockType === 'xeduhub_workflow_infer' || blockType === 'xeduhub_workflow_infer_var' || blockType === 'xeduhub_workflow_infer_pair') {
    return '运行时 spec 抽取与绑定验证 + 后端接口执行测试';
  }
  if (blockType === 'xeduhub_workflow_create' || blockType === 'xeduhub_workflow_set_task' || blockType === 'xeduhub_workflow_set_params' || blockType === 'xeduhub_workflow_create_var') {
    return '代码生成快照 + 运行时 spec 抽取与绑定验证';
  }
  if (blockType === 'xeduhub_load_image_to_var') {
    return '浏览器/页面行为测试 + 本地 Python 执行测试';
  }
  if (RESULT_DISPLAY_BLOCK_TYPES.has(blockType)) {
    return '代码生成快照 + 浏览器/页面行为测试';
  }
  if (category === '图像与视频处理类' || category === '通信/设备/兼容类') {
    return '模拟依赖测试 + 本地 Python 执行测试';
  }
  return '本地 Python 执行测试';
}

function resolveTestAssertions(blockType, category, isRunnable, isLegacyCompat) {
  if (MANUAL_AUDIT_OVERRIDES[blockType]?.audit_conclusion === '不一致') {
    return [
      '断言积木文案/tooltip 与生成代码存在明确偏差。',
      '断言该块不会直接控制右侧结果面板或持久化链路。',
    ];
  }
  if (isLegacyCompat) {
    return [
      '断言旧块可迁移到新块形态。',
      '断言迁移后生成代码与新块语义一致。',
    ];
  }
  if (!isRunnable) {
    return [
      '断言生成代码非空且可编译。',
      '断言父流程接入时不会破坏 spec/变量绑定。',
    ];
  }
  if (isSemanticRunBlockType(blockType)) {
    return [
      '断言任务 ID 解析、输入绑定和 execute 路由选择正确。',
      '断言成功/失败 payload 能驱动结果面板更新。',
    ];
  }
  if (blockType === 'xeduhub_load_image_to_var') {
    return [
      '断言点击路径字段会触发图片选择器桥接。',
      '断言生成代码会把图片读入目标变量。',
    ];
  }
  if (RESULT_DISPLAY_BLOCK_TYPES.has(blockType)) {
    return [
      '断言运行后结果区行为与积木承诺一致或明确记录偏差。',
      '断言隐藏状态变更不会脱离结果面板反馈。',
    ];
  }
  if (category === '图像与视频处理类' || category === '通信/设备/兼容类') {
    return [
      '断言在 stub/mock 依赖下生成代码可执行。',
      '断言关键参数会进入目标 API/设备调用。',
    ];
  }
  return [
    '断言生成代码可编译并可执行。',
    '断言默认字段值会进入预期变量或调用。',
  ];
}

function resolveUiBehavior(blockType, category, generatedCode) {
  const override = MANUAL_AUDIT_OVERRIDES[blockType];
  if (override?.ui_behavior) {
    return override.ui_behavior;
  }
  if (blockType === 'xeduhub_load_image_to_var' || blockType === 'xeduhub_input_image') {
    return '通过可点击字段触发图片选择器；桌面端应桥接 Electron 文件对话框';
  }
  if (category === '结果展示类' && /^\s*print\(/.test(generatedCode)) {
    return '终端输出为主，不直接控制结果卡组件';
  }
  if (category === '执行类') {
    return '主要驱动运行时执行链路，由统一结果面板渲染结果';
  }
  if (category === '图像与视频处理类' || category === '通信/设备/兼容类') {
    return '执行副作用落在本地 Python 运行时，不直接控制页面组件';
  }
  return '按父流程参与数据或变量计算';
}

function resolveConclusion(blockType, hiddenGlobals, isLegacyCompat) {
  if (MANUAL_AUDIT_OVERRIDES[blockType]?.audit_conclusion) {
    return MANUAL_AUDIT_OVERRIDES[blockType].audit_conclusion;
  }
  if (isLegacyCompat) {
    return '废弃兼容';
  }
  if (hiddenGlobals.length > 0 && !VISIBILITY_EXEMPT_BLOCK_TYPES.has(blockType)) {
    return '弱一致';
  }
  return '一致';
}

function resolveIssueLevel(blockType, conclusion) {
  if (MANUAL_AUDIT_OVERRIDES[blockType]?.issue_level) {
    return MANUAL_AUDIT_OVERRIDES[blockType].issue_level;
  }
  if (conclusion === '不一致') {
    return 'P1';
  }
  if (conclusion === '弱一致') {
    return 'P2';
  }
  if (conclusion === '废弃兼容') {
    return 'P3';
  }
  return 'P3';
}

function buildGenericFindings(blockType, conclusion, hiddenGlobals, fieldSummary) {
  const override = MANUAL_AUDIT_OVERRIDES[blockType];
  if (override?.findings) {
    return override.findings;
  }
  if (conclusion === '废弃兼容') {
    return ['该块仅用于兼容旧工作区迁移，不应作为新用户教学入口。'];
  }
  if (conclusion === '弱一致' && hiddenGlobals.length > 0) {
    return [`该块依赖隐式运行时状态：${hiddenGlobals.join('、')}，用户界面没有完整解释这些状态契约。`];
  }
  if (fieldSummary.some((field) => field.name) && !hiddenGlobals.length) {
    return ['可见字段和生成代码基本一致，主要风险在父流程装配而不在块本身。'];
  }
  return ['当前实现与主要可见字段基本一致。'];
}

function buildGenericRemediation(blockType, conclusion) {
  const override = MANUAL_AUDIT_OVERRIDES[blockType];
  if (override?.remediation) {
    return override.remediation;
  }
  if (conclusion === '废弃兼容') {
    return ['继续保留迁移支持，但应避免在默认教学工具箱暴露。'];
  }
  if (conclusion === '弱一致') {
    return ['补充 tooltip/字段说明，明确隐式状态和父流程依赖。'];
  }
  return ['保持现有行为，同时依赖自动审计防止后续语义漂移。'];
}

function escapeMarkdown(value) {
  return String(value || '')
    .replace(/\|/g, '\\|')
    .replace(/\n/g, '<br>');
}

function writeIfChanged(targetPath, nextContent) {
  const current = fs.existsSync(targetPath) ? fs.readFileSync(targetPath, 'utf8') : '';
  if (current !== nextContent) {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, nextContent, 'utf8');
    return true;
  }
  return false;
}

function buildAuditInventory() {
  setupBlocklyRuntime();
  const runtimeTestSource = fs.readFileSync(RUNTIME_TEST_PATH, 'utf8');
  const backendTestSource = fs.readFileSync(BACKEND_TEST_PATH, 'utf8');
  const sampleSource = fs.readdirSync(SAMPLE_DIR)
    .map((name) => path.join(SAMPLE_DIR, name))
    .filter((targetPath) => fs.statSync(targetPath).isFile())
    .map((targetPath) => fs.readFileSync(targetPath, 'utf8'))
    .join('\n');
  const blockTypes = Object.keys(Blockly.Blocks)
    .filter((name) => name.startsWith('xeduhub_'))
    .sort();

  const blocks = blockTypes.map((blockType) => {
    const generated = generateStandaloneAuditCode(blockType);
    const isLegacyCompat = LEGACY_COMPAT_BLOCK_TYPES.has(blockType);
    const isRunnable = !Array.isArray(generated.raw);
    const category = classifyBlock(blockType, isLegacyCompat);
    const hiddenGlobals = detectHiddenGlobals(generated.body || generated.script);
    const runtimeEntrypoint = resolveRuntimeEntrypoint(blockType, isRunnable, isLegacyCompat);
    const testStrategy = resolveTestStrategy(blockType, category, isRunnable, isLegacyCompat);
    const testAssertions = resolveTestAssertions(blockType, category, isRunnable, isLegacyCompat);
    const coverage = getCoverageSummary(blockType, runtimeTestSource, backendTestSource, sampleSource);
    const auditConclusion = resolveConclusion(blockType, hiddenGlobals, isLegacyCompat);
    const issueLevel = resolveIssueLevel(blockType, auditConclusion);
    const fields = generated.fieldSummary.filter((field) => field.name).map((field) => `${field.name}=${field.text || '<empty>'}`);
    const taskId = isSemanticRunBlockType(blockType) ? getTaskIdFromRunBlockType(blockType) : '';
    const taskLabel = taskId ? getTaskById(taskId)?.label || taskId : '';

    return {
      id: blockType,
      group: category,
      title: generated.title,
      user_visible_fields: fields,
      tooltip: generated.tooltip,
      generated_python: generated.body || '不生成代码',
      generated_python_summary: summarizeCode(generated.body),
      hidden_globals: hiddenGlobals,
      ui_behavior: resolveUiBehavior(blockType, category, generated.body),
      is_legacy_compat: isLegacyCompat,
      is_runnable: isRunnable,
      runtime_entrypoint: runtimeEntrypoint,
      current_test_coverage: coverage,
      test_strategy: testStrategy,
      test_assertions: testAssertions,
      audit_conclusion: auditConclusion,
      issue_level: issueLevel,
      findings: buildGenericFindings(blockType, auditConclusion, hiddenGlobals, generated.fieldSummary),
      remediation: buildGenericRemediation(blockType, auditConclusion),
      semantic_task_id: taskId || '',
      semantic_task_label: taskLabel || '',
      backed_by_registry_runnable: RUNNABLE_BLOCK_TYPES.has(blockType),
    };
  });

  const conclusionCounts = blocks.reduce((acc, block) => {
    acc[block.audit_conclusion] = (acc[block.audit_conclusion] || 0) + 1;
    return acc;
  }, {});
  const groupCounts = blocks.reduce((acc, block) => {
    acc[block.group] = (acc[block.group] || 0) + 1;
    return acc;
  }, {});
  const priorityFindings = blocks
    .filter((block) => block.audit_conclusion === '不一致' || block.audit_conclusion === '弱一致')
    .sort((a, b) => a.issue_level.localeCompare(b.issue_level) || a.id.localeCompare(b.id))
    .map((block) => ({
      id: block.id,
      issue_level: block.issue_level,
      conclusion: block.audit_conclusion,
      summary: block.findings[0] || '',
    }));

  return {
    meta: {
      source_file: 'renderer/js/blockly/xeduhub-blocks.js',
      generated_by: 'scripts/generate_xeduhub_block_audit.mjs',
      block_count: blocks.length,
      runnable_block_count: blocks.filter((block) => block.is_runnable).length,
      legacy_compat_count: blocks.filter((block) => block.is_legacy_compat).length,
      semantic_task_count: blocks.filter((block) => block.semantic_task_id).length,
      registry_default_task_id: getXEduHubTaskRegistry().default_task_id || '',
    },
    summary: {
      conclusions: conclusionCounts,
      groups: groupCounts,
      priority_findings: priorityFindings,
    },
    blocks,
  };
}

function renderMarkdownReport(inventory) {
  const blocksByGroup = new Map();
  for (const block of inventory.blocks) {
    if (!blocksByGroup.has(block.group)) {
      blocksByGroup.set(block.group, []);
    }
    blocksByGroup.get(block.group).push(block);
  }

  const lines = [
    '# XEduHub Blockly 积木审计结果',
    '',
    `- 来源文件：\`renderer/js/blockly/xeduhub-blocks.js\``,
    `- 自定义积木总数：\`${inventory.meta.block_count}\``,
    `- 可运行积木数：\`${inventory.meta.runnable_block_count}\``,
    `- 兼容旧块数：\`${inventory.meta.legacy_compat_count}\``,
    `- 机器可读明细：\`docs/overview/xeduhub-block-audit.json\``,
    '',
    '## 结论摘要',
    '',
    `- 一致：${inventory.summary.conclusions['一致'] || 0}`,
    `- 弱一致：${inventory.summary.conclusions['弱一致'] || 0}`,
    `- 不一致：${inventory.summary.conclusions['不一致'] || 0}`,
    `- 废弃兼容：${inventory.summary.conclusions['废弃兼容'] || 0}`,
    '',
    '## 最高优先级问题',
    '',
  ];

  for (const finding of inventory.summary.priority_findings.filter((item) => item.issue_level === 'P0' || item.issue_level === 'P1')) {
    lines.push(`- \`${finding.id}\` [${finding.issue_level}] ${finding.summary}`);
  }

  lines.push('', '## 可运行块测试矩阵摘要', '');

  const runnableBlocks = inventory.blocks.filter((block) => block.is_runnable);
  for (const block of runnableBlocks) {
    lines.push(`- \`${block.id}\`：${block.test_strategy}`);
  }

  for (const [group, blocks] of blocksByGroup.entries()) {
    lines.push('', `## ${group}`, '', '| 积木 ID | 用户看到的输入/字段 | 生成代码摘要 | 隐式状态 | 运行入口 | 测试策略 | 结论 |', '| --- | --- | --- | --- | --- | --- | --- |');
    for (const block of blocks) {
      lines.push(`| \`${escapeMarkdown(block.id)}\` | ${escapeMarkdown(block.user_visible_fields.join('、') || block.title)} | \`${escapeMarkdown(block.generated_python_summary)}\` | ${escapeMarkdown(block.hidden_globals.join('、') || '无')} | ${escapeMarkdown(block.runtime_entrypoint)} | ${escapeMarkdown(block.test_strategy)} | ${escapeMarkdown(`${block.audit_conclusion} / ${block.issue_level}`)} |`);
    }
  }

  lines.push('', '## 重点块详细说明', '');

  for (const block of inventory.blocks.filter((item) => RESULT_DISPLAY_BLOCK_TYPES.has(item.id) || item.id === 'xeduhub_print_status')) {
    lines.push(`### \`${block.id}\``, '');
    lines.push(`- 用户可见：${block.title}`);
    lines.push(`- Tooltip：${block.tooltip || '无'}`);
    lines.push(`- 生成代码：\`${escapeMarkdown(block.generated_python || '不生成代码')}\``);
    lines.push(`- 运行入口：${block.runtime_entrypoint}`);
    lines.push(`- 结论：${block.audit_conclusion} / ${block.issue_level}`);
    lines.push(`- 发现：${block.findings.join('；')}`);
    lines.push(`- 修复建议：${block.remediation.join('；')}`);
    lines.push('');
  }

  return `${lines.join('\n').trim()}\n`;
}

function main() {
  const checkOnly = process.argv.includes('--check');
  const inventory = buildAuditInventory();
  const jsonContent = `${JSON.stringify(inventory, null, 2)}\n`;
  const markdownContent = renderMarkdownReport(inventory);

  if (checkOnly) {
    const mismatches = [];
    const currentJson = fs.existsSync(OUTPUT_JSON) ? fs.readFileSync(OUTPUT_JSON, 'utf8') : '';
    const currentMd = fs.existsSync(OUTPUT_MD) ? fs.readFileSync(OUTPUT_MD, 'utf8') : '';
    if (currentJson !== jsonContent) mismatches.push(path.relative(REPO_ROOT, OUTPUT_JSON));
    if (currentMd !== markdownContent) mismatches.push(path.relative(REPO_ROOT, OUTPUT_MD));
    if (mismatches.length > 0) {
      console.error(`XEduHub block audit outputs are stale: ${mismatches.join(', ')}`);
      process.exit(1);
    }
    console.log('XEduHub block audit outputs are up to date.');
    return;
  }

  writeIfChanged(OUTPUT_JSON, jsonContent);
  writeIfChanged(OUTPUT_MD, markdownContent);
  console.log(`Wrote ${path.relative(REPO_ROOT, OUTPUT_JSON)} and ${path.relative(REPO_ROOT, OUTPUT_MD)}.`);
}

main();
