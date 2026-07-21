import apiClient, { API_ENDPOINTS } from '../api.js';
import { normalizeAiApiMode, saveAIConfig } from '../ai.js';
import { log, showToast, showModal, hideModal } from '../ui.js';
import {
    buildTeacherCodeUpdate,
    isTeacherCodeConfigured,
    writeTeacherModeState,
} from './teacher-mode-state.js';

let savedAllowNetworkAccess = null;
let pendingPythonPath = '';
let pythonSelectionConfirmed = false;
let isConfirmingPython = false;
let isRepairingPython = false;
let isScanningPythonEnvironments = false;
let lastScannedPythonEnvironments = [];

function getStoredPythonPath() {
    try {
        return (localStorage.getItem('python_path') || '').trim();
    } catch (_) {
        return '';
    }
}

function storePythonPath(path) {
    try {
        localStorage.setItem('python_path', path);
    } catch (_) {
        // The backend configuration remains the source of truth if storage is unavailable.
    }
}

function publishTeacherSessionUpdate(state) {
    if (!state?.unlocked) return;
    window.dispatchEvent(new CustomEvent('xedu:teacher-credential-updated', {
        detail: { unlocked: true },
    }));
}

function clearPythonEnvironmentResult() {
    const result = document.getElementById('python-env-check-result');
    if (!result) return;
    result.hidden = true;
    result.textContent = '';
    delete result.dataset.state;
}

function getApiErrorMessage(error, fallback) {
    if (error?.details) {
        try {
            const parsed = JSON.parse(error.details);
            if (parsed?.message) return parsed.message;
        } catch (_) {
            return String(error.details);
        }
    }
    return error?.message || fallback;
}

function supportsPythonEnvironmentScan() {
    return typeof window.electronAPI?.scanPythonEnvironments === 'function';
}

function getPathTail(targetPath) {
    const normalized = String(targetPath || '').trim().replace(/[\\/]+$/, '');
    if (!normalized) return '';
    return normalized.split(/[\\/]/).filter(Boolean).pop() || normalized;
}

function setPendingPythonPath(nextPath) {
    pendingPythonPath = String(nextPath || '').trim();
    pythonSelectionConfirmed = false;
    clearPythonEnvironmentResult();
    renderPythonSelectionState(pendingPythonPath, { confirmed: false });
}

function renderPythonEnvironmentOptions(environments = lastScannedPythonEnvironments, currentPath = '', {
    loading = false,
    supported = supportsPythonEnvironmentScan(),
} = {}) {
    const select = document.getElementById('python-path-select');
    const scanButton = document.getElementById('python-scan-btn');
    if (!select) return;

    const normalizedCurrentPath = String(currentPath || '').trim();
    const normalizedEnvironments = Array.isArray(environments) ? environments : [];
    const hasCurrentPath = normalizedCurrentPath
        && normalizedEnvironments.some((item) => String(item?.path || '').trim() === normalizedCurrentPath);

    const options = [];
    if (!supported) {
        options.push({ value: '', label: '当前模式不支持自动扫描' });
    } else if (loading) {
        options.push({ value: '', label: '正在扫描可用 Python 环境…' });
    } else if (normalizedEnvironments.length === 0) {
        options.push({ value: '', label: '未扫描到可用 Python，仍可手动输入或点击选择' });
    } else {
        options.push({ value: '', label: '选择已扫描到的 Python 环境' });
    }

    if (normalizedCurrentPath && !hasCurrentPath) {
        options.push({
            value: normalizedCurrentPath,
            label: `当前路径 · ${getPathTail(normalizedCurrentPath)}`,
            title: normalizedCurrentPath,
        });
    }

    normalizedEnvironments.forEach((item) => {
        const optionPath = String(item?.path || '').trim();
        if (!optionPath) return;
        options.push({
            value: optionPath,
            label: item.label || `${getPathTail(optionPath)} · ${item.version || 'Python'}`,
            title: optionPath,
        });
    });

    select.innerHTML = '';
    options.forEach((item) => {
        const option = document.createElement('option');
        option.value = item.value;
        option.textContent = item.label;
        option.title = item.title || item.label;
        select.appendChild(option);
    });

    if (normalizedCurrentPath) {
        select.value = normalizedCurrentPath;
    } else if (select.options.length > 0) {
        select.selectedIndex = 0;
    }

    select.disabled = loading || !supported;
    if (scanButton) {
        scanButton.disabled = loading || !supported;
        scanButton.textContent = loading ? '扫描中…' : '刷新';
    }

    if (!select.dataset.pythonSelectionBound) {
        select.dataset.pythonSelectionBound = 'true';
        select.addEventListener('change', () => {
            const selectedPath = select.value.trim();
            if (!selectedPath) return;
            setPendingPythonPath(selectedPath);
            log(`已选择扫描到的 Python 环境: ${selectedPath}`, 'info');
        });
    }
}

