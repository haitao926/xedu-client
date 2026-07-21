---
name: xedu-html-lab
description: Use when creating, extending, repairing, or aligning one XEdu HTML interactive experiment that lets students observe a phenomenon and inspect parameter-linked XEdu Python code.
---

# XEdu HTML Lab

Build one focused interactive experience page for an experiment.

## Inputs And Mode

Read the experiment goal, target folder, `course.json` entry when present, existing assets, and the actual XEdu API source or a verified local example. Choose `create`, `extend`, `repair`, or `align`; do not overwrite working assets.

## Deliverables

- `index.html` and only the local assets it needs.
- A small set of meaningful controls that changes both the visible result and the displayed, copyable XEdu Python snippet.
- Short student actions and a challenge tied to the same phenomenon.

Use actual XEdu APIs only. Do not invent imports, model names, endpoint payloads, or parameters. Match terminology and assets with any paired Scratch or Jupyter experiment.

## Page Quality

- Put the interaction, result, and code in the first viewport.
- Keep one page focused on one core phenomenon.
- Use a clear, classroom-readable layout for common displays and projection.
- Avoid decorative animation, marketing sections, nested cards, and long explanatory copy.
- Prefer local assets and an offline-capable interaction where the experiment permits it.

## Verification

Before reporting completion, confirm that controls update the visible result and exact Python code; that the code uses an API present in this project; and that text, controls, and result remain usable at common desktop widths.

## Handoff

Report `experiment_path`, `mode`, `files_changed`, `api_evidence`, `code_linkage`, `verification_notes`, and `recommended_next_action`.
