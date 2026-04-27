import * as Blockly from 'blockly/core';
import * as libraryBlocks from 'blockly/blocks';
import { pythonGenerator } from 'blockly/python';
import * as ZhHans from 'blockly/msg/zh-hans';
import JSZip from 'jszip';
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
});

const STUDENT_QUICK_ACTION_IDS = Object.freeze([
  'openWorkspaceBtn',
  'saveWorkspaceBtn',
  'copyPythonBtn',
  'downloadPythonBtn',
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
  codePanelResizeTimer: null,
  toolboxSelectionSyncing: false,
  sideNavCollapsed: {},
};

const CATEGORY_ICON_SVGS = {
  基础编程: '<svg viewBox="0 0 18 18" fill="none" aria-hidden="true"><rect x="2.5" y="2.5" width="5.2" height="5.2" rx="1.5" stroke="currentColor" stroke-width="1.6"/><rect x="10.3" y="2.5" width="5.2" height="5.2" rx="1.5" stroke="currentColor" stroke-width="1.6"/><rect x="6.4" y="10.3" width="5.2" height="5.2" rx="1.5" stroke="currentColor" stroke-width="1.6"/><path d="M7.7 5.1h2.6M9 7.7v2.6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
  XEdu: '<svg viewBox="0 0 18 18" fill="none" aria-hidden="true"><path d="M9 2.6 13.8 5v5.2L9 12.6 4.2 10.2V5L9 2.6Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="m9 5.5.9 1.8 2 .3-1.5 1.4.4 1.9L9 10l-1.8.9.4-1.9L6 7.6l2-.3L9 5.5Z" fill="currentColor" opacity=".18" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>',
  'XEdu Hub': '<svg viewBox="0 0 18 18" fill="none" aria-hidden="true"><path d="M9 2.6 13.8 5v5.2L9 12.6 4.2 10.2V5L9 2.6Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="m9 5.5.9 1.8 2 .3-1.5 1.4.4 1.9L9 10l-1.8.9.4-1.9L6 7.6l2-.3L9 5.5Z" fill="currentColor" opacity=".18" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>',
  '媒体与设备': '<svg viewBox="0 0 18 18" fill="none" aria-hidden="true"><path d="M3.4 8.7a5.6 5.6 0 0 1 11.2 0" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M6.2 8.9v2.6M11.8 8.9v2.6M9 2.9v2.3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><rect x="5.5" y="11.2" width="7" height="3.2" rx="1.4" stroke="currentColor" stroke-width="1.5"/></svg>',
  '调试与扩展': '<svg viewBox="0 0 18 18" fill="none" aria-hidden="true"><path d="M9 3.7 4.8 6.1v5.6L9 14l4.2-2.3V6.1L9 3.7Z" fill="currentColor" opacity=".1"/><path d="m6.9 9.4 1.3 1.3 3-3.2M9 3.7 4.8 6.1v5.6L9 14l4.2-2.3V6.1L9 3.7Z" stroke="currentColor" stroke-width="1.45" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  扩展工具: '<svg viewBox="0 0 18 18" fill="none" aria-hidden="true"><path d="M3.4 8.7a5.6 5.6 0 0 1 11.2 0" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M6.2 8.9v2.6M11.8 8.9v2.6M9 2.9v2.3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><rect x="5.5" y="11.2" width="7" height="3.2" rx="1.4" stroke="currentColor" stroke-width="1.5"/></svg>',
  逻辑: '<svg viewBox="0 0 18 18" fill="none" aria-hidden="true"><path d="M9 2.8 13.3 6 9 9.2 4.7 6 9 2.8Z" fill="currentColor" opacity=".18"/><path d="M9 9.4v2.2m0 0H6.8m2.2 0h2.2" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round"/><rect x="3.2" y="11.4" width="4.1" height="3.2" rx="1.2" fill="currentColor" opacity=".12"/><rect x="10.7" y="11.4" width="4.1" height="3.2" rx="1.2" fill="currentColor" opacity=".12"/></svg>',
  循环: '<svg viewBox="0 0 18 18" fill="none" aria-hidden="true"><path d="M6 4.8H3.8v2.2M12 13.2h2.2V11" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M4.1 6.1A4.8 4.8 0 0 1 13 4.8M13.9 11.9A4.8 4.8 0 0 1 5 13.2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><circle cx="9" cy="9" r="1.1" fill="currentColor"/></svg>',
  数学: '<svg viewBox="0 0 18 18" fill="none" aria-hidden="true"><rect x="3.1" y="3.1" width="11.8" height="11.8" rx="3.1" fill="currentColor" opacity=".12"/><path d="M6.2 7.1h3.2m-1.6-1.6v3.2m-.9 4h3.4m1.5-5.1 2.1 2.1m0-2.1-2.1 2.1" stroke="currentColor" stroke-width="1.45" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  文本: '<svg viewBox="0 0 18 18" fill="none" aria-hidden="true"><rect x="3.3" y="3.3" width="11.4" height="11.4" rx="2.8" stroke="currentColor" opacity=".28"/><path d="M5.8 6.2h6.4M9 6.2v5.8M7 12h4" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  列表: '<svg viewBox="0 0 18 18" fill="none" aria-hidden="true"><rect x="3.1" y="3.4" width="11.8" height="11.2" rx="2.8" fill="currentColor" opacity=".11"/><circle cx="5.8" cy="6.4" r=".8" fill="currentColor"/><circle cx="5.8" cy="9" r=".8" fill="currentColor"/><circle cx="5.8" cy="11.6" r=".8" fill="currentColor"/><path d="M8.1 6.4h4.4M8.1 9h5M8.1 11.6h3.6" stroke="currentColor" stroke-width="1.45" stroke-linecap="round"/></svg>',
  变量: '<svg viewBox="0 0 18 18" fill="none" aria-hidden="true"><path d="M9 2.8 13.5 5.2v4.9L9 12.6 4.5 10.1V5.2L9 2.8Z" fill="currentColor" opacity=".14"/><path d="M9 2.8 13.5 5.2v4.9L9 12.6 4.5 10.1V5.2L9 2.8Zm0 3.1v3.7m-1.8-1.9h3.6" stroke="currentColor" stroke-width="1.45" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  函数: '<svg viewBox="0 0 18 18" fill="none" aria-hidden="true"><path d="M6.6 4.6c-1.5 1.2-1.5 7.6 0 8.8M11.4 4.6c1.5 1.2 1.5 7.6 0 8.8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M7.8 11.1c.6-1.8 1.8-3.1 3.4-4m-3 1.2h3.7" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  图像分类: '<svg viewBox="0 0 18 18" fill="none" aria-hidden="true"><rect x="3.2" y="3.2" width="11.6" height="11.6" rx="2.8" fill="currentColor" opacity=".12"/><path d="M5.8 11.8 8 9.6l1.8 1.7 2.5-2.8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="6.8" cy="6.6" r="1" fill="currentColor"/></svg>',
  目标检测: '<svg viewBox="0 0 18 18" fill="none" aria-hidden="true"><rect x="3.8" y="3.8" width="10.4" height="10.4" rx="2.4" stroke="currentColor" stroke-width="1.4" opacity=".36"/><rect x="6.2" y="6.2" width="5.6" height="5.6" rx="1.4" stroke="currentColor" stroke-width="1.5"/><path d="M9 2.8v1.8M9 13.4v1.8M2.8 9h1.8M13.4 9h1.8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
  关键点识别: '<svg viewBox="0 0 18 18" fill="none" aria-hidden="true"><circle cx="9" cy="5.3" r="1.1" fill="currentColor"/><circle cx="6" cy="8.3" r="1" fill="currentColor" opacity=".88"/><circle cx="12" cy="8.3" r="1" fill="currentColor" opacity=".88"/><circle cx="7" cy="12.3" r=".9" fill="currentColor" opacity=".78"/><circle cx="11" cy="12.3" r=".9" fill="currentColor" opacity=".78"/><path d="M9 6.5v3.4M9 7.5 7 8.3M9 7.5l2 .8M9 9.9l-1.5 1.6M9 9.9l1.5 1.6" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  OCR: '<svg viewBox="0 0 18 18" fill="none" aria-hidden="true"><rect x="3.4" y="3.4" width="11.2" height="11.2" rx="2.8" stroke="currentColor" opacity=".3"/><path d="M5.8 6.3h6.4M5.8 8.9h4.7M5.8 11.5h6.4" stroke="currentColor" stroke-width="1.45" stroke-linecap="round"/><path d="M11.8 13.2h2.1" stroke="currentColor" stroke-width="1.45" stroke-linecap="round"/></svg>',
  内容生成: '<svg viewBox="0 0 18 18" fill="none" aria-hidden="true"><path d="M9 3.3 10.3 6l3 .3-2.2 1.9.7 3-2.8-1.5-2.8 1.5.7-3-2.2-1.9 3-.3L9 3.3Z" fill="currentColor" opacity=".14"/><path d="M9 5.3v2.4m0 0 1.7 1M9 7.7l-1.7 1" stroke="currentColor" stroke-width="1.45" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  图像分割: '<svg viewBox="0 0 18 18" fill="none" aria-hidden="true"><rect x="3.6" y="3.8" width="10.8" height="10.4" rx="2.4" fill="currentColor" opacity=".1"/><path d="M6 6.5c1.2.1 2.1 1 2.3 2.2.1 1-.4 1.9-1.2 2.5m4.9-4.7c-1.2.1-2.1 1-2.3 2.2-.1 1 .4 1.9 1.2 2.5" stroke="currentColor" stroke-width="1.45" stroke-linecap="round"/></svg>',
  深度估计: '<svg viewBox="0 0 18 18" fill="none" aria-hidden="true"><path d="M4.5 5.8 9 3.4l4.5 2.4v5.6L9 14 4.5 11.4V5.8Z" fill="currentColor" opacity=".12"/><path d="M9 3.4V14M4.5 5.8 9 8.4l4.5-2.6" stroke="currentColor" stroke-width="1.45" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  图像视频: '<svg viewBox="0 0 18 18" fill="none" aria-hidden="true"><rect x="3.6" y="5" width="8.6" height="6.6" rx="1.6" fill="currentColor" opacity=".12"/><path d="M12.2 7.2 14.5 6v4.2l-2.3-1.2" stroke="currentColor" stroke-width="1.45" stroke-linecap="round" stroke-linejoin="round"/><circle cx="7.7" cy="8.3" r="1.4" stroke="currentColor" stroke-width="1.3"/><path d="M5.1 13.7h7.8" stroke="currentColor" stroke-width="1.45" stroke-linecap="round"/></svg>',
  通信控制: '<svg viewBox="0 0 18 18" fill="none" aria-hidden="true"><rect x="3.6" y="3.8" width="8.2" height="10.4" rx="2.2" fill="currentColor" opacity=".12"/><path d="M6.1 6.7h3.5M6.1 9h3.5M6.1 11.3h2.4M12.4 7h2M13.4 6v2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><circle cx="13.6" cy="11.8" r="1.5" stroke="currentColor" stroke-width="1.35"/></svg>',
  核心语法: '<svg viewBox="0 0 18 18" fill="none" aria-hidden="true"><path d="M4.2 5.1h4.1v2.6H4.2zm5.5 2.8h4.1v2.6H9.7zM6.3 10.9h4.1v2.6H6.3z" fill="currentColor" opacity=".16"/><path d="M8.3 6.4h1.1c.7 0 1.3.6 1.3 1.3v.2M8.4 12.2h-.8c-.7 0-1.3-.6-1.3-1.3v-.1M10.8 10.7v.2c0 .7-.6 1.3-1.3 1.3H9" stroke="currentColor" stroke-width="1.35" stroke-linecap="round"/></svg>',
  结果处理: '<svg viewBox="0 0 18 18" fill="none" aria-hidden="true"><rect x="3.2" y="3.2" width="11.6" height="11.6" rx="2.8" fill="currentColor" opacity=".12"/><path d="M5.8 11.8 8 9.6l1.8 1.7 2.5-2.8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="6.8" cy="6.6" r="1" fill="currentColor"/></svg>',
  调试扩展: '<svg viewBox="0 0 18 18" fill="none" aria-hidden="true"><path d="M9 3.7 4.8 6.1v5.6L9 14l4.2-2.3V6.1L9 3.7Z" fill="currentColor" opacity=".1"/><path d="m6.9 9.4 1.3 1.3 3-3.2M9 3.7 4.8 6.1v5.6L9 14l4.2-2.3V6.1L9 3.7Z" stroke="currentColor" stroke-width="1.45" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  进阶调试: '<svg viewBox="0 0 18 18" fill="none" aria-hidden="true"><path d="M9 3.7 4.8 6.1v5.6L9 14l4.2-2.3V6.1L9 3.7Z" fill="currentColor" opacity=".1"/><path d="m6.9 9.4 1.3 1.3 3-3.2M9 3.7 4.8 6.1v5.6L9 14l4.2-2.3V6.1L9 3.7Z" stroke="currentColor" stroke-width="1.45" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  AI流程: '<svg viewBox="0 0 18 18" fill="none" aria-hidden="true"><path d="M4.2 5.1h4.1v2.6H4.2zm5.5 2.8h4.1v2.6H9.7zM6.3 10.9h4.1v2.6H6.3z" fill="currentColor" opacity=".16"/><path d="M8.3 6.4h1.1c.7 0 1.3.6 1.3 1.3v.2M8.4 12.2h-.8c-.7 0-1.3-.6-1.3-1.3v-.1M10.8 10.7v.2c0 .7-.6 1.3-1.3 1.3H9" stroke="currentColor" stroke-width="1.35" stroke-linecap="round"/></svg>',
};

const DEFAULT_CATEGORY_ICON_SVG = '<svg viewBox="0 0 18 18" fill="none" aria-hidden="true"><rect x="3.2" y="3.4" width="5.1" height="5.1" rx="1.5" fill="currentColor" opacity=".16"/><rect x="9.7" y="3.4" width="5.1" height="5.1" rx="1.5" fill="currentColor" opacity=".16"/><rect x="6.4" y="9.7" width="5.1" height="5.1" rx="1.5" fill="currentColor" opacity=".16"/><path d="M5.8 8.5v1.2c0 .7.6 1.3 1.3 1.3h.2M12.2 8.5v1.2c0 .7-.6 1.3-1.3 1.3h-.2" stroke="currentColor" stroke-width="1.35" stroke-linecap="round"/></svg>';

const TASK_FIRST_CATEGORY_META = Object.freeze({
  基础编程: { colour: '#6366f1', description: '逻辑、循环、数学、文本和变量等基础积木。' },
  XEdu: { colour: '#3b82f6', description: 'XEdu 平台的核心语法、快捷任务和结果处理积木。' },
  'XEdu Hub': { colour: '#3b82f6', description: '和 XEdu Hub 实验相关的输入、任务、结果与常用语义积木。' },
  '媒体与设备': { colour: '#0ea5e9', description: '摄像头、视频流、显示、保存与设备控制积木。' },
  '调试与扩展': { colour: '#6366f1', description: '流程调试、异常保护和扩展积木。' },
  扩展工具: { colour: '#f97316', description: '媒体处理、通信控制和更多扩展能力。' },
  扩展包与调试: { colour: '#f97316', description: '教师侧调试、兼容旧流程和扩展能力。' },
});

const BASIC_PROGRAM_CATEGORY_NAMES = new Set(['逻辑', '循环', '数学', '文本', '列表', '变量', '函数']);
const ADVANCED_CATEGORY_NAMES = new Set(['图像视频', '通信控制', '进阶调试', '底层与调试', '扩展包']);
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
  blockStyles: {
    logic_blocks: {
      colourPrimary: '#a5b4fc',
      colourSecondary: '#818cf8',
      colourTertiary: '#6366f1',
    },
    loop_blocks: {
      colourPrimary: '#fbbf24',
      colourSecondary: '#f59e0b',
      colourTertiary: '#d97706',
    },
    math_blocks: {
      colourPrimary: '#60a5fa',
      colourSecondary: '#3b82f6',
      colourTertiary: '#2563eb',
    },
    text_blocks: {
      colourPrimary: '#f9a8d4',
      colourSecondary: '#f472b6',
      colourTertiary: '#ec4899',
    },
    list_blocks: {
      colourPrimary: '#5eead4',
      colourSecondary: '#14b8a6',
      colourTertiary: '#0d9488',
    },
    variable_blocks: {
      colourPrimary: '#fb7185',
      colourSecondary: '#f43f5e',
      colourTertiary: '#e11d48',
    },
    variable_dynamic_blocks: {
      colourPrimary: '#fb7185',
      colourSecondary: '#f43f5e',
      colourTertiary: '#e11d48',
    },
    procedure_blocks: {
      colourPrimary: '#c4b5fd',
      colourSecondary: '#a78bfa',
      colourTertiary: '#8b5cf6',
    },
  },
  componentStyles: {
    workspaceBackgroundColour: '#fcfeff',
    toolboxBackgroundColour: '#ffffff',
    toolboxForegroundColour: '#334155',
    flyoutBackgroundColour: '#ffffff',
    flyoutForegroundColour: '#334155',
    flyoutOpacity: 1,
    scrollbarColour: '#b8c7db',
    insertionMarkerColour: '#6366f1',
    insertionMarkerOpacity: 0.4,
    markerColour: '#6366f1',
    cursorColour: '#6366f1',
  },
  fontStyle: {
    family: "'Avenir Next', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif",
    weight: '700',
    size: 11.6,
  },
  startHats: true,
});

