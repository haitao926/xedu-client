export function hasExecutablePython(getPythonRaw) {
  const code = getPythonRaw().trim();
  if (!code) {
    return false;
  }
  return !code.startsWith('# 在左侧拖入积木开始编程');
}

export function buildGenericPythonPreflightError(buildPreflightError) {
  return buildPreflightError('missing_code', '当前还没有可运行的代码。', '先拖入积木，生成代码后再运行。');
}

export async function loadToolboxes(getConfigValue, fetchText, validateToolboxWithApi, mergeToolboxes, normalizeCategoryMeta) {
  const official = normalizeCategoryMeta(getConfigValue('defaultXEduHubToolbox', {}));
  const toolboxUrl = String(getConfigValue('toolboxUrl', ''));
  if (!toolboxUrl) {
    return { official, course: official, hasCourseCustom: false, customPackCount: 0 };
  }
  try {
    const custom = JSON.parse(await fetchText(toolboxUrl));
    const check = await validateToolboxWithApi(custom);
    if (!check.valid) {
      throw new Error(`课程 toolbox 非法：${check.errors[0] || '未知错误'}`);
    }
    const packs = Array.isArray(custom?.packs) ? custom.packs : [];
    return {
      official,
      course: mergeToolboxes(getConfigValue('defaultXEduHubToolbox', {}), check.normalized || custom),
      hasCourseCustom: true,
      customPackCount: packs.length,
    };
  } catch (_) {
    return { official, course: official, hasCourseCustom: false, customPackCount: 0 };
  }
}

export function extractXEduHubSpec(state, deps = {}) {
  if (!state.workspace) {
    return null;
  }
  return deps.collectXEduHubSpecFromBlocks(state.workspace.getAllBlocks(false), {
    getParamFieldName: deps.getParamFieldName,
    getTaskById: deps.getTaskById,
    getTaskIdFromRunBlockType: deps.getTaskIdFromRunBlockType,
    isSemanticRunBlockType: deps.isSemanticRunBlockType,
    projectRoot: String(deps.getConfigValue('projectRoot', '')),
    resolveLegacyTaskId: deps.resolveLegacyTaskId,
  });
}

export function collectWorkspaceTasks(state, deps = {}) {
  if (!state.workspace) {
    return [];
  }
  return deps.collectXEduHubTasksFromBlocks(state.workspace.getAllBlocks(false), {
    getTaskById: deps.getTaskById,
    getTaskIdFromRunBlockType: deps.getTaskIdFromRunBlockType,
    isSemanticRunBlockType: deps.isSemanticRunBlockType,
    resolveLegacyTaskId: deps.resolveLegacyTaskId,
  });
}

export function hasRunnableFlow(state, deps = {}) {
  return Boolean(state.workspace) && deps.hasRunnableFlowInBlocks(state.workspace.getAllBlocks(false), {
    isSemanticRunBlockType: deps.isSemanticRunBlockType,
    runnableBlockTypes: deps.runnableBlockTypes,
  });
}

export function hasRuntimeBoundInputSpec(spec) {
  return Boolean(spec && spec.input === '__runtime_bound__');
}

export function isStreamLikeInputSpec(spec, deps = {}) {
  if (!spec) {
    return false;
  }
  const task = spec?.task_id ? deps.getTaskById(spec.task_id) : null;
  if (!task) {
    return false;
  }
  const inputMode = String(task.input_mode || '').trim();
  if (inputMode === 'text_or_list') {
    return false;
  }
  const rawInput = spec.input;
  if (typeof rawInput === 'number') {
    return Number.isInteger(rawInput) && rawInput >= 0;
  }
  const text = String(rawInput ?? '').trim();
  if (!text) {
    return false;
  }
  if (/^\d+$/.test(text)) {
    return true;
  }
  return /\.(mp4|mov|m4v|avi|mkv|webm)$/i.test(text) || /^(rtsp|rtsps|rtmp|http|https):\/\//i.test(text);
}

export function getWorkspaceVariableNameById(state, lookupWorkspaceVariableName, variableId) {
  return lookupWorkspaceVariableName(state.workspace, variableId);
}

export function getBlockVariableName(getRuntimeBlockVariableName, lookupFn, block, fieldName) {
  return getRuntimeBlockVariableName(block, fieldName, lookupFn);
}

export function validateWorkspaceBindings(state, deps = {}) {
  if (!state.workspace) {
    return null;
  }
  return deps.validateWorkspaceBindingsForBlocks(state.workspace.getAllBlocks(false), {
    buildPreflightError: deps.buildPreflightError,
    lookupVariableName: deps.lookupVariableName,
  });
}

export async function executeXEduHubFlow(state, deps = {}) {
  const runBtn = deps.documentRef.getElementById('runXEduHubBtn');
  if (runBtn) {
    runBtn.disabled = true;
    runBtn.textContent = '运行中...';
  }
  deps.setResultRunningView();
  try {
    if (!deps.hasExecutablePython()) {
      deps.updateResultView(deps.buildGenericPythonPreflightError());
      return;
    }

    const bindingError = deps.validateWorkspaceBindings();
    if (bindingError) {
      deps.updateResultView(bindingError);
      return;
    }

    if (deps.hasRunnableFlow()) {
      const spec = deps.extractXEduHubSpec();
      const workspaceTasks = deps.collectWorkspaceTasks();
      const experimentalTasks = workspaceTasks.filter((task) => task?.available === false);
      const specError = deps.validateRunnableSpec(spec);
      if (specError) {
        deps.updateResultView(specError);
        return;
      }
      if (experimentalTasks.length > 0) {
        const payload = deps.buildExperimentalTaskPreflight(experimentalTasks, { blocked: !deps.isTeacherMode() });
        if (!deps.isTeacherMode()) {
          deps.setResultWarningView(payload);
          return;
        }
        deps.setResultWarningView(payload);
      }
      if (deps.hasRuntimeBoundInputSpec(spec) || deps.isStreamLikeInputSpec(spec)) {
        const response = await fetch(String(deps.getConfigValue('pythonRunUrl', '/api/python/run')), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code: deps.getPythonRaw(),
            project_root: String(deps.getConfigValue('projectRoot', '')),
          }),
        });
        const payload = await deps.parseJsonResponse(response, '运行 Python 代码失败');
        deps.updateResultView(deps.normalizePythonRunPayload(payload));
        return;
      }
      const response = await fetch(String(deps.getConfigValue('xeduhubExecuteUrl', '/api/resources/blockly/xeduhub/execute')), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: deps.getPythonRaw(),
          spec,
          project_root: String(deps.getConfigValue('projectRoot', '')),
        }),
      });
      const payload = await deps.parseJsonResponse(response, '执行 XEduHub 运行时失败');
      deps.updateResultView(payload);
      return;
    }

    const response = await fetch(String(deps.getConfigValue('pythonRunUrl', '/api/python/run')), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: deps.getPythonRaw(),
        project_root: String(deps.getConfigValue('projectRoot', '')),
      }),
    });
    const payload = await deps.parseJsonResponse(response, '运行 Python 代码失败');
    deps.updateResultView(deps.normalizePythonRunPayload(payload));
  } catch (error) {
    deps.updateResultView({
      success: false,
      message: error?.message || '执行失败',
      result: { error: String(error || '') },
      artifacts: {},
    });
  } finally {
    if (runBtn) {
      runBtn.disabled = false;
      runBtn.textContent = '运行程序';
    }
  }
}
