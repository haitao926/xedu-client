export const TEACHER_MODE_KEY = 'xedu_teacher_mode';
export const TEACHER_MODE_CODE_KEY = 'xedu_teacher_mode_code';

export function readTeacherModeState(storage = globalThis.sessionStorage) {
    try {
        const code = (storage?.getItem(TEACHER_MODE_CODE_KEY) || '').trim();
        const unlocked = storage?.getItem(TEACHER_MODE_KEY) === 'true' && Boolean(code);
        return {
            unlocked,
            code: unlocked ? code : '',
        };
    } catch (_) {
        return { unlocked: false, code: '' };
    }
}

export function isTeacherModeUnlocked(storage = globalThis.sessionStorage) {
    return readTeacherModeState(storage).unlocked;
}

export function writeTeacherModeState(value, storage = globalThis.sessionStorage) {
    const code = String(value || '').trim();
    if (!code) return clearTeacherModeSession(storage);
    try {
        storage?.setItem(TEACHER_MODE_KEY, 'true');
        storage?.setItem(TEACHER_MODE_CODE_KEY, code);
        return { unlocked: true, code };
    } catch (_) {
        return { unlocked: false, code: '' };
    }
}

export function clearTeacherModeSession(storage = globalThis.sessionStorage) {
    try {
        storage?.removeItem(TEACHER_MODE_KEY);
        storage?.removeItem(TEACHER_MODE_CODE_KEY);
    } catch (_) {
        // In-memory state still fails closed when browser storage is unavailable.
    }
    return { unlocked: false, code: '' };
}

export async function rememberTeacherMode(value, {
    storage = globalThis.sessionStorage,
    credentialApi = globalThis.electronAPI,
} = {}) {
    const state = writeTeacherModeState(value, storage);
    if (!state.unlocked || typeof credentialApi?.saveTeacherCredential !== 'function') {
        return { ...state, persisted: false, error: state.unlocked ? 'credential-api-unavailable' : undefined };
    }
    let saved;
    try {
        saved = await credentialApi.saveTeacherCredential(state.code);
    } catch (_) {
        saved = { success: false, error: 'credential-save-failed' };
    }
    if (!saved?.success) {
        clearTeacherModeSession(storage);
        return { unlocked: false, code: '', persisted: false, error: saved?.error || 'credential-save-failed' };
    }
    return { ...state, persisted: true, error: undefined };
}

export async function forgetTeacherMode({
    storage = globalThis.sessionStorage,
    credentialApi = globalThis.electronAPI,
} = {}) {
    const cleared = clearTeacherModeSession(storage);
    if (typeof credentialApi?.clearTeacherCredential !== 'function') {
        return { ...cleared, cleared: false, error: 'credential-api-unavailable' };
    }
    let result;
    try {
        result = await credentialApi.clearTeacherCredential();
    } catch (_) {
        result = { success: false, error: 'credential-clear-failed' };
    }
    return {
        ...cleared,
        cleared: Boolean(result?.success),
        error: result?.success ? undefined : (result?.error || 'credential-clear-failed'),
    };
}

export async function restoreTeacherModeState({
    storage = globalThis.sessionStorage,
    credentialApi = globalThis.electronAPI,
    verifyCode,
} = {}) {
    const current = readTeacherModeState(storage);
    if (current.unlocked) return current;
    if (typeof credentialApi?.loadTeacherCredential !== 'function') return current;

    let loaded;
    try {
        loaded = await credentialApi.loadTeacherCredential();
    } catch (_) {
        loaded = { success: false, code: '' };
    }
    const code = String(loaded?.code || '').trim();
    if (!loaded?.success || !code || typeof verifyCode !== 'function') {
        return current;
    }
    if (!await verifyCode(code)) {
        return current;
    }
    return writeTeacherModeState(code, storage);
}

export function isTeacherCodeConfigured(response) {
    return response?.config?.secret_status?.classroom_teacher_configured === true;
}

export function buildTeacherCodeUpdate(value) {
    const code = String(value || '').trim();
    return code ? { classroom_teacher_code: code } : {};
}

export function createTeacherCodeInitializationRunner({
    ensureTeacherCode,
    applyConfig,
    restoreTeacherMode,
    applyTeacherMode,
} = {}) {
    if (typeof ensureTeacherCode !== 'function' || typeof applyConfig !== 'function') {
        throw new TypeError('teacher code initialization requires ensureTeacherCode and applyConfig');
    }

    let inFlight = null;
    return function initializeTeacherCode() {
        if (inFlight) return inFlight;

        let initialization;
        try {
            initialization = ensureTeacherCode({ prompt: true });
        } catch (error) {
            initialization = Promise.reject(error);
        }
        const task = Promise.resolve(initialization).then(async (response) => {
            if (response?.success) applyConfig(response);
            if (typeof restoreTeacherMode === 'function') {
                const state = await restoreTeacherMode(response);
                if (typeof applyTeacherMode === 'function') applyTeacherMode(state);
            }
            return response;
        });
        inFlight = task;
        const clear = () => {
            if (inFlight === task) inFlight = null;
        };
        task.then(clear, clear);
        return task;
    };
}
