const { app, BrowserWindow, Menu, shell, ipcMain, dialog, clipboard } = require('electron');
const { session } = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs');
const crypto = require('crypto');
const { spawn, execSync } = require('child_process');
const {
    getPythonDialogFilters,
    isUsablePythonExecutable,
    readConfiguredPythonExecutable,
    resolvePythonExecutable,
    validatePythonExecutable,
} = require('./python-runtime');

function isBrokenPipeError(error) {
    return Boolean(error && (error.code === 'EPIPE' || error.errno === 'EPIPE'));
}

function installSafeConsole() {
    ['stdout', 'stderr'].forEach((streamName) => {
        const stream = process[streamName];
        if (!stream || typeof stream.on !== 'function') return;
        stream.on('error', (error) => {
            if (isBrokenPipeError(error)) {
                return;
            }
            throw error;
        });
    });

    ['log', 'info', 'warn', 'error'].forEach((method) => {
        const original = console[method];
        if (typeof original !== 'function') return;
        console[method] = (...args) => {
            try {
                original.apply(console, args);
            } catch (error) {
                if (isBrokenPipeError(error)) {
                    return;
                }
                throw error;
            }
        };
    });
}

installSafeConsole();

process.on('uncaughtException', (error) => {
    if (isBrokenPipeError(error)) {
        return;
    }
    console.error('Uncaught Exception:', error);
});

// 确保 Windows 任务栏/快捷方式使用自定义图标，而不是 Electron 默认图标
const APP_ID = 'com.xeduclient';
if (process.platform === 'win32') {
    app.setAppUserModelId(APP_ID);
}

const BACKEND_HOST_ENV = process.env.XEDU_BACKEND_HOST || process.env.XEDU_API_HOST || '';
const BACKEND_HOST = BACKEND_HOST_ENV || '127.0.0.1';
const BACKEND_PORT = parseInt(
    process.env.XEDU_BACKEND_PORT || process.env.XEDU_API_PORT || '5123',
    10
) || 5123;
const BACKEND_READY_PATH = process.env.XEDU_BACKEND_READY_PATH || '/api/health';
const BACKEND_TIMEOUT_MS = (() => {
    const override = parseInt(process.env.XEDU_BACKEND_TIMEOUT_MS || '', 10);
    if (Number.isFinite(override) && override > 0) {
        return override;
    }
    if (process.platform === 'win32') {
        return app.isPackaged ? 120000 : 45000;
    }
    return 30000;
})();
const BACKEND_RETRY_INTERVAL_MS = 1000;
const XEDU_PROTOCOL = 'xedu';
const RENDERER_PORT = parseInt(process.env.XEDU_RENDERER_PORT || '3002', 10) || 3002;

let mainWindow;
let backendProcess;
let cleanupBackend;
let backendReadyPromise;
let backendLogFile = null;
let backendRecentOutput = [];
let backendLastExit = null;
let quitting = false;
let pendingPracticeDeepLink = null;
const gotTheLock = app.requestSingleInstanceLock();
let jupyterManagedPid = null;
const backendCapability = process.env.XEDU_CLIENT_CAPABILITY || crypto.randomBytes(32).toString('base64url');
const approvedLocalRoots = new Set();
let backendStartupAttemptCount = 0;
let selectedPythonExecutable = '';
let backendStartupState = {
    status: 'idle',
    message: '后端尚未启动。',
    canRetry: true,
    updatedAt: new Date().toISOString(),
    attemptCount: 0,
    logDirectory: null,
};

const DIAGNOSTIC_SECRET_LABELS = [
    'authorization',
    'token',
    'password',
    'api_key',
    'api-key',
    'secret',
    'teacher_code',
    'teacher-code',
    'classroom_teacher_code',
    'classroom-teacher-code',
    '教师口令',
    '课堂口令',
];
const DIAGNOSTIC_BODY_LABELS = ['request_body', 'request-body', 'request body', '请求正文'];

const API_REQUEST_ALLOWLIST = Object.freeze([
    { method: 'GET', pattern: /^\/api\/(?:health|status|detect_python|load_config|documents(?:\/|$)|classroom\/(?:status|discover|index|course\/|file\/|package\/)|resources\/(?:default-sample|index|local-file\/|scan|inspect-course|scan-folder)|projects\/templates)(?:\?.*)?$/ },
    { method: 'POST', pattern: /^\/api\/(?:start|stop|restart|save_config|reset_config|repair_xedu|projects\/create|ai\/(?:ask|test_config|save_config)|quickform\/(?:test|tasks(?:\/create)?$)|classroom\/(?:verify-teacher|sync-courses|start|stop|pull|fetch-index)|resources\/(?:index|scan|scan-folder|inspect-course|publish|pull|ensure-repo|save-course|import-package-local|quickform\/inject|scratch-workspace))(?:\?.*)?$/ },
]);

const DEV_RENDERER_CANDIDATES = [
    process.env.ELECTRON_RENDERER_URL,
    `http://127.0.0.1:${RENDERER_PORT}`,
    `http://localhost:${RENDERER_PORT}`,
].filter(Boolean);

function isTrustedRenderer(event) {
    return Boolean(mainWindow && event?.sender === mainWindow.webContents);
}

function isAllowedApiRequest(method, relativePath) {
    return API_REQUEST_ALLOWLIST.some((rule) => rule.method === method && rule.pattern.test(relativePath));
}

function isSafeExternalUrl(value) {
    try {
        return new URL(String(value)).protocol === 'https:';
    } catch (_) {
        return false;
    }
}

