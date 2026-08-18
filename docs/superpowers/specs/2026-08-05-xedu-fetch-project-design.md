# XEdu Fetch Project Design

## Goal

Add an `xedu-fetch-project` skill that accepts either supported OpenInnoLab Scratch or Jupyter project URL, downloads the platform-native export through the user's existing browser session, and creates a credential-free source snapshot for `xedu-package-course`.

## Evidence From The Two Reference Projects

| URL project ID | OpenInnoLab metadata | Fetch implication |
| --- | --- | --- |
| `68864154fbfda12af0d7cf44` | `NOTEBOOK`, `PY_SERVER`, `XEDU` | Preserve the native project export containing the notebook file tree. |
| `6a5ec62657d9265a66252660` | `SCRATCH`, SenseInnoBlocks | Preserve the native project export; do not reconstruct or convert it to SB3 in this skill. |

Both metadata records are publicly readable through `GET /gw/lab/api/v1/project/<id>`, but both examples are private. Anonymous source access fails with `F566` from `POST /gw/lab/api/v1/project/open`, `DF1007` from WebDAV, or `1106` from the native dump route. The skill therefore cannot honestly download these projects with `curl` alone.

A separate local OpenInnoLab dump with a different project ID was used only as format evidence, not as evidence about the supplied Jupyter project's contents. It is a ZIP project tree with 93 members, 20 valid `nbformat: 4` notebooks, and supporting assets, source, datasets, models, and teaching metadata. The format also includes a zero-byte `/` directory marker.

## Decisions

### Link-only input

The user supplies only an OpenInnoLab project URL. The skill extracts the `id` query parameter, validates the host and route, and reads public metadata. It never asks the user to copy a token, cookie, project ID, or downloaded filename.

### Browser-session authentication

Private export uses the existing authenticated browser session on `www.openinnolab.org.cn`. If the session is logged out, the skill opens the supplied URL and asks the user only to complete the site's normal login. It does not automate credentials, read passwords, print tokens, or persist browser state.

The native export route is:

```text
GET /gw/lab/api/v1/project/file/dump?projectId=<id>
```

The skill treats `F566`, `DF1007`, `1106`, HTTP `401`, and HTTP `403` as authentication or authorization failures. It does not fall back to scraping rendered HTML.

### Source snapshot, not conversion

The downloaded platform export remains byte-for-byte unchanged under `raw/`. The helper writes a sanitized `source-metadata.json` and a generated `source-manifest.json` containing provenance and SHA-256 digests.

The skill must not:

- extract or rewrite the export;
- reconstruct an SB3 from WebDAV parts;
- create or edit notebooks;
- generate `course.json`;
- package or publish a course.

### SenseInnoBlocks block compatibility

Two native desktop exports were inspected without adding them to the repository:

| Sample | Declared extensions | Compatibility finding |
| --- | --- | --- |
| `AI小游戏-大象接苹果-副本 (1).ib` | `innolabAiTraining`, `innolabCamera` | Scratch-native blocks are reusable; camera blocks are partly mappable; custom image-classification blocks are not equivalent to XEdu's ImageNet classifier. |
| `智能电视-手势换台.ib` | `innolabCamera`, `innolabAiHandposeTraining` | Scratch-native blocks are reusable; camera blocks are partly mappable; custom `左`/`右` gesture classification is not equivalent to XEdu hand keypoint sensing. |

Both archives contain `project.json` and media assets, but no portable custom-model artifact. The public SenseInnoBlocks frontend describes these extensions as image-classification and gesture-classification training/model use. Current XEdu source registers `xeduImageClassification` for `cls_imagenet` and `xeduHandSensing` for `pose_hand21`; similar names do not make their behavior interchangeable.

The fetch skill therefore keeps the `.ib` unchanged and adds a handoff gate. `xedu-package-course` must later enumerate every extension and opcode and classify it as `exact-match`, `renamed-mappable`, `unsupported`, and/or `runtime-dependency`. A used `unsupported` opcode blocks automatic conversion. This rule prevents a package that opens successfully while silently changing the lesson logic.

### Jupyter project integrity

The helper accepts the Notebook metadata type only on `/pjlab/project` and labels it `openinnolab-jupyter`. Its native export must be a readable `.zip` with at least one structurally valid `.ipynb`. The helper streams every member to verify paths, types, size limits, and CRC integrity, while parsing notebooks only for their standard JSON shape. It permits the observed empty `/` root marker but rejects every other absolute member path.

Fetch does not choose a learner entrypoint, install packages, execute cells, or determine XEdu runtime compatibility. The handoff requires `xedu-package-course` to inspect notebook entrypoints, Python dependencies, runtime services, and local assets before packaging.

### Handoff

`source-manifest.json` uses schema `xedu-source-snapshot/v1` and records:

- canonical source URL and project ID;
- source kind (`openinnolab-jupyter` or `openinnolab-senseinnoblocks`);
- title, creator, project type, runtime, framework, and source update timestamp;
- raw artifact relative path, byte size, and SHA-256;
- `xedu_handoff` with the V2 fixed fields `version`, `route`, `intent`, `input_type`, `form`, `target_ref`, `constraints`, and `next_action`.
- for SenseInnoBlocks, `form: scratch` and constraints requiring `scratch-compatibility.json` with `unsupported` as a blocking status.
- for Jupyter, `form: jupyter` and constraints requiring inspection of notebook entrypoints, dependencies, runtime services, and local assets.
- format-specific evidence in `snapshot.artifact.validation`, not extra handoff fields.

No cookie, token, authorization header, WebDAV access token, absolute local path, or browser profile path may appear in either JSON file.

### Safe writes

The helper rejects HTML/login pages, platform error JSON, missing/empty exports, malformed format-specific archives, path traversal, special/encrypted members, CRC failures, existing destinations, and metadata containing secret-shaped keys. It writes into a sibling temporary directory and renames only after all checks and hashes succeed. A failure leaves no partial snapshot.

## Skill Layout

```text
docs/teacher/skill-bundle-src/xedu-teacher-skills/skills/xedu-fetch-project/
  SKILL.md
  agents/openai.yaml
  references/openinnolab.md
  scripts/openinnolab_snapshot.py
```

Bundle-level tests and sanitized fixtures live outside the shipped skill folder under `docs/teacher/skill-bundle-src/xedu-teacher-skills/tests/`.

## Acceptance Criteria

1. Both supplied URL forms parse to the correct project ID and source kind.
2. The two captured metadata fixtures classify as Notebook and SenseInnoBlocks respectively.
3. A Scratch `.ib` and Jupyter project `.zip` are format-validated, copied byte-for-byte, and receive reproducible digests in `source-manifest.json`.
4. Snapshot JSON contains no credential-shaped keys or absolute local paths.
5. HTML, platform error JSON, empty files, unsafe names, and existing destinations fail without partial output.
6. The skill clearly stops at fetch and hands the snapshot to `xedu-package-course` for conversion.
7. A SenseInnoBlocks handoff requires an opcode-level compatibility report and blocks automatic conversion on `unsupported` use.
8. A Jupyter handoff requires package-time inspection of notebook entrypoints, Python dependencies, runtime services, and local assets.
9. `quick_validate.py`, focused tests, and fresh-agent pressure scenarios pass.
