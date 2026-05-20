import * as Blockly from 'blockly';
import * as libraryBlocks from 'blockly/blocks';
import { pythonGenerator } from 'blockly/python';
import * as ZhHans from 'blockly/msg/zh-hans';
import JSZip from 'jszip';
import blocklyColorContract from '../../config/blockly-colors.json';
import cssText from '../styles/blockly-workspace.css?raw';
import {
  RUNNABLE_BLOCK_TYPES,
  clone,
  fetchText,
  mergeToolboxes,
  normalizeCategoryMeta,
  validateToolboxPayload,
} from './blockly/toolbox-utils.js';
import {
  applyWorkspaceSnapshot,
  collectXEduHubSpecFromBlocks,
  collectXEduHubTasksFromBlocks,
  collectXEduHubPresentationActionsFromBlocks,
  DEFAULT_PYTHON_PLACEHOLDER,
  getBlockVariableName as getRuntimeBlockVariableName,
  getPythonCodeForWorkspace,
  getWorkspaceExportPayload as buildWorkspaceExportPayload,
  hasRunnableFlowInBlocks,
  lookupWorkspaceVariableName,
  parseAndMigrateWorkspaceText,
  validateWorkspaceBindingsForBlocks,
} from './blockly/runtime-helpers.js';
import {
  defineXEduHubBlocks,
  getParamFieldName,
  getTaskById,
  getTaskIdFromRunBlockType,
  getXEduHubTaskRegistry,
  isSemanticRunBlockType,
  migrateXEduHubSerialized,
  migrateXEduHubXmlText,
  resolveLegacyTaskId,
} from './blockly/xeduhub-blocks.js';
import { renderPythonHighlighted } from './blockly/python-highlighter.js';

void libraryBlocks;

Blockly.setLocale(ZhHans);

const runtimeConfig = window.__XEDU_BLOCKLY_RUNTIME_CONFIG__ || {};
const CLASSROOM_DEFAULTS = Object.freeze({
  workspaceFallbackTitle: 'Blockly 课堂练习',
  toolbarMoreClosedLabel: '操作',
  toolbarMoreOpenLabel: '收起操作',
  workspaceMetaLabel: '任务驱动课堂工作台',
  codePanelVisible: true,
  resultIdleText: '尚未运行',
  resultRunningText: '正在执行当前流程，请稍候…',
  resultBlockedText: '当前流程暂未执行',
});

const CODE_DOCK_WIDTH_STORAGE_KEY = 'xedu-blockly-code-dock-width';
const CODE_DOCK_WIDTH_MIN = 320;
const CODE_DOCK_WIDTH_MAX = 760;
const CODE_DOCK_WIDTH_FALLBACK = 420;
const DEFAULT_CATEGORY_COLOUR = blocklyColorContract.brand?.primary || '#5f6792';

function resolveBlocklyMediaPath() {
  const configured = String(getConfigValue('blocklyMediaUrl', '')).trim();
  if (configured) {
    return configured.endsWith('/') ? configured : `${configured}/`;
  }
  return `${window.location.origin}/blockly/media/`;
}

const STUDENT_QUICK_ACTION_IDS = Object.freeze([
  'openWorkspaceBtn',
  'saveWorkspaceBtn',
]);

const BLOCKLY_DEBUG_ENABLED = (() => {
  try {
    const params = new URLSearchParams(window.location.search || '');
    const flag = params.get('debug_blockly');
    if (flag != null) {
      return !['0', 'false', 'off'].includes(String(flag).toLowerCase());
    }
  } catch (_) {
    // ignore
  }
  if (typeof runtimeConfig.debugBlockly === 'boolean') {
    return runtimeConfig.debugBlockly;
  }
  return false;
})();

function blocklyDebugLog(message, details) {
  if (!BLOCKLY_DEBUG_ENABLED) {
    return;
  }
  if (typeof details === 'undefined') {
    console.info(`[BlocklyDebug] ${message}`);
    return;
  }
  console.info(`[BlocklyDebug] ${message}`, details);
}

function blocklyDebugWarn(message, details) {
  if (!BLOCKLY_DEBUG_ENABLED) {
    return;
  }
  if (typeof details === 'undefined') {
    console.warn(`[BlocklyDebug] ${message}`);
    return;
  }
  console.warn(`[BlocklyDebug] ${message}`, details);
}

const state = {
  workspace: null,
  initialSerialized: null,
  toolboxVariants: {
    official: null,
    course: null,
    hasCourseCustom: false,
    customPackCount: 0,
  },
  toolboxPacks: [],
  categoryVisibility: {},
  categoryColors: {},
  categoryNotes: {},
  toolbarOverflowState: { menuOpen: false },
  controlPanelState: { open: false },
  codePanelVisible: CLASSROOM_DEFAULTS.codePanelVisible,
  resultRunState: { hasRun: false, lastPayload: null, lastTone: 'idle' },
  migrationReport: null,
  lastFlyoutButtonInvoke: { key: '', at: 0 },
  createVariableFallback: null,
  variableNameDialog: { resolve: null, visible: false },
  resultImageDialog: { visible: false, lastSrc: '' },
  codePanelResizeTimer: null,
  codeDockWidth: CODE_DOCK_WIDTH_FALLBACK,
  codeDockResizing: null,
  toolboxSelectionSyncing: false,
  sideNavCollapsed: {},
};

function makeCategoryIconSvg(innerMarkup, { strokeWidth = 1.8, scale = 1.14 } = {}) {
  const inner = String(innerMarkup || '')
    .replace(/^<svg[^>]*>/, '')
    .replace(/<\/svg>\s*$/, '');
  const offset = ((18 - (18 * scale)) / 2).toFixed(2);
  return `<svg viewBox="0 0 18 18" fill="none" aria-hidden="true" stroke="currentColor" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"><g transform="translate(${offset} ${offset}) scale(${scale})">${inner}</g></svg>`;
}

const ICON_CLUSTER = Object.freeze({
  blocks: makeCategoryIconSvg('<rect x="2.5" y="2.8" width="4.2" height="4.2" rx="1.1"/><rect x="11.3" y="2.8" width="4.2" height="4.2" rx="1.1"/><rect x="6.9" y="10.8" width="4.2" height="4.2" rx="1.1"/><path d="M7 5h4M9 3v4M8 9.2l1 1 1.8-1.8"/>', { strokeWidth: 1.55, scale: 1.18 }),
  spark: makeCategoryIconSvg('<path d="M9 2.7 10.6 6l3.7.4-2.7 2.4.7 3.6L9 10.7 5.7 12.4l.7-3.6-2.7-2.4 3.7-.4L9 2.7Z"/>', { strokeWidth: 1.55, scale: 1.24 }),
  layers: makeCategoryIconSvg('<path d="M9 2.8 14.4 5.9 9 9 3.6 5.9 9 2.8Z"/><path d="M4.4 9.1 9 11.8l4.6-2.7"/><path d="M4.4 11.8 9 14.5l4.6-2.7"/>', { scale: 1.18 }),
  media: makeCategoryIconSvg('<rect x="3.1" y="4.4" width="8.4" height="6.8" rx="1.8"/><path d="M11.7 6.2 14.7 4.8v6.1l-3-1.4"/><circle cx="7.2" cy="7.7" r="1.1"/><path d="M4.8 12.9h7.7"/>', { scale: 1.18 }),
  detect: makeCategoryIconSvg('<rect x="4.3" y="4.3" width="9.4" height="9.4" rx="2.1"/><path d="M9 2.9v2M9 13.1v2M2.9 9h2M13.1 9h2"/><rect x="6.6" y="6.6" width="4.8" height="4.8" rx="1.2"/>', { scale: 1.18 }),
  nodes: makeCategoryIconSvg('<circle cx="9" cy="4.6" r="1.1"/><circle cx="5.5" cy="8.5" r="1"/><circle cx="12.5" cy="8.5" r="1"/><circle cx="7.1" cy="12.6" r=".95"/><circle cx="10.9" cy="12.6" r=".95"/><path d="M9 5.9v2.1M8.3 8.1 6.4 8.8M9.7 8.1l1.9.7M8.7 9.6l-1.1 1.6M9.3 9.6l1.1 1.6"/>', { strokeWidth: 1.5, scale: 1.18 }),
  text: makeCategoryIconSvg('<path d="M4.7 5.3h8.6M9 5.3v7.2M6.9 12.5h4.2"/>', { scale: 1.18 }),
  list: makeCategoryIconSvg('<circle cx="5" cy="5.5" r=".9"/><circle cx="5" cy="9" r=".9"/><circle cx="5" cy="12.5" r=".9"/><path d="M7.6 5.5h5.5M7.6 9h6M7.6 12.5h4.5"/>', { scale: 1.18 }),
  variable: makeCategoryIconSvg('<path d="M4.2 5.3h9.6v7.4H4.2z"/><path d="M9 5.3v7.4M6.2 9h5.6"/>', { scale: 1.18 }),
  function: makeCategoryIconSvg('<path d="M6.5 3.9c-1.5 1.2-1.5 8.9 0 10.2M11.5 3.9c1.5 1.2 1.5 8.9 0 10.2"/><path d="M8 10.7c.5-1.7 1.5-3 3.1-4M8.2 8.8h3.1"/>', { scale: 1.16 }),
  math: makeCategoryIconSvg('<path d="M5.4 6.2h4M7.4 4.2v4M5.7 11.9h3.4M11.4 5.4l2.2 2.2M13.6 5.4l-2.2 2.2"/>', { scale: 1.18 }),
  flow: makeCategoryIconSvg('<rect x="3.5" y="4" width="4.2" height="3" rx="1"/><rect x="10.3" y="7.5" width="4.2" height="3" rx="1"/><rect x="6.9" y="11" width="4.2" height="3" rx="1"/><path d="M7.7 5.5h2c.8 0 1.4.6 1.4 1.4v.3M8.8 12.5h-.7c-.8 0-1.4-.6-1.4-1.4v-.2M11 10.6v.5c0 .8-.6 1.4-1.4 1.4H9"/>', { strokeWidth: 1.55, scale: 1.2 }),
  result: makeCategoryIconSvg('<path d="M4.4 9.6 7.6 12.1 13.6 5.9"/><path d="M4.4 4.8h4.1M4.4 7.1h2.8"/><path d="M10.6 12.4h3"/>', { strokeWidth: 1.7, scale: 1.26 }),
  debug: makeCategoryIconSvg('<path d="M9 2.8 14 5.5v5L9 13.2 4 10.5v-5L9 2.8Z"/><path d="m6.9 8.8 1.5 1.5 2.8-3.2"/><path d="M9 13.2v2"/>', { strokeWidth: 1.55, scale: 1.18 }),
  comms: makeCategoryIconSvg('<path d="M5.3 4.2h5.8a1.8 1.8 0 0 1 1.8 1.8v5.8H7.1l-2.9 2.1v-2.1H5.3A1.8 1.8 0 0 1 3.5 10V6a1.8 1.8 0 0 1 1.8-1.8Z"/><path d="M6.1 7.5h4.2M6.1 9.6h2.8"/>', { scale: 1.18 }),
  depth: makeCategoryIconSvg('<path d="M4.7 5.5 9 3.3l4.3 2.2v5.3L9 13l-4.3-2.2V5.5Z"/><path d="M9 3.4v9.3M4.8 5.6 9 7.8l4.2-2.2"/>', { scale: 1.18 }),
});

const CATEGORY_ICON_SVGS = Object.freeze({
  基础编程: ICON_CLUSTER.blocks,
  逻辑: ICON_CLUSTER.blocks,
  循环: ICON_CLUSTER.flow,
  数学: ICON_CLUSTER.math,
  文本: ICON_CLUSTER.text,
  列表: ICON_CLUSTER.list,
  变量: ICON_CLUSTER.variable,
  函数: ICON_CLUSTER.function,
  XEdu: ICON_CLUSTER.spark,
  'XEdu Hub': ICON_CLUSTER.spark,
  核心语法: ICON_CLUSTER.flow,
  AI流程: ICON_CLUSTER.flow,
  结果处理: ICON_CLUSTER.result,
  '媒体与设备': ICON_CLUSTER.media,
  图像视频: ICON_CLUSTER.media,
  图像与视频: ICON_CLUSTER.media,
  图像分类: ICON_CLUSTER.result,
  目标检测: ICON_CLUSTER.detect,
  关键点识别: ICON_CLUSTER.nodes,
  OCR: ICON_CLUSTER.text,
  内容生成: ICON_CLUSTER.spark,
  图像分割: ICON_CLUSTER.layers,
  深度估计: ICON_CLUSTER.depth,
  通信控制: ICON_CLUSTER.comms,
  '调试与扩展': ICON_CLUSTER.debug,
  调试扩展: ICON_CLUSTER.debug,
  进阶调试: ICON_CLUSTER.debug,
  扩展工具: ICON_CLUSTER.comms,
});

const DEFAULT_CATEGORY_ICON_SVG = ICON_CLUSTER.blocks;

const CATEGORY_COLOR_PALETTE = Object.freeze(blocklyColorContract.categoryPalette);

function resolveCategoryColour(name, fallback = DEFAULT_CATEGORY_COLOUR) {
  const normalized = String(name || '').trim();
  return CATEGORY_COLOR_PALETTE[normalized] || fallback;
}

const TASK_FIRST_CATEGORY_META = Object.freeze(blocklyColorContract.taskFirstCategories);

const BASIC_PROGRAM_CATEGORY_NAMES = new Set(['逻辑', '循环', '数学', '文本', '列表', '变量', '函数']);
const ADVANCED_CATEGORY_NAMES = new Set(['图像与视频', '图像视频', '通信控制', '进阶调试', '底层与调试', '扩展包']);
const DEFAULT_INPUT_RESOURCE = 'courses/blockly-smoke/demo.jpg';
const DEFAULT_INPUT_SEQUENCE = '["courses/blockly-smoke/demo.jpg","courses/blockly-smoke/demo.jpg"]';

function ensureRuntimeStyles() {
  if (document.getElementById('xedu-blockly-runtime-style')) {
    return;
  }
  const style = document.createElement('style');
  style.id = 'xedu-blockly-runtime-style';
  style.textContent = cssText;
  document.head.appendChild(style);
  document.body.classList.add('xedu-blockly-runtime');
}

function getConfigValue(key, fallback = '') {
  const value = runtimeConfig[key];
  return value == null ? fallback : value;
}