function isAllowedJupyterUrl(value) {
    try {
        const parsed = new URL(String(value));
        return parsed.protocol === 'http:' && ['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname);
    } catch (_) {
        return false;
    }
}

function rememberApprovedPath(targetPath) {
    if (targetPath) approvedLocalRoots.add(path.resolve(targetPath));
}

function isApprovedLocalPath(targetPath) {
    try {
        const resolved = path.resolve(String(targetPath));
        return [...approvedLocalRoots].some((root) => resolved === root || resolved.startsWith(`${root}${path.sep}`));
    } catch (_) {
        return false;
    }
}

function getBackendLogDirectory() {
    try {
        return path.join(app.getPath('userData'), 'logs');
    } catch (_) {
        return null;
    }
}

function getBackendConfigFile() {
    try {
        return path.join(app.getPath('userData'), 'config', 'config.json');
    } catch (_) {
        return null;
    }
}

function createPythonSetupRequiredError() {
    const error = new Error('尚未选择本机 Python 解释器，请在 Python 设置中选择可用的 Python 环境。');
    error.code = 'XEDU_PYTHON_REQUIRED';
    return error;
}

function ensureBackendLogDirectory() {
    const logDir = getBackendLogDirectory();
    if (!logDir) {
        throw new Error('无法定位日志目录');
    }
    fs.mkdirSync(logDir, { recursive: true });
    return logDir;
}

function getBackendStartupStateSnapshot() {
    return {
        ...backendStartupState,
        logDirectory: backendStartupState.logDirectory || getBackendLogDirectory(),
    };
}

function emitBackendStartupState() {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow?.webContents.send('backend-startup-state', getBackendStartupStateSnapshot());
    }
}

function updateBackendStartupState(patch = {}) {
    backendStartupState = {
        ...backendStartupState,
        ...patch,
        attemptCount: patch.attemptCount ?? backendStartupAttemptCount,
        logDirectory: patch.logDirectory ?? backendStartupState.logDirectory ?? getBackendLogDirectory(),
        updatedAt: new Date().toISOString(),
    };
    emitBackendStartupState();
    return getBackendStartupStateSnapshot();
}

function redactSensitiveDiagnosticText(value) {
    let text = String(value || '');
    if (!text) return '';

    for (const label of DIAGNOSTIC_BODY_LABELS) {
        const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        text = text.replace(new RegExp(`(${escaped}\\s*[:：=]\\s*)([^\\n\\r]*)`, 'gi'), '$1[redacted]');
        text = text.replace(new RegExp(`([?&]${escaped}=)[^&\\s]+`, 'gi'), '$1[redacted]');
    }

    for (const label of DIAGNOSTIC_SECRET_LABELS) {
        const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        text = text.replace(new RegExp(`("${escaped}"\\s*:\\s*)"([^"]*)"`, 'gi'), '$1"[redacted]"');
        text = text.replace(new RegExp(`(${escaped}\\s*[:：=]\\s*)([^\\s,;\\n\\r]+)`, 'gi'), '$1[redacted]');
        text = text.replace(new RegExp(`([?&]${escaped}=)[^&\\s]+`, 'gi'), '$1[redacted]');
    }

    text = text.replace(/(Authorization\s*:\s*Bearer\s+)[^\s]+/gi, '$1[redacted]');
    return text;
}

function buildBackendDiagnosticSummary(message) {
    const recent = redactSensitiveDiagnosticText(backendRecentOutput.slice(-8).join('\n'));
    const summaryLines = [
        'XEdu Client 启动诊断摘要',
        `状态: ${backendStartupState.status}`,
        `时间: ${new Date().toISOString()}`,
        `尝试次数: ${backendStartupAttemptCount}`,
        `说明: ${redactSensitiveDiagnosticText(message || backendStartupState.message || '后端服务在预期时间内未准备好')}`,
    ];
    if (backendLastExit) {
        summaryLines.push(`后端退出: code=${backendLastExit.code}, signal=${backendLastExit.signal}`);
    }
    const logDir = getBackendLogDirectory();
    if (logDir) {
        summaryLines.push(`日志目录: ${logDir}`);
    }
    if (backendLogFile) {
        summaryLines.push(`日志文件: ${backendLogFile}`);
    }
    if (recent) {
        summaryLines.push(`最近输出:\n${recent}`);
    }
    return redactSensitiveDiagnosticText(summaryLines.join('\n'));
}

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
                                stopReq.setHeader('X-XEdu-Client-Token', backendCapability);
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

function probeRendererUrl(targetUrl, timeoutMs = 1200) {
    return new Promise((resolve) => {
        try {
            const url = new URL(targetUrl);
            const req = http.request(
                {
                    host: url.hostname,
                    port: url.port || 80,
                    path: url.pathname || '/',
                    method: 'GET',
                    timeout: timeoutMs,
                },
                (res) => {
                    const contentType = String(res.headers['content-type'] || '');
                    if (!(res.statusCode >= 200 && res.statusCode < 500 && contentType.includes('text/html'))) {
                        res.resume();
                        resolve(false);
                        return;
                    }

                    let body = '';
                    res.setEncoding('utf8');
                    res.on('data', (chunk) => {
                        if (body.length < 8192) {
                            body += chunk;
                        }
                    });
                    res.on('end', () => {
                        const looksLikeXEduRenderer =
                            body.includes('<title>XEdu Client</title>') ||
                            body.includes('正在启动 XEdu Client') ||
                            body.includes('/@vite/client');
                        resolve(looksLikeXEduRenderer);
                    });
                }
            );
            req.on('error', () => resolve(false));
            req.on('timeout', () => {
                req.destroy();
                resolve(false);
            });
            req.end();
        } catch (_) {
            resolve(false);
        }
    });
}

