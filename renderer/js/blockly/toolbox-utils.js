const CATEGORY_REQUIRED_NAMES = new Set([
  'XEdu',
  'XEduHub',
  '媒体与设备',
  '调试与扩展',
  '图像视频',
  '通信控制',
  '核心语法',
  '结果处理',
  '调试扩展',
  '图像分类',
  '目标检测',
  'OCR',
  '关键点识别',
  '内容生成',
  '图像分割',
  '深度估计',
  '多模态特征',
  '全景感知',
  '结果显示',
  '进阶调试',
  '核心积木',
  'L2 任务语义块',
  'XEduHub 教学',
  '基础逻辑',
  '拓展积木',
  '逻辑',
  '循环',
  '数学',
  '文本',
  '列表',
  '变量',
  '函数',
]);
const RUNNABLE_BLOCK_TYPES = new Set([
  'xeduhub_workflow_create',
  'xeduhub_workflow_set_task',
  'xeduhub_workflow_infer',
  'xeduhub_workflow_create_var',
  'xeduhub_workflow_infer_var',
  'xeduhub_workflow_infer_pair',
  'xeduhub_cv_open_camera',
  'xeduhub_cv_open_video',
  'xeduhub_http_open_stream',
  'xeduhub_http_get',
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
  const normalizeCategoryName = (value) => String(value || '').trim();
  const normalizeBuiltinCustomKey = (value) => {
    const raw = String(value || '').trim();
    if (!raw) {
      return '';
    }
    const upper = raw.toUpperCase();
    if (upper === 'VARIABLE' || upper === 'VARIABLE_DYNAMIC' || upper === 'PROCEDURE') {
      return upper;
    }
    return raw;
  };
  const base = normalizeCategoryMeta(baseToolbox && baseToolbox.kind === 'categoryToolbox' ? baseToolbox : { kind: 'categoryToolbox', contents: [] });
  const custom = normalizeCategoryMeta(customToolbox && customToolbox.kind === 'categoryToolbox' ? customToolbox : { kind: 'categoryToolbox', contents: [] });
  const merged = clone(base);
  const byName = new Map((merged.contents || []).map((item) => {
    if (item && item.kind === 'category') {
      item.name = normalizeCategoryName(item.name);
      item.custom = normalizeBuiltinCustomKey(item.custom);
    }
    return [item?.name || '', item];
  }));

  (custom.contents || []).forEach((item) => {
    if (!item || item.kind !== 'category') {
      return;
    }
    item.name = normalizeCategoryName(item.name);
    item.custom = normalizeBuiltinCustomKey(item.custom);
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
      existing.custom = normalizeBuiltinCustomKey(existing.custom);
      const existingCustom = typeof existing.custom === 'string' ? existing.custom : '';
      const incomingCustom = typeof item.custom === 'string' ? item.custom : '';
      if (incomingCustom) {
        existing.custom = incomingCustom;
        delete existing.contents;
        return;
      }
      if (existingCustom) {
        // Keep built-in dynamic categories (VARIABLE / PROCEDURE) from being downgraded to static lists.
        return;
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
