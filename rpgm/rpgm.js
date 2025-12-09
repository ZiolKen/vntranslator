(function(){
"use strict";

/* ------------------------------------------------------------
   DOM Binding
------------------------------------------------------------ */
const el = {
  jsonFile: document.getElementById("jsonFile"),
  startBtn: document.getElementById("startBtn"),
  stopBtn: document.getElementById("stopBtn"),
  resumeBtn: document.getElementById("resumeBtn"),
  downloadResultBtn: document.getElementById("downloadResultBtn"),
  previewResultBtn: document.getElementById("previewResultBtn"),

  translationModel: document.getElementById("translationModel"),
  apiKey: document.getElementById("apiKey"),
  chatgptKey: document.getElementById("chatgptApiKey"),
  targetLanguage: document.getElementById("targetLanguage"),
  batchSize: document.getElementById("batchSize"),

  progressBar: document.getElementById("progressBar"),
  progressText: document.getElementById("progressText"),
  logContainer: document.getElementById("logContainer"),

  viewRawBtn: document.getElementById("viewRawBtn"),
  jsonContent: document.getElementById("jsonContent"),
  jsonInfoGroup: document.getElementById("jsonInfoGroup"),
  fileStats: document.getElementById("fileStats"),

  lingvaWarningModal: document.getElementById("lingvaWarningModal"),
  confirmLingvaBtn: document.getElementById("confirmLingvaBtn"),
  cancelLingvaBtn: document.getElementById("cancelLingvaBtn")
};

/* ------------------------------------------------------------
   State
------------------------------------------------------------ */
const state = {
  json: null,
  fileName: null,
  dialogs: [],
  isRunning: false,
  isPaused: false,
  currentIndex: 0,
  translations: [],
  placeholderCounter: 0,
  progressLog: [],
};

/* ------------------------------------------------------------
   Logger
------------------------------------------------------------ */
function log(msg, type="info") {
  const p = document.createElement("div");

  let color = "#00ffff";
  if (type==="error") color="#ff4444";
  else if (type==="warn") color="#ffdd55";
  else if (type==="success") color="#00ff88";

  p.style.color = color;
  p.textContent = msg;

  el.logContainer.appendChild(p);
  el.logContainer.scrollTop = el.logContainer.scrollHeight;

  state.progressLog.push(`[${type}] ${msg}`);
}

function delay(ms){ return new Promise(r=>setTimeout(r,ms)); }

function createPlaceholder() {
  return `__PH${state.placeholderCounter++}__`;
}

/* ------------------------------------------------------------
   RPGM Placeholder
------------------------------------------------------------ */
const RPGM_CODE_RE = /\\[a-zA-Z]+\[?[^\]]*\]?|\\n|\\\.|\\\||\\\!|\\\^|\\\$/g;

function protectRPGMCodes(str) {
  if (!str) return { text: str, map: {} };

  const map = {};
  let result = str;

  result = result.replace(RPGM_CODE_RE, (m)=>{
    const ph = createPlaceholder();
    map[ph] = m;
    return ph;
  });

  return { text: result, map };
}

function restoreRPGMCodes(str, map) {
  if (!str || !map) return str;

  let out = str;
  for (const ph in map) {
    out = out.replaceAll(ph, map[ph]);
  }
  return out;
}

/* ------------------------------------------------------------
   Extract dialogs
------------------------------------------------------------ */

const COMMAND_TEXT   = [101,105];
const COMMAND_LINE   = [401,408,405];
const COMMAND_CHOICE = [102];
const COMMAND_BRANCH = [402,403];
const COMMAND_COMMENT= [108];

function extractDialogsFromJson(jsonObj, fileIndex=0, fileName="") {
  let dialogs = [];

  function walk(node) {
    if (!node) return;

    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }

    if (typeof node !== "object") return;

    if (node.code && node.parameters) {
      const code = node.code;

      if (COMMAND_TEXT.includes(code)) {
        const arr = node.parameters[0] || [];
        arr.forEach((t,i)=>{
          if (typeof t==="string" && t.trim() !== "") {
            dialogs.push({
              fileIndex,
              fileName,
              ref: node.parameters[0],
              index: i,
              text: t,
              code
            });
          }
        });
      }
      else if (COMMAND_LINE.includes(code)) {
        const t = node.parameters[0];
        if (typeof t==="string" && t.trim() !== "") {
          dialogs.push({
            fileIndex,
            fileName,
            ref: node.parameters,
            index: 0,
            text: t,
            code
          });
        }
      }
      else if (COMMAND_COMMENT.includes(code)) {
        const t = node.parameters[0];
        if (typeof t==="string" && t.trim() !== "") {
          dialogs.push({
            fileIndex,
            fileName,
            ref: node.parameters,
            index: 0,
            text: t,
            code
          });
        }
      }
      else if (COMMAND_CHOICE.includes(code)) {
        const arr = node.parameters[0] || [];
        arr.forEach((t,i)=>{
          if (typeof t==="string" && t.trim() !== "") {
            dialogs.push({
              fileIndex,
              fileName,
              ref: node.parameters[0],
              index: i,
              text: t,
              code
            });
          }
        });
      }
      else if (COMMAND_BRANCH.includes(code)) {
        const t = node.parameters[1];
        if (typeof t==="string" && t.trim() !== "") {
          dialogs.push({
            fileIndex,
            fileName,
            ref: node.parameters,
            index: 1,
            text: t,
            code
          });
        }
      }
    }

    Object.values(node).forEach(walk);
  }

  walk(jsonObj);
  return dialogs;
}

