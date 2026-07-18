import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const repoRoot = new URL('../../', import.meta.url);
const readRepoFile = (relativePath) => readFile(new URL(relativePath, repoRoot), 'utf8');

test('release package keeps runtime backend outside asar and filters test data', async () => {
  const packageJson = JSON.parse(await readRepoFile('package.json'));
  const files = packageJson.build.files;
  const backendResource = packageJson.build.extraResources.find(({ from }) => from === 'backend');
  const resourceSources = packageJson.build.extraResources.map(({ from }) => from);

  assert.doesNotMatch(files.join('\n'), /^(backend|config|scripts)\//m);
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
