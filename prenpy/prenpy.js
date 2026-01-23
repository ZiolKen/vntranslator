import { RENPY, maskTagsInText, unmaskTagsInText, TRANSLATOR_CREDIT } from "./renpy-tools.js";
import { LANGS, translateBatch, postProcessTranslation } from "./engines.js";

const $ = (id) => document.getElementById(id);

const STORAGE_KEY = "rpyt_prod_v2";

const ROW_H = 92;
const OVERSCAN = 8;

const state = {
  version: 2,
  projectName: "Ren'Py Project",
  activeFileId: null,
  selectedRowId: null,
  files: [],
  settings: {
    engine: "deepseek",
    lang: "vi",
    apiKey: "",
    mode: "safe",
    batchSize: 24,
    concurrency: 2,
    retry: 4
  },
  job: null
};

function now() { return Date.now(); }

function saveState() {
  const snap = {
    version: state.version,
    projectName: state.projectName,
    activeFileId: state.activeFileId,
    selectedRowId: state.selectedRowId,
    files: state.files.map(f => ({
      id: f.id,
      name: f.name,
      updated: f.updated,
      source: f.source,
      rows: f.rows
    })),
    settings: { ...state.settings, apiKey: "" }
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(snap));
}

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;
  try {
    const s = JSON.parse(raw);
    if (!s || typeof s !== "object") return;
    if (s.version === 2) {
      state.projectName = s.projectName || state.projectName;
      state.activeFileId = s.activeFileId || null;
      state.selectedRowId = s.selectedRowId || null;
      state.files = Array.isArray(s.files) ? s.files : [];
      state.settings = { ...state.settings, ...(s.settings || {}) };
    }
  } catch {}
}

function resetAll() {
  localStorage.removeItem(STORAGE_KEY);
  location.reload();
}

function fileProgress(f) {
  const total = Math.max(1, f.rows.length);
  const done = f.rows.filter(r => r.flag === "done").length;
  return Math.round((done / total) * 100);
}

function activeFile() {
  return state.files.find(f => f.id === state.activeFileId) || null;
}

function selectedRow() {
  const f = activeFile();
  if (!f) return null;
  return f.rows.find(r => r.id === state.selectedRowId) || null;
}

function setJobUI(pct, text, running) {
  $("meterFill").style.width = `${Math.max(0, Math.min(100, pct))}%`;
  $("jobText").textContent = text;
  $("btnStop").disabled = !running;
  $("btnTranslate").disabled = running;
  $("jobScope").disabled = running;
}

function glyph(flag) {
  if (flag === "done") return "✓";
  if (flag === "review") return "!";
  return "·";
}

function escapeSnip(s) {
  const t = String(s || "");
  return t.length > 260 ? t.slice(0, 260) + "…" : t;
}

async function writeClipboard(text) {
  const s = String(text ?? "");
  try {
    await navigator.clipboard.writeText(s);
    setJobUI(0, "Copied.", false);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = s;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
    setJobUI(0, "Copied.", false);
  }
}

function renderFiles() {
  const wrap = $("fileList");
  wrap.innerHTML = "";
  state.files.forEach(f => {
    const row = document.createElement("div");
    row.className = "fileRow";
    row.dataset.active = String(f.id === state.activeFileId);
    const pct = fileProgress(f);
    row.innerHTML = `<div class="name"></div><div class="pct"></div>`;
    row.querySelector(".name").textContent = f.name;
    row.querySelector(".pct").textContent = `${pct}%`;
    row.addEventListener("click", () => {
      state.activeFileId = f.id;
      state.selectedRowId = f.rows[0]?.id || null;
      saveState();
      renderFiles();
      refreshGrid(true);
      syncEditor();
    });
    wrap.appendChild(row);
  });
  $("projectName").textContent = state.files.length ? state.projectName : "No project";
}

let gridCache = { rows: [], filtered: [], scrollTop: 0, start: 0, end: 0 };

