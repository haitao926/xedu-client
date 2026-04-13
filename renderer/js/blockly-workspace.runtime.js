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
  toolbarMoreClosedLabel: '更多 ▾',
  toolbarMoreOpenLabel: '更多 ▴',
  codePanelVisible: true,
  resultIdleText: '$ 等待运行',
  resultRunningText: '$ 运行中...',
});

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
  resultRunState: { hasRun: false },
  migrationReport: null,
  lastFlyoutButtonInvoke: { key: '', at: 0 },
  createVariableFallback: null,
  variableNameDialog: { resolve: null, visible: false },
  codePanelResizeTimer: null,
};

const CATEGORY_ICON_SVGS = {
  XEduHub: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 4.8 18 8v8l-6 3.2L6 16V8l6-3.2Z" fill="currentColor" opacity=".14"/><path d="M12 8.1v7.4m-3.3-3.7h6.6" stroke="currentColor" stroke-width="1.76" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  图像分类: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="5" y="5" width="14" height="14" rx="3.4" fill="currentColor" opacity=".11"/><path d="M8.1 14.9 10.8 12l2.2 2.2 3-3.3" stroke="currentColor" stroke-width="1.72" stroke-linecap="round" stroke-linejoin="round"/><circle cx="9.1" cy="9.1" r="1.2" fill="currentColor"/></svg>',
  目标检测: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="5.4" y="5.4" width="13.2" height="13.2" rx="3" stroke="currentColor" stroke-width="1.7" opacity=".42"/><rect x="8.3" y="8.3" width="7.4" height="7.4" rx="1.9" stroke="currentColor" stroke-width="1.7"/><path d="M12 4.5v2.2M12 17.3v2.2M4.5 12h2.2M17.3 12h2.2" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
  OCR: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="4.8" y="5" width="14.4" height="14" rx="3.2" stroke="currentColor" opacity=".34"/><path d="M8.2 9.2h7.6M8.2 12h5.6M8.2 14.8h7.6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M15.8 16.8h3.1" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
  关键点识别: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="7.2" r="1.5" fill="currentColor"/><circle cx="8.1" cy="11" r="1.4" fill="currentColor" opacity=".88"/><circle cx="15.9" cy="11" r="1.4" fill="currentColor" opacity=".88"/><circle cx="9.4" cy="16.1" r="1.3" fill="currentColor" opacity=".78"/><circle cx="14.6" cy="16.1" r="1.3" fill="currentColor" opacity=".78"/><path d="M12 8.7v4.8M12 10.2l-2.6.8M12 10.2l2.6.8M12 13.5l-2 2M12 13.5l2 2" stroke="currentColor" stroke-width="1.64" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  内容生成: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 4.7 13.8 9l4.5.4-3.4 2.8 1 4.4L12 14.4l-3.9 2.2 1-4.4-3.4-2.8 4.5-.4L12 4.7Z" fill="currentColor" opacity=".12"/><path d="M12 7.4v3.4m0 0 2.4 1.4M12 10.8 9.6 12.2" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  图像分割: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 7.6c0-1.1.9-2 2-2h8a2 2 0 0 1 2 2v8.8a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V7.6Z" fill="currentColor" opacity=".1"/><path d="M8.2 8.7c1.6.2 2.8 1.3 3 3 .1 1.4-.5 2.6-1.6 3.4m6.2-6.4c-1.6.2-2.8 1.3-3 3-.1 1.4.5 2.6 1.6 3.4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
  深度估计: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 8.2 12 5l6 3.2v7.6L12 19l-6-3.2V8.2Z" fill="currentColor" opacity=".11"/><path d="M12 5v14M6 8.2l6 3.4 6-3.4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  多模态特征: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="5" y="5.2" width="5.2" height="5.2" rx="1.5" fill="currentColor" opacity=".85"/><rect x="13.8" y="5.2" width="5.2" height="5.2" rx="1.5" fill="currentColor" opacity=".6"/><rect x="9.4" y="13.6" width="5.2" height="5.2" rx="1.5" fill="currentColor" opacity=".35"/><path d="M10.3 9.3h3.4m-1.7 0v4.3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  全景感知: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5.2 15.8c1.8-3 4.1-4.5 6.8-4.5 2.8 0 5 1.5 6.8 4.5" stroke="currentColor" stroke-width="1.72" stroke-linecap="round"/><path d="M6.3 14.6V9.2a2 2 0 0 1 2-2H15.7a2 2 0 0 1 2 2v5.4" stroke="currentColor" stroke-width="1.72" stroke-linecap="round"/><circle cx="8.2" cy="16.6" r="1.2" fill="currentColor"/><circle cx="15.8" cy="16.6" r="1.2" fill="currentColor"/></svg>',
  结果显示: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="4.9" y="5" width="14.2" height="14" rx="3.1" fill="currentColor" opacity=".11"/><path d="M8.2 12.2h3.1l1.7-2.1 2.8 4" stroke="currentColor" stroke-width="1.72" stroke-linecap="round" stroke-linejoin="round"/><circle cx="8.4" cy="9.2" r="1.1" fill="currentColor"/></svg>',
  逻辑: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 4.6 16.6 8 12 11.4 7.4 8 12 4.6Z" fill="currentColor" opacity=".16"/><rect x="4.9" y="14.2" width="5.4" height="4.6" rx="1.2" fill="currentColor" opacity=".11"/><rect x="13.7" y="14.2" width="5.4" height="4.6" rx="1.2" fill="currentColor" opacity=".11"/><path d="M12 11.6v2.5m0 .1H9.3m2.7 0h2.7" stroke="currentColor" stroke-width="1.78" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  循环: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M8 6.3H4.7V9.6M16 17.7h3.3v-3.3M5.2 9a7 7 0 0 1 12.8-1.9M18.8 15a7 7 0 0 1-12.8 1.9" stroke="currentColor" stroke-width="1.84" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/></svg>',
  数学: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="4.7" y="4.7" width="14.6" height="14.6" rx="3.6" fill="currentColor" opacity=".11"/><path d="M8.1 9.4h4m-2-2v4m-2 4.6h4m2.3-7 3 3m0-3-3 3m.2 4.1h2.8" stroke="currentColor" stroke-width="1.68" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  文本: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="4.8" y="4.8" width="14.4" height="14.4" rx="3.7" stroke="currentColor" opacity=".34"/><path d="M7.4 8h9.2M12 8v8M9 16h6" stroke="currentColor" stroke-width="1.82" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  列表: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="5" y="5.2" width="14" height="13.6" rx="3.4" fill="currentColor" opacity=".1"/><circle cx="8.3" cy="9" r="1.1" fill="currentColor"/><circle cx="8.3" cy="12.2" r="1.1" fill="currentColor"/><circle cx="8.3" cy="15.4" r="1.1" fill="currentColor"/><path d="M11.3 9h4.5m-4.5 3.2h5.2m-5.2 3.2h4.1" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
  变量: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 4.8 18 8v8l-6 3.2L6 16V8l6-3.2Z" fill="currentColor" opacity=".13"/><path d="M12 4.8 18 8v8l-6 3.2L6 16V8l6-3.2Zm0 3.7v6.9" stroke="currentColor" stroke-width="1.74" stroke-linecap="round" stroke-linejoin="round"/><path d="M9.9 10.6h4.2" stroke="currentColor" stroke-width="1.62" stroke-linecap="round"/></svg>',
  函数: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M8.6 6.2c-2 1.5-2 10.1 0 11.6M15.4 6.2c2 1.5 2 10.1 0 11.6" stroke="currentColor" stroke-width="1.84" stroke-linecap="round"/><path d="M10.2 14.7c.8-2.6 2.3-4.4 4.4-5.7m-4 1.6h4.9" stroke="currentColor" stroke-width="1.58" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  图像视频: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="4.8" y="6" width="11.8" height="9.2" rx="2.1" fill="currentColor" opacity=".12"/><path d="M16.5 9.2 19.7 7.4v6.1l-3.2-1.8" stroke="currentColor" stroke-width="1.68" stroke-linecap="round" stroke-linejoin="round"/><circle cx="10.4" cy="10.6" r="2" stroke="currentColor" stroke-width="1.58"/><path d="M6.8 18.4h10.4" stroke="currentColor" stroke-width="1.68" stroke-linecap="round"/></svg>',
  通信控制: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="4.9" y="5.1" width="10.8" height="13.8" rx="2.9" fill="currentColor" opacity=".12"/><path d="M8.1 8.9h4.6M8.1 12h4.6M8.1 15.1h3.2M16.5 9.3h2.9M17.9 7.9v2.9" stroke="currentColor" stroke-width="1.68" stroke-linecap="round"/><circle cx="18.1" cy="15.7" r="2" stroke="currentColor" stroke-width="1.6"/></svg>',
  进阶调试: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 5.1 6.4 8.3v7.4l5.6 3.2 5.6-3.2V8.3L12 5.1Z" fill="currentColor" opacity=".1"/><path d="m9.1 13 1.8 1.8 4-4.2M12 5.1 6.4 8.3v7.4l5.6 3.2 5.6-3.2V8.3L12 5.1Z" stroke="currentColor" stroke-width="1.68" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  'XEduHub 推理': '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 4.6 14 8.7l4.6.7-3.3 3.2.8 4.6-4.1-2-4.1 2 .8-4.6-3.3-3.2 4.6-.7L12 4.6Z" fill="currentColor" opacity=".12"/><path d="M10 11.2a2 2 0 1 1 4 0c0 1.2-2 1.7-2 3m0 2h.01" stroke="currentColor" stroke-width="1.72" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  '模型与参数': '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 8h12M6 12h12M6 16h12" stroke="currentColor" stroke-width="1.78" stroke-linecap="round"/><rect x="8" y="6.8" width="3.3" height="2.4" rx="1.2" fill="currentColor"/><rect x="13.1" y="10.8" width="3.3" height="2.4" rx="1.2" fill="currentColor"/><rect x="10.5" y="14.8" width="3.3" height="2.4" rx="1.2" fill="currentColor"/></svg>',
  '底层与调试': '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="4.8" y="5.3" width="14.4" height="13.4" rx="3.1" fill="currentColor" opacity=".1"/><path d="m8.1 9.2 2.1 2.1-2.1 2.1m4.1 1.7h4m-8-6.4h7.8" stroke="currentColor" stroke-width="1.68" stroke-linecap="round" stroke-linejoin="round"/><circle cx="15.9" cy="11.3" r="1.1" fill="currentColor"/></svg>',
  扩展包: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 5 18.3 8v8L12 19l-6.3-3V8L12 5Z" fill="currentColor" opacity=".12"/><path d="M12 5 18.3 8v8L12 19l-6.3-3V8L12 5Zm0 3.7v6.6m-3.3-3.3h6.6" stroke="currentColor" stroke-width="1.72" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

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

function canImportToolboxPacks() {
  return Boolean(getConfigValue('toolboxImportEnabled', getConfigValue('toolboxSwitchEnabled', true)));
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

const scratchLikeTheme = Blockly.Theme.defineTheme('xedu_scratch_like', {
  base: Blockly.Themes.Classic,
  blockStyles: {
    logic_blocks: {
      colourPrimary: '#4F7CFF',
      colourSecondary: '#3D68EC',
      colourTertiary: '#2C53CD',
    },
    loop_blocks: {
      colourPrimary: '#F59B42',
      colourSecondary: '#E8842A',
      colourTertiary: '#CF6C14',
    },
    math_blocks: {
      colourPrimary: '#22C7A1',
      colourSecondary: '#16B38E',
      colourTertiary: '#0E9575',
    },
    text_blocks: {
      colourPrimary: '#8E68F8',
      colourSecondary: '#7B55E7',
      colourTertiary: '#6743CC',
    },
    list_blocks: {
      colourPrimary: '#37A7F7',
      colourSecondary: '#1F93E6',
      colourTertiary: '#147CC5',
    },
    variable_blocks: {
      colourPrimary: '#F06F7F',
      colourSecondary: '#DB5B6C',
      colourTertiary: '#BD4859',
    },
    variable_dynamic_blocks: {
      colourPrimary: '#F06F7F',
      colourSecondary: '#DB5B6C',
      colourTertiary: '#BD4859',
    },
    procedure_blocks: {
      colourPrimary: '#AA6CF6',
      colourSecondary: '#9559E4',
      colourTertiary: '#7C48C9',
    },
  },
  componentStyles: {
    workspaceBackgroundColour: '#f7faff',
    toolboxBackgroundColour: '#f8fbff',
    toolboxForegroundColour: '#243247',
    flyoutBackgroundColour: '#f9fbff',
    flyoutForegroundColour: '#243247',
    flyoutOpacity: 1,
    scrollbarColour: '#8aa0c4',
    insertionMarkerColour: '#4F7CFF',
    insertionMarkerOpacity: 0.35,
    markerColour: '#2C53CD',
    cursorColour: '#2C53CD',
  },
  fontStyle: {
    family: "'Avenir Next', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif",
    weight: '700',
    size: 11.2,
  },
  startHats: true,
});

function getSourceToolbox() {
  return state.toolboxVariants?.course
    || state.toolboxVariants?.official
    || normalizeCategoryMeta(getConfigValue('defaultXEduHubToolbox', {}));
}

function getActiveToolbox() {
  const activeToolbox = getSourceToolbox();
  const copy = clone(activeToolbox);
  copy.contents = (copy.contents || []).filter((item) => {
    if (!item) {
      return false;
    }
    if (item.kind === 'label') {
      return true;
    }
    if (item.kind !== 'category') {
      return false;
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
  return CATEGORY_ICON_SVGS[name] || '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 6v12M6 12h12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
}

function syncCategoryVisuals(container, name, color, selected = false) {
  if (!container || !name || !color) {
    return;
  }
  container.style.setProperty('--xedu-category-color', color);
  container.classList.add('xedu-toolbox-category-row');
  container.classList.toggle('xedu-toolbox-category-selected', selected);

  const labelEl = container.querySelector('.blocklyToolboxCategoryLabel, .blocklyTreeLabel, .group-item-main');
  if (labelEl) {
    labelEl.classList.add('xedu-toolbox-category-label');
    let iconEl = container.querySelector('.xedu-toolbox-category-icon');
    if (!iconEl) {
      iconEl = document.createElement('span');
      iconEl.className = 'xedu-toolbox-category-icon';
      labelEl.parentNode?.insertBefore(iconEl, labelEl);
    }
    iconEl.innerHTML = getCategoryIconSvg(name);
  }
}

function resetCategoryVisibility(toolbox) {
  const nextVisibility = {};
  (toolbox?.contents || []).forEach((item) => {
    if (item && item.kind === 'category' && item.name) {
      const name = String(item.name).trim();
      nextVisibility[name] = name in state.categoryVisibility
        ? state.categoryVisibility[name]
        : (typeof item.visible_by_default === 'boolean' ? item.visible_by_default : true);
      if (item.colour) {
        state.categoryColors[name] = item.colour;
      }
      if (item.description) {
        state.categoryNotes[name] = item.description;
      }
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
    const note = state.categoryNotes[name] || '通用工具积木';
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

function setCodePanelVisible(visible) {
  state.codePanelVisible = Boolean(visible);
  document.getElementById('blocklyLayout')?.classList.toggle('code-collapsed', !state.codePanelVisible);
  const codeDock = document.getElementById('codeDock');
  codeDock?.classList.toggle('collapsed', !state.codePanelVisible);
  const button = document.getElementById('codeDockToggleBtn');
  if (button) {
    button.setAttribute('aria-expanded', state.codePanelVisible ? 'true' : 'false');
    button.setAttribute('aria-label', state.codePanelVisible ? '收起代码面板' : '展开代码面板');
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
    row.style.borderLeft = `4px solid ${color}`;
    row.style.backgroundColor = hexToRgba(color, isSelected ? 0.22 : 0.12);
    row.style.borderColor = hexToRgba(color, isSelected ? 0.38 : 0.20);
    row.style.boxShadow = `inset 0 0 0 1px ${hexToRgba(color, isSelected ? 0.30 : 0.15)}`;
  });
}

function queueToolboxRowStyling() {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => styleToolboxCategoryRows());
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
  const terminalEl = document.getElementById('resultTerminal');
  if (!terminalEl) {
    return;
  }
  terminalEl.textContent = String(text || '').trim() || '$ ';
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
  setResultTerminal(CLASSROOM_DEFAULTS.resultIdleText);
  resetDebugDetails({ payload: {}, open: false });
}

function setResultRunningView() {
  setResultMode('running');
  setResultBadge('运行中', 'is-running');
  setResultTerminal(CLASSROOM_DEFAULTS.resultRunningText);
  resetDebugDetails({ payload: { status: 'running' }, open: false });
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
  setResultTerminal([
    '# 已自动迁移旧版工作区',
    `success: ${report.changed?.length || 0}`,
    `failed: ${report.failed?.length || 0}`,
  ].join('\n'));
  resetDebugDetails({ payload: report, open: false });
  blocklyDebugLog('工作区迁移报告', report);
}

function validateRunnableSpec(spec) {
  if (!hasRunnableFlow()) {
    return buildPreflightError('missing_flow', '当前工作区里还没有 XEduHub 积木流程，请先拖入相关积木。', '先拖入一个 XEduHub 任务运行积木。');
  }
  if (!spec || !spec.task_id) {
    return buildPreflightError('missing_task', '当前流程缺少任务类型，请先放入运行积木。', '请先放入一个带任务语义的 XEduHub 运行积木。');
  }
  if (spec.input === undefined || spec.input === null || spec.input === '') {
    return buildPreflightError('missing_input', '当前流程缺少输入路径。', '先使用“选择输入图片”积木填写图片路径。');
  }
  return null;
}

function updateResultView(payload) {
  const success = Boolean(payload && payload.success);
  state.resultRunState.hasRun = true;
  setResultMode(success ? 'success' : 'error');

  setResultBadge(success ? '完成' : '异常', success ? 'is-success' : 'is-error');
  setResultTerminal(buildTerminalOutput(payload));
  resetDebugDetails({
    payload: payload?.result ?? payload ?? {},
    open: !success && Boolean(payload?.result && Object.keys(payload.result).length > 0),
  });
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
  logDynamicCategorySnapshot(getSourceToolbox(), 'getSourceToolbox');
  state.workspace = Blockly.inject('blocklyDiv', {
    toolbox: getActiveToolbox(),
    renderer: 'zelos',
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
      queueToolboxRowStyling();
    }
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

  const toolboxImportEnabled = canImportToolboxPacks();
  const controlPanel = document.getElementById('controlPanel');
  const controlToggle = document.getElementById('controlPanelToggleBtn');
  const packPanel = document.getElementById('toolboxPackPanel');
  const extendFab = document.getElementById('blocklyExtendFab');
  const addPackBtn = document.getElementById('addPackBtn');
  const toolboxLabel = document.getElementById('toolboxLabel');
  if (controlPanel) {
    controlPanel.style.display = '';
  }
  if (controlToggle) {
    controlToggle.style.display = toolboxImportEnabled ? '' : 'none';
  }
  if (packPanel) {
    packPanel.style.display = '';
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
    }
  }

  updatePython();
}

init().catch((error) => {
  setPythonCode(`# Blockly 初始化失败\n# ${error.message || '未知错误'}`);
});
