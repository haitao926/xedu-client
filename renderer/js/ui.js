// UI 工具函数
import { getPageCopy } from './experience-config.js';

function hasVisibleModal() {
    return Boolean(document.querySelector('.modal-overlay.show'));
}

function shouldShowJupyterView() {
    const consoleActive = Boolean(document.getElementById('main')?.classList.contains('active'));
    return consoleActive && !hasVisibleModal();
}

function exitJupyterFullscreen() {
    const card = document.getElementById('jupyter-card');
    if (card && card.classList.contains('fullscreen')) {
        card.classList.remove('fullscreen');
        document.body.classList.remove('focus-mode');
    }
}

function setJupyterVisibilitySafely(visible) {
    if (!(window.app && window.app.jupyter && window.app.jupyter.setVisibility)) {
        return;
    }
    const nextVisible = Boolean(visible);
    if (!nextVisible) {
        exitJupyterFullscreen();
    }
    Promise.resolve(window.app.jupyter.setVisibility(nextVisible)).catch((error) => {
        console.warn('切换 Jupyter 视图显示状态失败:', error);
    });
}

function syncJupyterVisibilityForModalState() {
    setJupyterVisibilitySafely(shouldShowJupyterView());
}

// 日志函数
export function log(message, type = 'info') {
    const displayMessage = typeof message === 'object' ? JSON.stringify(message) : message;
    console.log(`[LOG-${type.toUpperCase()}] ${displayMessage}`);
    const logContainer = document.getElementById('log-container');
    if (!logContainer) return;

    const time = new Date().toLocaleTimeString();
    const logLine = document.createElement('div');
    logLine.className = `log-entry`;
    
    // Use CSS variables for consistent theming
    let colorVar = 'var(--text-secondary)';
    if (type === 'error') colorVar = 'var(--danger-color)';
    else if (type === 'success') colorVar = 'var(--success-color)';
    else if (type === 'warning') colorVar = 'var(--warning-color)';
    
    logLine.style.color = colorVar;

    logLine.innerHTML = `<span class="log-time">[${time}]</span> ${displayMessage}`;
    logContainer.appendChild(logLine);
    logContainer.scrollTop = logContainer.scrollHeight;
}

// 切换页面 Tab
export function showTab(tabId, navItem, options = {}) {
    if (document.body.classList.contains('student-mode') && tabId === 'main' && !options.allowStudentMain) {
        const studentEntry = document.getElementById('nav-student-lesson-item');
        if (window.app?.resources?.openStudentLessonTab) {
            Promise.resolve(window.app.resources.openStudentLessonTab('route', studentEntry)).catch((error) => {
                console.warn('打开课程任务中心失败:', error);
            });
            return;
        }
        tabId = 'resources';
        navItem = studentEntry || navItem;
    }

    if (tabId === 'settings') {
        const settingsNav = document.getElementById('nav-settings-item');
        const hiddenForStudent = settingsNav && settingsNav.style.display === 'none';
        if (hiddenForStudent) {
            tabId = 'resources';
            navItem = document.getElementById('nav-student-lesson-item') || navItem;
        }
    }

    if (!navItem?.classList?.contains('student-nav-item')) {
        document.body.classList.remove(
            'student-page-route',
            'student-page-experience',
            'student-page-visual',
            'student-page-python'
        );
    }

    // 1. 处理导航菜单高亮
    if (navItem) {
        // 移除所有 active 类
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
        });
        // 给当前点击项添加 active
        navItem.classList.add('active');
    }

    // 2. 处理页面内容显示
    document.querySelectorAll('.page-section').forEach(section => {
        section.classList.remove('active');
    });
    
    const targetSection = document.getElementById(tabId);
    if (targetSection) {
        targetSection.classList.add('active');
    }
    document.body.classList.toggle('blockly-toolbar-top', tabId === 'blockly-workspace');
    document.body.classList.toggle('ai-toolbar-compact', tabId === 'ai-assistant');

    const titleConfig = getPageCopy(tabId);
    const titleEl = document.getElementById('page-title');
    const subtitleEl = document.getElementById('page-subtitle');
    if (titleEl) {
        if (options.pageTitle) {
            titleEl.textContent = options.pageTitle;
        } else if (titleConfig?.title) {
            titleEl.textContent = titleConfig.title;
        }
    }
    if (subtitleEl) {
        if (Object.prototype.hasOwnProperty.call(options, 'pageSubtitle')) {
            subtitleEl.textContent = options.pageSubtitle || '';
        } else if (titleConfig?.subtitle) {
            subtitleEl.textContent = titleConfig.subtitle;
        }
    }

    // 3. 特殊处理：Jupyter 视图的显隐
    // BrowserView 是悬浮在最上层的，离开总控制台时必须隐藏它
    setJupyterVisibilitySafely(shouldShowJupyterView());

    if (tabId === 'resources') {
        if (navItem?.id === 'nav-resources-item' && window.app?.resources?.openResourcesLibrary) {
            Promise.resolve(window.app.resources.openResourcesLibrary()).catch((err) => {
                console.error('打开课程资源模块失败:', err);
            });
        } else if (window.app && window.app.resources && window.app.resources.initResourcesPage) {
            Promise.resolve(window.app.resources.initResourcesPage()).catch((err) => {
                console.error('加载课程资源模块失败:', err);
            });
        }
    }

    window.dispatchEvent(new CustomEvent('xedu:tab-changed', {
        detail: { tabId },
    }));
}

