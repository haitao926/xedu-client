import apiClient from './api.js';
import { log, showModal, hideModal } from './ui.js';
import {
    formatPythonEnvironmentReadinessMessage,
    getPythonEnvironmentOptionalWarnings,
    getPythonEnvironmentReadinessIssues,
} from './main/python-environment-readiness.js';

let checkTimer = null;
let currentJupyterUrl = '';
let isViewAttached = false;
let isViewVisible = false;
let isAttaching = false;
const JUPYTER_VIEW_INTENT_KEY = 'xedu-jupyter-view-intent';
let allowAutoAttach = readJupyterViewIntent();
let resizeObserver = null;
let suppressVisibleUntil = 0;
const LAST_PROJECT_KEY = 'xedu-last-project-dir';
let lastProjectDir = loadLastProjectDir();
let lastStatusErrorKey = '';
let lastStatusErrorAt = 0;
let notebookOpenRevision = 0;
let notebookOpenSequence = Promise.resolve();

function readJupyterViewIntent(storage = globalThis.sessionStorage) {
    try {
        return storage?.getItem(JUPYTER_VIEW_INTENT_KEY) === 'true';
    } catch (_) {
        return false;
    }
}

function writeJupyterViewIntent(value, storage = globalThis.sessionStorage) {
    try {
        if (value) storage?.setItem(JUPYTER_VIEW_INTENT_KEY, 'true');
        else storage?.removeItem(JUPYTER_VIEW_INTENT_KEY);
    } catch (_) {
        // A missing session store should fail closed and keep the in-memory flag.
    }
    allowAutoAttach = Boolean(value);
}

function getApiErrorMessage(error, fallback = '操作失败') {
    for (const candidate of [error?.details, error?.message]) {
        if (!candidate) continue;
        try {
            const parsed = JSON.parse(candidate);
            if (typeof parsed?.message === 'string' && parsed.message.trim()) {
                return parsed.message.trim();
            }
            if (typeof parsed?.error === 'string' && parsed.error.trim()) {
                return parsed.error.trim();
            }
        } catch (_) {
            if (candidate === error?.details) return String(candidate);
        }
    }
    return error?.message || fallback;
}

function loadLastProjectDir() {
    try {
        return localStorage.getItem(LAST_PROJECT_KEY) || '';
    } catch (e) {
        return '';
    }
}

function rememberProjectDir(path) {
    lastProjectDir = path || '';
    try {
        if (lastProjectDir) {
            localStorage.setItem(LAST_PROJECT_KEY, lastProjectDir);
        } else {
            localStorage.removeItem(LAST_PROJECT_KEY);
        }
    } catch (e) {
        // ignore storage write errors
    }
}

function applyProjectDirToInput(path) {
    if (!path) return;
    const input = document.getElementById('project-path');
    if (input && !input.value) {
        input.value = path;
    }
}

function resolveProjectDir() {
    const input = document.getElementById('project-path');
    const raw = input && typeof input.value === 'string' ? input.value.trim() : '';
    if (raw) return raw;
    if (lastProjectDir) {
        applyProjectDirToInput(lastProjectDir);
        return lastProjectDir;
    }
    return '';
}

function normalizeJupyterUrl(url) {
    if (!url || typeof url !== 'string') return url;
    // 修正偶发的 "/lablocale=en"（缺少 '?'）以及 tree 模式的同类问题
    return url
        .replace('/lablocale=', '/lab?locale=')
        .replace('/treelocale=', '/tree?locale=');
}
let statusFailureCount = 0; // 新增：状态检查失败计数器

function shouldDisplayEmbeddedJupyter() {
    return shouldDisplayEmbeddedJupyterState({
        workspaceActive: Boolean(document.getElementById('main')?.classList.contains('active')),
        studentMode: document.body.classList.contains('student-mode'),
        studentPythonPage: document.body.classList.contains('student-page-python'),
        studentPythonNavActive: document.getElementById('nav-student-python-item')?.classList.contains('active'),
        hasVisibleModal: Boolean(document.querySelector('.modal-overlay.show')),
        suppressUntil: suppressVisibleUntil,
        now: Date.now(),
    });
}

