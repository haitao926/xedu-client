import * as Blockly from 'blockly';
import * as libraryBlocks from 'blockly/blocks';
import { pythonGenerator } from 'blockly/python';
import * as ZhHans from 'blockly/msg/zh-hans';
import blocklyColorContract from '../../config/blockly-colors.json';
import cssText from '../styles/blockly-workspace.css?raw';
import {
  CATEGORY_ICON_SVGS,
  DEFAULT_CATEGORY_COLOUR,
  DEFAULT_CATEGORY_ICON_SVG,
  DEFAULT_INPUT_RESOURCE,
  DEFAULT_INPUT_SEQUENCE,
  TASK_FIRST_CATEGORY_META,
  resolveCategoryColour,
} from './blockly/runtime-appearance.js';
import {
  alignDropdownFieldArrows,
  alignToolboxFlyout,
  applyCodeDockWidth,
  bindCodeDockResize,
  buildSideNavModel,
  buildToolboxPackList,
  clampCodeDockWidth,
  configureRoleScopedToolbar,
  ensureInitialToolboxSelection,
  findToolboxItemByName,
  getAllToolboxItems,
  getCategoryIconSvg,
  getSelectedToolboxCategoryMeta,
  getToolboxCategoryName,
  getToolboxItemColour,
  getToolboxRowElement,
  hexToRgba,
  isVariableCategorySelected,
  moveStudentActionsToTopbar,
  normalizeSelectedToolboxItem,
  persistCodeDockWidth,
  queueBlocklyResize,
  queueToolboxRowStyling,
  readPersistedCodeDockWidth,
  renderCustomSideNav,
  renderGroupDrawer,
  renderToolboxPacks,
  resetCategoryVisibility,
  resetToolboxFlyoutScroll,
  selectToolboxItem,
  setCodePanelVisible,
  setControlPanelOpen,
  setMoreMenuOpen,
  styleToolboxCategoryRows,
  syncCategoryVisuals,
} from './blockly/runtime-toolbox-ui.js';
import {
  buildExperimentalTaskPreflight,
  buildPreflightError,
  deriveTaskContext,
  getResultHint,
  maybeWarnExperimentalWorkspace,
  normalizePythonRunPayload,
  renderMigrationReport,
  renderResultTerminal,
  syncWorkspaceTaskContext,
  updateResultView,
  updateTaskContext,
  validateRunnableSpec,
} from './blockly/runtime-results.js';
import { bindUIRuntime } from './blockly/runtime-bindings.js';
import { registerBuiltinToolboxCallbacks as registerBuiltinToolboxCallbacksImpl } from './blockly/runtime-callbacks.js';
import {
  findToolboxFileInZip,
  importToolboxPack as importToolboxPackImpl,
  normalizeImportedToolboxPayload,
  parseJsonWithBom,
  persistCourseToolbox as persistCourseToolboxImpl,
} from './blockly/runtime-toolbox-import.js';
import {
  buildGenericPythonPreflightError as buildGenericPythonPreflightErrorImpl,
  collectWorkspaceTasks as collectWorkspaceTasksImpl,
  executeXEduHubFlow,
  extractXEduHubSpec as extractXEduHubSpecImpl,
  getBlockVariableName as getBlockVariableNameImpl,
  getWorkspaceVariableNameById as getWorkspaceVariableNameByIdImpl,
  hasExecutablePython as hasExecutablePythonImpl,
  hasRunnableFlow as hasRunnableFlowImpl,
  hasRuntimeBoundInputSpec as hasRuntimeBoundInputSpecImpl,
  isStreamLikeInputSpec as isStreamLikeInputSpecImpl,
  loadToolboxes as loadToolboxesImpl,
  validateWorkspaceBindings as validateWorkspaceBindingsImpl,
} from './blockly/runtime-execution.js';
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

function setControlPanelOpenLocal(open) {
  return setControlPanelOpen(open, state, document);
}

function setMoreMenuOpenLocal(open) {
  return setMoreMenuOpen(open, state, CLASSROOM_DEFAULTS, document);
}

function moveStudentActionsToTopbarLocal() {
  return moveStudentActionsToTopbar(isTeacherMode, STUDENT_QUICK_ACTION_IDS, document);
}

