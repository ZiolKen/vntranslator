import { RENPY, TRANSLATOR_CREDIT, unmaskTagsInText } from "./renpy.js";
import { LANGS } from "./lang.js";
import { translateBatchDeepSeek, translateBatchDeepL, translateBatchLingva, postValidateTranslations, validatePlaceholders } from "./translate.js";
import { VirtualTable } from "./virtualTable.js";
import { qs, el, debounce, detectEol, downloadTextFile, toast, modal, formatPct, shorten, stableId } from "./utils.js";
import { idbGet, idbSet, idbDel } from "./storage.js";

const APP_KEY = "vntranslator.project.v1";
const SETTINGS_KEY = "vntranslator.settings.v1";

const state = {
  files: [],
  activeFileId: null,
  selection: new Set(),
  anchorIndex: null,
  filtered: [],
  selectedIndex: -1,
  tm: new Map(),
  busy: false,
  settings: {
    engine: "deepseek",
    targetLang: "vi",
    sourceLang: "auto",
    mode: "safe",
    includeCredit: true,
    writeToManual: false,
    batchSize: 16,
    maxChars: 6000,
    delayMs: 350,
    deepseekKey: "",
    deepseekModel: "deepseek-chat",
    temperature: 0.3,
    deeplKey: "",
    deeplFormality: "default",
    glossary: "",
    styleGuide: "",
    characterNotes: "",
    autoSave: true,
  },
  logs: [],
};

const ui = {
  fileInput: qs("#fileInput"),
  fileInputTranslated: qs("#fileInputTranslated"),
  fileList: qs("#fileList"),
  statTotal: qs("#statTotal"),
  statDone: qs("#statDone"),
  statPct: qs("#statPct"),
  searchBox: qs("#searchBox"),
  onlyUntranslated: qs("#onlyUntranslated"),
  onlyWarnings: qs("#onlyWarnings"),
  caseSensitive: qs("#caseSensitive"),
  modeSelect: qs("#modeSelect"),
  engineSelect: qs("#engineSelect"),
  targetLang: qs("#targetLang"),
  tableBody: qs("#tableBody"),
  logBody: qs("#logBody"),
  editorTitle: qs("#editorTitle"),
  editorOriginal: qs("#editorOriginal"),
  editorMt: qs("#editorMt"),
  editorManual: qs("#editorManual"),
  validationHint: qs("#validationHint"),
};

function log(msg, level = "info") {
  const line = { id: stableId(), ts: Date.now(), level, msg: String(msg || "") };
  state.logs.push(line);
  if (state.logs.length > 800) state.logs.splice(0, state.logs.length - 800);
  renderLogs();
}

function renderLogs() {
  ui.logBody.replaceChildren(
    ...state.logs.slice(-400).map(l => el("div", { class: "logline " + l.level }, l.msg))
  );
  ui.logBody.scrollTop = ui.logBody.scrollHeight;
}

function setBusy(v) {
  state.busy = !!v;
  for (const id of ["btnTranslate", "btnTranslateSelected", "btnExport", "btnOpen", "btnOpenFolder", "btnImportTranslated"]) {
    const b = qs("#" + id);
    if (b) b.disabled = state.busy;
  }
}

function activeFile() {
  return state.files.find(f => f.id === state.activeFileId) || null;
}

function dialogAt(index) {
  const f = activeFile();
  if (!f) return null;
  const d = state.filtered[index];
  if (!d) return null;
  return d;
}

function dialogDisplay(dialog, field) {
  const d = dialog;
  if (!d) return "";
  if (field === "original") return d.quote || "";
  if (field === "mt") {
    const m = d.mtMasked;
    return m ? unmaskTagsInText(m, d.placeholderMap) : "";
  }
  if (field === "manual") {
    const m = d.manualMasked;
    return m ? unmaskTagsInText(m, d.placeholderMap) : "";
  }
  return "";
}

function isManualDone(d) {
  return !!(d?.manualMasked && String(d.manualMasked).trim().length);
}

function hasWarning(d) {
  if (!d) return false;
  const manual = d.manualMasked;
  if (manual && !validatePlaceholders(d.maskedQuote, manual)) return true;
  return false;
}

function rebuildTM() {
  state.tm.clear();
  for (const f of state.files) {
    for (const d of f.dialogs) {
      if (d.manualMasked && String(d.manualMasked).trim()) state.tm.set(d.cacheKey, d.manualMasked);
    }
  }
}

