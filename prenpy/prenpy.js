const $ = (id) => document.getElementById(id);

const APP_VERSION = 2;
const STORAGE_KEY = "rpyt_workbench_v2";
const CACHE_KEY = "rpyt_cache_v1";
const APIKEY_SESSION_KEY = "rpyt_apiKey_session";
const APIKEY_LOCAL_KEY = "rpyt_apiKey_local";

const TRANSLATOR_CREDIT = "# Translated by VNTranslator: https://vntranslator.vercel.app/ or https://vntranslator.pages.dev/";

const RENPH_RE = /⟦\s*RENPH\s*(?:\{\s*(\d+)\s*\}|(\d+))\s*⟧/g;
const RENPH_TEST_RE = /⟦\s*RENPH\s*(?:\{\s*\d+\s*\}|\d+)\s*⟧/;
const OLD_RENPH_TEST_RE = /__RENPLH_\d+__/;

function maskTagsInText(text) {
  const s = String(text ?? "");
  if (!s) return { masked: s, map: Object.create(null) };

  const used = new Set();
  s.replace(RENPH_RE, (_, a, b) => {
    const n = Number(a ?? b);
    if (Number.isFinite(n)) used.add(n);
    return "";
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
  let result = "";
  let lastIndex = 0;

  const tagRe = /\[[^\[\]]*\]|\{[^{}]*\}/g;
  let m;

  while ((m = tagRe.exec(s)) !== null) {
    const originalTag = m[0];
    const id = alloc();
    map[String(id)] = originalTag;
    result += s.slice(lastIndex, m.index) + `⟦RENPH{${id}}⟧`;
    lastIndex = m.index + originalTag.length;
  }

  result += s.slice(lastIndex);
  return { masked: result, map };
}

function unmaskTagsInText(text, map) {
  const s = String(text ?? "");
  if (!s || !map) return s;

  const replaced = s.replace(RENPH_RE, (full, a, b) => {
    const id = String(Number(a ?? b));
    return Object.prototype.hasOwnProperty.call(map, id) ? map[id] : full;
  });

  if (!OLD_RENPH_TEST_RE.test(replaced)) return replaced;

  return replaced.replace(/__RENPLH_(\d+)__/g, (full, n) => {
    const id = String(Number(n));
    return Object.prototype.hasOwnProperty.call(map, id) ? map[id] : full;
  });
}

function cssId(s) { return String(s).replace(/[^a-zA-Z0-9_-]/g, "_"); }
function escapeHtml(s) { return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function flagGlyph(flag) { return flag === "done" ? "✓" : flag === "review" ? "!" : "·"; }

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function now() { return Date.now(); }

function getEol(s) { return s.includes("\r\n") ? "\r\n" : "\n"; }

function safeParseJsonArray(content) {
  const raw = String(content ?? "").trim();
  if (!raw) return null;

  const stripped = raw
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();

  const a = stripped.indexOf("[");
  const b = stripped.lastIndexOf("]");
  if (a === -1 || b === -1 || b <= a) return null;

  const slice = stripped.slice(a, b + 1);
  try {
    const parsed = JSON.parse(slice);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function toast(msg) {
  $("toastMsg").textContent = msg;
  $("toast").style.display = "flex";
  clearTimeout(toast._t);
  toast._t = setTimeout(() => $("toast").style.display = "none", 2200);
}

function setStatus(mode, text, kind = "") {
  $("statusMode").textContent = mode;
  $("statusText").textContent = text;
  const dot = $("dotState");
  dot.className = "dot" + (kind ? " " + kind : "");
}

function applyTheme(theme) {
  state.theme = theme;
  $("appRoot").setAttribute("data-theme", theme);
}

function applyFontScale(scale) {
  state.fontScale = Number(scale) || 1;
  document.documentElement.style.fontSize = (14 * state.fontScale) + "px";
}

function getApiKey() {
  const remember = state.translation.rememberApiKey;
  const k = remember ? localStorage.getItem(APIKEY_LOCAL_KEY) : sessionStorage.getItem(APIKEY_SESSION_KEY);
  return String(k ?? "").trim();
}

function setApiKey(key) {
  const v = String(key ?? "");
  if (state.translation.rememberApiKey) {
    localStorage.setItem(APIKEY_LOCAL_KEY, v);
    sessionStorage.removeItem(APIKEY_SESSION_KEY);
  } else {
    sessionStorage.setItem(APIKEY_SESSION_KEY, v);
    localStorage.removeItem(APIKEY_LOCAL_KEY);
  }
}

function loadCache() {
  const raw = localStorage.getItem(CACHE_KEY);
  if (!raw) return { order: [], map: Object.create(null) };
  try {
    const obj = JSON.parse(raw);
    const order = Array.isArray(obj?.order) ? obj.order : [];
    const map = obj?.map && typeof obj.map === "object" ? obj.map : Object.create(null);
    return { order, map };
  } catch {
    return { order: [], map: Object.create(null) };
  }
}

function saveCache(c) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ order: c.order, map: c.map }));
  } catch {}
}

function cacheGet(k) {
  const c = cacheGet._c || (cacheGet._c = loadCache());
  const v = c.map[k];
  if (typeof v !== "string") return null;
  const i = c.order.indexOf(k);
  if (i >= 0) { c.order.splice(i, 1); c.order.push(k); }
  return v;
}

function cacheSet(k, v) {
  const c = cacheGet._c || (cacheGet._c = loadCache());
  c.map[k] = String(v ?? "");
  const i = c.order.indexOf(k);
  if (i >= 0) c.order.splice(i, 1);
  c.order.push(k);
  const MAX = 5000;
  while (c.order.length > MAX) {
    const old = c.order.shift();
    if (old) delete c.map[old];
  }
  saveCache(c);
}

function makeAbortableTimeoutSignal(ms, parentSignal) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(new DOMException("Timeout", "AbortError")), ms);
  const cleanup = () => clearTimeout(t);

  if (parentSignal) {
    if (parentSignal.aborted) ctrl.abort(parentSignal.reason);
    else parentSignal.addEventListener("abort", () => ctrl.abort(parentSignal.reason), { once: true });
  }

  ctrl.signal.addEventListener("abort", cleanup, { once: true });
  return ctrl.signal;
}

