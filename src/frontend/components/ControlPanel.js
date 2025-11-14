/**
 * 控制面板组件
 * 提供Jupyter启动、停止等控制功能
 */

import app from '@utils/app.js';
import logger from '@utils/logger.js';
import configManager from '@utils/config.js';
import eventManager, { APP_EVENTS } from '@utils/events.js';

class ControlPanel {
    constructor(containerId = 'control-panel') {
        this.container = document.getElementById(containerId);
        this.elements = {};

        if (!this.container) {
            throw new Error(`Control panel container with id '${containerId}' not found`);
        }

        this.init();
    }

    /**
     * 初始化控制面板
     */
    init() {
        this.render();
        this.bindEvents();
        this.loadConfig();
        logger.debug('控制面板组件已初始化');
    }

    /**
     * 渲染控制面板
     */
    render() {
        this.container.innerHTML = `
            <div class="card">
                <h2>🔴 Jupyter Notebook 控制</h2>

                <div class="btn-group" style="margin-bottom: 20px;">
                    <button id="start-btn" class="btn btn-success" onclick="app.startJupyter()">
                        <span>▶</span> 启动 Notebook
                    </button>
                    <button id="stop-btn" class="btn btn-danger" onclick="app.stopJupyter()">
                        <span>⏹</span> 停止 Notebook
                    </button>
                    <button id="restart-btn" class="btn btn-warning" onclick="app.restartJupyter()">
                        <span>↻</span> 重启 Notebook
                    </button>
                    <button id="open-btn" class="btn btn-info" onclick="app.openBrowser()">
                        <span>🌐</span> 打开浏览器
                    </button>
                </div>

                <div class="control-config">
                    <h3>⚙️ 快速配置</h3>
                    <div class="form-row">
                        <div class="form-group">
                            <label>端口</label>
                            <input type="number" id="quick-port" value="8888" min="1024" max="65535">
                        </div>
                        <div class="form-group">
                            <label>Python路径</label>
                            <input type="text" id="quick-python" placeholder="留空使用默认">
                        </div>
                        <div class="form-group">
                            <label>项目目录</label>
                            <input type="text" id="quick-project" placeholder="留空使用默认">
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>
                                <input type="checkbox" id="quick-notebook"> 使用 Notebook (而不是 Lab)
                            </label>
                        </div>
                        <div class="form-group">
                            <label>
                                <input type="checkbox" id="quick-autostart"> 启动后自动打开浏览器
                            </label>
                        </div>
                    </div>
                    <div class="btn-group">
                        <button class="btn btn-info" onclick="controlPanel.applyQuickConfig()">
                            <span>✓</span> 应用配置
                        </button>
                        <button class="btn btn-secondary" onclick="controlPanel.resetQuickConfig()">
                            <span>↺</span> 重置
                        </button>
                    </div>
                </div>

                <div class="advanced-toggle" style="margin-top: 20px;">
                    <button class="btn btn-secondary" onclick="controlPanel.toggleAdvanced()">
                        <span>⚙</span> 高级选项
                    </button>
                </div>

                <div id="advanced-config" style="display: none; margin-top: 15px;">
                    <div class="form-group">
                        <label>启动参数</label>
                        <input type="text" id="advanced-args" placeholder="例如: --ip=0.0.0.0 --allow-root">
                    </div>
                    <div class="form-group">
                        <label>环境变量</label>
                        <textarea id="advanced-env" rows="3" placeholder="KEY=value&#10;ANOTHER_KEY=value"></textarea>
                    </div>
                    <div class="form-group">
                        <label>
                            <input type="checkbox" id="advanced-debug"> 调试模式
                        </label>
                    </div>
                </div>
            </div>
        `;

        this.cacheElements();
    }

