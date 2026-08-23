import { clamp } from './utils.js';

export function buildMatcher(query, isRegex, isCase) {
  const q = String(query || '');
  if (!q) return null;
  if (isRegex) {
    const flags = isCase ? 'g' : 'gi';
    return new RegExp(q, flags);
  }
  const esc = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(esc, isCase ? 'g' : 'gi');
}

export function findAllInText(text, re) {
  const s = String(text ?? '');
  if (!re) return [];
  const out = [];
  let m;
  re.lastIndex = 0;
  while ((m = re.exec(s)) !== null) {
    out.push({ index: m.index, len: m[0].length });
    if (m[0].length === 0) re.lastIndex++;
  }
  return out;
}

export function replaceOne(text, re, replacement, atIndex) {
  const s = String(text ?? '');
  if (!re) return s;
  re.lastIndex = 0;
  let m;
  while ((m = re.exec(s)) !== null) {
    if (m.index === atIndex) {
      const before = s.slice(0, m.index);
      const after = s.slice(m.index + m[0].length);
      const rep = s.replace(re, replacement);
      const offset = rep.length - s.length;
      return rep;
    }
    if (m[0].length === 0) re.lastIndex++;
  }
  return s;
}

export function replaceAll(text, re, replacement) {
  const s = String(text ?? '');
  if (!re) return s;
  re.lastIndex = 0;
  return s.replace(re, replacement);
}

export function nextIndex(total, current, dir) {
  if (!total) return -1;
  const n = current + dir;
  if (n < 0) return total - 1;
  if (n >= total) return 0;
  return n;
}

export function sortMatches(matches) {
  matches.sort((a,b) => (a.row - b.row) || (a.field.localeCompare(b.field)) || (a.index - b.index));
  return matches;
}
