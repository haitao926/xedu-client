// UI 工具函数

// 日志函数
export function log(message, type = 'info') {
    console.log(`[LOG-${type.toUpperCase()}] ${message}`);
    const logContainer = document.getElementById('log-container');
    if (!logContainer) return;

    const time = new Date().toLocaleTimeString();
    const logLine = document.createElement('div');
    logLine.className = `log-entry`;
    logLine.style.color = type === 'error' ? '#ef4444' : (type === 'success' ? '#10b981' : (type === 'warning' ? '#f59e0b' : '#d4d4d4'));

    let displayMessage = typeof message === 'object' ? JSON.stringify(message) : message;

    logLine.innerHTML = `<span class="log-time">[${time}]</span> ${displayMessage}`;
    logContainer.appendChild(logLine);
    logContainer.scrollTop = logContainer.scrollHeight;
}

// 标签页切换
export function showTab(tabName, clickedElement) {
    console.log('[DEBUG] 🎯 showTab() 函数被调用，切换到:', tabName);

    try {
        // 更新页面标题
        const titleMap = {
            'main': '主控制台',
            'ai-assistant': 'AI 助手',
            'settings': '系统设置'
        };
        const pageTitle = document.getElementById('page-title');
        if (pageTitle && titleMap[tabName]) {
            pageTitle.textContent = titleMap[tabName];
        }

        // 1. 隐藏所有页面内容
        const allSections = document.querySelectorAll('.page-section');
        allSections.forEach((section) => {
            section.classList.remove('active');
        });

        // 2. 移除所有导航项的 active 类
        const allNavItems = document.querySelectorAll('.nav-item');
        allNavItems.forEach((item) => {
            item.classList.remove('active');
        });

        // 3. 显示目标页面
        const targetSection = document.getElementById(tabName);
        if (targetSection) {
            targetSection.classList.add('active');
        }

        // 4. 高亮当前导航项
        if (clickedElement) {
            clickedElement.classList.add('active');
        } else {
            // 尝试根据onclick属性找到对应的导航项
            allNavItems.forEach((item) => {
                const onclick = item.getAttribute('onclick');
                // 简单的匹配逻辑，实际可能需要更严谨
                if (onclick && onclick.includes(`'${tabName}'`)) {
                    item.classList.add('active');
                }
            });
        }

        return true;
    } catch (error) {
        console.error('[DEBUG] ❌ showTab() 执行出错:', error);
        return false;
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

// Settings modal functions removed as it is now a page

