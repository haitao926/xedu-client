/**
 * API 通信模块
 * 统一管理所有与后端的通信
 */

const DEFAULT_BASE_URL = (typeof window !== 'undefined' && window.xeduConfig && window.xeduConfig.apiBase)
    ? window.xeduConfig.apiBase
    : 'http://127.0.0.1:5123';

const rawFetch = (typeof window !== 'undefined' && window.fetch) ? window.fetch.bind(window) : fetch;
const trimTrailingSlash = (url) => url ? url.replace(/\/$/, '') : '';
const isFormDataBody = (body) => typeof FormData !== 'undefined' && body instanceof FormData;
const SENSITIVE_HEADER_PATTERN = /authorization|cookie|token|secret|api[-_]key/i;
const getRequestLogMeta = (config) => ({
    method: config.method || 'GET',
    headers: config.headers
        ? Object.fromEntries(Array.from(new Headers(config.headers).entries()).map(([name, value]) => [
            name,
            SENSITIVE_HEADER_PATTERN.test(name) ? '[redacted]' : value,
        ]))
        : {},
    body: config.body == null ? undefined : '[redacted]',
});

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

const shouldUseElectronRequest = (url, options = {}, base = DEFAULT_BASE_URL, transport = 'auto') => {
    if (transport !== 'auto') {
        return false;
    }
    const electronRequest = typeof window !== 'undefined' && window.electronAPI?.apiRequest;
    if (!electronRequest || typeof url !== 'string') {
        return false;
    }

    const method = String(options.method || 'GET').toUpperCase();
    if (!['GET', 'POST'].includes(method)) {
        return false;
    }

    const normalizedUrl = normalizeApiUrl(url, base);
    const apiPrefix = `${trimTrailingSlash(base || DEFAULT_BASE_URL)}/api/`;
    if (!normalizedUrl.startsWith(apiPrefix)) {
        return false;
    }

    const body = options.body;
    if (isFormDataBody(body)) {
        return false;
    }

    return body == null || typeof body === 'string';
};

const fetchWithBase = async (url, options = {}, base = DEFAULT_BASE_URL, transport = 'auto') => {
    const normalizedUrl = normalizeApiUrl(url, base);
    const electronRequest = typeof window !== 'undefined' && window.electronAPI?.apiRequest;
    if (shouldUseElectronRequest(normalizedUrl, options, base, transport)) {
        const parsed = new URL(normalizedUrl);
        const result = await new Promise((resolve, reject) => {
            let settled = false;
            const cleanup = () => options.signal?.removeEventListener('abort', onAbort);
            const finish = (callback, value) => {
                if (settled) return;
                settled = true;
                cleanup();
                callback(value);
            };
            const onAbort = () => finish(reject, options.signal.reason || new DOMException('The operation was aborted.', 'AbortError'));
            if (options.signal?.aborted) {
                onAbort();
                return;
            }
            options.signal?.addEventListener('abort', onAbort, { once: true });
            electronRequest({
                method: options.method || 'GET',
                path: `${parsed.pathname}${parsed.search}`,
                body: options.body || '',
            }).then(
                (value) => finish(resolve, value),
                (error) => finish(reject, error),
            );
        });
        return new Response(result.body, { status: result.status, headers: result.headers });
    }
    return rawFetch(normalizedUrl, options);
};

export const API_ENDPOINTS = Object.freeze({
    STATUS: '/api/status',
    HEALTH: '/api/health',
    JUPYTER_START: '/api/start',
    JUPYTER_STOP: '/api/stop',
    JUPYTER_RESTART: '/api/restart',
    CONFIG_SAVE: '/api/save_config',
    CONFIG_LOAD: '/api/load_config',
    CONFIG_RESET: '/api/reset_config',
    QUICKFORM_TEST: '/api/quickform/test',
    QUICKFORM_TASKS: '/api/quickform/tasks',
    QUICKFORM_CREATE_TASK: '/api/quickform/tasks/create',
    PYTHON_DETECT: '/api/detect_python',
    PYTHON_REPAIR_XEDU: '/api/repair_xedu',
    AI_ASK: '/api/ai/ask',
    AI_TEST_CONFIG: '/api/ai/test_config',
    AI_SAVE_CONFIG: '/api/ai/save_config',
    PYTHON_PIP: '/api/python/pip',
});

class APIClient {
    constructor(baseURL = DEFAULT_BASE_URL) {
        this.baseURL = baseURL;
        this.timeout = 25000; // 25秒超时，优化后的启动时间
    }