function getUserRole() {
  return String(getConfigValue('userRole', '')).trim().toLowerCase() === 'teacher'
    ? 'teacher'
    : 'student';
}

function isTeacherMode() {
  return getUserRole() === 'teacher';
}

function canImportToolboxPacks() {
  return isTeacherMode() && Boolean(getConfigValue('toolboxImportEnabled', getConfigValue('toolboxSwitchEnabled', true)));
}

function ensureVariableNameDialog() {
  let overlay = document.getElementById('xeduVariableNameOverlay');
  if (overlay) {
    return overlay;
  }
  overlay = document.createElement('div');
  overlay.id = 'xeduVariableNameOverlay';
  overlay.className = 'xedu-variable-dialog-overlay';
  overlay.innerHTML = `
    <div class="xedu-variable-dialog" role="dialog" aria-modal="true" aria-labelledby="xeduVariableNameTitle">
      <div id="xeduVariableNameTitle" class="xedu-variable-dialog-title">创建变量</div>
      <div id="xeduVariableNameSubtitle" class="xedu-variable-dialog-subtitle">请输入变量名</div>
      <input id="xeduVariableNameInput" class="xedu-variable-dialog-input" type="text" maxlength="80" />
      <div class="xedu-variable-dialog-actions">
        <button id="xeduVariableNameCancel" type="button" class="btn-ghost">取消</button>
        <button id="xeduVariableNameConfirm" type="button" class="btn-primary">确定</button>
      </div>
    </div>
  `;
  const input = overlay.querySelector('#xeduVariableNameInput');
  const confirm = overlay.querySelector('#xeduVariableNameConfirm');
  const cancel = overlay.querySelector('#xeduVariableNameCancel');
  const closeDialog = (confirmed) => {
    if (!state.variableNameDialog.resolve) {
      overlay.classList.remove('open');
      state.variableNameDialog.visible = false;
      return;
    }
    const value = confirmed ? String(input?.value || '').trim() : null;
    const resolve = state.variableNameDialog.resolve;
    state.variableNameDialog.resolve = null;
    state.variableNameDialog.visible = false;
    overlay.classList.remove('open');
    resolve(value);
  };
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) {
      closeDialog(false);
    }
  });
  confirm?.addEventListener('click', () => closeDialog(true));
  cancel?.addEventListener('click', () => closeDialog(false));
  input?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      closeDialog(true);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      closeDialog(false);
    }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && state.variableNameDialog.visible) {
      closeDialog(false);
    }
  });
  document.body.appendChild(overlay);
  return overlay;
}

function requestVariableName({ title = '创建变量', subtitle = '请输入变量名', defaultValue = '' } = {}) {
  const overlay = ensureVariableNameDialog();
  const titleEl = overlay.querySelector('#xeduVariableNameTitle');
  const subtitleEl = overlay.querySelector('#xeduVariableNameSubtitle');
  const input = overlay.querySelector('#xeduVariableNameInput');
  return new Promise((resolve) => {
    state.variableNameDialog.resolve = resolve;
    state.variableNameDialog.visible = true;
    if (titleEl) {
      titleEl.textContent = title;
    }
    if (subtitleEl) {
      subtitleEl.textContent = subtitle;
    }
    if (input) {
      input.value = String(defaultValue || '');
    }
    overlay.classList.add('open');
    window.requestAnimationFrame(() => {
      input?.focus();
      input?.select();
    });
  });
}

function ensureResultImageDialog() {
  let overlay = document.getElementById('xeduResultImageOverlay');
  if (overlay) {
    return overlay;
  }
  overlay = document.createElement('div');
  overlay.id = 'xeduResultImageOverlay';
  overlay.className = 'xedu-result-image-overlay';
  overlay.innerHTML = `
    <div class="xedu-result-image-dialog" role="dialog" aria-modal="true" aria-labelledby="xeduResultImageTitle">
      <div class="xedu-result-image-head">
        <div>
          <div id="xeduResultImageTitle" class="xedu-result-image-title">结果图片</div>
          <div id="xeduResultImageMeta" class="xedu-result-image-meta">运行返回的图片结果</div>
        </div>
        <button id="xeduResultImageClose" type="button" class="btn-ghost">关闭</button>
      </div>
      <div class="xedu-result-image-body">
        <img id="xeduResultImagePreview" class="xedu-result-image-preview" alt="结果图片">
      </div>
    </div>
  `;
  const closeDialog = () => {
    overlay.classList.remove('open');
    state.resultImageDialog.visible = false;
  };
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) {
      closeDialog();
    }
  });
  overlay.querySelector('#xeduResultImageClose')?.addEventListener('click', closeDialog);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && state.resultImageDialog.visible) {
      closeDialog();
    }
  });
  document.body.appendChild(overlay);
  return overlay;
}

function openResultImageDialog(src, title = '结果图片') {
  const normalizedSrc = String(src || '').trim();
  if (!normalizedSrc) {
    return false;
  }
  const overlay = ensureResultImageDialog();
  const image = overlay.querySelector('#xeduResultImagePreview');
  const titleEl = overlay.querySelector('#xeduResultImageTitle');
  const metaEl = overlay.querySelector('#xeduResultImageMeta');
  if (image) {
    image.src = normalizedSrc;
    image.alt = String(title || '结果图片');
  }
  if (titleEl) {
    titleEl.textContent = String(title || '结果图片');
  }
  if (metaEl) {
    metaEl.textContent = '图片已在弹窗中打开，不占用运行反馈终端。';
  }
  state.resultImageDialog.visible = true;
  state.resultImageDialog.lastSrc = normalizedSrc;
  overlay.classList.add('open');
  return true;
}

function closeResultImageDialog() {
  const overlay = document.getElementById('xeduResultImageOverlay');
  if (overlay) {
    overlay.classList.remove('open');
  }
  state.resultImageDialog.visible = false;
}

async function validateToolboxWithApi(toolbox) {
  const check = validateToolboxPayload(toolbox);
  if (!check.valid) {
    return check;
  }
  const endpoint = String(getConfigValue('toolboxValidateUrl', '/api/resources/blockly/validate-toolbox'));
  if (!endpoint) {
    return check;
  }
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ toolbox }),
    });
    const payload = await parseJsonResponse(response, '校验积木配置失败');
    if (payload && typeof payload.valid === 'boolean') {
      return payload;
    }
  } catch (_) {
    return check;
  }
  return check;
}

const scratchLikeTheme = Blockly.Theme.defineTheme('xedu_refined_classroom', {
  base: Blockly.Themes.Classic,
  blockStyles: blocklyColorContract.basicBlockStyles,
  componentStyles: blocklyColorContract.componentStyles,
  fontStyle: {
    family: "'Avenir Next', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif",
    weight: '700',
    size: 11.6,
  },
  startHats: true,
});

function getDefaultTaskId() {
  return String(getConfigValue('xeduhubTaskRegistry', {})?.default_task_id || 'det_body').trim() || 'det_body';
}

function makeBlock(type, { fields, inputs, ...rest } = {}) {
  const block = { kind: 'block', type, ...rest };
  if (fields && Object.keys(fields).length > 0) {
    block.fields = fields;
  }
  if (inputs && Object.keys(inputs).length > 0) {
    block.inputs = inputs;
  }
  return block;
}

function makeVariableInput(name) {
  return { kind: 'block', type: 'variables_get', fields: { VAR: String(name || '').trim() || 'value' } };
}

function makeTextInput(text) {
  return { kind: 'block', type: 'text', fields: { TEXT: String(text || '').trim() || '' } };
}

function filterTaskCategoryForStudent(category) {
  if (!category || category.kind !== 'category') {
    return null;
  }
  const nextCategory = clone(category);
  nextCategory.contents = (nextCategory.contents || []).filter((item) => {
    if (!item || item.kind !== 'block') {
      return Boolean(item);
    }
    const taskId = getTaskIdFromRunBlockType(String(item.type || '').trim());
    if (!taskId) {
      return true;
    }
    const task = getTaskById(taskId);
    return Boolean(task && task.available !== false && task.quick_block_enabled !== false);
  });
  return nextCategory.contents.length > 0 ? nextCategory : null;
}

function getRawSourceToolbox() {
  return state.toolboxVariants?.course
    || state.toolboxVariants?.official
    || normalizeCategoryMeta(getConfigValue('defaultXEduHubToolbox', {}));
}

function buildDefaultWorkspaceSerialized() {
  const defaultTaskId = getDefaultTaskId();
  const xmlText = [
    '<xml xmlns="https://developers.google.com/blockly/xml">',
    '<variables><variable id="lab_input_var">lab_input</variable><variable id="lab_result_var">lab_result</variable></variables>',
    `<block type="xeduhub_workflow_create_var" id="flow1" x="42" y="42"><field name="TASK_ID">${defaultTaskId}</field><field name="MODEL_VAR">lab_flow</field>`,
    '<next>',
    '<block type="xeduhub_load_image_to_var" id="input1"><field name="INPUT">',
    DEFAULT_INPUT_RESOURCE,
    '</field><field name="IMAGE_VAR" id="lab_input_var">lab_input</field>',
    '<next>',
    '<block type="xeduhub_workflow_infer_var" id="infer1"><field name="MODEL_VAR">lab_flow</field><field name="RESULT_VAR">lab_result</field><value name="INPUT_DATA"><block type="variables_get" id="input_get1"><field name="VAR" id="lab_input_var">lab_input</field></block></value>',
    '<next>',
    '<block type="xeduhub_show_result_card" id="result1"><field name="TITLE">识别结果</field><value name="RESULT"><block type="variables_get" id="result_get1"><field name="VAR" id="lab_result_var">lab_result</field></block></value></block>',
    '</next>',
    '</block>',
    '</next>',
    '</block>',
    '</next>',
    '</block>',
    '</xml>',
  ].join('');
  return { kind: 'xml', value: xmlText };
}

function walkToolboxItems(items, visitor) {
  (Array.isArray(items) ? items : []).forEach((item) => {
    if (!item || typeof item !== 'object') {
      return;
    }
    visitor(item);
    if (item.kind === 'category' && Array.isArray(item.contents)) {
      walkToolboxItems(item.contents, visitor);
    }
  });
}

function hasTaskDrivenToolboxSignal(toolbox) {
  let matched = false;
  walkToolboxItems(toolbox?.contents || [], (item) => {
    if (matched) {
      return;
    }
    const categoryName = String(item.name || '').trim();
    if (item.kind === 'category' && (categoryName === 'XEduHub' || categoryName === 'XEdu')) {
      matched = true;
      return;
    }
    if (item.kind === 'block' && String(item.type || '').trim().startsWith('xeduhub_')) {
      matched = true;
    }
  });
  return matched;
}

function buildToolboxItemKey(item) {
  if (!item || typeof item !== 'object') {
    return '';
  }
  if (item.kind === 'category') {
    return `category:${String(item.name || '').trim()}:${String(item.custom || '').trim()}`;
  }
  if (item.kind === 'block' || item.kind === 'shadow') {
    return `${item.kind}:${String(item.type || '').trim()}:${JSON.stringify(item.fields || {})}:${JSON.stringify(item.inputs || {})}`;
  }
  if (item.kind === 'label') {
    return `label:${String(item.text || '').trim()}`;
  }
  return '';
}

function dedupeToolboxContents(contents) {
  const result = [];
  const seen = new Set();
  (Array.isArray(contents) ? contents : []).forEach((item) => {
    if (!item || typeof item !== 'object') {
      return;
    }
    if (item.kind === 'sep') {
      if (!result.length || result[result.length - 1]?.kind === 'sep') {
        return;
      }
      result.push({ kind: 'sep' });
      return;
    }
    const key = buildToolboxItemKey(item);
    if (key && seen.has(key)) {
      return;
    }
    if (key) {
      seen.add(key);
    }
    result.push(clone(item));
  });
  if (result[result.length - 1]?.kind === 'sep') {
    result.pop();
  }
  return result;
}

