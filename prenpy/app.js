import { RENPY, unmaskTagsInText, RENPH_TEST_RE, OLD_RENPH_TEST_RE, TRANSLATOR_CREDIT } from './prenpy.js';
import { normalizeLineEndings, restoreLineEndings, debounce, escapeHtml, clamp } from './utils.js';
import { Store } from './storage.js';
import { LANG_TO_CODE } from './languages.js';
import { translateBatchDeepSeek, translateBatchDeepL, translateBatchLingva } from './engines.js';
import { downloadZip } from './zip.js';
import { buildMatcher, findAllInText, replaceAll, nextIndex, sortMatches } from './findreplace.js';

const PROJECT_ID = 'default';

const el = (id) => document.getElementById(id);

const ui = {
  btnOpenFiles: el('btnOpenFiles'),
  btnOpenFolder: el('btnOpenFolder'),
  btnExportFile: el('btnExportFile'),
  btnExportZip: el('btnExportZip'),
  btnFind: el('btnFind'),
  btnTM: el('btnTM'),
  btnClear: el('btnClear'),
  btnReload: el('btnReload'),

  fileInput: el('fileInput'),
  folderInput: el('folderInput'),
  fileFilter: el('fileFilter'),
  fileList: el('fileList'),
  fileBadge: el('fileBadge'),

  statFiles: el('statFiles'),
  statStrings: el('statStrings'),
  statTranslated: el('statTranslated'),

  engineSelect: el('engineSelect'),
  targetLangSelect: el('targetLangSelect'),
  extractMode: el('extractMode'),
  batchSize: el('batchSize'),
  apiKey: el('apiKey'),
  useTMFirst: el('useTMFirst'),
  autoSave: el('autoSave'),

  btnTranslateMissing: el('btnTranslateMissing'),
  btnTranslateSelected: el('btnTranslateSelected'),

  rowFilter: el('rowFilter'),
  tableSearch: el('tableSearch'),
  showWarnings: el('showWarnings'),

  gridBody: el('gridBody'),
  tableWrap: el('tableWrap'),
  selAll: el('selAll'),

  statusLeft: el('statusLeft'),
  statusRight: el('statusRight'),
  log: el('log'),

  modalBackdrop: el('modalBackdrop'),
  findModal: el('findModal'),
  tmModal: el('tmModal'),

  findQuery: el('findQuery'),
  replaceQuery: el('replaceQuery'),
  findCase: el('findCase'),
  findRegex: el('findRegex'),
  findScope: el('findScope'),
  findRows: el('findRows'),
  findStats: el('findStats'),
  btnFindPrev: el('btnFindPrev'),
  btnFindNext: el('btnFindNext'),
  btnReplaceOne: el('btnReplaceOne'),
  btnReplaceAll: el('btnReplaceAll'),

  tmSearch: el('tmSearch'),
  tmList: el('tmList'),
  btnTmExport: el('btnTmExport'),
  btnTmImport: el('btnTmImport'),
  btnTmClear: el('btnTmClear'),
  btnTmFillMissing: el('btnTmFillMissing'),
  tmImportInput: el('tmImportInput'),
  
  btnUndo: el('btnUndo'),
  btnRedo: el('btnRedo'),
  btnCopyOriginal: el('btnCopyOriginal'),
  btnCopyTranslate: el('btnCopyTranslate'),
};

const state = {
  project: { id: PROJECT_ID, name: 'PreRenPy', createdAt: new Date().toISOString() },
  files: new Map(),
  activePath: null,
  activeView: [],
  activeSelected: new Set(),
  busy: false,
  find: {
    matches: [],
    cursor: -1,
  },
  virtual: {
    rowHeight: 80,
    overscan: 10,
    lastStart: -1,
    lastEnd: -1,
    viewIndexByRow: new Map(),
  },
  editor: {
    focusRow: -1,
    focusPrev: '',
    applying: false,
  },
  history: {
    undo: [],
    redo: [],
    limit: 5000,
  },
};

function log(msg, level = 'info') {
  const div = document.createElement('div');
  div.className = 'item ' + (level === 'warn' ? 'warn' : level === 'err' ? 'err' : '');
  div.textContent = String(msg);
  ui.log.prepend(div);
}

function setStatus(left, right = '') {
  if (left != null) ui.statusLeft.textContent = String(left);
  if (right != null) ui.statusRight.textContent = String(right);
}

function setBusy(v) {
  state.busy = !!v;
  const dis = state.busy || !state.activePath;
  ui.btnTranslateMissing.disabled = dis;
  ui.btnTranslateSelected.disabled = dis;
  ui.btnExportFile.disabled = !state.activePath || state.busy;
  ui.btnExportZip.disabled = state.files.size === 0 || state.busy;
  ui.btnTmFillMissing.disabled = !state.activePath || state.busy;
}

function openModal(modalEl) {
  ui.modalBackdrop.hidden = false;
  modalEl.hidden = false;
  document.body.style.overflow = 'hidden';
}

function closeModal(modalEl) {
  modalEl.hidden = true;
  ui.modalBackdrop.hidden = true;
  document.body.style.overflow = '';
}

function isTextInputEl(x) {
  return x && (x.tagName === 'TEXTAREA' || x.tagName === 'INPUT');
}