export function shouldDisplayEmbeddedJupyterState({
    workspaceActive = false,
    studentMode = false,
    studentPythonPage = false,
    studentPythonNavActive = false,
    hasVisibleModal = false,
    suppressUntil = 0,
    now = Date.now(),
} = {}) {
    if (!workspaceActive || hasVisibleModal || now < suppressUntil) return false;
    if (!studentMode) return true;
    // The navigation item is the source of truth during the async student
    // workspace transition; the body class may be updated a tick later.
    return studentPythonPage || studentPythonNavActive;
}

const STATUS_FETCH_TIMEOUT_MS = 2000;
const READY_STATUS_FETCH_TIMEOUT_MS = 2500;
const apiFetch = (path, options = {}) => {
    const { timeoutMs = 0, ...fetchOptions } = options || {};
    return apiClient.request(path, {
        ...fetchOptions,
        timeoutMs,
    });
};

function setBackendDisconnectedStatus(startupState = null) {
    const statusEl = document.getElementById('jupyter-status');
    const valueEl = document.getElementById('status-value');
    const portEl = document.getElementById('port-value');
    const pidEl = document.getElementById('pid-value');
    const stopBtn = document.getElementById('stop-btn');
    const restartBtn = document.getElementById('restart-btn');

    if (statusEl) {
        statusEl.textContent = startupState?.status === 'starting' ? '后端启动中' : '后端未就绪';
        statusEl.className = 'badge badge-stopped';
    }
    if (valueEl) {
        valueEl.textContent = startupState?.message || 'Backend unavailable';
        valueEl.style.color = 'var(--danger-color, #ef4444)';
    }
    if (portEl) portEl.textContent = '-';
    if (pidEl) pidEl.textContent = '-';
    if (stopBtn) stopBtn.disabled = true;
    if (restartBtn) restartBtn.disabled = true;
}

function shouldThrottleStatusErrorLog(error) {
    const key = `${error?.name || 'Error'}:${error?.message || 'unknown'}`;
    const now = Date.now();
    const sameError = key === lastStatusErrorKey;
    const delta = now - lastStatusErrorAt;
    lastStatusErrorKey = key;
    lastStatusErrorAt = now;
    if (statusFailureCount <= 1) {
        return false;
    }
    if (!sameError) {
        return false;
    }
    return delta < 30000 || (statusFailureCount % 6 !== 0);
}

async function parseJsonSafe(response, desc = '接口') {
    const text = await response.text();
    try {
        return JSON.parse(text);
    } catch (err) {
        throw new Error(`${desc}返回无效JSON`);
    }
}

// --- BrowserView Synchronization Logic ---

function getPlaceholderBounds() {
    const placeholder = document.getElementById('jupyter-view-placeholder');
    if (!placeholder) return null;
    
    const rect = placeholder.getBoundingClientRect();
    // BrowserView needs absolute screen coordinates or window-relative integer coordinates
    // Electron's setBounds uses window-relative coordinates (x, y relative to the top-left of the client area)
    // We need to account for device pixel ratio if handled manually, but BrowserView setBounds usually takes logical pixels (same as CSS).
    
    return {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
    };
}

export function isUsableJupyterViewBounds(bounds) {
    return Boolean(
        bounds &&
        Number.isFinite(bounds.width) &&
        Number.isFinite(bounds.height) &&
        bounds.width > 0 &&
        bounds.height > 0
    );
}

export function shouldRestoreJupyterView({
    running,
    url,
    pageVisible,
    intent,
    viewAttached,
    isAttaching: attaching,
} = {}) {
    return Boolean(running && url && pageVisible && intent && !viewAttached && !attaching);
}

export function isBackendReadyForJupyterState(state) {
    return !state || state.status === 'ready';
}

