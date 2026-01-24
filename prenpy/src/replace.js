import { maskTagsInText, unmaskTagsInText } from "./renpy.js";

const escapeRegExp = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const buildReplaceRegex = (find, { regex, caseSensitive, wholeWord }) => {
  const src = regex ? find : escapeRegExp(find);
  const body = wholeWord ? `\\b${src}\\b` : src;
  const flags = caseSensitive ? "g" : "gi";
  return new RegExp(body, flags);
};

export const unescapeMini = (s) => String(s ?? "")
  .replace(/\\n/g, "\n")
  .replace(/\\t/g, "\t")
  .replace(/\\\\/g, "\\");

export const parseRules = (text) => {
  const lines = String(text || "").split(/\r?\n/);
  const rules = [];
  for (const line of lines) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;

    let a = "";
    let b = "";

    const arrow = t.indexOf("=>");
    if (arrow >= 0) {
      a = t.slice(0, arrow).trim();
      b = t.slice(arrow + 2).trim();
    } else {
      const tab = t.split("\t");
      if (tab.length >= 2) {
        a = tab[0].trim();
        b = tab.slice(1).join("\t").trim();
      } else {
        continue;
      }
    }

    if (!a) continue;
    rules.push({ find: unescapeMini(a), withStr: unescapeMini(b) });
  }
  return rules;
};

export const safeRenpyReplaceMany = (text, compiledRules) => {
  const original = String(text ?? "");
  if (!original) return { out: original, changed: false };

  const masked = maskTagsInText(original);
  let s = masked.masked;

  for (const r of compiledRules) s = s.replace(r.re, r.withStr);

  const out = unmaskTagsInText(s, masked.map);
  return { out, changed: out !== original };
};

export const countMatchesMasked = (text, compiledRules) => {
  const original = String(text ?? "");
  if (!original) return 0;

  const masked = maskTagsInText(original).masked;
  let hits = 0;

  for (const r of compiledRules) {
    const m = masked.match(r.re);
    if (m) hits += m.length;
  }

  return hits;
};
