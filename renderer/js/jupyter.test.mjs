import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
    getApiErrorMessage,
    isUsableJupyterViewBounds,
    isBackendReadyForJupyterState,
    shouldRestartJupyterForProject,
    shouldDisplayEmbeddedJupyterState,
    shouldRestoreJupyterView,
} from "./jupyter.js";

const jupyterSource = readFileSync(new URL("./jupyter.js", import.meta.url), "utf8");

test("Jupyter restarts automatically when the workspace root changes", () => {
    assert.equal(shouldRestartJupyterForProject({
        running: true,
        targetProjectDir: "C:\\Courses\\course-b",
        statusProjectDir: "C:\\Courses\\course-a",
    }), true);
});

test("Jupyter keeps running when another lesson uses the same course root", () => {
    assert.equal(shouldRestartJupyterForProject({
        running: true,
        targetProjectDir: "C:\\Courses\\course-a",
        statusProjectDir: "c:/courses/course-a/",
    }), false);
});

test("Jupyter startup without attachment does not auto-restore the Lab home page", () => {
    assert.match(
        jupyterSource,
        /await refreshStatus\(\{ restoreView: options\.attachView !== false \}\);/,
    );
    assert.match(
        jupyterSource,
        /options\.restoreView !== false && shouldRestoreJupyterView\(/,
    );
});

test("Jupyter restarts when a running server does not report its workspace root", () => {
    assert.equal(shouldRestartJupyterForProject({
        running: true,
        targetProjectDir: "/courses/course-a",
        statusProjectDir: "",
    }), true);
});

test("Jupyter view bounds remain valid beside a collapsed sidebar", () => {
    assert.equal(isUsableJupyterViewBounds({
        x: 78,
        y: 56,
        width: 946,
        height: 712,
    }), true);
});

test("Jupyter view bounds reject an empty placeholder", () => {
    assert.equal(isUsableJupyterViewBounds({
        x: 208,
        y: 56,
        width: 0,
        height: 712,
    }), false);
});

test("Jupyter restores an embedded view after the renderer reloads", () => {
    assert.equal(shouldRestoreJupyterView({
        running: true,
        url: "http://127.0.0.1:8888/lab",
        pageVisible: true,
        intent: true,
        viewAttached: false,
        isAttaching: false,
    }), true);
});

test("Jupyter does not restore a view without an explicit session intent", () => {
    assert.equal(shouldRestoreJupyterView({
        running: true,
        url: "http://127.0.0.1:8888/lab",
        pageVisible: true,
        intent: false,
        viewAttached: false,
        isAttaching: false,
    }), false);
});

test("Jupyter readiness only allows normal API calls after the managed backend is ready", () => {
    assert.equal(isBackendReadyForJupyterState({ status: "ready" }), true);
    assert.equal(isBackendReadyForJupyterState({ status: "starting" }), false);
    assert.equal(isBackendReadyForJupyterState({ status: "error" }), false);
});

test("Jupyter remains visible when the Python navigation is active before the body class catches up", () => {
    assert.equal(shouldDisplayEmbeddedJupyterState({
        workspaceActive: true,
        studentMode: true,
        studentPythonPage: false,
        studentPythonNavActive: true,
        hasVisibleModal: false,
        suppressUntil: 0,
        now: 100,
    }), true);
});

test("Jupyter stays hidden on another student page", () => {
    assert.equal(shouldDisplayEmbeddedJupyterState({
        workspaceActive: true,
        studentMode: true,
        studentPythonPage: false,
        studentPythonNavActive: false,
        hasVisibleModal: false,
        suppressUntil: 0,
        now: 100,
    }), false);
});

test("Jupyter startup errors show the backend message instead of raw JSON", () => {
    assert.equal(
        getApiErrorMessage(new Error(JSON.stringify({
            error_code: "environment_not_ready",
            message: "JupyterLab 检查超时，请稍后重试。",
        }))),
        "JupyterLab 检查超时，请稍后重试。",
    );
});
