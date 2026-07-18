const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    apiRequest: (request) => ipcRenderer.invoke('api:request', request),
    scratchApiRequest: (request) => ipcRenderer.invoke('api:scratch-request', request),
    streamPip: (request, onEvent) => {
        const requestId = `pip-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const listener = (_event, payload) => {
            if (payload?.requestId === requestId && typeof onEvent === 'function') {
                onEvent(payload);
            }
        };
        ipcRenderer.on('pip-stream-event', listener);
        return ipcRenderer.invoke('api:pip-stream', { ...request, requestId })
            .finally(() => ipcRenderer.removeListener('pip-stream-event', listener));
    },
    onLogUpdate: (callback) => ipcRenderer.on('log-update', (event, log) => callback(log)),
    onDeepLinkOpenPractice: (callback) => ipcRenderer.on('deep-link-open-practice', (event, payload) => callback(payload)),
    selectFolder: () => ipcRenderer.invoke('select-folder'),
    selectPython: () => ipcRenderer.invoke('select-python'),
    selectCoursePackage: () => ipcRenderer.invoke('select-course-package'),
    isDirectory: (targetPath) => ipcRenderer.invoke('path-is-directory', targetPath),
    selectImageFile: () => ipcRenderer.invoke('select-image-file'),
    openExternal: (url) => ipcRenderer.invoke('open-external', url),
    openPath: (targetPath) => ipcRenderer.invoke('open-path', targetPath),
    openBackendLogDirectory: () => ipcRenderer.invoke('backend:open-log-directory'),
    copyBackendDiagnosticSummary: () => ipcRenderer.invoke('backend:copy-diagnostic-summary'),
    retryBackendStartup: () => ipcRenderer.invoke('backend:retry-startup'),
    getBackendStartupState: () => ipcRenderer.invoke('backend:get-startup-state'),
    onBackendStartupState: (callback) => ipcRenderer.on('backend-startup-state', (event, payload) => callback(payload)),
    getSystemInfo: () => ipcRenderer.invoke('get-system-info'),
    jupyterCreateView: (url, bounds) => ipcRenderer.invoke('jupyter:create-view', url, bounds),
    jupyterUpdateBounds: (bounds) => ipcRenderer.invoke('jupyter:update-bounds', bounds),
    jupyterSetVisibility: (visible) => ipcRenderer.invoke('jupyter:set-visibility', visible),
    jupyterDestroyView: () => ipcRenderer.invoke('jupyter:destroy-view'),
    jupyterReload: () => ipcRenderer.invoke('jupyter:reload'),
    jupyterOpenExternal: (url) => ipcRenderer.invoke('jupyter:open-external', url)
});

// 后端配置（用于前端动态获取 API Base）
const backendPort = process.env.XEDU_BACKEND_PORT || process.env.XEDU_API_PORT || '5123';
const backendHost = process.env.XEDU_BACKEND_HOST || '127.0.0.1';
const apiBase = process.env.XEDU_API_BASE || `http://${backendHost}:${backendPort}`;

contextBridge.exposeInMainWorld('xeduConfig', {
    apiBase
});
