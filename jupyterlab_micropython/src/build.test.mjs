import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import * as build from '../scripts/build.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

test('build core defaults to the shipped Python, never ambient python3 or PYTHON', () => {
  assert.equal(typeof build.resolveBuildCore, 'function');
  const core = build.resolveBuildCore({ repoRoot, env: { PYTHON: 'must-not-run' } });
  assert.equal(core.version, '4.5.9');
  assert.equal(core.runtimeVersion, core.version);
  assert.ok(core.corePath.startsWith(resolve(repoRoot, 'python_env_minimal')));
});

test('explicit build Python must match the shipped runtime before webpack runs', () => {
  assert.equal(typeof build.resolveBuildCore, 'function');
  assert.throws(() => build.resolveBuildCore({
    repoRoot,
    env: { XEDU_PYTHON_EXECUTABLE: 'selected-python' },
    execPython(executable) {
      assert.equal(executable, 'selected-python');
      return JSON.stringify({ version: '4.6.1', corePath: '/wrong/core' });
    },
  }), /4\.6\.1.*4\.5\.9/);
  const core = build.resolveBuildCore({
    repoRoot,
    env: { XEDU_PYTHON_EXECUTABLE: resolve(repoRoot, 'python_env_minimal/bin/python3') },
  });
  assert.equal(core.version, core.runtimeVersion);
});

test('Windows shipped core metadata also targets 4.5.9 without running Windows Python', () => {
  assert.equal(typeof build.resolveBuildCore, 'function');
  const core = build.resolveBuildCore({ repoRoot, platform: 'win32', env: {} });
  assert.equal(core.version, '4.5.9');
  assert.equal(core.runtimeVersion, core.version);
  assert.match(core.corePath, /python_env_win_minimal/);
});
