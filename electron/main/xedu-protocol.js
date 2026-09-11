const XEDU_PROTOCOL = 'xedu';

function readAction(parsed) {
    return (parsed.hostname || parsed.pathname.replace(/^\/+/, '') || '').trim();
}

function readParam(parsed, ...keys) {
    for (const key of keys) {
        const value = (parsed.searchParams.get(key) || '').trim();
        if (value) return value;
    }
    return '';
}

function parsePracticeDeepLink(rawUrl) {
    if (!rawUrl || typeof rawUrl !== 'string') return null;
    try {
        const parsed = new URL(rawUrl);
        if (parsed.protocol !== `${XEDU_PROTOCOL}:`) return null;
        if (readAction(parsed) !== 'open-practice') return null;
        const projectDir = readParam(parsed, 'project');
        const filePath = readParam(parsed, 'file');
        const kind = readParam(parsed, 'kind');
        if (!projectDir || !filePath) return null;
        return { projectDir, filePath, kind };
    } catch (_) {
        return null;
    }
}

function parseLocalTaskDeepLink(rawUrl) {
    if (!rawUrl || typeof rawUrl !== 'string') return null;
    try {
        const parsed = new URL(rawUrl);
        if (parsed.protocol !== `${XEDU_PROTOCOL}:`) return null;
        if (readAction(parsed) !== 'open-local-task') return null;
        const payload = {
            exchangeUrl: readParam(parsed, 'exchange_url', 'exchangeUrl'),
            code: readParam(parsed, 'code', 'ticket', 'token'),
            localPath: readParam(parsed, 'local_path', 'localPath', 'project'),
            filePath: readParam(parsed, 'file', 'file_path', 'filePath'),
            courseId: readParam(parsed, 'course_id', 'courseId'),
            activityId: readParam(parsed, 'activity_id', 'activityId'),
            resourceId: readParam(parsed, 'resource_id', 'resourceId'),
            grant: readParam(parsed, 'grant'),
            submitUrl: readParam(parsed, 'submit_url', 'submitUrl'),
            artifactUploadUrl: readParam(parsed, 'artifact_upload_url', 'artifactUploadUrl'),
            completionUrl: readParam(parsed, 'completion_url', 'completionUrl'),
        };
        if (!payload.exchangeUrl && !(payload.grant && payload.submitUrl) && !payload.localPath) {
            return null;
        }
        return payload;
    } catch (_) {
        return null;
    }
}

function parseXeduDeepLink(rawUrl) {
    const localTask = parseLocalTaskDeepLink(rawUrl);
    if (localTask) return { type: 'open-local-task', channel: 'deep-link-open-local-task', payload: localTask };
    const practice = parsePracticeDeepLink(rawUrl);
    if (practice) return { type: 'open-practice', channel: 'deep-link-open-practice', payload: practice };
    return null;
}

module.exports = {
    XEDU_PROTOCOL,
    parsePracticeDeepLink,
    parseLocalTaskDeepLink,
    parseXeduDeepLink,
};
