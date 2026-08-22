// prpgm.js — RPG Maker MV/MZ JSON dialogue parser + injector.
//
// This replaces prenpy's Ren'Py (.rpy) text parser with a parser for RPG
// Maker's JSON data files (Map*.json, CommonEvents.json, Actors.json,
// Items.json, System.json, ...). The public shape mirrors prenpy.js exactly
// (`RPGM.extractDialogs`, `RPGM.applyTranslations`, `RPGM.setMode/getMode`,
// `unmaskTagsInText`) so app.js only needs its import + a couple of call
// sites updated (see app.js).
//
// Design:
//  - A tiny hand-rolled JSON tokenizer (`parseJsonWithOffsets`) parses the
//    file the same way JSON.parse would, but every string VALUE is returned
//    as `{ __str:true, value, start, end }` where start/end are the exact
//    character offsets of that string's *content* (between the quotes) in
//    the original source text. This lets us splice translations back in
//    place (like prenpy does for .rpy) instead of re-serializing the whole
//    file — so untouched formatting, key order, and numbers are byte-for-
//    byte identical to the original.
//  - Structural extraction walks that annotated tree (event commands,
//    database name/description fields, System.json terms, etc.) and decides
//    what is safe to send to a translator, porting the same event-command
//    codes and text heuristics used by the standalone RPG Maker tool
//    (rpgm/rpgm.js + rpgm/shared/rpgm-text-filters.js).

export const TRANSLATOR_CREDIT = ''; // unused: appending a comment line would break JSON syntax.

export const RPGMPH_RE = /⟦\s*RPGMPH\s*(?:\{\s*(\d+)\s*\}|(\d+))\s*⟧/g;
export const RPGMPH_TEST_RE = /⟦\s*RPGMPH\s*(?:\{\s*\d+\s*\}|\d+)\s*⟧/;
// Kept only so app.js's import shape matches prenpy's; prpgm never emits this legacy marker.
export const OLD_RPGMPH_TEST_RE = /(?!)x^/;

const Filters = (typeof globalThis !== 'undefined' && globalThis.RpgmTextFilters) || null;

function isValidDialogText(text, kind) {
  if (Filters && typeof Filters.isValidDialogText === 'function') {
    return Filters.isValidDialogText(text, kind);
  }
  if (typeof text !== 'string') return false;
  const t = text.trim();
  if (t.length < 2) return false;
  if (!/[A-Za-zÀ-ỹ\u00C0-\u1EF9\u3040-\u30FF\u4E00-\u9FFF]/.test(t)) return false;
  const tagRatio = (t.match(/<[^>]+>/g) || []).join('').length / t.length;
  if (tagRatio > 0.40) return false;
  return true;
}

/* ------------------------------------------------------------
   Placeholder masking for RPG Maker control codes / plugin tags
   ( \C[1] \N[1] \V[1] \I[1] \P[1], \., \|, \!, \^, \<, \>, \{, \},
     \$, \\, <PluginNoteTag: 3>, %1 printf-style params )
------------------------------------------------------------ */
const RPGM_TAG_RE = /\\[A-Za-z][\[{][^\]}]*[\]}]|\\\\|\\[.|!^<>${}]|<[^<>\n]{1,160}>|%\d+/g;

