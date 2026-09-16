import { ILauncher } from '@jupyterlab/launcher';
import { Panel } from '@lumino/widgets';
import { PageConfig } from '@jupyterlab/coreutils';
import {
  PLACEHOLDER_OUTPUT,
  STUDENT_ERRORS,
  appendDeviceOutput,
  currentPyPath,
  derivePanelState,
  readXsrfToken,
  rememberPyPath,
  statusText,
} from './panel-state';
import '../style/index.css';

const COMMAND_ID = 'xedu-micropython:open-panel';
const PANEL_ID = 'xedu-micropython-panel';
const POLL_INTERVAL_MS = 400;

function apiUrl(path) {
  return `${PageConfig.getBaseUrl()}xedu-micropython/${path}`;
}

function requestHeaders(extra = {}) {
  const headers = { 'Content-Type': 'application/json', ...extra };
  const xsrf = readXsrfToken(typeof document === 'undefined' ? '' : document.cookie);
  if (xsrf) headers['X-XSRFToken'] = xsrf;
  const token = PageConfig.getToken?.() || PageConfig.getOption?.('token') || '';
  if (token) headers.Authorization = `token ${token}`;
  return headers;
}

async function request(path, options = {}) {
  const response = await fetch(apiUrl(path), {
    credentials: 'same-origin',
    ...options,
    headers: requestHeaders(options.headers),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) {
    throw new Error(payload.message || `ESP32 请求失败（${response.status}）`);
  }
  return payload;
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
    this.running = false;
    this.busy = false;
    this.ports = [];
    this.currentFile = currentPyPath(app.shell.currentWidget);
    this.error = '';
    this.busyLabel = '';
    this._onShellChange = (_sender, args) => {
      this.currentFile = rememberPyPath(currentPyPath(args?.newValue), this.currentFile);
      this.syncView();
    };
    app.shell.currentChanged?.connect(this._onShellChange);
    this.renderContent();
  }

  renderContent() {
    this.node.innerHTML = `
      <div class="xedu-micropython-content">
        <div class="xedu-micropython-eyebrow">XEDU HARDWARE LAB</div>
        <h2>ESP32 MicroPython</h2>
        <p class="xedu-micropython-lead">在 JupyterLab 中编写 .py 文件，连接开发板后运行到 ESP32，并在下方观察真实串口输出。</p>
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
        <div class="xedu-micropython-hint">提示：设备需要预先刷入 MicroPython 固件。面板会记住当前打开的 .py 文件，即使焦点已移到这里。</div>
      </div>`;
    this.bindActions();
    this.syncView();
  }

  bindActions() {
    this.node.querySelectorAll('[data-action]').forEach((button) => {
      button.addEventListener('click', () => this.handleAction(button.dataset.action));
    });
    this.node.querySelector('[data-role="input"]').addEventListener('keydown', (event) => {
      if (event.key === 'Enter') this.handleAction('send');
    });
    this.node.querySelector('[data-role="port"]').addEventListener('change', () => this.syncView());
  }

  selectedPort() {
    return this.node.querySelector('[data-role="port"]')?.value || '';
  }

  async handleAction(action) {
    try {
      if (action === 'refresh') return await this.refreshPorts();
      if (action === 'connect') return await this.connect();
      if (action === 'disconnect') return await this.disconnect();
      if (action === 'run') return await this.run();
      if (action === 'interrupt') return await this.interrupt();
      if (action === 'reset') return await this.reset();
      if (action === 'send') return await this.sendInput();
    } catch (error) {
      this.setError(error.message);
    }
  }

  async withBusy(label, work) {
    this.busy = true;
    this.busyLabel = label;
    this.error = '';
    this.syncView();
    try {
      return await work();
    } finally {
      this.busy = false;
      this.busyLabel = '';
      this.syncView();
    }
  }

  async refreshPorts() {
    const payload = await this.withBusy('正在查找串口…', () => request('ports'));
    this.ports = payload.ports || [];
    const select = this.node.querySelector('[data-role="port"]');
    const selected = select.value;
    select.innerHTML = '<option value="">请选择 ESP32 串口</option>';
    this.ports.forEach((port) => {
      const option = document.createElement('option');
      option.value = port.device;
      option.textContent = `${port.device} · ${port.description}`;
      select.append(option);
    });
    if (this.ports.some((port) => port.device === selected)) select.value = selected;
    else if (this.ports.length === 1) select.value = this.ports[0].device;
    this.error = '';
    this.syncView();
  }

  async connect() {
    const port = this.selectedPort();
    if (!port) throw new Error(STUDENT_ERRORS.noPortSelected);
    await this.withBusy('正在连接开发板…', () =>
      request('connect', { method: 'POST', body: JSON.stringify({ port }) }),
    );
    this.connected = true;
    this.running = false;
    this.cursor = 0;
    this.error = '';
    const output = this.node.querySelector('[data-role="output"]');
    output.textContent = PLACEHOLDER_OUTPUT;
    this.startPolling();
    this.syncView();
  }

  async disconnect() {
    await this.withBusy('正在断开连接…', () => request('disconnect', { method: 'POST', body: '{}' }));
    this.stopPolling();
    this.connected = false;
    this.running = false;
    this.error = '';
    this.syncView();
  }

  async run() {
    if (!this.connected) throw new Error(STUDENT_ERRORS.notConnected);
    const file = this.currentFile || currentPyPath(this.app.shell.currentWidget);
    if (!file) throw new Error(STUDENT_ERRORS.noFile);
    this.currentFile = file;
    await this.withBusy(`正在发送 ${file}…`, () =>
      request('run', { method: 'POST', body: JSON.stringify({ file }) }),
    );
    this.running = true;
    this.error = '';
    this.startPolling();
    this.syncView();
  }

  async interrupt() {
    if (!this.connected) throw new Error(STUDENT_ERRORS.notConnected);
    await this.withBusy('正在停止运行…', () => request('interrupt', { method: 'POST', body: '{}' }));
    this.running = false;
    this.error = '';
    this.syncView();
  }

  async reset() {
    if (!this.connected) throw new Error(STUDENT_ERRORS.notConnected);
    await this.withBusy('正在重启设备…', () => request('reset', { method: 'POST', body: '{}' }));
    this.running = false;
    this.error = '';
    this.syncView();
  }

  async sendInput() {
    const input = this.node.querySelector('[data-role="input"]');
    const text = input.value.trim();
    if (!text) return;
    if (!this.connected) throw new Error(STUDENT_ERRORS.notConnected);
    await request('input', { method: 'POST', body: JSON.stringify({ text }) });
    input.value = '';
  }

  startPolling() {
    if (this.pollTimer) return;
    const poll = async () => {
      try {
        const payload = await request(`output?after=${this.cursor}`);
        this.connected = Boolean(payload.connected);
        this.running = Boolean(payload.running || payload.running_file);
        this.cursor = payload.cursor;
        if (payload.output) {
          const output = this.node.querySelector('[data-role="output"]');
          output.textContent = appendDeviceOutput(output.textContent, payload.output);
          output.scrollTop = output.scrollHeight;
        }
        if (!this.connected) this.stopPolling();
        this.syncView();
      } catch (error) {
        this.setError(error.message);
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

  setError(message) {
    this.error = message;
    this.syncView();
  }

  syncView() {
    const state = derivePanelState({
      connected: this.connected,
      running: this.running,
      busy: this.busy,
      ports: this.ports,
      selectedPort: this.selectedPort(),
      currentFile: this.currentFile,
      error: this.error,
    });
    const status = this.node.querySelector('[data-role="status"]');
    if (status) {
      status.textContent = statusText(state, {
        port: this.selectedPort(),
        file: this.currentFile.split('/').pop(),
        error: this.error,
        busyLabel: this.busyLabel,
      });
      status.classList.toggle('xedu-micropython-error', state.statusKind === 'error');
      status.dataset.kind = state.statusKind;
    }
    const file = this.node.querySelector('[data-role="file"]');
    if (file) {
      file.textContent = `当前文件：${this.currentFile || '未选择 .py 文件'}`;
    }
    this.node.dataset.state = state.statusKind;
    const enabled = {
      refresh: state.canRefresh,
      connect: state.canConnect,
      disconnect: state.canDisconnect,
      run: state.canRun,
      interrupt: state.canInterrupt,
      reset: state.canReset,
      send: state.canSend,
    };
    this.node.querySelectorAll('[data-action]').forEach((button) => {
      const action = button.dataset.action;
      if (action in enabled) button.disabled = !enabled[action];
    });
    const input = this.node.querySelector('[data-role="input"]');
    if (input) input.disabled = !state.canSend;
    const select = this.node.querySelector('[data-role="port"]');
    if (select) select.disabled = this.busy || this.connected;
  }

  dispose() {
    this.stopPolling();
    this.app.shell.currentChanged?.disconnect(this._onShellChange);
    void request('disconnect', { method: 'POST', body: '{}' }).catch(() => {});
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
      if (!panel || panel.isDisposed) {
        panel = new MicroPythonPanel(app);
        app.shell.add(panel, 'right', { rank: 500 });
      }
      panel.currentFile = rememberPyPath(currentPyPath(app.shell.currentWidget), panel.currentFile);
      panel.syncView();
      app.shell.activateById(PANEL_ID);
      void panel.refreshPorts().catch((error) => panel.setError(error.message));
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
export { MicroPythonPanel, requestHeaders };
