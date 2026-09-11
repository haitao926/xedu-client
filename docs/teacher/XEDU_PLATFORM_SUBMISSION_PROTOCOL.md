# XEdu Platform Submission Protocol

This contract connects an OpenLearnSite activity with an HTML page running in
XEdu Client. It keeps student identity in the learning platform and makes the
platform's saved acknowledgement the only source of completion state.

## Runtime modes

`platform` pages need ordinary browser APIs only. They run in the platform's
courseware iframe and send the existing compatibility message:

```js
window.parent.postMessage(JSON.stringify({
  name: "任务名称",
  value: Number(score)
}), "*");
```

`xedu-local` pages need camera, microphone, local files, hardware, offline
access, Python, Jupyter, or Scratch. The platform launches XEdu with a
short-lived grant. The page never asks for an account, password, or student
number.

## Launch

OpenLearnSite creates a one-time URL such as:

```text
xedu://open-local-task?platform_origin=https%3A%2F%2Fplatform.example&course_id=...&activity_id=...&resource_id=...&grant=...
```

The grant is an opaque, short-lived value. Its claims remain server-side; the
client treats it as an expiring capability and does not attempt to decode or
edit it. The grant must be bound by the platform to the logged-in student,
course, activity, and submission endpoint. It must expire quickly and be
single-use for launch, while allowing retries for the same submission.

The client passes the task context to the local HTML host. It must not persist
the grant in the course package or general settings.

### Launch response contract

Before opening XEdu, the platform creates a launch grant for the currently
logged-in student. The launch action returns data equivalent to:

```json
{
  "ok": true,
  "launch_url": "xedu://open-local-task?...",
  "expires_at": "2026-09-09T08:10:00Z"
}
```

The deep link contains only opaque identifiers and the opaque grant. It must
not contain a student name, number, account, password, cookie, or long-lived
API token. The platform should redact the complete launch URL from access logs
because URL query strings can otherwise expose the grant.

After accepting the deep link, XEdu exchanges the one-time launch grant for a
short-lived in-memory task context. This avoids leaving a reusable bearer token
in browser history or process arguments:

```http
POST https://platform.example/api/xedu/v1/launch/exchange
Authorization: Bearer {launch_grant}
Content-Type: application/json
```

```json
{
  "client": "xedu-client",
  "protocol_version": 1
}
```

```json
{
  "ok": true,
  "protocol_version": 1,
  "course_id": "course-2026-01",
  "activity_id": "camera-check-01",
  "resource_id": "lesson1/exp1/index.html",
  "resource_url": "http://127.0.0.1:5123/api/resources/local-file/.../index.html",
  "grant": "opaque-task-grant",
  "expires_at": "2026-09-09T08:20:00Z",
  "artifact_upload_url": "https://platform.example/api/xedu/v1/artifacts",
  "submit_url": "https://platform.example/api/xedu/v1/submissions",
  "completion_url": "https://platform.example/api/xedu/v1/submissions/status",
  "course_version": "2026.09.09-1",
  "package_url": "https://platform.example/packages/course-2026-01.zip",
  "package_sha256": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  "package_size": 18230456
}
```

`resource_url` may instead be resolved locally from `resource_id`; it is shown
here to make the launch contract explicit. XEdu only accepts HTTPS platform
endpoints. Local courseware itself may use loopback HTTP. The returned endpoint
origins must match the configured trusted platform origin.

The course package fields are optional for legacy activities. When present, all
four fields are required. `package_url` must be HTTPS and have the same origin
as the exchange endpoint. `package_sha256` is the lowercase hexadecimal
SHA-256 of the downloaded ZIP and `package_size` is its exact byte length.
`course_version` must match the `version` value in the package's `course.json`.

Before opening `resource_id`, XEdu compares `course_id` and `course_version`
with the installed local course. A matching course is reused without a
download. A missing or outdated course is downloaded to a temporary file,
checked for exact size and SHA-256, then passed through the normal ZIP path,
link, member-count, and decompression-size validation. Only after the staged
course structure and identity/version pass validation is the existing course
replaced atomically. A failed download or invalid package leaves the existing
course untouched. The temporary file is removed after import or failure.

`resource_id` is an exact HTML resource path such as
`lesson1/exp1/index.html`; a directory or an ambiguous experiment reference
is not sufficient.

## Submit

After the page's own self-check passes, the student clicks `提交结果`. The
local HTML page sends a request to the XEdu host, and the host submits a compact
result to the platform:

```js
window.parent.postMessage({
  type: "xedu:submit-request",
  request_id: crypto.randomUUID(),
  score: Number(score),
  passed: true,
  summary: "自查通过",
  artifacts: [{ name: "result.png", mime: "image/png", blob: resultBlob }]
}, "*");
```

The host checks the iframe source and origin, uploads bounded binary artifacts,
then sends the following compact result to the platform:

```http
POST {submit_url}
Authorization: Bearer {grant}
Content-Type: application/json
```

```json
{
  "course_id": "course-2026-01",
  "activity_id": "camera-check-01",
  "resource_id": "lesson1/exp1/index.html",
  "request_id": "uuid",
  "score": 90,
  "passed": true,
  "summary": "自查通过",
  "artifacts": [
    {
      "upload_id": "upload-...",
      "name": "result.png",
      "mime": "image/png",
      "size": 183204,
      "sha256": "..."
    }
  ]
}
```

