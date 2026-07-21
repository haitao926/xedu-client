import assert from 'node:assert/strict';
import test from 'node:test';
import * as teacherModeState from './teacher-mode-state.js';

const { isTeacherModeUnlocked, readTeacherModeState } = teacherModeState;

function createStorage(values = {}) {
    return {
        getItem(key) {
            return values[key] ?? null;
        },
        setItem(key, value) {
            values[key] = String(value);
        },
        removeItem(key) {
            delete values[key];
        },
    };
}

test('teacher mode state reads the session storage authority', () => {
    const storage = createStorage({
        xedu_teacher_mode: 'true',
        xedu_teacher_mode_code: 'teacher-code',
    });

    assert.deepEqual(readTeacherModeState(storage), { unlocked: true, code: 'teacher-code' });
    assert.equal(isTeacherModeUnlocked(storage), true);
});

test('teacher mode state fails closed when storage is unavailable', () => {
    const storage = {
        getItem() {
            throw new Error('storage unavailable');
        },
    };

    assert.deepEqual(readTeacherModeState(storage), { unlocked: false, code: '' });
    assert.equal(isTeacherModeUnlocked(storage), false);
});

test('teacher mode state rejects an unlocked flag without a teacher code', () => {
    const storage = createStorage({ xedu_teacher_mode: 'true' });

    assert.deepEqual(readTeacherModeState(storage), { unlocked: false, code: '' });
    assert.equal(isTeacherModeUnlocked(storage), false);
});

test('exiting teacher mode clears only the current session', () => {
    assert.equal(typeof teacherModeState.clearTeacherModeSession, 'function');
    const storage = createStorage({
        xedu_teacher_mode: 'true',
        xedu_teacher_mode_code: 'teacher-code',
    });

    assert.deepEqual(teacherModeState.clearTeacherModeSession(storage), {
        unlocked: false,
        code: '',
    });
    assert.deepEqual(readTeacherModeState(storage), { unlocked: false, code: '' });
});

test('manual teacher login writes only session state and never persists credentials', async () => {
    assert.equal(typeof teacherModeState.rememberTeacherMode, 'function');
    const storage = createStorage();
    let loadAttempts = 0;
    let saveAttempts = 0;

    const remembered = await teacherModeState.rememberTeacherMode('teacher-code', {
        storage,
        credentialApi: {
            async loadTeacherCredential() {
                loadAttempts += 1;
                return { success: true, code: 'teacher-code' };
            },
            async saveTeacherCredential() {
                saveAttempts += 1;
                return { success: true };
            },
        },
    });

    assert.deepEqual(remembered, {
        unlocked: true,
        code: 'teacher-code',
        persisted: false,
        error: undefined,
    });
    assert.deepEqual(readTeacherModeState(storage), {
        unlocked: true,
        code: 'teacher-code',
    });
    assert.equal(loadAttempts, 0);
    assert.equal(saveAttempts, 0);
});

test('teacher mode keeps startup in student mode and does not auto-restore credentials', async () => {
    assert.equal(typeof teacherModeState.restoreTeacherModeState, 'function');
    const storage = createStorage();
    let verifyAttempts = 0;

    const restored = await teacherModeState.restoreTeacherModeState({
        storage,
        credentialApi: {
            async loadTeacherCredential() {
                return { success: true, code: 'remembered-code' };
            },
        },
        async verifyCode() {
            verifyAttempts += 1;
            return true;
        },
    });

    assert.deepEqual(restored, { unlocked: false, code: '' });
    assert.deepEqual(readTeacherModeState(storage), restored);
    assert.equal(verifyAttempts, 0);
});

test('restoreTeacherModeState preserves an already unlocked session from sessionStorage only', async () => {
    assert.equal(typeof teacherModeState.restoreTeacherModeState, 'function');
    const storage = createStorage({
        xedu_teacher_mode: 'true',
        xedu_teacher_mode_code: 'teacher-code',
    });

    const restored = await teacherModeState.restoreTeacherModeState({ storage });

    assert.deepEqual(restored, {
        unlocked: true,
        code: 'teacher-code',
    });
});