function syncPythonEnvironmentOptions(path = '') {
    const select = document.getElementById('python-path-select');
    if (!select) return;
    const normalizedPath = String(path || '').trim();
    if (!normalizedPath) {
        if (select.options.length > 0) select.selectedIndex = 0;
        return;
    }
    if ([...select.options].some((option) => option.value === normalizedPath)) {
        select.value = normalizedPath;
        return;
    }
    if (!isScanningPythonEnvironments) {
        renderPythonEnvironmentOptions(lastScannedPythonEnvironments, normalizedPath, {
            loading: false,
            supported: supportsPythonEnvironmentScan(),
        });
    }
}

function renderPythonSelectionState(path = '', { confirmed = false } = {}) {
    const pythonInput = document.getElementById('python-path-input');
    const selectButton = document.getElementById('python-select-btn');
    const confirmButton = document.getElementById('python-confirm-btn');
    const runtimeActions = document.getElementById('python-runtime-actions');
    const testButton = document.getElementById('python-test-btn');
    const repairButton = document.getElementById('python-repair-btn');
    const result = document.getElementById('python-env-check-result');
    const normalizedPath = String(path || '').trim();
    const state = !normalizedPath ? 'empty' : confirmed ? 'ready' : 'selected';

    if (pythonInput) {
        pythonInput.value = normalizedPath;
        pythonInput.dataset.state = state;
        if (!pythonInput.dataset.pythonSelectionBound) {
            pythonInput.dataset.pythonSelectionBound = 'true';
            pythonInput.addEventListener('input', () => {
                setPendingPythonPath(pythonInput.value.trim());
            });
        }
    }
    if (selectButton) selectButton.textContent = '选择';
    if (confirmButton) confirmButton.disabled = isConfirmingPython;
    if (testButton) testButton.disabled = false;
    if (repairButton) repairButton.disabled = isRepairingPython;
    if (runtimeActions) runtimeActions.style.display = 'flex';
    if (result && !normalizedPath) clearPythonEnvironmentResult();
    syncPythonEnvironmentOptions(normalizedPath);
}

export function applySystemConfigToInputs(response) {
    if (!response?.success) return;
    const uiConfig = response.config?.ui || {};
    const aiConfig = response.config?.ai || {};

    const classroomName = document.getElementById('classroom-name');
    const classroomTeacherCode = document.getElementById('classroom-teacher-code');
    const classroomAutoDiscover = document.getElementById('classroom-auto-discover');
    const usePipMirror = document.getElementById('use-tsinghua-mirror');
    const aiBaseUrl = document.getElementById('ai-base-url');
    const aiModelInput = document.getElementById('ai-model-input');
    const aiApiMode = document.getElementById('ai-api-mode');
    const allowNetworkAccess = document.getElementById('allow-network-access');
    const pythonPathInput = document.getElementById('python-path-input');

    if (classroomName) classroomName.value = uiConfig.classroom_name || '';
    if (classroomTeacherCode) {
        const teacherCodeConfigured = isTeacherCodeConfigured(response);
        classroomTeacherCode.value = '';
        classroomTeacherCode.placeholder = teacherCodeConfigured
            ? '已设置，输入新口令可修改'
            : '输入口令';
        classroomTeacherCode.dataset.configured = String(teacherCodeConfigured);
    }
    if (classroomAutoDiscover) {
        classroomAutoDiscover.checked = uiConfig.classroom_auto_discover !== false && uiConfig.classroom_auto_discover !== 'false';
    }
    if (usePipMirror) {
        usePipMirror.checked = uiConfig.pip_use_mirror !== false && uiConfig.pip_use_mirror !== 'false';
    }
    if (aiBaseUrl) aiBaseUrl.value = aiConfig.base_url || '';
    if (aiModelInput) aiModelInput.value = aiConfig.model || '';
    if (aiApiMode) aiApiMode.value = normalizeAiApiMode(aiConfig.base_url, aiConfig.api_mode);
    savedAllowNetworkAccess = uiConfig.allow_network_access !== false && uiConfig.allow_network_access !== 'false';
    if (allowNetworkAccess) allowNetworkAccess.checked = savedAllowNetworkAccess;
    const configuredPythonPath = String(response.config?.jupyter?.python_executable || '').trim();
    const storedPythonPath = getStoredPythonPath();
    const pythonPath = configuredPythonPath || storedPythonPath;
    pendingPythonPath = '';
    pythonSelectionConfirmed = Boolean(configuredPythonPath);
    if (configuredPythonPath) storePythonPath(configuredPythonPath);
    if (pythonPathInput) pythonPathInput.value = pythonPath;
    renderPythonSelectionState(pythonPath, { confirmed: pythonSelectionConfirmed });
    renderPythonEnvironmentOptions(lastScannedPythonEnvironments, pythonPath, {
        loading: isScanningPythonEnvironments,
        supported: supportsPythonEnvironmentScan(),
    });
    if (supportsPythonEnvironmentScan()) {
        scanPythonEnvironments({ silent: true, preferredPath: pythonPath }).catch((error) => {
            console.warn('自动扫描 Python 环境失败:', error);
        });
    }
    if (window.app?.ai?.syncModelBadge) {
        window.app.ai.syncModelBadge();
    }
    return pythonPath;
}

