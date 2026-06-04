export function normalizeQuickFormSettings(raw = {}, fallbackBaseUrl = 'https://quickform.cn') {
  return {
    enabled: raw?.enabled === true || raw?.enabled === 'true',
    base_url: (raw?.base_url || fallbackBaseUrl || '').trim() || fallbackBaseUrl,
    username: (raw?.username || '').trim(),
    password: raw?.password || '',
  };
}

export function normalizeQuickFormConfig(raw = {}, fallbackBaseUrl = '') {
  const config = {
    enabled: raw?.enabled !== false && raw?.enabled !== 'false',
    apiid: (raw?.apiid || '').trim(),
    task_name: (raw?.task_name || raw?.name || '').trim(),
    task_intro: (raw?.task_intro || '').trim(),
    submit_url: (raw?.submit_url || '').trim(),
    query_url: (raw?.query_url || '').trim(),
    summary_url: (raw?.summary_url || '').trim(),
    report_url: (raw?.report_url || '').trim(),
    html_path: (raw?.html_path || '').trim(),
  };
  const baseUrl = (fallbackBaseUrl || '').trim().replace(/\/$/, '');
  if (config.apiid && baseUrl) {
    if (!config.submit_url) config.submit_url = `${baseUrl}/api/${config.apiid}`;
    if (!config.query_url) config.query_url = `${config.submit_url}/all`;
    if (!config.summary_url) config.summary_url = config.submit_url;
  }
  return config;
}

export function normalizeCourseQuickFormDefaults(raw = {}) {
  return {
    enabled: raw?.enabled === true || raw?.enabled === 'true',
    html_path: (raw?.html_path || '').trim(),
  };
}

export function getCourseQuickFormDefaults(resource = {}) {
  return normalizeCourseQuickFormDefaults(resource?.quickform_defaults || {});
}

export function getMutableExperiment(resource, sectionIndex, expIndex) {
  const sections = Array.isArray(resource?.sections)
    ? resource.sections
    : Array.isArray(resource?.lessons)
      ? resource.lessons
      : Array.isArray(resource?.modules)
        ? resource.modules
        : Array.isArray(resource?.experiments)
          ? [{ title: '实验列表', experiments: resource.experiments }]
          : null;
  const section = Array.isArray(sections) ? sections[sectionIndex] : null;
  let experiments = null;
  if (Array.isArray(section?.experiments)) {
    experiments = { list: section.experiments, key: 'experiments' };
  } else if (Array.isArray(section?.items)) {
    experiments = { list: section.items, key: 'items' };
  }
  const experiment = experiments?.list?.[expIndex] || null;
  return { sections, section, experiments, experiment };
}

export function getEffectiveExperimentQuickForm(resource, sectionIndex, expIndex, experimentOverride = null, { quickFormSettings, normalizeConfig = normalizeQuickFormConfig } = {}) {
  const defaults = getCourseQuickFormDefaults(resource);
  const experiment = experimentOverride || getMutableExperiment(resource, sectionIndex, expIndex).experiment || {};
  return normalizeConfig({
    ...(defaults || {}),
    ...(experiment?.quickform || {}),
    html_path: (experiment?.quickform?.html_path || defaults?.html_path || '').trim(),
  }, quickFormSettings?.base_url || '');
}

export function isExperimentQuickFormEnabled(resource, sectionIndex, expIndex, experimentOverride = null, context = {}) {
  const config = getEffectiveExperimentQuickForm(resource, sectionIndex, expIndex, experimentOverride, context);
  return Boolean(config.enabled && config.submit_url);
}

export function getExperimentHtmlOptions(experiment, getExperimentFileOverview) {
  const overview = getExperimentFileOverview(experiment || {});
  return (overview?.htmlFiles || [])
    .map((file) => (file?.path || '').trim())
    .filter(Boolean);
}

export function buildQuickFormTaskConfig(task = {}, htmlPath = '', fallbackBaseUrl = '') {
  return normalizeQuickFormConfig({
    enabled: true,
    apiid: task.apiid || '',
    task_name: task.task_name || task.name || '',
    task_intro: task.task_intro || '',
    submit_url: task.submit_url || '',
    query_url: task.query_url || '',
    summary_url: task.summary_url || '',
    report_url: task.report_url || '',
    html_path: htmlPath || task.html_path || '',
  }, fallbackBaseUrl);
}

export function getApiBaseUrl(apiClient) {
  return (apiClient.baseURL || 'http://127.0.0.1:5123').replace(/\/$/, '');
}

export function encodePathToken(value = '') {
  const bytes = new TextEncoder().encode(String(value || ''));
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function buildLocalQuickFormPreviewUrl(resource, filePath = '', apiBaseUrl) {
  const basePath = (resource?.local_path || '').trim();
  const relPath = String(filePath || '').replace(/^\/+/, '');
  if (!basePath || !relPath) return '';
  const encodedRelPath = relPath
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  return `${apiBaseUrl}/api/resources/local-file/${encodePathToken(basePath)}/${encodedRelPath}`;
}
