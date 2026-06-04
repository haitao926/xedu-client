import { DEFAULT_BLOCKLY_IMAGE_INPUT } from './sample-assets.js';

const DEFAULT_PYTHON_PLACEHOLDER = `# 在左侧拖入积木开始编程\nlab_input = '${DEFAULT_BLOCKLY_IMAGE_INPUT}'`;

function getPythonCodeForWorkspace(workspace, pythonGenerator, fallback = DEFAULT_PYTHON_PLACEHOLDER) {
  if (!workspace || !pythonGenerator || typeof pythonGenerator.workspaceToCode !== 'function') {
    return fallback;
  }
  return pythonGenerator.workspaceToCode(workspace) || fallback;
}

function getWorkspaceExportPayload(Blockly, workspace, workspaceUrl = '') {
  if (!Blockly || !workspace) {
    return null;
  }
  const normalizedUrl = String(workspaceUrl || '');
  let content = '';
  let filename = 'workspace.blockly.json';
  if (normalizedUrl.endsWith('.xml')) {
    const xml = Blockly.Xml.workspaceToDom(workspace);
    content = Blockly.Xml.domToPrettyText(xml);
    filename = normalizedUrl ? normalizedUrl.split('/').pop() : 'workspace.blockly.xml';
  } else {
    content = JSON.stringify(Blockly.serialization.workspaces.save(workspace), null, 2);
    filename = normalizedUrl ? normalizedUrl.split('/').pop() : 'workspace.blockly.json';
  }
  return { content, filename };
}

function applyWorkspaceSnapshot(Blockly, workspace, serialized) {
  if (!Blockly || !workspace || !serialized) {
    return null;
  }
  workspace.clear();
  if (serialized.kind === 'xml') {
    const xml = Blockly.utils.xml.textToDom(serialized.value);
    Blockly.Xml.domToWorkspace(xml, workspace);
    return 'xml';
  }
  Blockly.serialization.workspaces.load(JSON.parse(serialized.value), workspace);
  return 'json';
}

function parseAndMigrateWorkspaceText(rawText, { migrateXmlText, migrateSerialized } = {}) {
  const trimmed = String(rawText || '').trim();
  if (!trimmed) {
    throw new Error('文件内容为空');
  }
  if (trimmed.startsWith('<xml')) {
    const migrated = typeof migrateXmlText === 'function'
      ? migrateXmlText(trimmed)
      : { xmlText: trimmed, report: null };
    return {
      serialized: { kind: 'xml', value: migrated.xmlText || trimmed },
      migrationReport: migrated.report || null,
    };
  }
  const parsed = JSON.parse(trimmed);
  const migrated = typeof migrateSerialized === 'function'
    ? migrateSerialized(parsed)
    : { data: parsed, report: null };
  return {
    serialized: { kind: 'json', value: JSON.stringify(migrated.data ?? parsed) },
    migrationReport: migrated.report || null,
  };
}

function readBlockFieldValue(block, fieldName) {
  if (!block || !fieldName) {
    return '';
  }
  if (typeof block.getFieldValue === 'function') {
    return block.getFieldValue(fieldName);
  }
  const rawValue = block.fields?.[fieldName];
  if (rawValue && typeof rawValue === 'object' && 'id' in rawValue) {
    return rawValue.id;
  }
  return rawValue;
}

function readBlockFieldText(block, fieldName) {
  if (!block || !fieldName) {
    return '';
  }
  const field = typeof block.getField === 'function' ? block.getField(fieldName) : null;
  if (field && typeof field.getText === 'function') {
    return field.getText();
  }
  const rawValue = block.fields?.[fieldName];
  if (rawValue && typeof rawValue === 'object') {
    if (typeof rawValue.name === 'string') {
      return rawValue.name;
    }
    if (typeof rawValue.text === 'string') {
      return rawValue.text;
    }
  }
  return rawValue;
}

