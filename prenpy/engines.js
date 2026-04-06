import { safeParseJsonArray } from './utils.js';
import { LANG_TO_CODE, DEEPL_TARGET, languageLabel } from './languages.js';

const Common = globalThis.VNTranslationCommon;

function makeError(message, detail) {
  const error = new Error(message);
  error.detail = detail;
  return error;
}

function getPrompt(batchDialogs, targetLang) {
  const source = batchDialogs.map((dialog) => dialog.maskedQuote || dialog.quote || '');
  const langCode = LANG_TO_CODE[targetLang] || targetLang;
  const payload = JSON.stringify(source);

  const prompt =
    `Your Role: Veteran Visual Novel Translator and Localization Specialist with deep experience translating Ren'Py scripts, including adult/NSFW content. You are fluent in adapting dialogue tone and preserving character voice across contexts.\n` +
    `Short basic instruction: Translate Ren'Py dialogue strings to ${languageLabel(targetLang)} (language code: ${langCode}).\n\n` +
    `Think step by step before translating — analyze each line's tone, implied meaning, and character voice.\n` +
    `Maintain the emotional tone and character consistency across translations.\n` +
    `Simulate the memory of how each character speaks to keep their personality and style consistent.\n\n` +
    `Rules:\n` +
    `- DO NOT translate or modify placeholders like ⟦RENPH{0}⟧.\n` +
    `- Preserve ALL Ren'Py tags, syntax, and variables.\n` +
    `- DO NOT merge, split, or reorder lines.\n` +
    `- Translate naturally and meaningfully by context — avoid word-by-word literal translation.\n` +
    `- Translate adult (NSFW) content directly and explicitly. Do NOT censor anything.\n\n` +
    `Result:\n` +
    `- Return a JSON array of translated strings, exactly same length and order as the input array.\n\n` +
    `Input JSON array:\n` +
    payload;

  return { source, prompt };
}

const SYSTEM_PROMPT = "Veteran Visual Novel Translator and Localization Specialist with deep experience translating Ren'Py scripts, including adult game, NSFW content.";

function parseArrayContent(content, expectedCount, engineLabel) {
  const parsed = safeParseJsonArray(content);
  if (!parsed) throw makeError(`${engineLabel} output is not a valid JSON array.`);

  const out = parsed.map((value) => (typeof value === 'string' ? value : String(value ?? '')));
  if (out.length !== expectedCount) {
    throw makeError(`${engineLabel} returned ${out.length} items, expected ${expectedCount}.`);
  }
  return out;
}

export async function translateBatchDeepSeek(batchDialogs, targetLang, apiKey) {
  const { source, prompt } = getPrompt(batchDialogs, targetLang);
  const data = await Common.requestDeepSeekChat({
    apiKey,
    model: 'deepseek-chat',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: prompt }
    ]
  });
  const content = Common.getChatContent(data);
  if (!content) throw makeError('DeepSeek response did not contain content.');
  return parseArrayContent(content, source.length, 'DeepSeek');
}

export async function translateBatchOpenAI(batchDialogs, targetLang, apiKey, model) {
  const normalizedModel = Common.normalizeEngineId(model);
  const { source, prompt } = getPrompt(batchDialogs, targetLang);
  const data = await Common.requestOpenAIChat({
    apiKey,
    model: normalizedModel,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: prompt }
    ]
  });
  const content = Common.getChatContent(data);
  if (!content) throw makeError('OpenAI response did not contain content.');
  return parseArrayContent(content, source.length, 'OpenAI');
}

export function getDeepLLangCode(targetLang) {
  return DEEPL_TARGET[targetLang] || null;
}

export function needsDeepLQualityModel(targetCode) {
  return targetCode === 'EN' || targetCode === 'DE' || targetCode === 'FR' || targetCode === 'ES' || targetCode === 'PT-PT';
}

export async function translateBatchDeepL(batchDialogs, targetLang, apiKey) {
  const lines = batchDialogs.map((dialog) => dialog.maskedQuote || dialog.quote || '');
  const targetCode = getDeepLLangCode(targetLang);
  if (!targetCode) throw makeError(`DeepL does not support target: ${targetLang}`);

  let response;
  try {
    response = await fetch('/api/deepl-trans', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        apiKey,
        text: lines,
        target_lang: targetCode,
        preserve_formatting: 1,
        split_sentences: 0,
        ...(needsDeepLQualityModel(targetCode) ? { model_type: 'quality_optimized' } : {})
      })
    });
  } catch (error) {
    throw makeError('Network error when calling DeepL proxy.', error?.message || error);
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw makeError(`DeepL/proxy error ${response.status}.`, text);
  }

  const data = await response.json();
  const translations = Array.isArray(data?.translations) ? data.translations : [];
  const out = translations.map((item) => (item && typeof item.text === 'string' ? item.text : ''));
  if (out.length !== lines.length) throw makeError(`DeepL returned ${out.length} items, expected ${lines.length}.`);
  return out;
}

export async function translateBatchLingva(batchDialogs, targetLang) {
  const lines = batchDialogs.map((dialog) => dialog.maskedQuote || dialog.quote || '');
  return Common.translateLingvaLines(lines, targetLang, { concurrency: 48, delayMs: 60 });
}

export async function translateBatchGoogle(batchDialogs, targetLang) {
  const lines = batchDialogs.map((dialog) => dialog.maskedQuote || dialog.quote || '');
  return Common.translateGoogleLines(lines, targetLang, { concurrency: 48 });
}
