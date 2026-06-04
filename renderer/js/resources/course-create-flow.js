export function fillCreateFormFromCourseFlow(course, deps = {}) {
  if (!course) return;
  const {
    documentRef = document,
    updateCreateCoverPreview,
  } = deps;
  const idInput = documentRef.getElementById('resources-create-id');
  const versionInput = documentRef.getElementById('resources-create-version');
  const titleInput = documentRef.getElementById('resources-create-title');
  const descInput = documentRef.getElementById('resources-create-desc');
  const gradeInput = documentRef.getElementById('resources-create-grade');
  const subjectInput = documentRef.getElementById('resources-create-subject');
  const authorInput = documentRef.getElementById('resources-create-author');
  const tagsInput = documentRef.getElementById('resources-create-tags');
  const coverInput = documentRef.getElementById('resources-create-cover');
  const fillEmptyOnly = deps.fillEmptyOnly !== false;

  const assign = (el, value) => {
    if (!el) return;
    if (fillEmptyOnly && el.value) return;
    el.value = value || '';
  };

  assign(idInput, course.id || '');
  assign(versionInput, course.version || '1.0');
  assign(titleInput, course.title || '');
  assign(descInput, course.description || '');
  assign(gradeInput, course.grade || '');
  assign(subjectInput, course.subject || '');
  assign(authorInput, course.author || '');
  if (tagsInput && Array.isArray(course.tags)) {
    if (!(fillEmptyOnly && tagsInput.value)) {
      tagsInput.value = course.tags.join(', ');
    }
  }
  const cover = course.cover || course.cover_url || '';
  if (coverInput && cover && !(fillEmptyOnly && coverInput.value)) {
    coverInput.value = cover;
  }
  updateCreateCoverPreview();
}

export async function importLocalCourseFromPathFlow(path, deps = {}) {
  if (!path) return false;
  const {
    apiClient,
    deriveTitleFromPath,
    setScannedCourse,
    setScanSummary,
    setScanError,
    setDraftSections,
    fillCreateFormFromCourse,
    renderSectionEditor,
    renderMaterialList,
    renderScanStatus,
    renderStructurePreview,
    renderCoursePreview,
    updateCreateFormState,
    renderCreateGuide,
    alertUser = alert,
  } = deps;
  try {
    const title = deriveTitleFromPath(path);
    const response = await apiClient.post('/api/resources/scan', {
      local_path: path,
      init_if_missing: true,
      auto_build: true,
      meta: { title },
    });
    if (!response?.success || !response.course) {
      throw new Error(response?.message || '读取本地课程失败');
    }
    setScannedCourse(response.course);
    setScanSummary(response.summary || null);
    setScanError('');
    setDraftSections(Array.isArray(response.course.sections) ? response.course.sections : []);
    fillCreateFormFromCourse(response.course, true);
    renderSectionEditor();
    renderMaterialList();
    renderScanStatus();
    renderStructurePreview();
    renderCoursePreview();
    updateCreateFormState();
    return true;
  } catch (error) {
    setScanError(error?.message || '读取本地课程失败');
    renderCreateGuide();
    alertUser(error?.message || '读取本地课程失败');
    return false;
  }
}

export async function pickLocalCourseFlow(deps = {}) {
  const {
    electronAPI = window.electronAPI,
    documentRef = document,
    renderLocalPathSummary,
    createEntryMode,
    getCreateMetaFromForm,
    deriveTitleFromPath,
    apiClient,
    setScannedCourse,
    setScanSummary,
    setScanError,
    draftSections,
    buildDefaultSections,
    fillCreateFormFromCourse,
    renderSectionEditor,
    renderMaterialList,
    renderScanStatus,
    renderStructurePreview,
    renderCoursePreview,
    updateCreateFormState,
    alertUser = alert,
  } = deps;
  if (electronAPI && typeof electronAPI.invoke === 'function') {
    try {
      const path = await electronAPI.invoke('select-folder');
      if (path) {
        const input = documentRef.getElementById('resources-create-local-path');
        if (input) input.value = path;
        renderLocalPathSummary();
        if (createEntryMode === 'new') {
          const meta = getCreateMetaFromForm();
          const title = meta.title || deriveTitleFromPath(path);
          const response = await apiClient.post('/api/resources/scan', {
            local_path: path,
            init_if_missing: true,
            auto_build: false,
            meta: {
              ...meta,
              title,
            },
          });
          if (!response?.success || !response.course) {
            throw new Error(response?.message || '初始化课程失败');
          }
          setScannedCourse(response.course);
          setScanSummary(response.summary || null);
          setScanError('');
          if (!draftSections().length) {
            setDraftSections(buildDefaultSections(1, 1));
          }
          fillCreateFormFromCourse(response.course, true);
          renderSectionEditor();
          renderMaterialList();
          renderScanStatus();
          renderStructurePreview();
          renderCoursePreview();
        }
        updateCreateFormState();
      }
    } catch (error) {
      console.error('选择本地课程失败:', error);
      alertUser(error?.message || '选择本地课程失败');
    }
  } else {
    alertUser('请在桌面应用中使用本地上传功能');
  }
}

