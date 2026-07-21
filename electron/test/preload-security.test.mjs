import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const preloadPath = new URL('../preload/index.js', import.meta.url);
const mainProcessPath = new URL('../main/main.js', import.meta.url);

test('preload exposes named capabilities instead of a generic IPC invoker', async () => {
  const source = await readFile(preloadPath, 'utf8');

  assert.match(source, /apiRequest:\s*\(request\)\s*=>\s*ipcRenderer\.invoke\('api:request', request\)/);
  assert.match(source, /scratchApiRequest:\s*\(request\)\s*=>\s*ipcRenderer\.invoke\('api:scratch-request', request\)/);
  assert.match(source, /streamPip:\s*\(request, onEvent\)\s*=>/);
  assert.match(source, /getPathForFile:\s*\(file\)\s*=>/);
  assert.match(source, /webUtils\?\.getPathForFile/);
  assert.doesNotMatch(source, /invoke:\s*\(channel,/);
});

test('main and Jupyter windows keep sandbox and web security enabled', async () => {
  const source = await readFile(mainProcessPath, 'utf8');
  const browserWindowPreferences = source.match(
    /mainWindow\s*=\s*new BrowserWindow\([\s\S]*?webPreferences:\s*\{([\s\S]*?)\n\s*\},\s*title:/,
  )?.[1];
  const browserViewPreferences = source.match(
    /const view = new BrowserView\([\s\S]*?webPreferences:\s*\{([\s\S]*?)\n\s*\}\s*\n\s*\}\);/,
  )?.[1];

  assert.ok(browserWindowPreferences, 'main BrowserWindow preferences should be explicit');
  assert.ok(browserViewPreferences, 'Jupyter BrowserView preferences should be explicit');
  assert.match(browserWindowPreferences, /sandbox:\s*true/);
  assert.match(browserWindowPreferences, /webSecurity:\s*true/);
  assert.match(browserViewPreferences, /sandbox:\s*true/);
  assert.match(browserViewPreferences, /webSecurity:\s*true/);
  assert.doesNotMatch(source, /webSecurity:\s*false/);
});

test('Jupyter external browser bridge only accepts the local Jupyter URL policy', async () => {
  const source = await readFile(mainProcessPath, 'utf8');
  const handler = source.match(/ipcMain\.handle\('jupyter:open-external',[\s\S]*?\n\s*}\);/)?.[0];

  assert.ok(handler, 'Jupyter external browser handler should be registered');
  assert.match(handler, /isAllowedJupyterUrl\(url\)/);
  assert.doesNotMatch(handler, /isSafeExternalUrl\(url\)/);
});

