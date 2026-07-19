import importlib.util
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


REPO_DIR = Path(__file__).resolve().parents[2]
SCRIPT_PATH = REPO_DIR / "scripts" / "setup_portable_python.py"

spec = importlib.util.spec_from_file_location("setup_portable_python", SCRIPT_PATH)
setup_portable_python = importlib.util.module_from_spec(spec)
assert spec and spec.loader
spec.loader.exec_module(setup_portable_python)


class SetupPortablePythonTestCase(unittest.TestCase):
    def test_windows_xedu_spec_is_pinned_to_latest_2_0_0(self):
        self.assertEqual(setup_portable_python.XEDU_PYTHON_SPEC, "xedu-python==2.0.0")
        self.assertEqual(setup_portable_python.NO_DEPS_REQUIREMENT_SPECS, ("xedu-python==2.0.0",))

    def test_validate_windows_xedu_runtime_rejects_stale_xedu_metadata(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            env_dir = Path(temp_dir)
            version_dir = env_dir / "Lib" / "site-packages" / "XEdu"
            version_dir.mkdir(parents=True, exist_ok=True)
            (version_dir / "version.py").write_text("__version__='0.0.1'\n", encoding="utf-8")
            dist_info = env_dir / "Lib" / "site-packages" / "XEdu_python-0.0.1.dist-info"
            dist_info.mkdir(parents=True, exist_ok=True)
            (dist_info / "METADATA").write_text("Name: XEdu-python\nVersion: 0.0.1\n", encoding="utf-8")

            with self.assertRaises(RuntimeError):
                setup_portable_python.validate_windows_xedu_runtime(env_dir)

    def test_validate_windows_xedu_runtime_accepts_200_metadata(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            env_dir = Path(temp_dir)
            version_dir = env_dir / "Lib" / "site-packages" / "XEdu"
            version_dir.mkdir(parents=True, exist_ok=True)
            (version_dir / "version.py").write_text("__version__='2.0.0'\n", encoding="utf-8")
            dist_info = env_dir / "Lib" / "site-packages" / "xedu_python-2.0.0.dist-info"
            dist_info.mkdir(parents=True, exist_ok=True)
            (dist_info / "METADATA").write_text("Name: xedu-python\nVersion: 2.0.0\n", encoding="utf-8")

            setup_portable_python.validate_windows_xedu_runtime(env_dir)

    def test_patch_xedu_metadata_removes_only_stale_modern_profile_bounds(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            env_dir = Path(temp_dir)
            site_packages = env_dir / "Lib" / "site-packages"
            dist_info = site_packages / "xedu_python-2.0.0.dist-info"
            dist_info.mkdir(parents=True, exist_ok=True)
            (site_packages / "XEdu").mkdir(parents=True, exist_ok=True)
            metadata = "\n".join([
                "Name: xedu-python",
                "Version: 2.0.0",
                "Requires-Dist: onnxruntime <1.16.0",
                "Requires-Dist: pillow <=9.5.0",
                "Requires-Dist: requests",
                "",
            ])
            (dist_info / "METADATA").write_text(metadata, encoding="utf-8")
            (dist_info / "RECORD").write_text(
                "xedu_python-2.0.0.dist-info/METADATA,,\n",
                encoding="utf-8",
            )

            self.assertTrue(setup_portable_python.patch_xedu_python_metadata(env_dir, "windows-x64"))
            patched = (dist_info / "METADATA").read_text(encoding="utf-8")
            self.assertNotIn("\nRequires-Dist: onnxruntime <1.16.0\n", patched)
            self.assertNotIn("\nRequires-Dist: pillow <=9.5.0\n", patched)
            self.assertIn("Requires-Dist: requests", patched)
            self.assertIn(setup_portable_python.XEDU_METADATA_MARKER, patched)
            record = (dist_info / "RECORD").read_text(encoding="utf-8")
            self.assertIn("sha256=", record)
            self.assertIn(str(len(patched.encode("utf-8"))), record)

    def test_patch_xedu_metadata_rejects_missing_runtime(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            with self.assertRaises(RuntimeError):
                setup_portable_python.patch_xedu_python_metadata(Path(temp_dir), "windows-x64")

    def test_download_windows_wheels_refreshes_wheelhouse_before_fetching(self):
        with tempfile.TemporaryDirectory() as temp_dir, tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False) as handle:
            req_path = Path(handle.name)
            handle.write("xedu-python==2.0.0\n")
            handle.flush()
            wheelhouse = Path(temp_dir) / "wheelhouse_win"
            wheelhouse.mkdir(parents=True, exist_ok=True)
            (wheelhouse / "stale.whl").write_text("old", encoding="utf-8")

            with patch.object(setup_portable_python, "run") as mock_run:
                setup_portable_python.download_windows_wheels(req_path, wheelhouse)

            self.assertFalse((wheelhouse / "stale.whl").exists())
            self.assertTrue(mock_run.called)
            self.assertTrue(any("xedu-python==2.0.0" in " ".join(map(str, call.args[0])) for call in mock_run.call_args_list))


if __name__ == "__main__":
    unittest.main()
