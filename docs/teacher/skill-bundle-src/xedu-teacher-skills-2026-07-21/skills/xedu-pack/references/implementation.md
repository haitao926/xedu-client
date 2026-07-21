# Implementation Reality

Read this for direct service calls, Scratch validation, package construction, or publish safety. Call backend services as Python libraries, never through HTTP routes.

## Inspect

```python
from services.gitea_service import scan_course, inspect_course

scan_result = scan_course(local_path, init_if_missing=False, init_meta=None, auto_build=False)
report = inspect_course(scan_result.course, local_path=local_path)
```

`scan_course` validates `course.json`; `inspect_course` reports whether referenced files exist. Neither decides which experiment forms the teacher intended, so compare its output with the course plan or handoff.

## Validate Scratch Projects

For each `type: "scratch"` file or `.sb3` path:

```bash
unzip -p lesson1/exp1/scratch/example.sb3 project.json
```

Require a readable ZIP and parseable `project.json`. Check `extensions` and any `xedu*` opcode against `xedu-scratch-lab/references/xedu-scratch-capabilities.md`. A project using removed generic XEdu extensions is a migration failure, not a valid Scratch resource. Opening, running, saving, and reopening still require the local Scratch editor; camera and hardware paths require their runtime dependencies.

## Stage And Build

Stage a clean copy containing `course.json` and the files it references. Preserve their valid relative paths, including `lessonN/expM/scratch/*.sb3`; do not rewrite them into a mandatory `html/blockly/notebook` tree. Write the staged `course.json`, create a ZIP, and verify the ZIP opens and contains every referenced resource.

## Publish Safety

`publish_course` uploads every file below `local_path`, so publish the staged copy rather than a raw source folder. For a possible single-course repository, call `GiteaClient.ensure_repo(create_if_missing=True, ...)` first. A `single_course_repo=True` publish deletes remote files absent locally: compute and show the delete list, then obtain confirmation before publishing.

## Smoke Checks

- `course.json` parses and referenced paths exist.
- Each experiment reports resources against its selected forms.
- Every `.sb3` passes archive and manifest validation.
- A built ZIP opens and preserves source-relative paths.
- A publish report includes repository creation state and any confirmed delete list.
