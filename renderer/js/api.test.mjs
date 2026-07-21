import assert from 'node:assert/strict';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const apiModuleUrl = pathToFileURL(resolve(import.meta.dirname, './api.js'));

async function loadApiModule({ fetchImpl, windowProps = {} } = {}) {
    const previousWindow = globalThis.window;
    const previousFetch = globalThis.fetch;
    const testWindow = { ...windowProps };

    if (fetchImpl) {
        testWindow.fetch = fetchImpl;
        globalThis.fetch = fetchImpl;
    }

    globalThis.window = testWindow;

    const cacheBust = `${apiModuleUrl.href}?t=${Date.now()}-${Math.random()}`;
    const module = await import(cacheBust);

    return {
        ...module,
        window: testWindow,
        cleanup() {
            if (previousWindow === undefined) {
                delete globalThis.window;
            } else {
                globalThis.window = previousWindow;
            }
            if (previousFetch === undefined) {
                delete globalThis.fetch;
            } else {
                globalThis.fetch = previousFetch;
            }
        }
    };
}

function createJsonResponse(payload, init = {}) {
    return new Response(JSON.stringify(payload), {
        status: init.status || 200,
        statusText: init.statusText || 'OK',
        headers: {
            'content-type': 'application/json',
            ...(init.headers || {}),
        },
    });
}

test('api module keeps window.fetch untouched on import', async () => {
    const fetchImpl = async () => createJsonResponse({ success: true });
    const { window, cleanup } = await loadApiModule({
        fetchImpl,
        windowProps: { xeduConfig: { apiBase: 'http://127.0.0.1:5123' } },
    });

    try {
        assert.equal(window.fetch, fetchImpl);
        assert.equal(window.__XEDU_FETCH_PATCHED__, undefined);
        assert.equal(window.__XEDU_ORIGINAL_FETCH__, undefined);
    } finally {
        cleanup();
    }
});

test('APIClient post normalizes /api URLs and sends JSON bodies', async () => {
    const calls = [];
    const fetchImpl = async (url, options) => {
        calls.push({ url, options });
        return createJsonResponse({ success: true, url });
    };
    const { APIClient, cleanup } = await loadApiModule({ fetchImpl });

    try {
        const client = new APIClient('http://127.0.0.1:5123/');
        const payload = await client.post('/api/demo', { foo: 'bar' });

        assert.deepEqual(payload, { success: true, url: 'http://127.0.0.1:5123/api/demo' });
        assert.equal(calls.length, 1);
        assert.equal(calls[0].url, 'http://127.0.0.1:5123/api/demo');
        assert.equal(calls[0].options.method, 'POST');
        assert.equal(calls[0].options.body, '{"foo":"bar"}');
        assert.equal(new Headers(calls[0].options.headers).get('content-type'), 'application/json');
    } finally {
        cleanup();
    }
});

test('APIClient debug logs redact request and response payloads', async () => {
    const debugCalls = [];
    const originalDebug = console.debug;
    console.debug = (...args) => debugCalls.push(args);
    const fetchImpl = async () => createJsonResponse({ secret: 'response-secret' });
    const { APIClient, cleanup } = await loadApiModule({ fetchImpl });

    try {
        const client = new APIClient('http://127.0.0.1:5123');
        await client.post('/api/config', { api_key: 'request-secret' });
        await client.request('/api/headers', {
            headers: { Authorization: 'Bearer header-secret' },
        });
        const serializedLogs = JSON.stringify(debugCalls);

        assert.doesNotMatch(serializedLogs, /request-secret|response-secret|header-secret/);
        assert.match(serializedLogs, /\[redacted\]/);
        assert.match(serializedLogs, /"status":200/);
    } finally {
        console.debug = originalDebug;
        cleanup();
    }
});

test('APIClient request keeps FormData bodies on fetch and does not route them through Electron IPC', async () => {
    const fetchCalls = [];
    const electronCalls = [];
    const fetchImpl = async (url, options) => {
        fetchCalls.push({ url, options });
        return createJsonResponse({ success: true });
    };
    const { APIClient, cleanup } = await loadApiModule({
        fetchImpl,
        windowProps: {
            electronAPI: {
                apiRequest: async (request) => {
                    electronCalls.push(request);
                    return { status: 200, headers: { 'content-type': 'application/json' }, body: '{"success":true}' };
                },
            },
        },
    });

    try {
        const client = new APIClient('http://127.0.0.1:5123');
        const form = new FormData();
        form.set('file', new Blob(['demo'], { type: 'text/plain' }), 'demo.txt');

        const response = await client.request('/api/upload', {
            method: 'POST',
            body: form,
        });

        assert.equal(response.ok, true);
        assert.equal(fetchCalls.length, 1);
        assert.equal(electronCalls.length, 0);
        assert.equal(fetchCalls[0].url, 'http://127.0.0.1:5123/api/upload');
        assert.equal(fetchCalls[0].options.body, form);
        assert.equal(new Headers(fetchCalls[0].options.headers).has('content-type'), false);
    } finally {
        cleanup();
    }
});

