# Scratch Stage Sensing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace image-path-driven XEdu Scratch AI blocks with camera-backed, continuous stage sensing blocks.

**Architecture:** A client-side `StageSensingSession` captures one shared Scratch video frame and refreshes enabled task results at a bounded cadence. `xeduCamera` controls Scratch's existing video IO, task extensions expose only task-state blocks, and the existing backend execution route materializes data-URL frames temporarily for the XEduHub runtime.

**Tech Stack:** Scratch VM/CommonJS extensions, browser Canvas/ImageData APIs, Flask/Python standard library, Node test runner, Python unittest.

## Global Constraints

- Do not add dependencies.
- Do not restore removed generic XEdu extension ids.
- Do not expose image paths, raw task ids, workflow objects, or raw result objects to students.
- Use the existing Scratch video provider and `/api/resources/xeduhub/execute` route.
- Limit every enabled task to one in-flight request and a 500 ms minimum sampling interval.

---

### Task 1: Accept request-scoped camera frames in the backend

**Files:**
- Modify: `backend/services/blockly_xeduhub_support.py`
- Test: `backend/tests/test_blockly_resources_api.py`

**Interfaces:**
- Consumes: `spec.input` containing `data:image/png;base64,...`.
- Produces: the existing XEduHub result schema while deleting the temporary decoded image after execution.

- [ ] Write a failing API test that posts a one-pixel PNG data URL and asserts the runtime receives a temporary image path.
- [ ] Run the focused backend test and observe rejection of the data URL as a file path.
- [ ] Materialize valid image data URLs in a temporary file, reject malformed data URLs with a structured 400 response, and remove the file in `finally`.
- [ ] Run the focused backend test and the XEduHub API suite.

### Task 2: Add a shared stage-sensing session

**Files:**
- Create: `scratch-editor/src/extensions/scratch3_xedu_ai/stage-sensing.js`
- Modify: `scratch-editor/src/extensions/scratch3_xedu_ai/index.js`
- Test: `scratch-editor/test/xedu-extension.test.js`

**Interfaces:**
- Consumes: `runtime.ioDevices.video.getFrame`, task ids, and the existing neutral execute route.
- Produces: `enable(taskId)`, `isReady(taskId)`, `result(taskId)`, and non-overlapping timed refreshes.

- [ ] Write failing Node tests for one shared session per runtime, neutral reporters before a result, and no overlapping request per task.
- [ ] Run the Scratch test suite and observe missing session APIs.
- [ ] Implement the session with a 500 ms cadence, canvas data-URL encoding, camera enablement, and failure-safe result storage.
- [ ] Run the Scratch test suite.

### Task 3: Expose camera and task-state blocks

**Files:**
- Modify: `scratch-editor/src/extensions/scratch3_xedu_ai/descriptor.js`
- Modify: `scratch-editor/src/extensions/scratch3_xedu_ai/index.js`
- Create: `scratch-editor/src/extensions/xedu_camera.js`
- Modify: `scratch-editor/scripts/patch-scratch.js`
- Test: `scratch-editor/test/xedu-extension.test.js`

**Interfaces:**
- Consumes: `StageSensingSession` and Scratch video IO.
- Produces: `xeduCamera` plus task extensions with enable/read blocks only.

- [ ] Write failing descriptor tests asserting no sensing block declares `IMAGE`, all sensing extensions expose an enable command and readiness Boolean, and camera controls stage video state/opacity.
- [ ] Run the Scratch tests and observe the old image-argument contract.
- [ ] Replace path-driven commands with enable commands; add semantic menus for body and hand keypoints; route reporters through shared task results; register the camera card and VM module.
- [ ] Run the Scratch tests and rebuild the standalone editor.

### Task 4: Migrate bundled Scratch lessons to stage sensing

**Files:**
- Modify: `scripts/migrate_scratch_xedu_extensions.py`
- Modify: `backend/sasu/**/scratch/*.sb3`
- Modify: `sasu/**/scratch/*.sb3`
- Test: `scratch-editor/test/xedu-extension.test.js`

**Interfaces:**
- Consumes: projects migrated from `xeduAI_runTask` in the prior migration.
- Produces: projects that enable body sensing and use `bodyLastResult` without image inputs.

- [ ] Write a failing project-manifest test that rejects image-input task blocks in bundled Scratch lessons.
- [ ] Run the Scratch tests and observe the current command still owns an `IMAGE` input.
- [ ] Update the migration script to produce enable-and-read task chains, run it over both course roots, and validate all archives.
- [ ] Run all Scratch tests and load a migrated lesson in the Electron debug session.
