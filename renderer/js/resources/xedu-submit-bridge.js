const PROTOCOL_VERSION = 1;
const CONTRACT_REVISION = '2026-09-22';
const MAX_ANSWERS_JSON_BYTES = 32 * 1024;

const STUDENT_MESSAGES = Object.freeze({
    protocol_mismatch: '学习平台协议版本与客户端不一致，已停止打开。请更新后再从平台重新进入。',
    grant_expired: '任务授权已过期，请从学习平台重新打开。当前成绩草稿已保留。',
    grant_invalid: '学习平台没有返回有效的任务授权，请重新打开。',
    score_invalid: '成绩无效。请使用 0 到 100 之间的数字，0 分也会保留。',
    work_locked: '这份作业已锁定，暂时不能再保存。',
    conflict: '保存发生冲突，请从学习平台重新打开后再试。',
    package_invalid: '课程包校验失败，请从学习平台重新打开。',
    course_id_mismatch: '课程包编号与任务不一致，已停止打开。课程编号以 course.json 的 id 为准。',
    screenshot_failed: '截图失败，没有上传。成绩草稿还在，可以单独保存成绩。',
    screenshot_too_large: '截图超过 10MB，没有上传。可以单独保存成绩。',
    screenshot_type: '截图格式无效。请使用 PNG、JPEG 或 WebP。',
    rate_limited: '保存太频繁，请稍后再试。',
    save_in_flight: '正在保存，请稍候再试。',
    no_score_draft: '还没有可保存的成绩。',
    answers_invalid: '作答内容格式无效，成绩没有保存。',
    answers_too_large: '作答内容超过 32KB，成绩没有保存。',
    XEDU_RESULT_NOT_PASSED: '这次成绩还没有通过，平台没有记为完成。',
    no_active_task: '请从学习平台重新打开这个任务。',
    submission_not_completed: '学习平台尚未确认完成，请稍后再试。',
    network: '暂时连不上学习平台，请稍后再试。',
    attachment_invalid: '截图没有被平台收下，本次没有保存成功。可以单独保存成绩。',
    forbidden: '当前窗口不能执行这个操作。',
});

function failure(code) {
    return {
        ok: false,
        status: 0,
        platform_status: '',
        code,
        message: STUDENT_MESSAGES[code] || '保存没有完成，请稍后再试。',
        retryable: false,
        request_id: '',
    };
}

function jsonUtf8Size(text) {
    const encoded = typeof TextEncoder === 'function'
        ? new TextEncoder().encode(String(text || ''))
        : null;
    return encoded ? encoded.length : String(text || '').length;
}

function sanitizeAnswersBag(value) {
    if (value === undefined || value === null) return { include: false };
    if (typeof value !== 'object') return { include: false, code: 'answers_invalid' };
    let cloned;
    try {
        cloned = JSON.parse(JSON.stringify(value));
    } catch (_) {
        return { include: false, code: 'answers_invalid' };
    }
    if (!cloned || typeof cloned !== 'object') return { include: false, code: 'answers_invalid' };
    if (jsonUtf8Size(JSON.stringify(cloned)) > MAX_ANSWERS_JSON_BYTES) {
        return { include: false, code: 'answers_too_large' };
    }
    return { include: true, answers: cloned };
}

