import {
  hasDesktopBridgeMethod,
  selectFolderWithDesktopBridge,
} from './desktop-bridge.js';
import { runCourseTransferFlow } from './course-transfer.js';

export function upsertLocalCourseRecord(course, { addCourse, showDetailView, showDetail = false } = {}) {
  if (!course) return;
  addCourse(course, { silent: true });
  if (showDetail && typeof showDetailView === 'function') {
    showDetailView(course);
  }
}

export function mergeOriginAndSync(resource, apiResponse, fallbackOrigin = null, { normalizeOrigin, withCourseSyncFingerprint } = {}) {
  const next = { ...(resource || {}) };
  const origin = normalizeOrigin(apiResponse?.origin || fallbackOrigin || {});
  if (origin) {
    next.origin = {
      ...origin,
      source_id: origin.source_id || next.origin?.source_id || '',
      course_id: origin.course_id || next.id || '',
      course_url: origin.course_url || next.origin?.course_url || '',
      package_url: origin.package_url || next.origin?.package_url || '',
    };
  }
  const nowIso = new Date().toISOString();
  const nowDate = nowIso.slice(0, 10);
  const prUrl = apiResponse?.result?.pull_request?.url || apiResponse?.pr_url || '';
  next.sync = {
    ...(next.sync || {}),
    last_push_at: nowIso,
    last_pr_url: prUrl || (next.sync?.last_pr_url || ''),
  };
  if (apiResponse?.result?.version) {
    next.version = apiResponse.result.version;
  }
  const entryUpdatedAt = apiResponse?.result?.entry?.updated_at;
  next.updated_at = entryUpdatedAt || nowDate;
  return withCourseSyncFingerprint(next);
}

export async function publishCourseFromDetailFlow(resource, deps) {
  const {
    apiClient,
    getCourseOrigin,
    openPublishSourceConfigModal,
    ensureTokenForPublishFlow,
    ensureWriteTokenForPublish,
    extractApiErrorMessage,
    isAuthRelatedErrorMessage,
    promptTokenForPublish,
    resolvePublishRetryToken,
    mergeOriginAndSync,
    persistCourseToDisk,
    upsertLocalCourseRecord,
    openResourcesConfirm,
    openExternal,
    loadResourcesIndex,
    showDetailView,
    alertUser = alert,
  } = deps;

  if (!resource || resource.source !== 'local') return;
  if (!resource.local_path) {
    alertUser('本地课程目录缺失，无法上传');
    return;
  }

  let publishSource = getCourseOrigin(resource);
  let tokenOverride = '';
  let createRepoIfMissing = true;
  let repoPrivate = false;

  if (!publishSource) {
    const promptResult = await openPublishSourceConfigModal(null);
    if (!promptResult) return;
    publishSource = promptResult.source;
    tokenOverride = promptResult.token_override;
    createRepoIfMissing = promptResult.create_repo_if_missing;
    repoPrivate = promptResult.repo_private;
  }

  const preparedToken = await ensureTokenForPublishFlow(publishSource, tokenOverride);
  if (preparedToken === null) return;
  tokenOverride = preparedToken;
  const writeToken = await ensureWriteTokenForPublish(tokenOverride);
  if (!writeToken) {
    alertUser('已取消上传（未填写访问令牌）');
    return;
  }
  tokenOverride = writeToken;

  const callPublish = async (token = tokenOverride) =>
    apiClient.post('/api/resources/publish', {
      local_path: resource.local_path,
      course_id: resource.id || (publishSource && publishSource.course_id) || '',
      version: resource.version || '',
      publish_mode: 'pr',
      single_course_repo: true,
      publish_source: publishSource
        ? {
            id: publishSource.source_id || 'override',
            ...publishSource,
          }
        : undefined,
      token_override: token || undefined,
      create_repo_if_missing: createRepoIfMissing,
      repo_private: repoPrivate,
      meta_override: {
        title: resource.title || '',
        description: resource.description || '',
        grade: resource.grade || '',
        subject: resource.subject || '',
        author: resource.author || '',
        tags: Array.isArray(resource.tags) ? resource.tags : [],
        version: resource.version || '',
      },
    });

  let response = null;
  try {
    response = await callPublish(tokenOverride);
    if (!response?.success) {
      throw new Error(response?.message || '发布失败');
    }
  } catch (error) {
    const message = extractApiErrorMessage(error, '发布失败');
    if (message.includes('写操作需要 Token') || isAuthRelatedErrorMessage(message)) {
      const token = await promptTokenForPublish({
        title: '上传课程需要访问令牌',
        message: '仓库可读取，但上传更新需要写权限。请输入访问令牌后重试。',
        confirmText: '继续上传',
        defaultValue: tokenOverride || (await resolvePublishRetryToken('')),
      });
      if (!token) {
        alertUser('已取消上传（未填写访问令牌）');
        return;
      }
      try {
        response = await callPublish(token.trim());
        if (!response?.success) {
          alertUser(`发布失败：${response?.message || '未知错误'}`);
          return;
        }
      } catch (retryError) {
        const retryMessage = extractApiErrorMessage(retryError, '发布失败');
        alertUser(`发布失败：${retryMessage}`);
        return;
      }
    } else {
      alertUser(`发布失败：${message}`);
      return;
    }
  }

  const mergedCourse = mergeOriginAndSync(resource, response, publishSource);
  await persistCourseToDisk(mergedCourse);
  upsertLocalCourseRecord(mergedCourse, { showDetail: true });

  const prUrl = response?.result?.pull_request?.url || response?.pr_url || '';
  const reusedPr = Boolean(response?.result?.pull_request?.existing);
  if (prUrl) {
    alertUser(reusedPr ? '上传成功，已更新现有 PR' : '上传成功，已创建 PR');
    const shouldOpenPr = await openResourcesConfirm({
      title: '上传成功',
      message: '是否打开 PR 页面？',
      confirmText: '打开',
      cancelText: '稍后',
    });
    if (shouldOpenPr) {
      await openExternal(prUrl);
    }
  } else {
    alertUser('上传成功，已同步到仓库主分支');
  }
  await loadResourcesIndex();
  showDetailView(mergedCourse);
}