async function readBackendReadiness() {
    const getBackendStartupState = window.electronAPI?.getBackendStartupState;
    if (typeof getBackendStartupState !== 'function') {
        return { ready: true, state: null };
    }
    try {
        const result = await getBackendStartupState();
        const state = result?.state || null;
        return { ready: isBackendReadyForJupyterState(state), state };
    } catch (_) {
        return {
            ready: false,
            state: { status: 'error', message: '无法读取后端启动状态。' },
        };
    }
}

async function ensureBackendReadyForJupyter() {
    const readiness = await readBackendReadiness();
    if (!readiness.ready) {
        setBackendDisconnectedStatus(readiness.state);
        log(readiness.state?.message || '后端尚未就绪，暂不能使用 Jupyter。', 'warning');
        return false;
    }
    return true;
}

function startViewSync() {
    const placeholder = document.getElementById('jupyter-view-placeholder');
    if (!placeholder || resizeObserver) return;

    resizeObserver = new ResizeObserver(() => {
        if (isViewAttached && isViewVisible) {
            const bounds = getPlaceholderBounds();
            
            // 调试日志：查看实际获取的坐标
            // console.log('[Jupyter Bounds Debug]', bounds);

            if (isUsableJupyterViewBounds(bounds)) {
                window.electronAPI.jupyterUpdateBounds(bounds);
            }
        }
    });
    
    resizeObserver.observe(placeholder);
    // Also observe the body to catch layout shifts
    resizeObserver.observe(document.body);
}

function stopViewSync() {
    if (resizeObserver) {
        resizeObserver.disconnect();
        resizeObserver = null;
    }
}

async function adoptJupyterView(url) {
    const normalizedUrl = normalizeJupyterUrl(url);
    if (!normalizedUrl) return false;
    currentJupyterUrl = normalizedUrl;
    isViewAttached = true;
    const placeholderContent = document.querySelector('.jupyter-placeholder');
    if (placeholderContent) placeholderContent.style.display = 'none';
    const badge = document.getElementById('canvas-status');
    if (badge) {
        badge.textContent = '已连接';
        badge.style.background = '#dcfce7';
        badge.style.color = '#166534';
    }
    startViewSync();
    await setVisibility(shouldDisplayEmbeddedJupyter());
    return true;
}

async function reconcileJupyterView(url) {
    try {
        const state = await window.electronAPI?.jupyterGetState?.();
        if (state?.exists && await adoptJupyterView(state.url || url)) {
            return;
        }
    } catch (error) {
        console.warn('读取 Jupyter 视图状态失败，将尝试重新挂载:', error);
    }
    if (document.getElementById('jupyter-view-placeholder')) {
        await attachJupyterView(url);
    }
}

async function attachJupyterView(url, options = {}) {
    if (!url) return;
    if (isAttaching) return;
    if (isViewAttached && !options.force) return;

    const normalizedUrl = normalizeJupyterUrl(url);

    // 检查元素是否可见，如果不在当前标签页，直接放弃本次挂载
    const placeholder = document.getElementById('jupyter-view-placeholder');
    if (!placeholder || !placeholder.offsetParent) {
        return;
    }
    
    isAttaching = true;
    currentJupyterUrl = normalizedUrl;
    
    try {
        // 给一点时间让 CSS Flex 布局完全稳定
        await new Promise(r => setTimeout(r, 100));

        // BrowserView 位于 DOM 之上，modal 打开期间不能继续挂载它。
        if (!shouldDisplayEmbeddedJupyter()) {
            return;
        }

        const bounds = getPlaceholderBounds();
        
        if (!isUsableJupyterViewBounds(bounds)) {
            return;
        }

        if (bounds) {
            log('正在挂载 Jupyter 视图...', 'info');
            const result = await window.electronAPI.jupyterCreateView(normalizedUrl, bounds);
            if (result && result.success === false) {
                throw new Error(result.error || 'jupyter-create-view-failed');
            }
            await adoptJupyterView(normalizedUrl);
        }
    } catch (e) {
        console.error('挂载视图失败:', e);
    } finally {
        isAttaching = false;
    }
}

