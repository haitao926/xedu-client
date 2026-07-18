#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const buildAssetsDir = path.join(repoRoot, 'build', 'assets');
const scratchEditorBuildDir = path.join(repoRoot, 'scratch-editor', 'build');

const limits = {
  'main.js': 120 * 1024,
  'resources.js': 220 * 1024,
};

const scratchEditorLimit = 180 * 1024 * 1024;

function statSize(filePath) {
  const stat = fs.statSync(filePath);
  return stat.size;
}

function formatKB(bytes) {
  return `${(bytes / 1024).toFixed(2)} KB`;
}

function main() {
  if (!fs.existsSync(buildAssetsDir)) {
    console.error('[bundle-check] build/assets 不存在，请先运行 npm run build');
    process.exit(1);
  }

  let failed = false;

  for (const [name, limit] of Object.entries(limits)) {
    const filePath = path.join(buildAssetsDir, name);
    if (!fs.existsSync(filePath)) {
      console.error(`[bundle-check] 缺少构建产物: ${name}`);
      failed = true;
      continue;
    }
    const size = statSize(filePath);
    const ok = size <= limit;
    const status = ok ? 'OK' : 'FAIL';
    console.log(`[bundle-check] ${status} ${name} = ${formatKB(size)} (limit ${formatKB(limit)})`);
    if (!ok) failed = true;
  }

  if (fs.existsSync(scratchEditorBuildDir)) {
    const scratchSize = directorySize(scratchEditorBuildDir);
    console.log(`[bundle-size] scratch-editor/build: ${formatKB(scratchSize)} (limit ${formatKB(scratchEditorLimit)})`);
    if (scratchSize > scratchEditorLimit) {
      console.error(`[bundle-size] scratch-editor/build exceeds limit.`);
      failed = true;
    }
  }

  if (failed) {
    process.exit(1);
  }
}

function directorySize(dirPath) {
  let total = 0;
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const entryPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      total += directorySize(entryPath);
    } else if (entry.isFile()) {
      total += statSize(entryPath);
    }
  }
  return total;
}

main();
