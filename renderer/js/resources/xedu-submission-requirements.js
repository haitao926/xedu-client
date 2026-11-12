const PROJECT_KINDS = new Set(['python', 'notebook']);
const PROJECT_EXTENSIONS = new Set(['.py', '.ipynb']);
const NEXT_ACTIONS = new Set([
    'check_status',
    'retry_submission',
    'save_project',
    'reupload_artifact',
    'reduce_artifact',
    'relaunch',
    'return_to_course',
    'complete_self_check',
    'contact_teacher',
    'fix_request',
]);

function normalizeExtensions(value) {
    if (!Array.isArray(value)) return [];
    return [...new Set(value
        .filter((item) => typeof item === 'string')
        .map((item) => item.trim().toLowerCase())
        .filter((item) => PROJECT_EXTENSIONS.has(item)))];
}

export function normalizeSubmissionRequirements(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const projectKind = PROJECT_KINDS.has(value.project_kind) ? value.project_kind : null;
    const artifactMaxBytes = Number.isSafeInteger(value.artifact_max_bytes) && value.artifact_max_bytes > 0
        ? value.artifact_max_bytes
        : null;
    const acceptedProjectExtensions = normalizeExtensions(value.accepted_project_extensions);
    const normalized = {
        requires_web_feedback: value.requires_web_feedback === true,
        requires_project_file: value.requires_project_file === true,
        project_kind: projectKind,
        artifact_max_bytes: artifactMaxBytes,
        accepted_project_extensions: acceptedProjectExtensions,
    };
    if (!normalized.requires_web_feedback
        && !normalized.requires_project_file
        && !normalized.project_kind
        && !normalized.artifact_max_bytes
        && !normalized.accepted_project_extensions.length) return null;
    return normalized;
}

export function describeSubmissionRequirements(value) {
    const requirements = normalizeSubmissionRequirements(value);
    if (!requirements) return '';
    const parts = [];
    if (requirements.requires_project_file) {
        const projectLabel = requirements.project_kind === 'notebook' ? 'Notebook' : 'Python/Notebook';
        parts.push(`需提交${projectLabel}文件`);
    }
    if (requirements.requires_web_feedback) parts.push('需完成网页反馈');
    return parts.length ? `本任务${parts.join('；')}。` : '';
}

export function getSubmissionActionGuidance(result = {}) {
    if (!result) return '';
    const action = typeof result.next_action === 'string' && NEXT_ACTIONS.has(result.next_action)
        ? result.next_action
        : '';
    if (!action) return '';
    if (result.retryable === false && (action === 'check_status' || action === 'retry_submission')) return '';
    const guidance = {
        check_status: '请查询提交状态，确认平台是否已收到本次提交。',
        retry_submission: '请重试本次提交操作，不会改换提交内容。',
        save_project: '请切换到正确的 Python/Notebook 编辑器，先保存作品文件，再点击保存并提交。',
        reupload_artifact: '请在当前编辑器重新导出或重新保存作品文件，再点击保存并提交。',
        reduce_artifact: '请缩小作品文件后重新导出，再点击保存并提交。',
        relaunch: '请回到学习平台重新打开任务；本地代码不会被自动重载覆盖。',
        return_to_course: '请返回课程，打开正确的活动后再提交。',
        complete_self_check: '请完成网页中的自查或作答后，再重新提交。',
        contact_teacher: '请联系老师确认本活动的提交要求。',
        fix_request: '请按平台提示修正内容后，再重新提交。',
    };
    return guidance[action] || '';
}

export function isSubmissionCompleted(result = {}) {
    if (!result) return false;
    return result.ok === true && (result.status === 'completed' || result.platform_status === 'completed');
}

export function isSubmissionConfirming(result = {}) {
    if (!result) return false;
    return result.code === 'submission_not_completed'
        || result.status === 'confirming'
        || result.platform_status === 'confirming';
}

export function isProjectSubmissionRequired(value) {
    const requirements = normalizeSubmissionRequirements(value);
    return Boolean(requirements?.requires_project_file);
}
