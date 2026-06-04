import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { JSDOM } from 'jsdom';
import * as Blockly from 'blockly';
import * as libraryBlocks from 'blockly/blocks';
import { pythonGenerator } from 'blockly/python';

import {
  collectXEduHubSpecFromBlocks,
  hasRunnableFlowInBlocks,
} from './runtime-helpers.js';
import {
  defineXEduHubBlocks,
  getTaskById,
  getTaskIdFromRunBlockType,
  isSemanticRunBlockType,
} from './xeduhub-blocks.js';
import { RUNNABLE_BLOCK_TYPES } from './toolbox-utils.js';

void libraryBlocks;

globalThis.window = globalThis.window || { __XEDU_BLOCKLY_RUNTIME_CONFIG__: {} };
const { window: domWindow } = new JSDOM('', { url: 'http://localhost/' });
globalThis.DOMParser = globalThis.DOMParser || domWindow.DOMParser;
globalThis.XMLSerializer = globalThis.XMLSerializer || domWindow.XMLSerializer;
defineXEduHubBlocks(Blockly, pythonGenerator);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../../..');
const AUDIT_JSON_PATH = path.join(REPO_ROOT, 'docs/overview/xeduhub-block-audit.json');
const AUDIT_SCRIPT_PATH = path.join(REPO_ROOT, 'scripts/generate_xeduhub_block_audit.mjs');

function readAuditInventory() {
  return JSON.parse(fs.readFileSync(AUDIT_JSON_PATH, 'utf8'));
}

function generateStandaloneBody(blockType) {
  const workspace = new Blockly.Workspace();
  const block = workspace.newBlock(blockType);
  if (block.getField('INPUT')) block.setFieldValue('demo.jpg', 'INPUT');
  if (block.getField('TITLE')) block.setFieldValue('运行结果', 'TITLE');
  if (block.getField('TASK_ID')) block.setFieldValue('det_body', 'TASK_ID');
  pythonGenerator.init(workspace);
  const raw = pythonGenerator.blockToCode(block);
  workspace.dispose();
  return Array.isArray(raw) ? `__result = ${raw[0]}\n` : String(raw || '');
}

test('XEduHub audit generator outputs stay in sync with committed docs', () => {
  const result = spawnSync('node', [AUDIT_SCRIPT_PATH, '--check'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr || result.stdout || 'audit generator check should pass');
});

test('XEduHub audit inventory covers every registered custom block exactly once', () => {
  const audit = readAuditInventory();
  const registered = Object.keys(Blockly.Blocks)
    .filter((name) => name.startsWith('xeduhub_'))
    .sort();
  const audited = audit.blocks.map((block) => block.id).sort();

  assert.deepEqual(audited, registered);
  assert.equal(audit.meta.block_count, registered.length);
});

test('XEduHub audit matrix assigns a concrete strategy to every runnable block', () => {
  const audit = readAuditInventory();
  const runnable = audit.blocks.filter((block) => block.is_runnable);
  assert.ok(runnable.length >= 50, `expected at least 50 runnable XEduHub blocks, got ${runnable.length}`);
  for (const block of runnable) {
    assert.ok(block.test_strategy, `${block.id} should have a test strategy`);
    assert.ok(Array.isArray(block.test_assertions) && block.test_assertions.length > 0, `${block.id} should have concrete test assertions`);
    assert.ok(block.runtime_entrypoint, `${block.id} should declare its runtime entrypoint`);
  }
});

test('result display audit reflects downgraded result-block issues after explicit runtime handling', () => {
  const audit = readAuditInventory();
  const expected = new Map([
    ['xeduhub_show_result_card', 'P1'],
    ['xeduhub_show_result_image', 'P1'],
    ['xeduhub_run_and_record', 'P3'],
    ['xeduhub_clear_result', 'P3'],
  ]);

  for (const [blockId, issueLevel] of expected.entries()) {
    const item = audit.blocks.find((block) => block.id === blockId);
    assert.ok(item, `${blockId} should exist in audit inventory`);
    assert.equal(item.issue_level, issueLevel);
    assert.ok(['不一致', '弱一致', '一致'].includes(item.audit_conclusion), `${blockId} should be classified`);
    assert.ok(item.findings.some((finding) => finding.includes('结果区') || finding.includes('前端') || finding.includes('备注') || finding.includes('图片')), `${blockId} should describe the new runtime behavior`);
  }
});

test('show result card emits an explicit runtime helper call and does not contribute to XEduHub spec extraction', () => {
  const body = generateStandaloneBody('xeduhub_show_result_card');
  assert.match(body, /xrt\.xedu_show_result_card\(lab_result, title="运行结果"\)/);

  const workspace = new Blockly.Workspace();
  const inputBlock = workspace.newBlock('xeduhub_set_input_resource');
  inputBlock.setFieldValue('demo.jpg', 'INPUT');
  const runBlock = workspace.newBlock('xeduhub_run_det_body');
  const displayBlock = workspace.newBlock('xeduhub_show_result_card');
  displayBlock.setFieldValue('运行结果', 'TITLE');
  inputBlock.nextConnection.connect(runBlock.previousConnection);
  runBlock.nextConnection.connect(displayBlock.previousConnection);

  const blocks = workspace.getAllBlocks(false);
  assert.equal(hasRunnableFlowInBlocks(blocks, {
    isSemanticRunBlockType,
    runnableBlockTypes: RUNNABLE_BLOCK_TYPES,
  }), true);

  const spec = collectXEduHubSpecFromBlocks(blocks, {
    isSemanticRunBlockType,
    getTaskIdFromRunBlockType,
    getTaskById,
  });

  assert.equal(spec.task_id, 'det_body');
  assert.equal(spec.input, 'demo.jpg');
  assert.equal(Object.hasOwn(spec, 'TITLE'), false);
  workspace.dispose();
});
