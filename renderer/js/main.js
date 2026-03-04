import { log, showTab, showModal, hideModal, initModalListeners, showToast } from './ui.js';
import { startJupyter, stopJupyter, restartJupyter, openBrowser, browseFolder, confirmProjectPath, clearProjectPath, refreshStatus, testPythonEnvironment, refreshView, openExternal, toggleFullscreen, setVisibility } from './jupyter.js';
import { askAI, clearCurrentChat, startNewChat, removeImage, saveAIConfig, testAIConfig, selectChat, previewImage, handleKeyDown, syncModelBadge } from './ai.js';
import { initDocsPage, loadComponents, loadDocument, performSearch, showTutorials, searchDocs } from './docs.js';
import { initResourcesPage, refreshResources, openSubmitPage } from './resources.js';
import { installPackage, uninstallPackage, updatePackage } from './package-manager.js';
import { registerNamespace } from './app-context.js';
import { ProjectWizard } from './project-wizard.js';
import apiClient from './api.js';

// Initialize the Project Wizard globally
new ProjectWizard(apiClient);

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
    handleKeyDown,
    syncModelBadge
});
registerNamespace('docs', {
    initDocsPage,
    loadComponents,
    loadDocument,
    performSearch,
    showTutorials,
    searchDocs
});
registerNamespace('resources', {
    initResourcesPage,
    refreshResources,
    openSubmitPage
});

// 保存系统配置函数
async function saveSystemConfig() {
    console.log('saveSystemConfig 被调用');
    const apiKey = document.getElementById('api-key-input')?.value.trim();
    const pythonPath = document.getElementById('python-path-input')?.value.trim();
    const aiBaseUrlInput = document.getElementById('ai-base-url')?.value.trim() || '';
    const aiModelInput = document.getElementById('ai-model-input')?.value.trim() || '';

    const resourcesBaseUrlInput = document.getElementById('resources-base-url')?.value.trim() || '';
    const resourcesRepoInput = document.getElementById('resources-repo')?.value.trim() || '';
    const resourcesBranchInput = document.getElementById('resources-branch')?.value.trim() || '';
    const resourcesIndexPathInput = document.getElementById('resources-index-path')?.value.trim() || '';
    const resourcesSubmitUrlInput = document.getElementById('resources-submit-url')?.value.trim() || '';
    const resourcesPublishPathInput = document.getElementById('resources-publish-path')?.value.trim() || '';
    const resourcesPublishTokenInput = document.getElementById('resources-publish-token')?.value.trim() || '';

    const hasResourcesInput = !!(resourcesBaseUrlInput || resourcesRepoInput || resourcesBranchInput || resourcesIndexPathInput || resourcesSubmitUrlInput || resourcesPublishPathInput || resourcesPublishTokenInput);
    const hasAiInput = !!(apiKey || aiBaseUrlInput || aiModelInput);

    if (!hasAiInput && !pythonPath && !hasResourcesInput) {
        log('请至少输入一项配置', 'warning');
        return;
    }

    try {
        // 保存 API Key
        if (hasAiInput) {
            // AI 配置已经在 input 中，saveAIConfig 会自行读取
            await saveAIConfig();
        }

        // 保存 Python 路径 (这里暂时模拟保存，实际可能需要调用后端 API)
        if (pythonPath) {
            localStorage.setItem('python_path', pythonPath);
            log('Python 环境路径已保存', 'success');
        }

        // 保存课程资源库配置
        const resourcesBaseUrl = resourcesBaseUrlInput;
        const resourcesRepo = resourcesRepoInput;
        const resourcesBranch = resourcesBranchInput || 'main';
        const resourcesIndexPath = resourcesIndexPathInput || 'index.json';
        const resourcesSubmitUrl = resourcesSubmitUrlInput;
        const resourcesPublishPath = resourcesPublishPathInput || 'courses';
        const resourcesPublishToken = resourcesPublishTokenInput;

        const uiPayload = {
            resources_base_url: resourcesBaseUrl,
            resources_repo: resourcesRepo,
            resources_branch: resourcesBranch,
            resources_index_path: resourcesIndexPath,
            resources_submit_url: resourcesSubmitUrl,
            resources_publish_path: resourcesPublishPath,
            resources_publish_token: resourcesPublishToken
        };

        await apiClient.saveConfig({ ui: uiPayload });

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

    // 加载课程资源库配置
    apiClient.loadConfig().then((response) => {
        if (!response?.success) return;
        const uiConfig = response.config?.ui || {};
        const aiConfig = response.config?.ai || {};

        const resourcesBaseUrl = document.getElementById('resources-base-url');
        const resourcesRepo = document.getElementById('resources-repo');
        const resourcesBranch = document.getElementById('resources-branch');
        const resourcesIndexPath = document.getElementById('resources-index-path');
        const resourcesSubmitUrl = document.getElementById('resources-submit-url');
        const resourcesPublishPath = document.getElementById('resources-publish-path');
        const resourcesPublishToken = document.getElementById('resources-publish-token');
        const aiBaseUrl = document.getElementById('ai-base-url');
        const aiModelInput = document.getElementById('ai-model-input');

        if (resourcesBaseUrl) resourcesBaseUrl.value = uiConfig.resources_base_url || '';
        if (resourcesRepo) resourcesRepo.value = uiConfig.resources_repo || '';
        if (resourcesBranch) resourcesBranch.value = uiConfig.resources_branch || 'main';
        if (resourcesIndexPath) resourcesIndexPath.value = uiConfig.resources_index_path || 'index.json';
        if (resourcesSubmitUrl) resourcesSubmitUrl.value = uiConfig.resources_submit_url || '';
        if (resourcesPublishPath) resourcesPublishPath.value = uiConfig.resources_publish_path || 'courses';
        if (resourcesPublishToken) resourcesPublishToken.value = uiConfig.resources_publish_token || '';
        if (aiBaseUrl) aiBaseUrl.value = aiConfig.base_url || '';
        if (aiModelInput) aiModelInput.value = aiConfig.model || '';
        if (window.app?.ai?.syncModelBadge) {
            window.app.ai.syncModelBadge();
        }
    }).catch((error) => {
        console.warn('加载课程资源库配置失败:', error);
    });

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
