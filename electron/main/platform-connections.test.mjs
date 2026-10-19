import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { normalizeHttpOrigin } = require('./platform-connections.js');

test('HTTP origin accepts valid IPv4, DNS, loopback, and IPv6 authorities', () => {
    for (const [value, expected] of [
        ['http://10.19.174.251:8088', 'http://10.19.174.251:8088'],
        ['http://203.0.113.20:8088/', 'http://203.0.113.20:8088'],
        ['http://classroom.example:8088', 'http://classroom.example:8088'],
        ['http://localhost:8088', 'http://localhost:8088'],
        ['http://[::1]:8088', 'http://[::1]:8088'],
    ]) assert.equal(normalizeHttpOrigin(value), expected, value);
});
test('HTTP origin rejects malformed or decorated authorities', () => {
    for (const value of [
        'https://classroom.example',
        'http://',
        'http://user@classroom.example:8088',
        'http://classroom.example:8088/path',
        'http://classroom.example:8088?mode=lan',
        'http://classroom.example:8088#fragment',
        'http://010.019.174.251:8088',
        'http://10.19.174.251:65536',
    ]) assert.equal(normalizeHttpOrigin(value), '', value);
});
