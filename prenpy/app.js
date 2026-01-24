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
}

function renderTable() {
  ui.gridBody.innerHTML = '';
  state.activeSelected.clear();
  ui.selAll.checked = false;

  computeActiveView();
  const path = state.activePath;
  if (!path) return;
  const f = state.files.get(path);
  if (!f) return;

  const frag = document.createDocumentFragment();
  const warnOn = !!ui.showWarnings.checked;

  for (const idx of state.activeView) {
    const d = f.dialogs[idx];
    const tr = d.translated ?? '';
    const hasTr = String(tr).trim().length > 0;
    const warn = warnOn && (RENPH_TEST_RE.test(String(tr)) || OLD_RENPH_TEST_RE.test(String(tr)));

    const row = document.createElement('tr');
    row.className = 'tr-row';
    row.dataset.idx = String(idx);

    const tdSel = document.createElement('td');
    tdSel.className = 'col-sel';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.className = 'rowSel';
    tdSel.appendChild(cb);

    const tdNo = document.createElement('td');
    tdNo.className = 'col-no';
    tdNo.textContent = String(idx + 1);

    const tdSrc = document.createElement('td');
    tdSrc.className = 'cell-src';
    tdSrc.textContent = String(d.quote ?? '');

    const tdTr = document.createElement('td');
    tdTr.className = 'cell-tr';
    const ta = document.createElement('textarea');
    ta.spellcheck = false;
    ta.className = 'trInput';
    ta.value = String(tr ?? '');
    tdTr.appendChild(ta);

    const tdMeta = document.createElement('td');
    tdMeta.className = 'col-meta';
    tdMeta.innerHTML = warn ? '<span class="meta-warn">PLACEHOLDER</span>' : (hasTr ? '<span class="meta-ok">OK</span>' : '—');

    row.append(tdSel, tdNo, tdSrc, tdTr, tdMeta);

    cb.addEventListener('change', () => {
      const i = Number(row.dataset.idx);
      if (cb.checked) state.activeSelected.add(i);
      else state.activeSelected.delete(i);
      row.classList.toggle('selected', cb.checked);
    });

    row.addEventListener('click', (ev) => {
      if (ev.target && (ev.target.tagName === 'TEXTAREA' || ev.target.tagName === 'INPUT')) return;
      cb.checked = !cb.checked;
      cb.dispatchEvent(new Event('change'));
    });

    ta.addEventListener('focus', () => row.classList.add('selected'));
    ta.addEventListener('blur', () => row.classList.toggle('selected', cb.checked));
    ta.addEventListener('input', () => {
      const v = ta.value;
      d.translated = v;
      if (ui.autoSave.checked) scheduleSaveActiveFile();
      scheduleUpdateTM(idx, v);
      tdMeta.innerHTML = (warnOn && (RENPH_TEST_RE.test(v) || OLD_RENPH_TEST_RE.test(v)))
        ? '<span class="meta-warn">PLACEHOLDER</span>'
        : (String(v).trim() ? '<span class="meta-ok">OK</span>' : '—');
      updateProjectStats();
    });

    frag.appendChild(row);
  }

  ui.gridBody.appendChild(frag);

  const count = state.activeView.length;
  setStatus(`${path} — ${count} rows shown`, '');
}

ui.selAll.addEventListener('change', () => {
  const rows = ui.gridBody.querySelectorAll('tr');
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
    /* noop */
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

    const path = file.webkitRelativePath || file.name;
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
ui.showWarnings.addEventListener('change', renderTable);

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

  const list = indices.map(i => f.dialogs[i]).filter(Boolean);
  if (!list.length) return;

  setBusy(true);
  setStatus(`Translating ${list.length} line(s)…`, `${engine} → ${targetLang}`);
  log(`Translate: ${engine} → ${targetLang} (${list.length} items)`);

  let done = 0;

  for (let start = 0; start < list.length; start += batch) {
    const slice = list.slice(start, start + batch);
    let translated;

    if (engine === 'deepseek') translated = await translateBatchDeepSeek(slice, targetLang, apiKey);
    else if (engine === 'deepl') translated = await translateBatchDeepL(slice, targetLang, apiKey);
    else translated = await translateBatchLingva(slice, targetLang);

    for (let i = 0; i < slice.length; i++) {
      const d = slice[i];
      const out = String(translated[i] ?? '');
      const unmasked = unmaskTagsInText(out, d.placeholderMap);
      d.translated = unmasked;

      if (ui.autoSave.checked) {
        Store.tmPut(targetLang, String(d.maskedQuote ?? ''), String(unmasked), { source: engine }).catch(() => {});
      }
    }

    done += slice.length;
    setStatus(`Translating… ${done}/${list.length}`, `${engine} → ${targetLang}`);
    renderTable();
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
  downloadZip('prenpy-export.zip', files);
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
  const rowEl = ui.gridBody.querySelector(`tr[data-idx="${m.row}"]`);
  if (!rowEl) {
    const p = state.activePath;
    if (!p) return;
    ui.rowFilter.value = 'all';
    ui.tableSearch.value = '';
    renderTable();
  }

  const r2 = ui.gridBody.querySelector(`tr[data-idx="${m.row}"]`);
  if (!r2) return;
  r2.scrollIntoView({ block: 'center', behavior: 'smooth' });

  if (m.field === 'translation') {
    const ta = r2.querySelector('.trInput');
    ta.focus();
    const start = m.index;
    const end = m.index + m.len;
    ta.setSelectionRange(start, end);
  }
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
