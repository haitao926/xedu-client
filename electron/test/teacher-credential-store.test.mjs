import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';

const [mainSource, preloadSource] = await Promise.all([
  readFile(new URL('../main/main.js', import.meta.url), 'utf8'),
  readFile(new URL('../preload/index.js', import.meta.url), 'utf8'),
]);

test('teacher credential store module is removed from the Electron bundle', async () => {
  await assert.rejects(access(new URL('../main/teacher-credential-store.js', import.meta.url)));
});

test('electron main process no longer registers teacher credential IPC handlers', () => {
  assert.doesNotMatch(mainSource, /teacher-credential:/);
  assert.doesNotMatch(mainSource, /teacherCredentialStore|createTeacherCredentialStore/);
});

test('preload bridge no longer exposes teacher credential persistence APIs', () => {
  assert.doesNotMatch(preloadSource, /loadTeacherCredential|saveTeacherCredential|clearTeacherCredential/);
});
