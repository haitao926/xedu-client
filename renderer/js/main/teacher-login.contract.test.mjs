import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [indexSource, mainSource, preloadSource, resourcesSource, systemConfigSource] = await Promise.all([
    readFile(new URL('../../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../main.js', import.meta.url), 'utf8'),
    readFile(new URL('../../../electron/preload/index.js', import.meta.url), 'utf8'),
    readFile(new URL('../resources.js', import.meta.url), 'utf8'),
    readFile(new URL('./system-config.js', import.meta.url), 'utf8'),
]);
const confirmPythonSource = systemConfigSource.slice(
    systemConfigSource.indexOf('export async function confirmPythonEnvironment'),
    systemConfigSource.indexOf('export async function repairXeduEnvironment'),
);

test('startup and backend-ready recovery both initialize the teacher code', () => {
    assert.match(mainSource, /createTeacherCodeInitializationRunner/);
    assert.match(mainSource, /await initializeTeacherCode\(\)/);
    assert.match(mainSource, /state\?\.status\s*===\s*['"]ready['"][\s\S]{0,240}?initializeTeacherCode\(\)/);
    assert.doesNotMatch(mainSource, /ensureTeacherCodeInitialized\(\{\s*prompt:\s*false\s*\}\)/);
    assert.match(mainSource, /allowPythonSetup/);
});

test('startup derives experience copy from the current teacher-mode state', () => {
    assert.match(mainSource, /applyExperienceCopy\(isTeacherModeUnlocked\(\)\)/);
    assert.doesNotMatch(mainSource, /applyExperienceCopy\(teacherUnlocked\)/);
});

test('teacher mode uses secret presence and never auto-unlocks an empty code', () => {
    assert.match(resourcesSource, /isTeacherCodeConfigured\(response\)/);
    assert.match(resourcesSource, /teacherCodeConfigured/);
    assert.doesNotMatch(
        resourcesSource,
        /if\s*\(!resourcesState\.classroomConfig\.teacherCode\)\s*\{[\s\S]{0,240}?teacherMode\.unlocked\s*=\s*true/,
    );
});

test('settings omit blank teacher-code updates so existing secrets survive saves', () => {
    assert.match(systemConfigSource, /buildTeacherCodeUpdate\(classroomTeacherCodeInput\)/);
    assert.doesNotMatch(systemConfigSource, /classroom_teacher_code:\s*classroomTeacherCodeInput/);
});

test('teacher login keeps the prompt available after a wrong password', () => {
    assert.match(
        resourcesSource,
        /while\s*\(true\)\s*\{[\s\S]*?openResourcesInput\([\s\S]*?教师验证码错误[\s\S]*?continue;/,
    );
    assert.match(resourcesSource, /function openPythonSetup\(\)/);
    assert.match(resourcesSource, /if\s*\(!await isBackendReady\(\)\)/);
});

test('teacher setup and teacher login are separate flows', () => {
    assert.match(indexSource, /首次设置教师验证码/);
    assert.match(resourcesSource, /title:\s*["']输入教师验证码["']/);
    assert.match(resourcesSource, /confirmText:\s*["']进入教师模式["']/);
    assert.match(resourcesSource, /function exitTeacherMode\(\)[\s\S]*?clearTeacherModeSession\(\)/);
    assert.match(resourcesSource, /title:\s*["']退出教师模式["'][\s\S]{0,360}?exitTeacherMode\(\)/);
});

test('teacher login stays session-only and app startup remains in student mode', () => {
    assert.match(mainSource, /clearTeacherModeSession\(\)/);
    assert.doesNotMatch(mainSource, /restoreTeacherModeState/);
    assert.match(mainSource, /onConfigurationReset:\s*async[\s\S]*?clearTeacherModeSession\(\)/);
    assert.match(systemConfigSource, /writeTeacherModeState\(code1\)/);
    assert.match(systemConfigSource, /writeTeacherModeState\(classroomTeacherCodeInput\)/);
    assert.match(resourcesSource, /writeTeacherModeState\(code\)/);
    assert.doesNotMatch(mainSource, /forgetTeacherMode/);
    assert.doesNotMatch(systemConfigSource, /rememberTeacherMode|saveTeacherCredential|loadTeacherCredential|clearTeacherCredential/);
    assert.doesNotMatch(resourcesSource, /rememberTeacherMode|forgetTeacherMode|restoreTeacherModeState/);
    assert.doesNotMatch(resourcesSource, /sessionStorage\.setItem\(TEACHER_MODE_CODE_KEY/);
    assert.doesNotMatch(systemConfigSource, /detail:\s*\{\s*code\s*:/);
    assert.doesNotMatch(preloadSource, /loadTeacherCredential|saveTeacherCredential|clearTeacherCredential/);
});

test('confirming local Python restarts the backend for first-run initialization', () => {
    assert.match(
        confirmPythonSource,
        /export async function confirmPythonEnvironment\(\)[\s\S]*?restartBackend[\s\S]*?restartResult/,
    );
});