function getDefaultTaskId() {
  return String(getConfigValue('xeduhubTaskRegistry', {})?.default_task_id || 'cls_imagenet').trim() || 'cls_imagenet';
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

function getRawSourceToolbox() {
  return state.toolboxVariants?.course
    || state.toolboxVariants?.official
    || normalizeCategoryMeta(getConfigValue('defaultXEduHubToolbox', {}));
}

function buildDefaultWorkspaceSerialized() {
  const defaultTaskId = getDefaultTaskId();
  const xmlText = [
    '<xml xmlns="https://developers.google.com/blockly/xml">',
    `<block type="xeduhub_set_input_resource" id="input1" x="28" y="28"><field name="INPUT">${DEFAULT_INPUT_RESOURCE}</field>`,
    '<next>',
    `<block type="xeduhub_workflow_create_var" id="flow1"><field name="TASK_ID">${defaultTaskId}</field><field name="MODEL_VAR">lab_flow</field>`,
    '<next>',
    '<block type="xeduhub_workflow_infer_var" id="infer1"><field name="MODEL_VAR">lab_flow</field><field name="RESULT_VAR">lab_result</field></block>',
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

  if (xeduCategory && mediaCategory && debugCategory) {
    return normalizeCategoryMeta({
      ...rawToolbox,
      contents: [
        clone(categoryMap.get('基础编程')),
        clone(xeduCategory),
        clone(mediaCategory),
        clone(debugCategory),
      ].filter(Boolean),
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
  const mediaNames = ['图像视频', '通信控制'];

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
      name: '核心语法',
      colour: '#8b5cf6',
      description: '创建任务、执行推理与串联流程。',
      contents: dedupeToolboxContents([
        makeBlock('xeduhub_set_input_resource', { fields: { INPUT: DEFAULT_INPUT_RESOURCE } }),
        makeBlock('xeduhub_set_input_list', { fields: { INPUTS: DEFAULT_INPUT_SEQUENCE } }),
        makeBlock('xeduhub_workflow_create_var', {
          fields: {
            TASK_ID: getDefaultTaskId(),
            MODEL_VAR: 'lab_flow',
          },
        }),
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
      ]),
    },
    {
      kind: 'category',
      name: '结果处理',
      colour: '#10b981',
      description: '提取结果里的框、关键点、文本和结果图。',
      contents: dedupeToolboxContents([
        makeBlock('xeduhub_result_first_box'),
        makeBlock('xeduhub_bbox_center_x'),
        makeBlock('xeduhub_keypoint_axis', { fields: { AXIS: 'x' } }),
        makeBlock('xeduhub_ocr_first_text'),
        makeBlock('xeduhub_show_result_card', { fields: { TITLE: '运行结果' } }),
        makeBlock('xeduhub_show_result_image'),
        makeBlock('xeduhub_clear_result'),
      ]),
    },
    ...quickTaskNames.map((name) => xeduCategoryMap.get(name)).filter(Boolean).map((item) => clone(item)),
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
    .map((item) => clone(item));
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
    makeBlock('xeduhub_debug_print', { fields: { VAR: 'lab_result' } }),
    makeBlock('xeduhub_catch_error', { fields: { ERROR_VAR: 'lab_error' } }),
    makeBlock('xeduhub_run_and_record'),
  ]);
  if (debugContents.length > 0) {
    contents.push({
      kind: 'category',
      name: '调试与扩展',
      colour: TASK_FIRST_CATEGORY_META['调试与扩展'].colour,
      description: TASK_FIRST_CATEGORY_META['调试与扩展'].description,
      visible_by_default: true,
      expanded: true,
      contents: [{
        kind: 'category',
        name: '调试扩展',
        colour: '#6366f1',
        description: '记录结果、打印调试信息并对流程做异常保护。',
        contents: debugContents,
      }],
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
  (toolbox?.contents || []).forEach((item) => {
    if (item && item.kind === 'category' && item.name) {
      const name = String(item.name).trim();
      nextVisibility[name] = name in state.categoryVisibility
        ? state.categoryVisibility[name]
        : (typeof item.visible_by_default === 'boolean' ? item.visible_by_default : true);
    }
  });
  walkToolboxItems(toolbox?.contents || [], (item) => {
    if (item?.kind !== 'category' || !item.name) {
      return;
    }
    const name = String(item.name).trim();
    if (item.colour) {
      state.categoryColors[name] = item.colour;
    }
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
    const color = state.categoryColors[name] || '#3F76CF';
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

function queueToolboxRowStyling() {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      styleToolboxCategoryRows();
      alignToolboxFlyout();
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
    return itemColour;
  }
  const fallback = state.categoryColors[String(fallbackName || '').trim()];
  return fallback || '#6366f1';
}

function selectToolboxItem(item) {
  const toolbox = state.workspace?.getToolbox?.();
  if (!toolbox || typeof toolbox.setSelectedItem !== 'function' || !item) {
    return;
  }
  toolbox.setSelectedItem(item);
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
        colour: section.colour || state.categoryColors[name] || '#6366f1',
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
      if (child.name === selectedName) {
        button.classList.add('is-active');
      }
      button.style.setProperty('--xedu-leaf-color', child.colour);
      button.innerHTML = `
        <span class="blockly-side-leaf-icon">${getCategoryIconSvg(child.name)}</span>
        <span class="blockly-side-leaf-label">${child.name}</span>
      `;
      button.addEventListener('click', () => selectToolboxItem(child.item));
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
  const container = document.getElementById('resultEvidence');
  if (!container) {
    return;
  }
  container.innerHTML = `<pre id="resultTerminal" class="result-terminal"></pre>`;
  const terminal = document.getElementById('resultTerminal');
  if (terminal) {
    terminal.textContent = String(text || '').trim() || '$ ';
  }
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
  runBadge.classList.remove('is-success', 'is-error', 'is-running');
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
  if (stderr) {
    if (lines.length > 0) {
      lines.push('');
    }
    appendTerminalText(lines, stderr);
  }

  if (lines.length === 0) {
    const summary = payload?.result_summary || {};
    const headline = String(summary?.headline || payload?.message || '').trim();
    const metrics = Array.isArray(summary?.metrics) ? summary.metrics : [];
    const keyFields = payload?.result_artifacts?.key_fields && typeof payload.result_artifacts.key_fields === 'object'
      ? Object.entries(payload.result_artifacts.key_fields).map(([label, value]) => ({ label, value }))
      : [];
    const hints = Array.isArray(summary?.hints) ? summary.hints : [];

    if (headline) {
      lines.push(headline);
    }

    const rows = keyFields.length > 0 ? keyFields : metrics;
    rows.slice(0, 6).forEach((row) => {
      lines.push(`${row?.label || 'result'}: ${formatTerminalValue(row?.value)}`);
    });

    if (lines.length === 0) {
      lines.push(payload?.success ? '[done]' : '[failed]');
    }

    if (hints[0]) {
      lines.push('');
      lines.push(`# ${hints[0]}`);
    }
  }

  const returnCode = payload?.result?.return_code ?? payload?.return_code;
  if (typeof returnCode === 'number' && (returnCode !== 0 || lines.length === 0 || !stdout)) {
    if (lines.length > 0) {
      lines.push('');
    }
    lines.push(`[exit code ${returnCode}]`);
  }

  return lines.join('\n').trim() || '$ 等待运行';
}

function setResultIdleView() {
  setResultMode('idle');
  setResultBadge('未运行');
  state.resultRunState = { hasRun: false, lastPayload: null, lastTone: 'idle' };
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
  } else {
    updateResultView({
      success: true,
      message: `已打开文件：${file.name}`,
      result: { stdout: '', stderr: '', return_code: 0 },
      artifacts: {},
    });
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

function updateResultView(payload) {
  const success = Boolean(payload && payload.success);
  state.resultRunState.hasRun = true;
  state.resultRunState.lastPayload = payload || {};
  state.resultRunState.lastTone = success ? 'success' : 'error';
  setResultMode(success ? 'success' : 'error');
  setResultBadge(success ? '完成' : '异常', success ? 'is-success' : 'is-error');
  renderResultTerminal(buildTerminalOutput(payload || {}));
  resetDebugDetails({
    payload: payload?.result ?? payload ?? {},
    open: !success && Boolean(payload?.result && Object.keys(payload.result).length > 0),
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
      const specError = validateRunnableSpec(spec);
      if (specError) {
        updateResultView(specError);
        return;
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
  blocklyDebugLog('Blockly 运行时初始化开始', {
    debugEnabled: BLOCKLY_DEBUG_ENABLED,
    role: String(getConfigValue('userRole', '')),
    toolboxImportEnabled: canImportToolboxPacks(),
  });
  defineXEduHubBlocks(Blockly, pythonGenerator);
  bindUI();
  state.toolboxVariants = await loadToolboxes();
  logDynamicCategorySnapshot(state.toolboxVariants?.course || state.toolboxVariants?.official || {}, 'loadToolboxes');
  resetCategoryVisibility(getSourceToolbox());
  state.sideNavCollapsed = {};
  logDynamicCategorySnapshot(getSourceToolbox(), 'getSourceToolbox');
  state.workspace = Blockly.inject('blocklyDiv', {
    toolbox: getActiveToolbox(),
    renderer: 'zelos',
    sounds: false,
    rendererOverrides: {
      ADD_START_HATS: true,
      CORNER_RADIUS: 7,
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
