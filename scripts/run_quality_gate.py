#!/usr/bin/env python3
"""Run the release checks in one deterministic, non-secret-bearing sequence."""

from __future__ import annotations

import subprocess
import sys
import time
import argparse
import json
from pathlib import Path


COMMANDS = (
    ("python syntax", ["npm", "run", "check:python-syntax"]),
    ("backend tests", [sys.executable, "-m", "pytest", "backend/tests", "-q"]),
    (
        "electron security tests",
        [
            "node",
            "--test",
            "electron/test/preload-security.test.mjs",
            "electron/test/teacher-credential-store.test.mjs",
        ],
    ),
    ("electron backend network tests", ["node", "--test", "electron/test/backend-network-config.test.mjs"]),
    ("release contract tests", ["node", "--test", "electron/test/phase0-release-contract.test.mjs"]),
    ("checkpoint provisioner contract tests", ["node", "--test", "electron/test/checkpoint-provisioner-contract.test.mjs"]),
    ("Scratch release contract tests", ["node", "--test", "electron/test/scratch-release-contract.test.mjs"]),
    ("Scratch dependency gate contract tests", ["node", "--test", "electron/test/scratch-dependency-gate.test.mjs"]),
    ("package layout and Python runtime contract tests", ["node", "--test", "electron/test/package-layout-contract.test.mjs", "electron/test/python-runtime.test.mjs"]),
    ("release artifact verifier tests", ["node", "--test", "electron/test/release-artifact-verifier.test.mjs"]),
    ("student shell tests", ["npm", "run", "test:student-shell"]),
    ("manual classroom connection tests", ["node", "--test", "renderer/js/resources/classroom-connect.test.mjs"]),
    ("APIClient and HTML utility tests", ["node", "--test", "renderer/js/api.test.mjs", "renderer/js/utils/html.test.js"]),
    ("renderer error boundary tests", ["node", "--test", "renderer/js/main/error-boundary.test.mjs"]),
    (
        "teacher access tests",
        [
            "node",
            "--test",
            "renderer/js/main/teacher-mode-state.test.mjs",
            "renderer/js/main/teacher-login.contract.test.mjs",
        ],
    ),
    ("backend startup support tests", ["node", "--test", "renderer/js/main/backend-startup-support.test.mjs"]),
    ("Python selection flow tests", ["node", "--test", "renderer/js/main/python-selection.contract.test.mjs"]),
    ("renderer shell UI tests", ["node", "--test", "renderer/js/main/shell-ui.test.mjs"]),
    ("Scratch workspace resilience tests", ["node", "--test", "renderer/js/main/workspace-context.test.mjs"]),
    ("resource async error boundary tests", ["node", "--test", "renderer/js/resources/async-error-boundary.contract.test.mjs"]),
    ("resource file utility tests", ["node", "--test", "renderer/js/resources/file-utils.test.js"]),
    ("experiment overview tests", ["node", "--test", "renderer/js/resources/experiment-overview.test.js"]),
    ("resources state tests", ["node", "--test", "renderer/js/resources/resources-state.test.js"]),
    ("main stylesheet contract tests", ["node", "--test", "renderer/styles/main-css-contract.test.mjs"]),
    ("resource inspection tests", ["npm", "run", "test:resources-inspection"]),
    ("Scratch build", ["npm", "run", "build:scratch"]),
    ("Scratch build output check", ["npm", "run", "check:scratch-build"]),
    ("Scratch tests", ["npm", "run", "test:scratch"]),
    ("frontend build", ["npm", "run", "build"]),
    ("bundle guard", ["npm", "run", "check:bundle"]),
)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--release-artifact",
        help="optionally verify an unpacked Windows directory or macOS .app bundle",
    )
    parser.add_argument(
        "--release-profile",
        choices=("release", "minimal", "external-python"),
        default="release",
        help="content profile used when verifying --release-artifact",
    )
    args = parser.parse_args()

    commands = list(COMMANDS)
    if args.release_artifact:
        package = json.loads((Path(__file__).resolve().parents[1] / "package.json").read_text())
        commands.append((
            "release artifact contents",
            [
                "node",
                "scripts/verify_release_artifact.mjs",
                args.release_artifact,
                "--version",
                package["version"],
                "--profile",
                args.release_profile,
            ],
        ))

    for label, command in commands:
        started = time.monotonic()
        completed = subprocess.run(command, check=False)
        elapsed = time.monotonic() - started
        print(f"[quality-gate] {label}: exit={completed.returncode} elapsed={elapsed:.1f}s", flush=True)
        if completed.returncode:
            return completed.returncode
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
