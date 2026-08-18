---
name: xedu-fetch-project
description: Use when an OpenInnoLab Scratch/SenseInnoBlocks or Jupyter/Notebook project link must be downloaded, mirrored, or preserved before later XEdu conversion.
---

# XEdu Fetch Project

Fetch an OpenInnoLab Scratch or Jupyter project from its link and preserve the platform-native export. This skill stops at a verified source snapshot; `xedu-package-course` owns extraction, conversion, compatibility analysis, `course.json`, packaging, and publishing.

## Required Input

Accept one or more OpenInnoLab project URLs and an optional output parent. Process each URL independently; one failure must not overwrite or invalidate another successful snapshot. Default each destination to `./openinnolab-<project-id>`. Do not ask the user for a project ID, downloaded filename, cookie, token, authorization header, password, or browser-profile path.

Read [references/openinnolab.md](references/openinnolab.md) before fetching. Use the bundled helper for URL, metadata, artifact, and snapshot validation.

## Workflow

1. Run `scripts/openinnolab_snapshot.py inspect-url '<url>'`. Reject unsupported hosts, routes, or IDs.
2. Fetch `GET /gw/lab/api/v1/project/<id>` and run `inspect-metadata`. Require `SCRATCH` on the SenseInnoBlocks route or `NOTEBOOK` on the project route; never scrape rendered HTML as project source.
3. Download the native export through a browser session already authenticated to OpenInnoLab. Use only a visible page action or direct same-origin navigation; do not inspect network headers, browser storage, or cookies:
   - SenseInnoBlocks: use `文件 -> 导出到电脑` and capture the resulting `.ib`.
   - Jupyter/Notebook: navigate that logged-in tab to `/gw/lab/api/v1/project/file/dump?projectId=<id>` and capture the resulting `.zip` project dump.
   - If login is required, let the user complete the site's normal login page. Never inspect or persist browser credentials or storage.
4. Run `snapshot` with the metadata JSON, downloaded artifact, and a new destination such as `openinnolab-<project-id>`. Never overwrite an existing destination.
5. Verify that `raw/<artifact>` is byte-identical to the download, its SHA-256 matches `source-manifest.json`, and no `course.json` or extracted project tree was created. Require validation profile `senseinnoblocks-ib` or `jupyter-project-zip` as appropriate.
6. Hand `source-manifest.json` to `xedu-package-course`. Preserve the declared downstream work: Scratch requires `scratch-compatibility.json`; Jupyter requires notebook-entrypoint, dependency, runtime-service, and local-asset inspection. Do not perform either conversion here.

```bash
python3 scripts/openinnolab_snapshot.py snapshot \
  --url "$PROJECT_URL" \
  --metadata "$METADATA_JSON" \
  --artifact "$NATIVE_EXPORT" \
  --output "$SNAPSHOT_DIR"
```

## Hard Boundaries

- Keep the downloaded bytes and filename unchanged under `raw/`.
- Do not extract or rewrite `.ib`/`.zip`, reconstruct `.sb3`, rename extension opcodes, edit notebooks, install dependencies, generate `course.json`, or publish.
- Do not use anonymous `curl` failure as evidence that a private project is unavailable; retry only through the existing authenticated browser session.
- Treat `F566`, `DF1007`, `1106`, HTTP `401`, and HTTP `403` as authentication or authorization failures. Do not bypass them by scraping HTML or copying browser secrets.
- Stop on HTML/login payloads, platform error JSON, empty files, unsafe or malformed archives/notebooks, inaccessible projects, and existing output paths.
- The helper removes its sibling `.tmp-*` directory on failure. Do not reuse or manually merge an interrupted snapshot; retry with a clean destination.

## Output

Report `source_url`, `project_id`, `source_kind`, `snapshot_dir`, `raw_artifact`, `sha256`, `validation`, `authentication_path`, `xedu_handoff`, `verification_notes`, and `recommended_next_action`. The next action is `xedu-package-course` only after snapshot validation succeeds.