export async function importLocalPackageToPathFlow(deps = {}) {
  const {
    documentRef = document,
    apiClient,
    setScannedCourse,
    setScanSummary,
    setScanError,
    setDraftSections,
    fillCreateFormFromCourse,
    renderSectionEditor,
    renderMaterialList,
    renderScanStatus,
    renderStructurePreview,
    renderCoursePreview,
    renderLocalPathSummary,
    updateCreateFormState,
    renderCreateGuide,
    alertUser = alert,
  } = deps;

  const packagePath = documentRef.getElementById('resources-create-package-path')?.value.trim() || '';
  const targetPath = documentRef.getElementById('resources-create-local-path')?.value.trim() || '';
  if (!packagePath) {
    alertUser('请先选择 Skill 课程包。');
    return false;
  }

  try {
    const response = await apiClient.post('/api/resources/import-package-local', {
      package_path: packagePath,
      target_path: targetPath,
      replace_existing: true,
    });
    if (!response?.success || !response.course) {
      throw new Error(response?.message || '导入课程包失败');
    }
    const course = {
      ...response.course,
      local_path: response.local_path || targetPath,
    };
    const localPathInput = documentRef.getElementById('resources-create-local-path');
    if (localPathInput) localPathInput.value = course.local_path || '';
    if (typeof renderLocalPathSummary === 'function') {
      renderLocalPathSummary();
    }
    setScannedCourse(course);
    setScanSummary(response.summary || null);
    setScanError('');
    setDraftSections(Array.isArray(course.sections) ? course.sections : []);
    fillCreateFormFromCourse(course, true);
    renderSectionEditor();
    renderMaterialList();
    renderScanStatus();
    renderStructurePreview();
    renderCoursePreview();
    updateCreateFormState();
    return true;
  } catch (error) {
    setScanError(error?.message || '导入课程包失败');
    renderCreateGuide();
    updateCreateFormState();
    alertUser(error?.message || '导入课程包失败');
    return false;
  }
}

export async function pickLocalPackageFlow(deps = {}) {
  const {
    electronAPI = window.electronAPI,
    documentRef = document,
    renderPackagePathSummary,
    updateCreateFormState,
    alertUser = alert,
  } = deps;
  if (electronAPI && typeof electronAPI.invoke === 'function') {
    try {
      const path =
        (typeof electronAPI.selectCoursePackage === 'function'
          ? await electronAPI.selectCoursePackage()
          : await electronAPI.invoke('select-course-package'));
      if (path) {
        const input = documentRef.getElementById('resources-create-package-path');
        if (input) input.value = path;
        renderPackagePathSummary();
        updateCreateFormState();
      }
    } catch (error) {
      console.error('选择课程包失败:', error);
      alertUser(error?.message || '选择课程包失败');
    }
  } else {
    alertUser('请在桌面应用中使用课程包导入功能');
  }
}

