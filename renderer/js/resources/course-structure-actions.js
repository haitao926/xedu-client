export async function editExperimentFlow(resource, mutableSections, sectionIndex, expIndex, deps = {}) {
  if (!(await deps.ensureTeacherModeForEdit('编辑实验'))) return;
  if (!deps.canEditResource(resource)) {
    deps.alertUser('仅支持编辑本地课程实验');
    return;
  }
  const section = mutableSections?.[sectionIndex];
  const experiments = deps.getMutableExperiments(section);
  if (!experiments || !experiments.list[expIndex]) {
    deps.alertUser('未找到实验');
    return;
  }
  const exp = experiments.list[expIndex];
  const result = await deps.openResourcesForm({
    title: '编辑实验',
    message: '更新实验标题与描述',
    confirmText: '保存',
    cancelText: '取消',
    fields: [
      {
        name: 'title',
        label: '实验标题',
        value: exp.title || '',
        placeholder: '请输入实验标题',
        required: true,
      },
      {
        name: 'description',
        label: '实验描述',
        type: 'textarea',
        value: exp.description || '',
        placeholder: '请输入实验描述（可选）',
        required: false,
        rows: 3,
      },
    ],
  });
  if (!result?.confirmed) return;
  exp.title = (result.values.title || '').trim() || exp.title || '未命名实验';
  exp.description = (result.values.description || '').trim();
  resource.updated_at = new Date().toISOString().slice(0, 10);
  await deps.persistCourseToDisk(resource, deps.apiClient);
  deps.persistLocalCoursesState();
  deps.renderResourceDetail(resource);
}

export async function deleteExperimentFlow(resource, mutableSections, sectionIndex, expIndex, deps = {}) {
  if (!(await deps.ensureTeacherModeForEdit('删除实验'))) return;
  if (!deps.canEditResource(resource)) {
    deps.alertUser('仅支持编辑本地课程实验');
    return;
  }
  const section = mutableSections?.[sectionIndex];
  const experiments = deps.getMutableExperiments(section);
  if (!experiments || !experiments.list[expIndex]) {
    deps.alertUser('未找到实验');
    return;
  }
  const exp = experiments.list[expIndex];
  const ok = await deps.openResourcesConfirm({
    title: '删除实验',
    message: `确认删除实验「${exp.title || '未命名实验'}」？`,
    confirmText: '删除',
    cancelText: '取消',
  });
  if (!ok) return;
  experiments.list.splice(expIndex, 1);
  resource.updated_at = new Date().toISOString().slice(0, 10);
  await deps.persistCourseToDisk(resource, deps.apiClient);
  deps.persistLocalCoursesState();
  deps.renderResourceDetail(resource);
}

export async function addSectionFlow(resource, mutableSections, deps = {}) {
  if (!(await deps.ensureTeacherModeForEdit('添加课节'))) return;
  if (!deps.canEditResource(resource)) {
    deps.alertUser('仅支持编辑本地课程');
    return;
  }
  const sections = Array.isArray(mutableSections) ? mutableSections : deps.getMutableSections(resource);
  if (!Array.isArray(sections)) {
    deps.alertUser('课程结构异常，无法添加课节');
    return;
  }
  const next = sections.length + 1;
  sections.push({
    title: `第 ${next} 课`,
    description: '',
    experiments: [
      {
        title: '实验 1',
        description: '',
        files: [],
      },
    ],
  });
  resource.updated_at = new Date().toISOString().slice(0, 10);
  await deps.persistCourseToDisk(resource, deps.apiClient);
  deps.persistLocalCoursesState();
  deps.setActiveSectionIndex(sections.length - 1);
  deps.renderResourceDetail(resource);
}

export async function renameSectionFlow(resource, mutableSections, sectionIndex, deps = {}) {
  if (!(await deps.ensureTeacherModeForEdit('重命名课节'))) return;
  if (!deps.canEditResource(resource)) {
    deps.alertUser('仅支持编辑本地课程');
    return;
  }
  const section = mutableSections?.[sectionIndex];
  if (!section) {
    deps.alertUser('未找到课节');
    return;
  }
  const title = await deps.openResourcesInput({
    title: '重命名课节',
    message: '',
    label: '课节名称',
    placeholder: '请输入课节名称',
    defaultValue: section.title || `第 ${sectionIndex + 1} 课`,
    required: true,
    confirmText: '保存',
    cancelText: '取消',
  });
  if (title === null) return;
  section.title = title.trim() || section.title || `第 ${sectionIndex + 1} 课`;
  resource.updated_at = new Date().toISOString().slice(0, 10);
  await deps.persistCourseToDisk(resource, deps.apiClient);
  deps.persistLocalCoursesState();
  deps.renderResourceDetail(resource);
}

export async function deleteSectionFlow(resource, mutableSections, sectionIndex, deps = {}) {
  if (!(await deps.ensureTeacherModeForEdit('删除课节'))) return;
  if (!deps.canEditResource(resource)) {
    deps.alertUser('仅支持编辑本地课程');
    return;
  }
  if (!Array.isArray(mutableSections) || !mutableSections[sectionIndex]) {
    deps.alertUser('未找到课节');
    return;
  }
  const section = mutableSections[sectionIndex];
  const ok = await deps.openResourcesConfirm({
    title: '删除课节',
    message: `确认删除课节「${section.title || `第 ${sectionIndex + 1} 课`}」？`,
    confirmText: '删除',
    cancelText: '取消',
  });
  if (!ok) return;
  mutableSections.splice(sectionIndex, 1);
  if (deps.activeSectionIndex() >= mutableSections.length) {
    deps.setActiveSectionIndex(Math.max(0, mutableSections.length - 1));
  }
  resource.updated_at = new Date().toISOString().slice(0, 10);
  await deps.persistCourseToDisk(resource, deps.apiClient);
  deps.persistLocalCoursesState();
  deps.renderResourceDetail(resource);
}

export async function manageSectionFlow(resource, mutableSections, sectionIndex, deps = {}) {
  const ok = await deps.ensureTeacherModeForEdit('管理课节');
  if (!ok) return;
  deps.openCreateEditorForManage(resource, 2, '已进入编辑页，可重命名或删除课节。');
}

export async function addExperimentToSectionFlow(resource, mutableSections, sectionIndex, deps = {}) {
  if (!(await deps.ensureTeacherModeForEdit('添加实验'))) return;
  if (!deps.canEditResource(resource)) {
    deps.alertUser('仅支持编辑本地课程');
    return;
  }
  const section = mutableSections?.[sectionIndex];
  if (!section) {
    deps.alertUser('未找到课节');
    return;
  }
  if (!Array.isArray(section.experiments)) {
    section.experiments = [];
  }
  const next = section.experiments.length + 1;
  section.experiments.push({
    title: `实验 ${next}`,
    description: '',
    files: [],
  });
  resource.updated_at = new Date().toISOString().slice(0, 10);
  await deps.persistCourseToDisk(resource, deps.apiClient);
  deps.persistLocalCoursesState();
  deps.setActiveSectionIndex(sectionIndex);
  deps.renderResourceDetail(resource);
}

export async function manageExperimentFlow(resource, mutableSections, sectionIndex, expIndex, deps = {}) {
  const ok = await deps.ensureTeacherModeForEdit('管理实验');
  if (!ok) return;
  deps.openCreateEditorForManage(resource, 2, '已进入编辑页，可编辑或删除实验。');
}
