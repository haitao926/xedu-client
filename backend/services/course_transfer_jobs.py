"""Process-local state for long-running course transfers."""

from __future__ import annotations

import copy
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from typing import Any, Callable, Dict, Optional
from uuid import uuid4


ProgressCallback = Callable[[Dict[str, Any]], None]
TransferWork = Callable[[ProgressCallback], Dict[str, Any]]


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class CourseTransferJobManager:
    """Runs transfer work outside the request and exposes immutable snapshots."""

    _PROGRESS_FIELDS = (
        "phase",
        "percent",
        "completed_files",
        "total_files",
        "completed_bytes",
        "total_bytes",
        "current_file",
        "message",
    )

    def __init__(self, *, max_workers: int = 2, retention_seconds: int = 15 * 60):
        self._lock = threading.RLock()
        self._jobs: Dict[str, Dict[str, Any]] = {}
        self._retention_seconds = max(1, int(retention_seconds))
        self._executor = ThreadPoolExecutor(max_workers=max(1, int(max_workers)))

    def start(self, work: TransferWork, metadata: Optional[Dict[str, Any]] = None) -> str:
        if not callable(work):
            raise TypeError("course transfer work must be callable")

        operation_id = str(uuid4())
        state: Dict[str, Any] = {
            "operation_id": operation_id,
            "state": "queued",
            "phase": "preparing",
            "percent": 0,
            "completed_files": 0,
            "total_files": 0,
            "completed_bytes": 0,
            "total_bytes": 0,
            "current_file": "",
            "message": "正在准备导入...",
            "result": None,
            "error": None,
            "created_at": _now_iso(),
            "updated_at": _now_iso(),
        }
        if isinstance(metadata, dict):
            state["metadata"] = dict(metadata)

        with self._lock:
            self._purge_expired_locked()
            self._jobs[operation_id] = state
            self._executor.submit(self._execute, operation_id, work)
        return operation_id

    def get(self, operation_id: str) -> Optional[Dict[str, Any]]:
        clean_id = str(operation_id or "").strip()
        if not clean_id:
            return None
        with self._lock:
            self._purge_expired_locked()
            state = self._jobs.get(clean_id)
            return copy.deepcopy(state) if state else None

    def shutdown(self, *, wait: bool = False) -> None:
        self._executor.shutdown(wait=wait, cancel_futures=False)

    def _execute(self, operation_id: str, work: TransferWork) -> None:
        self._update(operation_id, state="running", phase="preparing", message="正在准备导入...")
        try:
            result = work(lambda progress: self._report(operation_id, progress))
            self._update(
                operation_id,
                state="success",
                phase="completed",
                percent=100,
                message="课程导入完成",
                result=result,
                error=None,
            )
        except Exception as exc:  # Worker errors must become pollable terminal state.
            self._update(
                operation_id,
                state="error",
                phase="error",
                message=str(exc) or "课程导入失败",
                error=str(exc) or "课程导入失败",
                result=None,
            )

    def _report(self, operation_id: str, progress: Optional[Dict[str, Any]]) -> None:
        if not isinstance(progress, dict):
            return
        updates = {key: progress[key] for key in self._PROGRESS_FIELDS if key in progress}
        if "percent" in updates:
            try:
                updates["percent"] = max(0, min(99, int(updates["percent"])))
            except (TypeError, ValueError):
                updates.pop("percent", None)
        for key in ("completed_files", "total_files", "completed_bytes", "total_bytes"):
            if key in updates:
                try:
                    updates[key] = max(0, int(updates[key]))
                except (TypeError, ValueError):
                    updates.pop(key, None)
        self._update(operation_id, **updates)

    def _update(self, operation_id: str, **updates: Any) -> None:
        with self._lock:
            state = self._jobs.get(operation_id)
            if state is None:
                return
            if "percent" in updates and state.get("state") not in {"success", "error"}:
                updates["percent"] = max(int(state.get("percent") or 0), int(updates["percent"]))
            if "completed_files" in updates:
                updates["completed_files"] = max(
                    int(state.get("completed_files") or 0), int(updates["completed_files"])
                )
            if "completed_bytes" in updates:
                updates["completed_bytes"] = max(
                    int(state.get("completed_bytes") or 0), int(updates["completed_bytes"])
                )
            state.update(updates)
            state["updated_at"] = _now_iso()

    def _purge_expired_locked(self) -> None:
        cutoff = time.time() - self._retention_seconds
        expired = []
        for operation_id, state in self._jobs.items():
            if state.get("state") not in {"success", "error"}:
                continue
            updated = state.get("updated_at")
            try:
                updated_epoch = datetime.fromisoformat(str(updated)).timestamp()
            except (TypeError, ValueError, OverflowError):
                updated_epoch = time.time()
            if updated_epoch < cutoff:
                expired.append(operation_id)
        for operation_id in expired:
            self._jobs.pop(operation_id, None)
