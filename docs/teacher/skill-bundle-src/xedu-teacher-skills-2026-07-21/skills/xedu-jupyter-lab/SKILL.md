---
name: xedu-jupyter-lab
description: Use when creating, extending, repairing, or aligning one XEdu Python or Jupyter experiment involving real code, data processing, visual analysis, or model results.
---

# XEdu Jupyter Lab

Build one runnable programming experiment around real Python and supported XEdu capabilities.

## Inputs And Mode

Read the experiment goal, target folder, existing Notebook and helper files, local assets, and any paired HTML or Scratch experiment. Choose `create`, `extend`, `repair`, or `align`; preserve working content whenever possible.

## Deliverables

- `main.ipynb` with concise teaching cells and observable output.
- Only necessary helper Python files, local data, and assets.
- Short student steps and a challenge that changes a parameter, data choice, or analysis.

Use real Python/XEdu APIs from the project. Keep data loading and repetitive utilities out of the teaching cells. Match the paired experiment's terms, parameters, and assets, but do not require a paired HTML or Scratch lab.

## Verification

Run the Notebook's key path in the available local environment. Verify that a meaningful parameter or data change changes an observable output such as a chart, table, image, or model result. Report any unavailable model, hardware, or network dependency.

## Handoff

Report `experiment_path`, `mode`, `files_changed`, `api_evidence`, `execution_evidence`, `shared_terms_or_assets`, and `recommended_next_action`.
