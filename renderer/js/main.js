import { log, showTab, showModal, hideModal, initModalListeners, showToast } from './ui.js';
import { startJupyter, stopJupyter, restartJupyter, openBrowser, browseFolder, confirmProjectPath, clearProjectPath, refreshStatus, testPythonEnvironment, refreshView, openExternal, toggleFullscreen, setVisibility } from './jupyter.js';
import { askAI, clearCurrentChat, startNewChat, removeImage, saveAIConfig, testAIConfig, selectChat, previewImage, handleKeyDown } from './ai.js';
import { initDocsPage, loadComponents, loadDocument, performSearch, showTutorials, searchDocs } from './docs.js';
import { installPackage, uninstallPackage, updatePackage } from './package-manager.js';
import { registerNamespace } from './app-context.js';

// 设置页选项卡切换
function showSettingsTab(tab) {
    const tabs = document.querySelectorAll('.settings-tab');
    const sections = document.querySelectorAll('[data-settings-tab]');

    tabs.forEach((btn) => {
        const isActive = btn.dataset.tab === tab;
        btn.classList.toggle('active', isActive);
    });

    sections.forEach((section) => {
        const isActive = section.dataset.settingsTab === tab;
        section.classList.toggle('active', isActive);
    });
}

registerNamespace('ui', { showTab, showModal, hideModal, log, showToast });
registerNamespace('jupyter', {
    startJupyter,
    stopJupyter,
    restartJupyter,
    openBrowser,
    browseFolder,
    confirmProjectPath,
    clearProjectPath,
    testPythonEnvironment,
    refreshView,
    openExternal,
    toggleFullscreen,
    setVisibility
});
registerNamespace('ai', {
    askAI,
    clearCurrentChat,
    startNewChat,
    removeImage,
    saveAIConfig,
    testAIConfig,
    selectChat,
    previewImage,
    handleKeyDown
});
registerNamespace('docs', {
    initDocsPage,
    loadComponents,
    loadDocument,
    performSearch,
    showTutorials,
    searchDocs
});

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
            // API Key已经在input中，saveAIConfig会自己获取
            await saveAIConfig();
        }

        // 保存 Python 路径 (这里暂时模拟保存，实际可能需要调用后端 API)
        if (pythonPath) {
            localStorage.setItem('python_path', pythonPath);
            log('Python 环境路径已保存', 'success');
        }

        log('配置保存成功', 'success');
        showToast('系统配置已保存', 'success');
    } catch (error) {
        console.error('保存配置失败:', error);
        log('保存配置失败: ' + error.message, 'error');
        showToast('保存失败: ' + error.message, 'error');
    }
}

registerNamespace('system', { saveSystemConfig, installPackage, uninstallPackage, showSettingsTab });
registerNamespace('system', { saveSystemConfig, installPackage, uninstallPackage, updatePackage, showSettingsTab });

// 初始化
window.addEventListener('DOMContentLoaded', () => {
    const hideStartupLoading = () => {
        const overlay = document.getElementById('startup-loading');
        if (overlay) {
            overlay.classList.add('fade-out');
            setTimeout(() => overlay.remove(), 300);
        }
    };

    // 加载 Python 路径
    const savedPythonPath = localStorage.getItem('python_path');
    if (savedPythonPath) {
        const pythonInput = document.getElementById('python-path-input');
        if (pythonInput) pythonInput.value = savedPythonPath;
    }

    // API Key 出于安全考虑通常不回显，或者需要从后端获取
    log('系统初始化完成', 'success');

    // 初始化模态框事件监听器（点击外部关闭和ESC键关闭）
    initModalListeners();

    // 初始状态检查
    refreshStatus().finally(hideStartupLoading);

    // 兜底：10 秒后也强制隐藏加载遮罩，防止异常阻塞
    setTimeout(hideStartupLoading, 10000);

    // 启动定时状态检查
    setInterval(refreshStatus, 5000);

    // 初始化文档页面（如果首次打开）
    const docsTab = document.querySelector('[onclick*="docs"]');
    if (docsTab && docsTab.classList.contains('active')) {
        initDocsPage();
    }

    // 监听 Electron 主进程日志
    if (window.electronAPI && window.electronAPI.onLogUpdate) {
        window.electronAPI.onLogUpdate((message) => {
            log(message, 'info');
        });
    }
});
