import { log, showTab, showModal, hideModal, initModalListeners, showToast } from './ui.js';
import { startJupyter, stopJupyter, restartJupyter, openBrowser, browseFolder, confirmProjectPath, clearProjectPath, refreshStatus, testPythonEnvironment, refreshView, openExternal, toggleFullscreen, setVisibility, openNotebookFile } from './jupyter.js';
import { askAI, clearCurrentChat, startNewChat, removeImage, saveAIConfig, testAIConfig, selectChat, previewImage, handleKeyDown, syncModelBadge } from './ai.js';
import { initResourcesPage, refreshResources, openSubmitPage, syncTeacherModeUI, toggleTeacherMode, connectStudentClassroomByCode, getChatContext, applyAgentCourseUpdate } from './resources.js';
import { installPackage, uninstallPackage, updatePackage } from './package-manager.js';
import { registerNamespace } from './app-context.js';
import { ProjectWizard } from './project-wizard.js';
import apiClient from './api.js';

// Initialize the Project Wizard globally
new ProjectWizard(apiClient);

let lastOpenedJupyterTarget = '';
let lastOpenedJupyterWorkspace = null;
let lastOpenedBlocklyWorkspace = null;
let blocklyViewRevision = 0;

// 设置页选项卡切换
function showSettingsTab(tab) {
    const tabs = document.querySelectorAll('.settings-tab');
    const sections = document.querySelectorAll('[data-settings-tab]');
    const targetTab = document.querySelector(`.settings-tab[data-tab="${tab}"]`);
    if (targetTab && targetTab.style.display === 'none') {
        tab = 'about';
    }

    tabs.forEach((btn) => {
        const isActive = btn.dataset.tab === tab;
        btn.classList.toggle('active', isActive);
    });

    sections.forEach((section) => {
        const isActive = section.dataset.settingsTab === tab;
        section.classList.toggle('active', isActive);
    });
}

const SIDEBAR_COLLAPSE_KEY = 'xedu-sidebar-collapsed';

function readSidebarCollapsed() {
    try {
        return localStorage.getItem(SIDEBAR_COLLAPSE_KEY) === '1';
    } catch (_) {
        return false;
    }
}

function writeSidebarCollapsed(collapsed) {
    try {
        localStorage.setItem(SIDEBAR_COLLAPSE_KEY, collapsed ? '1' : '0');
    } catch (_) {
        // ignore
    }
}

function applySidebarCollapsed(collapsed) {
    document.body.classList.toggle('sidebar-collapsed', collapsed);
    const toggleBtn = document.getElementById('sidebar-toggle-btn');
    if (toggleBtn) {
        const label = collapsed ? '展开侧边栏' : '收起侧边栏';
        toggleBtn.title = label;
        toggleBtn.setAttribute('aria-label', label);
    }
}

function initSidebarCollapseToggle() {
    const toggleBtn = document.getElementById('sidebar-toggle-btn');
    if (!toggleBtn) return;

    applySidebarCollapsed(readSidebarCollapsed());
    toggleBtn.addEventListener('click', () => {
        const collapsed = !document.body.classList.contains('sidebar-collapsed');
        applySidebarCollapsed(collapsed);
        writeSidebarCollapsed(collapsed);
    });
}