function buildTaskFirstToolbox(rawToolbox) {
  if (!hasTaskDrivenToolboxSignal(rawToolbox)) {
    return normalizeCategoryMeta(rawToolbox);
  }

  const topLevelCategories = (rawToolbox?.contents || []).filter((item) => item && item.kind === 'category');
  const categoryMap = new Map(topLevelCategories.map((item) => [String(item.name || '').trim(), clone(item)]));
  const xeduCategory = categoryMap.get('XEdu') || categoryMap.get('XEduHub');
  const mediaCategory = categoryMap.get('媒体与设备');
  const debugCategory = categoryMap.get('调试与扩展');
  const showDebugToolbox = Boolean(getConfigValue('showDebugToolbox', false));

  if (xeduCategory && mediaCategory) {
    const topLevelContents = [
      clone(categoryMap.get('基础编程')),
      clone(xeduCategory),
      clone(mediaCategory),
    ];
    if (showDebugToolbox && debugCategory) {
      topLevelContents.push(clone(debugCategory));
    }
    return normalizeCategoryMeta({
      ...rawToolbox,
      contents: topLevelContents.filter(Boolean),
    });
  }

  const xeduContents = Array.isArray(xeduCategory?.contents) ? xeduCategory.contents : [];
  const xeduCategoryMap = new Map(
    xeduContents
      .filter((item) => item && item.kind === 'category')
      .map((item) => [String(item.name || '').trim(), clone(item)]),
  );
  const quickTaskNames = ['图像分类', '目标检测', '关键点识别', 'OCR', '内容生成', '图像分割', '深度估计'];
  const basicNames = ['逻辑', '循环', '数学', '文本', '变量', '列表', '函数'];
  const mediaNames = ['图像与视频', '图像视频', '通信控制'];

  const contents = [];

  const basicContents = basicNames.map((name) => categoryMap.get(name)).filter(Boolean).map((item) => clone(item));
  if (basicContents.length > 0) {
    contents.push({
      kind: 'category',
        name: '基础编程',
        colour: TASK_FIRST_CATEGORY_META.基础编程.colour,
        description: TASK_FIRST_CATEGORY_META.基础编程.description,
        visible_by_default: true,
        expanded: true,
        contents: basicContents,
    });
  }

  const xeduPlatformContents = [
    {
      kind: 'category',
      name: 'AI流程',
      colour: resolveCategoryColour('AI流程'),
      description: '只保留初始化任务、模型推理、结果显示三个核心步骤。',
      contents: dedupeToolboxContents([
        {
          kind: 'category',
          name: '初始化任务',
          colour: resolveCategoryColour('AI流程'),
          contents: [
            makeBlock('xeduhub_workflow_create_var', {
              fields: {
                TASK_ID: getDefaultTaskId(),
                MODEL_VAR: 'lab_flow',
              },
            }),
          ],
        },
        {
          kind: 'category',
          name: '模型推理',
          colour: resolveCategoryColour('AI流程'),
          contents: [
            makeBlock('xeduhub_workflow_infer_var', {
              fields: {
                MODEL_VAR: 'lab_flow',
                RESULT_VAR: 'lab_result',
              },
            }),
            makeBlock('xeduhub_workflow_infer_pair', {
              fields: {
                MODEL_VAR: 'lab_flow',
                RESULT_VAR: 'lab_result',
                IMAGE_VAR: 'display_img',
              },
            }),
          ],
        },
        {
          kind: 'category',
          name: '结果显示',
          colour: resolveCategoryColour('结果显示'),
          contents: [
            makeBlock('xeduhub_show_result_card', {
              fields: { TITLE: '运行结果' },
              inputs: { RESULT: makeVariableInput('lab_result') },
            }),
          ],
        },
      ]),
    },
  ];

  if (xeduPlatformContents.length > 0) {
    contents.push({
      kind: 'category',
      name: 'XEdu',
      colour: TASK_FIRST_CATEGORY_META.XEdu.colour,
      description: TASK_FIRST_CATEGORY_META.XEdu.description,
      visible_by_default: true,
      expanded: true,
      contents: xeduPlatformContents,
    });
  }

  const mediaContents = mediaNames
    .map((name) => categoryMap.get(name))
    .filter(Boolean)
    .map((item) => {
      const cloned = clone(item);
      if (cloned?.name === '图像视频') {
        cloned.name = '图像与视频';
      }
      return cloned;
    });
  const imageVideoCategory = mediaContents.find((item) => item?.kind === 'category' && (item?.name === '图像与视频' || item?.name === '图像视频'));
  if (imageVideoCategory && Array.isArray(imageVideoCategory.contents)) {
    const studentCuratedImageVideo = [
      makeBlock('xeduhub_load_image_to_var', { fields: { INPUT: DEFAULT_INPUT_RESOURCE, IMAGE_VAR: 'lab_input' } }),
      makeBlock('xeduhub_cv_open_camera', { fields: { SOURCE: 0, CAMERA_VAR: 'camera', WINDOW: 'video' } }),
      makeBlock('xeduhub_cv_loop_frames', { fields: { CAMERA_VAR: 'camera', FRAME_VAR: 'frame', QUIT_KEY: 'q', DELAY: 1 } }),
      makeBlock('xeduhub_cv_show_frame', { fields: { WINDOW: 'video' } }),
      makeBlock('xeduhub_cv_open_video', { fields: { CAMERA_VAR: 'video', WINDOW: 'video' } }),
      makeBlock('xeduhub_show_result_image', { inputs: { IMAGE: makeVariableInput('display_img') } }),
      makeBlock('xeduhub_cv_save_image'),
      makeBlock('xeduhub_cv_resize_image'),
      makeBlock('xeduhub_cv_crop_image'),
      makeBlock('xeduhub_cv_cvt_color'),
      makeBlock('xeduhub_cv_put_text'),
    ];
    imageVideoCategory.contents = dedupeToolboxContents(
      isTeacherMode()
        ? [
          ...studentCuratedImageVideo,
          ...imageVideoCategory.contents,
        ]
        : studentCuratedImageVideo,
    );
  }
  if (mediaContents.length > 0) {
    contents.push({
      kind: 'category',
      name: '媒体与设备',
      colour: TASK_FIRST_CATEGORY_META['媒体与设备'].colour,
      description: TASK_FIRST_CATEGORY_META['媒体与设备'].description,
      visible_by_default: true,
      expanded: true,
      contents: mediaContents,
    });
  }

  const debugContents = dedupeToolboxContents([
    makeBlock('xeduhub_debug_print', { inputs: { VALUE: makeVariableInput('lab_result') } }),
    makeBlock('xeduhub_catch_error', { fields: { ERROR_VAR: 'lab_error' } }),
    makeBlock('xeduhub_run_and_record', { inputs: { NOTE: makeTextInput('本次实验结论') } }),
    makeBlock('xeduhub_get_result_field', {
      fields: { FIELD: 'result_summary' },
      inputs: { RESULT: makeVariableInput('lab_result') },
    }),
  ]);
  const experimentalCategory = xeduCategoryMap.get('实验性任务');
  if (showDebugToolbox && debugContents.length > 0) {
    const debugGroups = [{
      kind: 'category',
      name: '调试扩展',
      colour: resolveCategoryColour('调试扩展'),
      visible_by_default: false,
      description: '记录结果、打印调试信息并对流程做异常保护。',
      contents: debugContents,
    }];
    if (isTeacherMode() && experimentalCategory) {
      debugGroups.push(clone(experimentalCategory));
    }
    contents.push({
      kind: 'category',
      name: '调试与扩展',
      colour: TASK_FIRST_CATEGORY_META['调试与扩展'].colour,
      description: TASK_FIRST_CATEGORY_META['调试与扩展'].description,
      visible_by_default: false,
      expanded: false,
      contents: debugGroups,
    });
  }

  return normalizeCategoryMeta({ ...rawToolbox, contents });
}

function getSourceToolbox() {
  return buildTaskFirstToolbox(getRawSourceToolbox());
}

function collectLeafToolboxCategories(items, result = []) {
  (Array.isArray(items) ? items : []).forEach((item) => {
    if (!item || item.kind !== 'category') {
      return;
    }
    if (!isTeacherMode() && item.teacher_only) {
      return;
    }
    const children = Array.isArray(item.contents)
      ? item.contents.filter((child) => child && child.kind === 'category')
      : [];
    if (children.length > 0) {
      collectLeafToolboxCategories(children, result);
      return;
    }
    result.push(clone(item));
  });
  return result;
}

function buildBlocklyToolbox(toolbox) {
  return normalizeCategoryMeta({
    ...toolbox,
    contents: collectLeafToolboxCategories(toolbox?.contents || []),
  });
}

function getActiveToolbox() {
  const activeToolbox = buildBlocklyToolbox(getSourceToolbox());
  const copy = clone(activeToolbox);
  copy.contents = (copy.contents || []).filter((item) => {
    if (!item) {
      return false;
    }
    if (item.kind !== 'category') {
      return item.kind === 'label';
    }
    const name = String(item.name || '').trim();
    if (!name || !(name in state.categoryVisibility)) {
      return true;
    }
    return Boolean(state.categoryVisibility[name]);
  });
  return copy;
}

function logDynamicCategorySnapshot(toolbox, stage = '') {
  if (!BLOCKLY_DEBUG_ENABLED) {
    return;
  }
  const categories = (toolbox?.contents || [])
    .filter((item) => item && item.kind === 'category')
    .map((item) => ({
      name: String(item.name || '').trim(),
      custom: String(item.custom || '').trim(),
      hasContents: Array.isArray(item.contents),
      visibleByDefault: item.visible_by_default,
    }))
    .filter((item) => item.name === '变量'
      || item.name === '函数'
      || ['VARIABLE', 'VARIABLE_DYNAMIC', 'PROCEDURE'].includes(item.custom.toUpperCase()));
  blocklyDebugLog(`动态分类快照${stage ? `(${stage})` : ''}`, categories);
}

function collectCategoryNames(toolbox) {
  return (toolbox?.contents || [])
    .filter((item) => item && item.kind === 'category' && item.name)
    .map((item) => String(item.name).trim())
    .filter(Boolean);
}

function getCategoryIconSvg(name) {
  return CATEGORY_ICON_SVGS[name] || DEFAULT_CATEGORY_ICON_SVG;
}

function syncCategoryVisuals(container, name, color, selected = false) {
  if (!container || !name || !color) {
    return;
  }
  container.style.setProperty('--xedu-category-color', color);
  container.dataset.categoryName = name;
  container.classList.add('xedu-toolbox-category-row');
  container.classList.toggle('xedu-toolbox-category-selected', selected);

  const labelEl = container.querySelector('.blocklyToolboxCategoryLabel, .blocklyTreeLabel, .group-item-main');
  if (labelEl) {
    labelEl.classList.add('xedu-toolbox-category-label');
    const iconMarkup = getCategoryIconSvg(name);
    container.classList.toggle('xedu-toolbox-category-textual', !iconMarkup);
    const iconEl = container.querySelector('.xedu-toolbox-category-icon');
    if (iconMarkup) {
      const nextIconEl = iconEl || document.createElement('span');
      nextIconEl.className = 'xedu-toolbox-category-icon is-graphic';
      nextIconEl.innerHTML = iconMarkup;
      if (!iconEl) {
        labelEl.parentNode?.insertBefore(nextIconEl, labelEl);
      }
    } else {
      iconEl?.remove();
    }
  }
}

function resetCategoryVisibility(toolbox) {
  const nextVisibility = {};
  state.categoryColors = {};
  state.categoryNotes = {};
  walkToolboxItems(toolbox?.contents || [], (item) => {
    if (item?.kind !== 'category' || !item.name) {
      return;
    }
    const name = String(item.name).trim();
    nextVisibility[name] = name in state.categoryVisibility
      ? state.categoryVisibility[name]
      : (typeof item.visible_by_default === 'boolean' ? item.visible_by_default : true);
    state.categoryColors[name] = resolveCategoryColour(name, item.colour || state.categoryColors[name] || DEFAULT_CATEGORY_COLOUR);
    if (item.description) {
      state.categoryNotes[name] = item.description;
    }
  });
  state.categoryVisibility = nextVisibility;
}

function renderGroupDrawer() {
  const body = document.getElementById('groupDrawerBody');
  if (!body) {
    return;
  }
  const sourceToolbox = getSourceToolbox();
  const names = collectCategoryNames(sourceToolbox);
  body.innerHTML = names.map((name, index) => {
    const checked = state.categoryVisibility[name] !== false ? 'checked' : '';
    const note = state.categoryNotes[name] || '当前工作区工具分组';
    const color = resolveCategoryColour(name, state.categoryColors[name] || '#3F76CF');
    const inputId = `group-item-${index}`;
    return `
      <label class="group-item" for="${inputId}" style="--xedu-category-color:${color}">
        <input id="${inputId}" type="checkbox" data-group-name="${name}" ${checked} />
        <div>
          <div class="group-item-main-row">
            <span class="xedu-toolbox-category-icon">${getCategoryIconSvg(name)}</span>
            <div class="group-item-main">${name}</div>
          </div>
          <div class="group-item-sub">${note}</div>
        </div>
      </label>
    `;
  }).join('');
  body.querySelectorAll('input[data-group-name]').forEach((input) => {
    input.addEventListener('change', () => {
      const name = String(input.getAttribute('data-group-name') || '').trim();
      if (!name) {
        return;
      }
      state.categoryVisibility[name] = Boolean(input.checked);
      if (state.workspace) {
        state.workspace.updateToolbox(getActiveToolbox());
        queueToolboxRowStyling();
      }
    });
  });
}

function setControlPanelOpen(open) {
  state.controlPanelState.open = Boolean(open);
  document.getElementById('controlPanel')?.classList.toggle('open', state.controlPanelState.open);
  document.getElementById('controlPanelToggleBtn')?.setAttribute('aria-expanded', state.controlPanelState.open ? 'true' : 'false');
}

function setMoreMenuOpen(open) {
  state.toolbarOverflowState.menuOpen = Boolean(open);
  const menu = document.getElementById('toolbarMoreMenu');
  const button = document.getElementById('toolbarMoreBtn');
  if (menu) {
    menu.classList.toggle('open', state.toolbarOverflowState.menuOpen);
  }
  if (button) {
    button.setAttribute('aria-expanded', state.toolbarOverflowState.menuOpen ? 'true' : 'false');
    button.textContent = state.toolbarOverflowState.menuOpen
      ? CLASSROOM_DEFAULTS.toolbarMoreOpenLabel
      : CLASSROOM_DEFAULTS.toolbarMoreClosedLabel;
  }
}

function moveStudentActionsToTopbar() {
  let quickActions = document.getElementById('toolbarQuickActions');
  const moreGroup = document.querySelector('.toolbar-more');
  if (!quickActions && moreGroup?.parentElement) {
    quickActions = document.createElement('div');
    quickActions.id = 'toolbarQuickActions';
    quickActions.className = 'toolbar-quick-actions';
    quickActions.setAttribute('aria-label', '常用操作');
    moreGroup.parentElement.insertBefore(quickActions, moreGroup);
  }
  if (!quickActions) {
    return;
  }
  if (isTeacherMode()) {
    quickActions.style.display = 'none';
    return;
  }
  quickActions.style.display = '';
  STUDENT_QUICK_ACTION_IDS.forEach((id) => {
    const action = document.getElementById(id);
    if (!action) {
      return;
    }
    action.classList.add('toolbar-quick-action');
    quickActions.appendChild(action);
  });
}

function configureRoleScopedToolbar() {
  const studentMode = !isTeacherMode();
  const controlPanel = document.getElementById('controlPanel');
  const controlToggle = document.getElementById('controlPanelToggleBtn');
  if (studentMode) {
    setControlPanelOpen(false);
  }
  if (controlPanel) {
    controlPanel.style.display = studentMode ? 'none' : '';
  }
  if (controlToggle) {
    controlToggle.style.display = studentMode ? 'none' : '';
  }
  moveStudentActionsToTopbar();
}

function setCodePanelVisible(visible) {
  state.codePanelVisible = Boolean(visible);
  document.getElementById('blocklyLayout')?.classList.toggle('code-collapsed', !state.codePanelVisible);
  const codeDock = document.getElementById('codeDock');
  codeDock?.classList.toggle('collapsed', !state.codePanelVisible);
  const button = document.getElementById('codeDockToggleBtn');
  if (button) {
    button.setAttribute('aria-expanded', state.codePanelVisible ? 'true' : 'false');
    button.setAttribute('aria-label', state.codePanelVisible ? '收起右侧工作栏' : '展开右侧工作栏');
    button.classList.toggle('is-collapsed', !state.codePanelVisible);
  }
  queueBlocklyResize();
}

function clampCodeDockWidth(width) {
  const numeric = Number(width);
  if (!Number.isFinite(numeric)) {
    return CODE_DOCK_WIDTH_FALLBACK;
  }
  return Math.min(CODE_DOCK_WIDTH_MAX, Math.max(CODE_DOCK_WIDTH_MIN, Math.round(numeric)));
}

