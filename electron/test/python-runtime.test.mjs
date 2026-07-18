import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getPythonDialogFilters,
  getPythonExecutableCandidates,
  resolvePythonExecutable,
} from '../main/python-runtime.js';

test('Windows Python selection accepts the executable layout used by installed environments', () => {
  const candidates = getPythonExecutableCandidates({
    platform: 'win32',
    baseDir: 'C:\\Users\\teacher\\venv',
  });

  assert.deepEqual(candidates, [
    'C:\\Users\\teacher\\venv\\Scripts\\python.exe',
    'C:\\Users\\teacher\\venv\\python.exe',
  ]);
  assert.deepEqual(getPythonDialogFilters('win32'), [
    { name: 'Python 可执行文件', extensions: ['exe'] },
    { name: '所有文件', extensions: ['*'] },
  ]);
});

test('macOS Python selection accepts bin/python3 and bin/python', () => {
  const candidates = getPythonExecutableCandidates({
    platform: 'darwin',
    baseDir: '/Users/teacher/.venv/xedu',
  });

  assert.deepEqual(candidates, [
    '/Users/teacher/.venv/xedu/bin/python3',
    '/Users/teacher/.venv/xedu/bin/python',
    '/Users/teacher/.venv/xedu/python3',
    '/Users/teacher/.venv/xedu/python',
  ]);
  assert.deepEqual(getPythonDialogFilters('darwin'), [
    { name: 'Python 可执行文件', extensions: ['*'] },
  ]);
});

test('packaged resolution never falls back to a bundled Python directory', () => {
  const existing = new Set(['/Applications/Python/bin/python3']);
  const fsImpl = {
    existsSync: (target) => existing.has(target),
    statSync: () => ({ isFile: () => true, mode: 0o755 }),
    accessSync: () => undefined,
  };

  assert.equal(
    resolvePythonExecutable({
      platform: 'darwin',
      packaged: true,
      configuredPath: '',
      selectedPath: '',
      projectRoot: '/repo',
      fsImpl,
    }),
    null,
  );
  assert.equal(
    resolvePythonExecutable({
      platform: 'darwin',
      packaged: true,
      configuredPath: '/Applications/Python/bin/python3',
      selectedPath: '',
      projectRoot: '/repo',
      fsImpl,
    }),
    '/Applications/Python/bin/python3',
  );
});
