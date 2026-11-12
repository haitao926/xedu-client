---
name: xedu-package-course
description: Use when inspecting, converting, staging, or building XEdu course-content ZIPs from local course folders or imported projects. Does not install the XEdu Client application.
---

# XEdu Package Course

Own conversion and delivery without changing teaching semantics. Read [references/packaging.md](references/packaging.md) for commands and [references/openinnolab-conversion.md](references/openinnolab-conversion.md) for imported projects.

This skill builds an **XEdu course ZIP** from a local course root. It does not build or install the XEdu Client application.

## Workflow

1. Validate the handoff and preserve a concrete `target_ref` byte-for-byte. Resolve `none` before mutation; reject absolute, drive-prefixed, backslash, empty, `..`, or embedded `.` paths.
2. Inspect first. Keep `course.json` as the only course schema. Verify every `entry`/`entry_file`, cover, and `files[]` reference stays inside the course root and exists. A declared experiment entry is packaged even when it is not repeated in `files[]`.
3. For OpenInnoLab Scratch, inventory every extension and opcode and produce `scratch-compatibility.json`. Convert only when every used opcode is `exact-match` or evidence-backed `renamed-mappable`; `unsupported` blocks conversion.
4. For OpenInnoLab Jupyter, preserve the whole project tree; identify learner entrypoints, dependencies, runtime services, and referenced local assets before adding it to `course.json`.
5. Stage a clean copy containing `course.json` and referenced resources only. Never mutate authoring files while staging. The stage directory may be new, but must be outside the authoring course.
6. Build a readable, deterministic ZIP preserving relative paths, then verify its members, `course.json`, references, and CRC. Use the reported SHA-256 as the artifact identity.
7. Publish only through XEdu Client. Show target and remote deletions, obtain explicit confirmation, and publish the staged copy. Do not implement standalone publishing.

Run `scripts/xedu_package.py` from this skill folder. The direct package commands are:

```bash
python3 scripts/xedu_package.py inspect --input /path/to/course-or-course.zip
python3 scripts/xedu_package.py stage --course-root /path/to/course --output /path/out/course-stage
python3 scripts/xedu_package.py build --course-root /path/to/course --output /path/out/course.zip
```

`inspect` accepts either a course directory or an existing ZIP. It is read-only and reports missing assets by experiment; ZIP inspection also reports unreferenced files and the package SHA-256. A clean ZIP can be handed to XEdu Client; one with gaps stops, and one with extra files should be normalized by staging/building again. `stage` and `build` stop if any declared local resource is missing, refuse to overwrite existing outputs, and preserve the authoring files. Packaging preserves `course.json.version`; it never increments or rewrites the source version. Update the course version explicitly when course content changes, not when merely rebuilding the same package.

Read [references/packaging.md](references/packaging.md) for path rules, ZIP contents, output behavior, and verification details. Use `scratch-audit` only for Scratch or SenseInnoBlocks artifacts that need compatibility analysis.

## Report

Report mode, input type, course root, course ID/version, resource status by experiment, conversion evidence, Scratch validation, legacy Blockly gaps, missing assets, staged or built path, ZIP SHA-256 and verification, publish confirmation state, and next action.
