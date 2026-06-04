export function isCreateInfoCompleteFlow(getCreateRequiredFields, documentRef = document) {
  return getCreateRequiredFields().every((fieldId) => {
    const value = documentRef.getElementById(fieldId)?.value || '';
    return value.trim().length > 0;
  });
}

export function updateCreateFormStateFlow(deps = {}) {
  const {
    documentRef = document,
    editingCourseId,
    localCourses,
    createEntryMode,
    createSource,
    cloudImported,
    scannedCourse,
    draftSections,
    isCreateInfoComplete,
    maybeAutoFillCourseId,
    renderCoursePreview,
    updateCreateCoverPreview,
    updateLocalPathVisibility,
    updateStepperUI,
  } = deps;

  const pickLocalBtn = documentRef.getElementById('resources-pick-local-btn');
  const saveBtn = documentRef.getElementById('resources-create-save-btn');
  const scanBtn = documentRef.getElementById('resources-scan-btn');
  const rescanBtn = documentRef.getElementById('resources-rescan-btn');
  const structureSaveBtn = documentRef.getElementById('resources-structure-save-btn');
  const importCloudBtn = documentRef.getElementById('resources-cloud-import-btn');
  const importCloudDetailBtn = documentRef.getElementById('resources-cloud-detail-import-btn');
  const importPackageBtn = documentRef.getElementById('resources-package-import-btn');
  const cloudSelect = documentRef.getElementById('resources-cloud-course-select');
  const packagePathInput = documentRef.getElementById('resources-create-package-path');
  const localPathInput = documentRef.getElementById('resources-create-local-path');
  const packagePath = packagePathInput?.value.trim() || '';
  const localPath = localPathInput?.value.trim() || '';
  const editCourseFallbackPath =
    editingCourseId && localCourses.length
      ? (localCourses.find((item) => item.id === editingCourseId)?.local_path || '').trim()
      : '';
  const effectiveLocalPath = localPath || editCourseFallbackPath;
  const infoComplete = isCreateInfoComplete();

  maybeAutoFillCourseId();

  if (pickLocalBtn) {
    pickLocalBtn.disabled = createSource === 'local' ? !((createEntryMode === 'pack-import') || infoComplete) : true;
  }

  if (saveBtn) {
    if (createSource === 'cloud') {
      saveBtn.disabled = !(cloudImported && effectiveLocalPath && scannedCourse);
    } else if (createEntryMode === 'pack-import') {
      saveBtn.disabled = !(effectiveLocalPath && scannedCourse);
    } else {
      saveBtn.disabled = !(infoComplete && effectiveLocalPath);
    }
  }

  if (scanBtn) {
    scanBtn.disabled = createSource === 'local' ? !(infoComplete && effectiveLocalPath) : true;
  }
  if (rescanBtn) {
    rescanBtn.disabled = createSource === 'local' ? !(infoComplete && effectiveLocalPath) : true;
  }
  if (structureSaveBtn) {
    structureSaveBtn.disabled =
      createSource === 'local' ? !(infoComplete && effectiveLocalPath && draftSections.length) : true;
  }
  if (importCloudBtn) {
    const selected = cloudSelect?.value || '';
    importCloudBtn.disabled = createSource !== 'cloud' || !selected;
  }
  if (importCloudDetailBtn) {
    const selected = cloudSelect?.value || '';
    importCloudDetailBtn.disabled = createSource !== 'cloud' || !selected;
  }
  if (importPackageBtn) {
    importPackageBtn.disabled = createEntryMode !== 'pack-import' || !packagePath;
  }

  renderCoursePreview();
  updateCreateCoverPreview();
  updateLocalPathVisibility();
  updateStepperUI();
}