test('APIClient request uses Electron IPC only for supported API requests', async () => {
    const fetchCalls = [];
    const electronCalls = [];
    const fetchImpl = async (url, options) => {
        fetchCalls.push({ url, options });
        return createJsonResponse({ via: 'fetch' });
    };
    const { APIClient, cleanup } = await loadApiModule({
        fetchImpl,
        windowProps: {
            electronAPI: {
                apiRequest: async (request) => {
                    electronCalls.push(request);
                    return {
                        status: 200,
                        headers: { 'content-type': 'application/json' },
                        body: '{"via":"electron"}',
                    };
                },
            },
        },
    });

    try {
        const client = new APIClient('http://127.0.0.1:5123');
        const response = await client.request('/api/status', {
            method: 'POST',
            body: '{"ping":true}',
        });
        const external = await client.request('https://example.com/data.json');

        assert.deepEqual(await response.json(), { via: 'electron' });
        assert.deepEqual(await external.json(), { via: 'fetch' });
        assert.equal(electronCalls.length, 1);
        assert.deepEqual(electronCalls[0], {
            method: 'POST',
            path: '/api/status',
            body: '{"ping":true}',
        });
        assert.equal(fetchCalls.length, 1);
        assert.equal(fetchCalls[0].url, 'https://example.com/data.json');
    } finally {
        cleanup();
    }
});

test('APIClient request can explicitly bypass IPC for streaming fetch responses', async () => {
    const fetchCalls = [];
    const electronCalls = [];
    const fetchImpl = async (url, options) => {
        fetchCalls.push({ url, options });
        return new Response('stream-body', { status: 200 });
    };
    const { APIClient, cleanup } = await loadApiModule({
        fetchImpl,
        windowProps: {
            electronAPI: {
                apiRequest: async (request) => {
                    electronCalls.push(request);
                    return { status: 200, headers: {}, body: '{}' };
                },
            },
        },
    });

    try {
        const client = new APIClient('http://127.0.0.1:5123');
        const response = await client.request('/api/python/pip', {
            method: 'POST',
            body: '{}',
            transport: 'fetch',
        });

        assert.equal(await response.text(), 'stream-body');
        assert.equal(fetchCalls.length, 1);
        assert.equal(electronCalls.length, 0);
    } finally {
        cleanup();
    }
});

test('APIClient request turns aborted requests into timeout errors', async () => {
    const fetchImpl = async (_url, options) => new Promise((resolve, reject) => {
        options.signal.addEventListener('abort', () => {
            reject(new DOMException('The operation was aborted.', 'AbortError'));
        }, { once: true });
        void resolve;
    });
    const { APIClient, cleanup } = await loadApiModule({ fetchImpl });

    try {
        const client = new APIClient('http://127.0.0.1:5123');
        client.timeout = 20;
        await assert.rejects(
            () => client.request('/api/slow'),
            (error) => error?.name === 'APIError'
                && error.status === 0
                && error.message === 'Request timeout after 20ms'
        );
    } finally {
        cleanup();
    }
});

test('APIClient request applies timeout cancellation to Electron IPC requests', async () => {
    const { APIClient, cleanup } = await loadApiModule({
        windowProps: {
            electronAPI: { apiRequest: async () => new Promise(() => {}) },
        },
    });

    try {
        const client = new APIClient('http://127.0.0.1:5123');
        await assert.rejects(
            client.request('/api/health', { method: 'GET', timeoutMs: 10 }),
            (error) => error.name === 'APIError' && /timeout/i.test(error.message),
        );
    } finally {
        cleanup();
    }
});

test('APIClient call surfaces HTTP errors and invalid JSON as APIError', async () => {
    const responses = [
        new Response('backend down', { status: 503, statusText: 'Service Unavailable' }),
        new Response('not-json', { status: 200, headers: { 'content-type': 'application/json' } }),
    ];
    const fetchImpl = async () => responses.shift();
    const { APIClient, cleanup } = await loadApiModule({ fetchImpl });

    try {
        const client = new APIClient('http://127.0.0.1:5123');

        await assert.rejects(
            () => client.get('/api/error'),
            (error) => error?.name === 'APIError'
                && error.status === 503
                && error.details === 'backend down'
        );

        await assert.rejects(
            () => client.get('/api/bad-json'),
            (error) => error?.name === 'APIError'
                && error.status === 200
                && error.message.startsWith('Invalid JSON response:')
        );
    } finally {
        cleanup();
    }
});

test('getApiErrorMessage uses a structured backend error message', async () => {
    const { APIError, getApiErrorMessage, cleanup } = await loadApiModule();

    try {
        const error = new APIError(
            'HTTP 500: Internal Server Error',
            500,
            JSON.stringify({ success: false, error: 'AI API 调用失败: 400 - invalid temperature' }),
        );

        assert.equal(
            getApiErrorMessage(error, '请求失败'),
            'AI API 调用失败: 400 - invalid temperature',
        );
        assert.equal(getApiErrorMessage(new Error('连接失败'), '请求失败'), '连接失败');
    } finally {
        cleanup();
    }
});

test('APIClient error logs omit response details', async () => {
    const errorCalls = [];
    const originalError = console.error;
    console.error = (...args) => errorCalls.push(args);
    const fetchImpl = async () => new Response('secret-response-body', {
        status: 500,
        statusText: 'Internal Server Error',
    });
    const { APIClient, cleanup } = await loadApiModule({ fetchImpl });

    try {
        const client = new APIClient('http://127.0.0.1:5123');
        await assert.rejects(() => client.get('/api/error'));
        assert.doesNotMatch(JSON.stringify(errorCalls), /secret-response-body/);
        assert.match(JSON.stringify(errorCalls), /"status":500/);
    } finally {
        console.error = originalError;
        cleanup();
    }
});
