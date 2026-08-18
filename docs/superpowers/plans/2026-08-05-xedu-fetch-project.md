# XEdu Fetch Project Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a link-only `xedu-fetch-project` skill that preserves both OpenInnoLab Scratch and Jupyter native exports as safe source snapshots for later conversion by `xedu-package-course`.

**Architecture:** The skill uses public project metadata for classification and the user's existing OpenInnoLab browser session for private native export. A folder-local Python standard-library helper validates and atomically stages the downloaded export with sanitized provenance and a digest manifest.

**Tech Stack:** Markdown skill instructions, Python 3 standard library, `unittest`, official Codex skill validator.

## Global Constraints

- Do not request, print, accept, or persist OpenInnoLab credentials, cookies, or tokens.
- Do not scrape project HTML as source content.
- Do not extract, convert, package, publish, or generate `course.json`.
- Do not add dependencies.
- Preserve downloaded export bytes exactly.
- Do not modify unrelated dirty-worktree files.

---

### Task 1: Lock URL, metadata, and snapshot contracts

**Files:**
- Create: `docs/teacher/skill-bundle-src/xedu-teacher-skills/tests/test_openinnolab_snapshot.py`
- Create: `docs/teacher/skill-bundle-src/xedu-teacher-skills/tests/fixtures/openinnolab-notebook-project.json`
- Create: `docs/teacher/skill-bundle-src/xedu-teacher-skills/tests/fixtures/openinnolab-scratch-project.json`
- Create: `docs/teacher/skill-bundle-src/xedu-teacher-skills/tests/fixtures/openinnolab-auth-error.json`

**Interfaces:**
- `parse_project_url(url: str) -> ProjectLink`
- `normalize_project_metadata(payload: dict, link: ProjectLink) -> dict`
- `create_snapshot(source_url, metadata_path, artifact_path, output_dir, fetched_at=None) -> dict`

- [x] Write tests for the two supplied URLs, host/route/ID rejection, metadata classification, byte preservation, manifest fields, secret stripping, unsafe artifacts, platform errors, and atomic existing-destination failure.
- [x] Run `python3 -m unittest docs/teacher/skill-bundle-src/xedu-teacher-skills/tests/test_openinnolab_snapshot.py -v` and verify it fails because the helper is absent.

### Task 2: Implement the standard-library snapshot helper

**Files:**
- Create: `docs/teacher/skill-bundle-src/xedu-teacher-skills/skills/xedu-fetch-project/scripts/openinnolab_snapshot.py`

**Interfaces:**
- CLI `inspect-url <url>` prints normalized link JSON.
- CLI `inspect-metadata --url <url> --metadata <path>` prints sanitized project metadata.
- CLI `snapshot --url <url> --metadata <path> --artifact <path> --output <path>` atomically creates the source snapshot.

- [x] Implement strict OpenInnoLab URL parsing and source-kind mapping.
- [x] Implement recursive secret-key rejection and sanitized metadata selection.
- [x] Reject empty, HTML, and platform error payloads before writing.
- [x] Copy to a temporary sibling directory, hash during copy, write the two JSON files, then rename atomically.
- [x] Run the focused `unittest` file and verify all tests pass.

### Task 3: Write and validate the skill

**Files:**
- Create: `docs/teacher/skill-bundle-src/xedu-teacher-skills/skills/xedu-fetch-project/SKILL.md`
- Create: `docs/teacher/skill-bundle-src/xedu-teacher-skills/skills/xedu-fetch-project/references/openinnolab.md`
- Create: `docs/teacher/skill-bundle-src/xedu-teacher-skills/skills/xedu-fetch-project/agents/openai.yaml`

**Interfaces:**
- Trigger on OpenInnoLab project-link fetching, downloading, mirroring, or source snapshot requests.
- Output `source-manifest.json` and hand off to `xedu-package-course` only after snapshot validation.

- [x] Write a concise workflow with inspect, authenticated native export, snapshot, verify, and handoff phases.
- [x] Document the observed endpoints and error codes in the conditional reference.
- [x] Generate UI metadata and run official `quick_validate.py`.

### Task 4: Forward validation

**Files:**
- Modify only Task 1-3 files if validation finds defects.

- [x] Run helper tests, `compileall`, skill validation, and `git diff --check`.
- [x] Give a fresh agent both reference URLs and the skill, then verify it does not scrape HTML, request tokens, reconstruct SB3, generate `course.json`, or overwrite an existing snapshot.
- [x] Inspect the final diff and report that authenticated live downloads remain browser-session dependent and were not falsely claimed as anonymously verified.

### Task 5: Make Jupyter support explicit and symmetric

**Files:**
- Modify: `docs/teacher/skill-bundle-src/xedu-teacher-skills/tests/test_openinnolab_snapshot.py`
- Modify: `docs/teacher/skill-bundle-src/xedu-teacher-skills/skills/xedu-fetch-project/scripts/openinnolab_snapshot.py`
- Modify: `docs/teacher/skill-bundle-src/xedu-teacher-skills/skills/xedu-fetch-project/SKILL.md`
- Modify: `docs/teacher/skill-bundle-src/xedu-teacher-skills/skills/xedu-fetch-project/references/openinnolab.md`
- Modify: `docs/teacher/skill-bundle-src/xedu-teacher-skills/skills/xedu-fetch-project/agents/openai.yaml`

- [x] Replace the generic Notebook byte fixture with a real ZIP containing valid `.ipynb` documents and assets; verify the new tests fail against the old helper.
- [x] Share safe ZIP traversal between Scratch and Jupyter while preserving the observed Jupyter empty `/` root marker.
- [x] Validate every `.ipynb` JSON shape without extracting, executing, or rewriting it.
- [x] Rename the normalized source kind to `openinnolab-jupyter` and add format-specific validation metadata.
- [x] Add V2 fixed-field handoff constraints for Jupyter inspection and Scratch compatibility; keep format evidence in `snapshot.artifact.validation`.
- [x] Update skill discovery metadata, workflow, reference, and design to state dual support.
- [x] Re-run focused verification, validate both real `.ib` files and the format-evidence Jupyter dump, and complete the available local code review; live private export remains browser-session dependent.
