# XEdu Client Phase 0 Security Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the remaining local high-privilege API and Electron security gaps without changing the student-facing classroom, Blockly, Scratch, Jupyter, or AI workflows.

**Architecture:** The Electron main process owns the process capability and proxies normal JSON API calls. Flask routes that execute code, mutate local state, call configured third-party services, or expose diagnostics require that capability. Scratch binary load/save keeps its existing opaque, expiring, operation-bound project handle as the capability because the Scratch iframe cannot use the JSON process proxy; those routes receive same-origin, size, and archive-integrity checks instead.

**Tech Stack:** Electron 39, Flask 3, Python 3.12, Vite 5, native ES modules, Pytest, Node `node:test`.

## Global Constraints

- Do not add dependencies or replace the existing Electron, Flask, native JavaScript, Blockly, or Scratch stacks.
- Preserve anonymous `/api/health` and the classroom course/index/file/package reads required by student devices.
- Require the process capability for code execution, package management, config access, local project creation, integration calls, diagnostics, and classroom control/import operations.
- Do not expose the process capability to Renderer JavaScript or URL query strings.
- Treat the opaque Scratch project handle as a narrowly scoped capability; never accept a client-supplied filesystem root.
- Return generic messages for unhandled server errors while retaining full details in backend logs.
- Write and run a failing regression test before each production-code behavior change.
- Do not commit or push unless the user explicitly requests it.

## Document Ownership

`docs/superpowers/plans/2026-07-15-xedu-client-optimization-strategy.md` is the
long-horizon architecture and governance plan. This document is the executable
queue for the current Phase 0 closure and the gated handoff to the later
engineering, quality, Scratch, and distribution tracks. Do not create a second
numbering system for the same work; update this queue during Phase 0 and update
the parent strategy only when evidence changes the roadmap or completion state.

## Current Checkpoint (2026-07-15)

This plan is being executed on `codex/full-scratch-plan`. The working tree contains
uncommitted implementation and test changes; `.claude/settings.local.json` is an
unrelated user change and must remain untouched.

| Area | Status | Evidence / next action |
| --- | --- | --- |
| Capability-aware backend test harness | Done | `backend/tests/api_test_utils.py` and migrated route tests are present. |
| Remaining high-privilege route guards | Done | Python pip, project creation, QuickForm, AI ask, debug env, image import, and classroom control routes are guarded. |
| Python executable request override | Done | `python.py` resolves the executable from server configuration only. `jupyter.py::detect_python` still needs a separate audit. |
| Classroom package import hardening | Done | URL, archive member, compressed-size, expanded-size, staging, and copy checks are present in `classroom_service.py`. |
| Scratch binary boundary | Done | Same-origin/native checks, bounded reads, ZIP/project validation, and atomic cleanup are covered by `41` Blockly resource tests. |
| Generic 500 responses | Done | Global handler and high-risk route broad catches return fixed messages; sentinel regression passes. |
| Electron isolation | Done | Main window and Jupyter BrowserView explicitly enable sandbox and web security; static contract and syntax checks pass. |
| Build, dependency, and CI parity | Done | Quality gate, Scratch build/test, CI entry, macOS build ordering, requirements pins, and release contract checks are aligned. |

The completed rows are not a release declaration. Phase 0 remains open until the
Scratch red tests, error disclosure, Electron isolation, quality gate, and full
verification audit are green.

---

### Task 1: Restore a security-aware backend test harness

**Files:**

- Create: `backend/tests/api_test_utils.py`
- Modify: `backend/tests/test_blockly_resources_api.py`
- Modify: `backend/tests/test_classroom_api.py`
- Modify: `backend/tests/test_pip_api.py`
- Modify: `backend/tests/test_quickform_api.py`
- Modify: `backend/tests/test_runtime_safety.py`
- Modify: `backend/tests/test_system_api.py`

**Interfaces:**

