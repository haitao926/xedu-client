export const PLACEHOLDER_OUTPUT = '连接后，ESP32 的输出会显示在这里。';

export const STUDENT_ERRORS = {
  noBoard: '未发现 ESP32，请检查 USB 数据线和驱动。',
  noPortSelected: '请先选择 ESP32 串口。',
  notConnected: '请先连接 ESP32。',
  noFile: '请先在 JupyterLab 中打开一个 .py 文件。',
};

export function currentPyPath(widget) {
  const path = widget?.context?.path || widget?.content?.context?.path || '';
  return String(path).toLowerCase().endsWith('.py') ? String(path) : '';
}

export function rememberPyPath(currentPath, previousPath = '') {
  return currentPath || previousPath || '';
}

export function derivePanelState({
  connected = false,
  running = false,
  busy = false,
  ports = [],
  selectedPort = '',
  currentFile = '',
  error = '',
} = {}) {
  const hasPorts = Array.isArray(ports) && ports.length > 0;
  return {
    connected,
    running,
    busy,
    hasPorts,
    canRefresh: !busy,
    canConnect: !busy && !connected && Boolean(selectedPort),
    canDisconnect: !busy && connected,
    canRun: !busy && connected && Boolean(currentFile),
    canInterrupt: !busy && connected,
    canReset: !busy && connected,
    canSend: !busy && connected,
    statusKind: error
      ? 'error'
      : busy
        ? 'busy'
        : running
          ? 'running'
          : connected
            ? 'connected'
            : hasPorts
              ? 'disconnected'
              : 'no-board',
  };
}

export function statusText(state, { port = '', file = '', error = '', busyLabel = '' } = {}) {
  if (error) return error;
  if (busyLabel) return busyLabel;
  if (state.running) return `正在运行 ${file || '当前程序'}`;
  if (state.connected) return port ? `已连接 ${port}` : '开发板已连接。';
  if (!state.hasPorts) return STUDENT_ERRORS.noBoard;
  return '已发现串口，请选择开发板。';
}

export function appendDeviceOutput(previous, chunk, placeholder = PLACEHOLDER_OUTPUT) {
  if (!chunk) return previous;
  const prefix = !previous || previous === placeholder ? '' : previous;
  return `${prefix}${chunk}`;
}

export function readXsrfToken(cookie = '') {
  const match = String(cookie).match(/(?:^|; )_xsrf=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : '';
}
