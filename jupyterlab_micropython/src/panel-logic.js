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

export const DEFAULT_OUTPUT_HEIGHT = 164;
export const MIN_OUTPUT_HEIGHT = 120;
const MAX_OUTPUT_RATIO = 0.36;

export function clampOutputHeight(height, shellHeight) {
  const available = Number(shellHeight);
  const max = Number.isFinite(available) && available > 0
    ? Math.max(MIN_OUTPUT_HEIGHT, Math.round(available * MAX_OUTPUT_RATIO))
    : DEFAULT_OUTPUT_HEIGHT;
  const value = Number(height);
  if (!Number.isFinite(value)) return Math.min(DEFAULT_OUTPUT_HEIGHT, max);
  return Math.min(max, Math.max(MIN_OUTPUT_HEIGHT, Math.round(value)));
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

const PYTHON_KEYWORDS = new Set([
  'False', 'None', 'True', 'and', 'as', 'assert', 'async', 'await', 'break',
  'class', 'continue', 'def', 'del', 'elif', 'else', 'except', 'finally',
  'for', 'from', 'global', 'if', 'import', 'in', 'is', 'lambda', 'nonlocal',
  'not', 'or', 'pass', 'raise', 'return', 'try', 'while', 'with', 'yield',
]);

const PYTHON_STRING_PREFIX = /^(?:[rRuUfFbB]|[fF][rR]|[rR][fF]|[bB][rR]|[rR][bB])(?=['"])/;

function escapeHighlightText(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function readPythonString(source, index) {
  if (index > 0 && /[A-Za-z0-9_]/.test(source[index - 1])) return '';
  const prefix = source.slice(index).match(PYTHON_STRING_PREFIX);
  let cursor = index;
  if (prefix) cursor += prefix[0].length;
  const quote = source[cursor];
  if (quote !== '"' && quote !== "'") return '';
  const triple = source.startsWith(quote.repeat(3), cursor);
  const delimiter = triple ? quote.repeat(3) : quote;
  const raw = Boolean(prefix && /r/i.test(prefix[0]));
  let end = cursor + delimiter.length;
  while (end < source.length) {
    if (!raw && source[end] === '\\') {
      end += Math.min(2, source.length - end);
      continue;
    }
    if (source.startsWith(delimiter, end)) return source.slice(index, end + delimiter.length);
    if (!triple && (source[end] === '\n' || source[end] === '\r')) break;
    end += 1;
  }
  return source.slice(index, end);
}

function readPythonNumber(source, index) {
  if (index > 0 && /[A-Za-z0-9_]/.test(source[index - 1])) return '';
  const match = source.slice(index).match(
    /^(?:0[xX][0-9A-Fa-f]+|0[bB][01]+|0[oO][0-7]+|\d+(?:\.\d*)?(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?)/,
  );
  return match ? match[0] : '';
}

export function highlightPython(source) {
  const text = String(source ?? '');
  let html = '';
  let index = 0;
  let plain = '';
  const flushPlain = () => {
    if (!plain) return;
    html += `<span class="xedu-py-text">${escapeHighlightText(plain)}</span>`;
    plain = '';
  };
  const push = (type, value) => {
    if (!value) return;
    if (type === 'text') {
      plain += value;
      return;
    }
    flushPlain();
    html += `<span class="xedu-py-${type}">${escapeHighlightText(value)}</span>`;
  };
  while (index < text.length) {
    const char = text[index];
    if (char === '#') {
      const lineEnd = text.indexOf('\n', index);
      const stop = lineEnd === -1 ? text.length : lineEnd;
      push('comment', text.slice(index, stop));
      index = stop;
      continue;
    }
    const stringToken = readPythonString(text, index);
    if (stringToken) {
      push('string', stringToken);
      index += stringToken.length;
      continue;
    }
    const numberToken = readPythonNumber(text, index);
    if (numberToken) {
      push('number', numberToken);
      index += numberToken.length;
      continue;
    }
    if (/[A-Za-z_]/.test(char)) {
      const word = text.slice(index).match(/^[A-Za-z_][A-Za-z0-9_]*/)[0];
      push(PYTHON_KEYWORDS.has(word) ? 'keyword' : 'text', word);
      index += word.length;
      continue;
    }
    push('text', char);
    index += 1;
  }
  flushPlain();
  return html;
}
