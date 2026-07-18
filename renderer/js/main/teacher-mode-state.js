export const TEACHER_MODE_KEY = 'xedu_teacher_mode';
export const TEACHER_MODE_CODE_KEY = 'xedu_teacher_mode_code';

export function readTeacherModeState(storage = globalThis.sessionStorage) {
    try {
        return {
            unlocked: storage?.getItem(TEACHER_MODE_KEY) === 'true',
            code: storage?.getItem(TEACHER_MODE_CODE_KEY) || '',
        };
    } catch (_) {
        return { unlocked: false, code: '' };
    }
}

export function isTeacherModeUnlocked(storage = globalThis.sessionStorage) {
    return readTeacherModeState(storage).unlocked;
}
