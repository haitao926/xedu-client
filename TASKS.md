# Current Task List（历史归档）

> 本文档中的 Blockly UI 优化与共存迁移任务已被 Scratch-only 决策取代，不再作为执行清单。当前发布任务和验收标准以 `docs/PRE_RELEASE_AUDIT_2026-07-16.md` 为准。

_Last updated: 2026-07-09_

## Goal

Continue the next product/design direction after the completed refactor:

1. improve the current Blockly UI so it is cleaner, more classroom-friendly, and easier to read
2. explore a Scratch-based future track for stage-driven, character-driven AI expression

Reference plan already completed for the content-production migration:
`/Users/apple/.claude/plans/sharded-marinating-ripple.md`

## Status Summary

### Completed foundation work

- **Phase A — 清理教师 agent 死代码**
- **Phase D — 补齐 skill 缺口**
- **Phase C — 移除后端教师创作路由**
- **Phase B — 移除前端教师创作 UI**
- **Phase 13 — 收窄 AI 助手前端为纯对话**

These have already been completed and verified in the current workspace.

### Current design/product direction

The team has now aligned on a new two-track follow-up:

#### Track 1 — polish the current Blockly experience

Keep the current Blockly runtime and XEdu task capabilities, but improve the visual design and teaching usability.

#### Track 2 — prepare a Scratch future branch

Because the long-term goal is to let a model control stage characters and create more vivid, embodied expression, Scratch is now the likely long-term expression layer. This should be explored in a separate branch / PR, not mixed into the current Blockly polish work.

## Active Task List

### Task 1 — Audit current Blockly UI problems

**Status:** completed

Scope:
- identify which visual issues come from theme/style layering rather than Blockly itself
- identify which parts are most responsible for the current “ugly / noisy / overdesigned” feeling
- separate structural issues from purely cosmetic issues

Primary files:
- `renderer/styles/blockly-workspace.css`
- `renderer/js/blockly/runtime-appearance.js`
- `renderer/js/blockly/xeduhub-blocks.js`

Deliverable:
- a short problem list grouped into:
  - toolbox/sidebar problems
  - block body/readability problems
  - icon/visual language problems
  - workspace chrome problems

---

### Task 2 — Produce a Blockly UI polish plan

**Status:** completed

Scope:
- define the target look for the current Blockly UI
- keep it classroom-friendly, calm, readable, and less decorative
- explicitly avoid a direct Scratch clone at this stage

Should decide:
- what to simplify in the toolbox/sidebar
- whether to reduce or remove 3D category icons
- how to make blocks flatter/cleaner and easier to scan
- how to reduce visual competition between top bar, toolbox, flyout, and blocks

Deliverable:
- a prioritized implementation checklist for the current UI pass

---

### Task 3 — Implement current Blockly UI cleanup

**Status:** completed

Scope:
- apply the agreed visual cleanup to current Blockly UI
- preserve runtime behavior and existing XEdu task capability
- focus on visual coherence, readability, and teaching clarity

Expected areas of change:
- `renderer/styles/blockly-workspace.css`
- potentially small support changes in:
  - `renderer/js/blockly/runtime-appearance.js`
  - `renderer/js/blockly/xeduhub-blocks.js`

Non-goals:
- no Scratch runtime integration in this task
- no broad architecture migration in this task

Deliverable:
- a cleaner current Blockly experience in the existing app

---

### Task 4 — Verify the polished Blockly UI

**Status:** completed

Verification completed:
- `npm run check:renderer-syntax`: passed
- `npm run test:blockly-runtime`: 50/50 tests passed
- `npm run build`: passed

---

### Task 5 — Define the Scratch branch objective

**Status:** pending

Scope:
- write down what the Scratch branch is actually trying to prove
- avoid vague “replace Blockly” language
- define the branch as a product/architecture exploration for stage-based AI expression

The branch should answer:
- what model-controlled stage behavior looks like
- what role Scratch plays in the future system
- what stays in backend/runtime capability services
- what counts as a successful spike

Deliverable:
- a short branch brief / PR brief

---

### Task 6 — Map Blockly capability to Scratch capability

**Status:** pending

Scope:
- separate what Scratch can natively replace from what needs custom extension/bridge work
- classify current capabilities into:
  - expression-layer behavior
  - AI/runtime capability-layer behavior

Questions to answer:
- which current Blockly programming patterns map cleanly to Scratch
- which current XEdu AI task features need a Scratch extension
- whether Python generation remains relevant in the Scratch track
- whether the future product should be single-track or dual-track

Deliverable:
- capability mapping table

---

### Task 7 — Design the Scratch spike architecture

**Status:** pending

Scope:
- define the minimal technical approach for a separate scratch branch / PR
- identify the smallest useful prototype

Suggested minimum spike:
- one stage
- one or two sprites
- basic motion / say / costume change
- one event/broadcast mechanism
- one AI capability bridge (for example: result -> sprite action)

Deliverable:
- minimal architecture outline and implementation scope

---

### Task 8 — Prepare the Scratch branch / PR plan

**Status:** pending

Scope:
- propose branch name
- propose PR scope
- define success criteria
- define explicit non-goals

Suggested branch naming:
- `feat/scratch-stage-spike`
- or `explore/scratch-runtime-bridge`

Deliverable:
- a concrete PR plan the team can execute on GitHub

## Recommended order

1. Audit current Blockly UI problems
2. Produce the Blockly UI polish plan
3. Implement current Blockly UI cleanup
4. Verify the polished Blockly UI
5. Define the Scratch branch objective
6. Map Blockly capability to Scratch capability
7. Design the Scratch spike architecture
8. Prepare the Scratch branch / PR plan

## Notes / Constraints

- Do not mix the current Blockly polish work and the Scratch exploration into one PR.
- The current app should remain stable while the Scratch direction is explored separately.
- The Scratch direction is now motivated by the long-term goal of model-controlled stage characters and more vivid expression, not just visual preference.
- No push/commit should be done unless explicitly requested.

## Existing validation baseline

Already verified in the current workspace:
- `npm run check:renderer-syntax`: passed
- `npm run test:resources-inspection`: passed
- `npm run test:student-shell`: passed
- `npm run test:blockly-runtime`: passed
- `npm run build`: passed
- Electron startup smoke: passed

Known backend baseline note:
- `python3 -m pytest backend/tests/` still has pre-existing baseline failures unrelated to this next task list.
