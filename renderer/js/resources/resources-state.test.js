import assert from "node:assert/strict";
import test from "node:test";

import { createResourcesState } from "./resources-state.js";

test("resources state creates isolated classroom state", () => {
    const first = createResourcesState();
    const second = createResourcesState();

    first.classroomConfig.name = "培训课堂";
    first.classroomState.classrooms.push({ name: "教师机" });
    first.classroomSyncTimer = 42;

    assert.equal(second.classroomConfig.name, "");
    assert.deepEqual(second.classroomState.classrooms, []);
    assert.equal(second.classroomSyncTimer, null);
});

test("resources state keeps classroom defaults safe for new sessions", () => {
    const state = createResourcesState();

    assert.equal(state.classroomConfig.autoDiscover, true);
    assert.equal(state.classroomState.active, false);
    assert.equal(state.classroomState.connected, false);
    assert.equal(state.classroomState.activeSectionIndex, null);
});

test("resources state gives QuickForm settings an isolated default", () => {
    const first = createResourcesState();
    const second = createResourcesState();

    first.quickFormSettings.username = "teacher";

    assert.equal(first.quickFormSettings.base_url, "https://quickform.cn");
    assert.equal(second.quickFormSettings.username, "");
    assert.equal(second.quickFormSettings.enabled, false);
});
