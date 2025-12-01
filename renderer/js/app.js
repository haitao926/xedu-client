/**
 * 主应用类
 * 统一管理整个应用的生命周期
 */

import logger from './logger.js';
import configManager from './config.js';
import eventManager, { APP_EVENTS } from './events.js';
import apiClient from './api.js';

class App {
    constructor() {
        this.isReady = false;
        this.components = new Map();
        this.timers = new Map();
        this.state = {
            jupyter: {
                running: false,
                status: null
            },
            api: {
                connected: false
            }
        };
    }

    /**
     * 初始化应用
     */
    async init() {
        try {
            logger.info('🚀 正在初始化 Jupyter Notebook Client...');

            // 初始化配置
            await this.initConfig();

            // 初始化事件系统
            this.initEvents();

            // 初始化组件
            await this.initComponents();

            // 初始化快捷键
            this.initKeyboardShortcuts();

            // 启动定时任务
            this.startTimers();

            // 标记为就绪
            this.isReady = true;
            eventManager.emit(APP_EVENTS.SYSTEM_READY);

            logger.success('✅ Jupyter Notebook Client 初始化完成');
            logger.info('💡 快捷键已启用: Ctrl+1-5(切换标签页) Ctrl+S/T/R/O/L');

        } catch (error) {
            logger.error(`❌ 应用初始化失败: ${error.message}`);
            eventManager.emit(APP_EVENTS.SYSTEM_ERROR, { error });
            throw error;
        }
    }

    /**
     * 初始化配置
     */
    async initConfig() {
        logger.debug('📋 正在加载配置...');
        await configManager.init();
        logger.debug('✅ 配置加载完成');
    }

