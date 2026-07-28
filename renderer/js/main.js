import { log, showTab, showModal, hideModal, initModalListeners, showToast } from './ui.js';
import { startJupyter, stopJupyter, restartJupyter, openBrowser, browseFolder, confirmProjectPath, clearProjectPath, refreshStatus, testPythonEnvironment, refreshView, openExternal, toggleFullscreen, setVisibility, openNotebookFile, getStoredProjectDir } from './jupyter.js';
import { askAI, clearCurrentChat, startNewChat, removeImage, saveAIConfig, testAIConfig, selectChat, previewImage, handleKeyDown, syncModelBadge } from './ai.js';
import { installPackage, uninstallPackage, updatePackage } from './package-manager.js';
import { registerNamespace } from './app-context.js';
import { ProjectWizard } from './project-wizard.js';
import { createWorkspaceController } from './main/workspace-context.js';
import { createDashboardController } from './main/dashboard.js';
import { applySystemConfigToInputs, saveSystemConfig, resetSystemConfig, forgetStoredTeacherCredential, selectPythonEnvironment, scanPythonEnvironments, confirmPythonEnvironment, repairXeduEnvironment, ensureTeacherCodeInitialized } from './main/system-config.js';
import { getExperienceMode, getPageCopy } from './experience-config.js';
import { installUnhandledRejectionHandler } from './main/error-boundary.js';
import {
    createTeacherCodeInitializationRunner,
    forgetTeacherMode,
    isTeacherModeUnlocked,
    readTeacherModeState,
    restoreTeacherModeState,
} from './main/teacher-mode-state.js';
import { createBackendStartupSupport } from './main/backend-startup-support.js';
import { initSidebarCollapseToggle, showSettingsTab } from './main/shell-ui.js';
import apiClient from './api.js';
import './action-dispatcher.js';

let resourcesModule = null;
let resourcesModulePromise = null;
let projectWizard = null;

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

function ensureProjectWizard() {
    if (!projectWizard) {
        projectWizard = new ProjectWizard(apiClient);
    }
    return projectWizard;
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
    onConfigurationReset: async () => {
        await forgetTeacherMode();
        window.dispatchEvent(new CustomEvent('xedu:teacher-credential-cleared'));
        updateSettingsVisibility(false, { allowPythonSetup: true });
    },
    refreshStatus,
});
const initializeTeacherCode = createTeacherCodeInitializationRunner({
    ensureTeacherCode: ensureTeacherCodeInitialized,
    applyConfig: applySystemConfigToInputs,
    restoreTeacherMode: async () => restoreTeacherModeState({
        verifyCode: async (code) => {
            try {
                const response = await apiClient.post('/api/classroom/verify-teacher', {
                    teacher_code: code,
                });
                return Boolean(response?.success);
            } catch (_) {
                return false;
            }
        },
    }),
    applyTeacherMode: (state) => {
        updateSettingsVisibility(Boolean(state?.unlocked));
        if (state?.unlocked) {
            window.dispatchEvent(new CustomEvent('xedu:teacher-credential-updated'));
        }
    },
});

function handleBackendStartupState(state) {
    onBackendStartupState(state);
    const teacherUnlocked = isTeacherModeUnlocked();
    const allowPythonSetup = !teacherUnlocked && (state?.status === 'error' || state?.status === 'starting');
    updateSettingsVisibility(teacherUnlocked, { allowPythonSetup });
    if (allowPythonSetup && state?.status === 'error') {
        showTab('settings', document.getElementById('nav-settings-item'));
        showSettingsTab('python');
    }
    if (state?.status === 'ready') {
        if (document.readyState !== 'loading') ensureProjectWizard();
        initializeTeacherCode().catch((error) => {
            console.warn('后端就绪后初始化教师口令失败:', error);
        });
    }
}

const workspaceController = createWorkspaceController({ showTab, openNotebookFile });
const {
    openResourcesOrClassroomSource,
    openJupyterWorkspace,
    openScratchWorkspace,
    renderWorkspacePages,
    getLastOpenedJupyterWorkspace,
    isTeacherModeActive,
} = workspaceController;
const dashboardController = createDashboardController({ showSettingsTab });
const { updateSettingsVisibility } = dashboardController;

function clearDashboardProjectPath() {
    const inputEl = document.getElementById('project-path');
    clearProjectPath();
    if (inputEl) {
        inputEl.value = '';
    }
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
    syncActivePageTitle();
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
    forgetStoredTeacherCredential,
    selectPythonEnvironment,
    scanPythonEnvironments,
    confirmPythonEnvironment,
    repairXeduEnvironment,
    ensureTeacherCodeInitialized,
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

    async function waitForBackendReady(timeoutMs = 125000) {
        if (!window.electronAPI?.getBackendStartupState) {
            const deadline = Date.now() + Math.min(timeoutMs, 30000);
            while (Date.now() < deadline) {
                try {
                    const response = await apiClient.get('/api/health');
                    if (response?.status === 'ok') return true;
                } catch (_) {
                    // The development server may start the API a little later.
                }
                await new Promise((resolve) => setTimeout(resolve, 500));
            }
            return false;
        }

        const initial = await getBackendStartupState();
        if (initial.status === 'ready') return true;
        if (initial.status === 'error') return false;

        return new Promise((resolve) => {
            let settled = false;
            const timer = setTimeout(() => finish(false), timeoutMs);
            const finish = (ready) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                resolve(ready);
            };
            window.electronAPI.onBackendStartupState((state) => {
                if (state?.status === 'ready') finish(true);
                else if (state?.status === 'error') finish(false);
            });
        });
    }

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
                handleBackendStartupState(state);
            });
        }
        try {
            const initialBackendState = await getBackendStartupState();
            handleBackendStartupState(initialBackendState);
        } catch (error) {
            console.warn('获取后端启动状态失败:', error);
        }
        showSettingsTab('python');

        const backendReady = await waitForBackendReady();
        if (backendReady) {
            try {
                await initializeTeacherCode();
            } catch (error) {
                console.warn('初始化教师口令失败:', error);
            }
        } else {
            console.warn('后端尚未就绪，跳过启动阶段的教师口令初始化');
        }

        // Do not let the project wizard issue API requests while the backend
        // is still bootstrapping or while Python setup is required.
        if (backendReady) ensureProjectWizard();

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
        if (projectPathInput) {
            projectPathInput.value = getStoredProjectDir() || '';
        }

        const submitDashboardInput = async () => {
            await confirmProjectPath();
        };

        const openStudentTaskCenter = () => {
            return openStudentLessonTab("route", document.getElementById('nav-student-lesson-item'));
        };

        if (dashboardHeroPrimaryBtn) {
            dashboardHeroPrimaryBtn.addEventListener('click', () => {
                if (isTeacherModeActive()) {
                    openResourcesOrClassroomSource('resources').catch((error) => {
                        console.warn('打开课程资源失败:', error);
                    });
                    return;
                }
                openStudentTaskCenter().catch((error) => {
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
                clearDashboardProjectPath();
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
                const destination = isTeacherModeActive()
                    ? openResourcesOrClassroomSource('resources')
                    : openStudentTaskCenter();
                destination.catch((error) => {
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
        applyExperienceCopy(isTeacherModeUnlocked());

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
