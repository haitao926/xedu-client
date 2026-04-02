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
import { defineXEduHubBlocks } from './blockly/xeduhub-blocks.js';
import { renderPythonHighlighted } from './blockly/python-highlighter.js';

void libraryBlocks;

Blockly.setLocale(ZhHans);

const runtimeConfig = window.__XEDU_BLOCKLY_RUNTIME_CONFIG__ || {};

const state = {
  workspace: null,
  initialSerialized: null,
  toolboxVariants: {
    official: null,
    course: null,
    hasCourseCustom: false,
    customPackCount: 0,
  },
  toolboxMode: 'official',
  toolboxPacks: [],
  categoryVisibility: {},
  categoryColors: {},
  categoryNotes: {},
  toolbarOverflowState: { menuOpen: false },
  panelCollapsedState: { debugOpen: false },
  controlPanelState: { open: false },
  codePanelVisible: false,
  resultRunState: { hasRun: false },
};

const CATEGORY_ICON_SVGS = {
  逻辑: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="4.5" y="5" width="6" height="5" rx="2" fill="currentColor" opacity=".18"/><rect x="13.5" y="5" width="6" height="5" rx="2" fill="currentColor" opacity=".18"/><rect x="4.5" y="14" width="6" height="5" rx="2" fill="currentColor" opacity=".18"/><rect x="13.5" y="14" width="6" height="5" rx="2" fill="currentColor" opacity=".18"/><path d="M10.5 7.5h3M12 10v4M10.5 16.5h3" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  循环: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7.5 7.5H4.8V4.8M16.5 16.5h2.7v2.7M5.2 8.2A7 7 0 0 1 17.8 6M18.8 15.8A7 7 0 0 1 6.2 18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/></svg>',
  数学: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="5" y="5" width="14" height="14" rx="4" fill="currentColor" opacity=".12"/><path d="M8 9.5h8M8 14.5h8M12 8v8M9 12h6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  文本: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 6.5h10M9.5 6.5v11M14.5 6.5v11M7 17.5h10" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/><rect x="4.5" y="4.5" width="15" height="15" rx="4" stroke="currentColor" opacity=".35"/></svg>',
  列表: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="7" cy="8" r="1.5" fill="currentColor"/><circle cx="7" cy="12" r="1.5" fill="currentColor"/><circle cx="7" cy="16" r="1.5" fill="currentColor"/><path d="M11 8h6M11 12h6M11 16h6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  变量: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 4.8l6 3.3v7.8l-6 3.3-6-3.3V8.1l6-3.3Z" fill="currentColor" opacity=".14"/><path d="M12 4.8l6 3.3v7.8l-6 3.3-6-3.3V8.1l6-3.3ZM12 8.5v7" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  函数: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 6c3 0 3 3 3 6s0 6 3 6M15 6c-3 0-3 3-3 6s0 6-3 6" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="12" r="1.1" fill="currentColor"/></svg>',
  'XEduHub 推理': '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 4.2l2.4 4.86 5.36.78-3.88 3.78.91 5.34L12 16.7l-4.79 2.28.91-5.34-3.88-3.78 5.36-.78L12 4.2Z" fill="currentColor" opacity=".12"/><path d="M12 4.2l2.4 4.86 5.36.78-3.88 3.78.91 5.34L12 16.7l-4.79 2.28.91-5.34-3.88-3.78 5.36-.78L12 4.2Z" stroke="currentColor" stroke-width="1.55" stroke-linejoin="round"/></svg>',
  '模型与参数': '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 8h12M6 12h12M6 16h12" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/><circle cx="9" cy="8" r="1.7" fill="currentColor"/><circle cx="15" cy="12" r="1.7" fill="currentColor"/><circle cx="12" cy="16" r="1.7" fill="currentColor"/></svg>',
  '底层与调试': '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9.5 5.5h5l1 2H18a1 1 0 0 1 1 1V17a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V8.5a1 1 0 0 1 1-1h2.5l1-2Z" fill="currentColor" opacity=".12"/><path d="M9.5 5.5h5l1 2H18a1 1 0 0 1 1 1V17a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V8.5a1 1 0 0 1 1-1h2.5l1-2Zm2.5 4.8v3.6m0 2.2h.01" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  扩展包: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="5" y="5" width="14" height="14" rx="4" fill="currentColor" opacity=".12"/><path d="M12 7.5v9M7.5 12h9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M8 8h8v8H8z" stroke="currentColor" stroke-width="1.4" opacity=".5"/></svg>',
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
    const payload = await response.json();
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
      colourPrimary: '#6D8EF7',
      colourSecondary: '#5E7FE8',
      colourTertiary: '#4D6ED8',
    },
    loop_blocks: {
      colourPrimary: '#F4B266',
      colourSecondary: '#E6A457',
      colourTertiary: '#D99546',
    },
    math_blocks: {
      colourPrimary: '#56C7B7',
      colourSecondary: '#46B8A8',
      colourTertiary: '#35A898',
    },
    text_blocks: {
      colourPrimary: '#9B8CF2',
      colourSecondary: '#8C7DE3',
      colourTertiary: '#7A6CD1',
    },
    list_blocks: {
      colourPrimary: '#6DB6E8',
      colourSecondary: '#5BA7DB',
      colourTertiary: '#4897CD',
    },
    variable_blocks: {
      colourPrimary: '#F29C7A',
      colourSecondary: '#E38E6C',
      colourTertiary: '#D37D5A',
    },
    variable_dynamic_blocks: {
      colourPrimary: '#F29C7A',
      colourSecondary: '#E38E6C',
      colourTertiary: '#D37D5A',
    },
    procedure_blocks: {
      colourPrimary: '#C793E8',
      colourSecondary: '#B985D8',
      colourTertiary: '#AB75C9',
    },
  },
  componentStyles: {
    workspaceBackgroundColour: '#f8fafc',
    toolboxBackgroundColour: '#f8fafc',
    toolboxForegroundColour: '#334155',
    flyoutBackgroundColour: '#f8fafc',
    flyoutForegroundColour: '#334155',
    flyoutOpacity: 1,
    scrollbarColour: '#94a3b8',
    insertionMarkerColour: '#3b82f6',
    insertionMarkerOpacity: 0.35,
    markerColour: '#1d4ed8',
    cursorColour: '#1d4ed8',
  },
  fontStyle: {
    family: "'Nunito', 'PingFang SC', 'Segoe UI', sans-serif",
    weight: '700',
    size: 12,
  },
  startHats: true,
});

