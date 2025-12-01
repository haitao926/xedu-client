import { log, showTab, showModal, hideModal, initDragDrop, initModalListeners } from './ui.js';
import { startJupyter, stopJupyter, restartJupyter, openBrowser, browseFolder, confirmProjectPath, clearProjectPath, refreshStatus, testPythonEnvironment } from './jupyter.js';
import { askAI, clearCurrentChat, startNewChat, removeImage, saveAIConfig, testAIConfig, selectChat, previewImage, handleKeyDown } from './ai.js';

// 立即暴露基础函数到 window，确保在 DOM 加载前就可用
console.log('正在暴露函数到 window 对象...');

window.showTab = showTab;
window.showModal = showModal;
window.hideModal = hideModal;
window.log = log;

window.startJupyter = startJupyter;
window.stopJupyter = stopJupyter;
window.restartJupyter = restartJupyter;
window.openBrowser = openBrowser;
window.browseFolder = browseFolder;
window.confirmProjectPath = confirmProjectPath;
window.clearProjectPath = clearProjectPath;
window.testPythonEnvironment = testPythonEnvironment;

window.askAI = askAI;
window.clearCurrentChat = clearCurrentChat;
window.startNewChat = startNewChat;
window.removeImage = removeImage;
window.saveAIConfig = saveAIConfig;
window.testAIConfig = testAIConfig;
window.selectChat = selectChat;
window.previewImage = previewImage;
window.handleKeyDown = handleKeyDown;

// 保存系统配置函数
async function saveSystemConfig() {
    console.log('saveSystemConfig 被调用');
    const apiKey = document.getElementById('api-key-input')?.value.trim();
    const pythonPath = document.getElementById('python-path-input')?.value.trim();

    if (!apiKey && !pythonPath) {
        log('请至少输入一项配置', 'warning');
        return;
    }

    try {
        // 保存 API Key
        if (apiKey) {
            await saveAIConfig(apiKey);
        }

        // 保存 Python 路径 (这里暂时模拟保存，实际可能需要调用后端 API)
        if (pythonPath) {
            localStorage.setItem('python_path', pythonPath);
            log('Python 环境路径已保存', 'success');
        }

        log('配置保存成功', 'success');
    } catch (error) {
        console.error('保存配置失败:', error);
        log('保存配置失败: ' + error.message, 'error');
    }
}

window.saveSystemConfig = saveSystemConfig;


console.log('所有函数已暴露到 window');

// 初始化
window.addEventListener('DOMContentLoaded', () => {
    // 加载 Python 路径
    const savedPythonPath = localStorage.getItem('python_path');
    if (savedPythonPath) {
        const pythonInput = document.getElementById('python-path-input');
        if (pythonInput) pythonInput.value = savedPythonPath;
    }

    // API Key 出于安全考虑通常不回显，或者需要从后端获取
    log('系统初始化完成', 'success');

    // 初始化拖拽
    initDragDrop();

    // 初始化模态框事件监听器（点击外部关闭和ESC键关闭）
    initModalListeners();

    // 初始状态检查
    refreshStatus();

    // 启动定时状态检查
    setInterval(refreshStatus, 5000);

    // 监听 Electron 主进程日志
    if (window.electronAPI && window.electronAPI.onLogUpdate) {
        window.electronAPI.onLogUpdate((message) => {
            log(message, 'info');
        });
    }
});