function applyTM(file) {
  if (!file) return;
  for (const d of file.dialogs) {
    const hit = state.tm.get(d.cacheKey);
    if (hit && !d.manualMasked) d.manualMasked = hit;
  }
}

function fileStats(file) {
  const total = file.dialogs.length;
  const done = file.dialogs.reduce((acc, d) => acc + (isManualDone(d) ? 1 : 0), 0);
  const pct = total ? done / total : 0;
  return { total, done, pct };
}

function renderFileList() {
  const frag = document.createDocumentFragment();
  for (const f of state.files) {
    const st = fileStats(f);
    const item = el("div", { class: "fileitem" + (f.id === state.activeFileId ? " active" : ""), role: "option", tabindex: "0" },
      el("div", { class: "fileitem-top" },
        el("div", { class: "fileitem-name", title: f.name }, f.name),
        el("span", { class: "pill" }, formatPct(st.pct))
      ),
      el("div", { class: "fileitem-meta" },
        el("span", { class: "pill" }, st.done + "/" + st.total),
        f.path ? el("span", { class: "pill", title: f.path }, "folder") : el("span", { class: "pill" }, "file")
      ),
      el("div", { class: "progress" }, el("i", { style: "width:" + Math.round(st.pct * 100) + "%"}))
    );
    item.addEventListener("click", () => activateFile(f.id));
    item.addEventListener("keydown", (e) => { if (e.key === "Enter") activateFile(f.id); });
    frag.appendChild(item);
  }
  ui.fileList.replaceChildren(frag);
  renderSidebarStats();
}

function renderSidebarStats() {
  const f = activeFile();
  if (!f) {
    ui.statTotal.textContent = "0";
    ui.statDone.textContent = "0";
    ui.statPct.textContent = "0%";
    return;
  }
  const st = fileStats(f);
  ui.statTotal.textContent = String(st.total);
  ui.statDone.textContent = String(st.done);
  ui.statPct.textContent = formatPct(st.pct);
}

function normalizeQuery(s) {
  const t = String(s || "").trim();
  return ui.caseSensitive.checked ? t : t.toLowerCase();
}

function matchesQuery(d, q) {
  if (!q) return true;
  const a = dialogDisplay(d, "original");
  const b = dialogDisplay(d, "manual") || dialogDisplay(d, "mt");
  const A = ui.caseSensitive.checked ? a : a.toLowerCase();
  const B = ui.caseSensitive.checked ? b : b.toLowerCase();
  return A.includes(q) || B.includes(q);
}

function rebuildFiltered() {
  const f = activeFile();
  if (!f) {
    state.filtered = [];
    state.selection.clear();
    state.anchorIndex = null;
    state.selectedIndex = -1;
    table.setItems([]);
    renderEditor(null);
    return;
  }

  const q = normalizeQuery(ui.searchBox.value);
  const onlyU = ui.onlyUntranslated.checked;
  const onlyW = ui.onlyWarnings.checked;

  const out = [];
  for (const d of f.dialogs) {
    if (onlyU && isManualDone(d)) continue;
    if (onlyW && !hasWarning(d)) continue;
    if (!matchesQuery(d, q)) continue;
    out.push(d);
  }

  state.filtered = out;
  state.selection.clear();
  state.anchorIndex = null;
  state.selectedIndex = -1;

  table.setItems(out);
  renderSidebarStats();
  renderEditor(null);
}

function setSelectedIndex(i) {
  const idx = Math.max(-1, Math.min(state.filtered.length - 1, i));
  state.selectedIndex = idx;
  if (idx >= 0) table.scrollToIndex(idx);
  renderEditor(dialogAt(idx));
  table.onScroll();
}

function toggleSelection(index, multi, range) {
  if (index < 0 || index >= state.filtered.length) return;
  if (!multi && !range) {
    state.selection.clear();
    state.selection.add(index);
    state.anchorIndex = index;
    setSelectedIndex(index);
    return;
  }

  if (range) {
    const a = state.anchorIndex ?? index;
    const [lo, hi] = a < index ? [a, index] : [index, a];
    state.selection.clear();
    for (let i = lo; i <= hi; i++) state.selection.add(i);
    setSelectedIndex(index);
    return;
  }

  if (state.selection.has(index)) state.selection.delete(index);
  else state.selection.add(index);

  state.anchorIndex = index;
  setSelectedIndex(index);
}

