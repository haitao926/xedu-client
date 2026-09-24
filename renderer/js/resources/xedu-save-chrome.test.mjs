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
    assert.equal(saved.statusText, '平台已保存');
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
    assert.equal(saved.statusText, '已保存');
    assert.equal(saved.submitDisabled, false);
    assert.equal(saved.retryVisible, false);

    const scoreSaved = describeStudentSaveChrome({
        draft: null,
        phase: 'saved',
        result: { ok: true, platform_status: 'completed', mode: 'score' },
    });
    assert.equal(scoreSaved.statusText, '平台已保存');
});
