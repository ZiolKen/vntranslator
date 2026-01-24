import { unmaskTagsInText, RENPH_TEST_RE, OLD_RENPH_TEST_RE } from "./renpy.js";
import { sleep } from "./utils.js";

const LINGVA_BASE_URLS = [
  "https://lingva.lunar.icu",
  "https://lingva.dialectapp.org",
  "https://lingva.ml",
  "https://lingva.vercel.app",
  "https://translate.plausibility.cloud",
  "https://lingva.garudalinux.org"
];

const LANG = {
  en: { label: "English", deepl: "EN" },
  zh: { label: "Chinese (Simplified)", deepl: "ZH" },
  hi: { label: "Hindi", deepl: null },
  es: { label: "Spanish", deepl: "ES" },
  fr: { label: "French", deepl: "FR" },
  ar: { label: "Arabic", deepl: null },
  pt: { label: "Portuguese", deepl: "PT" },
  ru: { label: "Russian", deepl: "RU" },
  de: { label: "German", deepl: "DE" },
  ja: { label: "Japanese", deepl: "JA" },
  id: { label: "Indonesian", deepl: null },
  ms: { label: "Malay", deepl: null },
  vi: { label: "Vietnamese", deepl: null },
  tl: { label: "Filipino", deepl: null },
  ko: { label: "Korean", deepl: "KO" }
};

export const LANGS = Object.entries(LANG).map(([code, v]) => ({ code, label: v.label }));

const languageLabel = (code) => LANG[code]?.label || code;

const normalizeProxy = (proxyBase) => {
  const s = String(proxyBase || "").trim();
  if (!s) return "";
  return s.replace(/\/+$/, "");
};

const fetchWithRetry = async (url, init, retry) => {
  const attempts = Math.max(0, Number(retry?.attempts ?? 4) | 0);
  const minDelay = Math.max(0, Number(retry?.minDelay ?? 400) | 0);
  const signal = retry?.signal;

  let lastErr = null;

  for (let i = 0; i <= attempts; i++) {
    if (signal?.aborted) throw new Error("Aborted");
    try {
      const res = await fetch(url, { ...init, signal });
      if (res.ok) return res;

      const status = res.status;
      const text = await res.text().catch(() => "");
      const retriable = status === 429 || status === 408 || status === 409 || (status >= 500 && status <= 599);

      if (!retriable || i === attempts) throw new Error(`HTTP ${status}: ${text}`);
      await sleep(minDelay * Math.pow(2, i));
    } catch (e) {
      lastErr = e;
      if (i === attempts) break;
      await sleep(minDelay * Math.pow(2, i));
    }
  }

  throw lastErr || new Error("Request failed");
};

const safeParseJsonArray = (s) => {
  const t = String(s || "").trim();
  if (!t) return null;

  try {
    const v = JSON.parse(t);
    return Array.isArray(v) ? v : null;
  } catch {
    const m = t.match(/\[[\s\S]*\]/);
    if (!m) return null;
    try {
      const v = JSON.parse(m[0]);
      return Array.isArray(v) ? v : null;
    } catch {
      return null;
    }
  }
};

const validateTranslated = (text) => {
  const s = String(text ?? "");
  if (RENPH_TEST_RE.test(s) || OLD_RENPH_TEST_RE.test(s)) return { ok: false, reason: "PLACEHOLDER_LEFT" };
  return { ok: true, reason: "" };
};

export const postProcessTranslation = (translated, placeholderMap) => {
  const raw = unmaskTagsInText(translated, placeholderMap);
  const v = validateTranslated(raw);
  return { text: raw, ok: v.ok, reason: v.reason };
};

export const translateBatch = async (engine, maskedLines, targetLang, apiKey, retry, signal, proxyBase) => {
  const e = String(engine || "").toLowerCase().trim();
  if (e === "deepseek") return translateBatchDeepSeek(maskedLines, targetLang, apiKey, retry, signal, proxyBase);
  if (e === "deepl") return translateBatchDeepL(maskedLines, targetLang, apiKey, retry, signal, proxyBase);
  return translateBatchLingva(maskedLines, targetLang, retry, signal);
};

const translateBatchDeepSeek = async (maskedLines, targetLang, apiKey, retry, signal, proxyBase) => {
  if (!apiKey) throw new Error("DeepSeek apiKey is required.");

  const languageName = languageLabel(targetLang);
  const payload = JSON.stringify(maskedLines);

  const prompt =
    `Translate Ren'Py dialogue strings to ${languageName} (language code: ${targetLang}).\n\n` +
    `Rules:\n` +
    `- DO NOT translate or modify placeholders like ⟦RENPH{0}⟧.\n` +
    `- Preserve ALL Ren'Py tags, syntax, and variables.\n` +
    `- DO NOT merge, split, or reorder lines.\n` +
    `- Translate naturally.\n\n` +
    `Return a JSON array of translated strings, exactly same length and order as the input array.\n\n` +
    `Input JSON array:\n` + payload;

  const body = {
    apiKey,
    model: "deepseek-chat",
    messages: [
      { role: "system", content: "You are a Ren'Py Visual Novel translator." },
      { role: "user", content: prompt }
    ],
    stream: false
  };

  const base = normalizeProxy(proxyBase);
  const endpoint = (base ? base : "") + "/api/deepseek-proxy";

  const res = await fetchWithRetry(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  }, { ...retry, signal });

  const data = await res.json().catch(() => ({}));
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error("DeepSeek response missing content.");

  const arr = safeParseJsonArray(content);
  if (!arr) throw new Error("DeepSeek output is not a valid JSON array.");

  return arr.map(x => (typeof x === "string" ? x : String(x ?? "")));
};

const translateBatchDeepL = async (maskedLines, targetLang, apiKey, retry, signal, proxyBase) => {
  if (!apiKey) throw new Error("DeepL apiKey is required.");

  const dl = LANG[targetLang]?.deepl;
  if (!dl) throw new Error(`DeepL does not support target language: ${languageLabel(targetLang)}.`);

  const body = {
    apiKey,
    text: maskedLines,
    target_lang: dl,
    preserve_formatting: 1,
    split_sentences: 0
  };

  const base = normalizeProxy(proxyBase);
  const endpoint = (base ? base : "") + "/api/deepl-trans";

  const res = await fetchWithRetry(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  }, { ...retry, signal });

  const data = await res.json().catch(() => ({}));
  const translations = Array.isArray(data?.translations) ? data.translations : [];
  return translations.map(t => (t && typeof t.text === "string") ? t.text : "");
};

const translateBatchLingva = async (maskedLines, targetLang, retry, signal) => {
  const targetCandidates = targetLang === "zh" ? ["zh", "zh-CN"] : [targetLang];
  const out = new Array(maskedLines.length).fill("");

  for (let i = 0; i < maskedLines.length; i++) {
    const q = maskedLines[i] || "";
    if (!q.trim()) { out[i] = ""; continue; }

    let ok = false;
    for (const base of LINGVA_BASE_URLS) {
      for (const t of targetCandidates) {
        const url = `${base.replace(/\/+$/,"")}/api/v1/auto/${encodeURIComponent(t)}/${encodeURIComponent(q)}`;
        try {
          const res = await fetchWithRetry(url, { method: "GET" }, { ...retry, signal });
          const data = await res.json().catch(() => ({}));
          const tr = data?.translation;
          if (typeof tr === "string") { out[i] = tr; ok = true; break; }
        } catch {}
      }
      if (ok) break;
    }

    if (!ok) throw new Error("Lingva failed on at least one line.");
  }

  return out;
};
