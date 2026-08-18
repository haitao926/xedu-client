import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildPythonChildEnvironment,
  discoverPythonEnvironments,
  getPythonDialogFilters,
  getPythonExecutableCandidates,
  getXEduProResourceDirectories,
  parseWindowsPythonLauncherPaths,
  readConfiguredPythonExecutable,
  repairPythonWithBundledFallback,
  resolveBackendPythonExecutable,
  resolvePythonSelectionTarget,
  resolvePythonExecutable,
  validatePythonExecutable,
} from '../main/python-runtime.js';

test('packaged backend always uses the bundled Python independently of the experiment selection', () => {
  const bundledPython = 'C:\\Program Files\\XEdu Client\\resources\\python_env\\python.exe';
  const externalPython = 'E:\\XEdu\\env\\python.exe';
  const fsImpl = {
    statSync: (target) => ({
      isFile: () => target === bundledPython || target === externalPython,
    }),
  };

  assert.equal(
    resolveBackendPythonExecutable({
      platform: 'win32',
      packaged: true,
      bundledPythonBaseDir: 'C:\\Program Files\\XEdu Client\\resources\\python_env',
      configuredPath: externalPython,
      selectedPath: externalPython,
      envPath: externalPython,
      fsImpl,
    }),
    bundledPython,
  );
});

test('development backend can use an explicit backend-only interpreter override', () => {
  const backendPython = '/opt/xedu/backend/bin/python3';
  const fsImpl = {
    statSync: (target) => ({ isFile: () => target === backendPython, mode: 0o755 }),
    accessSync: () => undefined,
  };

  assert.equal(
    resolveBackendPythonExecutable({
      platform: 'darwin',
      packaged: false,
      backendOverridePath: backendPython,
      projectRoot: '/repo',
      fsImpl,
    }),
    backendPython,
  );
});

test('XEduPro conda-pack Python receives the activation PATH required by its DLLs', () => {
  const environmentRoot = 'E:\\XEdu\\env';
  const existingDirectories = new Set([
    `${environmentRoot}\\conda-meta`,
    `${environmentRoot}\\Library`,
  ]);
  const fsImpl = {
    statSync: (target) => ({
      isDirectory: () => existingDirectories.has(target),
    }),
  };

  const env = buildPythonChildEnvironment({
    pythonExecutable: `${environmentRoot}\\python.exe`,
    platform: 'win32',
    baseEnv: { Path: 'C:\\Windows\\System32;E:\\XEdu\\env\\Scripts' },
    fsImpl,
  });

  assert.equal(env.CONDA_PREFIX, environmentRoot);
  assert.equal(
    env.Path,
    [
      environmentRoot,
      `${environmentRoot}\\Library\\mingw-w64\\bin`,
      `${environmentRoot}\\Library\\usr\\bin`,
      `${environmentRoot}\\Library\\bin`,
      `${environmentRoot}\\Scripts`,
      'C:\\Windows\\System32',
    ].join(';'),
  );
  assert.equal(Object.hasOwn(env, 'PATH'), false);
});

test('ordinary Windows venv uses its root and Scripts directory without conda variables', () => {
  const env = buildPythonChildEnvironment({
    pythonExecutable: 'D:\\teacher env\\Scripts\\python.exe',
    platform: 'win32',
    baseEnv: { PATH: 'C:\\Windows\\System32' },
    fsImpl: {
      statSync: () => ({ isDirectory: () => false }),
    },
  });

  assert.equal(
    env.PATH,
    'D:\\teacher env;D:\\teacher env\\Scripts;C:\\Windows\\System32',
  );
  assert.equal(Object.hasOwn(env, 'CONDA_PREFIX'), false);
});

test('XEduPro root launchers expose bundled checkpoint directories to the client', () => {
  const existingFiles = new Set([
    'E:\\XEdu\\Jupyter编辑器.bat',
    'E:\\XEdu\\启动cmd.bat',
  ]);
  const existingDirectories = new Set([
    'E:\\XEdu\\checkpoints',
    'E:\\XEdu\\my_checkpoints',
    'E:\\XEdu\\EasyDL',
  ]);
  const fsImpl = {
    statSync: (target) => ({
      isFile: () => existingFiles.has(target),
      isDirectory: () => existingDirectories.has(target),
    }),
  };

  assert.deepEqual(
    getXEduProResourceDirectories('E:\\XEdu\\env\\python.exe', {
      platform: 'win32',
      fsImpl,
    }),
    {
      root: 'E:\\XEdu',
      checkpoints: [
        'E:\\XEdu\\checkpoints',
        'E:\\XEdu\\my_checkpoints',
      ],
    },
  );
});

