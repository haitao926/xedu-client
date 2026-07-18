import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { access, cp, lstat, mkdir, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { spawn } from 'node:child_process';
const destination = path.resolve(process.env.XEDU_CHECKPOINT_DESTINATION || 'checkpoint');
const bundleUrl = String(process.env.XEDU_CHECKPOINT_BUNDLE_URL || '').trim();
const expectedSha256 = String(process.env.XEDU_CHECKPOINT_BUNDLE_SHA256 || '').trim().toLowerCase();

async function isDirectory(target) {
  try {
    return (await lstat(target)).isDirectory();
  } catch {
    return false;
  }
}

async function isSymlink(target) {
  try {
    return (await lstat(target)).isSymbolicLink();
  } catch {
    return false;
  }
}

async function checkpointLooksProvisioned() {
  return isDirectory(destination) && access(path.join(destination, 'body17.onnx')).then(() => true).catch(() => false);
}

async function downloadBundle(target) {
  if (!/^https?:\/\//i.test(bundleUrl)) {
    throw new Error('XEDU_CHECKPOINT_BUNDLE_URL must be an HTTPS or HTTP URL');
  }
  if (!/^[a-f0-9]{64}$/.test(expectedSha256)) {
    throw new Error('XEDU_CHECKPOINT_BUNDLE_SHA256 must be a 64-character SHA-256 hex digest');
  }

  const response = await fetch(bundleUrl, { redirect: 'error' });
  if (!response.ok || !response.body) {
    throw new Error(`checkpoint bundle download failed with HTTP ${response.status}`);
  }
  const hash = createHash('sha256');
  const hashingStream = new TransformStream({
    transform(chunk, controller) {
      hash.update(chunk);
      controller.enqueue(chunk);
    },
  });
  await pipeline(response.body.pipeThrough(hashingStream), createWriteStream(target));
  const actualSha256 = hash.digest('hex');
  if (actualSha256 !== expectedSha256) {
    throw new Error(`checkpoint bundle SHA-256 mismatch: expected ${expectedSha256}, found ${actualSha256}`);
  }
}

function runTar(args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn('tar', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`tar failed (${code}): ${stderr.trim() || 'unknown error'}`));
    });
  });
}

function validateArchiveEntries(listing) {
  const entries = listing.split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean);
  if (!entries.some((entry) => entry === 'checkpoint' || entry === 'checkpoint/')) {
    throw new Error('checkpoint bundle must contain a top-level checkpoint/ directory');
  }
  for (const entry of entries) {
    const normalized = entry.replace(/^\.\//, '');
    if (normalized.startsWith('/') || normalized.split('/').includes('..')) {
      throw new Error(`checkpoint bundle contains an unsafe archive path: ${entry}`);
    }
    if (!normalized.startsWith('checkpoint/')) {
      throw new Error(`checkpoint bundle contains an unexpected top-level path: ${entry}`);
    }
  }
}

async function provision() {
  if (await checkpointLooksProvisioned()) {
    console.log(`[checkpoint] using pre-provisioned bundle at ${destination}`);
    return;
  }
  if (!bundleUrl || !expectedSha256) {
    throw new Error(
      'checkpoint bundle is missing. Provision checkpoint/ locally or set both '
      + 'XEDU_CHECKPOINT_BUNDLE_URL and XEDU_CHECKPOINT_BUNDLE_SHA256.',
    );
  }
  if (await isSymlink(destination)) throw new Error('checkpoint destination must not be a symlink');

  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'xedu-checkpoint-'));
  const archivePath = path.join(tempRoot, 'checkpoint.tar.gz');
  const extractRoot = path.join(tempRoot, 'extract');
  try {
    await mkdir(extractRoot, { recursive: true });
    await downloadBundle(archivePath);
    validateArchiveEntries(await runTar(['-tzf', archivePath], tempRoot));
    await runTar(['-xzf', archivePath, '-C', extractRoot], tempRoot);
    const extractedCheckpoint = path.join(extractRoot, 'checkpoint');
    if (!(await isDirectory(extractedCheckpoint))) throw new Error('extracted checkpoint directory is missing');
    await mkdir(destination, { recursive: true });
    await cp(extractedCheckpoint, destination, { recursive: true, force: false, errorOnExist: false });
    console.log(`[checkpoint] provisioned verified bundle at ${destination}`);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

try {
  await provision();
} catch (error) {
  console.error(`[checkpoint] ${error.message}`);
  process.exitCode = 1;
}
