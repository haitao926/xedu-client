---
name: xedu-build-lab
description: Use when creating, extending, repairing, aligning, or validating one XEdu HTML, Scratch, or Jupyter experiment and its local teaching assets.
---

# XEdu Build Lab

Build one focused, runnable experiment. Select exactly one form per invocation unless the user explicitly asks to align paired resources.

## Select The Form

- `html`: interactive observation, controls, visible result, and parameter-linked copyable Python. Read [references/html.md](references/html.md).
- `scratch`: sprites, stage feedback, events, sensing, or block programming. Read [references/scratch.md](references/scratch.md). Use Scratch when visual programming is unspecified; never generate Blockly.
- `jupyter`: executable Python, data processing, charts, model output, or inspectable reasoning. Read [references/jupyter.md](references/jupyter.md).

If a handoff is supplied, echo its `route`, `intent`, `form`, and `target_ref`. Require route `xedu-build-lab`. Preserve a valid concrete `target_ref` byte-for-byte. If it is `none`, acknowledge it and resolve a concrete course-root-relative POSIX path before writing. Reject absolute paths, drive prefixes, backslashes, empty values, `..`, and embedded `.` segments.

## Workflow

1. Read the learning goal, student action, expected result, target folder, `course.json` entry when present, existing assets, paired resources, and actual XEdu API or extension source.
2. Choose `create`, `extend`, `repair`, `align`, or `validate`. Preserve working files and source-relative paths.
3. Write a compact experiment specification: goal, learner steps, observable result, assets, runtime dependencies, challenge, and verification method.
4. Implement only the files needed for the selected form. Use verified APIs and block capabilities; do not invent imports, opcodes, models, services, or evidence.
5. Verify the student path and a meaningful parameter or input change. Report unavailable models, camera, XEduHub, hardware, or network as unverified dependencies.
6. When the experiment belongs to a course, update only the relevant existing `course.json` entry; do not create a second structure.
7. Hand completed course-level inspection or packaging to `xedu-package-course`.

## Hard Boundaries

- Do not package or publish here.
- Do not convert a SenseInnoBlocks `.ib` by matching similar block names. That work requires opcode-level compatibility evidence in `xedu-package-course`.
- Do not reduce a Jupyter project dump to one notebook; preserve notebooks and supporting files together.
- Do not claim a Scratch project works merely because its ZIP opens.

## Report

Report form, mode, target path, files changed, API or capability evidence, observable result, runtime dependencies, verification performed, unresolved gaps, and the next action.