test('ordinary Conda environments are not treated as an XEduPro installation', () => {
  assert.deepEqual(
    getXEduProResourceDirectories('C:\\Miniconda\\envs\\course\\python.exe', {
      platform: 'win32',
      fsImpl: { statSync: () => ({ isFile: () => false, isDirectory: () => false }) },
    }),
    { root: '', checkpoints: [] },
  );
});

test('non-Windows Python child environments preserve the caller environment', () => {
  const baseEnv = { PATH: '/usr/local/bin:/usr/bin', CUSTOM_VALUE: 'kept' };

  assert.deepEqual(
    buildPythonChildEnvironment({
      pythonExecutable: '/Users/teacher/.venv/bin/python3',
      platform: 'darwin',
      baseEnv,
    }),
    baseEnv,
  );
});

test('SSL failure falls back to the verified bundled Python in packaged builds', async () => {
  const selectedPath = 'E:\\XEdu\\env\\python.exe';
  const bundledPath = 'C:\\Program Files\\XEdu Client\\resources\\python_env\\python.exe';
  const existingFiles = new Set([bundledPath]);
  const fsImpl = {
    statSync: (target) => ({
      isDirectory: () => false,
      isFile: () => existingFiles.has(target),
    }),
  };
  const attempted = [];

  const repaired = await repairPythonWithBundledFallback({
    selectedPath,
    platform: 'win32',
    packaged: true,
    bundledPythonBaseDir: 'C:\\Program Files\\XEdu Client\\resources\\python_env',
    fsImpl,
    repair: async (target) => {
      attempted.push(target);
      if (target === selectedPath) {
        return { success: false, error_code: 'ssl_unavailable', message: '缺少 SSL' };
      }
      return { success: true, message: 'Python 环境已就绪', warnings: [] };
    },
  });

  assert.deepEqual(attempted, [selectedPath, bundledPath]);
  assert.equal(repaired.success, true);
  assert.equal(repaired.path, bundledPath);
  assert.equal(repaired.fallback_used, true);
  assert.equal(repaired.fallback_from, selectedPath);
  assert.match(repaired.message, /已自动改用应用内置 Python/);
});

test('optional XEdu failure never switches away from the selected Python', async () => {
  const selectedPath = 'E:\\XEdu\\env\\python.exe';
  let attempts = 0;
  const original = {
    success: true,
    message: 'Jupyter 环境已就绪，XEdu 增强功能暂不可用。',
    warnings: ['xedu-python 安装失败'],
  };

  const repaired = await repairPythonWithBundledFallback({
    selectedPath,
    platform: 'win32',
    packaged: true,
    bundledPythonBaseDir: 'C:\\Program Files\\XEdu Client\\resources\\python_env',
    fsImpl: { statSync: () => ({ isDirectory: () => false, isFile: () => true }) },
    repair: async () => {
      attempts += 1;
      return original;
    },
  });

  assert.equal(attempts, 1);
  assert.equal(repaired, original);
});

test('Python environment scanning always includes the bundled runtime first', () => {
  const bundledPython = '/Applications/XEdu Client.app/Contents/Resources/python_env/bin/python3';
  const systemPython = '/usr/local/bin/python3';
  const existingDirectories = new Set([
    '/Applications/XEdu Client.app/Contents/Resources/python_env',
  ]);
  const existingFiles = new Set([bundledPython, systemPython]);
  const fsImpl = {
    statSync: (target) => ({
      isDirectory: () => existingDirectories.has(target),
      isFile: () => existingFiles.has(target),
      mode: 0o755,
    }),
    readdirSync: () => [],
    accessSync: () => undefined,
    constants: { X_OK: 1 },
  };

  const environments = discoverPythonEnvironments({
    platform: 'darwin',
    bundledPythonBaseDir: '/Applications/XEdu Client.app/Contents/Resources/python_env',
    envPath: '/usr/local/bin',
    fsImpl,
    runner: () => ({ status: 0, stdout: 'Python 3.12.8', stderr: '' }),
  });

  assert.equal(environments[0].path, bundledPython);
  assert.equal(environments[0].source, 'bundled');
  assert.match(environments[0].label, /应用内置 Python/);
});

test('Windows Python Launcher output contributes registered interpreter paths', () => {
  assert.deepEqual(
    parseWindowsPythonLauncherPaths(`
 -V:3.12 *        C:\\Users\\teacher\\AppData\\Local\\Programs\\Python\\Python312\\python.exe
 -V:3.11          D:\\Python311\\python.exe
`),
    [
      'C:\\Users\\teacher\\AppData\\Local\\Programs\\Python\\Python312\\python.exe',
      'D:\\Python311\\python.exe',
    ],
  );
});

test('packaged startup ignores Python paths that predate explicit selection confirmation', () => {
  const configPath = 'C:\\Users\\teacher\\AppData\\Roaming\\xedu-client\\config\\config.json';
  const fsImpl = {
    readFileSync: () => JSON.stringify({
      jupyter: { python_executable: 'E:\\XEdu\\env\\python.exe' },
    }),
  };

  assert.equal(
    readConfiguredPythonExecutable(configPath, fsImpl, { requireConfirmed: true }),
    '',
  );
});

