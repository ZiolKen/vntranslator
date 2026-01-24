import { $ , on, setText, setDisabled, show, hide, isTextField } from "./dom.js";
import { debounce, clamp, formatCount, writeClipboard } from "./utils.js";
import { loadWorkspace, saveWorkspace, clearWorkspace, getSessionApiKey, setSessionApiKey } from "./storage.js";
import { normalizeWorkspace, rebuildRowIndex, fileProgress, workspaceStats } from "./workspace.js";
import { importWorkspaceFromFiles } from "./importers.js";
import { exportZipTranslated } from "./exporters.js";
import { buildReplaceRegex, parseRules, unescapeMini, safeRenpyReplaceMany, countMatchesMasked } from "./replace.js";
import { collectPendingRows, runTranslate } from "./translator.js";

const ROW_H = 92;
const OVERSCAN = 8;

const now = () => Date.now();

const state = {
  ws: normalizeWorkspace(null),
  rowIndex: new Map(),
  job: null,
  manualEditSession: null,
  grid: {
    filtered: [],
    scrollTop: 0,
    start: 0,
    end: 0
  }
};

const history = {
  undo: [],
  redo: [],
  limit: 200
};

const saveDebounced = debounce(async () => {
  try {
    state.ws._meta.updatedAt = now();
    await saveWorkspace(state.ws);
  } catch {}
}, 250);

const renderDebounced = debounce(() => {
  renderVirtualRows();
  renderFiles();
  syncBadge();
}, 80);

const activeFile = () => state.ws.files.find(f => f.id === state.ws.activeFileId) || null;

const selectedRow = () => {
  const f = activeFile();
  if (!f) return null;
  return f.rows.find(r => r.id === state.ws.selectedRowId) || null;
};

const syncBadge = () => {
  const badge = $("projectBadge");
  if (!badge) return;

  if (!state.ws.files.length) { badge.textContent = "No project"; return; }

  const s = workspaceStats(state.ws);
  badge.textContent = `${formatCount(s.files)} file(s) • ${formatCount(s.rows)} rows • ${formatCount(s.done)} done • ${formatCount(s.review)} review`;
};

const setJobUI = (pct, text, running) => {
  $("meterFill").style.width = `${clamp(pct, 0, 100)}%`;
  setText($("jobText"), text);

  setDisabled($("btnStop"), !running);
  setDisabled($("btnTranslate"), running);
  setDisabled($("jobScope"), running);
};

const glyph = (flag) => {
  if (flag === "done") return "✓";
  if (flag === "review") return "!";
  return "·";
};

const escapeSnip = (s) => {
  const t = String(s || "");
  return t.length > 260 ? t.slice(0, 260) + "…" : t;
};

const rebuildIndex = () => { state.rowIndex = rebuildRowIndex(state.ws); };

const pushHistory = (op) => {
  if (!op || !op.changes?.length) return;
  history.undo.push(op);
  if (history.undo.length > history.limit) history.undo.shift();
  history.redo.length = 0;
  syncUndoRedoUI();
};

const applyHistory = (op, dir) => {
  const usePrev = dir === "undo";

  for (const ch of op.changes) {
    const hit = state.rowIndex.get(ch.rowId);
    if (!hit) continue;
    hit.row[ch.field] = usePrev ? ch.prev : ch.next;
  }

  const touched = new Set(op.changes.map(x => state.rowIndex.get(x.rowId)?.fileId).filter(Boolean));
  for (const fid of touched) {
    const f = state.ws.files.find(x => x.id === fid);
    if (f) f.updated = now();
  }

  saveDebounced();
  renderDebounced();
  syncEditor();
  syncUndoRedoUI();
};

const undo = () => {
  const op = history.undo.pop();
  if (!op) return setJobUI(0, "Nothing to undo.", false);
  history.redo.push(op);
  applyHistory(op, "undo");
  setJobUI(0, "Undo.", false);
};

const redo = () => {
  const op = history.redo.pop();
  if (!op) return setJobUI(0, "Nothing to redo.", false);
  history.undo.push(op);
  applyHistory(op, "redo");
  setJobUI(0, "Redo.", false);
};

