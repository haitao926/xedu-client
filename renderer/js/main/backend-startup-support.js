const DEFAULT_BACKEND_STARTUP_STATE = Object.freeze({
    status: 'idle',
    message: '',
    canRetry: true,
    attemptCount: 0,
    logDirectory: '',
});

function normalizeBackendStartupState(state) {
    if (!state || typeof state !== 'object') {
        return { ...DEFAULT_BACKEND_STARTUP_STATE };
    }
    return {
        ...DEFAULT_BACKEND_STARTUP_STATE,
        ...state,
        message: typeof state.message === 'string' ? state.message.trim() : '',
        logDirectory: typeof state.logDirectory === 'string' ? state.logDirectory.trim() : '',
    };
}

export function createBackendStartupSupport({
    documentRef = globalThis.document,
    windowRef = globalThis.window,
    showToast,
    apiClient,
    applySystemConfigToInputs,
    refreshStatus,
} = {}) {
    let latestState = { ...DEFAULT_BACKEND_STARTUP_STATE };

    function render(state = latestState) {
        const card = documentRef?.getElementById('startup-support-card');
        const statusEl = documentRef?.getElementById('startup-support-status');
        const pathEl = documentRef?.getElementById('startup-support-path');
        const retryBtn = documentRef?.getElementById('retry-backend-startup-btn');
        const copyBtn = documentRef?.getElementById('copy-diagnostic-summary-btn');
        const openLogBtn = documentRef?.getElementById('open-log-directory-btn');
        if (!card || !statusEl || !retryBtn || !copyBtn || !openLogBtn) return;

        const nextState = normalizeBackendStartupState(state);
        latestState = nextState;
        const shouldShow = nextState.status === 'error'
            || nextState.status === 'starting'
            || (nextState.status === 'idle' && nextState.attemptCount > 0);

        card.hidden = !shouldShow;
        statusEl.textContent = nextState.message || '后端启动异常时，可在此打开日志目录、复制脱敏诊断摘要或重试启动。';
        retryBtn.disabled = nextState.status === 'starting' || nextState.canRetry === false;
        copyBtn.disabled = nextState.status === 'starting' && !nextState.message;
        openLogBtn.disabled = false;

        if (pathEl) {
            if (nextState.logDirectory) {
                pathEl.style.display = 'block';
                pathEl.textContent = `日志目录：${nextState.logDirectory}`;
            } else {
                pathEl.style.display = 'none';
                pathEl.textContent = '';
            }
        }
    }

    async function getState() {
        const electronApi = windowRef?.electronAPI;
        if (!electronApi?.getBackendStartupState) {
            return { ...DEFAULT_BACKEND_STARTUP_STATE };
        }
        const result = await electronApi.getBackendStartupState();
        return normalizeBackendStartupState(result?.state);
    }

    async function openLogDirectory() {
        if (!windowRef?.electronAPI?.openBackendLogDirectory) {
            showToast?.('仅桌面版支持打开日志目录', 'warning');
            return;
        }
        const result = await windowRef.electronAPI.openBackendLogDirectory();
        if (!result?.success) throw new Error(result?.error || '打开日志目录失败');
        showToast?.('已打开日志目录', 'success');
    }

    async function copyDiagnosticSummary() {
        if (!windowRef?.electronAPI?.copyBackendDiagnosticSummary) {
            showToast?.('仅桌面版支持复制诊断摘要', 'warning');
            return;
        }
        const result = await windowRef.electronAPI.copyBackendDiagnosticSummary();
        if (!result?.success) throw new Error(result?.error || '复制诊断摘要失败');
        showToast?.('已复制脱敏诊断摘要', 'success');
    }

    async function retry() {
        if (!windowRef?.electronAPI?.retryBackendStartup) {
            showToast?.('仅桌面版支持重试启动', 'warning');
            return;
        }
        render({
            ...latestState,
            status: 'starting',
            message: '正在重试后端启动…',
            canRetry: false,
        });
        const result = await windowRef.electronAPI.retryBackendStartup();
        render(result?.state || latestState);
        if (!result?.success) throw new Error(result?.error || '重试启动失败');
        showToast?.('已重新触发后端启动', 'success');
        void Promise.resolve(refreshStatus?.()).catch((error) => console.warn('刷新后端状态失败:', error));
    }

    async function resetConfiguration() {
        if (!windowRef?.electronAPI?.apiRequest) {
            showToast?.('仅桌面版支持恢复默认配置', 'warning');
            return;
        }
        if (!windowRef.confirm('将恢复默认配置，当前配置会先备份。是否继续？')) return;
        const result = await apiClient.resetConfig();
        if (!result?.success) throw new Error(result?.message || '恢复默认配置失败');
        applySystemConfigToInputs(result);
        showToast?.('已恢复默认配置，原配置已备份', 'success');
        void Promise.resolve(refreshStatus?.()).catch((error) => console.warn('恢复配置后刷新状态失败:', error));
    }

    function bindActions() {
        const openLogBtn = documentRef?.getElementById('open-log-directory-btn');
        const copyBtn = documentRef?.getElementById('copy-diagnostic-summary-btn');
        const retryBtn = documentRef?.getElementById('retry-backend-startup-btn');
        const resetConfigBtn = documentRef?.getElementById('reset-config-btn');
        const guard = (action, fallback) => () => action().catch((error) => {
            console.warn(`${fallback}:`, error);
            showToast?.(error?.message || fallback, 'error');
        });

        openLogBtn?.addEventListener('click', guard(openLogDirectory, '打开日志目录失败'));
        copyBtn?.addEventListener('click', guard(copyDiagnosticSummary, '复制诊断摘要失败'));
        retryBtn?.addEventListener('click', guard(retry, '重试后端启动失败'));
        resetConfigBtn?.addEventListener('click', guard(resetConfiguration, '恢复默认配置失败'));
    }

    return {
        bindActions,
        getState,
        onState: render,
        render,
    };
}