    async request(endpoint, options = {}) {
        const url = normalizeApiUrl(endpoint, this.baseURL);
        const { timeoutMs = this.timeout, headers, transport = 'auto', ...restOptions } = options || {};
        const requestHeaders = new Headers(headers || {});
        if (!isFormDataBody(restOptions.body) && !requestHeaders.has('Content-Type')) {
            requestHeaders.set('Content-Type', 'application/json');
        }

        const config = {
            ...restOptions,
            headers: requestHeaders,
        };

        console.debug(`[API] Request: ${config.method || 'GET'} ${url}`, getRequestLogMeta(config));

        const controller = new AbortController();
        const signal = config.signal || controller.signal;
        const timeoutId = timeoutMs > 0 && !config.signal
            ? setTimeout(() => controller.abort(new Error(`Request timeout after ${timeoutMs}ms`)), timeoutMs)
            : null;

        try {
            return await fetchWithBase(url, { ...config, signal }, this.baseURL, transport);
        } catch (error) {
            if (error?.name === 'AbortError' || /timeout/i.test(String(error?.message || ''))) {
                throw new APIError(`Request timeout after ${timeoutMs}ms`, 0, error?.message || 'Request timeout');
            }
            throw new APIError(`Network error: ${error?.message || 'Unknown error'}`, 0, error?.message || '');
        } finally {
            if (timeoutId) {
                clearTimeout(timeoutId);
            }
        }
    }

    /**
     * 通用API调用方法
     * @param {string} endpoint API端点
     * @param {Object} options 请求选项
     * @returns {Promise} API响应
     */
    async call(endpoint, options = {}) {
        try {
            const response = await this.request(endpoint, options);
            if (!response.ok) {
                const errorText = await response.text();
                throw new APIError(
                    `HTTP ${response.status}: ${response.statusText}`,
                    response.status,
                    errorText
                );
            }

            const rawText = await response.text();
            const data = rawText ? JSON.parse(rawText) : {};
            console.debug(`[API] Response: ${endpoint}`, { status: response.status });
            return data;

        } catch (error) {
            console.error(`[API] Error: ${endpoint}`, {
                name: error?.name || 'Error',
                status: error?.status || 0,
                message: error instanceof APIError ? error.message : 'API request failed',
            });
            if (error instanceof APIError) {
                throw error;
            }
            throw new APIError(`Invalid JSON response: ${error.message}`, 200, error.message);
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
        return this.get(API_ENDPOINTS.STATUS);
    }

    async getHealth() {
        return this.get(API_ENDPOINTS.HEALTH);
    }

    // 控制相关
    async startJupyter(config = {}) {
        return this.post(API_ENDPOINTS.JUPYTER_START, config);
    }

    async stopJupyter() {
        return this.post(API_ENDPOINTS.JUPYTER_STOP, {});
    }

    async restartJupyter() {
        return this.post(API_ENDPOINTS.JUPYTER_RESTART, {});
    }

    // 配置相关
    async saveConfig(config) {
        return this.post(API_ENDPOINTS.CONFIG_SAVE, config);
    }

    async loadConfig() {
        return this.get(API_ENDPOINTS.CONFIG_LOAD);
    }

    async resetConfig() {
        return this.post(API_ENDPOINTS.CONFIG_RESET, {});
    }

    async testQuickForm(config = {}) {
        return this.post(API_ENDPOINTS.QUICKFORM_TEST, { config });
    }

    async listQuickFormTasks(config = {}) {
        return this.post(API_ENDPOINTS.QUICKFORM_TASKS, { config });
    }

    async createQuickFormTask(payload = {}) {
        return this.post(API_ENDPOINTS.QUICKFORM_CREATE_TASK, payload);
    }

    // 环境检测
    async detectPython() {
        return this.get(API_ENDPOINTS.PYTHON_DETECT);
    }

    // AI助手
    async askAI(image, question, history = [], config = null, context = null) {
        return this.post(API_ENDPOINTS.AI_ASK, {
            image,
            question,
            history,
            config,
            context,
            teacher_code: context?.teacher_mode?.code || ''
        });
    }

    // AI配置
    async testAIConfig(config) {
        return this.post(API_ENDPOINTS.AI_TEST_CONFIG, {
            config
        });
    }

    async saveAIConfig(config) {
        return this.post(API_ENDPOINTS.AI_SAVE_CONFIG, {
            config
        });
    }

    // Python 包管理（install/uninstall/list）
    async managePythonPackage(payload) {
        return this.post(API_ENDPOINTS.PYTHON_PIP, payload);
    }
}

// 创建单例实例
const apiClient = new JupyterAPI();

// 导出
export { APIClient, APIError, JupyterAPI };
export default apiClient;