function readPersistedCodeDockWidth() {
  try {
    const raw = window.localStorage?.getItem(CODE_DOCK_WIDTH_STORAGE_KEY);
    return raw ? clampCodeDockWidth(raw) : CODE_DOCK_WIDTH_FALLBACK;
  } catch (_) {
    return CODE_DOCK_WIDTH_FALLBACK;
  }
}

function persistCodeDockWidth(width) {
  try {
    window.localStorage?.setItem(CODE_DOCK_WIDTH_STORAGE_KEY, String(clampCodeDockWidth(width)));
  } catch (_) {
    // ignore storage failures
  }
}

function applyCodeDockWidth(width, { persist = false } = {}) {
  const nextWidth = clampCodeDockWidth(width);
  state.codeDockWidth = nextWidth;
  document.documentElement.style.setProperty('--code-dock-open-width', `${nextWidth}px`);
  const handle = document.getElementById('codeDockResizeHandle');
  if (handle) {
    handle.setAttribute('aria-valuemin', String(CODE_DOCK_WIDTH_MIN));
    handle.setAttribute('aria-valuemax', String(CODE_DOCK_WIDTH_MAX));
    handle.setAttribute('aria-valuenow', String(nextWidth));
  }
  if (persist) {
    persistCodeDockWidth(nextWidth);
  }
}

function bindCodeDockResize() {
  const handle = document.getElementById('codeDockResizeHandle');
  const codeDock = document.getElementById('codeDock');
  const layout = document.getElementById('blocklyLayout');
  if (!handle || !codeDock || !layout) {
    return;
  }

  handle.addEventListener('pointerdown', (event) => {
    if (!state.codePanelVisible) {
      return;
    }
    event.preventDefault();
    const pointerId = event.pointerId;
    const layoutRect = layout.getBoundingClientRect();
    state.codeDockResizing = {
      pointerId,
      layoutLeft: layoutRect.left,
      layoutWidth: layoutRect.width,
    };
    codeDock.classList.add('is-resizing');
    handle.setPointerCapture(pointerId);
  });

  handle.addEventListener('pointermove', (event) => {
    if (!state.codeDockResizing || state.codeDockResizing.pointerId !== event.pointerId || !state.codePanelVisible) {
      return;
    }
    event.preventDefault();
    const nextWidth = state.codeDockResizing.layoutWidth - (event.clientX - state.codeDockResizing.layoutLeft);
    applyCodeDockWidth(nextWidth);
    queueBlocklyResize();
  });

  const stopResize = (event) => {
    if (!state.codeDockResizing || state.codeDockResizing.pointerId !== event.pointerId) {
      return;
    }
    event.preventDefault();
    codeDock.classList.remove('is-resizing');
    try {
      handle.releasePointerCapture(event.pointerId);
    } catch (_) {
      // ignore release failures
    }
    persistCodeDockWidth(state.codeDockWidth);
    state.codeDockResizing = null;
    queueBlocklyResize();
  };

  handle.addEventListener('pointerup', stopResize);
  handle.addEventListener('pointercancel', stopResize);
  handle.addEventListener('keydown', (event) => {
    if (!state.codePanelVisible) {
      return;
    }
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
      return;
    }
    event.preventDefault();
    const delta = event.key === 'ArrowLeft' ? 24 : -24;
    applyCodeDockWidth(state.codeDockWidth + delta, { persist: true });
    queueBlocklyResize();
  });
}

function queueBlocklyResize() {
  if (!state.workspace) {
    return;
  }
  window.requestAnimationFrame(() => {
    if (state.workspace) {
      Blockly.svgResize(state.workspace);
    }
  });
  if (state.codePanelResizeTimer) {
    window.clearTimeout(state.codePanelResizeTimer);
  }
  state.codePanelResizeTimer = window.setTimeout(() => {
    state.codePanelResizeTimer = null;
    if (state.workspace) {
      Blockly.svgResize(state.workspace);
    }
  }, 280);
}

function hexToRgba(hex, alpha) {
  const text = String(hex || '').replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(text)) {
    return `rgba(79,107,255,${alpha})`;
  }
  const red = parseInt(text.slice(0, 2), 16);
  const green = parseInt(text.slice(2, 4), 16);
  const blue = parseInt(text.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function getToolboxCategoryName(item) {
  if (!item || typeof item !== 'object') {
    return '';
  }
  const defName = item.toolboxItemDef_?.name;
  if (typeof defName === 'string' && defName.trim()) {
    return defName.trim();
  }
  const div = typeof item.getDiv === 'function' ? item.getDiv() : null;
  const label = div?.querySelector?.('.blocklyToolboxCategoryLabel, .blocklyTreeLabel')?.textContent?.trim();
  return label || '';
}

function getToolboxRowElement(item) {
  const div = typeof item?.getDiv === 'function' ? item.getDiv() : null;
  if (!div) {
    return null;
  }
  return div.querySelector('.blocklyToolboxCategory, .blocklyTreeRow') || div;
}

function getAllToolboxItems() {
  const toolbox = state.workspace?.getToolbox?.();
  if (!toolbox || typeof toolbox.getToolboxItems !== 'function') {
    return [];
  }
  return toolbox.getToolboxItems() || [];
}

function getSelectedToolboxCategoryMeta() {
  const toolbox = state.workspace?.getToolbox?.();
  if (!toolbox || typeof toolbox.getSelectedItem !== 'function') {
    return { name: '', custom: '' };
  }
  const selected = toolbox.getSelectedItem?.();
  const name = getToolboxCategoryName(selected);
  const custom = String(selected?.toolboxItemDef_?.custom || '').trim().toUpperCase();
  return { name, custom };
}

function isVariableCategorySelected() {
  const { name, custom } = getSelectedToolboxCategoryMeta();
  if (custom === 'VARIABLE' || custom === 'VARIABLE_DYNAMIC') {
    return true;
  }
  return name.includes('变量');
}

function styleToolboxCategoryRows() {
  const toolboxItems = getAllToolboxItems();
  if (toolboxItems.length === 0) {
    document.querySelectorAll('.blocklyToolboxCategory, .blocklyTreeRow').forEach((row) => {
      const labelEl = row.querySelector('.blocklyToolboxCategoryLabel, .blocklyTreeLabel');
      const label = labelEl?.textContent?.trim() || '';
      const color = state.categoryColors[label];
      if (!color) {
        return;
      }
      const isSelected = row.classList.contains('blocklyToolboxSelected') || row.classList.contains('blocklyTreeSelected');
      syncCategoryVisuals(row, label, color, isSelected);
    });
    return;
  }
  toolboxItems.forEach((item) => {
    const row = getToolboxRowElement(item);
    const label = getToolboxCategoryName(item);
    const color = state.categoryColors[label];
    if (!row) {
      return;
    }
    row.classList.remove('xedu-toolbox-category-row', 'xedu-toolbox-category-selected');
    row.style.removeProperty('--xedu-category-color');
    row.style.removeProperty('background-color');
    row.style.removeProperty('border-color');
    row.style.removeProperty('box-shadow');
    row.style.removeProperty('border-left');
    if (!color) {
      return;
    }
    const isSelected = row.classList.contains('blocklyToolboxSelected') || row.classList.contains('blocklyTreeSelected');
    syncCategoryVisuals(row, label, color, isSelected);
    row.style.borderLeft = `2px solid ${hexToRgba(color, isSelected ? 0.42 : 0.24)}`;
    row.style.backgroundColor = hexToRgba(color, isSelected ? 0.08 : 0.025);
    row.style.borderColor = hexToRgba(color, isSelected ? 0.18 : 0.08);
    row.style.boxShadow = `inset 0 0 0 1px ${hexToRgba(color, isSelected ? 0.10 : 0.04)}`;
  });
}

function alignToolboxFlyout() {
  document.querySelectorAll('.blocklyToolboxFlyout').forEach((flyout) => {
    flyout.style.setProperty('transform', 'translate(0px, 0px)', 'important');
  });
}

function resetToolboxFlyoutScroll() {
  const flyout = state.workspace?.getFlyout?.();
  if (flyout && typeof flyout.scrollToStart === 'function') {
    flyout.scrollToStart();
    return;
  }
  document.querySelectorAll('.blocklyFlyoutScrollbar, .blocklyScrollbarVertical').forEach((node) => {
    if (typeof node.scrollTo === 'function') {
      node.scrollTo({ top: 0, left: 0 });
    }
  });
}

function alignDropdownFieldArrows() {
  // Keep Blockly dropdown rendering native. Rewriting dropdown text nodes
  // breaks symbol-based fields such as the built-in arithmetic operators.
  return;
}

function queueToolboxRowStyling() {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      styleToolboxCategoryRows();
      alignToolboxFlyout();
      alignDropdownFieldArrows();
    });
  });
}

function syncToolboxMeta() {
  return;
}

function buildToolboxPackList() {
  const packs = [{ name: '课程积木', source: '课程' }];
  const extraCount = Number(state.toolboxVariants.customPackCount || 0);
  for (let index = 0; index < extraCount; index += 1) {
    packs.push({ name: `扩展积木包 ${index + 1}`, source: '导入' });
  }
  return packs;
}

function renderToolboxPacks() {
  state.toolboxPacks = buildToolboxPackList();
  const list = document.getElementById('toolboxPackList');
  if (!list) {
    return;
  }
  list.innerHTML = state.toolboxPacks.map((pack) => `<div class="toolbox-pack-item"><span>${pack.name}</span><small>${pack.source}</small></div>`).join('');
}

function switchToolboxMode(mode) {
  void mode;
}

function getToolboxItemColour(item, fallbackName = '') {
  const itemColour = String(item?.toolboxItemDef_?.colour || '').trim();
  if (itemColour) {
    return resolveCategoryColour(fallbackName, itemColour);
  }
  const fallback = state.categoryColors[String(fallbackName || '').trim()];
  return resolveCategoryColour(fallbackName, fallback || DEFAULT_CATEGORY_COLOUR);
}

function selectToolboxItem(item) {
  const toolbox = state.workspace?.getToolbox?.();
  if (!toolbox || typeof toolbox.setSelectedItem !== 'function' || !item) {
    return;
  }
  toolbox.setSelectedItem(item);
  queueMicrotask(() => {
    resetToolboxFlyoutScroll();
  });
}

function buildSideNavModel() {
  const liveItems = getAllToolboxItems();
  const liveItemsByName = new Map(liveItems.map((item) => [getToolboxCategoryName(item), item]).filter(([name]) => name));
  const sourceSections = (getSourceToolbox()?.contents || [])
    .filter((item) => item && item.kind === 'category');

  const groupedSections = sourceSections
    .map((section) => {
      const name = String(section.name || '').trim();
      const children = (Array.isArray(section.contents) ? section.contents : [])
        .filter((child) => child && child.kind === 'category');
      return {
        item: children.length > 0 ? liveItemsByName.get(String(children[0].name || '').trim()) : liveItemsByName.get(name),
        name,
        colour: resolveCategoryColour(name, section.colour || state.categoryColors[name] || DEFAULT_CATEGORY_COLOUR),
        children: children
          .map((child) => {
            const childName = String(child.name || '').trim();
            const liveItem = liveItemsByName.get(childName);
            if (!childName) {
              return null;
            }
            return {
              item: liveItem,
              name: childName,
              colour: child.colour || getToolboxItemColour(liveItem, childName),
            };
          })
          .filter((child) => child && child.item),
      };
    })
    .filter((section) => section.name && section.children.length > 0);

  if (groupedSections.length > 0) {
    return groupedSections;
  }

  return liveItems
    .map((item) => {
      const name = getToolboxCategoryName(item);
      return {
        item,
        name,
        colour: getToolboxItemColour(item, name),
        children: [{ item, name, colour: getToolboxItemColour(item, name) }],
      };
    })
    .filter((section) => section.name);
}

function renderCustomSideNav() {
  const root = document.getElementById('blocklySideNavBody');
  if (!root) {
    return;
  }
  const sections = buildSideNavModel();
  const selectedName = String(getSelectedToolboxCategoryMeta().name || '').trim();
  const taskRegistry = getXEduHubTaskRegistry();
  const tasksByFamilyLabel = new Map((taskRegistry.tasks || []).map((task) => [String(task?.family_label || '').trim(), task]));
  root.innerHTML = '';

  sections.forEach((section) => {
    const collapsed = Boolean(state.sideNavCollapsed[section.name]);
    const sectionEl = document.createElement('section');
    sectionEl.className = 'blockly-side-section';
    sectionEl.classList.toggle('is-collapsed', collapsed);
    sectionEl.style.setProperty('--xedu-section-color', section.colour);

    const heading = document.createElement('button');
    heading.type = 'button';
    heading.className = 'blockly-side-section-head';
    heading.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    heading.innerHTML = `
      <span class="blockly-side-section-icon">${getCategoryIconSvg(section.name)}</span>
      <span class="blockly-side-section-title">${section.name}</span>
      <span class="blockly-side-section-chevron" aria-hidden="true">
        <svg viewBox="0 0 16 16" fill="none">
          <path d="m5.2 6.4 2.8 2.8 2.8-2.8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </span>
    `;
    heading.addEventListener('click', () => {
      state.sideNavCollapsed[section.name] = !Boolean(state.sideNavCollapsed[section.name]);
      renderCustomSideNav();
    });
    sectionEl.appendChild(heading);

    const list = document.createElement('div');
    list.className = 'blockly-side-section-list';
    section.children.forEach((child) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'blockly-side-leaf';
      const task = tasksByFamilyLabel.get(child.name);
      const unavailable = Boolean(task && task.available === false);
      if (child.name === selectedName) {
        button.classList.add('is-active');
      }
      if (unavailable) {
        button.classList.add('is-unavailable');
        button.title = String(task?.support_reason || '当前本地 XEdu 运行环境不支持该任务');
      }
      button.style.setProperty('--xedu-leaf-color', child.colour);
      button.innerHTML = `
        <span class="blockly-side-leaf-icon">${getCategoryIconSvg(child.name)}</span>
        <span class="blockly-side-leaf-label">${child.name}</span>
      `;
      button.addEventListener('click', () => {
        if (unavailable) {
          setResultWarningView(buildExperimentalTaskPreflight([task], { blocked: true }));
          return;
        }
        selectToolboxItem(child.item);
      });
      list.appendChild(button);
    });
    sectionEl.appendChild(list);
    root.appendChild(sectionEl);
  });
}

