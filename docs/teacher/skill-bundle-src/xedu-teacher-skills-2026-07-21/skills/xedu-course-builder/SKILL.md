---
name: xedu-course-builder
description: Use when planning, organizing, repairing, or extending an XEdu course from a teaching topic, source materials, or a course folder with course.json. Classify whether the request is a learning sequence, a bounded project task, or a full PBL unit before selecting HTML, Scratch, Jupyter, or hardware experiments.
---

# XEdu Course Builder

Plan the learning architecture and organize XEdu course resources. This skill chooses experiment forms; specialist skills create the experiments. It does not turn a collection of tools or a final artifact into a project by assertion.

**Core principle:** pedagogy determines resources and tools. A sequence of HTML, Scratch, Jupyter, or hardware is an implementation path, not a course design.

Read `references/advanced-course-design.md` for the design framework. Read `references/project-course-model.md` before changing or validating `course.json`.
Read `references/pbl-course-design.md` before drafting whenever the request says or implies `PBL`, `project-based`, `project-centered`, a public product, a real user/community problem, or a redesign from disconnected activities into a project.

## Mode Decision: Make This Before Designing Lessons

Classify the request as exactly one of these modes. Do not choose a mode from the title, the presence of an artifact, or the number of digital tools.

| Mode | Use when | Do not claim |
| --- | --- | --- |
| `learning_sequence` | Learners need concepts, procedures, or component practice; the work does not yet need a real project frame. | That a lab, exercise, or final worksheet is PBL. |
| `project_task` | Learners can address a bounded problem and make/test a product, but the available scope cannot substantiate every full-PBL element. | `full PBL`, `Gold Standard PBL`, or an external public product without evidence. |
| `PBL_unit` | The project carries the central learning goals and passes the PBL readiness gate below. | That a show-and-tell, tool tour, or end-of-unit "dessert project" is the unit. |

A short lesson can contribute to a longer PBL unit, but do not describe that lesson as a self-contained full PBL unit unless its stated context proves the missing inquiry, feedback, revision, and public-audience work exists.

For a `project_task` or `PBL_unit`, first draft a **project charter** with: learner group; driving problem/question; intended user or audience; actual context of use; student product or action; non-negotiable knowledge/skills; constraints; meaningful student decisions; evidence of value; and the final audience. Keep a **fact/choice/assumption log**: label each important statement as a supplied fact, a course-design choice, or a pending assumption; for an assumption, name the validation action, owner, and latest useful time to resolve it. If curriculum standards are absent, report them as pending mapping rather than inventing an alignment.

## PBL Readiness Gate

Items 1-7 are the PBLWorks essential project-design elements. This skill adds curriculum traceability and process evidence as course-delivery safeguards. Use `PBL_unit` only when the project is explicitly traceable to the central learning goals or curriculum basis, each item below has a concrete design answer and visible evidence, and sufficient time/resources exist to carry it out. If the curriculum basis is not supplied, the status cannot exceed `partial` until it is mapped; a project cannot become a `PBL_unit` merely by adding an audience or a polished product.

1. **Challenging problem or question:** A meaningful, appropriately difficult problem/question organizes the learning, not merely a teacher-assigned build instruction.
2. **Sustained inquiry:** Students generate need-to-know questions, use sources, data, observations, or expert/user input, and apply findings to later decisions. Plan an inspectable inquiry trail: question -> source/data/observation -> finding -> design or test change. A research paragraph or pre-scripted tool tutorial is not sustained inquiry.
3. **Authenticity:** The task has a credible real-world, disciplinary, community, or personally meaningful purpose. State who would use, judge, or be affected by the result and why it matters.
4. **Student voice and choice:** Students own consequential decisions such as audience need, success criteria, evidence, solution approach, trade-off, or presentation. Choosing a color, role, or title alone does not satisfy this requirement.
5. **Critique and revision:** Drafts or prototypes receive specific feedback before finalization; students revise and retain a before/after decision trail.
6. **Reflection:** Students examine what they learned, how their inquiry/design choices worked, and what obstacle or limitation remains.
7. **Public product:** Work is shared with people beyond the immediate class or teacher, who have a defined role. A class presentation can be useful critique but does not by itself satisfy a full-PBL public product.
**Additional XEdu delivery condition - process evidence and response:** The teacher collects diagnostic/formative evidence during the project, gives criteria-linked feedback, and changes a next teaching move, grouping, workshop, resource, or revision opportunity in response. A score recorded after the project is not process evaluation.

If one of these is missing, say which one and design the work honestly as `project_task` or `learning_sequence`. Do not paper over a missing external user, feedback loop, hardware link, or inquiry phase with aspirational prose.

## Project Integrity Rules

Apply these rules to every `project_task` and `PBL_unit`.

