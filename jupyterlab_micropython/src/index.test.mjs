import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PLACEHOLDER_OUTPUT,
  actionAvailability,
  appendConsoleText,
  pythonPathFromWidget,
  studentErrorMessage,
  xsrfTokenFromCookie,
} from './panel-logic.js';

test('pythonPathFromWidget only accepts .py files', () => {
  assert.equal(pythonPathFromWidget({ context: { path: 'main.py' } }), 'main.py');
  assert.equal(pythonPathFromWidget({ context: { path: 'lesson/blink.PY' } }), 'lesson/blink.PY');
  assert.equal(pythonPathFromWidget({ context: { path: 'notes.md' } }), '');
  assert.equal(pythonPathFromWidget({}), '');
});

test('xsrfTokenFromCookie reads Jupyter cookie', () => {
  assert.equal(xsrfTokenFromCookie('_xsrf=abc%2F123; other=1'), 'abc/123');
  assert.equal(xsrfTokenFromCookie('other=1'), '');
});

test('appendConsoleText replaces the placeholder once output arrives', () => {
  assert.equal(appendConsoleText(PLACEHOLDER_OUTPUT, '>>> '), '>>> ');
  assert.equal(appendConsoleText('>>> ', 'hello\n'), '>>> hello\n');
  assert.equal(appendConsoleText(PLACEHOLDER_OUTPUT, ''), PLACEHOLDER_OUTPUT);
});

test('actionAvailability disables run until connected with a .py file', () => {
  assert.deepEqual(actionAvailability({ connected: false, hasPort: true, hasFile: true }), {
    refresh: true,
    connect: true,
    disconnect: false,
    run: false,
    interrupt: false,
    reset: false,
    send: false,
  });
  assert.deepEqual(actionAvailability({ connected: true, hasPort: true, hasFile: true }), {
    refresh: true,
    connect: false,
    disconnect: true,
    run: true,
    interrupt: true,
    reset: true,
    send: true,
  });
});

test('studentErrorMessage keeps Chinese device errors', () => {
  assert.equal(
    studentErrorMessage(new Error('串口正在被其他程序使用，请关闭串口监视器后重试。')),
    '串口正在被其他程序使用，请关闭串口监视器后重试。',
  );
  assert.equal(studentErrorMessage({}), 'ESP32 操作失败。');
});