/* ------------------------------------------------------------
   Batch Creation
------------------------------------------------------------ */
function createBatches(dialogs, size) {
  const batches = [];
  for (let i = 0; i < dialogs.length; i += size) {
    batches.push(dialogs.slice(i, i + size));
  }
  return batches;
}

/* ------------------------------------------------------------
   Language Mapping
------------------------------------------------------------ */
function languageLabel(code){
  switch(code){
    case "vi": return "Vietnamese";
    case "en": return "English";
    case "ms": return "Malay";
    case "id": return "Indonesian";
    case "tl": return "Filipino";
    default: return code;
  }
}

/* ------------------------------------------------------------
   Translator: DeepSeek
------------------------------------------------------------ */
async function translateBatchDeepSeek(batch, targetLang, apiKey) {
  const lines = batch.map(d => d.protectedText);

  const prompt =
`Translate the following RPG Maker dialogue lines to ${languageLabel(targetLang)} (code: ${targetLang}).

RULES:
- Some parts are placeholders like __PH0__, __PH1__. Keep them EXACTLY as-is and do NOT translate them.
- Preserve RPGM syntax, variables, and tags.
- DO NOT remove or add \n or any RPGM escape codes.
- Do NOT reorder, merge, or split lines.
- Do NOT change placeholders or variables.
- Return ONLY the translated lines, one per line, in the same order.
- Do NOT add numbering, quotes, prefixes, or extra commentary.

LINES:
${lines.join("\n")}`;

  const body = {
    apiKey: apiKey,
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
    body: JSON.stringify(body)
  });

  if (!res.ok) throw new Error("DeepSeek error: " + res.status);

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content || "";
  const outLines = content.split(/\r?\n/).filter(l => l.trim() !== "");

  if (outLines.length !== lines.length) {
    log(`⚠️ DeepSeek returned ${outLines.length} lines, expected ${lines.length}. Mapping by order.`, "warn");
  }

  return outLines;
}

/* ------------------------------------------------------------
   Translator: ChatGPT (OpenAI)
------------------------------------------------------------ */
async function translateBatchChatGPT(batch, targetLang, apiKey, model) {
  const lines = batch.map(d => d.protectedText);

  const prompt =
`Translate the following RPG Maker dialogue lines to ${languageLabel(targetLang)} (code: ${targetLang}).

RULES:
- Some parts are placeholders like __PH0__, __PH1__. Keep them EXACTLY as-is and do NOT translate them.
- Preserve RPGM syntax, variables, and tags.
- DO NOT remove or add \n or any RPGM escape codes.
- Do NOT reorder, merge, or split lines.
- Do NOT change placeholders or variables.
- Return ONLY the translated lines, one per line, in the same order.
- Do NOT add numbering, quotes, prefixes, or extra commentary.

LINES:
${lines.join("\n")}`;

  const body = {
    model: model,
    messages: [
      { role: "system", content: "You are a professional game localization translator specializing in RPG Maker games." },
      { role: "user", content: prompt }
    ]
  };

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + apiKey
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error("ChatGPT HTTP " + res.status + ": " + t);
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content || "";
  const outLines = content.split(/\r?\n/).filter(l => l.trim() !== "");

  if (outLines.length !== lines.length) {
    log(`⚠️ ChatGPT returned ${outLines.length} lines, expected ${lines.length}.`, "warn");
  }

  return outLines;
}

