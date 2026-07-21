import { access, readFile, readdir } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';

const entryPoint = 'scratch-editor/build/index.html';
const buildDir = path.dirname(entryPoint);

async function walkFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walkFiles(target));
    else files.push(target);
  }
  return files;
}

try {
  await access(entryPoint, constants.R_OK);
  const indexHtml = await readFile(entryPoint, 'utf8');
  const scriptMatch = indexHtml.match(/<script\s+src=["']\.\/(scratch-gui-standalone\.js)["']/);
  if (!scriptMatch) throw new Error('Scratch standalone script reference is missing from index.html');
  for (const marker of [
    'xedu:scratch-host-state-request',
    'xedu:scratch-host-state',
    'xedu:scratch-host-action-result',
  ]) {
    if (!indexHtml.includes(marker)) throw new Error(`Scratch host bridge marker is missing: ${marker}`);
  }

  const bundlePath = path.join(buildDir, scriptMatch[1]);
  const bundle = await readFile(bundlePath, 'utf8');
  const workerRuntimePattern = /(__nested_webpack_require_\d+__)\.u\s*=\s*function\s*\([^)]*\)\s*\{\s*return\s*["'](chunks\/fetch-worker\.[^"']+\.js)["'];?\s*\}/g;
  const workerRuntimes = [...bundle.matchAll(workerRuntimePattern)];
  if (!workerRuntimes.length) throw new Error('Scratch fetch-worker runtime was not found');

  for (const [, runtimeId, workerPath] of workerRuntimes) {
    const escapedRuntimeId = runtimeId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const expectedPublicPath = new RegExp(`${escapedRuntimeId}\\.p\\s*=\\s*["']\\/api\\/scratch-editor\\/["']`);
    if (!expectedPublicPath.test(bundle)) {
      throw new Error(`Scratch worker runtime ${runtimeId} does not use /api/scratch-editor/`);
    }
    await access(path.join(buildDir, workerPath), constants.R_OK);
  }

  if (/solutionPath\s*:\s*["']\/chunks\//.test(bundle)) {
    throw new Error('Scratch dependency runtime still contains a root /chunks/ path');
  }

  const assets = await walkFiles(buildDir);
  for (const assetPath of assets.filter((file) => file.endsWith('.js') || file.endsWith('.css'))) {
    const content = await readFile(assetPath, 'utf8');
    if (/sourceMappingURL=(?!data:)/.test(content)) {
      throw new Error(`External source map reference remains in ${assetPath}`);
    }
  }

  console.log(`Scratch build verified: ${workerRuntimes.length} worker runtime(s), public path /api/scratch-editor/`);
} catch (error) {
  console.error(`Scratch build verification failed: ${error.message}`);
  process.exitCode = 1;
}