function updateUndoRedoButtons() {
  if (ui.btnUndo) ui.btnUndo.disabled = state.history.undo.length === 0 || state.busy;
  if (ui.btnRedo) ui.btnRedo.disabled = state.history.redo.length === 0 || state.busy;
}

function pushHistory(action) {
  state.history.undo.push(action);
  if (state.history.undo.length > state.history.limit) state.history.undo.shift();
  state.history.redo.length = 0;
  updateUndoRedoButtons();
}

function getActiveFile() {
  const p = state.activePath;
  if (!p) return null;
  return state.files.get(p) || null;
}

function updateRowDOM(rowIndex) {
  const r = ui.gridBody.querySelector(`tr[data-idx="${rowIndex}"]`);
  if (!r) return;

  const f = getActiveFile();
  if (!f) return;
  const d = f.dialogs[rowIndex];
  if (!d) return;

  const ta = r.querySelector('.trInput');
  if (ta && ta.value !== String(d.translated ?? '')) ta.value = String(d.translated ?? '');

  r.classList.toggle('flagged', !!d.flagged);
  const flagBtn = r.querySelector('.flagBtn');
  if (flagBtn) flagBtn.classList.toggle('on', !!d.flagged);

  const status = r.querySelector('.metaStatus');
  if (status) {
    const warnOn = !!ui.showWarnings.checked;
    const v = String(d.translated ?? '');
    const hasTr = v.trim().length > 0;
    const warn = warnOn && (RENPH_TEST_RE.test(v) || OLD_RENPH_TEST_RE.test(v));

    status.className = 'metaStatus ' + (warn ? 'meta-warn' : hasTr ? 'meta-ok' : 'meta-none');
    status.textContent = warn ? 'PLACEHOLDER' : (hasTr ? 'OK' : '—');
  }
}

function applyAction(action, dir /* undo, redo */) {
  const f = state.files.get(action.path);
  if (!f) return;
  const d = f.dialogs[action.row];
  if (!d) return;

  const value = (dir === 'undo') ? action.prev : action.next;

  state.editor.applying = true;
  try {
    if (action.field === 'translated') {
      d.translated = value;
      const t = String(value ?? '').trim();
      if (t) Store.tmPut(ui.targetLangSelect.value, String(d.maskedQuote ?? ''), t, { source: dir }).catch(()=>{});
    } else if (action.field === 'flagged') {
      d.flagged = !!value;
    }

    if (action.path === state.activePath) {
      updateRowDOM(action.row);
      renderTable({ resetSel: false, resetScroll: false });
    }

    updateProjectStats();
    if (ui.autoSave.checked) scheduleSaveActiveFile();
  } finally {
    state.editor.applying = false;
  }
}

function undo() {
  if (!state.history.undo.length || state.busy) return;
  const a = state.history.undo.pop();
  applyAction(a, 'undo');
  state.history.redo.push(a);
  updateUndoRedoButtons();
}

function redo() {
  if (!state.history.redo.length || state.busy) return;
  const a = state.history.redo.pop();
  applyAction(a, 'redo');
  state.history.undo.push(a);
  updateUndoRedoButtons();
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(String(text ?? ''));
    setStatus('Copied to clipboard.', '');
  } catch {
    log('Clipboard copy failed (browser blocked).', 'warn');
  }
}

function pickRowForActions() {
  const f = getActiveFile();
  if (!f) return -1;

  if (state.editor.focusRow >= 0) return state.editor.focusRow;

  const selected = Array.from(state.activeSelected.values()).sort((a,b)=>a-b);
  if (selected.length) return selected[0];

  return -1;
}

async function copyOriginal() {
  const f = getActiveFile();
  if (!f) return;
  const row = pickRowForActions();
  if (row < 0) return;
  await copyToClipboard(f.dialogs[row]?.quote ?? '');
}

async function copyTranslate() {
  const f = getActiveFile();
  if (!f) return;
  const row = pickRowForActions();
  if (row < 0) return;
  await copyToClipboard(f.dialogs[row]?.translated ?? '');
}

function toggleFlag(rowIndex) {
  const f = getActiveFile();
  if (!f) return;
  const d = f.dialogs[rowIndex];
  if (!d) return;

  const prev = !!d.flagged;
  const next = !prev;
  d.flagged = next;

  pushHistory({
    path: state.activePath,
    row: rowIndex,
    field: 'flagged',
    prev,
    next,
    ts: Date.now(),
    source: 'flag',
  });

  updateRowDOM(rowIndex);
  if (ui.autoSave.checked) scheduleSaveActiveFile();
}

document.addEventListener('click', (e) => {
  const t = e.target;
  if (t && t.matches && t.matches('[data-close]')) {
    const id = t.getAttribute('data-close');
    const m = el(id);
    if (m) closeModal(m);
  }
  if (t === ui.modalBackdrop) {
    if (!ui.findModal.hidden) closeModal(ui.findModal);
    if (!ui.tmModal.hidden) closeModal(ui.tmModal);
  }
});

function updateProjectStats() {
  let strings = 0;
  let translated = 0;
  for (const f of state.files.values()) {
    strings += f.dialogs.length;
    translated += f.dialogs.filter(d => d.translated && String(d.translated).trim()).length;
  }
  ui.statFiles.textContent = String(state.files.size);
  ui.statStrings.textContent = String(strings);
  ui.statTranslated.textContent = String(translated);
  ui.fileBadge.textContent = String(state.files.size);
}