function renderEditor(d) {
  if (!d) {
    ui.editorTitle.textContent = "No selection";
    ui.editorOriginal.value = "";
    ui.editorMt.value = "";
    ui.editorManual.value = "";
    ui.validationHint.textContent = "";
    return;
  }
  const idx = state.selectedIndex >= 0 ? state.selectedIndex : 0;
  ui.editorTitle.textContent = `Line ${idx + 1} / ${state.filtered.length}`;
  ui.editorOriginal.value = dialogDisplay(d, "original");
  ui.editorMt.value = dialogDisplay(d, "mt");
  ui.editorManual.value = String(d.manualMasked ?? "");
  ui.validationHint.textContent = validateManualHint(d);
}

function validateManualHint(d) {
  const t = String(d.manualMasked || "").trim();
  if (!t) return "";
  if (!validatePlaceholders(d.maskedQuote, t)) return "Warning: placeholder tokens changed/missing. Use Insert Tags to restore.";
  return "";
}

function saveManualFromEditor() {
  const d = dialogAt(state.selectedIndex);
  if (!d) return;
  const v = String(ui.editorManual.value || "");
  d.manualMasked = v ? v : null;
  ui.validationHint.textContent = validateManualHint(d);
  if (d.manualMasked && String(d.manualMasked).trim()) state.tm.set(d.cacheKey, d.manualMasked);
  renderSidebarStats();
  table.onScroll();
  scheduleSave();
}

function clearManual() {
  const d = dialogAt(state.selectedIndex);
  if (!d) return;
  d.manualMasked = null;
  ui.editorManual.value = "";
  ui.validationHint.textContent = "";
  renderSidebarStats();
  table.onScroll();
  scheduleSave();
}

function copyMtToManual() {
  const d = dialogAt(state.selectedIndex);
  if (!d) return;
  if (!d.mtMasked) return toast("Nothing to copy", "Machine Translation is empty.");
  d.manualMasked = d.mtMasked;
  ui.editorManual.value = String(d.manualMasked);
  ui.validationHint.textContent = validateManualHint(d);
  state.tm.set(d.cacheKey, d.manualMasked);
  renderSidebarStats();
  table.onScroll();
  scheduleSave();
}

function extractTagsFromMap(map) {
  const out = [];
  for (const [k, v] of Object.entries(map || {})) out.push({ id: k, token: `⟦RENPH{${k}}⟧`, tag: v });
  return out.sort((a, b) => Number(a.id) - Number(b.id));
}

function showInsertTags() {
  const d = dialogAt(state.selectedIndex);
  if (!d) return;
  const tags = extractTagsFromMap(d.placeholderMap);
  if (!tags.length) return toast("No tags", "This line has no tags/variables to insert.");

  const input = ui.editorManual;
  const list = el("div", { class: "full" },
    ...tags.map(t => el("button", { class: "btn", style: "width:100%; text-align:left; margin-bottom:8px", onclick: () => {
      const start = input.selectionStart ?? input.value.length;
      const end = input.selectionEnd ?? input.value.length;
      const before = input.value.slice(0, start);
      const after = input.value.slice(end);
      input.value = before + t.token + after;
      const pos = start + t.token.length;
      input.setSelectionRange(pos, pos);
      input.focus();
      ui.validationHint.textContent = validateManualHint(d);
    }}, `${t.token}   ${t.tag}`))
  );

  modal({
    title: "Insert protected tags",
    body: [
      el("div", { class: "full", style: "color:var(--muted); font-size:12px; margin-bottom:8px" },
        "These are tags/variables found in the original string. Insert their placeholder token into your manual translation."
      ),
      list
    ],
    actions: [ el("button", { class: "btn primary", onclick: (e) => e.target.closest(".modal-overlay")?.remove() }, "Close") ]
  });
}

async function readFileText(file, encoding = "utf-8") {
  const buf = await file.arrayBuffer();
  const dec = new TextDecoder(encoding, { fatal: false });
  return dec.decode(buf);
}

async function addFiles(fileList, opts = {}) {
  const enc = opts.encoding || "utf-8";
  const mode = state.settings.mode || "safe";
  RENPY.setMode(mode);

  const added = [];
  for (const file of fileList) {
    const name = file.name || "script.rpy";
    const source = await readFileText(file, enc);
    const eol = detectEol(source);
    const dialogs = RENPY.extractDialogs(source);

    const obj = {
      id: stableId(),
      name,
      path: opts.path || null,
      source,
      eol,
      dialogs,
      createdAt: Date.now(),
    };
    applyTM(obj);
    added.push(obj);
  }

  if (!added.length) return;
  state.files.push(...added);
  if (!state.activeFileId) state.activeFileId = state.files[0].id;

  renderFileList();
  activateFile(state.activeFileId);

  log(`Loaded ${added.length} file(s).`, "info");
  scheduleSave();
}

