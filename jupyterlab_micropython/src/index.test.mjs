import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PANEL_ROUTES,
  PLACEHOLDER_OUTPUT,
  STARTER_MAIN_PY,
  actionAvailability,
  appendConsoleText,
  panelRequestPath,
  panelRoute,
  preferredPythonFile,
  projectDirectoryFromLabPath,
  projectFilePath,
  pythonPathFromWidget,
  pythonProjectFiles,
  clampOutputHeight,
  DEFAULT_OUTPUT_HEIGHT,
  highlightPython,
  shouldAutoOpenCodeMode,
  studentErrorMessage,
  xsrfTokenFromCookie,
} from './panel-logic.js';
import { readFileSync } from 'node:fs';

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
    save: true,
    run: false,
    upload: false,
    interrupt: false,
    reset: false,
    send: false,
    'open-project': true,
  });
  assert.deepEqual(actionAvailability({ connected: true, hasPort: true, hasFile: true }), {
    refresh: true,
    connect: false,
    disconnect: true,
    save: true,
    run: true,
    upload: true,
    interrupt: true,
    reset: true,
    send: true,
    'open-project': true,
  });
});

test('panel routes match the Jupyter MicroPython actions', () => {
  assert.deepEqual(Object.keys(PANEL_ROUTES), [
    'refresh',
    'connect',
    'disconnect',
    'run',
    'upload',
    'interrupt',
    'reset',
    'send',
    'poll',
  ]);
  assert.deepEqual(panelRoute('refresh'), { method: 'GET', path: 'ports' });
  assert.deepEqual(panelRoute('connect'), { method: 'POST', path: 'connect' });
  assert.deepEqual(panelRoute('disconnect'), { method: 'POST', path: 'disconnect' });
  assert.deepEqual(panelRoute('run'), { method: 'POST', path: 'run' });
  assert.deepEqual(panelRoute('upload'), { method: 'POST', path: 'upload' });
  assert.deepEqual(panelRoute('interrupt'), { method: 'POST', path: 'interrupt' });
  assert.deepEqual(panelRoute('reset'), { method: 'POST', path: 'reset' });
  assert.deepEqual(panelRoute('send'), { method: 'POST', path: 'input' });
  assert.deepEqual(panelRoute('poll'), { method: 'GET', path: 'output' });
  assert.equal(panelRequestPath('poll', 'after=4'), 'output?after=4');
  assert.throws(() => panelRoute('flash'), /不支持的 MicroPython 请求/);
});

test('studentErrorMessage keeps Chinese device errors', () => {
  assert.equal(
    studentErrorMessage(new Error('串口正在被其他程序使用，请关闭串口监视器后重试。')),
    '串口正在被其他程序使用，请关闭串口监视器后重试。',
  );
  assert.equal(studentErrorMessage({}), 'ESP32 操作失败。');
});

test('code mode opens from the student experiment query and prefers main.py', () => {
  assert.equal(shouldAutoOpenCodeMode('?xedu-micropython=1'), true);
  assert.equal(shouldAutoOpenCodeMode('?xedu-micropython=0'), false);
  assert.deepEqual(projectDirectoryFromLabPath('/lab/tree/lesson/exp/main.py'), {
    directory: 'lesson/exp',
    filePath: 'lesson/exp/main.py',
  });
  assert.deepEqual(projectDirectoryFromLabPath('/lab'), { directory: '', filePath: '' });
  const files = pythonProjectFiles([
    { name: 'notes.md', path: 'notes.md', type: 'file' },
    { name: 'blink.py', path: 'lesson/blink.py', type: 'file' },
    { name: 'main.py', path: 'lesson/main.py', type: 'file' },
    { name: 'lib', path: 'lib', type: 'directory' },
  ]);
  assert.deepEqual(files.map((file) => file.name), ['main.py', 'blink.py']);
  assert.equal(preferredPythonFile(files, 'lesson/blink.py'), 'lesson/blink.py');
  assert.equal(preferredPythonFile(files, ''), 'lesson/main.py');
  assert.equal(projectFilePath('lesson/exp', 'main.py'), 'lesson/exp/main.py');
  assert.match(STARTER_MAIN_PY, /print\("hello from ESP32"\)/);
});

test('code mode highlights Python while keeping the editable source', () => {
  const source = [
    'import tkinter as tk',
    'class fireworks:',
    '    def __init__(self):',
    '        # 烟花 <绽放>',
    "        self.color = 'red'",
    '        self.size = 2.',
    '        print(f"n={6}")',
  ].join('\n');
  const html = highlightPython(source);
  assert.match(html, /class="xedu-py-keyword">import</);
  assert.match(html, /class="xedu-py-keyword">class</);
  assert.match(html, /class="xedu-py-keyword">def</);
  assert.match(html, /class="xedu-py-comment"># 烟花 &lt;绽放&gt;</);
  assert.match(html, /class="xedu-py-string">'red'</);
  assert.match(html, /class="xedu-py-string">f"n=\{6\}"</);
  assert.match(html, /class="xedu-py-number">2\.</);
  assert.equal(
    html.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'),
    source,
  );
  assert.equal(highlightPython(''), '');

  const panel = readFileSync(new URL('./index.js', import.meta.url), 'utf8');
  assert.match(panel, /data-role="editor"/);
  assert.match(panel, /data-role="highlight"/);
  assert.match(panel, /highlightPython\(this\.codeText\(\)\)/);
  assert.match(panel, /content: this\.codeText\(\)/);
});

test('code mode keeps the editor larger than the output console', () => {
  assert.equal(DEFAULT_OUTPUT_HEIGHT, 164);
  assert.equal(clampOutputHeight(undefined, 800), 164);
  assert.equal(clampOutputHeight(80, 800), 120);
  assert.equal(clampOutputHeight(500, 800), 288);
  assert.equal(clampOutputHeight(140, 800), 140);

  const panel = readFileSync(new URL('./index.js', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../style/index.css', import.meta.url), 'utf8');
  assert.match(panel, /data-role="output-splitter"/);
  assert.match(panel, /clampOutputHeight/);
  assert.match(css, /--xedu-mp-output-height:\s*164px/);
  assert.match(css, /\.xedu-mp-editor-scroll\s*\{[^}]*flex:\s*1 1 auto/);
  assert.doesNotMatch(css, /flex:\s*0 0 32%/);
});
