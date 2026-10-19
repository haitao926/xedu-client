const net = require('node:net');

function normalizeHttpOrigin(value) {
    if (typeof value !== 'string' || /[\x00-\x1f\x7f-\x9f]/.test(value)) return '';
    const raw = value.trim();
    const match = /^http:\/\/([^/?#@\\\s]+)\/?$/i.exec(raw);
    if (!match) return '';

    try {
        const parsed = new URL(raw);
        if (parsed.protocol !== 'http:' || parsed.username || parsed.password
            || !parsed.hostname || (parsed.pathname !== '' && parsed.pathname !== '/')
            || parsed.search || parsed.hash) return '';
        const authority = match[1];
        const rawHost = authority.startsWith('[')
            ? authority.slice(1, authority.indexOf(']'))
            : authority.replace(/:\d+$/, '');
        if (net.isIP(rawHost) === 4 && parsed.hostname !== rawHost) return '';
        if (/^[\d.]+$/.test(rawHost) && net.isIP(rawHost) !== 4) return '';
        return parsed.origin;
    } catch (_) {
        return '';
    }
}

module.exports = {
    normalizeHttpOrigin,
};
