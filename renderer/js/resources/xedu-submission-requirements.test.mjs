import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

import {
    describeSubmissionRequirements,
    getSubmissionActionGuidance,
    isSubmissionCompleted,
    isSubmissionConfirming,
    normalizeSubmissionRequirements,
} from './xedu-submission-requirements.js';

const resourcesSource = readFileSync(resolve(import.meta.dirname, '../resources.js'), 'utf8');

test('absent submission results have no guidance or submission status', () => {
    for (const result of [null, undefined]) {
        assert.equal(getSubmissionActionGuidance(result), '');
        assert.equal(isSubmissionCompleted(result), false);
        assert.equal(isSubmissionConfirming(result), false);
    }
});

test('student chrome can initialize and reset before any submission result exists', () => {
    const start = resourcesSource.indexOf('function syncStudentFocusChrome(');
    const end = resourcesSource.indexOf('function syncStudentTaskCenterHeader(', start);
    const context = vm.createContext({
        resourcesState: { activeCourseWorkspaceTab: 'route' },
        normalizeWorkspaceTabId: (tabId) => tabId,
        document: {
            body: { classList: { contains: () => true, toggle() {}, remove() {} } },
            getElementById: () => null,
        },
        isStudentLessonMode: () => false,
        describeStudentSaveChrome: () => ({}),
        xeduScoreBridge: { getDraft: () => null },
        studentSavePhase: 'idle',
        studentSaveResult: null,
        describeSubmissionRequirements,
        currentSubmissionRequirements: () => null,
        getSubmissionActionGuidance,
        collapseStudentJupyterControls() {},
        refreshEmbeddedJupyterBounds() {},
    });
    vm.runInContext(resourcesSource.slice(start, end), context);
    assert.doesNotThrow(() => context.syncStudentFocusChrome());
    context.studentSaveResult = { ok: true, status: 'completed' };
    assert.doesNotThrow(() => context.syncStudentFocusChrome());
    context.studentSaveResult = null;
    assert.doesNotThrow(() => context.syncStudentFocusChrome());
});

test('normalizes only the authorized task submission_requirements fields', () => {
    assert.equal(normalizeSubmissionRequirements(null), null);
    assert.deepEqual(normalizeSubmissionRequirements({
        requires_web_feedback: true,
        requires_project_file: true,
        project_kind: 'python',
        artifact_max_bytes: 1234,
        accepted_project_extensions: ['.py', '.ipynb', '.PY', 'txt'],
        ignored: 'not exposed',
    }), {
        requires_web_feedback: true,
        requires_project_file: true,
        project_kind: 'python',
        artifact_max_bytes: 1234,
        accepted_project_extensions: ['.py', '.ipynb'],
    });
});

test('describes the concrete student submission requirements', () => {
    assert.match(describeSubmissionRequirements({
        requires_web_feedback: true,
        requires_project_file: true,
        project_kind: 'notebook',
        artifact_max_bytes: 10 * 1024 * 1024,
        accepted_project_extensions: ['.ipynb'],
    }), /Notebook/);
    assert.match(describeSubmissionRequirements({
        requires_web_feedback: true,
        requires_project_file: true,
        project_kind: 'notebook',
        artifact_max_bytes: 10 * 1024 * 1024,
        accepted_project_extensions: ['.ipynb'],
    }), /网页反馈/);
    assert.equal(describeSubmissionRequirements(null), '');
});

test('maps next_action to a useful action without inventing a retry', () => {
    assert.match(getSubmissionActionGuidance({ next_action: 'save_project' }), /切换到 Python|Notebook/);
    assert.match(getSubmissionActionGuidance({ next_action: 'reupload_artifact' }), /重新导出|重新保存/);
    assert.match(getSubmissionActionGuidance({ next_action: 'reduce_artifact' }), /缩小/);
    assert.match(getSubmissionActionGuidance({ next_action: 'relaunch' }), /学习平台重新打开/);
    assert.match(getSubmissionActionGuidance({ next_action: 'return_to_course' }), /返回课程/);
    assert.equal(getSubmissionActionGuidance({ retryable: false, next_action: 'retry_submission' }), '');
    assert.equal(getSubmissionActionGuidance({ retryable: false }), '');
});

test('completion and confirming require the explicit successful status pair', () => {
    assert.equal(isSubmissionCompleted({ ok: true, status: 'completed' }), true);
    assert.equal(isSubmissionCompleted({ ok: true, platform_status: 'completed' }), true);
    assert.equal(isSubmissionCompleted({ ok: false, status: 'completed' }), false);
    assert.equal(isSubmissionCompleted({ ok: true, status: 'confirming' }), false);
    assert.equal(isSubmissionConfirming({ ok: false, status: 'confirming' }), true);
    assert.equal(isSubmissionConfirming({ ok: true, status: 'confirming' }), true);
    assert.equal(isSubmissionConfirming({ ok: false, platform_status: 'confirming' }), true);
    assert.equal(isSubmissionConfirming({ ok: false, code: 'submission_not_completed' }), true);
});

test('resources save presentation keeps confirming out of failed and completed states', () => {
    const start = resourcesSource.indexOf('function presentPlatformSaveResult(');
    const end = resourcesSource.indexOf('xeduScoreBridgeSaveHooks.onSaveResult', start);
    const notices = [];
    const context = vm.createContext({
        isSubmissionCompleted,
        isSubmissionConfirming,
        studentSaveMessage: (code, fallback = '') => fallback || code,
        studentSaveResult: null,
        studentSavePhase: 'idle',
        notifyUser: (...args) => notices.push(args),
        syncStudentFocusChrome() {},
    });
    vm.runInContext(resourcesSource.slice(start, end), context);

    const confirming = context.presentPlatformSaveResult({ ok: true, status: 'confirming', message: '确认中' });
    assert.equal(confirming.status, 'confirming');
    assert.equal(context.studentSavePhase, 'confirming');
    assert.deepEqual(notices.at(-1), ['确认中', 'info']);

    const completed = context.presentPlatformSaveResult({ ok: true, status: 'completed', message: '完成' });
    assert.equal(completed.status, 'completed');
    assert.equal(context.studentSavePhase, 'saved');
    assert.equal(context.studentSaveResult.platform_status, 'completed');
    assert.deepEqual(notices.at(-1), ['完成', 'success']);

    context.presentPlatformSaveResult({ ok: false, status: 'completed', message: '拒绝' });
    assert.equal(context.studentSavePhase, 'failed');
});
