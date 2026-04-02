const CATEGORY_REQUIRED_NAMES = new Set(['核心积木', 'L1 入门闭环', 'XEduHub 教学', '基础逻辑', '拓展积木']);
const RUNNABLE_BLOCK_TYPES = new Set([
  'xeduhub_classify_run',
  'xeduhub_detect_run',
  'xeduhub_ocr_run',
  'xeduhub_run_vision',
  'xeduhub_create_flow',
  'xeduhub_create_workflow',
]);

function clone(value) {
  return JSON.parse(JSON.stringify(value || {}));
}

async function fetchText(url) {
  if (!url) {
    return '';
  }
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error('加载失败');
  }
  return await response.text();
}

function normalizeCategoryMeta(toolbox) {
  const copy = clone(toolbox);
  copy.pedagogy_level_default = copy.pedagogy_level_default || 'ALL';
  (copy.contents || []).forEach((item) => {
    if (!item || (item.kind !== 'category' && item.kind !== 'label')) {
      return;
    }
    if (!item.level) {
      item.level = 'ALL';
    }
    if (typeof item.visible_by_default !== 'boolean') {
      item.visible_by_default = true;
    }
  });
  return copy;
}

function validateToolboxPayload(toolbox) {
  const errors = [];
  if (!toolbox || typeof toolbox !== 'object') {
    return { valid: false, errors: ['toolbox 必须是对象'] };
  }
  if (toolbox.kind !== 'categoryToolbox') {
    errors.push('toolbox.kind 必须是 categoryToolbox');
  }
  if (!Array.isArray(toolbox.contents)) {
    errors.push('toolbox.contents 必须是数组');
    return { valid: false, errors };
  }
  const unsafeInputPresetBlocks = new Set(['text_getSubstring', 'text_changeCase']);

  function validateInputNode(node, path) {
    if (!node || typeof node !== 'object') {
      errors.push(`${path} 必须是对象`);
      return;
    }
    if (!['block', 'shadow'].includes(node.kind)) {
      errors.push(`${path}.kind 必须是 block 或 shadow`);
      return;
    }
    if (!String(node.type || '').trim()) {
      errors.push(`${path}.type 不能为空`);
    }
    if (node.inputs && typeof node.inputs !== 'object') {
      errors.push(`${path}.inputs 必须是对象`);
      return;
    }
    Object.entries(node.inputs || {}).forEach(([key, child]) => {
      if (!String(key || '').trim()) {
        errors.push(`${path}.inputs 存在空 key`);
        return;
      }
      validateInputNode(child, `${path}.inputs[${key}]`);
    });
  }

  function validateNode(node, path) {
    if (!node || typeof node !== 'object') {
      errors.push(`${path} 必须是对象`);
      return;
    }
    if (!['category', 'block', 'shadow', 'label', 'sep'].includes(node.kind)) {
      errors.push(`${path}.kind 非法: ${node.kind || ''}`);
      return;
    }
    if (node.kind === 'category') {
      if (!String(node.name || '').trim()) {
        errors.push(`${path}.name 不能为空`);
      }
      if (node.contents != null) {
        if (!Array.isArray(node.contents)) {
          errors.push(`${path}.contents 必须是数组`);
          return;
        }
        node.contents.forEach((child, index) => validateNode(child, `${path}.contents[${index}]`));
      }
      return;
    }
    if (!['block', 'shadow'].includes(node.kind)) {
      return;
    }
    const blockType = String(node.type || '').trim();
    if (!blockType) {
      errors.push(`${path}.type 不能为空`);
    }
    if (node.inputs && typeof node.inputs !== 'object') {
      errors.push(`${path}.inputs 必须是对象`);
      return;
    }
    if (node.fields && typeof node.fields !== 'object') {
      errors.push(`${path}.fields 必须是对象`);
    }
    if (unsafeInputPresetBlocks.has(blockType) && node.inputs && Object.keys(node.inputs).length > 0) {
      errors.push(`${path} 不允许为 ${blockType} 预设 inputs`);
    }
    Object.entries(node.inputs || {}).forEach(([key, child]) => {
      if (!String(key || '').trim()) {
        errors.push(`${path}.inputs 存在空 key`);
        return;
      }
      validateInputNode(child, `${path}.inputs[${key}]`);
    });
  }

  toolbox.contents.forEach((item, index) => validateNode(item, `contents[${index}]`));
  return { valid: errors.length === 0, errors };
}

function mergeToolboxes(baseToolbox, customToolbox) {
  const base = normalizeCategoryMeta(baseToolbox && baseToolbox.kind === 'categoryToolbox' ? baseToolbox : { kind: 'categoryToolbox', contents: [] });
  const custom = normalizeCategoryMeta(customToolbox && customToolbox.kind === 'categoryToolbox' ? customToolbox : { kind: 'categoryToolbox', contents: [] });
  const merged = clone(base);
  const byName = new Map((merged.contents || []).map((item) => [item?.name || '', item]));

  (custom.contents || []).forEach((item) => {
    if (!item || item.kind !== 'category') {
      return;
    }
    const name = item.name || '';
    if (!name) {
      return;
    }
    if (byName.has(name)) {
      const existing = byName.get(name);
      existing.level = item.level || existing.level;
      if (typeof item.visible_by_default === 'boolean') {
        existing.visible_by_default = item.visible_by_default;
      }
      if (Array.isArray(item.contents) && item.contents.length > 0) {
        existing.contents = item.contents;
      }
      return;
    }
    merged.contents.push(item);
    byName.set(name, item);
  });

  base.contents.forEach((item) => {
    if (!item || item.kind !== 'category' || !CATEGORY_REQUIRED_NAMES.has(item.name)) {
      return;
    }
    const exists = (merged.contents || []).find((candidate) => candidate?.name === item.name);
    if (!exists) {
      merged.contents.push(item);
      return;
    }
    const existingTypes = new Set((exists.contents || []).map((block) => block?.type).filter(Boolean));
    (item.contents || []).forEach((block) => {
      if (!block?.type || existingTypes.has(block.type)) {
        return;
      }
      exists.contents = exists.contents || [];
      exists.contents.push(block);
    });
  });

  return merged;
}

export {
  CATEGORY_REQUIRED_NAMES,
  RUNNABLE_BLOCK_TYPES,
  clone,
  fetchText,
  mergeToolboxes,
  normalizeCategoryMeta,
  validateToolboxPayload,
};
