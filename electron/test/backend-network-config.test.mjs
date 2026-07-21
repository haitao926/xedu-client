import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const {
  LOCAL_HOST,
  NETWORK_HOST,
  readAllowNetworkAccess,
  resolveBackendBindHost,
  resolveBackendConnectHost,
} = require('../main/backend-network-config.js');

function fakeFs(config) {
  return {
    readFileSync() {
      return JSON.stringify(config);
    },
  };
}

test('backend binds to the LAN by default and respects an explicit disable', () => {
  const configPath = '/user-data/config/config.json';

  assert.equal(readAllowNetworkAccess(configPath, fakeFs({ ui: {} })), true);
  assert.equal(resolveBackendBindHost(configPath, { fsImpl: fakeFs({ ui: {} }) }), NETWORK_HOST);
  assert.equal(resolveBackendBindHost(configPath, { fsImpl: fakeFs({ ui: { allow_network_access: false } }) }), LOCAL_HOST);
});

test('backend binds to the LAN when classroom network access is enabled', () => {
  const configPath = '/user-data/config/config.json';
  const fsImpl = fakeFs({ ui: { allow_network_access: true } });

  assert.equal(readAllowNetworkAccess(configPath, fsImpl), true);
  assert.equal(resolveBackendBindHost(configPath, { fsImpl }), NETWORK_HOST);
});

test('Electron uses loopback to connect even when backend is LAN-enabled', () => {
  assert.equal(resolveBackendConnectHost({ XEDU_BACKEND_BIND_HOST: NETWORK_HOST }), LOCAL_HOST);
  assert.equal(resolveBackendConnectHost({ XEDU_BACKEND_HOST: '192.168.1.20' }), '192.168.1.20');
});
