export function bindUIRuntime(deps = {}) {
  const {
    documentRef = document,
    navigatorRef = navigator,
    setMoreMenuOpen,
    setControlPanelOpen,
    getWorkspaceExportPayload,
    downloadTextFile,
    openWorkspaceFile,
    updateResultView,
    getPythonRaw,
    importToolboxPack,
    canImportToolboxPacks,
    setCodePanelVisible,
    state,
    queueBlocklyResize,
    executeXEduHub,
    getConfigValue,
    BlocklyErrorToPayload = (error) => ({
      success: false,
      message: `打开文件失败：${error?.message || '未知错误'}`,
      result: { error: String(error || '') },
      artifacts: {},
    }),
  } = deps;

  documentRef.getElementById('openWorkspaceBtn')?.addEventListener('click', () => {
    setMoreMenuOpen(false);
    documentRef.getElementById('openWorkspaceInput')?.click();
  });
  documentRef.getElementById('saveWorkspaceBtn')?.addEventListener('click', () => {
    setMoreMenuOpen(false);
    const payload = getWorkspaceExportPayload();
    if (!payload) {
      return;
    }
    downloadTextFile(payload.content, payload.filename);
  });
  documentRef.getElementById('openWorkspaceInput')?.addEventListener('change', async (event) => {
    const file = event?.target?.files?.[0];
    if (!file) {
      return;
    }
    try {
      await openWorkspaceFile(file);
    } catch (error) {
      updateResultView(BlocklyErrorToPayload(error));
    } finally {
      event.target.value = '';
    }
  });
  documentRef.getElementById('copyPythonBtn')?.addEventListener('click', async () => {
    setMoreMenuOpen(false);
    await navigatorRef.clipboard.writeText(getPythonRaw());
  });
  documentRef.getElementById('codeDockToggleBtn')?.addEventListener('click', () => setCodePanelVisible(!state.codePanelVisible));
  documentRef.getElementById('controlPanelToggleBtn')?.addEventListener('click', (event) => {
    event.stopPropagation();
    setMoreMenuOpen(false);
    setControlPanelOpen(!state.controlPanelState.open);
  });
  documentRef.getElementById('controlPanel')?.addEventListener('click', (event) => event.stopPropagation());
  documentRef.getElementById('toolbarMoreBtn')?.addEventListener('click', (event) => {
    event.stopPropagation();
    setControlPanelOpen(false);
    setMoreMenuOpen(!state.toolbarOverflowState.menuOpen);
  });
  documentRef.addEventListener('click', () => {
    setMoreMenuOpen(false);
    setControlPanelOpen(false);
  });
  documentRef.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      setMoreMenuOpen(false);
      setControlPanelOpen(false);
    }
  });
  window.addEventListener('resize', () => queueBlocklyResize());
  documentRef.getElementById('toolbarMoreMenu')?.addEventListener('click', (event) => event.stopPropagation());
  documentRef.getElementById('blocklyExtendFab')?.addEventListener('click', () => {
    if (!canImportToolboxPacks()) {
      return;
    }
    documentRef.getElementById('addPackInput')?.click();
  });
  documentRef.getElementById('addPackBtn')?.addEventListener('click', () => {
    if (!canImportToolboxPacks()) {
      return;
    }
    documentRef.getElementById('addPackInput')?.click();
  });
  documentRef.getElementById('addPackInput')?.addEventListener('change', async (event) => {
    if (!canImportToolboxPacks()) {
      return;
    }
    const file = event?.target?.files?.[0];
    if (!file) {
      return;
    }
    try {
      await importToolboxPack(file);
    } catch (error) {
      updateResultView({
        success: false,
        message: `导入积木包失败：${error?.message || '未知错误'}`,
        result: { error: String(error || '') },
        artifacts: {},
      });
    } finally {
      event.target.value = '';
    }
  });
  documentRef.getElementById('runXEduHubBtn')?.addEventListener('click', executeXEduHub);
  documentRef.getElementById('downloadPythonBtn')?.addEventListener('click', () => {
    const blob = new Blob([getPythonRaw()], { type: 'text/plain;charset=utf-8' });
    const anchor = documentRef.createElement('a');
    anchor.href = URL.createObjectURL(blob);
    anchor.download = `${getConfigValue('workspaceTitle', 'workspace') || 'workspace'}.py`;
    anchor.click();
    URL.revokeObjectURL(anchor.href);
  });
  documentRef.getElementById('resetWorkspaceBtn')?.addEventListener('click', () => {
    if (!state.workspace || !state.initialSerialized) {
      return;
    }
    deps.loadWorkspaceSnapshot(state.initialSerialized);
  });
}
