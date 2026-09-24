import { STUDENT_MESSAGES } from './xedu-submit-bridge.js';

function canonicalCode(code) {
    if (code === 'protocol_unsupported') return 'protocol_mismatch';
    if (code === 'rate_limit' || code === 'too_many_requests') return 'rate_limited';
    return code || '';
}

export function studentSaveMessage(code, fallback = '') {
    const canonical = canonicalCode(code);
    if (STUDENT_MESSAGES[canonical]) return STUDENT_MESSAGES[canonical];
    const text = String(fallback || '').trim();
    if (text) return text;
    return '保存没有完成，请稍后再试。';
}

export function describeStudentSaveChrome({ draft = null, phase = 'idle', result = null, evidenceKind = '' } = {}) {
    const name = typeof draft?.name === 'string' ? draft.name.trim() : '';
    const score = Number.isFinite(draft?.score) ? draft.score : null;
    const hasDraft = Boolean(name) && score !== null;
    const saving = phase === 'saving';
    const completed = phase === 'saved' && result?.platform_status === 'completed';
    const evidenceExperiment = evidenceKind === 'scratch' || evidenceKind === 'notebook';
    const evidenceSaved = completed && result?.mode === 'evidence';
    const failed = phase === 'failed';
    const code = failed ? canonicalCode(result?.code) : '';
    const grantExpired = code === 'grant_expired';
    let statusText = '';
    let tone = '';
    if (saving) {
        statusText = '保存中';
        tone = 'progress';
    } else if (evidenceSaved) {
        statusText = '已保存';
        tone = 'success';
    } else if (completed) {
        statusText = '平台已保存';
        tone = 'success';
    } else if (failed) {
        statusText = studentSaveMessage(code, result?.message);
        tone = 'error';
    }
    return {
        draftLabel: hasDraft ? `待保存：${name} ${score}分` : '',
        statusText,
        tone,
        saveDisabled: saving || !hasDraft,
        combinedDisabled: saving || !hasDraft,
        screenshotDisabled: saving,
        evidenceKind: evidenceExperiment ? evidenceKind : '',
        evidenceVisible: evidenceExperiment,
        evidenceDisabled: saving,
        scoreHidden: evidenceExperiment && !hasDraft,
        screenshotHidden: evidenceExperiment,
        combinedHidden: evidenceExperiment && !hasDraft,
        retryVisible: failed && !grantExpired,
        grantExpired,
    };
}