const syncUndoRedoUI = () => {
  setDisabled($("btnUndo"), history.undo.length === 0);
  setDisabled($("btnRedo"), history.redo.length === 0);
};

const commitManualSessionHard = () => {
  const sess = state.manualEditSession;
  if (!sess) return;

  state.manualEditSession = null;

  const hit = state.rowIndex.get(sess.rowId);
  if (!hit) return;

  const r = hit.row;
  const next = r.manual || "";
  if (next === sess.prev) return;

  pushHistory({
    type: "edit",
    ts: now(),
    changes: [{ rowId: sess.rowId, field: "manual", prev: sess.prev, next }]
  });
};

const beginManualSession = (r) => {
  if (!r) return;
  if (state.manualEditSession?.rowId === r.id) return;
  state.manualEditSession = { rowId: r.id, prev: r.manual || "" };
};

const renderFiles = () => {
  const wrap = $("fileList");
  wrap.innerHTML = "";

  for (const f of state.ws.files) {
    const row = document.createElement("div");
    row.className = "fileRow";
    row.dataset.active = String(f.id === state.ws.activeFileId);

    const pct = fileProgress(f);

    row.innerHTML = `<div class="name"></div><div class="pct"></div>`;
    row.querySelector(".name").textContent = f.name;
    row.querySelector(".pct").textContent = `${pct}%`;

    row.addEventListener("click", () => {
      commitManualSessionHard();
      state.ws.activeFileId = f.id;
      state.ws.selectedRowId = f.rows[0]?.id || null;
      saveDebounced();
      renderFiles();
      refreshGrid(true);
      syncEditor();
    });

    wrap.appendChild(row);
  }

  setText($("projectName"), state.ws.files.length ? state.ws.projectName : "No project");
};

const computeFilteredRows = () => {
  const f = activeFile();
  if (!f) return [];

  const q = $("q").value.trim();
  if (!q) return f.rows.map((r, i) => ({ r, i }));

  const field = $("qField").value;
  const needle = q.toLowerCase();

  const pickFields = (r) => {
    if (field === "original") return [r.original];
    if (field === "machine") return [r.machine];
    if (field === "manual") return [r.manual];
    return [r.original, r.machine, r.manual];
  };

  return f.rows.map((r, i) => ({ r, i })).filter(x => {
    const hay = pickFields(x.r).filter(Boolean).join("\n").toLowerCase();
    return hay.includes(needle);
  });
};

const refreshGrid = (resetScroll) => {
  const grid = $("grid");
  if (resetScroll) grid.scrollTop = 0;

  state.grid.filtered = computeFilteredRows();
  const total = state.grid.filtered.length;

  $("gridSpacer").style.height = `${total * ROW_H}px`;
  renderVirtualRows();
};

const filteredIndexMap = () => {
  const m = new Map();
  for (let k = 0; k < state.grid.filtered.length; k++) m.set(state.grid.filtered[k].r.id, k);
  return m;
};

const scrollToFilteredIndex = (k) => {
  const grid = $("grid");
  grid.scrollTop = Math.max(0, k * ROW_H - ROW_H);
  renderVirtualRows();
};

const findNext = (dir) => {
  const q = $("q").value.trim();
  if (!q) return setJobUI(0, "Type something to find.", false);

  const list = state.grid.filtered;
  if (!list.length) return setJobUI(0, "No rows.", false);

  const map = filteredIndexMap();
  const cur = state.ws.selectedRowId ? (map.get(state.ws.selectedRowId) ?? -1) : -1;

  const field = $("qField").value;
  const needle = q.toLowerCase();

  const pickFields = (r) => {
    if (field === "original") return [r.original];
    if (field === "machine") return [r.machine];
    if (field === "manual") return [r.manual];
    return [r.original, r.machine, r.manual];
  };

  const matches = (r) => pickFields(r).filter(Boolean).some(x => String(x).toLowerCase().includes(needle));

  const step = dir > 0 ? 1 : -1;
  for (let t = 1; t <= list.length; t++) {
    let k = cur + step * t;
    if (k < 0) k += list.length;
    if (k >= list.length) k -= list.length;

    const r = list[k].r;
    if (matches(r)) {
      commitManualSessionHard();
      state.ws.selectedRowId = r.id;
      saveDebounced();
      scrollToFilteredIndex(k);
      syncEditor();
      renderVirtualRows();
      return setJobUI(0, "Found.", false);
    }
  }

  setJobUI(0, "No match.", false);
};

