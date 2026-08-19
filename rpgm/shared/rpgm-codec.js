/**
 * RpgmCodec — shared escape-code protection for RPG Maker MV/MZ text.
 *
 * Used by both rpgm.js (extract/translate flow) and preview.js
 * (preview/edit/validate flow). Previously this logic was copy-pasted
 * in three places and had drifted out of sync (one copy still had a
 * bug where a lone unmatched '<', '[' or '{' in dialogue — e.g.
 * "HP < 50" or an emoticon "<3" — would swallow the rest of the
 * string into a single opaque placeholder). Keeping one implementation
 * means a fix here benefits every caller automatically.
 *
 * Exposes `window.RpgmCodec` in the browser, or a CommonJS export
 * when required from Node (used by the test script / bundlers).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.RpgmCodec = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const RPGPLH_TEST_RE = /__RPGPLH_\d{1,5}__/;

  function createPlaceholder(counter) {
    const random = Math.floor(Math.random() * 100);
    return `__RPGPLH_${counter}${random}__`;
  }

  /**
   * Finds the end of an RPG Maker escape/tag block starting at index i
   * in str, WITHOUT ever consuming past the end of a matching closing
   * delimiter on the same line. Returns null if ch doesn't start a
   * recognized block, or if the block is unclosed (in which case the
   * character should be treated as ordinary literal text, not code).
   */
  function matchCodeBlockAt(str, i) {
    const ch = str[i];

    if (ch === '\\') {
      let j = i + 1;
      let block = '\\';

      if (str[j] === '\\') {
        return { block: block + '\\', end: j + 1 };
      }

      while (j < str.length && /[A-Za-z]/.test(str[j])) {
        block += str[j++];
      }

      if (block === '\\' && j < str.length && /[.!^|]/.test(str[j])) {
        block += str[j++];
      }

      if (str[j] === '[') {
        // Only fold a trailing [...] into the escape code (e.g. \N[1],
        // \V[2], \C[6]) if it actually closes on the same line -
        // otherwise leave '[' alone so unrelated text isn't swallowed.
        const closeIdx = str.indexOf(']', j);
        const newlineIdx = str.indexOf('\n', j);
        if (closeIdx !== -1 && (newlineIdx === -1 || closeIdx < newlineIdx)) {
          block += str.slice(j, closeIdx + 1);
          j = closeIdx + 1;
        }
      }

      return { block, end: j };
    }

    if (ch === '<' || ch === '[' || ch === '{') {
      // A bare '<' without a closing '>' on the same line is normal
      // dialogue text ("HP < 50", "<3"), not an RPG Maker tag - and
      // likewise for a stray '[' / '{' left over from a typo. Only
      // treat these as protected code when a matching closer is found.
      const close = ch === '<' ? '>' : ch === '[' ? ']' : '}';
      const closeIdx = str.indexOf(close, i + 1);
      const newlineIdx = str.indexOf('\n', i + 1);
      if (closeIdx !== -1 && (newlineIdx === -1 || closeIdx < newlineIdx)) {
        return { block: str.slice(i, closeIdx + 1), end: closeIdx + 1 };
      }
      return null;
    }

    return null;
  }

  function protectRPGMCodes(str) {
    if (!str) return { text: str, map: {} };

    const map = Object.create(null);
    let out = '';
    let i = 0;
    let counter = 0;

    while (i < str.length) {
      const phMatch = /^(__RPGPLH_\d{1,5}__)/.exec(str.slice(i));
      if (phMatch) {
        out += phMatch[1];
        i += phMatch[1].length;
        continue;
      }

      const ch = str[i];
      if (ch === '\\' || ch === '<' || ch === '[' || ch === '{') {
        const hit = matchCodeBlockAt(str, i);
        if (hit) {
          const ph = createPlaceholder(counter++);
          map[ph] = hit.block;
          out += ph;
          i = hit.end;
          continue;
        }
      }

      out += ch;
      i++;
    }

    return { text: out, map };
  }

  function restoreRPGMCodes(str, map) {
    if (!str || !map) return str;
    let out = str;
    for (const ph of Object.keys(map)) {
      if (!out.includes(ph)) {
        console.warn(`⚠️ Warning: placeholder missing after translation: ${ph}`);
      }
      out = out.split(ph).join(map[ph]);
    }
    return out;
  }

  /** Returns the list of protected code blocks found in str, in order (for QA/validation). */
  function extractRpgmTokens(str) {
    const s = String(str || '');
    const tokens = [];
    let i = 0;
    while (i < s.length) {
      const ch = s[i];
      if (ch === '\\' || ch === '<' || ch === '[' || ch === '{') {
        const hit = matchCodeBlockAt(s, i);
        if (hit) {
          tokens.push(hit.block);
          i = hit.end;
          continue;
        }
      }
      i++;
    }
    return tokens;
  }

  /** Compares control-code tokens between original and translated text, returns QA issues. */
  function validateRpgmTokens(originalText, translatedText) {
    const issues = [];
    const o = String(originalText || '');
    const t = String(translatedText || '');

    if (RPGPLH_TEST_RE.test(t)) {
      issues.push({ kind: 'bad', text: 'Placeholder token __RPGPLH_*__ is still present in translation.' });
    }

    const src = extractRpgmTokens(o);
    const tgt = extractRpgmTokens(t);
    if (!src.length && !tgt.length) return issues;

    let cursor = 0;
    for (const token of src) {
      const idx = t.indexOf(token, cursor);
      if (idx === -1) {
        issues.push({ kind: 'warn', text: 'Missing control token: ' + token });
      } else {
        cursor = idx + token.length;
      }
    }

    if (tgt.length > src.length + 1) {
      issues.push({ kind: 'warn', text: 'Translation contains more control codes than original.' });
    }

    const oNl = (o.match(/\r?\n/g) || []).length;
    const tNl = (t.match(/\r?\n/g) || []).length;
    if (oNl !== tNl) {
      issues.push({ kind: 'warn', text: 'Line breaks changed: ' + oNl + ' → ' + tNl });
    }

    return issues;
  }

  return {
    RPGPLH_TEST_RE,
    createPlaceholder,
    protectRPGMCodes,
    restoreRPGMCodes,
    extractRpgmTokens,
    validateRpgmTokens,
  };
});
