export const PLACEHOLDER_OUTPUT = '连接后，ESP32 的输出会显示在这里。';
export const STARTER_MAIN_PY = [
  '# ESP32 MicroPython',
  '# 连接开发板后点击“运行”，输出会显示在下方。',
  'print("hello from ESP32")',
  '',
].join('\n');
export const CODE_MODE_QUERY = 'xedu-micropython';

export const PANEL_ROUTES = Object.freeze({
  refresh: Object.freeze({ method: 'GET', path: 'ports' }),
  connect: Object.freeze({ method: 'POST', path: 'connect' }),
  disconnect: Object.freeze({ method: 'POST', path: 'disconnect' }),
  run: Object.freeze({ method: 'POST', path: 'run' }),
  upload: Object.freeze({ method: 'POST', path: 'upload' }),
  interrupt: Object.freeze({ method: 'POST', path: 'interrupt' }),
  reset: Object.freeze({ method: 'POST', path: 'reset' }),
  send: Object.freeze({ method: 'POST', path: 'input' }),
  poll: Object.freeze({ method: 'GET', path: 'output' }),
});

export function panelRoute(action) {
  const route = PANEL_ROUTES[action];
  if (!route) {
    throw new Error('不支持的 MicroPython 请求。');
  }
  return route;
}

export function panelRequestPath(action, query = '') {
  const route = panelRoute(action);
  const suffix = query ? `?${query}` : '';
  return `${route.path}${suffix}`;
}

export function pythonPathFromWidget(widget) {
  const path = widget?.context?.path || '';
  return String(path).toLowerCase().endsWith('.py') ? path : '';
}

export function xsrfTokenFromCookie(cookie) {
  const match = String(cookie || '').match(/(?:^|; )_xsrf=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : '';
}

export function appendConsoleText(current, incoming, placeholder = PLACEHOLDER_OUTPUT) {
  if (!incoming) return current || placeholder;
  const prefix = !current || current === placeholder ? '' : current;
  return `${prefix}${incoming}`;
}

export function actionAvailability({ connected = false, hasPort = false, hasFile = false } = {}) {
  return {
    refresh: true,
    connect: Boolean(hasPort) && !connected,
    disconnect: Boolean(connected),
    save: Boolean(hasFile),
    run: Boolean(connected && hasFile),
    upload: Boolean(connected && hasFile),
    interrupt: Boolean(connected),
    reset: Boolean(connected),
    send: Boolean(connected),
    'open-project': true,
  };
}

export function shouldAutoOpenCodeMode(search = '') {
  const query = String(search || '').replace(/^\?/, '');
  return new URLSearchParams(query).get(CODE_MODE_QUERY) === '1';
}

export function projectDirectoryFromLabPath(pathname = '') {
  const text = String(pathname || '');
  const marker = '/lab/tree/';
  const index = text.indexOf(marker);
  if (index < 0) return { directory: '', filePath: '' };
  const raw = text.slice(index + marker.length).split('?')[0].split('#')[0];
  let filePath = raw;
  try {
    filePath = decodeURIComponent(raw);
  } catch {
    filePath = raw;
  }
  filePath = filePath.replace(/^\/+/, '').replace(/\/+$/, '');
  if (!filePath.toLowerCase().endsWith('.py')) {
    return { directory: filePath, filePath: '' };
  }
  const slash = filePath.lastIndexOf('/');
  if (slash < 0) return { directory: '', filePath };
  return { directory: filePath.slice(0, slash), filePath };
}

export function pythonProjectFiles(entries = []) {
  if (!Array.isArray(entries)) return [];
  return entries
    .filter((entry) => {
      const name = String(entry?.name || entry?.path || '');
      return entry?.type !== 'directory' && name.toLowerCase().endsWith('.py');
    })
    .map((entry) => {
      const path = String(entry.path || entry.name || '').replace(/\\/g, '/');
      const name = String(entry.name || path.split('/').pop() || path);
      return { name, path };
    })
    .sort((left, right) => {
      if (left.name === 'main.py' && right.name !== 'main.py') return -1;
      if (right.name === 'main.py' && left.name !== 'main.py') return 1;
      return left.name.localeCompare(right.name, 'zh-CN');
    });
}

export function preferredPythonFile(files = [], hintedPath = '') {
  const hint = String(hintedPath || '').replace(/\\/g, '/');
  if (hint && files.some((file) => file.path === hint)) return hint;
  const main = files.find((file) => file.name === 'main.py' || file.path.endsWith('/main.py'));
  if (main) return main.path;
  return files[0]?.path || '';
}

export function projectFilePath(directory = '', name = 'main.py') {
  const fileName = String(name || 'main.py').replace(/\\/g, '/').split('/').pop() || 'main.py';
  const folder = String(directory || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  return folder ? `${folder}/${fileName}` : fileName;
}

export function studentErrorMessage(error, fallback = 'ESP32 操作失败。') {
  if (typeof error === 'string' && error.trim()) return error.trim();
  const message = error && typeof error.message === 'string' ? error.message.trim() : '';
  return message || fallback;
}