function getFirstLeafToolboxItem(item) {
  if (!item) {
    return null;
  }
  const isSelectable = typeof item.isSelectable === 'function' ? item.isSelectable() : false;
  const children = typeof item.getChildToolboxItems === 'function' ? (item.getChildToolboxItems() || []) : [];
  if (children.length > 0) {
    for (const child of children) {
      const nested = getFirstLeafToolboxItem(child);
      if (nested) {
        return nested;
      }
    }
  }
  return isSelectable ? item : null;
}

function normalizeSelectedToolboxItem() {
  if (state.toolboxSelectionSyncing) {
    return;
  }
  const toolbox = state.workspace?.getToolbox?.();
  if (!toolbox || typeof toolbox.getSelectedItem !== 'function' || typeof toolbox.setSelectedItem !== 'function') {
    return;
  }
  const selected = toolbox.getSelectedItem();
  if (!selected || typeof selected.getChildToolboxItems !== 'function') {
    return;
  }
  const children = selected.getChildToolboxItems() || [];
  if (!children.length) {
    return;
  }
  const firstLeaf = getFirstLeafToolboxItem(children[0]) || children.map((child) => getFirstLeafToolboxItem(child)).find(Boolean);
  if (!firstLeaf || firstLeaf === selected) {
    return;
  }
  state.toolboxSelectionSyncing = true;
  try {
    toolbox.setSelectedItem(firstLeaf);
  } finally {
    window.setTimeout(() => {
      state.toolboxSelectionSyncing = false;
    }, 0);
  }
}

function ensureInitialToolboxSelection() {
  const toolbox = state.workspace?.getToolbox?.();
  if (!toolbox || typeof toolbox.getSelectedItem !== 'function' || typeof toolbox.setSelectedItem !== 'function') {
    return;
  }
  if (toolbox.getSelectedItem()) {
    normalizeSelectedToolboxItem();
    return;
  }
  const firstSelectable = (toolbox.getToolboxItems?.() || [])
    .map((item) => getFirstLeafToolboxItem(item))
    .find(Boolean);
  if (firstSelectable) {
    toolbox.setSelectedItem(firstSelectable);
  }
}

function renderResultTerminal(text) {
  const terminal = document.getElementById('resultTerminal');
  if (!terminal) {
    return;
  }
  const normalized = String(text || '').trim();
  terminal.textContent = normalized || '没有原始终端输出';
  terminal.dataset.empty = normalized ? 'false' : 'true';
}

function getResultHint(payload) {
  const hints = Array.isArray(payload?.result_summary?.hints) ? payload.result_summary.hints : [];
  return String(hints[0] || '').trim();
}

function deriveTaskContext() {
  const workspaceTitle = String(getConfigValue('workspaceTitle', '')).trim() || CLASSROOM_DEFAULTS.workspaceFallbackTitle;
  const practiceLabel = String(getConfigValue('practiceLabel', '')).trim();
  const practiceKind = String(getConfigValue('practiceKind', '')).trim();
  const taskGoal = String(getConfigValue('taskGoal', '')).trim();
  const taskStage = String(getConfigValue('taskStage', '')).trim();
  const taskHint = String(getConfigValue('taskHint', '')).trim();
  const lastTone = String(state.resultRunState.lastTone || 'idle');
  const lastHint = getResultHint(state.resultRunState.lastPayload);
  const blockCount = state.workspace?.getAllBlocks(false)?.length || 0;
  const spec = state.workspace ? extractXEduHubSpec() : null;
  const task = spec?.task_id ? getTaskById(spec.task_id) : null;
  const taskLabel = String(task?.label || spec?.task_label || '').trim();
  const hasExplicitTaskSignal = Boolean(taskGoal) || Boolean(taskLabel) || Boolean(practiceLabel);
  if (!hasExplicitTaskSignal) {
    return {
      visible: false,
      workspaceTitle,
      roleLabel: isTeacherMode() ? '教师工作台' : '学生工作台',
      stage: '',
      summary: '',
      description: '',
      hint: '',
      practiceLabel,
    };
  }
  let summary = taskGoal;
  if (!summary) {
    if (taskLabel) {
      summary = isTeacherMode()
        ? `围绕${taskLabel}实验做调试与预演`
        : `继续完成${taskLabel}实验`;
    } else if (practiceLabel) {
      summary = isTeacherMode()
        ? `围绕${practiceLabel}继续备课与调试`
        : `继续完成${practiceLabel}`;
    } else if (hasExplicitTaskSignal && workspaceTitle && !workspaceTitle.includes('Blockly')) {
      summary = isTeacherMode()
        ? `围绕${workspaceTitle}继续调试`
        : `继续完成${workspaceTitle}`;
    }
  }
  let stage = taskStage;
  if (!stage) {
    if (lastTone === 'success') {
      stage = '结果复盘';
    } else if (lastTone === 'error') {
      stage = '排查问题';
    } else if (isTeacherMode()) {
      stage = hasRunnableFlow() ? '教师预演' : '搭建与调试';
    } else if (blockCount === 0) {
      stage = '开始实验';
    } else if (hasRunnableFlow()) {
      stage = '运行验证';
    } else {
      stage = '完善流程';
    }
  }
  const roleLabel = isTeacherMode() ? '教师工作台' : '学生工作台';
  let description = '';
  if (taskLabel) {
    description = `当前工作区聚焦${taskLabel}。页面会优先把输入、任务、参数和结果组织成一条实验主流程。`;
  } else if (practiceLabel) {
    description = `当前工作区关联到${practiceLabel}${practiceKind ? ` · ${practiceKind}` : ''}，先完成主流程，再按需查看代码和调试细节。`;
  }
  const hint = taskHint
    || lastHint
    || (!hasRunnableFlow()
      ? '先从“输入资源”和“任务与模型”里拖入关键积木，搭出本节实验的主流程。'
      : isTeacherMode()
        ? '需要导入工作区、查看代码或扩展积木时，再从右上角次级入口进入。'
        : '先点击运行程序查看证据，再决定是否调整参数或补充基础编程积木。');
  return {
    visible: true,
    workspaceTitle,
    roleLabel,
    stage,
    summary,
    description,
    hint,
    practiceLabel,
  };
}

function updateTaskContext() {
  const context = deriveTaskContext();
  const card = document.getElementById('taskContextCard');
  if (card) {
    card.hidden = !context.visible;
  }
  const workspaceLabel = document.getElementById('workspaceLabel');
  if (workspaceLabel) {
    workspaceLabel.textContent = context.workspaceTitle;
  }
  const workspaceMetaLabel = document.getElementById('workspaceMetaLabel');
  if (workspaceMetaLabel) {
    workspaceMetaLabel.textContent = context.visible && context.stage
      ? `${context.roleLabel} · ${context.stage}`
      : CLASSROOM_DEFAULTS.workspaceMetaLabel;
  }
  const mapping = {
    taskContextRole: context.roleLabel,
    taskContextStage: context.stage,
    taskContextSummary: context.summary,
    taskContextDescription: context.description,
    taskContextWorkspace: context.workspaceTitle,
    taskContextHint: context.hint,
  };
  Object.entries(mapping).forEach(([id, value]) => {
    const element = document.getElementById(id);
    if (element) {
      element.textContent = value;
    }
  });
  const practiceLink = document.getElementById('taskContextPractice');
  if (practiceLink) {
    const href = String(getConfigValue('practiceLaunchUrl', '') || getConfigValue('practiceUrl', '') || '').trim();
    if (context.practiceLabel && href) {
      practiceLink.style.display = 'inline-flex';
      practiceLink.href = href;
      practiceLink.textContent = `查看关联实验：${context.practiceLabel}`;
    } else {
      practiceLink.style.display = 'none';
      practiceLink.removeAttribute('href');
    }
  }
}

function setPythonCode(code) {
  const el = document.getElementById('pythonCode');
  if (!el) {
    return;
  }
  const raw = String(code || '');
  el.dataset.raw = raw;
  el.innerHTML = renderPythonHighlighted(raw);
}

function getPythonRaw() {
  const el = document.getElementById('pythonCode');
  return el ? String(el.dataset.raw || el.textContent || '') : '';
}

function setResultBadge(text, tone = '') {
  const runBadge = document.getElementById('resultRunBadge');
  if (!runBadge) {
    return;
  }
  runBadge.classList.remove('is-success', 'is-error', 'is-running', 'is-warning');
  if (tone) {
    runBadge.classList.add(tone);
  }
  runBadge.textContent = text;
}

function setResultMode(mode = 'idle') {
  document.getElementById('resultBox')?.setAttribute('data-state', mode);
}

function setResultTerminal(text) {
  const tone = text === CLASSROOM_DEFAULTS.resultRunningText ? 'running' : 'idle';
  state.resultRunState.lastPayload = {
    success: text === CLASSROOM_DEFAULTS.resultIdleText,
    message: String(text || '').trim(),
    result_summary: {
      headline: String(text || '').trim(),
      metrics: [],
      hints: [],
    },
    result_artifacts: { preview_image: '', key_fields: {} },
  };
  state.resultRunState.lastTone = tone;
  renderResultTerminal(text);
  updateTaskContext();
}

async function parseJsonResponse(response, fallbackMessage = '请求失败') {
  const contentType = String(response?.headers?.get?.('content-type') || '').toLowerCase();
  const rawText = await response.text();
  const text = String(rawText || '').trim();

  if (!text) {
    return {};
  }

  const parseJson = () => JSON.parse(text);

  if (contentType.includes('application/json')) {
    try {
      return parseJson();
    } catch (_) {
      throw new Error(`${fallbackMessage}：返回的 JSON 数据格式不正确`);
    }
  }

  try {
    return parseJson();
  } catch (_) {
    const preview = text.slice(0, 80).replace(/\s+/g, ' ');
    if (preview.startsWith('<')) {
      throw new Error(`${fallbackMessage}：接口返回了页面内容，请确认后端服务已正确启动`);
    }
    throw new Error(`${fallbackMessage}：${preview}`);
  }
}

function resetDebugDetails({ summary = '查看详细数据', payload = {}, open = false } = {}) {
  void summary;
  void payload;
  void open;
}

function formatTerminalValue(value) {
  if (value === null || value === undefined || value === '') {
    return '-';
  }
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value, null, 2);
    } catch (_) {
      return String(value);
    }
  }
  return String(value);
}

function appendTerminalText(lines, text) {
  const normalized = String(text || '').replace(/\r\n/g, '\n').trim();
  if (!normalized) {
    return;
  }
  normalized.split('\n').forEach((line) => lines.push(line));
}

function appendTerminalSection(lines, title, value) {
  const before = lines.length;
  appendTerminalText(lines, value);
  if (lines.length === before) {
    return;
  }
  if (title) {
    lines.splice(before, 0, title);
  }
}

function summarizeTerminalObject(value) {
  if (value === null || value === undefined || value === '') {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch (_) {
    return String(value);
  }
}

function getPayloadPreviewImage(payload) {
  return String(
    payload?.result_artifacts?.preview_image
    || payload?.artifacts?.image_data
    || payload?.result?.image
    || payload?.result?.result_image
    || payload?.result?.visualization
    || '',
  ).trim();
}

function isDisplayableImageSource(src) {
  const value = String(src || '').trim();
  if (!value) {
    return false;
  }
  if (/^(data:image\/|blob:|https?:\/\/|file:\/\/|\/)/i.test(value)) {
    return true;
  }
  return /\.(png|jpe?g|gif|webp|bmp|svg)(\?.*)?$/i.test(value);
}

function buildTerminalOutput(payload) {
  const lines = [];
  const stdout = String(payload?.result?.stdout || payload?.output || '').replace(/\r\n/g, '\n').trim();
  const stderr = String(
    payload?.result?.stderr
    || payload?.error_output
    || payload?.result?.error
    || payload?.error
    || '',
  ).replace(/\r\n/g, '\n').trim();

  appendTerminalText(lines, stdout);
  const message = String(payload?.message || '').trim();
  const headline = String(payload?.result_summary?.headline || '').trim();
  const output = payload?.result?.output;
  if (!stdout && message) {
    appendTerminalText(lines, message);
  }
  if (!stdout && !message && headline) {
    appendTerminalText(lines, headline);
  }
  if (!stdout && output !== undefined && output !== null && output !== '') {
    if (lines.length > 0) {
      lines.push('');
    }
    appendTerminalSection(lines, '运行结果:', summarizeTerminalObject(output));
  }
  const metrics = Array.isArray(payload?.result_summary?.metrics) ? payload.result_summary.metrics : [];
  const metricLines = metrics
    .map((metric) => {
      const label = String(metric?.label || '').trim();
      const value = formatTerminalValue(metric?.value);
      return label ? `${label}: ${value}` : '';
    })
    .filter(Boolean);
  if (metricLines.length > 0) {
    if (lines.length > 0) {
      lines.push('');
    }
    lines.push(...metricLines);
  }
  const hints = Array.isArray(payload?.result_summary?.hints) ? payload.result_summary.hints : [];
  const hintLines = hints.map((hint) => String(hint || '').trim()).filter(Boolean);
  if (hintLines.length > 0) {
    if (lines.length > 0) {
      lines.push('');
    }
    lines.push(...hintLines.map((hint) => `提示: ${hint}`));
  }
  if (stderr) {
    if (lines.length > 0) {
      lines.push('');
    }
    appendTerminalText(lines, stderr);
  }

  const returnCode = payload?.result?.return_code ?? payload?.return_code;
  if (typeof returnCode === 'number' && (returnCode !== 0 || lines.length > 0)) {
    if (lines.length > 0) {
      lines.push('');
    }
    lines.push(`[exit code ${returnCode}]`);
  }

  if (isDisplayableImageSource(getPayloadPreviewImage(payload))) {
    if (lines.length > 0) {
      lines.push('');
    }
    lines.push('[图片结果已弹窗显示]');
  }

  return lines.join('\n').trim() || '';
}

function setResultIdleView() {
  setResultMode('idle');
  setResultBadge('未运行');
  state.resultRunState = { hasRun: false, lastPayload: null, lastTone: 'idle' };
  closeResultImageDialog();
  renderResultTerminal(CLASSROOM_DEFAULTS.resultIdleText);
  resetDebugDetails({ payload: {}, open: false });
  updateTaskContext();
}

function setResultRunningView() {
  setResultMode('running');
  setResultBadge('运行中', 'is-running');
  state.resultRunState = { hasRun: true, lastPayload: { status: 'running' }, lastTone: 'running' };
  renderResultTerminal(CLASSROOM_DEFAULTS.resultRunningText);
  resetDebugDetails({ payload: { status: 'running' }, open: false });
  updateTaskContext();
}

function setResultWarningView(payload) {
  setResultMode('warning');
  setResultBadge(payload?.blocked ? '未执行' : '提醒', 'is-warning');
  state.resultRunState = {
    hasRun: true,
    lastPayload: payload || { status: 'warning' },
    lastTone: payload?.blocked ? 'blocked' : 'warning',
  };
  renderResultTerminal(buildTerminalOutput(payload || { message: CLASSROOM_DEFAULTS.resultBlockedText }));
  resetDebugDetails({ payload: payload || { status: 'warning' }, open: false });
  updateTaskContext();
}

function updatePython() {
  if (!state.workspace) {
    return;
  }
  const python = getPythonCodeForWorkspace(state.workspace, pythonGenerator, DEFAULT_PYTHON_PLACEHOLDER);
  setPythonCode(python);
}

function getWorkspaceExportPayload() {
  return buildWorkspaceExportPayload(Blockly, state.workspace, String(getConfigValue('workspaceUrl', '')));
}

function downloadTextFile(content, filename) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const anchor = document.createElement('a');
  anchor.href = URL.createObjectURL(blob);
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(anchor.href);
}

