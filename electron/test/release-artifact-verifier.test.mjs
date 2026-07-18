import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  validateReleaseTarget,
  verifyReleaseArtifact,
  writeReleaseManifest,
} from '../../scripts/verify_release_artifact.mjs';

async function createArtifactFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'xedu-release-'));
  const resources = path.join(root, 'resources');
  await mkdir(path.join(resources, 'scratch-editor', 'build'), { recursive: true });
  await mkdir(path.join(resources, 'backend'), { recursive: true });
  await mkdir(path.join(resources, 'checkpoint'), { recursive: true });
  await writeFile(path.join(resources, 'scratch-editor', 'build', 'index.html'), '<!doctype html>');
  return root;
}

test('release artifact verifier rejects a package without Scratch', async () => {
  const root = await createArtifactFixture();
  try {
    await rm(path.join(root, 'resources', 'scratch-editor'), { recursive: true });
    const result = await verifyReleaseArtifact(root, { expectedVersion: '2.0.0' });
    assert.equal(result.ok, false);
    assert.match(result.errors.join('\n'), /scratch-editor\/build\/index\.html/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('release artifact verifier accepts a complete unpacked package', async () => {
  const root = await createArtifactFixture();
  try {
    const result = await verifyReleaseArtifact(root, { expectedVersion: '2.0.0' });
    assert.equal(result.ok, true, result.errors.join('\n'));
    assert.equal(result.version, '2.0.0');
    assert.equal(result.resourcesPath, path.join(root, 'resources'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('release artifact verifier rejects a package containing a bundled Python environment', async () => {
  const root = await createArtifactFixture();
  try {
    await mkdir(path.join(root, 'resources', 'python_env'), { recursive: true });
    const result = await verifyReleaseArtifact(root, { expectedVersion: '2.0.0' });
    assert.equal(result.ok, false);
    assert.match(result.errors.join('\n'), /bundled Python environment/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('release artifact verifier rejects a version mismatch and duplicate backend', async () => {
  const root = await createArtifactFixture();
  try {
    await mkdir(path.join(root, 'resources', 'app', 'backend'), { recursive: true });
    await writeFile(path.join(root, 'package.json'), JSON.stringify({ version: '1.9.0' }));
    const result = await verifyReleaseArtifact(root, { expectedVersion: '2.0.0' });
    assert.equal(result.ok, false);
    assert.match(result.errors.join('\n'), /version mismatch/);
    assert.match(result.errors.join('\n'), /duplicate backend/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('release artifact verifier rejects removed Blockly-only paths', async () => {
  const root = await createArtifactFixture();
  try {
    await mkdir(path.join(root, 'resources', 'renderer', 'js'), { recursive: true });
    await writeFile(path.join(root, 'resources', 'renderer', 'js', 'blockly-workspace.js'), 'legacy');
    const result = await verifyReleaseArtifact(root, { expectedVersion: '2.0.0' });
    assert.equal(result.ok, false);
    assert.match(result.errors.join('\n'), /removed Blockly artifact/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('release artifact verifier rejects missing delivery files before hashing', async () => {
  const root = await createArtifactFixture();
  try {
    const result = await verifyReleaseArtifact(root, { expectedVersion: '2.0.0' });
    await assert.rejects(
      () => writeReleaseManifest(root, result, {
        output: path.join(root, 'release', 'manifest.json'),
        platform: 'win32',
        arch: 'x64',
        tag: 'v2.0.0-rc.1',
        commit: 'fixture-commit',
        artifacts: [path.join(root, 'missing.exe')],
      }),
      /artifact file not found/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('release target validation rejects a package built on the wrong platform', () => {
  assert.deepEqual(
    validateReleaseTarget({ platform: 'darwin', arch: 'arm64', actualPlatform: 'linux', actualArch: 'x64' }),
    [
      'platform mismatch: expected darwin, running on linux',
      'architecture mismatch: expected arm64, running on x64',
    ],
  );
});

test('release artifact verifier can write a hash manifest for a valid package', async () => {
  const root = await createArtifactFixture();
  const manifestPath = path.join(root, 'release', 'manifest.json');
  const installerPath = path.join(root, 'XEdu Client-2.0.0.exe');
  try {
    await writeFile(installerPath, 'signed-artifact-fixture');
    const result = await verifyReleaseArtifact(root, { expectedVersion: '2.0.0' });
    const manifest = await writeReleaseManifest(root, result, {
      output: manifestPath,
      platform: 'win32',
      arch: 'x64',
      tag: 'v2.0.0-rc.1',
      commit: 'fixture-commit',
      artifacts: [installerPath],
    });
    assert.equal(manifest.schemaVersion, 2);
    assert.equal(manifest.version, '2.0.0');
    assert.equal(manifest.platform, 'win32');
    assert.equal(manifest.arch, 'x64');
    assert.equal(manifest.gitTag, 'v2.0.0-rc.1');
    assert.equal(manifest.gitCommit, 'fixture-commit');
    assert.equal(manifest.artifacts[0].path, 'XEdu Client-2.0.0.exe');
    assert.match(manifest.artifacts[0].sha256, /^[a-f0-9]{64}$/);
    assert.equal(manifest.artifactRoot, undefined);
    assert.equal(manifest.files.some((file) => file.path.startsWith('/')), false);
    assert.ok(manifest.files.some((file) => file.path.endsWith('scratch-editor/build/index.html')));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