function renderFileList() {
  const filter = String(ui.fileFilter.value || '').toLowerCase().trim();
  ui.fileList.innerHTML = '';
  const paths = Array.from(state.files.keys()).sort((a,b) => a.localeCompare(b));
  let shown = 0;
  for (const p of paths) {
    if (filter && !p.toLowerCase().includes(filter)) continue;
    const f = state.files.get(p);
    const item = document.createElement('div');
    item.className = 'file-item' + (p === state.activePath ? ' active' : '');
    item.tabIndex = 0;
    item.setAttribute('role', 'option');

    const translated = f.dialogs.filter(d => d.translated && String(d.translated).trim()).length;
    item.innerHTML = `
      <div class="file-path" title="${escapeHtml(p)}">${escapeHtml(p)}</div>
      <div class="file-meta">
        <span class="pill">${f.dialogs.length} strings</span>
        <span class="pill">${translated} translated</span>
      </div>
    `;
    item.addEventListener('click', () => openFile(p));
    ui.fileList.appendChild(item);
    shown++;
  }
  ui.fileBadge.textContent = String(shown);
}

function computeActiveView() {
  const path = state.activePath;
  if (!path) { state.activeView = []; return; }
  const f = state.files.get(path);
  if (!f) { state.activeView = []; return; }

  const filterMode = ui.rowFilter.value;
  const q = String(ui.tableSearch.value || '').trim().toLowerCase();
  const showTranslated = filterMode === 'all' || filterMode === 'translated';
  const showUntranslated = filterMode === 'all' || filterMode === 'untranslated';

  const out = [];
  for (let i = 0; i < f.dialogs.length; i++) {
    const d = f.dialogs[i];
    const hasTr = d.translated && String(d.translated).trim();
    if (hasTr && !showTranslated) continue;
    if (!hasTr && !showUntranslated) continue;

    if (q) {
      const src = String(d.quote || '').toLowerCase();
      const tr = String(d.translated || '').toLowerCase();
      if (!src.includes(q) && !tr.includes(q)) continue;
    }

    out.push(i);
  }

  state.activeView = out;
  state.virtual.viewIndexByRow = new Map();
  for (let pos = 0; pos < out.length; pos++) state.virtual.viewIndexByRow.set(out[pos], pos);
}

function resetSelection() {
  state.activeSelected.clear();
  ui.selAll.checked = false;
}

function makeSpacer(heightPx) {
  const tr = document.createElement('tr');
  tr.className = 'spacer';
  const td = document.createElement('td');
  td.colSpan = 5;
  td.style.height = `${Math.max(0, Math.floor(heightPx))}px`;
  tr.appendChild(td);
  return tr;
}

function renderRow(f, idx, warnOn) {
  const d = f.dialogs[idx];
  const trText = d.translated ?? '';
  const hasTr = String(trText).trim().length > 0;
  const warn = warnOn && (RENPH_TEST_RE.test(String(trText)) || OLD_RENPH_TEST_RE.test(String(trText)));

  const row = document.createElement('tr');
  row.className = 'tr-row' + (state.activeSelected.has(idx) ? ' selected' : '');
  row.classList.toggle('flagged', !!d.flagged);
  row.dataset.idx = String(idx);

  const tdSel = document.createElement('td');
  tdSel.className = 'col-sel';
  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.className = 'rowSel';
  cb.checked = state.activeSelected.has(idx);
  tdSel.appendChild(cb);

  const tdNo = document.createElement('td');
  tdNo.className = 'col-no';
  tdNo.textContent = String(idx + 1);

  const tdSrc = document.createElement('td');
  tdSrc.className = 'cell-src col-src';
  tdSrc.title = String(d.quote ?? '');
  const srcBox = document.createElement('div');
  srcBox.className = 'srcText';
  srcBox.textContent = String(d.quote ?? '');
  tdSrc.appendChild(srcBox);

  const tdTr = document.createElement('tdtr');
  tdTr.className = 'cell-tr col-tr';
  const ta = document.createElement('textarea');
  ta.spellcheck = false;
  ta.className = 'trInput';
  ta.value = String(trText ?? '');
  tdTr.appendChild(ta);

  const tdMeta = document.createElement('td');
  tdMeta.className = 'col-meta';
  
  const flagBtn = document.createElement('button');
  flagBtn.type = 'button';
  flagBtn.className = 'flagBtn' + (d.flagged ? ' on' : '');
  flagBtn.title = 'Flag this row';
  flagBtn.textContent = '⚑';
  flagBtn.addEventListener('click', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    toggleFlag(idx);
  });
  
  const status = document.createElement('span');
  status.className = 'metaStatus';
  
  tdMeta.append(flagBtn, status);
  
  {
    const v = String(trText ?? '');
    const hasTr2 = v.trim().length > 0;
    const warn2 = warnOn && (RENPH_TEST_RE.test(v) || OLD_RENPH_TEST_RE.test(v));
    status.className = 'metaStatus ' + (warn2 ? 'meta-warn' : hasTr2 ? 'meta-ok' : 'meta-none');
    status.textContent = warn2 ? 'PLACEHOLDER' : (hasTr2 ? 'OK' : '—');
  }

  row.append(tdSel, tdNo, tdSrc, tdTr, tdMeta);

  cb.addEventListener('change', () => {
    if (cb.checked) state.activeSelected.add(idx);
    else state.activeSelected.delete(idx);
    row.classList.toggle('selected', cb.checked);
  });

  row.addEventListener('click', (ev) => {
    if (ev.target && (ev.target.tagName === 'TEXTAREA' || ev.target.tagName === 'INPUT')) return;
    cb.checked = !cb.checked;
    cb.dispatchEvent(new Event('change'));
  });

  ta.addEventListener('focus', () => {
    row.classList.add('selected');
    state.editor.focusRow = idx;
    state.editor.focusPrev = ta.value; 
  });
  
  ta.addEventListener('blur', () => {
    row.classList.toggle('selected', cb.checked);
  
    if (state.editor.applying) return;
  
    const prev = String(state.editor.focusPrev ?? '');
    const next = String(ta.value ?? '');
    if (prev !== next) {
      pushHistory({
        path: state.activePath,
        row: idx,
        field: 'translated',
        prev,
        next,
        ts: Date.now(),
        source: 'manual',
      });
      state.editor.focusPrev = next;
      updateUndoRedoButtons();
    }
  });
  
  ta.addEventListener('input', () => {
    const v = ta.value;
    d.translated = v;
  
    if (ui.autoSave.checked) scheduleSaveActiveFile();
    scheduleUpdateTM(idx, v);
  
    const warnNow = !!ui.showWarnings.checked && (RENPH_TEST_RE.test(v) || OLD_RENPH_TEST_RE.test(v));
    const hasNow = String(v).trim().length > 0;
    status.className = 'metaStatus ' + (warnNow ? 'meta-warn' : hasNow ? 'meta-ok' : 'meta-none');
    status.textContent = warnNow ? 'PLACEHOLDER' : (hasNow ? 'OK' : '—');
  
    updateProjectStats();
  });

  return row;
}