- **Authenticity audit:** Do not invent a cooperating user, community partner, expert, deployment, or impact. If contact is not confirmed, label the audience as prospective and plan a feasible substitute such as structured user testing, a local adult reviewer, or a documented scenario; adjust the PBL claim accordingly.
- **Causal-chain audit:** For every claimed solution, map `input -> transformation/decision -> output -> user-relevant effect`. For every resource or tool, state its learning role, runtime input/output, connection evidence, test, and limitation. If components do not exchange data/control or otherwise form the claimed system, label them `concept explainer`, `parallel investigation`, `simulation`, or `future integration`, not an end-to-end prototype.
- **Impact-chain audit:** For a nontechnical, social, behavioral, or policy project, map `current condition -> intervention/decision -> expected mechanism -> observable near-term indicator -> scope/limitation`. Distinguish feasibility (can it be done?), usability/acceptance (can people use it?), and actual impact (did it change the intended outcome?). Do not claim causal or long-term impact from a demonstration, small test, or unaudited self-report.
- **No forced integration:** Existing HTML, Scratch, Notebook, hardware, worksheets, or demonstrations are candidates, not obligations. Retain, repurpose, defer, or archive each one based on a distinct learning or project function. Never score a team for using the most tools.
- **Inquiry changes work:** Retain an inquiry trail of `question -> source/data/observation -> finding -> design/test change`. A source, observation, expert comment, or test result must affect a criterion, design choice, model, rule, or next test. Otherwise record it as orientation, not inquiry evidence.
- **Feedback changes work:** Schedule feedback before final submission. Capture the feedback source, the decision made, what changed, and the rationale. "Students revise" without a traceable change is not a revision cycle.
- **Truthful testing:** Distinguish planned behavior, simulation, component demonstration, and integrated real-device evidence. Define boundary cases and failure conditions; do not treat a successful demo as general validity.
- **Permissions and care:** Before involving people, media, data, health/safety claims, or a community partner, check consent, data minimization, privacy, accessibility, safeguarding, partner authority, time commitment, and a fallback if the partner is unavailable. Do not build a project around data or a deployment that learners are not permitted to collect or conduct.

## Two Design Layers

Keep course architecture separate from classroom execution. Produce both only when useful, and never bury one inside the other.

1. **Design record (for designer/teacher):** mode decision and rationale; project charter; fact/choice/assumption log; learner model; desired results; evidence system; PBL readiness audit where applicable; resource decisions; causal-chain and applicable impact-chain audits; permissions/partner check; risk/contingency plan; and implementation questions.
2. **Execution plan (for teacher/students):** lesson/run-of-show; prompts; materials; roles; checkpoints; student artifacts; feedback protocol; assessment criteria; timing; and contingency actions. It contains only the rationale needed to run the course. Include a public-audience and partner fallback when the project depends on one.

When a request asks for a teacher-ready handout or Word document, write the execution plan as the primary deliverable and provide the design record separately or as an appendix only when requested.

## Course Design Stack

Complete these layers in order:

1. **Frame the course.** Classify the input as `topic`, `raw-materials`, `course-root`, `single-lesson`, or `pack-output`. Establish curriculum basis, unit position, time, learner group, resource constraints, and the authentic context in which learning will be used.
2. **Choose the course mode.** Apply the mode decision. For a project mode, complete the project charter and, before any activity sequence, the PBL readiness and causal-chain audits; add the impact-chain and permissions/partner audits when their triggers apply.
3. **Build a learner model.** Record prerequisites, prior experience, component skills, likely misconceptions, variability, access barriers, and diagnostic evidence. Mark assumptions explicitly.
4. **Define desired results.** Use backward design to specify transfer goals, enduring understandings, essential questions, required knowledge/skills, and observable objectives. Objectives state student action, conditions, and expected quality.
5. **Design evidence before activities.** For each objective define the learning claim, acceptable evidence, assessment task, and success criteria. Include diagnostic, formative, and summative evidence where appropriate. For team projects, include individual evidence of learning; a polished group artifact alone cannot prove each learner's understanding.
6. **Build the learning progression.** Sequence prerequisite concepts and component skills toward independent transfer. Choose scaffolds deliberately: activation of prior knowledge, modeling/worked examples, guided practice, independent performance, transfer, retrieval, and reflection. Fade support as competence grows. In a project mode, place just-in-time workshops, inquiry, prototyping, critique, revision, and public sharing where the project needs them rather than teaching everything first.
7. **Plan inclusive learning experiences.** Apply UDL through meaningful options for engagement, representation, and action/expression without weakening common success criteria. Add support, extension, accessibility, equipment/network, collaboration, and audience contingencies.
8. **Create formative decision points.** State what evidence the teacher will elicit, how it will be interpreted, what feedback students receive, and how teaching changes for common response patterns. In a project mode, identify the feedback provider and the revision opportunity.
9. **Audit alignment and feasibility.** Map every objective to evidence, criteria, learning activity, and resource. Remove orphan activities and unsupported assessments. Check time, transitions, cognitive load, staffing, equipment, safety, permissions, audience access, partner authority/availability, data boundaries, and fallback paths. Re-run the PBL readiness, causal-chain, and impact-chain audits after the resource map is complete.
10. **Select experiment forms.** Only after the alignment and integrity audits, choose `html`, `scratch`, `jupyter`, hardware, or a justified combination. Existing resources may be retained, reordered, repurposed, deferred, or left unused according to alignment.
11. **Plan evaluation and revision.** Define what implementation evidence the teacher will collect, what would count as a design failure, and what should be revised after teaching.

