# -*- coding: utf-8 -*-

from __future__ import annotations

import math
import os
import tempfile
import time
from pathlib import Path
from typing import Any

from .sample_assets import (
    BLOCKLY_SMOKE_VIDEO,
    BLOCKLY_SMOKE_VIDEO_ALIASES,
    BLOCKLY_SMOKE_VIDEO_POSTER,
    repo_path,
)

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_SAMPLE_VIDEO = BLOCKLY_SMOKE_VIDEO
DEFAULT_SAMPLE_VIDEO_IMAGE = BLOCKLY_SMOKE_VIDEO_POSTER
DEFAULT_SAMPLE_VIDEO_ALIASES = set(BLOCKLY_SMOKE_VIDEO_ALIASES)


def _result_note_payload(kind: str, **payload):
    data = {"kind": kind}
    data.update(payload)
    return data


class XEduStreamError(RuntimeError):
    def __init__(self, code: str, message: str, *, stream_kind: str = "", detail: str = ""):
        super().__init__(message)
        self.code = str(code or "stream_error").strip() or "stream_error"
        self.stream_kind = str(stream_kind or "").strip()
        self.detail = str(detail or "").strip()


def xedu_emit_runtime_event(event_type: str, **payload):
    data = {"type": str(event_type or "").strip() or "event"}
    for key, value in payload.items():
        if value is None:
            continue
        data[key] = value
    print(f"__XEDU_RUNTIME__={data!r}")
    return data


