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
   Buffered Logger
------------------------------------------------------------ */
class BufferLog {
  constructor(container, interval = 120) {
    this.container = container;
    this.buffer = [];
    this.interval = interval;
    setInterval(() => this.flush(), this.interval);
  }

  push(msg, type="info") {
    const div = document.createElement("div");
    let color = "#00ffff";
    if (type === "error") color = "#ff4444";
    else if (type === "warn") color = "#ffdd55";
    else if (type === "success") color = "#00ff88";

    div.style.color = color;
    div.textContent = msg;

    this.buffer.push(div);
    state.progressLog.push(`[${type}] ${msg}`);
  }

  flush() {
    if (this.buffer.length === 0) return;
    const frag = document.createDocumentFragment();
    for (const item of this.buffer) frag.appendChild(item);

    this.container.appendChild(frag);
    this.container.scrollTop = this.container.scrollHeight;

    this.buffer = [];
  }
}

const logger = new BufferLog(el.logContainer);

function log(msg, type="info") { 
  logger.push(msg, type);
}

function delay(ms){ return new Promise(r=>setTimeout(r,ms)); }

/* ------------------------------------------------------------
   RPGM Placeholder
------------------------------------------------------------ */
const ESCAPE_START = "\\";

function createPlaceholder(counter) {
  const random = Math.floor(Math.random() * 100);
  return `__RPGPLH_${counter}${random}__`;
}

function protectRPGMCodes(str) {
  if (!str) return { text: str, map: {} };

  const map = {};
  let out = '';
  let i = 0;
  let counter = 0;

  while (i < str.length) {
    const phMatch = /^(__RPGPLH_\d{1,5}__)/.exec(str.slice(i));
    if (phMatch) {
      const fullPh = phMatch[1];
      out += fullPh;
      i += fullPh.length;
      continue;
    }

    const ch = str[i];

    if (ch === '\\' || ch === '<' || ch === '[' || ch === '{') {
      let j = i;
      let block = '';

      if (ch === '\\') {
        block = '\\';
        j++;
        while (j < str.length && /[A-Za-z{}<>]/.test(str[j])) {
          block += str[j++];
        }
        if (str[j] === '[') {
          block += '[';
          j++;
          while (j < str.length && str[j] !== ']') block += str[j++];
          if (str[j] === ']') block += ']';
          j++;
        }
      } else if (ch === '<') {
        block = '<';
        j++;
        while (j < str.length && str[j] !== '>') block += str[j++];
        if (str[j] === '>') block += '>';
        j++;
      } else if (ch === '[' || ch === '{') {
        const open = ch;
        const close = ch === '[' ? ']' : '}';
        block = open;
        j++;
        while (j < str.length && str[j] !== close) block += str[j++];
        if (str[j] === close) block += close;
        j++;
      }

      const ph = createPlaceholder(counter++);
      map[ph] = block;
      out += ph;
      i = j;
      continue;
    }

    out += ch;
    i++;
  }

  return { text: out, map };
}

