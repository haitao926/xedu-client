// API 基础 URL
const API_BASE = 'http://127.0.0.1:5000';

async function apiCall(endpoint, options = {}) {
    const url = `${API_BASE}${endpoint}`;
    try {
        const response = await fetch(url, options);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        return await response.json();
    } catch (error) {
        console.error(`API call failed: ${endpoint}`, error);
        throw error;
    }
}

let statusInterval = null;
let autoScroll = true;
let startTime = null;

function log(message, type = 'info') {
    const logContainer = document.getElementById('log-container');
    if (!logContainer) return;

    const time = new Date().toLocaleTimeString();
    const logLine = document.createElement('div');
    logLine.className = `log-line log-${type}`;
    logLine.innerHTML = `<span class="log-time">[${time}]</span> ${message}`;
    logContainer.appendChild(logLine);

    if (autoScroll) {
        logContainer.scrollTop = logContainer.scrollHeight;
    }
}

function updateStatusUI(data) {
    const isRunning = data.running;

    document.getElementById('jupyter-status').textContent = isRunning ? '运行中' : '已停止';
    document.getElementById('jupyter-status').className = `status-badge ${isRunning ? 'status-running' : 'status-stopped'}`;

    document.getElementById('status-value').textContent = isRunning ? '运行中' : '已停止';
    document.getElementById('port-value').textContent = data.port || '-';
    document.getElementById('pid-value').textContent = data.pid || '-';
    document.getElementById('url-value').textContent = data.url || '-';

    document.getElementById('start-btn').disabled = isRunning;
    document.getElementById('stop-btn').disabled = !isRunning;
    document.getElementById('restart-btn').disabled = !isRunning;
    document.getElementById('open-btn').disabled = !isRunning;

    if (isRunning && !startTime) {
        startTime = Date.now();
        updateUptime();
    } else if (!isRunning) {
        startTime = null;
        document.getElementById('uptime').textContent = '-';
    }
}

function updateUptime() {
    if (!startTime) return;
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const hours = Math.floor(elapsed / 3600);
    const minutes = Math.floor((elapsed % 3600) / 60);
    const seconds = elapsed % 60;
    document.getElementById('uptime').textContent = `${hours}h ${minutes}m ${seconds}s`;
}

async function refreshStatus() {
    try {
        const data = await apiCall('/api/status');
        updateStatusUI(data);
        updateUptime();
    } catch (error) {
        document.getElementById('api-status').textContent = '连接失败';
        document.getElementById('api-status').style.color = '#dc2626';
        log('无法连接到 API 服务器: ' + error, 'error');
    }
}

async function startJupyter() {
    const startBtn = document.getElementById('start-btn');
    startBtn.disabled = true;
    startBtn.innerHTML = '<span>⏳</span> 启动中...';

    log('正在启动 Jupyter Lab...', 'info');

    try {
        const config = {
            port: parseInt(document.getElementById('config-port').value) || 8888,
            args: document.getElementById('config-args').value || '',
            work_dir: document.getElementById('config-dir').value || '',
            token: document.getElementById('config-token').value || '',
            browser: document.getElementById('config-browser').value || ''
        };

        const response = await fetch('http://127.0.0.1:5000/api/start', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(config)
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();

        if (data.success) {
            log(`✅ Jupyter Lab 启动成功！`, 'success');
            log(`   URL: ${data.url}`, 'success');
            log(`   进程 ID: ${data.pid} | 端口: ${data.port}`, 'success');
            await refreshStatus();

            if (document.getElementById('config-openbrowser').checked) {
                setTimeout(() => openBrowser(), 2000);
            }
        } else {
            log(`❌ 启动失败: ${data.message || '未知错误'}`, 'error');
        }
    } catch (error) {
        log(`❌ 启动失败: ${error}`, 'error');
    } finally {
        startBtn.disabled = false;
        startBtn.innerHTML = '<span>▶</span> 启动 Jupyter';
    }
}

async function stopJupyter() {
    const stopBtn = document.getElementById('stop-btn');
    stopBtn.disabled = true;
    stopBtn.innerHTML = '<span>⏳</span> 停止中...';

    log('正在停止 Jupyter Lab...', 'info');

    try {
        const data = await apiCall('/api/stop', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({})
        });

        if (data.success) {
            log('✅ Jupyter Lab 已停止', 'success');
            await refreshStatus();
        } else {
            log('❌ 停止失败', 'error');
        }
    } catch (error) {
        log(`❌ 停止失败: ${error}`, 'error');
    } finally {
        stopBtn.disabled = false;
        stopBtn.innerHTML = '<span>⏹</span> 停止 Jupyter';
    }
}