async function activateFile(id) {
  state.activeFileId = id;
  renderFileList();
  rebuildFiltered();
  if (state.filtered.length) setSelectedIndex(0);
}

function closeActiveFile() {
  const f = activeFile();
  if (!f) return;
  const idx = state.files.findIndex(x => x.id === f.id);
  if (idx >= 0) state.files.splice(idx, 1);
  state.activeFileId = state.files[0]?.id || null;
  rebuildTM();
  renderFileList();
  activateFile(state.activeFileId);
  scheduleSave();
}

async function importTranslatedFiles(fileList, opts = {}) {
  const enc = opts.encoding || "utf-8";
  const imports = [];
  for (const file of fileList) {
    const text = await readFileText(file, enc);
    RENPY.setMode(state.settings.mode || "safe");
    const dialogs = RENPY.extractDialogs(text);
    imports.push({ name: file.name, dialogs });
  }

  if (!imports.length) return;

  let applied = 0;
  let skipped = 0;

  for (const imp of imports) {
    const target = state.files.find(f => f.name === imp.name) || state.files.find(f => f.name.split("/").pop() === imp.name.split("/").pop());
    if (!target) { skipped++; continue; }

    const n = Math.min(target.dialogs.length, imp.dialogs.length);
    for (let i = 0; i < n; i++) {
      const src = target.dialogs[i];
      const tr = imp.dialogs[i];
      const masked = tr.maskedQuote;
      if (!masked) continue;
      if (!validatePlaceholders(src.maskedQuote, masked)) continue;
      src.manualMasked = masked;
      applied++;
      state.tm.set(src.cacheKey, masked);
    }
  }

  rebuildTM();
  rebuildFiltered();
  renderFileList();
  toast("Import complete", `Applied ${applied} line(s). Skipped ${skipped} file(s).`);
  log(`Imported translations: applied=${applied}, skippedFiles=${skipped}`, "info");
  scheduleSave();
}

function buildTargetLangSelect() {
  ui.targetLang.replaceChildren(...LANGS.map(l => el("option", { value: l.code }, `${l.label} (${l.code})`)));
}

function setSettingsFromUI() {
  state.settings.mode = ui.modeSelect.value;
  state.settings.engine = ui.engineSelect.value;
  state.settings.targetLang = ui.targetLang.value;
}

function syncUIFromSettings() {
  ui.modeSelect.value = state.settings.mode;
  ui.engineSelect.value = state.settings.engine;
  ui.targetLang.value = state.settings.targetLang;
}

