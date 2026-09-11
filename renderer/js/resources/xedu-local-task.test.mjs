import assert from "node:assert/strict";
import test from "node:test";

import {
    GRANT_UNAVAILABLE_MESSAGE,
    exchangeLocalTaskSubmission,
    findLocalTaskCourse,
    getXEduSubmissionContext,
    locateExperimentForLocalTask,
    normalizePlatformSubmission,
    normalizeSubmitArtifacts,
    submissionMatchesResource,
} from "./xedu-local-task.js";

test("normalizePlatformSubmission keeps grant, submit_url, and related ids", () => {
    const submission = normalizePlatformSubmission({
        grant: "grant-1",
        submit_url: "https://learn.example/api/submit",
        artifact_upload_url: "https://learn.example/api/artifacts",
        completion_url: "https://learn.example/api/complete",
        course_id: "course-9",
        activity_id: "act-2",
        resource_id: "res-3",
        local_path: "/tmp/task",
    });
    assert.equal(submission.grant, "grant-1");
    assert.equal(submission.submit_url, "https://learn.example/api/submit");
    assert.equal(submission.artifact_upload_url, "https://learn.example/api/artifacts");
    assert.equal(submission.completion_url, "https://learn.example/api/complete");
    assert.equal(submission.course_id, "course-9");
    assert.equal(submission.activity_id, "act-2");
    assert.equal(submission.resource_id, "res-3");
});

test("getXEduSubmissionContext reads nested submission and returns null without payload", () => {
    assert.equal(getXEduSubmissionContext({ resource: { id: "c1" } }), null);
    assert.equal(getXEduSubmissionContext({
        resource: { id: "c1" },
        file: { path: "quiz/index.html" },
        overview: { htmlFiles: [{ path: "quiz/index.html" }] },
    }), null);
    const context = getXEduSubmissionContext({
        submission: { grant: "abc", submit_url: "https://learn.example/submit" },
    });
    assert.equal(context.grant, "abc");
    assert.equal(context.submit_url, "https://learn.example/submit");
});

test("missing artifacts normalize to an empty list while oversize lists are rejected", () => {
    assert.deepEqual(normalizeSubmitArtifacts(undefined), []);
    assert.deepEqual(normalizeSubmitArtifacts(null), []);
    assert.equal(normalizeSubmitArtifacts({ id: "a" }), null);
    assert.equal(normalizeSubmitArtifacts([1, 2, 3, 4, 5, 6]), null);
    assert.deepEqual(normalizeSubmitArtifacts([]), []);
});

test("findLocalTaskCourse matches local path or course id", () => {
    const courses = [
        { id: "demo", local_path: "/Users/me/course-a" },
        { id: "task-1", origin_id: "ols-9", local_path: "/tmp/open-task" },
    ];
    assert.equal(findLocalTaskCourse(courses, { courseId: "ols-9" }).id, "task-1");
    assert.equal(findLocalTaskCourse(courses, { local_path: "/tmp/open-task" }).id, "task-1");
    assert.equal(findLocalTaskCourse(courses, { localPath: "/missing" }), null);
});

test("locateExperimentForLocalTask prefers the HTML file named in the payload", () => {
    const resource = {
        sections: [
            {
                title: "第 1 课",
                experiments: [
                    {
                        title: "热身",
                        files: [{ path: "warmup.html", name: "warmup.html" }],
                    },
                    {
                        title: "测验",
                        files: [{ path: "quiz/index.html", name: "index.html" }],
                    },
                ],
            },
        ],
    };
    const getOverview = (exp) => ({ htmlFiles: exp.files });
    const located = locateExperimentForLocalTask(resource, "quiz/index.html", getOverview);
    assert.equal(located.exp.title, "测验");
    assert.equal(located.file.path, "quiz/index.html");
    assert.equal(located.expIndex, 1);
});

test("submissionMatchesResource keeps the grant only for the opened course", () => {
    const submission = { grant: "g", submit_url: "https://x.example/s", course_id: "c1", local_path: "/tmp/c1" };
    assert.equal(submissionMatchesResource(submission, { id: "c1", local_path: "/tmp/c1" }), true);
    assert.equal(submissionMatchesResource(submission, { id: "other", local_path: "/tmp/other" }), false);
});

test("exchangeLocalTaskSubmission posts the ticket and stores grant fields", async () => {
    const calls = [];
    const submission = await exchangeLocalTaskSubmission({
        exchange_url: "https://learn.example/api/exchange",
        code: "ticket-1",
        local_path: "/tmp/task",
        course_id: "c1",
    }, async (url, options) => {
        calls.push([url, options]);
        return {
            grant: "grant-9",
            submit_url: "https://learn.example/api/submit",
            artifact_upload_url: "https://learn.example/api/artifacts",
            completion_url: "https://learn.example/api/complete",
            activity_id: "act-4",
            resource_id: "res-8",
        };
    });
    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], "https://learn.example/api/exchange");
    assert.equal(JSON.parse(calls[0][1].body).code, "ticket-1");
    assert.equal(submission.grant, "grant-9");
    assert.equal(submission.submit_url, "https://learn.example/api/submit");
    assert.equal(submission.course_id, "c1");
    assert.equal(submission.activity_id, "act-4");
});

test("exchangeLocalTaskSubmission fails closed when the grant is missing", async () => {
    await assert.rejects(
        () => exchangeLocalTaskSubmission({
            exchange_url: "https://learn.example/api/exchange",
            code: "ticket-2",
        }, async () => ({ submit_url: "https://learn.example/api/submit" })),
        { message: GRANT_UNAVAILABLE_MESSAGE },
    );
});