- Produces: `authorized_test_client(app: Flask) -> FlaskClient`, whose requests include the app's `XEDU_PROCESS_CAPABILITY` unless an individual request explicitly supplies that header.
- Produces: `issue_test_resource_handle(app: Flask, root: Path, relative_path: str, operation: str) -> str`, which uses `ResourceHandleRegistry` rather than Base64 path tokens.
- Security tests continue using the ordinary `app.test_client()` so anonymous-request assertions remain meaningful.

- [x] **Step 1: Add the shared authorized client and resource-handle helpers.**

```python
from flask.testing import FlaskClient
from werkzeug.datastructures import Headers


class CapabilityFlaskClient(FlaskClient):
    def open(self, *args, **kwargs):
        headers = Headers(kwargs.pop("headers", None))
        headers.setdefault(
            "X-XEdu-Client-Token",
            self.application.config["XEDU_PROCESS_CAPABILITY"],
        )
        return super().open(*args, headers=headers, **kwargs)
```

- [x] **Step 2: Replace business-test clients with `authorized_test_client(app)`.**
- [x] **Step 3: Replace Base64 path construction with `issue_test_resource_handle(...)`.**
- [x] **Step 4: Run `python3 -m pytest backend/tests -q` and classify every remaining failure before production edits.**

Expected: authentication-related `401` failures disappear; any remaining failures point to stale resource-handle expectations or real behavior regressions.

---

### Task 2: Protect remaining process-level API capabilities

**Files:**

- Modify: `backend/api/routes/python.py`
- Modify: `backend/api/routes/projects.py`
- Modify: `backend/api/routes/quickform.py`
- Modify: `backend/api/routes/ai.py`
- Modify: `backend/api/routes/system.py`
- Test: `backend/tests/test_security_api.py`

**Interfaces:**

- `/api/python/pip` and `/api/ai/ask` consume `python:run`.
- `/api/projects/create` and `/api/system/import-image-file` consume `resource:write`.
- QuickForm test/list consume `config:read`; QuickForm task creation consumes `config:write`.
- `/api/debug/env` consumes `config:read`.
- Python subprocess routes obtain the executable only from `app_config.jupyter.python_executable` or `sys.executable`; request payloads cannot override it.

- [x] **Step 1: Add anonymous-request tests for each route and verify they currently fail by returning a non-401 response.**
- [x] **Step 2: Add the minimum `@require_capability(...)` decorators.**
- [x] **Step 3: Add a test proving `python_executable` in both run and pip payloads is ignored.**
- [x] **Step 4: Remove both payload executable overrides and run the focused tests.**

Run:

```bash
python3 -m pytest backend/tests/test_security_api.py backend/tests/test_pip_api.py backend/tests/test_quickform_api.py backend/tests/test_system_api.py -q
```

Expected: all focused tests pass; anonymous requests receive `401` and authorized workflows preserve their previous responses.

---

### Task 3: Separate public classroom reads from protected control operations

**Files:**

- Modify: `backend/api/routes/classroom.py`
- Modify: `backend/services/classroom_service.py`
- Test: `backend/tests/test_classroom_api.py`
- Test: `backend/tests/test_security_api.py`

**Interfaces:**

- Protected with `resource:write`: `sync-courses`, `start`, `stop`, `pull`.
- Protected with `resource:read`: `fetch-index`.
- Public while classroom is active: `status`, `discover`, `index`, `course.json`, course files, and course packages.
- `ClassroomService.pull_package(package_url, target_path)` accepts only credential-free `http`/`https` URLs, enforces compressed and expanded size limits, validates every archive member, and stages extraction before copying files into the user-selected target. Private and loopback addresses remain valid because classroom discovery intentionally operates on the LAN.

- [x] **Step 1: Add a route matrix test proving control/import requests are currently anonymous while student reads remain available.**
- [x] **Step 2: Add capability decorators only to control/import routes.**
- [x] **Step 3: Add failing service tests for non-HTTP URLs, URL credentials, traversal or symlink archive members, oversized downloads, and oversized expanded archives.**
- [x] **Step 4: Implement URL, download-size, expanded-size, and ZIP-member validation without changing valid LAN classroom package behavior.**
- [x] **Step 5: Run classroom and security tests.**

---