function renderVirtual(force = false) {
  const path = state.activePath;
  if (!path) return;
  const f = state.files.get(path);
  if (!f) return;
  const total = state.activeView.length;

  const wrap = ui.tableWrap;
  const rowH = state.virtual.rowHeight;
  const overscan = state.virtual.overscan;
  const top = wrap.scrollTop;
  const vh = wrap.clientHeight || 1;
  const start = Math.max(0, Math.floor(top / rowH) - overscan);
  const end = Math.min(total, Math.ceil((top + vh) / rowH) + overscan);

  if (!force && start === state.virtual.lastStart && end === state.virtual.lastEnd) return;
  state.virtual.lastStart = start;
  state.virtual.lastEnd = end;

  const warnOn = !!ui.showWarnings.checked;
  const frag = document.createDocumentFragment();

  if (start > 0) frag.appendChild(makeSpacer(start * rowH));

  for (let pos = start; pos < end; pos++) {
    const idx = state.activeView[pos];
    frag.appendChild(renderRow(f, idx, warnOn));
  }

  if (end < total) frag.appendChild(makeSpacer((total - end) * rowH));

  ui.gridBody.replaceChildren(frag);
}

function renderTable({ resetSel = true, resetScroll = true } = {}) {
  if (resetSel) resetSelection();
  computeActiveView();
  state.virtual.lastStart = -1;
  state.virtual.lastEnd = -1;

  if (resetScroll && ui.tableWrap) ui.tableWrap.scrollTop = 0;
  renderVirtual(true);

  const path = state.activePath;
  if (!path) return;
  const count = state.activeView.length;
  setStatus(`${path} — ${count} rows shown`, '');
}

{
  let raf = 0;
  ui.tableWrap.addEventListener('scroll', () => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      renderVirtual(false);
    });
  }, { passive: true });

  window.addEventListener('resize', debounce(() => {
    state.virtual.lastStart = -1;
    state.virtual.lastEnd = -1;
    renderVirtual(true);
  }, 100));
}

ui.selAll.addEventListener('change', () => {
  const rows = ui.gridBody.querySelectorAll('tr.tr-row');
  const v = ui.selAll.checked;
  for (const r of rows) {
    const cb = r.querySelector('.rowSel');
    cb.checked = v;
    cb.dispatchEvent(new Event('change'));
  }
});

const scheduleSaveActiveFile = debounce(async () => {
  const p = state.activePath;
  if (!p) return;
  const f = state.files.get(p);
  if (!f) return;

  const payload = {
    path: f.path,
    source: f.source,
    eol: f.eol,
    dialogs: f.dialogs.map(d => ({
      lineIndex: d.lineIndex,
      contentStart: d.contentStart,
      contentEnd: d.contentEnd,
      quoteChar: d.quoteChar,
      isTriple: d.isTriple,
      quote: d.quote,
      maskedQuote: d.maskedQuote,
      placeholderMap: d.placeholderMap,
      translated: d.translated ?? null,
      flagged: !!d.flagged,
    })),
  };

  try {
    await Store.saveFile(PROJECT_ID, f.path, payload);
    setStatus(`${f.path} — saved`, '');
  } catch (e) {
    log('Save failed: ' + (e?.message || e), 'err');
  }
}, 800);

