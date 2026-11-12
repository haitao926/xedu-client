import { ILauncher } from '@jupyterlab/launcher';
import { Panel } from '@lumino/widgets';
import { PageConfig } from '@jupyterlab/coreutils';
import { showErrorMessage } from '@jupyterlab/apputils';
import {
  MICROPYTHON_ICON_NAME,
  MICROPYTHON_ICON_SVG,
  PLACEHOLDER_OUTPUT,
  STARTER_MAIN_PY,
  actionAvailability,
  appendConsoleText,
  canReuseMicroPythonPanel,
  clampOutputHeight,
  DEFAULT_OUTPUT_HEIGHT,
  completionItemsForPrefix,
  completionPrefix,
  insertCompletion,
  panelRequestPath,
  panelRoute,
  highlightPython,
  highlightDisplaySource,
  preferredPythonFile,
  projectDirectoryFromLabPath,
  projectFilePath,
  pythonPathFromWidget,
  pythonProjectFiles,
  shouldAutoOpenCodeMode,
  studentErrorMessage,
  xsrfTokenFromCookie,
} from './panel-logic.js';
import '../style/index.css';

const COMMAND_ID = 'xedu-micropython:open-panel';
const PANEL_ID = 'xedu-micropython-panel';
const POLL_INTERVAL_MS = 400;

