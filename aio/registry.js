// registry.js — pluggable "game engine" registry for the AIO translator.
// Every entry exposes the same shape:
//   { extractDialogs(source, fileName) -> dialogs[]
//     applyTranslations(source, dialogs, eol, creditLine) -> string
//     setMode(mode) / getMode() }
// plus metadata used by app.js for import routing, placeholder-warning
// checks, and UI labels.

import { RENPY, unmaskTagsInText as renpyUnmask, RENPH_TEST_RE, OLD_RENPH_TEST_RE, TRANSLATOR_CREDIT as RENPY_CREDIT } from './parsers/renpy-core.js';
import { RPGM, unmaskTagsInText as rpgmUnmask, RPGMPH_TEST_RE, OLD_RPGMPH_TEST_RE, TRANSLATOR_CREDIT as RPGM_CREDIT } from './parsers/rpgm-core.js';
import { KAG, unmaskTagsInText as kagUnmask, TRANSLATOR_CREDIT as KAG_CREDIT } from './parsers/kag.js';
import { ARTEMIS, unmaskTagsInText as artemisUnmask, TRANSLATOR_CREDIT as ARTEMIS_CREDIT } from './parsers/artemis.js';
import { TXT_LINE, TXT_NUMBERED, unmaskTagsInText as txtUnmask, looksLikeNumberedTxt, TRANSLATOR_CREDIT as TXT_CREDIT } from './parsers/txt.js';
import { PH_TEST_RE, OLD_PH_TEST_RE } from './parsers/masking.js';

export const ENGINES = {
  renpy: {
    id: 'renpy',
    label: "Ren'Py (.rpy)",
    exts: ['.rpy'],
    needsFileName: false,
    core: RENPY,
    unmaskTagsInText: renpyUnmask,
    phTestRe: RENPH_TEST_RE,
    oldPhTestRe: OLD_RENPH_TEST_RE,
    creditLine: RENPY_CREDIT,
    supportsExtractMode: true,
  },
  rpgm: {
    id: 'rpgm',
    label: 'RPG Maker MV/MZ (.json)',
    exts: ['.json'],
    needsFileName: true,
    core: RPGM,
    unmaskTagsInText: rpgmUnmask,
    phTestRe: RPGMPH_TEST_RE,
    oldPhTestRe: OLD_RPGMPH_TEST_RE,
    creditLine: RPGM_CREDIT,
    supportsExtractMode: true,
  },
  kag: {
    id: 'kag',
    label: "KAG/TyranoScript (.ks)",
    exts: ['.ks'],
    needsFileName: false,
    core: KAG,
    unmaskTagsInText: kagUnmask,
    phTestRe: PH_TEST_RE,
    oldPhTestRe: OLD_PH_TEST_RE,
    creditLine: KAG_CREDIT,
    supportsExtractMode: false,
  },
  artemis: {
    id: 'artemis',
    label: 'Artemis Engine (.ast/.asb)',
    exts: ['.ast', '.asb'],
    needsFileName: false,
    core: ARTEMIS,
    unmaskTagsInText: artemisUnmask,
    phTestRe: PH_TEST_RE,
    oldPhTestRe: OLD_PH_TEST_RE,
    creditLine: ARTEMIS_CREDIT,
    supportsExtractMode: false,
  },
  'txt-line': {
    id: 'txt-line',
    label: 'Plain TXT — one dialog per line',
    exts: ['.txt'],
    needsFileName: false,
    core: TXT_LINE,
    unmaskTagsInText: txtUnmask,
    phTestRe: PH_TEST_RE,
    oldPhTestRe: OLD_PH_TEST_RE,
    creditLine: TXT_CREDIT,
    supportsExtractMode: false,
  },
  'txt-numbered': {
    id: 'txt-numbered',
    label: 'Plain TXT — "---------N" numbered blocks',
    exts: ['.txt'],
    needsFileName: false,
    core: TXT_NUMBERED,
    unmaskTagsInText: txtUnmask,
    phTestRe: PH_TEST_RE,
    oldPhTestRe: OLD_PH_TEST_RE,
    creditLine: TXT_CREDIT,
    supportsExtractMode: false,
  },
};

export const ENGINE_ORDER = ['renpy', 'rpgm', 'kag', 'artemis', 'txt-line', 'txt-numbered'];

export function getEngine(id) {
  return ENGINES[id] || null;
}

function extOf(name) {
  const m = /\.[^.\/\\]+$/.exec(String(name || '').toLowerCase());
  return m ? m[0] : '';
}

// Auto-detect which engine a given (filename, text) pair belongs to.
// Returns an engine id from ENGINES, defaulting to 'txt-line' as a last resort.
export function detectEngine(fileName, text) {
  const ext = extOf(fileName);
  const t = String(text || '');

  if (ext === '.rpy') return 'renpy';
  if (ext === '.json') return 'rpgm';
  if (ext === '.ks') return 'kag';
  if (ext === '.ast' || ext === '.asb') return 'artemis';

  if (ext === '.txt') {
    // Sniff KAG/Artemis dumps saved with a .txt extension before falling
    // back to the two dedicated plain-text dialogue formats.
    if (/\b(?:text|mw|ruby|title|name)(?:_(?:ja|en|cn|tw))?\s*=\s*["']/.test(t) || /\b(?:ja|en|cn|tw)\s*=\s*\{/.test(t)) return 'artemis';
    if (/^@(?:if|endif|jump|call|return|wait|wt|eval|emb|set)\b/im.test(t) || /^\*[A-Za-z0-9_\-|]+$/m.test(t)) return 'kag';
    if (looksLikeNumberedTxt(t)) return 'txt-numbered';
    return 'txt-line';
  }

  return 'txt-line';
}

export function extractDialogs(engineId, source, fileName) {
  const eng = getEngine(engineId);
  if (!eng) throw new Error(`Unknown engine: ${engineId}`);
  return eng.needsFileName ? eng.core.extractDialogs(source, fileName) : eng.core.extractDialogs(source);
}

export function applyTranslations(engineId, source, dialogs, eol, creditLine) {
  const eng = getEngine(engineId);
  if (!eng) throw new Error(`Unknown engine: ${engineId}`);
  return eng.core.applyTranslations(source, dialogs, eol, creditLine ?? eng.creditLine);
}

export function hasPlaceholderWarning(engineId, text) {
  const eng = getEngine(engineId);
  if (!eng) return false;
  const s = String(text ?? '');
  return eng.phTestRe.test(s) || eng.oldPhTestRe.test(s);
}
