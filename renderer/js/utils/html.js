const HTML_ESCAPE_MAP = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

const HTML_ESCAPE_RE = /[&<>"']/g;

export function escapeHtml(value = "") {
  return String(value ?? "").replace(HTML_ESCAPE_RE, (match) => HTML_ESCAPE_MAP[match]);
}
