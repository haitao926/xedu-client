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

function normalizeClassroomCode(value) {
  return String(value || '').trim().toLowerCase();
}

function matchClassroomByCode(list, code) {
  if (!Array.isArray(list) || !list.length) return null;
  const normalizedCode = normalizeClassroomCode(code);
  if (!normalizedCode) return list[0] || null;
  const matched = list.find((item) => {
    return normalizeClassroomCode(item?.code) === normalizedCode;
  });
  return matched || null;
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
  const classroomCode = String(code || '').trim();
  if (!deps.initialized()) {
    deps.bindEvents();
    deps.setInitialized(true);
  }
  deps.setLocalCourses(deps.loadLocalCourses());
  await deps.loadClassroomConfig();
  await deps.ensureTeacherModeReady();

  const fetchIndexBySource = async (source) => {
    if (!source?.base_url) {
      return null;
    }
    try {
      return await deps.apiClient.post('/api/classroom/fetch-index', {
        base_url: source.base_url,
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
    const resp = await fetchIndexBySource({ base_url: loopbackBaseUrl });
    if (!resp?.success) {
      return null;
    }
    deps.classroomState.source = {
      name: '本机课堂',
      code: classroomCode,
      host: '127.0.0.1',
      port: 5123,
      base_url: loopbackBaseUrl,
    };
    deps.classroomState.connected = true;
    return resp;
  };

  const discoverAndSelectSource = async () => {
    const discoverResp = await deps.apiClient.get('/api/classroom/discover?timeout=1.5');
    const list = Array.isArray(discoverResp?.classrooms) ? discoverResp.classrooms : [];
    if (!list.length) {
      if (classroomCode) {
        const loopbackResp = await tryLoopbackSource();
        if (loopbackResp?.success) {
          return { success: true, source: deps.classroomState.source, prefetched: loopbackResp };
        }
      }
      return { success: false, message: '未发现课堂，请确认教师已开启课堂' };
    }
    const matched = matchClassroomByCode(list, classroomCode);
    if (classroomCode && !matched) {
      const loopbackResp = await tryLoopbackSource();
      if (loopbackResp?.success) {
        return { success: true, source: deps.classroomState.source, prefetched: loopbackResp };
      }
      return { success: false, message: '未找到对应课堂，请检查课堂码' };
    }
    const selected = matched || list[0];
    deps.classroomState.source = {
      ...selected,
      base_url: deps.buildClassroomBaseUrl(selected),
    };
    deps.classroomState.connected = true;
    return { success: true, source: deps.classroomState.source };
  };

  try {
    let fetchResp = null;
    if (preferredSource?.base_url) {
      deps.classroomState.source = {
        ...preferredSource,
        base_url: deps.buildClassroomBaseUrl(preferredSource),
      };
      deps.classroomState.connected = true;
    } else if (classroomCode || !deps.classroomState.source?.base_url) {
      const discovered = await discoverAndSelectSource();
      if (!discovered.success) {
        return discovered;
      }
      fetchResp = discovered.prefetched || null;
    }

    if (!fetchResp) {
      fetchResp = await fetchIndexBySource(deps.classroomState.source);
    }
    if (!fetchResp?.success) {
      if (preferredSource?.base_url) {
        clearClassroomConnectionState(deps.classroomState);
        return { success: false, message: fetchResp?.message || '课堂不可用' };
      }
      const discovered = await discoverAndSelectSource();
      if (!discovered.success) {
        clearClassroomConnectionState(deps.classroomState);
        return { success: false, message: fetchResp?.message || discovered.message || '课堂不可用' };
      }
      fetchResp = await fetchIndexBySource(deps.classroomState.source);
      if (!fetchResp?.success) {
        clearClassroomConnectionState(deps.classroomState);
        return { success: false, message: fetchResp?.message || '课堂不可用' };
      }
    }

    deps.applyResourcesIndex(fetchResp.index || {}, {
      submitUrl: '',
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
    return { success: false, message: deps.extractApiErrorMessage(error, '连接课堂失败') };
  }
}