async function fetchJson(url, { method = "GET", headers = {}, body, timeoutMs = 60000, signal } = {}) {
  const s = makeAbortableTimeoutSignal(timeoutMs, signal);
  const res = await fetch(url, { method, headers, body, signal: s });
  const text = await res.text().catch(() => "");
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text}`);
  if (!text) return null;
  try { return JSON.parse(text); } catch { return text; }
}

function langLabel(name) { return String(name || "").trim() || "English"; }

function getLingvaTargetCode(name) {
  const m = {
    "English": "en",
    "Chinese (Simplified)": "zh",
    "Hindi": "hi",
    "Spanish": "es",
    "French": "fr",
    "Arabic": "ar",
    "Portuguese": "pt",
    "Russian": "ru",
    "German": "de",
    "Japanese": "ja",
    "Bahasa Indonesia": "id",
    "Malay": "ms",
    "Vietnamese": "vi",
    "Filipino": "tl",
    "Korean": "ko",
  };
  return m[name] || "en";
}

function getDeepLLangCode(name) {
  const m = {
    "English": "EN-US",
    "Chinese (Simplified)": "ZH-HANS",
    "Hindi": "HI",
    "Spanish": "ES",
    "French": "FR",
    "Arabic": "AR",
    "Portuguese": "PT-PT",
    "Russian": "RU",
    "German": "DE",
    "Japanese": "JA",
    "Bahasa Indonesia": "ID",
    "Vietnamese": "VI",
    "Korean": "KO",
  };
  return m[name] || null;
}

function engineSupports(engine, langName) {
  if (engine === "deepseek") return true;
  if (engine === "libre") return true;
  if (engine === "deepl") return !!getDeepLLangCode(langName);
  return false;
}

const LINGVA_BASE_URLS = [
  "https://lingva.lunar.icu",
  "https://lingva.dialectapp.org",
  "https://lingva.ml",
  "https://lingva.vercel.app",
  "https://translate.plausibility.cloud",
  "https://lingva.garudalinux.org",
];

async function translateBatchDeepSeek(batchDialogs, targetLang, apiKey, { route, timeoutMs, signal } = {}) {
  const src = batchDialogs.map(d => d.maskedQuote || d.quote || "");
  const languageName = langLabel(targetLang);
  const payload = JSON.stringify(src);

  const prompt =
    `Translate Ren'Py dialogue strings to ${languageName}.\n` +
    `Rules:\n` +
    `- DO NOT translate or modify placeholders like ⟦RENPH{0}⟧.\n` +
    `- Preserve ALL Ren'Py tags, syntax, and variables (e.g., {fast}, [player_name]).\n` +
    `- DO NOT merge, split, or reorder lines.\n` +
    `- Translate naturally by context (avoid word-by-word).\n` +
    `Result: Return a JSON array of translated strings, same length and order as input.\n\n` +
    `Input JSON array:\n` +
    payload;

  const bodyForProxy = {
    apiKey,
    model: "deepseek-chat",
    messages: [
      { role: "system", content: "You translate Ren'Py scripts and preserve tags/placeholders exactly." },
      { role: "user", content: prompt }
    ],
    stream: false
  };

  const data = await fetchJson(route || "/api/deepseek-proxy", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(bodyForProxy),
    timeoutMs,
    signal
  });

  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error("DeepSeek response missing content.");

  const arr = safeParseJsonArray(content);
  if (!arr) throw new Error("DeepSeek output is not a valid JSON array.");

  const out = arr.map(x => (typeof x === "string" ? x : String(x ?? "")));
  return out;
}

async function translateBatchDeepL(batchDialogs, targetLang, apiKey, { route, timeoutMs, signal } = {}) {
  const lines = batchDialogs.map(d => d.maskedQuote || d.quote || "");
  const targetCode = getDeepLLangCode(targetLang);
  if (!targetCode) throw new Error("This language is not supported by DeepL API in this build.");

  const bodyForProxy = {
    apiKey,
    text: lines,
    target_lang: targetCode,
    preserve_formatting: 1,
    split_sentences: 0
  };

  const data = await fetchJson(route || "/api/deepl-trans", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(bodyForProxy),
    timeoutMs,
    signal
  });

  const translations = Array.isArray(data?.translations) ? data.translations : [];
  const out = translations.map(t => (t && typeof t.text === "string") ? t.text : "");
  return out;
}

async function translateOneLingva(text, targetLang, { timeoutMs, signal } = {}) {
  const target = getLingvaTargetCode(targetLang);
  const query = encodeURIComponent(String(text ?? ""));
  const tries = [...LINGVA_BASE_URLS];

  for (let i = 0; i < tries.length; i++) {
    const base = tries[(now() + i) % tries.length];
    const url = `${base}/api/v1/auto/${target}/${query}`;
    try {
      const data = await fetchJson(url, { timeoutMs, signal });
      const t = typeof data?.translation === "string" ? data.translation : "";
      if (t) return t;
    } catch {}
  }

  throw new Error("Lingva failed on all mirrors.");
}

async function translateBatchLingva(batchDialogs, targetLang, { concurrency, timeoutMs, signal } = {}) {
  const lines = batchDialogs.map(d => d.maskedQuote || d.quote || "");
  const out = new Array(lines.length).fill("");

  let idx = 0;
  const c = Math.max(1, Math.min(8, Number(concurrency) || 3));

  const workers = new Array(c).fill(0).map(async () => {
    while (idx < lines.length) {
      const i = idx++;
      out[i] = await translateOneLingva(lines[i], targetLang, { timeoutMs, signal });
    }
  });

  await Promise.all(workers);
  return out;
}

function validateUnmasked(unmasked) {
  const t = String(unmasked ?? "");
  if (!t.trim()) return false;
  if (RENPH_TEST_RE.test(t) || OLD_RENPH_TEST_RE.test(t)) return false;
  return true;
}

async function translateBatch(engine, batchDialogs, targetLang, apiKey, opts) {
  if (engine === "deepseek") return translateBatchDeepSeek(batchDialogs, targetLang, apiKey, opts);
  if (engine === "deepl") return translateBatchDeepL(batchDialogs, targetLang, apiKey, opts);
  if (engine === "libre") return translateBatchLingva(batchDialogs, targetLang, opts);
  throw new Error("Unknown engine.");
}

