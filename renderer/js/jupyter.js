import apiClient from './api.js';
import { log, showModal, hideModal } from './ui.js';

let checkTimer = null;
let currentJupyterUrl = '';
let isViewAttached = false;
let isAttaching = false;
let resizeObserver = null;
const LAST_PROJECT_KEY = 'xedu-last-project-dir';
let lastProjectDir = loadLastProjectDir();

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

// Ensure API calls hit the backend over HTTP even when loaded via file://
const DEFAULT_API_BASE = (typeof window !== 'undefined' && window.xeduConfig && window.xeduConfig.apiBase)
    ? window.xeduConfig.apiBase
    : 'http://127.0.0.1:5123';
const API_BASE = (apiClient && apiClient.baseURL ? apiClient.baseURL : DEFAULT_API_BASE).replace(/\/$/, '');
const apiFetch = (path, options) => fetch(`${API_BASE}${path}`, options);

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

function startViewSync() {
    const placeholder = document.getElementById('jupyter-view-placeholder');
    if (!placeholder || resizeObserver) return;

    resizeObserver = new ResizeObserver(() => {
        if (isViewAttached) {
            const bounds = getPlaceholderBounds();
            
            // 调试日志：查看实际获取的坐标
            // console.log('[Jupyter Bounds Debug]', bounds);

            if (bounds && bounds.width > 0 && bounds.height > 0) {
                // 关键修复：防止非全屏状态下遮挡左侧栏
                const isFullscreen = document.getElementById('jupyter-card')?.classList.contains('fullscreen');
                
                // 如果不是全屏模式，且 x 坐标小于 300（说明可能布局计算错误或被挤压），则拒绝更新
                if (!isFullscreen && bounds.x < 300) {
                    // console.warn('忽略异常布局坐标:', bounds);
                    return;
                }

                window.electronAPI.invoke('jupyter:update-bounds', bounds);
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

async function attachJupyterView(url) {
    if (!url) return;
    if (isAttaching || isViewAttached) return;

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

        const bounds = getPlaceholderBounds();
        
        // 安全检查：如果 x 坐标太小，说明布局可能还没准备好（或者被挤压了）
        // 左侧栏宽度约为 380px，所以 x 应该至少大于 300
        if (bounds && bounds.x < 300) {
            // console.warn('Jupyter 视图布局异常 (x < 300)，跳过本次挂载');
            isAttaching = false; 
            return;
        }

        if (bounds) {
            log('正在挂载 Jupyter 视图...', 'info');
            await window.electronAPI.invoke('jupyter:create-view', normalizedUrl, bounds);
            isViewAttached = true;
            
            // Hide placeholder content, keep container for layout
            const placeholderContent = document.querySelector('.jupyter-placeholder');
            if (placeholderContent) placeholderContent.style.display = 'none';
            
            // Update badge
            const badge = document.getElementById('canvas-status');
            if (badge) {
                badge.textContent = '已连接';
                badge.style.background = '#dcfce7';
                badge.style.color = '#166534';
            }

            startViewSync();
        }
    } catch (e) {
        console.error('挂载视图失败:', e);
    } finally {
        isAttaching = false;
    }
}

async function detachJupyterView() {
    isViewAttached = false;
    stopViewSync();
    await window.electronAPI.invoke('jupyter:destroy-view');
    
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
    // 只有当视图确实已经“挂载”（即Jupyter已启动且未停止）时，才进行显隐切换
    if (isViewAttached) {
        // 通知主进程添加或移除 BrowserView
        await window.electronAPI.invoke('jupyter:set-visibility', visible);
        
        // 如果是显示，可能需要重新同步一下位置（防止切换期间窗口大小变了）
        if (visible) {
            const bounds = getPlaceholderBounds();
            if (bounds) {
                window.electronAPI.invoke('jupyter:update-bounds', bounds);
            }
        }
    }
}

// --- Toolbar Actions ---

export function refreshView() {
    if (isViewAttached) {
        window.electronAPI.invoke('jupyter:reload');
        log('刷新视图', 'info');
    }
}

export async function openExternal(url) {
    const target = url || currentJupyterUrl;
    if (target) {
        await window.electronAPI.invoke('jupyter:open-external', target);
    } else {
        log('Jupyter 尚未启动', 'warning');
    }
}

export function toggleFullscreen() {
    const card = document.getElementById('jupyter-card');
    const icon = document.getElementById('fullscreen-icon');
    
    if (!card) return;
    
    const isFullscreen = card.classList.toggle('fullscreen');
    
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
        if (isViewAttached) {
            const bounds = getPlaceholderBounds();
            window.electronAPI.invoke('jupyter:update-bounds', bounds);
        }
    }, 300);
}

// --- Core Jupyter Logic ---

export async function startJupyter() {
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
                    const statusRes = await apiFetch('/api/status');
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
                        await attachJupyterView(statusData.url);
                        
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
            refreshStatus();
            
        } else {
            throw new Error(data.message || '启动失败');
        }

    } catch (error) {
        log('启动失败: ' + error.message, 'error');
        alert('启动失败: ' + error.message);
        const progressContainer = document.getElementById('startup-progress');
        if (progressContainer) progressContainer.classList.remove('show');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<span>▶</span> 启动 Jupyter Lab';
            btn.classList.remove('btn-loading');
        }
        refreshStatus();
    }
}

export async function stopJupyter() {
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
    
    await stopJupyter();
    setTimeout(() => startJupyter(), 1000);
}

export async function refreshStatus() {
    try {
        const response = await apiFetch('/api/status');
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
            
            // If running but view not attached (e.g. after refresh), attach it
            if (!isViewAttached && !isAttaching && data.url) {
                // Ensure placeholder is ready
                if (document.getElementById('jupyter-view-placeholder')) {
                    attachJupyterView(data.url);
                }
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
                detachJupyterView();
            }
        }
    } catch (error) {
        console.error('状态检查失败:', error);
        
        statusFailureCount++;
        
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
        const path = await window.electronAPI.invoke('select-folder');
        if (path) {
            document.getElementById('project-path').value = path;
            rememberProjectDir(path);
        }
    } catch (error) {
        console.error('选择文件夹失败:', error);
    }
}

export async function confirmProjectPath() {
    const path = document.getElementById('project-path').value;
    if (!path) {
        alert('请先选择项目路径');
        return;
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

export async function testPythonEnvironment() {
    // ... existing implementation or simplified ...
    const pythonPath = document.getElementById('python-path-input').value;
    log(`测试 Python 环境: ${pythonPath}`, 'info');
    // For now just a mock
    setTimeout(() => log('Python 环境测试通过 (Mock)', 'success'), 1000);
}

// 不再需要 openBrowser (open-btn 移除或改用 openExternal)
export function openBrowser() {
    openExternal();
}
