# Packaging Reference

Run the helper from the skill folder. It uses only the Python standard library.

```bash
python3 scripts/xedu_package.py inspect --course-root /path/to/course
python3 scripts/xedu_package.py stage --course-root /path/to/course --output /path/to/stage
python3 scripts/xedu_package.py build --course-root /path/to/course --output /path/to/course.zip
```

`inspect` validates `course.json`, local relative paths, referenced files, and Scratch archive structure without mutation. `stage` and `build` refuse an existing output path. They include only `course.json`, a local cover when declared, and paths referenced by `sections[].experiments[].files[]`.

Directory references include their non-hidden descendants. The helper rejects absolute paths, traversal, backslashes, symlinks, missing resources, duplicate archive names, and output paths inside the source tree.

The helper does not publish. Use the XEdu Client publish path only after inspecting the staged copy. If publishing can delete remote files, display the exact delete set and wait for explicit confirmation.
