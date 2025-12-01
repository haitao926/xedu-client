/**
 * 事件管理模块
 * 统一管理应用事件
 */

class EventManager {
    constructor() {
        this.listeners = new Map();
        this.onceListeners = new Map();
    }

    /**
     * 添加事件监听器
     */
    on(eventName, callback) {
        if (!this.listeners.has(eventName)) {
            this.listeners.set(eventName, []);
        }
        this.listeners.get(eventName).push(callback);

        // 返回取消监听的函数
        return () => this.off(eventName, callback);
    }

    /**
     * 添加一次性事件监听器
     */
    once(eventName, callback) {
        if (!this.onceListeners.has(eventName)) {
            this.onceListeners.set(eventName, []);
        }
        this.onceListeners.get(eventName).push(callback);

        // 返回取消监听的函数
        return () => this.offOnce(eventName, callback);
    }

    /**
     * 移除事件监听器
     */
    off(eventName, callback) {
        if (this.listeners.has(eventName)) {
            const callbacks = this.listeners.get(eventName);
            const index = callbacks.indexOf(callback);
            if (index > -1) {
                callbacks.splice(index, 1);
            }
        }
    }

    /**
     * 移除一次性事件监听器
     */
    offOnce(eventName, callback) {
        if (this.onceListeners.has(eventName)) {
            const callbacks = this.onceListeners.get(eventName);
            const index = callbacks.indexOf(callback);
            if (index > -1) {
                callbacks.splice(index, 1);
            }
        }
    }

    /**
     * 触发事件
     */
    emit(eventName, data = null) {
        // 触发普通监听器
        if (this.listeners.has(eventName)) {
            this.listeners.get(eventName).forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    console.error(`[Event] Error in callback for ${eventName}:`, error);
                }
            });
        }

        // 触发一次性监听器
        if (this.onceListeners.has(eventName)) {
            const callbacks = this.onceListeners.get(eventName);
            this.onceListeners.delete(eventName);
            callbacks.forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    console.error(`[Event] Error in once callback for ${eventName}:`, error);
                }
            });
        }
    }

    /**
     * 清除所有监听器
     */
    clear() {
        this.listeners.clear();
        this.onceListeners.clear();
    }

    /**
     * 获取监听器数量
     */
    getListenerCount(eventName) {
        let count = 0;
        if (this.listeners.has(eventName)) {
            count += this.listeners.get(eventName).length;
        }
        if (this.onceListeners.has(eventName)) {
            count += this.onceListeners.get(eventName).length;
        }
        return count;
    }

    /**
     * 列出所有事件名
     */
    getEventNames() {
        const events = new Set();
        events.forEach((_, eventName) => events.add(eventName));
        return Array.from(events);
    }
}

/**
 * 应用事件常量
 */
export const APP_EVENTS = {
    // Jupyter相关
    JUPYTER_STATUS_CHANGED: 'jupyter:status_changed',
    JUPYTER_STARTED: 'jupyter:started',
    JUPYTER_STOPPED: 'jupyter:stopped',
    JUPYTER_RESTARTED: 'jupyter:restarted',
    JUPYTER_ERROR: 'jupyter:error',

    // 配置相关
    CONFIG_CHANGED: 'config:changed',
    CONFIG_LOADED: 'config:loaded',
    CONFIG_SAVED: 'config:saved',

    // UI相关
    TAB_CHANGED: 'ui:tab_changed',
    THEME_CHANGED: 'ui:theme_changed',
    WINDOW_RESIZED: 'ui:window_resized',

    // 日志相关
    LOG_ADDED: 'log:added',
    LOG_CLEARED: 'log:cleared',
    LOG_EXPORTED: 'log:exported',

    // AI助手相关
    AI_REQUEST: 'ai:request',
    AI_RESPONSE: 'ai:response',
    AI_ERROR: 'ai:error',

    // 系统相关
    SYSTEM_READY: 'system:ready',
    SYSTEM_ERROR: 'system:error',
    API_CONNECTED: 'api:connected',
    API_DISCONNECTED: 'api:disconnected'
};

// 创建单例实例
const eventManager = new EventManager();

// 导出
export { APP_EVENTS };
export default eventManager;