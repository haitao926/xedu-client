#!/usr/bin/env python3
"""Keep the local XEdu API available during renderer development."""

from __future__ import annotations

import http.client
import json
import os
import signal
import subprocess
import sys
import time
from pathlib import Path
from urllib.parse import quote


ROOT_DIR = Path(__file__).resolve().parents[1]
BACKEND_MAIN = ROOT_DIR / "backend" / "backend_main.py"
API_PORT = int(os.environ.get("XEDU_API_PORT") or os.environ.get("XEDU_BACKEND_PORT") or "5123")
API_HOST = (os.environ.get("XEDU_API_HOST") or os.environ.get("XEDU_BACKEND_HOST") or "127.0.0.1").strip()
HEALTH_HOST = "127.0.0.1" if API_HOST in {"", "0.0.0.0"} else API_HOST
RENDERER_PORT = int(os.environ.get("XEDU_RENDERER_PORT") or "3002")
DEV_API_CAPABILITY = "xedu-dev-capability"
DEV_ALLOWED_ORIGINS = ",".join(
    [
        f"http://127.0.0.1:{RENDERER_PORT}",
        f"http://localhost:{RENDERER_PORT}",
    ]
)


def health_ok(timeout: float = 1.0) -> bool:
    conn = None
    try:
        conn = http.client.HTTPConnection(HEALTH_HOST, API_PORT, timeout=timeout)
        conn.request("GET", "/api/health")
        response = conn.getresponse()
        body = response.read().decode("utf-8", errors="replace")
        if response.status != 200:
            return False
        try:
            payload = json.loads(body or "{}")
        except json.JSONDecodeError:
            return False
        conn.close()
        conn = http.client.HTTPConnection(HEALTH_HOST, API_PORT, timeout=timeout)
        capability = os.environ.get("XEDU_CLIENT_CAPABILITY", DEV_API_CAPABILITY)
        probe_path = (
            "/api/detect_python?python_executable="
            f"{quote(sys.executable, safe='')}"
            if payload.get("bootstrap_only")
            else "/api/status"
        )
        conn.request("GET", probe_path, headers={"X-XEdu-Client-Token": capability})
        return conn.getresponse().status == 200
    except OSError:
        return False
    finally:
        if conn is not None:
            conn.close()


def sleep_until_stopped() -> None:
    try:
        while True:
            time.sleep(3600)
    except KeyboardInterrupt:
        return


def main() -> int:
    if health_ok():
        print(f"XEdu API already running at http://{HEALTH_HOST}:{API_PORT}", flush=True)
        sleep_until_stopped()
        return 0

    if not BACKEND_MAIN.exists():
        print(f"Backend entry not found: {BACKEND_MAIN}", file=sys.stderr, flush=True)
        return 1

    env = dict(os.environ)
    env["XEDU_API_PORT"] = str(API_PORT)
    env["XEDU_BACKEND_PORT"] = str(API_PORT)
    if API_HOST:
        env["XEDU_API_HOST"] = API_HOST
        env["XEDU_BACKEND_HOST"] = API_HOST
    env.setdefault("XEDU_CLIENT_CAPABILITY", DEV_API_CAPABILITY)
    env.setdefault("XEDU_ALLOWED_ORIGINS", DEV_ALLOWED_ORIGINS)

    print(f"Starting XEdu API at http://{HEALTH_HOST}:{API_PORT}", flush=True)
    process = subprocess.Popen(
        [sys.executable, str(BACKEND_MAIN)],
        cwd=str(ROOT_DIR),
        env=env,
    )

    def stop_child(signum, _frame):
        if process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
        raise SystemExit(0 if signum in {signal.SIGINT, signal.SIGTERM} else 1)

    signal.signal(signal.SIGINT, stop_child)
    signal.signal(signal.SIGTERM, stop_child)

    while True:
        code = process.poll()
        if code is not None:
            return code
        time.sleep(0.5)


if __name__ == "__main__":
    raise SystemExit(main())