test('generic API IPC uses an explicit route allowlist and pip uses a dedicated stream bridge', async () => {
  const source = await readFile(mainProcessPath, 'utf8');

  assert.match(source, /API_REQUEST_ALLOWLIST/);
  assert.match(source, /repair_xedu/);
  assert.match(source, /operations\\\/\[\^\/\]\+/);
  assert.match(source, /!isAllowedApiRequest\(method, relativePath\)/);
  assert.match(source, /ipcMain\.handle\('api:pip-stream'/);
  assert.match(source, /ipcMain\.handle\('api:scratch-request'/);
});

test('embedded Scratch camera access is limited to trusted local origins', async () => {
  const source = await readFile(mainProcessPath, 'utf8');

  assert.match(source, /function isTrustedLocalMediaOrigin\(/);
  assert.match(source, /setPermissionRequestHandler/);
  assert.match(source, /permission === 'media'/);
  assert.match(source, /parsed\.hostname === '127\.0\.0\.1' \|\| parsed\.hostname === 'localhost'/);
});

test('teacher recovery bridge exposes named startup support capabilities only', async () => {
  const source = await readFile(preloadPath, 'utf8');

  assert.match(source, /openBackendLogDirectory:\s*\(\)\s*=>\s*ipcRenderer\.invoke\('backend:open-log-directory'\)/);
  assert.match(source, /selectPython:\s*\(\)\s*=>\s*ipcRenderer\.invoke\('select-python'\)/);
  assert.match(source, /scanPythonEnvironments:\s*\(\)\s*=>\s*ipcRenderer\.invoke\('scan-python-environments'\)/);
  assert.match(source, /setPythonExecutable:\s*\(targetPath\)\s*=>\s*ipcRenderer\.invoke\('set-python', targetPath\)/);
  assert.match(source, /copyBackendDiagnosticSummary:\s*\(\)\s*=>\s*ipcRenderer\.invoke\('backend:copy-diagnostic-summary'\)/);
  assert.match(source, /retryBackendStartup:\s*\(\)\s*=>\s*ipcRenderer\.invoke\('backend:retry-startup'\)/);
  assert.match(source, /restartBackend:\s*\(\)\s*=>\s*ipcRenderer\.invoke\('backend:restart'\)/);
  assert.match(source, /getBackendStartupState:\s*\(\)\s*=>\s*ipcRenderer\.invoke\('backend:get-startup-state'\)/);
  assert.match(source, /onBackendStartupState:\s*\(callback\)\s*=>\s*ipcRenderer\.on\('backend-startup-state'/);
  assert.doesNotMatch(source, /backend:\s*\{[\s\S]*invoke/i);
});

test('teacher verification code is not persisted through an Electron credential bridge', async () => {
  const [preloadSource, mainSource] = await Promise.all([
    readFile(preloadPath, 'utf8'),
    readFile(mainProcessPath, 'utf8'),
  ]);

  assert.doesNotMatch(preloadSource, /loadTeacherCredential|saveTeacherCredential|clearTeacherCredential|teacher-credential:/);
  assert.doesNotMatch(mainSource, /teacherCredentialStore|createTeacherCredentialStore|teacher-credential:/);
});

test('backend diagnostics redact secrets and expose explicit recovery handlers', async () => {
  const source = await readFile(mainProcessPath, 'utf8');

  assert.match(source, /function redactSensitiveDiagnosticText\(/);
  assert.match(source, /token/i);
  assert.match(source, /password/i);
  assert.match(source, /api[_-]?key/i);
  assert.match(source, /teacher[_-]?code|课堂口令/);
  assert.match(source, /request[_-]?body|请求正文/);
  assert.match(source, /ipcMain\.handle\('backend:open-log-directory'/);
  assert.match(source, /ipcMain\.handle\('backend:copy-diagnostic-summary'/);
  assert.match(source, /ipcMain\.handle\('backend:retry-startup'/);
  assert.match(source, /ipcMain\.handle\('backend:get-startup-state'/);
  assert.match(source, /mainWindow\?\.webContents\.send\('backend-startup-state'/);
});

test('renderer exposes visible startup support entry points for logs, diagnostics, and retry', async () => {
  const [rendererHtml, rendererMain, startupSupport] = await Promise.all([
    readFile(new URL('../../renderer/index.html', import.meta.url), 'utf8'),
    readFile(new URL('../../renderer/js/main.js', import.meta.url), 'utf8'),
    readFile(new URL('../../renderer/js/main/backend-startup-support.js', import.meta.url), 'utf8'),
  ]);

  assert.match(rendererHtml, /id="startup-support-card"/);
  assert.match(rendererHtml, /id="open-log-directory-btn"/);
  assert.match(rendererHtml, /id="copy-diagnostic-summary-btn"/);
  assert.match(rendererHtml, /id="retry-backend-startup-btn"/);
  assert.match(rendererHtml, /id="reset-config-btn"/);
  assert.match(startupSupport, /openBackendLogDirectory/);
  assert.match(startupSupport, /copyBackendDiagnosticSummary/);
  assert.match(startupSupport, /retryBackendStartup/);
  assert.match(rendererMain, /onBackendStartupState/);
  assert.match(rendererMain, /getBackendStartupState/);
});
