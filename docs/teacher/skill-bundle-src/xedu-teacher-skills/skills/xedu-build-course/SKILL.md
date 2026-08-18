---
name: xedu-build-course
description: Use when planning, organizing, repairing, or extending an XEdu course from a teaching topic, source materials, lesson brief, or folder containing course.json.
---

# XEdu Build Course

Design the course before creating files. Treat `course.json` as the only persistent course structure, and route implementation to the focused lab or package skill.

## Workflow

1. Inspect all supplied materials and classify the input as `topic`, `raw-materials`, `course-root`, `single-lesson`, or `pack-output`. Never edit `_xedu_pack/` as authoring source.
2. Establish learners, curriculum basis, duration, equipment, network, accessibility, privacy, and assessment constraints. Mark missing facts as assumptions instead of inventing them.
3. Read [references/course-design.md](references/course-design.md). Choose `learning-sequence`, `project-task`, or `PBL-unit`; do not label a tool exercise as PBL.
4. Define observable learning outcomes and evidence before activities. Map each outcome to success criteria, learning activity, formative response, and resource.
5. Select the minimum justified experiment forms: `html`, `scratch`, or `jupyter`. Scratch is the default visual-programming form. Do not create new Blockly resources.
6. For an existing course root, read `course.json`, inventory referenced files, preserve valid relative paths, and distinguish missing files from pedagogical gaps.
7. Route lab creation, repair, alignment, or validation to `xedu-build-lab`. Route inspection, OpenInnoLab conversion, staging, building, or publishing to `xedu-package-course`.
8. Re-read the resulting course and verify alignment, feasibility, individual evidence, runtime dependencies, and fallback paths.

## Boundaries

- Do not create HTML, Scratch, Notebook, package, or publish output in this skill.
- Do not duplicate `course.json` inside a handoff or introduce another course schema.
- Do not force every course to use all three experiment forms.
- Do not claim standards alignment, public users, hardware integration, or runtime success without evidence.

## Handoff

Emit only this routing record when another skill must continue:

```yaml
xedu_handoff:
  version: 2
  route: xedu-build-lab | xedu-package-course
  intent: create | extend | repair | align | validate | inspect | stage | build | publish
  input_type: topic | raw-materials | course-root | single-lesson | pack-output
  form: html | scratch | jupyter | none
  target_ref: . | <course-root-relative POSIX path> | none
  constraints: []
  next_action: <one sentence>
```

Use `none` only before a destination exists. Otherwise preserve `target_ref` byte-for-byte. Reject absolute paths, drive prefixes, backslashes, empty values, `..`, and embedded `.` segments; never silently normalize them. Resolve `none` before any filesystem mutation.

## Report

Report the input classification, course mode and rationale, learner and constraint assumptions, outcomes, evidence plan, course progression, alignment gaps, selected forms, files inspected or changed, handoff when needed, and the next action.