export async function loadSystemConfigToInputs() {
    const response = await apiClient.loadConfig();
    applySystemConfigToInputs(response);
}

export async function selectPythonEnvironment() {
    const selectPython = window.electronAPI?.selectPython;
    if (typeof selectPython !== 'function') {
        showToast('浏览器模式不支持选择 Python 文件，请直接输入路径。', 'warning');
        return null;
    }

    try {
        const result = await selectPython();
        if (!result?.success) {
            if (!result?.canceled) {
                throw new Error(result?.error || '选择 Python 环境失败');
            }
            return null;
        }

        setPendingPythonPath(result.path.trim());
        log(`已选择 Python 环境: ${pendingPythonPath}`, 'info');
        showToast('Python 环境已选择', 'success');
        return pendingPythonPath;
    } catch (error) {
        console.error('选择 Python 环境失败:', error);
        const message = getApiErrorMessage(error, '未知错误');
        log(`选择 Python 环境失败: ${message}`, 'error');
        showToast(`Python 环境选择失败: ${message}`, 'error');
        return null;
    }
}

export async function scanPythonEnvironments({ silent = false, preferredPath = '' } = {}) {
    const scanner = window.electronAPI?.scanPythonEnvironments;
    const currentPath = String(
        preferredPath
        || pendingPythonPath
        || document.getElementById('python-path-input')?.value
        || '',
    ).trim();

    if (typeof scanner !== 'function') {
        renderPythonEnvironmentOptions([], currentPath, { supported: false });
        return [];
    }

    isScanningPythonEnvironments = true;
    renderPythonEnvironmentOptions(lastScannedPythonEnvironments, currentPath, {
        loading: true,
        supported: true,
    });
    try {
        const result = await scanner();
        if (!result?.success) {
            throw new Error(result?.error || '扫描 Python 环境失败');
        }
        lastScannedPythonEnvironments = Array.isArray(result.environments) ? result.environments : [];
        renderPythonEnvironmentOptions(lastScannedPythonEnvironments, currentPath, {
            loading: false,
            supported: true,
        });
        if (!silent) {
            const message = lastScannedPythonEnvironments.length > 0
                ? `已扫描到 ${lastScannedPythonEnvironments.length} 个 Python 环境`
                : '未扫描到可用 Python 环境';
            log(message, 'info');
            showToast(message, lastScannedPythonEnvironments.length > 0 ? 'success' : 'warning');
        }
        return lastScannedPythonEnvironments;
    } catch (error) {
        renderPythonEnvironmentOptions(lastScannedPythonEnvironments, currentPath, {
            loading: false,
            supported: true,
        });
        if (!silent) {
            const message = getApiErrorMessage(error, '未知错误');
            log(`扫描 Python 环境失败: ${message}`, 'error');
            showToast(`扫描失败: ${message}`, 'error');
        }
        return [];
    } finally {
        isScanningPythonEnvironments = false;
        renderPythonEnvironmentOptions(lastScannedPythonEnvironments, currentPath, {
            loading: false,
            supported: true,
        });
    }
}