function classifyScoreInput(input) {
    let parsed = input;
    if (typeof parsed === 'string') {
        try {
            parsed = JSON.parse(parsed);
        } catch (_) {
            return { ignore: true };
        }
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { ignore: true };
    const type = typeof parsed.type === 'string' ? parsed.type : '';
    let source = '';
    let record = parsed;
    if (!type && parsed.raw_score !== undefined && parsed.name !== undefined && parsed.value === undefined) {
        source = parsed.source || 'two-field';
        record = {
            name: parsed.name,
            value: parsed.raw_score,
            passed: parsed.passed,
            answers: parsed.answers,
        };
    } else if (!type) {
        const keys = Object.keys(parsed);
        const allowed = new Set(['name', 'value', 'answers']);
        if (!keys.includes('name') || !keys.includes('value') || keys.some((key) => !allowed.has(key))) {
            return { ignore: true };
        }
        source = 'two-field';
    } else if (type === 'ols-score/1') {
        source = 'ols-score/1';
    } else if (type === 'xedu:submit-request') {
        source = 'xedu:submit-request';
        const payload = parsed.payload || parsed.score || parsed;
        record = payload === parsed
            ? parsed
            : { ...payload, answers: payload.answers !== undefined ? payload.answers : parsed.answers };
    } else {
        return { ignore: true };
    }
    return {
        ignore: false,
        source,
        name: record?.name,
        value: record?.value,
        passed: record?.passed,
        answers: record?.answers,
    };
}

export function parseLabScoreMessage(input) {
    const classified = classifyScoreInput(input);
    if (classified.ignore) return { ok: false, ignore: true, code: '', draft: null };
    const name = typeof classified.name === 'string' ? classified.name.trim() : '';
    const value = classified.value;
    if (!name || name.length > 200 || typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100) {
        return { ok: false, ignore: false, code: 'score_invalid', message: STUDENT_MESSAGES.score_invalid, draft: null };
    }
    let passed = null;
    if (classified.passed !== undefined && classified.passed !== null) {
        if (typeof classified.passed !== 'boolean') {
            return { ok: false, ignore: false, code: 'score_invalid', message: STUDENT_MESSAGES.score_invalid, draft: null };
        }
        passed = classified.passed;
    }
    const bag = sanitizeAnswersBag(classified.answers);
    if (bag.code) {
        return { ok: false, ignore: false, code: bag.code, message: STUDENT_MESSAGES[bag.code], draft: null };
    }
    const draft = {
        name,
        raw_score: value,
        score: Math.floor(value + 0.5),
        passed,
        source: classified.source,
    };
    if (bag.include) draft.answers = bag.answers;
    return {
        ok: true,
        ignore: false,
        code: '',
        message: '',
        draft,
    };
}

export function createXeduSubmitBridge({
    windowObject = globalThis.window,
    transport,
    onDraftChange,
    onInvalidScore,
    captureBounds,
} = {}) {
    let activeFrame = null;
    let draft = null;
    let saving = false;

    function notify() {
        onDraftChange?.({ hasDraft: Boolean(draft), draft });
    }

    async function remember(nextDraft) {
        const previous = draft;
        draft = nextDraft;
        notify();
        if (typeof transport?.setDraft === 'function') {
            const stored = await transport.setDraft(nextDraft);
            if (stored?.queued) return stored;
            if (stored?.ok === false && stored.code === 'score_invalid') {
                draft = null;
                notify();
            } else if (stored?.ok === false && (stored.code === 'answers_invalid' || stored.code === 'answers_too_large')) {
                draft = previous;
                notify();
                onInvalidScore?.(stored);
                return stored;
            }
        }
        return { ok: true, has_draft: Boolean(draft), draft };
    }

    async function handleMessage(event) {
        const frameWindow = activeFrame?.contentWindow || null;
        if (!frameWindow || event.source !== frameWindow) return;
        const parsed = parseLabScoreMessage(event.data);
        if (parsed.ignore) return;
        if (!parsed.ok) {
            onInvalidScore?.(parsed);
            return;
        }
        await remember(parsed.draft);
    }

    windowObject?.addEventListener?.('message', handleMessage);

    async function run(kind, meta) {
        if (saving) return failure('save_in_flight');
        if ((kind === 'score' || kind === 'combined') && !draft) return failure('no_score_draft');
        const method = kind === 'score'
            ? 'saveScore'
            : kind === 'screenshot'
                ? 'uploadScreenshot'
                : kind === 'evidence'
                    ? 'saveEvidence'
                    : 'saveCombined';
        if (typeof transport?.[method] !== 'function') {
            return failure('no_active_task');
        }
        saving = true;
        const frozen = draft;
        try {
            const bounds = typeof captureBounds === 'function' ? captureBounds() : null;
            const result = kind === 'evidence'
                ? await transport.saveEvidence(bounds, meta)
                : await transport[method](bounds);
            const keepsScoreDraft = kind === 'screenshot' || kind === 'evidence';
            if (result?.platform_status === 'completed' && !keepsScoreDraft) {
                draft = result.draft || null;
            } else if (result?.draft) {
                draft = result.draft;
            } else if (result?.platform_status !== 'completed' && !keepsScoreDraft) {
                draft = result?.has_draft ? (result.draft || frozen) : frozen;
            }
            notify();
            return result;
        } finally {
            saving = false;
        }
    }

    return {
        attach(frame) {
            activeFrame = frame || null;
            return Boolean(activeFrame?.contentWindow);
        },
        detach(frame = null) {
            if (frame && frame !== activeFrame) return;
            activeFrame = null;
        },
        dispose() {
            windowObject?.removeEventListener?.('message', handleMessage);
            activeFrame = null;
        },
        hasDraft() {
            return Boolean(draft);
        },
        getDraft() {
            return draft;
        },
        restoreDraft(nextDraft) {
            const parsed = parseLabScoreMessage(nextDraft);
            draft = parsed.ok ? parsed.draft : null;
            notify();
            return draft;
        },
        clearDraft() {
            draft = null;
            notify();
        },
        saveScore() {
            return run('score');
        },
        uploadScreenshot() {
            return run('screenshot');
        },
        saveEvidence(meta) {
            return run('evidence', meta);
        },
        saveCombined() {
            return run('combined');
        },
    };
}

export { PROTOCOL_VERSION, CONTRACT_REVISION, STUDENT_MESSAGES };
