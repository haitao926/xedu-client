import assert from "node:assert/strict";
import test from "node:test";

import {
    createXEduSubmissionBridge,
    createXEduHttpSubmissionTransport,
    XEDU_SUBMIT_REQUEST_TYPE,
} from "./xedu-submit-bridge.js";

function createWindowHarness() {
    let messageHandler = null;
    return {
        windowObject: {
            addEventListener(type, handler) {
                if (type === "message") messageHandler = handler;
            },
            removeEventListener(type, handler) {
                if (type === "message" && messageHandler === handler) messageHandler = null;
            },
        },
        dispatch(event) {
            assert.ok(messageHandler, "submission bridge should be registered");
            return messageHandler(event);
        },
    };
}

function createFrameHarness() {
    const responses = [];
    const childWindow = {
        postMessage(message, origin) {
            responses.push({ message, origin });
        },
    };
    const frame = { contentWindow: childWindow };
    return { childWindow, frame, responses };
}

function request(overrides = {}) {
    return {
        type: XEDU_SUBMIT_REQUEST_TYPE,
        request_id: "submit-1",
        score: 92,
        passed: true,
        summary: "自查通过",
        artifacts: [],
        ...overrides,
    };
}

function context() {
    return {
        course_id: "course-1",
        activity_id: "activity-1",
        resource_id: "lesson-1/exp-1",
        grant: "opaque-grant",
        artifact_upload_url: "https://platform.example/upload",
        submit_url: "https://platform.example/submit",
        completion_url: "https://platform.example/completion",
    };
}

test("submission bridge rejects an untrusted origin and invalid score", async () => {
    const harness = createWindowHarness();
    const frameHarness = createFrameHarness();
    let submissions = 0;
    const bridge = createXEduSubmissionBridge({
        windowObject: harness.windowObject,
        submitResult: async () => { submissions += 1; },
    });
    bridge.attach(frameHarness.frame, "http://127.0.0.1:5123/course.html", context());

    await harness.dispatch({
        source: frameHarness.childWindow,
        origin: "https://evil.example",
        data: request({ score: 100 }),
    });
    await harness.dispatch({
        source: frameHarness.childWindow,
        origin: "http://127.0.0.1:5123",
        data: request({ score: Number.NaN }),
    });

    assert.equal(submissions, 0);
    assert.equal(frameHarness.responses.length, 1);
    assert.equal(frameHarness.responses[0].message.ok, false);
    assert.match(frameHarness.responses[0].message.error, /有限数值/);
});

test("submission bridge uploads artifacts before submitting and only acknowledges completed", async () => {
    const harness = createWindowHarness();
    const frameHarness = createFrameHarness();
    const uploads = [];
    const submissions = [];
    const bridge = createXEduSubmissionBridge({
        windowObject: harness.windowObject,
        uploadArtifact: async (artifact, activeContext) => {
            uploads.push({ artifact, activeContext });
            return { upload_id: "upload-1" };
        },
        submitResult: async (payload, activeContext) => {
            submissions.push({ payload, activeContext });
            return { ok: true, submission_id: "submission-1", status: "completed" };
        },
    });
    bridge.attach(frameHarness.frame, "http://127.0.0.1:5123/course.html", context());

    await harness.dispatch({
        source: frameHarness.childWindow,
        origin: "http://127.0.0.1:5123",
        data: request({ artifacts: [new Blob(["result"], { type: "text/plain" })] }),
    });

    assert.equal(uploads.length, 1);
    assert.equal(uploads[0].artifact.size, 6);
    assert.equal(uploads[0].activeContext.grant, "opaque-grant");
    assert.deepEqual(submissions[0].payload.artifacts, [{
        upload_id: "upload-1",
        name: "artifact-1",
        mime: "text/plain",
        size: 6,
        sha256: submissions[0].payload.artifacts[0].sha256,
    }]);
    assert.equal(submissions[0].payload.course_id, "course-1");
    assert.equal(frameHarness.responses.at(-1).message.status, "completed");
    assert.equal(frameHarness.responses.at(-1).message.ok, true);
});

test("submission bridge recovers a timed-out submit from completion lookup", async () => {
    const harness = createWindowHarness();
    const frameHarness = createFrameHarness();
    let lookupRequestId = "";
    const bridge = createXEduSubmissionBridge({
        windowObject: harness.windowObject,
        submitResult: async () => { throw new Error("网络超时"); },
        lookupSubmission: async (requestId) => {
            lookupRequestId = requestId;
            return { ok: true, submission_id: "submission-recovered", status: "completed" };
        },
    });
    bridge.attach(frameHarness.frame, "http://127.0.0.1:5123/course.html", context());

    await harness.dispatch({
        source: frameHarness.childWindow,
        origin: "http://127.0.0.1:5123",
        data: request({ request_id: "retry-safe-1" }),
    });

    assert.equal(lookupRequestId, "retry-safe-1");
    assert.equal(frameHarness.responses.at(-1).message.ok, true);
    assert.equal(frameHarness.responses.at(-1).message.submission_id, "submission-recovered");
});

test("submission bridge does not treat an accepted-but-uncompleted result as done", async () => {
    const harness = createWindowHarness();
    const frameHarness = createFrameHarness();
    const bridge = createXEduSubmissionBridge({
        windowObject: harness.windowObject,
        submitResult: async () => ({ ok: true, submission_id: "submission-pending", status: "accepted" }),
    });
    bridge.attach(frameHarness.frame, "http://127.0.0.1:5123/course.html", context());

    await harness.dispatch({
        source: frameHarness.childWindow,
        origin: "http://127.0.0.1:5123",
        data: request({ request_id: "pending-1" }),
    });

    assert.equal(frameHarness.responses.at(-1).message.ok, false);
    assert.equal(frameHarness.responses.at(-1).message.status, "failed");
    assert.notEqual(frameHarness.responses.at(-1).message.status, "completed");
});

test("HTTP submission transport attaches the opaque grant without exposing student identity", async () => {
    const requests = [];
    const transport = createXEduHttpSubmissionTransport({
        fetchImpl: async (url, options) => {
            requests.push({ url, options });
            return new Response(JSON.stringify({ upload_id: "upload-2" }), {
                status: 200,
                headers: { "content-type": "application/json" },
            });
        },
    });
    const artifact = { body: new Blob(["x"], { type: "text/plain" }), name: "a.txt", mime: "text/plain", size: 1 };
    const activeContext = context();

    await transport.uploadArtifact(artifact, activeContext);

    assert.equal(requests[0].options.headers.get("Authorization"), "Bearer opaque-grant");
    assert.equal(requests[0].options.headers.get("X-XEdu-Filename"), "a.txt");
    assert.equal(requests[0].options.body, artifact.body);
    assert.equal("student_id" in activeContext, false);
});