const scheduleUpdateTM = debounce(async (idx, value) => {
  const p = state.activePath;
  if (!p) return;
  const f = state.files.get(p);
  if (!f) return;
  const d = f.dialogs[idx];
  const target = ui.targetLangSelect.value;
  const t = String(value ?? '').trim();
  if (!t) return;

  try {
    await Store.tmPut(target, String(d.maskedQuote ?? ''), t, { source: 'manual' });
  } catch (e) {
  }
}, 600);

async function hydrateFromStorage() {
  try {
    const { project, files } = await Store.loadProject(PROJECT_ID);
    if (project) state.project = project;
    for (const f of files) {
      const dialogs = Array.isArray(f.dialogs) ? f.dialogs : [];
      state.files.set(f.path, {
        path: f.path,
        source: String(f.source ?? ''),
        eol: f.eol || '\n',
        dialogs: dialogs.map(x => ({ ...x })),
      });
    }
    updateProjectStats();
    renderFileList();

    if (state.files.size > 0 && !state.activePath) {
      openFile(Array.from(state.files.keys()).sort()[0]);
    }

    setStatus(state.files.size ? 'Project loaded from local storage.' : 'No project loaded.', '');
  } catch (e) {
    setStatus('Storage unavailable.', '');
  }
}

function applyExtractMode() {
  RENPY.setMode(ui.extractMode.value);
}

function splitNameExt(name) {
  const i = name.lastIndexOf('.');
  if (i <= 0) return { base: name, ext: '' };
  return { base: name.slice(0, i), ext: name.slice(i) };
}

function uniquePath(rawPath) {
  const norm = String(rawPath || '').replaceAll('\\', '/');
  if (!state.files.has(norm)) return norm;

  const parts = norm.split('/');
  const filename = parts.pop() || 'file.rpy';
  const { base, ext } = splitNameExt(filename);

  let k = 2;
  while (state.files.has([...parts, `${base} (${k})${ext}`].join('/'))) k++;
  return [...parts, `${base} (${k})${ext}`].join('/');
}

async function importFiles(fileList) {
  applyExtractMode();

  const items = Array.from(fileList || []).filter(f => f && (f.name || '').toLowerCase().endsWith('.rpy'));
  if (!items.length) return;

  setBusy(true);
  setStatus('Importing files…', '');
  let imported = 0;

  for (const file of items) {
    const text = await file.text();
    const { text: normalized, eol } = normalizeLineEndings(text);
    const dialogs = RENPY.extractDialogs(normalized);

    const rawPath = file.webkitRelativePath || file.name;
    const path = uniquePath(rawPath);
    state.files.set(path, { path, source: normalized, eol, dialogs });

    if (ui.autoSave.checked) {
      await Store.saveFile(PROJECT_ID, path, {
        path,
        source: normalized,
        eol,
        dialogs: dialogs.map(d => ({
          lineIndex: d.lineIndex,
          contentStart: d.contentStart,
          contentEnd: d.contentEnd,
          quoteChar: d.quoteChar,
          isTriple: d.isTriple,
          quote: d.quote,
          maskedQuote: d.maskedQuote,
          placeholderMap: d.placeholderMap,
          translated: d.translated ?? null,
          flagged: !!d.flagged,
        })),
      });
    }

    imported++;
  }

  await Store.saveProject(state.project);

  updateProjectStats();
  renderFileList();

  if (!state.activePath && state.files.size) openFile(Array.from(state.files.keys()).sort()[0]);

  setStatus(`Imported ${imported} file(s).`, '');
  setBusy(false);
}

function openFile(path) {
  state.activePath = path;
  renderFileList();
  renderTable();
  setBusy(false);
}

ui.btnOpenFiles.addEventListener('click', () => ui.fileInput.click());
ui.btnOpenFolder.addEventListener('click', () => ui.folderInput.click());
ui.fileInput.addEventListener('change', async () => { await importFiles(ui.fileInput.files); ui.fileInput.value = ''; });
ui.folderInput.addEventListener('change', async () => { await importFiles(ui.folderInput.files); ui.folderInput.value=''; });

ui.fileFilter.addEventListener('input', renderFileList);
ui.btnReload.addEventListener('click', async () => { await hydrateFromStorage(); });

ui.rowFilter.addEventListener('change', renderTable);
ui.tableSearch.addEventListener('input', debounce(renderTable, 120));
ui.showWarnings.addEventListener('change', () => renderTable({ resetSel: false, resetScroll: false }));

ui.extractMode.addEventListener('change', () => {
  applyExtractMode();
  const p = state.activePath;
  if (p) {
    const f = state.files.get(p);
    if (f) {
      f.dialogs = RENPY.extractDialogs(f.source);
      if (ui.autoSave.checked) scheduleSaveActiveFile();
      renderTable();
      updateProjectStats();
      log('Re-extracted current file using mode: ' + RENPY.getMode());
    }
  }
});

if (ui.btnUndo) ui.btnUndo.addEventListener('click', undo);
if (ui.btnRedo) ui.btnRedo.addEventListener('click', redo);
if (ui.btnCopyOriginal) ui.btnCopyOriginal.addEventListener('click', copyOriginal);
if (ui.btnCopyTranslate) ui.btnCopyTranslate.addEventListener('click', copyTranslate);

document.addEventListener('keydown', (e) => {
  const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
  const mod = isMac ? e.metaKey : e.ctrlKey;
  if (!mod) return;

  if (document.activeElement && document.activeElement.classList?.contains('trInput')) return;

  const k = e.key.toLowerCase();
  if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
  if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); redo(); }
});

