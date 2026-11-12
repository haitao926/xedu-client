import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { canReuseMicroPythonPanel } from './panel-logic.js';

test('canReuseMicroPythonPanel only reuses live panels still attached to a parent', () => {
  const parent = {};

  assert.equal(canReuseMicroPythonPanel(null), false);
  assert.equal(canReuseMicroPythonPanel(undefined), false);
  assert.equal(canReuseMicroPythonPanel({ parent, isDisposed: false }), true);
  assert.equal(canReuseMicroPythonPanel({ parent: null, isDisposed: false }), false);
  assert.equal(canReuseMicroPythonPanel({ parent: undefined, isDisposed: false }), false);
  assert.equal(canReuseMicroPythonPanel({ parent, isDisposed: true }), false);
});

test('closing the panel disposes it and a later open creates a replacement', () => {
  const source = readFileSync(new URL('./index.js', import.meta.url), 'utf8');

  assert.match(source, /onCloseRequest\(msg\)\s*\{\s*super\.onCloseRequest\(msg\);\s*this\.dispose\(\);\s*\}/);
  assert.match(
    source,
    /dispose\(\)\s*\{[\s\S]*?this\.stopPolling\(\);[\s\S]*?this\.app\.shell\.currentChanged\?\.disconnect\(this\._shellChanged\);[\s\S]*?void requestRoute\('disconnect'\)\.catch\(\(\) => \{\}\);[\s\S]*?super\.dispose\(\);/,
  );
  assert.match(
    source,
    /if \(!canReuseMicroPythonPanel\(panel\)\)\s*\{\s*panel = new MicroPythonPanel\(app\);\s*addCodeMode\(app, panel\);/,
  );
});