const RENPY = (() => {
  const PREFIX_CHARS = new Set(["r","R","u","U","b","B","f","F"]);
  const SCRIPT_SKIP_HEADS = new Set([
    "label","init","python","transform","style","screen","key",
    "define","default","translate","old","new",
    "return","jump","call","if","elif","else","for","while","try","except","finally",
    "pass","break","continue","import","from","$","renpy","action",
    "outlines","outline_scaling","text_font","font","text_color","text_size","color",
    "xpos","ypos","xalign","yalign","align","anchor","pos","xysize","size","zorder","tag"
  ]);

  const ASSET_HEADS = new Set(["play","queue","stop","voice","sound","sound2","ambience","music"]);
  const SCREEN_ALLOWED_HEADS = new Set(["text","textbutton","label","vtext","htext"]);
  const NON_TRANSLATABLE_ATTRS = new Set([
    "style","font","text_font","background","hover_sound","activate_sound","selected_sound","insensitive_sound",
    "channel","play","start_image","image","add","xysize","xpos","ypos","align","anchor","zorder","tag"
  ]);

  const NON_TRANSLATABLE_CALLS = new Set([
    "jump","call","showmenu","openurl","fileaction","setvariable","setscreenvariable",
    "renpy.call","renpy.jump","renpy.call_in_new_context","renpy.invoke_in_new_context"
  ]);

  let HAS_UNICODE_PROPS = true;
  try { new RegExp("\\p{L}", "u"); } catch { HAS_UNICODE_PROPS = false; }

  let MODE = "safe";
  function setMode(mode) {
    const v = String(mode || "").toLowerCase().trim();
    MODE = (v === "balanced" || v === "aggressive") ? v : "safe";
  }
  function getMode() { return MODE; }

  function isWordChar(ch) { return /[A-Za-z0-9_]/.test(ch); }

  function buildLineStarts(source) {
    const starts = [0];
    for (let i = 0; i < source.length; i++) if (source[i] === "\n") starts.push(i + 1);
    return starts;
  }

  function offsetToLine(lineStarts, offset) {
    let lo = 0;
    let hi = lineStarts.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const v = lineStarts[mid];
      if (v <= offset) lo = mid + 1;
      else hi = mid - 1;
    }
    return Math.max(0, Math.min(hi, lineStarts.length - 1));
  }

  function computeBlockMasks(lines) {
    const n = lines.length;
    const inPython = new Array(n).fill(false);
    const inScreen = new Array(n).fill(false);
    const inMenu = new Array(n).fill(false);
    const inStyle = new Array(n).fill(false);
    const inTransform = new Array(n).fill(false);

    const stack = [];
    function popTo(indent) { while (stack.length && indent <= stack[stack.length - 1].indent) stack.pop(); }

    for (let i = 0; i < n; i++) {
      const raw = lines[i];
      const stripped = raw.trim();
      const indent = (raw.match(/^\s*/)?.[0]?.length) || 0;

      if (stripped && !raw.trimStart().startsWith("#")) {
        popTo(indent);

        if (/^\s*(init\s+python|python)\s*:\s*$/.test(raw)) stack.push({ type: "python", indent });
        else if (/^\s*screen\s+[A-Za-z_]\w*\s*(\([^)]*\))?\s*:\s*$/.test(raw)) stack.push({ type: "screen", indent });
        else if (/^\s*menu\s*:\s*$/.test(raw)) stack.push({ type: "menu", indent });
        else if (/^\s*style\s+[A-Za-z_]\w*\s*:\s*$/.test(raw)) stack.push({ type: "style", indent });
        else if (/^\s*transform\s+[A-Za-z_]\w*\s*:\s*$/.test(raw)) stack.push({ type: "transform", indent });
      }

      const types = new Set(stack.map(x => x.type));
      inPython[i] = types.has("python");
      inScreen[i] = types.has("screen");
      inMenu[i] = types.has("menu");
      inStyle[i] = types.has("style");
      inTransform[i] = types.has("transform");
    }

    return { inPython, inScreen, inMenu, inStyle, inTransform };
  }

  function scanStringLiterals(source, lineStarts) {
    const out = [];
    let i = 0;

    while (i < source.length) {
      const ch = source[i];

      if (ch === "#") {
        const nl = source.indexOf("\n", i);
        if (nl === -1) break;
        i = nl + 1;
        continue;
      }

      const prev = i > 0 ? source[i - 1] : "";
      let prefix = "";
      let quoteChar = "";
      let openStart = i;
      let openQuoteStart = -1;

      if (ch === '"' || ch === "'") {
        quoteChar = ch;
        openQuoteStart = i;
      } else if (PREFIX_CHARS.has(ch) && !isWordChar(prev)) {
        let j = i;
        while (j < source.length && PREFIX_CHARS.has(source[j]) && (j - i) < 3) j++;
        if (j < source.length && (source[j] === '"' || source[j] === "'")) {
          prefix = source.slice(i, j);
          quoteChar = source[j];
          openQuoteStart = j;
        } else {
          i++;
          continue;
        }
      } else {
        i++;
        continue;
      }

      const triple = quoteChar + quoteChar + quoteChar;
      const isTriple = source.startsWith(triple, openQuoteStart);
      const delim = isTriple ? triple : quoteChar;
      const contentStart = openQuoteStart + delim.length;

      let contentEnd = -1;
      let endOffset = -1;

      if (isTriple) {
        const close = source.indexOf(delim, contentStart);
        if (close === -1) { i = contentStart; continue; }
        contentEnd = close;
        endOffset = close + delim.length;
      } else {
        let j = contentStart;
        let esc = false;
        while (j < source.length) {
          const c = source[j];
          if (c === "\n") break;
          if (!esc && c === quoteChar) {
            contentEnd = j;
            endOffset = j + 1;
            break;
          }
          if (c === "\\" && !esc) esc = true;
          else esc = false;
          j++;
        }
        if (endOffset === -1) { i = contentStart; continue; }
      }

      out.push({
        openStart,
        openQuoteStart,
        contentStart,
        contentEnd,
        endOffset,
        prefix,
        quoteChar,
        isTriple,
        startLine: offsetToLine(lineStarts, openStart),
        endLine: offsetToLine(lineStarts, Math.max(openStart, endOffset - 1)),
        value: source.slice(contentStart, contentEnd),
      });

      i = endOffset;
    }

    return out;
  }

  function stripMarkupForCheck(text) {
    return String(text || "")
      .replace(/\{[^{}]*\}/gs, "")
      .replace(/\[[^\[\]]*\]/gs, "")
      .trim();
  }

  function isMeaningfulText(text) {
    const t = stripMarkupForCheck(text);
    if (!t) return false;
    if (HAS_UNICODE_PROPS) return /[\p{L}\p{N}]/u.test(t);
    return /[A-Za-z0-9]/.test(t);
  }

  function isLikelyAssetString(text) {
    const t = String(text || "").trim();
    if (/\.(png|jpg|jpeg|webp|gif|ogg|mp3|wav|mp4|webm|m4a|avi|mov|ttf|otf|woff|woff2|eot|svg)(\?.*)?$/i.test(t)) return true;
    if ((t.includes("/") || t.includes("\\")) && /\.\w{2,4}(\?.*)?$/.test(t)) return true;
    return false;
  }

  function isUrlString(text) {
    const t = String(text || "").trim().toLowerCase();
    return t.startsWith("http://") || t.startsWith("https://") || t.startsWith("mailto:") || t.startsWith("www.");
  }

  function getHeadToken(textBeforeFirstLiteral) {
    const m = String(textBeforeFirstLiteral || "").trimStart().match(/^([A-Za-z_][\w\.]*)/);
    return (m ? m[1] : "");
  }

  function prevIdentifierAt(line, quotePosInLine) {
    let j = quotePosInLine - 1;
    while (j >= 0 && /\s/.test(line[j])) j--;
    if (j >= 0 && line[j] === "(") {
      j--;
      while (j >= 0 && /\s/.test(line[j])) j--;
    }
    let k = j;
    while (k >= 0 && /[A-Za-z0-9_\.]/.test(line[k])) k--;
    return line.slice(k + 1, j + 1);
  }

  function isWrappedByUnderscore(source, openQuoteStart) {
    let j = openQuoteStart - 1;
    while (j >= 0 && /\s/.test(source[j])) j--;
    if (j >= 0 && source[j] === "(") {
      j--;
      while (j >= 0 && /\s/.test(source[j])) j--;
      if (j >= 0 && source[j] === "_") {
        const k = j - 1;
        if (k < 0 || !/[A-Za-z0-9_]/.test(source[k])) return true;
      }
    }
    return false;
  }

  function isSayStatement(prefixTrimmed, fullLineTrimmed) {
    if (!prefixTrimmed) return true;

    const head = getHeadToken(prefixTrimmed).toLowerCase();
    if (!head) return false;

    if (ASSET_HEADS.has(head)) return false;

    if (SCRIPT_SKIP_HEADS.has(head)) {
      if (head === "show" && /^\s*show\s+text\b/i.test(fullLineTrimmed)) return true;
      return false;
    }

    if (/\b(action|Jump|Call|ShowMenu|OpenURL|SetVariable|FileAction)\b/.test(prefixTrimmed)) return false;
    if (/(^|[^=!<>])=([^=]|$)/.test(prefixTrimmed)) return false;
    if (prefixTrimmed.includes(":")) return false;

    return true;
  }

  function menuOptionColonPos(line, afterIndex) {
    const cut = line.includes("#") ? line.slice(0, line.indexOf("#")) : line;
    const pos = cut.indexOf(":", afterIndex);
    if (pos === -1) return null;
    if (cut.slice(pos + 1).trim() !== "") return null;
    return pos;
  }

  function escapeForRenpyString(text, quoteChar, isTriple) {
    let t = String(text ?? "");
    if (!isTriple) {
      t = t.replace(/\r?\n/g, "\\n");
      if (quoteChar === '"') t = t.replace(/"/g, '\\"');
      else t = t.replace(/'/g, "\\'");
      return t;
    }
    if (quoteChar === '"') return t.replace(/"""/g, '\\"""');
    return t.replace(/'''/g, "\\'''");
  }

  function extractDialogs(source) {
    const lines = source.split(/\r?\n/);
    const lineStarts = buildLineStarts(source);
    const masks = computeBlockMasks(lines);
    const literals = scanStringLiterals(source, lineStarts);

    const byLine = new Map();
    for (const lit of literals) {
      if (!byLine.has(lit.startLine)) byLine.set(lit.startLine, []);
      byLine.get(lit.startLine).push(lit);
    }

    const dialogs = [];

    for (const [lineIdx, list] of byLine.entries()) {
      if (masks.inPython[lineIdx] || masks.inStyle[lineIdx] || masks.inTransform[lineIdx]) continue;
      if (MODE === "safe" && masks.inScreen[lineIdx]) continue;

      list.sort((a, b) => a.openStart - b.openStart);

      const line = lines[lineIdx] ?? "";
      const lineTrimmed = line.trim();
      const lineStartOffset = lineStarts[lineIdx] ?? 0;
      const first = list[0];

      const prefixTrimmed = source.slice(lineStartOffset, first.openStart).trim();
      const zone = masks.inScreen[lineIdx] ? "screen" : "script";

      let isMenuOption = false;
      let colonPos = null;

      const firstNonSpacePos = lineStartOffset + (line.length - line.trimStart().length);
      if (masks.inMenu[lineIdx] && first.openStart === firstNonSpacePos && !first.isTriple) {
        const after = first.endOffset - lineStartOffset;
        const cp = menuOptionColonPos(line, after);
        if (cp != null) { isMenuOption = true; colonPos = cp; }
      }

      const isSay = zone === "script" && isSayStatement(prefixTrimmed, lineTrimmed);
      const head = getHeadToken(prefixTrimmed);
      const screenAllowed = zone === "screen" && SCREEN_ALLOWED_HEADS.has(head.toLowerCase());

      for (const lit of list) {
        const raw = lit.value;

        if (!isMeaningfulText(raw)) continue;
        if (isLikelyAssetString(raw) || isUrlString(raw)) continue;

        const quotePosInLine = lit.openQuoteStart - lineStartOffset;
        const prevId = prevIdentifierAt(line, quotePosInLine).toLowerCase();
        if (NON_TRANSLATABLE_ATTRS.has(prevId) || NON_TRANSLATABLE_CALLS.has(prevId)) continue;

        const inWrap = isWrappedByUnderscore(source, lit.openQuoteStart);

        let allowed = false;

        if (MODE === "safe") {
          if (zone !== "script") allowed = false;
          else if (isMenuOption && colonPos != null) allowed = (lit.openStart - lineStartOffset) < colonPos;
          else allowed = isSay;
          if (inWrap && !(isSay || isMenuOption)) allowed = false;
        } else {
          if (zone === "screen") allowed = inWrap || (screenAllowed && lit === first);
          else {
            if (isMenuOption && colonPos != null) allowed = (lit.openStart - lineStartOffset) < colonPos;
            else allowed = isSay || inWrap;
          }
        }

        if (!allowed) continue;

        const maskedInfo = maskTagsInText(raw);

        dialogs.push({
          lineIndex: lineIdx,
          contentStart: lit.contentStart,
          contentEnd: lit.contentEnd,
          quoteChar: lit.quoteChar,
          isTriple: lit.isTriple,
          quote: raw,
          maskedQuote: maskedInfo.masked,
          placeholderMap: maskedInfo.map,
          speakerToken: head || "",
        });
      }
    }

    return dialogs;
  }

  function applyTranslations(source, dialogs, eol, creditLine) {
    const reps = [];
    for (const d of dialogs) {
      if (d.translated == null) continue;
      reps.push({ start: d.contentStart, end: d.contentEnd, value: escapeForRenpyString(d.translated, d.quoteChar, d.isTriple) });
    }
    reps.sort((a, b) => b.start - a.start);

    let out = source;
    for (const r of reps) out = out.slice(0, r.start) + r.value + out.slice(r.end);

    const nl = eol || (out.includes("\r\n") ? "\r\n" : "\n");
    const credit = String(creditLine || "").trim();
    return credit ? (out + nl + nl + credit + nl) : (out + nl);
  }

  return { extractDialogs, applyTranslations, setMode, getMode };
})();

const state = {
  version: APP_VERSION,
  projectName: "Untitled Project",
  activeFileId: null,
  selectedRowId: null,
  pinned: false,
  theme: "dark",
  autosave: true,
  autosaveIntervalSec: 30,
  fontScale: 1,
  scope: "all",
  tabs: { google: true, manual: true, atlas: true, trans2: true },
  pageSize: 200,
  page: 0,
  undo: [],
  redo: [],
  translation: {
    targetLang: "Vietnamese",
    engine: "deepseek",
    outputCol: "google",
    extractMode: "safe",
    rememberApiKey: false,
    batchSize: 20,
    concurrency: 3,
    timeoutMs: 60000,
    deepseekRoute: "/api/deepseek-proxy",
    deeplRoute: "/api/deepl-trans"
  },
  job: { running: false, abort: null },
  files: []
};

function snapshotForSave() {
  return {
    version: state.version,
    projectName: state.projectName,
    activeFileId: state.activeFileId,
    selectedRowId: state.selectedRowId,
    pinned: state.pinned,
    theme: state.theme,
    autosave: state.autosave,
    autosaveIntervalSec: state.autosaveIntervalSec,
    fontScale: state.fontScale,
    scope: state.scope,
    tabs: state.tabs,
    pageSize: state.pageSize,
    page: state.page,
    translation: {
      targetLang: state.translation.targetLang,
      engine: state.translation.engine,
      outputCol: state.translation.outputCol,
      extractMode: state.translation.extractMode,
      rememberApiKey: state.translation.rememberApiKey,
      batchSize: state.translation.batchSize,
      concurrency: state.translation.concurrency,
      timeoutMs: state.translation.timeoutMs,
      deepseekRoute: state.translation.deepseekRoute,
      deeplRoute: state.translation.deeplRoute
    },
    files: state.files
  };
}

function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshotForSave())); } catch {}
  setStatus("SAVED", "Project saved.", "good");
}

