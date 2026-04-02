function defineXEduHubBlocks(Blockly, pythonGenerator) {
  const runColor = '#5A8DEE';
  const parameterColor = '#8FA4F0';
  const debugColor = '#A596C9';
  Blockly.defineBlocksWithJsonArray([
    { type: 'xeduhub_set_input', message0: '选择输入图片 %1', args0: [{ type: 'field_input', name: 'INPUT', text: 'demo.jpg' }], previousStatement: null, nextStatement: null, colour: runColor },
    { type: 'xeduhub_classify_run', message0: '图像分类推理（模型 %1）', args0: [{ type: 'field_input', name: 'MODEL', text: 'resnet18' }], previousStatement: null, nextStatement: null, colour: runColor },
    { type: 'xeduhub_detect_run', message0: '目标检测推理（模型 %1）', args0: [{ type: 'field_input', name: 'MODEL', text: 'yolov5' }], previousStatement: null, nextStatement: null, colour: runColor },
    { type: 'xeduhub_ocr_run', message0: 'OCR 推理（模型 %1）', args0: [{ type: 'field_input', name: 'MODEL', text: 'dbnet' }], previousStatement: null, nextStatement: null, colour: runColor },
    { type: 'xeduhub_show_result_card', message0: '显示结果卡片 标题 %1', args0: [{ type: 'field_input', name: 'TITLE', text: '推理结果' }], previousStatement: null, nextStatement: null, colour: runColor },
    { type: 'xeduhub_show_result_image', message0: '显示结果图', previousStatement: null, nextStatement: null, colour: runColor },
    { type: 'xeduhub_run_and_record', message0: '运行并记录结论', previousStatement: null, nextStatement: null, colour: runColor },
    { type: 'xeduhub_clear_result', message0: '清空结果', previousStatement: null, nextStatement: null, colour: runColor },
    { type: 'xeduhub_set_model', message0: '设置模型名 %1', args0: [{ type: 'field_input', name: 'MODEL', text: 'resnet18' }], previousStatement: null, nextStatement: null, colour: parameterColor },
    { type: 'xeduhub_set_threshold', message0: '设置置信度阈值 %1', args0: [{ type: 'field_input', name: 'THRESHOLD', text: '0.35' }], previousStatement: null, nextStatement: null, colour: parameterColor },
    { type: 'xeduhub_set_topk', message0: '设置最大输出数 %1', args0: [{ type: 'field_input', name: 'TOPK', text: '3' }], previousStatement: null, nextStatement: null, colour: parameterColor },
    { type: 'xeduhub_create_flow', message0: '创建任务流程 任务 %1 模型 %2', args0: [{ type: 'field_dropdown', name: 'TASK', options: [['图像分类', 'classification'], ['目标检测', 'detection'], ['OCR', 'ocr'], ['图像分割', 'segmentation'], ['关键点识别', 'pose'], ['内容生成', 'generation'], ['全景感知', 'panoptic'], ['多模态', 'multimodal'], ['深度估计', 'depth'], ['自定义', 'custom']] }, { type: 'field_input', name: 'MODEL', text: 'resnet18' }], previousStatement: null, nextStatement: null, colour: runColor },
    { type: 'xeduhub_flow_set_input', message0: '流程设置输入 %1', args0: [{ type: 'field_input', name: 'INPUT', text: 'demo.jpg' }], previousStatement: null, nextStatement: null, colour: runColor },
    { type: 'xeduhub_flow_execute', message0: '执行流程并保存到 %1', args0: [{ type: 'field_input', name: 'RESULT', text: 'lab_result' }], previousStatement: null, nextStatement: null, colour: runColor },
    { type: 'xeduhub_get_result_field', message0: '读取结果 %1 字段 %2', args0: [{ type: 'field_input', name: 'RESULT', text: 'lab_result' }, { type: 'field_dropdown', name: 'FIELD', options: [['label', 'label'], ['score', 'score'], ['boxes', 'boxes'], ['text', 'text'], ['raw', 'raw']] }], output: null, colour: parameterColor },
    { type: 'xeduhub_raw_create_workflow', message0: '底层：创建 workflow(task=%1)', args0: [{ type: 'field_dropdown', name: 'TASK', options: [['图像分类', 'classification'], ['目标检测', 'detection'], ['OCR', 'ocr'], ['图像分割', 'segmentation'], ['关键点识别', 'pose'], ['内容生成', 'generation'], ['全景感知', 'panoptic'], ['多模态', 'multimodal'], ['深度估计', 'depth'], ['自定义', 'custom']] }], previousStatement: null, nextStatement: null, colour: debugColor },
    { type: 'xeduhub_raw_inference', message0: '底层：inference(data=%1, model=%2)', args0: [{ type: 'field_input', name: 'INPUT', text: 'demo.jpg' }, { type: 'field_input', name: 'MODEL', text: 'resnet18' }], previousStatement: null, nextStatement: null, colour: debugColor },
    { type: 'xeduhub_read_raw', message0: '读取原始输出', output: null, colour: debugColor },
    { type: 'xeduhub_debug_print', message0: '打印中间变量 %1', args0: [{ type: 'field_input', name: 'VAR', text: 'lab_result' }], previousStatement: null, nextStatement: null, colour: debugColor },
    { type: 'xeduhub_catch_error', message0: '捕获错误并显示（错误变量 %1）', args0: [{ type: 'field_input', name: 'ERROR_VAR', text: 'lab_error' }], message1: '尝试 %1', args1: [{ type: 'input_statement', name: 'TRY' }], previousStatement: null, nextStatement: null, colour: debugColor },
    { type: 'xeduhub_run_vision', message0: '兼容：任务 %1 模型 %2 输入 %3', args0: [{ type: 'field_dropdown', name: 'TASK', options: [['图像分类', 'classification'], ['目标检测', 'detection'], ['OCR', 'ocr'], ['图像分割', 'segmentation'], ['关键点识别', 'pose'], ['内容生成', 'generation'], ['全景感知', 'panoptic'], ['多模态', 'multimodal'], ['深度估计', 'depth'], ['自定义', 'custom']] }, { type: 'field_input', name: 'MODEL', text: 'resnet18' }, { type: 'field_input', name: 'INPUT', text: 'demo.jpg' }], previousStatement: null, nextStatement: null, colour: runColor },
    { type: 'xeduhub_show_result', message0: '兼容：显示结果 标题 %1', args0: [{ type: 'field_input', name: 'TITLE', text: 'XEduHub 结果' }], previousStatement: null, nextStatement: null, colour: runColor },
    { type: 'xeduhub_print_status', message0: '兼容：打印运行状态', previousStatement: null, nextStatement: null, colour: runColor },
    { type: 'xeduhub_create_workflow', message0: '兼容：创建 workflow 任务 %1 模型 %2', args0: [{ type: 'field_dropdown', name: 'TASK', options: [['图像分类', 'classification'], ['目标检测', 'detection'], ['OCR', 'ocr'], ['图像分割', 'segmentation'], ['关键点识别', 'pose'], ['内容生成', 'generation'], ['全景感知', 'panoptic'], ['多模态', 'multimodal'], ['深度估计', 'depth'], ['自定义', 'custom']] }, { type: 'field_input', name: 'MODEL', text: 'resnet18' }], previousStatement: null, nextStatement: null, colour: runColor },
    { type: 'xeduhub_execute_workflow', message0: '兼容：执行 workflow 结果 %1', args0: [{ type: 'field_input', name: 'RESULT', text: 'lab_result' }], previousStatement: null, nextStatement: null, colour: runColor },
  ]);

  const runPy = (task, modelExpr) => [
    'from XEdu.hub import Workflow as wf',
    `lab_task = ${JSON.stringify(task)}`,
    `lab_model = ${modelExpr}`,
    'lab_flow = wf(task=lab_task)',
    'lab_result = lab_flow.inference(data=lab_input, model=lab_model)',
  ].join('\n') + '\n';

  pythonGenerator.forBlock.xeduhub_set_input = (block) => `lab_input = ${JSON.stringify(block.getFieldValue('INPUT') || 'demo.jpg')}\n`;
  pythonGenerator.forBlock.xeduhub_classify_run = (block) => runPy('classification', JSON.stringify(block.getFieldValue('MODEL') || 'resnet18'));
  pythonGenerator.forBlock.xeduhub_detect_run = (block) => runPy('detection', JSON.stringify(block.getFieldValue('MODEL') || 'yolov5'));
  pythonGenerator.forBlock.xeduhub_ocr_run = (block) => runPy('ocr', JSON.stringify(block.getFieldValue('MODEL') || 'dbnet'));
  pythonGenerator.forBlock.xeduhub_show_result_card = (block) => `print(${JSON.stringify(block.getFieldValue('TITLE') || '推理结果')}, lab_result)\n`;
  pythonGenerator.forBlock.xeduhub_show_result_image = () => "print('证据图可在结果面板查看')\n";
  pythonGenerator.forBlock.xeduhub_run_and_record = () => "print('教学结论已记录')\n";
  pythonGenerator.forBlock.xeduhub_clear_result = () => "lab_result = {}\nlab_error = ''\n";
  pythonGenerator.forBlock.xeduhub_set_model = (block) => `lab_model = ${JSON.stringify(block.getFieldValue('MODEL') || 'resnet18')}\n`;
  pythonGenerator.forBlock.xeduhub_set_threshold = (block) => `lab_threshold = ${JSON.stringify(block.getFieldValue('THRESHOLD') || '0.35')}\n`;
  pythonGenerator.forBlock.xeduhub_set_topk = (block) => `lab_topk = ${JSON.stringify(block.getFieldValue('TOPK') || '3')}\n`;
  pythonGenerator.forBlock.xeduhub_create_flow = (block) => `from XEdu.hub import Workflow as wf\nlab_task = ${JSON.stringify(block.getFieldValue('TASK') || 'classification')}\nlab_model = ${JSON.stringify(block.getFieldValue('MODEL') || 'resnet18')}\nlab_flow = wf(task=lab_task)\n`;
  pythonGenerator.forBlock.xeduhub_flow_set_input = (block) => `lab_input = ${JSON.stringify(block.getFieldValue('INPUT') || 'demo.jpg')}\n`;
  pythonGenerator.forBlock.xeduhub_flow_execute = (block) => `${block.getFieldValue('RESULT') || 'lab_result'} = lab_flow.inference(data=lab_input, model=lab_model)\n`;
  pythonGenerator.forBlock.xeduhub_get_result_field = (block) => {
    const result = block.getFieldValue('RESULT') || 'lab_result';
    const field = block.getFieldValue('FIELD') || 'raw';
    if (field === 'raw') {
      return [`str(${result})`, pythonGenerator.ORDER_ATOMIC];
    }
    return [`${result}.get(${JSON.stringify(field)}, '') if isinstance(${result}, dict) else ''`, pythonGenerator.ORDER_ATOMIC];
  };
  pythonGenerator.forBlock.xeduhub_raw_create_workflow = (block) => `from XEdu.hub import Workflow as wf\nlab_flow = wf(task=${JSON.stringify(block.getFieldValue('TASK') || 'classification')})\n`;
  pythonGenerator.forBlock.xeduhub_raw_inference = (block) => `lab_result = lab_flow.inference(data=${JSON.stringify(block.getFieldValue('INPUT') || 'demo.jpg')}, model=${JSON.stringify(block.getFieldValue('MODEL') || 'resnet18')})\n`;
  pythonGenerator.forBlock.xeduhub_read_raw = () => ['str(lab_result)', pythonGenerator.ORDER_ATOMIC];
  pythonGenerator.forBlock.xeduhub_debug_print = (block) => `print(${JSON.stringify(block.getFieldValue('VAR') || 'lab_result')})\n`;
  pythonGenerator.forBlock.xeduhub_catch_error = (block) => {
    const tryPart = pythonGenerator.statementToCode(block, 'TRY') || 'pass\n';
    const errVar = block.getFieldValue('ERROR_VAR') || 'lab_error';
    return `try:\n${pythonGenerator.prefixLines(tryPart, '  ')}except Exception as e:\n  ${errVar} = str(e)\n  print('运行失败:', ${errVar})\n`;
  };
  pythonGenerator.forBlock.xeduhub_run_vision = (block) => {
    const task = block.getFieldValue('TASK') || 'classification';
    const model = block.getFieldValue('MODEL') || 'resnet18';
    const input = block.getFieldValue('INPUT') || 'demo.jpg';
    return `lab_input = ${JSON.stringify(input)}\n` + runPy(task, JSON.stringify(model));
  };
  pythonGenerator.forBlock.xeduhub_show_result = (block) => pythonGenerator.forBlock.xeduhub_show_result_card(block);
  pythonGenerator.forBlock.xeduhub_print_status = () => "print('XEduHub workflow ready')\n";
  pythonGenerator.forBlock.xeduhub_create_workflow = (block) => pythonGenerator.forBlock.xeduhub_create_flow(block);
  pythonGenerator.forBlock.xeduhub_execute_workflow = (block) => pythonGenerator.forBlock.xeduhub_flow_execute(block);
}

export { defineXEduHubBlocks };
