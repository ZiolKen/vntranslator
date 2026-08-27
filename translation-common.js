
(function (global) {
  'use strict';

  const ENGINE_CATALOG = Object.freeze([
    { id: 'deepseek', provider: 'deepseek', label: 'DeepSeek', uiLabel: '🔥 DeepSeek API — High Quality (Paid)' },
    { id: 'deepl', provider: 'deepl', label: 'DeepL', uiLabel: '🧠 DeepL API — Strong MT Quality (Paid)' },
    { id: 'gemini-3.1-pro-preview', provider: 'gemini', label: 'Gemini 3.1 Pro', uiLabel: '💫 Gemini 3.1 Pro — Best Gemini Quality (Paid)' },
    { id: 'gemini-3.7-flash', provider: 'gemini', label: 'Gemini 3.7 Flash', uiLabel: '🌈 Gemini 3.7 Flash — Latest Flash Quality (Paid)' },
    { id: 'gemini-3.6-flash', provider: 'gemini', label: 'Gemini 3.6 Flash', uiLabel: '🌤️ Gemini 3.6 Flash — Strong Quality (Paid)' },
    { id: 'gemini-3.5-flash', provider: 'gemini', label: 'Gemini 3.5 Flash', uiLabel: '🔰 Gemini 3.5 Flash — Very Strong Quality (Paid)' },
    { id: 'gemini-3.5-flash-lite', provider: 'gemini', label: 'Gemini 3.5 Flash-Lite', uiLabel: '⚡ Gemini 3.5 Flash-Lite — Ultra Fast & Cheap (Paid)' },
    { id: 'gemini-3.1-flash-lite', provider: 'gemini', label: 'Gemini 3.1 Flash-Lite', uiLabel: '✨ Gemini 3.1 Flash-Lite — Ultra Fast & Cheap (Paid)' },
    { id: 'gemini-3-flash-preview', provider: 'gemini', label: 'Gemini 3 Flash', uiLabel: '🌟 Gemini 3 Flash — Strong Quality (Paid)' },
    { id: 'gemma-4-31b-it', provider: 'gemini', label: 'Gemma 4 31B', uiLabel: '🔱 Gemma 4 31B - Minimal Censor' },
    { id: 'gemma-4-26b-a4b-it', provider: 'gemini', label: 'Gemma 4 26B', uiLabel: '♦️ Gemma 4 26B – Minimal Censor' },
    { id: 'gpt-4o', provider: 'openai', label: 'ChatGPT 4o', uiLabel: '💎 ChatGPT 4o — Highest Quality (Paid)' },
    { id: 'gpt-4o-mini', provider: 'openai', label: 'ChatGPT 4o Mini', uiLabel: '⚡ ChatGPT 4o Mini — Fast & Cheap (Paid)' },
    { id: 'gpt-5.4', provider: 'openai', label: 'ChatGPT 5.4', uiLabel: '🚀 ChatGPT 5.4 — Best Quality (Paid)' },
    { id: 'gpt-5.4-mini', provider: 'openai', label: 'ChatGPT 5.4 Mini', uiLabel: '💡 ChatGPT 5.4 Mini — Balanced (Paid)' },
    { id: 'gpt-5.4-nano', provider: 'openai', label: 'ChatGPT 5.4 Nano', uiLabel: '📦 ChatGPT 5.4 Nano — Cheapest (Paid)' },
    { id: 'gpt-3.5-turbo', provider: 'openai', label: 'ChatGPT 3.5 Turbo', uiLabel: '🧩 ChatGPT 3.5 Turbo — Legacy Budget (Paid)' },
    { id: 'deepseek/deepseek-chat-v3-0324', provider: 'openrouter', label: 'DeepSeek V3 (OpenRouter)', uiLabel: '🐳 DeepSeek V3 — via OpenRouter (Paid)' },
    { id: 'deepseek/deepseek-r1', provider: 'openrouter', label: 'DeepSeek R1 (OpenRouter)', uiLabel: '🐋 DeepSeek R1 — via OpenRouter (Paid)' },
    { id: 'cognitivecomputations/dolphin-mistral-24b-venice-edition', provider: 'openrouter', label: 'Venice Uncensored (OpenRouter)', uiLabel: '🔓 Venice Uncensored — via OpenRouter (Paid)' },
    { id: 'nvidia/nemotron-3-super-120b-a12b:free', provider: 'openrouter', label: 'Nemotron 3 Super (OpenRouter)', uiLabel: '🌀 Nemotron 3 Super — Free via OpenRouter' },
    { id: 'google/gemma-4-31b-it:free', provider: 'openrouter', label: 'Gemma 4 31B (OpenRouter)', uiLabel: '🔅 Gemma 4 31B — Free via OpenRouter' },
    { id: 'google/gemma-4-26b-a4b-it:free', provider: 'openrouter', label: 'Gemma 4 26B (OpenRouter)', uiLabel: '⚜️ Gemma 4 26B – Free via OpenRouter' },
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
    'gpt-5-nano': 'gpt-5.4-nano',
    'deepl-translate': 'deepl',
    'gemini-3.1-pro': 'gemini-3.1-pro-preview',
    'gemini 3.1 pro': 'gemini-3.1-pro-preview',
    'gemini-3.1-flash-lite': 'gemini-3.1-flash-lite',
    'gemini 3.1 flash-lite': 'gemini-3.1-flash-lite',
    'gemini 3.1 flash lite': 'gemini-3.1-flash-lite',
    'gemini-3.5-flash-lite': 'gemini-3.5-flash-lite',
    'gemini 3.5 flash-lite': 'gemini-3.5-flash-lite',
    'gemini 3.5 flash lite': 'gemini-3.5-flash-lite',
    'gemini-3.6-flash': 'gemini-3.6-flash',
    'gemini 3.6 flash': 'gemini-3.6-flash',
    'gemini-3.7-flash': 'gemini-3.7-flash',
    'gemini 3.7 flash': 'gemini-3.7-flash',
    'gemini-3-flash': 'gemini-3-flash-preview',
    'gemini 3 flash': 'gemini-3-flash-preview',
    'deepseek-v3-openrouter': 'deepseek/deepseek-chat-v3-0324',
    'deepseek-r1-openrouter': 'deepseek/deepseek-r1',
    'openrouter-deepseek-v3': 'deepseek/deepseek-chat-v3-0324',
    'openrouter-deepseek-r1': 'deepseek/deepseek-r1',
    'venice-uncensored': 'cognitivecomputations/dolphin-mistral-24b-venice-edition',
    'nemotron-3-super': 'nvidia/nemotron-3-super-120b-a12b:free'
  });

  const TARGET_LANGUAGE_OPTIONS = Object.freeze([
    { code: 'en', label: 'English', labelValue: 'English', deepl: 'EN-US' },
    { code: 'zh-CN', label: 'Chinese (Simplified)', labelValue: 'Chinese (Simplified)', deepl: 'ZH' },
    { code: 'hi', label: 'Hindi', labelValue: 'Hindi', deepl: 'HI' },
    { code: 'es', label: 'Spanish', labelValue: 'Spanish', deepl: 'ES' },
    { code: 'fr', label: 'French', labelValue: 'French', deepl: 'FR' },
    { code: 'ar', label: 'Arabic', labelValue: 'Arabic', deepl: 'AR' },
    { code: 'pt', label: 'Portuguese', labelValue: 'Portuguese', deepl: 'PT-PT' },
    { code: 'ru', label: 'Russian', labelValue: 'Russian', deepl: 'RU' },
    { code: 'de', label: 'German', labelValue: 'German', deepl: 'DE' },
    { code: 'ja', label: 'Japanese', labelValue: 'Japanese', deepl: 'JA' },
    { code: 'id', label: 'Indonesian', labelValue: 'Bahasa Indonesia', deepl: 'ID' },
    { code: 'ms', label: 'Malay', labelValue: 'Malay', deepl: 'MS' },
    { code: 'vi', label: 'Vietnamese', labelValue: 'Vietnamese', deepl: 'VI' },
    { code: 'tl', label: 'Filipino', labelValue: 'Filipino', deepl: 'TL' },
    { code: 'ko', label: 'Korean', labelValue: 'Korean', deepl: 'KO' }
  ]);

  const PROVIDER_KEY_CONFIG = Object.freeze({
    deepseek: Object.freeze({
      label: 'DeepSeek API Key',
      placeholder: 'Enter your DeepSeek API key',
      storageKey: 'deepseekApiKey'
    }),
    deepl: Object.freeze({
      label: 'DeepL API Key',
      placeholder: 'Enter your DeepL API key',
      storageKey: 'deeplApiKey'
    }),
    gemini: Object.freeze({
      label: 'Gemini API Key',
      placeholder: 'Enter your Gemini API key',
      storageKey: 'geminiApiKey'
    }),
    openai: Object.freeze({
      label: 'OpenAI API Key',
      placeholder: 'Enter your OpenAI API key',
      storageKey: 'openaiApiKey'
    }),
    openrouter: Object.freeze({
      label: 'OpenRouter API Key',
      placeholder: 'Enter your OpenRouter API key (sk-or-...)',
      storageKey: 'openrouterApiKey'
    }),
    free: Object.freeze({
      label: 'No API key required',
      placeholder: '',
      storageKey: ''
    })
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

  const DEEPL_TARGET_BY_CODE = Object.freeze(TARGET_LANGUAGE_OPTIONS.reduce((acc, item) => {
    acc[item.code.toLowerCase()] = item.deepl;
    return acc;
  }, Object.create(null)));

  const DEEPL_TARGET_BY_LABEL = Object.freeze(TARGET_LANGUAGE_OPTIONS.reduce((acc, item) => {
    acc[item.label.toLowerCase()] = item.deepl;
    acc[item.labelValue.toLowerCase()] = item.deepl;
    return acc;
  }, Object.create(null)));

  const LINGVA_HOSTS = Object.freeze([
    'https://lingva.vercel.app',
    'https://lingva.garudalinux.org',
    'https://lingva.lunar.icu',
    'https://translate.projectsegfau.lt',
    'https://lingva.dialectapp.org',
    'https://lingva.ml',
    'https://translate.plausibility.cloud',
  ]);

  const GOOGLE_TRANSLATE_BASE = 'https://translate.google.com';

  const GOOGLE_TRANSLATE_HOSTS = Object.freeze([
    'translate.google.ac', 'translate.google.ad', 'translate.google.ae', 'translate.google.al',
    'translate.google.am', 'translate.google.as', 'translate.google.at', 'translate.google.az',
    'translate.google.ba', 'translate.google.be', 'translate.google.bf', 'translate.google.bg',
    'translate.google.bi', 'translate.google.bj', 'translate.google.bs', 'translate.google.bt',
    'translate.google.by', 'translate.google.ca', 'translate.google.cat', 'translate.google.cc',
    'translate.google.cd', 'translate.google.cf', 'translate.google.cg', 'translate.google.ch',
    'translate.google.ci', 'translate.google.cl', 'translate.google.cm', 'translate.google.cn',
    'translate.google.co.ao', 'translate.google.co.bw', 'translate.google.co.ck', 'translate.google.co.cr',
    'translate.google.co.id', 'translate.google.co.il', 'translate.google.co.in', 'translate.google.co.jp',
    'translate.google.co.ke', 'translate.google.co.kr', 'translate.google.co.ls', 'translate.google.co.ma',
    'translate.google.co.mz', 'translate.google.co.nz', 'translate.google.co.th', 'translate.google.co.tz',
    'translate.google.co.ug', 'translate.google.co.uk', 'translate.google.co.uz', 'translate.google.co.ve',
    'translate.google.co.vi', 'translate.google.co.za', 'translate.google.co.zm', 'translate.google.co.zw',
    'translate.google.com.af', 'translate.google.com.ag', 'translate.google.com.ai', 'translate.google.com.ar',
    'translate.google.com.au', 'translate.google.com.bd', 'translate.google.com.bh', 'translate.google.com.bn',
    'translate.google.com.bo', 'translate.google.com.br', 'translate.google.com.bz', 'translate.google.com.co',
    'translate.google.com.cu', 'translate.google.com.cy', 'translate.google.com.do', 'translate.google.com.ec',
    'translate.google.com.eg', 'translate.google.com.et', 'translate.google.com.fj', 'translate.google.com.gh',
    'translate.google.com.gi', 'translate.google.com.gt', 'translate.google.com.hk', 'translate.google.com.jm',
    'translate.google.com.kh', 'translate.google.com.kw', 'translate.google.com.lb', 'translate.google.com.ly',
    'translate.google.com.mm', 'translate.google.com.mt', 'translate.google.com.mx', 'translate.google.com.my',
    'translate.google.com.na', 'translate.google.com.ng', 'translate.google.com.ni', 'translate.google.com.np',
    'translate.google.com.om', 'translate.google.com.pa', 'translate.google.com.pe', 'translate.google.com.pg',
    'translate.google.com.ph', 'translate.google.com.pk', 'translate.google.com.pr', 'translate.google.com.py',
    'translate.google.com.qa', 'translate.google.com.sa', 'translate.google.com.sb', 'translate.google.com.sg',
    'translate.google.com.sl', 'translate.google.com.sv', 'translate.google.com.tj', 'translate.google.com.tr',
    'translate.google.com.tw', 'translate.google.com.ua', 'translate.google.com.uy', 'translate.google.com.vc',
    'translate.google.com.vn', 'translate.google.com', 'translate.google.cv', 'translate.google.cz',
    'translate.google.de', 'translate.google.dj', 'translate.google.dk', 'translate.google.dm',
    'translate.google.dz', 'translate.google.ee', 'translate.google.es', 'translate.google.eu',
    'translate.google.fi', 'translate.google.fm', 'translate.google.fr', 'translate.google.ga',
    'translate.google.ge', 'translate.google.gf', 'translate.google.gg', 'translate.google.gl',
    'translate.google.gm', 'translate.google.gp', 'translate.google.gr', 'translate.google.gy',
    'translate.google.hn', 'translate.google.hr', 'translate.google.ht', 'translate.google.hu',
    'translate.google.ie', 'translate.google.im', 'translate.google.io', 'translate.google.iq',
    'translate.google.is', 'translate.google.it', 'translate.google.je', 'translate.google.jo',
    'translate.google.kg', 'translate.google.ki', 'translate.google.kz', 'translate.google.la',
    'translate.google.li', 'translate.google.lk', 'translate.google.lt', 'translate.google.lu',
    'translate.google.lv', 'translate.google.md', 'translate.google.me', 'translate.google.mg',
    'translate.google.mk', 'translate.google.ml', 'translate.google.mn', 'translate.google.ms',
    'translate.google.mu', 'translate.google.mv', 'translate.google.mw', 'translate.google.ne',
    'translate.google.nf', 'translate.google.nl', 'translate.google.no', 'translate.google.nr',
    'translate.google.nu', 'translate.google.pl', 'translate.google.pn', 'translate.google.ps',
    'translate.google.pt', 'translate.google.ro', 'translate.google.rs', 'translate.google.ru',
    'translate.google.rw', 'translate.google.sc', 'translate.google.se', 'translate.google.sh',
    'translate.google.si', 'translate.google.sk', 'translate.google.sm', 'translate.google.sn',
    'translate.google.so', 'translate.google.sr', 'translate.google.st', 'translate.google.td',
    'translate.google.tg', 'translate.google.tk', 'translate.google.tl', 'translate.google.tm',
    'translate.google.tn', 'translate.google.to', 'translate.google.tt', 'translate.google.us',
    'translate.google.vg', 'translate.google.vu', 'translate.google.ws',
  ]);

  const GOOGLE_USER_AGENTS = Object.freeze([
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
  ]);

  const DEEPL_PLACEHOLDER_RE = /⟦\s*[^⟧]+?\s*⟧|__[A-Z0-9_]*PLH_\d+__/g;
  const PLACEHOLDER_TOKEN_RE = /⟦\s*PH\s*(\d+)\s*⟧/g;

  let lingvaBestHost = null;
  const googleCache = new Map();

  // Trạng thái xoay vòng cho Google Translate
  let googleBestHost = null;     // host vừa dùng thành công gần nhất -> ưu tiên thử trước
  let googleHostCursor = 0;      // con trỏ round-robin cho các lần gọi kế tiếp

  function pickGoogleUserAgent() {
    return GOOGLE_USER_AGENTS[Math.floor(Math.random() * GOOGLE_USER_AGENTS.length)];
  }

  // Trả về danh sách host theo thứ tự ưu tiên thử cho 1 lần dịch:
  // ưu tiên host thành công gần nhất, sau đó xoay vòng (round-robin) qua toàn bộ danh sách.
  function getGoogleHostOrder() {
    const total = GOOGLE_TRANSLATE_HOSTS.length;
    const start = googleHostCursor % total;
    googleHostCursor = (googleHostCursor + 1) % total;

    const rotated = [];
    for (let i = 0; i < total; i++) {
      rotated.push(GOOGLE_TRANSLATE_HOSTS[(start + i) % total]);
    }

    if (googleBestHost && rotated.includes(googleBestHost)) {
      return [googleBestHost, ...rotated.filter((host) => host !== googleBestHost)];
    }
    return rotated;
  }

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

  function getProviderKeyConfig(value) {
    const provider = ENGINE_MAP.has(normalizeEngineId(value))
      ? getEngineProvider(value)
      : String(value || '').toLowerCase().trim();
    return PROVIDER_KEY_CONFIG[provider] || PROVIDER_KEY_CONFIG.free;
  }

  function isOpenAIEngine(value) {
    const provider = getEngineProvider(value);
    return provider === 'openai' || provider === 'gemini' || provider === 'openrouter';
  }

  function isGeminiEngine(value) {
    return getEngineProvider(value) === 'gemini';
  }

  function isOpenRouterEngine(value) {
    return getEngineProvider(value) === 'openrouter';
  }

  function requiresApiKey(value) {
    const provider = getEngineProvider(value);
    return provider === 'deepseek' || provider === 'deepl' || provider === 'openai' || provider === 'gemini' || provider === 'openrouter';
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

  function getTargetOptions(mode = 'code') {
    const useLabelValues = String(mode || '').toLowerCase() === 'label';
    return TARGET_LANGUAGE_OPTIONS.map((item) => ({
      value: useLabelValues ? item.labelValue : item.code,
      label: item.label
    }));
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

  function fillTargetSelect(select, preferredValue, mode = 'code') {
    if (!select) return;
    const current = preferredValue ?? select.value;
    const selected = String(current == null ? '' : current).trim();
    const options = getTargetOptions(mode);
    const fallback = options.some((item) => item.value === 'vi' || item.value === 'Vietnamese')
      ? (String(mode).toLowerCase() === 'label' ? 'Vietnamese' : 'vi')
      : options[0]?.value;
    const frag = document.createDocumentFragment();
    for (const item of options) {
      const option = document.createElement('option');
      option.value = item.value;
      option.textContent = item.label;
      frag.appendChild(option);
    }
    select.replaceChildren(frag);
    const candidate = options.some((item) => item.value === selected) ? selected : null;
    if (candidate) select.value = candidate;
    else if (fallback != null) select.value = fallback;
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
    if (/^[a-z]{2}(?:-[a-z0-9]+)?$/i.test(raw)) {
      if (/^zh(?:[-_]?cn)?$/i.test(raw)) return 'zh-CN';
      if (/^fil$/i.test(raw)) return 'tl';
      return raw;
    }
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

  function normalizeDeepLTargetCode(value) {
    const raw = String(value || '').trim();
    if (!raw) return 'EN-US';
    const lower = raw.toLowerCase();

    if (DEEPL_TARGET_BY_LABEL[lower]) return DEEPL_TARGET_BY_LABEL[lower];
    if (DEEPL_TARGET_BY_CODE[lower]) return DEEPL_TARGET_BY_CODE[lower];

    const code = normalizeTargetCode(raw);
    const normalizedCode = String(code || '').toLowerCase();
    if (DEEPL_TARGET_BY_CODE[normalizedCode]) return DEEPL_TARGET_BY_CODE[normalizedCode];

    if (normalizedCode === 'en' || normalizedCode === 'en-us' || normalizedCode === 'en-gb') return 'EN-US';
    if (normalizedCode === 'pt' || normalizedCode === 'pt-pt' || normalizedCode === 'pt-br') {
      return normalizedCode === 'pt-br' ? 'PT-BR' : 'PT-PT';
    }

    const upper = raw.toUpperCase();
    return /^[A-Z]{2}(?:-[A-Z0-9]+)?$/.test(upper) ? upper : null;
  }

  function supportsDeepLTarget(value) {
    return !!normalizeDeepLTargetCode(value);
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
    const resolvedModel = normalizeEngineId(model);
    const provider = getEngineProvider(resolvedModel);
    const isGemini = provider === 'gemini';
    const isOpenRouter = provider === 'openrouter';
    const providerLabel = isGemini ? 'Gemini' : (isOpenRouter ? 'OpenRouter' : 'OpenAI');
    if (!key) throw new Error('Missing ' + providerLabel + ' API key');

    const endpoint = isGemini
      ? 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions'
      : (isOpenRouter
        ? 'https://openrouter.ai/api/v1/chat/completions'
        : 'https://api.openai.com/v1/chat/completions');
    let response;

    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: Object.assign(
          {
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + key
          },
          isOpenRouter && typeof location !== 'undefined'
            ? { 'HTTP-Referer': location.origin, 'X-Title': 'VN Translator' }
            : null
        ),
        body: JSON.stringify({ model: resolvedModel, messages }),
        signal,
        credentials: 'omit'
      });
    } catch (error) {
      throw new Error('Network error when calling ' + providerLabel + ': ' + (error?.message || error));
    }

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(providerLabel + ' HTTP ' + response.status + (text ? ': ' + text : ''));
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

  function buildGoogleTranslateUrl(host, sl, tl, text) {
    return 'https://' + host + '/translate_a/single?client=gtx&sl=' + encodeURIComponent(sl) +
      '&tl=' + encodeURIComponent(tl) +
      '&dt=t&q=' + encodeURIComponent(text);
  }

  async function translateGoogleText(text, source, target, signal, options = {}) {
    const safeText = String(text ?? '');
    if (!safeText.trim()) return safeText;

    const sl = String(source || 'auto').trim() || 'auto';
    const tl = normalizeGoogleTargetCode(target);
    const cacheKey = sl + '->' + tl + '::' + safeText;

    if (googleCache.has(cacheKey)) return googleCache.get(cacheKey);

    const hostOrder = getGoogleHostOrder();
    const maxAttempts = Math.max(1, Math.min(hostOrder.length, Number(options.maxRetries) || 5));

    let lastError = null;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const host = hostOrder[attempt];
      const url = buildGoogleTranslateUrl(host, sl, tl, safeText);

      try {
        const response = await fetch(url, {
          signal,
          cache: 'no-store',
          headers: { 'User-Agent': pickGoogleUserAgent() }
        });

        if (!response.ok) {
          lastError = new Error('Google Translate HTTP ' + response.status + ' (' + host + ')');
          continue;
        }

        const data = await response.json();
        const translated = (data?.[0] || []).map((entry) => entry?.[0] || '').join('');
        googleBestHost = host;
        googleCache.set(cacheKey, translated);
        return translated;
      } catch (error) {
        if (error?.name === 'AbortError') throw error;
        lastError = error;
      }
    }

    throw lastError || new Error('Google Translate: all hosts failed');
  }

  async function translateGoogleLines(lines, target, options = {}) {
    const signal = options.signal;
    const concurrency = options.concurrency ?? 24;
    const delayMs = options.delayMs ?? 0;
    const source = options.source || 'auto';
    const maxRetries = options.maxRetries;

    return pMap(lines, concurrency, async (value) => {
      const translated = await translateGoogleText(value, source, target, signal, { maxRetries });
      if (delayMs) await sleep(delayMs, signal);
      return translated;
    });
  }

  function escapeXmlText(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function decodeEntities(value) {
    const raw = String(value ?? '');
    if (!raw) return raw;
    if (typeof document !== 'undefined' && document.createElement) {
      const textarea = document.createElement('textarea');
      textarea.innerHTML = raw;
      return textarea.value;
    }
    return raw
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, '&');
  }

  function buildDeepLXmlPayload(text) {
    const source = String(text ?? '');
    const tokens = [];
    let xml = '';
    let lastIndex = 0;
    DEEPL_PLACEHOLDER_RE.lastIndex = 0;
    let match;

    while ((match = DEEPL_PLACEHOLDER_RE.exec(source)) !== null) {
      const token = match[0];
      xml += escapeXmlText(source.slice(lastIndex, match.index));
      const tokenIndex = tokens.push(token) - 1;
      xml += '<x id="' + tokenIndex + '"/>';
      lastIndex = match.index + token.length;
    }

    xml += escapeXmlText(source.slice(lastIndex));
    return { xml: '<p>' + xml + '</p>', tokens };
  }

  function serializeDeepLXmlNode(node, tokens) {
    if (!node) return '';
    if (node.nodeType === 3 || node.nodeType === 4) return node.nodeValue || '';
    if (node.nodeType !== 1) return '';

    const name = String(node.nodeName || '').toLowerCase();
    if (name === 'x') {
      const id = Number(node.getAttribute('id'));
      return Number.isFinite(id) && tokens[id] != null ? tokens[id] : '';
    }

    let out = '';
    const children = node.childNodes || [];
    for (let i = 0; i < children.length; i++) {
      out += serializeDeepLXmlNode(children[i], tokens);
    }
    return out;
  }

  function extractDeepLTextFromXml(xml, tokens) {
    const source = String(xml ?? '');
    if (!source) return source;

    try {
      if (typeof DOMParser !== 'undefined') {
        const parser = new DOMParser();
        const doc = parser.parseFromString(source, 'application/xml');
        if (!doc.getElementsByTagName('parsererror').length) {
          return serializeDeepLXmlNode(doc.documentElement, tokens);
        }
      }
    } catch (_) {}

    const fallback = source
      .replace(/^<p[^>]*>/i, '')
      .replace(/<\/p>\s*$/i, '')
      .replace(/<x\b[^>]*\bid=(['"]?)(\d+)\1[^>]*\/>/gi, (_, __, index) => {
        const id = Number(index);
        return Number.isFinite(id) && tokens[id] != null ? tokens[id] : '';
      });

    return decodeEntities(fallback.replace(/<\/?[^>]+>/g, ''));
  }

  async function requestDeepLChunk(preparedLines, targetCode, apiKey, options = {}, retryMode = 0) {
    const key = sanitizeApiKey(apiKey);
    if (!key) throw new Error('Missing DeepL API key');
    if (!targetCode) throw new Error('Unsupported DeepL target language');

    const body = {
      apiKey: key,
      text: preparedLines.map((item) => item.xml),
      target_lang: targetCode,
      tag_handling: 'xml',
      tag_handling_version: 'v2',
      outline_detection: false,
      preserve_formatting: true,
      split_sentences: 'nonewlines'
    };

    if (options.context) body.context = String(options.context);
    if (options.formality && retryMode === 0) body.formality = options.formality;
    if (options.modelType !== false && retryMode <= 1) body.model_type = options.modelType || 'quality_optimized';

    let response;
    try {
      response = await fetch('/api/deepl-trans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: options.signal
      });
    } catch (error) {
      throw new Error('Network error when calling DeepL proxy: ' + (error?.message || error));
    }

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      if (response.status === 400 && retryMode < 2) {
        return requestDeepLChunk(preparedLines, targetCode, apiKey, options, retryMode + 1);
      }
      throw new Error('DeepL/proxy error ' + response.status + (text ? ': ' + text : ''));
    }

    const data = await response.json();
    const translations = Array.isArray(data?.translations) ? data.translations : [];
    if (translations.length !== preparedLines.length) {
      throw new Error('DeepL returned ' + translations.length + ' items, expected ' + preparedLines.length + '.');
    }

    return translations.map((item, index) => {
      const translatedXml = item && typeof item.text === 'string' ? item.text : '';
      return extractDeepLTextFromXml(translatedXml, preparedLines[index].tokens);
    });
  }

  async function translateDeepLLines(lines, target, options = {}) {
    const input = Array.from(lines || [], (value) => String(value ?? ''));
    if (!input.length) return [];

    const targetCode = normalizeDeepLTargetCode(target);
    const chunkSize = Math.max(1, Math.min(50, Number(options.chunkSize) || 40));
    const concurrency = Math.max(1, Math.min(8, Number(options.concurrency) || 3));

    const chunks = [];
    for (let i = 0; i < input.length; i += chunkSize) {
      chunks.push({
        offset: i,
        items: input.slice(i, i + chunkSize)
      });
    }

    const results = new Array(input.length);

    await pMap(chunks, concurrency, async (chunk) => {
      const prepared = chunk.items.map(buildDeepLXmlPayload);
      const translated = await requestDeepLChunk(prepared, targetCode, options.apiKey, options, 0);
      for (let i = 0; i < translated.length; i++) {
        results[chunk.offset + i] = translated[i];
      }
    });

    return results;
  }

  function collectExistingPlaceholderIds(text) {
    const used = new Set();
    String(text ?? '').replace(PLACEHOLDER_TOKEN_RE, (_, rawId) => {
      const id = Number(rawId);
      if (Number.isFinite(id)) used.add(id);
      return _;
    });
    return used;
  }

  function createPlaceholderToken(id) {
    return '⟦PH' + id + '⟧';
  }

  function protectTextWithPatterns(text, patterns) {
    const source = String(text ?? '');
    if (!source || !Array.isArray(patterns) || !patterns.length) {
      return { protectedText: source, map: Object.create(null), count: 0 };
    }

    const used = collectExistingPlaceholderIds(source);
    const allocId = () => {
      let next = 0;
      while (used.has(next)) next++;
      used.add(next);
      return next;
    };

    const matches = [];
    for (const pattern of patterns) {
      if (!(pattern instanceof RegExp)) continue;
      const re = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g');
      let match;
      while ((match = re.exec(source)) !== null) {
        if (!match[0]) break;
        matches.push({
          start: match.index,
          end: match.index + match[0].length,
          value: match[0]
        });
      }
    }

    if (!matches.length) {
      return { protectedText: source, map: Object.create(null), count: 0 };
    }

    matches.sort((a, b) => a.start - b.start || b.end - a.end);

    const map = Object.create(null);
    let out = '';
    let cursor = 0;

    for (const match of matches) {
      if (match.start < cursor) continue;
      out += source.slice(cursor, match.start);
      const token = createPlaceholderToken(allocId());
      map[token] = match.value;
      out += token;
      cursor = match.end;
    }

    out += source.slice(cursor);

    return {
      protectedText: out,
      map,
      count: Object.keys(map).length
    };
  }

  function restorePlaceholderText(text, map) {
    const source = String(text ?? '');
    if (!source || !map) return source;

    return source.replace(PLACEHOLDER_TOKEN_RE, (full, rawId) => {
      const token = createPlaceholderToken(Number(rawId));
      return Object.prototype.hasOwnProperty.call(map, token) ? map[token] : full;
    });
  }

  global.VNTranslationCommon = {
    engines: ENGINE_CATALOG,
    targetLanguages: TARGET_LANGUAGE_OPTIONS,
    fillEngineSelect,
    fillTargetSelect,
    getEngineOptions,
    getTargetOptions,
    getEngineMeta,
    getEngineLabel,
    getEngineUiLabel,
    getEngineProvider,
    getProviderKeyConfig,
    isOpenAIEngine,
    isGeminiEngine,
    isOpenRouterEngine,
    requiresApiKey,
    normalizeEngineId,
    sanitizeApiKey,
    normalizeTargetCode,
    normalizeDeepLTargetCode,
    supportsDeepLTarget,
    normalizeLingvaTargetCode,
    normalizeGoogleTargetCode,
    languageLabel,
    safeParseJsonArray,
    getChatContent,
    requestDeepSeekChat,
    requestOpenAIChat,
    translateLingvaLines,
    translateGoogleLines,
    googleTranslateHosts: GOOGLE_TRANSLATE_HOSTS,
    googleTranslateBase: GOOGLE_TRANSLATE_BASE,
    translateDeepLLines,
    protectTextWithPatterns,
    restorePlaceholderText,
    sleep,
    pMap
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
