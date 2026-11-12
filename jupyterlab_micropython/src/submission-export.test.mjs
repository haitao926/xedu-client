import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { preferredPythonFile, projectFilePath, STARTER_MAIN_PY, studentErrorMessage } from './panel-logic.js';

const source = readFileSync(new URL('./index.js', import.meta.url), 'utf8');
const prototype = vm.runInNewContext(
  `${source.slice(source.indexOf('class MicroPythonPanel'), source.indexOf('\nconst plugin ='))}; MicroPythonPanel.prototype;`,
  { Panel: class {}, TextEncoder, preferredPythonFile, projectFilePath, STARTER_MAIN_PY, studentErrorMessage },
);

function createPanel(save = async () => {}) {
  const panel = Object.assign(Object.create(prototype), {
    activePythonPath: 'lesson/学生.py',
    projectDirectory: 'lesson',
    editor: { value: 'print("你好")\n' },
    connected: false,
    dirty: true,
    app: { serviceManager: { contents: { save } } },
    updateFileLabel() {},
    updateActionState() {},
    async refreshFiles() {},
    setStatus() {},
  });
  return panel;
}

test('MicroPython exports saved UTF-8 Python bytes without connecting a board', async () => {
  const saves = [];
  const panel = createPanel(async (file, model) => saves.push({ file, model }));
  const exported = await panel.exportForSubmission();
  assert.equal(exported.filename, '学生.py');
  assert.equal(exported.mime, 'text/plain');
  assert.equal(Buffer.from(exported.bytes).toString('utf8'), panel.editor.value);
  assert.equal(saves.length, 1);
  assert.equal(saves[0].file, 'lesson/学生.py');
  assert.equal(saves[0].model.content, panel.editor.value);
  assert.equal(panel.dirty, false);
});

test('MicroPython export waits for disk save before returning the file', async () => {
  let finishSave;
  const panel = createPanel(() => new Promise((resolve) => { finishSave = resolve; }));
  let exported = false;
  const pending = panel.exportForSubmission().then((file) => { exported = true; return file; });
  await Promise.resolve();
  assert.equal(exported, false);
  finishSave();
  assert.equal((await pending).filename, '学生.py');
});

test('MicroPython export propagates save failure without clearing unsaved edits', async () => {
  const panel = createPanel(async () => { throw new Error('disk full'); });
  await assert.rejects(() => panel.exportForSubmission(), /disk full/);
  assert.equal(panel.dirty, true);
});

test('MicroPython exports the saved snapshot and preserves newer edits during save', async () => {
  const panel = createPanel(async () => {
    panel.editor.value = 'print("new edit")';
  });
  const exported = await panel.exportForSubmission();
  assert.equal(Buffer.from(exported.bytes).toString('utf8'), 'print("你好")\n');
  assert.equal(panel.editor.value, 'print("new edit")');
  assert.equal(panel.dirty, true);
});

test('MicroPython keeps the saved filename if another file is selected during save', async () => {
  const panel = createPanel(async () => {
    panel.activePythonPath = 'other/main.py';
    panel.editor.value = 'print("other file")';
    panel.dirty = true;
  });
  const exported = await panel.exportForSubmission();
  assert.equal(exported.filename, '学生.py');
  assert.equal(Buffer.from(exported.bytes).toString('utf8'), 'print("你好")\n');
  assert.equal(panel.activePythonPath, 'other/main.py');
  assert.equal(panel.dirty, true);
});

test('MicroPython saves its new main.py when no file existed at launch', async () => {
  const panel = createPanel();
  panel.activePythonPath = '';
  const exported = await panel.exportForSubmission();
  assert.equal(panel.activePythonPath, 'lesson/main.py');
  assert.equal(exported.filename, 'main.py');
});

test('MicroPython waits for the original file to load before saving a submission', async () => {
  let finishLoading;
  const writes = [];
  const panel = createPanel(async (file, model) => writes.push({ file, model }));
  panel.editor.value = '';
  panel.filesReady = new Promise((resolve) => { finishLoading = resolve; });
  const pending = panel.exportForSubmission();
  await Promise.resolve();
  assert.equal(writes.length, 0);
  panel.editor.value = 'print("original file loaded")';
  finishLoading();
  const exported = await pending;
  assert.equal(writes[0].model.content, 'print("original file loaded")');
  assert.equal(Buffer.from(exported.bytes).toString('utf8'), 'print("original file loaded")');
});

test('MicroPython initialization failure prevents overwriting the original file', async () => {
  let writes = 0;
  const panel = createPanel(async () => { writes += 1; });
  panel.editor.value = '';
  panel.refreshFiles = async () => { throw new Error('file loading failed'); };
  panel.filesReady = panel.bootstrapFiles();
  await panel.filesReady;
  await assert.rejects(() => panel.exportForSubmission(), /加载|loading failed/);
  assert.equal(writes, 0);
});