function loadWorkspaceSnapshot(serialized, { asInitial = false } = {}) {
  if (!state.workspace || !serialized) {
    return;
  }
  applyWorkspaceSnapshot(Blockly, state.workspace, serialized);
  if (asInitial) {
    state.initialSerialized = serialized;
  }
  updatePython();
  updateTaskContext();
}

async function openWorkspaceFile(file) {
  if (!state.workspace || !file) {
    return;
  }
  const rawText = await file.text();
  const { serialized, migrationReport } = parseAndMigrateWorkspaceText(rawText, {
    migrateXmlText: migrateXEduHubXmlText,
    migrateSerialized: migrateXEduHubSerialized,
  });
  loadWorkspaceSnapshot(serialized, { asInitial: true });
  state.resultRunState.hasRun = false;
  setResultIdleView();
  resetDebugDetails({ payload: {}, open: false });
  if (migrationReport && ((migrationReport.changed || []).length || (migrationReport.failed || []).length)) {
    renderMigrationReport(migrationReport);
    maybeWarnExperimentalWorkspace('已打开并自动迁移实验性任务工作区');
  } else {
    updateResultView({
      success: true,
      message: `已打开文件：${file.name}`,
      result: { stdout: '', stderr: '', return_code: 0 },
      artifacts: {},
    });
    maybeWarnExperimentalWorkspace('已打开包含实验性任务的工作区');
  }
  updateTaskContext();
}

function hasExecutablePython() {
  const code = getPythonRaw().trim();
  if (!code) {
    return false;
  }
  return !code.startsWith('# 在左侧拖入积木开始编程');
}

function buildGenericPythonPreflightError() {
  return buildPreflightError('missing_code', '当前还没有可运行的代码。', '先拖入积木，生成代码后再运行。');
}

function normalizePythonRunPayload(payload) {
  const stdout = String(payload?.output || '').replace(/\r\n/g, '\n').trim();
  const stderr = String(payload?.error_output || '').replace(/\r\n/g, '\n').trim();
  return {
    success: Boolean(payload?.success),
    message: String(payload?.message || ''),
    result: {
      stdout,
      stderr,
      return_code: payload?.return_code,
    },
    error: payload?.success ? '' : stderr,
  };
}

async function loadToolboxes() {
  const official = normalizeCategoryMeta(getConfigValue('defaultXEduHubToolbox', {}));
  const toolboxUrl = String(getConfigValue('toolboxUrl', ''));
  if (!toolboxUrl) {
    return { official, course: official, hasCourseCustom: false, customPackCount: 0 };
  }
  try {
    const custom = JSON.parse(await fetchText(toolboxUrl));
    const check = await validateToolboxWithApi(custom);
    if (!check.valid) {
      throw new Error(`课程 toolbox 非法：${check.errors[0] || '未知错误'}`);
    }
    const packs = Array.isArray(custom?.packs) ? custom.packs : [];
    return {
      official,
      course: mergeToolboxes(getConfigValue('defaultXEduHubToolbox', {}), check.normalized || custom),
      hasCourseCustom: true,
      customPackCount: packs.length,
    };
  } catch (_) {
    return { official, course: official, hasCourseCustom: false, customPackCount: 0 };
  }
}

function extractXEduHubSpec() {
  if (!state.workspace) {
    return null;
  }
  return collectXEduHubSpecFromBlocks(state.workspace.getAllBlocks(false), {
    getParamFieldName,
    getTaskById,
    getTaskIdFromRunBlockType,
    isSemanticRunBlockType,
    projectRoot: String(getConfigValue('projectRoot', '')),
    resolveLegacyTaskId,
  });
}

function collectWorkspaceTasks() {
  if (!state.workspace) {
    return [];
  }
  return collectXEduHubTasksFromBlocks(state.workspace.getAllBlocks(false), {
    getTaskById,
    getTaskIdFromRunBlockType,
    isSemanticRunBlockType,
    resolveLegacyTaskId,
  });
}

function hasRunnableFlow() {
  return Boolean(state.workspace) && hasRunnableFlowInBlocks(state.workspace.getAllBlocks(false), {
    isSemanticRunBlockType,
    runnableBlockTypes: RUNNABLE_BLOCK_TYPES,
  });
}

function hasRuntimeBoundInputSpec(spec) {
  return Boolean(spec && spec.input === '__runtime_bound__');
}

function getWorkspaceVariableNameById(variableId) {
  return lookupWorkspaceVariableName(state.workspace, variableId);
}

function getBlockVariableName(block, fieldName) {
  return getRuntimeBlockVariableName(block, fieldName, getWorkspaceVariableNameById);
}

function validateWorkspaceBindings() {
  if (!state.workspace) {
    return null;
  }
  return validateWorkspaceBindingsForBlocks(state.workspace.getAllBlocks(false), {
    buildPreflightError,
    lookupVariableName: getWorkspaceVariableNameById,
  });
}

function buildPreflightError(code, message, hint) {
  return {
    success: false,
    result_type: 'error',
    error_code: code,
    message,
    result: {},
    artifacts: {},
    result_summary: {
      headline: message,
      metrics: [],
      hints: hint ? [hint] : [],
    },
    result_artifacts: { preview_image: '', key_fields: {} },
    result_error: { code },
  };
}

function renderMigrationReport(report) {
  if (!report || (!report.changed?.length && !report.failed?.length)) {
    return;
  }
  state.migrationReport = report;
  setResultMode('success');
  setResultBadge('完成', 'is-success');
  state.resultRunState = {
    hasRun: true,
    lastPayload: {
      success: true,
      message: '已自动迁移旧版工作区',
      result_summary: {
        headline: '已自动迁移旧版工作区',
        metrics: [
          { label: '成功迁移', value: report.changed?.length || 0 },
          { label: '失败项', value: report.failed?.length || 0 },
        ],
        hints: ['请继续检查工作区是否符合当前实验目标。'],
      },
      result_artifacts: { preview_image: '', key_fields: {} },
      result: report,
    },
    lastTone: 'success',
  };
  renderResultTerminal([
    '# 已自动迁移旧版工作区',
    `success: ${report.changed?.length || 0}`,
    `failed: ${report.failed?.length || 0}`,
  ].join('\n'));
  resetDebugDetails({ payload: report, open: false });
  updateTaskContext();
  blocklyDebugLog('工作区迁移报告', report);
}

function maybeWarnExperimentalWorkspace(reason = '已加载包含实验性任务的工作区') {
  const tasks = collectWorkspaceTasks().filter((task) => task?.available === false);
  if (tasks.length === 0) {
    return;
  }
  const payload = buildExperimentalTaskPreflight(tasks, { blocked: false });
  payload.success = true;
  payload.message = reason;
  payload.result_summary.headline = reason;
  payload.result_summary.hints = ['这些任务会兼容保留，但默认不会出现在新的快捷任务分类里。'];
  setResultWarningView(payload);
}

function syncWorkspaceTaskContext() {
  updateTaskContext();
  if (state.workspace && typeof state.workspace.getAllBlocks === 'function') {
    const hasTask = Boolean(extractXEduHubSpec()?.task_id);
    const hasBlocks = state.workspace.getAllBlocks(false).length > 0;
    const shouldHintRun = hasTask || hasBlocks;
    if (shouldHintRun && state.resultRunState.lastTone === 'idle' && !state.resultRunState.hasRun) {
      renderResultTerminal(CLASSROOM_DEFAULTS.resultIdleText);
    }
  }
}

function validateRunnableSpec(spec) {
  if (!hasRunnableFlow()) {
    return buildPreflightError('missing_flow', '当前工作区里还没有 XEduHub 积木流程，请先拖入相关积木。', '先拖入一个 XEduHub 任务运行积木。');
  }
  if (!spec || !spec.task_id) {
    return buildPreflightError('missing_task', '当前流程缺少任务类型，请先放入运行积木。', '请先放入一个带任务语义的 XEduHub 运行积木。');
  }
  if (spec.input === undefined || spec.input === null || spec.input === '') {
    return buildPreflightError('missing_input', '当前流程缺少输入路径。', '先使用“选择输入图片”积木，或直接在任务块的输入槽接入文本路径。');
  }
  return null;
}

function buildExperimentalTaskPreflight(tasks, { blocked = false } = {}) {
  const names = tasks.map((task) => String(task?.label || task?.task_id || '').trim()).filter(Boolean);
  const joined = names.join('、');
  const firstAction = String(tasks[0]?.recommended_action || '').trim();
  return {
    success: false,
    blocked,
    result_type: 'error',
    error_code: blocked ? 'runtime_task_hidden_for_student' : 'runtime_task_experimental',
    message: blocked
      ? `当前流程包含本地暂不支持的实验性任务：${joined}`
      : `当前流程包含实验性任务：${joined}`,
    result: {},
    artifacts: {},
    result_summary: {
      headline: blocked ? '学生模式下已阻止执行实验性任务' : '检测到实验性任务',
      metrics: names.length > 0 ? [{ label: '任务数量', value: names.length }] : [],
      hints: [
        blocked
          ? '请改用默认可运行的任务块，或让老师在教师模式下检查该流程。'
          : (firstAction || '这些任务当前本地环境不支持，请安装对应模型/版本后再试。'),
      ],
    },
    result_artifacts: { preview_image: '', key_fields: names.length > 0 ? { 实验性任务: joined } : {} },
    result_error: { code: blocked ? 'runtime_task_hidden_for_student' : 'runtime_task_experimental' },
  };
}

function collectPresentationActionsFromWorkspace() {
  if (!state.workspace) {
    return [];
  }
  return collectXEduHubPresentationActionsFromBlocks(state.workspace);
}

function decoratePayloadWithResultActions(payload) {
  const nextPayload = payload && typeof payload === 'object' ? payload : {};
  const actions = collectPresentationActionsFromWorkspace();
  nextPayload.__xeduPresentationActions = actions;
  nextPayload.__xeduPresentationCleared = actions.some((action) => action?.type === 'clear_result');
  return nextPayload;
}

function getRequestedResultImage(actions, payload) {
  const imageAction = (actions || []).find((action) => action?.type === 'result_image');
  const explicitImage = String(imageAction?.image?.value || '').trim();
  return {
    src: [getPayloadPreviewImage(payload), explicitImage].find(isDisplayableImageSource) || '',
    title: String(imageAction?.title || '结果图片').trim() || '结果图片',
  };
}

function updateResultView(payload) {
  const nextPayload = decoratePayloadWithResultActions(payload || {});
  const success = Boolean(nextPayload && nextPayload.success);
  const clearedOnly = Boolean(nextPayload?.__xeduPresentationCleared);
  state.resultRunState.hasRun = true;
  state.resultRunState.lastPayload = nextPayload;
  state.resultRunState.lastTone = clearedOnly ? 'idle' : success ? 'success' : 'error';
  if (clearedOnly) {
    setResultMode('idle');
    setResultBadge('已清空');
    closeResultImageDialog();
    renderResultTerminal('已清空运行反馈');
  } else {
    setResultMode(success ? 'success' : 'error');
    setResultBadge(success ? '完成' : '异常', success ? 'is-success' : 'is-error');
    renderResultTerminal(buildTerminalOutput(nextPayload));
    const imageResult = getRequestedResultImage(nextPayload.__xeduPresentationActions, nextPayload);
    openResultImageDialog(imageResult.src, imageResult.title);
  }
  resetDebugDetails({
    payload: nextPayload?.result ?? nextPayload ?? {},
    open: !success && Boolean(nextPayload?.result && Object.keys(nextPayload.result).length > 0),
  });
  updateTaskContext();
}

async function executeXEduHub() {
  const runBtn = document.getElementById('runXEduHubBtn');
  if (runBtn) {
    runBtn.disabled = true;
    runBtn.textContent = '运行中...';
  }
  setResultRunningView();
  try {
    if (!hasExecutablePython()) {
      updateResultView(buildGenericPythonPreflightError());
      return;
    }

    const bindingError = validateWorkspaceBindings();
    if (bindingError) {
      updateResultView(bindingError);
      return;
    }

    if (hasRunnableFlow()) {
      const spec = extractXEduHubSpec();
      const workspaceTasks = collectWorkspaceTasks();
      const experimentalTasks = workspaceTasks.filter((task) => task?.available === false);
      const specError = validateRunnableSpec(spec);
      if (specError) {
        updateResultView(specError);
        return;
      }
      if (experimentalTasks.length > 0) {
        const payload = buildExperimentalTaskPreflight(experimentalTasks, { blocked: !isTeacherMode() });
        if (!isTeacherMode()) {
          setResultWarningView(payload);
          return;
        }
        setResultWarningView(payload);
      }
      if (hasRuntimeBoundInputSpec(spec)) {
        const response = await fetch(String(getConfigValue('pythonRunUrl', '/api/python/run')), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code: getPythonRaw(),
            project_root: String(getConfigValue('projectRoot', '')),
          }),
        });
        const payload = await parseJsonResponse(response, '运行 Python 代码失败');
        updateResultView(normalizePythonRunPayload(payload));
        return;
      }
      const response = await fetch(String(getConfigValue('xeduhubExecuteUrl', '/api/resources/blockly/xeduhub/execute')), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: getPythonRaw(),
          spec,
          project_root: String(getConfigValue('projectRoot', '')),
        }),
      });
      const payload = await parseJsonResponse(response, '执行 XEduHub 运行时失败');
      updateResultView(payload);
      return;
    }

    const response = await fetch(String(getConfigValue('pythonRunUrl', '/api/python/run')), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: getPythonRaw(),
        project_root: String(getConfigValue('projectRoot', '')),
      }),
    });
    const payload = await parseJsonResponse(response, '运行 Python 代码失败');
    updateResultView(normalizePythonRunPayload(payload));
  } catch (error) {
    updateResultView({
      success: false,
      message: error?.message || '执行失败',
      result: { error: String(error || '') },
      artifacts: {},
    });
  } finally {
    if (runBtn) {
      runBtn.disabled = false;
      runBtn.textContent = '运行程序';
    }
  }
}