    /**
     * 缓存DOM元素
     */
    cacheElements() {
        this.elements = {
            startBtn: document.getElementById('start-btn'),
            stopBtn: document.getElementById('stop-btn'),
            restartBtn: document.getElementById('restart-btn'),
            openBtn: document.getElementById('open-btn'),
            quickPort: document.getElementById('quick-port'),
            quickPython: document.getElementById('quick-python'),
            quickProject: document.getElementById('quick-project'),
            quickNotebook: document.getElementById('quick-notebook'),
            quickAutostart: document.getElementById('quick-autostart'),
            advancedArgs: document.getElementById('advanced-args'),
            advancedEnv: document.getElementById('advanced-env'),
            advancedDebug: document.getElementById('advanced-debug'),
            advancedConfig: document.getElementById('advanced-config')
        };
    }

    /**
     * 绑定事件
     */
    bindEvents() {
        // 监听Jupyter状态变更来更新按钮状态
        eventManager.on(APP_EVENTS.JUPYTER_STATUS_CHANGED, (status) => {
            this.updateButtonStates(status.running);
        });

        // 监听配置变更
        eventManager.on(APP_EVENTS.CONFIG_CHANGED, (data) => {
            if (data.path.startsWith('jupyter.')) {
                this.loadConfig();
            }
        });

        // 监听Jupyter启动过程
        eventManager.on(APP_EVENTS.JUPYTER_REQUEST, (data) => {
            this.showButtonLoading(data.action);
        });
    }

    /**
     * 加载配置到表单
     */
    loadConfig() {
        if (!this.elements.quickPort) return;

        this.elements.quickPort.value = configManager.get('jupyter.port') || 8888;
        this.elements.quickPython.value = configManager.get('jupyter.pythonExecutable') || '';
        this.elements.quickProject.value = configManager.get('jupyter.projectDir') || '';
        this.elements.quickNotebook.checked = configManager.get('jupyter.useNotebook') || false;
        this.elements.quickAutostart.checked = configManager.get('ui.autoOpenBrowser') !== false;

        // 高级选项
        if (this.elements.advancedArgs) {
            this.elements.advancedArgs.value = configManager.get('jupyter.args') || '';
        }
        if (this.elements.advancedEnv) {
            this.elements.advancedEnv.value = configManager.get('jupyter.env') || '';
        }
        if (this.elements.advancedDebug) {
            this.elements.advancedDebug.checked = configManager.get('jupyter.debug') || false;
        }
    }

    /**
     * 应用快速配置
     */
    applyQuickConfig() {
        const config = {
            port: parseInt(this.elements.quickPort.value) || 8888,
            pythonExecutable: this.elements.quickPython.value.trim(),
            projectDir: this.elements.quickProject.value.trim(),
            useNotebook: this.elements.quickNotebook.checked,
            autoOpenBrowser: this.elements.quickAutostart.checked
        };

        // 验证端口
        if (config.port < 1024 || config.port > 65535) {
            logger.error('端口号必须在 1024-65535 之间');
            return;
        }

        // 验证Python路径
        if (config.pythonExecutable && !this.validatePythonPath(config.pythonExecutable)) {
            logger.error('Python解释器路径无效');
            return;
        }

        // 验证项目目录
        if (config.projectDir && !this.validateProjectDir(config.projectDir)) {
            logger.error('项目目录路径无效');
            return;
        }

        // 保存配置
        configManager.setMultiple({
            'jupyter.port': config.port,
            'jupyter.pythonExecutable': config.pythonExecutable,
            'jupyter.projectDir': config.projectDir,
            'jupyter.useNotebook': config.useNotebook,
            'ui.autoOpenBrowser': config.autoOpenBrowser
        });

        configManager.save();

        logger.success('✅ 配置已应用并保存');
        this.showNotification('配置已保存，下次启动时生效');
    }

    /**
     * 重置快速配置
     */
    resetQuickConfig() {
        configManager.reset('jupyter.port');
        configManager.reset('jupyter.pythonExecutable');
        configManager.reset('jupyter.projectDir');
        configManager.reset('jupyter.useNotebook');
        configManager.reset('ui.autoOpenBrowser');

        this.loadConfig();
        logger.info('配置已重置为默认值');
        this.showNotification('配置已重置');
    }

