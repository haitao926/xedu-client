import { log, showTab, showModal, hideModal, initModalListeners, showToast } from './ui.js';
import { startJupyter, stopJupyter, restartJupyter, openBrowser, browseFolder, confirmProjectPath, clearProjectPath, refreshStatus, testPythonEnvironment, refreshView, openExternal, toggleFullscreen, setVisibility, openNotebookFile, getStoredProjectDir } from './jupyter.js';
import { askAI, clearCurrentChat, startNewChat, removeImage, saveAIConfig, testAIConfig, selectChat, previewImage, handleKeyDown, syncModelBadge } from './ai.js';
import { installPackage, uninstallPackage, updatePackage } from './package-manager.js';
import { registerNamespace } from './app-context.js';
import { ProjectWizard } from './project-wizard.js';
import { createWorkspaceController } from './main/workspace-context.js';
import { createDashboardController } from './main/dashboard.js';
import { applySystemConfigToInputs, saveSystemConfig, resetSystemConfig, selectPythonEnvironment, repairXeduEnvironment, ensureTeacherCodeInitialized } from './main/system-config.js';
import { getExperienceMode, getPageCopy } from './experience-config.js';
import { installUnhandledRejectionHandler } from './main/error-boundary.js';
import { isTeacherModeUnlocked, readTeacherModeState } from './main/teacher-mode-state.js';
import { createBackendStartupSupport } from './main/backend-startup-support.js';
import { initSidebarCollapseToggle, showSettingsTab } from './main/shell-ui.js';
import apiClient from './api.js';
import './action-dispatcher.js';

let resourcesModule = null;
let resourcesModulePromise = null;

installUnhandledRejectionHandler({
    notify: (...args) => {
        if (document.body) showToast(...args);
    },
});

function loadResourcesModule() {
    if (!resourcesModulePromise) {
        resourcesModulePromise = import('./resources.js')
            .then((mod) => {
                resourcesModule = mod;
                return mod;
            })
            .catch((error) => {
                resourcesModulePromise = null;
                throw error;
            });
    }
    return resourcesModulePromise;
}

async function initResourcesPage(...args) {
    const mod = await loadResourcesModule();
    return mod.initResourcesPage(...args);
}

async function refreshResources(...args) {
    const mod = await loadResourcesModule();
    return mod.refreshResources(...args);
}

async function openResourcesLibrary(...args) {
    const mod = await loadResourcesModule();
    return mod.openResourcesLibrary(...args);
}

async function syncTeacherModeUI(...args) {
    const mod = await loadResourcesModule();
    return mod.syncTeacherModeUI(...args);
}

async function toggleTeacherMode(...args) {
    const mod = await loadResourcesModule();
    return mod.toggleTeacherMode(...args);
}

async function connectStudentClassroomByCode(...args) {
    const mod = await loadResourcesModule();
    return mod.connectStudentClassroomByCode(...args);
}

async function openStudentLessonTab(...args) {
    const mod = await loadResourcesModule();
    return mod.openStudentLessonTab(...args);
}

function getChatContext() {
    const teacherState = readTeacherModeState();
    const isTeacher = teacherState.unlocked;
    if (resourcesModule?.getChatContext) {
        return resourcesModule.getChatContext();
    }
    return {
        experience_mode: getExperienceMode(isTeacher),
        teacher_mode: {
            unlocked: isTeacher,
            code: teacherState.code,
        },
        course: null,
        experiment_context: null,
    };
}

// Initialize the Project Wizard globally
const {
    bindActions: bindBackendStartupSupportActions,
    getState: getBackendStartupState,
    onState: onBackendStartupState,
    render: renderBackendStartupSupport,
} = createBackendStartupSupport({
    showToast,
    apiClient,
    applySystemConfigToInputs,
    refreshStatus,
});

new ProjectWizard(apiClient);
const workspaceController = createWorkspaceController({ showTab, openNotebookFile });
const {
    openResourcesOrClassroomSource,
    openJupyterWorkspace,
    openScratchWorkspace,
    renderWorkspacePages,
    getLastOpenedJupyterWorkspace,
    isTeacherModeActive,
} = workspaceController;
const dashboardController = createDashboardController({ showTab, showSettingsTab });
const {
    setDashboardQuickTab,
    buildClassroomBaseUrl,
    updateSettingsVisibility,
} = dashboardController;

let dashboardInputMode = 'project';
let dashboardProjectPathCache = '';
let dashboardClassroomCodeCache = '';