function getActiveToolbox() {
  const activeToolbox = (state.toolboxMode === 'course' && state.toolboxVariants?.course)
    ? state.toolboxVariants.course
    : (state.toolboxVariants?.official || normalizeCategoryMeta(getConfigValue('defaultXEduHubToolbox', {})));
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
  const sourceToolbox = (state.toolboxMode === 'course' && state.toolboxVariants?.course)
    ? state.toolboxVariants.course
    : (state.toolboxVariants?.official || normalizeCategoryMeta(getConfigValue('defaultXEduHubToolbox', {})));
  const names = collectCategoryNames(sourceToolbox);
  body.innerHTML = names.map((name, index) => {
    const checked = state.categoryVisibility[name] !== false ? 'checked' : '';
    const note = state.categoryNotes[name] || '通用工具积木';
    const color = state.categoryColors[name] || '#5A8DEE';
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
    button.textContent = state.toolbarOverflowState.menuOpen ? '导出 ▴' : '导出 ▾';
  }
}

function setCodePanelVisible(visible) {
  state.codePanelVisible = Boolean(visible);
  document.getElementById('pythonOverlay')?.classList.toggle('open', state.codePanelVisible);
  const button = document.getElementById('toggleCodePanelBtn');
  if (button) {
    button.textContent = state.codePanelVisible ? '关闭代码' : '查看代码';
  }
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

function syncToolboxModeButtons() {
  document.getElementById('toolboxOfficialBtn')?.classList.toggle('active', state.toolboxMode === 'official');
  document.getElementById('toolboxCourseBtn')?.classList.toggle('active', state.toolboxMode === 'course');
}

function syncToolboxMeta() {
  const label = document.getElementById('toolboxLabel');
  if (!label) {
    return;
  }
  label.textContent = state.toolboxMode === 'course' && state.toolboxVariants.hasCourseCustom
    ? '当前：课程包积木'
    : '当前：官方积木';
}

function buildToolboxPackList() {
  const packs = [{ name: '官方课堂积木', source: '平台' }];
  if (state.toolboxVariants.hasCourseCustom) {
    packs.push({ name: '课程包积木', source: '课程' });
  }
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
  if (!getConfigValue('toolboxSwitchEnabled', true)) {
    return;
  }
  const nextMode = mode === 'course' && state.toolboxVariants.hasCourseCustom ? 'course' : 'official';
  if (state.toolboxMode === nextMode) {
    return;
  }
  state.toolboxMode = nextMode;
  const sourceToolbox = (state.toolboxMode === 'course' && state.toolboxVariants?.course)
    ? state.toolboxVariants.course
    : (state.toolboxVariants?.official || normalizeCategoryMeta(getConfigValue('defaultXEduHubToolbox', {})));
  resetCategoryVisibility(sourceToolbox);
  syncToolboxModeButtons();
  if (state.workspace) {
    state.workspace.updateToolbox(getActiveToolbox());
    queueToolboxRowStyling();
  }
  renderGroupDrawer();
  syncToolboxMeta();
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

function updatePython() {
  if (!state.workspace) {
    return;
  }
  const python = pythonGenerator.workspaceToCode(state.workspace) || "# 在左侧拖入积木开始编程\nlab_input = 'demo.jpg'";
  setPythonCode(python);
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
  const spec = { project_root: String(getConfigValue('projectRoot', '')) };
  const blocks = state.workspace.getAllBlocks(false);
  for (const block of blocks) {
    if (block.type === 'xeduhub_set_input' || block.type === 'xeduhub_flow_set_input') {
      spec.input = block.getFieldValue('INPUT') || '';
    }
    if (block.type === 'xeduhub_classify_run') {
      spec.task = 'classification';
      spec.model = block.getFieldValue('MODEL') || 'resnet18';
      spec.mode = 'high_level';
    }
    if (block.type === 'xeduhub_detect_run') {
      spec.task = 'detection';
      spec.model = block.getFieldValue('MODEL') || 'yolov5';
      spec.mode = 'high_level';
    }
    if (block.type === 'xeduhub_ocr_run') {
      spec.task = 'ocr';
      spec.model = block.getFieldValue('MODEL') || 'dbnet';
      spec.mode = 'high_level';
    }
    if (block.type === 'xeduhub_run_vision') {
      spec.task = block.getFieldValue('TASK') || 'classification';
      spec.model = block.getFieldValue('MODEL') || 'resnet18';
      spec.input = spec.input || block.getFieldValue('INPUT') || '';
      spec.mode = 'high_level';
    }
    if (block.type === 'xeduhub_create_flow' || block.type === 'xeduhub_create_workflow') {
      spec.task = block.getFieldValue('TASK') || 'classification';
      spec.model = block.getFieldValue('MODEL') || spec.model || 'resnet18';
      spec.mode = 'workflow';
    }
    if (block.type === 'xeduhub_set_model') {
      spec.model = block.getFieldValue('MODEL') || spec.model || 'resnet18';
    }
  }
  return spec.task || spec.input ? spec : null;
}

function hasRunnableFlow() {
  return Boolean(state.workspace) && state.workspace.getAllBlocks(false).some((block) => RUNNABLE_BLOCK_TYPES.has(block.type));
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

function validateRunnableSpec(spec) {
  if (!hasRunnableFlow()) {
    return buildPreflightError('missing_flow', '当前工作区里还没有 XEduHub 积木流程，请先拖入相关积木。', '先拖入“图像分类推理 / 目标检测推理 / OCR 推理”等运行积木。');
  }
  if (!spec || !spec.task) {
    return buildPreflightError('missing_task', '当前流程缺少任务类型，请先放入运行积木。', '请先放入一个带任务语义的 XEduHub 运行积木。');
  }
  if (!spec.input) {
    return buildPreflightError('missing_input', '当前流程缺少输入路径。', '先使用“选择输入图片”积木填写图片路径。');
  }
  return null;
}

function updateResultView(payload) {
  const success = Boolean(payload && payload.success);
  state.resultRunState.hasRun = true;
  document.getElementById('insightCard')?.classList.add('has-run');

  const runBadge = document.getElementById('resultRunBadge');
  if (runBadge) {
    runBadge.classList.remove('is-success', 'is-error');
    runBadge.classList.add(success ? 'is-success' : 'is-error');
    runBadge.textContent = success ? '运行成功' : '运行失败';
  }

  const stateEl = document.getElementById('resultState');
  if (stateEl) {
    stateEl.className = `result-state ${success ? 'is-success' : 'is-error'}`;
    stateEl.textContent = payload?.message || (success ? '执行完成' : '执行失败');
  }

  const summary = payload?.result_summary || {};
  const headline = summary?.headline || '暂无结论';
  const metrics = Array.isArray(summary?.metrics) ? summary.metrics : [];
  const hints = Array.isArray(summary?.hints) ? summary.hints : [];
  const subline = hints.length > 0 ? hints[0] : (success ? '运行完成' : '请检查输入或模型配置');
  const summaryEl = document.getElementById('resultSummary');
  if (summaryEl) {
    summaryEl.innerHTML = `<strong>${headline}</strong><small>${subline}</small>`;
  }

  const metricsEl = document.getElementById('resultMetrics');
  if (metricsEl) {
    if (metrics.length > 0) {
      metricsEl.innerHTML = metrics.slice(0, 4).map((metric) => `<span class="result-metric-chip">${metric.label || '指标'}: ${metric.value ?? '-'}</span>`).join('');
      metricsEl.style.display = 'flex';
    } else {
      metricsEl.innerHTML = '';
      metricsEl.style.display = 'none';
    }
  }

  const jsonEl = document.getElementById('resultJson');
  if (jsonEl) {
    jsonEl.textContent = JSON.stringify(payload?.result ?? {}, null, 2);
  }

  const imageEl = document.getElementById('resultImage');
  const imageData = payload?.result_artifacts?.preview_image || payload?.artifacts?.image_data || '';
  if (imageEl) {
    if (imageData) {
      imageEl.src = imageData;
      imageEl.style.display = 'block';
    } else {
      imageEl.removeAttribute('src');
      imageEl.style.display = 'none';
    }
  }
}

async function executeXEduHub() {
  const spec = extractXEduHubSpec();
  const preflightError = validateRunnableSpec(spec);
  if (preflightError) {
    updateResultView(preflightError);
    return;
  }
  const runBtn = document.getElementById('runXEduHubBtn');
  if (runBtn) {
    runBtn.disabled = true;
    runBtn.textContent = '运行中...';
  }
  try {
    const response = await fetch(String(getConfigValue('xeduhubExecuteUrl', '/api/resources/blockly/xeduhub/execute')), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: getPythonRaw(),
        spec,
        project_root: String(getConfigValue('projectRoot', '')),
      }),
    });
    const payload = await response.json();
    updateResultView(payload);
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

async function importToolboxPack(file) {
  let importedToolbox = null;
  if (file.name.endsWith('.zip')) {
    const zip = await JSZip.loadAsync(file);
    const toolboxFile = zip.file('toolbox.json')
      || zip.file('toolbox.toolbox.json')
      || Object.values(zip.files).find((entry) => entry && !entry.dir && /\.toolbox\.json$/i.test(entry.name));
    if (!toolboxFile) {
      throw new Error('ZIP 中缺少 toolbox.json 或 *.toolbox.json');
    }
    const raw = await toolboxFile.async('string');
    importedToolbox = JSON.parse(raw);
  } else {
    importedToolbox = JSON.parse(await file.text());
  }
  const schema = await validateToolboxWithApi(importedToolbox);
  if (!schema.valid) {
    throw new Error(`积木包格式不正确：${schema.errors[0] || '未知错误'}`);
  }
  const safeToolbox = schema.normalized || importedToolbox;
  const currentCourseToolbox = state.toolboxVariants?.course || state.toolboxVariants?.official || normalizeCategoryMeta(getConfigValue('defaultXEduHubToolbox', {}));
  state.toolboxVariants.course = mergeToolboxes(currentCourseToolbox, safeToolbox);
  state.toolboxVariants.hasCourseCustom = true;
  state.toolboxVariants.customPackCount = Number(state.toolboxVariants.customPackCount || 0) + 1;
  resetCategoryVisibility(state.toolboxVariants.course);
  document.getElementById('toolboxModeSwitch')?.style.setProperty('display', 'grid');
  switchToolboxMode('course');
  renderToolboxPacks();
  renderGroupDrawer();
  queueToolboxRowStyling();
}

function bindUI() {
  document.getElementById('copyPythonBtn')?.addEventListener('click', async () => {
    setMoreMenuOpen(false);
    await navigator.clipboard.writeText(getPythonRaw());
  });
  document.getElementById('toggleDebugBtn')?.addEventListener('click', () => {
    const debugDetails = document.getElementById('resultDebugDetails');
    if (!debugDetails) {
      return;
    }
    state.panelCollapsedState.debugOpen = !state.panelCollapsedState.debugOpen;
    debugDetails.open = state.panelCollapsedState.debugOpen;
    setMoreMenuOpen(false);
  });
  document.getElementById('toggleCodePanelBtn')?.addEventListener('click', () => setCodePanelVisible(!state.codePanelVisible));
  document.getElementById('closePythonOverlayBtn')?.addEventListener('click', () => setCodePanelVisible(false));
  document.getElementById('pythonOverlay')?.addEventListener('click', (event) => {
    if (event.target?.id === 'pythonOverlay') {
      setCodePanelVisible(false);
    }
  });
  document.querySelector('.python-overlay-card')?.addEventListener('click', (event) => event.stopPropagation());
  document.getElementById('controlPanelToggleBtn')?.addEventListener('click', (event) => {
    if (!getConfigValue('toolboxSwitchEnabled', true)) {
      return;
    }
    event.stopPropagation();
    setCodePanelVisible(false);
    setMoreMenuOpen(false);
    setControlPanelOpen(!state.controlPanelState.open);
  });
  document.getElementById('controlPanel')?.addEventListener('click', (event) => event.stopPropagation());
  document.getElementById('toolbarMoreBtn')?.addEventListener('click', (event) => {
    event.stopPropagation();
    setCodePanelVisible(false);
    setControlPanelOpen(false);
    setMoreMenuOpen(!state.toolbarOverflowState.menuOpen);
  });
  document.addEventListener('click', () => {
    setMoreMenuOpen(false);
    setControlPanelOpen(false);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      setCodePanelVisible(false);
      setMoreMenuOpen(false);
      setControlPanelOpen(false);
    }
  });
  document.getElementById('toolbarMoreMenu')?.addEventListener('click', (event) => event.stopPropagation());
  document.getElementById('toolboxOfficialBtn')?.addEventListener('click', () => switchToolboxMode('official'));
  document.getElementById('toolboxCourseBtn')?.addEventListener('click', () => switchToolboxMode('course'));
  document.getElementById('blocklyExtendFab')?.addEventListener('click', () => {
    if (!getConfigValue('toolboxSwitchEnabled', true)) {
      return;
    }
    document.getElementById('addPackInput')?.click();
  });
  document.getElementById('addPackBtn')?.addEventListener('click', () => {
    if (!getConfigValue('toolboxSwitchEnabled', true)) {
      return;
    }
    document.getElementById('addPackInput')?.click();
  });
  document.getElementById('addPackInput')?.addEventListener('change', async (event) => {
    if (!getConfigValue('toolboxSwitchEnabled', true)) {
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
  document.getElementById('downloadWorkspaceBtn')?.addEventListener('click', () => {
    if (!state.workspace) {
      return;
    }
    const workspaceUrl = String(getConfigValue('workspaceUrl', ''));
    let content = '';
    let filename = 'workspace.blockly.json';
    if (workspaceUrl.endsWith('.xml')) {
      const xml = Blockly.Xml.workspaceToDom(state.workspace);
      content = Blockly.Xml.domToPrettyText(xml);
      filename = workspaceUrl ? workspaceUrl.split('/').pop() : 'workspace.blockly.xml';
    } else {
      content = JSON.stringify(Blockly.serialization.workspaces.save(state.workspace), null, 2);
      filename = workspaceUrl ? workspaceUrl.split('/').pop() : 'workspace.blockly.json';
    }
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const anchor = document.createElement('a');
    anchor.href = URL.createObjectURL(blob);
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(anchor.href);
  });
  document.getElementById('resetWorkspaceBtn')?.addEventListener('click', () => {
    if (!state.workspace || !state.initialSerialized) {
      return;
    }
    state.workspace.clear();
    if (state.initialSerialized.kind === 'xml') {
      const xml = Blockly.utils.xml.textToDom(state.initialSerialized.value);
      Blockly.Xml.domToWorkspace(xml, state.workspace);
    } else {
      Blockly.serialization.workspaces.load(JSON.parse(state.initialSerialized.value), state.workspace);
    }
    updatePython();
  });
}

async function init() {
  ensureRuntimeStyles();
  defineXEduHubBlocks(Blockly, pythonGenerator);
  bindUI();
  state.toolboxVariants = await loadToolboxes();
  resetCategoryVisibility(state.toolboxVariants?.official || normalizeCategoryMeta(getConfigValue('defaultXEduHubToolbox', {})));
  state.workspace = Blockly.inject('blocklyDiv', {
    toolbox: getActiveToolbox(),
    renderer: 'zelos',
    rendererOverrides: {
      ADD_START_HATS: true,
      CORNER_RADIUS: 8,
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

  const workspaceUrl = String(getConfigValue('workspaceUrl', ''));
  if (workspaceUrl) {
    const workspaceText = await fetchText(workspaceUrl);
    const trimmed = workspaceText.trim();
    state.initialSerialized = { kind: trimmed.startsWith('<xml') ? 'xml' : 'json', value: trimmed };
    if (state.initialSerialized.kind === 'xml') {
      const xml = Blockly.utils.xml.textToDom(trimmed);
      Blockly.Xml.domToWorkspace(xml, state.workspace);
    } else {
      Blockly.serialization.workspaces.load(JSON.parse(trimmed), state.workspace);
    }
  }

  state.workspace.addChangeListener(() => updatePython());
  state.workspace.addChangeListener((event) => {
    if (event?.type === 'toolbox_item_select') {
      queueToolboxRowStyling();
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
    workspaceLabel.textContent = String(getConfigValue('workspaceTitle', '')) || '当前 Blockly 练习';
  }

  const toolboxSwitchEnabled = Boolean(getConfigValue('toolboxSwitchEnabled', true));
  const hasCourseCustom = state.toolboxVariants.hasCourseCustom;
  const controlToggle = document.getElementById('controlPanelToggleBtn');
  const modeSwitch = document.getElementById('toolboxModeSwitch');
  const packPanel = document.getElementById('toolboxPackPanel');
  const extendFab = document.getElementById('blocklyExtendFab');
  if (controlToggle) {
    controlToggle.style.display = toolboxSwitchEnabled ? 'inline-flex' : 'none';
  }
  if (modeSwitch) {
    modeSwitch.style.display = hasCourseCustom ? 'grid' : 'none';
  }
  if (packPanel) {
    packPanel.style.display = toolboxSwitchEnabled ? 'block' : 'none';
  }
  if (extendFab) {
    extendFab.style.display = 'inline-flex';
    extendFab.disabled = !toolboxSwitchEnabled;
    extendFab.title = toolboxSwitchEnabled ? '增加积木包' : '当前模式不可导入积木包';
  }

  syncToolboxModeButtons();
  renderToolboxPacks();
  renderGroupDrawer();
  syncToolboxMeta();
  setMoreMenuOpen(false);
  setControlPanelOpen(false);
  setCodePanelVisible(false);
  queueToolboxRowStyling();

  const debugDetails = document.getElementById('resultDebugDetails');
  if (debugDetails) {
    debugDetails.open = Boolean(state.panelCollapsedState.debugOpen);
  }

  const runBadge = document.getElementById('resultRunBadge');
  if (runBadge) {
    runBadge.classList.remove('is-success', 'is-error');
    runBadge.textContent = '等待运行';
  }

  const practiceLabel = String(getConfigValue('practiceLabel', ''));
  const practiceKind = String(getConfigValue('practiceKind', ''));
  const practiceUrl = String(getConfigValue('practiceUrl', ''));
  const practiceLaunchUrl = String(getConfigValue('practiceLaunchUrl', ''));
  const practiceBtn = document.getElementById('practiceBtn');
  const practiceMeta = document.getElementById('practiceMeta');
  if (practiceLabel) {
    if (practiceMeta) {
      practiceMeta.textContent = `关联代码：${practiceLabel}${practiceKind ? `（${practiceKind}）` : ''}`;
    }
    if (practiceBtn) {
      practiceBtn.style.display = 'inline-flex';
      practiceBtn.href = practiceLaunchUrl || practiceUrl || '#';
    }
  } else if (practiceMeta) {
    practiceMeta.textContent = '当前没有关联的代码文件';
  }

  updatePython();
}

init().catch((error) => {
  setPythonCode(`# Blockly 初始化失败\n# ${error.message || '未知错误'}`);
  const toolboxLabel = document.getElementById('toolboxLabel');
  if (toolboxLabel) {
    toolboxLabel.textContent = '初始化失败';
  }
});
