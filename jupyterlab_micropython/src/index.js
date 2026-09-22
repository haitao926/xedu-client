import { ILauncher } from '@jupyterlab/launcher';
import { Panel } from '@lumino/widgets';
import { PageConfig } from '@jupyterlab/coreutils';
import { showErrorMessage } from '@jupyterlab/apputils';
import {
  PLACEHOLDER_OUTPUT,
  actionAvailability,
  appendConsoleText,
  panelRequestPath,
  panelRoute,
  pythonPathFromWidget,
  studentErrorMessage,
  xsrfTokenFromCookie,
} from './panel-logic.js';
import '../style/index.css';

const COMMAND_ID = 'xedu-micropython:open-panel';
const PANEL_ID = 'xedu-micropython-panel';
const POLL_INTERVAL_MS = 400;

function apiUrl(path) {
  return `${PageConfig.getBaseUrl()}xedu-micropython/${path}`;
}

async function request(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const token = xsrfTokenFromCookie(typeof document !== 'undefined' ? document.cookie : '');
  if (token) headers['X-XSRFToken'] = token;
  const response = await fetch(apiUrl(path), {
    credentials: 'same-origin',
    ...options,
    headers,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) {
    throw new Error(payload.message || `ESP32 请求失败（${response.status}）`);
  }
  return payload;
}

async function requestRoute(action, { body, query } = {}) {
  const route = panelRoute(action);
  const options = { method: route.method };
  if (route.method !== 'GET') options.body = body ?? '{}';
  return request(panelRequestPath(action, query), options);
}

class MicroPythonPanel extends Panel {
  constructor(app) {
    super();
    this.id = PANEL_ID;
    this.title.label = 'ESP32 实验';
    this.title.caption = 'ESP32 MicroPython 实验';
    this.title.closable = true;
    this.addClass('xedu-micropython-panel');
    this.app = app;
    this.cursor = 0;
    this.pollTimer = null;
    this.connected = false;
    this.activePythonPath = pythonPathFromWidget(app.shell.currentWidget);
    this.activePythonContext = app.shell.currentWidget?.context || null;
    this._shellChanged = (_, args) => {
      const path = pythonPathFromWidget(args?.newValue);
      if (path) this.setActivePythonFile(path, args.newValue?.context || null);
      this.updateActionState();
    };
    app.shell.currentChanged?.connect(this._shellChanged);
    this.renderContent();
  }

  renderContent() {
    this.node.innerHTML = `
      <div class="xedu-micropython-content">
        <div class="xedu-micropython-eyebrow">XEDU HARDWARE LAB</div>
        <h2>ESP32 MicroPython</h2>
        <p class="xedu-micropython-lead">在当前实验中编写代码，连接开发板并观察真实输出。</p>
        <section class="xedu-micropython-section">
          <div class="xedu-micropython-section-title">1. 连接开发板</div>
          <div class="xedu-micropython-row">
            <select class="xedu-micropython-select" data-role="port"><option value="">正在读取串口…</option></select>
            <button class="jp-Button xedu-micropython-button" data-action="refresh">刷新</button>
          </div>
          <div class="xedu-micropython-status" data-role="status">请选择一个 ESP32 串口。</div>
          <div class="xedu-micropython-row xedu-micropython-connect-actions">
            <button class="jp-Button jp-Button-accept xedu-micropython-primary" data-action="connect">连接开发板</button>
            <button class="jp-Button xedu-micropython-button xedu-micropython-primary" data-action="disconnect">断开连接</button>
          </div>
        </section>
        <section class="xedu-micropython-section">
          <div class="xedu-micropython-section-title">2. 编写与运行</div>
          <div class="xedu-micropython-file" data-role="file">当前文件：未选择</div>
          <div class="xedu-micropython-row">
            <button class="jp-Button jp-Button-accept xedu-micropython-primary" data-action="run">运行到 ESP32</button>
            <button class="jp-Button xedu-micropython-button" data-action="interrupt">停止运行</button>
            <button class="jp-Button xedu-micropython-button" data-action="reset">重启设备</button>
          </div>
        </section>
        <section class="xedu-micropython-section xedu-micropython-console-section">
          <div class="xedu-micropython-section-title">3. 设备输出</div>
          <pre class="xedu-micropython-console" data-role="output">${PLACEHOLDER_OUTPUT}</pre>
          <div class="xedu-micropython-row">
            <input class="jp-Input xedu-micropython-input" data-role="input" placeholder="输入 MicroPython 命令，例如 print(1)">
            <button class="jp-Button xedu-micropython-button" data-action="send">发送</button>
          </div>
        </section>
        <div class="xedu-micropython-hint">提示：设备需要预先刷入 MicroPython 固件，并使用 USB 数据线连接。运行前请先打开实验中的 .py 文件。</div>
      </div>`;
    this.bindActions();
    this.updateFileLabel();
    this.updateActionState();
  }

  bindActions() {
    this.node.querySelectorAll('[data-action]').forEach((button) => {
      button.addEventListener('click', () => this.handleAction(button.dataset.action));
    });
    this.node.querySelector('[data-role="input"]').addEventListener('keydown', (event) => {
      if (event.key === 'Enter') this.handleAction('send');
    });
    this.node.querySelector('[data-role="port"]').addEventListener('change', () => this.updateActionState());
  }

  setActivePythonFile(path, context) {
    this.activePythonPath = path || '';
    this.activePythonContext = context || null;
    this.updateFileLabel();
    this.updateActionState();
  }

  async handleAction(action) {
    try {
      if (action === 'refresh') return await this.refreshPorts();
      if (action === 'connect') return await this.connect();
      if (action === 'disconnect') return await this.disconnect();
      if (action === 'run') return await this.run();
      if (action === 'interrupt') {
        await requestRoute('interrupt');
        this.setStatus('已发送停止指令。');
        return;
      }
      if (action === 'reset') {
        await requestRoute('reset');
        this.setStatus('正在重启设备…');
        return;
      }
      if (action === 'send') return await this.sendInput();
    } catch (error) {
      const message = studentErrorMessage(error);
      this.setStatus(message, true);
      void showErrorMessage('ESP32 操作失败', message);
    }
  }

  async refreshPorts() {
    const payload = await requestRoute('refresh');
    const select = this.node.querySelector('[data-role="port"]');
    const selected = select.value;
    select.innerHTML = '<option value="">请选择 ESP32 串口</option>';
    payload.ports.forEach((port) => {
      const option = document.createElement('option');
      option.value = port.device;
      option.textContent = `${port.device} · ${port.description}`;
      select.append(option);
    });
    if (payload.ports.some((port) => port.device === selected)) select.value = selected;
    else if (payload.ports.length === 1) select.value = payload.ports[0].device;
    this.setStatus(payload.ports.length ? '已发现串口，请选择开发板。' : '未发现 ESP32，请检查 USB 数据线和驱动。');
    this.updateActionState();
  }

  async connect() {
    const port = this.node.querySelector('[data-role="port"]').value;
    if (!port) throw new Error('请先选择 ESP32 串口。');
    this.setStatus(`正在连接 ${port}…`);
    await requestRoute('connect', { body: JSON.stringify({ port }) });
    this.connected = true;
    this.cursor = 0;
    const output = this.node.querySelector('[data-role="output"]');
    output.textContent = PLACEHOLDER_OUTPUT;
    this.setStatus(`已连接 ${port}`);
    this.updateActionState();
    this.startPolling();
  }

  async disconnect() {
    await requestRoute('disconnect');
    this.connected = false;
    this.stopPolling();
    this.setStatus('已断开 ESP32。');
    this.updateActionState();
  }

  async run() {
    if (!this.connected) throw new Error('请先连接 ESP32。');
    const file = this.activePythonPath || pythonPathFromWidget(this.app.shell.currentWidget);
    if (!file) throw new Error('请先在 JupyterLab 中打开一个 .py 文件。');
    if (this.activePythonContext?.save && this.activePythonContext.model?.dirty) {
      await this.activePythonContext.save();
    }
    await requestRoute('run', { body: JSON.stringify({ file }) });
    this.setStatus(`正在运行 ${file}`);
    this.updateFileLabel();
    this.updateActionState();
  }

  async sendInput() {
    const input = this.node.querySelector('[data-role="input"]');
    const text = input.value.trim();
    if (!text) return;
    if (!this.connected) throw new Error('请先连接 ESP32。');
    await requestRoute('send', { body: JSON.stringify({ text }) });
    input.value = '';
  }

  updateFileLabel() {
    const file = this.activePythonPath || pythonPathFromWidget(this.app.shell.currentWidget);
    this.node.querySelector('[data-role="file"]').textContent = `当前文件：${file || '未选择 .py 文件'}`;
  }

  updateActionState() {
    const port = this.node.querySelector('[data-role="port"]')?.value;
    const file = this.activePythonPath || pythonPathFromWidget(this.app.shell.currentWidget);
    const enabled = actionAvailability({
      connected: this.connected,
      hasPort: Boolean(port),
      hasFile: Boolean(file),
    });
    this.node.querySelectorAll('[data-action]').forEach((button) => {
      const action = button.dataset.action;
      if (action && Object.prototype.hasOwnProperty.call(enabled, action)) {
        button.disabled = !enabled[action];
      }
    });
    const input = this.node.querySelector('[data-role="input"]');
    if (input) input.disabled = !enabled.send;
  }

  startPolling() {
    if (this.pollTimer) return;
    const poll = async () => {
      try {
        const payload = await requestRoute('poll', { query: `after=${this.cursor}` });
        this.connected = Boolean(payload.connected);
        this.cursor = payload.cursor;
        if (payload.output) {
          const output = this.node.querySelector('[data-role="output"]');
          output.textContent = appendConsoleText(output.textContent, payload.output);
          output.scrollTop = output.scrollHeight;
        }
        if (payload.running_file) {
          this.setStatus(`正在运行 ${payload.running_file}`);
        }
        this.updateActionState();
        if (!payload.connected) this.stopPolling();
      } catch (error) {
        this.setStatus(studentErrorMessage(error), true);
      }
    };
    this.pollTimer = window.setInterval(poll, POLL_INTERVAL_MS);
    void poll();
  }

  stopPolling() {
    if (this.pollTimer) {
      window.clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  setStatus(message, isError = false) {
    const status = this.node.querySelector('[data-role="status"]');
    status.textContent = message;
    status.classList.toggle('xedu-micropython-error', isError);
  }

  dispose() {
    this.stopPolling();
    this.app.shell.currentChanged?.disconnect(this._shellChanged);
    void requestRoute('disconnect').catch(() => {});
    super.dispose();
  }
}

const plugin = {
  id: 'xedu.jupyterlab-micropython',
  autoStart: true,
  optional: [ILauncher],
  activate: (app, launcher) => {
    let panel = null;
    const openPanel = () => {
      const currentPath = pythonPathFromWidget(app.shell.currentWidget);
      const currentContext = app.shell.currentWidget?.context || null;
      if (!panel || panel.isDisposed) {
        panel = new MicroPythonPanel(app);
        app.shell.add(panel, 'right', { rank: 500 });
      }
      if (currentPath) panel.setActivePythonFile(currentPath, currentContext);
      else panel.updateFileLabel();
      app.shell.activateById(PANEL_ID);
      void panel.refreshPorts().catch((error) => panel.setStatus(studentErrorMessage(error), true));
    };
    app.commands.addCommand(COMMAND_ID, {
      label: '打开 ESP32 实验',
      caption: '打开 XEdu ESP32 MicroPython 实验面板',
      execute: openPanel,
    });
    app.commands.addKeyBinding({ command: COMMAND_ID, keys: ['Accel Shift E'], selector: 'body' });
    if (launcher) {
      launcher.add({
        command: COMMAND_ID,
        category: 'XEdu 实验',
        rank: 1,
      });
    }
  },
};

export default plugin;
