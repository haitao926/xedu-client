export const GRANT_UNAVAILABLE_MESSAGE = "平台提交授权不可用";
export const MAX_SUBMIT_ARTIFACTS = 5;

function trimText(value) {
    return String(value ?? "").trim();
}

export function normalizeRelativePath(value = "") {
    return trimText(value).replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+$/, "");
}

export function normalizeLocalTaskPayload(payload = {}) {
    const source = payload && typeof payload === "object" ? payload : {};
    return {
        exchange_url: trimText(source.exchange_url || source.exchangeUrl),
        code: trimText(source.code || source.ticket || source.token),
        local_path: trimText(source.local_path || source.localPath || source.projectDir || source.project),
        file: trimText(source.file || source.file_path || source.filePath),
        course_id: trimText(source.course_id || source.courseId),
        activity_id: trimText(source.activity_id || source.activityId),
        resource_id: trimText(source.resource_id || source.resourceId),
        grant: trimText(source.grant),
        submit_url: trimText(source.submit_url || source.submitUrl),
        artifact_upload_url: trimText(source.artifact_upload_url || source.artifactUploadUrl),
        completion_url: trimText(source.completion_url || source.completionUrl),
        submission: source.submission && typeof source.submission === "object" ? source.submission : null,
    };
}

export function normalizePlatformSubmission(raw) {
    if (!raw || typeof raw !== "object") return null;
    const nested = raw.submission && typeof raw.submission === "object" ? raw.submission : null;
    const source = nested ? { ...raw, ...nested } : raw;
    const grant = trimText(source.grant || source.access_token || source.accessToken);
    const submitUrl = trimText(source.submit_url || source.submitUrl);
    const artifactUploadUrl = trimText(source.artifact_upload_url || source.artifactUploadUrl);
    const completionUrl = trimText(source.completion_url || source.completionUrl);
    const courseId = trimText(source.course_id || source.courseId);
    const activityId = trimText(source.activity_id || source.activityId);
    const resourceId = trimText(source.resource_id || source.resourceId);
    const localPath = trimText(source.local_path || source.localPath || source.projectDir || source.project);
    const file = trimText(source.file || source.file_path || source.filePath);
    if (!grant && !submitUrl && !courseId && !resourceId && !localPath && !file) {
        return null;
    }
    return {
        grant,
        submit_url: submitUrl,
        artifact_upload_url: artifactUploadUrl,
        completion_url: completionUrl,
        course_id: courseId,
        activity_id: activityId,
        resource_id: resourceId,
        local_path: localPath,
        file,
        opened_course_id: trimText(source.opened_course_id || source.openedCourseId),
        opened_local_path: trimText(source.opened_local_path || source.openedLocalPath),
    };
}

export function getXEduSubmissionContext(context) {
    if (!context || typeof context !== "object") return null;
    if (context.submission && typeof context.submission === "object") {
        return normalizePlatformSubmission(context.submission);
    }
    if (context.grant || context.submit_url || context.submitUrl || context.access_token) {
        return normalizePlatformSubmission(context);
    }
    return null;
}

export function submissionMatchesResource(submission, resource) {
    const normalized = normalizePlatformSubmission(submission);
    if (!normalized || !resource) return false;
    const ids = [resource.id, resource.origin_id, resource.resource_id]
        .map((value) => trimText(value))
        .filter(Boolean);
    if (normalized.opened_course_id && ids.includes(normalized.opened_course_id)) return true;
    if (normalized.course_id && ids.includes(normalized.course_id)) return true;
    if (normalized.resource_id && ids.includes(normalized.resource_id)) return true;
    const resourcePath = normalizeRelativePath(resource.local_path || "");
    const storedPath = normalizeRelativePath(normalized.opened_local_path || normalized.local_path || "");
    if (resourcePath && storedPath && (resourcePath === storedPath || resourcePath.endsWith(`/${storedPath}`) || storedPath.endsWith(`/${resourcePath}`))) {
        return true;
    }
    return false;
}