export async function fetchCloudCourseFlow(deps = {}) {
  const {
    documentRef = document,
    cloudCourseOptions,
    electronAPI = window.electronAPI,
    renderLocalPathSummary,
    normalizeOrigin,
    cloudTempSource,
    buildSourceOverrideFromCourseMeta,
    cloudTempToken,
    apiClient,
    setScannedCourse,
    setScanSummary,
    setScanError,
    setDraftSections,
    setCloudImported,
    updateCreateCoverPreview,
    renderSectionEditor,
    renderMaterialList,
    renderScanStatus,
    renderStructurePreview,
    renderCoursePreview,
    updateCreateFormState,
    alertUser = alert,
  } = deps;

  const selectedValue = documentRef.getElementById('resources-cloud-course-select')?.value || '';
  const selectedCourse = cloudCourseOptions.find((item) => (item.id || item.package_url || item.course_url) === selectedValue);
  if (!selectedCourse) {
    alertUser('请先选择云端课程');
    return;
  }

  try {
    const pullPayload = {
      course_url: selectedCourse.course_url || '',
      package_url: selectedCourse.package_url || '',
      replace_existing: true,
      source_id: selectedCourse.source_id || '',
      course_id: selectedCourse.id || '',
    };
    const selectedSourceOverride = cloudTempSource
      ? normalizeOrigin({
          source_id: cloudTempSource.source_id || 'override',
          base_url: cloudTempSource.base_url,
          repo: cloudTempSource.repo,
          branch: cloudTempSource.branch || 'main',
          index_path: cloudTempSource.index_path || 'index.json',
          publish_path: cloudTempSource.publish_path || 'courses',
          single_course_repo: Boolean(cloudTempSource.single_course_repo),
        })
      : buildSourceOverrideFromCourseMeta(selectedCourse);
    if (selectedSourceOverride) {
      pullPayload.source_override = {
        id: selectedSourceOverride.source_id || 'override',
        ...selectedSourceOverride,
      };
      if (cloudTempToken) {
        pullPayload.token_override = cloudTempToken;
      }
    }

    const response = await apiClient.post('/api/resources/pull', pullPayload);
    if (!response?.success || !response.course) {
      throw new Error(response?.message || '云端导入失败');
    }

    const course = {
      ...(response.course || {}),
      origin: normalizeOrigin(response.origin || buildSourceOverrideFromCourseMeta(selectedCourse)),
    };
    setScannedCourse(course);
    setScanSummary(response.summary || null);
    setScanError('');
    setDraftSections(Array.isArray(course.sections) ? course.sections : []);
    setCloudImported(true);

    const localPathInput = documentRef.getElementById('resources-create-local-path');
    if (localPathInput) localPathInput.value = response.local_path || '';
    renderLocalPathSummary();

    const idInput = documentRef.getElementById('resources-create-id');
    const versionInput = documentRef.getElementById('resources-create-version');
    const titleInput = documentRef.getElementById('resources-create-title');
    const descInput = documentRef.getElementById('resources-create-desc');
    const gradeInput = documentRef.getElementById('resources-create-grade');
    const subjectInput = documentRef.getElementById('resources-create-subject');
    const authorInput = documentRef.getElementById('resources-create-author');
    const tagsInput = documentRef.getElementById('resources-create-tags');
    const coverInput = documentRef.getElementById('resources-create-cover');

    if (idInput && !idInput.value) idInput.value = course.id || '';
    if (versionInput && !versionInput.value) versionInput.value = course.version || '1.0';
    if (titleInput && !titleInput.value) titleInput.value = course.title || '';
    if (descInput && !descInput.value) descInput.value = course.description || '';
    if (gradeInput && !gradeInput.value) gradeInput.value = course.grade || '';
    if (subjectInput && !subjectInput.value) subjectInput.value = course.subject || '';
    if (authorInput && !authorInput.value) authorInput.value = course.author || '';
    if (tagsInput && !tagsInput.value && Array.isArray(course.tags)) tagsInput.value = course.tags.join(', ');

    const cover = course.cover || course.cover_url || '';
    if (coverInput && cover && !coverInput.value) {
      coverInput.value = cover;
    }
    updateCreateCoverPreview();
  } catch (error) {
    console.warn('拉取云端课程失败:', error);
    let message = error?.message || '拉取失败，请检查资源库配置';
    if (error?.details) {
      try {
        const parsed = JSON.parse(error.details);
        if (parsed?.message) {
          message = parsed.message;
        }
      } catch (_) {
        // keep default
      }
    }
    alertUser(message);
    setScanError(error?.message || '云端拉取失败');
  } finally {
    renderSectionEditor();
    renderMaterialList();
    renderScanStatus();
    renderStructurePreview();
    renderCoursePreview();
    updateCreateFormState();
  }
}

export async function importCloudCourseAndSaveFlow(fetchCloudCourse, saveLocalCourse) {
  await fetchCloudCourse();
  await saveLocalCourse();
}

