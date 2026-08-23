// kag.js — adapts VNKAGParserCore's KAG (.ks) extractor/injector to the
// common { extractDialogs, applyTranslations, setMode, getMode } shape
// shared by every engine in the AIO tool (see registry.js).

import { maskTagsInText, unmaskTagsInText as unmaskGeneric } from './masking.js';

export { unmaskGeneric as unmaskTagsInText };
export const TRANSLATOR_CREDIT = '; Translated by VN Translator: https://vntranslator.vercel.app/ or https://vntranslator.pages.dev/';

let MODE = 'safe'; // kept only for UI parity; KAG extraction is not mode-gated.
function setMode(mode) { MODE = String(mode || 'safe'); }
function getMode() { return MODE; }

function core() {
  const c = globalThis.VNKAGParserCore;
  if (!c) throw new Error('KAG parser core not loaded (VNKAGParserCore missing).');
  return c;
}

function extractDialogs(source) {
  const { lines, mapping } = core().extractKAGTextAndMapping(source);
  const dialogs = [];
  for (let i = 0; i < lines.length; i++) {
    const raw = String(lines[i] ?? '');
    const maskedInfo = maskTagsInText(raw);
    dialogs.push({
      lineIndex: mapping[i]?.lineIndex ?? i,
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

function applyTranslations(source, dialogs, eol, creditLine) {
  const sorted = dialogs.slice().sort((a, b) => a.engineIndex - b.engineIndex);
  const newLines = sorted.map((d) => (d.translated == null ? d.quote : String(d.translated)));
  const mapping = sorted.map((d) => d.mapping);
  let out = core().insertKAGTextBack(source, newLines, mapping);

  const nl = eol || '\n';
  const credit = String(creditLine || '').trim();
  if (!credit) return out + nl;
  const trimmed = out.trimEnd();
  if (trimmed.endsWith(credit)) return out + nl;
  return out + nl + nl + credit + nl;
}

export const KAG = { extractDialogs, applyTranslations, setMode, getMode };