### Task 4: Harden opaque Scratch binary access

**Files:**

- Modify: `backend/api/security.py`
- Modify: `backend/api/routes/resources.py`
- Modify: `backend/api/resource_runtime.py`
- Test: `backend/tests/test_blockly_resources_api.py`
- Test: `backend/tests/test_security_api.py`

**Interfaces:**

- `require_same_origin_or_native()` rejects an untrusted browser `Origin` without requiring the process token.
- Scratch GET/PUT continues requiring a valid opaque handle with the matching read/write operation.
- Scratch writes accept at most 64 MiB, require a valid ZIP containing `project.json`, and keep atomic temporary-file replacement.

- [x] **Step 1: Add failing tests for hostile Origin, oversized body, invalid ZIP, expired handle, wrong-operation handle, and path mismatch.**
- [x] **Step 2: Add the same-origin/native decorator and apply it to Scratch binary GET/PUT.**
- [x] **Step 3: Add bounded request reading and Scratch archive validation before the temporary file is replaced.**
- [x] **Step 4: Run focused Scratch resource tests and confirm legitimate `.sb3` round trips still pass.**

Current RED evidence from `backend/tests/test_blockly_resources_api.py`:

- `test_scratch_project_save_rejects_untrusted_origin`: `200`, expected `403`.
- `test_scratch_project_save_rejects_oversized_body`: `200`, expected `413`.
- `test_scratch_project_save_rejects_invalid_archive`: `200`, expected `400`.

Do not weaken these tests or treat a valid opaque handle as sufficient for the
browser-origin and archive-integrity boundary. The Scratch iframe needs a
separate narrowly scoped binary path because it cannot attach the process token
through the normal JSON IPC proxy.

---

### Task 5: Stop production exception disclosure

**Files:**

- Modify: `backend/api/app.py`
- Modify: `backend/api/routes/python.py`
- Modify: other route handlers only where a broad `Exception` currently reaches a response
- Test: `backend/tests/test_security_api.py`

**Interfaces:**

- Unexpected exceptions return `{"success": false, "message": "internal server error"}` with status `500`.
- Expected validation/domain errors retain their existing localized messages and `4xx` status codes.
- Backend logs retain exception type and stack trace without serializing request bodies or secrets.

- [x] **Step 1: Add a failing test that raises a sentinel secret-bearing exception and scans the response body for the sentinel.**
- [x] **Step 2: Replace the global `str(error)` response with the generic contract.**
- [x] **Step 3: Replace broad route-level `500` disclosures in the touched high-risk routes, including `python.py`, `resources.py`, and any handler found by a `str(exc)`/`str(error)` response scan.**
- [x] **Step 4: Run the security and route tests.**

Also audit `backend/api/routes/jupyter.py::detect_python`: decide whether its
caller-selected executable is an allowed diagnostic input or a process-level
capability, then encode that decision in a regression test. It must not become
an unreviewed bypass of the server-side executable policy.

---

### Task 6: Enable Electron web isolation without breaking Jupyter

**Files:**

- Modify: `electron/main/main.js`
- Modify: `electron/test/preload-security.test.mjs`
- Modify: `renderer/js/student-shell-contract.test.mjs`

**Interfaces:**

- Main `BrowserWindow.webPreferences`: `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`, `webSecurity: true`.
- Jupyter view preferences use the same isolation values and never disable `webSecurity`.
- The existing localhost-only Jupyter CSP/X-Frame response-header adjustment remains the sole embedding compatibility mechanism.

- [x] **Step 1: Add static contract tests that fail while either window lacks `sandbox: true` or contains any `webSecurity: false`.**
- [x] **Step 2: Set the isolation flags explicitly on both window types.**
- [x] **Step 3: Run Electron security and student-shell tests.**
- [x] **Step 4: Run `node --check electron/main/main.js` and a packaged/dev startup smoke when the environment permits.**

The compatibility rule is strict: `webSecurity` must be explicitly `true` in
the main `BrowserWindow` and Jupyter `BrowserView`, while the existing
localhost-only response-header adjustment remains the only Jupyter embedding
exception. A dev-mode convenience flag is not an acceptable security bypass.