const renderVirtualRows = () => {
  const grid = $("grid");
  const win = $("gridWindow");
  const total = state.grid.filtered.length;

  const scrollTop = grid.scrollTop;
  const viewH = grid.clientHeight || 1;

  let start = Math.floor(scrollTop / ROW_H) - OVERSCAN;
  let end = Math.ceil((scrollTop + viewH) / ROW_H) + OVERSCAN;

  start = Math.max(0, start);
  end = Math.min(total, end);

  if (start === state.grid.start && end === state.grid.end && Math.abs(scrollTop - state.grid.scrollTop) < 2) return;

  state.grid.start = start;
  state.grid.end = end;
  state.grid.scrollTop = scrollTop;

  win.style.transform = `translateY(${start * ROW_H}px)`;
  win.innerHTML = "";

  for (let k = start; k < end; k++) {
    const { r, i } = state.grid.filtered[k];
    const idx = i + 1;

    const row = document.createElement("div");
    row.className = "row";
    row.dataset.selected = String(r.id === state.ws.selectedRowId);

    row.innerHTML = `
      <div class="cell idx">${idx}</div>
      <div class="cell"><div class="snip"></div></div>
      <div class="cell"><div class="snip"></div></div>
      <div class="cell"><div class="snip"></div></div>
      <div class="cell idx"><button class="flagBtn" type="button"></button></div>
    `;

    const snips = row.querySelectorAll(".snip");
    snips[0].textContent = escapeSnip(r.original);
    snips[1].textContent = escapeSnip(r.machine || "");
    snips[2].textContent = escapeSnip(r.manual || "");

    const btn = row.querySelector(".flagBtn");
    btn.dataset.flag = r.flag;
    btn.textContent = glyph(r.flag);

    row.addEventListener("click", (e) => {
      if (e.target === btn) return;
      commitManualSessionHard();
      state.ws.selectedRowId = r.id;
      saveDebounced();
      renderVirtualRows();
      syncEditor();
    });

    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const prev = r.flag;
      const next = r.flag === "todo" ? "review" : (r.flag === "review" ? "done" : "todo");
      if (prev !== next) {
        r.flag = next;
        pushHistory({ type: "flag", ts: now(), changes: [{ rowId: r.id, field: "flag", prev, next }] });
      }
      state.ws._meta.updatedAt = now();
      saveDebounced();
      renderDebounced();
      syncEditor();
    });

    win.appendChild(row);
  }
};

const syncEditor = () => {
  const f = activeFile();
  const r = selectedRow();

  setText($("metaFile"), f?.name || "—");
  setText($("metaLine"), r?.meta || "—");
  setText($("metaFlag"), r?.flag || "todo");

  $("edOriginal").value = r?.original || "";
  $("edMachine").value = r?.machine || "";
  $("edManual").value = r?.manual || "";

  setDisabled($("btnMarkTodo"), !r);
  setDisabled($("btnMarkReview"), !r);
  setDisabled($("btnMarkDone"), !r);

  state.manualEditSession = null;
};

const openModal = () => show($("modal"));
const closeModal = () => hide($("modal"));

const openReplaceModal = () => show($("replaceModal"));
const closeReplaceModal = () => hide($("replaceModal"));

const syncSettingsUI = () => {
  const ws = state.ws;
  const langSel = $("setLang");
  langSel.innerHTML = "";
  const { LANGS } = window.__PRENPY__ || {};
  if (Array.isArray(LANGS)) {
    for (const l of LANGS) {
      const o = document.createElement("option");
      o.value = l.code;
      o.textContent = l.label;
      if (l.code === ws.settings.lang) o.selected = true;
      langSel.appendChild(o);
    }
  }

  $("setEngine").value = ws.settings.engine;
  $("setMode").value = ws.settings.mode;
  $("setBatch").value = String(ws.settings.batchSize);
  $("setConc").value = String(ws.settings.concurrency);
  $("setRetry").value = String(ws.settings.retry);
  $("setProxy").value = String(ws.settings.proxyBase || "");
  $("setKey").value = "";
};

