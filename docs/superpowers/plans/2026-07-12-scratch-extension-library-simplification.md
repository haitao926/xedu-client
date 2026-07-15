# Scratch Extension Library Simplification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce the XEdu Scratch extension picker and VM registration to eight AI task extensions plus a named `行空板 K10` extension.

**Architecture:** `scratch-editor/scripts/patch-scratch.js` is the single source for injected extension-library cards and VM module registration. Workflow, image, media, math, result, and generic vision modules are removed from registration and their wrappers are deleted. The existing `xeduDevice` module is presented as `行空板 K10` in library metadata.

**Tech Stack:** Node.js test runner, Scratch GUI/VM patch script, CommonJS.

## Global Constraints

- Do not add dependencies.
- Do not retain legacy XEdu VM module registrations.
- Keep the existing `xeduDevice` extension id and runtime behavior.
- Show only task-oriented cards plus `行空板 K10` on the XEdu tab.

---

### Task 1: Lock the visible-card contract

**Files:**
- Modify: `scratch-editor/test/xedu-extension.test.js`

**Interfaces:**
- Consumes: the generated Scratch GUI library source at `node_modules/@scratch/scratch-gui/src/lib/libraries/extensions/index.jsx`.
- Produces: a regression test asserting visible XEdu card ids and K10 copy.

- [x] **Step 1: Write the failing test**

```js
test('extension library presents only student AI tasks and K10 hardware', () => {
  const visibleIds = [
    'xeduImageClassification', 'xeduObjectSensing', 'xeduFaceSensing',
    'xeduBodySensing', 'xeduHandSensing', 'xeduTextRecognition',
    'xeduImageSegmentation', 'xeduDepthSensing', 'xeduDevice',
  ];
  const hiddenIds = ['xeduWorkflow', 'xeduImage', 'xeduMedia', 'xeduMath', 'xeduResults'];
  // Assert every visible id is present, every hidden id is absent, and the K10 card uses capability copy.
});
```

- [x] **Step 2: Run the test to verify it fails**

Run: `npm test --prefix scratch-editor`

Expected: FAIL because the generated extension library still contains the five hidden cards and the generic device copy.

- [x] **Step 3: Update the injected card metadata**

Remove the five hidden cards from `xeduExtensions` in `scratch-editor/scripts/patch-scratch.js`. Remove the generic vision registration and the workflow, image, media, math, and result wrapper modules. Keep the existing device module and change only its presentation metadata to `行空板 K10`, inset label `K10`, and a description limited to GPIO, PWM, serial, and servo control.

- [x] **Step 4: Run the test to verify it passes**

Run: `npm test --prefix scratch-editor`

Expected: PASS.

- [x] **Step 5: Rebuild patched upstream metadata and rerun tests**

Run: `node scratch-editor/scripts/patch-scratch.js && npm test --prefix scratch-editor`

Expected: PASS; generated GUI library contains nine XEdu cards and VM registrations contain only the eight AI task extensions plus `xeduDevice`.

## Self-Review

- Spec coverage: the plan removes technical and generic legacy registrations, deletes their wrappers, and renames the existing device card to `行空板 K10`.
- Placeholder scan: no deferred or unspecified implementation steps remain.
- Type consistency: no runtime interfaces change; the existing `xeduDevice` id and module file remain the integration boundary.
