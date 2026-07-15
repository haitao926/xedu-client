# Scratch Stage Sensing Design

## Goal

Make XEdu Scratch extensions act as continuous stage sensors: students enable a camera-backed capability and use Boolean and reporter blocks to control sprites, without passing image paths or manually invoking inference.

## Architecture

`xeduCamera` owns the shared Scratch video device and stage preview. A new shared stage-sensing session owns enabled AI tasks, captures the current camera frame at a bounded interval, and stores the newest successful result for each task. Task extensions only declare beginner-facing enable/status/reporter blocks and read their task result from that session.

The Scratch client sends a PNG data URL to the existing XEduHub execute route. The backend materializes the image in a request-scoped temporary file before running the existing task runtime, then deletes it after the response is assembled.

## Student Block Contract

- Camera: open/close camera, show preview on stage, set preview transparency.
- Each AI task: enable sensing, sensor ready, task-specific Boolean and reporter blocks.
- No task block accepts an image path, no generic result object is exposed, and no generic workflow/image/media/math/result extension is restored.
- K10 remains a named, command-oriented hardware extension.

## Initial Task Semantics

Classification reports label/confidence; object, face, body, and hand sensing report detection state, count, and semantic positions; OCR reports text; segmentation reports completion/count; depth reports readiness and sampled depth.

## Bounds And Safety

- One camera stream is shared by all sprites and enabled tasks.
- The session samples no more than once every 500 ms and does not overlap requests for the same task.
- Camera frames remain in memory on the client and are removed from backend temporary storage after each request.
- When camera permission or a model request fails, readiness stays false and reporters return neutral values instead of throwing inside a sprite script.
