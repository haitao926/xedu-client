import json
import os
from pathlib import Path
import shutil
import subprocess
import unittest


BACKEND_DIR = Path(__file__).resolve().parents[1]
BOOTSTRAP_SCRIPT = BACKEND_DIR / "utils" / "python_bootstrap.py"


class ExternalPython38CompatibilityTests(unittest.TestCase):
    def test_python38_runs_the_standalone_experiment_environment_probe(self):
        python38 = shutil.which("python3.8")
        if not python38:
            self.skipTest("python3.8 is not installed")

        result = subprocess.run(
            [python38, str(BOOTSTRAP_SCRIPT), "--inspect-xedu"],
            capture_output=True,
            text=True,
            env={**os.environ, "PYTHONPATH": str(BACKEND_DIR)},
            check=False,
        )

        self.assertEqual(result.returncode, 0, result.stderr or result.stdout)
        marker = next(
            line for line in result.stdout.splitlines()
            if line.startswith("__XEDU_BOOTSTRAP__=")
        )
        payload = json.loads(marker.split("=", 1)[1])
        self.assertTrue(payload["success"], payload)
        self.assertTrue(str(payload["python_version"]).startswith("3.8."), payload)

    def test_standalone_probe_does_not_import_the_flask_application(self):
        source = BOOTSTRAP_SCRIPT.read_text(encoding="utf-8")
        self.assertNotIn("from api.app", source)
        self.assertNotIn("import api.app", source)


if __name__ == "__main__":
    unittest.main()