function registerBuiltinToolboxCallbacks(workspace) {
  if (!workspace || typeof workspace.registerToolboxCategoryCallback !== 'function') {
    blocklyDebugWarn('workspace 不支持 registerToolboxCategoryCallback，已跳过动态分类注册');
    return;
  }
  blocklyDebugLog('开始注册 builtin toolbox 回调');
  if (typeof workspace.registerButtonCallback === 'function' && !workspace.__xeduButtonCallbackInstrumented__) {
    const rawRegisterButtonCallback = workspace.registerButtonCallback.bind(workspace);
    workspace.registerButtonCallback = (key, callback) => rawRegisterButtonCallback(
      key,
      (button) => {
        state.lastFlyoutButtonInvoke = { key: String(key || ''), at: Date.now() };
        return callback(button);
      },
    );
    workspace.__xeduButtonCallbackInstrumented__ = true;
    blocklyDebugLog('已启用 flyout 按钮回调埋点');
  }
  const resolveTargetWorkspace = (source) => {
    let target = source;
    if (target && typeof target.getTargetWorkspace === 'function') {
      target = target.getTargetWorkspace();
    }
    if (target && typeof target.getRootWorkspace === 'function') {
      target = target.getRootWorkspace();
    }
    return target || workspace;
  };
  const resolveUniqueVariableName = (targetWorkspace, preferredName, variableType = '') => {
    const preferred = String(preferredName || '').trim();
    if (!preferred) {
      if (typeof Blockly?.Variables?.generateUniqueName === 'function') {
        return Blockly.Variables.generateUniqueName(targetWorkspace);
      }
      return '变量';
    }
    const hasNameUsedWithAnyType = typeof Blockly?.Variables?.nameUsedWithAnyType === 'function';
    const existing = hasNameUsedWithAnyType
      ? Blockly.Variables.nameUsedWithAnyType(preferred, targetWorkspace)
      : targetWorkspace?.getVariable?.(preferred, variableType || '');
    if (!existing) {
      return preferred;
    }
    if (typeof Blockly?.Variables?.generateUniqueName === 'function') {
      return Blockly.Variables.generateUniqueName(targetWorkspace);
    }
    return `${preferred}_1`;
  };
  const ensureVariableByPrompt = async (source, variableType = '') => {
    const targetWorkspace = resolveTargetWorkspace(source);
    blocklyDebugLog('触发变量创建回调', {
      variableType,
      hasSource: Boolean(source),
      hasTargetWorkspace: Boolean(targetWorkspace),
      sourceCtor: source?.constructor?.name || '',
      targetCtor: targetWorkspace?.constructor?.name || '',
    });
    const variableMap = typeof targetWorkspace?.getVariableMap === 'function'
      ? targetWorkspace.getVariableMap()
      : null;
    if (!targetWorkspace || !variableMap || typeof variableMap.createVariable !== 'function') {
      blocklyDebugWarn('目标 workspace 不可创建变量，已忽略', {
        variableType,
        hasCreateVariable: Boolean(variableMap && typeof variableMap.createVariable === 'function'),
      });
      return;
    }
    const beforeCount = targetWorkspace.getVariableMap?.().getAllVariables?.().length || 0;
    blocklyDebugLog('变量创建前统计', { variableType, beforeCount });
    const defaultName = typeof Blockly?.Variables?.generateUniqueName === 'function'
      ? Blockly.Variables.generateUniqueName(targetWorkspace)
      : '变量';
    const title = String(Blockly?.Msg?.NEW_VARIABLE_TITLE || '请输入变量名');
    const subtitle = variableType
      ? `正在创建 ${variableType} 类型变量`
      : '请输入变量名';
    const rawName = await requestVariableName({
      title,
      subtitle,
      defaultValue: defaultName,
    });
    const normalizedName = String(rawName || '')
      .replace(/[\s\xa0]+/g, ' ')
      .trim();
    let finalName = normalizedName;
    if (!finalName) {
      blocklyDebugWarn('变量名为空，用户可能取消了创建', { variableType });
      return;
    }
    if (finalName === String(Blockly?.Msg?.NEW_VARIABLE || '').trim() || finalName === String(Blockly?.Msg?.RENAME_VARIABLE || '').trim()) {
      finalName = defaultName;
    }
    finalName = resolveUniqueVariableName(targetWorkspace, finalName, variableType || '');
    blocklyDebugLog('prompt 返回结果', { variableType, rawName, normalizedName, finalName });
    if (!finalName) {
      blocklyDebugWarn('变量名为空，用户可能取消了创建', { variableType });
      return;
    }
    variableMap.createVariable(finalName, variableType || '');
    const afterCount = targetWorkspace.getVariableMap?.().getAllVariables?.().length || 0;
    blocklyDebugLog('已手动创建变量', { variableType, finalName, beforeCount, afterCount });
  };
  state.createVariableFallback = (variableType = '') => ensureVariableByPrompt(workspace, variableType || '');
  const registerVariableButtonCallbacks = (targetWorkspace) => {
    if (!targetWorkspace || typeof targetWorkspace.registerButtonCallback !== 'function') {
      return;
    }
    targetWorkspace.registerButtonCallback('CREATE_VARIABLE', (button) => {
      blocklyDebugLog('点击 flyout 按钮：CREATE_VARIABLE');
      ensureVariableByPrompt(button, '');
    });
    targetWorkspace.registerButtonCallback('CREATE_VARIABLE_STRING', (button) => {
      blocklyDebugLog('点击 flyout 按钮：CREATE_VARIABLE_STRING');
      ensureVariableByPrompt(button, 'String');
    });
    targetWorkspace.registerButtonCallback('CREATE_VARIABLE_NUMBER', (button) => {
      blocklyDebugLog('点击 flyout 按钮：CREATE_VARIABLE_NUMBER');
      ensureVariableByPrompt(button, 'Number');
    });
    targetWorkspace.registerButtonCallback('CREATE_VARIABLE_COLOUR', (button) => {
      blocklyDebugLog('点击 flyout 按钮：CREATE_VARIABLE_COLOUR');
      ensureVariableByPrompt(button, 'Colour');
    });
  };

  if (typeof workspace.registerButtonCallback === 'function') {
    registerVariableButtonCallbacks(workspace);
    blocklyDebugLog('已注册 flyout 按钮回调', [
      'CREATE_VARIABLE',
      'CREATE_VARIABLE_STRING',
      'CREATE_VARIABLE_NUMBER',
      'CREATE_VARIABLE_COLOUR',
    ]);
  } else {
    blocklyDebugWarn('workspace 不支持 registerButtonCallback，按钮回调未注册');
  }

  const variableCallback = (targetWorkspace) => {
    blocklyDebugLog('触发变量分类回调', { callback: 'VARIABLE', workspaceCtor: targetWorkspace?.constructor?.name || '' });
    const resolvedWorkspace = resolveTargetWorkspace(targetWorkspace);
    if (typeof Blockly?.Variables?.internalFlyoutCategory === 'function') {
      const result = Blockly.Variables.internalFlyoutCategory(targetWorkspace);
      registerVariableButtonCallbacks(resolvedWorkspace);
      blocklyDebugLog('变量分类回调返回项数量', { callback: 'VARIABLE', count: Array.isArray(result) ? result.length : -1 });
      return result;
    }
    if (typeof Blockly?.Variables?.flyoutCategory === 'function') {
      const result = Blockly.Variables.flyoutCategory(targetWorkspace, false);
      registerVariableButtonCallbacks(resolvedWorkspace);
      blocklyDebugLog('变量分类回调返回项数量', { callback: 'VARIABLE', count: Array.isArray(result) ? result.length : -1 });
      return result;
    }
    blocklyDebugWarn('变量分类回调未找到可用实现');
    return [];
  };
  const variableDynamicCallback = (targetWorkspace) => {
    blocklyDebugLog('触发动态变量分类回调', { callback: 'VARIABLE_DYNAMIC', workspaceCtor: targetWorkspace?.constructor?.name || '' });
    const resolvedWorkspace = resolveTargetWorkspace(targetWorkspace);
    if (typeof Blockly?.VariablesDynamic?.internalFlyoutCategory === 'function') {
      const result = Blockly.VariablesDynamic.internalFlyoutCategory(targetWorkspace);
      registerVariableButtonCallbacks(resolvedWorkspace);
      blocklyDebugLog('动态变量分类回调返回项数量', { callback: 'VARIABLE_DYNAMIC', count: Array.isArray(result) ? result.length : -1 });
      return result;
    }
    if (typeof Blockly?.VariablesDynamic?.flyoutCategory === 'function') {
      const result = Blockly.VariablesDynamic.flyoutCategory(targetWorkspace, false);
      registerVariableButtonCallbacks(resolvedWorkspace);
      blocklyDebugLog('动态变量分类回调返回项数量', { callback: 'VARIABLE_DYNAMIC', count: Array.isArray(result) ? result.length : -1 });
      return result;
    }
    blocklyDebugWarn('动态变量分类回调未找到可用实现，回退到 VARIABLE');
    return variableCallback(targetWorkspace);
  };
  const procedureCallback = (targetWorkspace) => {
    blocklyDebugLog('触发函数分类回调', { callback: 'PROCEDURE', workspaceCtor: targetWorkspace?.constructor?.name || '' });
    if (typeof Blockly?.Procedures?.internalFlyoutCategory === 'function') {
      const result = Blockly.Procedures.internalFlyoutCategory(targetWorkspace);
      blocklyDebugLog('函数分类回调返回项数量', { callback: 'PROCEDURE', count: Array.isArray(result) ? result.length : -1 });
      return result;
    }
    if (typeof Blockly?.Procedures?.flyoutCategory === 'function') {
      const result = Blockly.Procedures.flyoutCategory(targetWorkspace, false);
      blocklyDebugLog('函数分类回调返回项数量', { callback: 'PROCEDURE', count: Array.isArray(result) ? result.length : -1 });
      return result;
    }
    blocklyDebugWarn('函数分类回调未找到可用实现');
    return [];
  };

  const normalizeKeyList = (keys) => {
    const unique = new Set();
    keys.forEach((value) => {
      const key = String(value || '').trim();
      if (key) {
        unique.add(key);
      }
    });
    return Array.from(unique);
  };

  const variableKeys = normalizeKeyList([
    Blockly.VARIABLE_CATEGORY_NAME,
    'VARIABLE',
    'variable',
  ]);
  blocklyDebugLog('变量分类回调注册 key', variableKeys);
  variableKeys.forEach((key) => workspace.registerToolboxCategoryCallback(String(key), variableCallback));

  const dynamicVariableKeys = normalizeKeyList([
    Blockly.VARIABLE_DYNAMIC_CATEGORY_NAME,
    'VARIABLE_DYNAMIC',
    'variable_dynamic',
  ]);
  blocklyDebugLog('动态变量分类回调注册 key', dynamicVariableKeys);
  dynamicVariableKeys.forEach((key) => workspace.registerToolboxCategoryCallback(String(key), variableDynamicCallback));

  const procedureKeys = normalizeKeyList([
    Blockly.PROCEDURE_CATEGORY_NAME,
    'PROCEDURE',
    'procedure',
  ]);
  blocklyDebugLog('函数分类回调注册 key', procedureKeys);
  procedureKeys.forEach((key) => workspace.registerToolboxCategoryCallback(String(key), procedureCallback));
}

async function persistCourseToolbox(toolbox) {
  const endpoint = String(getConfigValue('toolboxSaveUrl', '/api/resources/blockly/toolbox/save'));
  const rootToken = String(getConfigValue('rootToken', ''));
  if (!endpoint || !rootToken) {
    return { success: false, message: '当前页面未绑定课程目录，已保留本次导入结果' };
  }
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      role: String(getConfigValue('userRole', '')),
      root_token: rootToken,
      workspace_rel: String(getConfigValue('workspaceRelPath', '')),
      toolbox_rel: String(getConfigValue('toolboxRelPath', '')),
      toolbox,
    }),
  });
  let payload = null;
  try {
    payload = await parseJsonResponse(response, '保存课程积木失败');
  } catch (_) {
    payload = null;
  }
  if (!response.ok || !payload?.success) {
    return { success: false, message: payload?.message || `服务返回 ${response.status}` };
  }
  if (payload?.toolbox_path) {
    runtimeConfig.toolboxRelPath = String(payload.toolbox_path);
  }
  return { success: true, message: payload?.message || '课程积木已保存' };
}

function findToolboxFileInZip(zip) {
  const entries = Object.values(zip?.files || {}).filter((entry) => entry && !entry.dir);
  return zip.file('toolbox.json')
    || zip.file('toolbox.toolbox.json')
    || entries.find((entry) => /(?:^|\/)toolbox\.json$/i.test(entry.name))
    || entries.find((entry) => /\.toolbox\.json$/i.test(entry.name));
}

function normalizeImportedToolboxPayload(payload) {
  if (!payload) {
    return null;
  }
  if (Array.isArray(payload)) {
    return { kind: 'categoryToolbox', contents: payload };
  }
  if (typeof payload !== 'object') {
    return null;
  }
  if (payload.kind === 'categoryToolbox' && Array.isArray(payload.contents)) {
    return payload;
  }
  if (payload.toolbox && typeof payload.toolbox === 'object') {
    return normalizeImportedToolboxPayload(payload.toolbox);
  }
  if (payload.data && typeof payload.data === 'object') {
    return normalizeImportedToolboxPayload(payload.data);
  }
  if (Array.isArray(payload.contents)) {
    return { ...payload, kind: 'categoryToolbox' };
  }
  if (Array.isArray(payload.categories)) {
    return { kind: 'categoryToolbox', contents: payload.categories };
  }
  return null;
}