async function fillMissingFromTM(path) {
  const f = state.files.get(path);
  if (!f) return 0;
  const target = ui.targetLangSelect.value;
  let filled = 0;
  for (const d of f.dialogs) {
    if (d.translated && String(d.translated).trim()) continue;
    const hit = await Store.tmGet(target, String(d.maskedQuote ?? ''));
    if (hit && String(hit.translation ?? '').trim()) {
      d.translated = String(hit.translation);
      filled++;
    }
  }
  return filled;
}

async function translateDialogs(path, indices) {
  const f = state.files.get(path);
  if (!f) return;

  const targetLang = ui.targetLangSelect.value;
  const engine = ui.engineSelect.value;
  const apiKey = String(ui.apiKey.value || '').trim();
  const batch = clamp(Number(ui.batchSize.value || 20), 1, 80);

  const list = indices.map(i => ({ idx: i, d: f.dialogs[i] })).filter(x => x.d);
  if (!list.length) return;

  setBusy(true);
  setStatus(`Translating ${list.length} line(s)…`, `${engine} → ${targetLang}`);
  log(`Translate: ${engine} → ${targetLang} (${list.length} items)`);

  let done = 0;

  for (let start = 0; start < list.length; start += batch) {
    const slice = list.slice(start, start + batch);
    let translated;
    const dialogsOnly = slice.map(x => x.d);
    
    if (engine === 'deepseek') translated = await translateBatchDeepSeek(dialogsOnly, targetLang, apiKey);
    else if (engine === 'deepl') translated = await translateBatchDeepL(dialogsOnly, targetLang, apiKey);
    else translated = await translateBatchLingva(dialogsOnly, targetLang);
    
    for (let i = 0; i < slice.length; i++) {
      const { idx, d } = slice[i];
      const prev = String(d.translated ?? '');
    
      const out = String(translated[i] ?? '');
      const unmasked = unmaskTagsInText(out, d.placeholderMap);
      d.translated = unmasked;
    
      pushHistory({ path, row: idx, field: 'translated', prev, next: String(unmasked ?? ''), ts: Date.now(), source: engine });
    
      if (ui.autoSave.checked) {
        Store.tmPut(targetLang, String(d.maskedQuote ?? ''), String(unmasked), { source: engine }).catch(()=>{});
      }
    }

    done += slice.length;
    setStatus(`Translating… ${done}/${list.length}`, `${engine} → ${targetLang}`);
    renderTable({ resetSel: false, resetScroll: false });
    updateUndoRedoButtons();
    if (ui.autoSave.checked) scheduleSaveActiveFile();
  }

  setStatus(`Done. Translated ${done} line(s).`, '');
  setBusy(false);
}

ui.btnTranslateMissing.addEventListener('click', async () => {
  const p = state.activePath;
  if (!p) return;
  const f = state.files.get(p);
  if (!f) return;

  if (ui.useTMFirst.checked) {
    setBusy(true);
    setStatus('Applying TM…', '');
    const filled = await fillMissingFromTM(p);
    if (filled) {
      log(`TM filled: ${filled} lines`);
      if (ui.autoSave.checked) scheduleSaveActiveFile();
    }
    setBusy(false);
  }

  const missing = [];
  for (let i = 0; i < f.dialogs.length; i++) {
    const d = f.dialogs[i];
    if (!d.translated || !String(d.translated).trim()) missing.push(i);
  }
  await translateDialogs(p, missing);
});

ui.btnTranslateSelected.addEventListener('click', async () => {
  const p = state.activePath;
  if (!p) return;
  const indices = Array.from(state.activeSelected.values()).sort((a,b)=>a-b);
  await translateDialogs(p, indices);
});

function makeDownload(name, text) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
}

ui.btnExportFile.addEventListener('click', () => {
  const p = state.activePath;
  if (!p) return;
  const f = state.files.get(p);
  if (!f) return;

  const out = RENPY.applyTranslations(f.source, f.dialogs, '\n', TRANSLATOR_CREDIT);
  const restored = restoreLineEndings(out, f.eol);
  const base = p.split('/').pop();
  makeDownload(base || 'translated.rpy', restored);
});

ui.btnExportZip.addEventListener('click', () => {
  const files = [];
  for (const f of state.files.values()) {
    const out = RENPY.applyTranslations(f.source, f.dialogs, '\n', TRANSLATOR_CREDIT);
    const restored = restoreLineEndings(out, f.eol);
    files.push({ name: String(f.path).replaceAll('\\\\','/'), data: new TextEncoder().encode(restored) });
  }
  downloadZip('vntl-export.zip', files);
});

ui.btnClear.addEventListener('click', async () => {
  if (!confirm('Clear local project and TM for current target language?')) return;
  const target = ui.targetLangSelect.value;
  try {
    await Store.deleteProject(PROJECT_ID);
    await Store.tmClear(target);
  } catch {}
  state.files.clear();
  state.activePath = null;
  ui.gridBody.innerHTML = '';
  updateProjectStats();
  renderFileList();
  setStatus('Cleared.', '');
});

