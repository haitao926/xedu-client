# XEdu Platform Course Package Sync Implementation Plan

> For agentic workers: implement the tasks in order with a failing-test, minimal-code, passing-test cycle.

**Goal:** Complete platform-launched local-task startup by reusing a matching local course or securely downloading, verifying, importing, and opening the requested resource.

**Architecture:** The Electron main process downloads only HTTPS package URLs already constrained to the trusted platform origin. It verifies streamed size and SHA-256 into an OS temporary file. The existing Flask import service performs ZIP/link/decompression validation and atomic replacement. The renderer coordinates version matching, import, cleanup, refresh, and exact-resource opening.

**Tech Stack:** Electron IPC/preload, Node built-ins, Flask/Python, browser ES modules, Node test runner, Python unittest.

## Global Constraints

- Preserve manual course-package import behavior.
- Reuse existing secure ZIP validation and atomic replacement.
- Add no dependencies.
- Package URL must be HTTPS and same-origin with the trusted platform origin.
- Validate package size, SHA-256, course identity/version, ZIP paths, links, and decompression limits.
- Download to a temporary file before import.
- Failed downloads and invalid packages must preserve the installed course.
- Never persist student identity or task authorization.
- Keep legacy launch responses without package metadata working.
- resource_id must resolve to one exact HTML file.

---

### Task 1: Package metadata and secure downloader

**Files:**
- Modify electron/main/xedu-local-task-launch.js
- Test electron/test/xedu-local-task-launch.test.mjs

**Interfaces:**
- Input: exchanged launch payload containing optional course_version, package_url, package_sha256, and package_size.
- Output: validated context plus downloadXEduCoursePackage(context, options), returning package_path and cleanup_token.

- [ ] Write failing tests for:
  - valid optional metadata being returned;
  - cross-origin URL, non-hex digest, zero/unsafe size being rejected;
  - a real temporary download producing the expected bytes and cleanup token;
  - digest or size mismatch deleting the temporary file.

  Example test shape:

    const context = await exchangeXEduLocalTaskLaunch(launch, {
      fetchImpl: async () => new Response(packageBytes),
    });
    assert.equal(context.package_size, packageBytes.length);
    await assert.rejects(downloadXEduCoursePackage(context, { fetchImpl }), /SHA-256/);

- [ ] Run the focused test and confirm it fails because the downloader is absent.

  Command: node --test electron/test/xedu-local-task-launch.test.mjs

- [ ] Implement the minimal helper:
  - validate optional package metadata only when package_url is present;
  - constrain URL to the exchanged platform origin;
  - require a positive safe integer size within the existing archive limit;
  - stream response bytes to a uniquely created temporary ZIP;
  - compute SHA-256 incrementally and enforce declared size;
  - store cleanup paths in a module-local token map;
  - delete the file on every failure and expose cleanup only by token.

- [ ] Run the focused test and confirm all launch and downloader tests pass.

- [ ] Refactor only after green, keeping URL, metadata, stream, and cleanup checks as separate named helpers.

### Task 2: Expected course identity and version validation

**Files:**
- Modify backend/services/gitea_service.py in import_local_course_package
- Modify backend/api/routes/resources.py in import_local_resource_package
- Test backend/tests/test_xeduhub_resources_api.py

**Interfaces:**
- Input: optional expected_course_id and expected_course_version.
- Output: the existing import result, with replacement occurring only after staged metadata matches.

- [ ] Write failing tests that create a valid ZIP with the wrong ID or version and an existing target containing keep.txt. Assert HTTP 400, the appropriate mismatch message, and keep.txt unchanged. Also assert omitted expectations preserve manual-import behavior.

  Example request:

    response = self.client.post("/api/resources/import-package-local", json={
        "package_path": str(package_path),
        "target_path": str(target_path),
        "expected_course_id": "course-1",
        "expected_course_version": "new",
    })
    self.assertEqual(response.status_code, 400)
    self.assertEqual(sentinel.read_text(encoding="utf-8"), "keep")

- [ ] Run the focused backend tests and confirm the new mismatch tests fail.

  Command: python3 -m unittest backend.tests.test_xeduhub_resources_api -v

