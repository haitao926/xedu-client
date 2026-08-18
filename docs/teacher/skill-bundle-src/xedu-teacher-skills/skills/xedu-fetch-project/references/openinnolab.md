# OpenInnoLab Fetch Reference

Read this file when resolving an OpenInnoLab URL, downloading its native export, handling platform errors, or handing a Scratch or Jupyter snapshot to `xedu-package-course`.

## Supported Links

| Project | Supported route | Native source |
| --- | --- | --- |
| Jupyter / Notebook / XEdu | `/pjlab/project?id=<24-hex-id>` | `.zip` platform dump with one or more `.ipynb` files and project assets |
| SenseInnoBlocks | `/lab/project-standalone/senseinnoblocks/?id=<24-hex-id>` | `.ib` archive from `文件 -> 导出到电脑` |

Only `https://openinnolab.org.cn` and `https://www.openinnolab.org.cn` are trusted. Drop navigation parameters such as `backpath`; retain only the validated project ID in the canonical URL.

## Observed Interfaces

```text
GET  /gw/lab/api/v1/project/<id>
POST /gw/lab/api/v1/project/open
GET  /gw/lab/api/v1/project/file/dump?projectId=<id>
     /webdavx/zip/
```

The metadata GET is useful for title and project classification. Source access is separate. The reference projects are private: anonymous source attempts returned `F566`, `DF1007`, or `1106`. HTTP `401` and `403` have the same operational meaning. Use the user's existing logged-in browser session and never copy authentication material into a shell command.

Reject a route/metadata mismatch: `/pjlab/project` supports `NOTEBOOK`, while the SenseInnoBlocks route supports `SCRATCH`. Do not switch download strategies based on a guessed file extension.

For SenseInnoBlocks, prefer its visible `文件 -> 导出到电脑` action. The resulting `.ib` is the authoritative native export: a ZIP-like archive containing `project.json` and media assets. Preserve the `.ib`; it is not automatically an XEdu-compatible `.sb3` merely because the archive structure is similar.

For Jupyter, use the authenticated project dump. The authoritative export is a `.zip` containing the project file tree, at least one valid `.ipynb`, and possibly images, videos, datasets, models, Python files, or teaching metadata. Preserve all entries together. Do not reduce the project to a single notebook or infer dependencies during fetch.

## Browser Safety

- Navigate to the supplied project URL in the attached browser session.
- If redirected to login, wait for the user to finish the normal login flow, then resume.
- Trigger export only through the visible SenseInnoBlocks menu or direct same-origin dump URL in that tab. Do not inspect requests to recover authorization values.
- Capture the browser download to a temporary local path and pass that path to the helper.
- Do not read cookies, local storage, session storage, request authorization headers, passwords, or browser-profile files.
- If the authenticated account still lacks access, stop with an authorization error. Do not scrape the page or reconstruct files from rendered content.

## Jupyter Validation And Handoff

The helper reads the ZIP directory and every member stream to verify path safety, bounded expansion, member integrity, and CRCs. It validates every `.ipynb` as UTF-8 JSON with integer `nbformat`/`nbformat_minor`, object metadata, a cells list, and structurally valid cell metadata/source. It never extracts, executes, repairs, or rewrites a notebook.

The observed platform dump format may contain a zero-byte `/` directory marker. The helper permits only that exact root marker; other absolute paths remain invalid. It rejects wrong suffixes, unreadable ZIPs, exports without notebooks, malformed notebooks, canonical path collisions, drive/absolute/`..` paths, encrypted or special-file members, excessive expansion, and corrupt members.

For Jupyter snapshots, `xedu_handoff.form` is `jupyter`, `snapshot.artifact.validation.profile` is `jupyter-project-zip`, and the handoff constraints require `xedu-package-course` to determine:

- which notebook or notebooks are learner entrypoints;
- Python package and version requirements;
- XEduHub, network, hardware, or other runtime services;
- local assets referenced by notebooks and supporting source files.

These checks are package concerns. A structurally valid dump is fetchable even when its later XEdu runtime compatibility is unknown.

## SenseInnoBlocks Compatibility Constraint

