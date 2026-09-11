import assert from "node:assert/strict";
import test from "node:test";

import { GRANT_UNAVAILABLE_MESSAGE, createXEduSubmitBridge } from "./xedu-submit-bridge.js";

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
            assert.ok(messageHandler, "message bridge should be registered");
            return messageHandler(event);
        },
    };
}

function createChildWindow() {
    return {
        postMessageCalls: [],
        postMessage(message, origin) {
            this.postMessageCalls.push([message, origin]);
        },
    };
}

test("submit bridge Bearer-posts score-only requests and defaults missing artifacts to []", async () => {
    const harness = createWindowHarness();
    const childWindow = createChildWindow();
    const requests = [];
    const bridge = createXEduSubmitBridge({
        windowObject: harness.windowObject,
        submitFetch: async (url, options) => {
            requests.push({ url, options });
            return { status: 200, headers: { "content-type": "application/json" }, body: '{"ok":true}' };
        },
    });
    bridge.attach(
        { contentWindow: childWindow },
        "http://127.0.0.1:5123/api/resources/local-file/course/quiz/index.html",
        {
            grant: "grant-1",
            submit_url: "https://learn.example/api/submit",
            artifact_upload_url: "https://learn.example/api/artifacts",
            completion_url: "https://learn.example/api/complete",
            course_id: "course-1",
            activity_id: "act-1",
            resource_id: "res-1",
        },
    );

    await harness.dispatch({
        source: childWindow,
        origin: "http://127.0.0.1:5123",
        data: {
            type: "xedu:submit-request",
            requestId: "submit-1",
            score: 88,
            passed: true,
            summary: "全部答对",
        },
    });

    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, "https://learn.example/api/submit");
    assert.equal(requests[0].options.method, "POST");
    assert.equal(requests[0].options.headers.Authorization, "Bearer grant-1");
    assert.deepEqual(JSON.parse(requests[0].options.body), {
        score: 88,
        passed: true,
        summary: "全部答对",
        artifacts: [],
        course_id: "course-1",
        activity_id: "act-1",
        resource_id: "res-1",
    });
    assert.deepEqual(childWindow.postMessageCalls, [[{
        type: "xedu:submit-response",
        requestId: "submit-1",
        status: 200,
        headers: { "content-type": "application/json" },
        body: '{"ok":true}',
    }, "http://127.0.0.1:5123"]]);
});

test("submit bridge rejects more than 5 artifacts and missing grant", async () => {
    const harness = createWindowHarness();
    const childWindow = createChildWindow();
    let requests = 0;
    const bridge = createXEduSubmitBridge({
        windowObject: harness.windowObject,
        submitFetch: async () => { requests += 1; },
        getSubmissionContext: () => null,
    });
    bridge.attach({ contentWindow: childWindow }, "http://127.0.0.1:5123/quiz.html", {
        grant: "grant-1",
        submit_url: "https://learn.example/api/submit",
    });

    await harness.dispatch({
        source: childWindow,
        origin: "http://127.0.0.1:5123",
        data: {
            type: "xedu:submit-request",
            requestId: "submit-too-many",
            score: 10,
            passed: false,
            artifacts: [1, 2, 3, 4, 5, 6],
        },
    });

    bridge.attach({ contentWindow: childWindow }, "http://127.0.0.1:5123/quiz.html", null);
    await harness.dispatch({
        source: childWindow,
        origin: "http://127.0.0.1:5123",
        data: {
            type: "xedu:submit-request",
            requestId: "submit-no-grant",
            score: 10,
            passed: true,
            artifacts: [],
        },
    });

    assert.equal(requests, 0);
    assert.match(childWindow.postMessageCalls[0][0].error, /附件数量不能超过 5/);
    assert.equal(childWindow.postMessageCalls[1][0].error, GRANT_UNAVAILABLE_MESSAGE);
});

test("submit bridge ignores messages from another window or origin", async () => {
    const harness = createWindowHarness();
    const childWindow = createChildWindow();
    let requests = 0;
    const bridge = createXEduSubmitBridge({
        windowObject: harness.windowObject,
        submitFetch: async () => { requests += 1; },
    });
    bridge.attach({ contentWindow: childWindow }, "http://127.0.0.1:5123/quiz.html", {
        grant: "grant-1",
        submit_url: "https://learn.example/api/submit",
    });
    const request = {
        type: "xedu:submit-request",
        requestId: "submit-2",
        score: 1,
        passed: true,
        artifacts: [],
    };

    await harness.dispatch({ source: {}, origin: "http://127.0.0.1:5123", data: request });
    await harness.dispatch({ source: childWindow, origin: "http://evil.example", data: request });

    assert.equal(requests, 0);
    assert.deepEqual(childWindow.postMessageCalls, []);
});
