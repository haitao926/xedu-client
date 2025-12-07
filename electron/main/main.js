const { app, BrowserWindow, Menu, shell, ipcMain, dialog } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let mainWindow;
let backendProcess;
let cleanupBackend;

function createWindow() {
    const isDev = !app.isPackaged;
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            enableRemoteModule: false,
            webSecurity: !isDev, // enable security in production, disable in dev for convenience
            preload: path.join(__dirname, '../preload/index.js')
        },
        title: 'Xedu Client'
    });

    const loadBundledApp = () => {
        const distPath = path.join(__dirname, '../../build/index.html');
        mainWindow.loadFile(distPath);
    };

    // Load UI with fallback when dev server is unavailable
    if (isDev) {
        const devUrl = process.env.ELECTRON_RENDERER_URL || 'http://localhost:3000';
        mainWindow.loadURL(devUrl);

        const handleDevServerFailure = (event, errorCode, errorDescription, validatedURL, isMainFrame) => {
            if (!isMainFrame) return;
            console.warn(`无法加载开发服务器 (${errorDescription}), 回退到本地构建资源`);
            mainWindow.webContents.removeListener('did-fail-load', handleDevServerFailure);
            loadBundledApp();
        };

        mainWindow.webContents.once('did-fail-load', handleDevServerFailure);
    } else {
        loadBundledApp();
    }

    if (isDev) {
        mainWindow.webContents.openDevTools();
    }

    // External links handling
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url);
        return { action: 'deny' };
    });
}

// IPC Handlers
ipcMain.handle('select-folder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] });
    if (!result.canceled && result.filePaths.length > 0) {
        return result.filePaths[0];
    }
    return null;
});

ipcMain.handle('open-external', async (event, url) => {
    await shell.openExternal(url);
});

ipcMain.handle('get-system-info', () => {
    return {
        platform: process.platform,
        arch: process.arch,
        version: app.getVersion()
    };
});

function startBackendServer() {
    console.log('启动后端服务器...');

    const fs = require('fs');

    // 优先使用打包的虚拟环境中的Python解释器
    const pythonEnvDir = app.isPackaged
        ? path.join(process.resourcesPath, 'python_env')
        : path.join(__dirname, '../../python_env');

    let pythonCmd;
    const candidate = process.platform === 'win32'
        ? path.join(pythonEnvDir, 'Scripts', 'python.exe')
        : path.join(pythonEnvDir, 'bin', 'python3');

    if (fs.existsSync(candidate)) {
        pythonCmd = candidate;
        console.log(`使用打包的Python解释器: ${pythonCmd}`);
    } else {
        // 回退到系统Python
        const pythonCommands = ['python', 'python3', 'py'];
        pythonCmd = 'python';
        if (process.platform === 'win32') {
            for (const cmd of pythonCommands) {
                try {
                    const { spawnSync } = require('child_process');
                    const result = spawnSync(cmd, ['--version'], { stdio: 'ignore' });
                    if (result.status === 0) {
                        pythonCmd = cmd;
                        console.log(`找到系统Python: ${cmd}`);
                        break;
                    }
                } catch (e) { }
            }
        }
    }

    let serverScript;
    if (app.isPackaged) {
        // 打包后，backend_main.py 在 resources 目录
        serverScript = path.join(process.resourcesPath, 'backend_main.py');
        if (!require('fs').existsSync(serverScript)) {
            serverScript = path.join(process.resourcesPath, 'backend', 'backend_main.py');
        }
    } else {
        // 开发环境，使用相对路径
        serverScript = path.join(__dirname, '../../backend/backend_main.py');
    }

    const args = [serverScript];
    console.log(`启动命令: ${pythonCmd} ${args.join(' ')}`);
    console.log(`后端脚本路径: ${serverScript}`);

    backendProcess = spawn(pythonCmd, args, { stdio: ['pipe', 'pipe', 'pipe'], cwd: path.dirname(serverScript) });

    backendProcess.stdout.on('data', (data) => {
        const output = data.toString();
        if (output.includes('Running on') || output.includes('Press CTRL+C to quit') || output.includes('WARNING:')) {
            mainWindow?.webContents.send('log-update', { type: 'info', message: output.trim() });
        } else {
            mainWindow?.webContents.send('log-update', { type: 'log', message: output.trim() });
        }
    });

    backendProcess.stderr.on('data', (data) => {
        const output = data.toString();
        if (output.includes('Running on') || output.includes('Press CTRL+C to quit') || output.includes('WARNING:')) {
            mainWindow?.webContents.send('log-update', { type: 'info', message: output.trim() });
        } else {
            mainWindow?.webContents.send('log-update', { type: 'error', message: output.trim() });
        }
    });

    backendProcess.on('close', (code, signal) => {
        console.log(`后端服务器退出，代码: ${code}, 信号: ${signal}`);
        if (code !== 0 && code !== null) {
            console.error('后端服务器异常退出');
            if (code === 1) {
                console.log('尝试重启后端服务器...');
                setTimeout(startBackendServer, 2000);
            }
        }
        if (signal === 'SIGTERM' || signal === 'SIGINT') {
            console.log('后端服务器被正常终止');
        }
        backendProcess = null;
        cleanupBackend = null;
    });

    backendProcess.on('error', (err) => {
        console.error('启动后端服务器失败:', err);
        if (err.code === 'ENOENT') {
            console.error('Python解释器未找到，请检查Python安装');
        } else if (err.code === 'EACCES') {
            console.error('权限不足，请检查文件权限');
        }
    });

    cleanupBackend = () => {
        if (backendProcess && !backendProcess.killed) {
            backendProcess.kill();
        }
    };
}

function setupMenu() {
    const template = [
        {
            label: '应用',
            submenu: [
                {
                    label: '退出',
                    accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
                    click: () => { app.quit(); }
                }
            ]
        },
        {
            label: '视图',
            submenu: [
                {
                    label: '重新加载',
                    accelerator: 'CmdOrCtrl+R',
                    click: () => { mainWindow.reload(); }
                },
                {
                    label: '开发者工具',
                    accelerator: process.platform === 'darwin' ? 'Alt+Cmd+I' : 'Ctrl+Shift+I',
                    click: () => { mainWindow.webContents.toggleDevTools(); }
                }
            ]
        },
        {
            label: '帮助',
            submenu: [
                {
                    label: '关于',
                    click: () => { mainWindow.webContents.send('show-about'); }
                }
            ]
        }
    ];
    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
}

app.whenReady().then(() => {
    createWindow();
    setupMenu();
    startBackendServer();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('before-quit', (event) => {
    if (backendProcess && !backendProcess.killed) {
        console.log('正在优雅关闭后端服务器...');
        if (cleanupBackend) {
            cleanupBackend();
        }
        event.preventDefault();
        setTimeout(() => { app.quit(); }, 3500);
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});
