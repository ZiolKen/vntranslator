(function () {
  'use strict';

  const el = {
    fileInput: document.getElementById('fileInput'),
    translateBtn: document.getElementById('translateBtn'),
    translateLabel: document.getElementById('translateLabel'),
    spinner: document.getElementById('spinner'),
    progressBar: document.getElementById('progressBar'),
    progressText: document.getElementById('progressText'),
    logBox: document.getElementById('logBox'),
    previewBtn: document.getElementById('previewBtn'),
    downloadFinal: document.getElementById('downloadFinal'),
    downloadProgress: document.getElementById('downloadProgress'),
    modelSelect: document.getElementById('modelSelect'),
    apiKeyContainer: document.getElementById('apiKeyContainer'),
    apiKey: document.getElementById('apiKey'),
    controlBtns: document.getElementById('controlBtns'),
    stopBtn: document.getElementById('stopBtn'),
    resumeBtn: document.getElementById('resumeBtn'),
    libreWarningModal: document.getElementById('libreWarningModal'),
    libreWarningClose: document.querySelector('#libreWarningModal .close-modal'),
    confirmLibre: document.getElementById('confirmLibre'),
    langTarget: document.getElementById('langTarget'),
    deeplKeyContainer: document.getElementById('deeplKeyContainer'),
    deeplApiKey: document.getElementById('deeplApiKey'),
  };

  const state = {
    fileName: null,
    originalText: '',
    originalLines: [],
    dialogs: [],
    batches: [],
    isTranslating: false,
    isPaused: false,
    currentBatchIndex: 0,
    logEntries: [],
    translationCache: new Map(),
  };

  const TRANSLATOR_CREDIT =
    '# Translated by VN Translator: https://vntranslator.vercel.app/ or https://vntranslator.pages.dev/';
  
  const RENPH_RE = /⟦\s*RENPH\s*(?:\{\s*(\d+)\s*\}|(\d+))\s*⟧/g;
  const RENPH_TEST_RE = /⟦\s*RENPH\s*(?:\{\s*\d+\s*\}|\d+)\s*⟧/;
  const OLD_RENPH_TEST_RE = /__RENPLH_\d+__/;

  function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function languageLabel(codeOrName) {
    const v = String(codeOrName || '').toLowerCase().trim();
    if (['id', 'indonesian', 'bahasa indonesia'].includes(v)) return 'Indonesian';
    if (['en', 'english', 'en-us', 'en-gb'].includes(v)) return 'English';
    if (['ms', 'malay', 'ms-my'].includes(v)) return 'Malay';
    if (['vi', 'vietnamese', 'vi-vn'].includes(v)) return 'Vietnamese';
    if (['tl', 'fil', 'filipino', 'tagalog'].includes(v)) return 'Filipino';
    if (['zh', 'zh-cn', 'chinese (simplified)', 'simplified chinese', 'chinese'].includes(v))
      return 'Chinese (Simplified)';
    if (['hi', 'hindi'].includes(v)) return 'Hindi';
    if (['es', 'spanish'].includes(v)) return 'Spanish';
    if (['fr', 'french'].includes(v)) return 'French';
    if (['ar', 'arabic'].includes(v)) return 'Arabic';
    if (['pt', 'portuguese', 'pt-br', 'pt-pt'].includes(v)) return 'Portuguese';
    if (['ru', 'russian'].includes(v)) return 'Russian';
    if (['de', 'german'].includes(v)) return 'German';
    if (['ja', 'japanese'].includes(v)) return 'Japanese';
    if (['ko', 'korean'].includes(v)) return 'Korean';
    return codeOrName || '';
  }

  function getDeepLLangCode(lang) {
    if (!lang) return 'EN-US';
    const low = String(lang).toLowerCase().trim();
    if (low === 'bahasa indonesia' || low === 'indonesian' || low === 'id') return 'ID';
    if (low === 'english' || low === 'en') return 'EN-US';
    if (low === 'malay' || low === 'ms') return 'MS';
    if (low === 'vietnamese' || low === 'vi') return 'VI';
    if (low === 'filipino' || low === 'tl' || low === 'tagalog') return 'TL';
    if (low === 'chinese (simplified)' || low === 'simplified chinese' || low === 'zh' || low === 'zh-cn')
      return 'ZH';
    if (low === 'hindi' || low === 'hi') return 'HI';
    if (low === 'spanish' || low === 'es') return 'ES';
    if (low === 'french' || low === 'fr') return 'FR';
    if (low === 'arabic' || low === 'ar') return 'AR';
    if (low === 'portuguese' || low === 'pt') return 'PT';
    if (low === 'russian' || low === 'ru') return 'RU';
    if (low === 'german' || low === 'de') return 'DE';
    if (low === 'japanese' || low === 'ja') return 'JA';
    if (low === 'korean' || low === 'ko') return 'KO';
    return 'EN-US';
  }

  function needsDeepLQualityModel(targetCode) {
    return ['MS', 'TL', 'HI'].includes(String(targetCode || '').toUpperCase());
  }

  function estimateTokens(text) {
    if (typeof TextEncoder === 'undefined') return Math.ceil((text || '').length / 4);
    const bytes = new TextEncoder().encode(text || '');
    return Math.ceil(bytes.length / 4);
  }

  function createBatches(dialogs, options) {
    const maxLines = options.maxLines ?? 64;
    const maxTokens = options.maxTokens ?? 2000;
    const batches = [];
    let current = [];
    let tokens = 0;

    for (const d of dialogs) {
      const t = d.maskedQuote || d.quote || '';
      const cost = estimateTokens(t) + 12;
      if (current.length && (current.length >= maxLines || tokens + cost > maxTokens)) {
        batches.push(current);
        current = [];
        tokens = 0;
      }
      current.push(d);
      tokens += cost;
    }
    if (current.length) batches.push(current);
    return batches;
  }

  function log(message, level = 'info') {
    const entryText = String(message);
    state.logEntries.push(entryText);
    if (!el.logBox) return;

    const p = document.createElement('p');
    p.textContent = entryText;
    p.style.color =
      level === 'error' ? '#ff1b1b' :
      level === 'warn' ? '#f1f759' :
      level === 'success' ? '#39ff14' :
      '#00ffff';

    el.logBox.appendChild(p);
    el.logBox.scrollTop = el.logBox.scrollHeight;
  }

  function maskTagsInText(text) {
    const s = String(text ?? '');
    if (!s) return { masked: s, map: Object.create(null) };
  
    const used = new Set();
    s.replace(RENPH_RE, (_, a, b) => {
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
    const s = String(text ?? '');
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

  function countTagsByType(text) {
    const result = { square: 0, curly: 0 };
    if (!text) return result;
    const re = /\[[^\[\]]*\]|\{[^{}]*\}/g;
    const matches = text.match(re);
    if (!matches) return result;
    for (const m of matches) {
      if (m[0] === '[') result.square++;
      else if (m[0] === '{') result.curly++;
    }
    return result;
  }

  function validateTagConsistency(originalText, translatedText, lineNumber) {
    const src = countTagsByType(originalText);
    const tgt = countTagsByType(translatedText);

    if (/__RENPLH_\d+__/.test(translatedText)) {
      log(`*️⃣ [Line ${lineNumber}] Placeholder __RENPLH_*__ still appears in translation.`, 'warn');
    }
    if (src.square !== tgt.square) {
      log(`*️⃣ [Line ${lineNumber}] Square tag mismatch: ${src.square} vs ${tgt.square}.`, 'warn');
    }
    if (src.curly !== tgt.curly) {
      log(`*️⃣ [Line ${lineNumber}] Curly tag mismatch: ${src.curly} vs ${tgt.curly}.`, 'warn');
    }
  }

  function setTranslateButtonBusy(isBusy, labelWhenBusy = '🔁 Translating...') {
    if (!el.translateBtn || !el.translateLabel || !el.spinner) return;
    if (isBusy) {
      el.translateBtn.disabled = true;
      el.translateLabel.textContent = labelWhenBusy;
      el.spinner.style.display = 'inline-block';
    } else {
      el.translateBtn.disabled = false;
      el.translateLabel.textContent = '▶️ Start Translating';
      el.spinner.style.display = 'none';
    }
  }

  function resetTranslateUIAfterFinish() {
    state.isTranslating = false;
    state.isPaused = false;
    setTranslateButtonBusy(false);
    if (el.controlBtns) el.controlBtns.style.display = 'none';
    if (el.stopBtn) el.stopBtn.disabled = true;
    if (el.resumeBtn) el.resumeBtn.disabled = true;
  }

  function updateProgress() {
    const total = state.dialogs.length;
    const done = state.dialogs.reduce((acc, d) => acc + (d.translated != null ? 1 : 0), 0);

    if (el.progressBar) {
      el.progressBar.max = total || 1;
      el.progressBar.value = done;
    }
    if (el.progressText) {
      el.progressText.textContent = `${done} / ${total || 0} lines translated`;
    }
  }

  function updateControlButtons() {
    if (!el.controlBtns || !el.stopBtn || !el.resumeBtn) return;

    if (!state.isTranslating) {
      el.controlBtns.style.display = 'none';
      el.stopBtn.disabled = true;
      el.resumeBtn.disabled = true;
      return;
    }
    el.controlBtns.style.display = 'flex';
    el.stopBtn.disabled = state.isPaused;
    el.resumeBtn.disabled = !state.isPaused;
  }

  const RENPY = (() => {
    const PREFIX_CHARS = new Set(['r','R','u','U','b','B','f','F']);
    const SCRIPT_SKIP_HEADS = new Set([
      'label','init','python','transform','style','screen','key',
      'define','default','translate','old','new',
      'return','jump','call','if','elif','else','for','while','try','except','finally',
      'pass','break','continue','import','from','$','renpy','action',
      'outlines','outline_scaling','text_font','font','text_color','text_size','color',
      'xpos','ypos','xalign','yalign','align','anchor','pos','xysize','size','zorder','tag'
    ]);
  
    const ASSET_HEADS = new Set(['play','queue','stop','voice','sound','sound2','ambience','music']);
  
    const SCREEN_ALLOWED_HEADS = new Set(['text','textbutton','label','vtext','htext']);
  
    const NON_TRANSLATABLE_ATTRS = new Set([
      'style','font','text_font','background','hover_sound','activate_sound','selected_sound','insensitive_sound',
      'channel','play','start_image','image','add','xysize','xpos','ypos','align','anchor','zorder','tag'
    ]);
  
    const NON_TRANSLATABLE_CALLS = new Set([
      'jump','call','showmenu','openurl','fileaction','setvariable','setscreenvariable',
      'renpy.call','renpy.jump','renpy.call_in_new_context','renpy.invoke_in_new_context'
    ]);
  
    let HAS_UNICODE_PROPS = true;
    try { new RegExp('\\p{L}', 'u'); } catch { HAS_UNICODE_PROPS = false; }
  
    let MODE = 'safe';
  
    function setMode(mode) {
      const v = String(mode || '').toLowerCase().trim();
      MODE = (v === 'balanced' || v === 'aggressive') ? v : 'safe';
    }
  
    function getMode() {
      return MODE;
    }
  
    function isWordChar(ch) {
      return /[A-Za-z0-9_]/.test(ch);
    }
  
    function buildLineStarts(source) {
      const starts = [0];
      for (let i = 0; i < source.length; i++) if (source[i] === '\n') starts.push(i + 1);
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
  
      function popTo(indent) {
        while (stack.length && indent <= stack[stack.length - 1].indent) stack.pop();
      }
  
      for (let i = 0; i < n; i++) {
        const raw = lines[i];
        const stripped = raw.trim();
        const indent = (raw.match(/^\s*/)?.[0]?.length) || 0;
  
        if (stripped && !raw.trimStart().startsWith('#')) {
          popTo(indent);
  
          if (/^\s*(init\s+python|python)\s*:\s*$/.test(raw)) stack.push({ type: 'python', indent });
          else if (/^\s*screen\s+[A-Za-z_]\w*\s*(\([^)]*\))?\s*:\s*$/.test(raw)) stack.push({ type: 'screen', indent });
          else if (/^\s*menu\s*:\s*$/.test(raw)) stack.push({ type: 'menu', indent });
          else if (/^\s*style\s+[A-Za-z_]\w*\s*:\s*$/.test(raw)) stack.push({ type: 'style', indent });
          else if (/^\s*transform\s+[A-Za-z_]\w*\s*:\s*$/.test(raw)) stack.push({ type: 'transform', indent });
        }
  
        const types = new Set(stack.map(x => x.type));
        inPython[i] = types.has('python');
        inScreen[i] = types.has('screen');
        inMenu[i] = types.has('menu');
        inStyle[i] = types.has('style');
        inTransform[i] = types.has('transform');
      }
  
      return { inPython, inScreen, inMenu, inStyle, inTransform };
    }
  
    function scanStringLiterals(source, lineStarts) {
      const out = [];
      let i = 0;
  
      while (i < source.length) {
        const ch = source[i];
  
        if (ch === '#') {
          const nl = source.indexOf('\n', i);
          if (nl === -1) break;
          i = nl + 1;
          continue;
        }
  
        const prev = i > 0 ? source[i - 1] : '';
        let prefix = '';
        let quoteChar = '';
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
          if (close === -1) {
            i = contentStart;
            continue;
          }
          contentEnd = close;
          endOffset = close + delim.length;
        } else {
          let j = contentStart;
          let esc = false;
          while (j < source.length) {
            const c = source[j];
            if (c === '\n') break;
            if (!esc && c === quoteChar) {
              contentEnd = j;
              endOffset = j + 1;
              break;
            }
            if (c === '\\' && !esc) esc = true;
            else esc = false;
            j++;
          }
          if (endOffset === -1) {
            i = contentStart;
            continue;
          }
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
      return String(text || '')
        .replace(/\{[^{}]*\}/gs, '')
        .replace(/\[[^\[\]]*\]/gs, '')
        .trim();
    }
  
    function isMeaningfulText(text) {
      const t = stripMarkupForCheck(text);
      if (!t) return false;
      if (HAS_UNICODE_PROPS) return /[\p{L}\p{N}]/u.test(t);
      return /[A-Za-z0-9]/.test(t);
    }
  
    function isLikelyAssetString(text) {
      const t = String(text || '').trim();
      if (/\.(png|jpg|jpeg|webp|gif|ogg|mp3|wav|mp4|webm|m4a|avi|mov|ttf|otf|woff|woff2|eot|svg)(\?.*)?$/i.test(t)) return true;
      if ((t.includes('/') || t.includes('\\')) && /\.\w{2,4}(\?.*)?$/.test(t)) return true;
      return false;
    }
  
    function isUrlString(text) {
      const t = String(text || '').trim().toLowerCase();
      return t.startsWith('http://') || t.startsWith('https://') || t.startsWith('mailto:') || t.startsWith('www.');
    }
  
    function getHeadToken(textBeforeFirstLiteral) {
      const m = String(textBeforeFirstLiteral || '').trimStart().match(/^([A-Za-z_][\w\.]*)/);
      return (m ? m[1].toLowerCase() : '');
    }
  
    function prevIdentifierAt(line, quotePosInLine) {
      let j = quotePosInLine - 1;
      while (j >= 0 && /\s/.test(line[j])) j--;
      if (j >= 0 && line[j] === '(') {
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
      if (j >= 0 && source[j] === '(') {
        j--;
        while (j >= 0 && /\s/.test(source[j])) j--;
        if (j >= 0 && source[j] === '_') {
          const k = j - 1;
          if (k < 0 || !/[A-Za-z0-9_]/.test(source[k])) return true;
        }
      }
      return false;
    }
  
    function isSayStatement(prefixTrimmed, fullLineTrimmed) {
      if (!prefixTrimmed) return true;
  
      const head = getHeadToken(prefixTrimmed);
      if (!head) return false;
  
      if (ASSET_HEADS.has(head)) return false;
  
      if (SCRIPT_SKIP_HEADS.has(head)) {
        if (head === 'show' && /^\s*show\s+text\b/i.test(fullLineTrimmed)) return true;
        return false;
      }
  
      if (/\b(action|Jump|Call|ShowMenu|OpenURL|SetVariable|FileAction)\b/.test(prefixTrimmed)) return false;
  
      if (/(^|[^=!<>])=([^=]|$)/.test(prefixTrimmed)) return false;
  
      if (prefixTrimmed.includes(':')) return false;
  
      return true;
    }
  
    function menuOptionColonPos(line, afterIndex) {
      const cut = line.includes('#') ? line.slice(0, line.indexOf('#')) : line;
      const pos = cut.indexOf(':', afterIndex);
      if (pos === -1) return null;
      if (cut.slice(pos + 1).trim() !== '') return null;
      return pos;
    }
  
    function escapeForRenpyString(text, quoteChar, isTriple) {
      let t = String(text ?? '');
      if (!isTriple) {
        t = t.replace(/\r?\n/g, '\\n');
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
        if (MODE === 'safe' && masks.inScreen[lineIdx]) continue;
  
        list.sort((a, b) => a.openStart - b.openStart);
  
        const line = lines[lineIdx] ?? '';
        const lineTrimmed = line.trim();
        const lineStartOffset = lineStarts[lineIdx] ?? 0;
        const first = list[0];
  
        const prefixTrimmed = source.slice(lineStartOffset, first.openStart).trim();
        const zone = masks.inScreen[lineIdx] ? 'screen' : 'script';
  
        let isMenuOption = false;
        let colonPos = null;
  
        const firstNonSpacePos = lineStartOffset + (line.length - line.trimStart().length);
        if (masks.inMenu[lineIdx] && first.openStart === firstNonSpacePos && !first.isTriple) {
          const after = first.endOffset - lineStartOffset;
          const cp = menuOptionColonPos(line, after);
          if (cp != null) {
            isMenuOption = true;
            colonPos = cp;
          }
        }
  
        const isSay = zone === 'script' && isSayStatement(prefixTrimmed, lineTrimmed);
        const head = getHeadToken(prefixTrimmed);
        const screenAllowed = zone === 'screen' && SCREEN_ALLOWED_HEADS.has(head);
  
        for (const lit of list) {
          const raw = lit.value;
  
          if (!isMeaningfulText(raw)) continue;
          if (isLikelyAssetString(raw) || isUrlString(raw)) continue;
  
          const quotePosInLine = lit.openQuoteStart - lineStartOffset;
          const prevId = prevIdentifierAt(line, quotePosInLine).toLowerCase();
          if (NON_TRANSLATABLE_ATTRS.has(prevId) || NON_TRANSLATABLE_CALLS.has(prevId)) continue;
  
          const inWrap = isWrappedByUnderscore(source, lit.openQuoteStart);
  
          let allowed = false;
  
          if (MODE === 'safe') {
            if (zone !== 'script') allowed = false;
            else if (isMenuOption && colonPos != null) {
              allowed = (lit.openStart - lineStartOffset) < colonPos;
            } else {
              allowed = isSay;
            }
  
            if (inWrap && !(isSay || isMenuOption)) allowed = false;
          } else {
            if (zone === 'screen') {
              allowed = inWrap || (screenAllowed && lit === first);
            } else {
              if (isMenuOption && colonPos != null) {
                allowed = (lit.openStart - lineStartOffset) < colonPos;
              } else {
                allowed = isSay || inWrap;
              }
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
            cacheKey: maskedInfo.masked,
            translated: null,
          });
        }
      }
  
      return dialogs;
    }
  
    function applyTranslations(source, dialogs, eol, creditLine) {
      const reps = [];
      for (const d of dialogs) {
        if (d.translated == null) continue;
        reps.push({
          start: d.contentStart,
          end: d.contentEnd,
          value: escapeForRenpyString(d.translated, d.quoteChar, d.isTriple),
        });
      }
      reps.sort((a, b) => b.start - a.start);
  
      let out = source;
      for (const r of reps) out = out.slice(0, r.start) + r.value + out.slice(r.end);
  
      const nl = eol || (out.includes('\r\n') ? '\r\n' : '\n');
      const credit = String(creditLine || '').trim();
      return credit ? (out + nl + nl + credit + nl) : (out + nl);
    }
  
    return { extractDialogs, applyTranslations, setMode, getMode };
  })();

  function safeParseJsonArray(content) {
    const text = String(content || '').trim();
    try {
      const v = JSON.parse(text);
      return Array.isArray(v) ? v : null;
    } catch {}
    const start = text.indexOf('[');
    const end = text.lastIndexOf(']');
    if (start !== -1 && end !== -1 && end > start) {
      const slice = text.slice(start, end + 1);
      try {
        const v = JSON.parse(slice);
        return Array.isArray(v) ? v : null;
      } catch {}
    }
    return null;
  }

  async function translateBatchDeepSeek(batchDialogs, targetLang, apiKey) {
    const src = batchDialogs.map(d => d.maskedQuote || d.quote || '');
    const languageName = languageLabel(targetLang);

    const payload = JSON.stringify(src);

    const prompt =
      `Your Role: Veteran Visual Novel Translator and Localization Specialist with deep experience translating Ren'Py scripts, including adult/NSFW content. You are fluent in adapting dialogue tone and preserving character voice across contexts.\n` +
      `Short basic instruction: Translate Ren'Py dialogue strings to ${languageName} (language code: ${targetLang}).\n\n` +

      `Think step by step before translating — analyze each line's tone, implied meaning, and character voice.\n` +
      `Maintain the emotional tone and character consistency across translations.\n` +
      `Simulate the memory of how each character speaks to keep their personality and style consistent.\n\n` +

      `Rules:\n` +
      `- DO NOT translate or modify placeholders like ⟦RENPH{0}⟧.\n` +
      `- Preserve ALL Ren'Py tags, syntax, and variables (e.g., {fast}, [player_name]).\n` +
      `- DO NOT merge, split, or reorder lines.\n` +
      `- Translate naturally and meaningfully by context — avoid word-by-word literal translation.\n` +
      `- Use slang sparingly and only if it enhances natural tone and is easy to understand.\n` +
      `- Translate adult (NSFW) content directly and explicitly. Do NOT censor anything.\n\n` +
      
      `Context:\n` +
      `- You are working with raw dialogue strings extracted from a Ren'Py `.rpy` script.\n` +
      `- The visual novel includes romantic, emotional,... and adult themes.\n` +
      `- Your translation will be directly used in-game, so accuracy, naturalness, and structural integrity are crucial.\n\n` +

      `Your Goal:\n` +
      `- Produce a fully localized, natural-sounding version of the input dialogues that feels authentic to the target language audience — as if originally written in that language.\n` +
      `- Ensure accuracy, tone consistency, and contextual appropriateness even for explicit scenes.\n\n` +

      `Result:\n` +
      `- Return a JSON array of translated strings, exactly same length and order as the input array.\n\n` +

      `Input JSON array:\n` +
      payload;

    const bodyForProxy = {
      apiKey,
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: "Your Role: Veteran Visual Novel Translator and Localization Specialist with deep experience translating Ren'Py scripts, including adult/NSFW content. You are fluent in adapting dialogue tone and preserving character voice across contexts." },
        { role: 'user', content: prompt }
      ],
      stream: false,
    };

    let response;
    try {
      response = await fetch('/api/deepseek-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyForProxy),
      });
    } catch (err) {
      throw new Error('*️⃣ Network error when calling DeepSeek proxy: ' + (err?.message || err));
    }

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`*️⃣ DeepSeek/proxy error ${response.status}: ${text}`);
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;

    if (!content) throw new Error('*️⃣ DeepSeek response did not contain any content.');

    const arr = safeParseJsonArray(content);
    if (!arr) throw new Error('*️⃣ DeepSeek output is not a valid JSON array.');

    const out = arr.map(x => (typeof x === 'string' ? x : String(x ?? '')));

    if (out.length !== src.length) {
      log(`*️⃣ Warning: expected ${src.length} items from DeepSeek but got ${out.length}.`, 'warn');
    }
    
    for (let i = 0; i < out.length && i < batchDialogs.length; i++) {
      const t = out[i] || '';
      const lineNumber = (batchDialogs[i]?.lineIndex ?? -1) + 1;
      if (OLD_RENPH_TEST_RE.test(t)) {
        log(`*️⃣ [Line ${lineNumber}] Placeholder __RENPLH_*__ still appears in DeepSeek output.`, 'warn');
      }
    }

    return out;
  }

  async function translateBatchDeepL(batchDialogs, targetLang, apiKey) {
    const lines = batchDialogs.map(d => d.maskedQuote || d.quote || '');
    const targetCode = getDeepLLangCode(targetLang);

    const bodyForProxy = {
      apiKey,
      text: lines,
      target_lang: targetCode,
      preserve_formatting: 1,
      split_sentences: 0,
      ...(needsDeepLQualityModel(targetCode) ? { model_type: 'quality_optimized' } : {}),
    };

    let response;
    try {
      response = await fetch('/api/deepl-trans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyForProxy),
      });
    } catch (err) {
      throw new Error('*️⃣ Network error when calling DeepL proxy: ' + (err?.message || err));
    }

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`*️⃣ DeepL/proxy error ${response.status}: ${text}`);
    }

    const data = await response.json();
    const translations = Array.isArray(data?.translations) ? data.translations : [];
    const out = translations.map(t => (t && typeof t.text === 'string') ? t.text : '');

    if (out.length !== lines.length) {
      log(`*️⃣ Warning: expected ${lines.length} items from DeepL but got ${out.length}.`, 'warn');
    }

    return out;
  }

  const LINGVA_LANG_MAP = {
    'Bahasa Indonesia': 'id',
    Indonesian: 'id',
    Vietnamese: 'vi',
    'vi-VN': 'vi',
    English: 'en',
    'en-US': 'en',
    'en-GB': 'en',
    Malay: 'ms',
    Filipino: 'tl',
    Filipina: 'tl',
    Tagalog: 'tl',
    'Chinese (Simplified)': 'zh-CN',
    'Simplified Chinese': 'zh-CN',
    Chinese: 'zh-CN',
    Hindi: 'hi',
    Spanish: 'es',
    French: 'fr',
    Arabic: 'ar',
    Portuguese: 'pt',
    Russian: 'ru',
    German: 'de',
    Japanese: 'ja',
    Korean: 'ko',
  };

  function getLingvaLangCode(lang) {
    if (!lang) return 'en';
    const trimmed = String(lang).trim();
    if (/^[a-z]{2}(-[A-Za-z0-9]+)?$/i.test(trimmed)) return trimmed.toLowerCase();
    const key = Object.keys(LINGVA_LANG_MAP).find(k => k.toLowerCase() === trimmed.toLowerCase());
    return key ? LINGVA_LANG_MAP[key] : trimmed;
  }

  const LINGVA_BASE_URLS = [
    'https://lingva.lunar.icu',
    'https://lingva.dialectapp.org',
    'https://lingva.ml',
    'https://lingva.vercel.app',
    'https://translate.plausibility.cloud',
    'https://lingva.garudalinux.org',
  ];

  async function lingvaFetch(path, init) {
    let lastError;
    for (const base of LINGVA_BASE_URLS) {
      const url = base.replace(/\/+$/, '') + path;
      try {
        const res = await fetch(url, init);
        if (!res.ok) {
          lastError = new Error(`*️⃣ HTTP ${res.status} from ${base}`);
          continue;
        }
        return res;
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError || new Error('*️⃣ All Lingva endpoints failed');
  }

  async function pMap(items, concurrency, mapper) {
    const results = new Array(items.length);
    let idx = 0;
    const workers = new Array(Math.max(1, concurrency)).fill(0).map(async () => {
      while (idx < items.length) {
        const cur = idx++;
        results[cur] = await mapper(items[cur], cur);
      }
    });
    await Promise.all(workers);
    return results;
  }

  async function translateBatchLingva(batchDialogs, targetLang) {
    const langCode = getLingvaLangCode(targetLang);

    const out = await pMap(batchDialogs, 4, async (dialog) => {
      const text = dialog.maskedQuote || dialog.quote || '';
      if (!text.trim()) return text;

      const path =
        '/api/v1/auto/' +
        encodeURIComponent(langCode) +
        '/' +
        encodeURIComponent(text);

      const response = await lingvaFetch(path);
      const data = await response.json().catch(() => ({}));
      const translated = data.translation || data.translatedText || data.result || '';

      if (!translated) throw new Error('*️⃣ Lingva response did not contain a translation string.');
      await delay(60);
      return translated;
    });

    return out;
  }

  async function waitWhilePaused() {
    while (state.isPaused && state.isTranslating) await delay(100);
  }

  async function runTranslationLoop() {
    const model = el.modelSelect ? el.modelSelect.value : 'deepseek';
    const apiKey = (el.apiKey && el.apiKey.value.trim()) || '';
    const targetLang = el.langTarget ? el.langTarget.value : 'id';
    const deeplApiKey = (el.deeplApiKey && el.deeplApiKey.value.trim()) || '';

    updateControlButtons();

    while (state.currentBatchIndex < state.batches.length && state.isTranslating) {
      if (state.isPaused) {
        log('⏸ Translation paused.', 'info');
        await waitWhilePaused();
        if (!state.isTranslating) {
          log('ℹ️ Translation cancelled while paused.', 'warn');
          return;
        }
        log('▶️ Resuming translation...', 'info');
      }

      const batchNum = state.currentBatchIndex + 1;
      const totalBatches = state.batches.length;
      const batchDialogs = state.batches[state.currentBatchIndex];

      log(`🔄 Translating batch ${batchNum}/${totalBatches} (${batchDialogs.length} lines)...`, 'info');

      const toTranslate = [];
      const indexMap = [];

      for (let i = 0; i < batchDialogs.length; i++) {
        const d = batchDialogs[i];
        const cached = state.translationCache.get(d.cacheKey);
        if (typeof cached === 'string') {
          const fixed = unmaskTagsInText(cached, d.placeholderMap) || cached;
          validateTagConsistency(d.quote, fixed, d.lineIndex + 1);
          d.translated = fixed;
          log(`✅ [${d.lineIndex + 1}] ${fixed}`, 'success');
        } else {
          toTranslate.push(d);
          indexMap.push(i);
        }
      }

      if (toTranslate.length) {
        let translatedLines;
        try {
          if (model === 'deepseek') {
            translatedLines = await translateBatchDeepSeek(toTranslate, targetLang, apiKey);
          } else if (model === 'deepl') {
            translatedLines = await translateBatchDeepL(toTranslate, targetLang, deeplApiKey);
          } else {
            translatedLines = await translateBatchLingva(toTranslate, targetLang);
          }
        } catch (err) {
          log(`*️⃣ Error while translating batch ${batchNum}: ${err.message || err}`, 'error');
          throw err;
        }

        for (let j = 0; j < toTranslate.length; j++) {
          const dialog = toTranslate[j];
          const translatedMasked = translatedLines[j];

          if (!translatedMasked) {
            log(`*️⃣ [${dialog.lineIndex + 1}] Cannot translate`, 'warn');
            continue;
          }

          state.translationCache.set(dialog.cacheKey, translatedMasked);

          const fixed = unmaskTagsInText(translatedMasked, dialog.placeholderMap) || translatedMasked;
          validateTagConsistency(dialog.quote, fixed, dialog.lineIndex + 1);
          dialog.translated = fixed;

          log(`✅ [${dialog.lineIndex + 1}] ${fixed}`, 'success');
        }
      }

      state.currentBatchIndex++;
      updateProgress();
    }

    if (state.currentBatchIndex >= state.batches.length) {
      log('✅ Translation complete. You can now download the result.', 'success');
      if (el.downloadFinal) el.downloadFinal.disabled = false;
      if (el.previewBtn) el.previewBtn.disabled = false;
    }

    resetTranslateUIAfterFinish();
  }

  async function startTranslation() {
    if (state.isTranslating) {
      log('ℹ️ A translation is already in progress.', 'warn');
      return;
    }

    if (!state.fileName || !state.originalText) {
      log('*️⃣ No .rpy file loaded. Please upload a file first.', 'error');
      return;
    }

    const model = el.modelSelect ? el.modelSelect.value : 'deepseek';
    const apiKey = (el.apiKey && el.apiKey.value.trim()) || '';
    const targetLang = el.langTarget ? el.langTarget.value : 'id';

    if (model === 'deepseek' && !apiKey) {
      log('*️⃣ Please provide your DeepSeek API key.', 'error');
      return;
    }

    const deeplApiKey = (el.deeplApiKey && el.deeplApiKey.value.trim()) || '';
    if (model === 'deepl' && !deeplApiKey) {
      log('*️⃣ Please provide your DeepL API key.', 'error');
      return;
    }

    log(`ℹ️ Preparing translation using model "${model}" to ${languageLabel(targetLang)}...`, 'info');

    state.translationCache.clear();
    RENPY.setMode('safe');
    state.dialogs = RENPY.extractDialogs(state.originalText);

    if (!state.dialogs.length) {
      log('*️⃣ No translatable dialog/text strings were detected in this .rpy file.', 'error');
      return;
    }

    log(`ℹ️ Detected ${state.dialogs.length} translatable strings. Creating translation batches...`, 'info');

    state.batches = createBatches(state.dialogs, { maxLines: 48, maxTokens: 1800 });

    log(`ℹ️ Created ${state.batches.length} batches for translation.`, 'info');

    state.currentBatchIndex = 0;
    state.isTranslating = true;
    state.isPaused = false;

    if (el.downloadFinal) el.downloadFinal.disabled = false;

    if (el.progressBar) {
      el.progressBar.value = 0;
      el.progressBar.max = state.dialogs.length;
    }
    updateProgress();

    setTranslateButtonBusy(true, '🔁 Translating...');
    if (el.controlBtns) el.controlBtns.style.display = 'flex';
    updateControlButtons();

    try {
      await runTranslationLoop();
    } catch (err) {
      log('*️⃣ Translation stopped due to an error.', 'error');
      resetTranslateUIAfterFinish();
    }
  }

  function handleDownloadFinal() {
    if (!state.originalText || !state.dialogs.length) {
      log('*️⃣ Nothing to download.', 'error');
      return;
    }
    const eol = state.originalText.includes('\r\n') ? '\r\n' : '\n';
    const outputText = RENPY.applyTranslations(state.originalText, state.dialogs, eol, TRANSLATOR_CREDIT);

    const blob = new Blob([outputText], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);

    const base = (state.fileName || 'translated').replace(/\.rpy$/i, '');
    a.download = base + '_translated.rpy';
    a.click();

    log('⬇️ Downloaded translated file.', 'success');
  }

  function handleDownloadProgress() {
    const logText = state.logEntries.join('\n');
    const blob = new Blob([logText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.download = 'translation_log.txt';
    a.href = url;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    log('⬇️ Downloaded translation log.', 'success');
  }

  function handlePreview() {
    if (!state.originalLines.length || !state.dialogs.length) {
      alert('*️⃣ There is no data to preview yet.');
      return;
    }

    try {
      localStorage.setItem('originalLines', JSON.stringify(state.originalLines));
      localStorage.setItem('detectedDialogs', JSON.stringify(state.dialogs.map(d => d.quote || '')));
      localStorage.setItem('translatedDialogs', JSON.stringify(state.dialogs.map(d => d.translated || '')));
      if (el.langTarget) localStorage.setItem('targetLang', el.langTarget.value);
      if (el.modelSelect) localStorage.setItem('translationModel', el.modelSelect.value || 'deepseek');
    } catch (err) {
      alert('*️⃣ Unable to save preview data (storage quota/incognito).');
      return;
    }

    window.location.href = 'preview.html';
  }

  function handleFileChange(evt) {
    const file = evt.target.files && evt.target.files[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.rpy')) {
      log('*️⃣ Please upload a .rpy file.', 'error');
      evt.target.value = '';
      if (el.translateBtn) el.translateBtn.disabled = true;
      return;
    }

    const reader = new FileReader();
    reader.onload = e => {
      state.fileName = file.name;
      state.originalText = String(e.target.result || '');
      state.originalLines = state.originalText.split(/\r?\n/);
      state.dialogs = [];
      state.batches = [];
      state.isTranslating = false;
      state.isPaused = false;
      state.currentBatchIndex = 0;
      state.logEntries = [];
      state.translationCache.clear();

      log(`ℹ️ Loaded file "${file.name}" (${state.originalLines.length} lines).`, 'info');

      if (el.translateBtn) el.translateBtn.disabled = false;
      if (el.downloadFinal) el.downloadFinal.disabled = true;
      if (el.previewBtn) el.previewBtn.disabled = true;

      if (el.progressBar) {
        el.progressBar.value = 0;
        el.progressBar.max = 1;
      }
      if (el.progressText) {
        el.progressText.textContent = '0 / 0 lines translated';
      }
    };
    reader.onerror = () => log('*️⃣ Failed to read file.', 'error');
    reader.readAsText(file, 'utf-8');
  }

  function showLibreModal() {
    if (!el.libreWarningModal) return;
    el.libreWarningModal.style.display = 'flex';
  }

  function hideLibreModal() {
    if (!el.libreWarningModal) return;
    el.libreWarningModal.style.display = 'none';
  }

  function setupModelSelectBehavior() {
    if (!el.modelSelect) return;

    const apply = () => {
      const value = el.modelSelect.value;

      if (value === 'deepseek') {
        if (el.apiKeyContainer) el.apiKeyContainer.style.display = 'block';
        if (el.deeplKeyContainer) el.deeplKeyContainer.style.display = 'none';
      } else if (value === 'deepl') {
        if (el.apiKeyContainer) el.apiKeyContainer.style.display = 'none';
        if (el.deeplKeyContainer) el.deeplKeyContainer.style.display = 'block';
      } else {
        if (el.apiKeyContainer) el.apiKeyContainer.style.display = 'none';
        if (el.deeplKeyContainer) el.deeplKeyContainer.style.display = 'none';
        showLibreModal();
      }
    };

    el.modelSelect.addEventListener('change', apply);
    apply();
  }

  function setupModalBehavior() {
    if (el.libreWarningClose) el.libreWarningClose.addEventListener('click', hideLibreModal);
    if (el.confirmLibre) el.confirmLibre.addEventListener('click', hideLibreModal);
    if (el.libreWarningModal) {
      el.libreWarningModal.addEventListener('click', e => {
        if (e.target === el.libreWarningModal) hideLibreModal();
      });
    }
  }

  function init() {
    if (el.fileInput) el.fileInput.addEventListener('change', handleFileChange);

    if (el.translateBtn) {
      el.translateBtn.addEventListener('click', startTranslation);
      el.translateBtn.disabled = true;
    }

    if (el.stopBtn) {
      el.stopBtn.addEventListener('click', () => {
        if (!state.isTranslating) return;
        state.isPaused = true;
        updateControlButtons();
      });
    }

    if (el.resumeBtn) {
      el.resumeBtn.addEventListener('click', () => {
        if (!state.isTranslating) return;
        state.isPaused = false;
        updateControlButtons();
      });
    }

    if (el.downloadFinal) {
      el.downloadFinal.addEventListener('click', handleDownloadFinal);
      el.downloadFinal.disabled = true;
    }

    if (el.downloadProgress) el.downloadProgress.addEventListener('click', handleDownloadProgress);

    if (el.previewBtn) {
      el.previewBtn.addEventListener('click', handlePreview);
      el.previewBtn.disabled = true;
    }

    setupModelSelectBehavior();
    setupModalBehavior();
    updateControlButtons();
    updateProgress();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();