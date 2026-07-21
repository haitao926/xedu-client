const fs = require('fs');

const LOCAL_HOST = '127.0.0.1';
const NETWORK_HOST = '0.0.0.0';

function parseBoolean(value) {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
        return ['true', '1', 'yes', 'on'].includes(value.trim().toLowerCase());
    }
    return Boolean(value);
}

function readAllowNetworkAccess(configPath, fsImpl = fs) {
    if (!configPath) return true;
    try {
        const config = JSON.parse(fsImpl.readFileSync(configPath, 'utf8'));
        return config?.ui?.allow_network_access === undefined
            ? true
            : parseBoolean(config.ui.allow_network_access);
    } catch (_) {
        return true;
    }
}

function resolveBackendBindHost(configPath, { env = process.env, fsImpl = fs } = {}) {
    const explicitHost = String(env.XEDU_BACKEND_BIND_HOST || '').trim();
    if (explicitHost) return explicitHost;
    return readAllowNetworkAccess(configPath, fsImpl) ? NETWORK_HOST : LOCAL_HOST;
}

function resolveBackendConnectHost(env = process.env) {
    const configuredHost = String(env.XEDU_BACKEND_CONNECT_HOST || env.XEDU_BACKEND_HOST || env.XEDU_API_HOST || '').trim();
    if (!configuredHost || configuredHost === NETWORK_HOST || configuredHost === '::') {
        return LOCAL_HOST;
    }
    return configuredHost;
}

module.exports = {
    LOCAL_HOST,
    NETWORK_HOST,
    readAllowNetworkAccess,
    resolveBackendBindHost,
    resolveBackendConnectHost,
};
