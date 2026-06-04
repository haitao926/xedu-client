from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path
from typing import Iterable


REPO_ROOT = Path(__file__).resolve().parents[2]
SAMPLE_ASSETS_CONFIG_PATH = REPO_ROOT / "config" / "sample-assets.json"


def _load_sample_assets_config() -> dict:
    with SAMPLE_ASSETS_CONFIG_PATH.open("r", encoding="utf-8") as handle:
        payload = json.load(handle)
    if not isinstance(payload, dict):
        raise ValueError("sample-assets config must be a JSON object")
    return payload


SAMPLE_ASSETS_CONFIG = _load_sample_assets_config()
BLOCKLY_SMOKE_CONFIG = SAMPLE_ASSETS_CONFIG.get("blocklySmoke", {}) if isinstance(SAMPLE_ASSETS_CONFIG.get("blocklySmoke"), dict) else {}

BLOCKLY_SMOKE_ROOT = str(BLOCKLY_SMOKE_CONFIG.get("root") or "courses/blockly-smoke")
BLOCKLY_SMOKE_IMAGE = str(BLOCKLY_SMOKE_CONFIG.get("image") or f"{BLOCKLY_SMOKE_ROOT}/demo.jpg")
BLOCKLY_SMOKE_VIDEO = str(BLOCKLY_SMOKE_CONFIG.get("video") or f"{BLOCKLY_SMOKE_ROOT}/demo.mp4")
BLOCKLY_SMOKE_AUDIO = str(BLOCKLY_SMOKE_CONFIG.get("audio") or f"{BLOCKLY_SMOKE_ROOT}/demo.wav")
BLOCKLY_SMOKE_VIDEO_POSTER = str(BLOCKLY_SMOKE_CONFIG.get("videoPoster") or f"{BLOCKLY_SMOKE_ROOT}/assets/xedu-test-scene-1.png")
BLOCKLY_SMOKE_CHECKPOINTS_ROOT = str(BLOCKLY_SMOKE_CONFIG.get("checkpointsRoot") or f"{BLOCKLY_SMOKE_ROOT}/checkpoints")

BLOCKLY_SMOKE_IMAGE_ALIASES = tuple(str(item) for item in (BLOCKLY_SMOKE_CONFIG.get("inputAliases") or {}).get("image", []))
BLOCKLY_SMOKE_VIDEO_ALIASES = tuple(str(item) for item in (BLOCKLY_SMOKE_CONFIG.get("inputAliases") or {}).get("video", []))
BLOCKLY_SMOKE_AUDIO_ALIASES = tuple(str(item) for item in (BLOCKLY_SMOKE_CONFIG.get("inputAliases") or {}).get("audio", []))
CHECKPOINT_ROOTS = tuple(str(item) for item in SAMPLE_ASSETS_CONFIG.get("checkpointRoots", []))


def repo_path(relative_path: str) -> Path:
    return (REPO_ROOT / str(relative_path or "").strip()).resolve()


def blockly_smoke_path(relative_path: str = "") -> Path:
    base = repo_path(BLOCKLY_SMOKE_ROOT)
    if not relative_path:
        return base
    return (base / relative_path).resolve()


def _runtime_assets_root() -> Path:
    writable_root = os.environ.get("XEDU_DATA_DIR") or os.environ.get("XEDU_CONFIG_DIR") or ""
    if writable_root:
        return (Path(writable_root).expanduser() / "runtime-assets").resolve()
    return (Path(tempfile.gettempdir()) / "xedu-client-runtime-assets").resolve()


def _write_generated_sample_image(target: Path) -> None:
    from PIL import Image, ImageDraw  # type: ignore

    target.parent.mkdir(parents=True, exist_ok=True)
    image = Image.new("RGB", (320, 240), color=(236, 241, 247))
    draw = ImageDraw.Draw(image)
    draw.rectangle((26, 24, 294, 216), outline=(73, 92, 122), width=4)
    draw.ellipse((132, 44, 188, 100), fill=(67, 87, 122))
    draw.rectangle((118, 108, 202, 188), fill=(92, 142, 207))
    draw.line((118, 130, 70, 170), fill=(42, 60, 90), width=8)
    draw.line((202, 130, 250, 170), fill=(42, 60, 90), width=8)
    draw.line((142, 188, 118, 224), fill=(42, 60, 90), width=8)
    draw.line((178, 188, 202, 224), fill=(42, 60, 90), width=8)
    image.save(target, format="JPEG", quality=90)


def ensure_blockly_smoke_image() -> Path | None:
    for candidate in (
        repo_path(BLOCKLY_SMOKE_IMAGE),
        repo_path("demo.jpg"),
    ):
        if candidate.exists():
            return candidate

    target = (_runtime_assets_root() / BLOCKLY_SMOKE_IMAGE).resolve()
    if target.exists():
        return target
    try:
        _write_generated_sample_image(target)
    except Exception:
        return None
    return target if target.exists() else None


def iter_checkpoint_roots() -> Iterable[Path]:
    seen: set[str] = set()
    env_roots = os.environ.get("XEDU_CHECKPOINT_DIRS") or os.environ.get("XEDU_CHECKPOINT_DIR") or ""
    for raw_root in env_roots.split(os.pathsep):
        text = str(raw_root or "").strip()
        if not text:
            continue
        resolved = Path(text).expanduser().resolve()
        key = str(resolved)
        if key in seen:
            continue
        seen.add(key)
        yield resolved

    for rel in CHECKPOINT_ROOTS:
        resolved = repo_path(rel)
        key = str(resolved)
        if key in seen:
            continue
        seen.add(key)
        yield resolved

    for rel in ("checkpoint", "backend/checkpoint"):
        resolved = repo_path(rel)
        key = str(resolved)
        if key in seen:
            continue
        seen.add(key)
        yield resolved


def resolve_checkpoint_file(filename: str) -> Path | None:
    candidate_name = str(filename or "").strip()
    if not candidate_name:
        return None

    for root in iter_checkpoint_roots():
        candidate = (root / candidate_name).resolve()
        if candidate.exists():
            return candidate

    preferred = repo_path(f"{BLOCKLY_SMOKE_CHECKPOINTS_ROOT}/{candidate_name}")
    if preferred.exists():
        return preferred
    return None
