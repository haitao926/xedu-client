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

export async function inspectCloudCourseOptionFlow(resource, deps) {
  const { apiClient, buildInspectCoursePayload, mergeInspectionCourse } = deps;
  const payload = buildInspectCoursePayload(resource);
  if (!payload) {
    throw new Error('缺少课程路径或资源库配置，无法读取课程结构');
  }

  const response = await apiClient.post('/api/resources/inspect-course', payload);
  if (!response?.success) {
    throw new Error(response?.message || '读取课程结构失败');
  }

  return {
    course: mergeInspectionCourse(resource, response),
    summary: response.summary || null,
  };
}
