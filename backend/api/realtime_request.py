"""Request parsing policy for the camera realtime endpoint."""

from __future__ import annotations

from io import BytesIO

from flask import Request


REALTIME_PATH = "/api/resources/xeduhub/realtime"
REALTIME_MAX_REQUEST_BYTES = 1 * 1024 * 1024 + 96 * 1024


class RealtimeRequest(Request):
    """Keep realtime JPEG multipart bodies in memory without changing uploads."""

    @property
    def max_content_length(self):
        if self.path == REALTIME_PATH:
            return REALTIME_MAX_REQUEST_BYTES
        return super().max_content_length

    def _get_file_stream(
        self,
        total_content_length,
        content_type,
        filename=None,
        content_length=None,
    ):
        if self.path == REALTIME_PATH:
            return BytesIO()
        return super()._get_file_stream(
            total_content_length,
            content_type,
            filename,
            content_length,
        )
