/**
 * 日志管理模块
 * 统一管理应用日志记录
 */

class Logger {
    constructor() {
        this.logContainer = null;
        this.maxLogs = 1000; // 最大日志条数
        this.autoScroll = true;
        this.logLevels = {
            debug: 0,
            info: 1,
            warn: 2,
            error: 3
        };
        this.currentLevel = this.logLevels.debug;
    }

    /**
     * 初始化日志容器
     */
    init(containerId = 'log-container') {
        this.logContainer = document.getElementById(containerId);
        if (!this.logContainer) {
            console.warn(`Log container with id '${containerId}' not found`);
        }
    }

    /**
     * 写入日志
     */
    write(message, level = 'info', options = {}) {
        const timestamp = new Date().toLocaleTimeString();
        const logLevel = this.logLevels[level] || this.logLevels.info;

        // 检查日志级别
        if (logLevel < this.currentLevel) {
            return;
        }

        // 写入控制台
        console[level](`[${timestamp}] ${message}`);

        // 写入UI
        if (this.logContainer) {
            const logLine = this.createLogElement(timestamp, message, level, options);
            this.addLogToContainer(logLine);
        }

        // 触发日志事件
        this.dispatchLogEvent(level, message, timestamp);
    }

    /**
     * 创建日志元素
     */
    createLogElement(timestamp, message, level, options) {
        const logLine = document.createElement('div');
        logLine.className = `log-line log-${level}`;

        // 格式化消息
        let formattedMessage = `<span class="log-time">[${timestamp}]</span> ${message}`;

        // 添加额外的HTML属性
        if (options.className) {
            logLine.classList.add(...options.className.split(' '));
        }

        if (options.html) {
            formattedMessage += ` ${options.html}`;
        }

        logLine.innerHTML = formattedMessage;

        // 添加数据属性
        if (options.data) {
            Object.entries(options.data).forEach(([key, value]) => {
                logLine.dataset[key] = value;
            });
        }

        return logLine;
    }

    /**
     * 添加日志到容器
     */
    addLogToContainer(logLine) {
        // 添加到顶部（最新的在上面）
        this.logContainer.insertBefore(logLine, this.logContainer.firstChild);

        // 限制日志数量
        while (this.logContainer.children.length > this.maxLogs) {
            this.logContainer.removeChild(this.logContainer.lastChild);
        }

        // 自动滚动
        if (this.autoScroll) {
            this.logContainer.scrollTop = this.logContainer.scrollHeight;
        }
    }

    /**
     * 触发日志事件
     */
    dispatchLogEvent(level, message, timestamp) {
        const event = new CustomEvent('log', {
            detail: {
                level,
                message,
                timestamp,
                type: 'log'
            }
        });
        document.dispatchEvent(event);
    }

    // 便捷方法
    debug(message, options = {}) {
        this.write(message, 'debug', options);
    }

    info(message, options = {}) {
        this.write(message, 'info', options);
    }

    warn(message, options = {}) {
        this.write(message, 'warn', options);
    }

    error(message, options = {}) {
        this.write(message, 'error', options);
    }

    success(message, options = {}) {
        this.write(message, 'success', options);
    }

    /**
     * 清空日志
     */
    clear() {
        if (this.logContainer) {
            this.logContainer.innerHTML = '<div class="log-line log-info">日志已清空</div>';
        }
    }

    /**
     * 导出日志
     */
    export() {
        if (!this.logContainer) return null;

        const logs = Array.from(this.logContainer.querySelectorAll('.log-line'))
            .map(line => line.textContent)
            .join('\n');

        return {
            content: logs,
            filename: `jupyter-logs-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.txt`
        };
    }

    /**
     * 设置日志级别
     */
    setLevel(level) {
        if (this.logLevels.hasOwnProperty(level)) {
            this.currentLevel = this.logLevels[level];
        }
    }

    /**
     * 切换自动滚动
     */
    toggleAutoScroll() {
        this.autoScroll = !this.autoScroll;
        return this.autoScroll;
    }

    /**
     * 获取日志统计
     */
    getStats() {
        if (!this.logContainer) return null;

        const logs = this.logContainer.querySelectorAll('.log-line');
        const stats = {
            total: logs.length,
            debug: 0,
            info: 0,
            warn: 0,
            error: 0,
            success: 0
        };

        logs.forEach(log => {
            const level = log.className.match(/log-(\w+)/)?.[1];
            if (stats.hasOwnProperty(level)) {
                stats[level]++;
            }
        });

        return stats;
    }
}

// 创建单例实例
const logger = new Logger();

// 导出
export default logger;