export function getCategoryIconSvg(name, categoryIcons, defaultIcon) {
  return categoryIcons[name] || defaultIcon;
}

export function syncCategoryVisuals(container, name, color, selected = false, { getCategoryIconSvg } = {}) {
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

export function resetCategoryVisibility(toolbox, state, walkToolboxItems, resolveCategoryColour, defaultCategoryColour) {
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
    state.categoryColors[name] = resolveCategoryColour(name, item.colour || state.categoryColors[name] || defaultCategoryColour);
    if (item.description) {
      state.categoryNotes[name] = item.description;
    }
  });
  state.categoryVisibility = nextVisibility;
}

export function renderGroupDrawer({
  documentRef = document,
  state,
  getSourceToolbox,
  collectCategoryNames,
  resolveCategoryColour,
  getCategoryIconSvg,
  getActiveToolbox,
  queueToolboxRowStyling,
}) {
  const body = documentRef.getElementById('groupDrawerBody');
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

export function setControlPanelOpen(open, state, documentRef = document) {
  state.controlPanelState.open = Boolean(open);
  documentRef.getElementById('controlPanel')?.classList.toggle('open', state.controlPanelState.open);
  documentRef.getElementById('controlPanelToggleBtn')?.setAttribute('aria-expanded', state.controlPanelState.open ? 'true' : 'false');
}

export function setMoreMenuOpen(open, state, classroomDefaults, documentRef = document) {
  state.toolbarOverflowState.menuOpen = Boolean(open);
  const menu = documentRef.getElementById('toolbarMoreMenu');
  const button = documentRef.getElementById('toolbarMoreBtn');
  if (menu) {
    menu.classList.toggle('open', state.toolbarOverflowState.menuOpen);
  }
  if (button) {
    button.setAttribute('aria-expanded', state.toolbarOverflowState.menuOpen ? 'true' : 'false');
    button.textContent = state.toolbarOverflowState.menuOpen
      ? classroomDefaults.toolbarMoreOpenLabel
      : classroomDefaults.toolbarMoreClosedLabel;
  }
}

export function moveStudentActionsToTopbar(isTeacherMode, studentQuickActionIds, documentRef = document) {
  let quickActions = documentRef.getElementById('toolbarQuickActions');
  const moreGroup = documentRef.querySelector('.toolbar-more');
  if (!quickActions && moreGroup?.parentElement) {
    quickActions = documentRef.createElement('div');
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
  studentQuickActionIds.forEach((id) => {
    const action = documentRef.getElementById(id);
    if (!action) {
      return;
    }
    action.classList.add('toolbar-quick-action');
    quickActions.appendChild(action);
  });
}

export function configureRoleScopedToolbar({
  isTeacherMode,
  setControlPanelOpen,
  moveStudentActionsToTopbar,
  documentRef = document,
}) {
  const studentMode = !isTeacherMode();
  const controlPanel = documentRef.getElementById('controlPanel');
  const controlToggle = documentRef.getElementById('controlPanelToggleBtn');
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

export function setCodePanelVisible(visible, state, queueBlocklyResize, documentRef = document) {
  state.codePanelVisible = Boolean(visible);
  documentRef.getElementById('blocklyLayout')?.classList.toggle('code-collapsed', !state.codePanelVisible);
  const codeDock = documentRef.getElementById('codeDock');
  codeDock?.classList.toggle('collapsed', !state.codePanelVisible);
  const button = documentRef.getElementById('codeDockToggleBtn');
  if (button) {
    button.setAttribute('aria-expanded', state.codePanelVisible ? 'true' : 'false');
    button.setAttribute('aria-label', state.codePanelVisible ? '收起右侧工作栏' : '展开右侧工作栏');
    button.classList.toggle('is-collapsed', !state.codePanelVisible);
  }
  queueBlocklyResize();
}

export function clampCodeDockWidth(width, fallback, min, max) {
  const numeric = Number(width);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.round(numeric)));
}

export function readPersistedCodeDockWidth(storageKey, clampWidth, fallback) {
  try {
    const raw = window.localStorage?.getItem(storageKey);
    return raw ? clampWidth(raw) : fallback;
  } catch (_) {
    return fallback;
  }
}

export function persistCodeDockWidth(width, storageKey, clampWidth) {
  try {
    window.localStorage?.setItem(storageKey, String(clampWidth(width)));
  } catch (_) {
    // ignore storage failures
  }
}

export function applyCodeDockWidth(width, state, { persist = false } = {}, deps = {}) {
  const nextWidth = deps.clampWidth(width);
  state.codeDockWidth = nextWidth;
  deps.documentRef?.documentElement?.style.setProperty('--code-dock-open-width', `${nextWidth}px`);
  const handle = deps.documentRef?.getElementById('codeDockResizeHandle');
  if (handle) {
    handle.setAttribute('aria-valuemin', String(deps.minWidth));
    handle.setAttribute('aria-valuemax', String(deps.maxWidth));
    handle.setAttribute('aria-valuenow', String(nextWidth));
  }
  if (persist) {
    deps.persistWidth(nextWidth);
  }
}

export function bindCodeDockResize(state, deps = {}) {
  const handle = deps.documentRef?.getElementById('codeDockResizeHandle');
  const codeDock = deps.documentRef?.getElementById('codeDock');
  const layout = deps.documentRef?.getElementById('blocklyLayout');
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
    deps.applyWidth(nextWidth);
    deps.queueResize();
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
    deps.persistWidth(state.codeDockWidth);
    state.codeDockResizing = null;
    deps.queueResize();
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
    deps.applyWidth(state.codeDockWidth + delta, { persist: true });
    deps.queueResize();
  });
}

