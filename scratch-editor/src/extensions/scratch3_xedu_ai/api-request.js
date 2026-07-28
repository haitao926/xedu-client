let requestSequence = 0;

function nextRequestId() {
    requestSequence += 1;
    return `scratch-api-${Date.now()}-${requestSequence}`;
}

function responseFromPayload(payload) {
    const body = String(payload?.body || '');
    return {
        ok: Number(payload?.status || 0) >= 200 && Number(payload?.status || 0) < 300,
        status: Number(payload?.status || 502),
        text: async () => body,
        json: async () => JSON.parse(body || '{}'),
    };
}

function requestThroughHost(url, options = {}) {
    const parsed = new URL(String(url), window.location.href);
    const requestId = nextRequestId();
    return new Promise((resolve, reject) => {
        let settled = false;
        const onMessage = (event) => {
            const payload = event.data;
            if (
                event.source !== window.parent
                || payload?.type !== 'xedu:scratch-api-response'
                || payload.requestId !== requestId
            ) return;
            settled = true;
            window.clearTimeout(timeoutId);
            window.removeEventListener('message', onMessage);
            if (payload.error) reject(new Error(payload.error));
            else resolve(responseFromPayload(payload));
        };
        const timeoutId = window.setTimeout(() => {
            if (settled) return;
            settled = true;
            window.removeEventListener('message', onMessage);
            reject(new Error('Scratch AI 请求超时'));
        }, 30000);
        window.addEventListener('message', onMessage);
        window.parent.postMessage({
            type: 'xedu:scratch-api-request',
            requestId,
            path: `${parsed.pathname}${parsed.search}`,
            method: String(options.method || 'GET').toUpperCase(),
            body: options.body == null ? '' : options.body,
            headers: options.headers || {},
        }, '*');
        void timeoutId;
    });
}

function requestXEduApi(url, options = {}) {
    if (
        typeof window !== 'undefined'
        && window.parent !== window
        && typeof window.parent.postMessage === 'function'
    ) {
        return requestThroughHost(url, options);
    }
    return fetch(url, options);
}

module.exports = {requestXEduApi};
