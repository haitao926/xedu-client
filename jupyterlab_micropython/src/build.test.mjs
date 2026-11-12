import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { resolveBuildCore } from '../scripts/build.mjs';

function createCoreFixture(t, platform = 'linux') {
  const repoRoot = mkdtempSync(join(tmpdir(), 'xedu-build-core-'));
  t.after(() => rmSync(repoRoot, { recursive: true, force: true }));
  const corePath = platform === 'win32'
    ? join(repoRoot, 'python_env_win_minimal', 'Lib', 'site-packages', 'jupyterlab', 'static')
    : join(repoRoot, 'python_env_minimal', 'lib', 'python3.12', 'site-packages', 'jupyterlab', 'static');
  const metadata = {
    version: '4.5.9',
    dependencies: { '@jupyterlab/application': '~4.5.9' },
    resolutions: { '@lumino/widgets': '~2.3.1' },
  };
  writeCore(corePath, metadata);
  return { repoRoot, corePath, metadata };
}

function writeCore(corePath, metadata) {
  mkdirSync(corePath, { recursive: true });
  writeFileSync(join(corePath, 'package.json'), JSON.stringify(metadata));
}

function neverExecPython(executable) {
  assert.fail(`Metadata inspection must not execute Python: ${executable}`);
}

test('build core defaults to the shipped Python, never ambient python3 or PYTHON', (t) => {
  const { repoRoot, corePath, metadata } = createCoreFixture(t);
  const core = resolveBuildCore({
    repoRoot,
    platform: 'linux',
    env: { PYTHON: 'must-not-run', PATH: '/ambient/python3' },
    execPython: neverExecPython,
  });
  assert.equal(core.version, '4.5.9');
  assert.equal(core.runtimeVersion, core.version);
  assert.equal(core.corePath, corePath);
  assert.deepEqual(core.metadata, metadata);
});

test('explicit build Python must exactly match the shipped runtime before webpack runs', (t) => {
  const { repoRoot } = createCoreFixture(t);
  // Even a patch difference is rejected, not merely a different minor version.
  for (const version of ['4.5.10', '4.6.1']) {
    assert.throws(() => resolveBuildCore({
      repoRoot,
      platform: 'linux',
      env: { XEDU_PYTHON_EXECUTABLE: 'selected-python' },
      execPython(executable) {
        assert.equal(executable, 'selected-python');
        return JSON.stringify({ version, corePath: join(repoRoot, 'missing-core') });
      },
    }), {
      message: `Selected JupyterLab ${version} does not match shipped runtime 4.5.9`,
    });
  }
});

test('explicit build Python accepts matching selected core metadata', (t) => {
  const { repoRoot, metadata } = createCoreFixture(t);
  const selectedCorePath = join(repoRoot, 'selected-core');
  writeCore(selectedCorePath, metadata);
  const calls = [];
  const core = resolveBuildCore({
    repoRoot,
    platform: 'linux',
    env: { PYTHON: 'must-not-run', XEDU_PYTHON_EXECUTABLE: 'selected-python' },
    execPython(executable) {
      calls.push(executable);
      return JSON.stringify({ version: '4.5.9', corePath: selectedCorePath });
    },
  });
  assert.deepEqual(calls, ['selected-python']);
  assert.equal(core.version, core.runtimeVersion);
  assert.equal(core.corePath, selectedCorePath);
  assert.deepEqual(core.metadata, metadata);
});

for (const [field, mismatch] of [
  ['version', '4.5.10'],
  ['dependencies', { '@jupyterlab/application': '~4.5.10' }],
  ['resolutions', { '@lumino/widgets': '~2.4.0' }],
]) {
  test(`explicit build Python rejects mismatched core ${field}`, (t) => {
    const { repoRoot, metadata } = createCoreFixture(t);
    const selectedCorePath = join(repoRoot, 'selected-core');
    writeCore(selectedCorePath, { ...metadata, [field]: mismatch });
    assert.throws(() => resolveBuildCore({
      repoRoot,
      platform: 'linux',
      env: { XEDU_PYTHON_EXECUTABLE: 'selected-python' },
      execPython(executable) {
        assert.equal(executable, 'selected-python');
        return JSON.stringify({ version: '4.5.9', corePath: selectedCorePath });
      },
    }), /Selected core metadata does not match shipped JupyterLab 4\.5\.9/);
  });
}

test('Windows shipped core metadata also targets 4.5.9 without running Windows Python', (t) => {
  const { repoRoot, corePath, metadata } = createCoreFixture(t, 'win32');
  const core = resolveBuildCore({
    repoRoot,
    platform: 'win32',
    env: { PYTHON: 'must-not-run' },
    execPython: neverExecPython,
  });
  assert.equal(core.version, '4.5.9');
  assert.equal(core.runtimeVersion, core.version);
  assert.equal(core.corePath, corePath);
  assert.deepEqual(core.metadata, metadata);
});
