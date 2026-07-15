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
}
