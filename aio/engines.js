import { safeParseJsonArray } from './utils.js';
import { LANG_TO_CODE, languageLabel } from './languages.js';

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
    `Your Role: Veteran Visual Novel / RPG Localization Specialist with deep experience translating game scripts (Ren'Py, RPG Maker, KAG/TyranoScript, Artemis Engine, and plain dialogue dumps), including adult/NSFW content. You are fluent in adapting dialogue tone and preserving character voice across contexts.\n` +
    `Short basic instruction: Translate the game dialogue strings below to ${languageLabel(targetLang)} (language code: ${langCode}).\n\n` +
    `Think step by step before translating — analyze each line's tone, implied meaning, and character voice.\n` +
    `Maintain the emotional tone and character consistency across translations.\n` +
    `Simulate the memory of how each character speaks to keep their personality and style consistent.\n\n` +
    `Rules:\n` +
    `- DO NOT translate, remove, or modify placeholder tokens shaped like ⟦XXXX{0}⟧ (e.g. ⟦RENPH{0}⟧, ⟦RPGMPH{0}⟧, ⟦PH{0}⟧) — they stand in for engine tags, control codes, and variables that were stripped out before translation.\n` +
    `- Preserve ALL remaining script tags, syntax, and variables exactly as given.\n` +
    `- DO NOT merge, split, or reorder lines.\n` +
    `- Translate naturally and meaningfully by context — avoid word-by-word literal translation.\n` +
    `- Translate adult (NSFW) content directly and explicitly. Do NOT censor anything.\n\n` +
    `Context:\n` +
    `- You are working with raw dialogue strings extracted from a visual novel or RPG script file.\n` +
    `- The game includes romantic, emotional,... and adult themes.\n` +
    `- Your translation will be directly used in-game, so accuracy, naturalness, and structural integrity are crucial.\n\n` +
    `Your Goal:\n` +
    `- Produce a fully localized, natural-sounding version of the input dialogues that feels authentic to the target language audience — as if originally written in that language.\n` +
    `- Ensure accuracy, tone consistency, and contextual appropriateness even for explicit scenes.\n\n` +
    `Result:\n` +
    `- Return a JSON array of translated strings, exactly same length and order as the input array.\n\n` +
    `Input JSON array:\n` +
    payload;

  return { source, prompt };
}

const SYSTEM_PROMPT = "Veteran Visual Novel / RPG Translator and Localization Specialist with deep experience translating Ren'Py, RPG Maker, KAG/TyranoScript, and Artemis Engine scripts, including adult game, NSFW content.";

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
  const providerLabel = (Common.getEngineProvider(normalizedModel) === 'gemini' ? 'Gemini' : (Common.getEngineProvider(normalizedModel) === 'openrouter' ? 'OpenRouter' : 'OpenAI'));
  const data = await Common.requestOpenAIChat({
    apiKey,
    model: normalizedModel,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: prompt }
    ]
  });
  const content = Common.getChatContent(data);
  if (!content) throw makeError(providerLabel + ' response did not contain content.');
  return parseArrayContent(content, source.length, providerLabel);
}

export async function translateBatchDeepL(batchDialogs, targetLang, apiKey) {
  const lines = batchDialogs.map((dialog) => dialog.maskedQuote || dialog.quote || '');

  try {
    return await Common.translateDeepLLines(lines, targetLang, {
      apiKey,
      chunkSize: 40,
      concurrency: 3,
    });
  } catch (error) {
    throw makeError('DeepL translation failed.', error?.message || error);
  }
}

export async function translateBatchLingva(batchDialogs, targetLang) {
  const lines = batchDialogs.map((dialog) => dialog.maskedQuote || dialog.quote || '');
  return Common.translateLingvaLines(lines, targetLang, { concurrency: 48, delayMs: 60 });
}

export async function translateBatchGoogle(batchDialogs, targetLang) {
  const lines = batchDialogs.map((dialog) => dialog.maskedQuote || dialog.quote || '');
  return Common.translateGoogleLines(lines, targetLang, { concurrency: 48 });
}