function openSettingsModal() {
  const s = state.settings;

  const deepseekKey = el("input", { type: "password", value: s.deepseekKey, placeholder: "DeepSeek API key" });
  const deepseekModel = el("input", { type: "text", value: s.deepseekModel, placeholder: "deepseek-chat" });
  const temperature = el("input", { type: "number", value: String(s.temperature), min: "0", max: "1", step: "0.05" });

  const deeplKey = el("input", { type: "password", value: s.deeplKey, placeholder: "DeepL API key" });
  const deeplFormality = el("select", null,
    el("option", { value: "default" }, "Default"),
    el("option", { value: "more" }, "More formal"),
    el("option", { value: "less" }, "Less formal"),
  );
  deeplFormality.value = s.deeplFormality;

  const sourceLang = el("input", { type: "text", value: s.sourceLang, placeholder: "auto" });

  const batchSize = el("input", { type: "number", value: String(s.batchSize), min: "1", max: "80", step: "1" });
  const maxChars = el("input", { type: "number", value: String(s.maxChars), min: "500", max: "20000", step: "100" });
  const delayMs = el("input", { type: "number", value: String(s.delayMs), min: "0", max: "5000", step: "50" });

  const includeCredit = el("input", { type: "checkbox" });
  includeCredit.checked = !!s.includeCredit;

  const writeToManual = el("input", { type: "checkbox" });
  writeToManual.checked = !!s.writeToManual;

  const autoSave = el("input", { type: "checkbox" });
  autoSave.checked = !!s.autoSave;

  const glossary = el("textarea", { class: "full", style: "min-height:120px" }, s.glossary || "");
  const styleGuide = el("textarea", { class: "full", style: "min-height:120px" }, s.styleGuide || "");
  const characterNotes = el("textarea", { class: "full", style: "min-height:120px" }, s.characterNotes || "");

  const body = [
    el("div", null,
      el("div", { class: "label" }, "DeepSeek Key"),
      deepseekKey,
      el("div", { class: "label", style: "margin-top:10px" }, "DeepSeek Model"),
      deepseekModel,
      el("div", { class: "label", style: "margin-top:10px" }, "Temperature"),
      temperature
    ),
    el("div", null,
      el("div", { class: "label" }, "DeepL Key"),
      deeplKey,
      el("div", { class: "label", style: "margin-top:10px" }, "DeepL Formality"),
      deeplFormality,
      el("div", { class: "label", style: "margin-top:10px" }, "Lingva Source"),
      sourceLang
    ),
    el("div", null,
      el("div", { class: "label" }, "Batch Size"),
      batchSize,
      el("div", { class: "label", style: "margin-top:10px" }, "Max chars/request"),
      maxChars,
      el("div", { class: "label", style: "margin-top:10px" }, "Delay between batches (ms)"),
      delayMs
    ),
    el("div", null,
      el("div", { class: "toggle" }, includeCredit, el("label", null, "Append translator credit")),
      el("div", { class: "toggle", style: "margin-top:10px" }, writeToManual, el("label", null, "Write MT directly to Manual")),
      el("div", { class: "toggle", style: "margin-top:10px" }, autoSave, el("label", null, "Auto-save project locally"))
    ),
    el("div", { class: "full" },
      el("div", { class: "label" }, "Style guide"),
      styleGuide,
    ),
    el("div", { class: "full" },
      el("div", { class: "label" }, "Glossary"),
      glossary,
    ),
    el("div", { class: "full" },
      el("div", { class: "label" }, "Character voice notes"),
      characterNotes,
    )
  ];

  modal({
    title: "Settings",
    body,
    actions: [
      el("button", { class: "btn ghost", onclick: async () => {
        await resetProject();
        toast("Reset", "Local project cleared.");
        qs(".modal-overlay")?.remove();
      } }, "Reset Project"),
      el("button", { class: "btn", onclick: async () => {
        await saveProjectNow();
        toast("Saved", "Project saved locally.");
        qs(".modal-overlay")?.remove();
      } }, "Save Now"),
      el("button", { class: "btn primary", onclick: async () => {
        state.settings.deepseekKey = deepseekKey.value.trim();
        state.settings.deepseekModel = deepseekModel.value.trim() || "deepseek-chat";
        state.settings.temperature = Number(temperature.value || 0.3);
        state.settings.deeplKey = deeplKey.value.trim();
        state.settings.deeplFormality = deeplFormality.value;
        state.settings.sourceLang = sourceLang.value.trim() || "auto";
        state.settings.batchSize = Math.max(1, Math.min(80, Number(batchSize.value || 16)));
        state.settings.maxChars = Math.max(500, Math.min(20000, Number(maxChars.value || 6000)));
        state.settings.delayMs = Math.max(0, Math.min(5000, Number(delayMs.value || 350)));
        state.settings.includeCredit = includeCredit.checked;
        state.settings.writeToManual = writeToManual.checked;
        state.settings.autoSave = autoSave.checked;
        state.settings.styleGuide = String(styleGuide.value || "");
        state.settings.glossary = String(glossary.value || "");
        state.settings.characterNotes = String(characterNotes.value || "");
        await persistSettings();
        RENPY.setMode(state.settings.mode || "safe");
        toast("Settings updated", "Applied.");
        qs(".modal-overlay")?.remove();
      }}, "Apply")
    ]
  });
}

