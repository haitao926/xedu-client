#!/usr/bin/env python3
from __future__ import annotations

import json
import subprocess
import sys
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List


REPO_ROOT = Path(__file__).resolve().parents[1]
BACKEND_DIR = REPO_ROOT / "backend"
SAMPLE_DIR = REPO_ROOT / "courses" / "blockly-smoke"
PYTHON_EXECUTABLE = REPO_ROOT / "python_env" / "bin" / "python3"
REPORT_DIR = REPO_ROOT / "test-results"
REPORT_JSON = REPORT_DIR / "blockly-real-runtime-report.json"
REPORT_MD = REPORT_DIR / "blockly-real-runtime-report.md"
GENERATOR_SCRIPT = REPO_ROOT / "scripts" / "generate_blockly_python.mjs"

if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from api.app import create_app  # noqa: E402


def workspace_files() -> List[Path]:
    return sorted(
        path
        for path in SAMPLE_DIR.iterdir()
        if path.is_file() and path.name.endswith((".blockly.xml", ".blockly.json"))
    )


def generate_python_for_workspace(workspace_path: Path) -> Dict[str, Any]:
    result = subprocess.run(
        ["node", str(GENERATOR_SCRIPT), str(workspace_path)],
        cwd=str(REPO_ROOT),
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or result.stdout.strip() or "generate_blockly_python failed")
    return json.loads(result.stdout)


def build_client():
    app = create_app(SAMPLE_DIR)
    app.testing = True
    return app.test_client()


def run_generated_python(client, workspace_path: Path, code: str) -> Dict[str, Any]:
    response = client.post(
        "/api/python/run",
        json={
            "code": code,
            "python_executable": str(PYTHON_EXECUTABLE),
            "project_root": str(workspace_path.parent),
            "timeout_seconds": 20,
        },
    )
    data = response.get_json() or {}
    return {
        "route": "/api/python/run",
        "http_status": response.status_code,
        "success": bool(data.get("success")),
        "message": str(data.get("message") or ""),
        "return_code": data.get("return_code"),
        "stdout": str(data.get("output") or ""),
        "stderr": str(data.get("error_output") or ""),
    }


def run_xeduhub_runtime(client, generated: Dict[str, Any]) -> Dict[str, Any]:
    response = client.post(
        "/api/resources/blockly/xeduhub/execute",
        json={
            "code": generated["generated_python"],
            "spec": generated.get("spec") or {},
            "project_root": str(SAMPLE_DIR),
        },
    )
    data = response.get_json() or {}
    result = data.get("result") if isinstance(data.get("result"), dict) else {}
    return {
        "route": "/api/resources/blockly/xeduhub/execute",
        "http_status": response.status_code,
        "success": bool(data.get("success")),
        "message": str(data.get("message") or ""),
        "return_code": result.get("return_code"),
        "stdout": str(result.get("stdout") or data.get("output") or ""),
        "stderr": str(result.get("stderr") or data.get("error_output") or data.get("message") or ""),
        "error_code": str(data.get("error_code") or ""),
    }


def is_xedu_workspace(workspace_path: Path) -> bool:
    return "xeduhub_" in workspace_path.read_text(encoding="utf-8")


def summarize_failure(stderr: str, stdout: str) -> str:
    text = (stderr or stdout or "").strip()
    if not text:
        return "unknown failure"
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    return lines[-1][:240]


def render_markdown(rows: List[Dict[str, Any]]) -> str:
    lines = [
        "# Blockly Real Runtime Audit",
        "",
        f"- Generated at: {datetime.now().isoformat(timespec='seconds')}",
        f"- Python executable: `{PYTHON_EXECUTABLE}`",
        f"- Sample directory: `{SAMPLE_DIR}`",
        "",
        "| Workspace | XEduHub | Route | Migration | HTTP | Return | Result | Summary |",
        "|---|---:|---|---:|---:|---:|---|---|",
    ]
    for row in rows:
        summary = row["summary"].replace("|", "\\|")
        lines.append(
            f"| `{row['workspace']}` | {'yes' if row['is_xedu'] else 'no'} | `{row['route']}` | {row['migration_changed']} | "
            f"{row['http_status']} | {row['return_code']} | {'PASS' if row['success'] else 'FAIL'} | {summary} |"
        )
    lines.extend([
        "",
        "## Notes",
        "",
        "- This audit follows the real Blockly usage path.",
        "- Generic Blockly workspaces run through `/api/python/run`.",
        "- XEduHub workspaces run through `/api/resources/blockly/xeduhub/execute`.",
        "- Generated Python is still captured in the JSON report for each workspace.",
        "- This audit does not use the stub runtime from the unit tests.",
        "- Failures here reflect the current local Python/XEdu/model environment.",
        "",
    ])
    return "\n".join(lines)


def main() -> int:
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    client = build_client()
    rows: List[Dict[str, Any]] = []

    for workspace_path in workspace_files():
        generated = generate_python_for_workspace(workspace_path)
        run_result = (
            run_xeduhub_runtime(client, generated)
            if is_xedu_workspace(workspace_path)
            else run_generated_python(client, workspace_path, generated["generated_python"])
        )
        summary = run_result["message"] if run_result["success"] else summarize_failure(run_result["stderr"], run_result["stdout"])
        rows.append({
            "workspace": workspace_path.name,
            "is_xedu": is_xedu_workspace(workspace_path),
            "route": run_result["route"],
            "migration_changed": len((generated.get("migration_report") or {}).get("changed") or []),
            "http_status": run_result["http_status"],
            "return_code": run_result["return_code"],
            "success": run_result["success"],
            "summary": summary,
            "generated_python": generated["generated_python"],
            "spec": generated.get("spec"),
            "stdout": run_result["stdout"],
            "stderr": run_result["stderr"],
            "error_code": run_result.get("error_code", ""),
        })

    REPORT_JSON.write_text(json.dumps({"rows": rows}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    REPORT_MD.write_text(render_markdown(rows) + "\n", encoding="utf-8")

    failed = [row for row in rows if not row["success"]]
    print(f"Wrote {REPORT_JSON}")
    print(f"Wrote {REPORT_MD}")
    print(f"Total: {len(rows)}, Passed: {len(rows) - len(failed)}, Failed: {len(failed)}")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