function computeFilteredRows() {
  const f = activeFile();
  if (!f) return [];
  const q = $("q").value.trim().toLowerCase();
  if (!q) return f.rows.map((r, i) => ({ r, i }));
  return f.rows.map((r, i) => ({ r, i })).filter(x => {
    const r = x.r;
    const hay = [r.original, r.machine, r.manual].filter(Boolean).join("\n").toLowerCase();
    return hay.includes(q);
  });
}

function refreshGrid(resetScroll) {
  const grid = $("grid");
  if (resetScroll) grid.scrollTop = 0;

  gridCache.filtered = computeFilteredRows();
  const total = gridCache.filtered.length;

  $("gridSpacer").style.height = `${total * ROW_H}px`;

  renderVirtualRows();
}

function filteredIndexMap() {
  const m = new Map();
  for (let k = 0; k < gridCache.filtered.length; k++) m.set(gridCache.filtered[k].r.id, k);
  return m;
}

function scrollToFilteredIndex(k) {
  const grid = $("grid");
  grid.scrollTop = Math.max(0, k * ROW_H - ROW_H);
  renderVirtualRows();
}

function findNext(dir) {
  const q = $("q").value.trim();
  if (!q) return setJobUI(0, "Type something to find.", false);

  const f = activeFile();
  if (!f) return;

  const list = gridCache.filtered;
  if (!list.length) return setJobUI(0, "No rows.", false);

  const map = filteredIndexMap();
  const cur = state.selectedRowId ? (map.get(state.selectedRowId) ?? -1) : -1;

  const norm = (s) => String(s || "");
  const needle = q;
  const cmp = (text) => {
    const hay = norm(text);
    const cs = $("repCase")?.checked;
    return cs ? hay.includes(needle) : hay.toLowerCase().includes(needle.toLowerCase());
  };

  const step = dir > 0 ? 1 : -1;
  for (let t = 1; t <= list.length; t++) {
    let k = cur + step * t;
    if (k < 0) k += list.length;
    if (k >= list.length) k -= list.length;

    const r = list[k].r;
    if (cmp(r.original) || cmp(r.machine) || cmp(r.manual)) {
      state.selectedRowId = r.id;
      saveState();
      scrollToFilteredIndex(k);
      syncEditor();
      renderVirtualRows();
      return setJobUI(0, "Found.", false);
    }
  }
  setJobUI(0, "No match.", false);
}

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildReplaceRegex(find, { regex, caseSensitive, wholeWord }) {
  const src = regex ? find : escapeRegExp(find);
  const body = wholeWord ? `\\b${src}\\b` : src;
  const flags = caseSensitive ? "g" : "gi";
  return new RegExp(body, flags);
}

function safeRenpyReplace(text, re, withStr) {
  const masked = maskTagsInText(text);
  const before = masked.masked;
  const after = before.replace(re, withStr);
  const out = unmaskTagsInText(after, masked.map);
  return { out, changed: out !== String(text ?? "") };
}

function iterScopeRows(scope) {
  const includeDone = $("repIncludeDone").checked;
  const ok = (r) => includeDone ? true : r.flag !== "done";

  if (scope === "selected") {
    const r = selectedRow();
    return r && ok(r) ? [r] : [];
  }
  if (scope === "file") {
    const f = activeFile();
    return f ? f.rows.filter(ok) : [];
  }
  return state.files.flatMap(f => f.rows.filter(ok));
}

