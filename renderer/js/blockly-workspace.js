async function bootstrapBlocklyRuntime() {
  try {
    await import('./blockly-workspace.runtime.js');
  } catch (error) {
    const codeEl = document.getElementById('pythonCode');
    if (codeEl) {
      codeEl.textContent = `# Blockly 运行时加载失败\n# ${error?.message || '未知错误'}`;
    }
    const toolboxLabel = document.getElementById('toolboxLabel');
    if (toolboxLabel) {
      toolboxLabel.textContent = '运行时加载失败';
    }
    console.error('Blockly runtime load failed:', error);
  }
}

bootstrapBlocklyRuntime();
