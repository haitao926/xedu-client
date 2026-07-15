function withTimeout(promise, timeoutMs, fallbackValue, label = 'operation') {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return promise;
  }
  let timeoutId = null;
  return Promise.race([
    Promise.resolve(promise).finally(() => {
      if (timeoutId) clearTimeout(timeoutId);
    }),
    new Promise((resolve) => {
      timeoutId = setTimeout(() => {
        console.warn(`${label} timed out after ${timeoutMs}ms; using cached data.`);
        resolve(fallbackValue);
      }, timeoutMs);
    }),
  ]);
}

export async function loadResourcesIndexFlow(deps = {}) {
  const loading = deps.documentRef.getElementById('resources-loading');
  if (loading) loading.style.display = 'flex';
  let watchdogFired = false;
  const watchdogMs = deps.loadingWatchdogMs ?? 8000;
  const watchdogId = Number.isFinite(watchdogMs) && watchdogMs > 0
    ? setTimeout(() => {
      watchdogFired = true;
      console.warn(`Resource loading exceeded ${watchdogMs}ms; rendering cached fallback.`);
      try {
        deps.applyResourcesIndex(deps.mockResourcesIndex, { isMock: true, remoteSource: 'remote', sources: [] });
      } catch (error) {
        console.warn('资源加载兜底渲染失败:', error);
      }
      if (loading) loading.style.display = 'none';
      deps.updateClassroomBanner();
    }, watchdogMs)
    : null;

  try {
    const loadedLocalCourses = deps.loadLocalCourses();
    let refreshedLocalCourses = loadedLocalCourses;
    if (typeof deps.refreshLocalCoursesFromDisk === 'function') {
      try {
        refreshedLocalCourses = await withTimeout(
          deps.refreshLocalCoursesFromDisk(loadedLocalCourses),
          deps.localRefreshTimeoutMs ?? 6000,
          loadedLocalCourses,
          'refreshLocalCoursesFromDisk',
        );
      } catch (error) {
        console.warn('刷新本地课程失败，继续使用缓存:', error);
        refreshedLocalCourses = loadedLocalCourses;
      }
    }
    deps.setLocalCourses(refreshedLocalCourses);
    const clearedLocalCourses = await withTimeout(
      deps.clearDemoCourseBindingIfNeeded(deps.localCourses()),
      deps.localMigrationTimeoutMs ?? 2000,
      deps.localCourses(),
      'clearDemoCourseBindingIfNeeded',
    );
    deps.setLocalCourses(clearedLocalCourses);
    if (typeof deps.persistLocalCoursesState === 'function') {
      deps.persistLocalCoursesState();
    }
    deps.scheduleClassroomSync();

    if (deps.classroomState.source && deps.classroomState.connected) {
      const baseUrl = deps.classroomState.source.base_url || deps.buildClassroomBaseUrl(deps.classroomState.source);
      const response = await deps.apiClient.post('/api/classroom/fetch-index', {
        base_url: baseUrl,
      });
      if (response?.success) {
        deps.applyResourcesIndex(response.index || {}, {
          repoUrl: response.repo_url || baseUrl,
          rawBaseUrl: response.raw_base_url || baseUrl,
          branch: response.branch || 'classroom',
          sources: [],
          isMock: false,
          remoteSource: 'classroom',
        });
        deps.updateClassroomBanner();
        return;
      }
      deps.classroomState.connected = false;
      deps.classroomState.source = null;
    }

    const response = await deps.apiClient.get('/api/resources/index');
    if (response.success) {
      deps.applyResourcesIndex(response.index || {}, {
        repoUrl: response.repo_url || '',
        rawBaseUrl: response.raw_base_url || '',
        branch: response.branch || 'main',
        sources: Array.isArray(response.sources) ? response.sources : [],
        isMock: false,
        remoteSource: 'remote',
      });
    } else {
      deps.applyResourcesIndex(deps.mockResourcesIndex, { isMock: true, remoteSource: 'remote', sources: [] });
    }
  } catch (error) {
    console.error('加载资源索引失败:', error);
    if (deps.classroomState?.connected) {
      deps.classroomState.connected = false;
      deps.classroomState.source = null;
    }
    let message = '资源库加载失败';
    if (error?.details) {
      try {
        const parsed = JSON.parse(error.details);
        if (parsed && parsed.message) {
          message = parsed.message;
        }
      } catch (parseError) {
        message = `资源库加载失败: ${error.details}`;
      }
    } else if (error?.message) {
      message = `资源库加载失败: ${error.message}`;
    }
    deps.applyResourcesIndex(deps.mockResourcesIndex, { isMock: true, remoteSource: 'remote', sources: [] });
  } finally {
    if (watchdogId) clearTimeout(watchdogId);
    if (loading) loading.style.display = 'none';
    if (!watchdogFired) {
      deps.updateClassroomBanner();
    }
  }
}
