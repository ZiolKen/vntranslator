export function nowIso() {
  return new Date().toISOString();
}

export function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

export function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

export function debounce(fn, ms) {
  let t = 0;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

export function escapeHtml(s) {
  return String(s ?? '')
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'",'&#39;');
}

export function safeParseJsonArray(text) {
  const s = String(text || '').trim();
  const start = s.indexOf('[');
  const end = s.lastIndexOf(']');
  if (start === -1 || end === -1 || end <= start) return null;
  const cut = s.slice(start, end + 1);
  try {
    const v = JSON.parse(cut);
    return Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

export function pickFirstNonEmpty(arr) {
  for (const x of arr) {
    const s = String(x || '').trim();
    if (s) return s;
  }
  return '';
}

export function normalizeLineEndings(text) {
  const s = String(text ?? '');
  const eol = s.includes('\r\n') ? '\r\n' : '\n';
  return { text: s.replace(/\r\n/g, '\n'), eol };
}

export function restoreLineEndings(text, eol) {
  if (!eol || eol === '\n') return text;
  return String(text ?? '').replace(/\n/g, eol);
}