function renderDashboardSupportState(isTeacher) {
    const hintEl = document.getElementById('dashboard-input-hint');
    if (!hintEl) return;
    if (isTeacher) {
        hintEl.textContent = '教师模式下请从课程资源页开启课堂。';
        hintEl.style.display = 'block';
        return;
    }
    hintEl.textContent = '';
    hintEl.style.display = 'none';
}

function syncDashboardInputCache(inputValue) {
    const value = String(inputValue || '').trim();
    if (dashboardInputMode === 'classroom') {
        dashboardClassroomCodeCache = value;
        try {
            if (value) {
                sessionStorage.setItem('xedu-last-classroom-code', value);
            } else {
                sessionStorage.removeItem('xedu-last-classroom-code');
            }
        } catch (_) {
            // ignore
        }
    } else {
        dashboardProjectPathCache = value;
    }
}

function clearDashboardInput() {
    const inputEl = document.getElementById('project-path');
    if (dashboardInputMode === 'classroom') {
        dashboardClassroomCodeCache = '';
        try {
            sessionStorage.removeItem('xedu-last-classroom-code');
        } catch (_) {
            // ignore
        }
    } else {
        dashboardProjectPathCache = '';
        clearProjectPath();
    }
    if (inputEl) {
        inputEl.value = '';
    }
}

function setDashboardInputMode(mode, { restoreValue = true } = {}) {
    dashboardInputMode = mode === 'classroom' ? 'classroom' : 'project';
    setDashboardQuickTab(dashboardInputMode);

    const titleEl = document.getElementById('dashboard-input-title');
    const iconEl = document.getElementById('dashboard-input-icon');
    const inputEl = document.getElementById('project-path');
    const browseBtn = document.getElementById('project-path-browse-btn');
    const confirmBtn = document.getElementById('dashboard-input-confirm-btn');

    if (titleEl) {
        titleEl.textContent = dashboardInputMode === 'classroom' ? '课堂码' : '项目路径';
    }
    if (inputEl) {
        inputEl.placeholder = dashboardInputMode === 'classroom'
            ? '输入课堂码（留空自动发现）'
            : '选择工作目录...';
        if (restoreValue) {
            inputEl.value = dashboardInputMode === 'classroom'
                ? dashboardClassroomCodeCache
                : (dashboardProjectPathCache || getStoredProjectDir() || '');
        }
    }
    if (browseBtn) {
        browseBtn.style.display = dashboardInputMode === 'classroom' ? 'none' : 'inline-flex';
    }
    if (confirmBtn) {
        confirmBtn.textContent = dashboardInputMode === 'classroom' ? '进入课堂' : '确认路径';
    }
    if (iconEl) {
        iconEl.innerHTML = dashboardInputMode === 'classroom'
            ? '<rect x="4" y="5" width="16" height="14" rx="2"></rect><path d="M8 3v4"></path><path d="M16 3v4"></path><path d="M4 10h16"></path>'
            : '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"></path>';
    }
    renderDashboardSupportState(isTeacherModeActive());
}

function syncActivePageTitle() {
    const activeSection = document.querySelector('.page-section.active');
    const tabId = activeSection?.id || 'main';
    const activeStudentNav = document.querySelector('.student-nav-item.active');
    if (tabId === 'scratch-workspace') {
        const titleEl = document.getElementById('page-title');
        const subtitleEl = document.getElementById('page-subtitle');
        const isStudentVisual = activeStudentNav?.id === 'nav-student-visual-item';
        if (titleEl) titleEl.textContent = isStudentVisual ? '图形编程' : 'Scratch 编程';
        if (subtitleEl && !subtitleEl.textContent) {
            subtitleEl.textContent = isStudentVisual ? 'Scratch 图形编程' : 'XEdu Client 内置官方 Scratch 编辑器与 XEdu AI 扩展';
        }
        return;
    }
    if (document.body.classList.contains('student-mode') && activeStudentNav) {
        const studentTitleMap = {
            'nav-student-lesson-item': '课程任务中心',
            'nav-student-experience-item': '互动体验',
            'nav-student-visual-item': '图形编程',
            'nav-student-python-item': 'Python实验',
        };
        const titleEl = document.getElementById('page-title');
        const subtitleEl = document.getElementById('page-subtitle');
        const title = studentTitleMap[activeStudentNav.id];
        if (titleEl && title) titleEl.textContent = title;
        if (subtitleEl && tabId === 'main') {
            const lastOpened = getLastOpenedJupyterWorkspace();
            subtitleEl.textContent = lastOpened?.sourceLabel || 'Jupyter Lab 编程环境';
        }
        return;
    }
    const titleConfig = getPageCopy(tabId);
    const titleEl = document.getElementById('page-title');
    const subtitleEl = document.getElementById('page-subtitle');
    if (titleEl && titleConfig?.title) titleEl.textContent = titleConfig.title;
    if (subtitleEl && titleConfig?.subtitle) subtitleEl.textContent = titleConfig.subtitle;
}

