# Packaging Reference

Run the helper from the skill folder. It uses only the Python standard library.

```bash
python3 scripts/xedu_package.py inspect --input /path/to/course-or-course.zip
python3 scripts/xedu_package.py stage --course-root /path/to/course --output /path/to/stage
python3 scripts/xedu_package.py build --course-root /path/to/course --output /path/to/course.zip
```

`inspect` accepts a course directory or an existing XEdu ZIP. For a directory it validates `course.json`, local relative paths, referenced files, and Scratch archive structure without mutation. For a ZIP it also checks member paths, duplicate names, special/encrypted entries, CRC, root-level `course.json`, referenced resources, unreferenced files, and SHA-256. It reports each experiment's forms, entry/resources, missing assets, and the next action. Experiment `entry` and `entry_file` references are included even when omitted from `files[]`.

`stage` and `build` refuse an existing output path, create a missing output parent, and include only `course.json`, local covers, experiment entry files, and paths referenced by `sections[].experiments[].files[]`. Missing declared resources block both operations.

`build` writes fixed ZIP timestamps and permissions so the same source produces byte-identical output. It then checks ZIP CRC, duplicate names, exact member parity, parses the packaged `course.json`, and confirms that every declared resource is present. The JSON report includes `sha256`, `verification`, `resource_status_by_experiment`, and the source `version`. Packaging preserves that version and does not rewrite `course.json`.

Directory references include their non-hidden descendants. The helper rejects absolute paths, traversal, backslashes, symlinks, missing resources, duplicate archive names, and output paths inside the source tree.

The helper does not publish or install the XEdu Client. Use the XEdu Client publish path only after inspecting the staged copy. A course ZIP with a root `course.json` differs from the XEdu Client `.dmg`/`.exe` installer and from an OLS/SASULearnSite archive. If publishing can delete remote files, display the exact delete set and wait for explicit confirmation.

## Verification checklist

- `course.json` parses and every `entry`/`entry_file`, cover, and file reference exists.
- Each experiment reports resources against its declared forms.
- Every `.sb3` passes archive and manifest validation.
- A built ZIP opens, preserves source-relative paths, has the exact inspected file set, and passes CRC verification.
- The build report records the ZIP SHA-256 and verification result.
- `inspect --input course.zip` reports a clean package as `input_type: pack-output`, with `recommended_next_action: publish`; missing resources stop the flow, and unreferenced files recommend normalizing through stage/build.