async function translateDialogs(dialogs) {
  setBusy(true);
  const engine = state.settings.engine;
  const target = state.settings.targetLang;

  const total = dialogs.length;
  let done = 0;

  log(`Translate: ${engine} → ${target}, lines=${total}`, "info");

  const batchSize = Math.max(1, state.settings.batchSize | 0);
  const maxChars = Math.max(500, state.settings.maxChars | 0);
  const delayMs = Math.max(0, state.settings.delayMs | 0);

  const getKey = () => {
    if (engine === "deepseek") return state.settings.deepseekKey;
    if (engine === "deepl") return state.settings.deeplKey;
    return "";
  };

  const apiKey = getKey();
  if ((engine === "deepseek" || engine === "deepl") && !apiKey) {
    setBusy(false);
    toast("Missing API key", "Open Settings and set your API key.");
    log("Missing API key for selected engine.", "error");
    return;
  }

  const translateBatch = async (batch) => {
    if (engine === "deepseek") return translateBatchDeepSeek(batch, target, apiKey, state.settings);
    if (engine === "deepl") return translateBatchDeepL(batch, target, apiKey, state.settings);
    if (engine === "lingva") return translateBatchLingva(batch, target, state.settings);
    throw new Error("Unknown engine: " + engine);
  };

  try {
    let idx = 0;
    while (idx < dialogs.length) {
      const batch = [];
      let charCount = 0;
      while (idx < dialogs.length && batch.length < batchSize) {
        const d = dialogs[idx];
        const s = String(d.maskedQuote || "");
        if (charCount + s.length > maxChars && batch.length) break;
        batch.push(d);
        charCount += s.length;
        idx++;
      }

      const out = await translateBatch(batch);
      const warnings = postValidateTranslations(batch, out);

      for (let i = 0; i < batch.length; i++) {
        const d = batch[i];
        const t = String(out[i] ?? "");
        if (t) {
          d.mtMasked = t;
          if (state.settings.writeToManual) {
            d.manualMasked = t;
            state.tm.set(d.cacheKey, t);
          }
        }
      }

      done += batch.length;
      const pct = total ? done / total : 1;
      log(`Batch ${done}/${total} (${formatPct(pct)})`, "info");

      for (const w of warnings) {
        log(`Warning: line ${w.index + 1} in batch: ${w.message}`, "warn");
      }

      rebuildFiltered();
      if (state.selectedIndex >= 0) renderEditor(dialogAt(state.selectedIndex));
      renderFileList();
      scheduleSave();

      if (delayMs) await new Promise(r => setTimeout(r, delayMs));
    }

    toast("Translation complete", `${done} line(s) translated.`);
    log("Translation complete.", "info");
  } catch (e) {
    toast("Translation failed", String(e?.message || e));
    log("Translation failed: " + (e?.message || e), "error");
  } finally {
    setBusy(false);
  }
}

function collectTargets() {
  const f = activeFile();
  if (!f) return [];
  const indices = Array.from(state.selection.values()).sort((a, b) => a - b);
  if (indices.length) return indices.map(i => state.filtered[i]).filter(Boolean);

  const out = [];
  for (const d of f.dialogs) {
    if (!d.manualMasked || !String(d.manualMasked).trim()) out.push(d);
  }
  return out;
}

async function translateAction() {
  setSettingsFromUI();
  const f = activeFile();
  if (!f) return toast("No file", "Open a .rpy file first.");
  RENPY.setMode(state.settings.mode || "safe");
  const targets = collectTargets();
  if (!targets.length) return toast("Nothing to translate", "All lines already translated.");
  await translateDialogs(targets);
}

async function translateSelectedAction() {
  setSettingsFromUI();
  const targets = Array.from(state.selection.values()).sort((a, b) => a - b).map(i => state.filtered[i]).filter(Boolean);
  if (!targets.length) return toast("No selection", "Select one or more rows.");
  await translateDialogs(targets);
}

function exportCurrent() {
  const f = activeFile();
  if (!f) return toast("No file", "Open a .rpy file first.");
  const credit = state.settings.includeCredit ? TRANSLATOR_CREDIT : "";
  const out = RENPY.applyTranslations(f.source, f.dialogs, f.eol, credit);
  downloadTextFile(f.name, out);
  toast("Exported", f.name);
}

async function exportAll() {
  if (!state.files.length) return toast("No files", "Open files first.");
  const credit = state.settings.includeCredit ? TRANSLATOR_CREDIT : "";
  const supportsFS = "showDirectoryPicker" in window;

  if (supportsFS) {
    try {
      const dir = await window.showDirectoryPicker({ mode: "readwrite" });
      for (const f of state.files) {
        const out = RENPY.applyTranslations(f.source, f.dialogs, f.eol, credit);
        const handle = await dir.getFileHandle(f.name.split("/").pop(), { create: true });
        const writable = await handle.createWritable();
        await writable.write(out);
        await writable.close();
      }
      toast("Exported", "All files written to selected folder.");
      return;
    } catch (e) {
      log("Folder export failed: " + (e?.message || e), "warn");
    }
  }

  for (const f of state.files) {
    const out = RENPY.applyTranslations(f.source, f.dialogs, f.eol, credit);
    downloadTextFile(f.name, out);
  }
  toast("Exported", "Downloaded all files.");
}

