// UI 工具函数

// 日志函数
export function log(message, type = 'info') {
    const displayMessage = typeof message === 'object' ? JSON.stringify(message) : message;
    console.log(`[LOG-${type.toUpperCase()}] ${displayMessage}`);
    const logContainer = document.getElementById('log-container');
    if (!logContainer) return;

    const time = new Date().toLocaleTimeString();
    const logLine = document.createElement('div');
    logLine.className = `log-entry`;
    logLine.style.color = type === 'error' ? '#ef4444' : (type === 'success' ? '#10b981' : (type === 'warning' ? '#f59e0b' : '#d4d4d4'));

    logLine.innerHTML = `<span class="log-time">[${time}]</span> ${displayMessage}`;
    logContainer.appendChild(logLine);
    logContainer.scrollTop = logContainer.scrollHeight;
}

// 切换页面 Tab
export function showTab(tabId, navItem) {
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

    // 3. 特殊处理：Jupyter 视图的显隐
    // BrowserView 是悬浮在最上层的，切换到非主页时必须隐藏它
    if (window.app && window.app.jupyter && window.app.jupyter.setVisibility) {
        if (tabId === 'main') {
            // 回到主页，显示 Jupyter
            window.app.jupyter.setVisibility(true);
        } else {
            // 离开主页，隐藏 Jupyter
            window.app.jupyter.setVisibility(false);
        }
    }

    // 4. 初始化特定页面功能
    if (tabId === 'docs') {
        // 优先使用已注册的全局模块
        if (window.app && window.app.docs && window.app.docs.initDocsPage) {
            window.app.docs.initDocsPage();
        } else {
            // 回退方案：动态导入
            import('./docs.js').then(docs => {
                docs.initDocsPage();
            }).catch(err => {
                console.error('加载文档模块失败:', err);
            });
        }
    }
}

// 模态框控制
export function showModal(modalIdOrTitle, message, path, icon = '✓') {
    // 如果只传了一个参数，且是字符串，认为是 modalId
    if (arguments.length === 1 && typeof modalIdOrTitle === 'string') {
        const modal = document.getElementById(modalIdOrTitle);
        if (modal) {
            modal.classList.add('show');
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
    }
}

export function hideModal(modalId) {
    if (modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.remove('show');
            // 清除所有内联样式，让 CSS 默认样式生效
            modal.removeAttribute('style');
        }
    } else {
        // 如果没有传 ID，尝试关闭所有打开的模态框
        const modals = document.querySelectorAll('.modal-overlay.show');
        modals.forEach(modal => {
            modal.classList.remove('show');
            modal.removeAttribute('style');
        });
    }
}

// 初始化模态框事件监听器
export function initModalListeners() {
    // 点击模态框外部区域关闭模态框
    document.addEventListener('click', (event) => {
        // 查找所有显示的模态框
        const modals = document.querySelectorAll('.modal-overlay.show');
        modals.forEach(modal => {
            // 如果点击的是模态框遮罩层本身（即外部区域），则关闭
            if (event.target === modal) {
                modal.classList.remove('show');
            }
        });
    });

    // ESC键关闭模态框
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            const modals = document.querySelectorAll('.modal-overlay.show');
            if (modals.length > 0) {
                modals.forEach(modal => modal.classList.remove('show'));
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