function configureRoleScopedToolbarLocal() {
  return configureRoleScopedToolbar({
    isTeacherMode,
    setControlPanelOpen: setControlPanelOpenLocal,
    moveStudentActionsToTopbar: moveStudentActionsToTopbarLocal,
    documentRef: document,
  });
}

function clampCodeDockWidthLocal(width) {
  return clampCodeDockWidth(width, CODE_DOCK_WIDTH_FALLBACK, CODE_DOCK_WIDTH_MIN, CODE_DOCK_WIDTH_MAX);
}

function readPersistedCodeDockWidthLocal() {
  return readPersistedCodeDockWidth(CODE_DOCK_WIDTH_STORAGE_KEY, clampCodeDockWidthLocal, CODE_DOCK_WIDTH_FALLBACK);
}

function persistCodeDockWidthLocal(width) {
  return persistCodeDockWidth(width, CODE_DOCK_WIDTH_STORAGE_KEY, clampCodeDockWidthLocal);
}

function applyCodeDockWidthLocal(width, options = {}) {
  return applyCodeDockWidth(width, state, options, {
    clampWidth: clampCodeDockWidthLocal,
    documentRef: document,
    minWidth: CODE_DOCK_WIDTH_MIN,
    maxWidth: CODE_DOCK_WIDTH_MAX,
    persistWidth: persistCodeDockWidthLocal,
  });
}

function queueBlocklyResizeLocal() {
  return queueBlocklyResize(state, Blockly, document);
}

function getAllToolboxItemsLocal() {
  return getAllToolboxItems(state);
}

function getSelectedToolboxCategoryMetaLocal() {
  return getSelectedToolboxCategoryMeta(state);
}

function isVariableCategorySelectedLocal() {
  return isVariableCategorySelected(state);
}

function syncCategoryVisualsLocal(container, name, color, selected = false) {
  return syncCategoryVisuals(container, name, color, selected, {
    getCategoryIconSvg: (categoryName) => getCategoryIconSvg(categoryName, CATEGORY_ICON_SVGS, DEFAULT_CATEGORY_ICON_SVG),
  });
}

function styleToolboxCategoryRowsLocal() {
  return styleToolboxCategoryRows(state, {
    getAllItems: getAllToolboxItemsLocal,
    documentRef: document,
    syncCategoryVisuals: syncCategoryVisualsLocal,
    getRow: getToolboxRowElement,
    getName: getToolboxCategoryName,
    hexToRgba,
  });
}

function alignToolboxFlyoutLocal() {
  return alignToolboxFlyout(document);
}

function resetToolboxFlyoutScrollLocal() {
  return resetToolboxFlyoutScroll(state, document);
}

function queueToolboxRowStylingLocal() {
  return queueToolboxRowStyling({
    styleRows: styleToolboxCategoryRowsLocal,
    alignFlyout: alignToolboxFlyoutLocal,
    alignDropdown: alignDropdownFieldArrows,
  });
}

function renderToolboxPacksLocal() {
  return renderToolboxPacks(state, document);
}

function getToolboxItemColourLocal(item, fallbackName = '') {
  return getToolboxItemColour(item, fallbackName, state, resolveCategoryColour, DEFAULT_CATEGORY_COLOUR);
}

function selectToolboxItemLocal(item) {
  return selectToolboxItem(item, state, resetToolboxFlyoutScrollLocal);
}

function buildSideNavModelLocal() {
  return buildSideNavModel(state, {
    getAllItems: getAllToolboxItemsLocal,
    getName: getToolboxCategoryName,
    getSourceToolbox,
    resolveCategoryColour,
    defaultCategoryColour: DEFAULT_CATEGORY_COLOUR,
    getItemColour: getToolboxItemColourLocal,
  });
}

function renderCustomSideNavLocal() {
  const result = renderCustomSideNav(state, {
    documentRef: document,
    buildSideNavModel: buildSideNavModelLocal,
    findItemByName: (name) => findToolboxItemByName(state, getToolboxCategoryName, name),
    getSelectedMeta: getSelectedToolboxCategoryMetaLocal,
    getTaskRegistry: getXEduHubTaskRegistry,
    getCategoryIconSvg: (categoryName) => getCategoryIconSvg(categoryName, CATEGORY_ICON_SVGS, DEFAULT_CATEGORY_ICON_SVG),
    renderCustomSideNav: renderCustomSideNavLocal,
    setResultWarningView,
    buildExperimentalTaskPreflight,
    selectToolboxItem: selectToolboxItemLocal,
  });
  blocklyDebugLog('侧栏渲染完成', {
    sections: buildSideNavModelLocal().map((section) => ({
      name: section.name,
      childNames: (section.children || []).map((child) => child.name),
      hasLiveItem: Boolean(section.item),
    })),
    sideNavChildren: document.getElementById('blocklySideNavBody')?.children?.length || 0,
  });
  return result;
}

