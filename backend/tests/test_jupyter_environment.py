import sys
import unittest
from pathlib import Path
from unittest.mock import patch


BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from models.config import JupyterConfig
from services.jupyter_environment import build_jupyter_command


class JupyterDocumentSaveEnvironmentTestCase(unittest.TestCase):
    def test_launch_exposes_lab_app_for_current_document_saving(self):
        for use_notebook in (False, True):
            with self.subTest(use_notebook=use_notebook), patch(
                "services.jupyter_environment.resolve_micropython_labextensions_parent",
                return_value=None,
            ):
                command = build_jupyter_command(
                    JupyterConfig(use_notebook=use_notebook),
                    backend_python_executable=sys.executable,
                    project_root=BACKEND_DIR.parent,
                )

                self.assertEqual(
                    command.count("--LabApp.expose_app_in_browser=True"),
                    1,
                )
                self.assertIn("--ServerApp.ip=127.0.0.1", command)


if __name__ == "__main__":
    unittest.main()
