import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const repoRoot = new URL('../../', import.meta.url);
const readRepoFile = (relativePath) => readFile(new URL(relativePath, repoRoot), 'utf8');
const require = createRequire(import.meta.url);

function loadReleaseConfig() {
  const previousEnv = { ...process.env };
  Object.assign(process.env, {
    CSC_LINK: 'file:///tmp/mac-cert.p12',
    CSC_KEY_PASSWORD: 'test-password',
    APPLE_ID: 'teacher-release@example.com',
    APPLE_APP_SPECIFIC_PASSWORD: 'app-specific-password',
    APPLE_TEAM_ID: 'ABCDE12345',
  });
  const configPath = require.resolve('../../electron-builder.release.cjs');
  delete require.cache[configPath];
  try {
    return require(configPath);
  } finally {
    delete require.cache[configPath];
    for (const key of Object.keys(process.env)) {
      if (!(key in previousEnv)) delete process.env[key];
    }
    Object.assign(process.env, previousEnv);
  }
}

test('release package keeps runtime backend outside asar and filters test data', async () => {
  const packageJson = JSON.parse(await readRepoFile('package.json'));
  const files = packageJson.build.files;
  const backendResource = packageJson.build.extraResources.find(({ from }) => from === 'backend');
  const resourceSources = packageJson.build.extraResources.map(({ from }) => from);

  assert.doesNotMatch(files.join('\n'), /^(backend|config|scripts)\//m);
  assert.equal(files.includes('electron/main/**/*.js'), true);
  assert.equal(resourceSources.includes('python_env'), false);
  assert.equal(resourceSources.includes('python_env_win'), false);
  assert.deepEqual(backendResource?.filter, [
    '**/*',
    '!**/tests',
    '!**/tests/**/*',
    '!**/__pycache__',
    '!**/__pycache__/**/*',
    '!**/.pytest_cache',
    '!**/.pytest_cache/**/*',
    '!**/checkpoint',
    '!**/checkpoint/**/*',
    '!sasu/zhangjiang-image-recognition-standard',
    '!sasu/zhangjiang-image-recognition-standard/**/*',
  ]);
});

test('Windows executable editing stays enabled so the application icon reaches shortcuts', async () => {
  const [packageJson, icon] = await Promise.all([
    readRepoFile('package.json').then((text) => JSON.parse(text)),
    readFile(new URL('../../resources/xedu-logo.ico', import.meta.url)),
  ]);

  assert.equal(packageJson.build.win.icon, 'resources/xedu-logo.ico');
  assert.notEqual(packageJson.build.win.signAndEditExecutable, false);
  assert.equal(icon.readUInt16LE(0), 0);
  assert.equal(icon.readUInt16LE(2), 1);
});

test('official release package includes the canonical minimal Python runtime', () => {
  const releaseConfig = loadReleaseConfig();
  const pythonResource = releaseConfig.extraResources.find(({ to }) => to === 'python_env');

  assert.equal(pythonResource?.from, 'python_env_minimal');
  assert.equal(pythonResource?.filter.includes('!**/*.onnx'), true);
  assert.equal(pythonResource?.filter.includes('!**/*.pth'), true);
});

test('bundled-Python package includes its runtime but excludes checkpoint models', () => {
  const buildConfig = require('../../electron-builder.bundled-python-no-models.cjs');
  const resourceSources = buildConfig.extraResources.map(({ from }) => from);
  const pythonResource = buildConfig.extraResources.find(({ to }) => to === 'python_env');

  assert.equal(buildConfig.directories.output, 'dist-portable');
  assert.equal(resourceSources.includes('checkpoint'), false);
  assert.equal(pythonResource?.from, 'python_env_minimal');
  assert.equal(pythonResource?.filter.includes('!**/*.onnx'), true);
  assert.equal(pythonResource?.filter.includes('!**/*.pt'), true);
  assert.equal(pythonResource?.filter.includes('!**/*.pth'), true);
  assert.equal(pythonResource?.filter.includes('!**/*.safetensors'), true);
});

test('minimal package includes a compact Python runtime and excludes checkpoint models', () => {
  const buildConfig = require('../../electron-builder.minimal.cjs');
  const resourceSources = buildConfig.extraResources.map(({ from }) => from);
  const pythonResource = buildConfig.extraResources.find(({ to }) => to === 'python_env');

  assert.equal(buildConfig.directories.output, 'dist-minimal');
  assert.equal(pythonResource?.from, 'python_env_minimal');
  assert.equal(resourceSources.includes('checkpoint'), false);
  assert.deepEqual(buildConfig.win.target, [
    { target: 'nsis', arch: ['x64'] },
    { target: 'dir', arch: ['x64'] },
  ]);
  assert.equal(buildConfig.nsis.artifactName, '${productName}-${version}-minimal-${arch}.${ext}');
  assert.deepEqual(buildConfig.mac.target, [
    { target: 'dmg', arch: ['arm64'] },
    { target: 'zip', arch: ['arm64'] },
  ]);
});

test('Windows minimal package maps the Windows runtime to the canonical Python directory', () => {
  const buildConfig = require('../../electron-builder.minimal.win.cjs');
  const pythonResource = buildConfig.extraResources.find(({ to }) => to === 'python_env');

  assert.equal(pythonResource?.from, 'python_env_win_minimal');
  assert.equal(buildConfig.win.artifactName, '${productName}-${version}-minimal-${arch}.${ext}');
});

test('shipping packages always include a bundled Python runtime', async () => {
  const packageJson = JSON.parse(await readRepoFile('package.json'));
  const scripts = packageJson.scripts;
  assert.equal(scripts['electron:build:external-python'], undefined);
  assert.equal(scripts['electron:build:external-python:mac'], undefined);
  assert.equal(scripts['electron:build:external-python:win'], undefined);
  assert.equal(scripts['electron:build:external-python:win32'], undefined);
  assert.match(JSON.stringify(scripts), /electron-builder\.bundled-python-no-models/);
  assert.match(JSON.stringify(scripts), /electron-builder\.minimal/);
});

test('default docs describe bundled Python as the shipping package', async () => {
  const [readme, install, troubleshooting] = await Promise.all([
    readRepoFile('README.md'),
    readRepoFile('docs/teacher/INSTALL.md'),
    readRepoFile('docs/teacher/TROUBLESHOOTING.md'),
  ]);
  assert.doesNotMatch(readme, /不内置 `python_env`/);
  assert.match(readme, /始终内置便携 Python/);
  assert.match(install, /安装包携带便携 Python 环境/);
  assert.match(install, /不再提供“外置 Python \/ 不携带 Python”安装包/);
  assert.doesNotMatch(troubleshooting, /不包含 `python_env`/);
  assert.match(troubleshooting, /已内置便携 Python 运行时/);
});

test('external-Python builder configs are not shipped', async () => {
  const { access } = await import('node:fs/promises');
  await assert.rejects(
    () => access(new URL('../../electron-builder.external-python.cjs', import.meta.url)),
    { code: 'ENOENT' },
  );
  await assert.rejects(
    () => access(new URL('../../electron-builder.external-python.win32.cjs', import.meta.url)),
    { code: 'ENOENT' },
  );
});

test('macOS release produces both drag-install and archive artifacts', async () => {
  const [packageJsonText, entitlements] = await Promise.all([
    readRepoFile('package.json'),
    readRepoFile('resources/entitlements.mac.plist'),
  ]);
  const packageJson = JSON.parse(packageJsonText);
  const targets = packageJson.build.mac.target.map(({ target, arch }) => ({ target, arch }));

  assert.deepEqual(targets, [
    { target: 'dmg', arch: ['arm64'] },
    { target: 'zip', arch: ['arm64'] },
  ]);
  assert.equal(packageJson.build.mac.hardenedRuntime, true);
  assert.equal(packageJson.build.mac.entitlements, 'resources/entitlements.mac.plist');
  assert.match(entitlements, /com\.apple\.security\.cs\.allow-jit/);
  assert.match(entitlements, /com\.apple\.security\.device\.camera/);
  assert.match(packageJson.build.mac.extendInfo.NSCameraUsageDescription, /摄像头/);
  assert.match(packageJson.build.mac.extendInfo.NSLocalNetworkUsageDescription, /局域网|网络/);
});
