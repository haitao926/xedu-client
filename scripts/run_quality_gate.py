#!/usr/bin/env python3
"""Run the release checks in one deterministic, non-secret-bearing sequence."""

from __future__ import annotations

import subprocess
import sys
import time


COMMANDS = (
    ("python syntax", ["npm", "run", "check:python-syntax"]),
    ("backend tests", [sys.executable, "-m", "pytest", "backend/tests", "-q"]),
    ("electron security tests", ["node", "--test", "electron/test/preload-security.test.mjs"]),
    ("student shell tests", ["npm", "run", "test:student-shell"]),
    ("Blockly tests", ["npm", "run", "test:blockly-runtime"]),
    ("Scratch tests", ["npm", "run", "test:scratch"]),
    ("frontend build", ["npm", "run", "build"]),
    ("bundle guard", ["npm", "run", "check:bundle"]),
)


def main() -> int:
    for label, command in COMMANDS:
        started = time.monotonic()
        completed = subprocess.run(command, check=False)
        elapsed = time.monotonic() - started
        print(f"[quality-gate] {label}: exit={completed.returncode} elapsed={elapsed:.1f}s", flush=True)
        if completed.returncode:
            return completed.returncode
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