function replaceRun() {
  const find = $("repFind").value;
  if (!find) return setJobUI(0, "Find is empty.", false);

  const scope = $("repScope").value;
  const field = $("repField").value;
  const withStr = $("repWith").value;

  const re = buildReplaceRegex(find, {
    regex: $("repRegex").checked,
    caseSensitive: $("repCase").checked,
    wholeWord: $("repWhole").checked
  });

  const rows = iterScopeRows(scope);
  if (!rows.length) return setJobUI(0, "Nothing to replace.", false);

  const fields = field === "both" ? ["manual", "machine"] : [field];

  let changed = 0;
  for (const r of rows) {
    for (const k of fields) {
      const cur = r[k] || "";
      if (!cur) continue;
      const rr = safeRenpyReplace(cur, re, withStr);
      if (rr.changed) {
        r[k] = rr.out;
        changed++;
        if (r.flag === "done") r.flag = "review";
        else if (r.flag === "todo") r.flag = "review";
      }
    }
  }

  const f = activeFile();
  if (f) f.updated = Date.now();
  saveState();
  renderFiles();
  renderVirtualRows();
  syncEditor();
  setJobUI(0, `Replaced in ${changed} field(s).`, false);
}

function replaceCount() {
  const find = $("repFind").value;
  if (!find) return setJobUI(0, "Find is empty.", false);

  const re = buildReplaceRegex(find, {
    regex: $("repRegex").checked,
    caseSensitive: $("repCase").checked,
    wholeWord: $("repWhole").checked
  });

  const scope = $("repScope").value;
  const field = $("repField").value;
  const rows = iterScopeRows(scope);
  const fields = field === "both" ? ["manual", "machine"] : [field];

  let hits = 0;
  for (const r of rows) {
    for (const k of fields) {
      const cur = r[k] || "";
      if (!cur) continue;
      const masked = maskTagsInText(cur).masked;
      const ms = masked.match(re);
      if (ms) hits += ms.length;
    }
  }
  setJobUI(0, `Matches: ${hits}`, false);
}

function renderVirtualRows() {
  const grid = $("grid");
  const win = $("gridWindow");
  const total = gridCache.filtered.length;

  const scrollTop = grid.scrollTop;
  const viewH = grid.clientHeight || 1;

  let start = Math.floor(scrollTop / ROW_H) - OVERSCAN;
  let end = Math.ceil((scrollTop + viewH) / ROW_H) + OVERSCAN;

  start = Math.max(0, start);
  end = Math.min(total, end);

  if (start === gridCache.start && end === gridCache.end && Math.abs(scrollTop - gridCache.scrollTop) < 2) return;

  gridCache.start = start;
  gridCache.end = end;
  gridCache.scrollTop = scrollTop;

  win.style.transform = `translateY(${start * ROW_H}px)`;
  win.innerHTML = "";

  for (let k = start; k < end; k++) {
    const { r, i } = gridCache.filtered[k];
    const idx = i + 1;

    const row = document.createElement("div");
    row.className = "row";
    row.dataset.selected = String(r.id === state.selectedRowId);

    const snO = escapeSnip(r.original);
    const snM = escapeSnip(r.machine);
    const snT = escapeSnip(r.manual);

    row.innerHTML = `
      <div class="cell idx">${idx}</div>
      <div class="cell"><div class="snip"></div></div>
      <div class="cell"><div class="snip"></div></div>
      <div class="cell"><div class="snip"></div></div>
      <div class="cell idx"><button class="flagBtn" type="button"></button></div>
    `;

    const snips = row.querySelectorAll(".snip");
    snips[0].textContent = snO;
    snips[1].textContent = snM || "";
    snips[2].textContent = snT || "";

    const btn = row.querySelector(".flagBtn");
    btn.dataset.flag = r.flag;
    btn.textContent = glyph(r.flag);

    row.addEventListener("click", (e) => {
      if (e.target === btn) return;
      state.selectedRowId = r.id;
      saveState();
      renderVirtualRows();
      syncEditor();
    });

    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const next = r.flag === "todo" ? "review" : (r.flag === "review" ? "done" : "todo");
      r.flag = next;
      saveState();
      renderFiles();
      renderVirtualRows();
      syncEditor();
    });

    win.appendChild(row);
  }
}