async function openFolder() {
  if (!("showDirectoryPicker" in window)) {
    toast("Not supported", "Your browser does not support folder access. Use Open .rpy instead.");
    return;
  }

  try {
    const dir = await window.showDirectoryPicker({ mode: "read" });
    const files = [];
    async function walk(handle, path) {
      for await (const entry of handle.values()) {
        if (entry.kind === "directory") await walk(entry, path + entry.name + "/");
        else if (entry.kind === "file") {
          if (entry.name.toLowerCase().endsWith(".rpy")) {
            const f = await entry.getFile();
            f._vn_path = path + entry.name;
            files.push(f);
          }
        }
      }
    }
    await walk(dir, "");
    if (!files.length) return toast("No .rpy files", "Folder contains no .rpy files.");
    await addFiles(files, { path: "folder" });
    toast("Folder loaded", `${files.length} file(s).`);
  } catch (e) {
    log("Open folder cancelled or failed.", "warn");
  }
}

let saveTimer = null;

function scheduleSave() {
  if (!state.settings.autoSave) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveProjectNow, 450);
}

async function persistSettings() {
  await idbSet(SETTINGS_KEY, state.settings);
}

async function saveProjectNow() {
  const payload = {
    version: 1,
    savedAt: Date.now(),
    settings: state.settings,
    files: state.files.map(f => ({
      id: f.id,
      name: f.name,
      path: f.path,
      eol: f.eol,
      source: f.source,
      dialogs: f.dialogs.map(d => ({
        lineIndex: d.lineIndex,
        contentStart: d.contentStart,
        contentEnd: d.contentEnd,
        quoteChar: d.quoteChar,
        isTriple: d.isTriple,
        quote: d.quote,
        maskedQuote: d.maskedQuote,
        placeholderMap: d.placeholderMap,
        cacheKey: d.cacheKey,
        mtMasked: d.mtMasked,
        manualMasked: d.manualMasked,
      })),
    }))
  };
  await idbSet(APP_KEY, payload);
  await persistSettings();
}

async function resetProject() {
  state.files = [];
  state.activeFileId = null;
  state.selection.clear();
  state.anchorIndex = null;
  state.filtered = [];
  state.selectedIndex = -1;
  state.tm.clear();
  state.logs = [];
  renderLogs();
  renderFileList();
  rebuildFiltered();
  await idbDel(APP_KEY);
}

async function loadProject() {
  const saved = await idbGet(APP_KEY);
  const settings = await idbGet(SETTINGS_KEY);

  if (settings && typeof settings === "object") state.settings = { ...state.settings, ...settings };
  syncUIFromSettings();

  if (!saved || !saved.files) return;

  state.files = saved.files.map(f => ({
    id: f.id,
    name: f.name,
    path: f.path,
    source: f.source,
    eol: f.eol || detectEol(f.source || ""),
    dialogs: (f.dialogs || []).map(d => ({
      lineIndex: d.lineIndex,
      contentStart: d.contentStart,
      contentEnd: d.contentEnd,
      quoteChar: d.quoteChar,
      isTriple: d.isTriple,
      quote: d.quote,
      maskedQuote: d.maskedQuote,
      placeholderMap: d.placeholderMap || Object.create(null),
      cacheKey: d.cacheKey || d.maskedQuote || "",
      mtMasked: d.mtMasked ?? null,
      manualMasked: d.manualMasked ?? null,
    })),
  }));

  state.activeFileId = state.files[0]?.id || null;
  rebuildTM();
  renderFileList();
  activateFile(state.activeFileId);
  log("Restored project from local storage.", "info");
}

const table = new VirtualTable({
  container: ui.tableBody,
  rowHeight: 44,
  renderRow: (node, d, i) => {
    const idx = i + 1;
    const active = (i === state.selectedIndex);
    const selected = state.selection.has(i);
    node.className = "row" + (active ? " active" : "") + (selected ? " sel" : "");
    node.dataset.index = String(i);

    const original = shorten(dialogDisplay(d, "original"), 180);
    const manual = shorten(dialogDisplay(d, "manual") || "", 180);
    const badge = hasWarning(d) ? "warn" : (isManualDone(d) ? "good" : (d.mtMasked ? "warn" : ""));

    node.replaceChildren(
      el("div", { class: "cell idx" }, String(idx)),
      el("div", { class: "cell col", title: dialogDisplay(d, "original") }, original),
      el("div", { class: "cell col", title: dialogDisplay(d, "manual") }, manual || (d.mtMasked ? shorten(dialogDisplay(d, "mt"), 180) : "")),
      el("div", { class: "cell tiny" },
        badge ? el("div", { class: "badge " + badge, title: badge === "warn" ? "Check placeholders" : "OK" }, badge === "good" ? "✓" : "!") : ""
      )
    );

    node.onclick = (e) => {
      const idx = Number(node.dataset.index);
      const multi = e.ctrlKey || e.metaKey;
      const range = e.shiftKey;
      toggleSelection(idx, multi, range);
    };
  }
});

