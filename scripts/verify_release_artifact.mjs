import { access, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { extractFile, listPackage } from '@electron/asar';
import path from 'node:path';
import process from 'node:process';

const ARTIFACT_PROFILES = {
  release: {
    requiredDirectories: ['backend', 'checkpoint'],
    forbiddenDirectories: [
      ['python_env', 'bundled Python environment must not be included'],
      ['python_env_win', 'bundled Python environment must not be included'],
    ],
  },
  minimal: {
    requiredDirectories: ['backend', 'python_env'],
    forbiddenDirectories: [
      ['python_env_win', 'bundled Python environment must use the canonical python_env path'],
      ['checkpoint', 'model directory must not be included'],
    ],
    forbidModelFiles: true,
  },
  'external-python': {
    requiredDirectories: ['backend'],
    forbiddenDirectories: [
      ['python_env', 'bundled Python environment must not be included'],
      ['python_env_win', 'bundled Python environment must not be included'],
      ['checkpoint', 'model directory must not be included'],
    ],
    forbidModelFiles: true,
  },
};
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
const FORBIDDEN_ASAR_PATHS = [
  /^\/?backend(?:\/|$)/i,
  /^\/?config(?:\/|$)/i,
  /^\/?scripts(?:\/|$)/i,
  /^\/?python_env(?:_win)?(?:\/|$)/i,
  ...FORBIDDEN_ARTIFACT_PATHS.map((pattern) => new RegExp(pattern.source.replace(/^\(\^\|\/\)/, '^\\/?'))),
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

async function readAsarJson(asarPath, relativePath) {
  try {
    return JSON.parse(extractFile(asarPath, relativePath).toString('utf8'));
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

async function findForbiddenModelPaths(current, relative = '', result = []) {
  const entries = await readdir(current, { withFileTypes: true });
  for (const entry of entries) {
    const target = path.join(current, entry.name);
    const childRelative = path.posix.join(relative, entry.name);
    if (entry.isDirectory()) {
      await findForbiddenModelPaths(target, childRelative, result);
      continue;
    }
    if (entry.isFile() && /\.(?:onnx|pt|pth|safetensors)$/i.test(entry.name)) {
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
  const asarPath = path.join(resourcesPath, 'app.asar');
  const asarPackageJson = await readAsarJson(asarPath, 'package.json');
  if (typeof asarPackageJson?.version === 'string' && asarPackageJson.version.trim()) {
    return asarPackageJson.version.trim();
  }

  const plistPath = path.join(root, 'Contents', 'Info.plist');
  if (await exists(plistPath, constants.R_OK)) {
    try {
      const { stdout } = await execFileAsync('plutil', ['-convert', 'json', '-o', '-', plistPath]);
      const plist = JSON.parse(stdout);
      const version = plist.CFBundleShortVersionString ?? plist.CFBundleVersion;
      if (typeof version === 'string' && version.trim()) return version.trim();
    } catch {
      // A non-macOS verifier cannot parse Apple's binary plist without plutil.
    }
  }
  return null;
}

async function findForbiddenAsarPaths(resourcesPath) {
  const asarPath = path.join(resourcesPath, 'app.asar');
  if (!await exists(asarPath, constants.R_OK)) return [];
  let entries;
  try {
    entries = listPackage(asarPath);
  } catch {
    return [`${path.relative(resourcesPath, asarPath).split(path.sep).join('/')}: unreadable ASAR`];
  }
  return entries
    .map((entry) => entry.replace(/^\//, ''))
    .filter((entry) => FORBIDDEN_ASAR_PATHS.some((pattern) => pattern.test(entry)))
    .map((entry) => `app.asar/${entry}`);
}

/**
 * Verify the contents of an unpacked electron-builder artifact.
 *
 * The function intentionally checks only files required at runtime. Signing,
 * notarization, and archive naming are platform-specific release checks.
 */
export async function verifyReleaseArtifact(root, { expectedVersion, profile = 'release' } = {}) {
  const artifactRoot = path.resolve(root);
  const errors = [];
  const profileRules = ARTIFACT_PROFILES[profile];
  if (!profileRules) {
    return {
      ok: false,
      errors: [`unknown artifact profile: ${profile}`],
      version: null,
      resourcesPath: null,
    };
  }
  const resourcesPath = await findResourcesPath(artifactRoot);

  if (!resourcesPath) {
    return {
      ok: false,
      errors: ['resources directory not found (expected resources or Contents/Resources)'],
      version: null,
      resourcesPath: null,
    };
  }

  const version = await findVersion(artifactRoot, resourcesPath);
  if (!version) {
    errors.push('application version not found; include package.json, app.asar/package.json, or macOS Info.plist');
  }
  if (expectedVersion && version && version !== expectedVersion) {
    errors.push(`version mismatch: expected ${expectedVersion}, found ${version}`);
  }

  for (const relativePath of REQUIRED_FILES) {
    if (!await exists(path.join(resourcesPath, relativePath), constants.R_OK)) {
      errors.push(`required file missing: ${relativePath}`);
    }
  }
  for (const relativePath of profileRules.requiredDirectories) {
    if (!await isDirectory(path.join(resourcesPath, relativePath))) {
      errors.push(`required directory missing: ${relativePath}`);
    }
  }
  for (const [relativePath, message] of profileRules.forbiddenDirectories) {
    if (await isDirectory(path.join(resourcesPath, relativePath))) {
      errors.push(`${message}: ${relativePath}`);
    }
  }

  const duplicateBackend = path.join(resourcesPath, 'app', 'backend');
  if (await isDirectory(duplicateBackend)) {
    errors.push('duplicate backend found: app/backend (backend must be external resources only)');
  }

  for (const relativePath of await findForbiddenArtifactPaths(resourcesPath)) {
    errors.push(`removed Blockly artifact must not be packaged: ${relativePath}`);
  }
  if (profileRules.forbidModelFiles) {
    for (const relativePath of await findForbiddenModelPaths(resourcesPath)) {
      errors.push(`model file must not be included: ${relativePath}`);
    }
  }
  for (const relativePath of await findForbiddenAsarPaths(resourcesPath)) {
    errors.push(`forbidden app.asar content must not be packaged: ${relativePath}`);
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
  const actualCommit = await resolveGitCommit();
  const actualTag = await resolveGitTag();
  const gitCommit = commit ?? actualCommit;
  const gitTag = tag ?? actualTag;
  if (requireIdentity) {
    if (!actualCommit) throw new Error('release manifest requires a resolvable source commit');
    if (!actualTag) throw new Error('release manifest requires an exact tag on the source commit');
    if (commit && actualCommit !== commit) {
      throw new Error(`source commit mismatch: expected ${commit}, found ${actualCommit}`);
    }
    if (tag && actualTag !== tag) {
      throw new Error(`source tag mismatch: expected ${tag}, found ${actualTag}`);
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
  let profile = 'release';
  const artifacts = [];
  for (let index = 0; index < rest.length; index += 1) {
    if (rest[index] === '--version') expectedVersion = rest[++index];
    if (rest[index] === '--manifest') manifest = rest[++index];
    if (rest[index] === '--platform') platform = rest[++index];
    if (rest[index] === '--arch') arch = rest[++index];
    if (rest[index] === '--tag') tag = rest[++index];
    if (rest[index] === '--commit') commit = rest[++index];
    if (rest[index] === '--profile') profile = rest[++index];
    if (rest[index] === '--artifact') artifacts.push(rest[++index]);
  }
  return { root, expectedVersion, manifest, platform, arch, tag, commit, profile, artifacts };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { root, expectedVersion, manifest, platform, arch, tag, commit, profile, artifacts } = parseArgs(process.argv.slice(2));
  if (!root) {
    console.error('Usage: node scripts/verify_release_artifact.mjs <unpacked-artifact> [--version <version>] [--profile <release|minimal|external-python>] [--manifest <path>] [--platform <platform>] [--arch <arch>] [--tag <tag>] [--commit <sha>] [--artifact <file>]...');
    process.exitCode = 2;
  } else {
    try {
      const targetErrors = validateReleaseTarget({ platform, arch });
      if (targetErrors.length > 0) throw new Error(targetErrors.join('\n'));
      const result = await verifyReleaseArtifact(root, { expectedVersion, profile });
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
