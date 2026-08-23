// masking.js — shared placeholder masking for engines that don't ship their
// own masker (KAG, Artemis, TXT). Mirrors the approach used by prenpy.js /
// prpgm.js (mask non-translatable tag-like chunks as ⟦PH{n}⟧ before sending
// text to a translator, then restore them afterwards) but with a tag
// grammar broad enough to cover KAG/TJS tags ([tag attr=1]), Artemis/RPGM
// style control codes (\n, \C[1], %1), and generic bracket/brace runs.

export const PH_RE = /⟦\s*PH\s*(?:\{\s*(\d+)\s*\}|(\d+))\s*⟧/g;
export const PH_TEST_RE = /⟦\s*PH\s*(?:\{\s*\d+\s*\}|\d+)\s*⟧/;
export const OLD_PH_TEST_RE = /(?!)x^/; // no legacy marker for this engine family

const TAG_RE = /\[[^\[\]]*\]|\{[^{}]*\}|<[^<>\n]{1,160}>|\\[A-Za-z][\[{][^\]}]*[\]}]|\\\\|\\[.|!^<>${}nN]|%\d+\$?[sdfoxX]?/g;

export function maskTagsInText(text) {
  const s = String(text ?? '');
  if (!s) return { masked: s, map: Object.create(null) };

  const used = new Set();
  s.replace(PH_RE, (_, a, b) => {
    const n = Number(a ?? b);
    if (Number.isFinite(n)) used.add(n);
    return '';
  });

  let next = 0;
  const alloc = () => {
    while (used.has(next)) next++;
    const id = next;
    used.add(id);
    next++;
    return id;
  };

  const map = Object.create(null);
  let result = '';
  let lastIndex = 0;
  let m;

  TAG_RE.lastIndex = 0;
  while ((m = TAG_RE.exec(s)) !== null) {
    const originalTag = m[0];
    const id = alloc();
    map[String(id)] = originalTag;

    result += s.slice(lastIndex, m.index) + `⟦PH{${id}}⟧`;
    lastIndex = m.index + originalTag.length;
  }

  result += s.slice(lastIndex);
  return { masked: result, map };
}

export function unmaskTagsInText(text, map) {
  const s = String(text ?? '');
  if (!s || !map) return s;

  return s.replace(PH_RE, (full, a, b) => {
    const id = String(Number(a ?? b));
    return Object.prototype.hasOwnProperty.call(map, id) ? map[id] : full;
  });
}
