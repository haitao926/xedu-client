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
    showListView,
    ensureTeacherModeForEdit,
    deleteCourse,
    currentResource,
    toggleDetailMoreMenu,
    bindDetailMoreMenu,
    startClassroomForResource,
    stopClassroomWithPrompt,
    resourcesSearchExpandedRef,
    openCreateView,
    toggleCreateEntryMenu,
    bindCreateEntryMenu,
    closeCreateEntryMenu,
    chooseCreateEntryMode,
    closeCreateView,
    updateCreateFormState,
    renderPackagePathSummary,
    renderLocalPathSummary,
    renderCloudCoursePreview,
    createSource,
    setCreateSource,
    setCreateStep,
    createStep,
    pickLocalPackage,
    useDefaultSampleCourse,
    importLocalPackageToPath,
    pickLocalCourse,
    loadCloudCourseOptions,
    importCloudCourseAndSave,
    loadCloudCoursesFromTempSource,
    clearCloudTempSourceAndReload,
    updateCloudSourceActionUI,
    teacherUnlocked = () => false,
  } = deps;

  const searchInput = documentRef.getElementById('resources-search-input');
  const searchToggleBtn = documentRef.getElementById('resources-search-toggle-btn');
  const gradeSelect = documentRef.getElementById('resources-filter-grade');
  const subjectSelect = documentRef.getElementById('resources-filter-subject');
  const tagSelect = documentRef.getElementById('resources-filter-tag');
  const refreshBtn = documentRef.getElementById('resources-refresh-btn');
  const prevBtn = documentRef.getElementById('resources-prev-btn');
  const nextBtn = documentRef.getElementById('resources-next-btn');
  const teacherModeButtons = Array.from(documentRef.querySelectorAll('[data-role="teacher-mode-toggle"]'));
  const list = documentRef.getElementById('resources-list');
  const empty = documentRef.getElementById('resources-empty');
  const backBtn = documentRef.getElementById('resources-back-btn');
  const detailDownloadBtn = documentRef.getElementById('resources-detail-download');
  const detailDeleteBtn = documentRef.getElementById('resources-detail-delete');
  const detailRepoBtn = documentRef.getElementById('resources-detail-repo');
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
  const createPackagePathInput = documentRef.getElementById('resources-create-package-path');
  const createLocalPathInput = documentRef.getElementById('resources-create-local-path');
  const createTitleInput = documentRef.getElementById('resources-create-title');
  const createDescInput = documentRef.getElementById('resources-create-desc');
  const createGradeInput = documentRef.getElementById('resources-create-grade');
  const createSubjectInput = documentRef.getElementById('resources-create-subject');
  const createStepPrevBtn = documentRef.getElementById('resources-step-prev');
  const createStepNextBtn = documentRef.getElementById('resources-step-next');
  const cloudRepoAddressInput = documentRef.getElementById('resources-cloud-repo-address');
  const cloudRepoTokenInput = documentRef.getElementById('resources-cloud-temp-token');

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
      if (teacherModeBtn.id === 'sidebar-teacher-mode-btn') return;
      teacherModeBtn.addEventListener('click', async () => { await handleTeacherModeToggle(); });
    });
  }

  if (classroomRefreshBtn) {
    classroomRefreshBtn.addEventListener('click', async () => {
      await discoverClassrooms();
      await loadResourcesIndex();
    });
  }

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
  if (empty) empty.addEventListener('click', deps.handleListClick);
  if (backBtn) backBtn.addEventListener('click', showListView);
  if (detailDownloadBtn) detailDownloadBtn.addEventListener('click', (event) => {
    const targetUrl = event.currentTarget.dataset.url;
    if (targetUrl) openExternal(targetUrl);
  });
  if (detailDeleteBtn) detailDeleteBtn.addEventListener('click', async () => {
    if (currentResource()) {
      const ok = await ensureTeacherModeForEdit('移除本地课程');
      if (!ok) return;
      await deleteCourse(currentResource());
    }
  });
  if (detailRepoBtn) detailRepoBtn.addEventListener('click', (event) => {
    const targetUrl = event.currentTarget.dataset.url;
    if (targetUrl) openExternal(targetUrl);
  });
  if (detailOpenBtn) detailOpenBtn.addEventListener('click', async (event) => {
    const path = event.currentTarget.dataset.path;
    if (!path) return;
    if (window.app?.workspace?.openJupyterWorkspace) {
      await window.app.workspace.openJupyterWorkspace({
        projectDir: path,
        sourceLabel: `${currentResource()?.title || '课程'} / 课程目录`,
        sourcePage: 'resources',
      });
    }
    if (window.app?.jupyter?.startJupyter) {
      await window.app.jupyter.startJupyter();
    }
  });

  if (detailMoreBtn && detailMoreMenu) {
    detailMoreBtn.addEventListener('click', (event) => { event.stopPropagation(); toggleDetailMoreMenu(); });
    detailMoreMenu.addEventListener('click', () => { detailMoreMenu.classList.remove('is-open'); });
    bindDetailMoreMenu();
  }

  if (detailClassroomStartBtn) {
    detailClassroomStartBtn.addEventListener('click', async () => {
      if (currentResource()) await startClassroomForResource(currentResource());
    });
  }
  if (detailClassroomStopBtn) {
    detailClassroomStopBtn.addEventListener('click', async () => {
      await stopClassroomWithPrompt();
    });
  }

  if (addBtn) {
    addBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      toggleCreateEntryMenu();
    });
    bindCreateEntryMenu();
  }
  if (addLocalBtn) {
    addLocalBtn.addEventListener('click', () => {
      if (!teacherUnlocked()) return;
      closeCreateEntryMenu();
      openCreateView();
      chooseCreateEntryMode('pack-import');
    });
  }
  if (addCloudBtn) {
    addCloudBtn.addEventListener('click', () => {
      if (!teacherUnlocked()) return;
      closeCreateEntryMenu();
      openCreateView();
      chooseCreateEntryMode('cloud-import');
    });
  }
  if (createBackBtn) createBackBtn.addEventListener('click', closeCreateView);
  if (createSaveBtn) createSaveBtn.addEventListener('click', () => deps.saveLocalCourse?.());
  if (sourceLocalBtn) sourceLocalBtn.addEventListener('click', () => setCreateSource('local'));
  if (sourceCloudBtn) sourceCloudBtn.addEventListener('click', () => setCreateSource('cloud'));
  if (pickPackageBtn) pickPackageBtn.addEventListener('click', pickLocalPackage);
  if (useDefaultSampleBtn) useDefaultSampleBtn.addEventListener('click', useDefaultSampleCourse);
  if (packageImportBtn) packageImportBtn.addEventListener('click', importLocalPackageToPath);
  if (pickLocalBtn) pickLocalBtn.addEventListener('click', pickLocalCourse);
  if (cloudRefreshBtn) cloudRefreshBtn.addEventListener('click', loadCloudCourseOptions);
  if (cloudImportBtn) cloudImportBtn.addEventListener('click', importCloudCourseAndSave);
  if (cloudDetailImportBtn) cloudDetailImportBtn.addEventListener('click', importCloudCourseAndSave);
  if (cloudCourseSelect) cloudCourseSelect.addEventListener('change', () => {
    renderCloudCoursePreview();
    updateCreateFormState();
  });
  if (cloudTempLoadBtn) cloudTempLoadBtn.addEventListener('click', loadCloudCoursesFromTempSource);
  if (cloudTempClearBtn) cloudTempClearBtn.addEventListener('click', clearCloudTempSourceAndReload);
  if (cloudRepoAddressInput) cloudRepoAddressInput.addEventListener('input', updateCloudSourceActionUI);
  if (cloudRepoTokenInput) cloudRepoTokenInput.addEventListener('input', updateCloudSourceActionUI);
  [createTitleInput, createDescInput, createGradeInput, createSubjectInput].forEach((input) => {
    if (input) input.addEventListener('input', updateCreateFormState);
  });
  if (createPackagePathInput) createPackagePathInput.addEventListener('input', () => {
    renderPackagePathSummary();
    updateCreateFormState();
  });
  if (createLocalPathInput) createLocalPathInput.addEventListener('input', () => {
    renderLocalPathSummary();
    updateCreateFormState();
  });
  if (createStepPrevBtn) createStepPrevBtn.addEventListener('click', () => {
    if (createSource() === 'cloud') {
      closeCreateView();
      return;
    }
    setCreateStep(createStep() - 1);
  });
  if (createStepNextBtn) createStepNextBtn.addEventListener('click', () => {
    if (createStep() < 3) {
      setCreateStep(createStep() + 1);
    } else {
      closeCreateView();
    }
  });

  updateCloudSourceActionUI();
}
