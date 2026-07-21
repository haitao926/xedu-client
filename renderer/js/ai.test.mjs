import assert from 'node:assert/strict';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const aiModuleUrl = pathToFileURL(resolve(import.meta.dirname, './ai.js'));

async function loadAiModule() {
    const previousWindow = globalThis.window;
    globalThis.window = { addEventListener() {} };

    const module = await import(`${aiModuleUrl.href}?t=${Date.now()}-${Math.random()}`);
    return {
        ...module,
        cleanup() {
            if (previousWindow === undefined) {
                delete globalThis.window;
            } else {
                globalThis.window = previousWindow;
            }
        },
    };
}

test('native Chat Completions URLs normalize stale Responses selections to auto mode', async () => {
    const { normalizeAiApiMode, cleanup } = await loadAiModule();

    try {
        assert.equal(normalizeAiApiMode('https://api.moonshot.cn/v1', 'responses'), 'auto');
        assert.equal(normalizeAiApiMode('https://api.deepseek.com', 'responses'), 'auto');
        assert.equal(normalizeAiApiMode('https://api.openai.com/v1', 'responses'), 'responses');
    } finally {
        cleanup();
    }
});
