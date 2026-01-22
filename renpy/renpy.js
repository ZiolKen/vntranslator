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
    newline: '\n',
    items: [],
    translatedById: new Map(),
    maskedById: new Map(),
    placeholderMapsById: new Map(),
    isTranslating: false,
    isPaused: false,
    currentBatchIndex: 0,
    translatedCount: 0,
    logEntries: [],
    cache: new Map(),
    logBuffer: [],
    logFlushScheduled: false,
  };

  const TRANSLATOR_CREDIT =
    '# Translated by VNsTranslator: https://vntranslator.vercel.app/ or https://vntranslator.pages.dev/';

  const NON_TEXT_STARTERS = new Set([
    'define', 'default', 'image', 'style', 'transform', 'label', 'jump', 'call', 'return',
    'scene', 'show', 'hide', 'play', 'stop', 'queue', 'voice', 'sound', 'with',
    'init', 'python', '$', 'if', 'elif', 'else', 'while', 'for', 'screen',
    'config', 'renpy', 'import', 'key', 'text', 'add', 'action', 'window',
    'menu', 'translate', 'pass', 'on', 'use'
  ]);

  const PLACEHOLDER_RE = /__RENPLH_\d+_\d+__/g;
  const TAG_RE = /\[[^\[\]]*\]|\{[^{}]*\}/g;

  function delay(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

  function languageLabel(codeOrName) {
    const v = String(codeOrName || '').toLowerCase().trim();
    if (['id', 'indonesian', 'bahasa indonesia'].includes(v)) return 'Indonesian';
    if (['en', 'english', 'en-us', 'en-gb'].includes(v)) return 'English';
    if (['ms', 'malay', 'ms-my'].includes(v)) return 'Malay';
    if (['vi', 'vietnamese', 'vi-vn'].includes(v)) return 'Vietnamese';
    if (['tl', 'fil', 'filipino', 'tagalog'].includes(v)) return 'Filipino';
    if (['zh', 'zh-cn', 'chinese (simplified)', 'simplified chinese', 'chinese'].includes(v)) return 'Chinese (Simplified)';
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
    if (low === 'chinese (simplified)' || low === 'simplified chinese' || low === 'zh' || low === 'zh-cn') return 'ZH';
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
    if (typeof TextEncoder === 'undefined') return Math.ceil(String(text || '').length / 4);
    const bytes = new TextEncoder().encode(String(text || ''));
    return Math.ceil(bytes.length / 4);
  }

  function log(message, level) {
    const lvl = level || 'info';
    const entryText = String(message);
    state.logEntries.push(entryText);
    state.logBuffer.push({ text: entryText, level: lvl });
    scheduleLogFlush();
  }

  function scheduleLogFlush() {
    if (state.logFlushScheduled) return;
    state.logFlushScheduled = true;
    requestAnimationFrame(() => {
      state.logFlushScheduled = false;
      flushLogBuffer();
    });
  }

  function flushLogBuffer() {
    if (!el.logBox) return;
    const frag = document.createDocumentFragment();
    const batch = state.logBuffer.splice(0, state.logBuffer.length);
    for (let i = 0; i < batch.length; i++) {
      const p = document.createElement('p');
      p.textContent = batch[i].text;
      const lvl = batch[i].level;
      if (lvl === 'error') p.style.color = '#ff1b1b';
      else if (lvl === 'warn') p.style.color = '#f1f759';
      else if (lvl === 'success') p.style.color = '#39ff14';
      else p.style.color = '#00ffff';
      frag.appendChild(p);
    }
    el.logBox.appendChild(frag);
    el.logBox.scrollTop = el.logBox.scrollHeight;
    const maxNodes = 4000;
    while (el.logBox.childNodes.length > maxNodes) {
      el.logBox.removeChild(el.logBox.firstChild);
    }
  }

  function setTranslateButtonBusy(isBusy, labelWhenBusy) {
    if (!el.translateBtn || !el.translateLabel || !el.spinner) return;
    if (isBusy) {
      el.translateBtn.disabled = true;
      el.translateLabel.textContent = labelWhenBusy || 'Translating...';
      el.spinner.style.display = 'inline-block';
    } else {
      el.translateBtn.disabled = false;
      el.translateLabel.textContent = 'Start Translating';
      el.spinner.style.display = 'none';
    }
  }

  function updateProgress() {
    const total = state.items.length;
    const done = state.translatedCount;
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

  function resetAfterFinish() {
    state.isTranslating = false;
    state.isPaused = false;
    state.currentBatchIndex = 0;
    setTranslateButtonBusy(false);
    updateControlButtons();
  }

  function findCommentOutsideString(line) {
    let i = 0;
    while (i < line.length) {
      const ch = line[i];
      if (ch === '"' || ch === "'") {
        const triple = line.slice(i, i + 3) === ch + ch + ch;
        if (triple) {
          const delim = ch + ch + ch;
          i += 3;
          while (i < line.length) {
            if (line.slice(i, i + 3) === delim) {
              i += 3;
              break;
            }
            if (line[i] === '\\') i += 2;
            else i += 1;
          }
          continue;
        }
        const quote = ch;
        i += 1;
        while (i < line.length) {
          if (line[i] === '\\') {
            i += 2;
            continue;
          }
          if (line[i] === quote) {
            i += 1;
            break;
          }
          i += 1;
        }
        continue;
      }
      if (ch === '#') return i;
      i += 1;
    }
    return -1;
  }

  function decodeRenpyString(raw, delimiter) {
    const q = delimiter[0];
    if (delimiter === '"""' || delimiter === "'''") {
      return String(raw || '').replace(new RegExp('\\\\' + q, 'g'), q);
    }
    return String(raw || '')
      .replace(/\\n/g, '\n')
      .replace(/\\\\/g, '\\')
      .replace(new RegExp('\\\\' + q, 'g'), q);
  }

  function encodeRenpyString(text, delimiter) {
    const t = String(text || '');
    const q = delimiter[0];
    if (delimiter === '"""' || delimiter === "'''") {
      const triple = q + q + q;
      let safe = t.replaceAll(triple, '\\' + triple);
      safe = safe.replace(new RegExp(q, 'g'), '\\' + q);
      return safe;
    }
    return t
      .replace(/\\/g, '\\\\')
      .replace(/\n/g, '\\n')
      .replace(new RegExp(q, 'g'), '\\' + q);
  }

  function scanStringLiteral(text, absOffset) {
    const q = text[absOffset];
    if (q !== '"' && q !== "'") throw new Error('Not at quote');
    const isTriple = text.slice(absOffset, absOffset + 3) === q + q + q;
    const delimiter = isTriple ? q + q + q : q;
    const contentStart = absOffset + delimiter.length;
    let i = contentStart;

    if (isTriple) {
      while (i < text.length) {
        if (text.slice(i, i + 3) === delimiter) {
          const contentEnd = i;
          const raw = text.slice(contentStart, contentEnd);
          return {
            delimiter,
            contentStart,
            contentEnd,
            raw,
            decoded: decodeRenpyString(raw, delimiter),
            endQuoteEnd: contentEnd + 3,
          };
        }
        if (text[i] === '\\') i += 2;
        else i += 1;
      }
      throw new Error('Unterminated triple-quoted string');
    }

    while (i < text.length) {
      const ch = text[i];
      if (ch === '\n') throw new Error('Unterminated string before newline');
      if (ch === '\\') {
        i += 2;
        continue;
      }
      if (ch === q) {
        const contentEnd = i;
        const raw = text.slice(contentStart, contentEnd);
        return {
          delimiter,
          contentStart,
          contentEnd,
          raw,
          decoded: decodeRenpyString(raw, delimiter),
          endQuoteEnd: contentEnd + 1,
        };
      }
      i += 1;
    }
    throw new Error('Unterminated string');
  }

  function computeLineStarts(text) {
    const starts = [0];
    for (let i = 0; i < text.length; i++) if (text[i] === '\n') starts.push(i + 1);
    return starts;
  }

  function extractRenpyTextItems(text) {
    const lineStarts = computeLineStarts(text);
    const items = [];
    let nextId = 1;

    let inPythonBlock = false;
    let pythonIndent = 0;

    let inMenuBlock = false;
    let menuIndent = 0;
    let sawMenuPrompt = false;

    for (let li = 0; li < lineStarts.length; li++) {
      const start = lineStarts[li];
      const end = (li + 1 < lineStarts.length) ? lineStarts[li + 1] : text.length;
      const fullLine = text.slice(start, end);
      const line = fullLine.endsWith('\n') ? fullLine.slice(0, -1) : fullLine;

      const indentMatch = line.match(/^[ \t]*/);
      const indent = indentMatch ? indentMatch[0].length : 0;

      const trimmed = line.trim();
      if (!trimmed) continue;

      if (inPythonBlock && indent <= pythonIndent) inPythonBlock = false;
      if (inPythonBlock) continue;

      if (inMenuBlock && indent <= menuIndent) {
        inMenuBlock = false;
        sawMenuPrompt = false;
      }

      const cIdx = findCommentOutsideString(line);
      const codePart = (cIdx >= 0 ? line.slice(0, cIdx) : line).trim();
      if (!codePart) continue;

      if (/^(init\s+)?python(\s+early)?\s*:\s*$/i.test(codePart)) {
        inPythonBlock = true;
        pythonIndent = indent;
        continue;
      }

      if (/^menu\s*:\s*$/i.test(codePart)) {
        inMenuBlock = true;
        menuIndent = indent;
        sawMenuPrompt = false;
        continue;
      }

      const firstTokenMatch = codePart.match(/^([A-Za-z_\$][\w\$]*)/);
      const firstToken = firstTokenMatch ? firstTokenMatch[1] : '';

      if (!inMenuBlock && firstToken) {
        const tok = firstToken.toLowerCase();
        if (NON_TEXT_STARTERS.has(tok) && tok !== 'extend') continue;
      }

      if (inMenuBlock) {
        const beginsWithQuote = codePart[0] === '"' || codePart[0] === "'";
        if (!beginsWithQuote) continue;
        const absQuoteOffset = start + line.indexOf(codePart);
        const lit = scanStringLiteral(text, absQuoteOffset);
        const after = codePart.slice(0).trimEnd();
        const kind = !sawMenuPrompt ? 'menu_prompt' : 'menu_choice';
        items.push({
          id: nextId++,
          kind,
          startOffset: lit.contentStart,
          endOffset: lit.contentEnd,
          delimiter: lit.delimiter,
          text: lit.decoded,
          meta: { line: li + 1 }
        });
        sawMenuPrompt = true;
        continue;
      }

      let qPos = -1;
      for (let i = 0; i < codePart.length; i++) {
        const ch = codePart[i];
        if (ch === '"' || ch === "'") {
          qPos = i;
          break;
        }
      }
      if (qPos < 0) continue;

      const prefix = codePart.slice(0, qPos).trim();
      const isPrefixEmpty = prefix.length === 0;
      const isExtend = /^extend\b/i.test(prefix);

      const isTokenPrefix =
        /^[A-Za-z_][\w]*(\s+[A-Za-z_][\w]*)*$/.test(prefix) &&
        !/[=\(\.\[]/.test(prefix) &&
        !NON_TEXT_STARTERS.has(prefix.split(/\s+/)[0].toLowerCase());

      if (!isPrefixEmpty && !isExtend && !isTokenPrefix) continue;

      const absQuoteOffset = start + line.indexOf(codePart) + qPos;
      const lit = scanStringLiteral(text, absQuoteOffset);

      items.push({
        id: nextId++,
        kind: isExtend ? 'extend' : 'say',
        startOffset: lit.contentStart,
        endOffset: lit.contentEnd,
        delimiter: lit.delimiter,
        text: lit.decoded,
        meta: { line: li + 1 }
      });
    }

    return items;
  }

  function maskTags(text, itemId) {
    const s = String(text || '');
    if (!s) return { masked: s, map: Object.create(null) };
    const map = Object.create(null);
    let counter = 0;
    let result = '';
    let lastIndex = 0;
    const re = TAG_RE;
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(s)) !== null) {
      const originalTag = m[0];
      const placeholder = '__RENPLH_' + itemId + '_' + (counter++) + '__';
      result += s.slice(lastIndex, m.index) + placeholder;
      lastIndex = m.index + originalTag.length;
      map[placeholder] = originalTag;
    }
    result += s.slice(lastIndex);
    return { masked: result, map };
  }

  function unmaskTags(text, map) {
    const s = String(text || '');
    if (!s || !map) return s;
    return s.replace(PLACEHOLDER_RE, (ph) => (Object.prototype.hasOwnProperty.call(map, ph) ? map[ph] : ph));
  }

  function extractPlaceholders(s) {
    return (String(s || '').match(PLACEHOLDER_RE) || []);
  }

  function sameMultiset(a, b) {
    if (a.length !== b.length) return false;
    const m = new Map();
    for (let i = 0; i < a.length; i++) m.set(a[i], (m.get(a[i]) || 0) + 1);
    for (let j = 0; j < b.length; j++) {
      const c = m.get(b[j]) || 0;
      if (!c) return false;
      if (c === 1) m.delete(b[j]);
      else m.set(b[j], c - 1);
    }
    return m.size === 0;
  }

  function validatePlaceholders(srcMasked, tgtMasked) {
    return sameMultiset(extractPlaceholders(srcMasked), extractPlaceholders(tgtMasked));
  }

  function countTags(s) {
    const matches = String(s || '').match(TAG_RE) || [];
    let sq = 0, cu = 0;
    for (let i = 0; i < matches.length; i++) {
      if (matches[i][0] === '[') sq++;
      else cu++;
    }
    return { square: sq, curly: cu };
  }

  function validateTagsCount(src, tgt) {
    const A = countTags(src);
    const B = countTags(tgt);
    return A.square === B.square && A.curly === B.curly;
  }

  function createBatches(itemIds, options) {
    const maxLines = options.maxLines ?? 48;
    const maxTokens = options.maxTokens ?? 1800;
    const batches = [];
    let current = [];
    let tok = 0;

    for (let i = 0; i < itemIds.length; i++) {
      const id = itemIds[i];
      const masked = state.maskedById.get(id) || '';
      const cost = estimateTokens(masked) + 12;
      if (current.length > 0 && (current.length >= maxLines || tok + cost > maxTokens)) {
        batches.push(current);
        current = [];
        tok = 0;
      }
      current.push(id);
      tok += cost;
    }
    if (current.length) batches.push(current);
    return batches;
  }

  function parseJsonStringArray(s) {
    const t = String(s || '').trim();
    try {
      const val = JSON.parse(t);
      if (Array.isArray(val) && val.every(x => typeof x === 'string')) return val;
    } catch {}
    const first = t.indexOf('[');
    const last = t.lastIndexOf(']');
    if (first >= 0 && last > first) {
      const sub = t.slice(first, last + 1);
      const val = JSON.parse(sub);
      if (Array.isArray(val) && val.every(x => typeof x === 'string')) return val;
    }
    throw new Error('Model output is not a JSON string array');
  }

  async function withRetry(fn, retries, baseMs) {
    let err;
    for (let i = 0; i <= retries; i++) {
      try {
        return await fn();
      } catch (e) {
        err = e;
        const wait = baseMs * Math.pow(2, i);
        await delay(wait);
      }
    }
    throw err;
  }

  async function translateBatchDeepSeek(ids, targetLang, apiKey) {
    const lines = ids.map(id => state.maskedById.get(id) || '');
    const langName = languageLabel(targetLang);
    const prompt = [
      `Translate the following Ren'Py dialogue lines to ${langName} (code: ${targetLang}).`,
      `Return ONLY a valid JSON array of strings, same length, same order.`,
      `Rules:`,
      `- Keep placeholders like __RENPLH_1_0__ EXACTLY as-is.`,
      `- Preserve Ren'Py syntax/tags/variables.`,
      `- Do not merge/split/reorder.`,
      `Input lines (JSON array):`,
      JSON.stringify(lines)
    ].join('\n');

    const bodyForProxy = {
      apiKey: apiKey,
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: 'You are a professional game localization translator specializing in Ren\'Py visual novels.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0,
      stream: false,
    };

    const res = await fetch('/api/deepseek-proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bodyForProxy),
    });

    if (!res.ok) {
      const t = await res.text().catch(() => '');
      throw new Error(`DeepSeek/proxy error ${res.status}: ${t}`);
    }

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) throw new Error('DeepSeek response missing content');
    return parseJsonStringArray(content);
  }

  async function translateBatchDeepL(ids, targetLang, apiKey) {
    const lines = ids.map(id => state.maskedById.get(id) || '');
    const targetCode = getDeepLLangCode(targetLang);

    const bodyForProxy = {
      apiKey: apiKey,
      text: lines,
      target_lang: targetCode,
      preserve_formatting: 1,
      split_sentences: 0,
      ...(needsDeepLQualityModel(targetCode) ? { model_type: 'quality_optimized' } : {}),
    };

    const res = await fetch('/api/deepl-trans', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bodyForProxy),
    });

    if (!res.ok) {
      const t = await res.text().catch(() => '');
      throw new Error(`DeepL/proxy error ${res.status}: ${t}`);
    }

    const data = await res.json();
    const translations = Array.isArray(data?.translations) ? data.translations : [];
    const out = translations.map(x => (x && typeof x.text === 'string') ? x.text : '');
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

  async function lingvaFetch(path) {
    let lastError;
    for (let i = 0; i < LINGVA_BASE_URLS.length; i++) {
      const base = LINGVA_BASE_URLS[i];
      const url = base.replace(/\/+$/, '') + path;
      try {
        const res = await fetch(url);
        if (!res.ok) {
          lastError = new Error(`HTTP ${res.status} from ${base}`);
          continue;
        }
        return res;
      } catch (e) {
        lastError = e;
      }
    }
    throw lastError || new Error('All Lingva endpoints failed');
  }

  async function translateBatchLingva(ids, targetLang) {
    const langCode = getLingvaLangCode(targetLang);
    const out = new Array(ids.length).fill('');
    const maxUrlLen = 1800;
    const concurrency = 3;
    let cursor = 0;

    async function worker() {
      while (cursor < ids.length) {
        const idx = cursor++;
        const id = ids[idx];
        const text = state.maskedById.get(id) || '';
        if (!text.trim()) {
          out[idx] = text;
          continue;
        }
        const path = '/api/v1/auto/' + encodeURIComponent(langCode) + '/' + encodeURIComponent(text);
        if (path.length > maxUrlLen) {
          out[idx] = '';
          continue;
        }
        const res = await lingvaFetch(path);
        const data = await res.json();
        const translated = data.translation || data.translatedText || data.result || '';
        out[idx] = translated || '';
        await delay(60);
      }
    }

    const workers = [];
    for (let i = 0; i < concurrency; i++) workers.push(worker());
    await Promise.all(workers);
    return out;
  }

  async function waitWhilePaused() {
    while (state.isPaused && state.isTranslating) await delay(120);
  }

  function applyTranslations(originalText) {
    const items = [...state.items].sort((a, b) => a.startOffset - b.startOffset);
    let out = '';
    let cursor = 0;

    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const translated = state.translatedById.get(it.id);
      if (translated == null) continue;
      const encoded = encodeRenpyString(translated, it.delimiter);
      out += originalText.slice(cursor, it.startOffset);
      out += encoded;
      cursor = it.endOffset;
    }
    out += originalText.slice(cursor);
    return out;
  }

  async function runTranslationLoop() {
    const model = el.modelSelect ? el.modelSelect.value : 'deepseek';
    const targetLang = el.langTarget ? el.langTarget.value : 'id';
    const deepseekKey = (el.apiKey && el.apiKey.value.trim()) || '';
    const deeplKey = (el.deeplApiKey && el.deeplApiKey.value.trim()) || '';

    const itemIds = state.items.map(x => x.id);

    const untranslatedIds = [];
    for (let i = 0; i < itemIds.length; i++) {
      const id = itemIds[i];
      if (!state.translatedById.has(id)) untranslatedIds.push(id);
    }

    const batches = createBatches(untranslatedIds, { maxLines: 48, maxTokens: 1800 });
    state.currentBatchIndex = 0;
    updateControlButtons();

    for (let b = 0; b < batches.length && state.isTranslating; b++) {
      if (state.isPaused) {
        log('Paused.', 'info');
        await waitWhilePaused();
        if (!state.isTranslating) return;
        log('Resuming...', 'info');
      }

      const ids = batches[b];
      const batchNum = b + 1;
      const totalBatches = batches.length;
      log(`Translating batch ${batchNum}/${totalBatches} (${ids.length} lines)...`, 'info');

      let translatedMasked = [];
      const cacheHits = new Array(ids.length).fill(false);

      for (let i = 0; i < ids.length; i++) {
        const id = ids[i];
        const masked = state.maskedById.get(id) || '';
        const cacheKey = model + '|' + targetLang + '|' + masked;
        const cached = state.cache.get(cacheKey);
        if (cached != null) {
          translatedMasked[i] = cached;
          cacheHits[i] = true;
        }
      }

      const idsToFetch = [];
      const positions = [];
      for (let i = 0; i < ids.length; i++) {
        if (!cacheHits[i]) {
          idsToFetch.push(ids[i]);
          positions.push(i);
        }
      }

      if (idsToFetch.length) {
        let fetched = [];
        try {
          if (model === 'deepseek') {
            fetched = await withRetry(() => translateBatchDeepSeek(idsToFetch, targetLang, deepseekKey), 2, 600);
          } else if (model === 'deepl') {
            fetched = await withRetry(() => translateBatchDeepL(idsToFetch, targetLang, deeplKey), 1, 500);
          } else {
            fetched = await withRetry(() => translateBatchLingva(idsToFetch, targetLang), 1, 500);
          }
        } catch (e) {
          log(`Error translating batch ${batchNum}: ${e && e.message ? e.message : String(e)}`, 'error');
          throw e;
        }

        if (fetched.length !== idsToFetch.length) {
          log(`Batch mismatch (expected ${idsToFetch.length}, got ${fetched.length}). Falling back per-line.`, 'warn');
          fetched = [];
          for (let i = 0; i < idsToFetch.length; i++) {
            const singleId = idsToFetch[i];
            try {
              if (model === 'deepseek') {
                const one = await translateBatchDeepSeek([singleId], targetLang, deepseekKey);
                fetched.push(one[0] || '');
              } else if (model === 'deepl') {
                const one = await translateBatchDeepL([singleId], targetLang, deeplKey);
                fetched.push(one[0] || '');
              } else {
                const one = await translateBatchLingva([singleId], targetLang);
                fetched.push(one[0] || '');
              }
            } catch (e) {
              fetched.push('');
            }
          }
        }

        for (let i = 0; i < positions.length; i++) {
          translatedMasked[positions[i]] = fetched[i] || '';
        }
      }

      for (let i = 0; i < ids.length; i++) {
        const id = ids[i];
        const it = state.itemsById.get(id);
        const srcDecoded = it.text;
        const srcMasked = state.maskedById.get(id) || '';
        const placeholderMap = state.placeholderMapsById.get(id) || null;

        const gotMasked = translatedMasked[i] || '';
        const cacheKey = model + '|' + targetLang + '|' + srcMasked;
        state.cache.set(cacheKey, gotMasked);

        if (!gotMasked) {
          log(`Line ${it.meta.line}: failed to translate`, 'warn');
          continue;
        }

        if (!validatePlaceholders(srcMasked, gotMasked)) {
          log(`Line ${it.meta.line}: placeholder mismatch`, 'warn');
        }

        const unmasked = unmaskTags(gotMasked, placeholderMap);
        if (!validateTagsCount(srcDecoded, unmasked)) {
          log(`Line ${it.meta.line}: tag count mismatch`, 'warn');
        }

        if (!state.translatedById.has(id)) state.translatedCount++;
        state.translatedById.set(id, unmasked);
        log(`OK [${it.meta.line}] ${unmasked}`, 'success');
      }

      updateProgress();
    }

    log('Translation complete.', 'success');
    if (el.downloadFinal) el.downloadFinal.disabled = state.translatedCount === 0;
    if (el.previewBtn) el.previewBtn.disabled = state.translatedCount === 0;
    resetAfterFinish();
  }

  async function startTranslation() {
    if (state.isTranslating) {
      log('A translation is already in progress.', 'warn');
      return;
    }
    if (!state.fileName || !state.originalText) {
      log('No .rpy file loaded.', 'error');
      return;
    }

    const model = el.modelSelect ? el.modelSelect.value : 'deepseek';
    const targetLang = el.langTarget ? el.langTarget.value : 'id';
    const deepseekKey = (el.apiKey && el.apiKey.value.trim()) || '';
    const deeplKey = (el.deeplApiKey && el.deeplApiKey.value.trim()) || '';

    if (model === 'deepseek' && !deepseekKey) {
      log('Please provide your DeepSeek API key.', 'error');
      return;
    }
    if (model === 'deepl' && !deeplKey) {
      log('Please provide your DeepL API key.', 'error');
      return;
    }

    log(`Preparing extraction for ${languageLabel(targetLang)} using model "${model}"...`, 'info');

    let items;
    try {
      items = extractRenpyTextItems(state.originalText);
    } catch (e) {
      log(`Extraction error: ${e && e.message ? e.message : String(e)}`, 'error');
      return;
    }

    if (!items.length) {
      log('No dialogue text detected in this file.', 'error');
      return;
    }

    state.items = items;
    state.itemsById = new Map();
    state.translatedById = new Map();
    state.maskedById = new Map();
    state.placeholderMapsById = new Map();
    state.translatedCount = 0;

    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      state.itemsById.set(it.id, it);
      const maskedInfo = maskTags(it.text, it.id);
      state.maskedById.set(it.id, maskedInfo.masked);
      state.placeholderMapsById.set(it.id, maskedInfo.map);
    }

    log(`Detected ${items.length} text items.`, 'info');

    state.isTranslating = true;
    state.isPaused = false;
    state.currentBatchIndex = 0;

    if (el.downloadFinal) el.downloadFinal.disabled = true;
    if (el.previewBtn) el.previewBtn.disabled = true;

    if (el.progressBar) {
      el.progressBar.value = 0;
      el.progressBar.max = items.length;
    }
    updateProgress();

    setTranslateButtonBusy(true, 'Translating...');
    if (el.controlBtns) el.controlBtns.style.display = 'flex';
    updateControlButtons();

    try {
      await runTranslationLoop();
    } catch (e) {
      log('Translation stopped due to an error.', 'error');
      resetAfterFinish();
    }
  }

  function handleDownloadFinal() {
    if (!state.originalText || !state.items.length) {
      alert('Nothing to download.');
      return;
    }
    const output = applyTranslations(state.originalText);
    const finalText = output + state.newline + state.newline + TRANSLATOR_CREDIT + state.newline;
    const blob = new Blob([finalText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    const base = (state.fileName || 'translated').replace(/\.rpy$/i, '');
    a.download = base + '_translated.rpy';
    a.href = url;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    setTimeout(() => URL.revokeObjectURL(url), 500);
    log('Downloaded translated file.', 'success');
  }

  function handleDownloadProgress() {
    const logText = state.logEntries.join(state.newline);
    const blob = new Blob([logText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.download = 'translation_log.txt';
    a.href = url;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    setTimeout(() => URL.revokeObjectURL(url), 500);
    log('Downloaded translation log.', 'success');
  }

  function handlePreview() {
    if (!state.items.length) {
      alert('Nothing to preview.');
      return;
    }
    const pairs = [];
    for (let i = 0; i < state.items.length; i++) {
      const it = state.items[i];
      const tr = state.translatedById.get(it.id) || '';
      pairs.push({ line: it.meta.line, kind: it.kind, original: it.text, translated: tr });
    }
    const payload = {
      v: 2,
      fileName: state.fileName || '',
      model: el.modelSelect ? (el.modelSelect.value || '') : '',
      targetLang: el.langTarget ? (el.langTarget.value || '') : '',
      pairs,
      translatedCount: state.translatedCount,
      total: state.items.length
    };
    try {
      localStorage.setItem('renpy_preview_v2', JSON.stringify(payload));
    } catch (e) {
      alert('Unable to save preview data (storage quota).');
      return;
    }
    window.location.href = 'preview.html?v=2';
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

  async function decodeFileSmart(file) {
    const buf = await file.arrayBuffer();
    const bytes = new Uint8Array(buf);
    if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
      const dec = new TextDecoder('utf-8');
      return dec.decode(bytes.slice(3));
    }
    const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    const repCharCount = (utf8.match(/\uFFFD/g) || []).length;
    const repRatio = utf8.length ? repCharCount / utf8.length : 0;
    if (repRatio < 0.002) return utf8;
    try {
      const sjis = new TextDecoder('shift_jis', { fatal: false }).decode(bytes);
      return sjis;
    } catch {
      return utf8;
    }
  }

  function detectNewline(text) {
    const idx = text.indexOf('\n');
    if (idx < 0) return '\n';
    if (idx > 0 && text[idx - 1] === '\r') return '\r\n';
    return '\n';
  }

  async function handleFileChange(evt) {
    const file = evt.target.files && evt.target.files[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.rpy')) {
      log('Please upload a .rpy file.', 'error');
      evt.target.value = '';
      if (el.translateBtn) el.translateBtn.disabled = true;
      return;
    }

    if (el.logBox) el.logBox.textContent = '';

    try {
      const text = await decodeFileSmart(file);
      state.fileName = file.name;
      state.originalText = text || '';
      state.newline = detectNewline(state.originalText);
      state.items = [];
      state.translatedById = new Map();
      state.maskedById = new Map();
      state.placeholderMapsById = new Map();
      state.isTranslating = false;
      state.isPaused = false;
      state.currentBatchIndex = 0;
      state.translatedCount = 0;
      state.logEntries = [];
      log(`Loaded file "${file.name}" (${state.originalText.length} chars).`, 'info');

      if (el.translateBtn) el.translateBtn.disabled = false;
      if (el.downloadFinal) el.downloadFinal.disabled = true;
      if (el.previewBtn) el.previewBtn.disabled = true;

      if (el.progressBar) {
        el.progressBar.value = 0;
        el.progressBar.max = 1;
      }
      if (el.progressText) el.progressText.textContent = '0 / 0 lines translated';
      updateControlButtons();
    } catch (e) {
      log('Failed to read file.', 'error');
      if (el.translateBtn) el.translateBtn.disabled = true;
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