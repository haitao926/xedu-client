const courseSyncFingerprintIgnoredKeys = new Set([
  'sync',
  'origin',
  'local_path',
  'updated_at',
  'created_at',
  'last_pull_at',
  'last_push_at',
  'last_backup_path',
  'last_pr_url',
  'last_local_fingerprint',
]);

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
  saveLocalCourses(localCourses);
  scheduleClassroomSync();
}

export async function persistCourseToDisk(resource, apiClient) {
  if (!resource || resource.source !== 'local') return null;
  const localPath = (resource.local_path || '').trim();
  if (!localPath) return null;
  try {
    const response = await apiClient.post('/api/resources/save-course', {
      local_path: localPath,
      course: resource,
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
