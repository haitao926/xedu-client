// Xedu Client - Electron 版本

// 全局变量
let API_BASE = 'http://127.0.0.1:5000';
let currentConfig = {
    python_executable: '',
    project_dir: '',
    jupyter_port: 8888
};

// 日志函数
function log(message, type = 'info') {
    const logContainer = document.getElementById('log-container');
    const time = new Date().toLocaleTimeString();
    const logLine = document.createElement('div');
    logLine.className = `log-line log-${type}`;
    logLine.innerHTML = `<span class="log-time">[${time}]</span> ${message}`;
    logContainer.appendChild(logLine);
    logContainer.scrollTop = logContainer.scrollHeight;
}

// 标签页切换
function showTab(tabName, clickedElement) {
    console.log('[DEBUG] showTab 被调用，切换到:', tabName);

    try {
        // 隐藏所有标签页
        const allTabContents = document.querySelectorAll('.tab-content');
        allTabContents.forEach((tab) => {
            tab.classList.remove('active');
            tab.style.display = 'none';
        });

        // 移除所有按钮的 active 类
        const allNavTabs = document.querySelectorAll('.nav-tab');
        allNavTabs.forEach((btn) => {
            btn.classList.remove('active');
        });

        // 显示目标标签页
        const targetTab = document.getElementById(tabName);
        if (targetTab) {
            targetTab.classList.add('active');
            targetTab.style.display = 'block';
            console.log('[DEBUG] ✅ 标签页已显示:', tabName);
        } else {
            console.error('[DEBUG] ❌ 未找到标签页:', tabName);
            return false;
        }

        // 高亮当前按钮
        if (clickedElement) {
            clickedElement.classList.add('active');
        } else {
            allNavTabs.forEach((btn) => {
                const onclick = btn.getAttribute('onclick');
                if (onclick && onclick.includes(`'${tabName}'`)) {
                    btn.classList.add('active');
                }
            });
        }

        console.log('[DEBUG] ✅ showTab 执行完成');
        return true;
    } catch (error) {
        console.error('[DEBUG] ❌ showTab 执行出错:', error);
        return false;
    }
}