export async function confirmPythonEnvironment() {
    if (isConfirmingPython) return null;
    const pythonPath = pendingPythonPath || document.getElementById('python-path-input')?.value.trim() || '';
    if (!pythonPath) {
        showToast('请先选择本机 Python。', 'warning');
        return null;
    }

    isConfirmingPython = true;
    renderPythonSelectionState(pythonPath, { confirmed: false });
    try {
        let confirmedPath = pythonPath;
        const setPythonExecutable = window.electronAPI?.setPythonExecutable;
        if (typeof setPythonExecutable === 'function') {
            const selected = await setPythonExecutable(pythonPath);
            if (!selected?.success) {
                throw new Error(selected?.error || 'Python 环境校验失败');
            }
            confirmedPath = String(selected.path || pythonPath).trim();
        }

        const restartBackend = window.electronAPI?.restartBackend;
        let restartedBeforeSave = false;
        if (typeof restartBackend === 'function') {
            let startupState = null;
            try {
                const stateResult = await window.electronAPI?.getBackendStartupState?.();
                startupState = stateResult?.state || null;
            } catch (_) {
                startupState = null;
            }
            if (startupState?.status !== 'ready') {
                log('正在启动后端服务以检测 Python 环境…', 'info');
                const restartResult = await restartBackend();
                if (!restartResult?.success) {
                    throw new Error(restartResult?.error || '应用 Python 环境失败');
                }
                restartedBeforeSave = true;
            }
        }

        const detected = await apiClient.get(`${API_ENDPOINTS.PYTHON_DETECT}?python_executable=${encodeURIComponent(confirmedPath)}`);
        if (!detected?.success) {
            throw new Error(detected?.message || 'Python 环境检测失败');
        }

        confirmedPath = String(detected.info?.python_executable || confirmedPath).trim();
        const saved = await apiClient.saveConfig({
            jupyter: { python_executable: confirmedPath },
        });
        if (!saved?.success) {
            throw new Error(saved?.message || 'Python 环境保存失败');
        }

        storePythonPath(confirmedPath);
        pendingPythonPath = '';
        pythonSelectionConfirmed = true;
        renderPythonSelectionState(confirmedPath, { confirmed: true });
        log(`已确认使用 Python 环境: ${confirmedPath}`, 'success');
        showToast('Python 环境已确认', 'success');

        if (typeof restartBackend === 'function' && !restartedBeforeSave) {
            log('正在重启后端服务以应用 Python 环境…', 'info');
            const restartResult = await restartBackend();
            if (!restartResult?.success) {
                throw new Error(restartResult?.error || '应用 Python 环境失败');
            }
            log('后端服务已就绪', 'success');
        }
        return confirmedPath;
    } catch (error) {
        const message = getApiErrorMessage(error, '未知错误');
        pythonSelectionConfirmed = false;
        renderPythonSelectionState(pythonPath, { confirmed: false });
        log(`确认 Python 环境失败: ${message}`, 'error');
        showToast(`确认失败: ${message}`, 'error');
        return null;
    } finally {
        isConfirmingPython = false;
        const currentPath = document.getElementById('python-path-input')?.value.trim() || pythonPath;
        renderPythonSelectionState(currentPath, { confirmed: pythonSelectionConfirmed });
    }
}

export async function repairXeduEnvironment() {
    if (isRepairingPython) return null;
    const pythonPath = document.getElementById('python-path-input')?.value.trim() || '';
    if (!pythonPath) {
        showToast('请先输入或选择本机 Python。', 'warning');
        return null;
    }

    isRepairingPython = true;
    renderPythonSelectionState(pythonPath, { confirmed: pythonSelectionConfirmed });
    try {
        const result = await apiClient.call(API_ENDPOINTS.PYTHON_REPAIR_XEDU, {
            method: 'POST',
            body: JSON.stringify({ python_executable: pythonPath }),
            timeoutMs: 330000,
        });
        if (!result?.success) throw new Error(result?.message || '环境修复失败');

        const resultEl = document.getElementById('python-env-check-result');
        if (resultEl) {
            resultEl.hidden = false;
            resultEl.dataset.state = 'success';
            resultEl.textContent = result.message || '环境已修复';
        }
        log(result.message || 'Python 环境修复完成', 'success');
        showToast(result.message || '环境已修复', 'success');
        return result;
    } catch (error) {
        const message = getApiErrorMessage(error, '未知错误');
        log(`Python 环境修复失败: ${message}`, 'error');
        showToast(`修复失败: ${message}`, 'error');
        return null;
    } finally {
        isRepairingPython = false;
        renderPythonSelectionState(pythonPath, { confirmed: pythonSelectionConfirmed });
    }
}

