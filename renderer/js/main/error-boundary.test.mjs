import assert from 'node:assert/strict';
import test from 'node:test';
import { installUnhandledRejectionHandler } from './error-boundary.js';

function createTarget() {
    const listeners = new Map();
    return {
        addEventListener(type, listener) {
            listeners.set(type, listener);
        },
        removeEventListener(type, listener) {
            if (listeners.get(type) === listener) listeners.delete(type);
        },
        dispatch(type, event) {
            listeners.get(type)?.(event);
        },
    };
}

test('unhandled rejections are prevented, logged, and surfaced once per interval', () => {
    const target = createTarget();
    const notifications = [];
    const logs = [];
    let currentTime = 1000;
    const cleanup = installUnhandledRejectionHandler({
        target,
        now: () => currentTime,
        notify: (...args) => notifications.push(args),
        logger: { error: (...args) => logs.push(args) },
    });
    const firstEvent = {
        reason: new Error('network failed'),
        preventDefault() {
            this.prevented = true;
        },
    };

    target.dispatch('unhandledrejection', firstEvent);
    target.dispatch('unhandledrejection', { reason: 'second failure', preventDefault() {} });
    currentTime += 1500;
    target.dispatch('unhandledrejection', { reason: 'third failure', preventDefault() {} });

    assert.equal(firstEvent.prevented, true);
    assert.equal(notifications.length, 2);
    assert.deepEqual(notifications[0], ['操作未完成，请重试。', 'error']);
    assert.equal(logs.length, 3);

    cleanup();
    target.dispatch('unhandledrejection', { reason: 'after cleanup', preventDefault() {} });
    assert.equal(logs.length, 3);
});