// API 调用函数
async function apiCall(endpoint, options = {}) {
    try {
        const response = await fetch(`${API_BASE}${endpoint}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            },
            ...options
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        return await response.json();
    } catch (error) {
        log(`API 调用失败: ${error.message}`, 'error');
        throw error;
    }
}

// 获取状态
async function refreshStatus() {
    try {
        const status = await apiCall('/api/status');

        // 更新状态显示
        const statusElement = document.getElementById('jupyter-status');
        const portElement = document.getElementById('jupyter-port');
        const pidElement = document.getElementById('jupyter-pid');
        const urlElement = document.getElementById('jupyter-url');

        if (status.success && status.data.running) {
            statusElement.textContent = '运行中';
            statusElement.className = 'status-value running';
            portElement.textContent = status.data.port || '-';
            pidElement.textContent = status.data.pid || '-';
            urlElement.textContent = status.data.url || '-';
        } else {
            statusElement.textContent = '已停止';
            statusElement.className = 'status-value stopped';
            portElement.textContent = '-';
            pidElement.textContent = '-';
            urlElement.textContent = '-';
        }
    } catch (error) {
        // 服务器可能未启动，显示默认状态
        document.getElementById('jupyter-status').textContent = '未知';
        document.getElementById('jupyter-status').className = 'status-value';
    }
}

// 启动 Jupyter
async function startJupyter() {
    try {
        log('正在启动 Jupyter Notebook...', 'info');
        const result = await apiCall('/api/start', {
            method: 'POST',
            body: JSON.stringify(currentConfig)
        });

        if (result.success) {
            log('✅ Jupyter Notebook 启动成功', 'success');
            log(`📍 访问地址: ${result.url || 'http://localhost:8888'}`, 'info');
            // 刷新状态
            setTimeout(refreshStatus, 1000);
        } else {
            log(`❌ 启动失败: ${result.message}`, 'error');
        }
    } catch (error) {
        log(`❌ 启动失败: ${error.message}`, 'error');
    }
}

// 停止 Jupyter
async function stopJupyter() {
    try {
        log('正在停止 Jupyter Notebook...', 'info');
        const result = await apiCall('/api/stop', {
            method: 'POST'
        });

        if (result.success) {
            log('✅ Jupyter Notebook 已停止', 'success');
            // 刷新状态
            setTimeout(refreshStatus, 1000);
        } else {
            log(`❌ 停止失败: ${result.message}`, 'error');
        }
    } catch (error) {
        log(`❌ 停止失败: ${error.message}`, 'error');
    }
}

// 重启 Jupyter
async function restartJupyter() {
    try {
        log('正在重启 Jupyter Notebook...', 'info');
        const result = await apiCall('/api/restart', {
            method: 'POST',
            body: JSON.stringify(currentConfig)
        });

        if (result.success) {
            log('✅ Jupyter Notebook 重启成功', 'success');
            log(`📍 访问地址: ${result.url || 'http://localhost:8888'}`, 'info');
            // 刷新状态
            setTimeout(refreshStatus, 1000);
        } else {
            log(`❌ 重启失败: ${result.message}`, 'error');
        }
    } catch (error) {
        log(`❌ 重启失败: ${error.message}`, 'error');
    }
}

// 打开浏览器
function openBrowser() {
    const url = document.getElementById('jupyter-url').textContent;
    if (url && url !== '-') {
        log(`🌐 正在打开浏览器: ${url}`, 'info');
        // 在 Electron 中，可以使用 shell.openExternal
        if (typeof require !== 'undefined') {
            const { shell } = require('electron');
            shell.openExternal(url);
        } else {
            window.open(url, '_blank');
        }
    } else {
        log('❌ 请先启动 Jupyter Notebook', 'error');
    }
}

// 测试 Python 环境
async function testPythonEnvironment() {
    try {
        log('正在测试 Python 环境...', 'info');
        const result = await apiCall('/api/detect_python');

        if (result.success && result.data.length > 0) {
            log('✅ 找到以下 Python 环境:', 'success');
            result.data.forEach((python, index) => {
                log(`  ${index + 1}. ${python.path} (版本: ${python.version || '未知'})`, 'info');
            });
        } else {
            log('❌ 未找到可用的 Python 环境', 'error');
        }
    } catch (error) {
        log(`❌ 环境检测失败: ${error.message}`, 'error');
    }
}

// 浏览文件夹
function browseFolder() {
    log('正在选择文件夹...', 'info');
    const folderInput = document.getElementById('folder-input');
    folderInput.click();

    folderInput.onchange = function(e) {
        if (e.target.files && e.target.files.length > 0) {
            // 获取第一个文件夹（在 Web API 中，这个文件实际上是文件夹中的第一个文件）
            const firstFile = e.target.files[0];
            if (firstFile && firstFile.webkitRelativePath) {
                const folderPath = firstFile.webkitRelativePath.split('/')[0];
                document.getElementById('project-path').value = folderPath;
                log(`📁 已选择文件夹: ${folderPath}`, 'success');
            }
        }
    };
}

// 确认项目路径
async function confirmProjectPath() {
    const projectPath = document.getElementById('project-path').value;
    if (!projectPath) {
        log('❌ 请先选择项目目录', 'error');
        return;
    }

    try {
        // 保存配置
        currentConfig.project_dir = projectPath;
        const result = await apiCall('/api/save_config', {
            method: 'POST',
            body: JSON.stringify(currentConfig)
        });

        if (result.success) {
            log('✅ 项目路径已保存', 'success');
        } else {
            log(`❌ 保存失败: ${result.message}`, 'error');
        }
    } catch (error) {
        log(`❌ 保存失败: ${error.message}`, 'error');
    }
}

// 保存当前配置
async function saveCurrentConfig() {
    try {
        const pythonPath = document.getElementById('config-python-path').value;
        const port = document.getElementById('config-port').value;

        if (!pythonPath) {
            log('❌ 请输入 Python 解释器路径', 'error');
            return;
        }

        const config = {
            python_executable: pythonPath,
            jupyter_port: parseInt(port) || 8888
        };

        log('正在保存配置...', 'info');
        const result = await apiCall('/api/save_config', {
            method: 'POST',
            body: JSON.stringify(config)
        });

        if (result.success) {
            log('✅ 配置保存成功', 'success');
            currentConfig = { ...currentConfig, ...config };
        } else {
            log(`❌ 保存失败: ${result.message}`, 'error');
        }
    } catch (error) {
        log(`❌ 保存失败: ${error.message}`, 'error');
    }
}

// 保存 AI 配置
async function saveAIConfig() {
    try {
        const apiKey = document.getElementById('ai-api-key').value;
        const apiEndpoint = document.getElementById('ai-api-endpoint').value;
        const model = document.getElementById('ai-model').value;

        if (!apiKey) {
            log('❌ 请输入 API 密钥', 'error');
            return;
        }

        const aiConfig = {
            ai_api_key: apiKey,
            ai_api_endpoint: apiEndpoint || 'https://api.openai.com/v1/chat/completions',
            ai_model: model || 'gpt-3.5-turbo'
        };

        log('正在保存 AI 配置...', 'info');
        const result = await apiCall('/api/save_config', {
            method: 'POST',
            body: JSON.stringify(aiConfig)
        });

        if (result.success) {
            log('✅ AI 配置保存成功', 'success');
        } else {
            log(`❌ 保存失败: ${result.message}`, 'error');
        }
    } catch (error) {
        log(`❌ 保存失败: ${error.message}`, 'error');
    }
}

// 测试 AI 配置
async function testAIConfig() {
    try {
        const apiKey = document.getElementById('ai-api-key').value;
        if (!apiKey) {
            log('❌ 请先输入 API 密钥', 'error');
            return;
        }

        log('正在测试 AI 连接...', 'info');
        const result = await apiCall('/api/ai/ask', {
            method: 'POST',
            body: JSON.stringify({
                question: '测试连接',
                image: ''
            })
        });

        if (result.success) {
            log('✅ AI 连接测试成功', 'success');
        } else {
            log(`❌ AI 连接失败: ${result.message}`, 'error');
        }
    } catch (error) {
        log(`❌ AI 连接测试失败: ${error.message}`, 'error');
    }
}

// 保存应用配置
async function saveAppConfig() {
    try {
        const defaultProjectDir = document.getElementById('default-project-dir').value;
        const autoStartJupyter = document.getElementById('auto-start-jupyter').checked;
        const autoOpenBrowser = document.getElementById('auto-open-browser').checked;

        const appConfig = {
            default_project_dir: defaultProjectDir,
            auto_start_jupyter: autoStartJupyter,
            auto_open_browser: autoOpenBrowser
        };

        log('正在保存应用配置...', 'info');
        const result = await apiCall('/api/save_config', {
            method: 'POST',
            body: JSON.stringify(appConfig)
        });

        if (result.success) {
            log('✅ 应用配置保存成功', 'success');
        } else {
            log(`❌ 保存失败: ${result.message}`, 'error');
        }
    } catch (error) {
        log(`❌ 保存失败: ${error.message}`, 'error');
    }
}

// 重置配置
async function resetConfig() {
    try {
        if (!confirm('确定要重置所有配置吗？此操作不可恢复。')) {
            return;
        }

        log('正在重置配置...', 'info');
        // 这里可以添加重置配置的逻辑
        // 目前只是清空表单
        document.getElementById('config-python-path').value = '';
        document.getElementById('config-port').value = '8888';
        document.getElementById('ai-api-key').value = '';
        document.getElementById('ai-api-endpoint').value = 'https://api.openai.com/v1/chat/completions';
        document.getElementById('ai-model').value = 'gpt-3.5-turbo';
        document.getElementById('default-project-dir').value = '';
        document.getElementById('auto-start-jupyter').checked = false;
        document.getElementById('auto-open-browser').checked = false;

        log('✅ 配置已重置', 'success');
    } catch (error) {
        log(`❌ 重置失败: ${error.message}`, 'error');
    }
}

// AI 助手相关函数
function startNewChat() {
    log('💬 开始新对话', 'info');
    const chatMessages = document.getElementById('chat-messages');
    chatMessages.innerHTML = `
        <div class="message assistant">
            <div class="message-content">
                👋 开始新的对话！有什么我可以帮助你的吗？
            </div>
        </div>
    `;
}

function handleChatKeydown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendChatMessage();
    }
}

function sendChatMessage() {
    const input = document.getElementById('chat-input');
    const message = input.value.trim();

    if (!message) return;

    // 添加用户消息
    const chatMessages = document.getElementById('chat-messages');
    const userMessage = document.createElement('div');
    userMessage.className = 'message user';
    userMessage.innerHTML = `<div class="message-content">${message}</div>`;
    chatMessages.appendChild(userMessage);

    // 清空输入框
    input.value = '';

    // 模拟 AI 回复
    setTimeout(() => {
        const aiMessage = document.createElement('div');
        aiMessage.className = 'message assistant';
        aiMessage.innerHTML = `<div class="message-content">我收到了你的消息："${message}"。AI 功能正在开发中...</div>`;
        chatMessages.appendChild(aiMessage);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }, 1000);

    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function handleImageUpload(event) {
    const file = event.target.files[0];
    if (file && file.type.startsWith('image/')) {
        log(`📷 已选择图片: ${file.name}`, 'info');
        // 这里可以添加图片预览功能
    } else {
        log('❌ 请选择有效的图片文件', 'error');
    }
}

// 页面加载完成后执行
window.addEventListener('DOMContentLoaded', function() {
    log('✅ Xedu Client 启动完成', 'success');
    log(`🔍 检测运行环境: Electron 桌面应用`, 'info');

    // 设置定时刷新状态
    setInterval(refreshStatus, 2000);

    // 初始刷新状态
    refreshStatus();

    log('💡 提示: 每2秒自动刷新状态', 'info');
    log('🚀 准备就绪，开始使用吧！', 'success');
});

// 监听输入框变化，启用/禁用发送按钮
document.addEventListener('DOMContentLoaded', function() {
    const chatInput = document.getElementById('chat-input');
    const sendBtn = document.getElementById('send-btn');

    if (chatInput && sendBtn) {
        chatInput.addEventListener('input', function() {
            sendBtn.disabled = this.value.trim() === '';
        });
    }
});