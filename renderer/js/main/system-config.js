import apiClient from '../api.js';
import { saveAIConfig } from '../ai.js';
import { log, showToast, showModal, hideModal } from '../ui.js';

export function applySystemConfigToInputs(response) {
    if (!response?.success) return;
    const uiConfig = response.config?.ui || {};
    const jupyterConfig = response.config?.jupyter || {};
    const aiConfig = response.config?.ai || {};

    const resourcesBaseUrl = document.getElementById('resources-base-url');
    const resourcesRepo = document.getElementById('resources-repo');
    const resourcesBranch = document.getElementById('resources-branch');
    const resourcesIndexPath = document.getElementById('resources-index-path');
    const classroomName = document.getElementById('classroom-name');
    const classroomTeacherCode = document.getElementById('classroom-teacher-code');
    const classroomAutoDiscover = document.getElementById('classroom-auto-discover');
    const usePipMirror = document.getElementById('use-tsinghua-mirror');
    const aiBaseUrl = document.getElementById('ai-base-url');
    const aiModelInput = document.getElementById('ai-model-input');
    const allowNetworkAccess = document.getElementById('allow-network-access');
    const allowJupyterRemoteAccess = document.getElementById('allow-jupyter-remote-access');
    const pythonPathInput = document.getElementById('python-path-input');

    if (resourcesBaseUrl) resourcesBaseUrl.value = uiConfig.resources_base_url || '';
    if (resourcesRepo) resourcesRepo.value = uiConfig.resources_repo || '';
    if (resourcesBranch) resourcesBranch.value = uiConfig.resources_branch || 'main';
    if (resourcesIndexPath) resourcesIndexPath.value = uiConfig.resources_index_path || 'index.json';

    if (classroomName) classroomName.value = uiConfig.classroom_name || '';
    if (classroomTeacherCode) classroomTeacherCode.value = uiConfig.classroom_teacher_code || '';
    if (classroomAutoDiscover) {
        classroomAutoDiscover.value = (uiConfig.classroom_auto_discover === false || uiConfig.classroom_auto_discover === 'false') ? 'false' : 'true';
    }
    if (usePipMirror) {
        usePipMirror.checked = uiConfig.pip_use_mirror !== false && uiConfig.pip_use_mirror !== 'false';
    }
    if (aiBaseUrl) aiBaseUrl.value = aiConfig.base_url || '';
    if (aiModelInput) aiModelInput.value = aiConfig.model || '';
    if (allowNetworkAccess) allowNetworkAccess.checked = uiConfig.allow_network_access === true || uiConfig.allow_network_access === 'true';
    if (allowJupyterRemoteAccess) allowJupyterRemoteAccess.checked = jupyterConfig.allow_remote_access === true || jupyterConfig.allow_remote_access === 'true';
    if (pythonPathInput && jupyterConfig.python_executable) pythonPathInput.value = jupyterConfig.python_executable;
    if (window.app?.ai?.syncModelBadge) {
        window.app.ai.syncModelBadge();
    }
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

        const pythonPath = result.path.trim();
        const pythonInput = document.getElementById('python-path-input');
        if (pythonInput) pythonInput.value = pythonPath;
        localStorage.setItem('python_path', pythonPath);

        const startupState = await window.electronAPI.getBackendStartupState?.();
        if (startupState?.state?.status === 'error' && window.electronAPI.retryBackendStartup) {
            const retryResult = await window.electronAPI.retryBackendStartup();
            if (!retryResult?.success) {
                throw new Error(retryResult?.error || '使用所选 Python 启动后端失败');
            }
        }

        const detected = await apiClient.get(`/api/detect_python?python_executable=${encodeURIComponent(pythonPath)}`);
        if (!detected?.success) {
            throw new Error(detected?.message || 'Python 环境检测失败');
        }
        log(`已选择 Python 环境: ${pythonPath}`, 'success');
        showToast('Python 环境可用，请点击“保存设置”完成绑定', 'success');
        return pythonPath;
    } catch (error) {
        console.error('选择 Python 环境失败:', error);
        log(`选择 Python 环境失败: ${error.message}`, 'error');
        showToast(`Python 环境不可用: ${error.message}`, 'error');
        return null;
    }
}

