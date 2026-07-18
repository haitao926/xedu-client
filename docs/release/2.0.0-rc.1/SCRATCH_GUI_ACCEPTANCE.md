# Scratch GUI Acceptance: Local Unsigned Candidate

Status: **Partial evidence only; not a release approval**

Recorded: 2026-07-19

## Candidate

| Field | Value |
|---|---|
| Product version | `2.0.0` |
| Source commit | `f9e43ca9e7eb6506a4ecacdcbeef67d2c1deb7a9` |
| Exact release tag | None; working tree is dirty |
| Platform | macOS arm64 |
| Candidate path | `dist-final/mac-arm64/XEdu Client.app` |
| Candidate type | Unpacked, unsigned local candidate |
| Approximate size | `2.9 GB` |
| Local manifest | `LOCAL_UNSIGNED_MACOS_MANIFEST.json` (`c9237afc493f9029793c8cbb1a89cef23b77afa7cbc2267503c514c8855f64c1`) |
| Manifest scope | `2,533` files, `2,970,897,306` bytes |

## Completed Local Checks

- `npm run quality-gate`: passed; backend `130 passed`, Scratch `21 passed`.
- `node scripts/verify_release_artifact.mjs "dist-final/mac-arm64/XEdu Client.app" --version 2.0.0 --platform darwin --arch arm64`: passed.
- Package contains `Contents/Resources/backend`, `Contents/Resources/checkpoint`, and `Contents/Resources/scratch-editor/build/index.html`.
- Package does not contain `python_env`, `python_env_win`, or the removed Blockly-only artifact paths.
- The packaged executable remained alive for a 10-second startup probe and was then terminated by the test harness; no stdout/stderr startup error was emitted.
- Packaged executable SHA-256: `cf74833a9b0c242e26c177005d7d61819e5bf5ed199acc794fed2eb0cc4f3149`.
- Scratch entry SHA-256: `03f73b2ac1198da979ba108b42f8c0844aaee4ddd96dabc7910f90a5ecd148ea`.

## Required Before Release

- Open both repository `.sb3` fixtures in the packaged GUI.
- Run the project and execute the XEdu AI/XEduHub path.
- Edit, save, fully exit, reopen, and compare project state.
- Repeat on the signed Windows and macOS release artifacts.
- Record package SHA-256, OS build, tester, screenshots/logs, and result for every step.

This record must not be used as evidence of signing, notarization, Gatekeeper
acceptance, Windows installation, classroom scale, or independent teacher use.