    /**
     * 切换高级选项显示
     */
    toggleAdvanced() {
        const advanced = this.elements.advancedConfig;
        if (advanced.style.display === 'none') {
            advanced.style.display = 'block';
            this.loadAdvancedConfig();
        } else {
            advanced.style.display = 'none';
        }
    }

    /**
     * 加载高级配置
     */
    loadAdvancedConfig() {
        if (this.elements.advancedArgs) {
            this.elements.advancedArgs.value = configManager.get('jupyter.args') || '';
        }
        if (this.elements.advancedEnv) {
            this.elements.advancedEnv.value = configManager.get('jupyter.env') || '';
        }
        if (this.elements.advancedDebug) {
            this.elements.advancedDebug.checked = configManager.get('jupyter.debug') || false;
        }
    }

    /**
     * 验证Python路径
     */
    validatePythonPath(path) {
        // 基本的路径格式验证
        if (!path || path.trim().length === 0) {
            return true; // 空值表示使用默认
        }

        // 检查是否是可执行文件
        const validExtensions = ['.exe', ''];
        const hasValidExtension = validExtensions.some(ext =>
            path.toLowerCase().endsWith(ext)
        );

        return hasValidExtension && path.length > 3;
    }

    /**
     * 验证项目目录
     */
    validateProjectDir(path) {
        if (!path || path.trim().length === 0) {
            return true; // 空值表示使用默认
        }

        // 基本的路径格式验证
        return path.length > 2 && (path.includes(':') || path.startsWith('/'));
    }

    /**
     * 更新按钮状态
     */
    updateButtonStates(running) {
        const buttons = {
            startBtn: !running,
            stopBtn: running,
            restartBtn: running,
            openBtn: running
        };

        Object.entries(buttons).forEach(([elementKey, enabled]) => {
            const element = this.elements[elementKey];
            if (element) {
                element.disabled = !enabled;
                element.style.opacity = enabled ? '1' : '0.5';
            }
        });
    }

    /**
     * 显示按钮加载状态
     */
    showButtonLoading(action) {
        const buttonMap = {
            'start': this.elements.startBtn,
            'stop': this.elements.stopBtn,
            'restart': this.elements.restartBtn
        };

        const loadingTexts = {
            'start': '<span>⏳</span> 启动中...',
            'stop': '<span>⏳</span> 停止中...',
            'restart': '<span>⏳</span> 重启中...'
        };

        const normalTexts = {
            'start': '<span>▶</span> 启动 Notebook',
            'stop': '<span>⏹</span> 停止 Notebook',
            'restart': '<span>↻</span> 重启 Notebook'
        };

        const button = buttonMap[action];
        if (button) {
            button.innerHTML = loadingTexts[action];
            button.disabled = true;

            // 3秒后恢复按钮状态（防止卡住）
            setTimeout(() => {
                button.innerHTML = normalTexts[action];
                button.disabled = false;
            }, 3000);
        }
    }

    /**
     * 显示通知
     */
    showNotification(message) {
        logger.info(`📋 ${message}`);
    }

    /**
     * 获取当前配置
     */
    getCurrentConfig() {
        return {
            port: parseInt(this.elements.quickPort?.value) || 8888,
            pythonExecutable: this.elements.quickPython?.value?.trim() || '',
            projectDir: this.elements.quickProject?.value?.trim() || '',
            useNotebook: this.elements.quickNotebook?.checked || false,
            autoOpenBrowser: this.elements.quickAutostart?.checked !== false
        };
    }

    /**
     * 销毁组件
     */
    destroy() {
        // 清理事件监听器
        eventManager.off(APP_EVENTS.JUPYTER_STATUS_CHANGED);
        eventManager.off(APP_EVENTS.CONFIG_CHANGED);
        eventManager.off(APP_EVENTS.JUPYTER_REQUEST);

        // 清理DOM
        if (this.container) {
            this.container.innerHTML = '';
        }

        logger.debug('控制面板组件已销毁');
    }
}

// 导出
export default ControlPanel;