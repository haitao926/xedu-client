export async function persistCourseToolbox(toolbox, deps = {}) {
  const endpoint = String(deps.getConfigValue('toolboxSaveUrl', ''));
  const rootToken = String(deps.getConfigValue('rootToken', ''));
  if (!endpoint || !rootToken) {
    return { success: false, message: '当前页面未绑定课程目录，已保留本次导入结果' };
  }
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      role: String(deps.getConfigValue('userRole', '')),
      root_token: rootToken,
      workspace_rel: String(deps.getConfigValue('workspaceRelPath', '')),
      toolbox_rel: String(deps.getConfigValue('toolboxRelPath', '')),
      toolbox,
    }),
  });
  let payload = null;
  try {
    payload = await deps.parseJsonResponse(response, '保存课程积木失败');
  } catch (_) {
    payload = null;
  }
  if (!response.ok || !payload?.success) {
    return { success: false, message: payload?.message || `服务返回 ${response.status}` };
  }
  if (payload?.toolbox_path) {
    deps.setToolboxRelPath(String(payload.toolbox_path));
  }
  return { success: true, message: payload?.message || '课程积木已保存' };
}

export function findToolboxFileInZip(zip) {
  const entries = Object.values(zip?.files || {}).filter((entry) => entry && !entry.dir);
  return zip.file('toolbox.json')
    || zip.file('toolbox.toolbox.json')
    || entries.find((entry) => /(?:^|\/)toolbox\.json$/i.test(entry.name))
    || entries.find((entry) => /\.toolbox\.json$/i.test(entry.name));
}

export function normalizeImportedToolboxPayload(payload) {
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

export function parseJsonWithBom(text) {
  const clean = String(text || '').replace(/^\uFEFF/, '');
  return JSON.parse(clean);
}

export async function importToolboxPack(file, deps = {}) {
  let importedToolbox = null;
  if (file.name.endsWith('.zip')) {
    const zipLoader = deps.JSZipLoader || (async () => (await import('jszip')).default);
    const JSZip = await zipLoader();
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
  const schema = await deps.validateToolboxWithApi(importedToolbox);
  if (!schema.valid) {
    throw new Error(`积木包格式不正确：${schema.errors[0] || '未知错误'}`);
  }
  const safeToolbox = schema.normalized || importedToolbox;
  const currentCourseToolbox = deps.getSourceToolbox();
  deps.state.toolboxVariants.course = deps.mergeToolboxes(currentCourseToolbox, safeToolbox);
  deps.state.toolboxVariants.hasCourseCustom = true;
  deps.state.toolboxVariants.customPackCount = Number(deps.state.toolboxVariants.customPackCount || 0) + 1;
  deps.resetCategoryVisibility(deps.state.toolboxVariants.course);
  if (deps.state.workspace) {
    deps.state.workspace.updateToolbox(deps.getActiveToolbox());
  }
  deps.renderToolboxPacks();
  deps.renderGroupDrawer();
  deps.syncToolboxMeta();
  deps.queueToolboxRowStyling();
  const saved = await deps.persistCourseToolbox(deps.state.toolboxVariants.course);
  if (!saved.success) {
    console.warn('Toolbox pack imported but not persisted:', saved.message);
  }
}
