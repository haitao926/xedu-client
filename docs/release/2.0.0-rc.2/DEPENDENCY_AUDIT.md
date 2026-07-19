# Dependency Audit: 2.0.0 RC.2

Audit date: 2026-07-19

Overall decision: **No-Go**. The root application lock and Python requirement
profiles are now auditable. The Scratch findings have a local, fail-closed,
time-bounded exception gate, but security-owner approval and all platform/
teacher acceptance gates are not closed.

## Root npm Lockfile

- Command: `npm audit --package-lock-only --audit-level=high --json`
- Result: exit `0`; 0 info, 0 low, 0 moderate, 0 high, 0 critical.
- Lockfile SHA-256: `1ea3850b92dd0be41abb39c31e58042762bf8c4efe5b3af48157c2000684f0fe`
- Scope: root `package-lock.json` only; this does not cover Scratch.

## Scratch npm Lockfile

- Command: `npm audit --prefix scratch-editor --package-lock-only --json`
- Result: exit `1`; 21 findings: 5 critical, 6 high, 10 moderate, 0 low.
- `npm audit --prefix scratch-editor --omit=dev --package-lock-only --json` still reports 20 findings, because the upstream Scratch GUI declares build/localization packages in its production dependency graph. This is evidence that npm's prod/dev classification cannot close reachability by itself.
- Current lockfile SHA-256: `ddc4b580db037a165f9f230e2cf50372356f1b70be02d0735c31b4ede5873e41`
- Direct/upstream exposure includes Scratch GUI/VM and their rendering/build
  chain. npm audit alone does not prove whether every finding is reachable in
  the final browser bundle.
- The build tools are now declared and locked in `scratch-editor` so a clean
  runner does not install the entire Scratch GUI development environment at
  build time. This intentionally makes build-only findings visible to the
  audit instead of hiding them in an untracked nested install.

### Scratch Finding Classification

- Runtime or shared upstream chain: `@scratch/scratch-gui`, `scratch-l10n`,
  `uuid`, and the Scratch GUI/VM dependency graph. `react-tooltip` now uses the
  locked `uuid==11.1.1` override. These require final bundle reachability
  review and packaged GUI regression testing.
- Build/localization/test chain: `request`, `transifex`, `mocha`, `form-data`,
  `minimist`, `mkdirp`, `cacache`, `copy-webpack-plugin`, `diff`,
  `serialize-javascript`, `tar`, and related PostCSS tooling. These are not
  loaded by the standalone browser entry unless the build graph proves
  otherwise, but they remain present in the lockfile and cannot be ignored.
- Current mitigation: `hull.js` is replaced by the local security-compatible
  implementation; `cookie`, Scratch VM `uuid`, and `react-tooltip` `uuid`
  overrides are locked. This does not close the remaining Scratch audit gate.
- Current bundle evidence: the generated report follows the `build/index.html`
  script entrypoint and records exact package-name literals found in that
  runtime script. The current report has no literal for the deprecated
  `request`/`transifex` chain and records only a few upstream metadata literals;
  this is reachability evidence for the current build only, not proof that the
  lockfile advisories are fixed or permission to ignore future upgrades.
- Exception gate: `scripts/check_scratch_dependency_gate.mjs` validates all 21
  current findings against `SCRATCH_DEPENDENCY_EXCEPTIONS.json`, including an
  owner, review date, mitigation, scope, and `scratch-editor/build` entrypoint
  evidence. The current local result is 21 accepted exceptions expiring
  `2026-08-31`; this is not a claim that the advisories are fixed.
- Required next action: obtain security owner approval for the documented
  time-bounded exception or perform a coordinated Scratch toolchain upgrade
  before release authorization. Any new finding or Scratch upgrade fails the
  gate until its evidence is updated.

## Python Requirements

### Fixed direct subset

- Input: `backend/requirements.txt`, filtered to exact `==` entries only.
- Command: `pip-audit -r <fixed-subset> --no-deps --format json`
- Result: 24 dependencies, 0 known vulnerabilities.
- This is a direct pinned subset audit, not a complete environment audit.

### Complete requirements

- Inputs: `backend/requirements.txt` and `backend/requirements_full.txt`.
- The previously unbounded OCR/ONNX entries are now fixed to
  `rapidocr-onnxruntime==1.4.4`, `onnx==1.22.0`, and
  `onnxruntime==1.27.0`; the full stack uses `protobuf==6.33.5` to satisfy the
  ONNX Runtime constraint.
- `kimi-agent-sdk` was removed from the teacher requirements because no
  shipped backend module imports it and its resolver chain required conflicting
  exact Pillow and PyYAML versions. This avoids installing an unused CLI/SDK
  stack in teacher environments.
- Dependency resolution and `pip-audit` now complete for both requirement
  profiles with zero known vulnerabilities in the resolved graphs. The
  resulting JSON and command output must be attached to the candidate evidence.
- `xedu-python` is installed separately with `--no-deps`; the teacher settings
  page now runs the XEduHub probe inside the selected interpreter and exposes a
  narrow compatibility repair for the exact `2.0.0` wheel. The repair records
  the original metadata constraints and updates `RECORD`.
- A fresh Python 3.12 probe imports `XEdu.hub.Workflow` and returns the runtime
  task list. An unpatched installation still reports the upstream
  `onnxruntime<1.16.0` and `Pillow<=9.5.0` metadata conflict in `pip check`;
  local code tests cover the explicit metadata repair, but the repaired
  environment must still be verified on both target platforms before release.

## Release Rule

Do not change the overall decision to Go based on the root npm result or the
fixed Python subset alone. A dependency change invalidates `v2.0.0-rc.2` and
requires a new RC plus the affected Scratch/package acceptance reruns.
