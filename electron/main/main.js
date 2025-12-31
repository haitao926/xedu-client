const { app, BrowserWindow, Menu, shell, ipcMain, dialog } = require('electron');
const { session } = require('electron');
const path = require('path');
const http = require('http');
const { spawn, execSync } = require('child_process');

// 确保 Windows 任务栏/快捷方式使用自定义图标，而不是 Electron 默认图标
const APP_ID = 'com.xeduclient';
if (process.platform === 'win32') {
    app.setAppUserModelId(APP_ID);
}

const BACKEND_HOST = process.env.XEDU_BACKEND_HOST || '127.0.0.1';
const BACKEND_PORT = parseInt(
    process.env.XEDU_BACKEND_PORT || process.env.XEDU_API_PORT || '5123',
    10
) || 5123;
const BACKEND_READY_PATH = process.env.XEDU_BACKEND_READY_PATH || '/api/health';
const BACKEND_TIMEOUT_MS = 30000;
const BACKEND_RETRY_INTERVAL_MS = 1000;

let mainWindow;
let backendProcess;
let cleanupBackend;
let backendReadyPromise;
let quitting = false;
const gotTheLock = app.requestSingleInstanceLock();
let jupyterManagedPid = null;

// 规范化 Jupyter URL，修正偶发的 "/lablocale=en"（缺少 '?') 等问题
function normalizeJupyterUrl(url) {
    if (!url || typeof url !== 'string') return url;
    return url
        .replace('/lablocale=', '/lab?locale=')
        .replace('/treelocale=', '/tree?locale=');
}

async function stopJupyterGracefully(timeoutMs = 3000) {
    return new Promise((resolve) => {
        try {
            const req = http.request(
                {
                    host: BACKEND_HOST,
                    port: BACKEND_PORT,
                    path: '/api/status',
                    method: 'GET',
                    timeout: 1500
                },
                (res) => {
                    let body = '';
                    res.on('data', (chunk) => (body += chunk));
                    res.on('end', () => {
                        try {
                            const data = JSON.parse(body || '{}');
                            if (data.running) {
                                const stopReq = http.request(
                                    {
                                        host: BACKEND_HOST,
                                        port: BACKEND_PORT,
                                        path: '/api/stop',
                                        method: 'POST',
                                        timeout: 2000
                                    },
                                    () => resolve()
                                );
                                stopReq.on('error', () => resolve());
                                stopReq.on('timeout', () => {
                                    stopReq.destroy();
                                    resolve();
                                });
                                stopReq.end();
                                setTimeout(resolve, timeoutMs);
                                return;
                            }
                        } catch (_) {}
                        resolve();
                    });
                }
            );
            req.on('error', () => resolve());
            req.on('timeout', () => {
                req.destroy();
                resolve();
            });
            req.end();
        } catch (e) {
            resolve();
        }
    });
}

function findProcessOnPort(port) {
    try {
        if (process.platform === 'win32') {
            const output = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf-8' });
            const line = output
                .split(/\r?\n/)
                .find((l) => l && l.includes('LISTENING'));
            if (line) {
                const parts = line.trim().split(/\s+/);
                const pid = parseInt(parts[parts.length - 1], 10);
                if (!Number.isNaN(pid)) {
                    return { pid };
                }
            }
        } else {
            const output = execSync(`lsof -i :${port} -sTCP:LISTEN -n -P`, { encoding: 'utf-8' });
            const rows = output.split(/\r?\n/).filter(Boolean);
            if (rows.length > 1) {
                const cols = rows[1].trim().split(/\s+/);
                const pid = parseInt(cols[1], 10);
                const command = cols[0];
                if (!Number.isNaN(pid)) {
                    return { pid, command };
                }
            }
        }
    } catch (e) {
        return null;
    }
    return null;
}

