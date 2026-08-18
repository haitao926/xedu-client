import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [indexSource, mainSource, preloadSource, resourcesSource, systemConfigSource, uiSource] = await Promise.all([
    readFile(new URL('../../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../main.js', import.meta.url), 'utf8'),
    readFile(new URL('../../../electron/preload/index.js', import.meta.url), 'utf8'),
    readFile(new URL('../resources.js', import.meta.url), 'utf8'),
    readFile(new URL('./system-config.js', import.meta.url), 'utf8'),
    readFile(new URL('../ui.js', import.meta.url), 'utf8'),
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

test('teacher login restores the saved credential while exit remains session-only', () => {
    assert.match(mainSource, /restoreTeacherModeState/);
    assert.match(mainSource, /onConfigurationReset:\s*async[\s\S]*?forgetTeacherMode\(\)/);
    assert.match(systemConfigSource, /rememberTeacherMode/);
    assert.match(systemConfigSource, /forgetTeacherMode/);
    assert.match(resourcesSource, /rememberTeacherMode/);
    assert.doesNotMatch(resourcesSource, /restoreTeacherModeState/);
    assert.doesNotMatch(systemConfigSource, /detail:\s*\{\s*code\s*:/);
    assert.match(preloadSource, /loadTeacherCredential/);
    assert.match(preloadSource, /saveTeacherCredential/);
    assert.match(preloadSource, /clearTeacherCredential/);
});

test('global modal dismissal resolves the resources form so teacher login is reusable', () => {
    assert.match(uiSource, /xedu:modal-dismiss/);
    assert.match(resourcesSource, /xedu:modal-dismiss/);
    assert.match(resourcesSource, /finishResourcesActionModal\(\{ confirmed: false, values: \{\} \}\)/);
});

test('confirming local Python updates only the isolated experiment configuration', () => {
    assert.doesNotMatch(confirmPythonSource, /restartBackend|restartResult/);
    assert.match(confirmPythonSource, /apiClient\.saveConfig\(/);
    assert.match(confirmPythonSource, /python_selection_confirmed:\s*true/);
});