const applySettingsFromUI = () => {
  const ws = state.ws;
  ws.settings.engine = $("setEngine").value;
  ws.settings.lang = $("setLang").value;
  ws.settings.mode = $("setMode").value;
  ws.settings.batchSize = clamp(Number($("setBatch").value) || 24, 1, 80);
  ws.settings.concurrency = clamp(Number($("setConc").value) || 2, 1, 6);
  ws.settings.retry = clamp(Number($("setRetry").value) || 4, 0, 8);
  ws.settings.proxyBase = String($("setProxy").value || "").trim();

  const key = String($("setKey").value || "").trim();
  if (key) setSessionApiKey(key);

  saveDebounced();
};

const resetAll = async () => {
  await clearWorkspace().catch(() => {});
  sessionStorage.clear();
  location.reload();
};

const importFiles = async (fileList) => {
  try {
    setJobUI(0, "Importing…", true);
    const ws = await importWorkspaceFromFiles(fileList, state.ws);
    state.ws = normalizeWorkspace(ws);
    rebuildIndex();
    history.undo.length = 0;
    history.redo.length = 0;
    syncUndoRedoUI();

    await saveWorkspace(state.ws).catch(() => {});
    renderFiles();
    refreshGrid(true);
    syncEditor();
    syncBadge();

    setJobUI(0, "Imported.", false);
  } catch (e) {
    setJobUI(0, String(e?.message || e), false);
  }
};

const exportZip = async () => {
  try {
    setJobUI(0, "Exporting…", true);
    commitManualSessionHard();
    await exportZipTranslated(state.ws);
    setJobUI(0, "Exported ZIP.", false);
  } catch (e) {
    setJobUI(0, String(e?.message || e), false);
  }
};

const iterScopeRowsForReplace = (scope) => {
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

  return state.ws.files.flatMap(f => f.rows.filter(ok));
};

const compileReplaceRules = () => {
  const mode = $("repMode").value;

  const build = (find) => buildReplaceRegex(find, {
    regex: $("repRegex").checked,
    caseSensitive: $("repCase").checked,
    wholeWord: $("repWhole").checked
  });

  if (mode === "single") {
    const find = $("repFind").value;
    if (!find) throw new Error("Find is empty.");
    const withStr = unescapeMini($("repWith").value);
    return [{ re: build(find), withStr }];
  }

  const rules = parseRules($("repRules").value);
  if (!rules.length) throw new Error("Rules is empty.");
  return rules.map(x => ({ re: build(x.find), withStr: x.withStr }));
};

const replaceRun = () => {
  const scope = $("repScope").value;
  const field = $("repField").value;
  const fillManual = $("repFillManual").checked;

  const rows = iterScopeRowsForReplace(scope);
  if (!rows.length) return setJobUI(0, "Nothing to replace.", false);

  const fields = field === "both" ? ["manual", "machine"] : [field];
  const compiledRules = compileReplaceRules();

  commitManualSessionHard();

  const includeDone = $("repIncludeDone").checked;

  const changes = [];
  let changedFields = 0;

  if (fillManual && fields.includes("manual")) {
    for (const r of rows) {
      if (!includeDone && r.flag === "done") continue;
      if ((r.manual || "").trim()) continue;
      if (!(r.machine || "").trim()) continue;

      const prev = r.manual || "";
      const next = r.machine;

      r.manual = next;
      changes.push({ rowId: r.id, field: "manual", prev, next });

      if (r.flag === "done") r.flag = "review";
      else if (r.flag === "todo") r.flag = "review";
    }
  }

  for (const r of rows) {
    if (!includeDone && r.flag === "done") continue;

    for (const k of fields) {
      const cur = r[k] || "";
      if (!cur) continue;

      const rr = safeRenpyReplaceMany(cur, compiledRules);
      if (rr.changed) {
        const prev = cur;
        const next = rr.out;

        r[k] = next;
        changes.push({ rowId: r.id, field: k, prev, next });
        changedFields++;

        if (r.flag === "done") r.flag = "review";
        else if (r.flag === "todo") r.flag = "review";
      }
    }
  }

  if (!changes.length) return setJobUI(0, "No changes.", false);

  pushHistory({ type: "replace", ts: now(), changes });

  const touched = new Set(changes.map(x => state.rowIndex.get(x.rowId)?.fileId).filter(Boolean));
  for (const fid of touched) {
    const f = state.ws.files.find(x => x.id === fid);
    if (f) f.updated = now();
  }

  saveDebounced();
  renderDebounced();
  syncEditor();
  setJobUI(0, `Replaced in ${changedFields} field(s).`, false);
};