async function detachJupyterView() {
    isViewAttached = false;
    isViewVisible = false;
    stopViewSync();
    await window.electronAPI.jupyterDestroyView();
    
    // Show placeholder content
    const placeholderContent = document.querySelector('.jupyter-placeholder');
    if (placeholderContent) placeholderContent.style.display = 'flex';

    // Update badge
    const badge = document.getElementById('canvas-status');
    if (badge) {
        badge.textContent = '未连接';
        badge.style.background = '#f1f5f9';
        badge.style.color = '#64748b';
    }
}

export async function setVisibility(visible) {
    isViewVisible = Boolean(visible);
    if (!isViewVisible) {
        suppressVisibleUntil = Date.now() + 1200;
    } else {
        suppressVisibleUntil = 0;
    }
    // 只有当视图确实已经“挂载”（即Jupyter已启动且未停止）时，才进行显隐切换
    if (isViewAttached) {
        // 通知主进程添加或移除 BrowserView
        await window.electronAPI.jupyterSetVisibility(isViewVisible);
        
        // 如果是显示，可能需要重新同步一下位置（防止切换期间窗口大小变了）
        if (isViewVisible) {
            const bounds = getPlaceholderBounds();
            if (bounds) {
                window.electronAPI.jupyterUpdateBounds(bounds);
            }
        }
    }
}

// --- Toolbar Actions ---

export function refreshView() {
    if (isViewAttached) {
        window.electronAPI.jupyterReload();
        log('刷新视图', 'info');
    }
}

export async function openExternal(url) {
    const target = url || currentJupyterUrl;
    if (target) {
        const result = await window.electronAPI?.jupyterOpenExternal?.(target);
        if (!result?.success) {
            log(`无法在浏览器中打开 Jupyter：${result?.error || '浏览器桥接不可用'}`, 'error');
            return false;
        }
        return true;
    } else {
        log('Jupyter 尚未启动', 'warning');
        return false;
    }
}

export function toggleFullscreen() {
    const card = document.getElementById('jupyter-card');
    const icon = document.getElementById('fullscreen-icon');
    
    if (!card) return;
    
    const isFullscreen = card.classList.toggle('fullscreen');
    document.body.classList.toggle('focus-mode', isFullscreen);
    
    if (isFullscreen) {
        if (icon) {
            icon.textContent = '↙'; // Exit fullscreen icon
        }
        log('进入专注模式', 'info');
    } else {
        if (icon) {
            icon.textContent = '⛶'; // Enter fullscreen icon
        }
        log('退出专注模式', 'info');
    }
    
    // Trigger resize check immediately after transition
    // We wait a bit for the CSS transition to finish or at least start
    setTimeout(() => {
        if (isViewAttached && isViewVisible) {
            const bounds = getPlaceholderBounds();
            window.electronAPI.jupyterUpdateBounds(bounds);
        }
    }, 300);
}

function normalizePathForCompare(path) {
    return (path || '').toString().replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
}

export function shouldRestartJupyterForProject({ running, targetProjectDir, statusProjectDir } = {}) {
    if (!running) return true;
    if (!targetProjectDir) return false;
    if (!statusProjectDir) return true;
    return normalizePathForCompare(targetProjectDir) !== normalizePathForCompare(statusProjectDir);
}

function normalizeNotebookPath(filePath, projectDir) {
    if (!filePath) return '';
    let normalized = filePath.toString().replace(/\\/g, '/');
    const base = (projectDir || '').toString().replace(/\\/g, '/').replace(/\/+$/, '');
    if (base && normalizePathForCompare(normalized).startsWith(normalizePathForCompare(base) + '/')) {
        normalized = normalized.slice(base.length + 1);
    }
    return normalized.replace(/^\/+/, '');
}