function enableActions() {
  const hasFile = !!state.activePath;
  ui.btnTranslateMissing.disabled = !hasFile;
  ui.btnTranslateSelected.disabled = !hasFile;
  ui.btnExportFile.disabled = !hasFile;
  ui.btnExportZip.disabled = state.files.size === 0;
  ui.btnTmFillMissing.disabled = !hasFile;
}

ui.btnFind.addEventListener('click', () => {
  if (!state.activePath) return;
  state.find.matches = [];
  state.find.cursor = -1;
  ui.findStats.textContent = '0 matches.';
  openModal(ui.findModal);
  ui.findQuery.focus();
});

ui.btnTM.addEventListener('click', async () => {
  openModal(ui.tmModal);
  await renderTM();
});

ui.btnTmFillMissing.addEventListener('click', async () => {
  const p = state.activePath;
  if (!p) return;
  setBusy(true);
  setStatus('Applying TM…', '');
  const filled = await fillMissingFromTM(p);
  setBusy(false);
  renderTable();
  updateProjectStats();
  ui.findStats.textContent = '';
  log(`TM filled: ${filled}`);
  if (ui.autoSave.checked) scheduleSaveActiveFile();
});

async function renderTM() {
  const target = ui.targetLangSelect.value;
  const q = String(ui.tmSearch.value || '').toLowerCase().trim();
  const list = await Store.tmList(target, 2000);
  ui.tmList.innerHTML = '';
  const frag = document.createDocumentFragment();
  let shown = 0;

  for (const e of list) {
    const src = String(e.sourceMasked ?? '');
    const tr = String(e.translation ?? '');
    if (q && !src.toLowerCase().includes(q) && !tr.toLowerCase().includes(q)) continue;

    const item = document.createElement('div');
    item.className = 'tm-item';
    item.innerHTML = `
      <div class="tm-top">
        <div class="tm-k">${escapeHtml(e.key)} · ${escapeHtml(e.updatedAt)} · x${escapeHtml(e.count ?? 1)}</div>
        <div class="tm-actions">
          <button class="btn" data-tm-del="${escapeHtml(e.key)}">Delete</button>
        </div>
      </div>
      <div class="tm-src">${escapeHtml(src)}</div>
      <div class="tm-tr">${escapeHtml(tr)}</div>
    `;
    frag.appendChild(item);
    shown++;
    if (shown >= 400) break;
  }

  ui.tmList.appendChild(frag);

  ui.tmList.querySelectorAll('[data-tm-del]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const key = btn.getAttribute('data-tm-del');
      await Store.tmDelete(key);
      await renderTM();
    });
  });
}

ui.tmSearch.addEventListener('input', debounce(renderTM, 120));

ui.btnTmExport.addEventListener('click', async () => {
  const target = ui.targetLangSelect.value;
  const json = await Store.tmExport(target);
  makeDownload(`tm-${(LANG_TO_CODE[target] || target).toLowerCase()}.json`, json);
});

ui.btnTmImport.addEventListener('click', () => ui.tmImportInput.click());
ui.tmImportInput.addEventListener('change', async () => {
  const f = ui.tmImportInput.files?.[0];
  if (!f) return;
  const txt = await f.text();
  try {
    const n = await Store.tmImport(txt);
    log(`Imported TM entries: ${n}`);
  } catch (e) {
    log('TM import failed: ' + (e?.message || e), 'err');
  }
  ui.tmImportInput.value = '';
  await renderTM();
});

ui.btnTmClear.addEventListener('click', async () => {
  const target = ui.targetLangSelect.value;
  if (!confirm(`Clear TM for target: ${target}?`)) return;
  await Store.tmClear(target);
  await renderTM();
});

function computeFindMatches() {
  const p = state.activePath;
  if (!p) return [];
  const f = state.files.get(p);
  if (!f) return [];

  const q = ui.findQuery.value;
  const re = buildMatcher(q, ui.findRegex.checked, ui.findCase.checked);
  if (!re) return [];

  const scope = ui.findScope.value;
  const rowsMode = ui.findRows.value;

  if (scope === 'source') {
    log('Replace does not modify Source. Switch scope to Translation/Both.', 'warn');
    return;
  }

  let candidates = [];
  if (rowsMode === 'selected') candidates = Array.from(state.activeSelected.values());
  else if (rowsMode === 'filtered') candidates = state.activeView.slice();
  else candidates = f.dialogs.map((_, i) => i);

  const matches = [];
  for (const i of candidates) {
    const d = f.dialogs[i];
    if (!d) continue;
    if (scope === 'source' || scope === 'both') {
      for (const m of findAllInText(d.quote || '', re)) matches.push({ row: i, field: 'source', index: m.index, len: m.len });
    }
    if (scope === 'translation' || scope === 'both') {
      for (const m of findAllInText(d.translated || '', re)) matches.push({ row: i, field: 'translation', index: m.index, len: m.len });
    }
  }
  return sortMatches(matches);
}

