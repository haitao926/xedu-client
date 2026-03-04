from __future__ import annotations

import base64
from pathlib import Path


def main() -> None:
    root = Path(__file__).resolve().parents[2]
    icon_path = root / "frontend/src/assets/icon.png"
    if not icon_path.exists():
        raise SystemExit(f"missing: {icon_path}")

    b64 = base64.b64encode(icon_path.read_bytes()).decode("ascii")
    svg = (
        '<svg width="120" height="120" viewBox="0 0 120 120" '
        'xmlns="http://www.w3.org/2000/svg">\n'
        f'  <image href="data:image/png;base64,{b64}" width="120" height="120" />\n'
        "</svg>\n"
    )

    targets = [
        root / "frontend/src/assets/logo-mark.svg",
        root / "docs/ui-template/project-template/src/assets/logo-mark.svg",
    ]
    for path in targets:
        path.write_text(svg, encoding="utf-8")
        print(f"updated {path}")


if __name__ == "__main__":
    main()