function buildNotebookUrl(baseUrl, filePath) {
    if (!baseUrl || !filePath) return baseUrl;
    try {
        const url = new URL(baseUrl);
        const basePath = url.pathname.replace(/\/+$/, '');
        const useLab = basePath.includes('/lab');
        const prefix = useLab ? '/lab/tree/' : '/tree/';
        const encodedPath = filePath
            .split('/')
            .filter(Boolean)
            .map((part) => encodeURIComponent(part))
            .join('/');
        url.pathname = `${prefix}${encodedPath}`;
        return url.toString();
    } catch (err) {
        return baseUrl;
    }
}

async function openNotebookFileRequest(filePath, projectDir, revision) {
    if (!filePath || revision !== notebookOpenRevision) return false;
    if (!await ensureBackendReadyForJupyter() || revision !== notebookOpenRevision) return false;
    writeJupyterViewIntent(true);

    const normalizedPath = normalizeNotebookPath(filePath, projectDir);
    if (!normalizedPath) return false;

    if (projectDir) {
        const input = document.getElementById('project-path');
        if (input) input.value = projectDir;
    }

    let statusData = null;
    try {
        const response = await apiFetch('/api/status', {
            cache: 'no-store',
            timeoutMs: STATUS_FETCH_TIMEOUT_MS,
        });
        if (response.ok) {
            statusData = await parseJsonSafe(response, '/api/status');
        }
    } catch (error) {
        // ignore
    }

    if (revision !== notebookOpenRevision) return false;
    const statusProjectDir = statusData?.config?.project_dir || '';
    const needsRestart = shouldRestartJupyterForProject({
        running: statusData?.running,
        targetProjectDir: projectDir,
        statusProjectDir,
    });

    if (needsRestart) {
        if (isViewAttached) {
            await detachJupyterView();
        }
        if (revision !== notebookOpenRevision) return false;
        const started = await startJupyter({ attachView: false });
        if (!started || revision !== notebookOpenRevision) return false;
        try {
            const refreshed = await apiFetch('/api/status', {
                cache: 'no-store',
                timeoutMs: STATUS_FETCH_TIMEOUT_MS,
            });
            if (refreshed.ok) {
                statusData = await parseJsonSafe(refreshed, '/api/status');
            }
        } catch (error) {
            // ignore
        }
    } else if (statusData?.url && !isViewAttached) {
        await attachJupyterView(statusData.url, { force: true });
    }

    if (revision !== notebookOpenRevision) return false;
    const actualProjectDir = statusData?.config?.project_dir || '';
    if (projectDir && normalizePathForCompare(projectDir) !== normalizePathForCompare(actualProjectDir)) {
        throw new Error('Jupyter 工作目录切换失败，请重新打开当前实验。');
    }

    const baseUrl = statusData?.url || currentJupyterUrl;
    if (!baseUrl) return false;

    const fileUrl = buildNotebookUrl(baseUrl, normalizedPath);
    if (revision !== notebookOpenRevision) return false;
    await attachJupyterView(fileUrl, { force: true });
    return revision === notebookOpenRevision;
}

export function openNotebookFile(filePath, projectDir) {
    const revision = ++notebookOpenRevision;
    const openTask = notebookOpenSequence
        .catch(() => false)
        .then(() => openNotebookFileRequest(filePath, projectDir, revision));
    notebookOpenSequence = openTask.catch(() => false);
    return openTask;
}

// --- Core Jupyter Logic ---