---

### Task 7: Align dependencies, macOS build, and CI with the local gate

**Files:**

- Modify: `backend/requirements.txt`
- Modify: `backend/requirements_ci.txt`
- Modify: `backend/requirements_full.txt`
- Modify: `build.sh`
- Modify: `.github/workflows/ci-guard.yml`
- Modify: `scripts/run_quality_gate.py`
- Modify: `README.md`

**Interfaces:**

- `Flask-CORS` is removed because `backend/api/security.py` owns the explicit CORS policy.
- Shared direct dependencies use the same pinned versions in all three requirements files.
- `build.sh` runs `npm run build:scratch` before `npm run build`.
- CI invokes the same security, student-shell, resources, Blockly, Scratch, build, and bundle checks as the local quality gate.

- [x] **Step 1: Add or update static tests that assert dependency, build, and CI command parity.**
- [x] **Step 2: Remove the dead dependency and align shared pins.**
- [x] **Step 3: Add the Scratch build to `build.sh`.**
- [x] **Step 4: Make CI invoke `npm run quality-gate` after installing root, backend, and Scratch test dependencies.**
- [x] **Step 5: Update README verification instructions and current security model.**

The final `quality-gate` sequence must include, in dependency order:

```text
check:python-syntax
backend pytest
electron preload/security tests
test:student-shell
test:resources-inspection
test:blockly-runtime
build:scratch
test:scratch
build
check:bundle
```

`build.sh` must run `build:scratch` before the root Vite build. CI may install
dependencies in separate jobs, but it must execute the same command list and
must not silently replace Scratch or security stages with a partial build.

---

### Task 8: Run the Phase 0 completion audit

**Files:**

- Modify: `docs/overview/optimization-baseline-2026-07-15.md`
- Modify: `docs/superpowers/plans/2026-07-15-xedu-client-optimization-strategy.md`

**Interfaces:**

- The baseline records exact commands, pass counts, date, environment limitations, and known residual risks.
- The parent strategy marks only evidence-backed tasks complete and links to this closure plan.

- [x] **Step 1: Run `npm run quality-gate`.**
- [x] **Step 2: Run static scans for unguarded mutating routes, `webSecurity: false`, missing sandbox flags, and secret-bearing `500` responses.**
- [x] **Step 3: Run `git diff --check` and inspect `git status --short` to ensure no generated or unrelated files were added.**
- [x] **Step 4: Update the baseline and parent plan with actual evidence.**

**Phase 0 completion criteria:** all quality-gate stages pass; all process-level high-privilege routes reject anonymous requests; Scratch binary access is constrained by opaque handles plus origin/archive checks; Electron windows use sandbox and web security; CI/build/dependency definitions match the verified local gate.

Phase 0 verification completed on 2026-07-16. Packaged Electron startup smoke
was not run in this environment; `node --check`, static Electron contracts, and
the complete application build gate passed. The remaining startup smoke is a
release-environment check, not a reason to reopen the completed security work.

---

## Post-Phase-0 Roadmap

Do not start these tracks until the Phase 0 completion criteria are met and the
full quality gate has passed twice: once from the current working tree and once
from a clean checkout with dependencies installed.

### Phase 1: Engineering Base (1-2 weeks)

Objective: reduce change radius without changing public behavior.

1. **API boundary first:** replace the `window.fetch` interception in
   `renderer/js/api.js` with an explicit `APIClient` request path. Add contract
   tests for headers, timeout/abort, JSON, `FormData`, and error normalization
   before deleting the patch.
2. **Shared safety utilities:** consolidate the five `escapeHtml` definitions
   into `renderer/js/utils/html.js`; migrate imports, then delete duplicates.
3. **Event boundary:** replace the highest-risk `window.*` exports and inline
   `onclick` handlers with `data-action` plus event delegation. Migrate one
   page at a time, starting with resources and workspace actions.
4. **Resource seam:** split `renderer/js/resources.js` by list/source,
   import-export, rendering, and bindings. Each extraction must preserve the
   existing resource inspection and student-workspace tests.
