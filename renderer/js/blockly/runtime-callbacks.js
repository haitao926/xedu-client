export function registerBuiltinToolboxCallbacks(workspace, deps = {}) {
  if (!workspace || typeof workspace.registerToolboxCategoryCallback !== 'function') {
    deps.blocklyDebugWarn('workspace 不支持 registerToolboxCategoryCallback，已跳过动态分类注册');
    return;
  }
  deps.blocklyDebugLog('开始注册 builtin toolbox 回调');
  if (typeof workspace.registerButtonCallback === 'function' && !workspace.__xeduButtonCallbackInstrumented__) {
    const rawRegisterButtonCallback = workspace.registerButtonCallback.bind(workspace);
    workspace.registerButtonCallback = (key, callback) => rawRegisterButtonCallback(
      key,
      (button) => {
        deps.state.lastFlyoutButtonInvoke = { key: String(key || ''), at: Date.now() };
        return callback(button);
      },
    );
    workspace.__xeduButtonCallbackInstrumented__ = true;
    deps.blocklyDebugLog('已启用 flyout 按钮回调埋点');
  }
  const resolveTargetWorkspace = (source) => {
    let target = source;
    if (target && typeof target.getTargetWorkspace === 'function') {
      target = target.getTargetWorkspace();
    }
    if (target && typeof target.getRootWorkspace === 'function') {
      target = target.getRootWorkspace();
    }
    return target || workspace;
  };
  const resolveUniqueVariableName = (targetWorkspace, preferredName, variableType = '') => {
    const preferred = String(preferredName || '').trim();
    if (!preferred) {
      if (typeof deps.Blockly?.Variables?.generateUniqueName === 'function') {
        return deps.Blockly.Variables.generateUniqueName(targetWorkspace);
      }
      return '变量';
    }
    const hasNameUsedWithAnyType = typeof deps.Blockly?.Variables?.nameUsedWithAnyType === 'function';
    const existing = hasNameUsedWithAnyType
      ? deps.Blockly.Variables.nameUsedWithAnyType(preferred, targetWorkspace)
      : targetWorkspace?.getVariable?.(preferred, variableType || '');
    if (!existing) {
      return preferred;
    }
    if (typeof deps.Blockly?.Variables?.generateUniqueName === 'function') {
      return deps.Blockly.Variables.generateUniqueName(targetWorkspace);
    }
    return `${preferred}_1`;
  };
  const ensureVariableByPrompt = async (source, variableType = '') => {
    const targetWorkspace = resolveTargetWorkspace(source);
    deps.blocklyDebugLog('触发变量创建回调', {
      variableType,
      hasSource: Boolean(source),
      hasTargetWorkspace: Boolean(targetWorkspace),
      sourceCtor: source?.constructor?.name || '',
      targetCtor: targetWorkspace?.constructor?.name || '',
    });
    const variableMap = typeof targetWorkspace?.getVariableMap === 'function'
      ? targetWorkspace.getVariableMap()
      : null;
    if (!targetWorkspace || !variableMap || typeof variableMap.createVariable !== 'function') {
      deps.blocklyDebugWarn('目标 workspace 不可创建变量，已忽略', {
        variableType,
        hasCreateVariable: Boolean(variableMap && typeof variableMap.createVariable === 'function'),
      });
      return;
    }
    const beforeCount = targetWorkspace.getVariableMap?.().getAllVariables?.().length || 0;
    deps.blocklyDebugLog('变量创建前统计', { variableType, beforeCount });
    const defaultName = typeof deps.Blockly?.Variables?.generateUniqueName === 'function'
      ? deps.Blockly.Variables.generateUniqueName(targetWorkspace)
      : '变量';
    const title = String(deps.Blockly?.Msg?.NEW_VARIABLE_TITLE || '请输入变量名');
    const subtitle = variableType
      ? `正在创建 ${variableType} 类型变量`
      : '请输入变量名';
    const rawName = await deps.requestVariableName({
      title,
      subtitle,
      defaultValue: defaultName,
    });
    const normalizedName = String(rawName || '')
      .replace(/[\s\xa0]+/g, ' ')
      .trim();
    let finalName = normalizedName;
    if (!finalName) {
      deps.blocklyDebugWarn('变量名为空，用户可能取消了创建', { variableType });
      return;
    }
    if (finalName === String(deps.Blockly?.Msg?.NEW_VARIABLE || '').trim() || finalName === String(deps.Blockly?.Msg?.RENAME_VARIABLE || '').trim()) {
      finalName = defaultName;
    }
    finalName = resolveUniqueVariableName(targetWorkspace, finalName, variableType || '');
    deps.blocklyDebugLog('prompt 返回结果', { variableType, rawName, normalizedName, finalName });
    if (!finalName) {
      deps.blocklyDebugWarn('变量名为空，用户可能取消了创建', { variableType });
      return;
    }
    variableMap.createVariable(finalName, variableType || '');
    const afterCount = targetWorkspace.getVariableMap?.().getAllVariables?.().length || 0;
    deps.blocklyDebugLog('已手动创建变量', { variableType, finalName, beforeCount, afterCount });
  };
  deps.state.createVariableFallback = (variableType = '') => ensureVariableByPrompt(workspace, variableType || '');
  const registerVariableButtonCallbacks = (targetWorkspace) => {
    if (!targetWorkspace || typeof targetWorkspace.registerButtonCallback !== 'function') {
      return;
    }
    targetWorkspace.registerButtonCallback('CREATE_VARIABLE', (button) => {
      deps.blocklyDebugLog('点击 flyout 按钮：CREATE_VARIABLE');
      ensureVariableByPrompt(button, '');
    });
    targetWorkspace.registerButtonCallback('CREATE_VARIABLE_STRING', (button) => {
      deps.blocklyDebugLog('点击 flyout 按钮：CREATE_VARIABLE_STRING');
      ensureVariableByPrompt(button, 'String');
    });
    targetWorkspace.registerButtonCallback('CREATE_VARIABLE_NUMBER', (button) => {
      deps.blocklyDebugLog('点击 flyout 按钮：CREATE_VARIABLE_NUMBER');
      ensureVariableByPrompt(button, 'Number');
    });
    targetWorkspace.registerButtonCallback('CREATE_VARIABLE_COLOUR', (button) => {
      deps.blocklyDebugLog('点击 flyout 按钮：CREATE_VARIABLE_COLOUR');
      ensureVariableByPrompt(button, 'Colour');
    });
  };

  if (typeof workspace.registerButtonCallback === 'function') {
    registerVariableButtonCallbacks(workspace);
    deps.blocklyDebugLog('已注册 flyout 按钮回调', [
      'CREATE_VARIABLE',
      'CREATE_VARIABLE_STRING',
      'CREATE_VARIABLE_NUMBER',
      'CREATE_VARIABLE_COLOUR',
    ]);
  } else {
    deps.blocklyDebugWarn('workspace 不支持 registerButtonCallback，按钮回调未注册');
  }

  const variableCallback = (targetWorkspace) => {
    deps.blocklyDebugLog('触发变量分类回调', { callback: 'VARIABLE', workspaceCtor: targetWorkspace?.constructor?.name || '' });
    const resolvedWorkspace = resolveTargetWorkspace(targetWorkspace);
    if (typeof deps.Blockly?.Variables?.internalFlyoutCategory === 'function') {
      const result = deps.Blockly.Variables.internalFlyoutCategory(targetWorkspace);
      registerVariableButtonCallbacks(resolvedWorkspace);
      deps.blocklyDebugLog('变量分类回调返回项数量', { callback: 'VARIABLE', count: Array.isArray(result) ? result.length : -1 });
      return result;
    }
    if (typeof deps.Blockly?.Variables?.flyoutCategory === 'function') {
      const result = deps.Blockly.Variables.flyoutCategory(targetWorkspace, false);
      registerVariableButtonCallbacks(resolvedWorkspace);
      deps.blocklyDebugLog('变量分类回调返回项数量', { callback: 'VARIABLE', count: Array.isArray(result) ? result.length : -1 });
      return result;
    }
    deps.blocklyDebugWarn('变量分类回调未找到可用实现');
    return [];
  };
  const variableDynamicCallback = (targetWorkspace) => {
    deps.blocklyDebugLog('触发动态变量分类回调', { callback: 'VARIABLE_DYNAMIC', workspaceCtor: targetWorkspace?.constructor?.name || '' });
    const resolvedWorkspace = resolveTargetWorkspace(targetWorkspace);
    if (typeof deps.Blockly?.VariablesDynamic?.internalFlyoutCategory === 'function') {
      const result = deps.Blockly.VariablesDynamic.internalFlyoutCategory(targetWorkspace);
      registerVariableButtonCallbacks(resolvedWorkspace);
      deps.blocklyDebugLog('动态变量分类回调返回项数量', { callback: 'VARIABLE_DYNAMIC', count: Array.isArray(result) ? result.length : -1 });
      return result;
    }
    if (typeof deps.Blockly?.VariablesDynamic?.flyoutCategory === 'function') {
      const result = deps.Blockly.VariablesDynamic.flyoutCategory(targetWorkspace, false);
      registerVariableButtonCallbacks(resolvedWorkspace);
      deps.blocklyDebugLog('动态变量分类回调返回项数量', { callback: 'VARIABLE_DYNAMIC', count: Array.isArray(result) ? result.length : -1 });
      return result;
    }
    deps.blocklyDebugWarn('动态变量分类回调未找到可用实现，回退到 VARIABLE');
    return variableCallback(targetWorkspace);
  };
  const procedureCallback = (targetWorkspace) => {
    deps.blocklyDebugLog('触发函数分类回调', { callback: 'PROCEDURE', workspaceCtor: targetWorkspace?.constructor?.name || '' });
    if (typeof deps.Blockly?.Procedures?.internalFlyoutCategory === 'function') {
      const result = deps.Blockly.Procedures.internalFlyoutCategory(targetWorkspace);
      deps.blocklyDebugLog('函数分类回调返回项数量', { callback: 'PROCEDURE', count: Array.isArray(result) ? result.length : -1 });
      return result;
    }
    if (typeof deps.Blockly?.Procedures?.flyoutCategory === 'function') {
      const result = deps.Blockly.Procedures.flyoutCategory(targetWorkspace, false);
      deps.blocklyDebugLog('函数分类回调返回项数量', { callback: 'PROCEDURE', count: Array.isArray(result) ? result.length : -1 });
      return result;
    }
    deps.blocklyDebugWarn('函数分类回调未找到可用实现');
    return [];
  };

  const normalizeKeyList = (keys) => {
    const unique = new Set();
    keys.forEach((value) => {
      const key = String(value || '').trim();
      if (key) {
        unique.add(key);
      }
    });
    return Array.from(unique);
  };

  const variableKeys = normalizeKeyList([
    deps.Blockly.VARIABLE_CATEGORY_NAME,
    'VARIABLE',
    'variable',
  ]);
  deps.blocklyDebugLog('变量分类回调注册 key', variableKeys);
  variableKeys.forEach((key) => workspace.registerToolboxCategoryCallback(String(key), variableCallback));

  const dynamicVariableKeys = normalizeKeyList([
    deps.Blockly.VARIABLE_DYNAMIC_CATEGORY_NAME,
    'VARIABLE_DYNAMIC',
    'variable_dynamic',
  ]);
  deps.blocklyDebugLog('动态变量分类回调注册 key', dynamicVariableKeys);
  dynamicVariableKeys.forEach((key) => workspace.registerToolboxCategoryCallback(String(key), variableDynamicCallback));

  const procedureKeys = normalizeKeyList([
    deps.Blockly.PROCEDURE_CATEGORY_NAME,
    'PROCEDURE',
    'procedure',
  ]);
  deps.blocklyDebugLog('函数分类回调注册 key', procedureKeys);
  procedureKeys.forEach((key) => workspace.registerToolboxCategoryCallback(String(key), procedureCallback));
}