export function queueBlocklyResize(state, BlocklyRef, documentRef = document) {
  if (!state.workspace) {
    return;
  }
  window.requestAnimationFrame(() => {
    if (state.workspace) {
      BlocklyRef.svgResize(state.workspace);
    }
  });
  if (state.codePanelResizeTimer) {
    window.clearTimeout(state.codePanelResizeTimer);
  }
  state.codePanelResizeTimer = window.setTimeout(() => {
    state.codePanelResizeTimer = null;
    if (state.workspace) {
      BlocklyRef.svgResize(state.workspace);
    }
  }, 280);
}

export function hexToRgba(hex, alpha) {
  const text = String(hex || '').replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(text)) {
    return `rgba(79,107,255,${alpha})`;
  }
  const red = parseInt(text.slice(0, 2), 16);
  const green = parseInt(text.slice(2, 4), 16);
  const blue = parseInt(text.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

export function getToolboxCategoryName(item) {
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

export function getToolboxRowElement(item) {
  const div = typeof item?.getDiv === 'function' ? item.getDiv() : null;
  if (!div) {
    return null;
  }
  return div.querySelector('.blocklyToolboxCategory, .blocklyTreeRow') || div;
}

export function getAllToolboxItems(state) {
  const toolbox = state.workspace?.getToolbox?.();
  if (!toolbox || typeof toolbox.getToolboxItems !== 'function') {
    return [];
  }
  return toolbox.getToolboxItems() || [];
}

export function findToolboxItemByName(state, getName, name) {
  const targetName = String(name || '').trim();
  if (!targetName) {
    return null;
  }
  return getAllToolboxItems(state).find((item) => String(getName(item) || '').trim() === targetName) || null;
}

export function getSelectedToolboxCategoryMeta(state) {
  const toolbox = state.workspace?.getToolbox?.();
  if (!toolbox || typeof toolbox.getSelectedItem !== 'function') {
    return { name: '', custom: '' };
  }
  const selected = toolbox.getSelectedItem?.();
  const name = getToolboxCategoryName(selected);
  const custom = String(selected?.toolboxItemDef_?.custom || '').trim().toUpperCase();
  return { name, custom };
}

export function isVariableCategorySelected(state) {
  const { name, custom } = getSelectedToolboxCategoryMeta(state);
  if (custom === 'VARIABLE' || custom === 'VARIABLE_DYNAMIC') {
    return true;
  }
  return name.includes('变量');
}

export function styleToolboxCategoryRows(state, deps = {}) {
  const toolboxItems = deps.getAllItems();
  if (toolboxItems.length === 0) {
    deps.documentRef.querySelectorAll('.blocklyToolboxCategory, .blocklyTreeRow').forEach((row) => {
      const labelEl = row.querySelector('.blocklyToolboxCategoryLabel, .blocklyTreeLabel');
      const label = labelEl?.textContent?.trim() || '';
      const color = state.categoryColors[label];
      if (!color) {
        return;
      }
      const isSelected = row.classList.contains('blocklyToolboxSelected') || row.classList.contains('blocklyTreeSelected');
      deps.syncCategoryVisuals(row, label, color, isSelected);
    });
    return;
  }
  toolboxItems.forEach((item) => {
    const row = deps.getRow(item);
    const label = deps.getName(item);
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
    deps.syncCategoryVisuals(row, label, color, isSelected);
    row.style.borderLeft = `2px solid ${deps.hexToRgba(color, isSelected ? 0.42 : 0.24)}`;
    row.style.backgroundColor = deps.hexToRgba(color, isSelected ? 0.08 : 0.025);
    row.style.borderColor = deps.hexToRgba(color, isSelected ? 0.18 : 0.08);
    row.style.boxShadow = `inset 0 0 0 1px ${deps.hexToRgba(color, isSelected ? 0.10 : 0.04)}`;
  });
}

export function alignToolboxFlyout(documentRef = document) {
  documentRef.querySelectorAll('.blocklyToolboxFlyout').forEach((flyout) => {
    flyout.style.setProperty('transform', 'translate(0px, 0px)', 'important');
  });
}

export function resetToolboxFlyoutScroll(state, documentRef = document) {
  const flyout = state.workspace?.getFlyout?.();
  if (flyout && typeof flyout.scrollToStart === 'function') {
    flyout.scrollToStart();
    return;
  }
  documentRef.querySelectorAll('.blocklyFlyoutScrollbar, .blocklyScrollbarVertical').forEach((node) => {
    if (typeof node.scrollTo === 'function') {
      node.scrollTo({ top: 0, left: 0 });
    }
  });
}

export function alignDropdownFieldArrows() {
  return;
}

export function queueToolboxRowStyling(deps = {}) {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      deps.styleRows();
      deps.alignFlyout();
      deps.alignDropdown();
    });
  });
}