export async function startJupyter(options = {}) {
    if (!await ensureBackendReadyForJupyter()) return false;
    writeJupyterViewIntent(true);
    const btn = document.getElementById('start-btn');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner"></span> 正在启动...';
        btn.classList.add('btn-loading');
    }

    try {
        log('正在请求启动 Jupyter...', 'info');

        // Reset and show progress
        const progressContainer = document.getElementById('startup-progress');
        const percentEl = document.getElementById('progress-percent');
        const steps = document.querySelectorAll('.startup-step');
        
        if (progressContainer) {
            progressContainer.classList.add('show');
            if (percentEl) percentEl.textContent = '0%';
            steps.forEach(step => {
                step.classList.remove('active', 'completed');
            });
        }

        const updateProgress = (step, percent) => {
            if (percentEl) percentEl.textContent = percent + '%';
            if (step > 0) {
                const currentStep = document.querySelector(`.startup-step[data-step="${step}"]`);
                if (currentStep) currentStep.classList.add('active');
                // Mark previous completed
                for (let i = 1; i < step; i++) {
                    const prevStep = document.querySelector(`.startup-step[data-step="${i}"]`);
                    if (prevStep) {
                        prevStep.classList.remove('active');
                        prevStep.classList.add('completed');
                    }
                }
            }
        };

        // Step 1: Verify Config
        updateProgress(1, 10);
        await new Promise(r => setTimeout(r, 500)); // Fake delay for UX

        const projectDir = resolveProjectDir();
        if (projectDir) {
            rememberProjectDir(projectDir);
        }

        const config = {};
        if (projectDir) {
            config.project_dir = projectDir;
        }

        // Step 2: Python Env
        updateProgress(2, 30);
        
        const response = await apiFetch('/api/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(config)
        });
        
        if (!response.ok) {
            const msg = await response.text();
            throw new Error(msg || `启动请求失败 (${response.status})`);
        }

        const data = await parseJsonSafe(response, '/api/start');

        if (data.success) {
            // Step 3: Process Started
            updateProgress(3, 60);
            log('Jupyter 进程已启动，等待服务响应...', 'success');
            
            // Step 4: Wait for Ready
            updateProgress(4, 80);
            
            // Poll for status
            let attempts = 0;
            const maxAttempts = 20;
            
            const waitForReady = async () => {
                if (attempts >= maxAttempts) {
                    throw new Error("启动超时，服务未响应");
                }
                attempts++;
                
                try {
                    const statusRes = await apiFetch('/api/status', {
                        cache: 'no-store',
                        timeoutMs: READY_STATUS_FETCH_TIMEOUT_MS,
                    });
                    if (!statusRes.ok) {
                        throw new Error(`状态接口返回异常 (${statusRes.status})`);
                    }
                    const statusData = await parseJsonSafe(statusRes, '/api/status');
                    
                    if (statusData.running && statusData.url) {
                        // Success!
                        updateProgress(5, 100);
                        // Mark final step completed
                        const finalStep = document.querySelector(`.startup-step[data-step="5"]`);
                        if (finalStep) finalStep.classList.add('completed');
                        
                        // Attach View
                        if (options.attachView !== false) {
                            await attachJupyterView(statusData.url);
                        }
                        
                        setTimeout(() => {
                            if (progressContainer) progressContainer.classList.remove('show');
                        }, 2000);
                        
                        return;
                    }
                } catch (e) {
                    // ignore and retry
                }
                
                await new Promise(r => setTimeout(r, 1000));
                return waitForReady();
            };
            
            await waitForReady();
            return true;
            
        } else {
            throw new Error(data.message || '启动失败');
        }

    } catch (error) {
        log('启动失败: ' + error.message, 'error');
        alert('启动失败: ' + error.message);
        const progressContainer = document.getElementById('startup-progress');
        if (progressContainer) progressContainer.classList.remove('show');
        return false;
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<span>▶</span> 启动 Jupyter Lab';
            btn.classList.remove('btn-loading');
        }
        await refreshStatus({ restoreView: options.attachView !== false });
    }
}

export async function stopJupyter() {
    writeJupyterViewIntent(false);
    const btn = document.getElementById('stop-btn');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '正在停止...';
    }

    try {
        log('正在停止 Jupyter...', 'info');
        await apiFetch('/api/stop', { method: 'POST' });
        log('Jupyter 已停止', 'warning');
        
        // Detach View
        await detachJupyterView();
        
    } catch (error) {
        log('停止失败: ' + error.message, 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<span>⏹</span> 停止';
        }
        refreshStatus();
    }
}

