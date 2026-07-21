import assert from "node:assert/strict";
import test from "node:test";

import { isUsableJupyterViewBounds } from "./jupyter.js";

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
