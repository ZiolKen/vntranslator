
import { safeParseJsonArray } from './utils.js';
import { LANG_TO_CODE, languageLabel } from './languages.js';

const Common = globalThis.VNTranslationCommon;

function makeError(message, detail, kind) {
  const error = new Error(message);
  error.detail = detail;
  if (kind) error.kind = kind;
  return error;
}

// ------------------------------------------------------------------ prompt --
// The user prompt is a template. Supported variables:
//   {{target}}  target language name        (e.g. Vietnamese)
//   {{code}}    target language code        (e.g. vi)
//   {{count}}   number of strings in batch
//   {{input}}   the JSON array of strings   (appended automatically if missing)
export const DEFAULT_SYSTEM_PROMPT =
  "Veteran Visual Novel / RPG Translator and Localization Specialist with deep experience translating Ren'Py, RPG Maker, KAG/TyranoScript, and Artemis Engine scripts, including adult game, NSFW content.";

export const DEFAULT_PROMPT_TEMPLATE =
  `Your Role: Veteran Visual Novel / RPG Localization Specialist with deep experience translating game scripts (Ren'Py, RPG Maker, KAG/TyranoScript, Artemis Engine, and plain dialogue dumps), including adult/NSFW content. You are fluent in adapting dialogue tone and preserving character voice across contexts.\n` +
  `Short basic instruction: Translate the game dialogue strings below to {{target}} (language code: {{code}}).\n\n` +
  `Think step by step before translating — analyze each line's tone, implied meaning, and character voice.\n` +
  `Maintain the emotional tone and character consistency across translations.\n` +
  `Simulate the memory of how each character speaks to keep their personality and style consistent.\n\n` +
  `Rules:\n` +
  `- DO NOT translate, remove, or modify placeholder tokens shaped like ⟦XXXX{0}⟧ (e.g. ⟦RENPH{0}⟧, ⟦RPGMPH{0}⟧, ⟦PH{0}⟧) — they stand in for engine tags, control codes, and variables that were stripped out before translation.\n` +
  `- Preserve ALL remaining script tags, syntax, and variables exactly as given.\n` +
  `- DO NOT merge, split, or reorder lines.\n` +
  `- If a string contains line breaks (\\n), keep exactly the same number of line breaks (menu choices depend on it).\n` +
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
  `{{input}}`;

// Not user-editable: keeps the output machine-parseable whatever the custom prompt says.
export const FORMAT_GUARD =
  'OUTPUT FORMAT (mandatory): reply with ONLY a JSON array of strings — same length and same order as the input array, no commentary, no markdown fences. ' +
  'Never alter placeholder tokens like ⟦PH{0}⟧.';

let PROMPT_CFG = { system: DEFAULT_SYSTEM_PROMPT, template: DEFAULT_PROMPT_TEMPLATE };

export function setPromptConfig(cfg = {}) {
  const system = typeof cfg.system === 'string' && cfg.system.trim() ? cfg.system : DEFAULT_SYSTEM_PROMPT;
  const template = typeof cfg.template === 'string' && cfg.template.trim() ? cfg.template : DEFAULT_PROMPT_TEMPLATE;
  PROMPT_CFG = { system, template };
}

export function getPromptConfig() {
  return { ...PROMPT_CFG };
}

export function renderPrompt(template, vars) {
  const map = { target: vars.target, code: vars.code, count: String(vars.count), input: vars.input };
  let usedInput = false;
  const out = String(template).replace(/\{\{\s*(target|code|count|input)\s*\}\}/gi, (_, k) => {
    const key = k.toLowerCase();
    if (key === 'input') usedInput = true;
    return map[key];
  });
  return usedInput ? out : `${out}\n\nInput JSON array:\n${vars.input}`;
}

function getPrompt(batchDialogs, targetLang) {
  const source = batchDialogs.map((dialog) => dialog.maskedQuote || dialog.quote || '');
  const langCode = LANG_TO_CODE[targetLang] || targetLang;
  const prompt = renderPrompt(PROMPT_CFG.template, {
    target: languageLabel(targetLang),
    code: langCode,
    count: source.length,
    input: JSON.stringify(source),
  });
  const system = `${PROMPT_CFG.system}\n\n${FORMAT_GUARD}`;
  return { source, prompt, system };
}

function parseArrayContent(content, expectedCount, engineLabel) {
  const parsed = safeParseJsonArray(content);
  if (!parsed) throw makeError(`${engineLabel} output is not a valid JSON array.`, null, 'format');

  const out = parsed.map((value) => (typeof value === 'string' ? value : String(value ?? '')));
  if (out.length !== expectedCount) {
    throw makeError(`${engineLabel} returned ${out.length} items, expected ${expectedCount}.`, null, 'format');
  }
  return out;
}

// ---------------------------------------------------------------- providers --
export async function translateBatchDeepSeek(batchDialogs, targetLang, apiKey, opts = {}) {
  const { source, prompt, system } = getPrompt(batchDialogs, targetLang);
  const data = await Common.requestDeepSeekChat({
    apiKey,
    model: opts.model || 'deepseek-chat',
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: prompt }
    ]
  });
  const content = Common.getChatContent(data);
  if (!content) throw makeError('DeepSeek response did not contain content.');
  return parseArrayContent(content, source.length, 'DeepSeek');
}

// opts.provider: force 'openai' | 'gemini' | 'openrouter' (used for custom model ids
// that are not in the built-in catalog).
export async function translateBatchOpenAI(batchDialogs, targetLang, apiKey, model, opts = {}) {
  const forced = opts.provider || null;
  const resolvedModel = forced ? String(model || '').trim() : Common.normalizeEngineId(model);
  const provider = forced || Common.getEngineProvider(resolvedModel);
  const { source, prompt, system } = getPrompt(batchDialogs, targetLang);
  const providerLabel = provider === 'gemini' ? 'Gemini' : (provider === 'openrouter' ? 'OpenRouter' : 'OpenAI');
  const data = await Common.requestOpenAIChat({
    apiKey,
    model: resolvedModel,
    provider: forced || undefined,
    messages: [
      { role: 'system', content: system },
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
    throw makeError('DeepL translation failed: ' + (error?.message || error), error?.message || error);
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

export async function translateBatchIndexTranslate(batchDialogs, targetLang) {
  const lines = batchDialogs.map((dialog) => dialog.maskedQuote || dialog.quote || '');
  return Common.translateIndexTranslateLines(lines, targetLang, { concurrency: 6 });
}