function ensureSideNavRendered(attempt = 0) {
  const root = document.getElementById('blocklySideNavBody');
  if (!root) {
    return;
  }
  if (root.children.length > 0) {
    return;
  }
  const sections = buildSideNavModelLocal();
  if (sections.length === 0) {
    return;
  }
  renderCustomSideNavLocal();
  if (root.children.length > 0) {
    return;
  }
  if (attempt >= 8) {
    return;
  }
  window.setTimeout(() => {
    ensureSideNavRendered(attempt + 1);
  }, 120);
}

function normalizeSelectedToolboxItemLocal() {
  return normalizeSelectedToolboxItem(state);
}

function ensureInitialToolboxSelectionLocal() {
  return ensureInitialToolboxSelection(state);
}

function renderGroupDrawerLocal() {
  return renderGroupDrawer({
    documentRef: document,
    state,
    getSourceToolbox,
    collectCategoryNames,
    resolveCategoryColour,
    getCategoryIconSvg: (categoryName) => getCategoryIconSvg(categoryName, CATEGORY_ICON_SVGS, DEFAULT_CATEGORY_ICON_SVG),
    getActiveToolbox,
    queueToolboxRowStyling: queueToolboxRowStylingLocal,
  });
}

function resetCategoryVisibilityLocal(toolbox) {
  return resetCategoryVisibility(toolbox, state, walkToolboxItems, resolveCategoryColour, DEFAULT_CATEGORY_COLOUR);
}

function bindCodeDockResizeLocal() {
  return bindCodeDockResize(state, {
    documentRef: document,
    applyWidth: applyCodeDockWidthLocal,
    queueResize: queueBlocklyResizeLocal,
    persistWidth: persistCodeDockWidthLocal,
  });
}

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

function renderResultTerminalLocal(text) {
  return renderResultTerminal(text, document);
}

function getResultHintLocal(payload) {
  return getResultHint(payload);
}

function deriveTaskContextLocal() {
  return deriveTaskContext(state, {
    getConfigValue,
    classroomDefaults: CLASSROOM_DEFAULTS,
    getResultHint: getResultHintLocal,
    extractXEduHubSpec,
    getTaskById,
    isTeacherMode,
    hasRunnableFlow,
  });
}

function updateTaskContextLocal() {
  return updateTaskContext(state, {
    deriveTaskContext: deriveTaskContextLocal,
  }, document);
}

function buildPreflightErrorLocal(code, message, hint) {
  return buildPreflightError(code, message, hint);
}

function renderMigrationReportLocal(report) {
  return renderMigrationReport(state, report, {
    setResultMode,
    setResultBadge,
    renderResultTerminal: renderResultTerminalLocal,
    resetDebugDetails,
    updateTaskContext: updateTaskContextLocal,
    blocklyDebugLog,
  });
}

function buildExperimentalTaskPreflightLocal(tasks, options = {}) {
  return buildExperimentalTaskPreflight(tasks, options);
}

function maybeWarnExperimentalWorkspaceLocal(reason = '已加载包含实验性任务的工作区') {
  return maybeWarnExperimentalWorkspace(state, reason, {
    collectWorkspaceTasks,
    buildExperimentalTaskPreflight: buildExperimentalTaskPreflightLocal,
    setResultWarningView,
  });
}

function syncWorkspaceTaskContextLocal() {
  return syncWorkspaceTaskContext(state, {
    updateTaskContext: updateTaskContextLocal,
    extractXEduHubSpec,
    classroomDefaults: CLASSROOM_DEFAULTS,
    renderResultTerminal: renderResultTerminalLocal,
  });
}

function validateRunnableSpecLocal(spec) {
  return validateRunnableSpec(spec, {
    hasRunnableFlow,
  });
}

