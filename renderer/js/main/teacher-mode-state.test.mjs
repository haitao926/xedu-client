import assert from 'node:assert/strict';
import test from 'node:test';
import { isTeacherModeUnlocked, readTeacherModeState } from './teacher-mode-state.js';

function createStorage(values = {}) {
    return {
        getItem(key) {
            return values[key] ?? null;
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
