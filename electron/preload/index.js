const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    apiRequest: (request) => ipcRenderer.invoke('api:request', request),
    onLogUpdate: (callback) => ipcRenderer.on('log-update', (event, log) => callback(log)),
    onDeepLinkOpenPractice: (callback) => ipcRenderer.on('deep-link-open-practice', (event, payload) => callback(payload)),
    selectFolder: () => ipcRenderer.invoke('select-folder'),
    selectCoursePackage: () => ipcRenderer.invoke('select-course-package'),
    isDirectory: (targetPath) => ipcRenderer.invoke('path-is-directory', targetPath),
    selectImageFile: () => ipcRenderer.invoke('select-image-file'),
    openExternal: (url) => ipcRenderer.invoke('open-external', url),
    openPath: (targetPath) => ipcRenderer.invoke('open-path', targetPath),
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
