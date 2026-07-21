import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const repoRoot = new URL('../../', import.meta.url);
const readRepoFile = (relativePath) => readFile(new URL(relativePath, repoRoot), 'utf8');
const require = createRequire(import.meta.url);

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

test('release package requires a teacher-selected local Python environment', async () => {
  const packageJson = JSON.parse(await readRepoFile('package.json'));
  const buildText = JSON.stringify(packageJson.build);

  assert.doesNotMatch(buildText, /python_env(?:_win)?/);
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

test('external-Python package remains an explicitly named optional variant', () => {
  const buildConfig = require('../../electron-builder.external-python.cjs');
  const resourceSources = buildConfig.extraResources.map(({ from }) => from);
  const docsResource = buildConfig.extraResources.find(({ to }) => to === 'docs');

  assert.equal(buildConfig.directories.output, 'dist-external-python');
  assert.equal(resourceSources.includes('checkpoint'), false);
  assert.equal(resourceSources.some((source) => /^python_env/.test(source)), false);
  assert.deepEqual(docsResource?.filter, [
    'index.json',
    'overview/project-map.md',
    'overview/xedu-introduction.md',
    'overview/quickstart.md',
    'components/**/*',
    'teacher/**/*',
  ]);
  assert.equal(buildConfig.mac.artifactName, '${productName}-${version}-external-python-${arch}.${ext}');
  assert.equal(buildConfig.win.artifactName, '${productName}-${version}-external-python-${arch}.${ext}');
});

test('32-bit Windows external-Python package targets ia32 without bundled runtime', () => {
  const buildConfig = require('../../electron-builder.external-python.win32.cjs');
  const resourceSources = buildConfig.extraResources.map(({ from }) => from);

  assert.equal(buildConfig.directories.output, 'dist-external-python-win32');
  assert.deepEqual(buildConfig.win.target, [
    { target: 'nsis', arch: ['ia32'] },
    { target: 'dir', arch: ['ia32'] },
  ]);
  assert.equal(buildConfig.win.artifactName, '${productName}-${version}-external-python-win32.${ext}');
  assert.equal(resourceSources.some((source) => /^python_env/.test(source)), false);
  assert.equal(resourceSources.includes('checkpoint'), false);
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
});
