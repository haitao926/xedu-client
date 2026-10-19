const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const patchPath = path.join(__dirname, '../scripts/patch-scratch.js');
const rendererPath = path.join(__dirname,
  '../node_modules/@scratch/scratch-gui/src/playground/render-gui-standalone.jsx');

function patchRenderer(source, renderer = fs.readFileSync(rendererPath, 'utf8')) {
  const start = source.indexOf('const standaloneRenderer =');
  const end = source.indexOf('const projectSaverHOC =', start);
  const files = new Map([[rendererPath, renderer]]);
  vm.runInNewContext(source.slice(start, end), {
    path, guiRoot: path.dirname(path.dirname(path.dirname(rendererPath))),
    assertExists() {},
    patchFile(filePath, transform) {
      files.set(filePath, transform(files.get(filePath)));
    },
  });
  return files.get(rendererPath);
}

function createBridgeHarness(options = {}) {
  const source = patchRenderer(fs.readFileSync(patchPath, 'utf8'));
  const helpers = source.slice(source.indexOf('const getXEduScratchParams ='),
    source.indexOf('const onClickLogo ='));
  const listeners = new Map();
  const messages = [];
  const requests = [];
  const scratchGui = {
    projectTitle: 'Renamed project.sb3', projectChanged: true,
    vm: { async saveProjectSb3() { return new Blob([JSON.stringify({ dirty: scratchGui.projectChanged })]); } },
  };
  const parent = { postMessage(message, origin, transfer) { messages.push({ message, origin, transfer }); } };
  const window = {
    parent,
    location: {
      search: `?apiBase=http://127.0.0.1:5123&bridgeToken=secret${options.unbound ? '' : '&rootToken=local&project=starter.sb3'}`,
      origin: 'http://127.0.0.1:5123',
    },
    addEventListener(type, listener) { listeners.set(type, listener); },
  };
  const state = { store: {
    getState: () => ({ scratchGui }),
    dispatch(action) { if (action === 'unchanged') scratchGui.projectChanged = false; },
  } };
  const context = vm.createContext({
    window, state, URLSearchParams, ArrayBuffer, Blob,
    document: { createElement() { throw new Error('Unexpected browser download'); } },
    setProjectUnchanged: () => 'unchanged',
    fetch: async (url, request) => {
      requests.push({ url, ...request });
      return options.persist ? options.persist() : { ok: true, json: async () => ({ success: true }) };
    },
  });
  vm.runInContext(`${helpers}\nglobalThis.bridge = createXEduScratchBridge(state);
    bindXEduScratchHostBridge(state, bridge);`, context);
  return {
    bridge: context.bridge, scratchGui, requests, messages,
    dispatch(data, source = parent) {
      return listeners.get('message')({ source, data });
    },
  };
}

test('submission persists and returns the same current VM snapshot after local save completes', async () => {
  let completeSave;
  const saved = new Promise(resolve => { completeSave = resolve; });
  const harness = createBridgeHarness({ persist: () => saved });
  let serializations = 0;
  harness.scratchGui.vm.saveProjectSb3 = async () => {
    serializations += 1;
    return new Blob([JSON.stringify({ dirty: harness.scratchGui.projectChanged, edit: 42 })]);
  };
  const request = harness.dispatch({
    type: 'xedu:scratch-host-action', action: 'export-for-submission',
    requestId: 'submit-1', bridgeToken: 'secret',
  });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(harness.messages.some(({ message }) => message.requestId === 'submit-1'), false);
  assert.equal(harness.requests.length, 1);
  assert.equal(harness.requests[0].method, 'PUT');
  completeSave({ ok: true, json: async () => ({ success: true }) });
  await request;
  const response = harness.messages.find(({ message }) => message.requestId === 'submit-1');
  assert.ok(response.message.result, response.message.error);
  const result = response.message.result;
  assert.ok(result.bytes instanceof ArrayBuffer);
  assert.equal(result.mime, 'application/x.scratch.sb3');
  assert.equal(result.filename, 'Renamed project.sb3');
  assert.deepEqual(Buffer.from(result.bytes), Buffer.from(await harness.requests[0].body.arrayBuffer()));
  assert.deepEqual(JSON.parse(Buffer.from(result.bytes).toString()), { dirty: true, edit: 42 });
  assert.equal(serializations, 1);
  assert.equal(harness.scratchGui.projectChanged, false);
  assert.equal(response.transfer.length, 1);
  assert.deepEqual(Buffer.from(response.transfer[0]), Buffer.from(result.bytes));
});

test('submission fails without persisted bytes when local persistence fails', async () => {
  for (const persist of [
    async () => ({ ok: false, status: 507, json: async () => ({ success: false, message: 'disk full' }) }),
    async () => ({ ok: true, status: 200, json: async () => ({ success: false, message: 'disk full' }) }),
    async () => { throw new Error('disk full'); },
  ]) {
    const harness = createBridgeHarness({ persist });
    await harness.dispatch({ type: 'xedu:scratch-host-action', action: 'export-for-submission',
      requestId: 'failed', bridgeToken: 'secret' });
    const response = harness.messages.find(({ message }) => message.requestId === 'failed').message;
    assert.match(response.error, /disk full/);
    assert.equal(response.result, undefined);
    assert.equal(harness.scratchGui.projectChanged, true);
  }
});

test('submission refuses unbound projects and missing current VM', async () => {
  for (const options of [{ unbound: true }, {}]) {
    const harness = createBridgeHarness(options);
    if (!options.unbound) harness.scratchGui.vm = null;
    await harness.dispatch({ type: 'xedu:scratch-host-action', action: 'export-for-submission',
      requestId: 'unavailable', bridgeToken: 'secret' });
    const response = harness.messages.find(({ message }) => message.requestId === 'unavailable').message;
    assert.match(response.error, /保存|准备/);
    assert.equal(response.result, undefined);
    assert.equal(harness.requests.length, 0);
  }
});

test('submission ignores unauthenticated requests', async () => {
  const harness = createBridgeHarness();
  const request = { type: 'xedu:scratch-host-action', action: 'export-for-submission',
    requestId: 'unauthorized', bridgeToken: 'secret' };
  await harness.dispatch({ ...request, bridgeToken: 'wrong' });
  await harness.dispatch(request, {});
  assert.equal(harness.requests.length, 0);
  assert.equal(harness.messages.some(({ message }) => message.requestId === request.requestId), false);
});

test('submission bridge patch is idempotent on an already patched GUI', () => {
  const source = fs.readFileSync(patchPath, 'utf8');
  const patched = patchRenderer(source);
  assert.equal(patchRenderer(source, patched), patched);
});