function getInputTargetBlock(block, inputName) {
  if (!block || !inputName) {
    return null;
  }
  if (typeof block.getInputTargetBlock === 'function') {
    return block.getInputTargetBlock(inputName);
  }
  const input = block.inputs?.[inputName];
  if (input?.block) {
    return input.block;
  }
  if (input?.shadow) {
    return input.shadow;
  }
  return null;
}

function hasConnectedInputBlock(block, inputName) {
  return Boolean(getInputTargetBlock(block, inputName));
}

function readLiteralValueFromConnectedBlock(block, inputName) {
  const connectedBlock = getInputTargetBlock(block, inputName);
  if (!connectedBlock) {
    return '';
  }
  const connectedType = String(connectedBlock?.type || '');
  if (connectedType === 'text') {
    return readBlockFieldValue(connectedBlock, 'TEXT') || '';
  }
  if (connectedType === 'math_number') {
    return readBlockFieldValue(connectedBlock, 'NUM');
  }
  if (connectedType === 'xeduhub_input_image') {
    return readBlockFieldValue(connectedBlock, 'INPUT') || '';
  }
  return '';
}

function lookupWorkspaceVariableName(workspace, variableId) {
  const variableMap = typeof workspace?.getVariableMap === 'function' ? workspace.getVariableMap() : null;
  if (!variableMap || !variableId || typeof variableMap.getVariableById !== 'function') {
    return '';
  }
  const variable = variableMap.getVariableById(variableId);
  return String(variable?.name || '').trim();
}

function getBlockVariableName(block, fieldName, lookupVariableName = () => '') {
  if (!block || !fieldName) {
    return '';
  }
  const variableId = String(readBlockFieldValue(block, fieldName) || '').trim();
  const fromWorkspace = String(lookupVariableName(variableId) || '').trim();
  const fromField = String(readBlockFieldText(block, fieldName) || '').trim();
  return fromWorkspace || fromField || '';
}

function readVariableFieldName(block, fieldName) {
  return String(readBlockFieldText(block, fieldName) || readBlockFieldValue(block, fieldName) || '').trim();
}

function describeConnectedValue(block, inputName, blocks) {
  const connectedBlock = getInputTargetBlock(block, inputName);
  if (!connectedBlock) {
    return { kind: 'empty', value: '' };
  }
  const connectedType = String(connectedBlock?.type || '').trim();
  if (connectedType === 'text') {
    return { kind: 'text', value: readBlockFieldValue(connectedBlock, 'TEXT') || '' };
  }
  if (connectedType === 'math_number') {
    return { kind: 'number', value: readBlockFieldValue(connectedBlock, 'NUM') };
  }
  if (connectedType === 'variables_get') {
    return { kind: 'variable', value: readVariableFieldName(connectedBlock, 'VAR') || '' };
  }
  if (connectedType === 'xeduhub_input_image') {
    return { kind: 'image-path', value: readBlockFieldValue(connectedBlock, 'INPUT') || '' };
  }
  const literal = resolveInputValueSpec(block, inputName, blocks);
  return { kind: 'connected', value: literal };
}

function resolveLiteralInputFromVariableBlock(connectedBlock, blocks) {
  const connectedType = String(connectedBlock?.type || '').trim();
  if (connectedType !== 'variables_get') {
    return '';
  }
  const variableName = readVariableFieldName(connectedBlock, 'VAR');
  if (!variableName) {
    return '';
  }
  const normalizedBlocks = Array.isArray(blocks) ? blocks : [];
  for (const block of normalizedBlocks) {
    const blockType = String(block?.type || '').trim();
    if (blockType === 'xeduhub_load_image_to_var') {
      const imageVarName = readVariableFieldName(block, 'IMAGE_VAR');
      if (imageVarName && imageVarName === variableName) {
        return readBlockFieldValue(block, 'INPUT') || '';
      }
    }
  }
  return '';
}

