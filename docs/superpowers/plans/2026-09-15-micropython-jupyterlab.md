# ESP32 MicroPython JupyterLab Implementation Plan

> **For agentic workers:** Implement this plan task-by-task with tests after each task.

**Goal:** Add a first-class ESP32 MicroPython experiment mode inside the embedded JupyterLab without creating a second editor or coupling MicroPython to the normal Python kernel.

**Architecture:** A prebuilt JupyterLab frontend extension renders the student-facing ESP32 panel. A same-origin Jupyter Server extension exposes a small device API and owns a process-local serial session. The session uses `pyserial` for discovery, REPL I/O, interrupts, and reset, while course files remain in the existing Jupyter workspace.

**Tech Stack:** Python 3.8+, Flask/XEdu backend, JupyterLab 4, Jupyter Server extension, `pyserial`, TypeScript/JavaScript prebuilt JupyterLab extension, Node test runner, Python unittest.

## Global Constraints

- Preserve ordinary JupyterLab and Python kernel behavior.
- Target ESP32 USB serial MicroPython only in version `2.1.0`.
- Assume firmware is already installed; do not add firmware flashing in this plan.
- Do not add a second general-purpose editor or launch Thonny.
- Protect local device routes and validate all project-relative paths.
- Do not commit changes unless explicitly requested.

### Task 1: Lock the device-session contract with tests

**Files:**
- Create: `backend/services/micropython_session.py`
- Create: `backend/tests/test_micropython_session.py`

**Interfaces:**
- Produce `MicroPythonSessionManager.list_ports() -> list[dict[str, str]]`.
- Produce `connect(port: str) -> dict[str, object]`.
- Produce `disconnect() -> dict[str, object]`.
- Produce `run_file(path: Path) -> dict[str, object]`.
- Produce `write_input(text: str) -> dict[str, object]`.
- Produce `interrupt() -> dict[str, object]`.
- Produce `reset() -> dict[str, object]`.
- Produce `read_output(after: int = 0) -> dict[str, object]`.

- [ ] Add tests for safe port filtering, connection state, cursor-based output, interrupt bytes, reset bytes, project-relative file validation, and cleanup after serial failure.
- [ ] Use a fake serial transport in tests so no physical ESP32 is required.
- [ ] Run `PYTHONPATH=backend:backend/tests python3 -m unittest backend.tests.test_micropython_session -v` and verify the new tests initially fail for missing session behavior.
- [ ] Implement the smallest session manager with a lock, bounded output buffer, reader thread, and injectable serial factory.
- [ ] Run the same command and verify all session tests pass.

### Task 2: Add the Jupyter Server device extension

**Files:**
- Create: `backend/services/jupyter_micropython_server.py`
- Create: `backend/tests/test_jupyter_micropython_server.py`
- Modify: `backend/services/jupyter_environment.py`
- Modify: `backend/services/jupyter_service.py`

**Interfaces:**
- Produce `load_jupyter_server_extension(server_app) -> None`.
- Register same-origin routes under `/xedu-micropython`.
- Store one session manager per Jupyter process and close it during server shutdown.

- [ ] Add route tests for ports, connect, disconnect, run, input, interrupt, reset, and output cursor semantics.
- [ ] Verify malformed JSON, missing port, path traversal, and unauthorized project files return 4xx without touching serial.
- [ ] Add the server extension to the Jupyter launch environment and enable it through `--ServerApp.jpserver_extensions=...` without changing normal Jupyter kernel selection.
- [ ] Run `PYTHONPATH=backend:backend/tests python3 -m unittest backend.tests.test_jupyter_micropython_server backend.tests.test_jupyter_service -v`.

### Task 3: Build the JupyterLab prebuilt extension