test('packaged startup preserves a Python path confirmed by the current selection flow', () => {
  const configPath = 'C:\\Users\\teacher\\AppData\\Roaming\\xedu-client\\config\\config.json';
  const fsImpl = {
    readFileSync: () => JSON.stringify({
      jupyter: {
        python_executable: 'E:\\XEdu\\env\\python.exe',
        python_selection_confirmed: true,
      },
    }),
  };

  assert.equal(
    readConfiguredPythonExecutable(configPath, fsImpl, { requireConfirmed: true }),
    'E:\\XEdu\\env\\python.exe',
  );
});

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

test('Python 3.8 is accepted as the minimum supported teacher environment', () => {
  const fsImpl = {
    statSync: () => ({ isDirectory: () => false, isFile: () => true, mode: 0o755 }),
    accessSync: () => undefined,
    constants: { X_OK: 1 },
  };

  const validation = validatePythonExecutable('/usr/local/bin/python3.8', {
    platform: 'darwin',
    fsImpl,
    runner: () => ({ status: 0, stdout: 'Python 3.8.20', stderr: '' }),
  });

  assert.equal(validation.success, true, validation.message);
});

test('Python 3.7 remains below the supported teacher environment range', () => {
  const fsImpl = {
    statSync: () => ({ isDirectory: () => false, isFile: () => true, mode: 0o755 }),
    accessSync: () => undefined,
    constants: { X_OK: 1 },
  };

  const validation = validatePythonExecutable('/usr/local/bin/python3.7', {
    platform: 'darwin',
    fsImpl,
    runner: () => ({ status: 0, stdout: 'Python 3.7.17', stderr: '' }),
  });

  assert.equal(validation.success, false);
  assert.match(validation.message, /至少需要 Python 3\.8\.0/);
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

test('an explicit Python environment override takes precedence over stale config', () => {
  const existing = new Set([
    '/repo/python_env_minimal/bin/python3',
    '/Users/teacher/old-env/bin/python3',
  ]);
  const fsImpl = {
    existsSync: (target) => existing.has(target),
    statSync: () => ({ isFile: () => true, mode: 0o755 }),
    accessSync: () => undefined,
  };

  assert.equal(
    resolvePythonExecutable({
      platform: 'darwin',
      packaged: false,
      configuredPath: '/Users/teacher/old-env/bin/python3',
      envPath: '/repo/python_env_minimal/bin/python3',
      projectRoot: '/repo',
      fsImpl,
    }),
    '/repo/python_env_minimal/bin/python3',
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

test('scan ordering keeps configured and selected environments ahead of project and system results', () => {
  const existingDirectories = new Set([
    '/custom/env',
    '/selected/env',
    '/repo/.venv',
  ]);
  const existingFiles = new Set([
    '/custom/env/bin/python3',
    '/selected/env/bin/python3',
    '/repo/.venv/bin/python3',
    '/usr/local/bin/python3',
  ]);
  const fsImpl = {
    statSync: (target) => ({
      isDirectory: () => existingDirectories.has(target),
      isFile: () => existingFiles.has(target),
      mode: 0o755,
    }),
    readdirSync: (target) => {
      if (target === '/repo') {
        return [{ name: '.venv', isDirectory: () => true }];
      }
      return [];
    },
    accessSync: () => undefined,
    constants: { X_OK: 1 },
  };

  const environments = discoverPythonEnvironments({
    platform: 'darwin',
    configuredPath: '/custom/env',
    selectedPath: '/selected/env',
    projectRoot: '/repo',
    envPath: '/usr/local/bin',
    fsImpl,
    runner: (command) => ({ status: 0, stdout: `Python ${command.includes('/selected/') ? '3.10.14' : '3.12.8'}`, stderr: '' }),
  });

  assert.deepEqual(
    environments.map((item) => item.path),
    [
      '/custom/env/bin/python3',
      '/selected/env/bin/python3',
      '/repo/.venv/bin/python3',
      '/usr/local/bin/python3',
    ],
  );
  assert.match(environments[0].label, /当前配置/);
  assert.match(environments[1].label, /当前选择/);
});

test('configured environment directories remain launchable for startup compatibility', () => {
  const existing = new Set(['/custom/env/bin/python3']);
  const fsImpl = {
    statSync: (target) => ({
      isDirectory: () => target === '/custom/env',
      isFile: () => existing.has(target),
      mode: 0o755,
    }),
    accessSync: () => undefined,
  };

  assert.equal(
    resolvePythonExecutable({
      platform: 'darwin',
      configuredPath: '/custom/env',
      packaged: true,
      fsImpl,
    }),
    '/custom/env/bin/python3',
  );
});
