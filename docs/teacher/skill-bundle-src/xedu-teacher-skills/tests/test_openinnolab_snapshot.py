import hashlib
import importlib.util
import json
import stat
import tempfile
import unittest
import zipfile
from pathlib import Path


TESTS_DIR = Path(__file__).resolve().parent
SKILL_DIR = TESTS_DIR.parent / "skills" / "xedu-fetch-project"
SCRIPT_PATH = SKILL_DIR / "scripts" / "openinnolab_snapshot.py"
FIXTURES_DIR = TESTS_DIR / "fixtures"


def load_snapshot_module():
    spec = importlib.util.spec_from_file_location("openinnolab_snapshot", SCRIPT_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Unable to load {SCRIPT_PATH}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


snapshot = load_snapshot_module()


NOTEBOOK_URL = (
    "https://www.openinnolab.org.cn/pjlab/project?"
    "id=68864154fbfda12af0d7cf44&backpath=/pjedu/userprofile?slideKey=project"
)
SCRATCH_URL = (
    "https://www.openinnolab.org.cn/lab/project-standalone/"
    "senseinnoblocks/?id=6a5ec62657d9265a66252660"
)


def write_ib(path, project=None, extra_members=None):
    project = project or {"targets": [], "extensions": []}
    with zipfile.ZipFile(path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("project.json", json.dumps(project))
        for name, content in extra_members or []:
            archive.writestr(name, content)


def notebook_document(**overrides):
    notebook = {
        "cells": [
            {
                "cell_type": "code",
                "execution_count": None,
                "metadata": {},
                "outputs": [],
                "source": ["print('XEdu')\n"],
            }
        ],
        "metadata": {"kernelspec": {"language": "python", "name": "python3"}},
        "nbformat": 4,
        "nbformat_minor": 5,
    }
    notebook.update(overrides)
    return notebook


def write_jupyter_zip(
    path,
    notebooks=None,
    extra_members=None,
    include_root_marker=False,
):
    notebooks = notebooks or [("lesson.ipynb", notebook_document())]
    with zipfile.ZipFile(path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        if include_root_marker:
            archive.writestr("/", b"")
        for name, notebook in notebooks:
            content = notebook if isinstance(notebook, (str, bytes)) else json.dumps(notebook)
            archive.writestr(name, content)
        for name, content in extra_members or []:
            archive.writestr(name, content)


class ProjectLinkTests(unittest.TestCase):
    def test_parses_notebook_project_link_and_drops_navigation_noise(self):
        link = snapshot.parse_project_url(NOTEBOOK_URL)

        self.assertEqual(link.project_id, "68864154fbfda12af0d7cf44")
        self.assertEqual(link.route_kind, "project")
        self.assertEqual(
            link.canonical_url,
            "https://www.openinnolab.org.cn/pjlab/project?id=68864154fbfda12af0d7cf44",
        )

    def test_parses_senseinnoblocks_project_link(self):
        link = snapshot.parse_project_url(SCRATCH_URL)

        self.assertEqual(link.project_id, "6a5ec62657d9265a66252660")
        self.assertEqual(link.route_kind, "senseinnoblocks")

    def test_rejects_untrusted_hosts_routes_and_ids(self):
        invalid_urls = [
            "https://example.com/pjlab/project?id=68864154fbfda12af0d7cf44",
            "https://www.openinnolab.org.cn/pjlab/dataset?id=68864154fbfda12af0d7cf44",
            "https://www.openinnolab.org.cn/pjlab/project?id=../../etc/passwd",
            "https://[invalid/pjlab/project?id=68864154fbfda12af0d7cf44",
            "javascript:alert(1)",
        ]

        for url in invalid_urls:
            with self.subTest(url=url):
                with self.assertRaises(snapshot.SnapshotError):
                    snapshot.parse_project_url(url)


class MetadataTests(unittest.TestCase):
    def load_fixture(self, name):
        return json.loads((FIXTURES_DIR / name).read_text(encoding="utf-8"))

    def test_classifies_notebook_reference_project(self):
        metadata = snapshot.normalize_project_metadata(
            self.load_fixture("openinnolab-notebook-project.json"),
            snapshot.parse_project_url(NOTEBOOK_URL),
        )

        self.assertEqual(metadata["source_kind"], "openinnolab-jupyter")
        self.assertEqual(metadata["project_type"], "NOTEBOOK")
        self.assertEqual(metadata["run_env"], "PY_SERVER")
        self.assertEqual(metadata["framework"], "XEDU")

    def test_classifies_senseinnoblocks_reference_project(self):
        metadata = snapshot.normalize_project_metadata(
            self.load_fixture("openinnolab-scratch-project.json"),
            snapshot.parse_project_url(SCRATCH_URL),
        )

        self.assertEqual(metadata["source_kind"], "openinnolab-senseinnoblocks")
        self.assertEqual(metadata["project_type"], "SCRATCH")
        self.assertEqual(metadata["run_env"], "SCRATCH")

    def test_rejects_project_mismatch_and_secret_shaped_metadata(self):
        payload = self.load_fixture("openinnolab-notebook-project.json")
        payload["data"]["id"] = "6a5ec62657d9265a66252660"
        with self.assertRaises(snapshot.SnapshotError):
            snapshot.normalize_project_metadata(
                payload,
                snapshot.parse_project_url(NOTEBOOK_URL),
            )

    def test_rejects_route_and_project_type_mismatch(self):
        payload = self.load_fixture("openinnolab-notebook-project.json")
        payload["data"]["id"] = "6a5ec62657d9265a66252660"

        with self.assertRaises(snapshot.SnapshotError):
            snapshot.normalize_project_metadata(
                payload,
                snapshot.parse_project_url(SCRATCH_URL),
            )

        payload = self.load_fixture("openinnolab-notebook-project.json")
        payload["data"]["projectAccessInfo"] = {"token": "do-not-store"}
        with self.assertRaises(snapshot.SnapshotError):
            snapshot.normalize_project_metadata(
                payload,
                snapshot.parse_project_url(NOTEBOOK_URL),
            )


class SnapshotTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name)
        self.metadata_path = self.root / "metadata.json"
        self.metadata_path.write_bytes(
            (FIXTURES_DIR / "openinnolab-notebook-project.json").read_bytes()
        )

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_creates_byte_exact_credential_free_snapshot_and_handoff(self):
        artifact = self.root / "openinnolab-project.zip"
        write_jupyter_zip(
            artifact,
            notebooks=[
                ("notebooks/lesson.ipynb", notebook_document()),
                ("analysis.ipynb", notebook_document(cells=[])),
            ],
            extra_members=[("assets/input.csv", "label,value\nXEdu,1\n")],
            include_root_marker=True,
        )
        artifact_bytes = artifact.read_bytes()
        output = self.root / "snapshot"

        manifest = snapshot.create_snapshot(
            NOTEBOOK_URL,
            self.metadata_path,
            artifact,
            output,
            fetched_at="2026-08-05T12:00:00Z",
        )

        copied = output / "raw" / artifact.name
        self.assertEqual(copied.read_bytes(), artifact_bytes)
        self.assertEqual(
            manifest["snapshot"]["artifact"]["sha256"],
            hashlib.sha256(artifact_bytes).hexdigest(),
        )
        self.assertEqual(manifest["schema"], "xedu-source-snapshot/v1")
        self.assertEqual(manifest["xedu_handoff"]["route"], "xedu-package-course")
        self.assertEqual(manifest["xedu_handoff"]["intent"], "convert")
        self.assertEqual(manifest["xedu_handoff"]["input_type"], "source-snapshot")
        self.assertEqual(
            set(manifest["xedu_handoff"]),
            {
                "version",
                "route",
                "intent",
                "input_type",
                "form",
                "target_ref",
                "constraints",
                "next_action",
            },
        )
        self.assertEqual(manifest["xedu_handoff"]["form"], "jupyter")
        self.assertEqual(
            manifest["xedu_handoff"]["constraints"],
            [
                "preserve-source-artifact",
                "inspect-notebook-entrypoints",
                "inspect-python-dependencies",
                "inspect-runtime-services",
                "inspect-local-assets",
            ],
        )
        self.assertEqual(
            manifest["xedu_handoff"]["target_ref"], "source-manifest.json"
        )
        self.assertEqual(
            manifest["snapshot"]["artifact"]["validation"],
            {"profile": "jupyter-project-zip", "notebook_count": 2},
        )
        self.assertFalse((output / "course.json").exists())

        serialized = (output / "source-manifest.json").read_text(encoding="utf-8")
        serialized += (output / "source-metadata.json").read_text(encoding="utf-8")
        self.assertNotIn(str(self.root), serialized)
        for forbidden in ("token", "cookie", "authorization", "password"):
            self.assertNotIn(forbidden, serialized.lower())

    def test_senseinnoblocks_handoff_requires_block_compatibility_report(self):
        self.metadata_path.write_bytes(
            (FIXTURES_DIR / "openinnolab-scratch-project.json").read_bytes()
        )
        artifact = self.root / "project.ib"
        write_ib(
            artifact,
            project={
                "targets": [{"name": "Stage", "isStage": True, "blocks": {}}],
                "extensions": ["innolabCamera"],
            },
        )
        artifact_bytes = artifact.read_bytes()
        output = self.root / "scratch-snapshot"

        manifest = snapshot.create_snapshot(
            SCRATCH_URL,
            self.metadata_path,
            artifact,
            output,
            fetched_at="2026-08-05T12:00:00Z",
        )

        self.assertEqual((output / "raw" / "project.ib").read_bytes(), artifact_bytes)
        self.assertEqual(
            set(manifest["xedu_handoff"]),
            {
                "version",
                "route",
                "intent",
                "input_type",
                "form",
                "target_ref",
                "constraints",
                "next_action",
            },
        )
        self.assertEqual(manifest["xedu_handoff"]["form"], "scratch")
        self.assertEqual(
            manifest["snapshot"]["artifact"]["validation"],
            {"profile": "senseinnoblocks-ib"},
        )
        self.assertEqual(
            manifest["xedu_handoff"]["constraints"],
            [
                "preserve-source-artifact",
                "scratch-compatibility-report-required",
                "block-on-unsupported-opcode",
            ],
        )
        self.assertFalse((output / "scratch-compatibility.json").exists())

    def test_rejects_invalid_or_unsafe_jupyter_archives(self):
        wrong_suffix = self.root / "project.bin"
        write_jupyter_zip(wrong_suffix)
        invalid_zip = self.root / "invalid.zip"
        invalid_zip.write_bytes(b"not-a-zip")
        missing_notebook = self.root / "missing-notebook.zip"
        with zipfile.ZipFile(missing_notebook, "w") as archive:
            archive.writestr("README.md", "no notebook")
        invalid_json = self.root / "invalid-json.zip"
        write_jupyter_zip(invalid_json, notebooks=[("lesson.ipynb", "not-json")])
        invalid_shape = self.root / "invalid-shape.zip"
        write_jupyter_zip(
            invalid_shape,
            notebooks=[("lesson.ipynb", notebook_document(metadata=[]))],
        )
        invalid_cell_type = self.root / "invalid-cell-type.zip"
        write_jupyter_zip(
            invalid_cell_type,
            notebooks=[
                (
                    "lesson.ipynb",
                    notebook_document(
                        cells=[{"cell_type": "custom", "metadata": {}, "source": []}]
                    ),
                )
            ],
        )
        unsafe_member = self.root / "unsafe-member.zip"
        write_jupyter_zip(
            unsafe_member,
            extra_members=[("../escape.txt", "unsafe")],
        )
        absolute_member = self.root / "absolute-member.zip"
        write_jupyter_zip(
            absolute_member,
            extra_members=[("/escape.txt", "unsafe")],
        )
        duplicate_member = self.root / "duplicate-member.zip"
        write_jupyter_zip(
            duplicate_member,
            extra_members=[("./lesson.ipynb", json.dumps(notebook_document()))],
        )
        symlink_member = self.root / "symlink-member.zip"
        with zipfile.ZipFile(symlink_member, "w") as archive:
            archive.writestr("lesson.ipynb", json.dumps(notebook_document()))
            link = zipfile.ZipInfo("linked-data.csv")
            link.create_system = 3
            link.external_attr = (stat.S_IFLNK | 0o777) << 16
            archive.writestr(link, "data.csv")
        corrupt_member = self.root / "corrupt-member.zip"
        with zipfile.ZipFile(corrupt_member, "w", compression=zipfile.ZIP_STORED) as archive:
            archive.writestr("lesson.ipynb", json.dumps(notebook_document()))
            archive.writestr("unique-asset.bin", b"unique-jupyter-payload-for-crc")
        corrupt_member.write_bytes(
            corrupt_member.read_bytes().replace(
                b"unique-jupyter-payload-for-crc",
                b"broken-jupyter-payload-for-crc",
                1,
            )
        )

        artifacts = [
            wrong_suffix,
            invalid_zip,
            missing_notebook,
            invalid_json,
            invalid_shape,
            invalid_cell_type,
            unsafe_member,
            absolute_member,
            duplicate_member,
            symlink_member,
            corrupt_member,
        ]
        for index, artifact in enumerate(artifacts):
            with self.subTest(artifact=artifact.name):
                output = self.root / f"invalid-jupyter-{index}"
                with self.assertRaises(snapshot.SnapshotError):
                    snapshot.create_snapshot(
                        NOTEBOOK_URL,
                        self.metadata_path,
                        artifact,
                        output,
                    )
                self.assertFalse(output.exists())

    def test_rejects_invalid_or_unsafe_senseinnoblocks_archives(self):
        self.metadata_path.write_bytes(
            (FIXTURES_DIR / "openinnolab-scratch-project.json").read_bytes()
        )

        wrong_suffix = self.root / "project.zip"
        write_ib(wrong_suffix)
        invalid_zip = self.root / "invalid.ib"
        invalid_zip.write_bytes(b"not-a-zip")
        missing_manifest = self.root / "missing-project.ib"
        with zipfile.ZipFile(missing_manifest, "w") as archive:
            archive.writestr("sprite.svg", "<svg/>")
        unsafe_member = self.root / "unsafe-member.ib"
        write_ib(unsafe_member, extra_members=[("../escape.txt", "unsafe")])
        drive_member = self.root / "drive-member.ib"
        write_ib(drive_member, extra_members=[("C:/escape.txt", "unsafe")])
        duplicate_member = self.root / "duplicate-member.ib"
        write_ib(duplicate_member, extra_members=[("./project.json", "{}")])
        symlink_member = self.root / "symlink-member.ib"
        with zipfile.ZipFile(symlink_member, "w") as archive:
            archive.writestr("project.json", '{"targets": [], "extensions": []}')
            link = zipfile.ZipInfo("linked-asset.svg")
            link.create_system = 3
            link.external_attr = (stat.S_IFLNK | 0o777) << 16
            archive.writestr(link, "target.svg")
        directory_type_mismatch = self.root / "directory-type-mismatch.ib"
        with zipfile.ZipFile(directory_type_mismatch, "w") as archive:
            archive.writestr("project.json", '{"targets": [], "extensions": []}')
            disguised_file = zipfile.ZipInfo("disguised-file/")
            disguised_file.create_system = 3
            disguised_file.external_attr = (stat.S_IFREG | 0o644) << 16
            archive.writestr(disguised_file, b"data-that-must-not-be-skipped")
        file_type_mismatch = self.root / "file-type-mismatch.ib"
        with zipfile.ZipFile(file_type_mismatch, "w") as archive:
            archive.writestr("project.json", '{"targets": [], "extensions": []}')
            disguised_directory = zipfile.ZipInfo("disguised-directory")
            disguised_directory.create_system = 3
            disguised_directory.external_attr = (stat.S_IFDIR | 0o755) << 16
            archive.writestr(disguised_directory, b"")
        corrupt_member = self.root / "corrupt-member.ib"
        with zipfile.ZipFile(corrupt_member, "w", compression=zipfile.ZIP_STORED) as archive:
            archive.writestr("project.json", '{"targets": [], "extensions": []}')
            archive.writestr("unique-asset.bin", b"unique-media-payload-for-crc")
        corrupt_bytes = corrupt_member.read_bytes().replace(
            b"unique-media-payload-for-crc",
            b"broken-media-payload-for-crc",
            1,
        )
        corrupt_member.write_bytes(corrupt_bytes)
        invalid_manifest = self.root / "invalid-project.ib"
        with zipfile.ZipFile(invalid_manifest, "w") as archive:
            archive.writestr("project.json", "not-json")

        artifacts = [
            wrong_suffix,
            invalid_zip,
            missing_manifest,
            unsafe_member,
            drive_member,
            duplicate_member,
            symlink_member,
            directory_type_mismatch,
            file_type_mismatch,
            corrupt_member,
            invalid_manifest,
        ]
        for index, artifact in enumerate(artifacts):
            with self.subTest(artifact=artifact.name):
                output = self.root / f"invalid-scratch-{index}"
                with self.assertRaises(snapshot.SnapshotError):
                    snapshot.create_snapshot(
                        SCRATCH_URL,
                        self.metadata_path,
                        artifact,
                        output,
                    )
                self.assertFalse(output.exists())

    def test_rejects_html_error_json_empty_and_reserved_artifacts(self):
        samples = {
            "page.html": b"<!doctype html><html><body>login</body></html>",
            "error.json": (FIXTURES_DIR / "openinnolab-auth-error.json").read_bytes(),
            "empty.zip": b"",
            "source-manifest.json": b"{}",
        }

        for index, (name, content) in enumerate(samples.items()):
            with self.subTest(name=name):
                artifact = self.root / name
                artifact.write_bytes(content)
                output = self.root / f"rejected-{index}"
                with self.assertRaises(snapshot.SnapshotError):
                    snapshot.create_snapshot(
                        NOTEBOOK_URL,
                        self.metadata_path,
                        artifact,
                        output,
                    )
                self.assertFalse(output.exists())

    def test_existing_destination_is_unchanged(self):
        artifact = self.root / "project.zip"
        write_jupyter_zip(artifact)
        output = self.root / "snapshot"
        output.mkdir()
        sentinel = output / "keep.txt"
        sentinel.write_text("keep", encoding="utf-8")

        with self.assertRaises(snapshot.SnapshotError):
            snapshot.create_snapshot(
                NOTEBOOK_URL,
                self.metadata_path,
                artifact,
                output,
            )

        self.assertEqual(sentinel.read_text(encoding="utf-8"), "keep")
        self.assertEqual(sorted(path.name for path in output.iterdir()), ["keep.txt"])

    def test_dangling_symlink_destination_is_not_replaced(self):
        artifact = self.root / "project.zip"
        write_jupyter_zip(artifact)
        output = self.root / "snapshot"
        output.symlink_to(self.root / "missing-target", target_is_directory=True)

        with self.assertRaises(snapshot.SnapshotError):
            snapshot.create_snapshot(
                NOTEBOOK_URL,
                self.metadata_path,
                artifact,
                output,
            )

        self.assertTrue(output.is_symlink())
        self.assertEqual(output.readlink(), self.root / "missing-target")

    def test_atomic_commit_never_replaces_destination_created_during_write(self):
        source = self.root / "prepared"
        source.mkdir()
        (source / "source-manifest.json").write_text("prepared", encoding="utf-8")
        destination = self.root / "appeared"
        destination.mkdir()
        sentinel = destination / "keep.txt"
        sentinel.write_text("keep", encoding="utf-8")

        with self.assertRaises(snapshot.SnapshotError):
            snapshot._rename_no_replace(source, destination)

        self.assertTrue(source.is_dir())
        self.assertEqual(sentinel.read_text(encoding="utf-8"), "keep")

    def test_validates_the_copied_artifact_before_commit(self):
        self.metadata_path.write_bytes(
            (FIXTURES_DIR / "openinnolab-scratch-project.json").read_bytes()
        )
        artifact = self.root / "project.ib"
        write_ib(artifact)
        output = self.root / "snapshot"
        original_copy = snapshot._copy_and_hash

        def corrupt_copy(source, destination):
            result = original_copy(source, destination)
            destination.write_bytes(b"corrupted-after-copy")
            return result

        snapshot._copy_and_hash = corrupt_copy
        try:
            with self.assertRaises(snapshot.SnapshotError):
                snapshot.create_snapshot(
                    SCRATCH_URL,
                    self.metadata_path,
                    artifact,
                    output,
                )
        finally:
            snapshot._copy_and_hash = original_copy

        self.assertFalse(output.exists())
        self.assertEqual(list(self.root.glob(".snapshot.tmp-*")), [])


if __name__ == "__main__":
    unittest.main()