function syncEditor() {
  const f = activeFile();
  const r = selectedRow();

  $("metaFile").textContent = f?.name || "—";
  $("metaLine").textContent = r?.meta || "—";
  $("metaFlag").textContent = r?.flag || "todo";

  $("edOriginal").value = r?.original || "";
  $("edMachine").value = r?.machine || "";
  $("edManual").value = r?.manual || "";

  $("btnMarkTodo").disabled = !r;
  $("btnMarkReview").disabled = !r;
  $("btnMarkDone").disabled = !r;
}

function buildFileFromRpy(name, source) {
  RENPY.setMode(state.settings.mode);
  const dialogs = RENPY.extractDialogs(source);
  const rows = dialogs.map((d, idx) => ({
    id: `${name}::${idx}`,
    original: d.quote || "",
    machine: "",
    manual: "",
    flag: "todo",
    meta: `line ${d.lineIndex + 1}`,
    _dialog: d
  }));
  return { id: `${name}::${now()}`, name, updated: now(), source, rows };
}

async function importFiles(fileList) {
  const okExt = (name) => /\.(rpy|txt|json|csv)$/i.test(name);
  const arr = Array.from(fileList || []).filter(f => okExt(f.name));
  if (!arr.length) { setJobUI(0, "Unsupported file type.", false); return; }

  const arr = Array.from(fileList || []);
  if (!arr.length) return;

  const rpy = arr.filter(f => f.name.toLowerCase().endsWith(".rpy"));
  const json = arr.filter(f => f.name.toLowerCase().endsWith(".json"));

  if (json.length && !rpy.length) {
    const text = await json[0].text();
    const s = JSON.parse(text);
    if (s && Array.isArray(s.files)) {
      state.projectName = s.projectName || state.projectName;
      state.files = s.files;
      state.activeFileId = state.files[0]?.id || null;
      state.selectedRowId = state.files[0]?.rows?.[0]?.id || null;
      saveState();
      renderFiles();
      refreshGrid(true);
      syncEditor();
      return;
    }
  }

  const out = [];
  for (const f of rpy) {
    const source = await f.text();
    out.push(buildFileFromRpy(f.name, source));
  }

  if (out.length) {
    state.files = out;
    state.projectName = state.projectName || "Ren'Py Project";
    state.activeFileId = out[0].id;
    state.selectedRowId = out[0].rows[0]?.id || null;
    saveState();
    renderFiles();
    refreshGrid(true);
    syncEditor();
  }
}

function collectRows(scope) {
  const onlyPending = (r) => r.flag !== "done" && !(r.machine && r.machine.trim());
  if (scope === "row") {
    const f = activeFile();
    const r = selectedRow();
    if (!f || !r) return [];
    return [r].filter(onlyPending);
  }
  if (scope === "file") {
    const f = activeFile();
    if (!f) return [];
    return f.rows.filter(onlyPending);
  }
  return state.files.flatMap(f => f.rows.filter(onlyPending));
}

function chunk(arr, size) {
  const n = Math.max(1, size | 0);
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

async function pool(limit, items, worker) {
  const n = Math.max(1, limit | 0);
  let i = 0;
  const results = new Array(items.length);
  const runners = new Array(n).fill(0).map(async () => {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await worker(items[idx], idx);
    }
  });
  await Promise.all(runners);
  return results;
}