async function restartJupyter() {
    log('正在重启 Jupyter Lab...', 'info');
    log('→ 第一步：停止 Jupyter', 'info');
    await stopJupyter();
    log('→ 第二步：等待 2 秒', 'info');
    await new Promise(resolve => setTimeout(resolve, 2000));
    log('→ 第三步：重新启动', 'info');
    await startJupyter();
}

function openBrowser() {
    const status = document.getElementById('status-value').textContent;
    const url = document.getElementById('url-value').textContent;

    if (status === '运行中' && url !== '-') {
        log(`正在打开浏览器: ${url}`, 'info');
        window.open(url, '_blank');
    } else {
        log('❌ Jupyter Lab 未运行，无法打开浏览器', 'error');
    }
}

async function detectEnvironment() {
    log('正在检测 Python 环境...', 'info');
    switchToTab('logs');

    try {
        const data = await invoke('detect_python');

        if (data.success) {
            log(`✅ 检测到 Python: ${data.python_version}`, 'success');
            log(`✅ 检测到 JupyterLab: ${data.jupyterlab_version}`, 'success');
            log(`✅ 平台: ${data.platform}`, 'success');
            loadSystemInfo();
        } else {
            log('❌ 环境检测失败', 'error');
        }
    } catch (error) {
        log(`❌ 环境检测失败: ${error}`, 'error');
    }
}

async function testAPI() {
    log('正在测试 API 连接...', 'info');
    switchToTab('logs');

    try {
        const data = await invoke('get_jupyter_status');
        if (data) {
            log('✅ API 连接正常', 'success');
        } else {
            log('❌ API 响应错误', 'error');
        }
    } catch (error) {
        log(`❌ API 连接失败: ${error}`, 'error');
    }
}

function viewDocs() {
    switchToTab('help');
    log('已切换到帮助页面', 'info');
}

async function saveConfig() {
    const config = {
        port: parseInt(document.getElementById('config-port').value) || 8888,
        args: document.getElementById('config-args').value || '',
        work_dir: document.getElementById('config-dir').value || '',
        token: document.getElementById('config-token').value || '',
        browser: document.getElementById('config-browser').value || '',
        autosave: document.getElementById('config-autosave').checked,
        autostart: document.getElementById('config-autostart').checked,
        openbrowser: document.getElementById('config-openbrowser').checked,
        interval: parseInt(document.getElementById('config-interval').value) || 2
    };

    try {
        const data = await invoke('save_config', { config });

        if (data.success) {
            log('✅ 配置保存成功', 'success');
        } else {
            log('❌ 配置保存失败', 'error');
        }
    } catch (error) {
        log(`❌ 配置保存失败: ${error}`, 'error');
    }
}

async function loadConfig() {
    try {
        const data = await invoke('load_config');

        if (data.success && data.config) {
            document.getElementById('config-port').value = data.config.port || 8888;
            document.getElementById('config-args').value = data.config.args || '';
            document.getElementById('config-dir').value = data.config.work_dir || '';
            document.getElementById('config-token').value = data.config.token || '';
            document.getElementById('config-browser').value = data.config.browser || '';
            document.getElementById('config-autosave').checked = data.config.autosave !== false;
            document.getElementById('config-autostart').checked = data.config.autostart || false;
            document.getElementById('config-openbrowser').checked = data.config.openbrowser !== false;
            document.getElementById('config-interval').value = data.config.interval || 2;
            log('✅ 配置加载成功', 'success');
        } else {
            log('❌ 配置加载失败', 'error');
        }
    } catch (error) {
        log(`❌ 配置加载失败: ${error}`, 'error');
    }
}

function resetConfig() {
    document.getElementById('config-port').value = 8888;
    document.getElementById('config-args').value = '';
    document.getElementById('config-dir').value = '';
    document.getElementById('config-token').value = '';
    document.getElementById('config-browser').value = '';
    document.getElementById('config-autosave').checked = true;
    document.getElementById('config-autostart').checked = false;
    document.getElementById('config-openbrowser').checked = true;
    document.getElementById('config-interval').value = 2;
    log('✅ 已重置为默认配置', 'success');
}