class XEduCamera:
    def __init__(self, source: Any, window_name: str = "video", *, stream_kind: str = "camera"):
        import cv2

        self.requested_source = source
        self.stream_kind = str(stream_kind or "camera")
        self.window_name = window_name
        self._temp_video_path = ""
        self._source_mode = "capture"
        self.source = self._normalize_source(source, stream_kind=stream_kind)
        self.cap = cv2.VideoCapture(self.source)
        self._opened = bool(self.cap.isOpened())
        self._closed = False
        self._last_read_ok = False
        self._last_failure_code = ""
        self._last_failure_message = ""
        self._last_detail = ""

        if not self._opened:
            self._set_failure(self._guess_open_failure_code(), self._guess_open_failure_message())
            raise XEduStreamError(
                self._last_failure_code,
                self._last_failure_message,
                stream_kind=self.stream_kind,
                detail=self._last_detail,
            )
        xedu_emit_runtime_event(
            "stream_opened",
            stream_kind=self.stream_kind,
            source=self._source_label(),
            window=self.window_name,
            source_mode=self._source_mode,
        )

    @classmethod
    def camera(cls, index: int = 0, window_name: str = "video") -> "XEduCamera":
        return cls(index, window_name, stream_kind="camera")

    @classmethod
    def video(cls, path: str, window_name: str = "video") -> "XEduCamera":
        return cls(path, window_name, stream_kind="video")

    def is_opened(self) -> bool:
        return bool(self.cap.isOpened()) and not self._closed

    def describe_source(self) -> dict[str, Any]:
        return {
            "stream_kind": self.stream_kind,
            "source": self._source_label(),
            "window_name": self.window_name,
            "opened": self._opened and not self._closed,
        }

    def get_failure_info(self) -> dict[str, str]:
        return {
            "code": self._last_failure_code,
            "message": self._last_failure_message,
            "detail": self._last_detail,
            "stream_kind": self.stream_kind,
            "source": self._source_label(),
        }

    def read(self):
        if self._closed:
            self._set_failure("stream_closed", "视频流已关闭")
            return None
        ok, frame = self.cap.read()
        if not ok and self._loop_on_eof and self.stream_kind == "video":
            try:
                import cv2

                self.cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
            except Exception:
                pass
            ok, frame = self.cap.read()
        self._last_read_ok = bool(ok)
        if ok:
            return frame

        if self.stream_kind == "video":
            self._set_failure("stream_ended", "视频播放结束")
        else:
            self._set_failure("stream_read_failed", "摄像头读取失败")
        return None

    def show(self, frame) -> None:
        import cv2

        cv2.imshow(self.window_name, frame)

    def should_quit(self, key: str = "q", delay: int = 1) -> bool:
        import cv2

        pressed = cv2.waitKey(delay) & 0xFF
        if pressed == ord(key):
            self._set_failure("user_stopped", "用户手动停止视频流")
            return True
        try:
            visible = cv2.getWindowProperty(self.window_name, cv2.WND_PROP_VISIBLE)
            if visible < 1:
                self._set_failure("window_closed", "视频窗口已关闭")
                return True
        except Exception:
            pass
        return False

    def close(self) -> None:
        import cv2

        if self._closed:
            return
        self._closed = True
        try:
            self.cap.release()
        except Exception:
            pass
        try:
            cv2.destroyWindow(self.window_name)
        except Exception:
            try:
                cv2.destroyAllWindows()
            except Exception:
                pass
        if self._temp_video_path:
            try:
                Path(self._temp_video_path).unlink(missing_ok=True)
            except Exception:
                pass
        xedu_emit_runtime_event(
            "stream_closed",
            stream_kind=self.stream_kind,
            source=self._source_label(),
            reason=self._last_failure_code or ("stream_ended" if self.stream_kind == "video" and not self._last_read_ok else ""),
        )

    def _source_label(self) -> str:
        return str(self.requested_source if self.requested_source not in (None, "") else self.source)

    def _normalize_source(self, source: Any, *, stream_kind: str = "") -> Any:
        if str(stream_kind or "") != "video":
            return source
        raw = str(source or "").strip()
        if not raw:
            return source
        normalized = raw.replace("\\", "/").strip()
        if self._should_materialize_demo_video(normalized):
            materialized = self._materialize_demo_video_from_image()
            if materialized:
                self._source_mode = "generated_demo_video"
                self._temp_video_path = materialized
                return materialized
        path = Path(raw).expanduser()
        if path.is_absolute():
            return str(path)
        resolved = (Path.cwd() / path).resolve()
        if resolved.exists():
            return str(resolved)
        fallback = repo_path(DEFAULT_SAMPLE_VIDEO)
        if fallback.exists() and normalized == "demo.mp4":
            return str(fallback)
        return str(resolved)

    def _should_materialize_demo_video(self, normalized_source: str) -> bool:
        return normalized_source in DEFAULT_SAMPLE_VIDEO_ALIASES

    def _materialize_demo_video_from_image(self) -> str:
        import cv2

        sample_image = repo_path(DEFAULT_SAMPLE_VIDEO_IMAGE)
        if not sample_image.exists():
            return ""
        frame = cv2.imread(str(sample_image))
        if frame is None:
            return ""

        temp_dir = Path(tempfile.gettempdir()) / "xedu-client-runtime"
        temp_dir.mkdir(parents=True, exist_ok=True)
        output_path = temp_dir / f"xedu-demo-stream-{os.getpid()}.mp4"
        fourcc = cv2.VideoWriter_fourcc(*"mp4v")
        fps = 8
        frame_count = fps * 2
        height, width = frame.shape[:2]
        writer = cv2.VideoWriter(str(output_path), fourcc, fps, (width, height))
        if not writer.isOpened():
            return ""
        try:
            for _ in range(frame_count):
                writer.write(frame)
        finally:
            writer.release()
        return str(output_path)

    def _set_failure(self, code: str, message: str, detail: str = "") -> None:
        self._last_failure_code = str(code or "").strip()
        self._last_failure_message = str(message or "").strip()
        self._last_detail = str(detail or "").strip()

    def _guess_open_failure_code(self) -> str:
        if self.stream_kind == "camera":
            return "stream_open_failed"
        return "stream_open_failed"

    def _guess_open_failure_message(self) -> str:
        if self.stream_kind == "camera":
            detail = "请检查系统摄像头权限、设备占用情况以及摄像头索引。"
            self._last_detail = detail
            return "无法打开摄像头视频流"
        detail = "请检查视频文件路径、格式和解码环境。课堂样例 demo.mp4 会优先由静态图片生成视频流。"
        self._last_detail = detail
        return "无法打开本地视频文件"