function createWindow() {
    const isDev = !app.isPackaged;
    
    // Icon path resolution（统一使用 xedu-logo，避免回退到 Electron 默认图标）
    let iconPath;
    if (isDev) {
        iconPath = path.join(__dirname, '../../resources/xedu-logo.ico');
    } else {
        // 生产包会把 xedu-logo.ico 复制为 app.ico（extraResources 配置）
        // 这里优先读取 app.ico，若不存在则回退到 xedu-logo.ico
        const appIco = path.join(process.resourcesPath, 'app.ico');
        const logoIco = path.join(process.resourcesPath, 'xedu-logo.ico');
        iconPath = appIco;

        try {
            const fs = require('fs');
            if (!fs.existsSync(appIco) && fs.existsSync(logoIco)) {
                iconPath = logoIco;
            }
        } catch (_) {
            // ignore fs errors, keep default iconPath
        }
    }

    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        icon: iconPath,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            enableRemoteModule: false,
            webSecurity: !isDev,
            preload: path.join(__dirname, '../preload/index.js')
        },
        title: 'XEdu Client'
    });

    const loadBundledApp = () => {
        const distPath = path.join(__dirname, '../../build/index.html');
        mainWindow.loadFile(distPath);
    };

    if (isDev) {
        const devUrl = process.env.ELECTRON_RENDERER_URL || 'http://localhost:3000';
        
        const loadDevServer = () => {
            mainWindow.loadURL(devUrl).catch((err) => {
                console.log(`等待开发服务器启动... (${err.message})`);
                setTimeout(loadDevServer, 1000);
            });
        };

        loadDevServer();
        mainWindow.webContents.openDevTools();
    } else {
        loadBundledApp();
    }

    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url);
        return { action: 'deny' };
    });
}

// 允许在 BrowserView 中嵌入 Jupyter：移除 CSP/X-Frame 限制
function setupJupyterCspBypass() {
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
        try {
            const url = new URL(details.url);
            const host = url.host || '';
            if (host !== 'localhost:8888' && host !== '127.0.0.1:8888') {
                callback({ cancel: false, responseHeaders: details.responseHeaders });
                return;
            }

            // 复制响应头
            const headers = { ...details.responseHeaders };

            // 统一处理大小写
            const normalized = {};
            for (const [k, v] of Object.entries(headers)) {
                normalized[k.toLowerCase()] = v;
            }

            delete normalized['content-security-policy'];
            delete normalized['x-frame-options'];

            // 设置宽松的 CSP 以允许 BrowserView 嵌入
            normalized['content-security-policy'] = ['frame-ancestors *'];

            callback({ cancel: false, responseHeaders: normalized });
        } catch (e) {
            callback({ cancel: false, responseHeaders: details.responseHeaders });
        }
    }, { urls: ['*://*/*'] });
}

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

function waitForBackendReady(timeoutMs = BACKEND_TIMEOUT_MS) {
    const startedAt = Date.now();

    return new Promise((resolve, reject) => {
        const tryConnect = () => {
            const request = http.request(
                {
                    host: BACKEND_HOST,
                    port: BACKEND_PORT,
                    path: BACKEND_READY_PATH,
                    method: 'GET',
                    timeout: 2000
                },
                (res) => {
                    let body = '';
                    res.on('data', (chunk) => (body += chunk));
                    res.on('end', () => {
                        const statusCode = res.statusCode || 0;
                        const isSuccessStatus = statusCode >= 200 && statusCode < 300;
                        let isHealthy = false;

                        if (isSuccessStatus) {
                            try {
                                const parsed = body ? JSON.parse(body) : {};
                                const parsedStatus = (parsed.status || '').toString().toLowerCase();
                                isHealthy = parsedStatus === 'ok' || parsed.message === '服务运行正常';
                            } catch (_) {
                                isHealthy = false;
                            }
                        }

                        if (isHealthy) {
                            resolve(true);
                        } else {
                            scheduleRetry();
                        }
                    });
                }
            );

            request.on('error', scheduleRetry);
            request.on('timeout', () => {
                request.destroy();
                scheduleRetry();
            });
            request.end();
        };

        const scheduleRetry = () => {
            if (Date.now() - startedAt >= timeoutMs) {
                reject(new Error('后端服务在预期时间内未准备好'));
                return;
            }
            setTimeout(tryConnect, BACKEND_RETRY_INTERVAL_MS);
        };

        tryConnect();
    });
}

