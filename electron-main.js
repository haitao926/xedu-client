const { app, BrowserWindow, Menu, shell } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let mainWindow;
let backendProcess;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            enableRemoteModule: false,
            webSecurity: false // 允许加载本地文件和API
        },
        icon: path.join(__dirname, 'src-tauri/icons/icon.ico'),
        title: 'Xedu Client'
    });

    // 加载应用
    if (app.isPackaged) {
        // 生产环境：加载构建后的文件
        mainWindow.loadFile(path.join(__dirname, 'frontend-dist/index.html'));
    } else {
        // 开发环境：加载构建后的文件
        mainWindow.loadFile(path.join(__dirname, 'frontend-dist/index.html'));
    }

    // 打开开发者工具（调试用）
    if (!app.isPackaged) {
        mainWindow.webContents.openDevTools();
    }

    // 处理外部链接
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url);
        return { action: 'deny' };
    });
}

function startBackendServer() {
    console.log('启动后端服务器...');

    // 尝试不同的Python命令
    const pythonCommands = ['python', 'python3', 'py'];
    let pythonCmd = 'python';

    // 在Windows上查找可用的Python
    if (process.platform === 'win32') {
        for (const cmd of pythonCommands) {
            try {
                const { spawnSync } = require('child_process');
                const result = spawnSync(cmd, ['--version'], { stdio: 'ignore' });
                if (result.status === 0) {
                    pythonCmd = cmd;
                    console.log(`找到Python: ${cmd}`);
                    break;
                }
            } catch (e) {
                // 继续尝试下一个
            }
        }
    }

    // 启动后端API服务器
    const serverScript = path.join(__dirname, 'backend_api.py');
    const args = [serverScript];

    console.log(`启动命令: ${pythonCmd} ${args.join(' ')}`);

    backendProcess = spawn(pythonCmd, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: __dirname
    });

    backendProcess.stdout.on('data', (data) => {
        console.log(`后端输出: ${data}`);
    });

    backendProcess.stderr.on('data', (data) => {
        console.error(`后端错误: ${data}`);
    });

    backendProcess.on('close', (code) => {
        console.log(`后端服务器退出，代码: ${code}`);
        if (code !== 0) {
            console.error('后端服务器异常退出');
        }
    });

    backendProcess.on('error', (err) => {
        console.error('启动后端服务器失败:', err);
    });
}

app.whenReady().then(() => {
    // 先启动后端服务器
    startBackendServer();

    // 等待一秒后创建窗口
    setTimeout(() => {
        createWindow();
    }, 1000);

    // 创建菜单
    const template = [
        {
            label: '文件',
            submenu: [
                {
                    label: '退出',
                    accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
                    click: () => {
                        app.quit();
                    }
                }
            ]
        },
        {
            label: '视图',
            submenu: [
                {
                    label: '重新加载',
                    accelerator: 'CmdOrCtrl+R',
                    click: () => {
                        mainWindow.reload();
                    }
                },
                {
                    label: '开发者工具',
                    accelerator: process.platform === 'darwin' ? 'Alt+Cmd+I' : 'Ctrl+Shift+I',
                    click: () => {
                        mainWindow.webContents.toggleDevTools();
                    }
                }
            ]
        },
        {
            label: '帮助',
            submenu: [
                {
                    label: '关于',
                    click: () => {
                        mainWindow.webContents.send('show-about');
                    }
                }
            ]
        }
    ];

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('before-quit', () => {
    // 关闭后端服务器
    if (backendProcess) {
        console.log('正在关闭后端服务器...');
        backendProcess.kill('SIGTERM');
        // 强制关闭
        setTimeout(() => {
            backendProcess.kill('SIGKILL');
        }, 3000);
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});