function bindEvents() {
  qs("#btnOpen").addEventListener("click", () => ui.fileInput.click());
  qs("#btnImportTranslated").addEventListener("click", () => ui.fileInputTranslated.click());
  qs("#btnOpenFolder").addEventListener("click", openFolder);

  ui.fileInput.addEventListener("change", async () => {
    const files = Array.from(ui.fileInput.files || []);
    ui.fileInput.value = "";
    if (!files.length) return;
    await addFiles(files);
  });

  ui.fileInputTranslated.addEventListener("change", async () => {
    const files = Array.from(ui.fileInputTranslated.files || []);
    ui.fileInputTranslated.value = "";
    if (!files.length) return;
    await importTranslatedFiles(files);
  });

  qs("#btnCloseFile").addEventListener("click", closeActiveFile);
  qs("#btnSettings").addEventListener("click", openSettingsModal);

  qs("#btnTranslate").addEventListener("click", translateAction);
  qs("#btnTranslateSelected").addEventListener("click", translateSelectedAction);

  qs("#btnCopyMt").addEventListener("click", copyMtToManual);
  qs("#btnUseMt").addEventListener("click", copyMtToManual);

  qs("#btnExport").addEventListener("click", () => {
    const f = activeFile();
    if (!f) return toast("No file", "Open a .rpy file first.");
    const actions = [
      el("button", { class: "btn", onclick: () => { exportCurrent(); qs(".modal-overlay")?.remove(); } }, "Export current file"),
      el("button", { class: "btn primary", onclick: () => { exportAll(); qs(".modal-overlay")?.remove(); } }, "Export all files"),
    ];
    modal({
      title: "Export",
      body: [
        el("div", { class: "full", style: "color:var(--muted); font-size:12px" },
          "Export replaces translated strings inline and preserves Ren'Py tags via protected placeholders. Manual translation takes priority over Machine Translation."
        )
      ],
      actions
    });
  });

  ui.searchBox.addEventListener("input", debounce(rebuildFiltered, 120));
  ui.onlyUntranslated.addEventListener("change", rebuildFiltered);
  ui.onlyWarnings.addEventListener("change", rebuildFiltered);
  ui.caseSensitive.addEventListener("change", rebuildFiltered);

  ui.modeSelect.addEventListener("change", () => { state.settings.mode = ui.modeSelect.value; persistSettings(); rebuildFiltered(); });
  ui.engineSelect.addEventListener("change", () => { state.settings.engine = ui.engineSelect.value; persistSettings(); });
  ui.targetLang.addEventListener("change", () => { state.settings.targetLang = ui.targetLang.value; persistSettings(); });

  qs("#btnPrev").addEventListener("click", () => setSelectedIndex(Math.max(0, state.selectedIndex - 1)));
  qs("#btnNext").addEventListener("click", () => setSelectedIndex(Math.min(state.filtered.length - 1, state.selectedIndex + 1)));

  qs("#btnSaveRow").addEventListener("click", saveManualFromEditor);
  qs("#btnClearRow").addEventListener("click", clearManual);
  qs("#btnInsertTags").addEventListener("click", showInsertTags);

  qs("#btnClearLogs").addEventListener("click", () => { state.logs = []; renderLogs(); });

  ui.editorManual.addEventListener("input", debounce(() => {
    const d = dialogAt(state.selectedIndex);
    if (!d) return;
    ui.validationHint.textContent = validateManualHint(d);
  }, 80));

  window.addEventListener("keydown", (e) => {
    if (e.target && (e.target.tagName === "TEXTAREA" || e.target.tagName === "INPUT")) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setSelectedIndex(Math.min(state.filtered.length - 1, state.selectedIndex + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSelectedIndex(Math.max(0, state.selectedIndex - 1)); }
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); exportCurrent(); }
    else if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); translateSelectedAction(); }
    else if (e.key === "F3") { ui.searchBox.focus(); }
  });
}

function init() {
  buildTargetLangSelect();
  bindEvents();
  loadProject().then(() => rebuildFiltered()).catch(() => {});
  log("Ready. Tip: Ctrl+Enter translate selection, Ctrl+S export current.", "info");
}

init();
