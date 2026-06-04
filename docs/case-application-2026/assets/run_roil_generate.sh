#!/usr/bin/env bash
set -euo pipefail

NBS="/Users/apple/Documents/GitHub/nano-banana-studio/nbs"
OUT_DIR="/Users/apple/Documents/GitHub/xedu-client/docs/case-application-2026/assets"

mkdir -p "$OUT_DIR"

"$NBS" image generate \
  --model gpt-image-2-all \
  --size 1536x1024 \
  --quality high \
  --style vivid \
  --optimize \
  --output "$OUT_DIR/p2_problem_scene.png" \
  --prompt "$(cat "$OUT_DIR/p2_problem_scene.prompt.txt")"

"$NBS" image generate \
  --model gpt-image-2-all \
  --size 1536x1024 \
  --quality high \
  --style vivid \
  --optimize \
  --output "$OUT_DIR/p3_learning_loop.png" \
  --prompt "$(cat "$OUT_DIR/p3_learning_loop.prompt.txt")"

"$NBS" image generate \
  --model gpt-image-2-all \
  --size 1536x1024 \
  --quality high \
  --style vivid \
  --optimize \
  --output "$OUT_DIR/p6_classroom_flow.png" \
  --prompt "$(cat "$OUT_DIR/p6_classroom_flow.prompt.txt")"

"$NBS" image generate \
  --model gpt-image-2-all \
  --size 1536x1024 \
  --quality high \
  --style vivid \
  --optimize \
  --output "$OUT_DIR/p9_closing_bg.png" \
  --prompt "$(cat "$OUT_DIR/p9_closing_bg.prompt.txt")"

echo "Done. Outputs saved under: $OUT_DIR"
