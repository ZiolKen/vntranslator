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

  let badge = `<span class="tag tag-skip">LOG</span>`;
  if (type === "ok") badge = `<span class="tag tag-ok">OK</span>`;
  else if (type === "exist") badge = `<span class="tag tag-exist">EXIST</span>`;
  else if (type.startsWith("tag-")) badge = `<span class="tag ${type}">${type.replace("tag-", "").toUpperCase()}</span>`;
  else if (type === "err") badge = `<span class="tag tag-skip">ERR</span>`;

  div.innerHTML = `
    ${badge}
    <span style="color:#aaa">${(left || "").slice(0, 60)}</span>
    <span style="margin:0 5px;color:#555">➔</span>
    <span style="color:#fff">${(right || "").slice(0, 60)}</span>
  `;

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

function languageLabel(code) {
  return {
    vi: "Vietnamese",
    en: "English",
    id: "Indonesian",
    ms: "Malay",
    tl: "Filipino",
  }[code] || code;
}

function toDeepLTargetLang(code) {
  switch (code) {
    case "vi": return "VI";
    case "id": return "ID";
    case "en": return "EN-US";
    case "ms": return "MS";
    case "tl": return "TL";
    default: return String(code || "").toUpperCase();
  }
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
    ...(needQualityModel ? { model_type: "quality_optimized" } : {}),
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
`Translate the following RPG Maker dialogue lines to ${languageLabel(targetLang)} (code: ${targetLang}).

RULES:
- Keep ALL placeholders EXACTLY as-is and do NOT translate them: tokens like ⟦PH0⟧, ⟦PH1⟧ must remain unchanged.
- Keep the line markers EXACTLY as-is and do NOT translate them: ⟦L0⟧, ⟦L1⟧ ... do NOT remove or edit them.
- Preserve RPGM syntax, variables, and tags.
- DO NOT remove or add \\n or any RPGM escape codes.
- Do NOT reorder, merge, or split lines.
- Do NOT change placeholders or variables.
- Do NOT add numbering, quotes, prefixes, or extra commentary.
- Return ONLY the translated lines, one per line, preserving the same ⟦Lx⟧ prefix, in the same order.

LINES:
${marked.join("\n")}`;

  const body = {
    apiKey,
    model: "deepseek-chat",
    messages: [
      { role: "system", content: "You are a professional game localization translator specializing in RPG Maker games." },
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
  "https://lingva.ml",
  "https://translate.plausibility.cloud",
  "https://lingva.vercel.app",
  "https://lingva.garudalinux.org",
  "https://lingva.lunar.icu",
];

const lingvaPool = createPool(3);

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

const googlePool = createPool(6);
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

  if (model === "deepl" && !toDeepLTargetLang(targetLang)) {
    alert(
      `DeepL currently supports these targets in this tool: vi, id, en.\n` +
      `You selected: ${targetLang}. Please change language or use another model.`
    );
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
})();