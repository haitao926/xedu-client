const courseSyncFingerprintIgnoredKeys = new Set([
  'sync',
  'origin',
  'local_path',
  'resource_handle',
  'updated_at',
  'created_at',
  'last_pull_at',
  'last_push_at',
  'last_backup_path',
  'last_pr_url',
  'last_local_fingerprint',
]);

const removedIntegrationCourseKey = 'quickform_defaults';
const removedIntegrationExperimentKey = 'quickform';

export function stripRemovedIntegrationMetadata(course = {}) {
  if (!course || typeof course !== 'object') return course;
  const nextCourse = { ...course };
  delete nextCourse[removedIntegrationCourseKey];

  const cleanExperiment = (experiment) => {
    if (!experiment || typeof experiment !== 'object') return experiment;
    const nextExperiment = { ...experiment };
    delete nextExperiment[removedIntegrationExperimentKey];
    return nextExperiment;
  };
  const cleanSection = (section) => {
    if (!section || typeof section !== 'object') return section;
    const nextSection = { ...section };
    if (Array.isArray(nextSection.experiments)) {
      nextSection.experiments = nextSection.experiments.map(cleanExperiment);
    }
    if (Array.isArray(nextSection.items)) {
      nextSection.items = nextSection.items.map(cleanExperiment);
    }
    return nextSection;
  };

  for (const key of ['sections', 'lessons', 'modules']) {
    if (Array.isArray(nextCourse[key])) {
      nextCourse[key] = nextCourse[key].map(cleanSection);
    }
  }
  if (Array.isArray(nextCourse.experiments)) {
    nextCourse.experiments = nextCourse.experiments.map(cleanExperiment);
  }
  return nextCourse;
}

function normalizeCourseValueForFingerprint(value, key = '') {
  if (key && (courseSyncFingerprintIgnoredKeys.has(key) || key.startsWith('_source_'))) {
    return undefined;
  }
  if (Array.isArray(value)) {
    return value
      .map((item) => normalizeCourseValueForFingerprint(item))
      .filter((item) => item !== undefined);
  }
  if (value && typeof value === 'object') {
    const normalized = {};
    Object.keys(value)
      .sort((a, b) => a.localeCompare(b))
      .forEach((childKey) => {
        const childValue = normalizeCourseValueForFingerprint(value[childKey], childKey);
        if (childValue !== undefined) {
          normalized[childKey] = childValue;
        }
      });
    return normalized;
  }
  if (typeof value === 'string') {
    return value.trim();
  }
  if (value === undefined || typeof value === 'function') {
    return undefined;
  }
  return value;
}

export function normalizeOrigin(origin = {}) {
  if (!origin || typeof origin !== 'object') return null;
  const base_url = (origin.base_url || '').toString().trim().replace(/\/+$/, '');
  const repo = (origin.repo || '').toString().trim().replace(/^\/+|\/+$/g, '');
  if (!base_url || !repo) return null;
  const singleCourseRepo = Boolean(origin.single_course_repo);
  const rawPublishPath = (origin.publish_path ?? '').toString().trim().replace(/^\/+|\/+$/g, '');
  return {
    source_id: (origin.source_id || '').toString().trim(),
    base_url,
    repo,
    branch: (origin.branch || 'main').toString().trim() || 'main',
    index_path: (origin.index_path || 'index.json').toString().trim().replace(/^\/+/, '') || 'index.json',
    publish_path: singleCourseRepo ? rawPublishPath : (rawPublishPath || 'courses'),
    course_id: (origin.course_id || '').toString().trim(),
    course_url: (origin.course_url || '').toString().trim(),
    package_url: (origin.package_url || '').toString().trim(),
    single_course_repo: singleCourseRepo,
  };
}

export function buildCourseSyncFingerprint(course) {
  if (!course || typeof course !== 'object') return '';
  return JSON.stringify(normalizeCourseValueForFingerprint(course));
}

export function withCourseSyncFingerprint(course, extraSync = {}) {
  const next = { ...(course || {}) };
  next.sync = {
    ...(next.sync || {}),
    ...extraSync,
  };
  next.sync.last_local_fingerprint = buildCourseSyncFingerprint(next);
  return next;
}

