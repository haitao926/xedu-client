# Scratch XEdu 功能迁移 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use test-driven-development to implement this plan task-by-task.

**Goal:** 将现有 Blockly 中的全部 93 个 XEduHub 相关积木迁移为 Scratch 14.2 扩展，并保持课程资源、项目保存和本地 XEduHub 执行链路可用。

**Architecture:** Scratch GUI 继续作为独立构建工程运行；XEdu 扩展以稳定的块描述表驱动 GUI 注册和运行时分发。AI 任务复用 `/api/resources/xeduhub/execute`，浏览器可直接实现的数学、HTTP、结果处理和媒体辅助能力在扩展运行时完成，历史兼容块统一映射到相同的状态模型。

**Tech Stack:** Scratch GUI/VM 14.2.0-2026-07-02.1, CommonJS extension API, Node test runner, Flask, existing XEduHub runtime.

## Global Constraints

- 不新增第三方依赖。
- 保留 Blockly 历史入口和文件兼容能力，迁移完成后再决定下线。
- Scratch 项目使用 `.sb3`，保存到课程实验目录并复用现有资源安全校验。
- 所有 XEdu AI 任务调用统一走 `/api/resources/xeduhub/execute`。
- 不提交 `scratch-editor/build/` 与 `scratch-editor/node_modules/`。

### Task 1: Lock the migration contract with tests

**Files:**
- Create: `scratch-editor/test/xedu-extension.test.js`
- Modify: `scratch-editor/package.json`

- [x] Write failing tests that require 93 migrated block IDs, all backend task IDs, stable `spec` payloads, and math/result helper behavior.
- [x] Run `npm test --prefix scratch-editor` and confirm failure because the descriptor/runtime contract is missing.

### Task 2: Implement the complete Scratch XEdu extension

**Files:**
- Create: `scratch-editor/src/extensions/scratch3_xedu_ai/descriptor.js`
- Modify: `scratch-editor/src/extensions/scratch3_xedu_ai/index.js`

- [x] Add one descriptor for every current `xeduhub_*` Blockly block, preserving Chinese teaching labels and block category colors.
- [x] Add backend task menu and semantic task payload mapping for all registered XEduHub tasks.
- [x] Implement shared state for input, workflow, last result, errors, result fields, math helpers, HTTP/device calls, media metadata and compatibility aliases.
- [x] Make all handlers return Scratch-safe primitive/object summaries and convert failures into visible extension result state.
- [x] Run the focused extension tests and make them pass.

### Task 3: Upgrade and rebuild the latest Scratch editor

**Files:**
- Modify: `scratch-editor/package.json`
- Modify: `scratch-editor/package-lock.json`
- Modify: `scratch-editor/scripts/patch-scratch.js`
- Modify: `scratch-editor/scripts/prepare-upstream.js`
- Modify: `package.json`

- [x] Pin both Scratch packages to `14.2.0-2026-07-02.1`.
- [x] Make the patch script copy the maintained extension source into every Scratch VM copy and register it in the extension library.
- [x] Build the independent editor and record the measured artifact size in the verification report.

### Task 4: Verify resource and course integration

**Files:**
- Modify: `backend/tests/test_blockly_resources_api.py`
- Modify: `renderer/js/student-shell-contract.test.mjs`
- Modify: `renderer/js/resources/student-workspace-utils.test.js`
- Modify: relevant course manifests only when a Scratch asset is missing.

- [x] Test Scratch editor asset serving, `.sb3` GET/PUT path safety, Scratch resource detection, and student visual entry routing.
- [x] Run Python syntax, renderer syntax, focused Node tests, full Vite build, and backend tests.
- [x] Report any remaining unconverted course assets or runtime limitations explicitly.
