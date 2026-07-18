import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const repoRoot = new URL('../../', import.meta.url);
const readRepoFile = (relativePath) => readFile(new URL(relativePath, repoRoot), 'utf8');

test('checkpoint provisioner requires a verified archive hash and rejects unsafe archive paths', async () => {
  const source = await readRepoFile('scripts/provision_checkpoint_bundle.mjs');
  assert.match(source, /XEDU_CHECKPOINT_BUNDLE_URL/);
  assert.match(source, /XEDU_CHECKPOINT_BUNDLE_SHA256/);
  assert.match(source, /createHash\('sha256'\)/);
  assert.match(source, /startsWith\('\/'\)/);
  assert.match(source, /split\('\/'\)\.includes\('\.\.'\)/);
  assert.match(source, /top-level checkpoint/);
});

test('release workflow provisions the same checkpoint contract on every runner', async () => {
  const workflow = await readRepoFile('.github/workflows/release.yml');
  assert.equal((workflow.match(/provision_checkpoint_bundle\.mjs/g) ?? []).length, 3);
  assert.equal((workflow.match(/XEDU_CHECKPOINT_BUNDLE_URL:/g) ?? []).length, 3);
  assert.equal((workflow.match(/XEDU_CHECKPOINT_BUNDLE_SHA256:/g) ?? []).length, 3);
});