function resolveLiteralInputFromNamedVariable(variableName, blocks) {
  const normalizedName = String(variableName || '').trim();
  if (!normalizedName) {
    return '';
  }
  const normalizedBlocks = Array.isArray(blocks) ? blocks : [];
  for (const block of normalizedBlocks) {
    const blockType = String(block?.type || '').trim();
    if (blockType === 'xeduhub_load_image_to_var') {
      const imageVarName = readVariableFieldName(block, 'IMAGE_VAR');
      if (imageVarName && imageVarName === normalizedName) {
        return readBlockFieldValue(block, 'INPUT') || '';
      }
    }
  }
  return '';
}

function resolveInputValueSpec(block, inputName, blocks) {
  const directInput = readLiteralValueFromConnectedBlock(block, inputName);
  if (directInput !== undefined && directInput !== null && directInput !== '') {
    return directInput;
  }
  const connectedBlock = getInputTargetBlock(block, inputName);
  if (!connectedBlock) {
    return '';
  }
  const variableBoundInput = resolveLiteralInputFromVariableBlock(connectedBlock, blocks);
  if (variableBoundInput) {
    return variableBoundInput;
  }
  return '__runtime_bound__';
}

function resolveWorkspaceInputSpec(blocks) {
  const normalizedBlocks = Array.isArray(blocks) ? blocks : [];
  for (const block of normalizedBlocks) {
    const blockType = String(block?.type || '').trim();
    if (blockType === 'xeduhub_set_input_resource' || blockType === 'xeduhub_set_input' || blockType === 'xeduhub_flow_set_input') {
      const input = readBlockFieldValue(block, 'INPUT') || '';
      if (input) {
        return input;
      }
      continue;
    }
    if (blockType === 'xeduhub_set_input_list') {
      const raw = String(readBlockFieldValue(block, 'INPUTS') || '').trim();
      if (!raw) {
        continue;
      }
      try {
        return JSON.parse(raw);
      } catch (_) {
        return raw;
      }
    }
    if (blockType === 'xeduhub_load_image_to_var') {
      const input = readBlockFieldValue(block, 'INPUT') || '';
      if (input) {
        return input;
      }
    }
    if (blockType === 'variables_set') {
      const variableName = readVariableFieldName(block, 'VAR');
      const input = resolveLiteralInputFromNamedVariable(variableName, normalizedBlocks);
      if (input) {
        return input;
      }
    }
  }
  return '';
}