export async function saveSystemConfig() {
    console.log('saveSystemConfig 被调用');
    const apiKey = document.getElementById('api-key-input')?.value.trim();
    const pythonPath = document.getElementById('python-path-input')?.value.trim();
    const aiBaseUrlInput = document.getElementById('ai-base-url')?.value.trim() || '';
    const aiModelInput = document.getElementById('ai-model-input')?.value.trim() || '';
    const aiApiModeInput = document.getElementById('ai-api-mode')?.value || 'auto';

    const classroomNameInput = document.getElementById('classroom-name')?.value.trim() || '';
    const classroomTeacherCodeInput = document.getElementById('classroom-teacher-code')?.value.trim() || '';
    const classroomAutoDiscoverInput = document.getElementById('classroom-auto-discover')?.checked ?? true;
    const usePipMirrorInput = document.getElementById('use-tsinghua-mirror')?.checked ?? true;
    const allowNetworkAccessInput = document.getElementById('allow-network-access')?.checked ?? true;
    const hasClassroomInput = !!(classroomNameInput || classroomTeacherCodeInput || classroomAutoDiscoverInput);
    const hasAiInput = !!(apiKey || aiBaseUrlInput || aiModelInput || aiApiModeInput);
    const hasPackageSettingsInput = true;

    if (!hasAiInput && !pythonPath && !hasClassroomInput && !hasPackageSettingsInput) {
        log('请至少输入一项配置', 'warning');
        return;
    }

    try {
        if (pythonPath && !pythonSelectionConfirmed) {
            showToast('请先确认 Python 环境，再保存设置。', 'warning');
            return;
        }
        if (hasAiInput) {
            await saveAIConfig();
        }

        if (pythonPath) {
            const detected = await apiClient.get(`/api/detect_python?python_executable=${encodeURIComponent(pythonPath)}`);
            if (!detected?.success) {
                throw new Error(detected?.message || 'Python 环境检测失败');
            }
            storePythonPath(pythonPath);
            log('Python 环境路径已保存', 'success');
        }

        const uiPayload = {
            classroom_name: classroomNameInput,
            classroom_auto_discover: classroomAutoDiscoverInput,
            pip_use_mirror: usePipMirrorInput,
            allow_network_access: allowNetworkAccessInput,
            ...buildTeacherCodeUpdate(classroomTeacherCodeInput),
        };

        const jupyterPayload = {
            allow_remote_access: false,
        };
        if (pythonPath) {
            jupyterPayload.python_executable = pythonPath;
        }

        const networkAccessChanged = savedAllowNetworkAccess !== null
            && savedAllowNetworkAccess !== allowNetworkAccessInput;
        const saveResponse = await apiClient.saveConfig({ ui: uiPayload, jupyter: jupyterPayload });
        if (!saveResponse?.success) {
            throw new Error(saveResponse?.message || '配置保存失败');
        }
        savedAllowNetworkAccess = allowNetworkAccessInput;
        if (classroomTeacherCodeInput) {
            const teacherSession = writeTeacherModeState(classroomTeacherCodeInput);
            publishTeacherSessionUpdate(teacherSession);
            const classroomTeacherCode = document.getElementById('classroom-teacher-code');
            if (classroomTeacherCode) {
                classroomTeacherCode.value = '';
                classroomTeacherCode.placeholder = '已设置，输入新口令可修改';
                classroomTeacherCode.dataset.configured = 'true';
            }
        }

        if (networkAccessChanged) {
            const restartBackend = window.electronAPI?.restartBackend;
            if (typeof restartBackend !== 'function') {
                showToast('课堂网络设置已保存，请重启 XEdu Client 后再开启课堂', 'warning');
            } else {
                log('正在应用课堂网络设置，请稍候…', 'info');
                const restartResult = await restartBackend();
                if (!restartResult?.success) {
                    throw new Error(restartResult?.error || '应用课堂网络设置失败');
                }
                log('课堂网络设置已生效', 'success');
            }
        }

        log('配置保存成功', 'success');
        showToast(
            networkAccessChanged
                ? '课堂网络设置已更新'
                : '系统配置已保存',
            'success',
        );
    } catch (error) {
        console.error('保存配置失败:', error);
        log('保存配置失败: ' + error.message, 'error');
        showToast('保存失败: ' + error.message, 'error');
    }
}