def xedu_draw_boxes(image, boxes, color=(0, 255, 0), thickness: int = 2):
    import cv2

    if image is None or not boxes:
        return image
    canvas = image.copy() if hasattr(image, "copy") else image
    for box in boxes:
        if not box or len(box) < 4:
            continue
        x1, y1, x2, y2 = box[:4]
        cv2.rectangle(canvas, (int(x1), int(y1)), (int(x2), int(y2)), color, thickness)
    return canvas


def xedu_cv_crop(image, x, y, width, height):
    if image is None:
        return image
    x0 = max(0, int(x))
    y0 = max(0, int(y))
    x1 = x0 + max(1, int(width))
    y1 = y0 + max(1, int(height))
    return image[y0:y1, x0:x1]


def xedu_decode_chunk_image(chunk):
    import cv2
    import numpy as np

    data = np.frombuffer(chunk, dtype=np.uint8)
    return cv2.imdecode(data, cv2.IMREAD_COLOR)


def xedu_frames_to_video(output_dir: str, output_video_path: str, fps: int = 30) -> None:
    import cv2

    result_files = sorted(
        os.path.join(output_dir, filename)
        for filename in os.listdir(output_dir)
        if filename.endswith(".jpg")
    )
    if not result_files:
        raise ValueError("未找到可合成的视频帧")
    first_frame = cv2.imread(result_files[0])
    frame_height, frame_width, _ = first_frame.shape
    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    out = cv2.VideoWriter(output_video_path, fourcc, fps, (frame_width, frame_height))
    for image_path in result_files:
        frame = cv2.imread(image_path)
        out.write(frame)
    out.release()


def xedu_send_command(base_url: str, cmd: str, stop_cmd: str = "S", delay: float = 0.3):
    import requests

    response = requests.get(f"{base_url}{cmd}")
    if delay and stop_cmd:
        time.sleep(delay)
        requests.get(f"{base_url}{stop_cmd}")
    return response


def xedu_split_result(value):
    if isinstance(value, tuple):
        if len(value) >= 2:
            return value[0], value[1]
        if len(value) == 1:
            return value[0], None
    return value, None


def xedu_first_box(result):
    if isinstance(result, list) and len(result) > 0:
        return result[0]
    return None


def xedu_bbox_center_x(box) -> int:
    if not box or len(box) < 4:
        return 0
    return int((box[0] + box[2]) / 2)


def xedu_keypoint_axis(points, index, axis: str = "x"):
    if not points or int(index) >= len(points):
        return 0
    point = points[int(index)]
    if not point or len(point) < 2:
        return 0
    return point[0] if axis == "x" else point[1]


def xedu_first_text(result) -> str:
    if not isinstance(result, list) or len(result) == 0:
        return ""
    first = result[0]
    if isinstance(first, (list, tuple)) and len(first) > 0:
        return str(first[0])
    return str(first)


def xedu_show_result_card(result, title: str = "运行结果"):
    return _result_note_payload("result_card", title=str(title or "运行结果"), result=result)


def xedu_show_result_image(image=None, title: str = "结果图"):
    return _result_note_payload("result_image", title=str(title or "结果图"), image=image)


def xedu_record_conclusion(note: str = "教学结论已记录", result=None):
    return _result_note_payload("record_note", note=str(note or "教学结论已记录"), result=result)


def xedu_clear_result():
    return _result_note_payload("clear_result")


def xedu_distance(x1, y1, x2, y2) -> int:
    return int(math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2))


def xedu_quadratic_eval(coeffs, x):
    return coeffs[0] * x ** 2 + coeffs[1] * x + coeffs[2]