5. **Template/CSS seams:** split `renderer/index.html` by tab ownership and
   `renderer/styles/main.css` by stable feature area only after DOM contract
   tests exist. Do not introduce a frontend framework or new dependency in
   this phase.

Exit criteria: no global fetch monkey patch; no newly added inline handlers;
shared HTML escaping has one implementation; resources, Blockly, Scratch,
student shell, and full quality gate remain green.

### Phase 2: Quality and Service Boundaries (2-4 weeks)

Objective: make high-risk services independently testable before structural
movement.

1. Add focused tests for `backend/services/jupyter_service.py`, beginning with
   command construction, executable selection, port detection, process timeout,
   cleanup, and restart failure paths.
2. Add API contract tests for `renderer/js/api.js`, Electron IPC integration
   tests, and configuration-service tests. Prefer fixtures and mocks over
   network/model dependencies.
3. Split `jupyter_service.py`, `gitea_service.py`, and
   `blockly_xeduhub_support.py` only along tested seams: process/port/command,
   URL/auth/CRUD, and block-category registries respectively.
4. Split `electron/main/main.js` into backend lifecycle, window management,
   IPC handlers, and Jupyter view modules after startup smoke coverage exists.
5. Split `main.css` into layout/dashboard/resources/blockly/AI files and remove
   inline `.style.*` mutations only when the replacement class has a DOM test
   or a manual smoke check.

Exit criteria: the Jupyter, Gitea, Blockly support, and Electron seams have
focused tests; no split changes API contracts; the complete quality gate and
desktop startup smoke pass.

### Phase 3: Scratch Track B and Distribution Size (longer term)

Objective: validate Scratch as a student experiment runtime without reopening
the security boundary or increasing the installer footprint by default.

1. **Task 5:** define the Scratch branch objective, supported student
   capabilities, non-goals, and success metrics. Keep the AI bridge student
   scoped; do not restore teacher-agent code.
2. **Task 6:** publish a Blockly-to-Scratch capability matrix covering sprites,
   stage, events, sensing, data, classroom assets, and AI interactions. Mark
   unsupported items explicitly rather than silently approximating them.
3. **Task 7:** implement the smallest prototype: one stage, one or two sprites,
   one AI bridge, one `.sb3` load/save path, and one classroom resource fixture.
   Validate it through the same opaque-handle, Origin, ZIP, and size checks.
4. **Task 8:** write the PR plan with acceptance tests, migration risks,
   rollback points, and a decision gate. Do not merge broader Scratch migration
   work until prototype tests and student usability checks pass.
5. **Size work after behavior is stable:** measure the 4 GB package by
   component, then evaluate on-demand checkpoint download, minimal Python
   environment, and moving sample courses to a separate package. Each option
   needs offline-install behavior, checksum/integrity checks, cache recovery,
   and a size target before implementation.

Exit criteria: the Scratch prototype passes the full quality gate, its support
matrix has no unowned gaps, and any package-size reduction has a tested offline
fallback. Scratch migration and package slimming are separate decisions;
neither may delay or weaken Phase 0 security closure.

## Execution Rules

- Work in this order: **Scratch RED -> GREEN**, generic 500 handling, Electron
  isolation, quality gate/CI parity, Phase 0 audit, then Phase 1 refactoring.
- Keep security changes and behavior-preserving refactors in separate commits;
  use the repository's Lore commit trailers if commits are later requested.
- Before each cleanup extraction, add or confirm a regression test for the
  behavior being moved. Prefer deletion and compatibility exports over new
  abstractions.
- Stop and reassess if a proposed fix requires exposing the process capability
  to Renderer JavaScript, placing it in a URL, accepting arbitrary filesystem
  roots, disabling `webSecurity`, or adding a new dependency.
- The residual risk after Phase 0 is explicit: Python execution remains a
  high-privilege local capability, not a sandbox. Capability protection,
  trusted process routing, bounded inputs, and user-triggered workflows reduce
  exposure but do not make arbitrary Python safe.