export function maskTagsInText(text) {
  const s = String(text ?? '');
  if (!s) return { masked: s, map: Object.create(null) };

  const used = new Set();
  s.replace(RPGMPH_RE, (_, a, b) => {
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
  RPGM_TAG_RE.lastIndex = 0;
  while ((m = RPGM_TAG_RE.exec(s)) !== null) {
    const originalTag = m[0];
    const id = alloc();
    map[String(id)] = originalTag;
    result += s.slice(lastIndex, m.index) + `⟦RPGMPH{${id}}⟧`;
    lastIndex = m.index + originalTag.length;
  }
  result += s.slice(lastIndex);
  return { masked: result, map };
}

export function unmaskTagsInText(text, map) {
  const s = String(text ?? '');
  if (!s || !map) return s;
  return s.replace(RPGMPH_RE, (full, a, b) => {
    const id = String(Number(a ?? b));
    return Object.prototype.hasOwnProperty.call(map, id) ? map[id] : full;
  });
}

function escapeForJsonString(text) {
  const encoded = JSON.stringify(String(text ?? ''));
  return encoded.slice(1, -1);
}

/* ------------------------------------------------------------
   Offset-preserving JSON tokenizer
------------------------------------------------------------ */
function parseJsonWithOffsets(text) {
  const n = text.length;
  let i = 0;

  function fail(msg) {
    throw new Error(`${msg} at offset ${i}`);
  }

  function skipWs() {
    while (i < n) {
      const c = text.charCodeAt(i);
      if (c === 32 || c === 9 || c === 10 || c === 13) i++;
      else break;
    }
  }

  function expectLiteral(lit) {
    if (text.slice(i, i + lit.length) !== lit) fail(`expected '${lit}'`);
    i += lit.length;
  }

  function parseString() {
    // text[i] === '"'
    i++;
    const start = i;
    let hasEscape = false;
    while (i < n) {
      const c = text.charCodeAt(i);
      if (c === 34) break; // "
      if (c === 92) { hasEscape = true; i += 2; continue; } // backslash
      i++;
    }
    if (text.charCodeAt(i) !== 34) fail('unterminated string');
    const end = i;
    i++; // consume closing quote
    const raw = text.slice(start, end);
    let value;
    if (hasEscape) {
      try { value = JSON.parse(`"${raw}"`); } catch { fail('bad string escape'); }
    } else {
      value = raw;
    }
    return { __str: true, value, start, end };
  }

  function parseNumber() {
    const start = i;
    if (text[i] === '-') i++;
    while (i < n && text[i] >= '0' && text[i] <= '9') i++;
    if (text[i] === '.') { i++; while (i < n && text[i] >= '0' && text[i] <= '9') i++; }
    if (text[i] === 'e' || text[i] === 'E') {
      i++;
      if (text[i] === '+' || text[i] === '-') i++;
      while (i < n && text[i] >= '0' && text[i] <= '9') i++;
    }
    if (i === start) fail('invalid number');
    return Number(text.slice(start, i));
  }

  function parseArray() {
    i++; // [
    const arr = [];
    skipWs();
    if (text[i] === ']') { i++; return arr; }
    for (;;) {
      arr.push(parseValue());
      skipWs();
      if (text[i] === ',') { i++; skipWs(); continue; }
      if (text[i] === ']') { i++; break; }
      fail("expected ',' or ']'");
    }
    return arr;
  }

  function parseObject() {
    i++; // {
    const obj = {};
    skipWs();
    if (text[i] === '}') { i++; return obj; }
    for (;;) {
      skipWs();
      if (text[i] !== '"') fail('expected object key');
      const key = parseString();
      skipWs();
      if (text[i] !== ':') fail("expected ':'");
      i++;
      const val = parseValue();
      obj[key.value] = val;
      skipWs();
      if (text[i] === ',') { i++; continue; }
      if (text[i] === '}') { i++; break; }
      fail("expected ',' or '}'");
    }
    return obj;
  }

  function parseValue() {
    skipWs();
    const c = text[i];
    if (c === '"') return parseString();
    if (c === '{') return parseObject();
    if (c === '[') return parseArray();
    if (c === 't') { expectLiteral('true'); return true; }
    if (c === 'f') { expectLiteral('false'); return false; }
    if (c === 'n') { expectLiteral('null'); return null; }
    if (c === '-' || (c >= '0' && c <= '9')) return parseNumber();
    fail('unexpected token');
  }

  try {
    skipWs();
    const value = parseValue();
    return { ok: true, value };
  } catch (error) {
    return { ok: false, error };
  }
}

function isStrNode(n) {
  return !!n && typeof n === 'object' && n.__str === true;
}

/* ------------------------------------------------------------
   Extraction — event commands (Map*.json, CommonEvents.json,
   Troops.json pages, ...) walked generically regardless of file name,
   plus per-file database field lists dispatched by file name.
------------------------------------------------------------ */
const TIER_RANK = { safe: 0, balanced: 1, aggressive: 2 };

let MODE = 'safe';

function setMode(mode) {
  const v = String(mode || '').toLowerCase().trim();
  MODE = (v === 'balanced' || v === 'aggressive') ? v : 'safe';
}

function getMode() {
  return MODE;
}

function tierAllowed(tier) {
  const rank = Object.prototype.hasOwnProperty.call(TIER_RANK, tier) ? TIER_RANK[tier] : TIER_RANK.aggressive;
  return TIER_RANK[MODE] >= rank;
}

function pushIfValid(out, node, tier, kind) {
  if (!tierAllowed(tier)) return;
  if (!isStrNode(node)) return;
  const raw = node.value;
  if (!isValidDialogText(raw, kind)) return;

  const maskedInfo = maskTagsInText(raw);
  out.push({
    lineIndex: out.length,
    contentStart: node.start,
    contentEnd: node.end,
    quoteChar: '"',
    isTriple: false,
    prefix: '',
    quote: raw,
    maskedQuote: maskedInfo.masked,
    placeholderMap: maskedInfo.map,
    cacheKey: maskedInfo.masked,
    translated: null,
  });
}

function pushArrayOfStrings(out, arr, tier, kind) {
  if (!Array.isArray(arr)) return;
  for (const item of arr) pushIfValid(out, item, tier, kind || 'dialogueText');
}

// Show Text line / Scrolling Text line — always author dialogue.
const COMMAND_MESSAGE_LINE = new Set([401, 405]);
// Comment (start) + Comment (continuation) — dev notes, not dialogue.
const COMMAND_COMMENT = new Set([108, 408]);
const COMMAND_CHOICE = new Set([102]);
const COMMAND_BRANCH = new Set([402, 403]);

function walkEventCommandList(out, list) {
  if (!Array.isArray(list)) return;
  for (const cmd of list) {
    if (!cmd || typeof cmd !== 'object' || Array.isArray(cmd) || cmd.__str) continue;
    const code = cmd.code;
    const params = cmd.parameters;
    if (typeof code !== 'number' || !Array.isArray(params)) continue;

    if (COMMAND_MESSAGE_LINE.has(code)) {
      pushIfValid(out, params[0], 'safe', 'dialogueText');
    } else if (COMMAND_COMMENT.has(code)) {
      pushIfValid(out, params[0], 'aggressive', 'commentText');
    } else if (COMMAND_CHOICE.has(code)) {
      const arr = params[0];
      if (Array.isArray(arr)) for (const item of arr) pushIfValid(out, item, 'safe', 'choice');
    } else if (COMMAND_BRANCH.has(code)) {
      // Mirrors one string from the matching COMMAND_CHOICE array above —
      // RPG Maker re-matches branches by comparing this text verbatim, so
      // it must stay identical to its choice-list counterpart once translated.
      pushIfValid(out, params[1], 'safe', 'branch');
    } else if (code === 101) {
      // Show Text header — carries speaker name in parameters[4] (MZ only).
      pushIfValid(out, params[4], 'balanced', 'speakerName');
    } else if (code === 320) {
      // Change Name
      pushIfValid(out, params[1], 'balanced', 'speakerName');
    } else if (code === 324) {
      // Change Nickname (MZ)
      pushIfValid(out, params[1], 'balanced', 'speakerName');
    } else if (code === 325) {
      // Change Profile (MZ) — multi-line bio text.
      pushIfValid(out, params[1], 'balanced', 'dialogueText');
    }
  }
}

function walkEventsGeneric(out, node, depth) {
  if (depth > 80) return;
  if (Array.isArray(node)) {
    for (const item of node) walkEventsGeneric(out, item, depth + 1);
    return;
  }
  if (!node || typeof node !== 'object' || node.__str) return;
  if (Array.isArray(node.list)) walkEventCommandList(out, node.list);
  for (const key of Object.keys(node)) {
    if (key === 'list') continue;
    walkEventsGeneric(out, node[key], depth + 1);
  }
}

function extractSystem(out, root) {
  if (!root || typeof root !== 'object') return;
  pushIfValid(out, root.gameTitle, 'safe', 'dialogueText');
  pushIfValid(out, root.currencyUnit, 'safe', 'dialogueText');

  const terms = root.terms;
  if (terms && typeof terms === 'object') {
    pushArrayOfStrings(out, terms.basic, 'safe');
    pushArrayOfStrings(out, terms.commands, 'safe');
    pushArrayOfStrings(out, terms.params, 'safe');

    const msgs = terms.messages;
    if (msgs && typeof msgs === 'object' && !msgs.__str) {
      for (const key of Object.keys(msgs)) pushIfValid(out, msgs[key], 'safe', 'dialogueText');
    }
  }

  pushArrayOfStrings(out, root.elements, 'safe');
  pushArrayOfStrings(out, root.equipTypes, 'safe');
  pushArrayOfStrings(out, root.skillTypes, 'safe');
  pushArrayOfStrings(out, root.armorTypes, 'safe');
  pushArrayOfStrings(out, root.weaponTypes, 'safe');
}

function extractDbArray(out, arr, fieldTierList) {
  if (!Array.isArray(arr)) return;
  for (const entry of arr) {
    if (!entry || typeof entry !== 'object' || entry.__str) continue;
    for (const [field, tier] of fieldTierList) {
      pushIfValid(out, entry[field], tier, 'dialogueText');
    }
  }
}

function dispatchByFileName(out, fileName, root) {
  const base = String(fileName || '').toLowerCase().replaceAll('\\', '/').split('/').pop() || '';

  const hasSystemShape = !!(root && typeof root === 'object' && !Array.isArray(root)
    && root.terms && typeof root.terms === 'object' && root.terms.messages);
  if (base === 'system.json' || hasSystemShape) extractSystem(out, root);

  if (base === 'actors.json') {
    extractDbArray(out, root, [['name', 'safe'], ['nickname', 'safe'], ['profile', 'safe']]);
  } else if (base === 'classes.json') {
    extractDbArray(out, root, [['name', 'safe']]);
  } else if (base === 'items.json') {
    extractDbArray(out, root, [['name', 'safe'], ['description', 'safe']]);
  } else if (base === 'weapons.json') {
    extractDbArray(out, root, [['name', 'safe'], ['description', 'safe']]);
  } else if (base === 'armors.json') {
    extractDbArray(out, root, [['name', 'safe'], ['description', 'safe']]);
  } else if (base === 'skills.json') {
    extractDbArray(out, root, [['name', 'safe'], ['description', 'safe'], ['message1', 'safe'], ['message2', 'safe']]);
  } else if (base === 'states.json') {
    extractDbArray(out, root, [
      ['name', 'safe'], ['description', 'safe'],
      ['message1', 'safe'], ['message2', 'safe'], ['message3', 'safe'], ['message4', 'safe'],
    ]);
  } else if (base === 'enemies.json') {
    extractDbArray(out, root, [['name', 'safe']]);
  } else if (base === 'troops.json') {
    extractDbArray(out, root, [['name', 'safe']]);
  } else if (base === 'commonevents.json') {
    extractDbArray(out, root, [['name', 'balanced']]);
  } else if (base === 'mapinfos.json') {
    extractDbArray(out, root, [['name', 'safe']]);
  } else if (/^map\d+\.json$/.test(base)) {
    if (root && typeof root === 'object' && !Array.isArray(root)) {
      pushIfValid(out, root.displayName, 'safe', 'dialogueText');
    }
  }
}

function extractDialogs(source, fileName) {
  const parsed = parseJsonWithOffsets(String(source ?? ''));
  if (!parsed.ok) return [];
  const root = parsed.value;

  const out = [];
  dispatchByFileName(out, fileName, root);
  walkEventsGeneric(out, root, 0);

  const seen = new Set();
  const dedup = [];
  for (const d of out) {
    const key = d.contentStart + ':' + d.contentEnd;
    if (seen.has(key)) continue;
    seen.add(key);
    dedup.push(d);
  }
  dedup.sort((a, b) => a.contentStart - b.contentStart);
  for (let i = 0; i < dedup.length; i++) dedup[i].lineIndex = i;
  return dedup;
}

function applyTranslations(source, dialogs, _eol, _creditLine) {
  const reps = [];
  for (const d of dialogs) {
    if (d.translated == null) continue;
    reps.push({
      start: d.contentStart,
      end: d.contentEnd,
      value: escapeForJsonString(d.translated),
    });
  }
  reps.sort((a, b) => b.start - a.start);

  let out = String(source ?? '');
  for (const r of reps) out = out.slice(0, r.start) + r.value + out.slice(r.end);
  // NOTE: unlike the Ren'Py tool, we never append a trailing credit line —
  // RPG Maker data files are pure JSON and a trailing comment would break them.
  return out;
}

export const RPGM = { extractDialogs, applyTranslations, setMode, getMode };