export async function pullLatestForLocalCourseFlow(resource, deps) {
  const {
    apiClient,
    getCourseOrigin,
    getLocalCourseChangeState,
    openResourcesConfirm,
    extractApiErrorMessage,
    resolvePublishRetryToken,
    normalizeOrigin,
    withCourseSyncFingerprint,
    persistCourseToDisk,
    upsertLocalCourseRecord,
    loadResourcesIndex,
    showDetailView,
    setImportStatus = () => {},
    pollIntervalMs = 500,
    alertUser = alert,
  } = deps;

  if (!resource || resource.source !== 'local') return;
  const origin = getCourseOrigin(resource);
  if (!origin) {
    alertUser('该课程未绑定远端仓库，请先上传课程完成绑定。');
    return;
  }
  if (!resource.local_path) {
    alertUser('本地课程目录缺失，无法拉取更新');
    return;
  }

  const changeState = getLocalCourseChangeState(resource);
  if (changeState.state !== 'clean') {
    const message =
      changeState.state === 'modified'
        ? '检测到这门课程在本地还有未同步修改。继续拉取会先自动备份当前内容，再覆盖为线上最新版本。'
        : '这门课程还没有同步基线记录。继续拉取会先自动备份当前内容，再覆盖为线上最新版本。';
    const ok = await openResourcesConfirm({
      title: '确认拉取更新',
      message,
      confirmText: '继续更新',
      cancelText: '取消',
    });
    if (!ok) {
      return;
    }
  }

  const resolveLatest = origin.single_course_repo ? false : true;
  const doPull = async (tokenOverride = '') =>
    runCourseTransferFlow({
      apiClient,
      endpoint: '/api/resources/pull',
      payload: {
        source_override: {
          id: origin.source_id || 'override',
          ...origin,
        },
        token_override: tokenOverride || undefined,
        course_id: origin.course_id || resource.id || '',
        course_url: origin.course_url || '',
        package_url: origin.package_url || '',
        resolve_latest: resolveLatest,
        target_path: resource.local_path,
        replace_existing: true,
        backup_before_replace: true,
      },
      setImportStatus,
      pollIntervalMs,
    });

  let response = null;
  try {
    setImportStatus('downloading', '正在拉取课程更新...');
    response = await doPull('');
    if (!response?.success) {
      throw new Error(response?.message || '拉取失败');
    }
  } catch (error) {
    const message = extractApiErrorMessage(error, '拉取失败');
    if (message.includes('认证失败') || message.includes('Token')) {
      const token = await resolvePublishRetryToken();
      if (!token) {
        setImportStatus('error', '拉取失败：仓库需要访问令牌');
        alertUser('该仓库需要访问令牌。请在“设置 → 资源库”填写访问令牌后重试。');
        return;
      }
      try {
        response = await doPull(token.trim());
        if (!response?.success) {
          setImportStatus('error', response?.message || '拉取失败');
          alertUser(`拉取失败：${response?.message || '未知错误'}`);
          return;
        }
      } catch (retryError) {
        const retryMessage = extractApiErrorMessage(retryError, '拉取失败');
        setImportStatus('error', retryMessage);
        alertUser(`拉取失败：${retryMessage}`);
        return;
      }
    } else {
      setImportStatus('error', message);
      alertUser(`拉取失败：${message}`);
      return;
    }
  }

  const updatedCourse = {
    ...(resource || {}),
    ...(response.course || {}),
    source: 'local',
    local_path: response.local_path || resource.local_path,
    origin: normalizeOrigin(response.origin || origin) || origin,
    sync: {
      ...(resource.sync || {}),
      last_pull_at: new Date().toISOString(),
      last_backup_path: response?.summary?.backup_path || (resource.sync || {}).last_backup_path || '',
    },
  };
  const syncedCourse = withCourseSyncFingerprint(updatedCourse);
  await persistCourseToDisk(syncedCourse);
  upsertLocalCourseRecord(syncedCourse, { showDetail: true });

  setImportStatus('success', '课程已更新到本地');
  alertUser('课程已更新到本地。');
  await loadResourcesIndex();
  showDetailView(syncedCourse);
}