async function runTranslate(scope) {
  if (state.job) return;

  const rows = collectRows(scope);
  if (!rows.length) { setJobUI(0, "Nothing to translate.", false); return; }

  const settings = { ...state.settings };
  const job = {
    id: String(now()),
    scope,
    total: rows.length,
    done: 0,
    failed: 0,
    abort: new AbortController()
  };
  state.job = job;

  setJobUI(0, `Starting ${rows.length}…`, true);

  const retry = { attempts: settings.retry, minDelay: 400, signal: job.abort.signal };

  const batches = chunk(rows, settings.batchSize);
  let processed = 0;

  try {
    for (let bi = 0; bi < batches.length; bi++) {
      const batch = batches[bi];

      const payload = batch.map(r => {
        const d = r._dialog;
        const masked = maskTagsInText(d.quote || "");
        d.maskedQuote = masked.masked;
        d.placeholderMap = masked.map;
        return d;
      });

      const translatedArr = await translateBatch(settings.engine, payload, settings.lang, settings.apiKey, retry, job.abort.signal);

      for (let i = 0; i < batch.length; i++) {
        const r = batch[i];
        const d = r._dialog;
        const raw = translatedArr[i] ?? "";
        const pp = postProcessTranslation(raw, d.placeholderMap);

        r.machine = pp.text;
        if (!pp.ok) {
          r.flag = "review";
          job.failed++;
        } else if (r.flag === "todo") {
          r.flag = "review";
        }
      }

      processed += batch.length;
      job.done = processed;

      const pct = Math.round((processed / job.total) * 100);
      setJobUI(pct, `Translated ${processed}/${job.total}`, true);

      const f = activeFile();
      if (f) f.updated = now();
      saveState();
      renderFiles();
      renderVirtualRows();
      if (scope === "row" || scope === "file") syncEditor();

      await new Promise(r => setTimeout(r, 0));
    }

    setJobUI(100, job.failed ? `Done with ${job.failed} review.` : "Done.", false);
  } catch (e) {
    setJobUI(Math.round((job.done / job.total) * 100), `Stopped: ${String(e?.message || e)}`, false);
  } finally {
    state.job = null;
  }
}

function applyManualEdit() {
  const f = activeFile();
  const r = selectedRow();
  if (!f || !r) return;
  r.manual = $("edManual").value;
  f.updated = now();
  saveState();
  renderVirtualRows();
  renderFiles();
  syncEditor();
}

