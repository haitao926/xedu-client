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
    await ui.emit({ source: frame.contentWindow, data: { type: 'ols-score/1', name: '操作题', value: 1.5, passed: false } });
    await ui.emit({ source: frame.contentWindow, data: { type: 'xedu:submit-request', payload: { name: '旧提交', value: 40 } } });
    assert.deepEqual(calls.map((call) => call[0]), ['draft', 'draft', 'draft']);
    assert.equal(calls[0][1].raw_score, 0);
    assert.equal(calls[0][1].score, 0);
    assert.equal(calls[1][1].score, 2);
    assert.equal(calls[1][1].passed, false);
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
