import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PLACEHOLDER_OUTPUT,
  STUDENT_ERRORS,
  appendDeviceOutput,
  currentPyPath,
  derivePanelState,
  readXsrfToken,
  rememberPyPath,
  statusText,
} from './panel-state.js';

test('current py path ignores the hardware panel and notebooks', () => {
  assert.equal(currentPyPath({ context: { path: 'main.py' } }), 'main.py');
  assert.equal(currentPyPath({ content: { context: { path: 'lesson/blink.py' } } }), 'lesson/blink.py');
  assert.equal(currentPyPath({ context: { path: 'notes.ipynb' } }), '');
  assert.equal(currentPyPath({ id: 'xedu-micropython-panel' }), '');
});

test('remembered py path survives focusing the ESP32 panel', () => {
  const fromEditor = rememberPyPath(currentPyPath({ context: { path: 'main.py' } }), '');
  const afterPanelFocus = rememberPyPath(currentPyPath({ id: 'xedu-micropython-panel' }), fromEditor);
  assert.equal(afterPanelFocus, 'main.py');
});

test('panel actions stay disabled until a port is connected and a py file is known', () => {
  const idle = derivePanelState({ ports: [], currentFile: '' });
  assert.equal(idle.statusKind, 'no-board');
  assert.equal(idle.canConnect, false);
  assert.equal(idle.canRun, false);
  assert.equal(statusText(idle), STUDENT_ERRORS.noBoard);

  const ready = derivePanelState({
    ports: [{ device: '/dev/cu.usbserial-ESP32' }],
    selectedPort: '/dev/cu.usbserial-ESP32',
    currentFile: 'main.py',
  });
  assert.equal(ready.statusKind, 'disconnected');
  assert.equal(ready.canConnect, true);
  assert.equal(ready.canRun, false);

  const connected = derivePanelState({
    connected: true,
    ports: [{ device: '/dev/cu.usbserial-ESP32' }],
    selectedPort: '/dev/cu.usbserial-ESP32',
    currentFile: 'main.py',
  });
  assert.equal(connected.statusKind, 'connected');
  assert.equal(connected.canRun, true);
  assert.equal(connected.canInterrupt, true);
  assert.equal(connected.canDisconnect, true);
  assert.equal(statusText(connected, { port: '/dev/cu.usbserial-ESP32' }), '已连接 /dev/cu.usbserial-ESP32');

  const running = derivePanelState({
    connected: true,
    running: true,
    ports: [{ device: '/dev/cu.usbserial-ESP32' }],
    selectedPort: '/dev/cu.usbserial-ESP32',
    currentFile: 'main.py',
  });
  assert.equal(running.statusKind, 'running');
  assert.equal(statusText(running, { file: 'main.py' }), '正在运行 main.py');
});

test('busy and error states disable actions and keep student-facing chinese copy', () => {
  const busy = derivePanelState({
    connected: true,
    busy: true,
    selectedPort: 'COM3',
    currentFile: 'main.py',
    ports: [{ device: 'COM3' }],
  });
  assert.equal(busy.canRun, false);
  assert.equal(busy.canConnect, false);
  assert.equal(statusText(busy, { busyLabel: '正在连接开发板…' }), '正在连接开发板…');

  const failed = derivePanelState({
    error: STUDENT_ERRORS.notConnected,
    ports: [{ device: 'COM3' }],
  });
  assert.equal(failed.statusKind, 'error');
  assert.equal(statusText(failed, { error: STUDENT_ERRORS.notConnected }), STUDENT_ERRORS.notConnected);
});

test('output cursor updates append text without interpreting html', () => {
  const first = appendDeviceOutput(PLACEHOLDER_OUTPUT, 'MicroPython ESP32\n>>> ');
  const second = appendDeviceOutput(first, '<script>alert(1)</script>');
  assert.equal(first, 'MicroPython ESP32\n>>> ');
  assert.equal(second, 'MicroPython ESP32\n>>> <script>alert(1)</script>');
});

test('xsrf token is read from the jupyter cookie when present', () => {
  assert.equal(readXsrfToken('csrftoken=abc; _xsrf=token%2Fvalue'), 'token/value');
  assert.equal(readXsrfToken('theme=light'), '');
});
