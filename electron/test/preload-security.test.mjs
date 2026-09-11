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
  assert.match(source, /approveLocalPath:\s*\(targetPath\)\s*=>\s*ipcRenderer\.invoke\('approve-local-path', targetPath\)/);
  assert.match(source, /downloadXEduCoursePackage:\s*\(context\)\s*=>\s*ipcRenderer\.invoke\('xedu:download-course-package', context\)/);
  assert.match(source, /cleanupXEduCoursePackage:\s*\(cleanupToken\)\s*=>\s*ipcRenderer\.invoke\('xedu:cleanup-course-package', cleanupToken\)/);
  assert.match(source, /onDeepLinkOpenLocalTask:\s*\(callback\)\s*=>\s*ipcRenderer\.on\('deep-link-open-local-task'/);
  assert.doesNotMatch(source, /invoke:\s*\(channel,/);
});

test('local-task deep links use a fixed HTTPS exchange and never log bearer grants', async () => {
  const [mainSource, launchSource, resourcesSource] = await Promise.all([
    readFile(mainProcessPath, 'utf8'),
    readFile(new URL('../main/xedu-local-task-launch.js', import.meta.url), 'utf8'),
    readFile(new URL('../../renderer/js/resources.js', import.meta.url), 'utf8'),
  ]);

  assert.match(mainSource, /parseXEduLocalTaskDeepLink/);
  assert.match(mainSource, /exchangeXEduLocalTaskLaunch/);
  assert.match(mainSource, /deep-link-open-local-task/);
  assert.match(launchSource, /\/api\/xedu\/v1\/launch\/exchange/);
  assert.match(launchSource, /parsed\.protocol !== 'https:'/);
  assert.match(launchSource, /endpoint\.origin !== platformOrigin/);
  assert.match(launchSource, /package_url/);
  assert.match(mainSource, /ipcMain\.handle\('xedu:download-course-package'/);
  assert.match(mainSource, /ipcMain\.handle\('xedu:cleanup-course-package'/);
  assert.doesNotMatch(mainSource, /console\.(?:log|info|warn|error)\([^\n]*(?:grant|rawUrl|deepLinkArg)/i);
  assert.doesNotMatch(resourcesSource, /window\.xeduLaunchContext/);
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

test('generic open-external accepts https and local http preview URLs', async () => {
  const source = await readFile(mainProcessPath, 'utf8');
  const handler = source.match(/ipcMain\.handle\('open-external',[\s\S]*?\n\s*}\);/)?.[0];

  assert.ok(handler, 'generic open-external handler should be registered');
  assert.match(handler, /isAllowedOpenExternalUrl\(url\)/);
  assert.match(source, /function isAllowedOpenExternalUrl\(value\) \{[\s\S]*isSafeExternalUrl\(value\) \|\| isAllowedLocalHttpUrl\(value\)/);
  assert.match(source, /function isAllowedLocalHttpUrl\(value\) \{[\s\S]*protocol === 'http:' && \['127\.0\.0\.1', 'localhost', '::1'\]/);
  assert.match(source, /local-course\\\//);
});

test('generic open-external reports rejected and thrown shell failures', async () => {
  const source = await readFile(mainProcessPath, 'utf8');
  const handler = source.match(/ipcMain\.handle\('open-external',[\s\S]*?\n\s*}\);/)?.[0];

  assert.ok(handler, 'generic open-external handler should be registered');
  assert.match(handler, /result === false/);
  assert.match(handler, /catch \(error\)/);
  assert.match(handler, /success: false/);
});

test('local embedded pages allow the file renderer without opening framing to arbitrary origins', async () => {
  const source = await readFile(mainProcessPath, 'utf8');

  assert.match(source, /localFrameAncestors\s*=\s*["']'self' file: http:\/\/127\.0\.0\.1:\* http:\/\/localhost:\*["']/);
  assert.match(source, /frame-ancestors \$\{localFrameAncestors\}/);
  assert.doesNotMatch(source, /frame-ancestors \*/);
});

test('generic API IPC uses an explicit route allowlist and pip uses a dedicated stream bridge', async () => {
  const source = await readFile(mainProcessPath, 'utf8');

  assert.match(source, /API_REQUEST_ALLOWLIST/);
  assert.match(source, /repair_xedu/);
  assert.match(source, /micropython\\\/upload/);
  assert.match(source, /operations\\\/\[\^\/\]\+/);
  assert.match(source, /!isAllowedApiRequest\(method, relativePath\)/);
  assert.match(source, /api:request rejected/);
  assert.match(source, /ipcMain\.handle\('api:pip-stream'/);
  assert.match(source, /ipcMain\.handle\('api:scratch-request'/);
  assert.match(source, /ipcMain\.handle\('approve-local-path'/);
  assert.match(source, /REALTIME_FRAME_MAX_BYTES/);
  assert.match(source, /REALTIME_MULTIPART_OVERHEAD_BYTES/);
});

test('development Electron and Vite use the same default backend capability', async () => {
  const [mainSource, viteSource] = await Promise.all([
    readFile(mainProcessPath, 'utf8'),
    readFile(new URL('../../vite.config.js', import.meta.url), 'utf8'),
  ]);

  assert.match(mainSource, /!app\.isPackaged\s*\?\s*['"]xedu-dev-capability['"]/);
  assert.match(viteSource, /process\.env\.XEDU_CLIENT_CAPABILITY\s*\|\|\s*['"]xedu-dev-capability['"]/);
});

test('embedded Scratch camera access is limited to trusted local origins', async () => {
  const [source, resourcesSource] = await Promise.all([
    readFile(mainProcessPath, 'utf8'),
    readFile(new URL('../../renderer/js/resources.js', import.meta.url), 'utf8'),
  ]);

  assert.match(source, /function isTrustedLocalMediaOrigin\(/);
  assert.match(source, /setPermissionRequestHandler/);
  assert.match(source, /permission === 'media'/);
  assert.match(source, /parsed\.hostname === '127\.0\.0\.1' \|\| parsed\.hostname === 'localhost'/);
  assert.match(resourcesSource, /frame\.allow\s*=\s*["']camera \*["']/);
});

test('teacher recovery bridge exposes named startup support capabilities only', async () => {
  const source = await readFile(preloadPath, 'utf8');

  assert.match(source, /openBackendLogDirectory:\s*\(\)\s*=>\s*ipcRenderer\.invoke\('backend:open-log-directory'\)/);
  assert.match(source, /selectPython:\s*\(\)\s*=>\s*ipcRenderer\.invoke\('select-python'\)/);
  assert.match(source, /scanPythonEnvironments:\s*\(\)\s*=>\s*ipcRenderer\.invoke\('scan-python-environments'\)/);
  assert.match(source, /setPythonExecutable:\s*\(targetPath\)\s*=>\s*ipcRenderer\.invoke\('set-python', targetPath\)/);
  assert.doesNotMatch(source, /savePythonExecutable|python:save-selection/);
  assert.match(source, /inspectPythonEnvironment:\s*\(targetPath\)\s*=>\s*ipcRenderer\.invoke\('python:inspect-environment', targetPath\)/);
  assert.match(source, /repairPythonEnvironment:\s*\(targetPath\)\s*=>\s*ipcRenderer\.invoke\('python:repair-environment', targetPath\)/);
  assert.match(source, /copyBackendDiagnosticSummary:\s*\(\)\s*=>\s*ipcRenderer\.invoke\('backend:copy-diagnostic-summary'\)/);
  assert.match(source, /retryBackendStartup:\s*\(\)\s*=>\s*ipcRenderer\.invoke\('backend:retry-startup'\)/);
  assert.match(source, /restartBackend:\s*\(\)\s*=>\s*ipcRenderer\.invoke\('backend:restart'\)/);
  assert.match(source, /getBackendStartupState:\s*\(\)\s*=>\s*ipcRenderer\.invoke\('backend:get-startup-state'\)/);
  assert.match(source, /onBackendStartupState:\s*\(callback\)\s*=>\s*ipcRenderer\.on\('backend-startup-state'/);
  assert.doesNotMatch(source, /backend:\s*\{[\s\S]*invoke/i);
});

test('testing a Python path does not select it until confirmation or successful repair', async () => {
  const source = await readFile(mainProcessPath, 'utf8');
  const inspectStart = source.indexOf("ipcMain.handle('python:inspect-environment'");
  const repairStart = source.indexOf("ipcMain.handle('python:repair-environment'");
  const scanStart = source.indexOf("ipcMain.handle('scan-python-environments'");
  const inspectHandler = source.slice(inspectStart, repairStart);
  const repairHandler = source.slice(repairStart, scanStart);

  assert.ok(inspectStart >= 0 && repairStart > inspectStart && scanStart > repairStart);
  assert.doesNotMatch(inspectHandler, /selectedPythonExecutable\s*=/);
  assert.match(repairHandler, /if \(result\.success\) \{[\s\S]*?const effectivePath = result\.path \|\| resolvedPath;[\s\S]*?selectedPythonExecutable = effectivePath;/);
  assert.match(repairHandler, /repairPythonWithBundledFallback/);
  assert.doesNotMatch(repairHandler, /promoteBootstrapBackendIfNeeded/);
});

test('packaged backend runtime is isolated from the configurable experiment runtime', async () => {
  const source = await readFile(mainProcessPath, 'utf8');
  const startupStart = source.indexOf('function startBackendServer');
  const startupEnd = source.indexOf('// --- Jupyter BrowserView Management ---');
  const startup = source.slice(startupStart, startupEnd);

  assert.match(startup, /const backendPython = resolveBackendPythonExecutable\(/);
  assert.match(startup, /pythonExecutable: backendPython/);
  assert.match(startup, /XEDU_PYTHON_EXECUTABLE: backendPython/);
  assert.match(startup, /backendProcess = spawn\(backendPython, args,/);
  assert.match(startup, /windowsHide: true/);
  assert.doesNotMatch(startup, /experimentPython|selectedPythonExecutable|getXEduProResourceDirectories|XEDU_PRO_ROOT/);
});

test('teacher verification code persists only through the encrypted named bridge', async () => {
  const [preloadSource, mainSource] = await Promise.all([
    readFile(preloadPath, 'utf8'),
    readFile(mainProcessPath, 'utf8'),
  ]);

  assert.match(preloadSource, /loadTeacherCredential/);
  assert.match(preloadSource, /saveTeacherCredential/);
  assert.match(preloadSource, /clearTeacherCredential/);
  assert.match(mainSource, /createTeacherCredentialStore/);
  assert.match(mainSource, /safeStorage/);
  assert.doesNotMatch(mainSource, /console\.(log|info|warn|error).*teacher[_-]?code/i);
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
