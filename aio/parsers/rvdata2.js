// rvdata2.js — RPG Maker VX Ace translation sheet (rvtrans.rb) support.
//
// Input is the JSON produced by `ruby rvtrans.rb extract`:
//   [ { "id": "CommonEvents.rvdata2:c12:34:401",
//       "orig": "line 1\nline 2", "tr": "" }, ... ]
// One entry == one dialog row. Multi-line text blocks (401/405) are a single
// entry with "\n" between lines; choices (102) are one entry with one choice
// per line (the line count must be preserved). Export writes the same JSON
// back with the "tr" fields filled, ready for `ruby rvtrans.rb import`.

import { maskTagsInText, unmaskTagsInText as unmaskGeneric } from './masking.js';

export { unmaskGeneric as unmaskTagsInText };
export const TRANSLATOR_CREDIT = ''; // pure JSON: a credit line would break it.

// VX Ace message codes: \C[1] \N[2] \V[3] \I[4] \G \$ \. \| \! \> \< \^ \{ \} \\  (+ printf style %1)
const VXACE_TAG_RE = /\\[A-Za-z](?:\[[^\]\n]*\])?|\\[.|!^<>${}\\]|%\d+\$?[sdfoxX]?/g;

let MODE = 'safe';
function setMode(mode) { MODE = String(mode || 'safe'); }
function getMode() { return MODE; }

function parseSheet(source) {
  let data;
  try {
    data = JSON.parse(String(source ?? ''));
  } catch (e) {
    throw new Error('Invalid rvtrans JSON: ' + (e && e.message ? e.message : e));
  }
  if (!Array.isArray(data)) throw new Error('Invalid rvtrans JSON: expected an array of {id, orig, tr}.');
  return data;
}

// Cheap sniff used by auto-detect (avoids parsing huge files).
export function looksLikeRvtransSheet(source) {
  const head = String(source ?? '').slice(0, 4000);
  return /^\s*\[/.test(head) && /"id"\s*:\s*"[^"]*\.rvdata2:/.test(head) && /"orig"\s*:/.test(head);
}

function extractDialogs(source) {
  const data = parseSheet(source);
  const dialogs = [];

  for (let i = 0; i < data.length; i++) {
    const e = data[i];
    if (!e || typeof e.orig !== 'string' || !e.orig.trim()) continue;

    const maskedInfo = maskTagsInText(e.orig, VXACE_TAG_RE);
    const existing = typeof e.tr === 'string' && e.tr !== '' ? e.tr : null;

    dialogs.push({
      lineIndex: dialogs.length,
      entryIndex: i,
      entryId: String(e.id ?? ''),
      quote: e.orig,
      maskedQuote: maskedInfo.masked,
      placeholderMap: maskedInfo.map,
      cacheKey: maskedInfo.masked,
      translated: existing,
    });
  }

  return dialogs;
}

function applyTranslations(source, dialogs, _eol, _creditLine) {
  const data = parseSheet(source);

  for (const d of dialogs) {
    const e = data[d.entryIndex];
    if (!e || e.id !== d.entryId) continue; // sheet changed underneath us — skip safely
    if (d.translated == null) continue;

    const tr = String(d.translated);
    e.tr = tr;

    // Choices (…:102) must keep their line count or rvtrans.rb will skip them.
    if (/:102$/.test(d.entryId) && tr !== '') {
      const want = String(e.orig).split('\n').length;
      const got = tr.split('\n').length;
      if (want !== got) console.warn(`[rvdata2] ${d.entryId}: expected ${want} choice line(s), got ${got}.`);
    }
  }

  return JSON.stringify(data, null, 2);
}

export const RVDATA2 = { extractDialogs, applyTranslations, setMode, getMode };
