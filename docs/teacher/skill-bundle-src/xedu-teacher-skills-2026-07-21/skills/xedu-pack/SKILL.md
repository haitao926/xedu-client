---
name: xedu-pack
description: Use when inspecting, staging, building, or publishing a local XEdu course, including courses with Scratch .sb3 projects or legacy Blockly resources.
---

# XEdu Pack

Inspect, stage, build, and publish local XEdu courses. It does not create teaching content.

## Inspect

1. Classify the input as `course-root`, `raw-materials`, `single-lesson`, or `pack-output`.
2. Parse and normalize `course.json` with `scan_course()`.
3. Group each experiment's existing resources by declared `type` and extension: `html`, `scratch`/`.sb3`, `ipynb`, legacy `blockly`, and materials.
4. Compare declared resources with the experiment forms selected by the course plan or handoff, not a fixed HTML/Blockly/Jupyter trio. If the intended forms are absent, report the uncertainty rather than inventing a requirement.
5. Validate every `.sb3`: it is a readable ZIP containing parseable `project.json`; its declared extensions and XEdu block opcodes match currently available Scratch extensions. Read `references/implementation.md` for commands and boundaries.

## Scratch And Blockly Policy

- Treat `type: "scratch"` and `.sb3` as first-class resources.
- Prefer Scratch when Scratch and Blockly coexist.
- Treat `.blockly.xml` and `.blockly.json` as historical compatibility resources. If Blockly is the only visual-programming resource, report a migration gap; do not generate a new Blockly resource.
- Preserve valid source-relative paths when staging or building. Do not force resources into a different experiment-directory schema.

## Modes

Use `inspect`, `stage`, `build`, or `publish` in that order when applicable. Read `references/implementation.md` for direct service calls and build details.

- `stage`: create a minimal, publishable copy containing only referenced resources.
- `build`: retain referenced relative paths in the staged package and create a ZIP.
- `publish`: follow the existing Gitea safety rules. For a single-course repo, list remote files that would be deleted and obtain confirmation before writing.

## Boundaries

- Do not publish by default.
- Do not modify the authoring course when staging a delivery copy.
- Do not turn a Scratch validation failure into a silent success.

## Output Contract

Report `input_type`, `course_root`, `course_id`, `resource_status_by_experiment`, `scratch_validation`, `legacy_blockly_gaps`, `missing_assets`, `changed_files`, and `recommended_next_action` (`stage_for_pack`, `build_pack`, `publish`, or `stop_with_gaps`).
