import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('Python setup keeps select, confirm, test, and repair available together', async () => {
  const [html, systemConfig, jupyter, dispatcher, readiness] = await Promise.all([
    readFile(new URL('../../index.html', import.meta.url), 'utf8'),
    readFile(new URL('./system-config.js', import.meta.url), 'utf8'),
    readFile(new URL('../jupyter.js', import.meta.url), 'utf8'),
    readFile(new URL('../action-dispatcher.js', import.meta.url), 'utf8'),
    readFile(new URL('./python-environment-readiness.js', import.meta.url), 'utf8'),
  ]);

  assert.match(html, /settings-tab active" data-tab="python"/);
  assert.match(html, /id="python-path-select"/);
  assert.match(html, /id="python-scan-btn"[^>]*>刷新/);
  assert.match(html, /id="python-path-input"[^>]*placeholder="手动输入或从上方选择 Python 路径"/);
  assert.doesNotMatch(html, /id="python-path-input"[^>]*readonly/);
  assert.match(html, /id="python-confirm-btn"[^>]*>确认/);
  assert.match(html, /id="python-test-btn"[\s\S]*?测试/);
  assert.doesNotMatch(html, /id="python-confirm-btn"[^>]*disabled/);
  assert.doesNotMatch(html, /id="python-test-btn"[^>]*disabled/);
  assert.doesNotMatch(html, /id="python-repair-btn"[^>]*disabled/);
  assert.doesNotMatch(html, /id="python-runtime-actions"[^>]*display: none/);
  assert.doesNotMatch(html, /id="python-repair-btn"[^>]*display: none/);
  assert.match(html, /id="python-env-check-result"[^>]*hidden/);
  assert.doesNotMatch(html, /先完成 Python 配置/);
  assert.doesNotMatch(html, /尚未选择 Python 环境，请先点击/);
  assert.doesNotMatch(html, /请选择本机 Python 3\.10\+ 环境/);
  assert.doesNotMatch(html, /allow-jupyter-remote-access/);
  assert.doesNotMatch(html, /允许其他设备访问 Jupyter/);
  assert.match(systemConfig, /pendingPythonPath/);
  assert.match(systemConfig, /scanPythonEnvironments/);
  assert.match(systemConfig, /confirmPythonEnvironment/);
  assert.match(systemConfig, /setPythonExecutable/);
  assert.match(systemConfig, /inspectPythonEnvironment/);
  assert.doesNotMatch(systemConfig, /savePythonExecutable/);
  assert.match(systemConfig, /window\.electronAPI\?\.scanPythonEnvironments/);
  assert.match(systemConfig, /configuredPythonPath = String\(response\.config\?\.jupyter\?\.python_executable/);
  assert.match(systemConfig, /已扫描到 .* 个 Python 环境/);
  assert.match(systemConfig, /await apiClient\.saveConfig\(\{/);
  assert.match(systemConfig, /confirmButton\.disabled = isConfirmingPython/);
  assert.match(systemConfig, /testButton\.disabled = false/);
  assert.match(systemConfig, /repairButton\.disabled = isRepairingPython/);
  assert.match(systemConfig, /timeoutMs: 330000/);
  assert.match(systemConfig, /repairPythonEnvironment/);
  assert.match(systemConfig, /独立修复 XEdu 环境/);
  assert.match(systemConfig, /不要求预先安装 Flask/);
  assert.match(systemConfig, /optionalWarnings\.length \? ['"]warning['"] : ['"]success['"]/);
  assert.match(systemConfig, /独立检测 Python 环境/);
  assert.match(systemConfig, /getPythonEnvironmentReadinessIssues/);
  assert.match(systemConfig, /环境尚未就绪/);
  assert.match(systemConfig, /readinessInfo\?\.ssl_available === false/);
  assert.match(systemConfig, /const bootstrap = await directRepair\(pythonPath\);[\s\S]*?await setPythonExecutable\(repairedPath\)/);
  assert.match(jupyter, /inspectPythonEnvironment/);
  assert.match(jupyter, /pythonPath && typeof standaloneInspect === ['"]function['"]/);
  assert.match(systemConfig, /allow_remote_access: false/);
  assert.match(systemConfig, /请先确认 Python 环境，再保存设置/);
  assert.match(systemConfig, /JSON\.parse\(error\.details\)/);
  assert.match(jupyter, /getPythonEnvironmentOptionalWarnings/);
  assert.doesNotMatch(jupyter, /repairBtn\.style\.display/);
  assert.match(jupyter, /formatPythonEnvironmentReadinessMessage/);
  assert.match(readiness, /点击修复安装 JupyterLab/);
  assert.doesNotMatch(readiness, /issues\.push\(['"]XEdu 运行组件['"]\)/);
  assert.match(dispatcher, /system\.confirmPythonEnvironment/);
  assert.match(dispatcher, /system\.scanPythonEnvironments/);
});

test('course repository configuration only lives in the resource import flow', async () => {
  const [html, systemConfig] = await Promise.all([
    readFile(new URL('../../index.html', import.meta.url), 'utf8'),
    readFile(new URL('./system-config.js', import.meta.url), 'utf8'),
  ]);

  assert.doesNotMatch(html, /settings-tab" data-tab="resources"/);
  assert.doesNotMatch(html, /data-settings-tab="resources"/);
  assert.doesNotMatch(html, /id="resources-base-url"/);
  assert.doesNotMatch(html, /id="resources-repo"/);
  assert.doesNotMatch(systemConfig, /resources_base_url/);
  assert.match(html, /id="resources-cloud-repo-address"/);
});

test('classroom settings use direct controls without instructional copy', async () => {
  const [html, systemConfig] = await Promise.all([
    readFile(new URL('../../index.html', import.meta.url), 'utf8'),
    readFile(new URL('./system-config.js', import.meta.url), 'utf8'),
  ]);

  assert.match(html, /id="classroom-name"/);
  assert.match(html, /id="classroom-teacher-code"/);
  assert.match(html, /input type="checkbox" id="classroom-auto-discover" checked/);
  assert.match(html, /input type="checkbox" id="allow-network-access" checked/);
  assert.doesNotMatch(html, /教师口令：用于登录教师模式与开启\/结束课堂/);
  assert.doesNotMatch(html, /开启课堂时，学生需要和教师连接同一个 Wi-Fi 或局域网/);
  assert.doesNotMatch(html, /settings-network-card/);
  assert.match(systemConfig, /classroomAutoDiscover\.checked/);
    assert.match(systemConfig, /classroom_auto_discover: classroomAutoDiscoverInput/);
});

test('confirming an experiment Python does not restart the isolated packaged backend', async () => {
  const systemConfig = await readFile(new URL('./system-config.js', import.meta.url), 'utf8');
  const confirmPythonSource = systemConfig.slice(
    systemConfig.indexOf('export async function confirmPythonEnvironment'),
    systemConfig.indexOf('export async function repairXeduEnvironment'),
  );
  assert.doesNotMatch(confirmPythonSource, /restartBackend/);
  assert.doesNotMatch(confirmPythonSource, /getBackendStartupState/);
  assert.doesNotMatch(confirmPythonSource, /savePythonExecutable/);
  assert.match(confirmPythonSource, /python_selection_confirmed:\s*true/);
  assert.match(confirmPythonSource, /await apiClient\.saveConfig\(/);
  assert.match(systemConfig, /hasStandalonePythonFlow[\s\S]*?API_ENDPOINTS\.PYTHON_DETECT/);
});
