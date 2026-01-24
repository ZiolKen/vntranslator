export const LANGS = [
  { code: "vi", label: "Vietnamese" },
  { code: "en", label: "English" },
  { code: "ja", label: "Japanese" },
  { code: "ko", label: "Korean" },
  { code: "zh", label: "Chinese (Simplified)" },
  { code: "zh-tw", label: "Chinese (Traditional)" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "es", label: "Spanish" },
  { code: "pt", label: "Portuguese" },
  { code: "pt-br", label: "Portuguese (Brazil)" },
  { code: "ru", label: "Russian" },
  { code: "it", label: "Italian" },
  { code: "nl", label: "Dutch" },
  { code: "pl", label: "Polish" },
  { code: "tr", label: "Turkish" },
  { code: "uk", label: "Ukrainian" },
  { code: "id", label: "Indonesian" },
  { code: "th", label: "Thai" },
  { code: "ms", label: "Malay" },
  { code: "ar", label: "Arabic" },
  { code: "hi", label: "Hindi" },
  { code: "sv", label: "Swedish" },
  { code: "no", label: "Norwegian" },
  { code: "da", label: "Danish" },
  { code: "fi", label: "Finnish" },
  { code: "cs", label: "Czech" },
  { code: "hu", label: "Hungarian" },
  { code: "ro", label: "Romanian" },
  { code: "el", label: "Greek" },
  { code: "he", label: "Hebrew" },
];

export function languageLabel(code) {
  const c = String(code || "").toLowerCase();
  const hit = LANGS.find(x => x.code === c);
  return hit ? hit.label : c.toUpperCase();
}

const DEEPL_MAP = new Map([
  ["en", "EN-US"],
  ["en-us", "EN-US"],
  ["en-gb", "EN-GB"],
  ["de", "DE"],
  ["fr", "FR"],
  ["es", "ES"],
  ["it", "IT"],
  ["nl", "NL"],
  ["pl", "PL"],
  ["pt", "PT-PT"],
  ["pt-br", "PT-BR"],
  ["ru", "RU"],
  ["ja", "JA"],
  ["zh", "ZH"],
  ["zh-cn", "ZH"],
  ["zh-tw", "ZH"],
  ["ko", "KO"],
  ["sv", "SV"],
  ["no", "NB"],
  ["da", "DA"],
  ["fi", "FI"],
  ["cs", "CS"],
  ["hu", "HU"],
  ["ro", "RO"],
  ["tr", "TR"],
  ["uk", "UK"],
  ["id", "ID"],
  ["bg", "BG"],
  ["el", "EL"],
  ["et", "ET"],
  ["lt", "LT"],
  ["lv", "LV"],
  ["sk", "SK"],
  ["sl", "SL"],
]);

export function getDeepLLangCode(targetLang) {
  const v = String(targetLang || "").toLowerCase();
  return DEEPL_MAP.get(v) || v.toUpperCase();
}

export function needsDeepLQualityModel(targetCode) {
  const t = String(targetCode || "").toUpperCase();
  return t === "JA" || t === "ZH" || t === "KO";
}
