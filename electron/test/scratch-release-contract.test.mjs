import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const repoRoot = new URL('../../', import.meta.url);
const readRepoFile = (relativePath) => readFile(new URL(relativePath, repoRoot), 'utf8');

test('release scripts fail closed when the Scratch build is missing', async () => {
  const [packageJson, buildScript] = await Promise.all([
    readRepoFile('package.json'),
    readRepoFile('build.sh'),
  ]);

  assert.match(packageJson, /"check:scratch-build"\s*:\s*"node scripts\/check_scratch_build\.mjs"/);
  assert.match(packageJson, /"electron:build"\s*:\s*"npm run build:scratch && npm run check:scratch-build/);
  assert.match(packageJson, /"electron:pack"\s*:\s*"npm run build:scratch && npm run check:scratch-build/);
  const scripts = JSON.parse(packageJson).scripts;
  assert.match(buildScript, /npm run build:installer:mac/);
  for (const platform of ['mac', 'win']) {
    assert.match(scripts[`build:installer:${platform}`], /npm run build:scratch && npm run check:scratch-build && npm run build && electron-builder/);
  }
});

test('Scratch build checker validates the packaged entry point', async () => {
  const checker = await readRepoFile('scripts/check_scratch_build.mjs');
  assert.match(checker, /scratch-editor[\\/]build[\\/]index\.html/);
  assert.match(checker, /process\.exitCode\s*=\s*1/);
});