/* ------------------------------------------------------------
   Translator: Lingva (Free)
------------------------------------------------------------ */
const LINGVA_HOSTS = [
  "https://lingva.ml",
  "https://translate.plausibility.cloud",
  "https://lingva.vercel.app",
  "https://lingva.garudalinux.org",
  "https://lingva.lunar.icu"
];

async function lingvaRequest(text, target) {
  for (const host of LINGVA_HOSTS) {
    try {
      const res = await fetch(
        host + "/api/v1/auto/" + target + "/" + encodeURIComponent(text)
      );
      if (!res.ok) continue;
      const data = await res.json();
      return data.translation || data.translatedText || text;
    } catch(e){}
  }
  throw new Error("Lingva: all endpoints failed");
}

async function translateBatchLingva(batch, targetLang) {
  const out = [];
  for (const d of batch) {
    const translated = await lingvaRequest(d.protectedText, targetLang);
    out.push(translated);
    await delay(150);
  }
  return out;
}

/* ------------------------------------------------------------
   Batch Translation Dispatcher
------------------------------------------------------------ */
async function translateBatch(batch, model, targetLang) {

  const dk = el.apiKey.value.trim();
  const ck = el.chatgptKey.value.trim();

  if (model === "deepseek") {
    if (!dk) throw new Error("Missing DeepSeek API key");
    return await translateBatchDeepSeek(batch, targetLang, dk);
  }

  if (model.startsWith("gpt-")) {
    if (!ck) throw new Error("Missing OpenAI API key");
    return await translateBatchChatGPT(batch, targetLang, ck, model);
  }

  if (model === "lingva") {
    return await translateBatchLingva(batch, targetLang);
  }

  throw new Error("Unknown translation model: " + model);
}

function prepareDialogs() {
  state.dialogs.forEach(d => {
    const { text } = d;
    const protectedInfo = protectRPGMCodes(text);
    d.protectedText = protectedInfo.text;
    d.phMap = protectedInfo.map;
  });
}

function applyTranslations() {
  for (let i = 0; i < state.dialogs.length; i++) {
    const d = state.dialogs[i];
    const restored = restoreRPGMCodes(d.translated, d.phMap);

    d.ref[d.index] = restored;
  }
  log("✅ All translated lines injected back into JSON.", "success");
}

/* ------------------------------------------------------------
   Translation Loop (Pause / Resume Safe)
------------------------------------------------------------ */
async function translationLoop() {
  const model = el.translationModel.value;
  const targetLang = el.targetLanguage.value;
  const batchSize = Math.max(1, parseInt(el.batchSize.value) || 20);

  const batches = createBatches(state.dialogs, batchSize);

  log(`ℹ️ Starting translation with model="${model}" target="${targetLang}" ...`);

  state.isRunning = true;
  state.isPaused = false;
  state.currentIndex = 0;

  updateProgress();
  el.stopBtn.disabled = false;
  el.resumeBtn.disabled = true;

  for (let bi = 0; bi < batches.length; bi++) {
    if (!state.isRunning) break;

    while (state.isPaused && state.isRunning) {
      await delay(300);
    }
    if (!state.isRunning) break;

    const batch = batches[bi];
    log(`🔄 Batch ${bi+1}/${batches.length} (${batch.length} lines)...`);

    let translatedLines = [];
    try {
      translatedLines = await translateBatch(batch, model, targetLang);
    } catch (err) {
      log(`⚠️ ERROR in batch ${bi+1}: ${err.message}`, "error");
      state.isRunning = false;
      break;
    }

    for (let i = 0; i < batch.length; i++) {
      const dlg = batch[i];
      dlg.translated = translatedLines[i] || dlg.protectedText;
      const restored = restoreRPGMCodes(dlg.translated, dlg.phMap);
      dlg.translated = restored;

      log(`✅ [${dlg.fileName}] ${restored}`, "success");

      state.currentIndex++;
      updateProgress();
      await delay(20);
    }
  }

  if (state.isRunning) {
    log("✅ Translation complete!", "success");
    applyTranslations();
    el.downloadResultBtn.disabled = false;
    el.previewResultBtn.disabled = false;
  }

  state.isRunning = false;
  el.stopBtn.disabled = true;
  el.resumeBtn.disabled = true;
  updateProgress();
}