export function getLocalCourseChangeState(course) {
  const lastFingerprint = (course?.sync?.last_local_fingerprint || '').toString().trim();
  const currentFingerprint = buildCourseSyncFingerprint(course);
  if (!lastFingerprint) {
    return {
      state: 'unknown',
      currentFingerprint,
      lastFingerprint,
    };
  }
  return {
    state: lastFingerprint === currentFingerprint ? 'clean' : 'modified',
    currentFingerprint,
    lastFingerprint,
  };
}

export function getCourseOrigin(resource) {
  if (!resource) return null;
  const fromOrigin = normalizeOrigin(resource.origin || {});
  if (fromOrigin) return fromOrigin;
  if (resource.source === 'local') return null;
  const base_url = (() => {
    const repoUrl = (resource._source_repo_url || '').toString().trim();
    if (repoUrl) {
      try {
        const parsed = new URL(repoUrl);
        return `${parsed.protocol}//${parsed.host}`;
      } catch (_) {
        // fall through
      }
    }
    const raw = (resource._source_raw_base_url || '').toString().trim();
    if (!raw) return '';
    return raw.split('/raw/')[0] || '';
  })();
  const repo = (() => {
    const repoUrl = (resource._source_repo_url || '').toString().trim();
    if (!repoUrl) return '';
    try {
      const parsed = new URL(repoUrl);
      return parsed.pathname.replace(/^\/+/, '');
    } catch (_) {
      return repoUrl.replace(/^https?:\/\/[^/]+\//, '').replace(/^\/+/, '');
    }
  })();
  return normalizeOrigin({
    source_id: resource._source_id || '',
    base_url,
    repo,
    branch: resource._source_branch || 'main',
    course_id: resource.id || '',
    course_url: resource.course_url || '',
    package_url: resource.package_url || '',
    single_course_repo: Boolean(resource.single_course_repo),
  });
}

export function getResourceSourceContext(resource = null, { currentResource = null, repoUrl = '', rawBaseUrl = '', indexBranch = 'main' } = {}) {
  const target = resource || currentResource || {};
  const origin = getCourseOrigin(target);
  const originRepoUrl = origin ? `${origin.base_url}/${origin.repo}` : '';
  const originRawBaseUrl = origin ? `${originRepoUrl}/raw/${origin.branch || 'main'}` : '';
  return {
    repoUrl: originRepoUrl || target._source_repo_url || repoUrl || '',
    rawBaseUrl: originRawBaseUrl || target._source_raw_base_url || rawBaseUrl || '',
    branch: (origin && origin.branch) || target._source_branch || indexBranch || 'main',
  };
}

export function resolveResourceUrl(url, resource = null, context = {}) {
  if (!url) return '';
  const source = getResourceSourceContext(resource, context);
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }
  if (url.startsWith('data:') || url.startsWith('blob:') || url.startsWith('file://')) {
    return url;
  }
  if (url.startsWith('/')) {
    return source.repoUrl ? `${source.repoUrl}${url}` : url;
  }
  if (source.rawBaseUrl) {
    return `${source.rawBaseUrl}/${url}`;
  }
  return url;
}

export function persistLocalCourses(localCourses, saveLocalCourses, scheduleClassroomSync) {
  saveLocalCourses((localCourses || []).map(stripRemovedIntegrationMetadata));
  scheduleClassroomSync();
}

export async function persistCourseToDisk(resource, apiClient) {
  if (!resource || resource.source !== 'local') return null;
  const localPath = (resource.local_path || '').trim();
  if (!localPath) return null;
  try {
    const cleanResource = stripRemovedIntegrationMetadata(resource);
    const response = await apiClient.post('/api/resources/save-course', {
      local_path: localPath,
      course: cleanResource,
    });
    if (response?.success && response.course) {
      return {
        ...response.course,
        local_path: localPath,
        source: 'local',
        origin: resource.origin || undefined,
        sync: resource.sync || undefined,
      };
    }
  } catch (error) {
    console.warn('同步课程到磁盘失败:', error);
  }
  return null;
}

