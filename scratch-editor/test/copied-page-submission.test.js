const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

function harness(persistenceFails = false) {
    const source = fs.readFileSync(path.join(__dirname, '../scripts/copy-build.js'), 'utf8');
    const start = source.indexOf('`<!doctype html>');
    const end = source.indexOf("`, 'utf8');", start) + 1;
    const html = vm.runInNewContext(source.slice(start, end));
    const helpers = html.slice(html.indexOf('    const getApiBase ='), html.indexOf('    const boot ='));
    const messages = [];
    const persisted = [];
    let listener;
    let serializations = 0;
    const scratchGui = {
        projectTitle: 'current.sb3',
        projectChanged: true,
        vm: { async saveProjectSb3() {
            serializations += 1;
            return new Blob(['current dirty project']);
        } },
    };
    const state = { store: { getState: () => ({ scratchGui }) } };
    const parent = { postMessage: (message, origin, transfer) => messages.push({ message, transfer }) };
    const window = { parent, addEventListener: (name, handler) => { listener = handler; } };
    const params = new URLSearchParams('apiBase=http://127.0.0.1:5123&rootToken=root&project=starter.sb3&bridgeToken=secret');
    vm.runInNewContext(`${helpers}\nbindXEduScratchHostBridge(state, createXEduScratchBridge(state));`, {
        window, params, state, ArrayBuffer, Blob, showStatus() {},
        fetch: async (url, request) => {
            persisted.push(request.body);
            return { ok: !persistenceFails, json: async () => ({ success: !persistenceFails, message: 'disk full' }) };
        },
    });
    return { messages, persisted, serializations: () => serializations,
        run: () => listener({ source: parent, data: { type: 'xedu:scratch-host-action',
            action: 'export-for-submission', bridgeToken: 'secret', requestId: 'submission' } }) };
}

test('copied production page persists the current VM once before returning submission bytes', async () => {
    const state = harness();
    await state.run();
    const response = state.messages.find(item => item.message.requestId === 'submission');
    assert.ok(response.message.result, response.message.error);
    assert.equal(state.serializations(), 1);
    assert.equal(response.message.result.filename, 'current.sb3');
    assert.deepEqual(Buffer.from(response.message.result.bytes), Buffer.from(await state.persisted[0].arrayBuffer()));
    assert.equal(response.transfer.length, 1);
});

test('copied production page does not return submission bytes after a local save failure', async () => {
    const state = harness(true);
    await state.run();
    const response = state.messages.find(item => item.message.requestId === 'submission');
    assert.match(response.message.error, /disk full/);
    assert.equal(response.message.result, undefined);
});
