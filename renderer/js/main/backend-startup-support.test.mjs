import assert from 'node:assert/strict';
import test from 'node:test';
import { createBackendStartupSupport } from './backend-startup-support.js';

function createElement() {
    const listeners = new Map();
    return {
        hidden: false,
        style: {},
        disabled: false,
        textContent: '',
        addEventListener(type, listener) {
            listeners.set(type, listener);
        },
        click() {
            return listeners.get('click')?.();
        },
    };
}

function createDocument() {
    const elements = new Map([
        ['startup-support-card', createElement()],
        ['startup-support-status', createElement()],
        ['startup-support-path', createElement()],
        ['retry-backend-startup-btn', createElement()],
        ['copy-diagnostic-summary-btn', createElement()],
        ['open-log-directory-btn', createElement()],
        ['reset-config-btn', createElement()],
    ]);
    return {
        getElementById(id) {
            return elements.get(id) || null;
        },
        elements,
    };
}

test('backend startup support renders actionable failure state', async () => {
    const documentRef = createDocument();
    const windowRef = {
        electronAPI: {
            async getBackendStartupState() {
                return { state: { status: 'error', message: '启动失败', attemptCount: 2, logDirectory: '/tmp/logs' } };
            },
        },
    };
    const controller = createBackendStartupSupport({ documentRef, windowRef });

    controller.render(await controller.getState());

    assert.equal(documentRef.elements.get('startup-support-card').hidden, false);
    assert.equal(documentRef.elements.get('startup-support-status').textContent, '启动失败');
    assert.equal(documentRef.elements.get('startup-support-path').textContent, '日志目录：/tmp/logs');
    assert.equal(documentRef.elements.get('retry-backend-startup-btn').disabled, false);
});

test('resetting backend configuration also clears remembered teacher access', async () => {
    const documentRef = createDocument();
    const events = [];
    const resetResponse = { success: true, config: { ui: {} } };
    const controller = createBackendStartupSupport({
        documentRef,
        windowRef: {
            confirm: () => true,
            electronAPI: { apiRequest() {} },
        },
        apiClient: {
            async resetConfig() {
                events.push('reset');
                return resetResponse;
            },
        },
        applySystemConfigToInputs(response) {
            assert.equal(response, resetResponse);
            events.push('apply');
        },
        async onConfigurationReset(response) {
            assert.equal(response, resetResponse);
            events.push('forget-teacher');
        },
        showToast() {},
    });

    controller.bindActions();
    await documentRef.elements.get('reset-config-btn').click();

    assert.deepEqual(events, ['reset', 'apply', 'forget-teacher']);
});