export async function resetSystemConfig() {
    try {
        await loadSystemConfigToInputs();
        showToast('已恢复未保存的设置修改', 'success');
    } catch (error) {
        console.error('恢复设置失败:', error);
        showToast('恢复失败: ' + error.message, 'error');
    }
}

export async function ensureTeacherCodeInitialized(options = {}) {
    const { prompt = true } = options;
    let initialConfig = null;
    try {
        initialConfig = await apiClient.loadConfig();
        if (!initialConfig?.success) return initialConfig;
        if (isTeacherCodeConfigured(initialConfig)) {
            return initialConfig;
        }
    } catch (error) {
        console.warn('读取教师口令配置失败，跳过初始化向导:', error);
        return initialConfig;
    }

    if (!prompt) {
        return initialConfig;
    }

    const modal = document.getElementById('teacher-init-modal');
    const errorEl = document.getElementById('teacher-init-error');
    const input1 = document.getElementById('teacher-init-code');
    const input2 = document.getElementById('teacher-init-code-confirm');
    const confirmBtn = document.getElementById('teacher-init-confirm');

    if (!modal || !errorEl || !input1 || !input2 || !confirmBtn) {
        return initialConfig;
    }

    showModal('teacher-init-modal');
    errorEl.textContent = '';
    errorEl.style.display = 'none';
    confirmBtn.disabled = false;
    input1.value = '';
    input2.value = '';
    input1.focus();

    return new Promise((resolve) => {
        const cleanup = () => {
            confirmBtn.onclick = null;
            input1.onkeydown = null;
            input2.onkeydown = null;
        };
        const finish = (configResponse = null) => {
            hideModal('teacher-init-modal');
            cleanup();
            resolve(configResponse || initialConfig);
        };
        const validateAndSave = async () => {
            const code1 = (input1.value || '').trim();
            const code2 = (input2.value || '').trim();
            if (!code1 || !code2) {
                errorEl.textContent = '教师口令不能为空';
                errorEl.style.display = 'block';
                return;
            }
            if (code1.length < 4) {
                errorEl.textContent = '教师口令至少 4 位字符';
                errorEl.style.display = 'block';
                return;
            }
            if (code1 !== code2) {
                errorEl.textContent = '两次输入的教师口令不一致';
                errorEl.style.display = 'block';
                return;
            }
            confirmBtn.disabled = true;
            try {
                const saved = await apiClient.saveConfig({ ui: { classroom_teacher_code: code1 } });
                if (!saved?.success) {
                    throw new Error(saved?.message || '保存教师口令失败');
                }
                const updatedConfig = await apiClient.loadConfig();
                if (!isTeacherCodeConfigured(updatedConfig)) {
                    throw new Error('教师口令保存后未生效');
                }
                const teacherSession = writeTeacherModeState(code1);
                publishTeacherSessionUpdate(teacherSession);
                const classroomTeacherCode = document.getElementById('classroom-teacher-code');
                if (classroomTeacherCode) {
                    classroomTeacherCode.value = '';
                    classroomTeacherCode.placeholder = '已设置，输入新口令可修改';
                    classroomTeacherCode.dataset.configured = 'true';
                }
                finish(updatedConfig);
            } catch (error) {
                errorEl.textContent = '保存失败: ' + (error.message || '未知错误');
                errorEl.style.display = 'block';
                confirmBtn.disabled = false;
            }
        };
        confirmBtn.onclick = (event) => {
            event.preventDefault();
            validateAndSave().catch((err) => {
                console.warn('保存教师口令失败:', err);
                confirmBtn.disabled = false;
            });
        };
        const handleEnter = (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                confirmBtn.click();
            }
        };
        input1.onkeydown = handleEnter;
        input2.onkeydown = handleEnter;
    });
}