function load() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      const s = JSON.parse(saved);
      if (s && typeof s === "object") Object.assign(state, s);
    } catch {}
  }
  applyTheme(state.theme);
  applyFontScale(state.fontScale);
  if (!state.files?.length) {
    state.files = [];
    state.activeFileId = null;
  } else {
    if (!state.activeFileId) state.activeFileId = state.files[0]?.id ?? null;
  }
  syncUIFromState();
  renderFiles();
  renderGrid();
  syncPreview();
  toast("Ready.");
  setStatus("READY", "Loaded.", "good");
}

function setDirty() { setStatus("EDITING", "Unsaved changes.", "warn"); }

let autosaveTimer = null;
function scheduleAutosave() {
  if (!state.autosave) return;
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => save(), Math.max(5, state.autosaveIntervalSec) * 1000);
}

function activeFile() { return state.files.find(f => f.id === state.activeFileId) ?? null; }

function selectedRow() {
  const f = activeFile();
  if (!f) return null;
  return f.rows.find(r => r.id === state.selectedRowId) ?? null;
}

function fileProgress(file) {
  const total = file.rows.length || 1;
  const done = file.rows.filter(r => r.flag === "done").length;
  return Math.round((done / total) * 100);
}

function renderFiles() {
  const filter = $("fileFilter").value.trim().toLowerCase();
  const sort = $("fileSort").value;
  let list = [...state.files];

  if (filter) list = list.filter(f => f.name.toLowerCase().includes(filter));
  if (sort === "name") list.sort((a, b) => a.name.localeCompare(b.name));
  if (sort === "progress") list.sort((a, b) => fileProgress(b) - fileProgress(a));
  if (sort === "recent") list.sort((a, b) => b.updated - a.updated);

  const wrap = $("fileList");
  wrap.innerHTML = "";
  list.forEach(f => {
    const pct = fileProgress(f);
    const row = document.createElement("div");
    row.className = "fileRow";
    row.id = `fileRow_${cssId(f.id)}`;
    row.dataset.active = String(f.id === state.activeFileId);
    row.innerHTML = `
      <div class="fileName" id="fileName_${cssId(f.id)}">${escapeHtml(f.name)}</div>
      <div class="filePct" id="filePct_${cssId(f.id)}">${pct}%</div>
      <div class="fileBar" id="fileBar_${cssId(f.id)}"><div class="fileFill" id="fileFill_${cssId(f.id)}" style="width:${pct}%"></div></div>
    `;
    row.addEventListener("click", () => {
      state.activeFileId = f.id;
      state.selectedRowId = null;
      state.page = 0;
      renderFiles();
      renderGrid();
      syncPreview();
      save();
    });
    wrap.appendChild(row);
  });

  $("projectName").textContent = state.projectName || "No project loaded";
}