function updateResultViewLocal(payload) {
  return updateResultView(state, payload, {
    collectXEduHubPresentationActionsFromBlocks,
    setResultMode,
    setResultBadge,
    closeResultImageDialog,
    renderResultTerminal: renderResultTerminalLocal,
    buildTerminalOutput,
    getPayloadPreviewImage,
    isDisplayableImageSource,
    openResultImageDialog,
    resetDebugDetails,
    updateTaskContext: updateTaskContextLocal,
  });
}

function normalizePythonRunPayloadLocal(payload) {
  return normalizePythonRunPayload(payload);
}

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

const BASIC_PROGRAM_CATEGORY_NAMES = new Set(['逻辑', '循环', '数学', '文本', '列表', '变量', '函数']);
const ADVANCED_CATEGORY_NAMES = new Set(['图像与视频', '图像视频', '通信控制', '行空板K10', 'K10', '进阶调试', '底层与调试', '扩展包']);

function ensureRuntimeStyles() {
  if (document.getElementById('xedu-blockly-runtime-style')) {
    document.body.classList.add('xedu-blockly-runtime');
    return;
  }
  const style = document.createElement('style');
  style.id = 'xedu-blockly-runtime-style';
  style.textContent = cssText;
  document.head.appendChild(style);
  document.body.classList.add('xedu-blockly-runtime');
}

