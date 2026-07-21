# Course Transfer Implementation Plan

> **For agentic workers:** Execute this plan task-by-task with tests first. Keep unrelated worktree changes intact.

**Goal:** Make remote course pulls observable and timeout-resistant, and make local complete-ZIP importing a direct drag-and-drop workflow.

**Architecture:** Add a process-local asynchronous course-transfer job manager with a polling endpoint. Reuse the existing pull/import services inside the worker, reporting streamed byte and file progress. Add a safe Electron file-path bridge and a shared renderer polling/status adapter so remote and local transfers use the same UI behavior.

**Tech Stack:** Flask/Python standard library, Electron IPC/contextBridge, vanilla renderer JavaScript, existing Node/Python test runners.

## Global Constraints

- Do not add dependencies.
- Preserve existing synchronous API behavior unless `async: true` is supplied.
- Preserve `.xedu_backup/<course-directory>/<timestamp>` backups.
- Use `apply_patch` for manual edits and do not revert unrelated dirty-worktree changes.
- Write failing tests before implementation for each behavior.

---

### Task 1: Lock the transfer-job and service contracts with failing tests

**Files:**
- Create: `backend/services/course_transfer_jobs.py`
- Test: `backend/tests/test_course_transfer_jobs.py`
- Test: `backend/tests/test_xeduhub_resources_api.py`

**Interfaces:**
- `CourseTransferJobManager.start(work, metadata=None) -> str`
- `CourseTransferJobManager.get(operation_id) -> dict`
- `CourseTransferJobManager.run(operation_id, work) -> None`
- Worker callback: `work(progress_callback) -> dict`
- Async route response: `{"success": true, "operation_id": <str>}`
- Poll response: `{"success": true, "operation": <state dict>}`

- [ ] **Step 1: Write failing manager tests**

Add tests for a queued job becoming `success`, progress updates being visible, an exception becoming `error` with a safe message, unknown IDs returning `None`, and completed jobs remaining readable for a short retention period.

- [ ] **Step 2: Run the focused tests**

Run: `python3 -m pytest backend/tests/test_course_transfer_jobs.py -q`

Expected: FAIL because the manager module and test fixture do not exist.

- [ ] **Step 3: Write failing route tests**

Extend the resource API tests so `POST /api/resources/pull` with `{"async": true}` returns quickly with an operation ID, and `GET /api/resources/operations/<id>` returns the worker's terminal result. Add the same contract test for `/api/resources/import-package-local`.

- [ ] **Step 4: Run the route tests**

Run: `python3 -m pytest backend/tests/test_xeduhub_resources_api.py -q`

Expected: FAIL because the routes and manager wiring do not exist.

### Task 2: Implement backend jobs, progress, and nested remote repositories

**Files:**
- Modify: `backend/api/app.py`
- Modify: `backend/api/routes/resources.py`
- Modify: `backend/services/gitea_service.py`
- Modify: `backend/services/gitea_course_scanner.py`
- Create: `backend/services/course_transfer_jobs.py`
- Test: `backend/tests/test_course_transfer_jobs.py`
- Test: `backend/tests/test_xeduhub_resources_api.py`

**Interfaces:**
- `pull_course(..., progress_callback=None) -> CourseScanResult`
- `import_local_course_package(..., progress_callback=None) -> CourseScanResult`
- Progress callback accepts one dictionary containing `phase`, `percent`, file and byte counters, current file, and message.

- [ ] **Step 1: Implement the thread-safe job manager**

Store operation states behind a lock, create UUID operation IDs, run work in daemon threads or a bounded executor, normalize progress to integer percent values, capture terminal results, and remove expired terminal jobs during reads/starts.

- [ ] **Step 2: Run manager tests**

Run: `python3 -m pytest backend/tests/test_course_transfer_jobs.py -q`

Expected: PASS.

- [ ] **Step 3: Add the operation endpoint and async route branch**

Register the manager in `app.extensions`, add `GET /api/resources/operations/<operation_id>`, and factor the existing pull/import result construction into worker callables. Keep the current synchronous branch unchanged when `async` is false.

- [ ] **Step 4: Add streamed download progress**

