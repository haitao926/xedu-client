#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Classroom package endpoint load test using only the Python standard library."""

from __future__ import annotations

import argparse
import statistics
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import List

try:
    import psutil
except ImportError:  # pragma: no cover - optional for standalone client machines
    psutil = None


DEFAULT_CLIENTS = 30


@dataclass
class RequestResult:
    ok: bool
    status: int
    duration_ms: float
    bytes_read: int
    error: str = ""


class ProcessResourceSampler:
    def __init__(self, pid: int, interval: float = 0.1) -> None:
        self.pid = pid
        self.interval = interval
        self.cpu_peak = 0.0
        self.rss_peak = 0
        self.error = ""
        self._stop = threading.Event()
        self._thread = threading.Thread(target=self._run, name="classroom-resource-sampler", daemon=True)

    def start(self) -> None:
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        self._thread.join(timeout=2)

    def _run(self) -> None:
        if psutil is None:
            self.error = "psutil is not installed"
            return
        try:
            process = psutil.Process(self.pid)
            process.cpu_percent(interval=None)
            while not self._stop.wait(self.interval):
                self.cpu_peak = max(self.cpu_peak, process.cpu_percent(interval=None))
                self.rss_peak = max(self.rss_peak, process.memory_info().rss)
        except (psutil.NoSuchProcess, psutil.AccessDenied) as exc:
            self.error = str(exc)
        except Exception as exc:  # noqa: BLE001
            self.error = str(exc)


def build_package_url(base_url: str, course_id: str, version: str) -> str:
    safe_course_id = urllib.parse.quote(course_id, safe="")
    safe_version = urllib.parse.quote(version, safe="")
    return f"{base_url.rstrip('/')}/api/classroom/package/{safe_course_id}/{safe_version}.zip"


def percentile(values: List[float], ratio: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    index = min(len(ordered) - 1, max(0, int(round((len(ordered) - 1) * ratio))))
    return ordered[index]


def fetch_package(url: str, timeout: float) -> RequestResult:
    started_at = time.perf_counter()
    request = urllib.request.Request(url, method="GET")
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            payload = response.read()
            duration_ms = (time.perf_counter() - started_at) * 1000.0
            status = getattr(response, "status", 200)
            is_zip = payload[:2] == b"PK"
            return RequestResult(
                ok=200 <= status < 300 and is_zip,
                status=status,
                duration_ms=duration_ms,
                bytes_read=len(payload),
                error="" if is_zip else "response is not a zip file",
            )
    except urllib.error.HTTPError as exc:
        duration_ms = (time.perf_counter() - started_at) * 1000.0
        return RequestResult(
            ok=False,
            status=exc.code,
            duration_ms=duration_ms,
            bytes_read=0,
            error=f"HTTP {exc.code}",
        )
    except Exception as exc:
        duration_ms = (time.perf_counter() - started_at) * 1000.0
        return RequestResult(
            ok=False,
            status=0,
            duration_ms=duration_ms,
            bytes_read=0,
            error=str(exc),
        )


def main() -> int:
    parser = argparse.ArgumentParser(description="Load test the classroom package endpoint with 30 concurrent clients.")
    parser.add_argument("--base-url", default="http://127.0.0.1:5123", help="Backend base URL")
    parser.add_argument("--course-id", "--course", dest="course_id", required=True, help="Published classroom course id")
    parser.add_argument("--version", default="1.0", help="Published classroom package version")
    parser.add_argument("--clients", type=int, default=DEFAULT_CLIENTS, help="Concurrent clients")
    parser.add_argument("--requests-per-client", type=int, default=1, help="Requests issued by each client")
    parser.add_argument("--timeout", type=float, default=120.0, help="Per-request timeout in seconds")
    parser.add_argument("--server-pid", type=int, help="Backend process PID to sample for CPU and RSS peaks")
    args = parser.parse_args()

    total_requests = args.clients * args.requests_per_client
    if args.clients <= 0 or args.requests_per_client <= 0:
        print("clients and requests-per-client must be positive integers", file=sys.stderr)
        return 2

    url = build_package_url(args.base_url, args.course_id, args.version)
    results: List[RequestResult] = []
    results_lock = threading.Lock()
    start_barrier = threading.Barrier(args.clients)

    def worker() -> None:
        try:
            start_barrier.wait(timeout=5)
        except threading.BrokenBarrierError:
            return
        for _ in range(args.requests_per_client):
            result = fetch_package(url, timeout=args.timeout)
            with results_lock:
                results.append(result)

    threads = [threading.Thread(target=worker, name=f"load-client-{index + 1}") for index in range(args.clients)]
    sampler = ProcessResourceSampler(args.server_pid) if args.server_pid else None
    started_at = time.perf_counter()
    if sampler:
        sampler.start()
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    if sampler:
        sampler.stop()
    total_duration = time.perf_counter() - started_at

    durations = [result.duration_ms for result in results]
    successes = [result for result in results if result.ok]
    failures = [result for result in results if not result.ok]
    total_bytes = sum(result.bytes_read for result in results)
    req_per_second = (len(results) / total_duration) if total_duration > 0 else 0.0

    print(f"URL: {url}")
    print(f"Clients: {args.clients}")
    print(f"Requests/client: {args.requests_per_client}")
    print(f"Completed: {len(results)}/{total_requests}")
    print(f"Success: {len(successes)}")
    print(f"Failure: {len(failures)}")
    print(f"Wall time: {total_duration:.3f}s")
    print(f"Throughput: {req_per_second:.2f} req/s")
    print(f"Bytes read: {total_bytes}")
    if sampler:
        print(f"Server PID: {sampler.pid}")
        print(f"Server CPU peak: {sampler.cpu_peak:.2f}%")
        print(f"Server RSS peak: {sampler.rss_peak / (1024 * 1024):.2f} MiB")
        if sampler.error:
            print(f"Server resource sampling: unavailable ({sampler.error})")
    else:
        print("Server resource sampling: not requested (pass --server-pid)")

    if durations:
        print(f"Latency avg: {statistics.mean(durations):.2f} ms")
        print(f"Latency p50: {percentile(durations, 0.50):.2f} ms")
        print(f"Latency p95: {percentile(durations, 0.95):.2f} ms")
        print(f"Latency p99: {percentile(durations, 0.99):.2f} ms")

    if failures:
        print("Failures:")
        for result in failures[:10]:
            print(f"  status={result.status} duration={result.duration_ms:.2f}ms error={result.error}")
        if len(failures) > 10:
            print(f"  ... {len(failures) - 10} more failures omitted")
        return 1

    if len(results) != total_requests:
        print("Some client threads did not complete all requests.", file=sys.stderr)
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