export async function restartJupyter() {
    if (!confirm('确定要重启 Jupyter 吗？未保存的工作可能会丢失。')) return;
    
    writeJupyterViewIntent(true);
    await stopJupyter();
    setTimeout(() => startJupyter(), 1000);
}

export async function refreshStatus(options = {}) {
    try {
        const readiness = await readBackendReadiness();
        if (!readiness.ready) {
            setBackendDisconnectedStatus(readiness.state);
            return;
        }
        const response = await apiFetch('/api/status', {
            cache: 'no-store',
            timeoutMs: STATUS_FETCH_TIMEOUT_MS,
        });
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        const data = await parseJsonSafe(response, '/api/status');
        
        // 成功获取状态，重置失败计数器
        statusFailureCount = 0;

        // 回填上次配置的项目路径，避免每次重启都为空
        const savedProjectDir = data.config && (data.config.project_dir || data.config.projectDir);
        if (savedProjectDir) {
            rememberProjectDir(savedProjectDir);
            applyProjectDirToInput(savedProjectDir);
        }

        const statusEl = document.getElementById('jupyter-status');
        const valueEl = document.getElementById('status-value');
        const portEl = document.getElementById('port-value');
        const pidEl = document.getElementById('pid-value');
        const startBtn = document.getElementById('start-btn');
        const stopBtn = document.getElementById('stop-btn');
        const restartBtn = document.getElementById('restart-btn');

        if (data.running) {
            if (statusEl) {
                statusEl.textContent = '运行中';
                statusEl.className = 'badge badge-running';
            }
            if (valueEl) {
                valueEl.textContent = 'Running';
                valueEl.style.color = 'var(--success-color)';
            }
            if (portEl) portEl.textContent = data.port;
            if (pidEl) pidEl.textContent = data.pid;

            if (startBtn) startBtn.disabled = true;
            if (stopBtn) stopBtn.disabled = false;
            if (restartBtn) restartBtn.disabled = false;
            
            if (options.restoreView !== false && shouldRestoreJupyterView({
                running: data.running,
                url: data.url,
                pageVisible: shouldDisplayEmbeddedJupyter(),
                intent: allowAutoAttach,
                viewAttached: isViewAttached,
                isAttaching,
            })) {
                await reconcileJupyterView(data.url);
            }
            
        } else {
            if (statusEl) {
                statusEl.textContent = '已停止';
                statusEl.className = 'badge badge-stopped';
            }
            if (valueEl) {
                valueEl.textContent = 'Stopped';
                valueEl.style.color = 'var(--text-secondary)';
            }
            if (portEl) portEl.textContent = '-';
            if (pidEl) pidEl.textContent = '-';

            if (startBtn) startBtn.disabled = false;
            if (stopBtn) stopBtn.disabled = true;
            if (restartBtn) restartBtn.disabled = true;
            
            if (isViewAttached) {
                console.warn('Jupyter 状态变为停止，销毁视图');
                writeJupyterViewIntent(false);
                detachJupyterView();
            }
        }
    } catch (error) {
        setBackendDisconnectedStatus();
        
        statusFailureCount++;
        const throttleLog = shouldThrottleStatusErrorLog(error);
        if (!throttleLog) {
            console.warn('状态检查失败，后端不可达:', error);
        }
        
        // 只有连续失败超过 3 次才销毁视图，避免网络抖动导致闪烁
        if (isViewAttached && statusFailureCount > 3) {
            console.warn(`状态检查连续失败 ${statusFailureCount} 次，强制销毁视图:`, error.message);
            detachJupyterView();
            statusFailureCount = 0; // 重置
        }
    }
}

