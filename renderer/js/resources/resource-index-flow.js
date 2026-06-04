export async function loadResourcesIndexFlow(deps = {}) {
  const loading = deps.documentRef.getElementById('resources-loading');
  if (loading) loading.style.display = 'flex';

  deps.setLocalCourses(deps.loadLocalCourses());
  deps.setLocalCourses(await deps.clearDemoCourseBindingIfNeeded(deps.localCourses()));
  deps.scheduleClassroomSync();

  try {
    if (deps.classroomState.source && deps.classroomState.connected) {
      const baseUrl = deps.classroomState.source.base_url || deps.buildClassroomBaseUrl(deps.classroomState.source);
      const response = await deps.apiClient.post('/api/classroom/fetch-index', {
        base_url: baseUrl,
      });
      if (response?.success) {
        deps.applyResourcesIndex(response.index || {}, {
          submitUrl: '',
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
        submitUrl: response.submit_url || '',
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
    if (loading) loading.style.display = 'none';
    deps.updateClassroomBanner();
  }
}
