import assert from 'node:assert/strict';
import test from 'node:test';
import {
  discoverPythonEnvironments,
  getPythonDialogFilters,
  getPythonExecutableCandidates,
  resolvePythonSelectionTarget,
  resolvePythonExecutable,
  validatePythonExecutable,
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
  assert.deepEqual(getPythonDialogFilters('darwin'), []);
});

test('macOS Python selection resolves environment directories to bin/python3', () => {
  const existing = new Set(['/Users/teacher/.venv/xedu/bin/python3']);
  const fsImpl = {
    statSync: (target) => ({
      isDirectory: () => target === '/Users/teacher/.venv/xedu',
      isFile: () => existing.has(target),
      mode: 0o755,
    }),
    accessSync: () => undefined,
    constants: { X_OK: 1 },
  };

  assert.equal(
    resolvePythonSelectionTarget('/Users/teacher/.venv/xedu', {
      platform: 'darwin',
      fsImpl,
    }),
    '/Users/teacher/.venv/xedu/bin/python3',
  );
});

test('macOS directory validation returns the resolved interpreter path', () => {
  const existing = new Set(['/Users/teacher/.venv/xedu/bin/python3']);
  const fsImpl = {
    statSync: (target) => ({
      isDirectory: () => target === '/Users/teacher/.venv/xedu',
      isFile: () => existing.has(target),
      mode: 0o755,
    }),
    accessSync: () => undefined,
    constants: { X_OK: 1 },
  };
  let invokedPath = '';
  const validation = validatePythonExecutable('/Users/teacher/.venv/xedu', {
    platform: 'darwin',
    fsImpl,
    runner: (command) => {
      invokedPath = command;
      return { status: 0, stdout: 'Python 3.12.4', stderr: '' };
    },
  });

  assert.equal(validation.success, true);
  assert.equal(validation.resolvedPath, '/Users/teacher/.venv/xedu/bin/python3');
  assert.equal(invokedPath, '/Users/teacher/.venv/xedu/bin/python3');
});

test('packaged external-Python builds never fall back to a bundled Python directory', () => {
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

test('packaged bundled-Python builds fall back to their packaged interpreter', () => {
  const bundledPython = '/Applications/XEdu Client.app/Contents/Resources/python_env/bin/python3';
  const fsImpl = {
    existsSync: (target) => target === bundledPython,
    statSync: () => ({ isFile: () => true, mode: 0o755 }),
    accessSync: () => undefined,
  };

  assert.equal(
    resolvePythonExecutable({
      platform: 'darwin',
      packaged: true,
      configuredPath: '',
      selectedPath: '',
      bundledPythonBaseDir: '/Applications/XEdu Client.app/Contents/Resources/python_env',
      fsImpl,
    }),
    bundledPython,
  );
});

test('Python environment scanning includes project environments and direct executables', () => {
  const existingDirectories = new Set([
    '/repo',
    '/repo/python_env_minimal',
    '/repo/.venv',
    '/Users/teacher',
  ]);
  const existingFiles = new Set([
    '/repo/python_env_minimal/bin/python3',
    '/repo/.venv/bin/python3',
    '/opt/homebrew/bin/python3',
  ]);
  const fsImpl = {
    statSync: (target) => ({
      isDirectory: () => existingDirectories.has(target),
      isFile: () => existingFiles.has(target),
      mode: 0o755,
    }),
    readdirSync: (target) => {
      if (target === '/repo') {
        return [
          { name: 'python_env_minimal', isDirectory: () => true },
          { name: '.venv', isDirectory: () => true },
        ];
      }
      return [];
    },
    accessSync: () => undefined,
    constants: { X_OK: 1 },
  };
  const runner = (command) => ({ status: 0, stdout: `Python ${command.includes('.venv') ? '3.11.9' : '3.12.8'}`, stderr: '' });

  const environments = discoverPythonEnvironments({
    platform: 'darwin',
    projectRoot: '/repo',
    homeDir: '/Users/teacher',
    envPath: '/opt/homebrew/bin',
    fsImpl,
    runner,
  });

  assert.deepEqual(
    environments.map((item) => item.path),
    [
      '/repo/.venv/bin/python3',
      '/repo/python_env_minimal/bin/python3',
      '/opt/homebrew/bin/python3',
    ],
  );
  assert.match(environments[0].label, /项目环境/);
  assert.match(environments[2].label, /系统环境/);
});

test('configured Python is preserved in scan results even when it is outside known roots', () => {
  const existingFiles = new Set(['/custom/python/bin/python3']);
  const fsImpl = {
    statSync: (target) => ({
      isDirectory: () => false,
      isFile: () => existingFiles.has(target),
      mode: 0o755,
    }),
    readdirSync: () => [],
    accessSync: () => undefined,
    constants: { X_OK: 1 },
  };

  const environments = discoverPythonEnvironments({
    platform: 'darwin',
    configuredPath: '/custom/python/bin/python3',
    fsImpl,
    runner: () => ({ status: 0, stdout: 'Python 3.12.4', stderr: '' }),
  });

  assert.equal(environments.length, 1);
  assert.equal(environments[0].path, '/custom/python/bin/python3');
  assert.match(environments[0].label, /当前配置/);
});
