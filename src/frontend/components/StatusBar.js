/**
 * 状态栏组件
 * 显示Jupyter运行状态和系统信息
 */

import logger from '@utils/logger.js';
import eventManager, { APP_EVENTS } from '@utils/events.js';

class StatusBar {
    constructor(containerId = 'status-container') {
        this.container = document.getElementById(containerId);
        this.elements = {};
        this.currentStatus = {
            running: false,
            port: null,
            pid: null,
            url: null
        };

        if (!this.container) {
            throw new Error(`Status bar container with id '${containerId}' not found`);
        }

        this.init();
    }

    /**
     * 初始化状态栏
     */
    init() {
        this.render();
        this.bindEvents();
        logger.debug('状态栏组件已初始化');
    }

    /**
     * 渲染状态栏
     */
    render() {
        this.container.innerHTML = `
            <div class="status-bar">
                <div class="status-item">
                    <span class="status-badge ${this.currentStatus.running ? 'status-running' : 'status-stopped'}" id="jupyter-status">
                        ${this.currentStatus.running ? '运行中' : '已停止'}
                    </span>
                </div>

                <div class="status-grid">
                    <div class="status-item">
                        <label>运行状态</label>
                        <div class="value" id="status-value">${this.currentStatus.running ? '运行中' : '已停止'}</div>
                    </div>
                    <div class="status-item">
                        <label>服务端口</label>
                        <div class="value" id="port-value">${this.currentStatus.port || '-'}</div>
                    </div>
                    <div class="status-item">
                        <label>进程 ID</label>
                        <div class="value" id="pid-value">${this.currentStatus.pid || '-'}</div>
                    </div>
                    <div class="status-item">
                        <label>访问地址</label>
                        <div class="value" id="url-value" style="font-size: 14px;">${this.currentStatus.url || '-'}</div>
                    </div>
                </div>
            </div>
        `;

        // 缓存DOM元素
        this.cacheElements();
    }

    /**
     * 缓存DOM元素
     */
    cacheElements() {
        this.elements = {
            jupyterStatus: document.getElementById('jupyter-status'),
            statusValue: document.getElementById('status-value'),
            portValue: document.getElementById('port-value'),
            pidValue: document.getElementById('pid-value'),
            urlValue: document.getElementById('url-value')
        };
    }

    /**
     * 绑定事件
     */
    bindEvents() {
        // 监听Jupyter状态变更
        eventManager.on(APP_EVENTS.JUPYTER_STATUS_CHANGED, (status) => {
            this.updateStatus(status);
        });

        eventManager.on(APP_EVENTS.JUPYTER_STARTED, (status) => {
            this.updateStatus(status);
            this.showNotification('Jupyter Notebook 已启动', 'success');
        });

        eventManager.on(APP_EVENTS.JUPYTER_STOPPED, () => {
            this.updateStatus({ running: false });
            this.showNotification('Jupyter Notebook 已停止', 'info');
        });

        eventManager.on(APP_EVENTS.JUPYTER_ERROR, (error) => {
            this.showError(error.message || '发生未知错误');
        });
    }

    /**
     * 更新状态显示
     */
    updateStatus(status) {
        this.currentStatus = { ...this.currentStatus, ...status };
        const { running } = this.currentStatus;

        // 更新状态徽章
        if (this.elements.jupyterStatus) {
            this.elements.jupyterStatus.textContent = running ? '运行中' : '已停止';
            this.elements.jupyterStatus.className = `status-badge ${running ? 'status-running' : 'status-stopped'}`;
        }

        // 更新状态详情
        if (this.elements.statusValue) {
            this.elements.statusValue.textContent = running ? '运行中' : '已停止';
        }

        if (this.elements.portValue) {
            this.elements.portValue.textContent = status.port || '-';
        }

        if (this.elements.pidValue) {
            this.elements.pidValue.textContent = status.pid || '-';
        }

        if (this.elements.urlValue) {
            this.elements.urlValue.textContent = status.url || '-';
        }

        // 更新按钮状态
        this.updateButtonStates(running);
    }

    /**
     * 更新按钮状态
     */
    updateButtonStates(running) {
        const buttons = {
            'start-btn': !running,
            'stop-btn': running,
            'restart-btn': running,
            'open-btn': running
        };

        Object.entries(buttons).forEach(([id, enabled]) => {
            const button = document.getElementById(id);
            if (button) {
                button.disabled = !enabled;
                button.style.opacity = enabled ? '1' : '0.5';
            }
        });
    }

    /**
     * 显示通知
     */
    showNotification(message, type = 'info') {
        // 这里可以实现一个更复杂的通知系统
        logger.info(`📢 ${message}`);
    }

    /**
     * 显示错误
     */
    showError(message) {
        logger.error(`❌ ${message}`);
        this.showNotification(message, 'error');
    }

    /**
     * 获取当前状态
     */
    getStatus() {
        return { ...this.currentStatus };
    }

    /**
     * 销毁组件
     */
    destroy() {
        // 清理事件监听器
        eventManager.off(APP_EVENTS.JUPYTER_STATUS_CHANGED);
        eventManager.off(APP_EVENTS.JUPYTER_STARTED);
        eventManager.off(APP_EVENTS.JUPYTER_STOPPED);
        eventManager.off(APP_EVENTS.JUPYTER_ERROR);

        // 清理DOM
        if (this.container) {
            this.container.innerHTML = '';
        }

        logger.debug('状态栏组件已销毁');
    }
}

// 导出
export default StatusBar;