function syncColumns() {
  $("tabGoogle").dataset.active = String(state.tabs.google);
  $("tabManual").dataset.active = String(state.tabs.manual);
  $("tabAtlas").dataset.active = String(state.tabs.atlas);
  $("tabTrans2").dataset.active = String(state.tabs.trans2);

  toggleCol("Google", state.tabs.google);
  toggleCol("Manual", state.tabs.manual);
  toggleCol("Atlas", state.tabs.atlas);
  toggleCol("Trans2", state.tabs.trans2);

  function toggleCol(name, on) {
    const head = $("h" + name);
    if (head) head.style.display = on ? "" : "none";
    document.querySelectorAll(`[id^="cell${name}_"]`).forEach(el => el.style.display = on ? "" : "none");
    const header = $("gridHeader");
    const any = ["Google", "Manual", "Atlas", "Trans2"].map(n => state.tabs[n.toLowerCase()]).filter(Boolean).length;
    header.style.gridTemplateColumns = `44px 1.4fr ${any ? "1.2fr ".repeat(any) : ""}44px`;
    document.querySelectorAll(".row").forEach(r => { r.style.gridTemplateColumns = header.style.gridTemplateColumns; });
  }
}

function renderGrid() {
  const f = activeFile();
  const body = $("gridBody");
  body.innerHTML = "";
  if (!f) { $("rowCount").textContent = "0"; return; }

  const q = $("globalSearch").value.trim().toLowerCase();
  const scope = $("globalScope").value;

  let rows = f.rows.map((r, i) => ({ ...r, _i: i + 1 }));
  if (q) {
    const match = (r) => {
      const fields = [];
      if (scope === "current" || scope === "all") fields.push(r.original, r.google, r.manual, r.atlas, r.trans2, r.speaker, r.meta, (r.tags || []).join(" "));
      if (scope === "original") fields.push(r.original, r.speaker, r.meta);
      if (scope === "translated") fields.push(r.google, r.manual, r.atlas, r.trans2);
      return fields.filter(Boolean).some(x => String(x).toLowerCase().includes(q));
    };
    rows = rows.filter(match);
  }

  const pageSize = Math.max(20, Number(state.pageSize) || 200);
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  state.page = Math.max(0, Math.min(state.page, pages - 1));
  const start = state.page * pageSize;
  const view = rows.slice(start, start + pageSize);

  $("rowCount").textContent = String(rows.length);

  view.forEach(r => {
    const row = document.createElement("div");
    row.className = "row";
    row.id = `row_${cssId(r.id)}`;
    row.dataset.selected = String(r.id === state.selectedRowId);
    row.innerHTML = `
      <div class="cell idx" id="cellIndex_${cssId(r.id)}">${r._i}</div>
      <div class="cell" id="cellOriginal_${cssId(r.id)}"><div class="text mono">${escapeHtml(r.original)}</div></div>
      <div class="cell" id="cellGoogle_${cssId(r.id)}"><div class="text editable" id="edGoogle_${cssId(r.id)}" contenteditable="true" data-col="google">${escapeHtml(r.google || "")}</div></div>
      <div class="cell" id="cellManual_${cssId(r.id)}"><div class="text editable" id="edManual_${cssId(r.id)}" contenteditable="true" data-col="manual">${escapeHtml(r.manual || "")}</div></div>
      <div class="cell" id="cellAtlas_${cssId(r.id)}"><div class="text editable" id="edAtlas_${cssId(r.id)}" contenteditable="true" data-col="atlas">${escapeHtml(r.atlas || "")}</div></div>
      <div class="cell" id="cellTrans2_${cssId(r.id)}"><div class="text editable" id="edTrans2_${cssId(r.id)}" contenteditable="true" data-col="trans2">${escapeHtml(r.trans2 || "")}</div></div>
      <div class="cell flag" id="cellFlag_${cssId(r.id)}">
        <button class="flagBtn" id="flagBtn_${cssId(r.id)}" data-state="${r.flag}" title="Toggle flag">${flagGlyph(r.flag)}</button>
      </div>
    `;

    row.addEventListener("click", (e) => {
      if (e.target.closest(".editable")) return;
      selectRow(r.id);
    });

    row.querySelectorAll(".editable").forEach(ed => {
      ed.addEventListener("focus", () => {
        selectRow(r.id);
        ed.dataset._start = ed.textContent ?? "";
        ed.dataset._lastTs = String(now());
      });

      ed.addEventListener("input", () => {
        const col = ed.dataset.col;
        const live = ed.textContent ?? "";
        const real = f.rows.find(x => x.id === r.id);
        if (!real) return;
        real[col] = live;
        setDirty();
        if (state.autosave) scheduleAutosave();
        if (state.selectedRowId === r.id) syncPreview();
      });

      ed.addEventListener("blur", () => {
        const col = ed.dataset.col;
        const startVal = ed.dataset._start ?? "";
        const endVal = ed.textContent ?? "";
        if (startVal !== endVal) {
          pushUndo({ type: "edit", fileId: f.id, rowId: r.id, col, prev: startVal, next: endVal });
          ed.dataset._start = endVal;
        }
      });

      ed.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter" && (ev.ctrlKey || ev.metaKey)) {
          ev.preventDefault();
          markFlag(r.id, "done");
        }
      });
    });

    const btn = row.querySelector(".flagBtn");
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const next = r.flag === "todo" ? "review" : (r.flag === "review" ? "done" : "todo");
      markFlag(r.id, next);
    });

    body.appendChild(row);
  });

  syncColumns();

  if (state.selectedRowId && !f.rows.some(x => x.id === state.selectedRowId)) state.selectedRowId = null;

  $("selIdx").textContent = state.selectedRowId || "—";
  syncPreview();
}

function selectRow(rowId) {
  state.selectedRowId = rowId;
  document.querySelectorAll(".row").forEach(r => r.dataset.selected = "false");
  const el = $("row_" + cssId(rowId));
  if (el) el.dataset.selected = "true";
  $("selIdx").textContent = rowId;
  syncPreview();
}

function setFlagBadge(flag) {
  const dot = $("flagDot");
  const text = $("flagText");
  text.textContent = flag;
  dot.className = "dot " + (flag === "done" ? "good" : flag === "review" ? "warn" : "");
}

