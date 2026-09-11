const REQUEST_TYPE = "xedu:submit-request";
const RESPONSE_TYPE = "xedu:submit-response";
const DEFAULT_MAX_ARTIFACT_BYTES = 10 * 1024 * 1024;
const MAX_REQUEST_ID_LENGTH = 128;
const MAX_SUMMARY_LENGTH = 500;

function resolveTrustedOrigin(frameUrl) {
    try {
        const parsed = new URL(String(frameUrl || ""));
        return ["http:", "https:"].includes(parsed.protocol) ? parsed.origin : "";
    } catch (_) {
        return "";
    }
}

function createRequestId() {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
    return `submission-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeRequestId(request) {
    return String(request?.request_id || request?.requestId || "").trim();
}

function validateSubmissionRequest(request) {
    if (!request || request.type !== REQUEST_TYPE) return "";
    const requestId = normalizeRequestId(request);
    if (!requestId || requestId.length > MAX_REQUEST_ID_LENGTH) {
        return "提交请求标识无效";
    }
    if (!Number.isFinite(request.score)) return "提交分数必须是有限数值";
    if (request.passed !== true) return "请先完成自查，再提交结果";
    if (typeof request.summary !== "string" || request.summary.length > MAX_SUMMARY_LENGTH) {
        return "提交说明无效";
    }
    if (request.artifacts == null) request.artifacts = [];
    if (!Array.isArray(request.artifacts) || request.artifacts.length > 5) {
        return "提交附件数量无效";
    }
    return null;
}

function normalizeArtifactName(name, index) {
    const fallback = `artifact-${index + 1}`;
    const value = String(name || fallback).replace(/[\\/\0\r\n]+/g, "_").trim();
    return (value || fallback).slice(0, 160);
}

function getArtifactSize(body) {
    if (typeof body?.size === "number") return body.size;
    if (body instanceof ArrayBuffer) return body.byteLength;
    if (ArrayBuffer.isView(body)) return body.byteLength;
    return -1;
}

function isBinaryBody(body) {
    return Boolean(
        body && (
            typeof body.arrayBuffer === "function" ||
            body instanceof ArrayBuffer ||
            ArrayBuffer.isView(body)
        ),
    );
}

function normalizeArtifact(input, index, maxBytes) {
    const source = input && typeof input === "object" && "blob" in input ? input.blob : input;
    if (!isBinaryBody(source)) {
        throw new Error("附件必须是 Blob 或 ArrayBuffer");
    }
    const size = getArtifactSize(source);
    if (!Number.isSafeInteger(size) || size < 0 || size > maxBytes) {
        throw new Error(`附件大小超过限制（${Math.floor(maxBytes / 1024 / 1024)}MB）`);
    }
    const mime = String(input?.mime || source.type || "application/octet-stream").toLowerCase();
    if (mime.length > 120 || /[\r\n]/.test(mime)) throw new Error("附件类型无效");
    return {
        body: source,
        name: normalizeArtifactName(input?.name, index),
        mime,
        size,
    };
}

async function digestSha256(body) {
    if (!globalThis.crypto?.subtle?.digest) return "";
    let bytes;
    if (typeof body.arrayBuffer === "function") {
        bytes = await body.arrayBuffer();
    } else if (body instanceof ArrayBuffer) {
        bytes = body;
    } else if (ArrayBuffer.isView(body)) {
        bytes = body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength);
    } else {
        return "";
    }
    const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
}

function isCompletedResponse(response) {
    return response?.ok === true && response?.status === "completed";
}

function makeSubmissionError(message, cause = null) {
    const error = new Error(String(message || "提交失败"));
    error.cause = cause;
    return error;
}

async function readJsonResponse(response) {
    const text = await response.text();
    if (!text) return {};
    try {
        return JSON.parse(text);
    } catch (_) {
        throw makeSubmissionError("平台返回了无效数据");
    }
}

/**
 * Creates the HTTP adapter used by the host. The grant is only read from the
 * attach-time context; this module never stores it outside the active bridge.
 */
export function createXEduHttpSubmissionTransport({ fetchImpl = globalThis.fetch } = {}) {
    async function request(url, context, options = {}) {
        if (typeof fetchImpl !== "function") throw makeSubmissionError("平台提交不可用");
        const endpoint = String(url || "").trim();
        const grant = String(context?.grant || "").trim();
        if (!/^https?:\/\//i.test(endpoint) || !grant) {
            throw makeSubmissionError("请从学习平台点「打开 XEdu Client」重新进入后再提交分数");
        }
        const headers = new Headers(options.headers || {});
        headers.set("Authorization", `Bearer ${grant}`);
        const response = await fetchImpl(endpoint, { ...options, headers });
        const payload = await readJsonResponse(response);
        if (!response.ok) {
            throw makeSubmissionError(payload?.message || payload?.error || `平台请求失败（${response.status}）`);
        }
        return payload;
    }

    return {
        async uploadArtifact(artifact, context) {
            const response = await request(
                context?.artifact_upload_url || context?.artifactUploadUrl,
                context,
                {
                    method: "POST",
                    body: artifact.body,
                    headers: {
                        "Content-Type": artifact.mime,
                        "X-XEdu-Filename": artifact.name,
                        "X-XEdu-SHA256": artifact.sha256 || "",
                    },
                },
            );
            const uploadId = String(response?.upload_id || response?.uploadId || "").trim();
            if (!uploadId) throw makeSubmissionError("平台没有返回附件编号");
            return { ...artifact, upload_id: uploadId };
        },

        async submitResult(payload, context) {
            return request(
                context?.submit_url || context?.submitUrl,
                context,
                {
                    method: "POST",
                    body: JSON.stringify(payload),
                    headers: { "Content-Type": "application/json" },
                },
            );
        },

        async lookupSubmission(requestId, context) {
            const endpoint = String(context?.completion_url || context?.completionUrl || "").trim();
            if (!endpoint) return null;
            const separator = endpoint.includes("?") ? "&" : "?";
            return request(`${endpoint}${separator}request_id=${encodeURIComponent(requestId)}`, context);
        },
    };
}

export function createXEduSubmissionBridge({
    windowObject = globalThis.window,
    uploadArtifact,
    submitResult,
    lookupSubmission,
    maxArtifactBytes = DEFAULT_MAX_ARTIFACT_BYTES,
} = {}) {
    let activeFrame = null;
    let activeOrigin = "";
    let activeContext = null;
    const inFlight = new Map();
    const completed = new Map();

    function postResponse(targetWindow, payload) {
        if (!targetWindow || !activeOrigin) return;
        try {
            targetWindow.postMessage({ type: RESPONSE_TYPE, ...payload }, activeOrigin);
        } catch (_) {
            // The iframe can navigate away while the platform request is running.
        }
    }

    async function processRequest(request, requestId) {
        const submissionContext = activeContext;
        if (typeof submitResult !== "function") {
            throw makeSubmissionError("平台提交不可用");
        }
        if (request.artifacts.length && typeof uploadArtifact !== "function") {
            throw makeSubmissionError("附件上传不可用");
        }
        const artifacts = [];
        for (let index = 0; index < request.artifacts.length; index += 1) {
            const artifact = normalizeArtifact(request.artifacts[index], index, maxArtifactBytes);
            artifact.sha256 = await digestSha256(artifact.body);
            const uploaded = await uploadArtifact(artifact, submissionContext);
            const uploadId = String(uploaded?.upload_id || uploaded?.uploadId || "").trim();
            if (!uploadId) throw makeSubmissionError("附件上传没有返回编号");
            artifacts.push({
                upload_id: uploadId,
                name: artifact.name,
                mime: artifact.mime,
                size: artifact.size,
                sha256: artifact.sha256,
            });
        }

        const payload = {
            course_id: String(submissionContext?.course_id || ""),
            activity_id: String(submissionContext?.activity_id || ""),
            resource_id: String(submissionContext?.resource_id || ""),
            request_id: requestId,
            score: request.score,
            passed: true,
            summary: request.summary,
            artifacts,
        };
        try {
            const response = await submitResult(payload, submissionContext);
            if (isCompletedResponse(response)) return response;
            throw makeSubmissionError(response?.message || "平台尚未确认保存完成");
        } catch (error) {
            if (typeof lookupSubmission === "function") {
                try {
                    const recovered = await lookupSubmission(requestId, submissionContext);
                    if (isCompletedResponse(recovered)) return recovered;
                } catch (_) {
                    // Preserve the original submit error and let the page retry.
                }
            }
            throw error;
        }
    }

    async function handleMessage(event) {
        const frameWindow = activeFrame?.contentWindow || null;
        if (!frameWindow || event.source !== frameWindow || event.origin !== activeOrigin) return;
        const request = event.data;
        if (request?.type !== REQUEST_TYPE) return;

        const requestId = normalizeRequestId(request) || createRequestId();
        const validationError = validateSubmissionRequest({ ...request, request_id: requestId });
        if (validationError) {
            postResponse(frameWindow, { request_id: requestId, ok: false, status: "failed", error: validationError });
            return;
        }
        if (completed.has(requestId)) {
            postResponse(frameWindow, { request_id: requestId, ...completed.get(requestId) });
            return;
        }
        if (inFlight.has(requestId)) {
            postResponse(frameWindow, { request_id: requestId, ok: false, status: "submitting" });
            return;
        }

        const task = processRequest(request, requestId);
        inFlight.set(requestId, task);
        try {
            const response = await task;
            const result = {
                ok: true,
                status: "completed",
                submission_id: response.submission_id || response.submissionId || "",
            };
            completed.set(requestId, result);
            postResponse(frameWindow, { request_id: requestId, ...result });
        } catch (error) {
            postResponse(frameWindow, {
                request_id: requestId,
                ok: false,
                status: "failed",
                error: error?.message || "提交失败，请重试",
            });
        } finally {
            inFlight.delete(requestId);
        }
    }

    windowObject?.addEventListener?.("message", handleMessage);

    return {
        attach(frame, frameUrl, context = null) {
            activeFrame = frame || null;
            activeOrigin = resolveTrustedOrigin(frameUrl);
            activeContext = context && typeof context === "object" ? { ...context } : null;
            return Boolean(activeFrame && activeOrigin);
        },
        detach(frame = null) {
            if (frame && frame !== activeFrame) return;
            activeFrame = null;
            activeOrigin = "";
            activeContext = null;
            inFlight.clear();
            completed.clear();
        },
        dispose() {
            windowObject?.removeEventListener?.("message", handleMessage);
            this.detach();
        },
    };
}

export const XEDU_SUBMIT_REQUEST_TYPE = REQUEST_TYPE;
export const XEDU_SUBMIT_RESPONSE_TYPE = RESPONSE_TYPE;
