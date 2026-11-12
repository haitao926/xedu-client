import assert from 'node:assert/strict';
import test from 'node:test';
import { accessSync, constants, readFileSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { homedir, tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  completionItemsForPrefix,
  completionPrefix,
  insertCompletion,
} from './panel-logic.js';

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/opt/google/chrome/chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/snap/bin/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    join(homedir(), 'Applications/Google Chrome.app/Contents/MacOS/Google Chrome'),
    ...[process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA]
      .filter(Boolean)
      .flatMap((root) => [
        join(root, 'Google', 'Chrome', 'Application', 'chrome.exe'),
        join(root, 'Chromium', 'Application', 'chrome.exe'),
      ]),
    ...(process.env.PATH || '').split(delimiter).filter(Boolean).flatMap((directory) =>
      ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'chrome.exe']
        .map((name) => join(directory, name))),
  ];
  return candidates.filter(Boolean).find((candidate) => {
    try {
      accessSync(candidate, constants.X_OK);
      return statSync(candidate).isFile();
    } catch {
      return false;
    }
  });
}

const CHROME_PATH = findChrome();
const BROWSER_SKIP = CHROME_PATH ? false : 'Chrome/Chromium unavailable; install a browser or set CHROME_PATH to its executable.';
const CSS_PATH = new URL('../style/index.css', import.meta.url);

test('index.css specifies stable typography for the editable code surface', () => {
  const css = readFileSync(CSS_PATH, 'utf8');
  assert.match(css, /font-size:\s*14px/);
  assert.match(css, /font-weight:\s*400/);
  assert.match(css, /line-height:\s*22px/);
  assert.match(css, /white-space:\s*pre/);
  assert.match(css, /tab-size:\s*4/);
});

