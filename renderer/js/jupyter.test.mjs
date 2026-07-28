import assert from "node:assert/strict";
import test from "node:test";

import { isUsableJupyterViewBounds, shouldRestoreJupyterView } from "./jupyter.js";

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