Extend the raw download helper to read bounded chunks and invoke the callback. Use repository tree blob sizes for totals, report the current file, and map download/extract/validate/backup/write phases to monotonic progress.

- [ ] **Step 5: Add nested single-course discovery**

Pass the requested `course_url` into single-repository synchronization. Accept root, explicit nested, or unique nested `course.json`; strip the selected prefix before writing. Update single-course source entry discovery so the provided repository can expose its nested course and package URL.

- [ ] **Step 6: Run backend API tests**

Run: `python3 -m pytest backend/tests/test_course_transfer_jobs.py backend/tests/test_xeduhub_resources_api.py -q`

Expected: PASS.

### Task 3: Make ZIP extraction and replacement safe

**Files:**
- Modify: `backend/services/gitea_service.py`
- Modify: `backend/services/gitea_course_scanner.py`
- Test: `backend/tests/test_xeduhub_resources_api.py`

**Interfaces:**
- `resolve_local_course_package_target_path(package_path) -> str` returns a path below `Path.home()/Documents/XeduCourses`.
- Existing import responses retain `course`, `local_path`, `resource_handle`, and `summary.backup_path`.

- [ ] **Step 1: Add failing ZIP safety and replacement tests**

Cover root and one-directory ZIPs, malformed ZIPs, missing `course.json`, `../outside.txt`, absolute member names, symlink members, duplicate members, replacement backup creation, and failed replacement preserving a sentinel file in the old target.

- [ ] **Step 2: Run the focused backend tests**

Run: `python3 -m pytest backend/tests/test_xeduhub_resources_api.py -q -k 'package or import or backup'`

Expected: traversal/symlink/rollback tests FAIL against `ZipFile.extractall` and the current replacement logic.

- [ ] **Step 3: Implement validated staging extraction**

Validate every `ZipInfo` path with `PurePosixPath`, reject traversal/absolute/duplicate/symlink entries, enforce a bounded expanded-size/member count, extract file streams into a temporary directory, and select the validated course root.

- [ ] **Step 4: Implement default-target and rollback-safe replacement**

Derive the target from the validated course ID, sanitize the directory component, back up any existing target with content, replace only after validation, and restore the old target when the final operation fails.

- [ ] **Step 5: Run backend package tests**

Run: `python3 -m pytest backend/tests/test_xeduhub_resources_api.py -q -k 'package or import or backup'`

Expected: PASS.

### Task 4: Add Electron ZIP path bridge and renderer async polling

**Files:**
- Modify: `electron/preload/index.js`
- Modify: `electron/main/main.js`
- Modify: `renderer/js/resources/desktop-bridge.js`
- Modify: `renderer/js/resources/course-sync.js`
- Modify: `renderer/js/resources/course-create-flow.js`
- Modify: `renderer/js/resources.js`
- Test: `electron/test/preload-security.test.mjs`
- Test: `renderer/js/resources/course-sync.test.js`
- Test: `renderer/js/resources/course-create-flow.test.js`

**Interfaces:**
- `electronAPI.getPathForFile(file) -> string`
- `getPathForFileWithDesktopBridge(file, electronAPI) -> Promise<string>`
- Shared transfer helper polls an operation ID and calls `setImportStatus(state, message, progress)`.

- [ ] **Step 1: Add failing renderer tests**

Test that remote and local flows start async jobs, poll until terminal success, forward progress to the status callback, surface terminal errors, and add a locally imported course without a save-form step. Test that a dropped ZIP resolves through `getPathForFile`.

- [ ] **Step 2: Run renderer tests**

Run: `node --test renderer/js/resources/course-sync.test.js renderer/js/resources/course-create-flow.test.js`

Expected: FAIL because flows still await synchronous final responses and no drop-path helper exists.

- [ ] **Step 3: Add the preload bridge and allowlist rule**

Expose `webUtils.getPathForFile` from preload, add the operation GET pattern to `API_REQUEST_ALLOWLIST`, and keep the existing trusted-renderer check. Add source-level security assertions.

- [ ] **Step 4: Implement renderer polling**

Add one polling helper used by remote detail pulls, cloud imports, local updates, and local ZIP imports. Keep compatibility with a synchronous response that has no operation ID, and retry short-lived poll failures before reporting an error.

