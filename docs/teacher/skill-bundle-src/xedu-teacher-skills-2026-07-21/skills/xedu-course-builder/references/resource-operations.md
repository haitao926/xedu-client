# Resource Operations

Use direct backend service functions for teacher-resource operations. Do not call HTTP routes. Confirm destructive targets and keep the documented backups enabled.

## QuickForm Injection

Use only for an existing HTML experiment. Import `inject_quickform_file`, `normalize_quickform_public_config`, `resolve_local_course_file`, and `parse_bool` from the project services; keep `create_backup=True`, require `submit_url`, and confirm the relative HTML target and URL before writing.

## Existing Blockly Compatibility

`python_to_blockly_workspace_xml()` and `validate_toolbox_schema()` remain only for maintaining an existing Blockly course. Show every unsupported syntax item before saving. Do not use them for a new visual-programming experiment; route new `.sb3` work to `xedu-scratch-lab`.

## Course Import Or Pull

Use `import_local_course_package()` or `pull_course()` with `backup_before_replace=True`. Both are destructive when replacing an existing target. Confirm `target_path` first and rely on `scan_course` validation of the staged result.

## Cover And Repository Setup

Use `_persist_course_cover_to_local()` only for local cover persistence, or `publish_course(..., meta_override={"cover_data_url": ...})` while publishing. Before a new single-course-repository publish, call `GiteaClient.ensure_repo(create_if_missing=True, ...)` and report whether it created the repository.