export async function quickAddLocalCourseFlow(deps = {}) {
  const {
    electronAPI = window.electronAPI,
    deriveTitleFromPath,
    apiClient,
    addCourse,
    buildQuickCourse,
    alertUser = alert,
  } = deps;
  if (electronAPI && typeof electronAPI.invoke === 'function') {
    try {
      const path = await electronAPI.invoke('select-folder');
      if (!path) return null;
      const title = deriveTitleFromPath(path);
      try {
        const response = await apiClient.post('/api/resources/scan', {
          local_path: path,
          init_if_missing: true,
          auto_build: true,
          meta: { title },
        });
        if (response?.success && response.course) {
          const course = {
            ...response.course,
            local_path: path,
            source: 'local',
            updated_at: new Date().toISOString().slice(0, 10),
          };
          addCourse(course);
          return course;
        }
      } catch (scanError) {
        console.warn('快速导入解析失败，使用默认模板:', scanError);
      }

      const fallback = buildQuickCourse({
        title,
        localPath: path,
      });
      addCourse(fallback);
      return fallback;
    } catch (error) {
      console.error('快速导入本地课程失败:', error);
      return null;
    }
  }
  alertUser('请在桌面应用中使用本地上传功能');
  return null;
}

export async function quickAddCloudCourseFlow(deps = {}) {
  const {
    documentRef = document,
    deriveTitleFromUrl,
    buildQuickCourse,
    addCourse,
  } = deps;
  const url = documentRef.getElementById('resources-quick-cloud-url')?.value.trim();
  if (!url) return;
  let data = null;
  try {
    const response = await fetch(url);
    if (response.ok) {
      data = await response.json();
    }
  } catch (error) {
    console.warn('拉取云端课程失败，使用链接创建:', error);
  }

  const course = buildQuickCourse({
    title: data?.title || deriveTitleFromUrl(url),
    cloudUrl: url,
    templateData: data,
  });
  addCourse(course);
}

export function buildQuickCourseFlow({ title, localPath = '', cloudUrl = '', templateData = null }, deps = {}) {
  return deps.buildQuickCoursePayload({
    title,
    localPath,
    cloudUrl,
    templateData,
    normalizeTagsInput: deps.normalizeTagsInput,
    isPackageUrl: deps.isPackageUrl,
    normalizeCourseQuickFormDefaults: deps.normalizeCourseQuickFormDefaults,
  });
}

export function buildCourseFromFormFlow(baseCourse = null, deps = {}) {
  const documentRef = deps.documentRef || document;
  const quickFormEnabledInput = documentRef.getElementById('resources-create-quickform-enabled');
  const quickFormHtmlPathInput = documentRef.getElementById('resources-create-quickform-html-path');

  return deps.buildCourseFromFormPayload({
    formValues: {
      title: documentRef.getElementById('resources-create-title')?.value.trim() || '未命名课程',
      description: documentRef.getElementById('resources-create-desc')?.value.trim() || '',
      grade: documentRef.getElementById('resources-create-grade')?.value.trim() || '',
      subject: documentRef.getElementById('resources-create-subject')?.value.trim() || '',
      author: documentRef.getElementById('resources-create-author')?.value.trim() || '',
      version: documentRef.getElementById('resources-create-version')?.value.trim() || '',
      courseId: documentRef.getElementById('resources-create-id')?.value.trim() || '',
      tags: deps.parseTags(documentRef.getElementById('resources-create-tags')?.value || ''),
      cover: documentRef.getElementById('resources-create-cover')?.value.trim() || '',
      localPath: documentRef.getElementById('resources-create-local-path')?.value.trim() || '',
      ...(quickFormEnabledInput ? { quickFormEnabled: quickFormEnabledInput.checked } : {}),
      ...(quickFormHtmlPathInput ? { quickFormHtmlPath: quickFormHtmlPathInput.value.trim() } : {}),
    },
    baseCourse,
    scannedCourse: deps.scannedCourse,
    normalizeOrigin: deps.normalizeOrigin,
    normalizeCourseQuickFormDefaults: deps.normalizeCourseQuickFormDefaults,
  });
}