const replaceCount = () => {
  const scope = $("repScope").value;
  const field = $("repField").value;

  const rows = iterScopeRowsForReplace(scope);
  if (!rows.length) return setJobUI(0, "No rows.", false);

  const fields = field === "both" ? ["manual", "machine"] : [field];
  const compiledRules = compileReplaceRules();

  let hits = 0;
  for (const r of rows) {
    for (const k of fields) {
      const cur = r[k] || "";
      if (!cur) continue;
      hits += countMatchesMasked(cur, compiledRules);
    }
  }

  setJobUI(0, `Matches: ${formatCount(hits)}`, false);
};

const runTranslateUi = async (scope) => {
  if (state.job) return;

  const rows = collectPendingRows(state.ws, scope);
  if (!rows.length) return setJobUI(0, "Nothing to translate.", false);

  const apiKey = getSessionApiKey();

  const job = {
    abort: new AbortController()
  };

  state.job = job;

  const onProgress = ({ total, done, failed }) => {
    const pct = total ? Math.round((done / total) * 100) : 0;
    setJobUI(pct, `Translated ${done}/${total}${failed ? ` • ${failed} review` : ""}`, true);
    renderDebounced();
    if (scope !== "all") syncEditor();
  };

  setJobUI(0, `Starting ${rows.length}…`, true);

  try {
    const result = await runTranslate(state.ws, rows, apiKey, { onProgress, signal: job.abort.signal });
    setJobUI(100, result.failed ? `Done • ${result.failed} review` : "Done.", false);
  } catch (e) {
    const msg = String(e?.message || e);
    setJobUI(0, msg === "Aborted" ? "Stopped." : `Stopped: ${msg}`, false);
  } finally {
    state.job = null;
    saveDebounced();
    renderDebounced();
    syncEditor();
  }
};

