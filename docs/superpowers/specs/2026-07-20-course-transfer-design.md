# Course Transfer Design

## Goal

Make course pulling and local ZIP importing reliable for large course packages. A remote pull must not be held inside the renderer's 25-second request timeout, and a teacher must be able to drag a complete ZIP into the Import Course page and have it appear in the local course list.

## Evidence and Existing Constraints

- The tested `human-pose-control-hardware` repository is public and reachable, but its archive download takes about 135 seconds for a roughly 70 MiB repository.
- The repository stores the course below `courses/human-pose-control-hardware/`, while `_sync_single_course_repo` currently requires a root-level `course.json`.
- The renderer API client uses a 25-second timeout and the Electron HTTP proxy uses a 30-second timeout.
- The current local package route already accepts ZIP paths, but the Import Course UI requires manual package and destination path steps and waits for one synchronous HTTP response.
- Existing course backups use `.xedu_backup/<course-directory>/<timestamp>` and must remain discoverable.

## Decisions

### 1. Asynchronous transfer jobs with polling

The existing pull and local-package endpoints gain an `async` request mode. The mode returns an operation ID immediately. A process-local job manager runs the transfer in a worker and exposes progress through `GET /api/resources/operations/<operation_id>`. Existing synchronous behavior remains available for compatibility and focused route tests.

The operation state is:

```json
{
  "operation_id": "uuid",
  "state": "queued|running|success|error",
  "phase": "preparing|downloading|extracting|validating|backing_up|writing|completed|error",
  "percent": 0,
  "completed_files": 0,
  "total_files": 0,
  "completed_bytes": 0,
  "total_bytes": 0,
  "current_file": "",
  "message": "",
  "result": null,
  "error": null
}
```

The renderer polls about every 500ms. Progress requests are short requests, so the existing general timeout remains appropriate. The UI never treats a transfer as complete until the operation state is terminal and its result is valid.

### 2. Remote package and nested-course discovery

Remote imports prefer a declared `package_url`. For single-course repositories, discovery first accepts a root `course.json`, then an explicit nested `course_url`, then a unique nested `course.json` candidate. A repository with multiple candidates and no explicit course path fails with an actionable message. When the source exposes a package under the selected course root, the package is used before file-by-file synchronization.

Remote downloads report byte progress from the repository tree sizes and streamed response chunks. Extraction, validation, backup, and writing occupy explicit later phases.

### 3. Drag-to-import local ZIP workflow

The local package entry displays a ZIP drop zone and retains the existing Select ZIP button as a fallback. A valid dropped file is resolved to a local path through Electron's `webUtils.getPathForFile` bridge and imported immediately without a second confirmation. A non-ZIP file, multiple files, or an unavailable desktop path produces an inline error.

When no destination is supplied, the backend derives a safe course ID from `course.json` and writes to `~/Documents/XeduCourses/<course-id>`. The response is added to the existing course store and the list is refreshed without requiring form completion or a separate Save action.

### 4. Safe extraction and replacement

ZIP members are validated before extraction. Absolute paths, parent traversal, duplicate paths, and symbolic links are rejected. Extraction occurs in a temporary staging directory. The staged root must contain a valid `course.json` either at its root or under one top-level directory. Existing targets are backed up before replacement using the existing `.xedu_backup` convention. Replacement is rolled back when validation or the final move fails.

### 5. Shared progress UI

Remote detail pulls, remote cloud imports, local course pulls, and local ZIP imports use the existing import status controls plus a real progress bar. The bar displays percent when totals are known and uses an indeterminate state when a total is unavailable. The current phase and current file remain visible, and controls are disabled while the operation is active.

## Error and Restart Behavior

- Terminal backend errors are returned as safe user-facing messages and do not expose tokens.
- Polling transiently fails up to a small retry budget before showing a backend-unavailable error.
- A backend restart loses in-memory operation state; the UI reports that the operation must be started again. Cross-restart resume and cancellation are out of scope.
- Failed replacement leaves the previously installed course intact whenever the old target existed.

## Acceptance Criteria

1. Pulling the tested nested repository does not produce a 25-second timeout and eventually imports the course or reports the exact missing/ambiguous repository layout.
2. A remote transfer displays changing progress during a transfer longer than 25 seconds and ends at success or error.
3. Dropping a valid complete ZIP into the Import Course page imports it without manually entering a package path, destination, or course metadata.
4. A repeated import backs up the previous target and replaces it only after the new package validates.
5. Malformed, traversal, symlink, and missing-`course.json` packages do not modify the existing course.
6. The imported course is persisted in the course list and can be opened using the returned local resource handle.

## Non-goals

- Uploading ZIP bytes through the renderer to the backend.
- Resuming a transfer after the backend process restarts.
- Adding a new dependency or replacing the existing Flask/Electron transport with SSE/WebSocket infrastructure.