function syncPreview() {
  const f = activeFile();
  const r = selectedRow();
  $("fileText").textContent = f?.name ?? "—";
  if (!r) {
    $("speakerTag").textContent = "—";
    $("previewText").textContent = "Select a row to preview.";
    $("metaPre").textContent = "No selection.";
    setFlagBadge("todo");
    return;
  }
  $("speakerTag").textContent = r.speaker || "—";
  const primary = (r.manual && r.manual.trim()) ? r.manual : (r.google && r.google.trim()) ? r.google : r.original;
  $("previewText").textContent = primary;
  $("metaPre").textContent = [
    `File: ${f?.name ?? ""}`,
    `Row: ${r.id}`,
    `Flag: ${r.flag}`,
    `Tags: ${(r.tags || []).join(", ") || "—"}`,
    `Meta: ${r.meta || "—"}`
  ].join("\n");
  setFlagBadge(r.flag);
}

function markFlag(rowId, flag) {
  const f = activeFile();
  if (!f) return;
  const r = f.rows.find(x => x.id === rowId);
  if (!r) return;
  pushUndo({ type: "flag", fileId: f.id, rowId, prev: r.flag, next: flag });
  r.flag = flag;
  renderFiles();
  renderGrid();
  selectRow(rowId);
  toast(flag === "done" ? "Marked done." : flag === "review" ? "Marked for review." : "Cleared flag.");
  setDirty();
  if (state.autosave) scheduleAutosave();
}

function pushUndo(op) {
  state.undo.push(op);
  if (state.undo.length > 300) state.undo.shift();
  state.redo.length = 0;
}

function applyOp(op, dir) {
  const f = state.files.find(x => x.id === op.fileId);
  if (!f) return;
  const r = f.rows.find(x => x.id === op.rowId);
  if (!r) return;
  if (op.type === "edit") {
    const val = dir === "undo" ? op.prev : op.next;
    r[op.col] = val;
  } else if (op.type === "flag") {
    r.flag = dir === "undo" ? op.prev : op.next;
  }
  state.activeFileId = f.id;
  state.selectedRowId = r.id;
  renderFiles();
  renderGrid();
  selectRow(r.id);
  setDirty();
}

function undo() {
  const op = state.undo.pop();
  if (!op) return toast("Nothing to undo.");
  state.redo.push(op);
  applyOp(op, "undo");
  toast("Undo.");
}

function redo() {
  const op = state.redo.pop();
  if (!op) return toast("Nothing to redo.");
  state.undo.push(op);
  applyOp(op, "redo");
  toast("Redo.");
}

