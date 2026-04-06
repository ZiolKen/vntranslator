
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.VNTranslationCommon = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const ENGINES = [
    { value: 'deepseek', label: '🔥 DeepSeek API — High Quality (Paid)', provider: 'deepseek' },
    { value: 'gpt-4o', label: '💎 ChatGPT 4o — Highest Quality (Paid)', provider: 'openai' },
    { value: 'gpt-4o-mini', label: '⚡ ChatGPT 4o mini — Cheaper (Paid)', provider: 'openai' },
    { value: 'gpt-5.4', label: '🚀 ChatGPT 5.4 — New (Paid)', provider: 'openai' },
    { value: 'gpt-5.4-mini', label: '💡 ChatGPT 5.4 mini — Cheap (Paid)', provider: 'openai' },
    { value: 'gpt-5.4-nano', label: '📦 ChatGPT 5.4 nano — Ultra Cheap (Paid)', provider: 'openai' },
    { value: 'gpt-3.5-turbo', label: '🧩 ChatGPT 3.5 Turbo — Legacy (Paid)', provider: 'openai' },
    { value: 'lingva', label: '🌐 Lingva — Free (Lower Quality)', provider: 'lingva' },
    { value: 'google', label: '🌍 Google Translate — Free', provider: 'google' },
  ];

  const LINGVA_HOSTS = [
    'https://lingva.vercel.app',
    'https://lingva.garudalinux.org',
    'https://lingva.lunar.icu',
    'https://translate.projectsegfau.lt',
    'https://lingva.dialectapp.org',
    'https://lingva.ml',
    'https://translate.plausibility.cloud',
  ];

  function sanitizeApiKey(raw) {
    return String(raw || '')
      .trim()
      .replace(/^Authorization\s*:\s*Bearer\s+/i, '')
      .replace(/^Bearer\s+/i, '')
      .replace(/^['"]+|['"]+$/g, '')
      .trim();
  }

  function normalizeEngine(engine) {
    const value = String(engine || '').trim().toLowerCase();
    const aliases = {
      'libre': 'lingva',
      'googletranslate': 'google',
      'google-translate': 'google',
      'gpt-5': 'gpt-5.4',
      'gpt-5-mini': 'gpt-5.4-mini',
      'gpt-5-nano': 'gpt-5.4-nano',
    };
    return aliases[value] || value || 'deepseek';
  }

  function modelLabel(model) {
    const resolved = normalizeEngine(model);
    const found = ENGINES.find(item => item.value === resolved);
    return found ? found.label : String(model || 'Unknown');
  }

  function parseTranslatedArray(raw, expectedCount) {
    const text = String(raw || '').trim();
    if (!text) return [];

    const tryParse = (candidate) => {
      const parsed = JSON.parse(candidate);
      if (!Array.isArray(parsed)) throw new Error('Expected array');
      return parsed.map(item => item == null ? '' : String(item));
    };

    try { return tryParse(text); } catch (_) {}
    const start = text.indexOf('[');
    const end = text.lastIndexOf(']');
    if (start !== -1 && end !== -1 && end > start) {
      try { return tryParse(text.slice(start, end + 1)); } catch (_) {}
    }

    const fallback = text
      .split(/\r?\n/)
      .map(line => line.replace(/^(?:\d+[\).:\-]\s*|[-*]\s+)/, '').trim())
      .filter(Boolean);

    if (Number.isFinite(expectedCount) && expectedCount > 0 && fallback.length > expectedCount) {
      return fallback.slice(0, expectedCount);
    }

    return fallback;
  }

  function buildArrayPrompt(lines, targetLang, systemFlavor) {
    const payload = JSON.stringify(lines, null, 2);
    return [
      systemFlavor || 'You are a veteran visual novel translator and localization specialist.',
      'Translate every string into the target language while preserving placeholders, escape sequences, variables, tags, formatting, and line order.',
      'Return only a valid JSON array of translated strings with the same length as the input array.',
      'Do not add commentary, markdown, code fences, numbering, or explanations.',
      'Target language: ' + targetLang,
      'Input JSON array:',
      payload,
    ].join('\n\n');
  }

  async function requestDeepSeekChat(apiKey, model, messages) {
    const key = sanitizeApiKey(apiKey);
    const res = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + key,
      },
      body: JSON.stringify({ model: model || 'deepseek-chat', messages, temperature: 0.2 })
    });
    if (!res.ok) throw new Error('DeepSeek HTTP ' + res.status + ': ' + await res.text());
    return res.json();
  }

  async function requestOpenAIChat(apiKey, model, messages) {
    const key = sanitizeApiKey(apiKey);
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + key,
      },
      body: JSON.stringify({ model, messages, temperature: 0.2 })
    });
    if (!res.ok) throw new Error('OpenAI HTTP ' + res.status + ': ' + await res.text());
    return res.json();
  }

  function getChatContent(data) {
    return data?.choices?.[0]?.message?.content || '';
  }

  async function googleTranslate(text, sourceLang, targetLang) {
    const sl = sourceLang || 'auto';
    const tl = targetLang || 'en';
    const url = 'https://translate.googleapis.com/translate_a/single?client=dict-chrome-ex&sl=' + encodeURIComponent(sl) + '&tl=' + encodeURIComponent(tl) + '&dt=t&q=' + encodeURIComponent(text);
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error('Google HTTP ' + res.status);
    const data = await res.json();
    return Array.isArray(data?.[0]) ? data[0].map(item => item?.[0] || '').join('') : text;
  }

  let bestLingvaHost = null;

  async function lingvaTranslate(text, targetLang) {
    const code = String(targetLang || '').trim() || 'en';
    const hosts = bestLingvaHost ? [bestLingvaHost, ...LINGVA_HOSTS.filter(h => h !== bestLingvaHost)] : LINGVA_HOSTS.slice();
    let lastError = null;
    for (const host of hosts) {
      try {
        const res = await fetch(host + '/api/v1/auto/' + encodeURIComponent(code) + '/' + encodeURIComponent(text), { cache: 'no-store' });
        if (!res.ok) throw new Error('Lingva HTTP ' + res.status);
        const data = await res.json();
        const translated = data.translation || data.translatedText || data.result || '';
        if (!translated) throw new Error('Lingva empty result');
        bestLingvaHost = host;
        return translated;
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError || new Error('Lingva failed');
  }

  async function translateArray(options) {
    const lines = Array.isArray(options?.lines) ? options.lines.map(item => String(item ?? '')) : [];
    const engine = normalizeEngine(options?.engine || 'deepseek');
    const sourceLang = String(options?.sourceLang || 'auto').trim() || 'auto';
    const targetLang = String(options?.targetLang || 'en').trim() || 'en';
    const systemPrompt = String(options?.systemPrompt || '').trim();
    const expectedCount = lines.length;

    if (!expectedCount) return [];

    if (engine === 'deepseek') {
      const data = await requestDeepSeekChat(options?.deepseekKey, 'deepseek-chat', [
        { role: 'system', content: systemPrompt || 'Veteran visual novel translator. Output only a JSON array.' },
        { role: 'user', content: buildArrayPrompt(lines, targetLang, systemPrompt) },
      ]);
      return parseTranslatedArray(getChatContent(data), expectedCount);
    }

    if (engine.startsWith('gpt-')) {
      const data = await requestOpenAIChat(options?.openaiKey, engine, [
        { role: 'system', content: systemPrompt || 'Veteran visual novel translator. Output only a JSON array.' },
        { role: 'user', content: buildArrayPrompt(lines, targetLang, systemPrompt) },
      ]);
      return parseTranslatedArray(getChatContent(data), expectedCount);
    }

    if (engine === 'lingva') {
      const output = [];
      for (const line of lines) output.push(await lingvaTranslate(line, targetLang));
      return output;
    }

    if (engine === 'google') {
      const output = [];
      for (const line of lines) output.push(await googleTranslate(line, sourceLang, targetLang));
      return output;
    }

    throw new Error('Unknown translation engine: ' + engine);
  }

  return {
    ENGINES,
    normalizeEngine,
    sanitizeApiKey,
    modelLabel,
    parseTranslatedArray,
    buildArrayPrompt,
    requestDeepSeekChat,
    requestOpenAIChat,
    getChatContent,
    googleTranslate,
    lingvaTranslate,
    translateArray,
  };
});