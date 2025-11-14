/**
 * API 通信模块
 * 统一管理所有与后端的通信
 */

class APIClient {
    constructor(baseURL = 'http://127.0.0.1:5000') {
        this.baseURL = baseURL;
        this.timeout = 10000; // 10秒超时
    }

    /**
     * 通用API调用方法
     * @param {string} endpoint API端点
     * @param {Object} options 请求选项
     * @returns {Promise} API响应
     */
    async call(endpoint, options = {}) {
        const url = `${this.baseURL}${endpoint}`;

        const config = {
            headers: { 'Content-Type': 'application/json' },
            timeout: this.timeout,
            ...options
        };

        console.debug(`[API] Request: ${options.method || 'GET'} ${url}`, config);

        try {
            const response = await fetch(url, config);

            if (!response.ok) {
                const errorText = await response.text();
                throw new APIError(
                    `HTTP ${response.status}: ${response.statusText}`,
                    response.status,
                    errorText
                );
            }

            const data = await response.json();
            console.debug(`[API] Response: ${endpoint}`, data);
            return data;

        } catch (error) {
            console.error(`[API] Error: ${endpoint}`, error);
            if (error instanceof APIError) {
                throw error;
            }
            throw new APIError(`Network error: ${error.message}`, 0, error.message);
        }
    }

    /**
     * GET 请求
     */
    async get(endpoint) {
        return this.call(endpoint, { method: 'GET' });
    }

    /**
     * POST 请求
     */
    async post(endpoint, data) {
        return this.call(endpoint, {
            method: 'POST',
            body: JSON.stringify(data)
        });
    }

    /**
     * PUT 请求
     */
    async put(endpoint, data) {
        return this.call(endpoint, {
            method: 'PUT',
            body: JSON.stringify(data)
        });
    }

    /**
     * DELETE 请求
     */
    async delete(endpoint) {
        return this.call(endpoint, { method: 'DELETE' });
    }
}

/**
 * API 错误类
 */
class APIError extends Error {
    constructor(message, status = 0, details = '') {
        super(message);
        this.name = 'APIError';
        this.status = status;
        this.details = details;
    }
}

/**
 * Jupyter API 接口
 */
class JupyterAPI extends APIClient {
    constructor() {
        super();
    }

    // 状态相关
    async getStatus() {
        return this.get('/api/status');
    }

    async getHealth() {
        return this.get('/api/health');
    }

    // 控制相关
    async startJupyter(config = {}) {
        return this.post('/api/start', config);
    }

    async stopJupyter() {
        return this.post('/api/stop', {});
    }

    async restartJupyter() {
        return this.post('/api/restart', {});
    }

    // 配置相关
    async saveConfig(config) {
        return this.post('/api/save_config', config);
    }

    async loadConfig() {
        return this.get('/api/load_config');
    }

    // 环境检测
    async detectPython() {
        return this.get('/api/detect_python');
    }

    // AI助手
    async askAI(image, question, config) {
        return this.post('/api/ai/ask', {
            image,
            question,
            config
        });
    }
}

// 创建单例实例
const apiClient = new JupyterAPI();

// 导出
export { APIClient, APIError, JupyterAPI };
export default apiClient;