function collectXEduHubPresentationActionsFromBlocks(workspaceOrBlocks) {
  const topBlocks = typeof workspaceOrBlocks?.getTopBlocks === 'function'
    ? workspaceOrBlocks.getTopBlocks(true)
    : Array.isArray(workspaceOrBlocks) ? workspaceOrBlocks : [];
  const actions = [];
  const seen = new Set();

  function pushAction(action) {
    if (!action) {
      return;
    }
    const key = `${action.type || ''}:${action.block_id || ''}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    actions.push(action);
  }

  for (const topBlock of topBlocks) {
    let current = topBlock;
    while (current) {
      const type = String(current?.type || '');
      if (type === 'xeduhub_show_result_card') {
        pushAction({
          type: 'result_card',
          block_id: String(current.id || ''),
          title: String(readBlockFieldValue(current, 'TITLE') || '运行结果').trim() || '运行结果',
          result: describeConnectedValue(current, 'RESULT', workspaceOrBlocks),
        });
      } else if (type === 'xeduhub_show_result_image') {
        pushAction({
          type: 'result_image',
          block_id: String(current.id || ''),
          image: describeConnectedValue(current, 'IMAGE', workspaceOrBlocks),
        });
      } else if (type === 'xeduhub_run_and_record') {
        const noteValue = describeConnectedValue(current, 'NOTE', workspaceOrBlocks);
        pushAction({
          type: 'record_note',
          block_id: String(current.id || ''),
          note: String(noteValue.value || readBlockFieldValue(current, 'NOTE') || '教学结论已记录').trim() || '教学结论已记录',
        });
      } else if (type === 'xeduhub_clear_result') {
        pushAction({
          type: 'clear_result',
          block_id: String(current.id || ''),
        });
      }
      current = typeof current.getNextBlock === 'function' ? current.getNextBlock() : null;
    }
  }

  return actions;
}

function collectXEduHubSpecFromBlocks(blocks, adapters) {
  const {
    isSemanticRunBlockType,
    getTaskIdFromRunBlockType,
    getTaskById,
    getParamFieldName,
    resolveLegacyTaskId,
    projectRoot = '',
  } = adapters || {};
  const spec = {
    project_root: String(projectRoot || ''),
    mode: 'preset',
    params: {},
  };
  const normalizedBlocks = Array.isArray(blocks) ? blocks : [];
  const workspaceInput = resolveWorkspaceInputSpec(normalizedBlocks);
  if (workspaceInput !== '') {
    spec.input = workspaceInput;
  }

  for (const block of normalizedBlocks) {
    const blockType = String(block?.type || '');
    if (blockType === 'xeduhub_set_input_resource' || blockType === 'xeduhub_set_input' || blockType === 'xeduhub_flow_set_input') {
      spec.input = readBlockFieldValue(block, 'INPUT') || '';
      continue;
    }
    if (blockType === 'xeduhub_set_input_list') {
      const raw = String(readBlockFieldValue(block, 'INPUTS') || '').trim();
      if (!raw) {
        continue;
      }
      try {
        spec.input = JSON.parse(raw);
      } catch (_) {
        spec.input = raw;
      }
      continue;
    }
    if (typeof isSemanticRunBlockType === 'function' && isSemanticRunBlockType(blockType)) {
      const taskId = typeof getTaskIdFromRunBlockType === 'function' ? getTaskIdFromRunBlockType(blockType) : '';
      const task = typeof getTaskById === 'function' ? getTaskById(taskId) : null;
      spec.task_id = taskId;
      spec.mode = 'preset';
      if (spec.input === undefined || spec.input === null || spec.input === '') {
        const resolvedInput = resolveInputValueSpec(block, 'INPUT_DATA', normalizedBlocks);
        if (resolvedInput !== '') {
          spec.input = resolvedInput;
        }
      }
      spec.params = spec.params || {};
      (task?.params || []).forEach((param) => {
        const value = readBlockFieldValue(block, typeof getParamFieldName === 'function' ? getParamFieldName(param.key) : '');
        if (value === undefined || value === null || value === '') {
          return;
        }
        spec.params[param.key] = value;
      });
      continue;
    }
    if (blockType === 'xeduhub_workflow_create' || blockType === 'xeduhub_workflow_set_task' || blockType === 'xeduhub_workflow_create_var') {
      spec.task_id = readBlockFieldValue(block, 'TASK_ID') || spec.task_id || '';
      spec.mode = 'workflow';
      continue;
    }
    if (blockType === 'xeduhub_workflow_set_params' || blockType === 'xeduhub_workflow_infer') {
      const raw = String(readBlockFieldValue(block, 'PARAMS') || '').trim();
      spec.mode = 'workflow';
      if (spec.input === undefined || spec.input === null || spec.input === '') {
        const resolvedInput = resolveInputValueSpec(block, 'INPUT_DATA', normalizedBlocks);
        if (resolvedInput !== '') {
          spec.input = resolvedInput;
        }
      }
      if (!raw) {
        continue;
      }
      try {
        Object.assign(spec.params, JSON.parse(raw));
      } catch (_) {
        spec.params_json = raw;
      }
      continue;
    }
    if (blockType === 'xeduhub_workflow_infer_var' || blockType === 'xeduhub_workflow_infer_pair') {
      spec.mode = 'workflow';
      if (spec.input === undefined || spec.input === null || spec.input === '') {
        const resolvedInput = resolveInputValueSpec(block, 'INPUT_DATA', normalizedBlocks);
        if (resolvedInput !== '') {
          spec.input = resolvedInput;
        }
      }
      const bboxValue = readLiteralValueFromConnectedBlock(block, 'BBOX');
      if (bboxValue !== undefined && bboxValue !== null && bboxValue !== '') {
        spec.params.bbox = bboxValue;
      }
      continue;
    }
    if (blockType === 'xeduhub_run_vision') {
      spec.task_id = typeof resolveLegacyTaskId === 'function'
        ? resolveLegacyTaskId(readBlockFieldValue(block, 'TASK') || '', readBlockFieldValue(block, 'MODEL') || '')
        : '';
      spec.input = spec.input || readBlockFieldValue(block, 'INPUT') || '';
      spec.mode = 'preset';
      continue;
    }
    if (blockType === 'xeduhub_classify_run') {
      spec.task_id = typeof resolveLegacyTaskId === 'function'
        ? resolveLegacyTaskId('classification', readBlockFieldValue(block, 'MODEL') || '')
        : '';
      spec.mode = 'preset';
      continue;
    }
    if (blockType === 'xeduhub_detect_run') {
      spec.task_id = typeof resolveLegacyTaskId === 'function'
        ? resolveLegacyTaskId('detection', readBlockFieldValue(block, 'MODEL') || '')
        : '';
      spec.mode = 'preset';
      continue;
    }
    if (blockType === 'xeduhub_ocr_run') {
      spec.task_id = typeof resolveLegacyTaskId === 'function'
        ? resolveLegacyTaskId('ocr', readBlockFieldValue(block, 'MODEL') || '')
        : '';
      spec.mode = 'preset';
      continue;
    }
  }

  return spec.task_id || spec.input ? spec : null;
}

function collectXEduHubTasksFromBlocks(blocks, {
  isSemanticRunBlockType,
  getTaskIdFromRunBlockType,
  getTaskById,
  resolveLegacyTaskId,
} = {}) {
  const normalizedBlocks = Array.isArray(blocks) ? blocks : [];
  const tasks = [];
  const seen = new Set();

  function pushTask(taskId) {
    const normalized = String(taskId || '').trim();
    if (!normalized || seen.has(normalized)) {
      return;
    }
    const task = typeof getTaskById === 'function' ? getTaskById(normalized) : null;
    tasks.push({
      task_id: normalized,
      label: String(task?.label || normalized).trim(),
      available: task?.available !== false,
      quick_block_enabled: task?.quick_block_enabled !== false,
    });
    seen.add(normalized);
  }

  for (const block of normalizedBlocks) {
    const blockType = String(block?.type || '');
    if (typeof isSemanticRunBlockType === 'function' && isSemanticRunBlockType(blockType)) {
      pushTask(typeof getTaskIdFromRunBlockType === 'function' ? getTaskIdFromRunBlockType(blockType) : '');
      continue;
    }
    if (blockType === 'xeduhub_run_vision') {
      pushTask(
        typeof resolveLegacyTaskId === 'function'
          ? resolveLegacyTaskId(readBlockFieldValue(block, 'TASK') || '', readBlockFieldValue(block, 'MODEL') || '')
          : '',
      );
      continue;
    }
    if (blockType === 'xeduhub_classify_run') {
      pushTask(typeof resolveLegacyTaskId === 'function' ? resolveLegacyTaskId('classification', readBlockFieldValue(block, 'MODEL') || '') : '');
      continue;
    }
    if (blockType === 'xeduhub_detect_run') {
      pushTask(typeof resolveLegacyTaskId === 'function' ? resolveLegacyTaskId('detection', readBlockFieldValue(block, 'MODEL') || '') : '');
      continue;
    }
    if (blockType === 'xeduhub_ocr_run') {
      pushTask(typeof resolveLegacyTaskId === 'function' ? resolveLegacyTaskId('ocr', readBlockFieldValue(block, 'MODEL') || '') : '');
    }
  }

  return tasks;
}

function hasRunnableFlowInBlocks(blocks, {
  isSemanticRunBlockType,
  runnableBlockTypes,
} = {}) {
  const normalizedBlocks = Array.isArray(blocks) ? blocks : [];
  return normalizedBlocks.some((block) => {
    const type = String(block?.type || '');
    return (typeof isSemanticRunBlockType === 'function' && isSemanticRunBlockType(type))
      || Boolean(runnableBlockTypes?.has?.(type));
  });
}

function validateWorkspaceBindingsForBlocks(blocks, {
  lookupVariableName = () => '',
  buildPreflightError,
} = {}) {
  const normalizedBlocks = Array.isArray(blocks) ? blocks : [];
  const cameraVars = new Set();
  const streamVars = new Set();
  const servoVars = new Set();

  for (const block of normalizedBlocks) {
    const blockType = String(block?.type || '');
    if (blockType === 'xeduhub_cv_open_camera' || blockType === 'xeduhub_cv_open_video') {
      const name = getBlockVariableName(block, 'CAMERA_VAR', lookupVariableName);
      if (name) {
        cameraVars.add(name);
      }
      continue;
    }
    if (blockType === 'xeduhub_http_get' || blockType === 'xeduhub_http_open_stream') {
      const fieldName = blockType === 'xeduhub_http_get' ? 'RESPONSE_VAR' : 'STREAM_VAR';
      const name = getBlockVariableName(block, fieldName, lookupVariableName);
      if (name) {
        streamVars.add(name);
      }
      continue;
    }
    if (blockType === 'xeduhub_servo_setup') {
      const name = getBlockVariableName(block, 'SERVO_VAR', lookupVariableName);
      if (name) {
        servoVars.add(name);
      }
    }
  }

  for (const block of normalizedBlocks) {
    const blockType = String(block?.type || '');
    if (blockType === 'xeduhub_cv_loop_frames') {
      const name = getBlockVariableName(block, 'CAMERA_VAR', lookupVariableName);
      if (name && !cameraVars.has(name)) {
        return buildPreflightError?.(
          'camera_var_unbound',
          `循环读取画面使用了未打开的摄像头变量：${name}`,
          '让“打开摄像头到变量”和“循环读取画面”使用同一个摄像头变量。',
        ) || null;
      }
      continue;
    }
    if (blockType === 'xeduhub_http_iter_chunks' || blockType === 'xeduhub_http_loop_stream_frames') {
      const name = getBlockVariableName(block, 'STREAM_VAR', lookupVariableName);
      if (name && !streamVars.has(name)) {
        return buildPreflightError?.(
          'stream_var_unbound',
          `遍历流分块使用了未打开的流变量：${name}`,
          '让“打开视频流”和“遍历流分块”使用同一个流变量。',
        ) || null;
      }
      continue;
    }
    if (blockType === 'xeduhub_servo_write_angle') {
      const name = getBlockVariableName(block, 'SERVO_VAR', lookupVariableName);
      if (name && !servoVars.has(name)) {
        return buildPreflightError?.(
          'servo_var_unbound',
          `设置角度使用了未初始化的舵机变量：${name}`,
          '先用“初始化舵机”积木创建同一个舵机变量。',
        ) || null;
      }
    }
  }

  return null;
}

export {
  DEFAULT_PYTHON_PLACEHOLDER,
  applyWorkspaceSnapshot,
  collectXEduHubPresentationActionsFromBlocks,
  collectXEduHubSpecFromBlocks,
  collectXEduHubTasksFromBlocks,
  getBlockVariableName,
  getPythonCodeForWorkspace,
  getWorkspaceExportPayload,
  hasRunnableFlowInBlocks,
  lookupWorkspaceVariableName,
  parseAndMigrateWorkspaceText,
  validateWorkspaceBindingsForBlocks,
};
