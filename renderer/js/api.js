/**
 * API 通信模块
 * 统一管理所有与后端的通信
 */

const DEFAULT_BASE_URL = 'http://127.0.0.1:5000';

// 处理 file:// 场景下 /api/* 变成 file:///.../api/* 的问题
const rawFetch = (typeof window !== 'undefined' && window.fetch) ? window.fetch.bind(window) : fetch;
const trimTrailingSlash = (url) => url ? url.replace(/\/$/, '') : '';
const normalizeApiUrl = (url, base = DEFAULT_BASE_URL) => {
    if (typeof url !== 'string') return url;
    const cleanedBase = trimTrailingSlash(base || DEFAULT_BASE_URL);

    // 已经是 http/https，保持不变
    if (url.startsWith('http://') || url.startsWith('https://')) {
        return url;
    }

    // 典型 /api/* 相对路径
    if (url.startsWith('/api/')) {
        return `${cleanedBase}${url}`;
    }

    // file:///.../api/* => 提取 /api/* 部分再拼接
    if (url.startsWith('file:///') && url.includes('/api/')) {
        const apiPath = url.substring(url.indexOf('/api/'));
        return `${cleanedBase}${apiPath}`;
    }

    return url;
};

const fetchWithBase = (url, options = {}, base = DEFAULT_BASE_URL) => {
    const normalizedUrl = normalizeApiUrl(url, base);
    return rawFetch(normalizedUrl, options);
};

// 全局兜底：如果其他代码还在用 fetch('/api/...')，强制改写为 http://127.../api/...
if (typeof window !== 'undefined' && !window.__XEDU_FETCH_PATCHED__) {
    window.__XEDU_FETCH_PATCHED__ = true;
    const originalFetch = rawFetch;
    window.fetch = (url, options) => fetchWithBase(url, options);
    window.__XEDU_ORIGINAL_FETCH__ = originalFetch;
}

class APIClient {
    constructor(baseURL = DEFAULT_BASE_URL) {
        this.baseURL = baseURL;
        this.timeout = 25000; // 25秒超时，优化后的启动时间
    }

    /**
     * 通用API调用方法
     * @param {string} endpoint API端点
     * @param {Object} options 请求选项
     * @returns {Promise} API响应
     */
    async call(endpoint, options = {}) {
        const url = normalizeApiUrl(endpoint, this.baseURL);

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
    async askAI(image, question, history = []) {
        return this.post('/api/ai/ask', {
            image,
            question,
            history
        });
    }

    // AI配置
    async testAIConfig(config) {
        return this.post('/api/ai/test_config', {
            config
        });
    }

    async saveAIConfig(config) {
        return this.post('/api/ai/save_config', {
            config
        });
    }

    // Python 包管理（install/uninstall/list）
    async managePythonPackage(payload) {
        return this.post('/api/python/pip', payload);
    }
}

// 创建单例实例
const apiClient = new JupyterAPI();

// 导出
export { APIClient, APIError, JupyterAPI };
export default apiClient;