`xedu-fetch-project` preserves the `.ib` and declares the constraint in `xedu_handoff.constraints`. `xedu-package-course` must inspect `project.json`, enumerate every extension and opcode, compare them with the current XEdu Scratch registration source, and write `scratch-compatibility.json` before conversion.

The fetch helper reads the ZIP directory, root `project.json`, and every member stream to verify structure, paths, size bounds, and CRC integrity. It never extracts or rewrites members. It rejects a wrong suffix, unreadable ZIP, missing/duplicate root `project.json`, invalid JSON shape, canonical path collisions, absolute/drive/`..` paths, encrypted or special-file members, excessive expansion, and corrupt members.

Each opcode may have one or more classifications:

| Classification | Meaning |
| --- | --- |
| `exact-match` | The current XEdu editor accepts the same opcode, arguments, and behavior. |
| `renamed-mappable` | A deterministic rewrite preserves behavior; record target opcode and argument/value transforms. |
| `unsupported` | No behavior-preserving target exists, or a required model/asset is absent. This blocks automatic packaging. |
| `runtime-dependency` | Compatibility also depends on camera permission, local XEduHub, a model, network service, or hardware. |

Minimum report shape:

```json
{
  "schema": "xedu-scratch-compatibility/v1",
  "source_artifact": "<copy snapshot.artifact.path from source-manifest.json>",
  "extensions": ["innolabCamera"],
  "opcodes": [
    {
      "source_opcode": "innolabCamera_videoToggle",
      "count": 1,
      "classifications": ["renamed-mappable", "runtime-dependency"],
      "target_opcodes": ["xeduCamera_enableCamera", "xeduCamera_disableCamera"],
      "conditions": ["Map VIDEO_STATE on/off to enable/disable"],
      "runtime_dependencies": ["camera-permission"],
      "evidence": "current XEdu extension registration and block descriptor"
    }
  ],
  "blocking": false
}
```

Do not classify by similar names alone. Two supplied `.ib` samples establish these important boundaries:

- Scratch-native `event_*`, `control_*`, `motion_*`, `looks_*`, `sound_*`, `data_*`, `operator_*`, and `sensing_*` opcodes are candidates for `exact-match` after signature validation.
- `innolabCamera_videoToggle` can map by `on`/`off`; `innolabCamera_setVideoShowTarget` maps only for equivalent display values. SenseInnoBlocks `popup` has no current XEdu camera-popup equivalent and is `unsupported` unless the target editor adds one.
- `innolabAiTraining` is custom image-classification training/model use. Current `xeduImageClassification` uses the XEduHub `cls_imagenet` capability and is not a semantic replacement for a missing custom model.
- `innolabAiHandposeTraining` is custom gesture classification with user labels such as `左` and `右`. Current `xeduHandSensing` exposes hand detection and 21-point coordinates; it does not reproduce that classifier.
- The supplied `.ib` archives contained `project.json` and media, but no portable custom-model asset. Model load, detect, label, score, readiness, and training-tool blocks therefore remain `unsupported` until a real target custom-model capability and model artifact exist.

The package step must not emit a converted Scratch project while any used opcode is `unsupported`. It may still preserve the raw source and produce the report for manual remediation.

Set `source_artifact` to the exact `source-manifest.json` value at `snapshot.artifact.path`; never assume the downloaded filename is `project.ib`.

## Snapshot Layout

```text
openinnolab-<project-id>/
  raw/<native-export>
  source-metadata.json
  source-manifest.json
```

`source-manifest.json` uses `xedu-source-snapshot/v1`. `snapshot.artifact.validation.profile` is `senseinnoblocks-ib` or `jupyter-project-zip`; Jupyter also records `notebook_count`. Snapshot JSON must not contain credentials, absolute local paths, or browser-profile details.

For Scratch, `xedu_handoff.form` is `scratch`, `snapshot.artifact.validation.profile` is `senseinnoblocks-ib`, and the handoff constraints require a `scratch-compatibility.json` report that blocks on `unsupported`. For Jupyter, the handoff constraints require entrypoint, dependency, runtime-service, and local-asset inspection. The handoff keeps the V2 fixed-field contract; format-specific evidence belongs in `source` and `snapshot.artifact.validation`. A failed snapshot leaves no output destination or sibling `.tmp-*` directory. For multiple URLs, create one independent destination and result per project.
