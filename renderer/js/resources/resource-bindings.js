export function bindResourcesUI(deps = {}) {
  const {
    documentRef = document,
    state,
    handleSearchInput,
    hasActiveResourceFilters,
    updateResourcesSearchUI,
    applyFilters,
    loadResourcesIndex,
    handleTeacherModeToggle,
    discoverClassrooms,
    openExternal,
    renderResources,
    filteredResources,
    pageState,
    handleListClick,
    showListView,
    ensureTeacherModeForEdit,
    openCreateView,
    deleteCourse,
    currentResource,
    toggleDetailMoreMenu,
    bindDetailMoreMenu,
    startClassroomForResource,
    stopClassroomWithPrompt,
    publishCourseFromDetail,
    toggleCreateEntryMenu,
    bindCreateEntryMenu,
    closeCreateEntryMenu,
    chooseCreateEntryMode,
    closeCreateView,
    quickAddCloudCourse,
    toggleAdvancedPanel,
    updateCreateFormState,
    renderLocalPathSummary,
    renderPackagePathSummary,
    renderCloudCoursePreview,
    createSource,
    sectionCountInputRef,
    setDraftSections,
    buildDefaultSections,
    renderSectionEditor,
    renderMaterialList,
    saveCourseStructure,
    applyCoverFile,
    updateCreateCoverPreview,
    buildDefaultTemplate,
    saveLocalCourse,
    scanCourse,
    publishCourse,
    setCreateStep,
    createStepRef,
    importRemoteCourse,
    setCreateSource,
    pickLocalPackage,
    importLocalPackageToPath,
    pickLocalCourse,
    loadCloudCourseOptions,
    importCloudCourseAndSave,
    loadCloudCoursesFromTempSource,
    clearCloudTempSourceAndReload,
    updateCloudSourceActionUI,
    addResourceSourceRow,
    saveResourceSourcesConfig,
    navigatorRef = navigator,
    resourcesSearchExpandedRef,
  } = deps;

  const searchInput = documentRef.getElementById('resources-search-input');
  const searchToggleBtn = documentRef.getElementById('resources-search-toggle-btn');
  const gradeSelect = documentRef.getElementById('resources-filter-grade');
  const subjectSelect = documentRef.getElementById('resources-filter-subject');
  const tagSelect = documentRef.getElementById('resources-filter-tag');
  const refreshBtn = documentRef.getElementById('resources-refresh-btn');
  const submitBtn = documentRef.getElementById('resources-submit-btn');
  const createSubmitBtn = documentRef.getElementById('resources-create-submit-btn');
  const repoBtn = documentRef.getElementById('resources-repo-btn');
  const prevBtn = documentRef.getElementById('resources-prev-btn');
  const nextBtn = documentRef.getElementById('resources-next-btn');
  const teacherModeButtons = Array.from(documentRef.querySelectorAll('[data-role="teacher-mode-toggle"]'));
  const list = documentRef.getElementById('resources-list');
  const backBtn = documentRef.getElementById('resources-back-btn');
  const detailDownloadBtn = documentRef.getElementById('resources-detail-download');
  const detailEditBtn = documentRef.getElementById('resources-detail-edit');
  const detailDeleteBtn = documentRef.getElementById('resources-detail-delete');
  const detailRepoBtn = documentRef.getElementById('resources-detail-repo');
  const detailUploadBtn = documentRef.getElementById('resources-detail-upload');
  const detailOpenBtn = documentRef.getElementById('resources-detail-open');
  const classroomRefreshBtn = documentRef.getElementById('resources-classroom-refresh');
  const detailClassroomStartBtn = documentRef.getElementById('resources-detail-classroom-start');
  const detailClassroomStopBtn = documentRef.getElementById('resources-detail-classroom-stop');
  const detailMoreBtn = documentRef.getElementById('resources-detail-more-btn');
  const detailMoreMenu = documentRef.getElementById('resources-detail-more-menu');
  const addBtn = documentRef.getElementById('resources-add-btn');
  const addLocalBtn = documentRef.getElementById('resources-add-local-btn');
  const addCloudBtn = documentRef.getElementById('resources-add-cloud-btn');
  const createBackBtn = documentRef.getElementById('resources-create-back-btn');
  const quickCloudBtn = documentRef.getElementById('resources-quick-cloud-btn');
  const advancedToggleBtn = documentRef.getElementById('resources-advanced-toggle');
  const createGenerateBtn = documentRef.getElementById('resources-create-generate-btn');
  const createCopyBtn = documentRef.getElementById('resources-create-copy-btn');
  const createSaveBtn = documentRef.getElementById('resources-create-save-btn');
  const sourceLocalBtn = documentRef.getElementById('resources-source-local');
  const sourceCloudBtn = documentRef.getElementById('resources-source-cloud');
  const pickPackageBtn = documentRef.getElementById('resources-pick-package-btn');
  const useDefaultSampleBtn = documentRef.getElementById('resources-use-default-sample-btn');
  const packageImportBtn = documentRef.getElementById('resources-package-import-btn');
  const pickLocalBtn = documentRef.getElementById('resources-pick-local-btn');
  const cloudRefreshBtn = documentRef.getElementById('resources-cloud-refresh-btn');
  const cloudImportBtn = documentRef.getElementById('resources-cloud-import-btn');
  const cloudDetailImportBtn = documentRef.getElementById('resources-cloud-detail-import-btn');
  const cloudCourseSelect = documentRef.getElementById('resources-cloud-course-select');
  const cloudTempLoadBtn = documentRef.getElementById('resources-cloud-temp-load-btn');
  const cloudTempClearBtn = documentRef.getElementById('resources-cloud-temp-clear-btn');
  const addSourceBtn = documentRef.getElementById('resources-add-source-btn');
  const saveSourcesBtn = documentRef.getElementById('resources-save-sources-btn');
  const sectionCountInput = documentRef.getElementById('resources-section-count');
  const generateSectionsBtn = documentRef.getElementById('resources-generate-sections');
  const addSectionBtn = documentRef.getElementById('resources-add-section');
  const structureSaveBtn = documentRef.getElementById('resources-structure-save-btn');
  const createTitleInput = documentRef.getElementById('resources-create-title');
  const createDescInput = documentRef.getElementById('resources-create-desc');
  const createGradeInput = documentRef.getElementById('resources-create-grade');
  const createSubjectInput = documentRef.getElementById('resources-create-subject');
  const createCoverInput = documentRef.getElementById('resources-create-cover');
  const createPackagePathInput = documentRef.getElementById('resources-create-package-path');
  const createLocalPathInput = documentRef.getElementById('resources-create-local-path');
  const createAuthorInput = documentRef.getElementById('resources-create-author');
  const createVersionInput = documentRef.getElementById('resources-create-version');
  const coverFileInput = documentRef.getElementById('resources-cover-file');
  const coverDrop = documentRef.getElementById('resources-cover-drop');
  const coverClearBtn = documentRef.getElementById('resources-cover-clear');
  const stepPrevBtn = documentRef.getElementById('resources-step-prev');
  const stepNextBtn = documentRef.getElementById('resources-step-next');
  const scanBtn = documentRef.getElementById('resources-scan-btn');
  const rescanBtn = documentRef.getElementById('resources-rescan-btn');
  const publishBtn = documentRef.getElementById('resources-publish-btn');
  const pullBtn = documentRef.getElementById('resources-detail-pull');

  if (searchInput) {
    searchInput.addEventListener('input', handleSearchInput);
    searchInput.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !hasActiveResourceFilters()) {
        resourcesSearchExpandedRef.set(false);
        updateResourcesSearchUI();
      }
    });
  }

  if (searchToggleBtn) {
    searchToggleBtn.addEventListener('click', () => {
      resourcesSearchExpandedRef.set(!resourcesSearchExpandedRef.get());
      updateResourcesSearchUI({ focus: resourcesSearchExpandedRef.get() });
    });
  }

  if (gradeSelect) gradeSelect.addEventListener('change', (event) => { state.filterState.grade = event.target.value; applyFilters(); });
  if (subjectSelect) subjectSelect.addEventListener('change', (event) => { state.filterState.subject = event.target.value; applyFilters(); });
  if (tagSelect) tagSelect.addEventListener('change', (event) => { state.filterState.tag = event.target.value; applyFilters(); });
  if (refreshBtn) refreshBtn.addEventListener('click', loadResourcesIndex);

  if (teacherModeButtons.length) {
    teacherModeButtons.forEach((teacherModeBtn) => {
      if (teacherModeBtn.id === 'topbar-teacher-mode-btn') return;
      teacherModeBtn.addEventListener('click', async () => { await handleTeacherModeToggle(); });
    });
  }

  if (classroomRefreshBtn) {
    classroomRefreshBtn.addEventListener('click', async () => {
      await discoverClassrooms();
      await loadResourcesIndex();
    });
  }

  if (submitBtn) submitBtn.addEventListener('click', () => openExternal(state.submitUrl()));
  if (createSubmitBtn) createSubmitBtn.addEventListener('click', () => openExternal(state.submitUrl()));
  if (repoBtn) repoBtn.addEventListener('click', () => openExternal(state.repoUrl()));

  if (prevBtn) prevBtn.addEventListener('click', () => {
    if (state.pageState.current > 1) {
      state.pageState.current -= 1;
      renderResources(filteredResources());
    }
  });
  if (nextBtn) nextBtn.addEventListener('click', () => {
    const totalPages = Math.max(1, Math.ceil(filteredResources().length / state.pageState.size));
    if (state.pageState.current < totalPages) {
      state.pageState.current += 1;
      renderResources(filteredResources());
    }
  });

  if (list) list.addEventListener('click', deps.handleListClick);
  if (backBtn) backBtn.addEventListener('click', showListView);
  if (detailDownloadBtn) detailDownloadBtn.addEventListener('click', (event) => { const targetUrl = event.currentTarget.dataset.url; if (targetUrl) openExternal(targetUrl); });
  if (detailEditBtn) detailEditBtn.addEventListener('click', async () => { if (deps.currentResource()) { const ok = await ensureTeacherModeForEdit('编辑课程'); if (!ok) return; deps.openCreateView(deps.currentResource()); } });
  if (detailDeleteBtn) detailDeleteBtn.addEventListener('click', async () => { if (deps.currentResource()) { const ok = await ensureTeacherModeForEdit('删除课程'); if (!ok) return; await deleteCourse(deps.currentResource()); } });
  if (detailRepoBtn) detailRepoBtn.addEventListener('click', (event) => { const targetUrl = event.currentTarget.dataset.url; if (targetUrl) openExternal(targetUrl); });
  if (detailOpenBtn) detailOpenBtn.addEventListener('click', async (event) => {
    const path = event.currentTarget.dataset.path;
    if (path) {
      if (window.app?.workspace?.openJupyterWorkspace) {
        await window.app.workspace.openJupyterWorkspace({
          projectDir: path,
          sourceLabel: `${deps.currentResource()?.title || '课程'} / 课程目录`,
          sourcePage: deps.teacherUnlocked() ? 'resources' : 'main',
        });
      }
      if (window.app?.jupyter?.startJupyter) {
        await window.app.jupyter.startJupyter();
      }
    }
  });

  if (detailMoreBtn && detailMoreMenu) {
    detailMoreBtn.addEventListener('click', (event) => { event.stopPropagation(); deps.toggleDetailMoreMenu(); });
    detailMoreMenu.addEventListener('click', () => { detailMoreMenu.classList.remove('is-open'); });
    deps.bindDetailMoreMenu();
  }

  if (detailClassroomStartBtn) detailClassroomStartBtn.addEventListener('click', async () => { if (deps.currentResource()) await deps.startClassroomForResource(deps.currentResource()); });
  if (detailClassroomStopBtn) detailClassroomStopBtn.addEventListener('click', async () => { await deps.stopClassroomWithPrompt(); });
  if (detailUploadBtn) detailUploadBtn.addEventListener('click', async () => { if (!deps.currentResource()) return; const ok = await ensureTeacherModeForEdit('上传课程'); if (!ok) return; await deps.publishCourseFromDetail(deps.currentResource()); });

  if (addBtn) { addBtn.addEventListener('click', (event) => { event.stopPropagation(); deps.toggleCreateEntryMenu(); }); deps.bindCreateEntryMenu(); }
  if (addLocalBtn) addLocalBtn.addEventListener('click', () => { deps.closeCreateEntryMenu(); deps.openCreateView(); deps.chooseCreateEntryMode('pack-import'); });
  if (addCloudBtn) addCloudBtn.addEventListener('click', () => { deps.closeCreateEntryMenu(); deps.openCreateView(); deps.chooseCreateEntryMode('cloud-import'); });
  if (createBackBtn) createBackBtn.addEventListener('click', deps.closeCreateView);
  if (quickCloudBtn) quickCloudBtn.addEventListener('click', deps.quickAddCloudCourse);
  if (advancedToggleBtn) advancedToggleBtn.addEventListener('click', deps.toggleAdvancedPanel);

  [createTitleInput, createDescInput, createGradeInput, createSubjectInput, createCoverInput, createAuthorInput, createVersionInput].forEach((input) => {
    if (input) input.addEventListener('input', deps.updateCreateFormState);
  });
  if (createPackagePathInput) createPackagePathInput.addEventListener('input', () => { deps.renderPackagePathSummary(); deps.updateCreateFormState(); });
  if (createLocalPathInput) createLocalPathInput.addEventListener('input', () => { deps.renderLocalPathSummary(); deps.updateCreateFormState(); });
  if (cloudCourseSelect) cloudCourseSelect.addEventListener('change', () => { deps.renderCloudCoursePreview(); deps.updateCreateFormState(); });
  if (sectionCountInput) sectionCountInput.addEventListener('input', deps.updateCreateFormState);

  if (generateSectionsBtn) generateSectionsBtn.addEventListener('click', () => {
    if (deps.createSource() !== 'local') return;
    const count = Number(sectionCountInputRef?.value || sectionCountInput?.value || 1) || 1;
    setDraftSections(buildDefaultSections(count, 2));
    renderSectionEditor();
    renderMaterialList();
    deps.updateCreateFormState();
  });

  if (addSectionBtn) addSectionBtn.addEventListener('click', () => {
    if (deps.createSource() !== 'local') return;
    const nextIndex = deps.draftSections().length + 1;
    setDraftSections([
      ...deps.draftSections(),
      {
        title: `第 ${nextIndex} 节`,
        description: '',
        experiments: [{ title: '实验一', description: '', files: [] }],
      },
    ]);
    renderSectionEditor();
    renderMaterialList();
    deps.updateCreateFormState();
  });

  if (structureSaveBtn) structureSaveBtn.addEventListener('click', deps.saveCourseStructure);
  if (coverFileInput) coverFileInput.addEventListener('change', async (event) => { const file = event.target.files?.[0]; await deps.applyCoverFile(file); });

  if (coverDrop) {
    ['dragenter', 'dragover'].forEach((evt) => {
      coverDrop.addEventListener(evt, (event) => { event.preventDefault(); coverDrop.classList.add('dragover'); });
    });
    ['dragleave', 'dragend'].forEach((evt) => {
      coverDrop.addEventListener(evt, () => { coverDrop.classList.remove('dragover'); });
    });
    coverDrop.addEventListener('drop', async (event) => {
      event.preventDefault();
      coverDrop.classList.remove('dragover');
      const file = event.dataTransfer?.files?.[0];
      await deps.applyCoverFile(file);
    });
  }

  if (coverClearBtn) coverClearBtn.addEventListener('click', () => {
    if (coverFileInput) coverFileInput.value = '';
    if (createCoverInput) createCoverInput.value = '';
    deps.updateCreateCoverPreview();
    deps.updateCreateFormState();
  });

  if (createGenerateBtn) createGenerateBtn.addEventListener('click', () => {
    const title = documentRef.getElementById('resources-create-title')?.value.trim() || '课程名称';
    const templateEl = documentRef.getElementById('resources-create-template');
    if (templateEl) templateEl.value = JSON.stringify(buildDefaultTemplate(title), null, 2);
  });

  if (createCopyBtn) createCopyBtn.addEventListener('click', async () => {
    const templateEl = documentRef.getElementById('resources-create-template');
    if (!templateEl) return;
    try {
      await navigatorRef.clipboard.writeText(templateEl.value);
    } catch (error) {
      console.warn('复制模板失败:', error);
    }
  });

  if (createSaveBtn) createSaveBtn.addEventListener('click', deps.saveLocalCourse);
  if (scanBtn) scanBtn.addEventListener('click', deps.scanCourse);
  if (rescanBtn) rescanBtn.addEventListener('click', deps.scanCourse);
  if (publishBtn) publishBtn.addEventListener('click', deps.publishCourse);
  if (stepPrevBtn) stepPrevBtn.addEventListener('click', () => { if (deps.createSource() === 'cloud') { deps.closeCreateView(); return; } deps.setCreateStep(deps.createStep() - 1); });
  if (stepNextBtn) stepNextBtn.addEventListener('click', () => { if (deps.createStep() < 3) { deps.setCreateStep(deps.createStep() + 1); } else { showListView(); } });
  if (pullBtn) pullBtn.addEventListener('click', async () => {
    if (!deps.currentResource()) return;
    if (deps.currentResource().source === 'local') {
      const ok = await ensureTeacherModeForEdit('拉取课程更新');
      if (!ok) return;
      await deps.pullLatestForLocalCourse(deps.currentResource());
      return;
    }
    await deps.importRemoteCourse(deps.currentResource());
  });

  if (sourceLocalBtn) sourceLocalBtn.addEventListener('click', () => deps.setCreateSource('local'));
  if (sourceCloudBtn) sourceCloudBtn.addEventListener('click', () => deps.setCreateSource('cloud'));
  if (pickPackageBtn) pickPackageBtn.addEventListener('click', deps.pickLocalPackage);
  if (useDefaultSampleBtn) useDefaultSampleBtn.addEventListener('click', deps.useDefaultSampleCourse);
  if (packageImportBtn) packageImportBtn.addEventListener('click', deps.importLocalPackageToPath);
  if (pickLocalBtn) pickLocalBtn.addEventListener('click', deps.pickLocalCourse);
  if (cloudRefreshBtn) cloudRefreshBtn.addEventListener('click', deps.loadCloudCourseOptions);
  if (cloudImportBtn) cloudImportBtn.addEventListener('click', deps.importCloudCourseAndSave);
  if (cloudDetailImportBtn) cloudDetailImportBtn.addEventListener('click', deps.importCloudCourseAndSave);
  if (cloudTempLoadBtn) cloudTempLoadBtn.addEventListener('click', deps.loadCloudCoursesFromTempSource);
  if (cloudTempClearBtn) cloudTempClearBtn.addEventListener('click', deps.clearCloudTempSourceAndReload);

  const cloudRepoAddressInput = documentRef.getElementById('resources-cloud-repo-address');
  const cloudRepoTokenInput = documentRef.getElementById('resources-cloud-temp-token');
  if (cloudRepoAddressInput) cloudRepoAddressInput.addEventListener('input', deps.updateCloudSourceActionUI);
  if (cloudRepoTokenInput) cloudRepoTokenInput.addEventListener('input', deps.updateCloudSourceActionUI);
  if (addSourceBtn) addSourceBtn.addEventListener('click', deps.addResourceSourceRow);
  if (saveSourcesBtn) saveSourcesBtn.addEventListener('click', deps.saveResourceSourcesConfig);

  deps.updateCloudSourceActionUI();
}
