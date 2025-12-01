const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // 日志监听
    onLogUpdate: (callback) => ipcRenderer.on('log-update', (event, log) => callback(log)),

    // 文件夹选择
    selectFolder: () => ipcRenderer.invoke('select-folder'),

    // 打开外部链接
    openExternal: (url) => ipcRenderer.invoke('open-external', url),

    // 系统信息
    getSystemInfo: () => ipcRenderer.invoke('get-system-info')
});
