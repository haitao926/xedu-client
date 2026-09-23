export const PLACEHOLDER_OUTPUT = '连接后，ESP32 的输出会显示在这里。';

export const PANEL_ROUTES = Object.freeze({
  refresh: Object.freeze({ method: 'GET', path: 'ports' }),
  connect: Object.freeze({ method: 'POST', path: 'connect' }),
  disconnect: Object.freeze({ method: 'POST', path: 'disconnect' }),
  run: Object.freeze({ method: 'POST', path: 'run' }),
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
    run: Boolean(connected && hasFile),
    interrupt: Boolean(connected),
    reset: Boolean(connected),
    send: Boolean(connected),
  };
}

export function studentErrorMessage(error, fallback = 'ESP32 操作失败。') {
  if (typeof error === 'string' && error.trim()) return error.trim();
  const message = error && typeof error.message === 'string' ? error.message.trim() : '';
  return message || fallback;
}