async function resolveRendererUrl() {
    const deadline = Date.now() + 10000;

    while (Date.now() < deadline) {
        for (const url of DEV_RENDERER_CANDIDATES) {
            if (await probeRendererUrl(url)) {
                return url;
            }
        }
        await new Promise((resolve) => setTimeout(resolve, 250));
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
        minWidth: 960,
        minHeight: 600,
        show: false,
        center: true,
        icon: iconPath,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            enableRemoteModule: false,
            sandbox: true,
            webSecurity: true,
            preload: path.join(__dirname, '../preload/index.js')
        },
        title: 'XEdu Client'
    });

    const showMainWindow = (reason = 'ready') => {
        try {
            if (!mainWindow || mainWindow.isDestroyed()) return;
            if (mainWindow.isMinimized()) {
                mainWindow.restore();
            }
            if (!mainWindow.isVisible()) {
                mainWindow.center();
                mainWindow.show();
            }
            mainWindow.focus();
            if (isDev) {
                console.log(`主窗口已显示: ${reason}`);
            }
        } catch (error) {
            console.warn('窗口显示失败:', error?.message || error);
        }
    };

    mainWindow.once('ready-to-show', () => {
        showMainWindow('ready-to-show');
    });

    const fallbackShowTimer = setTimeout(() => {
        showMainWindow('fallback-timeout');
    }, 3000);

    const loadBundledApp = () => {
        const distPath = path.join(__dirname, '../../build/index.html');
        mainWindow.loadFile(distPath);
    };

    if (isDev) {
        resolveRendererUrl().then((devUrl) => {
            if (devUrl) {
                console.log(`加载前端开发服务器: ${devUrl}`);
                mainWindow.loadURL(devUrl).catch((err) => {
                    console.log(`开发服务器加载失败，回退到本地构建页面: ${err.message}`);
                    loadBundledApp();
                });
                if (process.env.XEDU_OPEN_DEVTOOLS === '1') {
                    mainWindow.webContents.openDevTools();
                }
                return;
            }

            console.log('未检测到可用的前端开发服务器，改为加载 build/index.html');
            loadBundledApp();
        });
    } else {
        loadBundledApp();
    }

    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (isSafeExternalUrl(url)) {
            shell.openExternal(url);
        }
        return { action: 'deny' };
    });

    mainWindow.webContents.on('did-finish-load', () => {
        clearTimeout(fallbackShowTimer);
        showMainWindow('did-finish-load');
        emitBackendStartupState();
        if (pendingPracticeDeepLink) {
            mainWindow.webContents.send('deep-link-open-practice', pendingPracticeDeepLink);
            pendingPracticeDeepLink = null;
        }
    });

    mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
        clearTimeout(fallbackShowTimer);
        console.warn('页面加载失败:', errorCode, errorDescription, validatedURL);
        showMainWindow('did-fail-load');
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
        jupyterView = null;
    });
}

function bringMainWindowToFront() {
    try {
        if (!mainWindow || mainWindow.isDestroyed()) return;
        if (mainWindow.isMinimized()) {
            mainWindow.restore();
        }
        if (!mainWindow.isVisible()) {
            mainWindow.show();
        }
        mainWindow.focus();
    } catch (error) {
        console.warn('窗口置前失败:', error?.message || error);
    }
}

function registerXeduProtocol() {
    try {
        if (process.defaultApp && process.argv.length >= 2) {
            app.setAsDefaultProtocolClient(XEDU_PROTOCOL, process.execPath, [path.resolve(process.argv[1])]);
            return;
        }
        app.setAsDefaultProtocolClient(XEDU_PROTOCOL);
    } catch (error) {
        console.warn('注册 xedu 协议失败:', error.message || error);
    }
}

function parsePracticeDeepLink(rawUrl) {
    if (!rawUrl || typeof rawUrl !== 'string') return null;
    try {
        const parsed = new URL(rawUrl);
        if (parsed.protocol !== `${XEDU_PROTOCOL}:`) return null;
        const action = (parsed.hostname || parsed.pathname.replace(/^\/+/, '') || '').trim();
        if (action !== 'open-practice') return null;
        const projectDir = (parsed.searchParams.get('project') || '').trim();
        const filePath = (parsed.searchParams.get('file') || '').trim();
        const kind = (parsed.searchParams.get('kind') || '').trim();
        if (!projectDir || !filePath) return null;
        return { projectDir, filePath, kind };
    } catch (_) {
        return null;
    }
}

function dispatchPracticeDeepLink(payload) {
    if (!payload) return;
    if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
        if (mainWindow.webContents.isLoading()) {
            pendingPracticeDeepLink = payload;
            return;
        }
        mainWindow.webContents.send('deep-link-open-practice', payload);
        return;
    }
    pendingPracticeDeepLink = payload;
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

ipcMain.handle('select-folder', async (event) => {
    if (!isTrustedRenderer(event)) return null;
    const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] });
    if (!result.canceled && result.filePaths.length > 0) {
        rememberApprovedPath(result.filePaths[0]);
        return result.filePaths[0];
    }
    return null;
});

ipcMain.handle('select-course-package', async (event) => {
    if (!isTrustedRenderer(event)) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile', 'openDirectory'],
        filters: [
            { name: '课程包', extensions: ['zip'] },
            { name: '所有文件', extensions: ['*'] },
        ],
    });
    if (!result.canceled && result.filePaths.length > 0) {
        rememberApprovedPath(result.filePaths[0]);
        return result.filePaths[0];
    }
    return null;
});

ipcMain.handle('path-is-directory', async (event, targetPath) => {
    if (!isTrustedRenderer(event) || !targetPath || typeof targetPath !== 'string' || !isApprovedLocalPath(targetPath)) {
        return false;
    }
    try {
        return fs.existsSync(targetPath) && fs.statSync(targetPath).isDirectory();
    } catch (_) {
        return false;
    }
});

