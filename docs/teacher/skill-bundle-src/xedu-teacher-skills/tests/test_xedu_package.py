import importlib.util
import json
import tempfile
import unittest
import zipfile
from pathlib import Path


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
                    "sections": [
                        {
                            "experiments": [
                                {
                                    "files": [
                                        {"path": "lesson1/exp1/index.html", "type": "html"}
                                    ]
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

    def test_stage_refuses_output_inside_authoring_course(self):
        course = self.create_course()
        with self.assertRaises(package.PackageError):
            package.stage_course(course, course / "_xedu_pack")

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
