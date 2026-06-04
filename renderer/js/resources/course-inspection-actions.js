export function buildInspectCoursePayload(resource, { getCourseOrigin, buildSourceOverrideFromCourseMeta, cloudTempToken } = {}) {
  if (!resource) return null;
  if (resource.source === 'local') {
    if (!resource.local_path) return null;
    return { local_path: resource.local_path };
  }
  const origin = getCourseOrigin(resource) || buildSourceOverrideFromCourseMeta(resource);
  if (!origin) return null;
  return {
    source_id: origin.source_id || resource._source_id || '',
    source_override: {
      id: origin.source_id || resource._source_id || 'override',
      ...origin,
    },
    course_id: origin.course_id || resource.id || '',
    course_url: origin.course_url || resource.course_url || '',
    package_url: origin.package_url || resource.package_url || '',
    token_override: origin.source_id === 'override' ? cloudTempToken || undefined : undefined,
  };
}

export function mergeInspectionCourse(resource, response) {
  const course = response?.course || {};
  if (!course || typeof course !== 'object') return resource;
  return {
    ...(resource || {}),
    ...course,
    source: resource?.source || course.source || 'remote',
    _source_id: course._source_id || resource?._source_id || '',
    _source_name: course._source_name || resource?._source_name || '',
    _source_repo_url: course._source_repo_url || resource?._source_repo_url || '',
    _source_raw_base_url: course._source_raw_base_url || resource?._source_raw_base_url || '',
    _source_branch: course._source_branch || resource?._source_branch || '',
    course_url: course.course_url || resource?.course_url || '',
    package_url: course.package_url || resource?.package_url || '',
    single_course_repo: Boolean(course.single_course_repo || resource?.single_course_repo),
  };
}

export async function inspectCourseResourceFlow(resource, deps) {
  const {
    apiClient,
    ensureCourseInspectionIdentity,
    buildInspectCoursePayload,
    renderResourceDetail,
    courseInspectionState,
    mergeInspectionCourse,
    getResourceIdentity,
    currentResource,
    setCurrentResource,
    extractApiErrorMessage,
    alertUser = alert,
  } = deps;

  if (!resource) return null;
  ensureCourseInspectionIdentity(resource);
  const payload = buildInspectCoursePayload(resource);
  if (!payload) {
    courseInspectionState.error = '缺少课程路径或资源库配置，无法巡检';
    renderResourceDetail(resource);
    return null;
  }
  courseInspectionState.loading = true;
  courseInspectionState.error = '';
  renderResourceDetail(resource);
  try {
    const response = await apiClient.post('/api/resources/inspect-course', payload);
    if (!response?.success) {
      throw new Error(response?.message || '课程巡检失败');
    }
    const merged = mergeInspectionCourse(resource, response);
    courseInspectionState.courseId = getResourceIdentity(merged);
    courseInspectionState.summary = response.summary || null;
    courseInspectionState.inspection = response.inspection || null;
    courseInspectionState.loading = false;
    courseInspectionState.error = '';
    if (currentResource === resource || getResourceIdentity(currentResource) === getResourceIdentity(resource)) {
      setCurrentResource(merged);
    }
    renderResourceDetail(merged);
    return { response, resource: merged };
  } catch (error) {
    courseInspectionState.loading = false;
    courseInspectionState.error = extractApiErrorMessage(error, '课程巡检失败');
    renderResourceDetail(resource);
    if (!deps.silent) {
      alertUser(courseInspectionState.error);
    }
    return null;
  }
}

export function shouldAutoInspectRemoteCourse(resource, courseInspectionState, teacherMode) {
  return Boolean(
    teacherMode.unlocked &&
    resource &&
    resource.source !== 'local' &&
    (!Array.isArray(resource.sections) || !resource.sections.length) &&
    !courseInspectionState.loading &&
    !courseInspectionState.inspection &&
    !courseInspectionState.error
  );
}

export function renderCourseInspectionCardFlow(resource, deps) {
  const { ensureCourseInspectionIdentity, courseInspectionState, documentRef = document } = deps;
  ensureCourseInspectionIdentity(resource);
  const card = documentRef.createElement('div');
  card.className = 'resource-card resources-inspection-card';
  const header = documentRef.createElement('div');
  header.className = 'resource-card-header';
  const title = documentRef.createElement('div');
  title.className = 'resource-card-title';
  title.textContent = '课程巡检';
  header.appendChild(title);
  const badge = documentRef.createElement('div');
  badge.className = 'resource-card-badge';
  badge.textContent = courseInspectionState.loading
    ? '巡检中'
    : courseInspectionState.error
      ? '需处理'
      : courseInspectionState.inspection
        ? '已完成'
        : '未巡检';
  header.appendChild(badge);
  card.appendChild(header);

  const summary = courseInspectionState.summary || {};
  const stats = documentRef.createElement('div');
  stats.className = 'resources-inspection-stats';
  const statItems = [
    ['课节', summary.section_count ?? '-'],
    ['实验', summary.experiment_count ?? '-'],
    ['文件', summary.file_count ?? '-'],
    ['可测', summary.ready_count ?? 0],
    ['待补', summary.partial_count ?? 0],
    ['异常', summary.broken_count ?? 0],
  ];
  statItems.forEach(([label, value]) => {
    const item = documentRef.createElement('div');
    item.className = 'resources-inspection-stat';
    const strong = documentRef.createElement('strong');
    strong.textContent = String(value);
    const span = documentRef.createElement('span');
    span.textContent = label;
    item.appendChild(strong);
    item.appendChild(span);
    stats.appendChild(item);
  });
  card.appendChild(stats);

  const message = documentRef.createElement('div');
  message.className = courseInspectionState.error ? 'resources-scan-status error' : 'resource-card-desc';
  message.textContent = courseInspectionState.loading
    ? '正在读取课程结构并检查实验入口...'
    : courseInspectionState.error
      ? courseInspectionState.error
      : courseInspectionState.inspection
        ? '已完成整课只读巡检，异常实验会在大纲中标记。'
        : '点击课程巡检，检查整门课程的实验入口与缺失文件。';
  card.appendChild(message);

  return card;
}