`score` is a finite number. `request_id` makes retries idempotent. The client
must not send passwords or trust a student-provided identity field; the server
derives the student from the grant and validates the course and activity.

The response is successful only when the platform has stored the result:

```json
{
  "ok": true,
  "submission_id": "submission-...",
  "status": "completed"
}
```

The HTML page shows `已完成` only for `ok: true` and
`status: "completed"`. A network error, expired grant, or server rejection
remains `提交失败` and can be retried without repeating the activity.

The host acknowledges the HTML request with a matching message:

```js
{
  type: "xedu:submit-response",
  request_id: "uuid",
  ok: true,
  submission_id: "submission-...",
  status: "completed"
}
```

## Artifacts

Binary artifacts use a separate upload operation and are referenced by
`upload_id` in the result. The host must enforce a size limit, allowed MIME
types, filename normalization, and a digest check. Small PNG screenshots may
use a host-provided optimized path, but the page must never put video, audio,
or an unbounded data URL in a result message.

### Artifact upload contract

```http
POST {artifact_upload_url}
Authorization: Bearer {task_grant}
Content-Type: image/png
X-XEdu-Filename: result.png
X-XEdu-SHA256: {lowercase_sha256}
```

```json
{
  "ok": true,
  "upload_id": "upload-...",
  "size": 183204,
  "sha256": "..."
}
```

The platform verifies the task grant, upload size, MIME type, digest, and task
scope before returning `upload_id`. An upload is temporary until referenced by
a completed submission. Unreferenced uploads should expire automatically.

## Completion lookup

When a submission request times out, XEdu checks the same `request_id` before
showing failure or retrying:

```http
GET {completion_url}?request_id={request_id}
Authorization: Bearer {task_grant}
```

A stored result returns the same completed response as `POST {submit_url}`.
An unknown request returns HTTP `404` with `SUBMISSION_NOT_FOUND`. A result
still being committed may return HTTP `202` with status `accepted`; neither
response allows XEdu to display `已完成`.

## Status and idempotency

Submission states have these meanings:

| Status | Meaning | Client behavior |
| --- | --- | --- |
| `accepted` | Request was accepted but durable storage is not confirmed | Keep submitting state or allow lookup; never show complete |
| `completed` | Result and referenced artifacts are durably stored | Show `已完成` |
| `failed` | Platform rejected or could not store the result | Show failure and allow retry |

For the tuple `(student_from_grant, activity_id, request_id)`, submission is
idempotent. Repeating an identical request returns the original
`submission_id` and `completed` status. Reusing the same `request_id` with a
different score, summary, resource, or artifact digest returns HTTP `409`
`IDEMPOTENCY_CONFLICT`. The grant may expire after submission; the platform
should retain enough idempotency information to answer safe retries during its
documented retry window.

## Errors

Non-2xx responses use one JSON shape:

```json
{
  "ok": false,
  "status": "failed",
  "code": "GRANT_EXPIRED",
  "message": "任务授权已过期，请从学习平台重新打开任务"
}
```

Required error codes:

| HTTP | Code | Meaning |
| --- | --- | --- |
| `400` | `INVALID_REQUEST` | Field, score, digest, or protocol version is invalid |
| `401` | `GRANT_INVALID` | Grant is missing, malformed, or revoked |
| `401` | `GRANT_EXPIRED` | Grant expired; student must relaunch from the platform |
| `403` | `TASK_SCOPE_MISMATCH` | Course, activity, resource, or endpoint is outside the grant scope |
| `404` | `RESOURCE_NOT_FOUND` | The requested local task mapping does not exist |
| `404` | `SUBMISSION_NOT_FOUND` | No submission exists for this request ID |
| `409` | `IDEMPOTENCY_CONFLICT` | Request ID was reused with different content |
| `413` | `ARTIFACT_TOO_LARGE` | Artifact exceeds the platform limit |
| `415` | `ARTIFACT_TYPE_UNSUPPORTED` | Artifact MIME type is not allowed |
| `429` | `RATE_LIMITED` | Too many requests; client may retry after `Retry-After` |
| `500` | `STORE_FAILED` | Platform could not durably store the result |

Human-readable `message` is displayed to the student. Client logic branches on
`code`, never on the localized message text.

## Grant rules

- The launch grant is one-time and should expire within about 60 seconds.
- The exchanged task grant should expire within 10 to 30 minutes, according to
  expected task duration, and may submit only its bound activity.
- Both grants are bearer credentials and must be generated with sufficient
  entropy, transmitted only to trusted HTTPS platform endpoints, and redacted
  from logs and diagnostics.
- XEdu keeps the task grant only in the active renderer bridge. It is cleared
  when the task closes, another task replaces it, or the application exits.
- The platform derives the student identity from its authenticated grant
  record. Student identity supplied by HTML, URL fields, or result JSON is
  ignored.

## Compatibility

The two-field OpenLearnSite message remains valid for `platform` pages. It is a
score notification, not proof that a result was saved. New host integrations
should add a request identifier and acknowledgement without changing the
legacy message's meaning.

## Required platform endpoints

The platform integration needs:

- a launch action that creates the task-scoped grant;
- an artifact upload endpoint returning `upload_id`;
- a result endpoint accepting the JSON above and returning the stored status;
- a completion lookup endpoint so XEdu can recover after a timeout without
  creating duplicate submissions.

The endpoint names are platform-defined. Their payloads and semantics must
follow this document so OpenLearnSite and XEdu can evolve independently.