test('real Chromium browser measures stable editor typography under JupyterLab theme cascade', { skip: BROWSER_SKIP }, async () => {
  const cssContent = readFileSync(CSS_PATH, 'utf8');

  // JupyterLab theme rules that simulate JupyterLab 4.5.9 theme CSS loaded AFTER plugin CSS
  const jupyterlabThemeCss = `
    :root {
      --jp-code-font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      --jp-code-font-size: 13px;
      --jp-code-line-height: 1.3077;
    }
    .jp-ThemedContainer tt,
    .jp-ThemedContainer code,
    .jp-ThemedContainer kbd,
    .jp-ThemedContainer samp,
    .jp-ThemedContainer pre {
      font-family: var(--jp-code-font-family);
      font-size: var(--jp-code-font-size);
      line-height: var(--jp-code-line-height);
    }
  `;

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style id="plugin-css">
    ${cssContent}
  </style>
  <!-- Simulating JupyterLab 4.5.9 theme stylesheet injected dynamically / later cascade -->
  <style id="jupyterlab-theme-css">
    ${jupyterlabThemeCss}
  </style>
</head>
<body class="jp-ThemedContainer">
  <div class="xedu-micropython-panel">
    <div class="xedu-mp-shell">
      <div class="xedu-mp-body">
        <section class="xedu-mp-editor-pane">
          <div class="xedu-mp-editor-scroll">
            <div class="xedu-mp-editor" data-role="editor" contenteditable="true">print("hello world")</div>
          </div>
        </section>
      </div>
    </div>
  </div>
  <div id="metrics-output"></div>
  <script>
    window.addEventListener('DOMContentLoaded', () => {
      const editor = document.querySelector('.xedu-mp-editor');
      const computed = window.getComputedStyle(editor);

      const metrics = {
        editor: {
          fontSize: computed.fontSize,
          fontWeight: computed.fontWeight,
          lineHeight: computed.lineHeight,
        }
      };

      document.getElementById('metrics-output').textContent = JSON.stringify(metrics);
    });
  </script>
</body>
</html>`;

  const tempDir = mkdtempSync(join(tmpdir(), 'chrome-editor-align-'));
  const tempFile = join(tempDir, 'index.html');

  try {
    const { writeFileSync } = await import('node:fs');
    writeFileSync(tempFile, html, 'utf8');

    const result = await new Promise((resolve, reject) => {
      const child = spawn(CHROME_PATH, [
        '--headless',
        '--disable-gpu',
        '--dump-dom',
        pathToFileURL(tempFile).href,
      ]);

      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (d) => {
        stdout += d;
      });
      child.stderr.on('data', (d) => {
        stderr += d;
      });
      child.on('close', (code) => {
        if (code !== 0) {
          return reject(new Error(`Chromium exited with code ${code}: ${stderr}`));
        }
        const match = stdout.match(/<div id="metrics-output">([\s\S]*?)<\/div>/);
        if (!match) {
          return reject(new Error('Failed to find metrics-output in Chromium dump-dom'));
        }
        try {
          resolve(JSON.parse(match[1]));
        } catch (e) {
          reject(new Error(`Failed to parse metrics JSON: ${match[1]}`));
        }
      });
      child.on('error', reject);
    });

    // Verify computed values measured in real Chromium
    assert.equal(result.editor.fontSize, '14px');
    assert.equal(result.editor.fontWeight, '400');
    assert.equal(result.editor.lineHeight, '22px');
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('real Chromium keeps long lines horizontally scrollable in the single editor surface', { skip: BROWSER_SKIP }, async () => {
  const cssContent = readFileSync(CSS_PATH, 'utf8');
  const code = `${'0123456789'.repeat(30)}\n${'abcdefghij'.repeat(30)}`;
  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>${cssContent}
  body { margin: 0; width: 640px; height: 360px; }
  .xedu-mp-editor-scroll { width: 640px; height: 360px; }
</style></head>
<body><div class="jp-ThemedContainer"><div class="xedu-mp-editor-scroll">
  <div class="xedu-mp-editor" data-role="editor" contenteditable="true"></div>
</div></div><div id="metrics-output"></div>
<script>
  const code = ${JSON.stringify(code)};
  const editor = document.querySelector('[data-role="editor"]');
  editor.textContent = code;
  editor.scrollLeft = 10000;
  const lastCharacter = document.createRange();
  lastCharacter.setStart(editor.firstChild, code.length - 1);
  lastCharacter.setEnd(editor.firstChild, code.length);
  const editorRect = editor.getBoundingClientRect();
  const lastRect = lastCharacter.getBoundingClientRect();
  document.getElementById('metrics-output').textContent = JSON.stringify({
    maxScrollLeft: editor.scrollWidth - editor.clientWidth,
    scrollLeft: editor.scrollLeft,
    lastCharacterLeft: lastRect.left,
    lastCharacterRight: lastRect.right,
    visibleLeft: editorRect.left + editor.clientLeft,
    visibleRight: editorRect.left + editor.clientLeft + editor.clientWidth,
  });
</script></body></html>`;
  const tempDir = mkdtempSync(join(tmpdir(), 'chrome-editor-horizontal-'));
  const tempFile = join(tempDir, 'index.html');

  try {
    const { writeFileSync } = await import('node:fs');
    writeFileSync(tempFile, html, 'utf8');
    const result = await new Promise((resolve, reject) => {
      const child = spawn(CHROME_PATH, ['--headless', '--disable-gpu', '--dump-dom', pathToFileURL(tempFile).href]);
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (chunk) => { stdout += chunk; });
      child.stderr.on('data', (chunk) => { stderr += chunk; });
      child.on('close', (code) => {
        if (code !== 0) return reject(new Error(`Chromium exited with code ${code}: ${stderr}`));
        const match = stdout.match(/<div id="metrics-output">([\s\S]*?)<\/div>/);
        if (!match) return reject(new Error('Failed to find horizontal metrics in Chromium output'));
        try { resolve(JSON.parse(match[1])); } catch { reject(new Error(`Invalid horizontal metrics: ${match[1]}`)); }
      });
      child.on('error', reject);
    });

    assert.ok(result.maxScrollLeft > 0);
    assert.ok(result.scrollLeft > 0);
    // Chromium counts a reserved classic scrollbar gutter differently from an
    // overlay scrollbar. Verify the last character is visible, not that two
    // browser-reported widths produce an identical scroll maximum.
    assert.ok(result.lastCharacterLeft >= result.visibleLeft - 1, JSON.stringify(result));
    assert.ok(result.lastCharacterRight <= result.visibleRight + 1, JSON.stringify(result));
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('MicroPython editor uses one editable rendering tree instead of an overlaid highlight layer', () => {
  const source = readFileSync(new URL('./index.js', import.meta.url), 'utf8');

  assert.match(source, /contenteditable="true"/);
  assert.doesNotMatch(source, /<pre class="xedu-mp-highlight"/);
  assert.doesNotMatch(source, /<textarea class="xedu-mp-editor"/);
});

test('MicroPython completion offers filtered keywords and device APIs', () => {
  assert.equal(completionPrefix('from machine import Pi', 22), 'Pi');
  assert.deepEqual(completionItemsForPrefix('from machine import Pi', 22), ['Pin']);
  assert.deepEqual(completionItemsForPrefix('print(', 6), []);
  assert.ok(completionItemsForPrefix('m', 1).includes('machine'));
  assert.ok(completionItemsForPrefix('', 0, { allowEmpty: true }).includes('abs'));
});

test('insertCompletion replaces only the active identifier', () => {
  assert.deepEqual(
    insertCompletion('from machine import Pi', 22, 'Pin'),
    { value: 'from machine import Pin', cursor: 23 },
  );
});
