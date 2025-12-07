import apiClient from './api.js';
import { log, showModal } from './ui.js';

let currentConfig = {
    python_executable: '',
    project_dir: '',
    jupyter_port: 8888
};

// 更新状态UI
function updateStatusUI(data) {
    const isRunning = data.running;

    const jupyterStatus = document.getElementById('jupyter-status');
    if (jupyterStatus) {
        jupyterStatus.textContent = isRunning ? '运行中' : '已停止';
        jupyterStatus.className = `badge ${isRunning ? 'badge-running' : 'badge-stopped'}`;
    }

    const statusValue = document.getElementById('status-value');
    if (statusValue) statusValue.textContent = isRunning ? '运行中' : '已停止';

    const portValue = document.getElementById('port-value');
    if (portValue) portValue.textContent = data.port || '-';

    const pidValue = document.getElementById('pid-value');
    if (pidValue) pidValue.textContent = data.pid || '-';

    const urlValue = document.getElementById('url-value');
    if (urlValue) urlValue.textContent = data.url || '-';

    if (data.config) {
        currentConfig = data.config;
        if (data.config.project_dir) {
            const projectDirInput = document.getElementById('project-path');
            if (projectDirInput && !projectDirInput.value) {
                projectDirInput.value = data.config.project_dir;
            }
        }
    }
}

// 获取状态
export async function refreshStatus() {
    try {
        const data = await apiClient.getStatus();
        updateStatusUI(data);
    } catch (error) {
        // 静默处理或记录调试日志
        // console.error('Status refresh failed:', error);
    }
}

// 启动 Jupyter
export async function startJupyter() {
    log('正在启动 Jupyter Notebook...', 'info');
    const btn = document.getElementById('start-btn');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span>⏳</span> 启动中...';
    }

    try {
        const portInput = document.getElementById('modal-config-port');
        const pythonPathInput = document.getElementById('modal-config-python-path');
        const projectDirInput = document.getElementById('project-path');

        const port = portInput ? (parseInt(portInput.value) || 8888) : 8888;
        const pythonPath = pythonPathInput ? pythonPathInput.value : '';
        const projectDir = projectDirInput ? projectDirInput.value : '';

        const startData = { port };
        if (pythonPath) startData.python_executable = pythonPath;
        if (projectDir) startData.project_dir = projectDir;

        const result = await apiClient.startJupyter(startData);

        if (result.success) {
            log('✅ Jupyter Notebook 启动成功！', 'success');
            await refreshStatus();
        } else {
            log(`❌ 启动失败: ${result.message}`, 'error');
        }
    } catch (error) {
        log(`❌ 启动失败: ${error.message}`, 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<span>▶</span> 启动';
        }
    }
}

// 停止 Jupyter
export async function stopJupyter() {
    const btn = document.getElementById('stop-btn');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span>⏳</span> 停止中...';
    }

    try {
        const result = await apiClient.stopJupyter();
        if (result.success) {
            log('✅ Jupyter Notebook 已停止', 'success');
            await refreshStatus();
        } else {
            log('❌ 停止失败', 'error');
        }
    } catch (error) {
        log(`❌ 停止失败: ${error.message}`, 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<span>⏹</span> 停止';
        }
    }
}

// 重启 Jupyter
export async function restartJupyter() {
    await stopJupyter();
    setTimeout(startJupyter, 2000);
}

// 打开浏览器
export function openBrowser() {
    const urlValue = document.getElementById('url-value');
    const url = urlValue ? urlValue.textContent : null;

    if (url && url !== '-') {
        // 使用 Electron API 打开外部链接
        if (window.electronAPI && window.electronAPI.openExternal) {
            window.electronAPI.openExternal(url);
        } else {
            window.open(url, '_blank');
        }
    } else {
        log('❌ Jupyter Notebook 未运行', 'error');
    }
}

// 确认项目路径
export async function confirmProjectPath() {
    const projectPathInput = document.getElementById('project-path');
    const path = projectPathInput ? projectPathInput.value : '';

    if (path) {
        log(`路径已确认: ${path}`, 'success');
        showModal('成功', '项目路径已设置', path);
        // 这里可以添加保存配置的逻辑
    } else {
        alert('请输入路径');
    }
}

// 重置项目路径为默认值
export function clearProjectPath() {
    const projectPathInput = document.getElementById('project-path');
    if (projectPathInput) {
        projectPathInput.value = 'C:\\Desktop';
    }
}

// 浏览文件夹
export async function browseFolder() {
    if (window.electronAPI && window.electronAPI.selectFolder) {
        const path = await window.electronAPI.selectFolder();
        if (path) {
            const projectPathInput = document.getElementById('project-path');
            if (projectPathInput) {
                projectPathInput.value = path;
                log(`已选择路径: ${path}`, 'info');
            }
        }
    } else {
        // Fallback to input[type=file]
        const folderInput = document.getElementById('folder-input');
        if (folderInput) folderInput.click();
    }
}

export function testPythonEnvironment() {
    alert('测试功能: Python环境检查');
}