export async function saveSystemConfig() {
    console.log('saveSystemConfig 被调用');
    const apiKey = document.getElementById('api-key-input')?.value.trim();
    const pythonPath = document.getElementById('python-path-input')?.value.trim();
    const aiBaseUrlInput = document.getElementById('ai-base-url')?.value.trim() || '';
    const aiModelInput = document.getElementById('ai-model-input')?.value.trim() || '';

    const resourcesBaseUrlInput = document.getElementById('resources-base-url')?.value.trim() || '';
    const resourcesRepoInput = document.getElementById('resources-repo')?.value.trim() || '';
    const resourcesBranchInput = document.getElementById('resources-branch')?.value.trim() || '';
    const resourcesIndexPathInput = document.getElementById('resources-index-path')?.value.trim() || '';
    const classroomNameInput = document.getElementById('classroom-name')?.value.trim() || '';
    const classroomTeacherCodeInput = document.getElementById('classroom-teacher-code')?.value.trim() || '';
    const classroomAutoDiscoverInput = document.getElementById('classroom-auto-discover')?.value || 'true';
    const usePipMirrorInput = document.getElementById('use-tsinghua-mirror')?.checked ?? true;
    const allowNetworkAccessInput = document.getElementById('allow-network-access')?.checked ?? false;
    const allowJupyterRemoteAccessInput = document.getElementById('allow-jupyter-remote-access')?.checked ?? false;

    const hasResourcesInput = !!(resourcesBaseUrlInput || resourcesRepoInput || resourcesBranchInput || resourcesIndexPathInput);
    const hasClassroomInput = !!(classroomNameInput || classroomTeacherCodeInput || classroomAutoDiscoverInput);
    const hasAiInput = !!(apiKey || aiBaseUrlInput || aiModelInput);
    const hasPackageSettingsInput = true;

    if (!hasAiInput && !pythonPath && !hasResourcesInput && !hasClassroomInput && !hasPackageSettingsInput) {
        log('请至少输入一项配置', 'warning');
        return;
    }

    try {
        if (hasAiInput) {
            await saveAIConfig();
        }

        if (pythonPath) {
            const detected = await apiClient.get(`/api/detect_python?python_executable=${encodeURIComponent(pythonPath)}`);
            if (!detected?.success) {
                throw new Error(detected?.message || 'Python 环境检测失败');
            }
            localStorage.setItem('python_path', pythonPath);
            log('Python 环境路径已保存', 'success');
        }

        const resourcesBaseUrl = resourcesBaseUrlInput;
        const resourcesRepo = resourcesRepoInput;
        const resourcesBranch = resourcesBranchInput || 'main';
        const resourcesIndexPath = resourcesIndexPathInput || 'index.json';

        const uiPayload = {
            resources_base_url: resourcesBaseUrl,
            resources_repo: resourcesRepo,
            resources_branch: resourcesBranch,
            resources_index_path: resourcesIndexPath,
            classroom_name: classroomNameInput,
            classroom_teacher_code: classroomTeacherCodeInput,
            classroom_auto_discover: classroomAutoDiscoverInput !== 'false',
            pip_use_mirror: usePipMirrorInput,
            allow_network_access: allowNetworkAccessInput,
        };

        const jupyterPayload = {
            allow_remote_access: allowJupyterRemoteAccessInput,
        };
        if (pythonPath) {
            jupyterPayload.python_executable = pythonPath;
        }

        await apiClient.saveConfig({ ui: uiPayload, jupyter: jupyterPayload });

        log('配置保存成功', 'success');
        showToast('系统配置已保存', 'success');
    } catch (error) {
        console.error('保存配置失败:', error);
        log('保存配置失败: ' + error.message, 'error');
        showToast('保存失败: ' + error.message, 'error');
    }
}

export async function resetSystemConfig() {
    try {
        await loadSystemConfigToInputs();
        const savedPythonPath = localStorage.getItem('python_path');
        const pythonInput = document.getElementById('python-path-input');
        if (pythonInput) {
            pythonInput.value = savedPythonPath || '';
        }
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
        const uiConfig = initialConfig.config?.ui || {};
        const existing = (uiConfig.classroom_teacher_code || '').trim();
        if (existing) {
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
                await apiClient.saveConfig({ ui: { classroom_teacher_code: code1 } });
                const updatedConfig = await apiClient.loadConfig();
                const classroomTeacherCode = document.getElementById('classroom-teacher-code');
                if (classroomTeacherCode) {
                    classroomTeacherCode.value = code1;
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