ipcMain.handle('select-image-file', async (event) => {
    if (!isTrustedRenderer(event)) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile'],
        filters: [
            { name: '图片文件', extensions: ['png', 'jpg', 'jpeg', 'bmp', 'webp', 'gif'] },
            { name: '所有文件', extensions: ['*'] },
        ],
    });
    if (!result.canceled && result.filePaths.length > 0) {
        rememberApprovedPath(result.filePaths[0]);
        return result.filePaths[0];
    }
    return null;
});

ipcMain.handle('select-python', async (event) => {
    if (!isTrustedRenderer(event)) {
        return { success: false, error: 'forbidden' };
    }

    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile'],
        filters: getPythonDialogFilters(process.platform),
    });
    if (result.canceled || result.filePaths.length === 0) {
        return { success: false, canceled: true };
    }

    const selectedPath = path.resolve(result.filePaths[0]);
    const validation = validatePythonExecutable(selectedPath, { platform: process.platform, fsImpl: fs });
    if (!validation.success) {
        return {
            success: false,
            error: validation.message,
        };
    }

    selectedPythonExecutable = selectedPath;
    rememberApprovedPath(selectedPath);
    return { success: true, path: selectedPath };
});

ipcMain.handle('open-external', async (event, url) => {
    if (!isTrustedRenderer(event) || !isSafeExternalUrl(url)) {
        return { success: false, error: 'invalid-url' };
    }
    await shell.openExternal(url);
    return { success: true };
});

ipcMain.handle('open-path', async (event, targetPath) => {
    if (!isTrustedRenderer(event) || !targetPath || !isApprovedLocalPath(targetPath)) {
        return { success: false, error: 'empty-path' };
    }
    const result = await shell.openPath(targetPath);
    if (result) {
        console.warn('打开本地路径失败:', result);
        return { success: false, error: result };
    }
    return { success: true };
});

ipcMain.handle('backend:open-log-directory', async (event) => {
    if (!isTrustedRenderer(event)) {
        return { success: false, error: 'forbidden' };
    }
    try {
        const logDir = ensureBackendLogDirectory();
        const result = await shell.openPath(logDir);
        if (result) {
            return { success: false, error: result, path: logDir };
        }
        return { success: true, path: logDir };
    } catch (error) {
        return { success: false, error: error?.message || 'open-log-directory-failed' };
    }
});

ipcMain.handle('backend:copy-diagnostic-summary', async (event) => {
    if (!isTrustedRenderer(event)) {
        return { success: false, error: 'forbidden' };
    }
    try {
        const summary = buildBackendDiagnosticSummary();
        clipboard.writeText(summary);
        return { success: true, summary };
    } catch (error) {
        return { success: false, error: error?.message || 'copy-diagnostic-summary-failed' };
    }
});

ipcMain.handle('backend:get-startup-state', async (event) => {
    if (!isTrustedRenderer(event)) {
        return { success: false, error: 'forbidden' };
    }
    return { success: true, state: getBackendStartupStateSnapshot() };
});

ipcMain.handle('backend:retry-startup', async (event) => {
    if (!isTrustedRenderer(event)) {
        return { success: false, error: 'forbidden' };
    }
    try {
        if (cleanupBackend) {
            cleanupBackend();
        } else if (backendProcess && !backendProcess.killed) {
            backendProcess.kill();
        }
    } catch (error) {
        console.warn('清理失败的后端进程失败:', error?.message || error);
    } finally {
        backendProcess = null;
        cleanupBackend = null;
        backendReadyPromise = null;
        jupyterManagedPid = null;
    }

    try {
        await startBackendServer({ force: true, reason: 'manual-retry' });
        return { success: true, state: getBackendStartupStateSnapshot() };
    } catch (error) {
        return {
            success: false,
            error: error?.message || 'retry-backend-startup-failed',
            state: getBackendStartupStateSnapshot(),
        };
    }
});

ipcMain.handle('get-system-info', () => {
    return {
        platform: process.platform,
        arch: process.arch,
        version: app.getVersion()
    };
});

ipcMain.handle('api:request', async (event, request) => {
    if (!mainWindow || event.sender !== mainWindow.webContents) {
        return { status: 403, headers: {}, body: JSON.stringify({ success: false, message: 'forbidden' }) };
    }
    if (!request || typeof request !== 'object') {
        return { status: 400, headers: {}, body: JSON.stringify({ success: false, message: 'invalid request' }) };
    }

    const method = String(request.method || 'GET').toUpperCase();
    const relativePath = String(request.path || '');
    const allowedMethods = new Set(['GET', 'POST']);
    if (!allowedMethods.has(method) || !relativePath.startsWith('/api/') || relativePath.includes('://') || !isAllowedApiRequest(method, relativePath)) {
        return { status: 400, headers: {}, body: JSON.stringify({ success: false, message: 'invalid request' }) };
    }
    const body = request.body == null ? '' : String(request.body);
    if (Buffer.byteLength(body, 'utf8') > 1024 * 1024) {
        return { status: 413, headers: {}, body: JSON.stringify({ success: false, message: 'request too large' }) };
    }

    return new Promise((resolve) => {
        const proxyRequest = http.request({
            host: BACKEND_HOST,
            port: BACKEND_PORT,
            path: relativePath,
            method,
            timeout: 30000,
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body, 'utf8'),
                'X-XEdu-Client-Token': backendCapability,
            },
        }, (response) => {
            let responseBody = '';
            response.setEncoding('utf8');
            response.on('data', (chunk) => { responseBody += chunk; });
            response.on('end', () => resolve({
                status: response.statusCode || 502,
                headers: { 'content-type': String(response.headers['content-type'] || 'application/json') },
                body: responseBody,
            }));
        });
        proxyRequest.on('error', () => resolve({ status: 502, headers: {}, body: JSON.stringify({ success: false, message: 'backend unavailable' }) }));
        proxyRequest.on('timeout', () => {
            proxyRequest.destroy();
            resolve({ status: 504, headers: {}, body: JSON.stringify({ success: false, message: 'request timeout' }) });
        });
        proxyRequest.end(body);
    });
});

