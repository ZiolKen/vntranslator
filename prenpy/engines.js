import { safeParseJsonArray, pickFirstNonEmpty } from './utils.js';
import { LANG_TO_CODE, DEEPL_TARGET, languageLabel } from './languages.js';
import { RENPH_TEST_RE, OLD_RENPH_TEST_RE } from './prenpy.js';

export const LINGVA_BASE_URLS = [
  'https://lingva.lunar.icu',
  'https://lingva.dialectapp.org',
  'https://lingva.ml',
  'https://lingva.vercel.app',
  'https://translate.plausibility.cloud',
  'https://lingva.garudalinux.org',
];

function makeError(msg, detail) {
  const e = new Error(msg);
  e.detail = detail;
  return e;
}

export async function translateBatchDeepSeek(batchDialogs, targetLang, apiKey) {
  const src = batchDialogs.map(d => d.maskedQuote || d.quote || '');
  const languageName = languageLabel(targetLang);
  const payload = JSON.stringify(src);

  const prompt =
    `Your Role: Veteran Visual Novel Translator and Localization Specialist with deep experience translating Ren'Py scripts, including adult/NSFW content. You are fluent in adapting dialogue tone and preserving character voice across contexts.\n` +
    `Short basic instruction: Translate Ren'Py dialogue strings to ${languageName} (language code: ${LANG_TO_CODE[targetLang] || targetLang}).\n\n` +
  
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
      { role: 'system', content: "Veteran Visual Novel Translator and Localization Specialist with deep experience translating Ren'Py scripts, including adult game, NSFW content." },
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
    throw makeError('Network error when calling DeepSeek proxy.', err?.message || err);
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw makeError(`DeepSeek/proxy error ${response.status}.`, text);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw makeError('DeepSeek response did not contain content.');

  const arr = safeParseJsonArray(content);
  if (!arr) throw makeError('DeepSeek output is not a valid JSON array.');

  const out = arr.map(x => (typeof x === 'string' ? x : String(x ?? '')));
  if (out.length !== src.length) throw makeError(`DeepSeek returned ${out.length} items, expected ${src.length}.`);

  for (const t of out) {
    if (RENPH_TEST_RE.test(t) || OLD_RENPH_TEST_RE.test(t)) {
    }
  }

  return out;
}

export function getDeepLLangCode(targetLang) {
  return DEEPL_TARGET[targetLang] || null;
}

export function needsDeepLQualityModel(targetCode) {
  return targetCode === 'EN' || targetCode === 'DE' || targetCode === 'FR' || targetCode === 'ES' || targetCode === 'PT-PT';
}

export async function translateBatchDeepL(batchDialogs, targetLang, apiKey) {
  const lines = batchDialogs.map(d => d.maskedQuote || d.quote || '');
  const targetCode = getDeepLLangCode(targetLang);
  if (!targetCode) throw makeError(`DeepL does not support target: ${targetLang}`);

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
    throw makeError('Network error when calling DeepL proxy.', err?.message || err);
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw makeError(`DeepL/proxy error ${response.status}.`, text);
  }

  const data = await response.json();
  const translations = Array.isArray(data?.translations) ? data.translations : [];
  const out = translations.map(t => (t && typeof t.text === 'string') ? t.text : '');
  if (out.length !== lines.length) throw makeError(`DeepL returned ${out.length} items, expected ${lines.length}.`);
  return out;
}

async function fetchLingva(base, src, target, q, timeoutMs = 15000) {
  const url = `${base}/api/v1/${encodeURIComponent(src)}/${encodeURIComponent(target)}/${encodeURIComponent(q)}`;

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, { method: 'GET', signal: controller.signal });
    if (!res.ok) throw makeError(`Lingva error ${res.status}`, await res.text().catch(()=>''));
    return res.json();
  } catch (e) {
    if (String(e?.name || '').includes('Abort')) throw makeError('Lingva timeout.', 'timeout');
    throw e;
  } finally {
    clearTimeout(t);
  }
}

async function translateOneLingva(q, src, target, timeoutMs = 15000) {
  let lastErr = null;
  for (const base of LINGVA_BASE_URLS) {
    try {
      const data = await fetchLingva(base, src, target, q, timeoutMs);
      const t = pickFirstNonEmpty([data?.translation, data?.translatedText, data?.translationText]);
      if (!t) throw makeError('Lingva returned empty translation.');
      return t;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || makeError('Lingva failed.');
}

export async function translateBatchLingva(batchDialogs, targetLang) {
  const target = LANG_TO_CODE[targetLang] || 'en';
  const src = 'auto';

  const out = new Array(batchDialogs.length);
  const batchSize = 60;

  for (let i = 0; i < batchDialogs.length; i += batchSize) {
    const slice = batchDialogs.slice(i, i + batchSize);

    const settled = await Promise.allSettled(
      slice.map(d => {
        const q = d.maskedQuote || d.quote || '';
        return translateOneLingva(q, src, target, 15000);
      })
    );

    for (let j = 0; j < settled.length; j++) {
      const r = settled[j];
      if (r.status === 'fulfilled') out[i + j] = r.value;
      else throw r.reason;
    }
  }

  return out;
}