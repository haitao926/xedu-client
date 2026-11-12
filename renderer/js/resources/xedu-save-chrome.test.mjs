import assert from 'node:assert/strict';
import test from 'node:test';

import { describeStudentSaveChrome, studentSaveMessage } from './xedu-save-chrome.js';

const draft = { name: '第1题', raw_score: 80, score: 80, passed: null, source: 'two-field' };

test('a draft shows the pending name and score until save starts', () => {
    const idle = describeStudentSaveChrome({ draft, phase: 'idle' });
    assert.equal(idle.draftLabel, '待保存：第1题 80分');
    assert.equal(idle.statusText, '');
    assert.equal(idle.submitDisabled, false);
    assert.equal(idle.retryVisible, false);

    const saving = describeStudentSaveChrome({ draft, phase: 'saving' });
    assert.equal(saving.statusText, '保存中');
    assert.equal(saving.draftLabel, '待保存：第1题 80分');
    assert.equal(saving.submitDisabled, true);
    assert.equal(saving.retryVisible, false);
});

test('platform saved appears only after completed, and zero stays visible', () => {
    const unfinished = describeStudentSaveChrome({
        draft,
        phase: 'saved',
        result: { ok: true, platform_status: '' },
    });
    assert.equal(unfinished.statusText, '');
    assert.equal(unfinished.draftLabel, '待保存：第1题 80分');

    const saved = describeStudentSaveChrome({
        draft: null,
        phase: 'saved',
        result: { ok: true, platform_status: 'completed' },
    });
    assert.equal(saved.statusText, '提交成功 · 平台已确认');
    assert.equal(saved.draftLabel, '');
    assert.equal(saved.retryVisible, false);

    const zero = describeStudentSaveChrome({
        draft: { name: '零分', score: 0 },
        phase: 'idle',
    });
    assert.equal(zero.draftLabel, '待保存：零分 0分');
    assert.equal(zero.submitDisabled, false);
});

test('grant expiry tells the student to reopen and other codes stay in Chinese', () => {
    const expired = describeStudentSaveChrome({
        draft,
        phase: 'failed',
        result: { ok: false, code: 'grant_expired', platform_status: '', message: 'raw' },
    });
    assert.match(expired.statusText, /请从学习平台重新打开/);
    assert.match(expired.statusText, /草稿已保留/);
    assert.equal(expired.grantExpired, true);
    assert.equal(expired.retryVisible, false);
    assert.equal(expired.draftLabel, '待保存：第1题 80分');
    assert.equal(expired.submitDisabled, false);

    const shot = describeStudentSaveChrome({
        draft,
        phase: 'failed',
        result: { ok: false, code: 'screenshot_failed', platform_status: '', message: 'raw server text' },
    });
    assert.match(shot.statusText, /截图失败，没有上传/);
    assert.equal(shot.statusText.includes('可以单独保存成绩'), false);
    assert.equal(shot.statusText.includes('平台已保存'), false);
    assert.equal(shot.retryVisible, true);
    assert.equal(shot.draftLabel, '待保存：第1题 80分');

    assert.match(studentSaveMessage('protocol_unsupported'), /协议版本/);
    assert.match(studentSaveMessage('rate_limited', 'slow down'), /太频繁/);
    assert.match(studentSaveMessage('work_locked'), /锁定/);
    assert.match(studentSaveMessage('conflict'), /冲突/);
    assert.match(studentSaveMessage('score_invalid'), /0 到 100/);
    assert.match(studentSaveMessage('grant_invalid'), /任务授权/);
    assert.match(studentSaveMessage('XEDU_RESULT_NOT_PASSED'), /还没有通过/);
});

