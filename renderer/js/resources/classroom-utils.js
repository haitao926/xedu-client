export function extractResourcesFromClassroomIndex(fetchResp) {
  const indexData = fetchResp?.index;
  if (Array.isArray(indexData)) return indexData;
  if (Array.isArray(indexData?.resources)) return indexData.resources;
  if (Array.isArray(indexData?.items)) return indexData.items;
  return [];
}

export function pickClassroomLaunchResource(fetchResp) {
  const list = extractResourcesFromClassroomIndex(fetchResp);
  if (!list.length) return null;
  const activeId = (fetchResp?.index?.classroom?.active_course_id || '').trim();
  const activeOriginId = (fetchResp?.index?.classroom?.active_course_origin_id || '').trim();
  if (activeId) {
    const matched = list.find((item) => (item?.id || '').trim() === activeId);
    if (matched) return matched;
  }
  if (activeOriginId) {
    const matched = list.find((item) => (item?.origin_id || '').trim() === activeOriginId);
    if (matched) return matched;
  }
  return list[0];
}

export function sanitizePathSegment(value, fallback = 'classroom-course') {
  const text = (value || '').toString().trim();
  const normalized = text
    .replace(/[<>:"|?*]/g, '-')
    .replace(/[\\/]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || fallback;
}

export function resolveClassroomPullTargetPath(resource, projectDir = '', fallbackProjectDir = '') {
  const baseDir = (projectDir || fallbackProjectDir || '').replace(/[\\/]+$/, '');
  if (!baseDir) return '';
  const courseSegment = sanitizePathSegment(resource?.id || resource?.title || 'classroom-course');
  return `${baseDir}/${courseSegment}`;
}

export function findFirstNotebookPathInSection(section, { getExperimentFileOverview, isRemotePath }) {
  const experiments = Array.isArray(section?.experiments) ? section.experiments : [];
  for (const exp of experiments) {
    const overview = getExperimentFileOverview(exp);
    const notebook = (overview?.notebookFiles || []).find((file) => {
      const filePath = (file?.path || '').trim();
      return filePath && !isRemotePath(filePath);
    });
    if (notebook?.path) {
      return notebook.path;
    }
  }
  return '';
}

export function findFirstNotebookPathInCourse(course, preferredSectionIndex = null, { normalizeSections, getExperimentFileOverview, isRemotePath }) {
  const sections = normalizeSections(course || {});
  if (!sections.length) return '';

  if (preferredSectionIndex !== null && preferredSectionIndex !== undefined) {
    const sectionIndex = Number(preferredSectionIndex);
    if (Number.isFinite(sectionIndex) && sectionIndex >= 0 && sectionIndex < sections.length) {
      const preferredPath = findFirstNotebookPathInSection(sections[sectionIndex], { getExperimentFileOverview, isRemotePath });
      if (preferredPath) {
        return preferredPath;
      }
    }
  }

  for (const section of sections) {
    const notebookPath = findFirstNotebookPathInSection(section, { getExperimentFileOverview, isRemotePath });
    if (notebookPath) {
      return notebookPath;
    }
  }
  return '';
}
