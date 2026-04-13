import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import * as Blockly from 'blockly';
import * as libraryBlocks from 'blockly/blocks';
import { pythonGenerator } from 'blockly/python';
import { JSDOM } from 'jsdom';

import {
  applyWorkspaceSnapshot,
  collectXEduHubSpecFromBlocks,
  getPythonCodeForWorkspace,
  parseAndMigrateWorkspaceText,
} from '../renderer/js/blockly/runtime-helpers.js';
import {
  defineXEduHubBlocks,
  getParamFieldName,
  getTaskById,
  getTaskIdFromRunBlockType,
  isSemanticRunBlockType,
  migrateXEduHubSerialized,
  migrateXEduHubXmlText,
  resolveLegacyTaskId,
} from '../renderer/js/blockly/xeduhub-blocks.js';

void libraryBlocks;

function usage() {
  console.error('Usage: node scripts/generate_blockly_python.mjs <workspace-file>');
  process.exit(2);
}

const workspaceArg = process.argv[2];
if (!workspaceArg) {
  usage();
}

const workspacePath = path.resolve(process.cwd(), workspaceArg);
if (!fs.existsSync(workspacePath)) {
  console.error(JSON.stringify({ success: false, message: `Workspace not found: ${workspacePath}` }));
  process.exit(1);
}

const { window } = new JSDOM('', { url: 'http://localhost/' });
function loadBackendRuntimeConfig() {
  const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
  const backendDir = path.join(repoRoot, 'backend');
  const pythonExecutable = path.join(repoRoot, 'python_env', 'bin', 'python3');
  const probe = spawnSync(
    pythonExecutable,
    ['-c', `
import json, sys
from pathlib import Path
sys.path.insert(0, ${JSON.stringify(backendDir)})
from services.blockly_xeduhub_support import get_xeduhub_frontend_registry
print(json.dumps({"xeduhubTaskRegistry": get_xeduhub_frontend_registry()}, ensure_ascii=False))
`],
    { encoding: 'utf8' },
  );
  if (probe.status !== 0) {
    return {};
  }
  try {
    return JSON.parse(String(probe.stdout || '').trim() || '{}');
  } catch (_) {
    return {};
  }
}

globalThis.window = globalThis.window || { __XEDU_BLOCKLY_RUNTIME_CONFIG__: {} };
globalThis.window.__XEDU_BLOCKLY_RUNTIME_CONFIG__ = {
  ...(globalThis.window.__XEDU_BLOCKLY_RUNTIME_CONFIG__ || {}),
  ...loadBackendRuntimeConfig(),
};
globalThis.DOMParser = window.DOMParser;
globalThis.XMLSerializer = window.XMLSerializer;

defineXEduHubBlocks(Blockly, pythonGenerator);

const rawText = fs.readFileSync(workspacePath, 'utf8');
const parsed = parseAndMigrateWorkspaceText(rawText, {
  migrateXmlText: migrateXEduHubXmlText,
  migrateSerialized: migrateXEduHubSerialized,
});

const workspace = new Blockly.Workspace();
applyWorkspaceSnapshot(Blockly, workspace, parsed.serialized);
const python = getPythonCodeForWorkspace(workspace, pythonGenerator);
const spec = collectXEduHubSpecFromBlocks(workspace.getAllBlocks(false), {
  getParamFieldName,
  getTaskById,
  getTaskIdFromRunBlockType,
  isSemanticRunBlockType,
  projectRoot: path.dirname(workspacePath),
  resolveLegacyTaskId,
});
workspace.dispose();

console.log(JSON.stringify({
  success: true,
  workspace_path: workspacePath,
  serialized_kind: parsed.serialized.kind,
  migration_report: parsed.migrationReport || { changed: [], failed: [] },
  spec,
  generated_python: python,
}, null, 2));