function clearLog() {
    const logContainer = document.getElementById('log-container');
    if (logContainer) {
        logContainer.innerHTML = '<div class="log-line log-info">日志已清空</div>';
    }
}

function exportLog() {
    const logContainer = document.getElementById('log-container');
    if (!logContainer) return;

    const logs = Array.from(logContainer.querySelectorAll('.log-line'))
        .map(line => line.textContent)
        .join('\n');

    const blob = new Blob([logs], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `jupyter-logs-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.txt`;
    a.click();
    log('✅ 日志已导出', 'success');
}

function toggleAutoScroll() {
    autoScroll = !autoScroll;
    const btn = event.target;
    btn.textContent = `自动滚动: ${autoScroll ? '开' : '关'}`;
    log(`自动滚动已${autoScroll ? '开启' : '关闭'}`, 'info');
}

function switchToTab(tabName) {
    const tabs = document.querySelectorAll('.tab');
    const contents = document.querySelectorAll('.tab-content');

    tabs.forEach(tab => {
        if (tab.dataset.tab === tabName) {
            tab.classList.add('active');
        } else {
            tab.classList.remove('active');
        }
    });

    contents.forEach(content => {
        if (content.id === tabName) {
            content.classList.add('active');
        } else {
            content.classList.remove('active');
        }
    });
}

async function checkApiStatus() {
    try {
        const data = await invoke('get_jupyter_status');
        document.getElementById('api-status').textContent = '正常';
        document.getElementById('api-status').style.color = '#fff';
    } catch (error) {
        document.getElementById('api-status').textContent = '离线';
        document.getElementById('api-status').style.color = '#fee';
    }
}

async function loadSystemInfo() {
    try {
        const data = await invoke('detect_python');

        if (data.success) {
            document.getElementById('python-version').textContent = data.python_version || '-';
            document.getElementById('jupyter-version').textContent = data.jupyterlab_version || '-';
            document.getElementById('os-info').textContent = data.platform || '-';
        }
    } catch (error) {
        log('无法加载系统信息', 'error');
    }
}

function showAbout() {
    alert('Jupyter Lab Client v2.0.0\n\n' +
          '专业的 Jupyter Lab 桌面管理工具\n\n' +
          '✨ 新特性:\n' +
          '• 标签页式现代化界面\n' +
          '• 实时状态监控\n' +
          '• 配置管理系统\n' +
          '• 实时日志记录\n' +
          '• 键盘快捷键支持\n' +
          '• 性能指标显示\n\n' +
          '基于 Tauri + Python Flask 构建\n' +
          '© 2025 All Rights Reserved');
    log('显示关于信息', 'info');
}

window.onload = function() {
    log('✅ Jupyter Lab Client 启动完成', 'success');
    checkApiStatus();
    loadSystemInfo();
    refreshStatus();
    loadConfig();

    const interval = parseInt(document.getElementById('config-interval').value) || 2;
    statusInterval = setInterval(() => {
        refreshStatus();
        checkApiStatus();
    }, interval * 1000);

    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => {
            switchToTab(tab.dataset.tab);
        });
    });

    document.addEventListener('keydown', function(e) {
        if (e.ctrlKey) {
            switch(e.key.toLowerCase()) {
                case 's':
                    e.preventDefault();
                    if (!document.getElementById('start-btn').disabled) {
                        startJupyter();
                    }
                    break;
                case 't':
                    e.preventDefault();
                    if (!document.getElementById('stop-btn').disabled) {
                        stopJupyter();
                    }
                    break;
                case 'r':
                    e.preventDefault();
                    if (!document.getElementById('restart-btn').disabled) {
                        restartJupyter();
                    }
                    break;
                case 'o':
                    e.preventDefault();
                    if (!document.getElementById('open-btn').disabled) {
                        openBrowser();
                    }
                    break;
                case 'l':
                    e.preventDefault();
                    switchToTab('logs');
                    break;
                case '1':
                    e.preventDefault();
                    switchToTab('control');
                    break;
                case '2':
                    e.preventDefault();
                    switchToTab('system');
                    break;
                case '3':
                    e.preventDefault();
                    switchToTab('logs');
                    break;
                case '4':
                    e.preventDefault();
                    switchToTab('settings');
                    break;
                case '5':
                    e.preventDefault();
                    switchToTab('help');
                    break;
            }
        }
    });

    log('💡 快捷键已启用: Ctrl+1-5(切换标签页) Ctrl+S/T/R/O/L', 'info');
};
