import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const mainPath = fileURLToPath(new URL('../main/main.js', import.meta.url));
const mainDirectory = path.dirname(mainPath);
const requireFromMain = createRequire(mainPath);
const mainSource = readFileSync(mainPath, 'utf8');

function createElectronHarness() {
  const appHandlers = new Map();
  let quitCalls = 0;

  const app = {
    isPackaged: false,
    getPath: () => '/tmp/xedu-client-test',
    getVersion: () => 'test',
    on: (eventName, handler) => appHandlers.set(eventName, handler),
    quit: () => { quitCalls += 1; },
    requestSingleInstanceLock: () => true,
    setAppUserModelId: () => {},
    whenReady: () => new Promise(() => {}),
  };

  return {
    appHandlers,
    electron: {
      app,
      BrowserWindow: { getAllWindows: () => [] },
      Menu: {},
      shell: {},
      ipcMain: { handle: () => {}, on: () => {} },
      dialog: {},
      clipboard: {},
      session: { defaultSession: {} },
    },
    getQuitCalls: () => quitCalls,
  };
}

function loadMain({ backendProcess = null, httpImpl = { request() {} } } = {}) {
  const electronHarness = createElectronHarness();
  const instrumentedSource = mainSource.replace(
    'let backendProcess;',
    'let backendProcess = globalThis.__testBackendProcess;'
  );
  assert.notEqual(instrumentedSource, mainSource, 'test harness must inject the managed backend process');

  const module = { exports: {} };
  const processStub = {
    arch: 'arm64',
    env: { XEDU_CLIENT_CAPABILITY: 'shutdown-test-capability' },
    on: () => {},
    platform: 'darwin',
    stderr: { on: () => {} },
    stdout: { on: () => {} },
  };
  const quietConsole = {
    error: () => {},
    info: () => {},
    log: () => {},
    warn: () => {},
  };
  const context = vm.createContext({
    __testBackendProcess: backendProcess,
    Buffer,
    URL,
    clearTimeout,
    console: quietConsole,
    process: processStub,
    setTimeout,
  });
  const wrappedSource = [
    '(function (exports, require, module, __filename, __dirname) {',
    instrumentedSource,
    'module.exports.__shutdownTest = { stopJupyterGracefully, stopManagedBackend };',
    '})',
  ].join('\n');
  const evaluateMain = new vm.Script(wrappedSource, { filename: mainPath }).runInContext(context);
  const testRequire = (request) => {
    if (request === 'electron') return electronHarness.electron;
    if (request === 'http') return httpImpl;
    return requireFromMain(request);
  };

  evaluateMain(module.exports, testRequire, module, mainPath, mainDirectory);
  return { ...electronHarness, shutdown: module.exports.__shutdownTest };
}

function createHttpHarness() {
  const requests = [];

  return {
    requests,
    httpImpl: {
      request(options, onResponse) {
        const request = new EventEmitter();
        request.options = options;
        request.headers = { ...(options.headers || {}) };
        request.destroy = () => {};
        request.setHeader = (name, value) => { request.headers[name] = value; };
        request.end = () => {
          queueMicrotask(() => {
            const response = new EventEmitter();
            onResponse(response);
            if (options.path === '/api/status') {
              queueMicrotask(() => {
                response.emit('data', JSON.stringify({ running: true, pid: 42 }));
                response.emit('end');
              });
            }
          });
        };
        requests.push(request);
        return request;
      },
    },
  };
}

test('macOS closing the last window requests a full application quit', () => {
  const harness = loadMain();

  harness.appHandlers.get('window-all-closed')();

  assert.equal(harness.getQuitCalls(), 1);
});

test('Jupyter shutdown authenticates both status and stop API requests', async () => {
  const httpHarness = createHttpHarness();
  const harness = loadMain({ httpImpl: httpHarness.httpImpl });

  await harness.shutdown.stopJupyterGracefully(25);

  assert.deepEqual(
    httpHarness.requests.map((request) => request.headers['X-XEdu-Client-Token']),
    ['shutdown-test-capability', 'shutdown-test-capability']
  );
});

test('managed backend receives SIGKILL when it stays alive past the graceful timeout', async () => {
  const backendProcess = new EventEmitter();
  const signals = [];
  backendProcess.killed = false;
  backendProcess.kill = (signal) => {
    signals.push(signal || 'SIGTERM');
    backendProcess.killed = true;
    return true;
  };
  const harness = loadMain({ backendProcess });

  await harness.shutdown.stopManagedBackend(5);

  assert.deepEqual(signals, ['SIGTERM', 'SIGKILL']);
});

test('before-quit completes managed backend shutdown before retrying application quit', async () => {
  const backendProcess = new EventEmitter();
  const signals = [];
  backendProcess.killed = false;
  backendProcess.kill = (signal) => {
    signals.push(signal || 'SIGTERM');
    backendProcess.killed = true;
    queueMicrotask(() => backendProcess.emit('close', 0, signal || 'SIGTERM'));
    return true;
  };
  const httpHarness = createHttpHarness();
  const harness = loadMain({ backendProcess, httpImpl: httpHarness.httpImpl });
  let preventDefaultCalls = 0;

  harness.appHandlers.get('before-quit')({
    preventDefault: () => { preventDefaultCalls += 1; },
  });
  await new Promise((resolve) => setTimeout(resolve, 25));

  assert.equal(preventDefaultCalls, 1);
  assert.deepEqual(signals, ['SIGTERM']);
  assert.equal(harness.getQuitCalls(), 1);
});