function revealRuntimeShell() {
  document.body.classList.remove('xedu-blockly-runtime-pending');
  document.body.classList.add('xedu-blockly-runtime-ready');
  window.setTimeout(() => {
    document.querySelector('.xedu-blockly-boot')?.remove();
  }, 220);
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
    weight: '760',
    size: 12,
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
  const k10Category = categoryMap.get('行空板K10') || categoryMap.get('K10');
  const showDebugToolbox = Boolean(getConfigValue('showDebugToolbox', false));

  if (xeduCategory && mediaCategory) {
    const topLevelContents = [
      clone(categoryMap.get('基础编程')),
      clone(xeduCategory),
      clone(mediaCategory),
      ...(k10Category ? [clone(k10Category)] : []),
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
  if (k10Category) {
    contents.push(clone(k10Category));
  }
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

  if (k10Category) {
    contents.push(clone(k10Category));
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

function switchToolboxMode(mode) {
  void mode;
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
      const payload = parseJson();
      if (!response?.ok && payload && typeof payload === 'object') {
        return payload;
      }
      return payload;
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
  const finalResult = payload?.result?.output;
  if (finalResult !== undefined && finalResult !== null && finalResult !== '') {
    if (lines.length > 0) {
      lines.push('');
    }
    appendTerminalSection(lines, '最终结果:', summarizeTerminalObject(finalResult));
  } else if (!stdout && output !== undefined && output !== null && output !== '') {
    if (lines.length > 0) {
      lines.push('');
    }
    appendTerminalSection(lines, '运行结果:', summarizeTerminalObject(output));
  }
  const runtimeMode = String(payload?.result?.runtime_mode || '').trim();
  const truthfulness = String(payload?.result?.result_truthfulness || '').trim();
  const checkpoint = String(payload?.result?.checkpoint || '').trim();
  const inputPath = String(payload?.result?.input || '').trim();
  const runtimeMetaLines = [];
  if (runtimeMode) {
    runtimeMetaLines.push(`运行模式: ${runtimeMode === 'real' ? '真实推理' : runtimeMode === 'fallback' ? '兼容演示' : runtimeMode}`);
  }
  if (truthfulness) {
    runtimeMetaLines.push(`结果性质: ${truthfulness === 'verified' ? '真实结果' : truthfulness === 'demo_only' ? '演示结果' : truthfulness}`);
  }
  if (checkpoint) {
    const checkpointName = checkpoint.split(/[\\/]/).filter(Boolean).pop() || checkpoint;
    runtimeMetaLines.push(`模型文件: ${checkpointName}`);
  }
  if (inputPath) {
    const inputName = inputPath.split(/[\\/]/).filter(Boolean).pop() || inputPath;
    runtimeMetaLines.push(`输入图片: ${inputName}`);
  }
  if (runtimeMetaLines.length > 0) {
    if (lines.length > 0) {
      lines.push('');
    }
    lines.push(...runtimeMetaLines);
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
  ensureSideNavRendered();
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
  updateTaskContextLocal();
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
    renderMigrationReportLocal(migrationReport);
    maybeWarnExperimentalWorkspaceLocal('已打开并自动迁移实验性任务工作区');
  } else {
    updateResultViewLocal({
      success: true,
      message: `已打开文件：${file.name}`,
      result: { stdout: '', stderr: '', return_code: 0 },
      artifacts: {},
    });
    maybeWarnExperimentalWorkspaceLocal('已打开包含实验性任务的工作区');
  }
  updateTaskContextLocal();
}

function hasExecutablePython() {
  return hasExecutablePythonImpl(getPythonRaw);
}

function buildGenericPythonPreflightError() {
  return buildGenericPythonPreflightErrorImpl(buildPreflightErrorLocal);
}

async function loadToolboxes() {
  return loadToolboxesImpl(getConfigValue, fetchText, validateToolboxWithApi, mergeToolboxes, normalizeCategoryMeta);
}

function extractXEduHubSpec() {
  return extractXEduHubSpecImpl(state, {
    collectXEduHubSpecFromBlocks,
    getParamFieldName,
    getTaskById,
    getTaskIdFromRunBlockType,
    isSemanticRunBlockType, 
    getConfigValue,
    resolveLegacyTaskId,
  });
}

function collectWorkspaceTasks() {
  return collectWorkspaceTasksImpl(state, {
    collectXEduHubTasksFromBlocks,
    getTaskById,
    getTaskIdFromRunBlockType,
    isSemanticRunBlockType,
    resolveLegacyTaskId,
  });
}

function hasRunnableFlow() {
  return hasRunnableFlowImpl(state, {
    hasRunnableFlowInBlocks,
    isSemanticRunBlockType,
    runnableBlockTypes: RUNNABLE_BLOCK_TYPES,
  });
}

function hasRuntimeBoundInputSpec(spec) {
  return hasRuntimeBoundInputSpecImpl(spec);
}

function isStreamLikeInputSpec(spec) {
  return isStreamLikeInputSpecImpl(spec, { getTaskById });
}

function getWorkspaceVariableNameById(variableId) {
  return getWorkspaceVariableNameByIdImpl(state, lookupWorkspaceVariableName, variableId);
}

function getBlockVariableName(block, fieldName) {
  return getBlockVariableNameImpl(getRuntimeBlockVariableName, getWorkspaceVariableNameById, block, fieldName);
}

function validateWorkspaceBindings() {
  return validateWorkspaceBindingsImpl(state, {
    validateWorkspaceBindingsForBlocks,
    buildPreflightError: buildPreflightErrorLocal,
    lookupVariableName: getWorkspaceVariableNameById,
  });
}

async function executeXEduHub() {
  return executeXEduHubFlow(state, {
    documentRef: document,
    setResultRunningView,
    hasExecutablePython,
    buildGenericPythonPreflightError,
    updateResultView: updateResultViewLocal,
    validateWorkspaceBindings,
    hasRunnableFlow,
    extractXEduHubSpec,
    collectWorkspaceTasks,
    validateRunnableSpec: validateRunnableSpecLocal,
    buildExperimentalTaskPreflight: buildExperimentalTaskPreflightLocal,
    isTeacherMode,
    setResultWarningView,
    hasRuntimeBoundInputSpec,
    isStreamLikeInputSpec,
    getConfigValue,
    getPythonRaw,
    parseJsonResponse,
    normalizePythonRunPayload,
  });
}

function registerBuiltinToolboxCallbacks(workspace) {
  return registerBuiltinToolboxCallbacksImpl(workspace, {
    Blockly,
    state,
    blocklyDebugLog,
    blocklyDebugWarn,
    requestVariableName,
  });
}

async function persistCourseToolbox(toolbox) {
  return persistCourseToolboxImpl(toolbox, {
    getConfigValue,
    parseJsonResponse,
    setToolboxRelPath: (value) => {
      runtimeConfig.toolboxRelPath = value;
    },
  });
}

async function importToolboxPack(file) {
  return importToolboxPackImpl(file, {
    JSZipLoader: async () => (await import('jszip')).default,
    validateToolboxWithApi,
    getSourceToolbox,
    mergeToolboxes,
    state,
    resetCategoryVisibility: resetCategoryVisibilityLocal,
    getActiveToolbox,
    renderToolboxPacks: renderToolboxPacksLocal,
    renderGroupDrawer: renderGroupDrawerLocal,
    syncToolboxMeta,
    queueToolboxRowStyling: queueToolboxRowStylingLocal,
    persistCourseToolbox,
  });
}

function bindUI() {
  return bindUIRuntime({
    documentRef: document,
    navigatorRef: navigator,
    setMoreMenuOpen: setMoreMenuOpenLocal,
    setControlPanelOpen: setControlPanelOpenLocal,
    getWorkspaceExportPayload,
    downloadTextFile,
    openWorkspaceFile,
    updateResultView: updateResultViewLocal,
    getPythonRaw,
    importToolboxPack,
    canImportToolboxPacks,
    setCodePanelVisible: (visible) => setCodePanelVisible(visible, state, queueBlocklyResizeLocal, document),
    state,
    queueBlocklyResize: queueBlocklyResizeLocal,
    executeXEduHub,
    getConfigValue,
    loadWorkspaceSnapshot,
  });
}

async function init() {
  ensureRuntimeStyles();
  applyCodeDockWidthLocal(readPersistedCodeDockWidthLocal());
  blocklyDebugLog('Blockly 运行时初始化开始', {
    debugEnabled: BLOCKLY_DEBUG_ENABLED,
    role: String(getConfigValue('userRole', '')),
    toolboxImportEnabled: canImportToolboxPacks(),
  });
  defineXEduHubBlocks(Blockly, pythonGenerator);
  bindUI();
  bindCodeDockResizeLocal();
  state.toolboxVariants = await loadToolboxes();
  logDynamicCategorySnapshot(state.toolboxVariants?.course || state.toolboxVariants?.official || {}, 'loadToolboxes');
  resetCategoryVisibilityLocal(getSourceToolbox());
  state.sideNavCollapsed = {};
  logDynamicCategorySnapshot(getSourceToolbox(), 'getSourceToolbox');
  state.workspace = Blockly.inject('blocklyDiv', {
    toolbox: getActiveToolbox(),
    renderer: 'zelos',
    media: resolveBlocklyMediaPath(),
    sounds: false,
    rendererOverrides: {
      ADD_START_HATS: true,
      CORNER_RADIUS: 9,
      MEDIUM_PADDING: 8,
      LARGE_PADDING: 14,
      MIN_BLOCK_HEIGHT: 42,
      EMPTY_INLINE_INPUT_HEIGHT: 38,
      FIELD_DROPDOWN_SVG_ARROW: false,
      NOTCH_HEIGHT: 4,
      NOTCH_WIDTH: 15,
      STATEMENT_INPUT_NOTCH_OFFSET: 18,
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
      renderMigrationReportLocal(migrationReport);
      maybeWarnExperimentalWorkspaceLocal('已自动迁移并保留实验性任务工作区');
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
      normalizeSelectedToolboxItemLocal();
      renderCustomSideNavLocal();
      queueToolboxRowStylingLocal();
      queueMicrotask(() => {
        resetToolboxFlyoutScrollLocal();
      });
    }
    alignToolboxFlyoutLocal();
    syncWorkspaceTaskContextLocal();
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
    if (!isVariableCategorySelectedLocal()) {
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
      selectedCategory: getSelectedToolboxCategoryMetaLocal(),
      lastFlyoutButtonInvoke: state.lastFlyoutButtonInvoke,
    });
    if (typeof state.createVariableFallback === 'function') {
      state.createVariableFallback(variableType);
    }
  });

  const observer = new MutationObserver(() => queueToolboxRowStylingLocal());
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
  configureRoleScopedToolbarLocal();
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

  renderToolboxPacksLocal();
  renderGroupDrawerLocal();
  syncToolboxMeta();
  setMoreMenuOpenLocal(false);
  setControlPanelOpenLocal(false);
  setCodePanelVisible(CLASSROOM_DEFAULTS.codePanelVisible, state, queueBlocklyResizeLocal, document);
  ensureInitialToolboxSelectionLocal();
  renderCustomSideNavLocal();
  ensureSideNavRendered();
  queueToolboxRowStylingLocal();

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
  updateTaskContextLocal();
  revealRuntimeShell();
}

init().catch((error) => {
  ensureRuntimeStyles();
  setPythonCode(`# Blockly 初始化失败\n# ${error.message || '未知错误'}`);
  revealRuntimeShell();
});
