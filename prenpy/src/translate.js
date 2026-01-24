import { RENPH_TEST_RE, OLD_RENPH_TEST_RE } from "./renpy.js";
import { languageLabel, getDeepLLangCode, needsDeepLQualityModel } from "./lang.js";

export const LINGVA_BASE_URLS = [
  "https://lingva.lunar.icu",
  "https://lingva.dialectapp.org",
  "https://lingva.ml",
  "https://lingva.vercel.app",
  "https://translate.plausibility.cloud",
  "https://lingva.garudalinux.org",
];

export function safeParseJsonArray(text) {
  const s = String(text || "").trim();
  if (!s) return null;
  const first = s.indexOf("[");
  const last = s.lastIndexOf("]");
  if (first === -1 || last === -1 || last <= first) return null;
  const cut = s.slice(first, last + 1);
  try {
    const v = JSON.parse(cut);
    return Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

function placeholderIds(s) {
  const out = [];
  const re = /⟦\s*RENPH\s*(?:\{\s*(\d+)\s*\}|(\d+))\s*⟧/g;
  let m;
  while ((m = re.exec(String(s || ""))) != null) out.push(String(Number(m[1] ?? m[2])));
  return out.sort();
}

export function validatePlaceholders(srcMasked, outMasked) {
  const a = placeholderIds(srcMasked);
  const b = placeholderIds(outMasked);
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export async function translateBatchDeepSeek(batchDialogs, targetLang, apiKey, settings) {
  const src = batchDialogs.map(d => d.maskedQuote || d.quote || "");
  const languageName = languageLabel(targetLang);
  const payload = JSON.stringify(src);

  const style = String(settings?.styleGuide || "").trim();
  const glossary = String(settings?.glossary || "").trim();
  const charNotes = String(settings?.characterNotes || "").trim();

  const extra =
    (style ? `\nStyle guide:\n${style}\n` : "") +
    (glossary ? `\nGlossary (keep terminology consistent):\n${glossary}\n` : "") +
    (charNotes ? `\nCharacter voice notes:\n${charNotes}\n` : "");

  const prompt =
    `Translate Ren'Py dialogue strings to ${languageName} (language code: ${targetLang}).\n\n` +
    `Rules:\n` +
    `- DO NOT translate or modify placeholders like ⟦RENPH{0}⟧.\n` +
    `- Preserve ALL Ren'Py tags, syntax, and variables (e.g., {fast}, [player_name]).\n` +
    `- DO NOT merge, split, or reorder lines.\n` +
    `- Translate naturally by context.\n` +
    `- Return a JSON array of translated strings, same length and order as the input array.\n` +
    extra +
    `\nInput JSON array:\n` + payload;

  const bodyForProxy = {
    apiKey,
    model: settings?.deepseekModel || "deepseek-chat",
    messages: [
      { role: "system", content: "You are a veteran visual novel translator and localization specialist for Ren'Py scripts. Preserve placeholders and syntax exactly." },
      { role: "user", content: prompt }
    ],
    stream: false,
    temperature: typeof settings?.temperature === "number" ? settings.temperature : 0.3,
  };

  let response;
  try {
    response = await fetch("/api/deepseek-proxy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(bodyForProxy),
    });
  } catch (err) {
    throw new Error("Network error when calling DeepSeek proxy: " + (err?.message || err));
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`DeepSeek/proxy error ${response.status}: ${text}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error("DeepSeek response did not contain any content.");

  const arr = safeParseJsonArray(content);
  if (!arr) throw new Error("DeepSeek output is not a valid JSON array.");

  const out = arr.map(x => (typeof x === "string" ? x : String(x ?? "")));
  return out;
}

export async function translateBatchDeepL(batchDialogs, targetLang, apiKey, settings) {
  const lines = batchDialogs.map(d => d.maskedQuote || d.quote || "");
  const targetCode = getDeepLLangCode(targetLang);

  const bodyForProxy = {
    apiKey,
    text: lines,
    target_lang: targetCode,
    preserve_formatting: 1,
    split_sentences: 0,
    ...(needsDeepLQualityModel(targetCode) ? { model_type: "quality_optimized" } : {}),
    formality: settings?.deeplFormality || "default",
  };

  let response;
  try {
    response = await fetch("/api/deepl-trans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(bodyForProxy),
    });
  } catch (err) {
    throw new Error("Network error when calling DeepL proxy: " + (err?.message || err));
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`DeepL/proxy error ${response.status}: ${text}`);
  }

  const data = await response.json();
  const translations = Array.isArray(data?.translations) ? data.translations : [];
  const out = translations.map(t => (t && typeof t.text === "string") ? t.text : "");
  return out;
}

async function lingvaFetchOnce(base, sourceLang, targetLang, text) {
  const url = `${base.replace(/\/$/, "")}/api/v1/${encodeURIComponent(sourceLang)}/${encodeURIComponent(targetLang)}/${encodeURIComponent(text)}`;
  const r = await fetch(url, { method: "GET" });
  if (!r.ok) throw new Error("Lingva HTTP " + r.status);
  const data = await r.json();
  const t = data?.translation;
  if (typeof t !== "string") throw new Error("Lingva: missing translation");
  return t;
}

export async function translateBatchLingva(batchDialogs, targetLang, settings) {
  const sourceLang = settings?.sourceLang || "auto";
  const lines = batchDialogs.map(d => d.maskedQuote || d.quote || "");

  const out = new Array(lines.length).fill("");
  for (let i = 0; i < lines.length; i++) {
    const text = lines[i];
    let lastErr = null;
    for (const base of LINGVA_BASE_URLS) {
      try {
        const t = await lingvaFetchOnce(base, sourceLang, targetLang, text);
        out[i] = t;
        lastErr = null;
        break;
      } catch (e) {
        lastErr = e;
      }
    }
    if (lastErr) {
      const r = await fetch("/api/lingva-proxy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: sourceLang, target: targetLang, text }),
      });
      if (!r.ok) throw new Error("Lingva proxy error " + r.status);
      const data = await r.json();
      out[i] = String(data?.translation || "");
    }
  }
  return out;
}

export function postValidateTranslations(batchDialogs, translatedArr) {
  const warnings = [];
  for (let i = 0; i < batchDialogs.length; i++) {
    const src = batchDialogs[i]?.maskedQuote || "";
    const out = String(translatedArr[i] ?? "");
    if (!validatePlaceholders(src, out)) {
      warnings.push({ index: i, type: "placeholders", message: "Placeholder tokens changed/missing." });
    }
    if (RENPH_TEST_RE.test(out) || OLD_RENPH_TEST_RE.test(out)) {
      if (!validatePlaceholders(src, out)) continue;
    }
  }
  return warnings;
}