/* ------------------------------------------------------------
   Progress UI
------------------------------------------------------------ */
function updateProgress() {
  const done = state.currentIndex;
  const total = state.dialogs.length;

  if (total === 0) {
    el.progressBar.value = 0;
    el.progressText.textContent = "0% (0/0)";
    return;
  }

  const pct = Math.floor((done / total) * 100);
  el.progressBar.value = pct;
  el.progressText.textContent = `${pct}% (${done}/${total})`;
}

el.stopBtn.addEventListener("click", () => {
  if (!state.isRunning) return;
  state.isPaused = true;
  el.stopBtn.disabled = true;
  el.resumeBtn.disabled = false;
  log("⏸️ Translation paused...", "warn");
});

el.resumeBtn.addEventListener("click", () => {
  if (!state.isRunning) return;
  log("▶️ Resuming translation...", "info");
  state.isPaused = false;
  el.stopBtn.disabled = false;
  el.resumeBtn.disabled = true;
});

/* ------------------------------------------------------------
   Start Translation
------------------------------------------------------------ */
async function startTranslationInternal() {
  if (!state.json) {
    log("⚠️ No JSON loaded!", "error");
    return;
  }

  const model = el.translationModel.value;
  if (model === "deepseek" && !el.apiKey.value.trim()) {
    log("⚠️ DeepSeek requires API key!", "error");
    return;
  }
  if (model.startsWith("gpt-") && !el.chatgptKey.value.trim()) {
    log("⚠️ ChatGPT requires API key!", "error");
    return;
  }

  prepareDialogs();

  state.currentIndex = 0;
  state.isRunning = true;
  state.isPaused = false;

  el.downloadResultBtn.disabled = true;
  el.previewResultBtn.disabled = true;

  updateProgress();

  await translationLoop();
}

el.startBtn.addEventListener("click", startTranslationInternal);

/* ------------------------------------------------------------
   JSON File Loader
------------------------------------------------------------ */
el.jsonFile.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  if (!file.name.toLowerCase().endsWith(".json")) {
    log("⚠️ Please upload a JSON file (MapXXX.json, CommonEvents.json...)", "error");
    return;
  }

  state.fileName = file.name;
  log(`ℹ️ Loading file: ${file.name}`, "info");

  try {
    const text = await file.text();
    state.json = JSON.parse(text);
  } catch (err) {
    log("⚠️ Failed to parse JSON file.", "error");
    return;
  }

  log("ℹ️ Extracting dialogs from JSON...", "info");

  state.dialogs = extractDialogsFromJson(state.json, 0, file.name);

  if (state.dialogs.length === 0) {
    log("⚠️ No dialog lines found in this JSON file.", "warn");
  } else {
    log(`✅ Found ${state.dialogs.length} dialog lines. Ready to translate.`, "success");
  }

  el.fileStats.textContent = `${state.dialogs.length} dialogs found`;
  el.jsonInfoGroup.style.display = "block";

  el.startBtn.disabled = state.dialogs.length === 0;
  el.downloadResultBtn.disabled = true;
  el.previewResultBtn.disabled = true;
});