## Quality Gates

- `curriculum source` is distinct from local project notes; do not invent standards or citations. A `PBL_unit` must show how its central learning goals carry the named curriculum basis; if it is pending, the course cannot be labeled a complete PBL unit.
- `visible artifact` is not automatically evidence of learning; specify the reasoning or performance it demonstrates.
- `assessment` is formative only when its evidence changes the next teaching or learning action.
- `engagement` does not replace conceptual progression, deliberate practice, or transfer.
- `resource reuse` does not justify preserving a weak sequence.
- `project framing` does not replace a verified user, authentic inquiry, critique/revision, or public audience.
- `integration` is a technical claim that needs an observable data/control path or another explicit, truthful relationship.
- `impact` is a causal claim that needs evidence beyond feasibility, a brief usability test, or a polished presentation.
- `public product` is not a final slide deck performed only for the teacher and classmates.
- `student choice` must influence a consequential decision and be bounded by visible success criteria.
- `team product` does not by itself establish individual learning.
- `partner involvement` must name a role, permission boundary, timing, and fallback; a partner title alone is not a commitment.
- Do not route experiment creation while an alignment row is incomplete.

## Route Experiments

| Learning need | Route |
| --- | --- |
| Interactive observation with parameter-linked XEdu Python | `xedu-html-lab` |
| `.sb3`, sprites, stage feedback, or XEdu Scratch blocks | `xedu-scratch-lab` |
| Python/XEdu programming, data, charts, or result analysis | `xedu-jupyter-lab` |
| Legacy request with an unspecified lab form | `lab-build` |
| Inspect, build, or publish a course package | `xedu-pack` |

Scratch is the default visual-programming form for new courses; Blockly is historical compatibility only. Use combinations only when each form performs a distinct learning function. Keep shared concepts, names, data, and assets consistent across forms.

## Resource Model

Use `course.json -> sections[] -> experiments[] -> files[]`. New Scratch projects use `lessonN/expM/scratch/*.sb3` with `type: "scratch"`. Preserve existing relative paths.

For every experiment, separate selected forms, present files, missing planned files, and legacy Blockly migration gaps from ordinary file-existence status.

## Boundaries

- Do not generate an HTML page, `.sb3`, Notebook, or package here.
- Do not publish by default.
- Do not treat `_xedu_pack/` as authoring source.
- Do not generate Blockly for a new course. Preserve it only when auditing or migrating an existing course.

## Output Contract

Report the smallest applicable set of fields that makes the design auditable. For a topic or brief without a course package, omit `course_root`, `course_id`, `changed_files`, and `legacy_blockly_gaps`. For a course-root or packaging request, include them when they exist.

Always report `input_type`, `course_mode`, `mode_rationale`, `design_basis`, `learner_model`, `desired_results`, `assessment_plan`, `learning_progression` or `course_plan`, `alignment_matrix`, `inclusion_and_contingencies`, `evaluation_plan`, and `recommended_next_action`.

Report `lesson_design_records` only when lesson-level planning is requested. Report `target_experiments` as a selected list or `none`; include `selected_forms_by_experiment`, `form_rationale`, `materials_by_experiment`, and `missing_assets` only when experiment selection is in scope.

Each `alignment_matrix` row is:

`objective -> claim/evidence -> success criteria -> activity/scaffold -> experiment form/resource -> formative response`

For `project_task` and `PBL_unit`, also report `project_charter`, `fact_choice_assumption_log`, `PBL_readiness_audit`, `project_evidence_map`, `inquiry_trail`, `resource_decisions`, and `causal_chain_audit`. Add `impact_chain_audit` when the project claims a social, behavioral, policy, or user outcome. Add `permissions_and_partner_check` when people, media, data, a community partner, or a health/safety claim is involved.

Each `PBL_readiness_audit` row is:

`element -> status (met/partial/missing) -> design answer -> observable evidence -> feasibility risk -> mitigation -> owner -> latest useful time`

Each `inquiry_trail` row is:

`need-to-know question -> source/data/observation -> finding -> design/test decision changed -> student artifact -> teacher response`

Each `project_evidence_map` row is:

`project claim -> student artifact/test evidence -> success criteria -> reviewer/feedback source -> revision decision -> assessment use`
