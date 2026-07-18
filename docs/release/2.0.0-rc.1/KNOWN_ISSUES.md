# XEdu Client 2.0.0 RC.1 Known Issues

Status: **No-Go for formal teacher distribution**

These are release gates, not optional follow-up work.

| Priority | Issue | Required closure |
|---|---|---|
| P0 | Current source is not frozen in a release commit/tag | Review the final working tree, create the candidate commit and `v2.0.0-rc.1`; any later code change requires a new RC tag. |
| P0 | The 2.2GB checkpoint bundle is ignored by Git and is only present locally | Provision a pinned, hash-verified model bundle in the release environment; `scripts/check_release_inputs.mjs` must pass on a clean checkout. |
| P0 | Windows signing credentials and a signed installer are unavailable locally | Build on the Windows release runner and verify Authenticode and clean installation. |
| P0 | Developer ID signing, notarization, and Gatekeeper verification are unavailable locally | Build on the macOS release runner, staple the DMG, and pass `codesign`, `spctl`, and `stapler`. |
| P0 | Packaged Scratch GUI acceptance is not recorded | Open, run, save, exit, and reopen real `.sb3` projects in the final package on both target platforms. |
| P1 | Scratch lockfile has 22 audit findings: 5 critical, 6 high, 11 moderate, 0 low | Classify build/runtime exposure, upgrade or document a time-bounded release exception with owner. |
| P1 | Full Python requirements resolution fails with `resolution-too-deep` | Pin the unresolved SDK/model dependencies or produce an approved exception and audit the actual teacher runtime. |
| P1 | No 30 physical-client classroom record | Run the same-subnet, manual-address fallback, interruption/recovery, and resource-curve matrix. |
| P1 | No independent teacher trial record | Have at least one Windows and one macOS teacher complete installation, Scratch/Jupyter work, and classroom setup without developer coaching. |

Existing unpacked directories under `dist-*` are diagnostic outputs only. They
must not be renamed or copied into the official release directory.