export function buildToolboxPackList(state) {
  const packs = [{ name: '课程积木', source: '课程' }];
  const extraCount = Number(state.toolboxVariants.customPackCount || 0);
  for (let index = 0; index < extraCount; index += 1) {
    packs.push({ name: `扩展积木包 ${index + 1}`, source: '导入' });
  }
  return packs;
}

export function renderToolboxPacks(state, documentRef = document) {
  state.toolboxPacks = buildToolboxPackList(state);
  const list = documentRef.getElementById('toolboxPackList');
  if (!list) {
    return;
  }
  list.innerHTML = state.toolboxPacks.map((pack) => `<div class="toolbox-pack-item"><span>${pack.name}</span><small>${pack.source}</small></div>`).join('');
}

export function getToolboxItemColour(item, fallbackName = '', state, resolveCategoryColour, defaultCategoryColour) {
  const itemColour = String(item?.toolboxItemDef_?.colour || '').trim();
  if (itemColour) {
    return resolveCategoryColour(fallbackName, itemColour);
  }
  const fallback = state.categoryColors[String(fallbackName || '').trim()];
  return resolveCategoryColour(fallbackName, fallback || defaultCategoryColour);
}

export function selectToolboxItem(item, state, resetToolboxFlyoutScrollFn) {
  const toolbox = state.workspace?.getToolbox?.();
  if (!toolbox || typeof toolbox.setSelectedItem !== 'function' || !item) {
    return;
  }
  toolbox.setSelectedItem(item);
  queueMicrotask(() => {
    resetToolboxFlyoutScrollFn();
  });
}

function collectNestedLeafCategories(items, result = []) {
  (Array.isArray(items) ? items : []).forEach((item) => {
    if (!item || item.kind !== 'category') {
      return;
    }
    const childCategories = (Array.isArray(item.contents) ? item.contents : [])
      .filter((child) => child && child.kind === 'category');
    if (childCategories.length > 0) {
      collectNestedLeafCategories(childCategories, result);
      return;
    }
    result.push(item);
  });
  return result;
}

function resolveLiveToolboxItemByName(liveItemsByName, childName, sectionName) {
  return liveItemsByName.get(childName)
    || liveItemsByName.get(sectionName)
    || null;
}

