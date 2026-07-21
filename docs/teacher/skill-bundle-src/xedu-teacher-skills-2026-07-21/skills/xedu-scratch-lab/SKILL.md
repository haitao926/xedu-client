---
name: xedu-scratch-lab
description: Use when creating, extending, repairing, migrating, or validating an XEdu Scratch .sb3 experiment with sprites, stage feedback, camera sensing, XEdu extensions, or student block-programming tasks.
---

# XEdu Scratch Lab

Design one teachable Scratch experiment and keep its `.sb3` project runnable.

## Required Discovery

Before designing blocks, read `references/xedu-scratch-capabilities.md`. It is derived from the current extension source and states which blocks are usable in new projects. Re-check the source when it has changed; do not infer blocks from old Blockly tasks, sample projects, or memory.

Use Scratch native events, control, motion, looks, variables, lists, operators, and sensing where they serve the learning goal. Use only the listed current XEdu extensions. Do not use the unregistered historical XEdu AI, workflow, image, media, math, or result extensions for a new experiment.

## Design

Write a compact experiment specification before editing:

```yaml
title:
learning_goal:
blocks:
student_steps:
expected_result:
required_assets:
challenge:
```

Prefer this flow: start -> prepare camera or input -> enable an XEdu capability -> wait until ready -> read or test its result -> make feedback visible on the stage. The feedback must be observable through a sprite, backdrop, speech bubble, costume, variable, sound, or other native Scratch behavior.

## Project Work

- Use `create`, `extend`, `repair`, or `migrate` after inspecting the existing `.sb3` and its `project.json`.
- Put new projects under `lessonN/expM/scratch/*.sb3` and record them as `type: "scratch"` in the existing `course.json` structure.
- Provide only needed images or audio plus concise student instructions.
- For sensing projects, include `xeduCamera`, turn on the camera before enabling sensing, and state the camera/local XEduHub dependency.
- Preserve existing source-relative paths and do not generate Blockly as a substitute.

## Validation

Verify the project opens, starts, saves, and reopens in the local Scratch editor. Inspect `project.json` to confirm the declared extensions and opcodes exist in the current capability reference. Exercise the student path, including the ready-state guard and visible stage feedback. Report unavailable camera, local backend, model, or K10 hardware as a dependency rather than claiming an offline pass.

## Handoff

Report `experiment_path`, `mode`, `files_changed`, `experiment_spec`, `extensions_used`, `capability_evidence`, `validation_notes`, `runtime_dependencies`, and `recommended_next_action`.
