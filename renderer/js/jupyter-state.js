import apiClient from './api.js';

/**
 * Jupyter 状态管理模块
 * 提供细粒度的状态管理和UI更新
 */

// Jupyter 状态定义
export const JUPYTER_STATES = {
    IDLE: 'idle',                    // 空闲
    STARTING_INIT: 'starting_init',  // 初始化启动
    STARTING_ENV: 'starting_env',    // 环境准备
    STARTING_PROCESS: 'starting_process', // 启动进程
    STARTING_WAITING: 'starting_waiting', // 等待就绪
    RUNNING: 'running',              // 运行中
    STOPPING: 'stopping',            // 停止中
    ERROR: 'error'                   // 错误
};

// 状态映射到UI步骤
const STATE_TO_STEP = {
    [JUPYTER_STATES.STARTING_INIT]: 1,
    [JUPYTER_STATES.STARTING_ENV]: 2,
    [JUPYTER_STATES.STARTING_PROCESS]: 3,
    [JUPYTER_STATES.STARTING_WAITING]: 4,
    [JUPYTER_STATES.RUNNING]: 5,
};

class JupyterStateManager {
    constructor() {
        this.currentState = JUPYTER_STATES.IDLE;
        this.pollingInterval = null;
        this.startupStartTime = null;
        this.callbacks = new Set();

        // 绑定方法
        this.updateState = this.updateState.bind(this);
        this.startPolling = this.startPolling.bind(this);
        this.stopPolling = this.stopPolling.bind(this);
    }

    /**
     * 添加状态变化回调
     */
    addCallback(callback) {
        this.callbacks.add(callback);
    }

    /**
     * 移除状态变化回调
     */
    removeCallback(callback) {
        this.callbacks.delete(callback);
    }

    /**
     * 更新状态并通知回调
     */
    updateState(newState, data = {}) {
        const oldState = this.currentState;
        this.currentState = newState;

        // 通知所有回调
        this.callbacks.forEach(callback => {
            try {
                callback(newState, oldState, data);
            } catch (error) {
                console.error('State callback error:', error);
            }
        });
    }

    /**
     * 获取当前状态
     */
    getCurrentState() {
        return this.currentState;
    }

    /**
     * 检查是否正在启动
     */
    isStarting() {
        return [
            JUPYTER_STATES.STARTING_INIT,
            JUPYTER_STATES.STARTING_ENV,
            JUPYTER_STATES.STARTING_PROCESS,
            JUPYTER_STATES.STARTING_WAITING
        ].includes(this.currentState);
    }

    /**
     * 检查是否正在运行
     */
    isRunning() {
        return this.currentState === JUPYTER_STATES.RUNNING;
    }

    /**
     * 开始轮询状态
     */
    startPolling(apiClient, interval = 1000) {
        this.stopPolling();

        this.pollingInterval = setInterval(async () => {
            try {
                const status = await apiClient.getStatus();
                this.processStatusUpdate(status);
            } catch (error) {
                console.error('Status polling error:', error);
            }
        }, interval);
    }

    /**
     * 停止轮询状态
     */
    stopPolling() {
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
            this.pollingInterval = null;
        }
    }

    /**
     * 处理状态更新
     */
    processStatusUpdate(status) {
        if (status.running) {
            if (this.isStarting()) {
                // 从启动中转为运行中
                this.updateState(JUPYTER_STATES.RUNNING, status);
                this.stopPolling();
            } else if (this.currentState === JUPYTER_STATES.IDLE) {
                // 发现外部运行的Jupyter
                this.updateState(JUPYTER_STATES.RUNNING, status);
            }
        } else {
            if (this.isRunning()) {
                // 从运行中转为停止
                this.updateState(JUPYTER_STATES.IDLE, status);
                this.stopPolling();
            }
        }
    }

    /**
     * 启动流程开始
     */
    onStartupStart() {
        this.startupStartTime = Date.now();
        this.updateState(JUPYTER_STATES.STARTING_INIT);
        // 开始轮询以监控启动进度
        this.startPolling(apiClient, 1500);
    }

    /**
     * 启动流程结束（成功或失败）
     */
    onStartupEnd(success, error = null) {
        if (success) {
            this.updateState(JUPYTER_STATES.RUNNING);
        } else {
            this.updateState(JUPYTER_STATES.ERROR, { error });
        }
        this.stopPolling();
        this.startupStartTime = null;
    }

    /**
     * 获取启动耗时
     */
    getStartupDuration() {
        if (!this.startupStartTime) return 0;
        return Date.now() - this.startupStartTime;
    }

    /**
     * 获取当前步骤进度
     */
    getCurrentStepProgress() {
        const step = STATE_TO_STEP[this.currentState] || 0;
        const totalSteps = 5;
        return Math.round((step / totalSteps) * 100);
    }
}

// 创建全局状态管理器
const jupyterStateManager = new JupyterStateManager();

export default jupyterStateManager;
