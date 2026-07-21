import assert from "node:assert/strict";
import test from "node:test";

import { buildLocalCourseFileUrl, resolveJupyterWorkspaceTarget } from "./file-utils.js";

test("buildLocalCourseFileUrl uses the opaque resource handle", () => {
    const url = buildLocalCourseFileUrl({
        local_path: "/Users/teacher/XeduCourses/demo",
        resource_handle: "opaque handle",
    }, "lesson 1/index.html", { baseURL: "http://127.0.0.1:5123/" });

    assert.equal(
        url,
        "http://127.0.0.1:5123/api/resources/local-file/opaque%20handle/lesson%201/index.html",
    );
    assert.doesNotMatch(url, /^file:/);
});

test("buildLocalCourseFileUrl rejects incomplete and remote inputs", () => {
    assert.equal(buildLocalCourseFileUrl({ local_path: "/tmp/course" }, "cover.png"), "");
    assert.equal(buildLocalCourseFileUrl({
        local_path: "/tmp/course",
        resource_handle: "handle",
    }, "https://example.com/cover.png"), "");
});

test("resolveJupyterWorkspaceTarget starts a notebook from its experiment directory", () => {
    assert.deepEqual(resolveJupyterWorkspaceTarget({
        coursePath: "/Users/apple/Documents/XeduCourses/human-pose-control-hardware",
        experimentPath: "lesson2/exp1",
        filePath: "lesson2/exp1/main.ipynb",
    }), {
        projectDir: "/Users/apple/Documents/XeduCourses/human-pose-control-hardware/lesson2/exp1",
        filePath: "main.ipynb",
    });
});

test("resolveJupyterWorkspaceTarget keeps nested notebooks relative to the experiment", () => {
    assert.deepEqual(resolveJupyterWorkspaceTarget({
        coursePath: "C:\\XeduCourses\\pose-control",
        experimentPath: "lesson2/exp1",
        filePath: "lesson2/exp1/notebooks/control.ipynb",
    }), {
        projectDir: "C:\\XeduCourses\\pose-control\\lesson2\\exp1",
        filePath: "notebooks/control.ipynb",
    });
});
