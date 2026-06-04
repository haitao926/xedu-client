import assert from "node:assert/strict";
import test from "node:test";

import {
    getInspectionExperiment,
    mapRemoteExperimentToLocalCourse,
    pickAutoTestEntry,
    summarizeInspection,
} from "./course-inspection-utils.js";

test("pickAutoTestEntry prefers HTML before Blockly, Notebook, and Python", () => {
    const entry = pickAutoTestEntry({
        files: [
            { path: "lesson/demo.py", type: "python" },
            { path: "lesson/workspace.blockly.xml", type: "blockly" },
            { path: "lesson/index.html", type: "html" },
            { path: "lesson/practice.ipynb", type: "ipynb" },
        ],
    });

    assert.equal(entry.kind, "html");
    assert.equal(entry.file.path, "lesson/index.html");
});

test("pickAutoTestEntry falls through to Blockly, Notebook, then Python", () => {
    assert.equal(pickAutoTestEntry({ files: [{ path: "demo.blockly.json" }, { path: "demo.py" }] }).kind, "blockly");
    assert.equal(pickAutoTestEntry({ files: [{ path: "demo.ipynb" }, { path: "demo.py" }] }).kind, "notebook");
    assert.equal(pickAutoTestEntry({ files: [{ path: "demo.py" }] }).kind, "python");
});

test("summarizeInspection maps experiment status counts", () => {
    const summary = summarizeInspection({
        sections: [
            {
                section_index: 0,
                experiments: [
                    { experiment_index: 0, status: "ready" },
                    { experiment_index: 1, status: "partial" },
                ],
            },
            {
                section_index: 1,
                experiments: [{ experiment_index: 0, status: "broken" }],
            },
        ],
    }, { section_count: 2, experiment_count: 3 });

    assert.deepEqual(summary, {
        section_count: 2,
        experiment_count: 3,
        ready_count: 1,
        partial_count: 1,
        broken_count: 1,
    });
});

test("getInspectionExperiment finds a status by section and experiment index", () => {
    const experiment = getInspectionExperiment({
        sections: [
            {
                section_index: 2,
                experiments: [{ experiment_index: 3, status: "broken" }],
            },
        ],
    }, 2, 3);

    assert.equal(experiment.status, "broken");
});

test("mapRemoteExperimentToLocalCourse preserves target indexes when local course still has them", () => {
    const mapped = mapRemoteExperimentToLocalCourse({
        sections: [
            { experiments: [{ title: "a" }] },
            { experiments: [{ title: "b" }, { title: "c" }] },
        ],
    }, 1, 1);

    assert.deepEqual(mapped, { sectionIndex: 1, experimentIndex: 1 });
});
