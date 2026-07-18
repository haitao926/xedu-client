# Dependency Audit: 2.0.0 RC.1

Audit date: 2026-07-19

Overall decision: **No-Go**. The root application lock is clean, but the
Scratch build/runtime dependency scope and complete Python environment are not
closed.

## Root npm Lockfile

- Command: `npm audit --package-lock-only --audit-level=high --json`
- Result: exit `0`; 0 info, 0 low, 0 moderate, 0 high, 0 critical.
- Lockfile SHA-256: `1ea3850b92dd0be41abb39c31e58042762bf8c4efe5b3af48157c2000684f0fe`
- Scope: root `package-lock.json` only; this does not cover Scratch.

## Scratch npm Lockfile

- Command: `npm audit --prefix scratch-editor --package-lock-only --json`
- Result: exit `1`; 22 findings: 5 critical, 6 high, 11 moderate, 0 low.
- Current lockfile SHA-256: `9c14392f39489e5f9590895b84ed61c5b53191d27724d929778a3195cddaf44c`
- Direct/upstream exposure includes Scratch GUI/VM and their rendering/build
  chain. npm audit alone does not prove whether every finding is reachable in
  the final browser bundle.
- The build tools are now declared and locked in `scratch-editor` so a clean
  runner does not install the entire Scratch GUI development environment at
  build time. This intentionally makes build-only findings visible to the
  audit instead of hiding them in an untracked nested install.

### Scratch Finding Classification

- Runtime or shared upstream chain: `@scratch/scratch-gui`, `react-tooltip`,
  `scratch-l10n`, `uuid`, and the Scratch GUI/VM dependency graph. These require
  final bundle reachability review and packaged GUI regression testing.
- Build/localization/test chain: `request`, `transifex`, `mocha`, `form-data`,
  `minimist`, `mkdirp`, `cacache`, `copy-webpack-plugin`, `diff`,
  `serialize-javascript`, `tar`, and related PostCSS tooling. These are not
  loaded by the standalone browser entry unless the build graph proves
  otherwise, but they remain present in the lockfile and cannot be ignored.
- Current mitigation: `hull.js` is replaced by the local security-compatible
  implementation; `cookie` and `uuid` overrides are locked. This does not
  close the remaining Scratch audit gate.
- Required next action: classify runtime reachability and decide upgrades or a
  time-bounded exception before release authorization.

## Python Requirements

### Fixed direct subset

- Input: `backend/requirements.txt`, filtered to exact `==` entries only.
- Command: `pip-audit -r <fixed-subset> --no-deps --format json`
- Result: 23 dependencies, 0 known vulnerabilities.
- This is a direct pinned subset audit, not a complete environment audit.

### Complete requirements

- Inputs: `backend/requirements.txt` and `backend/requirements_full.txt`.
- `pip-audit` attempted dependency resolution and failed with
  `resolution-too-deep` while resolving the unpinned/complex SDK and model
  dependency graph. The audit therefore has no valid vulnerability count.
- This failure was reproduced on 2026-07-19 with `python3 -m pip_audit -r
  backend/requirements.txt --format json`; it is a resolver failure, not a
  clean vulnerability result.
- Unresolved scope includes `kimi-agent-sdk`, `rapidocr-onnxruntime`, and the
  lower-bounded `onnx`/`onnxruntime` entries in the full requirements.
- `xedu-python` is installed separately with `--no-deps`; its actual portable
  environment still needs `pip check`, freeze capture, and a vulnerability
  audit.

## Release Rule

Do not change the overall decision to Go based on the root npm result or the
fixed Python subset alone. A dependency change invalidates the candidate tag
and requires a new RC plus the affected Scratch/package acceptance reruns.