export function classifyDroppedCourseSource(path, { isDirectory = false } = {}) {
  const normalizedPath = String(path || '').trim();
  if (!normalizedPath) {
    return {
      kind: 'invalid',
      path: '',
      message: '无法读取拖入项目的本地路径，请重试。',
    };
  }
  if (normalizedPath.includes('\0')) {
    return {
      kind: 'invalid',
      path: normalizedPath,
      message: '拖入路径包含非法字符，无法导入。',
    };
  }
  if (isDirectory) {
    return {
      kind: 'folder',
      path: normalizedPath,
    };
  }
  if (/\.zip$/i.test(normalizedPath)) {
    return {
      kind: 'zip',
      path: normalizedPath,
    };
  }
  return {
    kind: 'invalid',
    path: normalizedPath,
    message: '仅支持拖入课程 ZIP 或完整课程文件夹。',
  };
}

export function buildDroppedCourseImportMessage({ course, duplicated = false, sourceKind = '' } = {}) {
  const title = String(course?.title || '').trim() || '课程';
  if (duplicated) {
    return `课程《${title}》已存在，已按最新拖入内容刷新。`;
  }
  if (sourceKind === 'folder') {
    return `课程《${title}》已从课程文件夹导入。`;
  }
  return `课程《${title}》已导入。`;
}

export async function importDroppedCourseSourceFlow(source, deps = {}) {
  const resolvedSource = typeof source === 'string'
    ? classifyDroppedCourseSource(source)
    : classifyDroppedCourseSource(source?.path, { isDirectory: Boolean(source?.isDirectory) });
  if (resolvedSource.kind === 'invalid') {
    throw new Error(resolvedSource.message);
  }

  const {
    apiClient,
    importZipCoursePackage,
    addCourse,
    loadResourcesIndex = async () => {},
    showListView,
    showDetailView,
    setImportStatus = () => {},
  } = deps;

  const initialMessage = resolvedSource.kind === 'folder'
    ? '正在读取课程文件夹...'
    : '正在导入课程包...';
  setImportStatus('writing', initialMessage);

  try {
    let response = null;
    if (resolvedSource.kind === 'folder') {
      if (typeof apiClient?.post !== 'function') {
        throw new Error('当前环境无法读取课程文件夹。');
      }
      const inspectResponse = await apiClient.post('/api/resources/inspect-course', {
        local_path: resolvedSource.path,
      });
      if (!inspectResponse?.success || !inspectResponse?.course) {
        throw new Error(inspectResponse?.message || '读取课程文件夹失败');
      }
      response = await apiClient.post('/api/resources/scan', {
        local_path: resolvedSource.path,
        init_if_missing: false,
        auto_build: false,
      });
    } else {
      if (typeof importZipCoursePackage !== 'function') {
        throw new Error('当前环境无法导入课程包。');
      }
      response = await importZipCoursePackage(resolvedSource.path);
    }

    if (!response?.success || !response?.course) {
      throw new Error(
        response?.message
        || (resolvedSource.kind === 'folder' ? '读取课程文件夹失败' : '导入课程包失败'),
      );
    }

    const course = {
      ...response.course,
      source: 'local',
      local_path: response.local_path || resolvedSource.path,
    };
    const duplicated = typeof addCourse === 'function'
      ? Boolean(addCourse(course, { silent: true }))
      : false;

    await loadResourcesIndex();
    if (typeof showListView === 'function') {
      showListView();
    }
    if (typeof showDetailView === 'function') {
      showDetailView(course);
    }

    const message = buildDroppedCourseImportMessage({
      course,
      duplicated,
      sourceKind: resolvedSource.kind,
    });
    setImportStatus('success', message);

    return {
      success: true,
      course,
      duplicated,
      sourceKind: resolvedSource.kind,
      message,
      summary: response.summary || null,
    };
  } catch (error) {
    const message = error?.message || (resolvedSource.kind === 'folder' ? '读取课程文件夹失败' : '导入课程包失败');
    setImportStatus('error', message);
    throw error instanceof Error ? error : new Error(message);
  }
}
