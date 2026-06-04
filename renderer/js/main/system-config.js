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
    const resourcesSubmitUrl = document.getElementById('resources-submit-url');
    const resourcesPublishPath = document.getElementById('resources-publish-path');
    const resourcesPublishToken = document.getElementById('resources-publish-token');
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
    if (resourcesSubmitUrl) resourcesSubmitUrl.value = uiConfig.resources_submit_url || '';
    if (resourcesPublishPath) resourcesPublishPath.value = uiConfig.resources_publish_path || 'courses';
    if (resourcesPublishToken) resourcesPublishToken.value = uiConfig.resources_publish_token || '';

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
    const resourcesSubmitUrlInput = document.getElementById('resources-submit-url')?.value.trim() || '';
    const resourcesPublishPathInput = document.getElementById('resources-publish-path')?.value.trim() || '';
    const resourcesPublishTokenInput = document.getElementById('resources-publish-token')?.value.trim() || '';
    const classroomNameInput = document.getElementById('classroom-name')?.value.trim() || '';
    const classroomTeacherCodeInput = document.getElementById('classroom-teacher-code')?.value.trim() || '';
    const classroomAutoDiscoverInput = document.getElementById('classroom-auto-discover')?.value || 'true';
    const usePipMirrorInput = document.getElementById('use-tsinghua-mirror')?.checked ?? true;
    const allowNetworkAccessInput = document.getElementById('allow-network-access')?.checked ?? false;
    const allowJupyterRemoteAccessInput = document.getElementById('allow-jupyter-remote-access')?.checked ?? false;

    const hasResourcesInput = !!(resourcesBaseUrlInput || resourcesRepoInput || resourcesBranchInput || resourcesIndexPathInput || resourcesSubmitUrlInput || resourcesPublishPathInput || resourcesPublishTokenInput);
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
            localStorage.setItem('python_path', pythonPath);
            log('Python 环境路径已保存', 'success');
        }

        const resourcesBaseUrl = resourcesBaseUrlInput;
        const resourcesRepo = resourcesRepoInput;
        const resourcesBranch = resourcesBranchInput || 'main';
        const resourcesIndexPath = resourcesIndexPathInput || 'index.json';
        const resourcesSubmitUrl = resourcesSubmitUrlInput;
        const resourcesPublishPath = resourcesPublishPathInput || 'courses';
        const resourcesPublishToken = resourcesPublishTokenInput;

        const uiPayload = {
            resources_base_url: resourcesBaseUrl,
            resources_repo: resourcesRepo,
            resources_branch: resourcesBranch,
            resources_index_path: resourcesIndexPath,
            resources_submit_url: resourcesSubmitUrl,
            resources_publish_path: resourcesPublishPath,
            resources_publish_token: resourcesPublishToken,
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

export async function ensureTeacherCodeInitialized() {
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
