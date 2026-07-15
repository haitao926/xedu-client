const ALLOWED_TAGS = new Set([
  'a', 'blockquote', 'br', 'code', 'div', 'em', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'hr', 'img', 'li', 'ol', 'p', 'pre', 'span', 'strong', 'table', 'tbody', 'td', 'th', 'thead', 'tr', 'ul',
]);
const ALLOWED_ATTRIBUTES = new Set(['alt', 'class', 'colspan', 'href', 'rel', 'rowspan', 'src', 'target', 'title']);

function safeUrl(value, { image = false } = {}) {
  if (String(value || '').startsWith('#')) return value;
  try {
    const url = new URL(value, window.location.href);
    if (url.protocol === 'https:' || url.protocol === 'http:') return url.href;
    if (image && url.protocol === 'data:' && /^data:image\/(png|jpeg|gif|webp);base64,/i.test(value)) return value;
  } catch (_) {
    return '';
  }
  return '';
}

export function sanitizeHtml(html) {
  const template = document.createElement('template');
  template.innerHTML = String(html || '');

  for (const element of [...template.content.querySelectorAll('*')]) {
    const tag = element.tagName.toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) {
      element.replaceWith(document.createTextNode(element.textContent || ''));
      continue;
    }
    for (const attribute of [...element.attributes]) {
      const name = attribute.name.toLowerCase();
      if (!ALLOWED_ATTRIBUTES.has(name) || name.startsWith('on') || name === 'style') {
        element.removeAttribute(attribute.name);
        continue;
      }
      if (name === 'href' || name === 'src') {
        const value = safeUrl(attribute.value, { image: name === 'src' && tag === 'img' });
        if (!value) element.removeAttribute(attribute.name);
        else element.setAttribute(attribute.name, value);
      }
    }
    if (tag === 'a') {
      element.setAttribute('rel', 'noopener noreferrer');
      element.setAttribute('target', '_blank');
    }
  }
  return template.innerHTML;
}