function applyExperienceCopy(isTeacher) {
    setDashboardInputMode(isTeacher ? 'project' : 'classroom');
    syncActivePageTitle();
    renderDashboardSupportState(isTeacher);
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
    openNotebookFile,
    getStoredProjectDir
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
    openResourcesLibrary,
    syncTeacherModeUI,
    toggleTeacherMode,
    connectStudentClassroomByCode,
    openStudentLessonTab,
    getChatContext
});

registerNamespace('workspace', {
    openJupyterWorkspace,
    openScratchWorkspace,
});

registerNamespace('system', {
    saveSystemConfig,
    resetSystemConfig,
    selectPythonEnvironment,
    repairXeduEnvironment,
    installPackage,
    uninstallPackage,
    updatePackage,
    showSettingsTab,
    updateSettingsVisibility
});

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
        bindBackendStartupSupportActions();
        renderBackendStartupSupport();
        if (window.electronAPI?.onBackendStartupState) {
            window.electronAPI.onBackendStartupState((state) => {
                onBackendStartupState(state);
            });
        }
        try {
            const initialBackendState = await getBackendStartupState();
            renderBackendStartupSupport(initialBackendState);
        } catch (error) {
            console.warn('获取后端启动状态失败:', error);
        }
        const teacherUnlocked = isTeacherModeUnlocked();
        updateSettingsVisibility(teacherUnlocked);
        showSettingsTab('about');

        try {
            const configResponse = await apiClient.loadConfig();
            applySystemConfigToInputs(configResponse);
            const updated = await ensureTeacherCodeInitialized({ prompt: false });
            if (updated?.success) {
                applySystemConfigToInputs(updated);
            }
        } catch (error) {
            console.warn('加载系统配置失败:', error);
        }

        const dashboardInputConfirmBtn = document.getElementById('dashboard-input-confirm-btn');
        const dashboardInputClearBtn = document.getElementById('project-path-clear-btn');
        const projectPathInput = document.getElementById('project-path');
        const dashboardHeroPrimaryBtn = document.getElementById('dashboard-hero-primary-btn');
        const dashboardHeroTertiaryBtn = document.getElementById('dashboard-hero-tertiary-btn');
        const dashboardLaunchJupyterBtn = document.getElementById('dashboard-launch-jupyter-btn');
        const dashboardOpenSourceBtn = document.getElementById('dashboard-open-source-btn');
        const mainNavItem = document.getElementById('nav-main-item');
        const jupyterOpenBtn = document.getElementById('jupyter-open-context-btn');
        const jupyterSourceBtn = document.getElementById('jupyter-go-resource-btn');
        dashboardProjectPathCache = getStoredProjectDir() || '';
        try {
            dashboardClassroomCodeCache = sessionStorage.getItem('xedu-last-classroom-code') || '';
        } catch (_) {
            dashboardClassroomCodeCache = '';
        }

        document.querySelectorAll('[data-quick-tab]').forEach((button) => {
            button.addEventListener('click', () => {
                syncDashboardInputCache(projectPathInput?.value || '');
                setDashboardInputMode(button.dataset.quickTab || 'project');
            });
        });

        const openClassroomLaunch = async (result, fallbackLabel = '课堂') => {
            if (!result?.success) {
                showToast(result?.message || '进入课堂失败', 'error');
                return false;
            }
            const launch = result?.launch || {};
            const projectPath = (launch.project_path || '').trim();
            const notebookPath = (launch.notebook_path || '').trim();
            if (projectPath) {
                dashboardProjectPathCache = projectPath;
                if (projectPathInput) {
                    projectPathInput.value = projectPath;
                }
            }
            setDashboardInputMode('project', { restoreValue: false });
            if (notebookPath && window.app?.workspace?.openJupyterWorkspace) {
                await window.app.workspace.openJupyterWorkspace({
                    projectDir: projectPath,
                    filePath: notebookPath,
                    sourceLabel: `${launch.course_title || fallbackLabel} / ${notebookPath.split('/').pop()}`,
                    sourcePage: 'main',
                }, { force: true });
            } else if (projectPath && window.app?.workspace?.openJupyterWorkspace) {
                await window.app.workspace.openJupyterWorkspace({
                    projectDir: projectPath,
                    sourceLabel: `${launch.course_title || fallbackLabel} / 课堂目录`,
                    sourcePage: 'main',
                });
            }
            showToast('已进入课堂实验', 'success');
            if (result?.warning) {
                showToast(result.warning, 'warning');
            }
            return true;
        };

        const submitDashboardInput = async () => {
            const currentValue = (projectPathInput?.value || '').trim();
            syncDashboardInputCache(currentValue);
            if (dashboardInputMode !== 'classroom') {
                await confirmProjectPath();
                return;
            }
            const result = await connectStudentClassroomByCode(currentValue, {
                showResourcesView: false,
                prepareConsoleLaunch: true,
            });
            await openClassroomLaunch(result, currentValue || '课堂');
        };

        if (dashboardHeroPrimaryBtn) {
            dashboardHeroPrimaryBtn.addEventListener('click', () => {
                if (isTeacherModeActive()) {
                    openResourcesOrClassroomSource('resources').catch((error) => {
                        console.warn('打开课程资源失败:', error);
                    });
                    return;
                }
                setDashboardInputMode('classroom');
                submitDashboardInput().catch((error) => {
                    console.warn('进入课堂失败:', error);
                });
            });
        }
        if (dashboardHeroTertiaryBtn) {
            dashboardHeroTertiaryBtn.addEventListener('click', () => {
                if (isTeacherModeActive()) {
                    startJupyter().catch((error) => {
                        console.warn('启动 Jupyter Lab 失败:', error);
                    });
                    return;
                }
                const lastOpened = getLastOpenedJupyterWorkspace();
                if (lastOpened) {
                    openJupyterWorkspace(lastOpened, { force: true }).catch((error) => {
                        console.warn('重新打开最近代码文件失败:', error);
                    });
                    return;
                }
                startJupyter().catch((error) => {
                    console.warn('启动 Jupyter Lab 失败:', error);
                });
            });
        }
        if (projectPathInput) {
            projectPathInput.addEventListener('input', () => {
                syncDashboardInputCache(projectPathInput.value);
            });
            projectPathInput.addEventListener('keydown', async (event) => {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    try {
                        await submitDashboardInput();
                    } catch (error) {
                        console.warn('提交首页输入失败:', error);
                    }
                }
            });
        }
        if (dashboardInputConfirmBtn) {
            dashboardInputConfirmBtn.addEventListener('click', async () => {
                try {
                    await submitDashboardInput();
                } catch (error) {
                    console.warn('提交首页输入失败:', error);
                }
            });
        }
        if (dashboardInputClearBtn) {
            dashboardInputClearBtn.addEventListener('click', () => {
                clearDashboardInput();
                renderDashboardSupportState(isTeacherModeActive());
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
        if (dashboardOpenSourceBtn) {
            dashboardOpenSourceBtn.addEventListener('click', () => {
                openResourcesOrClassroomSource(isTeacherModeActive() ? 'resources' : 'classroom').catch((error) => {
                    console.warn('打开来源页失败:', error);
                });
            });
        }
        if (jupyterOpenBtn) {
            jupyterOpenBtn.addEventListener('click', () => {
                const lastOpened = getLastOpenedJupyterWorkspace();
                if (lastOpened?.filePath) {
                    openJupyterWorkspace(lastOpened, { force: true }).catch((error) => {
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
                const lastOpened = getLastOpenedJupyterWorkspace();
                openResourcesOrClassroomSource(lastOpened?.sourcePage || '').catch((error) => {
                    console.warn('打开来源页失败:', error);
                });
            });
        }
        window.addEventListener('xedu:tab-changed', (event) => {
            renderWorkspacePages();
            syncActivePageTitle();
        });
        window.addEventListener('xedu:teacher-mode-changed', (event) => {
            applyExperienceCopy(Boolean(event?.detail?.isTeacher));
        });
        renderWorkspacePages();
        applyExperienceCopy(teacherUnlocked);

        // API Key 出于安全考虑通常不回显，或者需要从后端获取
        log('系统初始化完成', 'success');

        hideStartupLoading();
        refreshStatus().catch((error) => {
            console.warn('初始状态检查失败:', error);
        });
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
            const type = typeof message === 'object' && typeof message?.type === 'string'
                ? message.type
                : 'info';
            const content = typeof message === 'object' && Object.prototype.hasOwnProperty.call(message, 'message')
                ? message.message
                : message;
            log(content, type);
        });
    }
});
