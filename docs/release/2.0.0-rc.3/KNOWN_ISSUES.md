# XEdu Client 2.0.0 RC.3 Known Issues

Status: **No-Go for formal teacher distribution**

These are release gates, not optional follow-up work.

| Priority | Issue | Required closure |
|---|---|---|
| P0 | RC3 source is frozen, but formal artifact trust and teacher acceptance are not closed | Keep all platform builds on `v2.0.0-rc.3`; any later code change requires a new RC tag, and formal distribution remains blocked until the remaining P0/P1 gates close. |
| P0 | The 2.2GB checkpoint bundle is ignored by Git and release secrets are not configured in this workspace | Configure `XEDU_CHECKPOINT_BUNDLE_URL` and `XEDU_CHECKPOINT_BUNDLE_SHA256` in the protected release environment; `scripts/provision_checkpoint_bundle.mjs` and `scripts/check_release_inputs.mjs` must pass on a clean checkout. |
| P0 | Windows signing credentials and a signed installer are unavailable locally | Build on the Windows release runner and verify Authenticode and clean installation. |
| P0 | Developer ID signing, notarization, and Gatekeeper verification are unavailable locally | Build on the macOS release runner, staple the DMG, and pass `codesign`, `spctl`, and `stapler`. |
| P0 | Packaged Scratch GUI acceptance is not recorded | Open, run, save, exit, and reopen real `.sb3` projects in the final package on both target platforms. |
| P1 | Scratch lockfile has 21 audit findings: 5 critical, 6 high, 10 moderate, 0 low | Local gate records 21 owner/date/mitigation exceptions and build-entrypoint evidence; security-owner approval or an upstream upgrade is still required before release. |
| P1 | `xedu-python` package metadata requires older Pillow/ONNX Runtime ranges than the modern teacher profile | Teacher settings now probes the selected interpreter and offers a narrow exact-2.0.0 metadata repair; verify repaired `pip check` and XEduHub runtime on Windows and macOS. |
| P1 | No 30 physical-client classroom record | Run the same-subnet, manual-address fallback, interruption/recovery, and resource-curve matrix. |
| P1 | No independent teacher trial record | Have at least one Windows and one macOS teacher complete installation, Scratch/Jupyter work, and classroom setup without developer coaching. |

Existing unpacked directories under `dist-*` are diagnostic outputs only. They
must not be renamed or copied into the official release directory.