function stopJupyterGracefully(timeoutMs = 3000) {
    return new Promise((resolve) => {
        try {
            const statusReq = http.request(
                {
                    host: BACKEND_HOST,
                    port: BACKEND_PORT,
                    path: '/api/status',
                    method: 'GET',
                    timeout: 1500
                },
                (res) => {
                    let body = '';
                    res.on('data', (chunk) => (body += chunk));
                    res.on('end', () => {
                        try {
                            const data = JSON.parse(body || '{}');
                            if (data.running) {
                                jupyterManagedPid = data.pid || jupyterManagedPid;
                                const stopReq = http.request(
                                    {
                                        host: BACKEND_HOST,
                                        port: BACKEND_PORT,
                                        path: '/api/stop',
                                        method: 'POST',
                                        timeout: 2000
                                    },
                                    () => resolve()
                                );
                                stopReq.on('error', () => resolve());
                                stopReq.on('timeout', () => {
                                    stopReq.destroy();
                                    resolve();
                                });
                                stopReq.end();
                                setTimeout(resolve, timeoutMs);
                                return;
                            }
                        } catch (_) {}
                        resolve();
                    });
                }
            );
            statusReq.on('error', () => resolve());
            statusReq.on('timeout', () => {
                statusReq.destroy();
                resolve();
            });
            statusReq.end();
        } catch (e) {
            resolve();
        }
    });
}

