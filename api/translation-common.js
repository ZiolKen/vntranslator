(function (global) {
  'use strict';

  const ENGINE_CATALOG = Object.freeze([
    { id: 'deepseek', provider: 'deepseek', label: 'DeepSeek', uiLabel: '🔥 DeepSeek API — High Quality (Paid)' },
    { id: 'gpt-4o', provider: 'openai', label: 'ChatGPT 4o', uiLabel: '💎 ChatGPT 4o — Highest Quality (Paid)' },
    { id: 'gpt-4o-mini', provider: 'openai', label: 'ChatGPT 4o Mini', uiLabel: '⚡ ChatGPT 4o Mini — Fast & Cheap (Paid)' },
    { id: 'gpt-5.4', provider: 'openai', label: 'ChatGPT 5.4', uiLabel: '🚀 ChatGPT 5.4 — Best Quality (Paid)' },
    { id: 'gpt-5.4-mini', provider: 'openai', label: 'ChatGPT 5.4 Mini', uiLabel: '💡 ChatGPT 5.4 Mini — Balanced (Paid)' },
    { id: 'gpt-5.4-nano', provider: 'openai', label: 'ChatGPT 5.4 Nano', uiLabel: '📦 ChatGPT 5.4 Nano — Cheapest (Paid)' },
    { id: 'gpt-3.5-turbo', provider: 'openai', label: 'ChatGPT 3.5 Turbo', uiLabel: '🧩 ChatGPT 3.5 Turbo — Legacy Budget (Paid)' },
    { id: 'lingva', provider: 'free', label: 'Lingva', uiLabel: '🌐 Lingva — Free (Lower Quality)' },
    { id: 'google', provider: 'free', label: 'Google Translate', uiLabel: '💠 Google Translate — Free (Fast)' }
  ]);

  const ENGINE_MAP = new Map(ENGINE_CATALOG.map((item) => [item.id, item]));

  const ENGINE_ALIASES = Object.freeze({
    libre: 'lingva',
    'google-translate': 'google',
    googletranslate: 'google',
    'gpt-5': 'gpt-5.4',
    'gpt-5-mini': 'gpt-5.4-mini',
    'gpt-5-nano': 'gpt-5.4-nano'
  });

  const LABEL_BY_CODE = Object.freeze({
    en: 'English',
    'en-us': 'English',
    'en-gb': 'English',
    'zh-cn': 'Chinese (Simplified)',
    zh: 'Chinese (Simplified)',
    hi: 'Hindi',
    es: 'Spanish',
    fr: 'French',
    ar: 'Arabic',
    pt: 'Portuguese',
    'pt-pt': 'Portuguese',
    'pt-br': 'Portuguese',
    ru: 'Russian',
    de: 'German',
    ja: 'Japanese',
    id: 'Indonesian',
    'bahasa indonesia': 'Indonesian',
    ms: 'Malay',
    vi: 'Vietnamese',
    'vi-vn': 'Vietnamese',
    tl: 'Filipino',
    fil: 'Filipino',
    ko: 'Korean'
  });

  const CODE_BY_LABEL = Object.freeze({
    english: 'en',
    'chinese (simplified)': 'zh-CN',
    'simplified chinese': 'zh-CN',
    chinese: 'zh-CN',
    hindi: 'hi',
    spanish: 'es',
    french: 'fr',
    arabic: 'ar',
    portuguese: 'pt',
    russian: 'ru',
    german: 'de',
    japanese: 'ja',
    indonesian: 'id',
    'bahasa indonesia': 'id',
    malaysia: 'ms',
    malay: 'ms',
    vietnamese: 'vi',
    filipino: 'tl',
    filipina: 'tl',
    tagalog: 'tl',
    korean: 'ko'
  });

  const LINGVA_HOSTS = Object.freeze([
    'https://lingva.vercel.app',
    'https://lingva.garudalinux.org',
    'https://lingva.lunar.icu',
    'https://translate.projectsegfau.lt',
    'https://lingva.dialectapp.org',
    'https://lingva.ml',
    'https://translate.plausibility.cloud',
  ]);

  let lingvaBestHost = null;
  const googleCache = new Map();

  function normalizeEngineId(value) {
    const raw = String(value || '').trim();
    if (!raw) return 'deepseek';
    const lowered = raw.toLowerCase();
    return ENGINE_ALIASES[lowered] || lowered;
  }

  function getEngineMeta(value) {
    return ENGINE_MAP.get(normalizeEngineId(value)) || null;
  }

  function getEngineProvider(value) {
    return getEngineMeta(value)?.provider || null;
  }

  function isOpenAIEngine(value) {
    return getEngineProvider(value) === 'openai';
  }

  function requiresApiKey(value) {
    const provider = getEngineProvider(value);
    return provider === 'deepseek' || provider === 'openai';
  }

  function getEngineLabel(value) {
    return getEngineMeta(value)?.label || String(value || 'Unknown');
  }

  function getEngineUiLabel(value) {
    return getEngineMeta(value)?.uiLabel || getEngineLabel(value);
  }

  function getEngineOptions() {
    return ENGINE_CATALOG.map((item) => ({ ...item }));
  }

  function fillEngineSelect(select, preferredValue) {
    if (!select) return;
    const selected = normalizeEngineId(preferredValue ?? select.value ?? 'deepseek');
    const frag = document.createDocumentFragment();
    for (const item of ENGINE_CATALOG) {
      const option = document.createElement('option');
      option.value = item.id;
      option.textContent = item.uiLabel;
      frag.appendChild(option);
    }
    select.replaceChildren(frag);
    select.value = ENGINE_MAP.has(selected) ? selected : ENGINE_CATALOG[0].id;
  }

  function sanitizeApiKey(apiKey) {
    return String(apiKey || '')
      .trim()
      .replace(/^authorization\s*:\s*bearer\s+/i, '')
      .replace(/^bearer\s+/i, '')
      .replace(/^['"]+|['"]+$/g, '')
      .trim();
  }

  function normalizeTargetCode(value) {
    const raw = String(value || '').trim();
    if (!raw) return 'en';
    const lower = raw.toLowerCase();
    if (CODE_BY_LABEL[lower]) return CODE_BY_LABEL[lower];
    if (lower === 'zh' || lower === 'zh-cn' || lower === 'zh_cn') return 'zh-CN';
    if (lower === 'fil') return 'tl';
    if (/^[a-z]{2}(?:-[a-z0-9]+)?$/i.test(raw)) return raw;
    return raw;
  }

  function languageLabel(value) {
    const raw = String(value || '').trim();
    if (!raw) return 'English';
    const lower = raw.toLowerCase();
    if (LABEL_BY_CODE[lower]) return LABEL_BY_CODE[lower];
    if (CODE_BY_LABEL[lower]) return LABEL_BY_CODE[CODE_BY_LABEL[lower].toLowerCase()] || raw;
    return raw;
  }

  function normalizeLingvaTargetCode(value) {
    const code = normalizeTargetCode(value);
    const lower = String(code || '').toLowerCase();
    if (lower === 'zh' || lower === 'zh-cn' || lower === 'zh_cn') return 'zh-CN';
    if (lower === 'fil') return 'tl';
    return code;
  }

  function normalizeGoogleTargetCode(value) {
    const code = normalizeTargetCode(value);
    const lower = String(code || '').toLowerCase();
    if (lower === 'zh' || lower === 'zh-cn' || lower === 'zh_cn') return 'zh-CN';
    if (lower === 'fil') return 'tl';
    return code;
  }

  function getChatContent(data) {
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
      return content.map((part) => {
        if (typeof part === 'string') return part;
        if (typeof part?.text === 'string') return part.text;
        return '';
      }).join('');
    }
    return '';
  }

  function safeParseJsonArray(content) {
    const raw = String(content || '').trim();
    if (!raw) return null;

    const tryParse = (value) => {
      const parsed = JSON.parse(value);
      if (!Array.isArray(parsed)) throw new Error('Not an array');
      return parsed;
    };

    try {
      return tryParse(raw);
    } catch (_) {}

    const start = raw.indexOf('[');
    const end = raw.lastIndexOf(']');
    if (start !== -1 && end !== -1 && end > start) {
      try {
        return tryParse(raw.slice(start, end + 1));
      } catch (_) {}
    }

    return null;
  }

  async function sleep(ms, signal) {
    const timeout = Math.max(0, Number(ms) || 0);
    if (!timeout) return;
    await new Promise((resolve, reject) => {
      const onAbort = () => {
        clearTimeout(timer);
        reject(signal?.reason || new DOMException('Aborted', 'AbortError'));
      };
      const timer = setTimeout(() => {
        if (signal) signal.removeEventListener('abort', onAbort);
        resolve();
      }, timeout);
      if (signal) {
        if (signal.aborted) {
          clearTimeout(timer);
          reject(signal.reason || new DOMException('Aborted', 'AbortError'));
          return;
        }
        signal.addEventListener('abort', onAbort, { once: true });
      }
    });
  }

  async function pMap(items, concurrency, mapper) {
    const arr = Array.from(items || []);
    if (!arr.length) return [];

    const limit = Math.max(1, Number(concurrency) || 1);
    const results = new Array(arr.length);
    let nextIndex = 0;
    let firstError = null;

    async function worker() {
      while (true) {
        const index = nextIndex++;
        if (index >= arr.length || firstError) return;
        try {
          results[index] = await mapper(arr[index], index);
        } catch (error) {
          firstError = error;
          return;
        }
      }
    }

    const workers = Array.from({ length: Math.min(limit, arr.length) }, () => worker());
    await Promise.all(workers);
    if (firstError) throw firstError;
    return results;
  }

  async function requestDeepSeekChat({ apiKey, model = 'deepseek-chat', messages, signal }) {
    const key = sanitizeApiKey(apiKey);
    if (!key) throw new Error('Missing DeepSeek API key');

    let response;
    try {
      response = await fetch('/api/deepseek-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: key, model, messages, stream: false }),
        signal
      });
    } catch (error) {
      throw new Error('Network error when calling DeepSeek proxy: ' + (error?.message || error));
    }

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error('DeepSeek error ' + response.status + (text ? ': ' + text : ''));
    }

    return response.json();
  }

  async function requestOpenAIChat({ apiKey, model, messages, signal }) {
    const key = sanitizeApiKey(apiKey);
    if (!key) throw new Error('Missing OpenAI API key');

    const resolvedModel = normalizeEngineId(model);
    let response;

    try {
      response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + key
        },
        body: JSON.stringify({ model: resolvedModel, messages }),
        signal,
        credentials: 'omit'
      });
    } catch (error) {
      throw new Error('Network error when calling OpenAI: ' + (error?.message || error));
    }

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error('OpenAI HTTP ' + response.status + (text ? ': ' + text : ''));
    }

    return response.json();
  }

  async function lingvaFetch(path, signal) {
    const hosts = lingvaBestHost
      ? [lingvaBestHost, ...LINGVA_HOSTS.filter((host) => host !== lingvaBestHost)]
      : LINGVA_HOSTS.slice();

    let lastError = null;

    for (const host of hosts) {
      try {
        const response = await fetch(host + path, { cache: 'no-store', signal });
        if (response.ok) {
          lingvaBestHost = host;
          return response;
        }
        lastError = new Error('Lingva HTTP ' + response.status + ' from ' + host);
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError || new Error('Lingva: all endpoints failed');
  }

  async function translateLingvaLines(lines, target, options = {}) {
    const signal = options.signal;
    const concurrency = options.concurrency ?? 24;
    const delayMs = options.delayMs ?? 0;
    const langCode = normalizeLingvaTargetCode(target);

    return pMap(lines, concurrency, async (value) => {
      const text = String(value ?? '');
      if (!text.trim()) return text;
      const path = '/api/v1/auto/' + encodeURIComponent(langCode) + '/' + encodeURIComponent(text);
      const response = await lingvaFetch(path, signal);
      const data = await response.json().catch(() => ({}));
      const translated = data.translation || data.translatedText || data.result || '';
      if (!translated) throw new Error('Lingva response did not contain a translation string.');
      if (delayMs) await sleep(delayMs, signal);
      return String(translated);
    });
  }

  async function translateGoogleText(text, source, target, signal) {
    const safeText = String(text ?? '');
    if (!safeText.trim()) return safeText;

    const sl = String(source || 'auto').trim() || 'auto';
    const tl = normalizeGoogleTargetCode(target);
    const cacheKey = sl + '->' + tl + '::' + safeText;

    if (googleCache.has(cacheKey)) return googleCache.get(cacheKey);

    const url =
      'https://translate.googleapis.com/translate_a/single?client=gtx&sl=' + encodeURIComponent(sl) +
      '&tl=' + encodeURIComponent(tl) +
      '&dt=t&q=' + encodeURIComponent(safeText);

    const response = await fetch(url, { signal, cache: 'no-store' });
    if (!response.ok) throw new Error('Google Translate HTTP ' + response.status);

    const data = await response.json();
    const translated = (data?.[0] || []).map((entry) => entry?.[0] || '').join('');
    googleCache.set(cacheKey, translated);
    return translated;
  }

  async function translateGoogleLines(lines, target, options = {}) {
    const signal = options.signal;
    const concurrency = options.concurrency ?? 24;
    const delayMs = options.delayMs ?? 0;
    const source = options.source || 'auto';

    return pMap(lines, concurrency, async (value) => {
      const translated = await translateGoogleText(value, source, target, signal);
      if (delayMs) await sleep(delayMs, signal);
      return translated;
    });
  }

  global.VNTranslationCommon = {
    engines: ENGINE_CATALOG,
    fillEngineSelect,
    getEngineOptions,
    getEngineMeta,
    getEngineLabel,
    getEngineUiLabel,
    getEngineProvider,
    isOpenAIEngine,
    requiresApiKey,
    normalizeEngineId,
    sanitizeApiKey,
    normalizeTargetCode,
    normalizeLingvaTargetCode,
    normalizeGoogleTargetCode,
    languageLabel,
    safeParseJsonArray,
    getChatContent,
    requestDeepSeekChat,
    requestOpenAIChat,
    translateLingvaLines,
    translateGoogleLines,
    sleep,
    pMap
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
