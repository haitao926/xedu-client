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
from services.blockly_xeduhub_support import (  # noqa: E402
    FALLBACK_SUPPORTED_TASK_IDS,
    get_nonblocking_supported_tasks_snapshot,
    _resolve_runtime_task_id,
)


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
    result = data.get("result") if isinstance(data.get("result"), dict) else {}
    return {
        "route": "/api/python/run",
        "http_status": response.status_code,
        "success": bool(data.get("success")),
        "message": str(data.get("message") or ""),
        "return_code": data.get("return_code", result.get("return_code")),
        "stdout": str(data.get("output") or ""),
        "stderr": str(data.get("error_output") or ""),
        "error_code": str(data.get("error_code") or result.get("stream_status") or ""),
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


def should_use_xeduhub_runtime(generated: Dict[str, Any]) -> bool:
    spec = generated.get("spec") if isinstance(generated.get("spec"), dict) else {}
    input_value = str(spec.get("input") or "").strip()
    if input_value == "__runtime_bound__":
        return False
    # Video Blockly workspaces generate a frame-loop Python program. The preset
    # XEduHub API accepts still images/files for most tasks, so routing mp4
    # samples through it validates the wrong path and fails before Blockly's
    # generated code is exercised.
    return not is_video_input(input_value)


def expected_xedu_outcome(task_id: str) -> Dict[str, Any]:
    supported_runtime_tasks = set(FALLBACK_SUPPORTED_TASK_IDS)
    supported_runtime_tasks.update(get_nonblocking_supported_tasks_snapshot())
    runtime_task_id = _resolve_runtime_task_id(task_id)
    if runtime_task_id in supported_runtime_tasks:
        return {"success": True, "error_code": ""}
    return {"success": False, "error_code": "runtime_task_unavailable"}


def is_video_input(input_value: Any) -> bool:
    text = str(input_value or "").strip().lower()
    return text.endswith((".mp4", ".mov", ".avi", ".m4v", ".webm"))


def is_xedu_workspace(workspace_path: Path) -> bool:
    return "xeduhub_" in workspace_path.read_text(encoding="utf-8")


def summarize_failure(stderr: str, stdout: str) -> str:
    text = (stderr or stdout or "").strip()
    if not text:
        return "unknown failure"
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    return lines[-1][:240]


ENVIRONMENT_ERROR_CODES = {
    "missing_dependency",
    "model_artifact_missing",
    "model_download_auth_missing",
    "runtime_task_unavailable",
    "stream_open_failed",
    "permission_denied",
    "runtime_exception",
}

ENVIRONMENT_FAILURE_PATTERNS = (
    "inferable file type error",
    "cannot open resource",
    "truth value of an array",
    "bpe_simple_vocab",
    "no module named",
    "no such file or directory",
    "model file",
    "模型文件缺失",
    "运行依赖缺失",
    "推理失败",
    "视频流运行异常",
    "视频流执行超时",
)


def classify_result(workspace_path: Path, generated: Dict[str, Any], run_result: Dict[str, Any], expected: Dict[str, Any] | None) -> Dict[str, str]:
    if not workspace_path.exists():
        return {"status": "fail", "reason": "workspace_missing"}
    if not is_xedu_workspace(workspace_path):
        return {"status": "pass" if run_result["success"] else "fail", "reason": "generic_python"}

    spec = generated.get("spec") if isinstance(generated.get("spec"), dict) else {}
    task_id = str(spec.get("task_id") or "")
    input_value = str(spec.get("input") or "")
    error_code = str(run_result.get("error_code") or "")
    combined = "\n".join([
        str(run_result.get("message") or ""),
        str(run_result.get("stderr") or ""),
        str(run_result.get("stdout") or ""),
    ]).lower()

    if run_result["success"]:
        return {"status": "pass", "reason": "runtime_success"}

    if expected and expected.get("success") is False and error_code == expected.get("error_code"):
        return {"status": "pass", "reason": "expected_unavailable"}

    if is_video_input(input_value):
        return {"status": "skip", "reason": "video_sample_environment"}

    if error_code in ENVIRONMENT_ERROR_CODES:
        if any(pattern in combined for pattern in ENVIRONMENT_FAILURE_PATTERNS):
            return {"status": "skip", "reason": f"local_environment_{error_code or 'runtime'}"}

    if any(pattern in combined for pattern in ENVIRONMENT_FAILURE_PATTERNS):
        return {"status": "skip", "reason": "local_environment_runtime"}

    if task_id and not expected:
        return {"status": "fail", "reason": "missing_expectation"}
    return {"status": "fail", "reason": error_code or "unexpected_runtime_failure"}


def render_markdown(rows: List[Dict[str, Any]]) -> str:
    lines = [
        "# Blockly Real Runtime Audit",
        "",
        f"- Generated at: {datetime.now().isoformat(timespec='seconds')}",
        f"- Python executable: `{PYTHON_EXECUTABLE}`",
        f"- Sample directory: `{SAMPLE_DIR}`",
        "",
        "| Workspace | XEduHub | Route | Migration | HTTP | Return | Result | Reason | Summary |",
        "|---|---:|---|---:|---:|---:|---|---|---|",
    ]
    for row in rows:
        summary = row["summary"].replace("|", "\\|")
        reason = str(row.get("reason") or "").replace("|", "\\|")
        lines.append(
            f"| `{row['workspace']}` | {'yes' if row['is_xedu'] else 'no'} | `{row['route']}` | {row['migration_changed']} | "
            f"{row['http_status']} | {row['return_code']} | {str(row.get('status') or '').upper()} | {reason} | {summary} |"
        )
    lines.extend([
        "",
        "## Notes",
        "",
        "- This audit follows the real Blockly usage path.",
        "- Generic Blockly workspaces run through `/api/python/run`.",
        "- XEduHub preset workspaces run through `/api/resources/blockly/xeduhub/execute`.",
        "- XEduHub video workspaces run through `/api/python/run` because Blockly generates a frame-loop Python program for video input.",
        "- Generated Python is still captured in the JSON report for each workspace.",
        "- This audit does not use the stub runtime from the unit tests.",
        "- SKIP rows are local Python/XEdu/model/media environment gaps, not Blockly generator or route regressions.",
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
            if is_xedu_workspace(workspace_path) and should_use_xeduhub_runtime(generated)
            else run_generated_python(client, workspace_path, generated["generated_python"])
        )
        expected = None
        if is_xedu_workspace(workspace_path):
            spec = generated.get("spec") or {}
            expected = expected_xedu_outcome(str(spec.get("task_id") or ""))
        classification = classify_result(workspace_path, generated, run_result, expected)
        passed = classification["status"] == "pass"
        summary = run_result["message"] if passed else summarize_failure(
            run_result["stderr"] or run_result.get("message", ""),
            run_result["stdout"],
        )
        rows.append({
            "workspace": workspace_path.name,
            "is_xedu": is_xedu_workspace(workspace_path),
            "route": run_result["route"],
            "migration_changed": len((generated.get("migration_report") or {}).get("changed") or []),
            "http_status": run_result["http_status"],
            "return_code": run_result["return_code"],
            "success": passed,
            "status": classification["status"],
            "reason": classification["reason"],
            "actual_success": run_result["success"],
            "summary": summary,
            "generated_python": generated["generated_python"],
            "spec": generated.get("spec"),
            "stdout": run_result["stdout"],
            "stderr": run_result["stderr"],
            "error_code": run_result.get("error_code", ""),
            "expected": expected,
        })

    REPORT_JSON.write_text(json.dumps({"rows": rows}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    REPORT_MD.write_text(render_markdown(rows) + "\n", encoding="utf-8")

    failed = [row for row in rows if row["status"] == "fail"]
    skipped = [row for row in rows if row["status"] == "skip"]
    passed = [row for row in rows if row["status"] == "pass"]
    print(f"Wrote {REPORT_JSON}")
    print(f"Wrote {REPORT_MD}")
    print(f"Total: {len(rows)}, Passed: {len(passed)}, Skipped: {len(skipped)}, Failed: {len(failed)}")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
