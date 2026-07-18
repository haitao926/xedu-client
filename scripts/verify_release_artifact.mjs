import { access, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import process from 'node:process';

const REQUIRED_DIRECTORIES = ['backend', 'checkpoint'];
const FORBIDDEN_DIRECTORIES = ['python_env', 'python_env_win'];
const REQUIRED_FILES = ['scratch-editor/build/index.html'];
const FORBIDDEN_ARTIFACT_PATHS = [
  /(^|\/)renderer\/js\/blockly(?:\/|$)/i,
  /(^|\/)renderer\/public\/blockly(?:\/|$)/i,
  /(^|\/)blockly-workspace(?:\.runtime)?(?:\.[^/]+)?$/i,
  /(^|\/)resources_blockly\.py$/i,
  /(^|\/)blockly_runtime\.py$/i,
  /(^|\/)blockly_xeduhub_support\.py$/i,
  /(^|\/)blockly-colors\.json$/i,
];
const execFileAsync = promisify(execFile);

async function exists(target, mode = constants.F_OK) {
  try {
    await access(target, mode);
    return true;
  } catch {
    return false;
  }
}

async function isDirectory(target) {
  try {
    return (await stat(target)).isDirectory();
  } catch {
    return false;
  }
}

async function readJson(target) {
  try {
    return JSON.parse(await readFile(target, 'utf8'));
  } catch {
    return null;
  }
}

async function findForbiddenArtifactPaths(current, relative = '', result = []) {
  const entries = await readdir(current, { withFileTypes: true });
  for (const entry of entries) {
    const target = path.join(current, entry.name);
    const childRelative = path.posix.join(relative, entry.name);
    if (entry.isDirectory()) {
      await findForbiddenArtifactPaths(target, childRelative, result);
      continue;
    }
    if (entry.isFile() && FORBIDDEN_ARTIFACT_PATHS.some((pattern) => pattern.test(childRelative))) {
      result.push(childRelative);
    }
  }
  return result;
}

async function findResourcesPath(root) {
  const candidates = [
    path.join(root, 'resources'),
    path.join(root, 'Contents', 'Resources'),
  ];
  for (const candidate of candidates) {
    if (await isDirectory(candidate)) return candidate;
  }
  return null;
}

async function findVersion(root, resourcesPath) {
  const candidates = [
    path.join(root, 'package.json'),
    path.join(resourcesPath, 'package.json'),
    path.join(resourcesPath, 'app', 'package.json'),
  ];
  for (const candidate of candidates) {
    const packageJson = await readJson(candidate);
    if (typeof packageJson?.version === 'string' && packageJson.version.trim()) {
      return packageJson.version.trim();
    }
  }
  return null;
}

/**
 * Verify the contents of an unpacked electron-builder artifact.
 *
 * The function intentionally checks only files required at runtime. Signing,
 * notarization, and archive naming are platform-specific release checks.
 */
export async function verifyReleaseArtifact(root, { expectedVersion } = {}) {
  const artifactRoot = path.resolve(root);
  const errors = [];
  const resourcesPath = await findResourcesPath(artifactRoot);

  if (!resourcesPath) {
    return {
      ok: false,
      errors: ['resources directory not found (expected resources or Contents/Resources)'],
      version: null,
      resourcesPath: null,
    };
  }

  const version = await findVersion(artifactRoot, resourcesPath) ?? expectedVersion ?? null;
  if (!version) {
    errors.push('application version not found; pass expectedVersion or include package.json');
  }
  if (expectedVersion && version && version !== expectedVersion) {
    errors.push(`version mismatch: expected ${expectedVersion}, found ${version}`);
  }

  for (const relativePath of REQUIRED_FILES) {
    if (!await exists(path.join(resourcesPath, relativePath), constants.R_OK)) {
      errors.push(`required file missing: ${relativePath}`);
    }
  }
  for (const relativePath of REQUIRED_DIRECTORIES) {
    if (!await isDirectory(path.join(resourcesPath, relativePath))) {
      errors.push(`required directory missing: ${relativePath}`);
    }
  }
  for (const relativePath of FORBIDDEN_DIRECTORIES) {
    if (await isDirectory(path.join(resourcesPath, relativePath))) {
      errors.push(`bundled Python environment must not be included: ${relativePath}`);
    }
  }

  const duplicateBackend = path.join(resourcesPath, 'app', 'backend');
  if (await isDirectory(duplicateBackend)) {
    errors.push('duplicate backend found: app/backend (backend must be external resources only)');
  }

  for (const relativePath of await findForbiddenArtifactPaths(resourcesPath)) {
    errors.push(`removed Blockly artifact must not be packaged: ${relativePath}`);
  }

  return { ok: errors.length === 0, errors, version, resourcesPath };
}

async function collectFiles(root, current = root, result = []) {
  const entries = await readdir(current, { withFileTypes: true });
  for (const entry of entries) {
    const target = path.join(current, entry.name);
    if (entry.isDirectory()) {
      await collectFiles(root, target, result);
      continue;
    }
    if (!entry.isFile()) continue;
    const content = await readFile(target);
    result.push({
      path: path.relative(root, target).split(path.sep).join('/'),
      size: content.byteLength,
      sha256: createHash('sha256').update(content).digest('hex'),
    });
  }
  return result.sort((left, right) => left.path.localeCompare(right.path));
}

async function resolveGitCommit() {
  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', '--verify', 'HEAD']);
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

async function resolveGitTag() {
  if (process.env.GIT_TAG) return process.env.GIT_TAG;
  try {
    const { stdout } = await execFileAsync('git', ['describe', '--tags', '--exact-match', 'HEAD']);
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

async function hashArtifact(filePath) {
  const absolutePath = path.resolve(filePath);
  let details;
  try {
    details = await stat(absolutePath);
  } catch {
    throw new Error(`artifact file not found: ${filePath}`);
  }
  if (!details.isFile()) throw new Error(`artifact file is not a regular file: ${filePath}`);
  const content = await readFile(absolutePath);
  return {
    path: path.basename(absolutePath),
    size: content.byteLength,
    sha256: createHash('sha256').update(content).digest('hex'),
  };
}

export function validateReleaseTarget({ platform, arch, actualPlatform = process.platform, actualArch = process.arch } = {}) {
  const errors = [];
  if (platform && platform !== actualPlatform) {
    errors.push(`platform mismatch: expected ${platform}, running on ${actualPlatform}`);
  }
  if (arch && arch !== actualArch) {
    errors.push(`architecture mismatch: expected ${arch}, running on ${actualArch}`);
  }
  return errors;
}

export async function writeReleaseManifest(
  root,
  result,
  {
    output,
    platform = process.platform,
    arch = process.arch,
    tag,
    commit,
    artifacts = [],
    requireIdentity = false,
  } = {},
) {
  if (!output) throw new Error('manifest output path is required');
  const artifactRoot = path.resolve(root);
  const resourcesPath = path.relative(artifactRoot, result.resourcesPath).split(path.sep).join('/') || '.';
  const gitCommit = commit ?? await resolveGitCommit();
  const gitTag = tag ?? await resolveGitTag();
  if (requireIdentity) {
    if (!gitCommit) throw new Error('release manifest requires a resolvable source commit');
    if (!gitTag) throw new Error('release manifest requires an exact tag on the source commit');
    if (commit && gitCommit !== commit) {
      throw new Error(`source commit mismatch: expected ${commit}, found ${gitCommit}`);
    }
    if (tag && gitTag !== tag) {
      throw new Error(`source tag mismatch: expected ${tag}, found ${gitTag}`);
    }
  }
  const manifest = {
    schemaVersion: 2,
    version: result.version,
    platform,
    arch,
    gitCommit,
    gitTag,
    artifactName: path.basename(artifactRoot),
    resourcesPath,
    files: await collectFiles(artifactRoot),
    artifacts: await Promise.all(artifacts.map(hashArtifact)),
  };
  await mkdir(path.dirname(path.resolve(output)), { recursive: true });
  await writeFile(path.resolve(output), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return manifest;
}

function parseArgs(argv) {
  const [root, ...rest] = argv;
  let expectedVersion;
  let manifest;
  let platform;
  let arch;
  let tag;
  let commit;
  const artifacts = [];
  for (let index = 0; index < rest.length; index += 1) {
    if (rest[index] === '--version') expectedVersion = rest[++index];
    if (rest[index] === '--manifest') manifest = rest[++index];
    if (rest[index] === '--platform') platform = rest[++index];
    if (rest[index] === '--arch') arch = rest[++index];
    if (rest[index] === '--tag') tag = rest[++index];
    if (rest[index] === '--commit') commit = rest[++index];
    if (rest[index] === '--artifact') artifacts.push(rest[++index]);
  }
  return { root, expectedVersion, manifest, platform, arch, tag, commit, artifacts };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { root, expectedVersion, manifest, platform, arch, tag, commit, artifacts } = parseArgs(process.argv.slice(2));
  if (!root) {
    console.error('Usage: node scripts/verify_release_artifact.mjs <unpacked-artifact> [--version <version>] [--manifest <path>] [--platform <platform>] [--arch <arch>] [--tag <tag>] [--commit <sha>] [--artifact <file>]...');
    process.exitCode = 2;
  } else {
    try {
      const targetErrors = validateReleaseTarget({ platform, arch });
      if (targetErrors.length > 0) throw new Error(targetErrors.join('\n'));
      const result = await verifyReleaseArtifact(root, { expectedVersion });
      if (!result.ok) {
        throw new Error(result.errors.join('\n'));
      }
      console.log(`Release artifact verified: ${result.resourcesPath} (version ${result.version})`);
      if (manifest) {
        if (!tag || !commit) throw new Error('manifest output requires both --tag and --commit');
        await writeReleaseManifest(root, result, {
          output: manifest,
          platform,
          arch,
          tag,
          commit,
          artifacts,
          requireIdentity: true,
        });
        console.log(`Release manifest written: ${manifest}`);
      }
    } catch (error) {
      console.error(`Release artifact verification failed: ${error.message}`);
      process.exitCode = 1;
    }
  }
}
