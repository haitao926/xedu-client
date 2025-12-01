/**
 * 配置管理模块
 * 统一管理应用配置
 */

class ConfigManager {
    constructor() {
        this.defaultConfig = {
            // API配置
            api: {
                baseURL: 'http://127.0.0.1:5000',
                timeout: 10000
            },

            // Jupyter配置
            jupyter: {
                port: 8888,
                pythonExecutable: '',
                projectDir: '',
                useNotebook: false,
                autoStart: false,
                autoRestart: true,
                checkInterval: 2000, // 毫秒
                maxRestarts: 3
            },

            // UI配置
            ui: {
                theme: 'dark',
                language: 'zh-CN',
                autoRefresh: true,
                refreshInterval: 2000,
                showNotifications: true,
                minimizeToTray: true
            },

            // 日志配置
            logging: {
                level: 'info',
                maxLogs: 1000,
                autoScroll: true,
                exportFormat: 'txt'
            },

            // AI助手配置
            ai: {
                apiKey: '',
                baseURL: 'https://api.moonshot.cn/v1',
                model: 'moonshot-v1-8k-vision-preview',
                maxHistory: 50
            }
        };

        this.config = { ...this.defaultConfig };
        this.storageKey = 'xedu-client-config';
    }

    /**
     * 初始化配置
     */
    async init() {
        await this.load();
        await this.syncWithServer();
    }

    /**
     * 获取配置
     */
    get(path = null) {
        if (!path) {
            return { ...this.config };
        }

        const keys = path.split('.');
        let value = this.config;

        for (const key of keys) {
            if (value && typeof value === 'object' && key in value) {
                value = value[key];
            } else {
                return undefined;
            }
        }

        return value;
    }

    /**
     * 设置配置
     */
    set(path, value) {
        const keys = path.split('.');
        let target = this.config;

        // 导航到目标对象
        for (let i = 0; i < keys.length - 1; i++) {
            const key = keys[i];
            if (!target[key] || typeof target[key] !== 'object') {
                target[key] = {};
            }
            target = target[key];
        }

        // 设置值
        const lastKey = keys[keys.length - 1];
        const oldValue = target[lastKey];
        target[lastKey] = value;

        // 触发配置变更事件
        this.dispatchConfigChange(path, value, oldValue);

        return this;
    }

    /**
     * 批量设置配置
     */
    setMultiple(configObject) {
        const changes = [];

        Object.entries(configObject).forEach(([path, value]) => {
            const oldValue = this.get(path);
            this.set(path, value);
            changes.push({ path, value, oldValue });
        });

        // 批量触发变更事件
        this.dispatchBatchConfigChange(changes);

        return this;
    }

    /**
     * 重置配置
     */
    reset(path = null) {
        if (path) {
            const defaultValue = this.getDefaultValue(path);
            this.set(path, defaultValue);
        } else {
            this.config = { ...this.defaultConfig };
            this.dispatchConfigChange('*', this.config, null);
        }

        return this;
    }

    /**
     * 获取默认值
     */
    getDefaultValue(path) {
        const keys = path.split('.');
        let value = this.defaultConfig;

        for (const key of keys) {
            if (value && typeof value === 'object' && key in value) {
                value = value[key];
            } else {
                return undefined;
            }
        }

        return value;
    }

    /**
     * 从本地存储加载
     */
    async load() {
        try {
            const stored = localStorage.getItem(this.storageKey);
            if (stored) {
                const parsedConfig = JSON.parse(stored);
                this.config = this.mergeConfig(this.defaultConfig, parsedConfig);
                console.debug('[Config] Loaded from localStorage');
            }
        } catch (error) {
            console.error('[Config] Failed to load from localStorage:', error);
        }

        return this;
    }

    /**
     * 保存到本地存储
     */
    async save() {
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(this.config));
            console.debug('[Config] Saved to localStorage');
        } catch (error) {
            console.error('[Config] Failed to save to localStorage:', error);
        }

        return this;
    }

    /**
     * 与服务器同步配置
     */
    async syncWithServer() {
        try {
            // 这里需要导入API客户端，但为了避免循环依赖，
            // 我们通过事件系统来处理
            this.dispatchSyncRequest();
        } catch (error) {
            console.error('[Config] Failed to sync with server:', error);
        }

        return this;
    }

    /**
     * 深度合并配置
     */
    mergeConfig(defaultConfig, userConfig) {
        const result = { ...defaultConfig };

        for (const [key, value] of Object.entries(userConfig)) {
            if (value && typeof value === 'object' && !Array.isArray(value)) {
                result[key] = this.mergeConfig(result[key] || {}, value);
            } else {
                result[key] = value;
            }
        }

        return result;
    }

    /**
     * 验证配置
     */
    validate(path, value) {
        const schema = this.getValidationSchema(path);
        if (schema) {
            return this.validateValue(value, schema);
        }
        return true;
    }

    /**
     * 获取验证模式
     */
    getValidationSchema(path) {
        const schemas = {
            'jupyter.port': {
                type: 'number',
                min: 1024,
                max: 65535
            },
            'jupyter.checkInterval': {
                type: 'number',
                min: 1000,
                max: 60000
            },
            'ui.theme': {
                type: 'string',
                enum: ['light', 'dark', 'auto']
            },
            'logging.level': {
                type: 'string',
                enum: ['debug', 'info', 'warn', 'error']
            }
        };

        return schemas[path];
    }

    /**
     * 验证值
     */
    validateValue(value, schema) {
        if (schema.type && typeof value !== schema.type) {
            return false;
        }

        if (schema.min !== undefined && value < schema.min) {
            return false;
        }

        if (schema.max !== undefined && value > schema.max) {
            return false;
        }

        if (schema.enum && !schema.enum.includes(value)) {
            return false;
        }

        return true;
    }

    /**
     * 触发配置变更事件
     */
    dispatchConfigChange(path, value, oldValue) {
        const event = new CustomEvent('configChange', {
            detail: { path, value, oldValue }
        });
        document.dispatchEvent(event);
    }

    /**
     * 触发批量配置变更事件
     */
    dispatchBatchConfigChange(changes) {
        const event = new CustomEvent('configBatchChange', {
            detail: { changes }
        });
        document.dispatchEvent(event);
    }

    /**
     * 触发同步请求事件
     */
    dispatchSyncRequest() {
        const event = new CustomEvent('configSyncRequest', {
            detail: { config: this.config }
        });
        document.dispatchEvent(event);
    }
}

// 创建单例实例
const configManager = new ConfigManager();

// 导出
export default configManager;