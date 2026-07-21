# Course Building Workflow

Use this reference when turning an idea, source folder, or incomplete course into a usable XEdu course.

## Input Triage

Classify the input as `topic`, `raw-materials`, `course-root`, `single-lesson`, or `pack-output`. Design a course map before writing files for a topic; inventory and map assets before repairing a source folder; never edit `_xedu_pack/` as authoring source.

## Design Pass

Apply `advanced-course-design.md` before selecting experiment forms. Produce desired results, assessment evidence, learning progression, formative decisions, inclusion/contingencies, and an alignment matrix.

For each objective, complete:

`objective -> claim/evidence -> success criteria -> activity/scaffold -> experiment form/resource -> formative response`

Do not route experiment creation while a row is incomplete. Existing resources are candidates, not obligations.

## Resource Mapping And Handoff

| Form | Best use |
| --- | --- |
| HTML | Observe a phenomenon and inspect parameter-linked XEdu Python |
| Scratch | Build a stage-based block-programming task or creative work |
| Jupyter | Run and modify Python/XEdu code, process data, or analyze results |

Route HTML creation to `xedu-html-lab`, `.sb3` work to `xedu-scratch-lab`, Python/Notebook work to `xedu-jupyter-lab`, and package operations to `xedu-pack`. Route older ambiguous lab requests to `lab-build`.

Use combinations only when each form contributes a distinct learning function. Keep concepts, parameter names, data, and assets aligned across forms. Do not require or preserve a fixed HTML/Scratch/Jupyter loop.

## Verification

For a course root, parse `course.json`, confirm each referenced file exists, and report selected forms, present resources, missing planned resources, and any Blockly-only migration gap. Separately verify the pedagogical alignment matrix; file completeness does not prove course quality.