export function findLocalTaskCourse(courses = [], payload = {}) {
    const submission = normalizePlatformSubmission(payload) || {};
    const courseId = trimText(payload.course_id || payload.courseId || submission.course_id || submission.resource_id);
    const localPath = normalizeRelativePath(payload.local_path || payload.localPath || payload.projectDir || submission.local_path);
    return (Array.isArray(courses) ? courses : []).find((course) => {
        if (!course) return false;
        const ids = [course.id, course.origin_id, course.resource_id].map((value) => trimText(value)).filter(Boolean);
        if (courseId && ids.includes(courseId)) return true;
        const coursePath = normalizeRelativePath(course.local_path || "");
        return Boolean(localPath && coursePath && (
            coursePath === localPath
            || coursePath.endsWith(`/${localPath}`)
            || localPath.endsWith(`/${coursePath}`)
        ));
    }) || null;
}

export function locateExperimentForLocalTask(resource, filePath, getOverview) {
    if (typeof getOverview !== "function") return null;
    const wanted = normalizeRelativePath(filePath);
    const sections = Array.isArray(resource?.sections) ? resource.sections : [];
    let fallback = null;
    for (let sectionIndex = 0; sectionIndex < sections.length; sectionIndex += 1) {
        const section = sections[sectionIndex];
        const experiments = Array.isArray(section?.experiments) ? section.experiments : [];
        for (let expIndex = 0; expIndex < experiments.length; expIndex += 1) {
            const exp = experiments[expIndex];
            const overview = getOverview(exp) || {};
            const htmlFiles = Array.isArray(overview.htmlFiles) ? overview.htmlFiles : [];
            if (!fallback && htmlFiles.length) {
                fallback = {
                    section,
                    sectionIndex,
                    exp,
                    expIndex,
                    overview,
                    file: htmlFiles[0],
                };
            }
            if (!wanted) continue;
            const match = htmlFiles.find((file) => {
                const path = normalizeRelativePath(file?.path || file?.name || "");
                return path === wanted || path.endsWith(`/${wanted}`) || wanted.endsWith(`/${path}`);
            });
            if (match) {
                return {
                    section,
                    sectionIndex,
                    exp,
                    expIndex,
                    overview,
                    file: match,
                };
            }
        }
    }
    return fallback;
}

export async function exchangeLocalTaskSubmission(payload, requestJson) {
    const request = normalizeLocalTaskPayload(payload);
    const existing = normalizePlatformSubmission({ ...request, ...(request.submission || {}) });
    if (existing?.grant && existing?.submit_url) {
        return existing;
    }
    const exchangeUrl = request.exchange_url;
    const code = request.code;
    if (!exchangeUrl || !code) {
        throw new Error("缺少平台提交交换参数");
    }
    if (typeof requestJson !== "function") {
        throw new Error(GRANT_UNAVAILABLE_MESSAGE);
    }
    const response = await requestJson(exchangeUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
    });
    const parsed = typeof response === "string"
        ? JSON.parse(response)
        : (response && typeof response.body === "string" && response.body
            ? JSON.parse(response.body)
            : response);
    const data = parsed?.submission && typeof parsed.submission === "object"
        ? { ...parsed, ...parsed.submission }
        : parsed;
    const normalized = normalizePlatformSubmission({ ...request, ...data });
    if (!normalized?.grant || !normalized?.submit_url) {
        throw new Error(GRANT_UNAVAILABLE_MESSAGE);
    }
    return normalized;
}

export function normalizeSubmitArtifacts(artifacts) {
    if (artifacts == null) return [];
    if (!Array.isArray(artifacts)) return null;
    if (artifacts.length > MAX_SUBMIT_ARTIFACTS) return null;
    return artifacts;
}

export function buildPlatformSubmitBody(request, submission) {
    const artifacts = normalizeSubmitArtifacts(request?.artifacts);
    return {
        score: request?.score,
        passed: request?.passed,
        summary: request?.summary == null ? "" : request.summary,
        artifacts: artifacts || [],
        course_id: submission?.course_id || "",
        activity_id: submission?.activity_id || "",
        resource_id: submission?.resource_id || "",
    };
}