export function addCourseFlow(course, options = {}, deps = {}) {
  const normalizedCourse = {
    ...(course || {}),
    source: 'local',
  };
  const normalizedOrigin = deps.normalizeOrigin(normalizedCourse.origin || {});
  if (normalizedOrigin) {
    normalizedCourse.origin = normalizedOrigin;
  }
  const courseId = (normalizedCourse?.id || '').trim();
  const localPath = (normalizedCourse?.local_path || '').trim();
  const existingIndex = deps.localCourses.findIndex((item) => {
    if (!item) return false;
    if (courseId && item.id === courseId) return true;
    if (localPath && item.local_path === localPath) return true;
    return false;
  });

  if (existingIndex >= 0) {
    deps.localCourses.splice(existingIndex, 1);
  }
  deps.setLocalCourses([normalizedCourse, ...deps.localCourses]);
  deps.persistLocalCoursesState();
  deps.buildFilterOptions();
  deps.applyFilters();
  deps.closeCreateView();
  if (deps.currentResource && ((courseId && deps.currentResource.id === courseId) || (localPath && deps.currentResource.local_path === localPath))) {
    deps.setCurrentResource(normalizedCourse);
  }
  if (!options.silent) {
    if (existingIndex >= 0) {
      deps.notifyCourseUpdated(normalizedCourse);
    } else {
      deps.notifyCourseCreated(normalizedCourse);
    }
  }
  return existingIndex >= 0;
}

export async function saveLocalCourseFlow(deps = {}) {
  if (deps.createEntryMode === 'pack-import' && !deps.scannedCourse()) {
    alert('请先导入 Skill 课程包。');
    return;
  }
  if (!deps.isCreateInfoComplete()) {
    alert('请先填写课程名称。');
    deps.updateCreateFormState();
    return;
  }
  if (!deps.scannedCourse()) {
    if (deps.createSource === 'local') {
      deps.setDraftSections(deps.ensureMinimumSections(deps.draftSections()));
      deps.renderSectionEditor();
      deps.renderMaterialList();
      deps.renderStructurePreview();
    }
    await deps.saveCourseStructure();
  }
  if (!deps.scannedCourse()) {
    alert('保存课程结构失败，请先检查本地课程目录。');
    return;
  }
  const baseCourse =
    deps.editingCourseId && deps.localCourses.length
      ? deps.localCourses.find((item) => item.id === deps.editingCourseId)
      : null;
  const localPathInput = deps.documentRef.getElementById('resources-create-local-path');
  const localPath = localPathInput?.value.trim() || '';
  const fallbackPath = (baseCourse?.local_path || '').trim();
  const resolvedLocalPath = localPath || fallbackPath;
  if (!resolvedLocalPath) {
    alert('请先选择本地课程目录。');
    deps.updateCreateFormState();
    return;
  }
  if (!localPath && localPathInput && fallbackPath) {
    localPathInput.value = fallbackPath;
  }
  const course = deps.buildCourseFromForm(baseCourse);
  const courseToStore = deps.cloudImported() ? deps.withCourseSyncFingerprint(course) : course;
  const persistedCourse = await deps.persistCourseToDisk(courseToStore, deps.apiClient);
  const finalCourse = persistedCourse
    ? {
        ...courseToStore,
        ...persistedCourse,
        local_path: courseToStore.local_path,
        source: 'local',
        origin: courseToStore.origin || persistedCourse.origin || undefined,
        sync: courseToStore.sync || persistedCourse.sync || undefined,
      }
    : courseToStore;
  if (deps.editingCourseId) {
    deps.updateCourse(finalCourse);
  } else {
    deps.addCourse(finalCourse);
  }
}

export function updateCourseFlow(course, deps = {}) {
  const normalizedCourse = {
    ...(course || {}),
    source: 'local',
  };
  const normalizedOrigin = deps.normalizeOrigin(normalizedCourse.origin || {});
  if (normalizedOrigin) {
    normalizedCourse.origin = normalizedOrigin;
  }
  const index = deps.localCourses.findIndex((item) => item.id === normalizedCourse.id);
  if (index >= 0) {
    deps.localCourses[index] = normalizedCourse;
  } else {
    deps.setLocalCourses([normalizedCourse, ...deps.localCourses]);
  }
  deps.persistLocalCoursesState();
  deps.buildFilterOptions();
  deps.applyFilters();
  deps.clearEditingCourseId();
  deps.showDetailView(normalizedCourse);
  deps.notifyCourseUpdated(normalizedCourse);
}