const microPythonIcon = {
  name: MICROPYTHON_ICON_NAME,
  svgstr: MICROPYTHON_ICON_SVG,
};

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
    this.title.label = 'MicroPython 代码模式';
    this.title.caption = 'ESP32 MicroPython 代码模式';
    this.title.closable = true;
    this.addClass('xedu-micropython-panel');
    this.app = app;
    this.cursor = 0;
    this.pollTimer = null;
    this.connected = false;
    this.dirty = false;
    const hinted = projectDirectoryFromLabPath(
      typeof window !== 'undefined' ? window.location.pathname : '',
    );
    this.projectDirectory = hinted.directory;
    this.activePythonPath = hinted.filePath || pythonPathFromWidget(app.shell.currentWidget);
    this.activePythonContext = app.shell.currentWidget?.context || null;
    this._shellChanged = (_, args) => {
      const path = pythonPathFromWidget(args?.newValue);
      if (path && !this.activePythonPath) {
        this.activePythonPath = path;
        this.activePythonContext = args.newValue?.context || null;
        void this.loadFile(path);
      }
      this.updateActionState();
    };
    app.shell.currentChanged?.connect(this._shellChanged);
    this.renderContent();
  }

  renderContent() {
    this.node.innerHTML = `
      <div class="xedu-mp-shell">
        <header class="xedu-mp-toolbar">
          <div class="xedu-mp-brand">MicroPython</div>
          <select class="xedu-micropython-select" data-role="port" aria-label="开发板串口"><option value="">正在读取串口…</option></select>
          <button type="button" class="jp-Button xedu-micropython-button" data-action="refresh">刷新</button>
          <button type="button" class="jp-Button jp-Button-accept xedu-micropython-primary" data-action="connect">连接设备</button>
          <button type="button" class="jp-Button xedu-micropython-button" data-action="disconnect">断开</button>
          <div class="xedu-micropython-status" data-role="status">请选择开发板串口。</div>
          <div class="xedu-mp-toolbar-spacer"></div>
          <button type="button" class="jp-Button xedu-micropython-button" data-action="save">保存</button>
          <button type="button" class="jp-Button jp-Button-accept xedu-micropython-primary" data-action="run">运行</button>
          <button type="button" class="jp-Button xedu-micropython-button" data-action="interrupt">停止</button>
          <button type="button" class="jp-Button xedu-micropython-button" data-action="upload">上传</button>
          <button type="button" class="jp-Button xedu-micropython-button" data-action="reset">重启</button>
        </header>
        <div class="xedu-mp-body">
          <aside class="xedu-mp-files">
            <div class="xedu-mp-files-title">项目文件</div>
            <div class="xedu-mp-file-list" data-role="files"></div>
            <button type="button" class="jp-Button xedu-micropython-button xedu-mp-open-project" data-action="open-project">打开项目</button>
          </aside>
          <section class="xedu-mp-editor-pane">
            <div class="xedu-mp-editor-tab" data-role="file">main.py</div>
            <div class="xedu-mp-editor-scroll">
              <div class="xedu-mp-editor" data-role="editor" contenteditable="true" spellcheck="false" autocorrect="off" autocapitalize="off" role="textbox" aria-multiline="true" aria-label="MicroPython 代码"></div>
              <div class="xedu-mp-completions" data-role="completions" role="listbox" aria-label="代码补全" hidden></div>
            </div>
          </section>
        </div>
        <div class="xedu-mp-splitter" data-role="output-splitter" role="separator" aria-orientation="horizontal" aria-label="调整输出高度" tabindex="0"></div>
        <footer class="xedu-mp-output">
          <div class="xedu-mp-output-title">输出</div>
          <pre class="xedu-micropython-console" data-role="output">${PLACEHOLDER_OUTPUT}</pre>
          <div class="xedu-mp-repl">
            <input class="jp-Input xedu-micropython-input" data-role="input" placeholder="输入 MicroPython 命令，例如 print(1)" aria-label="REPL 命令">
            <button type="button" class="jp-Button xedu-micropython-button" data-action="send">发送</button>
          </div>
        </footer>
      </div>`;
    this.editor = this.node.querySelector('[data-role="editor"]');
    this.completionList = this.node.querySelector('[data-role="completions"]');
    this.bindActions();
    this.updateFileLabel();
    this.updateActionState();
    this.filesReady = this.bootstrapFiles();
  }

  bindActions() {
    this.node.querySelectorAll('[data-action]').forEach((button) => {
      button.addEventListener('click', () => this.handleAction(button.dataset.action));
    });
    this.node.querySelector('[data-role="input"]').addEventListener('keydown', (event) => {
      if (event.key === 'Enter') this.handleAction('send');
    });
    this.node.querySelector('[data-role="port"]').addEventListener('change', () => this.updateActionState());
    this.editor.addEventListener('input', () => {
      this.dirty = true;
      this.renderHighlight();
      this.updateFileLabel();
      this.showCompletions(false);
    });
    this.editor.addEventListener('scroll', () => this.positionCompletions());
    this.editor.addEventListener('paste', (event) => {
      event.preventDefault();
      this.insertTextAtCursor(event.clipboardData?.getData('text/plain') || '');
    });
    this.bindOutputResize();
    this.editor.addEventListener('keydown', (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void this.handleAction('save');
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.code === 'Space') {
        event.preventDefault();
        this.showCompletions(true);
        return;
      }
      if (event.key === 'Escape') this.hideCompletions();
      if (event.key === 'ArrowDown' && !this.completionList.hidden) {
        event.preventDefault();
        this.selectCompletion(1);
        return;
      }
      if (event.key === 'ArrowUp' && !this.completionList.hidden) {
        event.preventDefault();
        this.selectCompletion(-1);
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        this.insertTextAtCursor(`\n${this.currentIndent()}`);
        this.showCompletions(false);
        return;
      }
      if (event.key === 'Tab') {
        event.preventDefault();
        if (!this.completionList.hidden) this.applyCompletion();
        else this.insertTextAtCursor('    ');
        return;
      }
      const pairs = { '(': ')', '[': ']', '{': '}', '"': '"', "'": "'" };
      if (pairs[event.key] && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault();
        this.insertTextAtCursor(event.key + pairs[event.key], 1);
      }
    });
  }

  bindEditorResize() {
    const sync = () => this.syncHighlightScroll();
    if (typeof ResizeObserver !== 'undefined') {
      this.editorResizeObserver = new ResizeObserver(sync);
      this.editorResizeObserver.observe(this.editor);
    } else if (typeof window !== 'undefined') {
      this.editorResizeListener = sync;
      window.addEventListener('resize', sync);
    }
  }

  bindOutputResize() {
    const splitter = this.node.querySelector('[data-role="output-splitter"]');
    const shell = this.node.querySelector('.xedu-mp-shell');
    if (!splitter || !shell) return;
    shell.style.setProperty('--xedu-mp-output-height', `${DEFAULT_OUTPUT_HEIGHT}px`);
    const applyHeight = (height) => {
      const next = clampOutputHeight(height, shell.getBoundingClientRect().height);
      shell.style.setProperty('--xedu-mp-output-height', `${next}px`);
      splitter.setAttribute('aria-valuenow', String(next));
    };
    const currentHeight = () => {
      const raw = getComputedStyle(shell).getPropertyValue('--xedu-mp-output-height');
      return Number.parseFloat(raw) || DEFAULT_OUTPUT_HEIGHT;
    };
    let drag = null;
    const stopDrag = () => {
      drag = null;
      splitter.classList.remove('is-dragging');
    };
    splitter.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      drag = { y: event.clientY, height: currentHeight() };
      splitter.classList.add('is-dragging');
      splitter.setPointerCapture?.(event.pointerId);
      event.preventDefault();
    });
    splitter.addEventListener('pointermove', (event) => {
      if (!drag) return;
      applyHeight(drag.height + (drag.y - event.clientY));
    });
    splitter.addEventListener('pointerup', stopDrag);
    splitter.addEventListener('pointercancel', stopDrag);
    splitter.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
      event.preventDefault();
      const step = event.shiftKey ? 48 : 24;
      applyHeight(currentHeight() + (event.key === 'ArrowUp' ? step : -step));
    });
    applyHeight(DEFAULT_OUTPUT_HEIGHT);
  }

  codeText() {
    return (this.editor?.textContent ?? this.editor?.value ?? '').replace(/\u200b$/, '').replace(/\r/g, '');
  }

  setCodeText(value) {
    if (this.editor) this.editor.textContent = value ?? '';
    this.renderHighlight();
  }

  renderHighlight() {
    if (!this.editor) return;
    const source = this.codeText();
    const cursor = this.cursorOffset();
    this.editor.innerHTML = highlightPython(highlightDisplaySource(source));
    this.setCursorOffset(Math.min(cursor, source.length));
    this.positionCompletions();
  }

  cursorOffset() {
    const selection = window.getSelection();
    if (!selection?.rangeCount || !this.editor.contains(selection.anchorNode)) return this.codeText().length;
    const range = document.createRange();
    range.selectNodeContents(this.editor);
    range.setEnd(selection.anchorNode, selection.anchorOffset);
    return range.toString().length;
  }

  setCursorOffset(offset) {
    const walker = document.createTreeWalker(this.editor, NodeFilter.SHOW_TEXT);
    let remaining = offset;
    let node = null;
    while ((node = walker.nextNode())) {
      if (remaining <= node.textContent.length) break;
      remaining -= node.textContent.length;
    }
    const range = document.createRange();
    if (node) range.setStart(node, Math.min(remaining, node.textContent.length));
    else {
      range.selectNodeContents(this.editor);
      range.collapse(false);
    }
    range.collapse(true);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  }

  insertTextAtCursor(text, cursorDelta = text.length) {
    const source = this.codeText();
    const offset = this.cursorOffset();
    const value = `${source.slice(0, offset)}${text}${source.slice(offset)}`;
    this.editor.textContent = value;
    this.dirty = true;
    this.renderHighlight();
    this.setCursorOffset(offset + cursorDelta);
    this.updateFileLabel();
  }

  currentIndent() {
    const beforeCursor = this.codeText().slice(0, this.cursorOffset());
    const line = beforeCursor.split('\n').pop() || '';
    const indent = line.match(/^\s*/)?.[0] || '';
    return /:\s*$/.test(line) ? `${indent}    ` : indent;
  }

  showCompletions(force) {
    const source = this.codeText();
    const cursor = this.cursorOffset();
    const prefix = completionPrefix(source, cursor);
    if (!force && prefix.length < 1) return this.hideCompletions();
    const items = completionItemsForPrefix(source, cursor, { allowEmpty: force });
    if (!items.length) return this.hideCompletions();
    this.completionList.replaceChildren(...items.map((item, index) => {
      const option = document.createElement('button');
      option.type = 'button';
      option.className = 'xedu-mp-completion';
      option.setAttribute('role', 'option');
      option.setAttribute('aria-selected', String(index === 0));
      option.textContent = item;
      option.addEventListener('mousedown', (event) => event.preventDefault());
      option.addEventListener('click', () => this.applyCompletion(item));
      return option;
    }));
    this.completionIndex = 0;
    this.completionList.hidden = false;
    this.positionCompletions();
  }

  selectCompletion(direction) {
    const options = [...this.completionList.querySelectorAll('[role="option"]')];
    if (!options.length) return;
    this.completionIndex = (this.completionIndex + direction + options.length) % options.length;
    options.forEach((option, index) => option.setAttribute('aria-selected', String(index === this.completionIndex)));
  }

  applyCompletion(value) {
    const option = value || this.completionList.querySelector('[aria-selected="true"]')?.textContent;
    if (!option) return this.hideCompletions();
    const result = insertCompletion(this.codeText(), this.cursorOffset(), option);
    this.editor.textContent = result.value;
    this.dirty = true;
    this.renderHighlight();
    this.setCursorOffset(result.cursor);
    this.updateFileLabel();
    this.hideCompletions();
  }

  hideCompletions() {
    if (this.completionList) this.completionList.hidden = true;
  }

  positionCompletions() {
    if (!this.completionList || this.completionList.hidden) return;
    const selection = window.getSelection();
    if (!selection?.rangeCount) return;
    const rect = selection.getRangeAt(0).getBoundingClientRect();
    const container = this.editor.getBoundingClientRect();
    this.completionList.style.left = `${Math.max(0, rect.left - container.left)}px`;
    this.completionList.style.top = `${Math.max(0, rect.bottom - container.top)}px`;
  }

  async handleAction(action) {
    try {
      if (action === 'refresh') return await this.refreshPorts();
      if (action === 'connect') return await this.connect();
      if (action === 'disconnect') return await this.disconnect();
      if (action === 'save') return await this.save();
      if (action === 'run') return await this.run();
      if (action === 'upload') return await this.upload();
      if (action === 'open-project') return await this.openProject();
      if (action === 'interrupt') {
        await requestRoute('interrupt');
        this.setStatus('已发送停止指令。');
        return;
      }
      if (action === 'reset') {
        this.setStatus('正在重启设备…');
        await requestRoute('reset');
        this.cursor = 0;
        this.setStatus('设备已重启，等待 MicroPython 输出。');
        this.startPolling();
        return;
      }
      if (action === 'send') return await this.sendInput();
    } catch (error) {
      const message = studentErrorMessage(error);
      this.setStatus(message, true);
      void showErrorMessage('ESP32 操作失败', message);
    }
  }

  async bootstrapFiles() {
    this.fileLoadError = null;
    try {
      await this.app.serviceManager?.ready;
      await this.refreshFiles();
      const files = this.currentFiles || [];
      const preferred = preferredPythonFile(files, this.activePythonPath);
      if (preferred) {
        await this.loadFile(preferred);
        return;
      }
      this.activePythonPath = projectFilePath(this.projectDirectory, 'main.py');
      this.setCodeText(STARTER_MAIN_PY);
      this.dirty = true;
      this.updateFileLabel();
      this.updateActionState();
      this.setStatus('还没有 main.py，保存后会在当前实验中创建它。');
    } catch (error) {
      this.fileLoadError = error;
      this.setStatus(studentErrorMessage(error), true);
    }
  }

  async refreshFiles() {
    const directory = this.projectDirectory || '';
    const model = await this.app.serviceManager.contents.get(directory, { content: true });
    const files = pythonProjectFiles(model?.content || []);
    this.currentFiles = files;
    const list = this.node.querySelector('[data-role="files"]');
    list.replaceChildren();
    if (!files.length) {
      const empty = document.createElement('div');
      empty.className = 'xedu-mp-file-empty';
      empty.textContent = '当前目录还没有 .py 文件';
      list.append(empty);
    }
    files.forEach((file) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'xedu-mp-file';
      button.textContent = file.name;
      button.title = file.path;
      if (file.path === this.activePythonPath) button.classList.add('is-active');
      button.addEventListener('click', () => {
        void this.openListedFile(file.path);
      });
      list.append(button);
    });
    this.updateFileLabel();
  }

  async openListedFile(path) {
    if (this.dirty && this.activePythonPath && this.activePythonPath !== path) {
      await this.save();
    }
    await this.loadFile(path);
  }

  async loadFile(path) {
    const model = await this.app.serviceManager.contents.get(path, { content: true });
    this.activePythonPath = path;
    this.setCodeText(typeof model?.content === 'string' ? model.content : '');
    this.dirty = false;
    this.updateFileLabel();
    this.updateActionState();
    await this.refreshFiles().catch(() => {});
  }

  async openProject() {
    const target = projectFilePath(this.projectDirectory, 'main.py');
    const existing = (this.currentFiles || []).find((file) => file.path === target || file.name === 'main.py');
    if (existing) {
      await this.loadFile(existing.path);
      return;
    }
    this.activePythonPath = target;
    if (!this.codeText().trim()) this.setCodeText(STARTER_MAIN_PY);
    this.dirty = true;
    this.updateFileLabel();
    this.updateActionState();
    this.setStatus('准备保存 main.py。');
  }

  async save() {
    await this.filesReady;
    if (this.fileLoadError) throw new Error('MicroPython 项目加载失败，尚未保存或提交。请重新打开实验。');
    const file = this.activePythonPath || projectFilePath(this.projectDirectory, 'main.py');
    const content = this.codeText();
    this.activePythonPath = file;
    await this.app.serviceManager.contents.save(file, {
      type: 'file',
      format: 'text',
      content,
    });
    if (this.activePythonPath === file && this.codeText() === content) this.dirty = false;
    this.updateFileLabel();
    this.updateActionState();
    await this.refreshFiles().catch(() => {});
    this.setStatus(`已保存 ${file}`);
    return {
      bytes: Array.from(new TextEncoder().encode(content)),
      filename: file.split(/[\\/]/).pop() || 'main.py',
      mime: 'text/plain',
    };
  }

  async exportForSubmission() {
    return this.save();
  }

  async refreshPorts() {
    const payload = await requestRoute('refresh');
    const select = this.node.querySelector('[data-role="port"]');
    const selected = select.value;
    select.innerHTML = '<option value="">请选择开发板串口</option>';
    payload.ports.forEach((port) => {
      const option = document.createElement('option');
      option.value = port.device;
      option.textContent = `${port.device} · ${port.description}`;
      select.append(option);
    });
    if (payload.ports.some((port) => port.device === selected)) select.value = selected;
    else if (payload.ports.length === 1) select.value = payload.ports[0].device;
    this.setStatus(payload.ports.length ? '已发现串口，请连接开发板。' : '未发现 ESP32，请检查 USB 数据线和驱动。');
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
    await this.save();
    const file = this.activePythonPath;
    if (!file) throw new Error('请先打开一个 .py 文件。');
    await requestRoute('run', { body: JSON.stringify({ file }) });
    this.setStatus(`正在运行 ${file}`);
    this.updateActionState();
  }

  async upload() {
    if (!this.connected) throw new Error('请先连接 ESP32。');
    await this.save();
    const file = this.activePythonPath;
    if (!file) throw new Error('请先打开一个 .py 文件。');
    this.setStatus(`正在上传 ${file.split('/').pop()}…`);
    await requestRoute('upload', { body: JSON.stringify({ file }) });
    this.setStatus(`已上传 ${file.split('/').pop()}`);
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
    const file = this.activePythonPath || 'main.py';
    const name = file.split('/').pop();
    const label = this.node.querySelector('[data-role="file"]');
    if (label) label.textContent = this.dirty ? `${name} · 未保存` : name;
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

  onCloseRequest(msg) {
    super.onCloseRequest(msg);
    this.dispose();
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

function addCodeMode(app, panel) {
  try {
    app.shell.add(panel, 'main', { rank: 10 });
  } catch {
    app.shell.add(panel, 'right', { rank: 500 });
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
      if (!canReuseMicroPythonPanel(panel)) {
        panel = new MicroPythonPanel(app);
        addCodeMode(app, panel);
      }
      if (currentPath && !panel.activePythonPath) panel.activePythonPath = currentPath;
      app.shell.activateById(PANEL_ID);
      void panel.refreshPorts().catch((error) => panel.setStatus(studentErrorMessage(error), true));
    };
    app.commands.addCommand(COMMAND_ID, {
      label: 'MicroPython 代码模式',
      caption: '打开 XEdu ESP32 MicroPython 代码模式',
      icon: microPythonIcon,
      execute: openPanel,
    });
    app.commands.addKeyBinding({ command: COMMAND_ID, keys: ['Accel Shift E'], selector: 'body' });
    if (launcher) {
      launcher.add({
        command: COMMAND_ID,
        category: 'XEdu 实验',
        categoryRank: -100,
        rank: 0,
      });
    }
    if (shouldAutoOpenCodeMode(typeof window !== 'undefined' ? window.location.search : '')) {
      const openAfterRestore = () => openPanel();
      const restored = app.restored;
      if (restored && typeof restored.then === 'function') void restored.then(openAfterRestore);
      else openAfterRestore();
    }
  },
};

export default plugin;