function focusMatch(m) {
  const p = state.activePath;
  if (!p) return;

  let pos = state.virtual.viewIndexByRow.get(m.row);
  if (pos == null) {
    ui.rowFilter.value = 'all';
    ui.tableSearch.value = '';
    renderTable({ resetSel: false, resetScroll: false });
    pos = state.virtual.viewIndexByRow.get(m.row);
  }
  if (pos == null) return;

  const wrap = ui.tableWrap;
  const rowH = state.virtual.rowHeight;
  const targetTop = Math.max(0, pos * rowH - (wrap.clientHeight / 2) + (rowH / 2));
  wrap.scrollTo({ top: targetTop, behavior: 'smooth' });

  let tries = 0;
  const tryFocus = () => {
    tries++;
    renderVirtual(true);
    const r2 = ui.gridBody.querySelector(`tr[data-idx="${m.row}"]`);
    if (!r2) {
      if (tries < 30) requestAnimationFrame(tryFocus);
      return;
    }
    if (m.field === 'translation') {
      const ta = r2.querySelector('.trInput');
      ta.focus();
      const start = m.index;
      const end = m.index + m.len;
      ta.setSelectionRange(start, end);
    }
  };
  requestAnimationFrame(tryFocus);
}

function updateFindUI() {
  const total = state.find.matches.length;
  ui.findStats.textContent = total ? `${total} matches. (${state.find.cursor + 1}/${total})` : '0 matches.';
}

function ensureMatches() {
  state.find.matches = computeFindMatches();
  state.find.cursor = state.find.matches.length ? 0 : -1;
  updateFindUI();
  if (state.find.cursor >= 0) focusMatch(state.find.matches[state.find.cursor]);
}

ui.findQuery.addEventListener('input', debounce(ensureMatches, 180));
ui.findCase.addEventListener('change', ensureMatches);
ui.findRegex.addEventListener('change', ensureMatches);
ui.findScope.addEventListener('change', ensureMatches);
ui.findRows.addEventListener('change', ensureMatches);

ui.btnFindNext.addEventListener('click', () => {
  const total = state.find.matches.length;
  if (!total) return;
  state.find.cursor = nextIndex(total, state.find.cursor, +1);
  updateFindUI();
  focusMatch(state.find.matches[state.find.cursor]);
});

ui.btnFindPrev.addEventListener('click', () => {
  const total = state.find.matches.length;
  if (!total) return;
  state.find.cursor = nextIndex(total, state.find.cursor, -1);
  updateFindUI();
  focusMatch(state.find.matches[state.find.cursor]);
});

ui.btnReplaceAll.addEventListener('click', async () => {
  const p = state.activePath;
  if (!p) return;
  const f = state.files.get(p);
  if (!f) return;

  const re = buildMatcher(ui.findQuery.value, ui.findRegex.checked, ui.findCase.checked);
  if (!re) return;

  const scope = ui.findScope.value;
  const rowsMode = ui.findRows.value;

  if (scope === 'source') {
    log('Replace does not modify Source. Switch scope to Translation/Both.', 'warn');
    return;
  }

  let candidates = [];
  if (rowsMode === 'selected') candidates = Array.from(state.activeSelected.values());
  else if (rowsMode === 'filtered') candidates = state.activeView.slice();
  else candidates = f.dialogs.map((_, i) => i);

  let replaced = 0;
  const rep = ui.replaceQuery.value;

  for (const i of candidates) {
    const d = f.dialogs[i];
    if (!d) continue;

    if (scope === 'translation' || scope === 'both') {
      const before = d.translated || '';
      const after = replaceAll(before, re, rep);
      if (after !== before) replaced++;
      d.translated = after;
      if (String(after).trim()) Store.tmPut(ui.targetLangSelect.value, String(d.maskedQuote ?? ''), String(after), { source: 'findreplace' }).catch(()=>{});
    }
  }

  renderTable();
  updateProjectStats();
  ensureMatches();

  if (ui.autoSave.checked) scheduleSaveActiveFile();
  log(`Replace all: ${replaced} replacements`);
});

ui.btnReplaceOne.addEventListener('click', async () => {
  if (state.find.cursor < 0) return;
  const m = state.find.matches[state.find.cursor];
  if (m.field !== 'translation') {
    log('Replace works on Translation field. Change "In" to Translation/Both.', 'warn');
    return;
  }
  const p = state.activePath;
  const f = state.files.get(p);
  const d = f.dialogs[m.row];
  const re = buildMatcher(ui.findQuery.value, ui.findRegex.checked, ui.findCase.checked);
  if (!re) return;
  const rep = ui.replaceQuery.value;

  const text = String(d.translated || '');
  re.lastIndex = 0;
  let mm;
  let found = null;
  while ((mm = re.exec(text)) !== null) {
    if (mm.index === m.index) { found = mm; break; }
    if (mm[0].length === 0) re.lastIndex++;
  }
  if (!found) { ensureMatches(); return; }
  const before = text.slice(0, found.index);
  const after = text.slice(found.index + found[0].length);
  const out = before + String(rep ?? '') + after;
  d.translated = out;

  Store.tmPut(ui.targetLangSelect.value, String(d.maskedQuote ?? ''), String(out), { source: 'findreplace' }).catch(()=>{});
  if (ui.autoSave.checked) scheduleSaveActiveFile();
  renderTable();
  ensureMatches();
});

ui.btnExportFile.disabled = true;
ui.btnExportZip.disabled = true;
ui.btnTranslateMissing.disabled = true;
ui.btnTranslateSelected.disabled = true;

ui.targetLangSelect.addEventListener('change', async () => {
  if (!ui.tmModal.hidden) await renderTM();
});

await hydrateFromStorage();
enableActions();

setInterval(() => enableActions(), 500);