test('forgetting teacher access clears only the renderer session', async () => {
    assert.equal(typeof teacherModeState.forgetTeacherMode, 'function');
    const storage = createStorage({
        xedu_teacher_mode: 'true',
        xedu_teacher_mode_code: 'teacher-code',
    });
    let clearAttempts = 0;

    const forgotten = await teacherModeState.forgetTeacherMode({
        storage,
        credentialApi: {
            async clearTeacherCredential() {
                clearAttempts += 1;
                return { success: true };
            },
        },
    });

    assert.deepEqual(forgotten, {
        unlocked: false,
        code: '',
        cleared: true,
        error: undefined,
    });
    assert.equal(clearAttempts, 0);
    assert.deepEqual(readTeacherModeState(storage), { unlocked: false, code: '' });
});

test('teacher access reads configured state without exposing the teacher code', () => {
    assert.equal(typeof teacherModeState.isTeacherCodeConfigured, 'function');
    assert.equal(teacherModeState.isTeacherCodeConfigured({
        config: {
            ui: {},
            secret_status: { classroom_teacher_configured: true },
        },
    }), true);
    assert.equal(teacherModeState.isTeacherCodeConfigured({
        config: {
            ui: { classroom_teacher_code: 'must-not-be-read' },
            secret_status: { classroom_teacher_configured: false },
        },
    }), false);
});

test('blank teacher code input preserves the configured secret', () => {
    assert.equal(typeof teacherModeState.buildTeacherCodeUpdate, 'function');
    assert.deepEqual(teacherModeState.buildTeacherCodeUpdate(''), {});
    assert.deepEqual(teacherModeState.buildTeacherCodeUpdate('  '), {});
    assert.deepEqual(
        teacherModeState.buildTeacherCodeUpdate(' new-code '),
        { classroom_teacher_code: 'new-code' },
    );
});

test('teacher code initialization retries after the backend becomes available', async () => {
    assert.equal(typeof teacherModeState.createTeacherCodeInitializationRunner, 'function');
    const configuredResponse = {
        success: true,
        config: { secret_status: { classroom_teacher_configured: true } },
    };
    const applied = [];
    let backendReady = false;
    let attempts = 0;
    const initialize = teacherModeState.createTeacherCodeInitializationRunner({
        async ensureTeacherCode(options) {
            attempts += 1;
            assert.deepEqual(options, { prompt: true });
            return backendReady ? configuredResponse : null;
        },
        applyConfig(response) {
            applied.push(response);
        },
    });

    assert.equal(await initialize(), null);
    backendReady = true;
    assert.equal(await initialize(), configuredResponse);
    assert.equal(attempts, 2);
    assert.deepEqual(applied, [configuredResponse]);
});

test('teacher code initialization merges concurrent startup and ready signals', async () => {
    assert.equal(typeof teacherModeState.createTeacherCodeInitializationRunner, 'function');
    let resolveInitialization;
    let attempts = 0;
    const configuredResponse = {
        success: true,
        config: { secret_status: { classroom_teacher_configured: true } },
    };
    const initialize = teacherModeState.createTeacherCodeInitializationRunner({
        ensureTeacherCode() {
            attempts += 1;
            return new Promise((resolve) => {
                resolveInitialization = resolve;
            });
        },
        applyConfig() {},
    });

    const startupAttempt = initialize();
    const readyAttempt = initialize();
    assert.equal(readyAttempt, startupAttempt);
    assert.equal(attempts, 1);

    resolveInitialization(configuredResponse);
    assert.equal(await startupAttempt, configuredResponse);
});

test('teacher code initialization still supports applying a restored session when a caller provides one', async () => {
    const events = [];
    const configuredResponse = {
        success: true,
        config: { secret_status: { classroom_teacher_configured: true } },
    };
    const initialize = teacherModeState.createTeacherCodeInitializationRunner({
        async ensureTeacherCode() {
            return configuredResponse;
        },
        applyConfig() {
            events.push('config');
        },
        async restoreTeacherMode(response) {
            assert.equal(response, configuredResponse);
            events.push('restore');
            return { unlocked: true, code: 'session-code' };
        },
        applyTeacherMode(state) {
            events.push(state.unlocked ? 'teacher' : 'student');
        },
    });

    assert.equal(await initialize(), configuredResponse);
    assert.deepEqual(events, ['config', 'restore', 'teacher']);
});