el.viewRawBtn.addEventListener("click", () => {
  const isHidden = el.jsonContent.classList.contains("hidden");
  if (isHidden) {
    el.jsonContent.value = JSON.stringify(state.json, null, 2);
    el.jsonContent.classList.remove("hidden");
    el.viewRawBtn.textContent = "Hide Raw JSON";
  } else {
    el.jsonContent.classList.add("hidden");
    el.viewRawBtn.textContent = "Show Raw JSON";
  }
});

function updateRawView() {
  if (!el.jsonContent.classList.contains("hidden")) {
    el.jsonContent.value = JSON.stringify(state.json, null, 2);
  }
}

/* ------------------------------------------------------------
   Preview
------------------------------------------------------------ */
el.previewResultBtn.addEventListener("click", () => {
  if (!state.dialogs.length) {
    alert("⚠️ No translated data.");
    return;
  }

  const data = {
    texts: state.dialogs.map(d => d.translated || d.text),
    original: state.dialogs.map(d => d.text),
    path: state.fileName || "",
    model: el.translationModel.value,
    targetLang: el.targetLanguage.value
  };

  try {
    localStorage.setItem("translationData", JSON.stringify(data));
  } catch (err) {
    console.error(err);
    alert("⚠️ Cannot write to localStorage.");
    return;
  }

  window.location.href = "preview.html";
});

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, function (m) {
    return ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[m];
  });
}

/* ------------------------------------------------------------
   Download Translated JSON
------------------------------------------------------------ */
el.downloadResultBtn.addEventListener("click", () => {
  if (!state.json) {
    log("⚠️ No JSON available.", "error");
    return;
  }

  const blob = new Blob([JSON.stringify(state.json, null, 2)], {
    type: "application/json;charset=utf-8"
  });

  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);

  let base = state.fileName || "translated";
  base = base.replace(/\.json$/i, "");

  a.download = base + "_translated.json";
  a.click();

  log("⬇️ Translated JSON downloaded!", "success");
});

/* ------------------------------------------------------------
   Lingva Warning Modal
------------------------------------------------------------ */
function showLingvaWarning() {
  el.lingvaWarningModal.classList.remove("hidden");
}

function hideLingvaWarning() {
  el.lingvaWarningModal.classList.add("hidden");
}

el.confirmLingvaBtn.addEventListener("click", hideLingvaWarning);
el.cancelLingvaBtn.addEventListener("click", () => {
  hideLingvaWarning();
  el.translationModel.value = "deepseek";
});

/* ------------------------------------------------------------
   Model Switching Logic
------------------------------------------------------------ */
el.translationModel.addEventListener("change", () => {
  const m = el.translationModel.value;

  if (m === "deepseek") {
    document.getElementById("apiKeyGroup").style.display = "block";
    document.getElementById("chatgptApiKeyGroup").style.display = "none";
    return;
  }

  if (m.startsWith("gpt-")) {
    document.getElementById("apiKeyGroup").style.display = "none";
    document.getElementById("chatgptApiKeyGroup").style.display = "block";
    return;
  }

  if (m === "lingva") {
    document.getElementById("apiKeyGroup").style.display = "none";
    document.getElementById("chatgptApiKeyGroup").style.display = "none";
    showLingvaWarning();
  }
});

window.addEventListener("beforeunload", (e) => {
  if (state.isRunning) {
    e.preventDefault();
    e.returnValue = "Translation is still running.";
  }
});

document.addEventListener("contextmenu", e => e.preventDefault());

document.addEventListener("keydown", e => {
  if (
    e.key === "F12" ||
    (e.ctrlKey && e.shiftKey && ["I","J","C"].includes(e.key)) ||
    (e.ctrlKey && e.key === "U")
  ) {
    e.preventDefault();
  }
});

/* ------------------------------------------------------------
   Initialization
------------------------------------------------------------ */
function init() {

  el.startBtn.disabled = true;
  el.downloadResultBtn.disabled = true;
  el.previewResultBtn.disabled = true;

  document.getElementById("apiKeyGroup").style.display = "block";
  document.getElementById("chatgptApiKeyGroup").style.display = "none";

  el.progressBar.value = 0;
  el.progressText.textContent = "0% (0/0)";
}

/* ------------------------------------------------------------
   Auto init after DOM ready
------------------------------------------------------------ */
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

})();