test('server submission errors show mapped guidance and keep server retry metadata', () => {
    const cases = [
        ['XEDU_PYTHON_ARTIFACT_REQUIRED', /Python|Notebook/],
        ['XEDU_ARTIFACT_INVALID', /作品|附件/],
        ['ARTIFACT_TYPE_UNSUPPORTED', /作品文件类型|支持/],
        ['ARTIFACT_TOO_LARGE', /超过|较小/],
        ['XEDU_SUBMISSION_ERROR', /提交|稍后/],
        ['XEDU_TASK_GRANT_INVALID', /授权|重新打开/],
        ['XEDU_ACTIVITY_FORBIDDEN', /活动|权限/],
        ['XEDU_ANSWERS_INVALID', /作答|答案/],
    ];
    for (const [code, pattern] of cases) {
        const result = describeStudentSaveChrome({
            draft,
            phase: 'failed',
            result: { ok: false, code, message: 'server detail', retryable: code === 'XEDU_SUBMISSION_ERROR', next_action: {
                XEDU_PYTHON_ARTIFACT_REQUIRED: 'save_project',
                XEDU_ARTIFACT_INVALID: 'reupload_artifact',
                ARTIFACT_TYPE_UNSUPPORTED: 'reupload_artifact',
                ARTIFACT_TOO_LARGE: 'reduce_artifact',
                XEDU_SUBMISSION_ERROR: 'check_status',
                XEDU_TASK_GRANT_INVALID: 'relaunch',
                XEDU_ACTIVITY_FORBIDDEN: 'return_to_course',
                XEDU_ANSWERS_INVALID: 'complete_self_check',
            }[code] },
        });
        assert.match(result.statusText, pattern, code);
        assert.equal(result.statusText.includes('server detail'), false, code);
        assert.equal(result.retryVisible, true, code);
        assert.equal(result.nextAction, {
            XEDU_PYTHON_ARTIFACT_REQUIRED: 'save_project',
            XEDU_ARTIFACT_INVALID: 'reupload_artifact',
            ARTIFACT_TYPE_UNSUPPORTED: 'reupload_artifact',
            ARTIFACT_TOO_LARGE: 'reduce_artifact',
            XEDU_SUBMISSION_ERROR: 'check_status',
            XEDU_TASK_GRANT_INVALID: 'relaunch',
            XEDU_ACTIVITY_FORBIDDEN: 'return_to_course',
            XEDU_ANSWERS_INVALID: 'complete_self_check',
        }[code], code);
    }
});

test('intermediate save status never renders success', () => {
    const pending = describeStudentSaveChrome({
        draft,
        phase: 'saved',
        result: { ok: true, status: 'accepted', platform_status: 'accepted' },
    });
    assert.equal(pending.statusText, '');
    assert.equal(pending.tone, '');
    assert.equal(pending.retryVisible, false);
    const contradictory = describeStudentSaveChrome({
        draft: null,
        phase: 'saved',
        result: { ok: false, platform_status: 'completed' },
    });
    assert.notEqual(contradictory.statusText, '提交成功 · 平台已确认');

    const confirming = describeStudentSaveChrome({
        draft,
        phase: 'confirming',
        result: { ok: false, code: 'submission_not_completed', retryable: true, next_action: 'check_status' },
    });
    assert.match(confirming.statusText, /确认中/);
    assert.equal(confirming.tone, 'progress');
    assert.equal(confirming.submitDisabled, true);
    assert.equal(confirming.retryVisible, true);
    assert.equal(confirming.nextAction, 'check_status');
});

test('screenshot submit stays available without a score draft', () => {
    const idle = describeStudentSaveChrome({ draft: null, phase: 'idle' });
    assert.equal(idle.submitDisabled, false);
    assert.equal(idle.draftLabel, '');

    const saving = describeStudentSaveChrome({ draft: null, phase: 'saving' });
    assert.equal(saving.statusText, '保存中');
    assert.equal(saving.submitDisabled, true);

    const saved = describeStudentSaveChrome({
        draft: null,
        phase: 'saved',
        result: { ok: true, platform_status: 'completed', mode: 'evidence', message: '已保存' },
    });
    assert.equal(saved.statusText, '提交成功 · 作品已保存');
    assert.equal(saved.submitDisabled, false);
    assert.equal(saved.retryVisible, false);

    const scoreSaved = describeStudentSaveChrome({
        draft: null,
        phase: 'saved',
        result: { ok: true, platform_status: 'completed', mode: 'score' },
    });
    assert.equal(scoreSaved.statusText, '提交成功 · 平台已确认');
});
