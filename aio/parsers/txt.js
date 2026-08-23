// txt.js — plain .txt dialogue formats.
//
// Format "txt-line": one dialog per line.
//   Hello World.
//   Hi.
//   Dialog.
//
// Format "txt-numbered": a marker line "---------N" (3+ dashes + an index
// number) precedes each dialog block. Marker lines are preserved verbatim;
// everything else is treated as translatable text.
//   ---------0
//   Hello World
//   ---------1
//   Hi.
//   ---------2
//   【Dialog.

import { maskTagsInText, unmaskTagsInText as unmaskGeneric } from './masking.js';

export { unmaskGeneric as unmaskTagsInText };
export const TRANSLATOR_CREDIT = '';

const MARKER_RE = /^-{3,}\s*\d+\s*$/;

let MODE = 'safe';
function setMode(mode) { MODE = String(mode || 'safe'); }
function getMode() { return MODE; }

function extractGeneric(source, { skipMarkers }) {
  const lines = String(source ?? '').split(/\r?\n/);
  const dialogs = [];

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();
    if (!trimmed) continue;
    if (skipMarkers && MARKER_RE.test(trimmed)) continue;

    const maskedInfo = maskTagsInText(raw);
    dialogs.push({
      lineIndex: i,
      quote: raw,
      maskedQuote: maskedInfo.masked,
      placeholderMap: maskedInfo.map,
      cacheKey: maskedInfo.masked,
      translated: null,
    });
  }

  return dialogs;
}

function applyGeneric(source, dialogs, eol) {
  const lines = String(source ?? '').split(/\r?\n/);
  const byLine = new Map();
  for (const d of dialogs) byLine.set(d.lineIndex, d);

  const out = lines.map((line, idx) => {
    const d = byLine.get(idx);
    if (!d || d.translated == null || d.translated === '') return line;
    return String(d.translated);
  });

  return out.join(eol || '\n');
}

// --- Format 1: one dialog per line -----------------------------------
function extractDialogsLine(source) {
  return extractGeneric(source, { skipMarkers: false });
}
function applyTranslationsLine(source, dialogs, eol) {
  return applyGeneric(source, dialogs, eol);
}

// --- Format 2: "---------N" numbered markers --------------------------
function extractDialogsNumbered(source) {
  return extractGeneric(source, { skipMarkers: true });
}
function applyTranslationsNumbered(source, dialogs, eol) {
  return applyGeneric(source, dialogs, eol);
}

// Sniff which of the two .txt flavors a file is, so import can auto-select.
export function looksLikeNumberedTxt(source) {
  const lines = String(source ?? '').split(/\r?\n/).slice(0, 500);
  let markers = 0;
  for (const line of lines) if (MARKER_RE.test(line.trim())) markers++;
  return markers >= 2;
}

export const TXT_LINE = { extractDialogs: extractDialogsLine, applyTranslations: applyTranslationsLine, setMode, getMode };
export const TXT_NUMBERED = { extractDialogs: extractDialogsNumbered, applyTranslations: applyTranslationsNumbered, setMode, getMode };