- [ ] **Step 5: Implement direct local ZIP flow**

Add a drop handler that accepts exactly one `.zip`, resolves its path, writes the package state, invokes the existing import flow automatically, adds the returned course through the existing store, refreshes the list, and leaves the old picker/button as a fallback.

- [ ] **Step 6: Run renderer and Electron tests**

Run: `node --test renderer/js/resources/course-sync.test.js renderer/js/resources/course-create-flow.test.js electron/test/preload-security.test.mjs`

Expected: PASS.

### Task 5: Add the progress/drop UI and update contracts

**Files:**
- Modify: `renderer/index.html`
- Modify: `renderer/styles/main.css`
- Modify: `renderer/js/resources.js`
- Modify: `renderer/js/resources/resource-bindings.js`
- Modify: `docs/overview/api-contract.md`
- Modify: `docs/teacher/QUICKSTART.md`
- Modify: `docs/teacher/TROUBLESHOOTING.md`
- Test: `renderer/js/resources/teacher-resource-ui-contract.test.mjs`

**Interfaces:**
- Status renderers accept `(state, message, progress)` without breaking two-argument callers.
- Progress UI exposes a determinate `<progress>` value when `percent` is numeric and an indeterminate state otherwise.

- [ ] **Step 1: Add failing DOM contract tests**

Assert that the Import Course page includes a ZIP drop zone, progress elements for create/detail import status, accessible labels, and the existing picker fallback.

- [ ] **Step 2: Run the UI contract test**

Run: `node --test renderer/js/resources/teacher-resource-ui-contract.test.mjs`

Expected: FAIL because the new elements are absent.

- [ ] **Step 3: Add responsive drop zone and progress markup/styles**

Add stable progress dimensions, drag-over state, error/success states, mobile wrapping, and a visible file summary. Keep the existing visual language and avoid changing unrelated resource cards.

- [ ] **Step 4: Bind drag/drop and progress rendering**

Wire the drop zone through `resource-bindings.js`, update `setRemoteImportStatus`/`setCreateImportStatus`, disable transfer controls while busy, and close/refresh the import view after successful direct ZIP import.

- [ ] **Step 5: Update API and teacher documentation**

Document the async operation response/poll endpoint and the drag-to-import workflow, including backup location and malformed-package recovery behavior.

- [ ] **Step 6: Run UI tests**

Run: `node --test renderer/js/resources/teacher-resource-ui-contract.test.mjs renderer/js/resources/course-sync.test.js renderer/js/resources/course-create-flow.test.js`

Expected: PASS.

### Task 6: Full verification and manual large-course validation

**Files:**
- Modify only files from Tasks 1-5 as needed for test failures.
- Test: existing backend, renderer, and Electron suites.

- [ ] **Step 1: Run Python syntax and focused backend verification**

Run: `python3 -m compileall -q backend && python3 -m pytest backend/tests/test_course_transfer_jobs.py backend/tests/test_xeduhub_resources_api.py -q`

Expected: PASS with no syntax errors.

- [ ] **Step 2: Run focused renderer/Electron verification**

Run: `node --test renderer/js/api.test.mjs renderer/js/resources/course-sync.test.js renderer/js/resources/course-create-flow.test.js renderer/js/resources/teacher-resource-ui-contract.test.mjs electron/test/preload-security.test.mjs`

Expected: PASS.

- [ ] **Step 3: Run the renderer build**

Run: `npm run build`

Expected: Vite build completes successfully.

- [ ] **Step 4: Manually exercise the tested repository**

Start the backend/Electron app, open the resource page for the tested repository, start an import, observe progress before 25 seconds, wait for completion, and verify the local course path and course list entry.

- [ ] **Step 5: Manually exercise local drag import**

Drag a valid complete ZIP, a malformed ZIP, and a traversal ZIP into the Import Course page. Verify valid import/list refresh, clear error for invalid packages, unchanged old target after failure, and backup creation on replacement.

- [ ] **Step 6: Review the final diff**

Run: `git diff --check` and `git status --short`

Expected: no whitespace errors; only planned course-transfer files are newly changed by this task.