ipcMain.handle('api:scratch-request', async (event, request) => {
    if (!isTrustedRenderer(event) || !request || typeof request !== 'object') {
        return { status: 403, headers: {}, body: JSON.stringify({ success: false, message: 'forbidden' }) };
    }
    const method = String(request.method || 'POST').toUpperCase();
    const relativePath = String(request.path || '').split('?')[0];
    if (method !== 'POST' || relativePath !== '/api/resources/xeduhub/execute') {
        return { status: 400, headers: {}, body: JSON.stringify({ success: false, message: 'invalid Scratch request' }) };
    }
    const body = request.body == null ? '' : String(request.body);
    if (Buffer.byteLength(body, 'utf8') > 1024 * 1024) {
        return { status: 413, headers: {}, body: JSON.stringify({ success: false, message: 'request too large' }) };
    }
    return new Promise((resolve) => {
        const proxyRequest = http.request({
            host: BACKEND_HOST,
            port: BACKEND_PORT,
            path: '/api/resources/xeduhub/execute',
            method: 'POST',
            timeout: 30000,
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body, 'utf8'),
                'X-XEdu-Client-Token': backendCapability,
            },
        }, (response) => {
            let responseBody = '';
            response.setEncoding('utf8');
            response.on('data', (chunk) => { responseBody += chunk; });
            response.on('end', () => resolve({
                status: response.statusCode || 502,
                headers: { 'content-type': String(response.headers['content-type'] || 'application/json') },
                body: responseBody,
            }));
        });
        proxyRequest.on('error', () => resolve({ status: 502, headers: {}, body: JSON.stringify({ success: false, message: 'backend unavailable' }) }));
        proxyRequest.on('timeout', () => {
            proxyRequest.destroy();
            resolve({ status: 504, headers: {}, body: JSON.stringify({ success: false, message: 'request timeout' }) });
        });
        proxyRequest.end(body);
    });
});

ipcMain.handle('api:pip-stream', async (event, request) => {
    if (!isTrustedRenderer(event) || !request || typeof request !== 'object') {
        return { status: 403, headers: {}, body: JSON.stringify({ success: false, message: 'forbidden' }) };
    }
    const requestId = String(request.requestId || '');
    const action = String(request.action || '').toLowerCase();
    const packageName = String(request.package || '').trim();
    if (!requestId || !['install', 'uninstall', 'list', 'upgrade'].includes(action)) {
        return { status: 400, headers: {}, body: JSON.stringify({ success: false, message: 'invalid pip request' }) };
    }
    if (action !== 'list' && !packageName) {
        return { status: 400, headers: {}, body: JSON.stringify({ success: false, message: 'package is required' }) };
    }
    const body = JSON.stringify({
        action,
        package: packageName,
        use_mirror: Boolean(request.useMirror),
        stream: true,
    });
    return new Promise((resolve) => {
        const send = (payload) => {
            if (!event.sender.isDestroyed()) {
                event.sender.send('pip-stream-event', { requestId, ...payload });
            }
        };
        const proxyRequest = http.request({
            host: BACKEND_HOST,
            port: BACKEND_PORT,
            path: '/api/python/pip',
            method: 'POST',
            timeout: 300000,
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body, 'utf8'),
                'X-XEdu-Client-Token': backendCapability,
            },
        }, (response) => {
            response.setEncoding('utf8');
            response.on('data', (chunk) => send({ type: 'data', chunk }));
            response.on('end', () => {
                send({ type: 'end' });
                resolve({
                    status: response.statusCode || 502,
                    headers: { 'content-type': String(response.headers['content-type'] || 'text/plain') },
                });
            });
        });
        proxyRequest.on('error', () => {
            send({ type: 'error', error: 'backend unavailable' });
            resolve({ status: 502, headers: {}, body: '' });
        });
        proxyRequest.on('timeout', () => {
            proxyRequest.destroy();
            send({ type: 'error', error: 'request timeout' });
            resolve({ status: 504, headers: {}, body: '' });
        });
        proxyRequest.end(body);
    });
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

function rememberBackendOutput(output) {
    const text = String(output || '').trim();
    if (!text) return;
    backendRecentOutput.push(text);
    if (backendRecentOutput.length > 30) {
        backendRecentOutput = backendRecentOutput.slice(-30);
    }
}