export async function importRemoteCourseFlow(resource, options = {}, deps) {
  const {
    apiClient,
    buildSourceOverrideFromCourseMeta,
    normalizeOrigin,
    withCourseSyncFingerprint,
    addCourse,
    extractApiErrorMessage,
    alertUser = alert,
    electronAPI = window.electronAPI,
    setImportStatus = () => {},
    pollIntervalMs = 500,
  } = deps;

  if (!resource) return null;
  const courseUrl = resource.course_url || '';
  const packageUrl = resource.package_url || '';
  const isClassroomResource = resource.source === 'classroom';
  let targetPath = '';

  try {
    setImportStatus('selecting', '正在选择目录...');
    if (hasDesktopBridgeMethod(electronAPI, 'selectFolder')) {
      const base = await selectFolderWithDesktopBridge(electronAPI);
      if (!base) {
        setImportStatus('cancelled', '已取消导入');
        if (!options.silent) alertUser('已取消导入。');
        return null;
      }
      const cleanBase = base.replace(/[\\/]+$/, '');
      targetPath = `${cleanBase}/${resource.id || 'course'}`;
    }

    const endpoint = isClassroomResource ? '/api/classroom/pull' : '/api/resources/pull';
    const payload = {
      course_url: courseUrl,
      package_url: packageUrl,
      target_path: targetPath,
      replace_existing: true,
      source_id: resource._source_id || '',
      course_id: resource.id || '',
    };
    const sourceOverride = buildSourceOverrideFromCourseMeta(resource);
    if (sourceOverride) {
      payload.source_override = {
        id: sourceOverride.source_id || 'override',
        ...sourceOverride,
      };
      if (sourceOverride.source_id === 'override' && deps.cloudTempToken) {
        payload.token_override = deps.cloudTempToken;
      }
    }
    const response = await runCourseTransferFlow({
      apiClient,
      endpoint,
      payload,
      setImportStatus,
      pollIntervalMs,
      initialStatus: ['downloading', '正在下载课程...'],
    });
    if (!response.success) {
      throw new Error(response.message || '导入失败');
    }
    setImportStatus('writing', '正在写入本地课程...');
    const localCourse = {
      ...response.course,
      local_path: response.local_path,
      resource_handle: response.resource_handle || response.course?.resource_handle || '',
      source: 'local',
      origin: normalizeOrigin(response.origin || buildSourceOverrideFromCourseMeta(resource)),
      updated_at: new Date().toISOString().slice(0, 10),
      sync: {
        last_pull_at: new Date().toISOString(),
      },
    };
    const syncedCourse = withCourseSyncFingerprint(localCourse);
    const updated = addCourse(syncedCourse, { silent: true });
    setImportStatus('success', updated ? '课程已更新到本地' : '课程已导入到本地');
    if (!options.silent) {
      alertUser(updated ? '课程已更新到本地。' : '课程已导入到本地。');
    }
    return syncedCourse;
  } catch (error) {
    const message = extractApiErrorMessage(error, '导入失败');
    setImportStatus('error', message);
    if (!options.silent) {
      alertUser(message);
    } else {
      throw error;
    }
    return null;
  }
}