function parseJsonWithBom(text) {
  const clean = String(text || '').replace(/^\uFEFF/, '');
  return JSON.parse(clean);
}

async function importToolboxPack(file) {
  let importedToolbox = null;
  if (file.name.endsWith('.zip')) {
    const zip = await JSZip.loadAsync(file);
    const toolboxFile = findToolboxFileInZip(zip);
    if (!toolboxFile) {
      throw new Error('ZIP 中缺少 toolbox.json 或 *.toolbox.json');
    }
    const raw = await toolboxFile.async('string');
    importedToolbox = parseJsonWithBom(raw);
  } else {
    importedToolbox = parseJsonWithBom(await file.text());
  }
  importedToolbox = normalizeImportedToolboxPayload(importedToolbox);
  if (!importedToolbox) {
    throw new Error('积木包不是可识别的 categoryToolbox 格式');
  }
  const schema = await validateToolboxWithApi(importedToolbox);
  if (!schema.valid) {
    throw new Error(`积木包格式不正确：${schema.errors[0] || '未知错误'}`);
  }
  const safeToolbox = schema.normalized || importedToolbox;
  const currentCourseToolbox = getSourceToolbox();
  state.toolboxVariants.course = mergeToolboxes(currentCourseToolbox, safeToolbox);
  state.toolboxVariants.hasCourseCustom = true;
  state.toolboxVariants.customPackCount = Number(state.toolboxVariants.customPackCount || 0) + 1;
  resetCategoryVisibility(state.toolboxVariants.course);
  if (state.workspace) {
    state.workspace.updateToolbox(getActiveToolbox());
  }
  renderToolboxPacks();
  renderGroupDrawer();
  syncToolboxMeta();
  queueToolboxRowStyling();
  const saved = await persistCourseToolbox(state.toolboxVariants.course);
  if (!saved.success) {
    console.warn('Toolbox pack imported but not persisted:', saved.message);
  }
}

function bindUI() {
  document.getElementById('openWorkspaceBtn')?.addEventListener('click', () => {
    setMoreMenuOpen(false);
    document.getElementById('openWorkspaceInput')?.click();
  });
  document.getElementById('saveWorkspaceBtn')?.addEventListener('click', () => {
    setMoreMenuOpen(false);
    const payload = getWorkspaceExportPayload();
    if (!payload) {
      return;
    }
    downloadTextFile(payload.content, payload.filename);
  });
  document.getElementById('openWorkspaceInput')?.addEventListener('change', async (event) => {
    const file = event?.target?.files?.[0];
    if (!file) {
      return;
    }
    try {
      await openWorkspaceFile(file);
    } catch (error) {
      updateResultView({
        success: false,
        message: `打开文件失败：${error?.message || '未知错误'}`,
        result: { error: String(error || '') },
        artifacts: {},
      });
    } finally {
      event.target.value = '';
    }
  });
  document.getElementById('copyPythonBtn')?.addEventListener('click', async () => {
    setMoreMenuOpen(false);
    await navigator.clipboard.writeText(getPythonRaw());
  });
  document.getElementById('codeDockToggleBtn')?.addEventListener('click', () => setCodePanelVisible(!state.codePanelVisible));
  document.getElementById('controlPanelToggleBtn')?.addEventListener('click', (event) => {
    event.stopPropagation();
    setMoreMenuOpen(false);
    setControlPanelOpen(!state.controlPanelState.open);
  });
  document.getElementById('controlPanel')?.addEventListener('click', (event) => event.stopPropagation());
  document.getElementById('toolbarMoreBtn')?.addEventListener('click', (event) => {
    event.stopPropagation();
    setControlPanelOpen(false);
    setMoreMenuOpen(!state.toolbarOverflowState.menuOpen);
  });
  document.addEventListener('click', () => {
    setMoreMenuOpen(false);
    setControlPanelOpen(false);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      setMoreMenuOpen(false);
      setControlPanelOpen(false);
    }
  });
  window.addEventListener('resize', () => queueBlocklyResize());
  document.getElementById('toolbarMoreMenu')?.addEventListener('click', (event) => event.stopPropagation());
  document.getElementById('blocklyExtendFab')?.addEventListener('click', () => {
    if (!canImportToolboxPacks()) {
      return;
    }
    document.getElementById('addPackInput')?.click();
  });
  document.getElementById('addPackBtn')?.addEventListener('click', () => {
    if (!canImportToolboxPacks()) {
      return;
    }
    document.getElementById('addPackInput')?.click();
  });
  document.getElementById('addPackInput')?.addEventListener('change', async (event) => {
    if (!canImportToolboxPacks()) {
      return;
    }
    const file = event?.target?.files?.[0];
    if (!file) {
      return;
    }
    try {
      await importToolboxPack(file);
    } catch (error) {
      updateResultView({
        success: false,
        message: `导入积木包失败：${error?.message || '未知错误'}`,
        result: { error: String(error || '') },
        artifacts: {},
      });
    } finally {
      event.target.value = '';
    }
  });
  document.getElementById('runXEduHubBtn')?.addEventListener('click', executeXEduHub);
  document.getElementById('downloadPythonBtn')?.addEventListener('click', () => {
    const blob = new Blob([getPythonRaw()], { type: 'text/plain;charset=utf-8' });
    const anchor = document.createElement('a');
    anchor.href = URL.createObjectURL(blob);
    anchor.download = `${getConfigValue('workspaceTitle', 'workspace') || 'workspace'}.py`;
    anchor.click();
    URL.revokeObjectURL(anchor.href);
  });
  document.getElementById('resetWorkspaceBtn')?.addEventListener('click', () => {
    if (!state.workspace || !state.initialSerialized) {
      return;
    }
    loadWorkspaceSnapshot(state.initialSerialized);
  });
}

async function init() {
  ensureRuntimeStyles();
  applyCodeDockWidth(readPersistedCodeDockWidth());
  blocklyDebugLog('Blockly 运行时初始化开始', {
    debugEnabled: BLOCKLY_DEBUG_ENABLED,
    role: String(getConfigValue('userRole', '')),
    toolboxImportEnabled: canImportToolboxPacks(),
  });
  defineXEduHubBlocks(Blockly, pythonGenerator);
  bindUI();
  bindCodeDockResize();
  state.toolboxVariants = await loadToolboxes();
  logDynamicCategorySnapshot(state.toolboxVariants?.course || state.toolboxVariants?.official || {}, 'loadToolboxes');
  resetCategoryVisibility(getSourceToolbox());
  state.sideNavCollapsed = {};
  logDynamicCategorySnapshot(getSourceToolbox(), 'getSourceToolbox');
  state.workspace = Blockly.inject('blocklyDiv', {
    toolbox: getActiveToolbox(),
    renderer: 'zelos',
    media: resolveBlocklyMediaPath(),
    sounds: false,
    rendererOverrides: {
      ADD_START_HATS: true,
      CORNER_RADIUS: 7,
      MEDIUM_PADDING: 7,
      LARGE_PADDING: 13,
      MIN_BLOCK_HEIGHT: 40,
      EMPTY_INLINE_INPUT_HEIGHT: 36,
      FIELD_DROPDOWN_SVG_ARROW: false,
      NOTCH_HEIGHT: 4,
      NOTCH_WIDTH: 14,
      STATEMENT_INPUT_NOTCH_OFFSET: 16,
      JAGGED_TEETH_HEIGHT: 7,
      JAGGED_TEETH_WIDTH: 14,
    },
    theme: scratchLikeTheme,
    zoom: {
      controls: true,
      wheel: true,
      startScale: 0.94,
      maxScale: 2.0,
      minScale: 0.5,
      scaleSpeed: 1.1,
    },
    move: {
      scrollbars: true,
      drag: true,
      wheel: true,
    },
  });
  registerBuiltinToolboxCallbacks(state.workspace);

  const workspaceUrl = String(getConfigValue('workspaceUrl', ''));
  if (workspaceUrl) {
    const workspaceText = await fetchText(workspaceUrl);
    const trimmed = workspaceText.trim();
    let migrationReport = null;
    if (trimmed.startsWith('<xml')) {
      const migrated = migrateXEduHubXmlText(trimmed);
      state.initialSerialized = { kind: 'xml', value: migrated.xmlText };
      migrationReport = migrated.report;
    } else {
      const migrated = migrateXEduHubSerialized(JSON.parse(trimmed));
      state.initialSerialized = { kind: 'json', value: JSON.stringify(migrated.data) };
      migrationReport = migrated.report;
    }
    if (state.initialSerialized.kind === 'xml') {
      const xml = Blockly.utils.xml.textToDom(state.initialSerialized.value);
      Blockly.Xml.domToWorkspace(xml, state.workspace);
    } else {
      Blockly.serialization.workspaces.load(JSON.parse(state.initialSerialized.value), state.workspace);
    }
    if (migrationReport && ((migrationReport.changed || []).length || (migrationReport.failed || []).length)) {
      renderMigrationReport(migrationReport);
      maybeWarnExperimentalWorkspace('已自动迁移并保留实验性任务工作区');
    }
  } else {
    state.initialSerialized = buildDefaultWorkspaceSerialized();
    const xml = Blockly.utils.xml.textToDom(state.initialSerialized.value);
    Blockly.Xml.domToWorkspace(xml, state.workspace);
  }

  state.workspace.addChangeListener(() => updatePython());
  state.workspace.addChangeListener((event) => {
    if (event?.type && String(event.type).toLowerCase().includes('var')) {
      blocklyDebugLog('捕获变量事件', {
        type: event.type,
        varId: event.varId || event.varid || '',
        varName: event.varName || event.varname || '',
        oldName: event.oldName || event.oldname || '',
        newName: event.newName || event.newname || '',
      });
    }
    if (event?.type === 'toolbox_item_select') {
      normalizeSelectedToolboxItem();
      renderCustomSideNav();
      queueToolboxRowStyling();
      queueMicrotask(() => {
        resetToolboxFlyoutScroll();
      });
    }
    alignToolboxFlyout();
    syncWorkspaceTaskContext();
  });

  document.addEventListener('click', (event) => {
    const button = event?.target?.closest?.('.blocklyFlyoutButton');
    if (!button) {
      return;
    }
    const textEl = button.querySelector('.blocklyFlyoutLabelText');
    const rawText = String(button.textContent || '').trim();
    blocklyDebugLog('捕获 flyout 按钮点击事件', {
      text: textEl?.textContent?.trim() || '',
      rawText,
      className: button.className || '',
    });
    if (!isVariableCategorySelected()) {
      return;
    }
    const lastInvokeAt = Number(state.lastFlyoutButtonInvoke?.at || 0);
    const recentlyInvoked = lastInvokeAt > 0 && (Date.now() - lastInvokeAt) < 600;
    if (recentlyInvoked) {
      return;
    }
    const normalized = rawText.toLowerCase();
    let variableType = '';
    if (normalized.includes('string') || normalized.includes('字符串')) {
      variableType = 'String';
    } else if (normalized.includes('number') || normalized.includes('数字')) {
      variableType = 'Number';
    } else if (normalized.includes('colour') || normalized.includes('color') || normalized.includes('颜色')) {
      variableType = 'Colour';
    }
    blocklyDebugWarn('检测到 flyout 点击后未触发 Blockly 按钮回调，启用变量创建兜底', {
      variableType,
      rawText,
      selectedCategory: getSelectedToolboxCategoryMeta(),
      lastFlyoutButtonInvoke: state.lastFlyoutButtonInvoke,
    });
    if (typeof state.createVariableFallback === 'function') {
      state.createVariableFallback(variableType);
    }
  });

  const observer = new MutationObserver(() => queueToolboxRowStyling());
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['class'],
  });

  const workspaceLabel = document.getElementById('workspaceLabel');
  if (workspaceLabel) {
    workspaceLabel.textContent = String(getConfigValue('workspaceTitle', '')) || CLASSROOM_DEFAULTS.workspaceFallbackTitle;
  }
  const workspaceMetaLabel = document.getElementById('workspaceMetaLabel');
  if (workspaceMetaLabel) {
    workspaceMetaLabel.textContent = `${isTeacherMode() ? '教师工作台' : '学生工作台'} · ${CLASSROOM_DEFAULTS.workspaceMetaLabel}`;
  }

  const toolboxImportEnabled = canImportToolboxPacks();
  const packPanel = document.getElementById('toolboxPackPanel');
  const extendFab = document.getElementById('blocklyExtendFab');
  const addPackBtn = document.getElementById('addPackBtn');
  const toolboxLabel = document.getElementById('toolboxLabel');
  configureRoleScopedToolbar();
  if (packPanel) {
    packPanel.style.display = toolboxImportEnabled ? '' : 'none';
    packPanel.classList.toggle('is-readonly', !toolboxImportEnabled);
  }
  if (extendFab) {
    extendFab.style.display = toolboxImportEnabled ? 'inline-flex' : 'none';
    extendFab.disabled = !toolboxImportEnabled;
    extendFab.title = toolboxImportEnabled ? '增加积木包' : '当前账号仅可查看积木包，不能新增';
  }
  if (addPackBtn) {
    addPackBtn.disabled = !toolboxImportEnabled;
    addPackBtn.title = toolboxImportEnabled ? '导入课程积木包' : '当前账号仅可查看积木包，不能新增';
  }
  if (toolboxLabel) {
    toolboxLabel.style.display = 'none';
  }

  renderToolboxPacks();
  renderGroupDrawer();
  syncToolboxMeta();
  setMoreMenuOpen(false);
  setControlPanelOpen(false);
  setCodePanelVisible(CLASSROOM_DEFAULTS.codePanelVisible);
  ensureInitialToolboxSelection();
  renderCustomSideNav();
  queueToolboxRowStyling();

  setResultIdleView();

  const practiceLabel = String(getConfigValue('practiceLabel', ''));
  const practiceKind = String(getConfigValue('practiceKind', ''));
  const practiceUrl = String(getConfigValue('practiceUrl', ''));
  const practiceLaunchUrl = String(getConfigValue('practiceLaunchUrl', ''));
  const practiceBtn = document.getElementById('practiceBtn');
  if (practiceLabel) {
    if (practiceBtn) {
      practiceBtn.style.display = 'inline-flex';
      practiceBtn.href = practiceLaunchUrl || practiceUrl || '#';
      practiceBtn.textContent = `在 Jupyter 打开：${practiceLabel}`;
    }
  }

  updatePython();
  updateTaskContext();
}

init().catch((error) => {
  setPythonCode(`# Blockly 初始化失败\n# ${error.message || '未知错误'}`);
});
