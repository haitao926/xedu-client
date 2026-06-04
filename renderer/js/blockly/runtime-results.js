export function renderResultTerminal(text, documentRef = document) {
  const terminal = documentRef.getElementById('resultTerminal');
  if (!terminal) {
    return;
  }
  const normalized = String(text || '').trim();
  terminal.textContent = normalized || '没有原始终端输出';
  terminal.dataset.empty = normalized ? 'false' : 'true';
}

export function getResultHint(payload) {
  const hints = Array.isArray(payload?.result_summary?.hints) ? payload.result_summary.hints : [];
  return String(hints[0] || '').trim();
}

export function deriveTaskContext(state, deps = {}) {
  const workspaceTitle = String(deps.getConfigValue('workspaceTitle', '')).trim() || deps.classroomDefaults.workspaceFallbackTitle;
  const practiceLabel = String(deps.getConfigValue('practiceLabel', '')).trim();
  const practiceKind = String(deps.getConfigValue('practiceKind', '')).trim();
  const taskGoal = String(deps.getConfigValue('taskGoal', '')).trim();
  const taskStage = String(deps.getConfigValue('taskStage', '')).trim();
  const taskHint = String(deps.getConfigValue('taskHint', '')).trim();
  const lastTone = String(state.resultRunState.lastTone || 'idle');
  const lastHint = deps.getResultHint(state.resultRunState.lastPayload);
  const blockCount = state.workspace?.getAllBlocks(false)?.length || 0;
  const spec = state.workspace ? deps.extractXEduHubSpec() : null;
  const task = spec?.task_id ? deps.getTaskById(spec.task_id) : null;
  const taskLabel = String(task?.label || spec?.task_label || '').trim();
  const hasExplicitTaskSignal = Boolean(taskGoal) || Boolean(taskLabel) || Boolean(practiceLabel);
  if (!hasExplicitTaskSignal) {
    return {
      visible: false,
      workspaceTitle,
      roleLabel: deps.isTeacherMode() ? '教师工作台' : '学生工作台',
      stage: '',
      summary: '',
      description: '',
      hint: '',
      practiceLabel,
    };
  }
  let summary = taskGoal;
  if (!summary) {
    if (taskLabel) {
      summary = deps.isTeacherMode()
        ? `围绕${taskLabel}实验做调试与预演`
        : `继续完成${taskLabel}实验`;
    } else if (practiceLabel) {
      summary = deps.isTeacherMode()
        ? `围绕${practiceLabel}继续备课与调试`
        : `继续完成${practiceLabel}`;
    } else if (hasExplicitTaskSignal && workspaceTitle && !workspaceTitle.includes('Blockly')) {
      summary = deps.isTeacherMode()
        ? `围绕${workspaceTitle}继续调试`
        : `继续完成${workspaceTitle}`;
    }
  }
  let stage = taskStage;
  if (!stage) {
    if (lastTone === 'success') {
      stage = '结果复盘';
    } else if (lastTone === 'error') {
      stage = '排查问题';
    } else if (deps.isTeacherMode()) {
      stage = deps.hasRunnableFlow() ? '教师预演' : '搭建与调试';
    } else if (blockCount === 0) {
      stage = '开始实验';
    } else if (deps.hasRunnableFlow()) {
      stage = '运行验证';
    } else {
      stage = '完善流程';
    }
  }
  const roleLabel = deps.isTeacherMode() ? '教师工作台' : '学生工作台';
  let description = '';
  if (taskLabel) {
    description = `当前工作区聚焦${taskLabel}。页面会优先把输入、任务、参数和结果组织成一条实验主流程。`;
  } else if (practiceLabel) {
    description = deps.isTeacherMode()
      ? `当前工作区与 ${practiceLabel} 关联，可直接预演并检查课堂结果反馈。`
      : `当前工作区与 ${practiceLabel} 关联，可一边搭积木一边核对实践任务。`;
  } else if (workspaceTitle && !workspaceTitle.includes('Blockly')) {
    description = `当前工作区聚焦 ${workspaceTitle}。`;
  }
  const hint = taskHint || lastHint || (deps.hasRunnableFlow()
    ? '当前流程已具备运行条件，可直接运行查看反馈。'
    : deps.isTeacherMode()
      ? '先拖入或调整任务积木，再运行预演。'
      : '先补全任务块和输入，再运行。');

  return {
    visible: true,
    workspaceTitle,
    roleLabel,
    stage,
    summary,
    description,
    hint,
    practiceLabel,
    practiceKind,
  };
}

