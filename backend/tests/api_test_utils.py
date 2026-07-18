from pathlib import Path

from flask import Flask
from flask.testing import FlaskClient
from werkzeug.datastructures import Headers

from api.resource_runtime import issue_resource_handle, register_resource_root


class CapabilityFlaskClient(FlaskClient):
    """Exercise business routes through the same capability contract as Electron."""

    def open(self, *args, **kwargs):
        headers = Headers(kwargs.pop("headers", None))
        headers.setdefault(
            "X-XEdu-Client-Token",
            self.application.config["XEDU_PROCESS_CAPABILITY"],
        )
        return super().open(*args, headers=headers, **kwargs)


def authorized_test_client(app: Flask) -> CapabilityFlaskClient:
    app.test_client_class = CapabilityFlaskClient
    return app.test_client()


def issue_test_resource_handle(
    app: Flask,
    root: Path,
    relative_path: str = "",
    operation: str = "read",
) -> str:
    with app.app_context():
        root_id = register_resource_root(root, "test-course", "backend-test")
        return issue_resource_handle(root_id, relative_path, operation)