const bind = () => {
  on($("btnImport"), "click", () => $("filePicker").click());
  on($("filePicker"), "change", async () => {
    await importFiles($("filePicker").files);
    $("filePicker").value = "";
  });

  on($("btnClear"), "click", resetAll);

  on($("q"), "input", () => refreshGrid(true));
  on($("qField"), "change", () => refreshGrid(true));

  on($("grid"), "scroll", () => renderVirtualRows());

  on($("edManual"), "input", () => {
    const f = activeFile();
    const r = selectedRow();
    if (!f || !r) return;

    beginManualSession(r);
    r.manual = $("edManual").value;
    f.updated = now();

    saveDebounced();
    renderDebounced();
  });

  on($("edManual"), "blur", () => commitManualSessionHard());

  on($("btnMarkTodo"), "click", () => {
    const r = selectedRow(); if (!r) return;
    const prev = r.flag;
    const next = "todo";
    if (prev !== next) pushHistory({ type:"flag", ts:now(), changes:[{ rowId:r.id, field:"flag", prev, next }] });
    r.flag = next;
    saveDebounced(); renderDebounced(); syncEditor();
  });

  on($("btnMarkReview"), "click", () => {
    const r = selectedRow(); if (!r) return;
    const prev = r.flag;
    const next = "review";
    if (prev !== next) pushHistory({ type:"flag", ts:now(), changes:[{ rowId:r.id, field:"flag", prev, next }] });
    r.flag = next;
    saveDebounced(); renderDebounced(); syncEditor();
  });

  on($("btnMarkDone"), "click", () => {
    const r = selectedRow(); if (!r) return;
    const prev = r.flag;
    const next = "done";
    if (prev !== next) pushHistory({ type:"flag", ts:now(), changes:[{ rowId:r.id, field:"flag", prev, next }] });
    r.flag = next;
    saveDebounced(); renderDebounced(); syncEditor();
  });

  on($("btnCopyOriginal"), "click", async () => {
    const r = selectedRow(); if (!r) return;
    const ok = await writeClipboard(r.original || "");
    setJobUI(0, ok ? "Copied." : "Clipboard blocked.", false);
  });

  on($("btnCopyMachine"), "click", async () => {
    const r = selectedRow(); if (!r) return;
    const ok = await writeClipboard(r.machine || "");
    setJobUI(0, ok ? "Copied." : "Clipboard blocked.", false);
  });

  on($("btnPasteToManual"), "click", () => {
    const f = activeFile();
    const r = selectedRow();
    if (!f || !r) return;
    if (!r.machine?.trim()) return;

    commitManualSessionHard();

    const prev = r.manual || "";
    const next = r.machine;

    if (prev === next) return;

    r.manual = next;
    f.updated = now();

    pushHistory({ type: "edit", ts: now(), changes: [{ rowId: r.id, field: "manual", prev, next }] });

    saveDebounced();
    renderDebounced();
    syncEditor();
  });

  on($("btnSettings"), "click", () => {
    syncSettingsUI();
    openModal();
  });

  on($("btnCloseModal"), "click", closeModal);
  on($("modal"), "click", (e) => { if (e.target === $("modal")) closeModal(); });

  on($("btnSaveSettings"), "click", () => {
    applySettingsFromUI();
    closeModal();
    refreshGrid(false);
  });

  on($("btnTranslate"), "click", async () => runTranslateUi($("jobScope").value));

  on($("btnStop"), "click", () => { if (state.job) state.job.abort.abort(); });

  on($("btnExportZip"), "click", exportZip);

  on($("btnFindNext"), "click", () => findNext(+1));
  on($("btnFindPrev"), "click", () => findNext(-1));

  on($("q"), "keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); findNext(+1); }
    if (e.key === "Enter" && e.shiftKey) { e.preventDefault(); findNext(-1); }
  });

  on($("btnReplace"), "click", () => {
    $("repFind").value = $("q").value || "";
    $("repMode").value = "single";
    $("repRulesWrap").style.display = "none";
    $("repFind").disabled = false;
    $("repWith").disabled = false;
    openReplaceModal();
  });

  on($("btnCloseReplace"), "click", closeReplaceModal);
  on($("replaceModal"), "click", (e) => { if (e.target === $("replaceModal")) closeReplaceModal(); });

  on($("btnRepRun"), "click", () => { try { replaceRun(); } catch (e) { setJobUI(0, String(e?.message || e), false); } });
  on($("btnRepCount"), "click", () => { try { replaceCount(); } catch (e) { setJobUI(0, String(e?.message || e), false); } });

  on($("repMode"), "change", () => {
    const m = $("repMode").value;
    $("repRulesWrap").style.display = m === "multi" ? "" : "none";
    $("repFind").disabled = m === "multi";
    $("repWith").disabled = m === "multi";
  });

  on($("btnUndo"), "click", undo);
  on($("btnRedo"), "click", redo);

  document.addEventListener("keydown", (e) => {
    const meta = e.ctrlKey || e.metaKey;
    if (!meta) return;

    const ae = document.activeElement;
    const inField = isTextField(ae);

    const k = e.key.toLowerCase();
    if (k === "z" && !e.shiftKey && !inField) { e.preventDefault(); undo(); }
    if ((k === "y" || (k === "z" && e.shiftKey)) && !inField) { e.preventDefault(); redo(); }
  });
};

const boot = async () => {
  try {
    const loaded = await loadWorkspace();
    state.ws = normalizeWorkspace(loaded);
  } catch {
    state.ws = normalizeWorkspace(null);
  }

  rebuildIndex();
  syncUndoRedoUI();

  window.__PRENPY__ = window.__PRENPY__ || {};
  window.__PRENPY__.LANGS = window.__PRENPY__.LANGS || [];

  bind();

  renderFiles();
  refreshGrid(true);
  syncEditor();
  syncBadge();
  setJobUI(0, "Ready.", false);
};

boot();