function buildBackendFailureMessage(message) {
    const recent = redactSensitiveDiagnosticText(backendRecentOutput.slice(-8).join('\n'));
    const parts = [redactSensitiveDiagnosticText(message || '后端服务在预期时间内未准备好')];
    if (backendLastExit) {
        parts.push(`后端退出: code=${backendLastExit.code}, signal=${backendLastExit.signal}`);
    }
    if (backendLogFile) {
        parts.push(`后端日志: ${backendLogFile}`);
    }
    if (recent) {
        parts.push(`最近输出:\n${recent}`);
    }
    return redactSensitiveDiagnosticText(parts.join('\n'));
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

function startBackendServer(options = {}) {
    const { force = false, reason = 'initial' } = options;
    if (backendReadyPromise && !force) {
        return backendReadyPromise;
    }

    backendStartupAttemptCount += 1;
    updateBackendStartupState({
        status: 'starting',
        message: reason === 'manual-retry' ? '正在重试后端启动…' : '正在启动后端服务…',
        canRetry: false,
        attemptCount: backendStartupAttemptCount,
        logDirectory: getBackendLogDirectory(),
    });
    console.log('启动后端服务器...');

    const occupied = findProcessOnPort(BACKEND_PORT);
    if (occupied) {
        const occupiedMsgBase = `端口 ${BACKEND_PORT} 已被进程 ${occupied.pid}${occupied.command ? ` (${occupied.command})` : ''} 占用`;
        console.log(`${occupiedMsgBase}，尝试健康检查...`);
        backendReadyPromise = waitForBackendReady(5000)
            .then(() => {
                console.log('检测到已有运行的后端服务');
                updateBackendStartupState({
                    status: 'ready',
                    message: '检测到可用的后端服务。',
                    canRetry: false,
                    logDirectory: getBackendLogDirectory(),
                });
                return true;
            })
            .catch(() => {
                const errMsg = `${occupiedMsgBase}，且 /api/health 无响应，请先关闭该进程后重试。`;
                console.error(errMsg);
                mainWindow?.webContents.send('log-update', { type: 'error', message: errMsg });
                updateBackendStartupState({
                    status: 'error',
                    message: buildBackendFailureMessage(errMsg),
                    canRetry: true,
                });
                backendReadyPromise = null;
                throw new Error(errMsg);
            });
        return backendReadyPromise;
    }

    const configuredPython = readConfiguredPythonExecutable(getBackendConfigFile(), fs);
    const pythonCmd = resolvePythonExecutable({
        platform: process.platform,
        packaged: app.isPackaged,
        configuredPath: configuredPython,
        selectedPath: selectedPythonExecutable,
        envPath: process.env.XEDU_PYTHON_EXECUTABLE || '',
        projectRoot: path.resolve(__dirname, '../..'),
        fsImpl: fs,
    });

    if (!pythonCmd) {
        const setupError = app.isPackaged
            ? createPythonSetupRequiredError()
            : new Error('未找到可用的 Python 解释器，请确认开发环境已安装 Python。');
        console.warn(setupError.message);
        updateBackendStartupState({
            status: 'error',
            message: setupError.message,
            canRetry: true,
            logDirectory: getBackendLogDirectory(),
        });
        return Promise.reject(setupError);
    }

    const pythonValidation = validatePythonExecutable(pythonCmd, { platform: process.platform, fsImpl: fs });
    if (!pythonValidation.success) {
        const setupError = new Error(pythonValidation.message);
        setupError.code = 'XEDU_PYTHON_REQUIRED';
        updateBackendStartupState({
            status: 'error',
            message: setupError.message,
            canRetry: true,
            logDirectory: getBackendLogDirectory(),
        });
        return Promise.reject(setupError);
    }

    console.log(`使用 Python 解释器 ${pythonCmd}`);

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
            updateBackendStartupState({
                status: 'error',
                message: buildBackendFailureMessage(errMsg),
                canRetry: true,
            });
            return Promise.reject(new Error(errMsg));
        }
    } else {
        serverScript = path.join(__dirname, '../../backend/backend_main.py');
    }

    const args = [serverScript];
    console.log(`启动命令: ${pythonCmd} ${args.join(' ')}`);
    console.log(`后端脚本路径: ${serverScript}`);

    const launchBackend = () => {
        const userDataDir = app.getPath('userData');
        const logDir = getBackendLogDirectory() || path.join(userDataDir, 'logs');
        try {
            fs.mkdirSync(logDir, { recursive: true });
        } catch (e) {
            console.warn('创建日志目录失败，可忽略:', e);
        }
        backendRecentOutput = [];
        backendLastExit = null;
        backendLogFile = path.join(logDir, 'backend-process.log');
        const appendBackendLog = (text) => {
            try {
                fs.appendFileSync(backendLogFile, text, 'utf8');
            } catch (_) {
                // ignore logging failures
            }
        };
        appendBackendLog(`\n\n[${new Date().toISOString()}] launch backend\n`);
        updateBackendStartupState({
            status: 'starting',
            message: '正在启动后端服务…',
            canRetry: false,
            logDirectory: logDir,
        });

        // 计算文档目录
        let docsDir;
        if (app.isPackaged) {
            docsDir = path.join(process.resourcesPath, 'docs');
        } else {
            docsDir = path.resolve(__dirname, '../../docs');
        }
        console.log(`文档目录: ${docsDir}`);

        const checkpointDirs = app.isPackaged
            ? [
                path.join(process.resourcesPath, 'checkpoint'),
                path.join(process.resourcesPath, 'backend', 'checkpoint'),
            ]
            : [
                path.resolve(__dirname, '../../checkpoint'),
                path.resolve(__dirname, '../../backend/checkpoint'),
            ];

        const env = {
            ...process.env,
            PYTHONIOENCODING: 'utf-8',
            PYTHONUTF8: '1',
            XEDU_LOG_DIR: logDir,
            XEDU_DATA_DIR: userDataDir,
            XEDU_CONFIG_DIR: userDataDir,
            XEDU_DOCS_DIR: docsDir,
            XEDU_API_PORT: String(BACKEND_PORT),
            XEDU_BACKEND_PORT: String(BACKEND_PORT),
            XEDU_BACKEND_HOST: BACKEND_HOST,
            XEDU_API_HOST: BACKEND_HOST,
            XEDU_CLIENT_CAPABILITY: backendCapability,
            XEDU_CHECKPOINT_DIRS: checkpointDirs.join(path.delimiter),
            XEDU_PYTHON_EXECUTABLE: pythonCmd,
            PYTHONPATH: path.dirname(serverScript),
            PYTHONHOME: '',
        };
        const pythonEnvDir = path.dirname(pythonCmd);
        if (process.platform === 'win32') {
            env.PATH = [
                pythonEnvDir,
                path.join(pythonEnvDir, 'Scripts'),
                env.PATH || ''
            ].filter(Boolean).join(path.delimiter);
        }
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
            rememberBackendOutput(output);
            appendBackendLog(output);
            const type = classifyOutput(output, false);
            if (type) {
                safeSendLog({ type, message: output.trim() });
            }
        });

        backendProcess.stderr.on('data', (data) => {
            const output = data.toString();
            rememberBackendOutput(output);
            appendBackendLog(output);
            const type = classifyOutput(output, true);
            if (type) {
                safeSendLog({ type, message: output.trim() });
            }
        });

        backendProcess.on('close', (code, signal) => {
            console.log(`后端服务器退出，代码: ${code}, 信号: ${signal}`);
            backendLastExit = { code, signal };
            const exitMessage = `后端服务器退出，代码: ${code}, 信号: ${signal}`;
            const failureMessage = buildBackendFailureMessage(exitMessage);
            appendBackendLog(`\n[${new Date().toISOString()}] ${exitMessage}\n`);
            safeSendLog({
                type: code === 0 || code === null ? 'warning' : 'error',
                message: failureMessage
            });
            backendReadyPromise = null;
            jupyterManagedPid = null;
            updateBackendStartupState({
                status: code === 0 || code === null ? 'idle' : 'error',
                message: code === 0 || code === null ? '后端已停止。' : failureMessage,
                canRetry: true,
                logDirectory: getBackendLogDirectory(),
            });
            if (code !== 0 && code !== null) {
                console.error('后端服务器异常退出');
                if (code === 1) {
                    console.log('尝试重启后端服务器...');
                    setTimeout(() => {
                        backendReadyPromise = null;
                        startBackendServer({ reason: 'auto-retry' });
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
            rememberBackendOutput(err?.stack || err?.message || String(err));
            appendBackendLog(`\n[${new Date().toISOString()}] spawn error\n${err?.stack || err}\n`);
            const failureMessage = buildBackendFailureMessage(err.message || '启动后端服务器失败');
            safeSendLog({ type: 'error', message: failureMessage });
            updateBackendStartupState({
                status: 'error',
                message: failureMessage,
                canRetry: true,
                logDirectory: getBackendLogDirectory(),
            });
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
            return Promise.race([
                waitForBackendReady(BACKEND_TIMEOUT_MS),
                new Promise((_, reject) => {
                    const checkExit = () => {
                        if (backendLastExit) {
                            reject(new Error(buildBackendFailureMessage('后端进程已退出，未能启动服务')));
                            return;
                        }
                        setTimeout(checkExit, 500);
                    };
                    checkExit();
                })
            ]);
        })
        .then(() => {
            console.log('后端服务器已准备好');
            updateBackendStartupState({
                status: 'ready',
                message: '后端服务已就绪。',
                canRetry: false,
                logDirectory: getBackendLogDirectory(),
            });
            return true;
        })
        .catch((err) => {
            const message = buildBackendFailureMessage(err.message);
            mainWindow?.webContents.send('log-update', { type: 'error', message });
            updateBackendStartupState({
                status: 'error',
                message,
                canRetry: true,
                logDirectory: getBackendLogDirectory(),
            });
            backendReadyPromise = null;
            const wrappedError = new Error(message);
            wrappedError.code = err.code;
            throw wrappedError;
        });

    backendReadyPromise = readyPromise;
    return backendReadyPromise;
}

// ... previous code ...

// --- Jupyter BrowserView Management ---
let jupyterView = null;
let isJupyterViewVisible = false;
const { BrowserView } = require('electron');

function setupJupyterView() {
    const hasValidWindow = () => Boolean(mainWindow && !mainWindow.isDestroyed());
    const hasValidView = () =>
        Boolean(jupyterView && jupyterView.webContents && !jupyterView.webContents.isDestroyed());
    const ensureValidViewRef = () => {
        if (!hasValidView()) {
            jupyterView = null;
            isJupyterViewVisible = false;
            return false;
        }
        return true;
    };
    const isDestroyedViewError = (error) =>
        String(error?.message || '').includes('destroyed child view');
    const createFreshView = async (safeUrl, bounds) => {
        const view = new BrowserView({
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                sandbox: true,
                session: mainWindow.webContents.session,
                webSecurity: true
            }
        });

        view.webContents.once('destroyed', () => {
            if (jupyterView === view) {
                jupyterView = null;
                isJupyterViewVisible = false;
            }
        });

        if (bounds) {
            view.setBounds(bounds);
        }
        view.setAutoResize({ width: true, height: true, horizontal: true, vertical: true });
        try {
            await view.webContents.loadURL(safeUrl);
        } catch (e) {
            console.error('Failed to load Jupyter URL:', e);
        }
        jupyterView = view;
        if (isJupyterViewVisible) {
            if (mainWindow.getBrowserView() && mainWindow.getBrowserView() !== view) {
                mainWindow.setBrowserView(null);
            }
            mainWindow.setBrowserView(view);
        }
    };

    ipcMain.handle('jupyter:create-view', async (event, url, bounds) => {
        if (!hasValidWindow() || !isTrustedRenderer(event) || !isAllowedJupyterUrl(url)) {
            return { success: false, error: 'main-window-unavailable' };
        }

        const safeUrl = normalizeJupyterUrl(url);

        console.log('正在创建/更新 Jupyter 视图:', safeUrl, bounds);

        // 如果已存在，仅更新 URL (如果不同)
        if (ensureValidViewRef()) {
            try {
                // 仅在当前页面授权显示 Jupyter 时才附加 BrowserView。
                if (isJupyterViewVisible && mainWindow.getBrowserView() !== jupyterView) {
                    mainWindow.setBrowserView(jupyterView);
                }

                // 更新位置
                if (bounds) {
                    jupyterView.setBounds(bounds);
                }

                // 如果 URL 不同，加载新 URL
                if (jupyterView.webContents.getURL() !== safeUrl) {
                    await jupyterView.webContents.loadURL(safeUrl);
                }
                return { success: true, reused: true };
            } catch (error) {
                console.warn('复用旧 Jupyter 视图失败，准备重建:', error?.message || error);
                jupyterView = null;
            }
        }

        for (let attempt = 0; attempt < 2; attempt += 1) {
            try {
                await createFreshView(safeUrl, bounds);
                return { success: true, recreated: true, attempt };
            } catch (error) {
                console.error('创建 Jupyter 视图失败:', error);
                jupyterView = null;
                if (!isDestroyedViewError(error) || attempt === 1) {
                    return { success: false, error: error?.message || 'create-view-failed' };
                }
            }
        }
        return { success: false, error: 'create-view-failed' };
    });

    ipcMain.handle('jupyter:update-bounds', (event, bounds) => {
        if (!hasValidWindow() || !isTrustedRenderer(event) || !ensureValidViewRef()) return;
        // 简单校验 bounds
        if (!bounds || bounds.width <= 0 || bounds.height <= 0) return;

        try {
            // 只有当前应显示 Jupyter 时才重新附加 BrowserView。
            // 隐藏状态下只缓存 bounds，避免窗口 resize/布局同步重新覆盖主页面。
            if (isJupyterViewVisible && mainWindow.getBrowserView() !== jupyterView) {
                mainWindow.setBrowserView(jupyterView);
            }
            jupyterView.setBounds(bounds);
        } catch (e) {
            console.error('更新视图位置失败:', e);
            jupyterView = null;
        }
    });

    ipcMain.handle('jupyter:set-visibility', (event, visible) => {
        if (!hasValidWindow() || !isTrustedRenderer(event)) return;
        if (!ensureValidViewRef()) {
            if (!visible && mainWindow.getBrowserView()) {
                mainWindow.setBrowserView(null);
            }
            return;
        }

        if (visible) {
            // 显示视图
            isJupyterViewVisible = true;
            if (mainWindow.getBrowserView() !== jupyterView) {
                mainWindow.setBrowserView(jupyterView);
            }
        } else {
            // 隐藏视图时真正移除 BrowserView，避免残留覆盖在主页面上方
            isJupyterViewVisible = false;
            try {
                mainWindow.removeBrowserView(jupyterView);
            } catch (e) {
                console.warn('隐藏 Jupyter 视图失败:', e?.message || e);
            } finally {
                if (mainWindow.getBrowserView() === jupyterView) {
                    mainWindow.setBrowserView(null);
                }
            }
        }
    });

    ipcMain.handle('jupyter:destroy-view', (event) => {
        if (!isTrustedRenderer(event)) return { success: false, error: 'forbidden' };
        if (!ensureValidViewRef()) return { success: true };
        console.log('销毁 Jupyter 视图');
        isJupyterViewVisible = false;
        try {
            if (hasValidWindow()) {
                mainWindow.removeBrowserView(jupyterView);
            }
        } catch (e) {
            console.warn('移除 Jupyter 视图失败:', e?.message || e);
            if (hasValidWindow() && mainWindow.getBrowserView() === jupyterView) {
                mainWindow.setBrowserView(null);
            }
        }
        jupyterView = null;
        return { success: true };
    });

    ipcMain.handle('jupyter:reload', (event) => {
        if (isTrustedRenderer(event) && ensureValidViewRef()) {
            jupyterView.webContents.reload();
        }
    });
    
    ipcMain.handle('jupyter:go-back', (event) => {
        if (isTrustedRenderer(event) && ensureValidViewRef() && jupyterView.webContents.canGoBack()) {
            jupyterView.webContents.goBack();
        }
    });

    ipcMain.handle('jupyter:open-external', async (event, url) => {
        if (!isTrustedRenderer(event) || !isSafeExternalUrl(url)) {
            return { success: false, error: 'invalid-url' };
        }
        await shell.openExternal(url);
        return { success: true };
    });

    // 主窗口关闭时在 createWindow 中统一清理引用
}

function setupMenu() {
// ... existing code ...
    const viewSubmenu = [
        {
            label: '重新加载',
            accelerator: 'CmdOrCtrl+R',
            click: () => { mainWindow.reload(); }
        }
    ];

    if (!app.isPackaged) {
        viewSubmenu.push({
            label: '开发者工具',
            accelerator: process.platform === 'darwin' ? 'Alt+Cmd+I' : 'Ctrl+Shift+I',
            click: () => { mainWindow.webContents.toggleDevTools(); }
        });
    }

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
            submenu: viewSubmenu
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
    app.on('second-instance', (event, argv) => {
        const deepLinkArg = (argv || []).find((arg) => typeof arg === 'string' && arg.startsWith(`${XEDU_PROTOCOL}://`));
        if (deepLinkArg) {
            dispatchPracticeDeepLink(parsePracticeDeepLink(deepLinkArg));
        }
        if (mainWindow) {
            bringMainWindowToFront();
        }
    });

    app.whenReady().then(async () => {
        registerXeduProtocol();
        setupJupyterCspBypass();
        setupMenu();
        setupJupyterView(); // 初始化 Jupyter 视图管理器
        createWindow();
        startBackendServer().catch((error) => {
            console.error('后端服务器未能正常启动', error);
            const message = error.message || '请查看日志了解详情';
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.once('did-finish-load', () => {
                    mainWindow.webContents.send('log-update', { type: 'error', message });
                });
            }
            if (error.code !== 'XEDU_PYTHON_REQUIRED') {
                dialog.showErrorBox('后端启动失败', message);
            }
        });
    });

    app.on('open-url', (event, url) => {
        event.preventDefault();
        dispatchPracticeDeepLink(parsePracticeDeepLink(url));
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
        } else {
            bringMainWindowToFront();
        }
    });
}
