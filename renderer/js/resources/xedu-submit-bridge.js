import {
    GRANT_UNAVAILABLE_MESSAGE,
    MAX_SUBMIT_ARTIFACTS,
    buildPlatformSubmitBody,
    getXEduSubmissionContext,
    normalizeSubmitArtifacts,
} from "./xedu-local-task.js";

const REQUEST_TYPE = "xedu:submit-request";
const RESPONSE_TYPE = "xedu:submit-response";

function resolveTrustedOrigin(frameUrl) {
    try {
        const parsed = new URL(String(frameUrl || ""));
        const localHost = ["127.0.0.1", "localhost", "::1"].includes(parsed.hostname);
        return parsed.protocol === "http:" && localHost ? parsed.origin : "";
    } catch (_) {
        return "";
    }
}

function validateSubmitRequest(request) {
    if (!request || request.type !== REQUEST_TYPE) return "";
    if (typeof request.requestId !== "string" || !request.requestId || request.requestId.length > 128) {
        return "提交请求标识无效";
    }
    if (typeof request.score !== "number" || !Number.isFinite(request.score)) {
        return "提交分数无效";
    }
    if (typeof request.passed !== "boolean") {
        return "提交通过状态无效";
    }
    if (request.summary != null && typeof request.summary !== "string") {
        return "提交摘要无效";
    }
    const artifacts = normalizeSubmitArtifacts(request.artifacts);
    if (!artifacts) {
        return Array.isArray(request.artifacts)
            ? `提交附件数量不能超过 ${MAX_SUBMIT_ARTIFACTS} 个`
            : "提交附件格式无效";
    }
    return null;
}

export function createXEduSubmitBridge({
    windowObject = globalThis.window,
    submitFetch,
    getSubmissionContext,
} = {}) {
    let activeFrame = null;
    let activeOrigin = "";
    let activeSubmission = null;
    let inFlight = false;

    function currentSubmission() {
        return getXEduSubmissionContext({ submission: activeSubmission })
            || (typeof getSubmissionContext === "function" ? getXEduSubmissionContext({ submission: getSubmissionContext() }) : null);
    }

    function postResponse(targetWindow, payload) {
        if (!targetWindow || !activeOrigin) return;
        try {
            targetWindow.postMessage({ type: RESPONSE_TYPE, ...payload }, activeOrigin);
        } catch (_) {
            // The iframe may have navigated away while submit was running.
        }
    }

    async function handleMessage(event) {
        const frameWindow = activeFrame?.contentWindow || null;
        if (!frameWindow || event.source !== frameWindow || event.origin !== activeOrigin) return;
        const request = event.data;
        if (request?.type !== REQUEST_TYPE) return;

        const validationError = validateSubmitRequest(request);
        if (validationError) {
            postResponse(frameWindow, { requestId: request?.requestId || "", error: validationError });
            return;
        }
        if (inFlight) {
            postResponse(frameWindow, { requestId: request.requestId, error: "上一份提交仍在处理，请稍候" });
            return;
        }

        const submission = currentSubmission();
        if (!submission?.grant || !submission?.submit_url) {
            postResponse(frameWindow, { requestId: request.requestId, error: GRANT_UNAVAILABLE_MESSAGE });
            return;
        }
        if (typeof submitFetch !== "function") {
            postResponse(frameWindow, { requestId: request.requestId, error: GRANT_UNAVAILABLE_MESSAGE });
            return;
        }

        inFlight = true;
        try {
            const artifacts = normalizeSubmitArtifacts(request.artifacts) || [];
            const response = await submitFetch(submission.submit_url, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${submission.grant}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(buildPlatformSubmitBody({ ...request, artifacts }, submission)),
            });
            postResponse(frameWindow, {
                requestId: request.requestId,
                status: response?.status || 502,
                headers: response?.headers || {},
                body: response?.body || "",
            });
        } catch (error) {
            postResponse(frameWindow, {
                requestId: request.requestId,
                error: error?.message || "平台提交失败",
            });
        } finally {
            inFlight = false;
        }
    }

    windowObject?.addEventListener?.("message", handleMessage);

    return {
        attach(frame, frameUrl, submission = null) {
            activeFrame = frame || null;
            activeOrigin = resolveTrustedOrigin(frameUrl);
            activeSubmission = getXEduSubmissionContext({ submission }) || submission || null;
            inFlight = false;
            return Boolean(activeFrame && activeOrigin);
        },
        detach(frame = null) {
            if (frame && frame !== activeFrame) return;
            activeFrame = null;
            activeOrigin = "";
            activeSubmission = null;
            inFlight = false;
        },
        dispose() {
            windowObject?.removeEventListener?.("message", handleMessage);
            activeFrame = null;
            activeOrigin = "";
            activeSubmission = null;
            inFlight = false;
        },
    };
}

export { getXEduSubmissionContext, GRANT_UNAVAILABLE_MESSAGE, MAX_SUBMIT_ARTIFACTS };