export function buildSideNavModel(state, deps = {}) {
  const liveItems = deps.getAllItems();
  const liveItemsByName = new Map(liveItems.map((item) => [deps.getName(item), item]).filter(([name]) => name));
  const sourceSections = (deps.getSourceToolbox()?.contents || [])
    .filter((item) => item && item.kind === 'category');

  const groupedSections = sourceSections
    .map((section) => {
      const name = String(section.name || '').trim();
      const leafCategories = collectNestedLeafCategories(section.contents);
      const firstLiveLeaf = leafCategories
        .map((child) => resolveLiveToolboxItemByName(liveItemsByName, String(child?.name || '').trim(), name))
        .find(Boolean);
      return {
        item: firstLiveLeaf || liveItemsByName.get(name) || null,
        name,
        colour: deps.resolveCategoryColour(name, section.colour || state.categoryColors[name] || deps.defaultCategoryColour),
        children: leafCategories
          .map((child) => {
            const childName = String(child.name || '').trim();
            if (!childName) {
              return null;
            }
            return {
              item: resolveLiveToolboxItemByName(liveItemsByName, childName, name),
              name: childName,
              colour: child.colour || deps.getItemColour(resolveLiveToolboxItemByName(liveItemsByName, childName, name), childName),
            };
          })
          .filter((child) => child && child.name),
      };
    })
    .filter((section) => section.name && section.children.length > 0);

  if (groupedSections.length > 0) {
    return groupedSections;
  }

  return liveItems
    .map((item) => {
      const name = deps.getName(item);
      return {
        item,
        name,
        colour: deps.getItemColour(item, name),
        children: [{ item, name, colour: deps.getItemColour(item, name) }],
      };
    })
    .filter((section) => section.name);
}

export function renderCustomSideNav(state, deps = {}) {
  const root = deps.documentRef.getElementById('blocklySideNavBody');
  if (!root) {
    return;
  }
  const sections = deps.buildSideNavModel();
  const selectedName = String(deps.getSelectedMeta().name || '').trim();
  const taskRegistry = deps.getTaskRegistry();
  const tasksByFamilyLabel = new Map((taskRegistry.tasks || []).map((task) => [String(task?.family_label || '').trim(), task]));
  root.innerHTML = '';

  sections.forEach((section) => {
    const collapsed = Boolean(state.sideNavCollapsed[section.name]);
    const sectionEl = deps.documentRef.createElement('section');
    sectionEl.className = 'blockly-side-section';
    sectionEl.classList.toggle('is-collapsed', collapsed);
    sectionEl.style.setProperty('--xedu-section-color', section.colour);

    const heading = deps.documentRef.createElement('button');
    heading.type = 'button';
    heading.className = 'blockly-side-section-head';
    heading.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    heading.innerHTML = `
      <span class="blockly-side-section-icon">${deps.getCategoryIconSvg(section.name)}</span>
      <span class="blockly-side-section-title">${section.name}</span>
      <span class="blockly-side-section-chevron" aria-hidden="true">
        <svg viewBox="0 0 16 16" fill="none">
          <path d="m5.2 6.4 2.8 2.8 2.8-2.8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </span>
    `;
    heading.addEventListener('click', () => {
      state.sideNavCollapsed[section.name] = !Boolean(state.sideNavCollapsed[section.name]);
      deps.renderCustomSideNav();
    });
    sectionEl.appendChild(heading);

    const list = deps.documentRef.createElement('div');
    list.className = 'blockly-side-section-list';
    section.children.forEach((child) => {
      const button = deps.documentRef.createElement('button');
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
        <span class="blockly-side-leaf-icon">${deps.getCategoryIconSvg(child.name)}</span>
        <span class="blockly-side-leaf-label">${child.name}</span>
      `;
      button.addEventListener('click', () => {
        if (unavailable) {
          deps.setResultWarningView(deps.buildExperimentalTaskPreflight([task], { blocked: true }));
          return;
        }
        const liveItem = child.item || deps.findItemByName?.(child.name);
        if (!liveItem) {
          return;
        }
        deps.selectToolboxItem(liveItem);
      });
      list.appendChild(button);
    });
    sectionEl.appendChild(list);
    root.appendChild(sectionEl);
  });
}

export function getFirstLeafToolboxItem(item) {
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

export function normalizeSelectedToolboxItem(state) {
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

export function ensureInitialToolboxSelection(state) {
  const toolbox = state.workspace?.getToolbox?.();
  if (!toolbox || typeof toolbox.getSelectedItem !== 'function' || typeof toolbox.setSelectedItem !== 'function') {
    return;
  }
  if (toolbox.getSelectedItem()) {
    normalizeSelectedToolboxItem(state);
    return;
  }
  const firstSelectable = (toolbox.getToolboxItems?.() || [])
    .map((item) => getFirstLeafToolboxItem(item))
    .find(Boolean);
  if (firstSelectable) {
    toolbox.setSelectedItem(firstSelectable);
  }
}
