# Scratch GUI Acceptance: Local Unsigned Candidate

Status: **Partial evidence only; not a release approval**

Recorded: 2026-07-19

## Candidate

| Field | Value |
|---|---|
| Product version | `2.0.0` |
| Source commit | `89cdbd95` implementation baseline; this local candidate predates the RC3 identity tag |
| Exact release tag | Not applicable to this local candidate; release target is `v2.0.0-rc.3` |
| Platform | macOS arm64 |
| Candidate path | `dist-candidate-20260719/mac-arm64/XEdu Client.app` |
| Candidate type | Unpacked, unsigned local candidate |
| Approximate size | `2.9 GB` |
| Local manifest | Not generated; identity-bound manifests require an exact release tag |
| Manifest scope | Verifier passed contents; no release identity asserted |

## Completed Local Checks

- `npm run quality-gate`: passed; backend `136 passed`, Scratch `22 passed`.
- `node scripts/verify_release_artifact.mjs "dist-candidate-20260719/mac-arm64/XEdu Client.app" --version 2.0.0 --platform darwin --arch arm64`: passed.
- Package contains `Contents/Resources/backend`, `Contents/Resources/checkpoint`, and `Contents/Resources/scratch-editor/build/index.html`.
- Package does not contain `python_env`, `python_env_win`, or the removed Blockly-only artifact paths.
- The local unpacked candidate was built after the current quality gate; electron-builder reported signing skipped because no valid Developer ID identity is available.
- Packaged executable SHA-256: `cf74833a9b0c242e26c177005d7d61819e5bf5ed199acc794fed2eb0cc4f3149`.
- Scratch entry SHA-256: `03f73b2ac1198da979ba108b42f8c0844aaee4ddd96dabc7910f90a5ecd148ea`.
- Scratch audit command exit was `1`; the documented gate accepted 21 expiring exceptions and generated a reachability report for the `build/index.html` script entrypoint.
- The candidate was not rebuilt from `v2.0.0-rc.3`; its checks are content evidence only and must be repeated on the signed artifacts produced by the official workflow.

## Required Before Release

- Open both repository `.sb3` fixtures in the packaged GUI.
- Run the project and execute the XEdu AI/XEduHub path.
- Edit, save, fully exit, reopen, and compare project state.
- Repeat on the signed Windows and macOS release artifacts.
- Perform the actual `.sb3` GUI open/run/save/reopen and XEdu AI inference steps; this local content check does not replace them.
- Record package SHA-256, OS build, tester, screenshots/logs, and result for every step.

This record must not be used as evidence of signing, notarization, Gatekeeper
acceptance, Windows installation, classroom scale, or independent teacher use.
