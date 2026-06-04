export async function importRemoteCourseForTestingFlow(resource, deps = {}) {
  let imported = null;
  try {
    imported = await deps.importRemoteCourse(resource, { silent: true });
  } catch (error) {
    deps.alertUser(deps.extractApiErrorMessage(error, '导入失败'));
    return;
  }
  if (!imported) return;
  const mapped = deps.mapRemoteExperimentToLocalCourse(imported, deps.activeSectionIndex(), deps.activeExperimentIndex());
  deps.setActiveSectionIndex(mapped.sectionIndex);
  deps.setActiveExperimentIndex(mapped.experimentIndex);
  deps.showDetailView(imported);
  await deps.testCurrentExperiment(imported);
}

export async function deleteCourseFlow(course, deps = {}) {
  if (!course || course.source !== 'local') return;
  const title = course.title || '未命名课程';
  const ok = await deps.openResourcesConfirm({
    title: '删除课程',
    message: `确认删除课程「${title}」？仅从列表移除，不会删除磁盘文件。`,
    confirmText: '删除',
    cancelText: '取消',
  });
  if (!ok) return;
  deps.setLocalCourses(deps.localCourses.filter((item) => item.id !== course.id));
  deps.persistLocalCoursesState();
  deps.buildFilterOptions();
  deps.applyFilters();
  deps.showListView();
  deps.alertUser('课程已删除。');
}

export function resolveRepoBrowserUrlFlow(path, resource = null, deps = {}) {
  const cleanPath = path.replace(/^\/+/, '');
  const source = deps.getResourceSourceContext(resource);
  if (!source.repoUrl) return deps.resolveResourceUrl(cleanPath, resource);
  const branch = source.branch || 'main';
  return `${source.repoUrl}/src/${branch}/${cleanPath}`;
}

export function resolveLocalPathFlow(basePath, targetPath) {
  if (!basePath) return '';
  const normalizedBase = basePath.toString();
  const normalizedTarget = (targetPath || '').toString();
  if (!normalizedTarget) return normalizedBase;
  if (/^[a-zA-Z]:[\\/]/.test(normalizedTarget) || normalizedTarget.startsWith('/')) {
    return normalizedTarget;
  }
  const separator = normalizedBase.includes('\\') ? '\\' : '/';
  const cleanBase = normalizedBase.replace(/[\\/]+$/, '');
  const cleanTarget = normalizedTarget.replace(/^[\\/]+/, '');
  return `${cleanBase}${separator}${cleanTarget}`;
}

export async function openLocalPathFlow(targetPath, electronAPI = window.electronAPI) {
  if (!targetPath) return;
  try {
    if (electronAPI && typeof electronAPI.invoke === 'function') {
      await electronAPI.invoke('open-path', targetPath);
      return;
    }
  } catch (error) {
    console.error('打开本地路径失败:', error);
  }
}

export function updateSourceInfoFlow({ documentRef = document, isMockData, remoteSources, repoUrl, submitUrl } = {}) {
  const hint = documentRef.getElementById('resources-source-hint');
  const repoBtn = documentRef.getElementById('resources-repo-btn');
  const submitBtn = documentRef.getElementById('resources-submit-btn');
  const createSubmitBtn = documentRef.getElementById('resources-create-submit-btn');

  if (hint) {
    if (isMockData) {
      hint.textContent = '当前为示例数据（未连接资源库）';
    } else if (remoteSources.length > 1) {
      hint.textContent = `课程源: 已连接 ${remoteSources.length} 个`;
    } else if (repoUrl) {
      hint.textContent = `资源库: ${repoUrl}`;
    } else {
      hint.textContent = '未配置资源库';
    }
  }

  if (repoBtn) {
    repoBtn.disabled = isMockData || !repoUrl;
  }

  if (submitBtn) {
    submitBtn.disabled = isMockData || !submitUrl;
  }

  if (createSubmitBtn) {
    createSubmitBtn.disabled = isMockData || !submitUrl;
  }
}

export function renderEmptyStateFlow(message, { documentRef = document } = {}) {
  const container = documentRef.getElementById('resources-list');
  const empty = documentRef.getElementById('resources-empty');
  const count = documentRef.getElementById('resources-count');

  if (!container || !empty) return;

  container.innerHTML = '';
  empty.style.display = 'flex';
  empty.textContent = message;
  if (count) {
    count.textContent = '0 门课程';
  }
}

export function applyResourcesIndexFlow(indexData, options = {}, deps = {}) {
  deps.setResourcesMeta(indexData || {});
  let remoteList = [];
  if (Array.isArray(indexData)) {
    remoteList = indexData;
  } else if (Array.isArray(indexData?.resources)) {
    remoteList = indexData.resources;
  } else if (Array.isArray(indexData?.items)) {
    remoteList = indexData.items;
  }

  deps.setSubmitUrl(options.submitUrl || '');
  deps.setRepoUrl(options.repoUrl || '');
  deps.setRawBaseUrl(options.rawBaseUrl || '');
  deps.setIndexBranch(options.branch || deps.indexBranch || 'main');
  deps.setRemoteSources(Array.isArray(options.sources) ? options.sources : []);
  deps.setIsMockData(Boolean(options.isMock));
  deps.setRemoteSource(options.remoteSource || 'remote');

  const normalizedRemote = remoteList.map((item) => ({ ...item, source: options.remoteSource || 'remote' }));
  const normalizedLocal = deps.localCourses.map((item) => ({ ...item, source: 'local' }));
  const localIds = new Set(normalizedLocal.map((item) => item.id));
  const merged = [...normalizedLocal, ...normalizedRemote.filter((item) => !localIds.has(item.id))];
  deps.setResourcesCache(merged);

  deps.buildFilterOptions();
  deps.updateSourceInfo();
  deps.applyFilters();
}

export async function openExternalFlow(url, electronAPI = window.electronAPI) {
  if (!url) return;
  try {
    if (electronAPI && typeof electronAPI.openExternal === 'function') {
      await electronAPI.openExternal(url);
      return;
    }
    if (electronAPI && typeof electronAPI.invoke === 'function') {
      await electronAPI.invoke('open-external', url);
      return;
    }
  } catch (error) {
    console.error('打开外部链接失败:', error);
  }

  window.open(url, '_blank');
}