    /**
     * 初始化事件系统
     */
    initEvents() {
        // 监听配置变更
        eventManager.on(APP_EVENTS.CONFIG_CHANGED, (data) => {
            logger.debug(`配置已更新: ${data.path} = ${data.value}`);
        });

        // 监听Jupyter状态变更
        eventManager.on(APP_EVENTS.JUPYTER_STATUS_CHANGED, (status) => {
            this.state.jupyter = { ...this.state.jupyter, ...status };
        });

        // 监听API连接状态
        eventManager.on(APP_EVENTS.API_CONNECTED, () => {
            this.state.api.connected = true;
        });

        eventManager.on(APP_EVENTS.API_DISCONNECTED, () => {
            this.state.api.connected = false;
        });

        // 监听页面可见性变化
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.pauseTimers();
            } else {
                this.resumeTimers();
            }
        });

        // 监听窗口关闭
        window.addEventListener('beforeunload', () => {
            this.cleanup();
        });

        logger.debug('✅ 事件系统初始化完成');
    }

    /**
     * 初始化组件
     */
    async initComponents() {
        // 这里将来会初始化各种UI组件
        logger.debug('🧩 正在初始化组件...');

        // 初始化日志组件
        const logContainer = document.getElementById('log-container');
        if (logContainer) {
            logger.init('log-container');
            logger.info('📝 日志系统已启动');
        }

        logger.debug('✅ 组件初始化完成');
    }

    /**
     * 初始化快捷键
     */
    initKeyboardShortcuts() {
        const shortcuts = {
            'Ctrl+1': () => this.switchTab('main'),
            'Ctrl+2': () => this.switchTab('settings'),
            'Ctrl+3': () => this.switchTab('ai-assistant'),
            'Ctrl+S': () => this.startJupyter(),
            'Ctrl+T': () => this.stopJupyter(),
            'Ctrl+R': () => this.restartJupyter(),
            'Ctrl+O': () => this.openBrowser(),
            'Ctrl+L': () => this.focusLog(),
            'Ctrl+K': () => this.clearLog()
        };

        document.addEventListener('keydown', (e) => {
            const key = this.getShortcutKey(e);
            if (shortcuts[key]) {
                e.preventDefault();
                shortcuts[key]();
            }
        });

        logger.debug('✅ 快捷键初始化完成');
    }

    /**
     * 获取快捷键字符串
     */
    getShortcutKey(e) {
        const parts = [];
        if (e.ctrlKey) parts.push('Ctrl');
        if (e.altKey) parts.push('Alt');
        if (e.shiftKey) parts.push('Shift');
        parts.push(e.key);
        return parts.join('+');
    }

    /**
     * 启动定时任务
     */
    startTimers() {
        const refreshInterval = configManager.get('ui.refreshInterval') || 2000;

        // 状态刷新定时器
        this.timers.set('statusRefresh', setInterval(() => {
            this.refreshStatus();
        }, refreshInterval));

        // API健康检查定时器
        this.timers.set('healthCheck', setInterval(() => {
            this.checkApiHealth();
        }, 10000)); // 10秒检查一次

        logger.debug(`✅ 定时任务已启动 (刷新间隔: ${refreshInterval}ms)`);
    }

    /**
     * 暂停定时任务
     */
    pauseTimers() {
        this.timers.forEach((timer, name) => {
            clearInterval(timer);
        });
        logger.debug('⏸️ 定时任务已暂停');
    }

    /**
     * 恢复定时任务
     */
    resumeTimers() {
        this.startTimers();
        logger.debug('▶️ 定时任务已恢复');
    }

    /**
     * 刷新状态
     */
    async refreshStatus() {
        try {
            const status = await apiClient.getStatus();
            const wasRunning = this.state.jupyter.running;
            const isRunning = status.running;

            this.state.jupyter.status = status;
            this.state.jupyter.running = isRunning;

            // 触发状态变更事件
            eventManager.emit(APP_EVENTS.JUPYTER_STATUS_CHANGED, status);

            // 检测状态变化
            if (!wasRunning && isRunning) {
                eventManager.emit(APP_EVENTS.JUPYTER_STARTED, status);
            } else if (wasRunning && !isRunning) {
                eventManager.emit(APP_EVENTS.JUPYTER_STOPPED, status);
            }

        } catch (error) {
            if (this.state.api.connected) {
                logger.warn('API连接断开');
                eventManager.emit(APP_EVENTS.API_DISCONNECTED);
            }
        }
    }

    /**
     * 检查API健康状态
     */
    async checkApiHealth() {
        try {
            await apiClient.getHealth();
            if (!this.state.api.connected) {
                eventManager.emit(APP_EVENTS.API_CONNECTED);
            }
        } catch (error) {
            if (this.state.api.connected) {
                eventManager.emit(APP_EVENTS.API_DISCONNECTED);
            }
        }
    }

    /**
     * UI操作方法
     */
    switchTab(tabName) {
        eventManager.emit(APP_EVENTS.TAB_CHANGED, { tabName });
        this.updateTabUI(tabName);
        logger.debug(`切换到标签页: ${tabName}`);
    }

    updateTabUI(tabName) {
        // 隐藏所有标签页
        document.querySelectorAll('.tab-content').forEach(tab => {
            tab.classList.remove('active');
        });

        document.querySelectorAll('.nav-tab').forEach(btn => {
            btn.classList.remove('active');
        });

        // 显示选中的标签页
        const targetTab = document.getElementById(tabName);
        if (targetTab) {
            targetTab.classList.add('active');
        }

        const targetBtn = document.querySelector(`[onclick="showTab('${tabName}')"]`);
        if (targetBtn) {
            targetBtn.classList.add('active');
        }
    }

    // Jupyter控制方法
    async startJupyter() {
        try {
            logger.info('🚀 正在启动 Jupyter Notebook...');
            eventManager.emit(APP_EVENTS.JUPYTER_REQUEST, { action: 'start' });

            const config = this.buildJupyterConfig();
            const result = await apiClient.startJupyter(config);

            if (result.success) {
                logger.success('✅ Jupyter Notebook 启动成功！');
                logger.info(`📍 URL: ${result.url}`);
                logger.info(`🏷️ 进程 ID: ${result.pid} | 端口: ${result.port}`);

                eventManager.emit(APP_EVENTS.JUPYTER_STARTED, result);

                // 自动打开浏览器
                if (configManager.get('ui.autoOpenBrowser')) {
                    setTimeout(() => this.openBrowser(), 2000);
                }
            } else {
                logger.error(`❌ 启动失败: ${result.message}`);
                eventManager.emit(APP_EVENTS.JUPYTER_ERROR, { message: result.message });
            }
        } catch (error) {
            logger.error(`❌ 启动失败: ${error.message}`);
            eventManager.emit(APP_EVENTS.JUPYTER_ERROR, { error });
        }
    }

    async stopJupyter() {
        try {
            logger.info('🛑 正在停止 Jupyter Notebook...');
            eventManager.emit(APP_EVENTS.JUPYTER_REQUEST, { action: 'stop' });

            const result = await apiClient.stopJupyter();

            if (result.success) {
                logger.success('✅ Jupyter Notebook 已停止');
                eventManager.emit(APP_EVENTS.JUPYTER_STOPPED, result);
            } else {
                logger.error('❌ 停止失败');
                eventManager.emit(APP_EVENTS.JUPYTER_ERROR, { message: result.message });
            }
        } catch (error) {
            logger.error(`❌ 停止失败: ${error.message}`);
            eventManager.emit(APP_EVENTS.JUPYTER_ERROR, { error });
        }
    }

    async restartJupyter() {
        logger.info('🔄 正在重启 Jupyter Notebook...');
        logger.info('→ 第一步：停止 Notebook');
        await this.stopJupyter();

        logger.info('→ 第二步：等待 2 秒');
        await new Promise(resolve => setTimeout(resolve, 2000));

        logger.info('→ 第三步：重新启动');
        await this.startJupyter();
    }

    openBrowser() {
        const status = this.state.jupyter.status;
        if (status && status.running && status.url) {
            logger.info(`🌐 正在打开浏览器: ${status.url}`);
            window.open(status.url, '_blank');
        } else {
            logger.warn('⚠️ Jupyter Notebook 未运行，无法打开浏览器');
        }
    }

    buildJupyterConfig() {
        return {
            port: configManager.get('jupyter.port'),
            python_executable: configManager.get('jupyter.pythonExecutable'),
            project_dir: configManager.get('jupyter.projectDir'),
            use_notebook: configManager.get('jupyter.useNotebook')
        };
    }

    focusLog() {
        this.switchTab('main');
        const logContainer = document.getElementById('log-container');
        if (logContainer) {
            logContainer.focus();
        }
    }

    clearLog() {
        logger.clear();
        eventManager.emit(APP_EVENTS.LOG_CLEARED);
    }

    /**
     * 获取应用状态
     */
    getState() {
        return { ...this.state };
    }

    /**
     * 清理资源
     */
    cleanup() {
        // 清理定时器
        this.pauseTimers();

        // 清理事件监听器
        eventManager.clear();

        // 保存配置
        configManager.save();

        logger.info('🧹 应用资源已清理');
    }
}

// 创建单例实例
const app = new App();

// 导出
export default app;