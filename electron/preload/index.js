const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // 通用 IPC 调用
    invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
    
    // 日志监听
    onLogUpdate: (callback) => ipcRenderer.on('log-update', (event, log) => callback(log)),

    // 兼容旧的特定方法调用 (如果还有遗留代码使用它们)
    selectFolder: () => ipcRenderer.invoke('select-folder'),
    openExternal: (url) => ipcRenderer.invoke('open-external', url),
    getSystemInfo: () => ipcRenderer.invoke('get-system-info')
});

// 后端配置（用于前端动态获取 API Base）
const backendPort = process.env.XEDU_BACKEND_PORT || process.env.XEDU_API_PORT || '5123';
const backendHost = process.env.XEDU_BACKEND_HOST || '127.0.0.1';
const apiBase = process.env.XEDU_API_BASE || `http://${backendHost}:${backendPort}`;

contextBridge.exposeInMainWorld('xeduConfig', {
    apiBase
});
