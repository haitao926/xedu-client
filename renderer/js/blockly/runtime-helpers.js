const DEFAULT_PYTHON_PLACEHOLDER = "# 在左侧拖入积木开始编程\nlab_input = 'courses/blockly-smoke/demo.jpg'";

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
        const directInput = readLiteralValueFromConnectedBlock(block, 'INPUT_DATA');
        if (directInput !== undefined && directInput !== null && directInput !== '') {
          spec.input = directInput;
        } else if (hasConnectedInputBlock(block, 'INPUT_DATA')) {
          spec.input = '__runtime_bound__';
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
        const directInput = readLiteralValueFromConnectedBlock(block, 'INPUT_DATA');
        if (directInput !== undefined && directInput !== null && directInput !== '') {
          spec.input = directInput;
        } else if (hasConnectedInputBlock(block, 'INPUT_DATA')) {
          spec.input = '__runtime_bound__';
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
        const directInput = readLiteralValueFromConnectedBlock(block, 'INPUT_DATA');
        if (directInput !== undefined && directInput !== null && directInput !== '') {
          spec.input = directInput;
        } else if (hasConnectedInputBlock(block, 'INPUT_DATA')) {
          spec.input = '__runtime_bound__';
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
  collectXEduHubSpecFromBlocks,
  getBlockVariableName,
  getPythonCodeForWorkspace,
  getWorkspaceExportPayload,
  hasRunnableFlowInBlocks,
  lookupWorkspaceVariableName,
  parseAndMigrateWorkspaceText,
  validateWorkspaceBindingsForBlocks,
};
