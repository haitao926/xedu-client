#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path
import shutil

from PIL import Image, ImageDraw
import wave
import struct
import math


REPO_ROOT = Path(__file__).resolve().parents[1]
SMOKE_DIR = REPO_ROOT / "courses" / "blockly-smoke"
ROIL_DIR = REPO_ROOT / "output" / "roil-drawing"
SMOKE_ASSET_DIR = SMOKE_DIR / "assets"


def create_demo_image(target: Path) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    image = Image.new("RGB", (256, 256), (245, 247, 250))
    draw = ImageDraw.Draw(image)
    draw.rectangle((24, 24, 232, 232), outline=(63, 118, 207), width=6)
    draw.rectangle((72, 72, 184, 208), outline=(32, 32, 32), width=4, fill=(193, 218, 245))
    draw.ellipse((92, 80, 164, 152), fill=(247, 210, 127), outline=(48, 48, 48), width=3)
    draw.ellipse((108, 104, 118, 114), fill=(48, 48, 48))
    draw.ellipse((138, 104, 148, 114), fill=(48, 48, 48))
    draw.arc((112, 116, 144, 140), start=0, end=180, fill=(48, 48, 48), width=3)
    draw.line((128, 152, 128, 208), fill=(48, 48, 48), width=4)
    draw.line((128, 170, 92, 192), fill=(48, 48, 48), width=4)
    draw.line((128, 170, 164, 192), fill=(48, 48, 48), width=4)
    draw.line((128, 208, 100, 232), fill=(48, 48, 48), width=4)
    draw.line((128, 208, 156, 232), fill=(48, 48, 48), width=4)
    image.save(target, quality=92)


def create_demo_video(target: Path) -> None:
    try:
        import cv2  # type: ignore
        import numpy as np  # type: ignore
    except Exception:
        target.write_bytes(b"placeholder-video")
        return

    target.parent.mkdir(parents=True, exist_ok=True)
    width, height = 320, 240
    writer = cv2.VideoWriter(str(target), cv2.VideoWriter_fourcc(*"mp4v"), 8, (width, height))
    for idx in range(24):
        frame = np.full((height, width, 3), 248, dtype=np.uint8)
        cv2.rectangle(frame, (40 + idx, 30), (220 + idx, 210), (68, 124, 255), 3)
        cv2.circle(frame, (96 + idx, 170), 28, (57, 181, 74), -1)
        cv2.putText(frame, "XEDU demo", (90, 40), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (48, 48, 48), 2)
        writer.write(frame)
    writer.release()


def create_demo_audio(target: Path) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    sample_rate = 16000
    duration_seconds = 1.0
    frequency = 440.0
    samples = int(sample_rate * duration_seconds)
    with wave.open(str(target), "wb") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(sample_rate)
        for index in range(samples):
            value = int(32767.0 * math.sin(2.0 * math.pi * frequency * (index / sample_rate)))
            handle.writeframes(struct.pack("<h", value))


def sync_roil_images() -> None:
    SMOKE_ASSET_DIR.mkdir(parents=True, exist_ok=True)
    for name in (
        "xedu-test-scene-1.png",
        "xedu-test-ocr-1.png",
        "xedu-test-seg-depth-1.png",
    ):
        source = ROIL_DIR / name
        target = SMOKE_ASSET_DIR / name
        if source.exists():
            shutil.copy2(source, target)


def main() -> int:
    create_demo_image(SMOKE_DIR / "demo.jpg")
    create_demo_video(SMOKE_DIR / "demo.mp4")
    create_demo_audio(SMOKE_DIR / "demo.wav")
    sync_roil_images()
    print(f"Seeded smoke media assets in {SMOKE_DIR}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
