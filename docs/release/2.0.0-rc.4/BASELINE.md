# XEdu Client 2.0.0 RC.4 Baseline

Status: **FROZEN FOR RC VALIDATION; NOT FORMAL RELEASE AUTHORIZATION**

This document records the local engineering baseline for the teacher release
candidate. It is not a release authorization and does not make the current
working tree or any existing `dist-*` directory a distributable artifact.

## Source

| Field | Value |
|---|---|
| Product version | `2.0.0` |
| Release candidate source commit | The commit pointed to by `v2.0.0-rc.4`; implementation baseline `89cdbd95`, followed by the protected-input workflow fix `22d448af`, the audit-gate follow-up, and the complete protected-secret preflight |
| Exact release tag | `v2.0.0-rc.4` (created after the RC4 identity documentation and release-contract update) |
| Working tree | Release source files are committed; local `.claude` settings and untracked `dist-*` diagnostics are excluded from release scope |
| Product direction | Scratch-only; Blockly is unsupported and removed from the maintained path |
| Required release tag | `v2.0.0-rc.4` for this candidate, or a new RC after any source change |

## Local Toolchain

| Tool | Version |
|---|---|
| Node.js | `v22.23.1` |
| npm | `10.9.8` |
| Python | `3.12.10` |
| Electron | `39.8.10` in the lockfile |
| electron-builder | `26.15.3` |
| Vite | `8.1.5` |

## Automated Evidence

Recorded on 2026-07-19:

- `npm run quality-gate`: passed after the dependency-lock, build-path, and teacher-environment changes, including backend `136 passed`, Scratch `22 passed`, renderer/Electron contracts, Vite build, and bundle guard.
- `npm run check:python-syntax`: passed through the cross-platform Node launcher.
- `git diff --check`: passed.
- `node scripts/check_release_inputs.mjs`: passed locally for 30 checkpoint files, `2,407,323,676` bytes.
- `npm audit --audit-level=high --json`: root lockfile reports zero vulnerabilities.
- Fixed Python direct-dependency subset: 24 dependencies, zero known vulnerabilities with `pip-audit --no-deps`.
- Scratch lockfile audit: 21 findings (`5 critical / 6 high / 10 moderate / 0 low`) after the `react-tooltip` UUID override; the local exception gate accepts all 21 only until `2026-08-31`, pending security-owner approval.
- `backend/requirements.txt` and `backend/requirements_full.txt` both resolve and pass `pip-audit` with zero known vulnerabilities. The teacher settings page now probes the selected `xedu-python` interpreter and can apply the recorded exact-2.0.0 metadata repair; cross-platform `pip check` evidence is still required.
- Release artifact contracts: focused Electron/package tests passed; the verifier now reads real app.asar/Info.plist versions, scans app.asar for forbidden runtime paths, and independently checks the source tag/commit before writing an identity-bound manifest.
- Release workflow contract: any exact `v2.0.0` tag or `v2.0.0-rc.N` tag is accepted only when it points to the checked-out source commit; all checkpoint, signing, and notarization credentials are validated before provisioning, and downstream audit steps skip cleanly when that prerequisite fails.

## Release Targets

- Windows x64: NSIS installer plus unpacked directory.
- macOS arm64: DMG plus zip, with hardened runtime and entitlements.
- The official workflow is `.github/workflows/release.yml` and requires an
  exact version tag, platform signing credentials, the checkpoint bundle, and
  independent artifact verification. A clean runner provisions the model
  archive through `XEDU_CHECKPOINT_BUNDLE_URL` and verifies
  `XEDU_CHECKPOINT_BUNDLE_SHA256` before building.

## Not Yet Evidence

- The RC4 source commit and `v2.0.0-rc.4` tag are frozen for validation; this does not authorize formal teacher distribution.
- No signed Windows installer has been generated or verified.
- No Developer ID signed, notarized, and stapled macOS artifact has been verified.
- No packaged GUI `.sb3` open/run/save/reopen record exists.
- No 30-physical-terminal classroom record or independent teacher trial exists.
- The Scratch dependency audit, `xedu-python` runtime compatibility, signing,
  packaged GUI, classroom, and teacher trial gates remain unresolved and keep
  the candidate at No-Go.
