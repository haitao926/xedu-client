function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const pythonKeywords = new Set([
  'from', 'import', 'as', 'if', 'elif', 'else', 'for', 'while', 'try', 'except', 'finally',
  'def', 'class', 'return', 'with', 'in', 'is', 'and', 'or', 'not', 'None', 'True', 'False',
  'pass', 'break', 'continue', 'lambda', 'yield', 'global', 'nonlocal', 'print',
]);

function renderPythonHighlighted(code) {
  const source = String(code || '');
  let html = '';
  let index = 0;
  while (index < source.length) {
    const char = source[index];
    if (char === '#') {
      let end = index;
      while (end < source.length && source[end] !== '\n') {
        end += 1;
      }
      html += `<span class="tok-comment">${escapeHtml(source.slice(index, end))}</span>`;
      index = end;
      continue;
    }
    if (char === '\'' || char === '"') {
      const quote = char;
      let end = index + 1;
      while (end < source.length) {
        if (source[end] === '\\') {
          end += 2;
          continue;
        }
        if (source[end] === quote) {
          end += 1;
          break;
        }
        end += 1;
      }
      html += `<span class="tok-string">${escapeHtml(source.slice(index, end))}</span>`;
      index = end;
      continue;
    }
    if (/[A-Za-z_]/.test(char)) {
      let end = index + 1;
      while (end < source.length && /[A-Za-z0-9_]/.test(source[end])) {
        end += 1;
      }
      const word = source.slice(index, end);
      html += pythonKeywords.has(word)
        ? `<span class="tok-key">${escapeHtml(word)}</span>`
        : escapeHtml(word);
      index = end;
      continue;
    }
    html += escapeHtml(char);
    index += 1;
  }
  return html;
}

export { renderPythonHighlighted };