async function exportZip() {
  if (!state.files.length) { setJobUI(0, "No files.", false); return; }

  const zip = new JSZip();
  const folder = zip.folder("translated");

  for (const f of state.files) {
    const source = f.source || "";
    const dialogs = RENPY.extractDialogs(source);
    for (let i = 0; i < dialogs.length; i++) {
      const row = f.rows[i];
      if (!row) continue;
      const d = dialogs[i];
      const chosen = (row.manual && row.manual.trim()) ? row.manual : (row.machine && row.machine.trim()) ? row.machine : null;
      if (chosen != null) d.translated = chosen;
    }
    const out = RENPY.applyTranslations(source, dialogs, null, TRANSLATOR_CREDIT);
    folder.file(f.name, out);
  }

  folder.file("_CREDITS.txt", TRANSLATOR_CREDIT + "\n");

  const blob = await zip.generateAsync({ type: "blob" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = (state.projectName || "project").replace(/\s+/g, "_") + "_translated.zip";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  setJobUI(0, "Exported ZIP.", false);
}

function openModal() { $("modal").classList.remove("hidden"); }
function closeModal() { $("modal").classList.add("hidden"); }

function syncSettingsUI() {
  const langSel = $("setLang");
  langSel.innerHTML = "";
  for (const l of LANGS) {
    const o = document.createElement("option");
    o.value = l.code;
    o.textContent = l.label;
    if (l.code === state.settings.lang) o.selected = true;
    langSel.appendChild(o);
  }
  $("setEngine").value = state.settings.engine;
  $("setLang").value = state.settings.lang;
  $("setMode").value = state.settings.mode;
  $("setBatch").value = String(state.settings.batchSize);
  $("setConc").value = String(state.settings.concurrency);
  $("setRetry").value = String(state.settings.retry);
  $("setKey").value = "";
}

function applySettingsFromUI() {
  state.settings.engine = $("setEngine").value;
  state.settings.lang = $("setLang").value;
  state.settings.mode = $("setMode").value;
  state.settings.batchSize = Math.max(1, Math.min(80, Number($("setBatch").value) || 24));
  state.settings.concurrency = Math.max(1, Math.min(4, Number($("setConc").value) || 2));
  state.settings.retry = Math.max(0, Math.min(6, Number($("setRetry").value) || 4));
  const key = String($("setKey").value || "").trim();
  if (key) state.settings.apiKey = key;
  saveState();
}

function bind() {
  $("btnImport").addEventListener("click", () => $("filePicker").click());
  $("filePicker").addEventListener("change", async () => {
    await importFiles($("filePicker").files);
    $("filePicker").value = "";
  });

  $("btnClear").addEventListener("click", resetAll);

  $("q").addEventListener("input", () => refreshGrid(true));

  $("grid").addEventListener("scroll", () => renderVirtualRows());

  $("edManual").addEventListener("input", () => applyManualEdit());

  $("btnMarkTodo").addEventListener("click", () => {
    const r = selectedRow(); if (!r) return;
    r.flag = "todo"; saveState(); renderFiles(); renderVirtualRows(); syncEditor();
  });
  $("btnMarkReview").addEventListener("click", () => {
    const r = selectedRow(); if (!r) return;
    r.flag = "review"; saveState(); renderFiles(); renderVirtualRows(); syncEditor();
  });
  $("btnMarkDone").addEventListener("click", () => {
    const r = selectedRow(); if (!r) return;
    r.flag = "done"; saveState(); renderFiles(); renderVirtualRows(); syncEditor();
  });

  $("btnSettings").addEventListener("click", () => { syncSettingsUI(); openModal(); });
  $("btnCloseModal").addEventListener("click", closeModal);
  $("modal").addEventListener("click", (e) => { if (e.target === $("modal")) closeModal(); });

  $("btnSaveSettings").addEventListener("click", () => {
    applySettingsFromUI();
    closeModal();
    refreshGrid(false);
  });

  $("btnTranslate").addEventListener("click", async () => {
    const scope = $("jobScope").value;
    await runTranslate(scope);
  });

  $("btnStop").addEventListener("click", () => {
    if (!state.job) return;
    state.job.abort.abort();
  });

  $("btnExportZip").addEventListener("click", exportZip);
  
  $("btnCopyOriginal").addEventListener("click", async () => {
    const r = selectedRow(); if (!r) return;
    await writeClipboard(r.original || "");
  });
  
  $("btnCopyMachine").addEventListener("click", async () => {
    const r = selectedRow(); if (!r) return;
    await writeClipboard(r.machine || "");
  });
  
  $("btnPasteToManual").addEventListener("click", () => {
    const f = activeFile(); const r = selectedRow();
    if (!f || !r) return;
    if (!r.machine?.trim()) return;
    r.manual = r.machine;
    f.updated = Date.now();
    saveState();
    renderVirtualRows();
    renderFiles();
    syncEditor();
  });
  
  $("btnFindNext").addEventListener("click", () => findNext(+1));
  $("btnFindPrev").addEventListener("click", () => findNext(-1));
  
  $("q").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); findNext(+1); }
    if (e.key === "Enter" && e.shiftKey) { e.preventDefault(); findNext(-1); }
  });
  
  function openReplace() { $("replaceModal").classList.remove("hidden"); }
  function closeReplace() { $("replaceModal").classList.add("hidden"); }
  
  $("btnReplace").addEventListener("click", () => {
    $("repFind").value = $("q").value || "";
    openReplace();
  });
  
  $("btnCloseReplace").addEventListener("click", closeReplace);
  $("replaceModal").addEventListener("click", (e) => { if (e.target === $("replaceModal")) closeReplace(); });
  
  $("btnRepRun").addEventListener("click", replaceRun);
  $("btnRepCount").addEventListener("click", replaceCount);
}

function boot() {
  loadState();
  bind();

  if (state.files.length) {
    state.activeFileId = state.activeFileId || state.files[0]?.id || null;
    const f = activeFile();
    state.selectedRowId = state.selectedRowId || f?.rows?.[0]?.id || null;
  }

  renderFiles();
  refreshGrid(true);
  syncEditor();
  setJobUI(0, "Ready.", false);
}

boot();