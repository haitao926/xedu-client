---
name: xedu-package-course
description: Use when inspecting, converting, staging, building, or publishing an XEdu course, including OpenInnoLab snapshots, SenseInnoBlocks .ib files, Jupyter project dumps, and local folders with course.json.
---

# XEdu Package Course

Own conversion and delivery without changing teaching semantics. Read [references/packaging.md](references/packaging.md) for commands and [references/openinnolab-conversion.md](references/openinnolab-conversion.md) for imported projects.

## Workflow

1. Validate the handoff and preserve a concrete `target_ref` byte-for-byte. Resolve `none` before mutation; reject absolute, drive-prefixed, backslash, empty, `..`, or embedded `.` paths.
2. Inspect first. Keep `course.json` as the only course schema. Verify every referenced path stays inside the course root.
3. For OpenInnoLab Scratch, inventory every extension and opcode and produce `scratch-compatibility.json`. Convert only when every used opcode is `exact-match` or evidence-backed `renamed-mappable`; `unsupported` blocks conversion.
4. For OpenInnoLab Jupyter, preserve the whole project tree; identify learner entrypoints, dependencies, runtime services, and referenced local assets before adding it to `course.json`.
5. Stage a clean copy containing `course.json` and referenced resources only. Never mutate authoring files while staging.
6. Build a readable ZIP preserving relative paths, then inspect it again.
7. Publish only through XEdu Client. Show target and remote deletions, obtain explicit confirmation, and publish the staged copy. Do not implement standalone publishing.

Use `scripts/xedu_package.py` for deterministic inspect, Scratch audit, stage, and build operations.

## Report

Report mode, course root, course ID, resource status, conversion evidence, compatibility report, notebook entrypoints and dependencies, missing assets, staged or built path, verification, publish confirmation state, and next action.
