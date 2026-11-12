import hashlib
import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest import mock


TESTS_DIR = Path(__file__).resolve().parent
SCRIPT = (
    TESTS_DIR.parent
    / "skills"
    / "xedu-package-course"
    / "scripts"
    / "xedu_package.py"
)


def load_module():
    spec = importlib.util.spec_from_file_location("xedu_package", SCRIPT)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Unable to load {SCRIPT}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


package = load_module()


def write_scratch(path, project):
    with zipfile.ZipFile(path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("project.json", json.dumps(project))


class PackageTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)

    def tearDown(self):
        self.temp.cleanup()

    def create_course(self):
        course = self.root / "course"
        resource = course / "lesson1" / "exp1"
        resource.mkdir(parents=True)
        (resource / "index.html").write_text("<h1>XEdu</h1>", encoding="utf-8")
        (course / "unused.txt").write_text("unused", encoding="utf-8")
        (course / "course.json").write_text(
            json.dumps(
                {
                    "id": "demo",
                    "title": "Demo",
                    "version": "1.2.3",
                    "sections": [
                        {
                            "experiments": [
                                {
                                    "id": "exp1",
                                    "title": "Experiment 1",
                                    "files": [
                                        {"path": "lesson1/exp1/index.html", "type": "html"}
                                    ],
                                }
                            ]
                        }
                    ],
                }
            ),
            encoding="utf-8",
        )
        return course

    def test_inspect_and_build_include_only_referenced_files(self):
        course = self.create_course()
        report = package.inspect_course(course)
        self.assertEqual(
            report["package_files"],
            ["course.json", "lesson1/exp1/index.html"],
        )

        output = self.root / "demo.zip"
        package.build_course(course, output)
        with zipfile.ZipFile(output) as archive:
            self.assertEqual(
                sorted(archive.namelist()),
                ["course.json", "lesson1/exp1/index.html"],
            )

    def test_inspect_includes_declared_entry_even_when_not_listed_in_files(self):
        course = self.create_course()
        data = json.loads((course / "course.json").read_text(encoding="utf-8"))
        experiment = data["sections"][0]["experiments"][0]
        experiment["files"] = []
        experiment["entry"] = "lesson1/exp1/index.html"
        (course / "course.json").write_text(json.dumps(data), encoding="utf-8")

        report = package.inspect_course(course)

        self.assertIn("lesson1/exp1/index.html", report["package_files"])
        status = report["resource_status_by_experiment"][0]
        self.assertEqual(status["id"], "exp1")
        self.assertEqual(status["status"], "resources-present")
        self.assertEqual(report["missing_assets"], [])

    def test_missing_or_unsafe_entry_blocks_staging(self):
        course = self.create_course()
        data = json.loads((course / "course.json").read_text(encoding="utf-8"))
        experiment = data["sections"][0]["experiments"][0]
        experiment["entry"] = "lesson1/exp1/missing.ipynb"
        (course / "course.json").write_text(json.dumps(data), encoding="utf-8")
        with self.assertRaisesRegex(package.PackageError, "Referenced resources do not exist"):
            package.stage_course(course, self.root / "missing-stage")

        experiment["entry"] = "../outside.ipynb"
        (course / "course.json").write_text(json.dumps(data), encoding="utf-8")
        with self.assertRaisesRegex(package.PackageError, "Unsafe resource path"):
            package.inspect_course(course)

    def test_inspect_reports_missing_assets_and_stops_next_action(self):
        course = self.create_course()
        data = json.loads((course / "course.json").read_text(encoding="utf-8"))
        data["sections"][0]["experiments"][0]["entry"] = "lesson1/exp1/missing.ipynb"
        (course / "course.json").write_text(json.dumps(data), encoding="utf-8")

        report = package.inspect_course(course)

        self.assertEqual(report["missing_assets"], ["lesson1/exp1/missing.ipynb"])
        self.assertEqual(report["recommended_next_action"], "stop_with_gaps")

    def test_cli_build_emits_json_with_package_hash_and_verification(self):
        course = self.create_course()
        output = self.root / "cli-build" / "demo.zip"
        completed = subprocess.run(
            [
                sys.executable,
                str(SCRIPT),
                "build",
                "--course-root",
                str(course),
                "--output",
                str(output),
            ],
            capture_output=True,
            text=True,
            check=False,
        )

        self.assertEqual(completed.returncode, 0, completed.stderr)
        report = json.loads(completed.stdout)
        self.assertEqual(report["built_path"], str(output.resolve()))
        self.assertEqual(report["sha256"], hashlib.sha256(output.read_bytes()).hexdigest())
        self.assertEqual(report["verification"]["status"], "passed")

    def test_stage_creates_output_parent_and_preserves_source(self):
        course = self.create_course()
        source_json = (course / "course.json").read_bytes()
        output = self.root / "not-yet-created" / "stage"

        report = package.stage_course(course, output)

        self.assertEqual(report["staged_path"], str(output.resolve()))
        self.assertTrue((output / "course.json").is_file())
        self.assertTrue((output / "lesson1/exp1/index.html").is_file())
        self.assertEqual((course / "course.json").read_bytes(), source_json)

    def test_stage_refuses_output_inside_authoring_course(self):
        course = self.create_course()
        with self.assertRaises(package.PackageError):
            package.stage_course(course, course / "_xedu_pack")

    def test_build_is_deterministic_and_reports_verification(self):
        course = self.create_course()
        first = self.root / "a" / "course.zip"
        second = self.root / "b" / "course.zip"

        report_a = package.build_course(course, first)
        report_b = package.build_course(course, second)

        self.assertEqual(first.read_bytes(), second.read_bytes())
        self.assertEqual(
            report_a["sha256"],
            hashlib.sha256(first.read_bytes()).hexdigest(),
        )
        self.assertEqual(report_a["sha256"], report_b["sha256"])
        self.assertEqual(report_a["verification"]["status"], "passed")
        self.assertEqual(report_a["version"], "1.2.3")
        self.assertEqual(
            report_a["version_policy"],
            "preserved; packaging does not increment or rewrite course.json version",
        )
        with zipfile.ZipFile(first) as archive:
            packaged_course = json.loads(archive.read("course.json").decode("utf-8"))
        self.assertEqual(packaged_course["version"], "1.2.3")

    def test_inspect_accepts_built_zip_and_reports_package_hash(self):
        course = self.create_course()
        output = self.root / "course.zip"
        package.build_course(course, output)

        report = package.inspect_input(output)

        self.assertEqual(report["input_type"], "pack-output")
        self.assertEqual(report["verification"]["status"], "passed")
        self.assertEqual(report["unreferenced_files"], [])
        self.assertEqual(report["recommended_next_action"], "publish")
        self.assertEqual(report["package_sha256"], hashlib.sha256(output.read_bytes()).hexdigest())

    def test_inspect_zip_reports_missing_and_unreferenced_resources(self):
        course = self.create_course()
        data = json.loads((course / "course.json").read_text(encoding="utf-8"))
        data["sections"][0]["experiments"][0]["entry"] = "lesson1/exp1/missing.ipynb"
        (course / "course.json").write_text(json.dumps(data), encoding="utf-8")
        output = self.root / "incomplete.zip"
        with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            archive.writestr("course.json", (course / "course.json").read_bytes())
            archive.writestr("lesson1/exp1/index.html", (course / "lesson1/exp1/index.html").read_bytes())
            archive.writestr("unused.txt", "not referenced")

        report = package.inspect_package(output)

        self.assertEqual(report["missing_assets"], ["lesson1/exp1/missing.ipynb"])
        self.assertEqual(report["unreferenced_files"], ["unused.txt"])
        self.assertEqual(report["verification"]["status"], "failed")
        self.assertEqual(report["recommended_next_action"], "stop_with_gaps")

    def test_inspect_zip_rejects_unsafe_members(self):
        output = self.root / "unsafe.zip"
        with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            archive.writestr("course.json", json.dumps({"title": "Unsafe", "sections": []}))
            archive.writestr("../outside.txt", "unsafe")
        with self.assertRaisesRegex(package.PackageError, "Unsafe course package member"):
            package.inspect_package(output)

    def test_inspect_zip_rejects_file_directory_path_conflicts(self):
        output = self.root / "conflict.zip"
        with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            archive.writestr("course.json", json.dumps({"title": "Conflict", "sections": []}))
            archive.writestr("assets", "not a directory")
            archive.writestr("assets/", b"")
            archive.writestr("assets/image.png", b"not actually an image")
        with self.assertRaisesRegex(package.PackageError, "file/directory path conflicts"):
            package.inspect_package(output)

    def test_build_rejects_zip_with_bad_member(self):
        course = self.create_course()
        output = self.root / "course.zip"
        with mock.patch.object(package.zipfile.ZipFile, "testzip", return_value="course.json"):
            with self.assertRaisesRegex(package.PackageError, "ZIP integrity check failed"):
                package.build_course(course, output)
        self.assertFalse(output.exists())

    def test_rejects_unsafe_reference(self):
        course = self.create_course()
        data = json.loads((course / "course.json").read_text(encoding="utf-8"))
        data["sections"][0]["experiments"][0]["files"][0]["path"] = "../secret"
        (course / "course.json").write_text(json.dumps(data), encoding="utf-8")
        with self.assertRaises(package.PackageError):
            package.inspect_course(course)

    def test_scratch_audit_blocks_unknown_opcodes(self):
        project_path = self.root / "project.ib"
        write_scratch(
            project_path,
            {
                "targets": [
                    {
                        "blocks": {
                            "a": {"opcode": "event_whenflagclicked"},
                            "b": {"opcode": "innolabAiTraining_loadModel"},
                        }
                    }
                ],
                "extensions": ["innolabAiTraining"],
            },
        )
        catalog = self.root / "catalog.json"
        catalog.write_text(json.dumps({"extensions": {}}), encoding="utf-8")

        report = package.scratch_audit(project_path, catalog, None)
        rows = {row["source_opcode"]: row for row in report["opcodes"]}
        self.assertFalse("unsupported" in rows["event_whenflagclicked"]["classifications"])
        self.assertIn("unsupported", rows["innolabAiTraining_loadModel"]["classifications"])
        self.assertTrue(report["blocking"])

    def test_scratch_audit_accepts_evidence_backed_mapping(self):
        project_path = self.root / "project.ib"
        write_scratch(
            project_path,
            {
                "targets": [{"blocks": {"a": {"opcode": "source_enable"}}}],
                "extensions": ["source"],
            },
        )
        catalog = self.root / "catalog.json"
        catalog.write_text(
            json.dumps(
                {
                    "extensions": {
                        "xeduCamera": {
                            "opcodes": ["xeduCamera_enableCamera"],
                            "runtime_dependencies": ["camera-permission"],
                        }
                    }
                }
            ),
            encoding="utf-8",
        )
        mappings = self.root / "mappings.json"
        mappings.write_text(
            json.dumps(
                {
                    "mappings": {
                        "source_enable": {
                            "target_opcodes": ["xeduCamera_enableCamera"],
                            "conditions": ["same enable behavior"],
                            "runtime_dependencies": ["camera-permission"],
                            "evidence": "current XEdu camera descriptor",
                        }
                    }
                }
            ),
            encoding="utf-8",
        )

        report = package.scratch_audit(project_path, catalog, mappings)
        self.assertFalse(report["blocking"])
        self.assertEqual(
            report["opcodes"][0]["classifications"],
            ["renamed-mappable", "runtime-dependency"],
        )


if __name__ == "__main__":
    unittest.main()
