export function getStoredProjectDirFallback(documentRef = document) {
  const projectInput = documentRef.getElementById('project-path');
  const projectDir = (projectInput?.value || '').trim();
  let fallbackProjectDir = '';
  try {
    fallbackProjectDir = (localStorage.getItem('xedu-last-project-dir') || '').trim();
  } catch (_) {
    fallbackProjectDir = '';
  }
  return { projectDir, fallbackProjectDir };
}

export const CLASSROOM_DISCOVERY_TIMEOUT_SECONDS = 3.5;
const CLASSROOM_IMPORT_FALLBACK_MODE = 'package-import';

function normalizeClassroomCode(value) {
  return String(value || '').trim().toLowerCase();
}

export function normalizeClassroomAddress(value) {
  const raw = String(value || '').trim();
  if (!raw) return { error: '请输入教师课堂地址' };
  let parsed;
  try {
    parsed = new URL(raw);
  } catch (_) {
    return { error: '请输入完整地址，例如 http://教师IP:5123' };
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return { error: '课堂地址仅支持 HTTP(S)' };
  }
  if (!parsed.hostname || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) {
    return { error: '课堂地址格式无效，请检查 IP、端口和协议' };
  }
  const port = Number(parsed.port || (parsed.protocol === 'https:' ? 443 : 80));
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return { error: '端口必须是 1-65535 之间的数字' };
  }
  return {
    base_url: parsed.origin,
    host: parsed.hostname,
    port,
  };
}

function extractClassroomApiErrorMessage(error, fallback = '课堂不可用') {
  const raw = error?.details || error?.message || '';
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && parsed.message) {
      return String(parsed.message);
    }
  } catch (_) {
    // ignore parse errors, fall back to raw text
  }
  const text = String(raw).trim();
  return text || fallback;
}

function clearClassroomConnectionState(state) {
  if (!state) return;
  state.connected = false;
  state.source = null;
}

function clearClassroomFallbackState(state) {
  if (!state) return;
  delete state.fallback;
  delete state.lastError;
}

function withPackageImportHint(message) {
  const text = String(message || '').trim();
  if (!text) {
    return '请直接拖入课程包';
  }
  if (text.includes('课程包')) {
    return text;
  }
  return `${text}，请直接拖入课程包`;
}

function setClassroomFallbackState(state, message, reason = 'classroom-unavailable') {
  if (!state) return;
  clearClassroomConnectionState(state);
  state.lastError = withPackageImportHint(message);
  state.fallback = {
    mode: CLASSROOM_IMPORT_FALLBACK_MODE,
    reason,
    message: state.lastError,
  };
}

function buildPackageImportFallback(message, reason = 'classroom-unavailable') {
  const fallbackMessage = withPackageImportHint(message);
  return {
    success: false,
    message: fallbackMessage,
    fallback: {
      mode: CLASSROOM_IMPORT_FALLBACK_MODE,
      reason,
      message: fallbackMessage,
    },
    next_action: 'import-local-package',
  };
}

function dedupeDiscoveredClassrooms(list, buildClassroomBaseUrl) {
  if (!Array.isArray(list) || !list.length) return [];
  const deduped = [];
  const seen = new Set();
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const baseUrl = item.base_url || buildClassroomBaseUrl(item) || '';
    const key = [
      String(item.server_id || '').trim(),
      baseUrl,
      `${String(item.host || '').trim()}:${String(item.port || '').trim()}`,
    ].find(Boolean);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }
  return deduped;
}

function buildClassroomSource(entry, buildClassroomBaseUrl) {
  if (!entry) return null;
  const baseUrl = entry.base_url || buildClassroomBaseUrl(entry);
  if (!baseUrl) return null;
  return {
    ...entry,
    base_url: baseUrl,
  };
}

export async function prepareStudentClassroomLaunchFlow(resource, options = {}, deps = {}) {
  if (!resource?.package_url) {
    return null;
  }
  const { projectDir, fallbackProjectDir } = deps.getStoredProjectDirFallback();
  const targetPath = deps.resolveClassroomPullTargetPath(resource, projectDir, fallbackProjectDir);
  const response = await deps.apiClient.post('/api/classroom/pull', {
    package_url: resource.package_url,
    target_path: targetPath,
    replace_existing: true,
  });
  if (!response?.success) {
    throw new Error(response?.message || '导入课堂课程失败');
  }
  const pulledCourse = response.course || {};
  const localPath = response.local_path || targetPath || '';
  const localCourse = {
    ...pulledCourse,
    id: pulledCourse.id || resource.id || `classroom-${Date.now()}`,
    source: 'local',
    local_path: localPath,
    updated_at: new Date().toISOString().slice(0, 10),
  };
  deps.addCourse(localCourse, { silent: true });
  const preferredSectionIndex =
    options?.sectionIndex !== undefined && options?.sectionIndex !== null
      ? Number(options.sectionIndex)
      : null;
  return {
    project_path: localPath,
    notebook_path: deps.findFirstNotebookPathInCourse(pulledCourse, preferredSectionIndex, {
      normalizeSections: deps.normalizeSections,
      getExperimentFileOverview: deps.getExperimentFileOverview,
      isRemotePath: deps.isRemotePath,
    }),
    course_title: pulledCourse.title || resource.title || '',
    section_index: preferredSectionIndex,
    course: localCourse,
  };
}

