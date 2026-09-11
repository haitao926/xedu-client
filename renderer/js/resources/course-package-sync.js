function normalize(value) {
  return String(value || "").trim();
}

function courseMatchesId(course, courseId) {
  const ids = [course?.id, course?.course_id, course?.origin_id, course?.resource_id]
    .map(normalize)
    .filter(Boolean);
  return ids.includes(courseId);
}

function courseMatchesVersion(course, version) {
  return normalize(course?.version || course?.course_version) === version;
}

function safeCourseDirectoryName(courseId) {
  const normalized = normalize(courseId)
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/\.{2,}/g, ".")
    .replace(/^[._-]+|[._-]+$/g, "")
    .slice(0, 96);
  return normalized || "course";
}

function joinCoursePath(root, courseId) {
  const normalizedRoot = normalize(root).replace(/[\\/]+$/, "");
  if (!normalizedRoot) return "";
  return `${normalizedRoot}/${safeCourseDirectoryName(courseId)}`;
}

export async function ensureLocalTaskCourse(taskContext, deps = {}) {
  const courseId = normalize(taskContext?.course_id);
  const expectedVersion = normalize(taskContext?.course_version);
  if (!courseId) throw new Error("本地任务缺少课程身份");

  const localCourses = Array.isArray(deps.localCourses) ? deps.localCourses : [];
  const currentCourse = localCourses.find((course) => courseMatchesId(course, courseId)) || null;
  if (currentCourse && (!expectedVersion || courseMatchesVersion(currentCourse, expectedVersion))) {
    return currentCourse;
  }

  if (!expectedVersion || !normalize(taskContext?.package_url)) {
    throw new Error(currentCourse ? "本地课程版本已过期，平台未提供更新课程包" : "找不到本地课程，平台未提供课程包");
  }
  if (typeof deps.electronAPI?.downloadXEduCoursePackage !== "function") {
    throw new Error("当前环境不支持自动下载课程包");
  }
  const coursesRoot = normalize(deps.coursesRoot);
  const targetPath = normalize(currentCourse?.local_path) || joinCoursePath(coursesRoot, courseId);
  if (!targetPath) throw new Error("请先在设置中选择课程文件夹");

  let downloadResult = null;
  try {
    downloadResult = await deps.electronAPI.downloadXEduCoursePackage(taskContext);
    if (!downloadResult?.success || !normalize(downloadResult.package_path)) {
      throw new Error(normalize(downloadResult?.error) || "课程包下载失败");
    }
    if (typeof deps.apiClient?.post !== "function") throw new Error("本地课程导入服务不可用");
    const imported = await deps.apiClient.post("/api/resources/import-package-local", {
      package_path: downloadResult.package_path,
      target_path: targetPath,
      replace_existing: true,
      expected_course_id: courseId,
      expected_course_version: expectedVersion,
    });
    if (!imported?.success || !imported.course) {
      throw new Error(normalize(imported?.message) || "课程包导入失败");
    }
    if (typeof deps.refreshResources === "function") await deps.refreshResources();
    return imported.course;
  } finally {
    const cleanupToken = normalize(downloadResult?.cleanup_token);
    if (cleanupToken && typeof deps.electronAPI?.cleanupXEduCoursePackage === "function") {
      await deps.electronAPI.cleanupXEduCoursePackage(cleanupToken).catch(() => {});
    }
  }
}

export { courseMatchesId, courseMatchesVersion, joinCoursePath };