function restoreRPGMCodes(str, map) {
  if (!str || !map) return str;
  let out = str;

  for (const ph of Object.keys(map)) {
    if (!out.includes(ph)) {
      console.warn(`⚠️ Warning: placeholder missing after translation: ${ph}`);
    }
    
    out = out.split(ph).join(map[ph]);
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

function isValidDialogText(s) {
  if (typeof s !== "string") return false;
  const t = s.trim();
  if (t.length < 2) return false;

  if (!/[A-Za-zÀ-ỹ一-龯ぁ-んァ-ン]/.test(t)) return false;

  const tagRatio = (t.match(/<[^>]+>/g) || []).join("").length / t.length;
  if (tagRatio > 0.40) return false;

  return true;
}

function extractDialogsFromJson(jsonObj, fileIndex = 0, fileName = "") {
  let dialogs = [];

  const lowerName = (fileName || "").toLowerCase();

  if (
    lowerName === "system.json" ||
    (jsonObj && jsonObj.terms && jsonObj.terms.messages)
  ) {
    dialogs = dialogs.concat(
      extractDialogsFromSystem(jsonObj, fileIndex, fileName)
    );
  }

  if (lowerName === "items.json") {
    dialogs = dialogs.concat(
      extractDialogsFromItems(jsonObj, fileIndex, fileName)
    );
  }

  if (lowerName === "weapons.json") {
    dialogs = dialogs.concat(
      extractDialogsFromWeapons(jsonObj, fileIndex, fileName)
    );
  }

  if (lowerName === "armors.json") {
    dialogs = dialogs.concat(
      extractDialogsFromArmors(jsonObj, fileIndex, fileName)
    );
  }

  if (lowerName === "skills.json") {
    dialogs = dialogs.concat(
      extractDialogsFromSkills(jsonObj, fileIndex, fileName)
    );
  }

  if (lowerName === "states.json") {
    dialogs = dialogs.concat(
      extractDialogsFromStates(jsonObj, fileIndex, fileName)
    );
  }

  if (lowerName === "enemies.json") {
    dialogs = dialogs.concat(
      extractDialogsFromEnemies(jsonObj, fileIndex, fileName)
    );
  }

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
        arr.forEach((t, i) => {
          if (isValidDialogText(t)) {
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
      } else if (COMMAND_LINE.includes(code)) {
        const t = node.parameters[0];
        if (isValidDialogText(t)) {
          dialogs.push({
            fileIndex,
            fileName,
            ref: node.parameters,
            index: 0,
            text: t,
            code
          });
        }
      } else if (COMMAND_COMMENT.includes(code)) {
        const t = node.parameters[0];
        if (isValidDialogText(t)) {
          dialogs.push({
            fileIndex,
            fileName,
            ref: node.parameters,
            index: 0,
            text: t,
            code
          });
        }
      } else if (COMMAND_CHOICE.includes(code)) {
        const arr = node.parameters[0] || [];
        arr.forEach((t, i) => {
          if (isValidDialogText(t)) {
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
      } else if (COMMAND_BRANCH.includes(code)) {
        const t = node.parameters[1];
        if (isValidDialogText(t)) {
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

function extractDialogsFromSystem(sys, fileIndex = 0, fileName = "") {
  const dialogs = [];

  function pushArray(arr, codeLabel) {
    if (!Array.isArray(arr)) return;
    arr.forEach((t, i) => {
      if (isValidDialogText(t)) {
        dialogs.push({
          fileIndex,
          fileName,
          ref: arr,
          index: i,
          text: t,
          code: codeLabel
        });
      }
    });
  }

  if (typeof sys.gameTitle === "string" && sys.gameTitle.trim() !== "") {
    dialogs.push({
      fileIndex,
      fileName,
      ref: sys,
      index: "gameTitle",
      text: sys.gameTitle,
      code: "SYS_TITLE"
    });
  }

  if (typeof sys.currencyUnit === "string" && sys.currencyUnit.trim() !== "") {
    dialogs.push({
      fileIndex,
      fileName,
      ref: sys,
      index: "currencyUnit",
      text: sys.currencyUnit,
      code: "SYS_CURRENCY"
    });
  }

  const terms = sys.terms || {};

  pushArray(terms.basic, "SYS_BASIC");
  pushArray(terms.commands, "SYS_COMMANDS");
  pushArray(terms.params, "SYS_PARAMS");

  const msgs = terms.messages || {};
  Object.keys(msgs).forEach((key) => {
    const t = msgs[key];
    if (isValidDialogText(t)) {
      dialogs.push({
        fileIndex,
        fileName,
        ref: msgs,
        index: key,
        text: t,
        code: "SYS_MSG"
      });
    }
  });

  pushArray(sys.elements, "SYS_ELEMENTS");
  pushArray(sys.equipTypes, "SYS_EQUIP_TYPES");
  pushArray(sys.skillTypes, "SYS_SKILL_TYPES");
  pushArray(sys.armorTypes, "SYS_ARMOR_TYPES");
  pushArray(sys.weaponTypes, "SYS_WEAPON_TYPES");

  return dialogs;
}

function extractDialogsFromItems(items, fileIndex = 0, fileName = "") {
  const dialogs = [];
  if (!Array.isArray(items)) return dialogs;

  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (!it || typeof it !== "object") continue;

    if (typeof it.name === "string" && it.name.trim() !== "") {
      dialogs.push({
        fileIndex,
        fileName,
        ref: it,
        index: "name",
        text: it.name,
        code: "ITEM_NAME"
      });
    }

    if (typeof it.description === "string" && it.description.trim() !== "") {
      dialogs.push({
        fileIndex,
        fileName,
        ref: it,
        index: "description",
        text: it.description,
        code: "ITEM_DESC"
      });
    }
  }

  return dialogs;
}

function extractDialogsFromWeapons(weapons, fileIndex = 0, fileName = "") {
  const dialogs = [];
  if (!Array.isArray(weapons)) return dialogs;

  for (let i = 0; i < weapons.length; i++) {
    const w = weapons[i];
    if (!w || typeof w !== "object") continue;

    if (typeof w.name === "string" && w.name.trim() !== "") {
      dialogs.push({
        fileIndex,
        fileName,
        ref: w,
        index: "name",
        text: w.name,
        code: "WEAPON_NAME"
      });
    }

    if (typeof w.description === "string" && w.description.trim() !== "") {
      dialogs.push({
        fileIndex,
        fileName,
        ref: w,
        index: "description",
        text: w.description,
        code: "WEAPON_DESC"
      });
    }
  }

  return dialogs;
}

function extractDialogsFromArmors(armors, fileIndex = 0, fileName = "") {
  const dialogs = [];
  if (!Array.isArray(armors)) return dialogs;

  for (let i = 0; i < armors.length; i++) {
    const a = armors[i];
    if (!a || typeof a !== "object") continue;

    if (typeof a.name === "string" && a.name.trim() !== "") {
      dialogs.push({
        fileIndex,
        fileName,
        ref: a,
        index: "name",
        text: a.name,
        code: "ARMOR_NAME"
      });
    }

    if (typeof a.description === "string" && a.description.trim() !== "") {
      dialogs.push({
        fileIndex,
        fileName,
        ref: a,
        index: "description",
        text: a.description,
        code: "ARMOR_DESC"
      });
    }
  }

  return dialogs;
}

function extractDialogsFromSkills(skills, fileIndex = 0, fileName = "") {
  const dialogs = [];
  if (!Array.isArray(skills)) return dialogs;

  for (let i = 0; i < skills.length; i++) {
    const s = skills[i];
    if (!s || typeof s !== "object") continue;

    if (typeof s.name === "string" && s.name.trim() !== "") {
      dialogs.push({
        fileIndex,
        fileName,
        ref: s,
        index: "name",
        text: s.name,
        code: "SKILL_NAME"
      });
    }

    if (typeof s.description === "string" && s.description.trim() !== "") {
      dialogs.push({
        fileIndex,
        fileName,
        ref: s,
        index: "description",
        text: s.description,
        code: "SKILL_DESC"
      });
    }
  }

  return dialogs;
}

function extractDialogsFromStates(states, fileIndex = 0, fileName = "") {
  const dialogs = [];
  if (!Array.isArray(states)) return dialogs;

  for (let i = 0; i < states.length; i++) {
    const st = states[i];
    if (!st || typeof st !== "object") continue;

    if (typeof st.name === "string" && st.name.trim() !== "") {
      dialogs.push({
        fileIndex,
        fileName,
        ref: st,
        index: "name",
        text: st.name,
        code: "STATE_NAME"
      });
    }

    if (typeof st.description === "string" && st.description.trim() !== "") {
      dialogs.push({
        fileIndex,
        fileName,
        ref: st,
        index: "description",
        text: st.description,
        code: "STATE_DESC"
      });
    }
  }

  return dialogs;
}

function extractDialogsFromEnemies(enemies, fileIndex = 0, fileName = "") {
  const dialogs = [];
  if (!Array.isArray(enemies)) return dialogs;

  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    if (!e || typeof e !== "object") continue;

    if (typeof e.name === "string" && e.name.trim() !== "") {
      dialogs.push({
        fileIndex,
        fileName,
        ref: e,
        index: "name",
        text: e.name,
        code: "ENEMY_NAME"
      });
    }
  }

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
  const c = String(code || "").toLowerCase().trim();

  switch(c){
    case "en": return "English";
    case "zh-cn":
    case "zh": return "Chinese (Simplified)";
    case "hi": return "Hindi";
    case "es": return "Spanish";
    case "fr": return "French";
    case "ar": return "Arabic";
    case "pt": return "Portuguese";
    case "ru": return "Russian";
    case "de": return "German";
    case "ja": return "Japanese";
    case "id": return "Indonesian";
    case "ms": return "Malay";
    case "vi": return "Vietnamese";
    case "tl":
    case "fil": return "Filipino";
    case "ko": return "Korean";

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
  const outLines = content
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l !== "")
    .map(l => l.replace(/^(?:\d+[\).\-\:]\s*|\-\s+|\*\s+)/, ""));

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
  const outLines = content
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l !== "")
    .map(l => l.replace(/^(?:\d+[\).\-\:]\s*|\-\s+|\*\s+)/, ""));
  
  if (outLines.length !== lines.length) {
    log(`⚠️ ChatGPT returned ${outLines.length} lines, expected ${lines.length}.`, "warn");
  }

  return outLines;
}

/* ------------------------------------------------------------
   Translator: Lingva (Free)
------------------------------------------------------------ */
const LINGVA_HOSTS = [
  "https://lingva.dialectapp.org",
  "https://lingva.ml",
  "https://translate.plausibility.cloud",
  "https://lingva.vercel.app",
  "https://lingva.garudalinux.org",
  "https://lingva.lunar.icu"
];

function normalizeLingvaTargetCode(code) {
  const c = String(code || "").trim().toLowerCase();

  if (c === "zh" || c === "zh-cn" || c === "zh_cn") return "zh-CN";

  if (c === "fil") return "tl";

  return c;
}

async function lingvaRequest(text, target) {
  const t = normalizeLingvaTargetCode(target);

  for (const host of LINGVA_HOSTS) {
    try {
      const res = await fetch(
        host + "/api/v1/auto/" + encodeURIComponent(t) + "/" + encodeURIComponent(text)
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
    if (!d.translated) continue;

    const restored = restoreRPGMCodes(d.translated, d.phMap);

    if (Array.isArray(d.ref)) {
      d.ref[d.index] = restored;
    } else if (d.ref && typeof d.ref === "object") {
      d.ref[d.index] = restored;
    }
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

      if (Array.isArray(dlg.ref)) {
        dlg.ref[dlg.index] = restored;
      } else if (dlg.ref && typeof dlg.ref === "object") {
        dlg.ref[dlg.index] = restored;
      }
    
      log(`✅ [${dlg.fileName}] ${restored}`, "success");
    
      state.currentIndex++;
      updateProgress();
    
      el.downloadResultBtn.disabled = false;
      el.previewResultBtn.disabled = false;
    
      await new Promise(r => requestAnimationFrame(r));
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
function buildPathForDialog(d) {

  const file = d.fileName || "Unknown.json";

  return [
    file,
    "events",
    String(d.eventId || 0),
    "list",
    String(d.listIndex || 0),
    "parameters",
    String(d.index)
  ];
}

el.previewResultBtn.addEventListener("click", () => {
  if (!state.dialogs.length) {
    alert("⚠️ No translated data.");
    return;
  }

  const texts = state.dialogs.map((d, idx) => ({
    text: d.text,
    path: [idx],
    fieldName: "text",
    index: idx
  }));

  const translated = state.dialogs.map(d => d.translated || d.text);

  const data = {
    texts,
    translated,
    model: el.translationModel.value,
    targetLanguage: el.targetLanguage.value
  };

  try {
    localStorage.setItem("translationPreviewData", JSON.stringify(data));
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