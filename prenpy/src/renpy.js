export const CREDIT_LINE = "# Translated by VN Translator: https://vntranslator.vercel.app/ or https://vntranslator.pages.dev/";

const RENPH_RE = /⟦\s*RENPH\s*(?:\{\s*(\d+)\s*\}|(\d+))\s*⟧/g;
export const RENPH_TEST_RE = /⟦\s*RENPH\s*(?:\{\s*\d+\s*\}|\d+)\s*⟧/;
export const OLD_RENPH_TEST_RE = /__RENPLH_\d+__/;

export const maskTagsInText = (text) => {
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
};

export const unmaskTagsInText = (text, map) => {
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
};

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
  "renpy.call","renpy.jump","renpy.call_in_new_context","renpy.jump_in_new_context","renpy.invoke_in_new_context"
]);

let HAS_UNICODE_PROPS = true;
try { new RegExp("\\p{L}", "u"); } catch { HAS_UNICODE_PROPS = false; }

let MODE = "safe";

const isWordChar = (ch) => /[A-Za-z0-9_]/.test(ch);

const buildLineStarts = (source) => {
  const starts = [0];
  for (let i = 0; i < source.length; i++) if (source[i] === "\n") starts.push(i + 1);
  return starts;
};

const offsetToLine = (lineStarts, offset) => {
  let lo = 0;
  let hi = lineStarts.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const v = lineStarts[mid];
    if (v <= offset) lo = mid + 1;
    else hi = mid - 1;
  }
  return Math.max(0, Math.min(hi, lineStarts.length - 1));
};

const computeBlockMasks = (lines) => {
  const n = lines.length;
  const inPython = new Array(n).fill(false);
  const inScreen = new Array(n).fill(false);
  const inMenu = new Array(n).fill(false);
  const inStyle = new Array(n).fill(false);
  const inTransform = new Array(n).fill(false);

  const stack = [];
  const popTo = (indent) => {
    while (stack.length && indent <= stack[stack.length - 1].indent) stack.pop();
  };

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
};

const scanStringLiterals = (source, lineStarts) => {
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
        if (!esc && c === quoteChar) { contentEnd = j; endOffset = j + 1; break; }
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
      quoteChar,
      isTriple,
      startLine: offsetToLine(lineStarts, openStart),
      value: source.slice(contentStart, contentEnd)
    });

    i = endOffset;
  }

  return out;
};

const stripMarkupForCheck = (text) => String(text || "")
  .replace(/\{[^{}]*\}/gs, "")
  .replace(/\[[^\[\]]*\]/gs, "")
  .trim();

const isMeaningfulText = (text) => {
  const t = stripMarkupForCheck(text);
  if (!t) return false;
  if (HAS_UNICODE_PROPS) return /[\p{L}\p{N}]/u.test(t);
  return /[A-Za-z0-9]/.test(t);
};

const isLikelyAssetString = (text) => {
  const t = String(text || "").trim();
  if (/\.(png|jpg|jpeg|webp|gif|ogg|mp3|wav|mp4|webm|m4a|avi|mov|ttf|otf|woff|woff2|eot|svg)(\?.*)?$/i.test(t)) return true;
  if ((t.includes("/") || t.includes("\\")) && /\.\w{2,4}(\?.*)?$/.test(t)) return true;
  return false;
};

const isUrlString = (text) => {
  const t = String(text || "").trim().toLowerCase();
  return t.startsWith("http://") || t.startsWith("https://") || t.startsWith("mailto:") || t.startsWith("www.");
};

const getHeadToken = (textBeforeFirstLiteral) => {
  const m = String(textBeforeFirstLiteral || "").trimStart().match(/^([A-Za-z_][\w\.]*)/);
  return (m ? m[1].toLowerCase() : "");
};

const prevIdentifierAt = (line, quotePosInLine) => {
  let j = quotePosInLine - 1;
  while (j >= 0 && /\s/.test(line[j])) j--;
  if (j >= 0 && line[j] === "(") {
    j--;
    while (j >= 0 && /\s/.test(line[j])) j--;
  }
  let k = j;
  while (k >= 0 && /[A-Za-z0-9_\.]/.test(line[k])) k--;
  return line.slice(k + 1, j + 1);
};

const isWrappedByUnderscore = (source, openQuoteStart) => {
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
};

const isSayStatement = (prefixTrimmed, fullLineTrimmed) => {
  if (!prefixTrimmed) return true;

  const head = getHeadToken(prefixTrimmed);
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
};

const menuOptionColonPos = (line, afterIndex) => {
  const cut = line.includes("#") ? line.slice(0, line.indexOf("#")) : line;
  const pos = cut.indexOf(":", afterIndex);
  if (pos === -1) return null;
  if (cut.slice(pos + 1).trim() !== "") return null;
  return pos;
};

export const escapeForRenpyString = (text, quoteChar, isTriple) => {
  let t = String(text ?? "");
  if (!isTriple) {
    t = t.replace(/\r?\n/g, "\\n");
    if (quoteChar === '"') t = t.replace(/"/g, "\\\"");
    else t = t.replace(/'/g, "\\'");
    return t;
  }

  const triple = quoteChar + quoteChar + quoteChar;
  const repl = quoteChar === '"'
    ? ("\\" + '""' + '"')
    : ("\\" + "'" + "''");

  return t.split(triple).join(repl);
};

export const Renpy = (() => {
  const setMode = (mode) => {
    const v = String(mode || "").toLowerCase().trim();
    MODE = (v === "balanced" || v === "aggressive") ? v : "safe";
  };

  const getMode = () => MODE;

  const extractDialogs = (source) => {
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
      const screenAllowed = zone === "screen" && SCREEN_ALLOWED_HEADS.has(head);

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
          else if (isMenuOption && colonPos != null) allowed = (lit.openStart - lineStartOffset) < colonPos;
          else allowed = isSay || inWrap;
        }

        if (!allowed) continue;

        dialogs.push({
          lineIndex: lineIdx,
          contentStart: lit.contentStart,
          contentEnd: lit.contentEnd,
          quoteChar: lit.quoteChar,
          isTriple: lit.isTriple,
          quote: raw
        });
      }
    }

    return dialogs;
  };

  const applyTranslations = (source, replacements, creditLine) => {
    const reps = Array.isArray(replacements) ? replacements.filter(Boolean) : [];
    reps.sort((a, b) => b.start - a.start);

    let out = String(source || "");
    for (const r of reps) out = out.slice(0, r.start) + String(r.value || "") + out.slice(r.end);

    const nl = out.includes("\r\n") ? "\r\n" : "\n";
    const credit = String(creditLine || "").trim();
    return credit ? (out + nl + nl + credit + nl) : (out + nl);
  };

  return { setMode, getMode, extractDialogs, applyTranslations };
})();

export const buildReplacementsFromRows = (rows) => {
  const out = [];
  for (const row of rows) {
    const span = row?.span;
    if (!span) continue;

    const chosen = (row.manual && String(row.manual).trim())
      ? String(row.manual)
      : (row.machine && String(row.machine).trim())
        ? String(row.machine)
        : null;

    if (chosen == null) continue;

    out.push({
      start: span.contentStart,
      end: span.contentEnd,
      value: escapeForRenpyString(chosen, span.quoteChar, span.isTriple)
    });
  }
  return out;
};
