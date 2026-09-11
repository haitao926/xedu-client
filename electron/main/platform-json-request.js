const http = require('http');
const https = require('https');

const MAX_BODY_BYTES = 1024 * 1024;

function isAllowedPlatformUrl(value) {
    try {
        const parsed = new URL(String(value));
        if (parsed.protocol === 'https:') return true;
        return parsed.protocol === 'http:' && ['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname);
    } catch (_) {
        return false;
    }
}

function normalizeHeaders(headers) {
    const source = headers && typeof headers === 'object' ? headers : {};
    const allowed = {};
    Object.entries(source).forEach(([name, value]) => {
        const key = String(name || '').toLowerCase();
        if (key === 'authorization' || key === 'content-type' || key === 'accept') {
            allowed[key === 'authorization' ? 'Authorization' : (key === 'content-type' ? 'Content-Type' : 'Accept')] = String(value || '');
        }
    });
    if (!allowed['Content-Type']) allowed['Content-Type'] = 'application/json';
    return allowed;
}

function platformJsonRequest(request, { httpClient = http, httpsClient = https } = {}) {
    const url = String(request?.url || '').trim();
    const method = String(request?.method || 'POST').toUpperCase();
    if (!isAllowedPlatformUrl(url) || method !== 'POST') {
        return Promise.resolve({
            status: 400,
            headers: {},
            body: JSON.stringify({ success: false, message: 'invalid platform request' }),
        });
    }

    const body = request?.body == null ? '' : String(request.body);
    if (Buffer.byteLength(body, 'utf8') > MAX_BODY_BYTES) {
        return Promise.resolve({
            status: 413,
            headers: {},
            body: JSON.stringify({ success: false, message: 'request too large' }),
        });
    }

    let parsed;
    try {
        parsed = new URL(url);
    } catch (_) {
        return Promise.resolve({
            status: 400,
            headers: {},
            body: JSON.stringify({ success: false, message: 'invalid platform request' }),
        });
    }

    const headers = normalizeHeaders(request?.headers);
    headers['Content-Length'] = String(Buffer.byteLength(body, 'utf8'));
    const client = parsed.protocol === 'https:' ? httpsClient : httpClient;

    return new Promise((resolve) => {
        const proxyRequest = client.request({
            protocol: parsed.protocol,
            hostname: parsed.hostname,
            port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
            path: `${parsed.pathname}${parsed.search}`,
            method,
            timeout: 30000,
            headers,
        }, (response) => {
            let responseBody = '';
            response.setEncoding('utf8');
            response.on('data', (chunk) => { responseBody += chunk; });
            response.on('end', () => resolve({
                status: response.statusCode || 502,
                headers: { 'content-type': String(response.headers['content-type'] || 'application/json') },
                body: responseBody,
            }));
        });
        proxyRequest.on('error', () => resolve({
            status: 502,
            headers: {},
            body: JSON.stringify({ success: false, message: 'platform unavailable' }),
        }));
        proxyRequest.on('timeout', () => {
            proxyRequest.destroy();
            resolve({
                status: 504,
                headers: {},
                body: JSON.stringify({ success: false, message: 'request timeout' }),
            });
        });
        proxyRequest.end(body);
    });
}

module.exports = {
    MAX_BODY_BYTES,
    isAllowedPlatformUrl,
    platformJsonRequest,
};
