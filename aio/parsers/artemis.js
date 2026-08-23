// artemis.js — adapts VNKAGParserCore's Artemis Engine (.ast/.asb)
// text-occurrence extractor/injector to the common
// { extractDialogs, applyTranslations, setMode, getMode } shape shared by
// every engine in the AIO tool (see registry.js).

import { maskTagsInText, unmaskTagsInText as unmaskGeneric } from './masking.js';

export { unmaskGeneric as unmaskTagsInText };
export const TRANSLATOR_CREDIT = '';

let MODE = 'safe';
function setMode(mode) { MODE = String(mode || 'safe'); }
function getMode() { return MODE; }

function core() {
  const c = globalThis.VNKAGParserCore;
  if (!c) throw new Error('Artemis parser core not loaded (VNKAGParserCore missing).');
  return c;
}

function extractDialogs(source) {
  const { lines, mapping } = core().extractArtemisTextAndMapping(source);
  const dialogs = [];
  for (let i = 0; i < lines.length; i++) {
    const raw = String(lines[i] ?? '');
    const maskedInfo = maskTagsInText(raw);
    dialogs.push({
      lineIndex: i,
      engineIndex: i,
      mapping: mapping[i],
      quote: raw,
      maskedQuote: maskedInfo.masked,
      placeholderMap: maskedInfo.map,
      cacheKey: maskedInfo.masked,
      translated: null,
    });
  }
  return dialogs;
}

function applyTranslations(source, dialogs, _eol, _creditLine) {
  const sorted = dialogs.slice().sort((a, b) => a.engineIndex - b.engineIndex);
  const newLines = sorted.map((d) => (d.translated == null ? d.quote : String(d.translated)));
  const mapping = sorted.map((d) => d.mapping);
  // Artemis source files (.ast/.asb) are script/data files, not pure JSON,
  // but many are parsed strictly by the engine — skip appending a credit
  // comment to avoid breaking any file that doesn't support `//` comments.
  return core().insertArtemisTextBack(source, newLines, mapping);
}

export const ARTEMIS = { extractDialogs, applyTranslations, setMode, getMode };