function startBackendServer() {
    if (backendReadyPromise) {
        return backendReadyPromise;
    }

    console.log('启动后端服务器...');

    const occupied = findProcessOnPort(BACKEND_PORT);
    if (occupied) {
        const occupiedMsgBase = `端口 ${BACKEND_PORT} 已被进程 ${occupied.pid}${occupied.command ? ` (${occupied.command})` : ''} 占用`;
        console.log(`${occupiedMsgBase}，尝试健康检查...`);
        backendReadyPromise = waitForBackendReady(5000)
            .then(() => {
                console.log('检测到已有运行的后端服务');
                return true;
            })
            .catch(() => {
                const errMsg = `${occupiedMsgBase}，且 /api/health 无响应，请先关闭该进程后重试。`;
                console.error(errMsg);
                mainWindow?.webContents.send('log-update', { type: 'error', message: errMsg });
                throw new Error(errMsg);
            });
        return backendReadyPromise;
    }

    const fs = require('fs');

    const resolveBundledPython = () => {
        const resourceRoot = process.resourcesPath;
        const candidates = [];

        if (process.platform === 'win32') {
            candidates.push(path.join(resourceRoot, 'python_env', 'Scripts', 'python.exe'));
            candidates.push(path.join(resourceRoot, 'python_env', 'python.exe'));
            candidates.push(path.join(resourceRoot, 'app.asar.unpacked', 'python_env', 'Scripts', 'python.exe'));
            candidates.push(path.join(resourceRoot, 'app.asar.unpacked', 'python_env', 'python.exe'));
            candidates.push(path.join(path.dirname(process.execPath), 'python_env', 'Scripts', 'python.exe'));
            candidates.push(path.join(path.dirname(process.execPath), 'python_env', 'python.exe'));
        } else {
            candidates.push(path.join(resourceRoot, 'python_env', 'bin', 'python3'));
            candidates.push(path.join(resourceRoot, 'app.asar.unpacked', 'python_env', 'bin', 'python3'));
            candidates.push(path.join(path.dirname(process.execPath), 'python_env', 'bin', 'python3'));
        }

        for (const c of candidates) {
            if (fs.existsSync(c)) {
                return c;
            }
        }
        return null;
    };

    let pythonCmd = null;

    if (app.isPackaged) {
        pythonCmd = resolveBundledPython();
        if (!pythonCmd) {
            const errMsg = '未找到内置 Python 解释器，请确认安装包中包含 python_env 目录。';
            console.error(errMsg);
            dialog.showErrorBox('后端启动失败', errMsg);
            backendReadyPromise = Promise.reject(new Error(errMsg));
            return backendReadyPromise;
        }
        console.log(`使用打包的Python解释器 ${pythonCmd}`);
    } else {
        const pythonEnvDir = path.join(__dirname, '../../python_env');
        const devCandidates = [];
        if (process.platform === 'win32') {
            devCandidates.push(path.join(pythonEnvDir, 'Scripts', 'python.exe'));
            devCandidates.push(path.join(pythonEnvDir, 'python.exe'));
        } else {
            devCandidates.push(path.join(pythonEnvDir, 'bin', 'python3'));
            devCandidates.push(path.join(pythonEnvDir, 'python3'));
        }

        pythonCmd = devCandidates.find((c) => fs.existsSync(c)) || null;

        if (pythonCmd) {
            console.log(`使用本地开发环境的Python解释器 ${pythonCmd}`);
        } else {
            const errMsg = '未找到本地 python_env 下的 Python 解释器（尝试了 Scripts/python.exe 和 python.exe），请确认安装包或开发环境完整。';
            console.error(errMsg);
            dialog.showErrorBox('后端启动失败', errMsg);
            backendReadyPromise = Promise.reject(new Error(errMsg));
            return backendReadyPromise;
        }
    }

    let serverScript;
    if (app.isPackaged) {
        const packagedCandidates = [
            path.join(process.resourcesPath, 'backend_main.py'),
            path.join(process.resourcesPath, 'backend', 'backend_main.py'),
            path.join(process.resourcesPath, 'app.asar.unpacked', 'backend_main.py'),
            path.join(process.resourcesPath, 'app.asar.unpacked', 'backend', 'backend_main.py')
        ];
        serverScript = packagedCandidates.find((p) => fs.existsSync(p));
        if (!serverScript) {
            const errMsg = '未找到后端入口脚本 backend_main.py，请检查安装包完整性。';
            console.error(errMsg);
            dialog.showErrorBox('后端启动失败', errMsg);
            backendReadyPromise = Promise.reject(new Error(errMsg));
            return backendReadyPromise;
        }
    } else {
        serverScript = path.join(__dirname, '../../backend/backend_main.py');
    }

    const args = [serverScript];
    console.log(`启动命令: ${pythonCmd} ${args.join(' ')}`);
    console.log(`后端脚本路径: ${serverScript}`);

    const launchBackend = () => {
        const userDataDir = app.getPath('userData');
        const logDir = path.join(userDataDir, 'logs');
        try {
            fs.mkdirSync(logDir, { recursive: true });
        } catch (e) {
            console.warn('创建日志目录失败，可忽略:', e);
        }

        // 计算文档目录
        let docsDir;
        if (app.isPackaged) {
            docsDir = path.join(process.resourcesPath, 'docs');
        } else {
            docsDir = path.resolve(__dirname, '../../docs');
        }
        console.log(`文档目录: ${docsDir}`);

        const env = {
            ...process.env,
            PYTHONIOENCODING: 'utf-8',
            PYTHONUTF8: '1',
            XEDU_LOG_DIR: logDir,
            XEDU_DATA_DIR: userDataDir,
            XEDU_DOCS_DIR: docsDir,
            XEDU_API_PORT: String(BACKEND_PORT),
            XEDU_BACKEND_PORT: String(BACKEND_PORT),
            XEDU_BACKEND_HOST: BACKEND_HOST
        };

        backendProcess = spawn(pythonCmd, args, {
            stdio: ['pipe', 'pipe', 'pipe'],
            cwd: path.dirname(serverScript),
            env
        });

        const classifyOutput = (text, isError = false) => {
            const t = text.toString();
            const isHttpAccessLog = t.includes('GET /api') || t.includes('HTTP/1.1');
            const isInfo = t.includes('Running on') || t.includes('Press CTRL+C to quit') || t.includes('WARNING:');

            // 过滤掉 HTTP 访问日志，避免刷屏
            if (isHttpAccessLog) return null;
            if (isInfo) return 'info';
            return isError ? 'error' : 'log';
        };

        const safeSendLog = (payload) => {
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('log-update', payload);
            }
        };

        backendProcess.stdout.on('data', (data) => {
            const output = data.toString();
            const type = classifyOutput(output, false);
            if (type) {
                safeSendLog({ type, message: output.trim() });
            }
        });

        backendProcess.stderr.on('data', (data) => {
            const output = data.toString();
            const type = classifyOutput(output, true);
            if (type) {
                safeSendLog({ type, message: output.trim() });
            }
        });

        backendProcess.on('close', (code, signal) => {
            console.log(`后端服务器退出，代码: ${code}, 信号: ${signal}`);
            backendReadyPromise = null;
            jupyterManagedPid = null;
            if (code !== 0 && code !== null) {
                console.error('后端服务器异常退出');
                if (code === 1) {
                    console.log('尝试重启后端服务器...');
                    setTimeout(() => {
                        backendReadyPromise = null;
                        startBackendServer();
                    }, 2000);
                }
            }
            if (signal === 'SIGTERM' || signal === 'SIGINT') {
                console.log('后端服务器被正常终止');
            }
            backendProcess = null;
            cleanupBackend = null;
        });

        backendProcess.on('error', (err) => {
            backendReadyPromise = null;
            jupyterManagedPid = null;
            console.error('启动后端服务器失败', err);
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
    };

    const readyPromise = waitForBackendReady(3000)
        .then(() => {
            console.log('检测到已有运行的后端服务');
            return true;
        })
        .catch(() => {
            const occupied = findProcessOnPort(BACKEND_PORT);
            if (occupied) {
                const msg = `端口 ${BACKEND_PORT} 已被进程 ${occupied.pid}${occupied.command ? ` (${occupied.command})` : ''} 占用，后端无法启动，请先关闭该进程。`;
                console.error(msg);
                mainWindow?.webContents.send('log-update', { type: 'error', message: msg });
                backendReadyPromise = Promise.reject(new Error(msg));
                return backendReadyPromise;
            }
            launchBackend();
            return waitForBackendReady(BACKEND_TIMEOUT_MS);
        })
        .then(() => {
            console.log('后端服务器已准备好');
            return true;
        })
        .catch((err) => {
            mainWindow?.webContents.send('log-update', { type: 'error', message: err.message });
            throw err;
        });

    backendReadyPromise = readyPromise;
    return backendReadyPromise;
}

// ... previous code ...

// --- Jupyter BrowserView Management ---
let jupyterView = null;
const { BrowserView } = require('electron');

function setupJupyterView() {
    ipcMain.handle('jupyter:create-view', async (event, url, bounds) => {
        if (!mainWindow) return;

        const safeUrl = normalizeJupyterUrl(url);

        console.log('正在创建/更新 Jupyter 视图:', safeUrl, bounds);

        // 如果已存在，仅更新 URL (如果不同)
        if (jupyterView) {
            // 确保它在最上层
            mainWindow.setBrowserView(jupyterView);
            
            // 更新位置
            if (bounds) {
                jupyterView.setBounds(bounds);
            }
            
            // 如果 URL 不同，加载新 URL
            if (jupyterView.webContents.getURL() !== safeUrl) {
                await jupyterView.webContents.loadURL(safeUrl);
            }
            return;
        }

        // 创建新视图
        jupyterView = new BrowserView({
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                session: mainWindow.webContents.session, // 共享会话
                webSecurity: false, // 放宽同源策略以嵌入本地 Jupyter
                allowRunningInsecureContent: true
            }
        });

        mainWindow.setBrowserView(jupyterView);
        
        if (bounds) {
            jupyterView.setBounds(bounds);
        }

        // 自动调整大小属性 - 让视图随窗口变化
        jupyterView.setAutoResize({ width: true, height: true, horizontal: true, vertical: true });

        // 加载 Jupyter URL
        try {
            await jupyterView.webContents.loadURL(safeUrl);
        } catch (e) {
            console.error('Failed to load Jupyter URL:', e);
        }
    });

    ipcMain.handle('jupyter:update-bounds', (event, bounds) => {
        if (jupyterView && mainWindow) {
            // 简单校验 bounds
            if (!bounds || bounds.width <= 0 || bounds.height <= 0) return;
            
            try {
                // 确保视图已附加
                if (mainWindow.getBrowserView() !== jupyterView) {
                    mainWindow.setBrowserView(jupyterView);
                }
                jupyterView.setBounds(bounds);
            } catch (e) {
                console.error('更新视图位置失败:', e);
            }
        }
    });

    ipcMain.handle('jupyter:set-visibility', (event, visible) => {
        if (!jupyterView || !mainWindow) return;
        
        if (visible) {
            // 显示视图
            if (mainWindow.getBrowserView() !== jupyterView) {
                mainWindow.setBrowserView(jupyterView);
            }
        } else {
            // 隐藏视图
            mainWindow.setBrowserView(null);
        }
    });

    ipcMain.handle('jupyter:destroy-view', () => {
        if (jupyterView && mainWindow) {
            console.log('销毁 Jupyter 视图');
            mainWindow.removeBrowserView(jupyterView);
            // 显式销毁 WebContents 以释放资源
            try {
                // jupyterView.webContents.destroy(); // 某些版本 Electron 可能不稳定，remove 即可
                // 将引用置空，等待 GC
            } catch(e) {}
            jupyterView = null;
        }
    });

    ipcMain.handle('jupyter:reload', () => {
        if (jupyterView) {
            jupyterView.webContents.reload();
        }
    });
    
    ipcMain.handle('jupyter:go-back', () => {
        if (jupyterView && jupyterView.webContents.canGoBack()) {
            jupyterView.webContents.goBack();
        }
    });

    ipcMain.handle('jupyter:open-external', async (event, url) => {
        await shell.openExternal(url);
    });

    // 监听主窗口关闭，清理视图
    if (mainWindow) {
        mainWindow.on('closed', () => {
            jupyterView = null;
        });
    }
}