function downloadText(text, filename, mime = "text/plain;charset=utf-8") {
  const blob = new Blob([String(text ?? "")], { type: mime });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

function newProject(name) {
  state.projectName = name || "Untitled Project";
  state.files = [];
  state.activeFileId = null;
  state.selectedRowId = null;
  state.undo = [];
  state.redo = [];
  state.page = 0;
  renderFiles();
  renderGrid();
  syncPreview();
  save();
  toast("New project created.");
}

async function importProjectJson(obj) {
  if (!obj || typeof obj !== "object" || !Array.isArray(obj.files)) throw new Error("Invalid project JSON.");
  state.projectName = String(obj.project || obj.projectName || state.projectName || "Imported Project");
  state.files = obj.files;
  state.activeFileId = state.files[0]?.id ?? null;
  state.selectedRowId = null;
  state.undo = [];
  state.redo = [];
  state.page = 0;
  renderFiles();
  renderGrid();
  syncPreview();
  save();
  toast("Project imported.");
}

function makeRenpyFileModel(name, source) {
  RENPY.setMode(state.translation.extractMode);
  const dialogs = RENPY.extractDialogs(source);
  const eol = getEol(source);

  const rows = dialogs.map((d, i) => ({
    id: crypto.randomUUID(),
    speaker: d.speakerToken || "",
    original: d.quote,
    google: "",
    manual: "",
    atlas: "",
    trans2: "",
    flag: "todo",
    meta: `${name} / line ${d.lineIndex + 1}`,
    tags: ["dialogue"],
    _renpyIndex: i
  }));

  return {
    id: name,
    name,
    kind: "renpy",
    updated: now(),
    source,
    eol,
    dialogs,
    rows
  };
}

async function importFiles(fileList) {
  const files = Array.from(fileList || []);
  if (!files.length) return;

  let importedAny = false;

  for (const file of files) {
    const name = file.name || "file";
    const ext = name.split(".").pop()?.toLowerCase() || "";
    const text = await file.text();

    if (ext === "json") {
      try {
        const obj = JSON.parse(text);
        if (obj && typeof obj === "object" && Array.isArray(obj.files)) {
          await importProjectJson(obj);
          importedAny = true;
          continue;
        }
      } catch {}
    }

    if (ext === "rpy") {
      const model = makeRenpyFileModel(name, text);
      state.files = state.files.filter(f => f.id !== model.id);
      state.files.push(model);
      importedAny = true;
      continue;
    }

    const lines = text.split(/\r?\n/).filter(x => x.trim());
    const rows = lines.map((ln) => ({
      id: crypto.randomUUID(),
      speaker: "",
      original: ln,
      google: "",
      manual: "",
      atlas: "",
      trans2: "",
      flag: "todo",
      meta: `${name}`,
      tags: ["text"]
    }));

    state.files = state.files.filter(f => f.id !== name);
    state.files.push({ id: name, name, kind: "text", updated: now(), source: text, eol: getEol(text), dialogs: null, rows });
    importedAny = true;
  }

  if (importedAny) {
    state.activeFileId = state.files[state.files.length - 1]?.id ?? state.activeFileId;
    state.selectedRowId = null;
    state.page = 0;
    renderFiles();
    renderGrid();
    syncPreview();
    save();
    toast("Imported.");
  }
}

function exportProjectJson() {
  const payload = JSON.stringify({ project: state.projectName, files: state.files }, null, 2);
  const name = (state.projectName || "project").replace(/\s+/g, "_") + ".json";
  downloadText(payload, name, "application/json;charset=utf-8");
  setStatus("EXPORTED", "Exported JSON snapshot.", "good");
}

function exportCurrentRenpy() {
  const f = activeFile();
  if (!f) return toast("No active file.");
  if (f.kind !== "renpy" || !f.dialogs || !f.source) return toast("Active file is not a .rpy import.");
  const col = state.translation.outputCol || "google";

  const dialogs = f.dialogs;
  for (let i = 0; i < dialogs.length; i++) {
    const d = dialogs[i];
    const row = f.rows.find(r => r._renpyIndex === i);
    if (!row) continue;

    const chosen = (row.manual && row.manual.trim()) ? row.manual : (row[col] && row[col].trim()) ? row[col] : "";
    if (!chosen) { d.translated = null; continue; }

    const unmasked = unmaskTagsInText(chosen, d.placeholderMap);
    d.translated = unmasked;
  }

  const out = RENPY.applyTranslations(f.source, dialogs, f.eol, TRANSLATOR_CREDIT);
  downloadText(out, f.name);
  setStatus("EXPORTED", "Exported translated .rpy.", "good");
}

async function translateRows(rows, file) {
  const engine = state.translation.engine;
  const lang = state.translation.targetLang;
  const outputCol = state.translation.outputCol || "google";
  const apiKey = getApiKey();

  if (!engineSupports(engine, lang)) throw new Error("Selected engine does not support this target language.");

  if (engine !== "libre" && !apiKey) throw new Error("Missing API key.");

  const timeoutMs = Math.max(5000, Number(state.translation.timeoutMs) || 60000);
  const batchSize = Math.max(1, Math.min(80, Number(state.translation.batchSize) || 20));
  const concurrency = Math.max(1, Math.min(8, Number(state.translation.concurrency) || 3));

  const routeDeepseek = String(state.translation.deepseekRoute || "/api/deepseek-proxy").trim();
  const routeDeepl = String(state.translation.deeplRoute || "/api/deepl-trans").trim();

  const abortCtrl = new AbortController();
  state.job.running = true;
  state.job.abort = abortCtrl;
  $("btnBatch").textContent = "Stop";
  setStatus("RUNNING", `Translating (${engine} → ${lang})…`, "warn");

  const pending = rows.filter(r => {
    const t = String(r[outputCol] ?? "").trim();
    return !t;
  });

  let doneCount = 0;

  try {
    for (let i = 0; i < pending.length; i += batchSize) {
      if (abortCtrl.signal.aborted) throw new DOMException("Aborted", "AbortError");

      const batch = pending.slice(i, i + batchSize);

      const batchDialogs = batch.map(r => {
        if (file?.kind === "renpy" && file.dialogs && Number.isFinite(r._renpyIndex)) {
          return file.dialogs[r._renpyIndex];
        }
        const maskedInfo = maskTagsInText(r.original);
        return { quote: r.original, maskedQuote: maskedInfo.masked, placeholderMap: maskedInfo.map };
      });

      const keyParts = (d) => `${engine}|${lang}|${d.maskedQuote || d.quote || ""}`;
      const cached = [];
      const need = [];
      const needIdx = [];

      for (let bi = 0; bi < batchDialogs.length; bi++) {
        const d = batchDialogs[bi];
        const k = keyParts(d);
        const hit = cacheGet(k);
        if (hit != null) cached[bi] = hit;
        else { need.push(d); needIdx.push(bi); }
      }

      let translatedMasked = [];
      if (need.length) {
        const outArr = await translateBatch(engine, need, lang, apiKey, {
          route: engine === "deepseek" ? routeDeepseek : routeDeepl,
          timeoutMs,
          concurrency,
          signal: abortCtrl.signal
        });
        translatedMasked = outArr;
      }

      const finalArr = new Array(batchDialogs.length).fill("");
      for (let bi = 0; bi < batchDialogs.length; bi++) {
        if (cached[bi] != null) finalArr[bi] = cached[bi];
      }
      for (let j = 0; j < needIdx.length; j++) {
        const bi = needIdx[j];
        finalArr[bi] = String(translatedMasked[j] ?? "");
        const k = keyParts(batchDialogs[bi]);
        cacheSet(k, finalArr[bi]);
      }

      for (let bi = 0; bi < batch.length; bi++) {
        const row = batch[bi];
        const d = batchDialogs[bi];
        const maskedOut = finalArr[bi];
        const unmasked = unmaskTagsInText(maskedOut, d.placeholderMap);

        if (!validateUnmasked(unmasked)) {
          row[outputCol] = unmasked;
          row.flag = row.flag === "done" ? "done" : "review";
        } else {
          row[outputCol] = unmasked;
        }
      }

      doneCount += batch.length;
      file.updated = now();
      renderFiles();
      renderGrid();
      syncPreview();
      setDirty();
      if (state.autosave) scheduleAutosave();

      setStatus("RUNNING", `Translated ${doneCount}/${pending.length}…`, "warn");
      await sleep(engine === "libre" ? 250 : 600);
    }

    setStatus("DONE", "Translation finished.", "good");
    toast("Translation finished.");
    save();
  } catch (e) {
    if (String(e?.name) === "AbortError") {
      setStatus("STOPPED", "Translation stopped.", "warn");
      toast("Stopped.");
    } else {
      setStatus("ERROR", String(e?.message || e), "bad");
      toast("Error.");
    }
  } finally {
    state.job.running = false;
    state.job.abort = null;
    $("btnBatch").textContent = "Batch";
  }
}

async function translateSelectedRow() {
  const f = activeFile();
  const r = selectedRow();
  if (!f || !r) return toast("Select a row.");
  await translateRows([r], f);
}

async function translateCurrentFilePending() {
  const f = activeFile();
  if (!f) return toast("No active file.");
  if (state.job.running && state.job.abort) {
    state.job.abort.abort();
    return;
  }
  await translateRows(f.rows, f);
}

function syncUIFromState() {
  $("globalScope").value = state.scope;
  $("btnAutosave").setAttribute("aria-pressed", String(state.autosave));
  $("btnAutosave").classList.toggle("btnPrimary", state.autosave);
  $("btnAutosave").textContent = state.autosave ? "Autosave: On" : "Autosave: Off";

  $("btnPin").setAttribute("aria-pressed", String(state.pinned));
  $("btnPin").classList.toggle("btnPrimary", state.pinned);

  $("setAutosaveInterval").value = String(state.autosaveIntervalSec);
  $("setFontScale").value = String(state.fontScale);

  $("setTargetLang").value = state.translation.targetLang;
  $("setEngine").value = state.translation.engine;
  $("setExtractMode").value = state.translation.extractMode;
  $("setOutputCol").value = state.translation.outputCol;
  $("setBatchSize").value = String(state.translation.batchSize);
  $("setConcurrency").value = String(state.translation.concurrency);
  $("setTimeoutMs").value = String(state.translation.timeoutMs);
  $("setDeepseekRoute").value = state.translation.deepseekRoute;
  $("setDeeplRoute").value = state.translation.deeplRoute;
  $("setRememberKey").value = state.translation.rememberApiKey ? "1" : "0";

  $("setApiKey").value = getApiKey();
}

function openModal() {
  $("modalOverlay").style.display = "flex";
  syncUIFromState();
}

function closeModal() { $("modalOverlay").style.display = "none"; }

$("toastClose").addEventListener("click", () => $("toast").style.display = "none");

$("btnTheme").addEventListener("click", () => {
  applyTheme(state.theme === "dark" ? "light" : "dark");
  save();
  toast("Theme toggled.");
});

$("btnSettings").addEventListener("click", openModal);
$("modalClose").addEventListener("click", closeModal);
$("modalOverlay").addEventListener("click", (e) => { if (e.target === $("modalOverlay")) closeModal(); });

$("btnSaveSettings").addEventListener("click", () => {
  state.autosaveIntervalSec = Math.max(5, Math.min(600, Number($("setAutosaveInterval").value) || 30));
  applyFontScale($("setFontScale").value);

  state.translation.targetLang = $("setTargetLang").value;
  state.translation.engine = $("setEngine").value;
  state.translation.extractMode = $("setExtractMode").value;
  state.translation.outputCol = $("setOutputCol").value;

  state.translation.batchSize = Math.max(1, Math.min(80, Number($("setBatchSize").value) || 20));
  state.translation.concurrency = Math.max(1, Math.min(8, Number($("setConcurrency").value) || 3));
  state.translation.timeoutMs = Math.max(5000, Math.min(180000, Number($("setTimeoutMs").value) || 60000));

  state.translation.deepseekRoute = String($("setDeepseekRoute").value || "/api/deepseek-proxy").trim();
  state.translation.deeplRoute = String($("setDeeplRoute").value || "/api/deepl-trans").trim();

  state.translation.rememberApiKey = $("setRememberKey").value === "1";
  setApiKey($("setApiKey").value);

  if (!engineSupports(state.translation.engine, state.translation.targetLang)) {
    toast("Warning: this engine doesn't support the selected language here.");
  }

  save();
  closeModal();
  toast("Settings saved.");
});

$("btnReset").addEventListener("click", () => {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(CACHE_KEY);
  localStorage.removeItem(APIKEY_LOCAL_KEY);
  sessionStorage.removeItem(APIKEY_SESSION_KEY);
  location.reload();
});

$("btnOpenProject").addEventListener("click", () => {
  const name = prompt("Project name:", state.projectName) || state.projectName;
  if (!state.files.length) return newProject(name);
  state.projectName = name;
  renderFiles();
  save();
});

$("btnImport").addEventListener("click", () => $("filePicker").click());
$("filePicker").addEventListener("change", async () => {
  const files = $("filePicker").files;
  if (!files?.length) return;
  try {
    await importFiles(files);
    $("filePicker").value = "";
  } catch (e) {
    setStatus("ERROR", String(e?.message || e), "bad");
    toast("Import error.");
  }
});

$("btnExport").addEventListener("click", () => {
  const f = activeFile();
  const choice = prompt("Export:\n1 = Project JSON\n2 = Current file .rpy (if imported)\nType 1 or 2:", "1");
  if (choice === "2") exportCurrentRenpy();
  else exportProjectJson();
});

$("btnAutosave").addEventListener("click", () => {
  state.autosave = !state.autosave;
  syncUIFromState();
  save();
  toast(state.autosave ? "Autosave enabled." : "Autosave disabled.");
});

$("fileFilter").addEventListener("input", renderFiles);
$("fileSort").addEventListener("change", renderFiles);

$("globalSearch").addEventListener("input", () => {
  renderGrid();
  setStatus("SEARCH", "Filtered rows.", "");
});

$("globalScope").addEventListener("change", () => {
  state.scope = $("globalScope").value;
  renderGrid();
  save();
});

$("tabGoogle").addEventListener("click", () => { state.tabs.google = !state.tabs.google; renderGrid(); save(); });
$("tabManual").addEventListener("click", () => { state.tabs.manual = !state.tabs.manual; renderGrid(); save(); });
$("tabAtlas").addEventListener("click", () => { state.tabs.atlas = !state.tabs.atlas; renderGrid(); save(); });
$("tabTrans2").addEventListener("click", () => { state.tabs.trans2 = !state.tabs.trans2; renderGrid(); save(); });

$("btnFindNext").addEventListener("click", () => {
  const q = $("globalSearch").value.trim().toLowerCase();
  if (!q) return toast("Type something to search.");

  const scope = $("globalScope").value;
  const startFileIdx = Math.max(0, state.files.findIndex(f => f.id === state.activeFileId));
  const files = [...state.files.slice(startFileIdx), ...state.files.slice(0, startFileIdx)];

  for (const f of files) {
    const start = f.id === state.activeFileId ? f.rows.findIndex(r => r.id === state.selectedRowId) : -1;
    const idx0 = start >= 0 ? start + 1 : 0;
    const candidates = [...f.rows.slice(idx0), ...f.rows.slice(0, idx0)];
    const pick = candidates.find(r => {
      const fields = [];
      if (scope === "current" || scope === "all") fields.push(r.original, r.google, r.manual, r.atlas, r.trans2, r.speaker, r.meta, (r.tags || []).join(" "));
      if (scope === "original") fields.push(r.original, r.speaker, r.meta);
      if (scope === "translated") fields.push(r.google, r.manual, r.atlas, r.trans2);
      return fields.filter(Boolean).some(x => String(x).toLowerCase().includes(q));
    });
    if (pick) {
      state.activeFileId = f.id;
      renderFiles();
      renderGrid();
      selectRow(pick.id);
      $("row_" + cssId(pick.id))?.scrollIntoView({ block: "center" });
      save();
      return toast("Jumped to match.");
    }
  }

  toast("No match.");
});

$("btnReplace").addEventListener("click", () => {
  const f = activeFile();
  if (!f) return toast("No active file.");
  const find = prompt("Find:", "");
  if (!find) return;
  const repl = prompt("Replace with:", "");
  if (repl == null) return;
  const col = prompt("Column: google/manual/atlas/trans2", "manual") || "manual";
  if (!["google","manual","atlas","trans2"].includes(col)) return toast("Invalid column.");

  let count = 0;
  for (const r of f.rows) {
    const v = String(r[col] ?? "");
    if (!v.includes(find)) continue;
    const next = v.split(find).join(repl);
    if (next !== v) {
      pushUndo({ type: "edit", fileId: f.id, rowId: r.id, col, prev: v, next });
      r[col] = next;
      count++;
    }
  }
  renderGrid();
  setDirty();
  if (state.autosave) scheduleAutosave();
  toast(`Replaced in ${count} rows.`);
});

$("btnMarkDone").addEventListener("click", () => {
  if (!state.selectedRowId) return toast("Select a row.");
  markFlag(state.selectedRowId, "done");
});
$("btnMarkReview").addEventListener("click", () => {
  if (!state.selectedRowId) return toast("Select a row.");
  markFlag(state.selectedRowId, "review");
});
$("btnClearFlag").addEventListener("click", () => {
  if (!state.selectedRowId) return toast("Select a row.");
  markFlag(state.selectedRowId, "todo");
});

$("btnCopyOriginal").addEventListener("click", () => {
  const r = selectedRow(); if (!r) return toast("Select a row.");
  const f = activeFile(); if (!f) return;
  const prev = r.manual ?? "";
  r.manual = r.original;
  pushUndo({ type: "edit", fileId: f.id, rowId: r.id, col: "manual", prev, next: r.manual });
  renderGrid();
  selectRow(r.id);
  toast("Copied original → manual.");
  setDirty();
  if (state.autosave) scheduleAutosave();
});

$("btnSwap").addEventListener("click", () => {
  const f = activeFile(); const r = selectedRow();
  if (!f || !r) return toast("Select a row.");
  const a = r.manual ?? "", b = r.trans2 ?? "";
  r.manual = b; r.trans2 = a;
  pushUndo({ type: "edit", fileId: f.id, rowId: r.id, col: "manual", prev: a, next: b });
  pushUndo({ type: "edit", fileId: f.id, rowId: r.id, col: "trans2", prev: b, next: a });
  renderGrid(); selectRow(r.id);
  toast("Swapped manual ↔ translation 2.");
  setDirty();
  if (state.autosave) scheduleAutosave();
});

$("btnUndo").addEventListener("click", undo);
$("btnRedo").addEventListener("click", redo);

$("btnPin").addEventListener("click", () => {
  state.pinned = !state.pinned;
  syncUIFromState();
  save();
  toast(state.pinned ? "Pinned context." : "Unpinned context.");
});

$("btnFocusManual").addEventListener("click", () => {
  const r = selectedRow(); if (!r) return toast("Select a row.");
  const el = $("edManual_" + cssId(r.id));
  el?.focus();
  toast("Focused manual.");
});

$("btnAITranslate").addEventListener("click", async () => {
  try {
    await translateSelectedRow();
  } catch (e) {
    setStatus("ERROR", String(e?.message || e), "bad");
    toast("Translate error.");
  }
});

$("btnBatch").addEventListener("click", async () => {
  try {
    await translateCurrentFilePending();
  } catch (e) {
    setStatus("ERROR", String(e?.message || e), "bad");
    toast("Batch error.");
  }
});

document.addEventListener("keydown", (e) => {
  const key = e.key.toLowerCase();
  const meta = e.metaKey || e.ctrlKey;

  if (meta && key === "s") { e.preventDefault(); save(); toast("Saved."); return; }
  if (meta && key === "f") { e.preventDefault(); $("globalSearch").focus(); return; }
  if (meta && key === "z") { e.preventDefault(); undo(); return; }
  if (meta && (key === "y" || (key === "z" && e.shiftKey))) { e.preventDefault(); redo(); return; }

  if (key === "arrowdown" || key === "arrowup") {
    const f = activeFile(); if (!f) return;
    const i = f.rows.findIndex(r => r.id === state.selectedRowId);
    const next = key === "arrowdown" ? i + 1 : i - 1;
    const pick = f.rows[Math.max(0, Math.min(f.rows.length - 1, next))] ?? f.rows[0];
    if (!pick) return;
    selectRow(pick.id);
    $("row_" + cssId(pick.id))?.scrollIntoView({ block: "nearest" });
  }
});

load();