// 模态框控制
export function showModal(modalIdOrTitle, message, path, icon = '✓') {
    // 如果只传了一个参数，且是字符串，认为是 modalId
    if (arguments.length === 1 && typeof modalIdOrTitle === 'string') {
        const modal = document.getElementById(modalIdOrTitle);
        if (modal) {
            modal.classList.add('show');
            syncJupyterVisibilityForModalState();
        } else {
            console.warn(`Modal with ID '${modalIdOrTitle}' not found.`);
        }
        return;
    }

    // 兼容旧的调用方式 (title, message, path, icon) -> 默认使用 customModal
    const modal = document.getElementById('customModal');
    if (modal) {
        const title = modalIdOrTitle;
        const iconElem = document.getElementById('modalIcon');
        const titleElem = document.getElementById('modalTitle');
        const messageElem = document.getElementById('modalMessage');
        const pathElem = document.getElementById('modalPath');

        if (iconElem) iconElem.textContent = icon;
        if (titleElem) titleElem.textContent = title;
        if (messageElem) messageElem.textContent = message;

        if (pathElem) {
            if (path) {
                pathElem.textContent = path;
                pathElem.style.display = 'block';
            } else {
                pathElem.style.display = 'none';
            }
        }
        modal.classList.add('show');
        syncJupyterVisibilityForModalState();
    }
}

export function hideModal(modalId) {
    if (modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.remove('show');
            // 清除所有内联样式，让 CSS 默认样式生效
            modal.removeAttribute('style');
            syncJupyterVisibilityForModalState();
        }
    } else {
        // 如果没有传 ID，尝试关闭所有打开的模态框
        const modals = document.querySelectorAll('.modal-overlay.show');
        modals.forEach(modal => {
            modal.classList.remove('show');
            modal.removeAttribute('style');
        });
        syncJupyterVisibilityForModalState();
    }
}

// 初始化模态框事件监听器
export function initModalListeners() {
    // 点击模态框外部区域关闭模态框
    document.addEventListener('click', (event) => {
        // 查找所有显示的模态框
        const modals = document.querySelectorAll('.modal-overlay.show');
        modals.forEach(modal => {
            if (modal.dataset.lockModal === 'true') return;
            // 如果点击的是模态框遮罩层本身（即外部区域），则关闭
            if (event.target === modal) {
                modal.classList.remove('show');
                syncJupyterVisibilityForModalState();
            }
        });
    });

    // ESC键关闭模态框
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            const modals = document.querySelectorAll('.modal-overlay.show');
            if (modals.length > 0) {
                modals.forEach(modal => {
                    if (modal.dataset.lockModal === 'true') return;
                    modal.classList.remove('show');
                });
                syncJupyterVisibilityForModalState();
            }
        }
    });
}

// Toast 提示
export function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    
    document.body.appendChild(toast);
    
    // 强制重绘
    toast.offsetHeight;
    
    // 显示
    requestAnimationFrame(() => {
        toast.classList.add('show');
    });
    
    // 3秒后自动消失
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 300); // 等待过渡动画结束
    }, 3000);
}


// Settings modal functions removed as it is now a page