- [ ] Add optional keyword arguments and compare staged course.json metadata after scan_course but before backup or rename. Pass route fields through unchanged and keep both defaults empty for manual imports.

- [ ] Run the focused backend suite and confirm all existing security/import tests pass.

- [ ] Refactor only after green so metadata comparison remains before any destructive replacement operation.

### Task 3: Renderer coordinator

**Files:**
- Create renderer/js/resources/course-package-sync.js
- Create renderer/js/resources/course-package-sync.test.js
- Modify renderer/js/resources.js in findLocalTaskTarget and openStudentLocalTask

**Interfaces:**
- Input: task context, local courses, courses root, Electron download/cleanup methods, apiClient, and refreshResources.
- Output: ensureLocalTaskCourse(taskContext, deps) returning the matching or imported course.

- [ ] Write three failing tests:
  - matching course ID and version returns immediately without download;
  - missing/outdated version downloads, imports with expected ID/version, refreshes, and always cleans up;
  - download/import failure rejects while the old local course object remains unchanged.

  Example call:

    const result = await ensureLocalTaskCourse(task, {
        localCourses: [],
        coursesRoot: "/courses",
        electronAPI: { downloadXEduCoursePackage: download, cleanupXEduCoursePackage: cleanup },
        apiClient: { post: importPackage },
        refreshResources,
    });
    assert.equal(result.version, task.course_version);

- [ ] Run the new renderer test and confirm it fails because the module is absent.

  Command: node --test renderer/js/resources/course-package-sync.test.js

- [ ] Implement:
  - exact ID candidate matching across existing course identity fields;
  - reuse only when versions match;
  - derive a sanitized target directory below coursesRoot for missing courses;
  - call the Electron downloader only when needed;
  - call import-package-local with package path and expected metadata;
  - refresh the authoritative resource index;
  - call cleanup in finally;
  - never write localStorage directly.

- [ ] Run the coordinator tests and confirm they pass.

- [ ] Integrate openStudentLocalTask so initialization is followed by ensureLocalTaskCourse, then exact resource lookup and opening. Keep clear errors for missing package metadata and unavailable local course roots.

- [ ] Run related renderer tests:

  Command: node --test renderer/js/resources/*.test.js renderer/js/main/*.test.mjs renderer/js/student-shell-contract.test.mjs

### Task 4: Electron IPC and protocol documentation

**Files:**
- Modify electron/main/main.js
- Modify electron/preload/index.js
- Test electron/test/preload-security.test.mjs
- Modify docs/teacher/XEDU_PLATFORM_SUBMISSION_PROTOCOL.md

**Interfaces:**
- Expose only downloadXEduCoursePackage(context) and cleanupXEduCoursePackage(token) to the trusted renderer.
- Do not expose arbitrary URL download or arbitrary file deletion.

- [ ] Write failing preload and launch tests for the two narrow methods, package metadata pass-through, and unknown-token cleanup rejection.

- [ ] Run:

  Command: node --test electron/test/preload-security.test.mjs electron/test/xedu-local-task-launch.test.mjs

  Confirm the new IPC assertions fail.

- [ ] Register trusted-renderer IPC handlers in main.js and narrow preload wrappers. Keep existing deep-link dispatch and legacy practice deep-link behavior unchanged.

- [ ] Document optional package response fields, reuse/download branches, size/hash verification, atomic import, failure preservation, cleanup, and exact resource selection.

- [ ] Run the focused Electron tests and confirm they pass.

### Task 5: Full verification

**Files:** No additional production files.

- [ ] Run syntax checks:

    node --check electron/main/main.js
    node --check electron/main/xedu-local-task-launch.js
    node --check renderer/js/resources.js

- [ ] Run backend, renderer, and Electron focused suites.

- [ ] Run npm run build and git diff --check.

- [ ] Review that no grant or student identity is persisted, package URLs cannot escape the platform origin, failed imports leave the old directory intact, and resource_id selects an exact HTML resource.

- [ ] Report that real OpenLearnSite end-to-end testing remains pending until its grant exchange and package metadata endpoints are deployed.