export function updateTaskContext(state, deps = {}, documentRef = document) {
  const deriveTaskContextFn = typeof deps.deriveTaskContext === 'function'
    ? deps.deriveTaskContext
    : () => ({
        visible: false,
        workspaceTitle: '',
        roleLabel: '',
        stage: '',
        summary: '',
        description: '',
        hint: '',
        practiceLabel: '',
        practiceKind: '',
      });
  const context = deriveTaskContextFn(state, deps);
  const panel = documentRef.getElementById('taskContextCard');
  const roleEl = documentRef.getElementById('taskContextRole');
  const stageEl = documentRef.getElementById('taskContextStage');
  const summaryEl = documentRef.getElementById('taskContextSummary');
  const descriptionEl = documentRef.getElementById('taskContextDescription');
  const hintEl = documentRef.getElementById('taskContextHint');
  const practiceEl = documentRef.getElementById('taskContextPractice');
  if (!panel || !roleEl || !stageEl || !summaryEl || !descriptionEl || !hintEl || !practiceEl) {
    return context;
  }
  panel.style.display = context.visible ? '' : 'none';
  if (!context.visible) {
    return context;
  }
  roleEl.textContent = context.roleLabel || '';
  stageEl.textContent = context.stage || '';
  summaryEl.textContent = context.summary || '';
  descriptionEl.textContent = context.description || '';
  hintEl.textContent = context.hint || '';
  practiceEl.textContent = context.practiceLabel
    ? `${context.practiceKind === 'notebook' ? '关联实验' : '关联代码'}：${context.practiceLabel}`
    : '';
  return context;
}

export function buildPreflightError(code, message, hint) {
  return {
    success: false,
    result_type: 'error',
    error_code: code,
    message,
    result: {},
    artifacts: {},
    result_summary: {
      headline: message,
      metrics: [],
      hints: hint ? [hint] : [],
    },
    result_artifacts: { preview_image: '', key_fields: {} },
    result_error: { code },
  };
}

export function renderMigrationReport(state, report, deps = {}) {
  if (!report || (!report.changed?.length && !report.failed?.length)) {
    return;
  }
  state.migrationReport = report;
  deps.setResultMode('success');
  deps.setResultBadge('完成', 'is-success');
  state.resultRunState = {
    hasRun: true,
    lastPayload: {
      success: true,
      message: '已自动迁移旧版工作区',
      result_summary: {
        headline: '已自动迁移旧版工作区',
        metrics: [
          { label: '成功迁移', value: report.changed?.length || 0 },
          { label: '失败项', value: report.failed?.length || 0 },
        ],
        hints: ['请继续检查工作区是否符合当前实验目标。'],
      },
      result_artifacts: { preview_image: '', key_fields: {} },
      result: report,
    },
    lastTone: 'success',
  };
  deps.renderResultTerminal([
    '# 已自动迁移旧版工作区',
    `success: ${report.changed?.length || 0}`,
    `failed: ${report.failed?.length || 0}`,
  ].join('\n'));
  deps.resetDebugDetails({ payload: report, open: false });
  deps.updateTaskContext();
  deps.blocklyDebugLog('工作区迁移报告', report);
}

export function buildExperimentalTaskPreflight(tasks, { blocked = false } = {}) {
  const names = tasks.map((task) => String(task?.label || task?.task_id || '').trim()).filter(Boolean);
  const joined = names.join('、');
  const firstAction = String(tasks[0]?.recommended_action || '').trim();
  return {
    success: false,
    blocked,
    result_type: 'error',
    error_code: blocked ? 'runtime_task_hidden_for_student' : 'runtime_task_experimental',
    message: blocked
      ? `当前流程包含本地暂不支持的实验性任务：${joined}`
      : `当前流程包含实验性任务：${joined}`,
    result: {},
    artifacts: {},
    result_summary: {
      headline: blocked ? '学生模式下已阻止执行实验性任务' : '检测到实验性任务',
      metrics: names.length > 0 ? [{ label: '任务数量', value: names.length }] : [],
      hints: [
        blocked
          ? '请改用默认可运行的任务块，或让老师在教师模式下检查该流程。'
          : (firstAction || '这些任务当前本地环境不支持，请安装对应模型/版本后再试。'),
      ],
    },
    result_artifacts: { preview_image: '', key_fields: names.length > 0 ? { 实验性任务: joined } : {} },
    result_error: { code: blocked ? 'runtime_task_hidden_for_student' : 'runtime_task_experimental' },
  };
}

export function maybeWarnExperimentalWorkspace(state, reason = '已加载包含实验性任务的工作区', deps = {}) {
  const tasks = deps.collectWorkspaceTasks().filter((task) => task?.available === false);
  if (tasks.length === 0) {
    return;
  }
  const payload = deps.buildExperimentalTaskPreflight(tasks, { blocked: false });
  payload.success = true;
  payload.message = reason;
  payload.result_summary.headline = reason;
  payload.result_summary.hints = ['这些任务会兼容保留，但默认不会出现在新的快捷任务分类里。'];
  deps.setResultWarningView(payload);
}

export function syncWorkspaceTaskContext(state, deps = {}) {
  deps.updateTaskContext();
  if (state.workspace && typeof state.workspace.getAllBlocks === 'function') {
    const hasTask = Boolean(deps.extractXEduHubSpec()?.task_id);
    const hasBlocks = state.workspace.getAllBlocks(false).length > 0;
    const shouldHintRun = hasTask || hasBlocks;
    if (shouldHintRun && state.resultRunState.lastTone === 'idle' && !state.resultRunState.hasRun) {
      deps.renderResultTerminal(deps.classroomDefaults.resultIdleText);
    }
  }
}