**Files:**
- Create: `jupyterlab_micropython/package.json`
- Create: `jupyterlab_micropython/tsconfig.json`
- Create: `jupyterlab_micropython/src/index.ts`
- Create: `jupyterlab_micropython/style/index.css`
- Create: `jupyterlab_micropython/pyproject.toml`
- Create: `jupyterlab_micropython/jupyterlab_micropython/__init__.py`
- Create: `jupyterlab_micropython/jupyterlab_micropython/labextension/` build output
- Create: `jupyterlab_micropython/src/index.test.mjs`

**Interfaces:**
- Register command `xedu-micropython:open-panel`.
- Register a right-side `ESP32 实验` panel.
- Use the current Jupyter contents model to determine the active `.py` file.
- Call same-origin `/xedu-micropython/*` routes only.

- [ ] Add the extension package metadata for JupyterLab 4 prebuilt discovery.
- [ ] Add the panel UI with explicit states: not in experiment, no board, disconnected, connected, running, error.
- [ ] Add actions for refresh ports, connect, run current file, send REPL input, interrupt, reset, and disconnect.
- [ ] Poll output with a cursor and render stdout/stderr without injecting HTML.
- [ ] Add tests for state transitions, disabled actions, output cursor updates, and user-facing error messages.
- [ ] Build the extension with `npm run build` in `jupyterlab_micropython` and verify a `labextension` directory is produced.

### Task 4: Install and package the extension

**Files:**
- Modify: `backend/requirements.txt`
- Modify: `backend/requirements_full.txt`
- Modify: `scripts/setup_portable_python.py`
- Modify: `electron-builder.release.cjs`
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `scripts/install_jupyterlab_micropython.mjs`
- Create: `electron/test/micropython-extension-package.test.mjs`

**Interfaces:**
- The selected Python environment receives `pyserial` and the packaged JupyterLab extension.
- Repairing Python installs the optional MicroPython capability without blocking ordinary Jupyter if installation fails.

- [ ] Pin `pyserial` in both runtime requirement profiles.
- [ ] Add a deterministic installer that runs `python -m pip install --no-deps <extension wheel or source>` and verifies the labextension path.
- [ ] Include the extension source/build output in release resources and test package layout.
- [ ] Update version from `2.0.2` to `2.1.0` in `package.json` and `package-lock.json`.
- [ ] Run package-layout tests and verify the extension is present in release artifacts.

### Task 5: Connect course experiments to the plugin

**Files:**
- Modify: `backend/api/resource_runtime.py`
- Modify: `backend/api/routes/resources.py`
- Modify: `renderer/js/resources.js`
- Modify: `renderer/js/resources/course-actions.js`
- Modify: `renderer/js/main/workspace-context.js`
- Modify: `docs/overview/course-folder-contract.md`
- Create: `backend/tests/test_micropython_experiment_context.py`

**Interfaces:**
- A course experiment may declare `runtime: "micropython-esp32"` and optional `entry_file`.
- Opening such an experiment launches JupyterLab with the experiment context available to the plugin.

- [ ] Add validation and defaulting for the runtime declaration without changing existing course formats.
- [ ] Pass the experiment root and entry file through the existing workspace context rather than introducing a second project-root concept.
- [ ] Add tests for valid context, missing entry file, and ordinary Jupyter fallback.
- [ ] Add a concise course contract example and teacher-facing error messages.

### Task 6: End-to-end verification and release evidence

**Files:**
- Modify: `scripts/run_quality_gate.py`
- Modify: `README.md`
- Create: `docs/teacher/micropython-esp32-quickstart.md`
- Create: `electron/test/micropython-release-contract.test.mjs`

- [ ] Add the Python session, server extension, frontend extension, and package-layout tests to the quality gate.
- [ ] Run `PYTHONPATH=backend:backend/tests python3 -m unittest discover -s backend/tests`.
- [ ] Run `npm run build` and all MicroPython extension tests.
- [ ] Run `git diff --check` and scan for stale references to removed upload-only APIs.
- [ ] Document the supported ESP32 workflow, required pre-flashed firmware, supported baud rate, and recovery actions.

