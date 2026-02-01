(() => {
"use strict";

const els = {
  input: document.getElementById("fileInput"),
  start: document.getElementById("startBtn"),
  stop: document.getElementById("stopBtn"),
  copy: document.getElementById("copyBtn"),
  dl: document.getElementById("downloadBtn"),
  out: document.getElementById("outputArea"),
  bar: document.getElementById("progressBar"),
  pt: document.getElementById("progressText"),
  log: document.getElementById("logConsole"),
  batch: document.getElementById("batchSize"),
  mode: document.getElementById("transMode"),
  skipVi: document.getElementById("skipVietnamese"),

  model: document.getElementById("transModel"),
  apiKey: document.getElementById("apiKey"),
  apiKeyGroup: document.getElementById("apiKeyGroup"),
  
  deeplKey: document.getElementById("deeplApiKey"),
  deeplKeyGroup: document.getElementById("deeplKeyGroup"),
};

const SEPARATOR_RE = /^---------\d+\s*$/;
const VIETNAMESE_REGEX = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;

function syncModelUI(showWarnings = false) {
  const m = els.model.value;

  if (els.apiKeyGroup) {
    els.apiKeyGroup.style.display = (m === "deepseek") ? "block" : "none";
  }
  if (els.deeplKeyGroup) {
    els.deeplKeyGroup.style.display = (m === "deepl") ? "block" : "none";
  }

  if (showWarnings && (m === "lingva" || m === "google")) {
    showLingvaWarning();
  }
}

els.model.addEventListener("change", () => syncModelUI(true));
syncModelUI(false);

const lingvaModal = document.getElementById("lingvaWarningModal");
const confirmLingvaBtn = document.getElementById("confirmLingvaBtn");
const cancelLingvaBtn = document.getElementById("cancelLingvaBtn");

function showLingvaWarning() {
  lingvaModal.classList.remove("hidden");
}
confirmLingvaBtn.onclick = () => lingvaModal.classList.add("hidden");
cancelLingvaBtn.onclick = () => {
  lingvaModal.classList.add("hidden");
  els.model.value = "deepseek";
  els.apiKeyGroup.style.display = "block";
};

const state = {
  blocks: [],
  total: 0,
  doneBlocks: 0,
  doneLines: 0,
  totalLines: 0,
  isRunning: false,
  abortCtrl: null,
};

function addLog(type, left, right = "") {
  const div = document.createElement("div");
  div.className = "log-item";

  const badge = document.createElement("span");
  badge.className = "tag";

  const t = String(type || "log").toLowerCase();
  if (t === "ok") badge.classList.add("tag-ok");
  else if (t === "exist") badge.classList.add("tag-exist");
  else if (t === "err") badge.classList.add("tag-skip");
  else if (t.startsWith("tag-")) badge.classList.add(t);
  else badge.classList.add("tag-skip");

  badge.textContent = t.startsWith("tag-") ? t.replace("tag-", "").toUpperCase() : t.toUpperCase();

  const leftSpan = document.createElement("span");
  leftSpan.style.color = "#aaa";
  leftSpan.textContent = String(left || "").slice(0, 60);

  const arrow = document.createElement("span");
  arrow.style.margin = "0 5px";
  arrow.style.color = "#555";
  arrow.textContent = "➔";

  const rightSpan = document.createElement("span");
  rightSpan.style.color = "#fff";
  rightSpan.textContent = String(right || "").slice(0, 60);

  div.append(badge, leftSpan, arrow, rightSpan);

  els.log.prepend(div);
  while (els.log.children.length > 120) els.log.lastChild.remove();
}

function updateUI() {
  const total = Number(state.totalLines) || 0;
  const done = Number(state.doneLines) || 0;

  const pct = total ? Math.min(100, Math.round((done / total) * 100)) : 0;

  els.bar.style.width = pct + "%";
  els.pt.textContent = total ? `${pct}% (${done}/${total})` : "Ready";
}

function resetProgress(totalLines = 0) {
  state.doneLines = 0;
  state.totalLines = Number(totalLines) || 0;

  els.bar.style.width = "0%";
  els.pt.textContent = state.totalLines ? `0% (0/${state.totalLines})` : "Ready";
}

const RPGM_ESCAPE_RE = /\\\\|\\(?:[A-Za-z]+(?:\[[^\]]*])?(?:<[^>]*>)?|[{}|!^$<>.])/g;
const FORMAT_PLACEHOLDER_RE = /%\d+|\{\d+\}/g;
const PH_TOKEN_RE = /⟦\s*PH(\d+)\s*⟧/gi;

function protectText(text) {
  const placeholders = [];

  const protectBy = (re) => {
    text = text.replace(re, (m) => {
      const id = placeholders.length;
      placeholders.push(m);
      return `⟦PH${id}⟧`;
    });
  };

  protectBy(RPGM_ESCAPE_RE);
  protectBy(FORMAT_PLACEHOLDER_RE);

  return { safe: text, placeholders };
}

function restoreText(text, placeholders) {
  return text.replace(PH_TOKEN_RE, (_, n) => placeholders[Number(n)] ?? `⟦PH${n}⟧`);
}

function isPlaceholderSafe(originalSafe, translatedSafe) {
  const orig = (originalSafe.match(PH_TOKEN_RE) || []).length;
  const trans = (translatedSafe.match(PH_TOKEN_RE) || []).length;
  return trans >= orig;
}

function createPool(limit) {
  let active = 0;
  const q = [];
  const runNext = () => {
    if (active >= limit) return;
    const job = q.shift();
    if (!job) return;
    active++;
    job()
      .catch(() => {})
      .finally(() => {
        active--;
        runNext();
      });
  };

  return {
    run(task) {
      return new Promise((resolve, reject) => {
        q.push(async () => {
          try {
            const res = await task();
            resolve(res);
          } catch (e) {
            reject(e);
          }
        });
        runNext();
      });
    },
  };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function withRetry(fn, { retries = 4, baseDelay = 400, signal } = {}) {
  let attempt = 0;
  while (true) {
    if (signal?.aborted) throw new Error("Aborted");
    try {
      return await fn();
    } catch (e) {
      attempt++;
      if (attempt > retries) throw e;

      const delay = Math.round(baseDelay * Math.pow(2, attempt - 1) * (0.7 + Math.random() * 0.6));
      await sleep(delay);
    }
  }
}

const LANG_MAP = {
  vi: { label: "Vietnamese", deepl: "VI" },
  id: { label: "Indonesian", deepl: "ID" },
  en: { label: "English", deepl: "EN-US" },
  ms: { label: "Malay", deepl: "MS" },
  tl: { label: "Filipino", deepl: "TL" },

  ja: { label: "Japanese", deepl: "JA" },
  ko: { label: "Korean", deepl: "KO" },
  zh: { label: "Chinese (Simplified)", deepl: "ZH" },
  th: { label: "Thai", deepl: "TH" },
  hi: { label: "Hindi", deepl: "HI" },

  fr: { label: "French", deepl: "FR" },
  de: { label: "German", deepl: "DE" },
  es: { label: "Spanish", deepl: "ES" },
  pt: { label: "Portuguese", deepl: "PT-PT" }, 
  ru: { label: "Russian", deepl: "RU" },
  ar: { label: "Arabic", deepl: "AR" },
};

function languageLabel(code) {
  return LANG_MAP[code]?.label || code;
}

function toDeepLTargetLang(code) {
  return LANG_MAP[code]?.deepl || null;
}

function needsDeepLQualityModel(dlTarget) {
  return ["MS", "TL", "HI"].includes(String(dlTarget || "").toUpperCase());
}

const deeplPool = createPool(2);

async function translateDeepLBatch(linesSafe, targetLang, apiKey, signal) {
  const dlTarget = toDeepLTargetLang(targetLang);
  if (!dlTarget) {
    throw new Error(`DeepL does not support target language "${targetLang}" in this tool.`);
  }

  const body = {
    apiKey,
    text: linesSafe,
    target_lang: dlTarget,
    preserve_formatting: 1,
    split_sentences: 0,
    ...(needsDeepLQualityModel(dlTarget) ? { model_type: "quality_optimized" } : {}),
  };

  const res = await fetch("/api/deepl-trans", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`DeepL error ${res.status}: ${errText || "Request failed"}`);
  }

  const data = await res.json();
  const translations = Array.isArray(data?.translations) ? data.translations : [];
  return translations.map((t) => t?.text || "");
}

const deepseekPool = createPool(2);

async function translateDeepSeekBatch(linesSafe, targetLang, apiKey, signal) {
  const marked = linesSafe.map((t, i) => `⟦L${i}⟧ ${t}`);

  const prompt =
`Your Role: Veteran Visual Novel Translator and Localization Specialist with deep experience translating RPG Maker scripts, including adult/NSFW content. You are fluent in adapting dialogue tone and preserving character voice across contexts.
Short basic instruction: Translate the following RPG Maker dialogue lines to ${languageLabel(targetLang)} (code: ${targetLang}).

Think step by step before translating — analyze each line's tone, implied meaning, and character voice.
Maintain the emotional tone and character consistency across translations.
Simulate the memory of how each character speaks to keep their personality and style consistent.

Rules:
- Keep ALL placeholders EXACTLY as-is and do NOT translate them: tokens like ⟦PH0⟧, ⟦PH1⟧ must remain unchanged.
- Keep the line markers EXACTLY as-is and do NOT translate them: ⟦L0⟧, ⟦L1⟧ ... do NOT remove or edit them.
- Preserve RPG Maker syntax, variables, and tags.
- DO NOT remove or add \\n or any RPG Maker escape codes.
- Do NOT reorder, merge, or split lines.
- Do NOT change placeholders or variables.
- Do NOT add numbering, quotes, prefixes, or extra commentary.
- Translate naturally and meaningfully by context — avoid word-by-word literal translation.
- Use slang sparingly and only if it enhances natural tone and is easy to understand.
- Translate adult (NSFW) content directly and explicitly. Do NOT censor anything.
      
Context:
- You are working with raw dialogue strings extracted from a RPG Maker `.json` script.
- The visual novel includes romantic, emotional,... and adult themes.
- Your translation will be directly used in-game, so accuracy, naturalness, and structural integrity are crucial.

Your Goal:
- Produce a fully localized, natural-sounding version of the input dialogues that feels authentic to the target language audience — as if originally written in that language.
- Ensure accuracy, tone consistency, and contextual appropriateness even for explicit scenes.

Result:
- Return ONLY the translated lines, one per line, preserving the same ⟦Lx⟧ prefix, in the same order.

Input Lines:
${marked.join("\n")}`;

  const body = {
    apiKey,
    model: "deepseek-chat",
    messages: [
      { role: "system", content: "Veteran Visual Novel Translator and Localization Specialist with deep experience translating RPG Maker scripts, including adult game, NSFW content." },
      { role: "user", content: prompt }
    ],
    stream: false
  };

  const res = await fetch("/api/deepseek-proxy", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) throw new Error("DeepSeek error " + res.status);
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content || "";

  const outLines = content
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const map = new Map();
  for (const l of outLines) {
    const m = l.match(/^⟦L(\d+)⟧\s*(.*)$/);
    if (!m) continue;
    map.set(Number(m[1]), m[2]);
  }

  const results = [];
  for (let i = 0; i < linesSafe.length; i++) {
    results.push(map.get(i) ?? "");
  }
  return results;
}

const LINGVA_HOSTS = [
  "https://lingva.dialectapp.org",
  "https://lingva.ml",
  "https://translate.plausibility.cloud",
  "https://lingva.vercel.app",
  "https://lingva.garudalinux.org",
  "https://lingva.lunar.icu",
];

const lingvaPool = createPool(55);

async function lingvaRequest(text, target, signal) {
  const hosts = [...LINGVA_HOSTS].sort(() => Math.random() - 0.5);

  for (const host of hosts) {
    try {
      const res = await fetch(
        host + "/api/v1/auto/" + target + "/" + encodeURIComponent(text),
        { signal }
      );
      if (!res.ok) continue;
      const data = await res.json();
      return data.translation || data.translatedText || text;
    } catch (_) {}
  }
  throw new Error("Lingva: all endpoints failed");
}

const googlePool = createPool(55);
const translateCache = new Map();

async function googleTranslate(text, sl, tl, signal) {
  if (!text.trim()) return text;

  const cacheKey = `${sl}->${tl}::${text}`;
  if (translateCache.has(cacheKey)) return translateCache.get(cacheKey);

  const url =
    `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sl}&tl=${tl}&dt=t&q=${encodeURIComponent(text)}`;

  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error("Google error " + res.status);
  const data = await res.json();
  const out = (data?.[0] || []).map(x => x?.[0] || "").join("");
  translateCache.set(cacheKey, out);
  return out;
}

els.input.addEventListener("change", async (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;

  const text = await file.text();
  const lines = text.split(/\r?\n/);

  state.blocks = [];
  let current = null;

  for (const line of lines) {
    if (SEPARATOR_RE.test(line)) {
      if (current) state.blocks.push(current);
      current = { header: line.trim(), lines: [], translated: [] };
    } else {
      if (!current) current = { header: "", lines: [], translated: [] };
      current.lines.push(line);
    }
  }
  if (current) state.blocks.push(current);

  state.total = state.blocks.length;
  state.doneBlocks = 0;
  state.doneLines = 0;

  state.totalLines = state.blocks.reduce((sum, b) => sum + b.lines.length, 0);

  els.out.value = "";
  els.log.innerHTML = "";
  els.pt.textContent = "Ready";
  els.bar.style.width = "0%";
  els.start.disabled = false;
  els.stop.disabled = true;
  els.copy.disabled = true;
  els.dl.disabled = true;

  addLog("ok", "File loaded", `${state.total} blocks / ${state.totalLines} lines`);
});

function buildResultText() {
  return state.blocks.map(b =>
    (b.header ? b.header + "\n" : "") +
    (b.translated.length ? b.translated : b.lines).join("\n")
  ).join("\n");
}

function finish() {
  state.isRunning = false;
  els.out.value = buildResultText();
  els.start.disabled = false;
  els.stop.disabled = true;
  els.copy.disabled = false;
  els.dl.disabled = false;
  addLog("ok", "DONE", "All processed");
}

function shouldSkipLine(line, skipVi) {
  if (!line || !line.trim()) return true;
  if (skipVi && VIETNAMESE_REGEX.test(line)) return true;
  return false;
}

els.start.addEventListener("click", async () => {
  resetProgress(0);
  els.pt.textContent = "Preparing…";
  
  const model = els.model.value;
  const targetLang = els.mode.value;
  const apiKey = (els.apiKey && els.apiKey.value) ? els.apiKey.value.trim() : "";
  const skipVi = !!els.skipVi.checked;

  if (model === "deepseek" && !apiKey) {
    alert("DeepSeek API key is required.");
    return;
  }
  
  const deeplApiKey = (els.deeplKey && els.deeplKey.value) ? els.deeplKey.value.trim() : "";

  if (model === "deepl" && !deeplApiKey) {
    alert("DeepL API key is required.");
    return;
  }

  state.isRunning = true;
  state.abortCtrl = new AbortController();
  const signal = state.abortCtrl.signal;

  els.start.disabled = true;
  els.stop.disabled = false;
  els.copy.disabled = true;
  els.dl.disabled = true;

  const tasks = [];
  for (let bi = 0; bi < state.blocks.length; bi++) {
    const block = state.blocks[bi];
    block.translated = block.lines.slice();
    for (let li = 0; li < block.lines.length; li++) {
      const raw = block.lines[li];
      if (shouldSkipLine(raw, skipVi)) {
        if (skipVi && raw && VIETNAMESE_REGEX.test(raw)) addLog("exist", raw, "SKIP");
        continue;
      }
      const { safe, placeholders } = protectText(raw);
      tasks.push({ bi, li, raw, safe, placeholders });
    }
  }

  if (!tasks.length) {
    addLog("ok", "Nothing to translate", "All lines skipped/empty");
    finish();
    return;
  }
  
  state.totalLines = tasks.length;
  updateUI();

  addLog("ok", "Start", `Model=${model}, target=${targetLang}, lines=${tasks.length}`);

  try {
    const batchSize = Math.max(1, parseInt(els.batch.value, 10) || 20);

    if (model === "deepseek") {
      const MAX_CHARS = 10000;
      const batches = [];
      let cur = [];
      let curChars = 0;

      for (const t of tasks) {
        const add = t.safe.length + 12;
        if (cur.length >= batchSize || (curChars + add) > MAX_CHARS) {
          batches.push(cur);
          cur = [];
          curChars = 0;
        }
        cur.push(t);
        curChars += add;
      }
      if (cur.length) batches.push(cur);

      for (const batch of batches) {
        if (!state.isRunning) break;

        const safeLines = batch.map(x => x.safe);

        const translatedSafe = await deepseekPool.run(() =>
          withRetry(
            () => translateDeepSeekBatch(safeLines, targetLang, apiKey, signal),
            { retries: 4, baseDelay: 500, signal }
          )
        );

        for (let i = 0; i < batch.length; i++) {
          const t = batch[i];
          let outSafe = translatedSafe[i] || "";

          if (!isPlaceholderSafe(t.safe, `⟦PH0⟧`.includes("PH") ? outSafe : outSafe)) {
            state.blocks[t.bi].translated[t.li] = t.raw;
            addLog("err", t.raw, "PLACEHOLDER LOST (fallback)");
          } else {
            const restored = restoreText(outSafe, t.placeholders);
            state.blocks[t.bi].translated[t.li] = restored;
            addLog(`tag-${targetLang}`, t.raw, restored);
          }

          state.doneLines++;
        }

        updateUI();
      }
    }
    
    else if (model === "deepl") {
      const MAX_BYTES = 120 * 1024;
      const batches = [];
      let cur = [];
      let curBytes = 0;

      const batchSize = Math.max(1, parseInt(els.batch.value, 10) || 20);

      for (const t of tasks) {
        const add = (t.safe?.length || 0) + 64;

        if (cur.length >= batchSize || (curBytes + add) > MAX_BYTES) {
          if (cur.length) batches.push(cur);
          cur = [];
          curBytes = 0;
        }

        cur.push(t);
        curBytes += add;
      }
      if (cur.length) batches.push(cur);

      for (const batch of batches) {
        if (!state.isRunning) break;

        const safeLines = batch.map(x => x.safe);

        const translatedSafe = await deeplPool.run(() =>
          withRetry(
            () => translateDeepLBatch(safeLines, targetLang, deeplApiKey, signal),
            { retries: 3, baseDelay: 500, signal }
          )
        );

        for (let i = 0; i < batch.length; i++) {
          const t = batch[i];
          const outSafe = translatedSafe[i] || "";

          if (!isPlaceholderSafe(t.safe, outSafe)) {
            state.blocks[t.bi].translated[t.li] = t.raw;
            addLog("err", t.raw, "PLACEHOLDER LOST (fallback)");
          } else {
            const restored = restoreText(outSafe, t.placeholders);
            state.blocks[t.bi].translated[t.li] = restored;
            addLog(`tag-${targetLang}`, t.raw, restored);
          }

          state.doneLines++;
        }

        updateUI();
      }
    }

    else if (model === "lingva") {
      const jobs = tasks.map((t) =>
        lingvaPool.run(() =>
          withRetry(async () => {
            const outSafe = await lingvaRequest(t.safe, targetLang, signal);

            if (!isPlaceholderSafe(t.safe, outSafe)) {
              state.blocks[t.bi].translated[t.li] = t.raw;
              addLog("err", t.raw, "PLACEHOLDER LOST (fallback)");
            } else {
              const restored = restoreText(outSafe, t.placeholders);
              state.blocks[t.bi].translated[t.li] = restored;
              addLog(`tag-${targetLang}`, t.raw, restored);
            }

            state.doneLines++;
            if (state.doneLines % 10 === 0) updateUI();
          }, { retries: 3, baseDelay: 400, signal })
        )
      );

      await Promise.all(jobs);
      updateUI();
    }

    else {
      const jobs = tasks.map((t) =>
        googlePool.run(() =>
          withRetry(async () => {
            const outSafe = await googleTranslate(t.safe, "auto", targetLang, signal);

            if (!isPlaceholderSafe(t.safe, outSafe)) {
              state.blocks[t.bi].translated[t.li] = t.raw;
              addLog("err", t.raw, "PLACEHOLDER LOST (fallback)");
            } else {
              const restored = restoreText(outSafe, t.placeholders);
              state.blocks[t.bi].translated[t.li] = restored;
              addLog(`tag-${targetLang}`, t.raw, restored);
            }

            state.doneLines++;
            if (state.doneLines % 10 === 0) updateUI();
          }, { retries: 3, baseDelay: 350, signal })
        )
      );

      await Promise.all(jobs);
      updateUI();
    }

    finish();
  } catch (err) {
    addLog("err", "Stopped/Error", err.message || String(err));
    finish();
  }
});

els.stop.addEventListener("click", () => {
  state.isRunning = false;
  if (state.abortCtrl) state.abortCtrl.abort();
  addLog("ok", "STOP", "User aborted");
  finish();
});

els.copy.addEventListener("click", async () => {
  if (!els.out.value.trim()) return alert("There is no content to copy.");
  await navigator.clipboard.writeText(els.out.value);
  alert("Copied!");
});

els.dl.addEventListener("click", () => {
  const lang = els.mode.value;
  const blob = new Blob([els.out.value], { type: "text/plain;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = els.input.files[0]
    ? els.input.files[0].name.replace(".txt", `_${lang}.txt`)
    : `translated_${lang}.txt`;
  a.click();
});

document.addEventListener("keydown", e => {
  if (
    e.key === "F12" ||
    (e.ctrlKey && e.shiftKey && ["I", "J", "C"].includes(e.key)) ||
    (e.ctrlKey && e.key === "U")
  ) {
    e.preventDefault();
  }
});

console.log('%c░██████╗████████╗░█████╗░██████╗░██╗\n██╔════╝╚══██╔══╝██╔══██╗██╔══██╗██║\n╚█████╗░░░░██║░░░██║░░██║██████╔╝██║\n░╚═══██╗░░░██║░░░██║░░██║██╔═══╝░╚═╝\n██████╔╝░░░██║░░░╚█████╔╝██║░░░░░██╗\n╚═════╝░░░░╚═╝░░░░╚════╝░╚═╝░░░░░╚═╝', 'color: red; font-weight: bold;');
})();