export function validateRunnableSpec(spec, deps = {}) {
  if (!deps.hasRunnableFlow()) {
    return buildPreflightError('missing_flow', '当前工作区里还没有 XEduHub 积木流程，请先拖入相关积木。', '先拖入一个 XEduHub 任务运行积木。');
  }
  if (!spec || !spec.task_id) {
    return buildPreflightError('missing_task', '当前流程缺少任务类型，请先放入运行积木。', '请先放入一个带任务语义的 XEduHub 运行积木。');
  }
  if (spec.input === undefined || spec.input === null || spec.input === '') {
    return buildPreflightError('missing_input', '当前流程缺少输入路径。', '先使用“选择输入图片”积木，或直接在任务块的输入槽接入文本路径。');
  }
  return null;
}

export function collectPresentationActionsFromWorkspace(state, collectXEduHubPresentationActionsFromBlocks) {
  if (!state.workspace) {
    return [];
  }
  return collectXEduHubPresentationActionsFromBlocks(state.workspace);
}

export function decoratePayloadWithResultActions(state, payload, collectXEduHubPresentationActionsFromBlocks) {
  const nextPayload = payload && typeof payload === 'object' ? payload : {};
  const actions = collectPresentationActionsFromWorkspace(state, collectXEduHubPresentationActionsFromBlocks);
  nextPayload.__xeduPresentationActions = actions;
  nextPayload.__xeduPresentationCleared = actions.some((action) => action?.type === 'clear_result');
  return nextPayload;
}

export function getRequestedResultImage(actions, payload, getPayloadPreviewImage, isDisplayableImageSource) {
  const imageAction = (actions || []).find((action) => action?.type === 'result_image');
  const explicitImage = String(imageAction?.image?.value || '').trim();
  return {
    src: [getPayloadPreviewImage(payload), explicitImage].find(isDisplayableImageSource) || '',
    title: String(imageAction?.title || '结果图片').trim() || '结果图片',
  };
}

export function updateResultView(state, payload, deps = {}) {
  const nextPayload = decoratePayloadWithResultActions(state, payload || {}, deps.collectXEduHubPresentationActionsFromBlocks);
  const success = Boolean(nextPayload && nextPayload.success);
  const clearedOnly = Boolean(nextPayload?.__xeduPresentationCleared);
  state.resultRunState.hasRun = true;
  state.resultRunState.lastPayload = nextPayload;
  state.resultRunState.lastTone = clearedOnly ? 'idle' : success ? 'success' : 'error';
  if (clearedOnly) {
    deps.setResultMode('idle');
    deps.setResultBadge('已清空');
    deps.closeResultImageDialog();
    deps.renderResultTerminal('已清空运行反馈');
  } else {
    deps.setResultMode(success ? 'success' : 'error');
    deps.setResultBadge(success ? '完成' : '异常', success ? 'is-success' : 'is-error');
    deps.renderResultTerminal(deps.buildTerminalOutput(nextPayload));
    const imageResult = getRequestedResultImage(
      nextPayload.__xeduPresentationActions,
      nextPayload,
      deps.getPayloadPreviewImage,
      deps.isDisplayableImageSource,
    );
    deps.openResultImageDialog(imageResult.src, imageResult.title);
  }
  deps.resetDebugDetails({
    payload: nextPayload?.result ?? nextPayload ?? {},
    open: !success && Boolean(nextPayload?.result && Object.keys(nextPayload.result).length > 0),
  });
  deps.updateTaskContext();
}

export function normalizePythonRunPayload(payload) {
  const stdout = String(payload?.output || '').replace(/\r\n/g, '\n').trim();
  const stderr = String(payload?.error_output || '').replace(/\r\n/g, '\n').trim();
  const streamSummary = payload?.result_summary && typeof payload.result_summary === 'object'
    ? payload.result_summary
    : null;
  const streamResult = payload?.result && typeof payload.result === 'object'
    ? payload.result
    : {};
  const isStreamRun = Boolean(streamResult?.is_stream_run);
  const streamStatus = String(streamResult?.stream_status || '').trim();
  const streamKind = String(streamResult?.stream_kind || '').trim();
  const normalized = {
    success: Boolean(payload?.success),
    message: String(payload?.message || ''),
    result: {
      stdout,
      stderr,
      return_code: payload?.return_code,
    },
    error: payload?.success ? '' : stderr,
  };
  if (isStreamRun) {
    normalized.result.is_stream_run = true;
    normalized.result.stream_status = streamStatus;
    normalized.result.stream_kind = streamKind;
    normalized.result.stream_source = String(streamResult?.stream_source || '').trim();
    normalized.result.runtime_events = Array.isArray(streamResult?.runtime_events) ? streamResult.runtime_events : [];
    normalized.result_summary = {
      headline: String(streamSummary?.headline || payload?.message || '视频流执行完成').trim(),
      metrics: Array.isArray(streamSummary?.metrics) ? streamSummary.metrics : [],
      hints: Array.isArray(streamSummary?.hints) ? streamSummary.hints : [],
    };
    normalized.message = normalized.result_summary.headline || normalized.message;
    if (!normalized.success && !normalized.error) {
      normalized.error = normalized.message;
    }
  }
  return normalized;
}
