export const PLACEHOLDER_OUTPUT = '连接后，ESP32 的输出会显示在这里。';

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