// 文件夹选择相关
export async function browseFolder() {
    if (!window.electronAPI) {
        console.warn('Electron API不可用，可能正运行在浏览器模式');
        alert('请在 XEdu Client 桌面应用中使用此功能');
        return;
    }
    try {
        const path = await window.electronAPI.selectFolder();
        if (path) {
            document.getElementById('project-path').value = path;
            rememberProjectDir(path);
        }
    } catch (error) {
        console.error('选择文件夹失败:', error);
    }
}

export async function confirmProjectPath() {
    const path = document.getElementById('project-path').value.trim();
    if (!path) {
        alert('请先选择项目路径');
        return;
    }

    if (window.electronAPI?.isDirectory) {
        const exists = await window.electronAPI.isDirectory(path);
        if (!exists) {
            alert('项目目录不存在，请选择本地项目目录');
            return;
        }
    }
    
    try {
        const res = await apiFetch('/api/save_config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jupyter: { project_dir: path }
            })
        });
        const data = await res.json();
        if (data.success) {
            log('项目路径已更新: ' + path, 'success');
            alert('项目路径已成功更新！');
            rememberProjectDir(path);
        } else {
            alert('保存失败: ' + data.message);
        }
    } catch (e) {
        console.error(e);
        alert('保存失败');
    }
}

export function clearProjectPath() {
    document.getElementById('project-path').value = '';
    rememberProjectDir('');
}

export function getStoredProjectDir() {
    return resolveProjectDir();
}

export async function testPythonEnvironment() {
    const pythonPath = document.getElementById('python-path-input')?.value.trim() || '';
    const resultEl = document.getElementById('python-env-check-result');
    log(`测试 Python 环境: ${pythonPath || '(当前后端解释器)'}`, 'info');
    if (resultEl) {
        resultEl.hidden = false;
        resultEl.dataset.state = 'pending';
        resultEl.textContent = '正在检测…';
    }
    try {
        let info;
        const standaloneInspect = window.electronAPI?.inspectPythonEnvironment;
        if (pythonPath && typeof standaloneInspect === 'function') {
            const response = await standaloneInspect(pythonPath);
            if (!response?.success) {
                throw new Error(response?.message || response?.error || 'Python 环境探针失败');
            }
            info = response.runtime || response;
        } else {
            const query = pythonPath ? `?python_executable=${encodeURIComponent(pythonPath)}` : '';
            const response = await apiClient.get(`/api/detect_python${query}`);
            if (!response?.success || !response?.info) {
                throw new Error(response?.message || '检测失败');
            }
            info = response.info;
        }

        const xeduReady = Boolean(info.xedu_version_ok && info.xedu_runtime_ok);
        const readinessIssues = getPythonEnvironmentReadinessIssues(info);
        const optionalWarnings = getPythonEnvironmentOptionalWarnings(info);
        const message = [
            `Python ${info.python_version || '未知'}`,
            `pip ${info.pip_version || (info.pip_available === false && info.pip_launcher_available !== true ? '未安装' : '可用')}`,
            `JupyterLab ${info.jupyterlab_version || '未安装'}`,
            `XEdu ${xeduReady ? '就绪' : '未就绪（可选）'}`,
            readinessIssues.length ? formatPythonEnvironmentReadinessMessage(readinessIssues) : '',
            !readinessIssues.length ? optionalWarnings.join('；') : '',
        ].filter(Boolean).join(' | ');

        if (resultEl) {
            resultEl.textContent = message;
            resultEl.dataset.state = readinessIssues.length === 0 ? 'success' : 'warning';
        }
        log(message, readinessIssues.length === 0 ? 'success' : 'warning');
    } catch (error) {
        const message = `Python 环境检测失败: ${getApiErrorMessage(error)}`;
        if (resultEl) {
            resultEl.textContent = message;
            resultEl.dataset.state = 'error';
        }
        log(message, 'error');
    }
}

// 不再需要 openBrowser (open-btn 移除或改用 openExternal)
export function openBrowser() {
    openExternal();
}

export { getApiErrorMessage };