export async function connectStudentClassroomByCodeFlow(code, options = {}, deps = {}) {
  const showResourcesView = options?.showResourcesView !== false;
  const prepareConsoleLaunch = options?.prepareConsoleLaunch === true;
  const preferredSource = options?.source || null;
  const allowDiagnosticManualAddressFallback =
    options.allowManualAddressFallback === true && options.diagnosticMode === true;
  const classroomCode = String(code || '').trim();
  if (!deps.initialized()) {
    deps.bindEvents();
    deps.setInitialized(true);
  }
  deps.setLocalCourses(deps.loadLocalCourses());

  const fetchIndexBySource = async (source) => {
    if (!source?.base_url) {
      return null;
    }
    try {
      return await deps.apiClient.post('/api/classroom/fetch-index', {
        base_url: source.base_url,
        classroom_code: classroomCode,
      });
    } catch (error) {
      return {
        success: false,
        message: extractClassroomApiErrorMessage(error),
      };
    }
  };

  const tryLoopbackSource = async () => {
    const loopbackBaseUrl = 'http://127.0.0.1:5123';
    const loopbackSource = {
      name: '本机课堂',
      code: classroomCode,
      host: '127.0.0.1',
      port: 5123,
      base_url: loopbackBaseUrl,
    };
    const resp = await fetchIndexBySource(loopbackSource);
    if (!resp?.success) {
      return { success: false, message: resp?.message || '本机课堂不可用' };
    }
    return { success: true, source: loopbackSource, prefetched: resp };
  };

  const requestDiagnosticSource = async () => {
    if (!allowDiagnosticManualAddressFallback || typeof deps.requestManualClassroomAddress !== 'function') {
      return null;
    }
    const manualSource = await deps.requestManualClassroomAddress();
    if (!manualSource?.base_url) {
      return null;
    }
    const manualResp = await fetchIndexBySource(manualSource);
    if (!manualResp?.success) {
      return {
        success: false,
        message: manualResp?.message || '教师课堂地址不可用，请检查地址和防火墙',
      };
    }
    deps.rememberClassroomSource?.(manualSource);
    return {
      success: true,
      source: {
        ...manualSource,
        name: manualSource.name || '诊断课堂',
      },
      prefetched: manualResp,
    };
  };

  const discoverAndValidateSource = async () => {
    const query = new URLSearchParams({
      timeout: String(CLASSROOM_DISCOVERY_TIMEOUT_SECONDS),
    });
    if (classroomCode) {
      query.set('code', classroomCode);
    }
    const discoverResp = await deps.apiClient.get(`/api/classroom/discover?${query.toString()}`);
    const list = dedupeDiscoveredClassrooms(discoverResp?.classrooms, deps.buildClassroomBaseUrl);
    const candidates = classroomCode
      ? list.sort((left, right) => {
          const leftMatched = normalizeClassroomCode(left?.code) === normalizeClassroomCode(classroomCode);
          const rightMatched = normalizeClassroomCode(right?.code) === normalizeClassroomCode(classroomCode);
          return Number(rightMatched) - Number(leftMatched);
        })
      : list;
    let lastFailureMessage = '';

    for (const candidate of candidates) {
      const source = buildClassroomSource(candidate, deps.buildClassroomBaseUrl);
      if (!source?.base_url) continue;
      const fetchResp = await fetchIndexBySource(source);
      if (fetchResp?.success) {
        return { success: true, source, prefetched: fetchResp };
      }
      lastFailureMessage = fetchResp?.message || lastFailureMessage;
    }

    if (classroomCode) {
      const loopbackResp = await tryLoopbackSource();
      if (loopbackResp?.success) {
        return loopbackResp;
      }
      lastFailureMessage = loopbackResp?.message || lastFailureMessage;
    }

    const diagnosticResp = await requestDiagnosticSource();
    if (diagnosticResp?.success) {
      return diagnosticResp;
    }
    if (diagnosticResp?.message) {
      lastFailureMessage = diagnosticResp.message;
    }

    if (list.length) {
      return {
        success: false,
        message: lastFailureMessage || '已发现课堂，但课堂内容暂时不可达，请让老师重新发送课堂或直接拖入课程包',
        reason: 'validation-failed',
      };
    }
    if (classroomCode) {
      return {
        success: false,
        message: lastFailureMessage || '未找到对应课堂，请检查课堂码，或直接拖入课程包',
        reason: 'classroom-code-mismatch',
      };
    }
    return {
      success: false,
      message: '未发现课堂，请确认教师已开启课堂并与学生处于同一局域网，或直接拖入课程包',
      reason: 'discovery-empty',
    };
  };

  try {
    let fetchResp = null;
    clearClassroomFallbackState(deps.classroomState);
    if (preferredSource?.base_url) {
      deps.classroomState.source = {
        ...preferredSource,
        base_url: deps.buildClassroomBaseUrl(preferredSource),
      };
      deps.classroomState.connected = true;
    } else if (classroomCode || !deps.classroomState.source?.base_url) {
      const discovered = await discoverAndValidateSource();
      if (!discovered.success) {
        setClassroomFallbackState(deps.classroomState, discovered.message, discovered.reason);
        deps.updateClassroomBanner?.();
        return buildPackageImportFallback(discovered.message, discovered.reason);
      }
      deps.classroomState.source = discovered.source;
      deps.classroomState.connected = true;
      fetchResp = discovered.prefetched || null;
    }

    if (!fetchResp) {
      fetchResp = await fetchIndexBySource(deps.classroomState.source);
    }
    if (!fetchResp?.success) {
      const discovered = await discoverAndValidateSource();
      if (!discovered.success) {
        const failureMessage = fetchResp?.message || discovered.message || '课堂不可用，请直接拖入课程包';
        setClassroomFallbackState(deps.classroomState, failureMessage, discovered.reason || 'validation-failed');
        deps.updateClassroomBanner?.();
        return buildPackageImportFallback(failureMessage, discovered.reason || 'validation-failed');
      }
      deps.classroomState.source = discovered.source;
      deps.classroomState.connected = true;
      fetchResp = discovered.prefetched || null;
      if (!fetchResp) {
        fetchResp = await fetchIndexBySource(deps.classroomState.source);
      }
      if (!fetchResp?.success) {
        const failureMessage = fetchResp?.message || '课堂不可用，请直接拖入课程包';
        setClassroomFallbackState(deps.classroomState, failureMessage, 'validation-failed');
        deps.updateClassroomBanner?.();
        return buildPackageImportFallback(failureMessage, 'validation-failed');
      }
    }

    deps.applyResourcesIndex(fetchResp.index || {}, {
      repoUrl: fetchResp.repo_url || deps.classroomState.source.base_url,
      rawBaseUrl: fetchResp.raw_base_url || deps.classroomState.source.base_url,
      branch: fetchResp.branch || 'classroom',
      sources: [],
      isMock: false,
      remoteSource: 'classroom',
    });
    let launch = null;
    let warning = '';
    if (prepareConsoleLaunch) {
      const launchResource = deps.pickClassroomLaunchResource(fetchResp);
      const launchSectionIndex =
        fetchResp?.index?.classroom?.active_section_index !== undefined &&
        fetchResp?.index?.classroom?.active_section_index !== null
          ? Number(fetchResp.index.classroom.active_section_index)
          : null;
      if (launchResource) {
        try {
          launch = await deps.prepareStudentClassroomLaunch(launchResource, {
            sectionIndex: Number.isFinite(launchSectionIndex) ? launchSectionIndex : null,
          });
        } catch (error) {
          warning = deps.extractApiErrorMessage(error, '已连接课堂，但导入本地课程失败');
        }
      } else {
        warning = '课堂已连接，但当前没有可进入的课程';
      }
    }
    clearClassroomFallbackState(deps.classroomState);
    deps.updateClassroomBanner();
    if (!showResourcesView && launch?.course) {
      deps.showDetailView(launch.course);
    } else if (showResourcesView) {
      deps.showListView();
    }
    return {
      success: true,
      message: '已连接课堂',
      count: deps.resourcesCache().length,
      launch,
      warning,
    };
  } catch (error) {
    const message = deps.extractApiErrorMessage(error, '连接课堂失败，请直接拖入课程包');
    setClassroomFallbackState(deps.classroomState, message, 'unexpected-error');
    deps.updateClassroomBanner?.();
    return buildPackageImportFallback(message, 'unexpected-error');
  }
}
