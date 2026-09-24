import assert from 'node:assert/strict';
import test from 'node:test';

import { CONTRACT_REVISION, createXeduSubmitBridge, parseLabScoreMessage } from './xedu-submit-bridge.js';

function harness() {
    let handler = null;
    return {
        windowObject: {
            addEventListener(type, next) {
                if (type === 'message') handler = next;
            },
            removeEventListener() {
                handler = null;
            },
        },
        emit(event) {
            return handler(event);
        },
    };
}

test('two-field and ols-score messages become drafts and never call save', async () => {
    assert.equal(CONTRACT_REVISION, '2026-09-22');
    const calls = [];
    const ui = harness();
    const frame = { contentWindow: {} };
    const bridge = createXeduSubmitBridge({
        windowObject: ui.windowObject,
        transport: {
            setDraft: async (draft) => {
                calls.push(['draft', draft]);
                return { ok: true, has_draft: true, draft };
            },
            saveScore: async () => calls.push(['save']),
            uploadScreenshot: async () => calls.push(['shot']),
            saveCombined: async () => calls.push(['combined']),
        },
    });
    bridge.attach(frame);
    await ui.emit({ source: frame.contentWindow, data: JSON.stringify({ name: ' 选择题 ', value: 0 }) });
    await ui.emit({ source: {}, data: { name: '别人', value: 99 } });
    await ui.emit({ source: frame.contentWindow, data: { type: 'ols-score/1', name: '操作题', value: 1.5, passed: false, answers: { q1: 'A' } } });
    await ui.emit({ source: frame.contentWindow, data: { type: 'xedu:submit-request', payload: { name: '旧提交', value: 40 } } });
    assert.deepEqual(calls.map((call) => call[0]), ['draft', 'draft', 'draft']);
    assert.equal(calls[0][1].raw_score, 0);
    assert.equal(calls[0][1].score, 0);
    assert.equal(calls[1][1].score, 2);
    assert.equal(calls[1][1].passed, false);
    assert.deepEqual(calls[1][1].answers, { q1: 'A' });
    assert.equal(calls[2][1].source, 'xedu:submit-request');
    assert.equal(bridge.getDraft().name, '旧提交');
    assert.equal(bridge.hasDraft(), true);
});

test('invalid score values are rejected without clamping', () => {
    for (const value of ['80', null, Number.NaN, Number.POSITIVE_INFINITY, 101, -1]) {
        const parsed = parseLabScoreMessage({ name: '题', value });
        assert.equal(parsed.ok, false);
        assert.equal(parsed.code, 'score_invalid');
        assert.equal(parsed.draft, null);
    }
    assert.equal(parseLabScoreMessage({ type: 'xedu:course-ai-request', name: '题', value: 1 }).ignore, true);
    assert.equal(parseLabScoreMessage({ name: '题', value: 1, extra: true }).ignore, true);
    const withAnswers = parseLabScoreMessage({ name: '选择题', value: 80, answers: { selected: [1, 2] } });
    assert.equal(withAnswers.ok, true);
    assert.deepEqual(withAnswers.draft.answers, { selected: [1, 2] });
    assert.equal(parseLabScoreMessage({ name: '题', value: 80, answers: 'nope' }).code, 'answers_invalid');
    const tooBig = parseLabScoreMessage({ name: '题', value: 80, answers: { note: 'x'.repeat(32 * 1024) } });
    assert.equal(tooBig.ok, false);
    assert.equal(tooBig.code, 'answers_too_large');
    assert.equal(tooBig.draft, null);
});

test('save is disabled without a draft and a failed screenshot does not count as combined success', async () => {
    const calls = [];
    const ui = harness();
    const bridge = createXeduSubmitBridge({
        windowObject: ui.windowObject,
        transport: {
            setDraft: async (draft) => ({ ok: true, draft }),
            saveScore: async () => {
                calls.push('score');
                return { ok: true, platform_status: 'completed', message: '成绩已保存，平台已确认完成。', draft: null };
            },
            uploadScreenshot: async () => {
                calls.push('shot');
                return { ok: false, platform_status: '', code: 'screenshot_failed', message: '截图失败，没有上传。成绩草稿还在，可以单独保存成绩。' };
            },
            saveCombined: async () => {
                calls.push('combined');
                return { ok: false, platform_status: '', code: 'screenshot_failed', message: '截图失败，没有上传。成绩草稿还在，可以单独保存成绩。', has_draft: true, draft: bridge.getDraft() };
            },
        },
    });
    const missing = await bridge.saveScore();
    assert.equal(missing.code, 'no_score_draft');
    assert.equal(calls.length, 0);
    bridge.restoreDraft({ name: '题', raw_score: 12, score: 12, passed: null, source: 'two-field' });
    const failed = await bridge.saveCombined();
    assert.equal(failed.platform_status, '');
    assert.equal(failed.ok, false);
    assert.match(failed.message, /可以单独保存成绩/);
    assert.equal(bridge.hasDraft(), true);
    const saved = await bridge.saveScore();
    assert.equal(saved.platform_status, 'completed');
    assert.deepEqual(calls, ['combined', 'score']);
});

test('evidence save does not need a score draft and keeps one if it exists', async () => {
    const calls = [];
    const bridge = createXeduSubmitBridge({
        windowObject: harness().windowObject,
        transport: {
            saveEvidence: async (bounds, meta) => {
                calls.push(['evidence', bounds, meta]);
                return { ok: true, platform_status: 'completed', mode: 'evidence', message: '已保存', draft: bridge.getDraft() };
            },
        },
        captureBounds: () => ({ x: 1, y: 2, width: 3, height: 4 }),
    });
    bridge.restoreDraft({ name: '题', raw_score: 8, score: 8, passed: true, source: 'two-field' });
    const saved = await bridge.saveEvidence({ experiment: 'notebook' });
    assert.equal(saved.platform_status, 'completed');
    assert.equal(saved.message, '已保存');
    assert.deepEqual(calls[0][2], { experiment: 'notebook' });
    assert.equal(bridge.getDraft().name, '题');
    assert.equal(bridge.getDraft().passed, true);
});
