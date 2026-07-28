import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import { parseBootstrapResult, runPythonBootstrap } from '../main/python-bootstrap.js';

test('standalone bootstrap result is parsed without importing Flask', () => {
  assert.deepEqual(
    parseBootstrapResult('pip output\n__XEDU_BOOTSTRAP__={"success":true,"changed":true}\n'),
    { success: true, changed: true },
  );
  assert.equal(parseBootstrapResult('no marker'), null);
});

test('Python repair bridge returns the structured result from the standalone script', async () => {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = () => {};
  const calls = [];
  const resultPromise = runPythonBootstrap({
    pythonExecutable: '/tmp/python',
    scriptPath: '/tmp/python_bootstrap.py',
    spawnImpl: (...args) => {
      calls.push(args);
      return child;
    },
    timeoutMs: 1000,
  });

  child.stdout.emit('data', '__XEDU_BOOTSTRAP__={"success":true,"changed":true,"message":"已准备"}\n');
  child.emit('close', 0, null);
  const result = await resultPromise;

  assert.equal(result.success, true);
  assert.equal(result.message, '已准备');
  assert.equal(calls[0][0], '/tmp/python');
  assert.deepEqual(calls[0][1], ['/tmp/python_bootstrap.py', '--repair']);
});

test('Python repair bridge accepts the Flask-free XEdu repair command', async () => {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = () => {};
  const calls = [];
  const resultPromise = runPythonBootstrap({
    pythonExecutable: '/tmp/python',
    scriptPath: '/tmp/python_bootstrap.py',
    args: ['--repair-xedu'],
    spawnImpl: (...args) => {
      calls.push(args);
      return child;
    },
    timeoutMs: 1000,
  });

  child.stdout.emit('data', '__XEDU_BOOTSTRAP__={"success":true,"changed":true}\n');
  child.emit('close', 0, null);
  const result = await resultPromise;

  assert.equal(result.success, true);
  assert.deepEqual(calls[0][1], ['/tmp/python_bootstrap.py', '--repair-xedu']);
});

test('Python repair bridge accepts the Flask-free environment probe command', async () => {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = () => {};
  const calls = [];
  const resultPromise = runPythonBootstrap({
    pythonExecutable: '/tmp/python',
    scriptPath: '/tmp/python_bootstrap.py',
    args: ['--inspect-xedu'],
    spawnImpl: (...args) => {
      calls.push(args);
      return child;
    },
    timeoutMs: 1000,
  });

  child.stdout.emit('data', '__XEDU_BOOTSTRAP__={"success":true,"xedu_runtime_ok":false}\n');
  child.emit('close', 0, null);
  const result = await resultPromise;

  assert.equal(result.success, true);
  assert.deepEqual(calls[0][1], ['/tmp/python_bootstrap.py', '--inspect-xedu']);
});

test('Python repair bridge reports a useful error when the script exits without a result', async () => {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = () => {};
  const resultPromise = runPythonBootstrap({
    pythonExecutable: '/tmp/python',
    scriptPath: '/tmp/python_bootstrap.py',
    spawnImpl: () => child,
    timeoutMs: 1000,
  });

  child.stderr.emit('data', 'ModuleNotFoundError: pip\n');
  child.emit('close', 1, null);
  const result = await resultPromise;

  assert.equal(result.success, false);
  assert.match(result.message, /ModuleNotFoundError: pip/);
});