function registerPracticeDeepLinkHandler() {
    if (!window.electronAPI || typeof window.electronAPI.onDeepLinkOpenPractice !== 'function') {
        return;
    }
    window.electronAPI.onDeepLinkOpenPractice(async (payload) => {
        try {
            const projectDir = (payload?.projectDir || '').trim();
            const filePath = (payload?.filePath || '').trim();
            const kind = (payload?.kind || '').trim();
            if (!projectDir || !filePath) return;

            if ((kind === 'notebook' || filePath.toLowerCase().endsWith('.ipynb')) && window.app?.workspace?.openJupyterWorkspace) {
                await window.app.workspace.openJupyterWorkspace({
                    projectDir,
                    filePath,
                    sourceLabel: `深链 / ${filePath.split('/').pop()}`,
                    sourcePage: '',
                }, { force: true });
                showToast(`已打开代码实践：${filePath.split('/').pop()}`, 'success');
                return;
            }

            if (window.electronAPI?.openPath) {
                const normalizedProject = projectDir.replace(/[\\/]+$/, '');
                const normalizedFile = filePath.replace(/^[/\\]+/, '');
                await window.electronAPI.openPath(`${normalizedProject}/${normalizedFile}`);
                showToast(`已打开代码实践文件：${filePath.split('/').pop()}`, 'success');
            }
        } catch (error) {
            console.error('处理代码实践深链失败:', error);
            showToast(error?.message || '打开代码实践失败', 'error');
        }
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
    setVisibility,
    openNotebookFile
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
registerNamespace('resources', {
    initResourcesPage,
    refreshResources,
    openSubmitPage,
    syncTeacherModeUI,
    toggleTeacherMode,
    getChatContext,
    applyAgentCourseUpdate
});

function setDashboardQuickTab(tabName = 'project') {
    const normalized = tabName === 'classroom' ? 'classroom' : 'project';
    const tabs = document.querySelectorAll('[data-quick-tab]');
    const panes = document.querySelectorAll('.dashboard-quick-pane');
    tabs.forEach((tab) => {
        const isActive = tab.dataset.quickTab === normalized;
        tab.classList.toggle('is-active', isActive);
        tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });
    panes.forEach((pane) => {
        const paneTab = pane.id?.replace('dashboard-quick-pane-', '') || '';
        pane.classList.toggle('is-active', paneTab === normalized);
    });
}

function escapeHtml(value = '') {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function buildClassroomBaseUrl(classroom) {
    const direct = (classroom?.base_url || '').trim();
    if (direct) return direct.replace(/\/$/, '');
    const host = (classroom?.host || '').trim();
    const port = classroom?.port;
    if (!host || !port) return '';
    return `http://${host}:${port}`;
}

function isTeacherModeActive() {
    const label = document.body.classList.contains('student-mode');
    return !label;
}

function formatWorkspaceMeta(items = []) {
    const validItems = (items || []).filter(Boolean);
    return validItems.map((item) => `<span>${escapeHtml(item)}</span>`).join('');
}

function getSourcePageMeta(sourcePage = '') {
    if (sourcePage === 'resources') {
        return { label: '课程资源', tabId: 'resources', navId: 'nav-resources-item' };
    }
    if (sourcePage === 'main' || sourcePage === 'classroom') {
        return { label: '总控制台', tabId: 'main', navId: 'nav-main-item' };
    }
    return null;
}

function getBaseName(filePath = '') {
    const normalized = String(filePath || '').replace(/\\/g, '/');
    const parts = normalized.split('/').filter(Boolean);
    return parts.pop() || '';
}

function normalizeWorkspaceSourceLabel(payload = {}, fallback = '') {
    return String(payload?.sourceLabel || payload?.originLabel || fallback || '').trim();
}

function formatRecentOpenMeta(payload = {}, options = {}) {
    const items = [];
    const sourceLabel = normalizeWorkspaceSourceLabel(payload);
    if (sourceLabel) items.push(`导入自：${sourceLabel}`);
    if (options.kind === 'jupyter') {
        if (payload?.filePath) items.push(`文件：${getBaseName(payload.filePath)}`);
        if (payload?.projectDir) items.push(`目录：${payload.projectDir}`);
    } else if (options.kind === 'blockly') {
        if (payload?.workspacePath) items.push(`工作区：${getBaseName(payload.workspacePath)}`);
        if (payload?.practicePath) items.push(`代码练习：${getBaseName(payload.practicePath)}`);
        if (payload?.localPath) items.push(`目录：${payload.localPath}`);
    }
    return items;
}

async function openResourcesOrClassroomSource(sourcePage = '') {
    const sourceMeta = getSourcePageMeta(sourcePage);
    if (sourceMeta) {
        const navItem = document.getElementById(sourceMeta.navId);
        if (navItem?.style.display !== 'none') {
            showTab(sourceMeta.tabId, navItem);
            return true;
        }
    }
    const resourcesNavItem = document.getElementById('nav-resources-item');
    const mainNavItem = document.getElementById('nav-main-item');
    if (isTeacherModeActive() && resourcesNavItem?.style.display !== 'none') {
        showTab('resources', resourcesNavItem);
        return true;
    }
    if (mainNavItem) {
        showTab('main', mainNavItem);
        return true;
    }
    return false;
}

function buildBlocklyWorkspaceUrl(payload = {}) {
    const projectPath = String(payload?.localPath || '').trim();
    const workspacePath = String(payload?.workspacePath || '').trim().replace(/^\/+/, '');
    const apiBase = (window.xeduConfig?.apiBase || 'http://127.0.0.1:5123').replace(/\/$/, '');
    const revision = Number(payload?.revision || 0);
    const role = isTeacherModeActive() ? 'teacher' : 'student';
    if (!projectPath || !workspacePath) {
        const blankParams = new URLSearchParams();
        if (revision > 0) blankParams.set('_rev', String(revision));
        blankParams.set('role', role);
        return blankParams.toString()
            ? `${apiBase}/api/resources/blockly-playground-blank?${blankParams.toString()}`
            : `${apiBase}/api/resources/blockly-playground-blank`;
    }
    const params = new URLSearchParams();
    params.set('workspace', workspacePath);
    params.set('role', role);
    if (revision > 0) params.set('_rev', String(revision));
    const practicePath = String(payload?.practicePath || '').trim().replace(/^\/+/, '');
    if (practicePath) params.set('practice', practicePath);
    const rootToken = btoa(unescape(encodeURIComponent(projectPath))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
    return `${apiBase}/api/resources/blockly-playground/${rootToken}?${params.toString()}`;
}

async function openJupyterWorkspace(payload = {}, options = {}) {
    const normalizedPayload = {
        projectDir: String(payload?.projectDir || '').trim(),
        filePath: String(payload?.filePath || '').trim(),
        sourceLabel: normalizeWorkspaceSourceLabel(payload),
        sourcePage: String(payload?.sourcePage || '').trim(),
    };
    const mainNavItem = document.getElementById('nav-main-item');
    if (mainNavItem) {
        showTab('main', mainNavItem);
    }
    if (normalizedPayload.projectDir || normalizedPayload.filePath) {
        lastOpenedJupyterWorkspace = normalizedPayload;
    }
    renderWorkspacePages();
    if (!normalizedPayload.filePath) {
        return true;
    }
    const targetKey = `${normalizedPayload.projectDir}::${normalizedPayload.filePath}`;
    if (!options?.force && targetKey && targetKey === lastOpenedJupyterTarget) {
        return true;
    }
    await openNotebookFile(normalizedPayload.filePath, normalizedPayload.projectDir);
    lastOpenedJupyterTarget = targetKey;
    return true;
}

function openBlocklyWorkspace(payload = {}) {
    blocklyViewRevision += 1;
    const normalizedPayload = {
        localPath: String(payload?.localPath || '').trim(),
        workspacePath: String(payload?.workspacePath || '').trim(),
        practicePath: String(payload?.practicePath || '').trim(),
        sourceLabel: normalizeWorkspaceSourceLabel(payload),
        sourcePage: String(payload?.sourcePage || '').trim(),
        revision: blocklyViewRevision,
    };
    const blocklyNavItem = document.getElementById('nav-blockly-item');
    if (blocklyNavItem) {
        showTab('blockly-workspace', blocklyNavItem);
    }
    // 保留 revision，确保空白页也能每次强制刷新
    lastOpenedBlocklyWorkspace = normalizedPayload;
    renderWorkspacePages();
    return true;
}

registerNamespace('workspace', {
    openJupyterWorkspace,
    openBlocklyWorkspace,
});

function renderJupyterWorkspaceContext() {
    const titleEl = document.getElementById('jupyter-context-title');
    const descEl = document.getElementById('jupyter-context-desc');
    const metaEl = document.getElementById('jupyter-context-meta');
    const openBtn = document.getElementById('jupyter-open-context-btn');
    const goSourceBtn = document.getElementById('jupyter-go-resource-btn');
    if (!titleEl || !descEl || !metaEl || !openBtn || !goSourceBtn) return;
    const payload = lastOpenedJupyterWorkspace;
    const sourceMeta = getSourcePageMeta(payload?.sourcePage || '');
    if (payload?.filePath) {
        titleEl.textContent = getBaseName(payload.filePath) || '最近打开的实验文件';
        descEl.textContent = '这里已经准备好最近一次使用的代码文件，你可以直接继续实验。';
        metaEl.innerHTML = formatWorkspaceMeta(formatRecentOpenMeta(payload, { kind: 'jupyter' }));
        openBtn.textContent = '重新打开最近文件';
        goSourceBtn.textContent = sourceMeta ? '查看内容入口' : '导入实验内容';
        goSourceBtn.disabled = !sourceMeta;
    } else {
        titleEl.textContent = '即开 Jupyter Lab';
        descEl.textContent = '打开后就能开始 Notebook / Python 实验；实验内容可以稍后按需导入。';
        metaEl.innerHTML = formatWorkspaceMeta(['直接启动并实验', '支持：Notebook / Python']);
        openBtn.textContent = '立即开始实验';
        goSourceBtn.textContent = '导入实验内容';
        goSourceBtn.disabled = false;
    }
    openBtn.disabled = false;
}

function renderBlocklyWorkspaceContext() {
    const frame = document.getElementById('blockly-workspace-frame');
    const emptyEl = document.getElementById('blockly-workspace-empty');
    if (!frame || !emptyEl) return;
    const payload = lastOpenedBlocklyWorkspace;
    const workspaceName = payload?.workspacePath
        ? (getBaseName(payload.workspacePath) || 'Blockly 工作台')
        : '空白 Blockly 实验台';
    const blocklySectionActive = Boolean(document.getElementById('blockly-workspace')?.classList.contains('active'));
    if (blocklySectionActive) {
        const subtitleEl = document.getElementById('page-subtitle');
        if (subtitleEl) subtitleEl.textContent = workspaceName;
    }
    const frameUrl = buildBlocklyWorkspaceUrl(payload);
    if (frameUrl) {
        if (frame.getAttribute('src') !== frameUrl) {
            frame.setAttribute('src', frameUrl);
        }
        frame.style.display = 'block';
        emptyEl.style.display = 'none';
    } else {
        frame.removeAttribute('src');
        frame.style.display = 'none';
        emptyEl.style.display = 'flex';
    }
}

function renderWorkspacePages() {
    renderJupyterWorkspaceContext();
    renderBlocklyWorkspaceContext();
}

function updateSettingsVisibility(isTeacher) {
    const settingsNavItem = document.getElementById('nav-settings-item');
    const resourcesNavItem = document.getElementById('nav-resources-item');
    const mainNavItem = document.getElementById('nav-main-item');
    const blocklyNavItem = document.getElementById('nav-blockly-item');
    const aiNavItem = document.getElementById('nav-ai-item');
    const systemGroupTitle = document.getElementById('nav-group-system-title');
    const settingsPage = document.getElementById('settings');
    const teacherTabs = document.querySelectorAll('.settings-tab[data-teacher-only="true"]');
    const teacherContents = document.querySelectorAll('.settings-content[data-teacher-only="true"]');
    const aboutTab = document.querySelector('.settings-tab[data-tab="about"]');
    const aboutContent = document.querySelector('.settings-content[data-settings-tab="about"]');

    if (isTeacher) {
        document.body.classList.remove('student-mode');
        setDashboardQuickTab('project');
        if (mainNavItem) mainNavItem.style.display = 'flex';
        if (blocklyNavItem) blocklyNavItem.style.display = 'flex';
        if (aiNavItem) aiNavItem.style.display = 'flex';
        if (systemGroupTitle) {
            systemGroupTitle.style.display = '';
        }
        if (resourcesNavItem) {
            resourcesNavItem.style.display = 'flex';
        }
        if (settingsNavItem) {
            settingsNavItem.style.display = 'flex';
        }
        if (settingsPage) {
            settingsPage.style.display = '';
        }
        teacherTabs.forEach((btn) => {
            btn.style.display = 'inline-flex';
        });
        teacherContents.forEach((section) => {
            section.style.display = '';
        });
        // 若当前没有激活的设置 Tab，则默认激活 AI 配置
        const activeTab = document.querySelector('.settings-tab.active');
        if (!activeTab) {
            const aiTab = document.querySelector('.settings-tab[data-tab="ai"]');
            if (aiTab) {
                showSettingsTab('ai');
            }
        }
    } else {
        document.body.classList.add('student-mode');
        setDashboardQuickTab('classroom');
        if (mainNavItem) mainNavItem.style.display = 'flex';
        if (blocklyNavItem) blocklyNavItem.style.display = 'flex';
        if (aiNavItem) aiNavItem.style.display = 'flex';
        if (systemGroupTitle) {
            systemGroupTitle.style.display = 'none';
        }
        if (resourcesNavItem) {
            resourcesNavItem.style.display = 'none';
            resourcesNavItem.classList.remove('active');
        }
        if (settingsNavItem) {
            settingsNavItem.style.display = 'none';
            settingsNavItem.classList.remove('active');
        }
        if (settingsPage) {
            settingsPage.style.display = 'none';
        }
        if (settingsPage?.classList.contains('active')) {
            showTab('main', mainNavItem);
        }
        const resourcesPage = document.getElementById('resources');
        if (resourcesPage?.classList.contains('active')) {
            showTab('main', mainNavItem);
        }
        teacherTabs.forEach((btn) => {
            btn.style.display = 'none';
            btn.classList.remove('active');
        });
        teacherContents.forEach((section) => {
            section.style.display = 'none';
            section.classList.remove('active');
        });
        if (aboutTab) {
            aboutTab.style.display = 'inline-flex';
            aboutTab.classList.add('active');
        }
        if (aboutContent) {
            aboutContent.style.display = '';
            aboutContent.classList.add('active');
        }
    }
    window.dispatchEvent(new CustomEvent('xedu:teacher-mode-changed', {
        detail: { isTeacher }
    }));
}

function renderStudentClassroomList(classrooms = [], onEnter) {
    const listEl = document.getElementById('student-classroom-list');
    const emptyEl = document.getElementById('student-classroom-empty');
    if (!listEl || !emptyEl) return;

    listEl.innerHTML = '';
    if (!Array.isArray(classrooms) || classrooms.length === 0) {
        emptyEl.style.display = 'block';
        emptyEl.textContent = '当前未发现课堂';
        return;
    }

    emptyEl.style.display = 'none';
    classrooms.forEach((classroom) => {
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'dashboard-classroom-card';
        const count = Number(classroom?.course_count || 0);
        const activeTitle = (classroom?.active_course_title || '').trim();
        const meta = [];
        meta.push('<span>直接进入</span>');
        if (count > 0) meta.push(`<span>${count} 门课程</span>`);
        if (activeTitle) meta.push(`<span>${escapeHtml(activeTitle)}</span>`);

        card.innerHTML = `
            <div class="dashboard-classroom-card-head">
                <div class="dashboard-classroom-card-title">${escapeHtml(classroom?.name || '课堂')}</div>
                <span class="dashboard-classroom-card-badge">可进入</span>
            </div>
            <div class="dashboard-classroom-card-meta">${meta.join('')}</div>
            <div class="dashboard-classroom-card-action">
                <span class="btn btn-primary btn-sm">进入课堂</span>
            </div>
        `;
        card.addEventListener('click', () => onEnter?.(classroom, card));
        listEl.appendChild(card);
    });
}

function applySystemConfigToInputs(response) {
    if (!response?.success) return;
    const uiConfig = response.config?.ui || {};
    const aiConfig = response.config?.ai || {};
    const quickformConfig = uiConfig.quickform || {};

    const resourcesBaseUrl = document.getElementById('resources-base-url');
    const resourcesRepo = document.getElementById('resources-repo');
    const resourcesBranch = document.getElementById('resources-branch');
    const resourcesIndexPath = document.getElementById('resources-index-path');
    const resourcesSubmitUrl = document.getElementById('resources-submit-url');
    const resourcesPublishPath = document.getElementById('resources-publish-path');
    const resourcesPublishToken = document.getElementById('resources-publish-token');
    const classroomName = document.getElementById('classroom-name');
    const classroomTeacherCode = document.getElementById('classroom-teacher-code');
    const classroomAutoDiscover = document.getElementById('classroom-auto-discover');
    const usePipMirror = document.getElementById('use-tsinghua-mirror');
    const aiBaseUrl = document.getElementById('ai-base-url');
    const aiModelInput = document.getElementById('ai-model-input');
    const quickformEnabled = document.getElementById('quickform-enabled');
    const quickformBaseUrl = document.getElementById('quickform-base-url');
    const quickformUsername = document.getElementById('quickform-username');
    const quickformPassword = document.getElementById('quickform-password');

    if (resourcesBaseUrl) resourcesBaseUrl.value = uiConfig.resources_base_url || '';
    if (resourcesRepo) resourcesRepo.value = uiConfig.resources_repo || '';
    if (resourcesBranch) resourcesBranch.value = uiConfig.resources_branch || 'main';
    if (resourcesIndexPath) resourcesIndexPath.value = uiConfig.resources_index_path || 'index.json';
    if (resourcesSubmitUrl) resourcesSubmitUrl.value = uiConfig.resources_submit_url || '';
    if (resourcesPublishPath) resourcesPublishPath.value = uiConfig.resources_publish_path || 'courses';
    if (resourcesPublishToken) resourcesPublishToken.value = uiConfig.resources_publish_token || '';

    if (classroomName) classroomName.value = uiConfig.classroom_name || '';
    if (classroomTeacherCode) classroomTeacherCode.value = uiConfig.classroom_teacher_code || '';
    if (classroomAutoDiscover) {
        classroomAutoDiscover.value = (uiConfig.classroom_auto_discover === false || uiConfig.classroom_auto_discover === 'false') ? 'false' : 'true';
    }
    if (usePipMirror) {
        usePipMirror.checked = uiConfig.pip_use_mirror !== false && uiConfig.pip_use_mirror !== 'false';
    }
    if (aiBaseUrl) aiBaseUrl.value = aiConfig.base_url || '';
    if (aiModelInput) aiModelInput.value = aiConfig.model || '';
    if (quickformEnabled) quickformEnabled.checked = quickformConfig.enabled === true || quickformConfig.enabled === 'true';
    if (quickformBaseUrl) quickformBaseUrl.value = quickformConfig.base_url || 'https://quickform.cn';
    if (quickformUsername) quickformUsername.value = quickformConfig.username || '';
    if (quickformPassword) quickformPassword.value = quickformConfig.password || '';
    if (window.app?.ai?.syncModelBadge) {
        window.app.ai.syncModelBadge();
    }
}

async function loadSystemConfigToInputs() {
    const response = await apiClient.loadConfig();
    applySystemConfigToInputs(response);
}

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
    const classroomNameInput = document.getElementById('classroom-name')?.value.trim() || '';
    const classroomTeacherCodeInput = document.getElementById('classroom-teacher-code')?.value.trim() || '';
    const classroomAutoDiscoverInput = document.getElementById('classroom-auto-discover')?.value || 'true';
    const usePipMirrorInput = document.getElementById('use-tsinghua-mirror')?.checked ?? true;
    const quickformEnabledInput = document.getElementById('quickform-enabled')?.checked ?? false;
    const quickformBaseUrlInput = document.getElementById('quickform-base-url')?.value.trim() || 'https://quickform.cn';
    const quickformUsernameInput = document.getElementById('quickform-username')?.value.trim() || '';
    const quickformPasswordInput = document.getElementById('quickform-password')?.value || '';

    const hasResourcesInput = !!(resourcesBaseUrlInput || resourcesRepoInput || resourcesBranchInput || resourcesIndexPathInput || resourcesSubmitUrlInput || resourcesPublishPathInput || resourcesPublishTokenInput);
    const hasClassroomInput = !!(classroomNameInput || classroomTeacherCodeInput || classroomAutoDiscoverInput);
    const hasAiInput = !!(apiKey || aiBaseUrlInput || aiModelInput);
    const hasQuickFormInput = !!(quickformEnabledInput || quickformBaseUrlInput || quickformUsernameInput || quickformPasswordInput);
    const hasPackageSettingsInput = true;

    if (!hasAiInput && !pythonPath && !hasResourcesInput && !hasClassroomInput && !hasQuickFormInput && !hasPackageSettingsInput) {
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

        // 保存课程资源库默认配置（多课程源在“课程资源 -> 云端拉取”中维护）
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
            resources_publish_token: resourcesPublishToken,
            classroom_name: classroomNameInput,
            classroom_teacher_code: classroomTeacherCodeInput,
            classroom_auto_discover: classroomAutoDiscoverInput !== 'false',
            pip_use_mirror: usePipMirrorInput,
            quickform: {
                enabled: quickformEnabledInput,
                base_url: quickformBaseUrlInput || 'https://quickform.cn',
                username: quickformUsernameInput,
                password: quickformPasswordInput,
            }
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

function collectQuickFormConfigFromInputs() {
    return {
        enabled: document.getElementById('quickform-enabled')?.checked ?? false,
        base_url: document.getElementById('quickform-base-url')?.value.trim() || 'https://quickform.cn',
        username: document.getElementById('quickform-username')?.value.trim() || '',
        password: document.getElementById('quickform-password')?.value || '',
    };
}

async function testQuickFormConfig() {
    try {
        const response = await apiClient.testQuickForm(collectQuickFormConfigFromInputs());
        if (response?.success) {
            const count = Number(response.count || 0);
            showToast(`QuickForm 已连接，当前 ${count} 个任务`, 'success');
            log(`QuickForm 连接成功（${count} 个任务）`, 'success');
            return;
        }
        throw new Error(response?.message || 'QuickForm 测试失败');
    } catch (error) {
        console.error('QuickForm 测试失败:', error);
        showToast(`QuickForm 测试失败: ${error.message}`, 'error');
        log(`QuickForm 测试失败: ${error.message}`, 'error');
    }
}

async function resetSystemConfig() {
    try {
        await loadSystemConfigToInputs();
        const savedPythonPath = localStorage.getItem('python_path');
        const pythonInput = document.getElementById('python-path-input');
        if (pythonInput) {
            pythonInput.value = savedPythonPath || '';
        }
        showToast('已恢复未保存的设置修改', 'success');
    } catch (error) {
        console.error('恢复设置失败:', error);
        showToast('恢复失败: ' + error.message, 'error');
    }
}

registerNamespace('system', {
    saveSystemConfig,
    testQuickFormConfig,
    resetSystemConfig,
    installPackage,
    uninstallPackage,
    updatePackage,
    showSettingsTab,
    updateSettingsVisibility
});


async function ensureTeacherCodeInitialized() {
    let initialConfig = null;
    try {
        initialConfig = await apiClient.loadConfig();
        if (!initialConfig?.success) return initialConfig;
        const uiConfig = initialConfig.config?.ui || {};
        const existing = (uiConfig.classroom_teacher_code || '').trim();
        if (existing) {
            return initialConfig;
        }
    } catch (error) {
        console.warn('读取教师口令配置失败，跳过初始化向导:', error);
        return initialConfig;
    }

    const modal = document.getElementById('teacher-init-modal');
    const errorEl = document.getElementById('teacher-init-error');
    const input1 = document.getElementById('teacher-init-code');
    const input2 = document.getElementById('teacher-init-code-confirm');
    const confirmBtn = document.getElementById('teacher-init-confirm');

    if (!modal || !errorEl || !input1 || !input2 || !confirmBtn) {
        return initialConfig;
    }

    showModal('teacher-init-modal');
    errorEl.textContent = '';
    errorEl.style.display = 'none';
    input1.value = '';
    input2.value = '';
    input1.focus();

    return new Promise((resolve) => {
        const cleanup = () => {
            confirmBtn.onclick = null;
            input1.onkeydown = null;
            input2.onkeydown = null;
        };
        const finish = (configResponse = null) => {
            hideModal('teacher-init-modal');
            cleanup();
            resolve(configResponse || initialConfig);
        };
        const validateAndSave = async () => {
        const code1 = (input1.value || '').trim();
        const code2 = (input2.value || '').trim();
        if (!code1 || !code2) {
            errorEl.textContent = '教师口令不能为空';
            errorEl.style.display = 'block';
            return;
        }
        if (code1.length < 4) {
            errorEl.textContent = '教师口令至少 4 位字符';
            errorEl.style.display = 'block';
            return;
        }
        if (code1 !== code2) {
            errorEl.textContent = '两次输入的教师口令不一致';
            errorEl.style.display = 'block';
            return;
        }
        confirmBtn.disabled = true;
        try {
            await apiClient.saveConfig({ ui: { classroom_teacher_code: code1 } });
            const updatedConfig = await apiClient.loadConfig();
            const classroomTeacherCode = document.getElementById('classroom-teacher-code');
            if (classroomTeacherCode) {
                classroomTeacherCode.value = code1;
            }
            finish(updatedConfig);
        } catch (error) {
            errorEl.textContent = '保存失败: ' + (error.message || '未知错误');
            errorEl.style.display = 'block';
            confirmBtn.disabled = false;
        }
        };
        confirmBtn.onclick = (event) => {
            event.preventDefault();
            validateAndSave().catch((err) => {
                console.warn('保存教师口令失败:', err);
                confirmBtn.disabled = false;
            });
        };
        const handleEnter = (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                confirmBtn.click();
            }
        };
        input1.onkeydown = handleEnter;
        input2.onkeydown = handleEnter;
    });
}

// 初始化
window.addEventListener('DOMContentLoaded', () => {
    const hideStartupLoading = () => {
        const overlay = document.getElementById('startup-loading');
        if (overlay) {
            overlay.classList.add('fade-out');
            setTimeout(() => overlay.remove(), 300);
        }
    };

    const startup = async () => {
        // 加载 Python 路径
        const savedPythonPath = localStorage.getItem('python_path');
        if (savedPythonPath) {
            const pythonInput = document.getElementById('python-path-input');
            if (pythonInput) pythonInput.value = savedPythonPath;
        }

        // 初始化模态框事件监听器（点击外部关闭和ESC键关闭）
        initModalListeners();
    initSidebarCollapseToggle();
    registerPracticeDeepLinkHandler();
        updateSettingsVisibility(false);
        showSettingsTab('about');

        try {
            const configResponse = await apiClient.loadConfig();
            applySystemConfigToInputs(configResponse);
            const updated = await ensureTeacherCodeInitialized();
            if (updated?.success) {
                applySystemConfigToInputs(updated);
            }
        } catch (error) {
            console.warn('加载系统配置失败:', error);
        }

        try {
            await syncTeacherModeUI();
        } catch (error) {
            console.warn('同步教师模式状态失败:', error);
        }

        const topbarTeacherBtn = document.getElementById('topbar-teacher-mode-btn');
        if (topbarTeacherBtn) {
            topbarTeacherBtn.addEventListener('click', async () => {
                try {
                    await toggleTeacherMode();
                } catch (error) {
                    console.warn('切换教师模式失败:', error);
                }
            });
        }

        const studentClassroomRefreshBtn = document.getElementById('student-classroom-refresh-btn');
        const quickProjectTab = document.getElementById('dashboard-quick-tab-project');
        const quickClassroomTab = document.getElementById('dashboard-quick-tab-classroom');
        const dashboardLaunchJupyterBtn = document.getElementById('dashboard-launch-jupyter-btn');
        const dashboardLaunchBlocklyBtn = document.getElementById('dashboard-launch-blockly-btn');
        const dashboardOpenBlocklyBlankBtn = document.getElementById('dashboard-open-blockly-blank-btn');
        const dashboardOpenSourceBtn = document.getElementById('dashboard-open-source-btn');
        const dashboardGoClassroomBtn = document.getElementById('dashboard-go-classroom-btn');
        const dashboardGoResourcesBtn = document.getElementById('dashboard-go-resources-btn');
        const mainNavItem = document.getElementById('nav-main-item');
        const blocklyNavItem = document.getElementById('nav-blockly-item');
        const jupyterOpenBtn = document.getElementById('jupyter-open-context-btn');
        const jupyterSourceBtn = document.getElementById('jupyter-go-resource-btn');
        let classroomRefreshRunning = false;

        const refreshStudentClassrooms = async () => {
            const emptyEl = document.getElementById('student-classroom-empty');
            if (classroomRefreshRunning) return;
            classroomRefreshRunning = true;
            try {
                if (emptyEl) {
                    emptyEl.style.display = 'block';
                    emptyEl.textContent = '正在查找课堂...';
                }
                const response = await apiClient.get('/api/classroom/discover?timeout=1.2');
                const classrooms = Array.isArray(response?.classrooms) ? response.classrooms : [];
                renderStudentClassroomList(classrooms, handleClassroomEnter);
            } catch (error) {
                const listEl = document.getElementById('student-classroom-list');
                if (listEl) listEl.innerHTML = '';
                if (emptyEl) {
                    emptyEl.style.display = 'block';
                    emptyEl.textContent = '查找课堂失败';
                }
            } finally {
                classroomRefreshRunning = false;
            }
        };

        const handleClassroomEnter = async (classroom, cardEl = null) => {
            const classroomSource = {
                ...classroom,
                base_url: buildClassroomBaseUrl(classroom),
            };

            if (cardEl) {
                cardEl.classList.add('is-entering');
            }
            try {
                const result = await connectStudentClassroomByCode('', {
                    source: classroomSource,
                    showResourcesView: false,
                    prepareConsoleLaunch: true,
                });

                if (!result?.success) {
                    showToast(result?.message || '连接课堂失败', 'error');
                    return;
                }

                const launch = result?.launch || {};
                const projectPath = (launch.project_path || '').trim();
                const notebookPath = (launch.notebook_path || '').trim();
                setDashboardQuickTab('project');

                if (notebookPath && window.app?.workspace?.openJupyterWorkspace) {
                    await window.app.workspace.openJupyterWorkspace({
                        projectDir: projectPath,
                        filePath: notebookPath,
                        sourceLabel: `${classroomSource.name || '课堂'} / ${notebookPath.split('/').pop()}`,
                        sourcePage: 'main',
                    }, { force: true });
                    showToast('已进入课堂实验', 'success');
                } else if (projectPath && window.app?.workspace?.openJupyterWorkspace) {
                    await window.app.workspace.openJupyterWorkspace({
                        projectDir: projectPath,
                        sourceLabel: `${classroomSource.name || '课堂'} / 课堂目录`,
                        sourcePage: 'main',
                    });
                    if (window.app?.jupyter?.startJupyter) {
                        await window.app.jupyter.startJupyter();
                    }
                    showToast('已进入课堂目录', 'success');
                } else {
                    showToast('已连接课堂', 'success');
                }

                if (result?.warning) {
                    showToast(result.warning, 'warning');
                }
            } catch (error) {
                showToast('连接课堂失败: ' + (error?.message || '未知错误'), 'error');
            } finally {
                if (cardEl) {
                    cardEl.classList.remove('is-entering');
                }
            }
        };

        if (quickProjectTab) {
            quickProjectTab.addEventListener('click', () => setDashboardQuickTab('project'));
        }
        if (quickClassroomTab) {
            quickClassroomTab.addEventListener('click', () => {
                setDashboardQuickTab('classroom');
                refreshStudentClassrooms().catch((error) => {
                    console.warn('刷新课堂列表失败:', error);
                });
            });
        }
        if (studentClassroomRefreshBtn) {
            studentClassroomRefreshBtn.addEventListener('click', () => {
                refreshStudentClassrooms().catch((error) => {
                    console.warn('刷新课堂列表失败:', error);
                });
            });
        }
        if (dashboardLaunchJupyterBtn) {
            dashboardLaunchJupyterBtn.addEventListener('click', () => {
                if (mainNavItem) showTab('main', mainNavItem);
                startJupyter().catch((error) => {
                    console.warn('启动 Jupyter Lab 失败:', error);
                });
            });
        }
        if (dashboardLaunchBlocklyBtn) {
            dashboardLaunchBlocklyBtn.addEventListener('click', () => {
                openBlocklyWorkspace({});
            });
        }
        if (dashboardOpenBlocklyBlankBtn) {
            dashboardOpenBlocklyBlankBtn.addEventListener('click', () => {
                openBlocklyWorkspace({});
            });
        }
        if (dashboardOpenSourceBtn) {
            dashboardOpenSourceBtn.addEventListener('click', () => {
                openResourcesOrClassroomSource(isTeacherModeActive() ? 'resources' : 'classroom').catch((error) => {
                    console.warn('打开来源页失败:', error);
                });
            });
        }
        if (dashboardGoClassroomBtn) {
            dashboardGoClassroomBtn.addEventListener('click', () => {
                if (mainNavItem) showTab('main', mainNavItem);
                refreshStudentClassrooms().catch((error) => {
                    console.warn('刷新课堂列表失败:', error);
                });
            });
        }
        if (dashboardGoResourcesBtn) {
            dashboardGoResourcesBtn.addEventListener('click', () => {
                openResourcesOrClassroomSource('resources').catch((error) => {
                    console.warn('打开课程资源失败:', error);
                });
            });
        }
        if (jupyterOpenBtn) {
            jupyterOpenBtn.addEventListener('click', () => {
                if (lastOpenedJupyterWorkspace?.filePath) {
                    openJupyterWorkspace(lastOpenedJupyterWorkspace, { force: true }).catch((error) => {
                        console.warn('重新打开最近代码文件失败:', error);
                    });
                    return;
                }
                startJupyter().catch((error) => {
                    console.warn('启动 Jupyter Lab 失败:', error);
                });
            });
        }
        if (jupyterSourceBtn) {
            jupyterSourceBtn.addEventListener('click', () => {
                openResourcesOrClassroomSource(lastOpenedJupyterWorkspace?.sourcePage || '').catch((error) => {
                    console.warn('打开来源页失败:', error);
                });
            });
        }
        window.addEventListener('xedu:tab-changed', (event) => {
            renderWorkspacePages();
        });
        renderWorkspacePages();

        // API Key 出于安全考虑通常不回显，或者需要从后端获取
        log('系统初始化完成', 'success');

        // 初始状态检查
        await refreshStatus();
        await refreshStudentClassrooms();
        setInterval(() => {
            const classroomPane = document.getElementById('dashboard-quick-pane-classroom');
            if (!classroomPane || !classroomPane.classList.contains('is-active')) return;
            refreshStudentClassrooms().catch(() => {});
        }, 8000);
        hideStartupLoading();
    };

    startup().catch((error) => {
        console.error('启动失败:', error);
        hideStartupLoading();
    });

    // 兜底：10 秒后也强制隐藏加载遮罩，防止异常阻塞
    setTimeout(hideStartupLoading, 10000);

    // 启动定时状态检查
    setInterval(refreshStatus, 5000);

    // 监听 Electron 主进程日志
    if (window.electronAPI && window.electronAPI.onLogUpdate) {
        window.electronAPI.onLogUpdate((message) => {
            log(message, 'info');
        });
    }
});
