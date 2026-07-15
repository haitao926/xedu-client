"""Process-scoped authorization and strict browser-origin handling."""

from __future__ import annotations

import hmac
import os
import secrets
from collections.abc import Callable
from functools import wraps

from flask import Flask, Response, current_app, jsonify, request


CAPABILITY_HEADER = "X-XEdu-Client-Token"
PROCESS_SCOPES = frozenset(
    {
        "config:read",
        "config:write",
        "process:control",
        "python:run",
        "resource:read",
        "resource:write",
    }
)


def create_capability() -> str:
    """Create an unguessable credential for one backend process lifetime."""

    return secrets.token_urlsafe(32)


def configured_origins() -> frozenset[str]:
    """Return only explicitly configured browser origins."""

    raw_origins = os.environ.get("XEDU_ALLOWED_ORIGINS", "")
    return frozenset(origin.strip().rstrip("/") for origin in raw_origins.split(",") if origin.strip())


def is_allowed_origin(origin: str | None) -> bool:
    """Allow native-process requests and explicitly configured development Origins."""

    if origin is None:
        return True
    return origin.rstrip("/") in current_app.config["XEDU_ALLOWED_ORIGINS"]


def _unauthorized() -> tuple[Response, int]:
    return jsonify({"success": False, "message": "unauthorized"}), 401


def _forbidden() -> tuple[Response, int]:
    return jsonify({"success": False, "message": "forbidden"}), 403


def require_capability(scope: str) -> Callable:
    """Require the process credential and a declared method-level permission."""

    def decorator(view: Callable) -> Callable:
        @wraps(view)
        def wrapped(*args, **kwargs):
            if not is_allowed_origin(request.headers.get("Origin")):
                return _forbidden()

            capability = current_app.config["XEDU_PROCESS_CAPABILITY"]
            supplied = request.headers.get(CAPABILITY_HEADER, "")
            if not supplied or not hmac.compare_digest(supplied, capability):
                return _unauthorized()

            if scope not in current_app.config["XEDU_PROCESS_SCOPES"]:
                return _forbidden()
            return view(*args, **kwargs)

        return wrapped

    return decorator


def configure_security(app: Flask, capability: str | None = None) -> str:
    """Install the process capability and a CORS policy that never defaults to `*`."""

    process_capability = capability or os.environ.get("XEDU_CLIENT_CAPABILITY") or create_capability()
    app.config["XEDU_PROCESS_CAPABILITY"] = process_capability
    app.config["XEDU_PROCESS_SCOPES"] = PROCESS_SCOPES
    app.config["XEDU_ALLOWED_ORIGINS"] = configured_origins()

    @app.before_request
    def reject_untrusted_preflight():
        origin = request.headers.get("Origin")
        if request.method == "OPTIONS" and origin and not is_allowed_origin(origin):
            return _forbidden()
        return None

    @app.after_request
    def apply_allowed_origin(response: Response):
        origin = request.headers.get("Origin")
        if origin and is_allowed_origin(origin):
            response.headers["Access-Control-Allow-Origin"] = origin
            response.headers["Access-Control-Allow-Headers"] = "Content-Type, X-XEdu-Client-Token"
            response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
            response.headers["Vary"] = "Origin"
        return response

    return process_capability