function setupMenu() {
// ... existing code ...
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
            label: '编辑',
            submenu: [
                { role: 'undo' },
                { role: 'redo' },
                { type: 'separator' },
                { role: 'cut' },
                { role: 'copy' },
                { role: 'paste' },
                { role: 'selectAll' }
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

if (!gotTheLock) {
    app.quit();
} else {
    app.on('second-instance', () => {
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
        }
    });

    app.whenReady().then(async () => {
        setupJupyterCspBypass();
        setupMenu();
        setupJupyterView(); // 初始化 Jupyter 视图管理器
        // 优先创建窗口，避免启动阶段的空白等待
        createWindow();
        startBackendServer().catch((error) => {
            console.error('后端服务器未能正常启动', error);
            dialog.showErrorBox('后端启动失败', error.message || '请查看日志了解详情');
        });
    });

    app.on('window-all-closed', () => {
        if (process.platform !== 'darwin') {
            app.quit();
        }
    });

    app.on('before-quit', (event) => {
        if (quitting) return;
        if (backendProcess && !backendProcess.killed) {
            quitting = true;
            event.preventDefault();
            console.log('正在优雅关闭后端与 Jupyter...');
            stopJupyterGracefully().finally(() => {
                if (cleanupBackend) {
                    cleanupBackend();
                }
                setTimeout(() => { app.quit(); }, 800);
            });
        }
    });

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
}
