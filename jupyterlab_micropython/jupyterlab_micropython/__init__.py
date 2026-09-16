from pathlib import Path


_PACKAGE_ROOT = Path(__file__).parent


def _jupyter_labextension_paths():
    return [
        {
            "src": str(_PACKAGE_ROOT / "labextension"),
            "dest": "jupyterlab-micropython",
        }
    ]
