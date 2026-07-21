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
} = {}) {
    const state = writeTeacherModeState(value, storage);
    return { ...state, persisted: false, error: undefined };
}

export async function forgetTeacherMode({
    storage = globalThis.sessionStorage,
} = {}) {
    return { ...clearTeacherModeSession(storage), cleared: true, error: undefined };
}

export async function restoreTeacherModeState({
    storage = globalThis.sessionStorage,
} = {}) {
    return readTeacherModeState(storage);
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
