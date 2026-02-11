(function () {
  'use strict';

  const TRANSLATOR_CREDIT = '# Translated by VN Translator: https://vntranslator.vercel.app/ or https://vntranslator.pages.dev/';
  const RENPH_RE = /⟦\s*RENPH\s*(?:\{\s*(\d+)\s*\}|(\d+))\s*⟧/g;
  const RENPH_TEST_RE = /⟦\s*RENPH\s*(?:\{\s*\d+\s*\}|\d+)\s*⟧/;
  const OLD_RENPH_TEST_RE = /__RENPLH_\d+__/;

  const el = {
    metaChips: document.getElementById('metaChips'),
    sessionsBtn: document.getElementById('sessionsBtn'),
    downloadBtn: document.getElementById('downloadBtn'),
    searchInput: document.getElementById('searchInput'),
    filterSelect: document.getElementById('filterSelect'),
    scopeSelect: document.getElementById('scopeSelect'),
    statsBar: document.getElementById('statsBar'),
    listViewport: document.getElementById('listViewport'),
    listSpacer: document.getElementById('listSpacer'),
    listItems: document.getElementById('listItems'),
    bulkBar: document.getElementById('bulkBar'),
    bulkCount: document.getElementById('bulkCount'),
    bulkClearSelection: document.getElementById('bulkClearSelection'),
    bulkReview: document.getElementById('bulkReview'),
    bulkUnreview: document.getElementById('bulkUnreview'),
    bulkRestore: document.getElementById('bulkRestore'),
    bulkRetranslate: document.getElementById('bulkRetranslate'),
    editorSub: document.getElementById('editorSub'),
    saveIndicator: document.getElementById('saveIndicator'),
    originalBox: document.getElementById('originalBox'),
    translationBox: document.getElementById('translationBox'),
    warnings: document.getElementById('warnings'),
    toggleReviewedBtn: document.getElementById('toggleReviewedBtn'),
    restoreBtn: document.getElementById('restoreBtn'),
    retranslateBtn: document.getElementById('retranslateBtn'),
    copyOriginalBtn: document.getElementById('copyOriginalBtn'),
    copyTranslationBtn: document.getElementById('copyTranslationBtn'),
    vnName: document.getElementById('vnName'),
    vnText: document.getElementById('vnText'),
    contextBox: document.getElementById('contextBox'),
    sessionModal: document.getElementById('sessionModal'),
    closeSessionsBtn: document.getElementById('closeSessionsBtn'),
    sessionList: document.getElementById('sessionList'),
    toastHost: document.getElementById('toastHost'),
  };

  const app = {
    sessionId: null,
    session: null,
    dialogs: [],
    lineStarts: [],
    lines: [],
    filtered: [],
    filteredPos: new Map(),
    activePos: 0,
    selected: new Set(),
    search: '',
    filter: 'all',
    scope: 'both',
    rowH: 64,
    rafPending: false,
    saveTimer: null,
    savePending: false,
    saveLastAt: 0,
    savingNow: false,
    bulkBusy: false,
  };

  function nowMs() {
    return Date.now();
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function clamp(n, a, b) {
    return Math.max(a, Math.min(b, n));
  }

  function createDot(kind) {
    const d = document.createElement('span');
    d.className = 'pv-dot' + (kind ? ' pv-dot--' + kind : '');
    d.setAttribute('aria-hidden', 'true');
    return d;
  }

  function chip(label, value, kind) {
    const c = document.createElement('div');
    c.className = 'pv-chip';
    c.appendChild(createDot(kind || ''));
    const t = document.createElement('span');
    t.textContent = label + ': ' + value;
    c.appendChild(t);
    return c;
  }

  function toast(title, message, kind) {
    if (!el.toastHost) return;
    const box = document.createElement('div');
    box.className = 'pv-toast';
    const icon = document.createElement('div');
    icon.className = kind === 'spin' ? 'pv-spin' : 'pv-dot' + (kind ? ' pv-dot--' + kind : '');
    const body = document.createElement('div');
    const tt = document.createElement('div');
    tt.className = 'pv-toastTitle';
    tt.textContent = title;
    const msg = document.createElement('div');
    msg.className = 'pv-toastMsg';
    msg.textContent = message;
    body.append(tt, msg);
    box.append(icon, body);
    el.toastHost.appendChild(box);
    setTimeout(() => {
      box.style.opacity = '0';
      box.style.transform = 'translateY(6px)';
      setTimeout(() => box.remove(), 220);
    }, 4200);
  }

  function modalOpen(open) {
    if (!el.sessionModal) return;
    el.sessionModal.dataset.open = open ? 'true' : 'false';
    el.sessionModal.setAttribute('aria-hidden', open ? 'false' : 'true');
  }

  function parseQuery() {
    const u = new URL(window.location.href);
    const sessionId = u.searchParams.get('session');
    return { sessionId: sessionId ? String(sessionId) : null };
  }

  function modelLabel(model) {
    const m = String(model || '').toLowerCase().trim();
    if (m === 'deepseek') return 'DeepSeek';
    if (m === 'deepl') return 'DeepL';
    if (m === 'libre') return 'Lingva';
    return model || 'Unknown';
  }

  function buildLineStarts(source) {
    const starts = [0];
    for (let i = 0; i < source.length; i++) {
      if (source[i] === '\n') starts.push(i + 1);
    }
    return starts;
  }

  function offsetToLine(lineStarts, offset) {
    let lo = 0;
    let hi = lineStarts.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const v = lineStarts[mid];
      if (v <= offset) lo = mid + 1;
      else hi = mid - 1;
    }
    return Math.max(0, Math.min(hi, lineStarts.length - 1));
  }

  function countTagsByType(text) {
    const result = { square: 0, curly: 0 };
    const s = String(text || '');
    if (!s) return result;
    const re = /\[[^\[\]]*\]|\{[^{}]*\}/g;
    const matches = s.match(re);
    if (!matches) return result;
    for (const m of matches) {
      if (m[0] === '[') result.square++;
      else if (m[0] === '{') result.curly++;
    }
    return result;
  }

  function validateTagConsistency(originalText, translatedText) {
    const issues = [];
    const src = countTagsByType(originalText);
    const tgt = countTagsByType(translatedText);

    if (RENPH_TEST_RE.test(translatedText)) issues.push({ kind: 'bad', text: 'Placeholder token ⟦RENPH{...}⟧ is still present in translation.' });
    if (OLD_RENPH_TEST_RE.test(translatedText)) issues.push({ kind: 'bad', text: 'Old placeholder token __RENPLH_*__ is still present in translation.' });
    if (src.square !== tgt.square) issues.push({ kind: 'warn', text: 'Square tag count mismatch: ' + src.square + ' → ' + tgt.square });
    if (src.curly !== tgt.curly) issues.push({ kind: 'warn', text: 'Curly tag count mismatch: ' + src.curly + ' → ' + tgt.curly });
    return issues;
  }

  function normalizeText(s) {
    return String(s || '').replace(/\s+/g, ' ').trim();
  }

  function computeWarnings(dialog) {
    const out = [];
    const t = String(dialog.translated || '');
    if (!t.trim()) out.push({ kind: 'warn', text: 'Empty translation.' });
    if (t.length > 750) out.push({ kind: 'warn', text: 'Very long translation (' + t.length + ' chars).' });
    out.push(...validateTagConsistency(dialog.quote || '', t));
    return out;
  }

  function updateComputed(dialog) {
    dialog._empty = !String(dialog.translated || '').trim();
    dialog._edited = normalizeText(dialog.translated) !== normalizeText(dialog.machineTranslated);
    dialog._warnings = computeWarnings(dialog);
    dialog._warn = dialog._warnings.some(w => w.kind === 'warn' || w.kind === 'bad');
  }

  function computeStats() {
    const total = app.dialogs.length;
    let edited = 0;
    let empty = 0;
    let warnings = 0;
    let reviewed = 0;
    for (const d of app.dialogs) {
      if (d._edited) edited++;
      if (d._empty) empty++;
      if (d._warn) warnings++;
      if (d.reviewed) reviewed++;
    }
    return { total, edited, empty, warnings, reviewed, unreviewed: total - reviewed };
  }

  function renderMetaChips() {
    if (!el.metaChips || !app.session) return;
    const s = computeStats();
    el.metaChips.replaceChildren(
      chip('File', app.session.fileName || 'script.rpy'),
      chip('Model', modelLabel(app.session.model), app.session.model === 'deepseek' ? 'ok' : ''),
      chip('Target', app.session.targetLang || 'English'),
      chip('Dialogs', String(s.total)),
      chip('Edited', String(s.edited), s.edited ? 'warn' : 'ok'),
      chip('Warnings', String(s.warnings), s.warnings ? 'warn' : 'ok')
    );
  }

  function renderStatsBar() {
    if (!el.statsBar) return;
    const s = computeStats();
    el.statsBar.replaceChildren(
      chip('Total', String(s.total)),
      chip('Unreviewed', String(s.unreviewed), s.unreviewed ? 'warn' : 'ok'),
      chip('Edited', String(s.edited), s.edited ? 'warn' : 'ok'),
      chip('Empty', String(s.empty), s.empty ? 'bad' : 'ok')
    );
  }

  function dialogMatches(dialog, query, scope) {
    if (!query) return true;
    const q = query.toLowerCase();
    const orig = String(dialog.quote || '').toLowerCase();
    const tr = String(dialog.translated || '').toLowerCase();
    if (scope === 'original') return orig.includes(q);
    if (scope === 'translation') return tr.includes(q);
    return orig.includes(q) || tr.includes(q);
  }

  function dialogPassesFilter(dialog, filter) {
    if (filter === 'all') return true;
    if (filter === 'unreviewed') return !dialog.reviewed;
    if (filter === 'reviewed') return !!dialog.reviewed;
    if (filter === 'edited') return !!dialog._edited;
    if (filter === 'empty') return !!dialog._empty;
    if (filter === 'warnings') return !!dialog._warn;
    return true;
  }

  function rebuildFilter() {
    const query = normalizeText(app.search).toLowerCase();
    const filter = app.filter;
    const scope = app.scope;

    const out = [];
    for (let i = 0; i < app.dialogs.length; i++) {
      const d = app.dialogs[i];
      if (!dialogPassesFilter(d, filter)) continue;
      if (!dialogMatches(d, query, scope)) continue;
      out.push(i);
    }
    app.filtered = out;
    app.filteredPos = new Map();
    for (let i = 0; i < out.length; i++) app.filteredPos.set(out[i], i);
    app.activePos = clamp(app.activePos, 0, Math.max(0, out.length - 1));
    scheduleListRender();
  }

  function setActivePos(pos) {
    app.activePos = clamp(pos, 0, Math.max(0, app.filtered.length - 1));
    scheduleListRender();
    renderEditor();
  }

  function activeDialog() {
    if (!app.filtered.length) return null;
    const idx = app.filtered[app.activePos];
    return app.dialogs[idx] || null;
  }

  function ensureActiveVisible() {
    if (!el.listViewport) return;
    const top = app.activePos * app.rowH;
    const bottom = top + app.rowH;
    const viewTop = el.listViewport.scrollTop;
    const viewBottom = viewTop + el.listViewport.clientHeight;
    if (top < viewTop) el.listViewport.scrollTop = top;
    else if (bottom > viewBottom) el.listViewport.scrollTop = Math.max(0, bottom - el.listViewport.clientHeight);
  }

  function flagPill(label, kind) {
    const f = document.createElement('span');
    f.className = 'pv-flag' + (kind ? ' pv-flag--' + kind : '');
    const d = document.createElement('span');
    d.className = 'pv-dot' + (kind ? ' pv-dot--' + kind : '');
    d.setAttribute('aria-hidden', 'true');
    const t = document.createElement('span');
    t.textContent = label;
    f.append(d, t);
    return f;
  }

  function renderRow(dialog, pos, idx) {
    const row = document.createElement('div');
    row.className = 'pv-row';
    row.dataset.pos = String(pos);
    row.dataset.idx = String(idx);
    row.setAttribute('role', 'option');
    row.setAttribute('aria-selected', pos === app.activePos ? 'true' : 'false');

    const check = document.createElement('div');
    check.className = 'pv-check';
    check.dataset.checked = app.selected.has(idx) ? 'true' : 'false';
    check.dataset.action = 'toggleSelect';
    const checkDot = document.createElement('span');
    checkDot.className = 'pv-dot pv-dot--ok';
    checkDot.style.opacity = app.selected.has(idx) ? '1' : '0';
    check.appendChild(checkDot);

    const main = document.createElement('div');
    main.className = 'pv-rowMain';

    const top = document.createElement('div');
    top.className = 'pv-rowTop';

    const title = document.createElement('div');
    title.className = 'pv-rowTitle';
    const line = Number.isFinite(dialog.lineIndex) ? (dialog.lineIndex + 1) : '?';
    title.textContent = '#' + (idx + 1) + ' • line ' + line;

    const flags = document.createElement('div');
    flags.className = 'pv-rowFlags';
    if (dialog.reviewed) flags.appendChild(flagPill('Reviewed', 'ok'));
    else flags.appendChild(flagPill('Unreviewed', 'warn'));
    if (dialog._edited) flags.appendChild(flagPill('Edited', 'warn'));
    if (dialog._empty) flags.appendChild(flagPill('Empty', 'bad'));
    if (dialog._warn && !dialog._empty) flags.appendChild(flagPill('Warn', dialog._warnings.some(w => w.kind === 'bad') ? 'bad' : 'warn'));

    top.append(title, flags);

    const orig = document.createElement('div');
    orig.className = 'pv-rowText';
    orig.textContent = String(dialog.quote || '');

    const tr = document.createElement('div');
    tr.className = 'pv-rowSub';
    tr.textContent = String(dialog.translated || '');

    main.append(top, orig, tr);
    row.append(check, main);
    return row;
  }

  function scheduleListRender() {
    if (app.rafPending) return;
    app.rafPending = true;
    requestAnimationFrame(() => {
      app.rafPending = false;
      renderList();
    });
  }

  function renderList() {
    if (!el.listViewport || !el.listSpacer || !el.listItems) return;
    const total = app.filtered.length;
    el.listSpacer.style.height = String(total * app.rowH) + 'px';
    const scrollTop = el.listViewport.scrollTop;
    const viewH = el.listViewport.clientHeight;
    const overscan = 6;
    const start = clamp(Math.floor(scrollTop / app.rowH) - overscan, 0, Math.max(0, total - 1));
    const end = clamp(start + Math.ceil(viewH / app.rowH) + overscan * 2, 0, total);
    const offset = start * app.rowH;

    el.listItems.style.transform = 'translateY(' + offset + 'px)';
    el.listItems.replaceChildren();
    const frag = document.createDocumentFragment();
    for (let pos = start; pos < end; pos++) {
      const idx = app.filtered[pos];
      const dialog = app.dialogs[idx];
      if (!dialog) continue;
      frag.appendChild(renderRow(dialog, pos, idx));
    }
    el.listItems.appendChild(frag);
    renderBulkBar();
  }

  function renderBulkBar() {
    if (!el.bulkBar || !el.bulkCount) return;
    const n = app.selected.size;
    if (n) {
      el.bulkBar.hidden = false;
      el.bulkCount.textContent = String(n) + ' selected';
    } else {
      el.bulkBar.hidden = true;
      el.bulkCount.textContent = '0 selected';
    }
  }

  function renderWarnings(dialog) {
    if (!el.warnings) return;
    el.warnings.replaceChildren();
    const list = Array.isArray(dialog?._warnings) ? dialog._warnings : [];
    for (const w of list) {
      const d = document.createElement('div');
      d.className = 'pv-warning' + (w.kind === 'bad' ? ' pv-warning--bad' : '');
      d.textContent = w.text;
      el.warnings.appendChild(d);
    }
  }

  function speakerFor(dialog) {
    if (!app.session || !app.lines.length) return 'Narrator';
    if (!Number.isFinite(dialog.lineIndex)) return 'Narrator';
    const lineIndex = dialog.lineIndex;
    const line = app.lines[lineIndex] || '';
    const startOffset = app.lineStarts[lineIndex] || 0;
    const delimLen = dialog.isTriple ? 3 : 1;
    const openQuoteStart = (Number.isFinite(dialog.contentStart) ? dialog.contentStart : startOffset) - delimLen;
    const quotePos = clamp(openQuoteStart - startOffset, 0, line.length);
    const prefix = line.slice(0, quotePos);
    const p = prefix.trim();
    if (!p) return 'Narrator';
    const tok = p.split(/\s+/)[0];
    if (!tok) return 'Narrator';
    if (/^"|^'/.test(tok)) return 'Narrator';
    return tok;
  }

  function renderContext(dialog) {
    if (!el.contextBox) return;
    if (!app.lines.length || !Number.isFinite(dialog.lineIndex)) {
      el.contextBox.replaceChildren();
      return;
    }
    const center = dialog.lineIndex;
    const from = Math.max(0, center - 4);
    const to = Math.min(app.lines.length - 1, center + 4);

    const frag = document.createDocumentFragment();
    for (let i = from; i <= to; i++) {
      const row = document.createElement('div');
      row.className = 'pv-codeLine' + (i === center ? ' pv-codeLine--active' : '');
      const no = document.createElement('div');
      no.className = 'pv-codeNo';
      no.textContent = String(i + 1);
      const tx = document.createElement('div');
      tx.className = 'pv-codeText';
      tx.textContent = app.lines[i] || '';
      row.append(no, tx);
      frag.appendChild(row);
    }
    el.contextBox.replaceChildren();
    el.contextBox.appendChild(frag);
  }

  function setEditorButtonsEnabled(enabled) {
    const ids = [
      el.toggleReviewedBtn,
      el.restoreBtn,
      el.retranslateBtn,
      el.copyOriginalBtn,
      el.copyTranslationBtn,
    ];
    for (const b of ids) if (b) b.disabled = !enabled;
    if (el.translationBox) el.translationBox.disabled = !enabled;
  }

  function renderEditor() {
    const d = activeDialog();
    if (!d) {
      if (el.editorSub) el.editorSub.textContent = 'No dialog selected';
      if (el.originalBox) el.originalBox.value = '';
      if (el.translationBox) el.translationBox.value = '';
      if (el.vnName) el.vnName.textContent = 'Narrator';
      if (el.vnText) el.vnText.textContent = '';
      if (el.contextBox) el.contextBox.replaceChildren();
      if (el.warnings) el.warnings.replaceChildren();
      setEditorButtonsEnabled(false);
      if (el.downloadBtn) el.downloadBtn.disabled = true;
      return;
    }

    setEditorButtonsEnabled(true);
    if (el.downloadBtn) el.downloadBtn.disabled = false;
    if (el.originalBox) el.originalBox.value = String(d.quote || '');
    if (el.translationBox && el.translationBox.value !== String(d.translated || '')) el.translationBox.value = String(d.translated || '');

    const idx = d.idx + 1;
    const line = Number.isFinite(d.lineIndex) ? (d.lineIndex + 1) : '?';
    const extra = d.reviewed ? 'Reviewed' : 'Unreviewed';
    if (el.editorSub) el.editorSub.textContent = 'Dialog #' + idx + ' • line ' + line + ' • ' + extra;

    if (el.toggleReviewedBtn) el.toggleReviewedBtn.textContent = d.reviewed ? 'Unreview' : 'Mark reviewed';
    renderWarnings(d);

    if (el.vnName) el.vnName.textContent = speakerFor(d);
    if (el.vnText) el.vnText.textContent = String(d.translated || '') || String(d.quote || '');
    renderContext(d);
    updateSaveIndicator();
  }

  function updateSaveIndicator() {
    if (!el.saveIndicator) return;
    if (app.savingNow) {
      el.saveIndicator.replaceChildren(createDot('warn'));
      const t = document.createElement('span');
      t.textContent = 'Saving…';
      el.saveIndicator.appendChild(t);
      return;
    }
    if (app.savePending) {
      el.saveIndicator.replaceChildren(createDot('warn'));
      const t = document.createElement('span');
      t.textContent = 'Pending';
      el.saveIndicator.appendChild(t);
      return;
    }
    if (app.saveLastAt) {
      el.saveIndicator.replaceChildren(createDot('ok'));
      const t = document.createElement('span');
      t.textContent = 'Saved';
      el.saveIndicator.appendChild(t);
      return;
    }
    el.saveIndicator.replaceChildren();
  }

  function scheduleSaveCurrent() {
    if (app.saveTimer) clearTimeout(app.saveTimer);
    app.savePending = true;
    updateSaveIndicator();
    app.saveTimer = setTimeout(() => {
      app.saveTimer = null;
      saveCurrent().catch(() => {});
    }, 260);
  }

  function toDbDialog(d) {
    return {
      sessionId: d.sessionId,
      idx: d.idx,
      lineIndex: d.lineIndex,
      contentStart: d.contentStart,
      contentEnd: d.contentEnd,
      quoteChar: d.quoteChar,
      isTriple: d.isTriple,
      quote: d.quote,
      maskedQuote: d.maskedQuote,
      placeholderMap: d.placeholderMap,
      machineTranslated: d.machineTranslated,
      translated: d.translated,
      reviewed: d.reviewed,
      updatedAt: d.updatedAt,
    };
  }

  async function saveCurrent() {
    const d = activeDialog();
    if (!d || !app.sessionId || !window.VNDB) return;
    app.savePending = false;
    app.savingNow = true;
    updateSaveIndicator();
    try {
      d.updatedAt = nowMs();
      await window.VNDB.putDialog(toDbDialog(d));
      await window.VNDB.touchSession(app.sessionId, { dialogCount: app.dialogs.length });
      app.saveLastAt = nowMs();
    } catch (err) {
      toast('Save failed', String(err?.message || err), 'bad');
    } finally {
      app.savingNow = false;
      updateSaveIndicator();
      renderMetaChips();
      renderStatsBar();
      scheduleListRender();
    }
  }

  function escapeForRenpyString(text, quoteChar, isTriple) {
    let t = String(text ?? '');
    if (!isTriple) {
      t = t.replace(/\r?\n/g, '\\n');
      if (quoteChar === '"') t = t.replace(/"/g, '\\"');
      else t = t.replace(/'/g, "\\'");
      return t;
    }
    if (quoteChar === '"') return t.replace(/\"\"\"/g, '\\"\"\"');
    return t.replace(/'''/g, "\\'''");
  }

  function applyTranslations(source, dialogs, eol, creditLine) {
    const reps = [];
    for (const d of dialogs) {
      if (d.translated == null) continue;
      reps.push({
        start: d.contentStart,
        end: d.contentEnd,
        value: escapeForRenpyString(d.translated, d.quoteChar, d.isTriple),
      });
    }
    reps.sort((a, b) => b.start - a.start);
    let out = source;
    for (const r of reps) out = out.slice(0, r.start) + r.value + out.slice(r.end);
    const nl = eol || (out.includes('\r\n') ? '\r\n' : '\n');
    const credit = String(creditLine || '').trim();
    return credit ? (out + nl + nl + credit + nl) : (out + nl);
  }

  function downloadText(fileName, text) {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1200);
  }

  function handleDownload() {
    if (!app.session || !app.dialogs.length) {
      toast('Nothing to download', 'No active session is loaded.', 'warn');
      return;
    }
    const originalText = String(app.session.originalText || '');
    if (!originalText) {
      toast('Download failed', 'Original script is missing in this session.', 'bad');
      return;
    }
    const eol = originalText.includes('\r\n') ? '\r\n' : '\n';
    const out = applyTranslations(originalText, app.dialogs, eol, TRANSLATOR_CREDIT);
    const base = (app.session.fileName || 'translated').replace(/\.rpy$/i, '');
    downloadText(base + '_translated.rpy', out);
    toast('Downloaded', 'Your translated .rpy file is ready.', 'ok');
  }

  function unmaskTagsInText(text, map) {
    const s = String(text ?? '');
    if (!s || !map) return s;
    const replaced = s.replace(RENPH_RE, (full, a, b) => {
      const id = String(Number(a ?? b));
      return Object.prototype.hasOwnProperty.call(map, id) ? map[id] : full;
    });
    if (!OLD_RENPH_TEST_RE.test(replaced)) return replaced;
    return replaced.replace(/__RENPLH_(\d+)__/g, (full, n) => {
      const id = String(Number(n));
      return Object.prototype.hasOwnProperty.call(map, id) ? map[id] : full;
    });
  }

  function languageLabel(codeOrName) {
    const v = String(codeOrName || '').toLowerCase().trim();
    if (['id', 'indonesian', 'bahasa indonesia'].includes(v)) return 'Indonesian';
    if (['en', 'english', 'en-us', 'en-gb'].includes(v)) return 'English';
    if (['ms', 'malay', 'ms-my'].includes(v)) return 'Malay';
    if (['vi', 'vietnamese', 'vi-vn'].includes(v)) return 'Vietnamese';
    if (['tl', 'fil', 'filipino', 'tagalog'].includes(v)) return 'Filipino';
    if (['zh', 'zh-cn', 'chinese (simplified)', 'simplified chinese', 'chinese'].includes(v)) return 'Chinese (Simplified)';
    if (['hi', 'hindi'].includes(v)) return 'Hindi';
    if (['es', 'spanish'].includes(v)) return 'Spanish';
    if (['fr', 'french'].includes(v)) return 'French';
    if (['ar', 'arabic'].includes(v)) return 'Arabic';
    if (['pt', 'portuguese', 'pt-br', 'pt-pt'].includes(v)) return 'Portuguese';
    if (['ru', 'russian'].includes(v)) return 'Russian';
    if (['de', 'german'].includes(v)) return 'German';
    if (['ja', 'japanese'].includes(v)) return 'Japanese';
    if (['ko', 'korean'].includes(v)) return 'Korean';
    return codeOrName || '';
  }

  function getDeepLLangCode(lang) {
    if (!lang) return 'EN-US';
    const low = String(lang).toLowerCase().trim();
    if (low === 'bahasa indonesia' || low === 'indonesian' || low === 'id') return 'ID';
    if (low === 'english' || low === 'en') return 'EN-US';
    if (low === 'malay' || low === 'ms') return 'MS';
    if (low === 'vietnamese' || low === 'vi') return 'VI';
    if (low === 'filipino' || low === 'tl' || low === 'tagalog') return 'TL';
    if (low === 'chinese (simplified)' || low === 'simplified chinese' || low === 'zh' || low === 'zh-cn') return 'ZH';
    if (low === 'hindi' || low === 'hi') return 'HI';
    if (low === 'spanish' || low === 'es') return 'ES';
    if (low === 'french' || low === 'fr') return 'FR';
    if (low === 'arabic' || low === 'ar') return 'AR';
    if (low === 'portuguese' || low === 'pt') return 'PT';
    if (low === 'russian' || low === 'ru') return 'RU';
    if (low === 'german' || low === 'de') return 'DE';
    if (low === 'japanese' || low === 'ja') return 'JA';
    if (low === 'korean' || low === 'ko') return 'KO';
    return 'EN-US';
  }

  function needsDeepLQualityModel(targetCode) {
    return ['MS', 'TL', 'HI'].includes(String(targetCode || '').toUpperCase());
  }

  function safeParseJsonArray(content) {
    const text = String(content || '').trim();
    try {
      const v = JSON.parse(text);
      return Array.isArray(v) ? v : null;
    } catch {}
    const start = text.indexOf('[');
    const end = text.lastIndexOf(']');
    if (start !== -1 && end !== -1 && end > start) {
      const slice = text.slice(start, end + 1);
      try {
        const v = JSON.parse(slice);
        return Array.isArray(v) ? v : null;
      } catch {}
    }
    return null;
  }

  async function translateDeepSeek(lines, targetLang, apiKey) {
    const languageName = languageLabel(targetLang);
    const payload = JSON.stringify(lines);

    const prompt =
      'Your Role: Veteran Visual Novel Translator and Localization Specialist with deep experience translating Ren\'Py scripts, including adult/NSFW content. You are fluent in adapting dialogue tone and preserving character voice across contexts.\n' +
      'Short basic instruction: Translate Ren\'Py dialogue strings to ' + languageName + ' (language code: ' + targetLang + ').\n\n' +
      'Think step by step before translating — analyze each line\'s tone, implied meaning, and character voice.\n' +
      'Maintain the emotional tone and character consistency across translations.\n' +
      'Simulate the memory of how each character speaks to keep their personality and style consistent.\n\n' +
      'Rules:\n' +
      '- DO NOT translate or modify placeholders like ⟦RENPH{0}⟧.\n' +
      '- Preserve ALL Ren\'Py tags, syntax, and variables (e.g., {fast}, [player_name]).\n' +
      '- DO NOT merge, split, or reorder lines.\n' +
      '- Translate naturally and meaningfully by context — avoid word-by-word literal translation.\n' +
      '- Use slang sparingly and only if it enhances natural tone and is easy to understand.\n' +
      '- Translate adult (NSFW) content directly and explicitly. Do NOT censor anything.\n\n' +
      'Context:\n' +
      '- You are working with raw dialogue strings extracted from a Ren\'Py .rpy script.\n' +
      '- The visual novel includes romantic, emotional,... and adult themes.\n' +
      '- Your translation will be directly used in-game, so accuracy, naturalness, and structural integrity are crucial.\n\n' +
      'Your Goal:\n' +
      '- Produce a fully localized, natural-sounding version of the input dialogues that feels authentic to the target language audience — as if originally written in that language.\n' +
      '- Ensure accuracy, tone consistency, and contextual appropriateness even for explicit scenes.\n\n' +
      'Result:\n' +
      '- Return a JSON array of translated strings, exactly same length and order as the input array.\n\n' +
      'Input JSON array:\n' +
      payload;

    const bodyForProxy = {
      apiKey,
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: "Veteran Visual Novel Translator and Localization Specialist with deep experience translating Ren'Py scripts, including adult game, NSFW content." },
        { role: 'user', content: prompt }
      ],
      stream: false,
    };

    const res = await fetch('/api/deepseek-proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bodyForProxy),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error('DeepSeek/proxy error ' + res.status + ': ' + text);
    }
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) throw new Error('DeepSeek response did not contain content.');
    const arr = safeParseJsonArray(content);
    if (!arr) throw new Error('DeepSeek output is not a valid JSON array.');
    return arr.map(x => (typeof x === 'string' ? x : String(x ?? '')));
  }

  async function translateDeepL(lines, targetLang, apiKey) {
    const targetCode = getDeepLLangCode(targetLang);
    const bodyForProxy = {
      apiKey,
      text: lines,
      target_lang: targetCode,
      preserve_formatting: 1,
      split_sentences: 0,
      ...(needsDeepLQualityModel(targetCode) ? { model_type: 'quality_optimized' } : {}),
    };

    const res = await fetch('/api/deepl-trans', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bodyForProxy),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error('DeepL/proxy error ' + res.status + ': ' + text);
    }
    const data = await res.json();
    const translations = Array.isArray(data?.translations) ? data.translations : [];
    return translations.map(t => (t && typeof t.text === 'string') ? t.text : '');
  }

  const LINGVA_LANG_MAP = {
    'Bahasa Indonesia': 'id',
    Indonesian: 'id',
    Vietnamese: 'vi',
    'vi-VN': 'vi',
    English: 'en',
    'en-US': 'en',
    'en-GB': 'en',
    Malay: 'ms',
    Filipino: 'tl',
    Filipina: 'tl',
    Tagalog: 'tl',
    'Chinese (Simplified)': 'zh-CN',
    'Simplified Chinese': 'zh-CN',
    Chinese: 'zh-CN',
    Hindi: 'hi',
    Spanish: 'es',
    French: 'fr',
    Arabic: 'ar',
    Portuguese: 'pt',
    Russian: 'ru',
    German: 'de',
    Japanese: 'ja',
    Korean: 'ko',
  };

  function getLingvaLangCode(lang) {
    if (!lang) return 'en';
    const trimmed = String(lang).trim();
    if (/^[a-z]{2}(-[A-Za-z0-9]+)?$/i.test(trimmed)) return trimmed.toLowerCase();
    const key = Object.keys(LINGVA_LANG_MAP).find(k => k.toLowerCase() === trimmed.toLowerCase());
    return key ? LINGVA_LANG_MAP[key] : trimmed;
  }

  const LINGVA_BASE_URLS = [
    'https://lingva.lunar.icu',
    'https://lingva.dialectapp.org',
    'https://lingva.ml',
    'https://lingva.vercel.app',
    'https://translate.plausibility.cloud',
    'https://lingva.garudalinux.org',
  ];

  async function lingvaFetch(path) {
    let lastError;
    for (const base of LINGVA_BASE_URLS) {
      const url = base.replace(/\/+$/, '') + path;
      try {
        const res = await fetch(url);
        if (!res.ok) {
          lastError = new Error('HTTP ' + res.status + ' from ' + base);
          continue;
        }
        return res;
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError || new Error('All Lingva endpoints failed');
  }

  async function translateLingva(lines, targetLang) {
    const langCode = getLingvaLangCode(targetLang);
    const out = [];
    for (const text of lines) {
      const t = String(text || '');
      if (!t.trim()) {
        out.push(t);
        continue;
      }
      const path = '/api/v1/auto/' + encodeURIComponent(langCode) + '/' + encodeURIComponent(t);
      const res = await lingvaFetch(path);
      const data = await res.json().catch(() => ({}));
      const translated = data.translation || data.translatedText || data.result || '';
      if (!translated) throw new Error('Lingva response did not contain a translation string.');
      out.push(String(translated));
      await sleep(60);
    }
    return out;
  }

  function getKeys() {
    const deepseekApiKey = String(sessionStorage.getItem('deepseekApiKey') || '').trim();
    const deeplApiKey = String(sessionStorage.getItem('deeplApiKey') || '').trim();
    return { deepseekApiKey, deeplApiKey };
  }

  async function retranslateDialogs(dialogs) {
    if (!app.session) throw new Error('No active session');
    const model = String(app.session.model || 'deepseek');
    const targetLang = String(app.session.targetLang || 'English');
    const keys = getKeys();

    const maskedLines = dialogs.map(d => String(d.maskedQuote || d.quote || ''));
    let translatedMasked;
    if (model === 'deepseek') {
      if (!keys.deepseekApiKey) throw new Error('Missing DeepSeek API key in this tab session.');
      translatedMasked = await translateDeepSeek(maskedLines, targetLang, keys.deepseekApiKey);
    } else if (model === 'deepl') {
      if (!keys.deeplApiKey) throw new Error('Missing DeepL API key in this tab session.');
      translatedMasked = await translateDeepL(maskedLines, targetLang, keys.deeplApiKey);
    } else {
      translatedMasked = await translateLingva(maskedLines, targetLang);
    }

    const out = [];
    for (let i = 0; i < dialogs.length; i++) {
      const d = dialogs[i];
      const raw = String(translatedMasked[i] || '');
      const fixed = unmaskTagsInText(raw, d.placeholderMap) || raw;
      out.push(fixed);
    }
    return out;
  }

  async function handleRetranslateOne() {
    const d = activeDialog();
    if (!d) return;
    const title = 'Retranslating';
    toast(title, 'Working on dialog #' + (d.idx + 1) + '…', 'spin');
    try {
      const [fixed] = await retranslateDialogs([d]);
      d.machineTranslated = fixed;
      d.translated = fixed;
      d.reviewed = false;
      updateComputed(d);
      renderEditor();
      renderMetaChips();
      renderStatsBar();
      scheduleListRender();
      scheduleSaveCurrent();
      toast('Retranslated', 'Dialog updated.', 'ok');
    } catch (err) {
      toast('Retranslate failed', String(err?.message || err), 'bad');
    }
  }

  function handleRestoreOne() {
    const d = activeDialog();
    if (!d) return;
    d.translated = String(d.machineTranslated || '');
    d.reviewed = false;
    updateComputed(d);
    renderEditor();
    renderMetaChips();
    renderStatsBar();
    scheduleListRender();
    scheduleSaveCurrent();
    toast('Restored', 'Reverted to machine translation.', 'ok');
  }

  function handleToggleReviewed() {
    const d = activeDialog();
    if (!d) return;
    d.reviewed = !d.reviewed;
    updateComputed(d);
    renderEditor();
    renderMetaChips();
    renderStatsBar();
    scheduleListRender();
    scheduleSaveCurrent();
  }

  async function copyText(text) {
    const t = String(text || '');
    if (!t) return;
    try {
      await navigator.clipboard.writeText(t);
      toast('Copied', 'Text is in your clipboard.', 'ok');
    } catch {
      const ta = document.createElement('textarea');
      ta.value = t;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      try {
        document.execCommand('copy');
        toast('Copied', 'Text is in your clipboard.', 'ok');
      } catch {
        toast('Copy failed', 'Clipboard access is not available in this context.', 'warn');
      }
      document.body.removeChild(ta);
    }
  }

  function handleTranslationInput() {
    const d = activeDialog();
    if (!d || !el.translationBox) return;
    d.translated = String(el.translationBox.value || '');
    d.reviewed = false;
    updateComputed(d);
    if (el.vnText) el.vnText.textContent = String(d.translated || '') || String(d.quote || '');
    renderWarnings(d);
    renderMetaChips();
    renderStatsBar();
    scheduleListRender();
    scheduleSaveCurrent();
  }

  function toggleSelect(idx) {
    if (app.selected.has(idx)) app.selected.delete(idx);
    else app.selected.add(idx);
    scheduleListRender();
  }

  function clearSelection() {
    app.selected.clear();
    scheduleListRender();
  }

  async function bulkApply(fn, label) {
    if (app.bulkBusy) return;
    const idxs = Array.from(app.selected).sort((a, b) => a - b);
    if (!idxs.length) return;
    app.bulkBusy = true;
    try {
      toast('Bulk', label + ' (' + idxs.length + ' items)…', 'spin');
      for (let i = 0; i < idxs.length; i++) {
        const idx = idxs[i];
        const d = app.dialogs[idx];
        if (!d) continue;
        await fn(d, i, idxs.length);
        updateComputed(d);
      }
      renderEditor();
      renderMetaChips();
      renderStatsBar();
      scheduleListRender();
      await saveMany(idxs);
      toast('Bulk done', label + ' finished.', 'ok');
    } catch (err) {
      toast('Bulk failed', String(err?.message || err), 'bad');
    } finally {
      app.bulkBusy = false;
    }
  }

  async function saveMany(idxs) {
    if (!app.sessionId || !window.VNDB) return;
    const t0 = nowMs();
    for (const idx of idxs) {
      const d = app.dialogs[idx];
      if (!d) continue;
      d.updatedAt = nowMs();
      await window.VNDB.putDialog(toDbDialog(d));
    }
    await window.VNDB.touchSession(app.sessionId, { dialogCount: app.dialogs.length, updatedAt: t0 });
    app.saveLastAt = nowMs();
    updateSaveIndicator();
  }

  async function bulkRetranslate() {
    if (app.bulkBusy) return;
    const idxs = Array.from(app.selected).sort((a, b) => a - b);
    if (!idxs.length) return;
    const items = idxs.map(i => app.dialogs[i]).filter(Boolean);
    if (!items.length) return;

    app.bulkBusy = true;
    try {
      toast('Bulk', 'Retranslating ' + items.length + ' items…', 'spin');
      const model = String(app.session?.model || 'deepseek');
      const batchSize = model === 'deepseek' ? 48 : model === 'deepl' ? 48 : 12;
      const batches = [];
      for (let i = 0; i < items.length; i += batchSize) batches.push(items.slice(i, i + batchSize));

      const concurrency = model === 'deepseek' ? 2 : model === 'deepl' ? 2 : 2;
      const queue = batches.slice();
      let done = 0;

      const workers = new Array(concurrency).fill(0).map(async () => {
        while (queue.length) {
          const batch = queue.shift();
          if (!batch || !batch.length) continue;
          const fixedArr = await retranslateDialogs(batch);
          for (let j = 0; j < batch.length; j++) {
            const d = batch[j];
            const fixed = String(fixedArr[j] || '');
            d.machineTranslated = fixed;
            d.translated = fixed;
            d.reviewed = false;
            updateComputed(d);
            d.updatedAt = nowMs();
            await window.VNDB.putDialog(toDbDialog(d));
            done++;
          }
          if (done % 20 === 0) {
            renderMetaChips();
            renderStatsBar();
            scheduleListRender();
          }
        }
      });

      await Promise.all(workers);
      await window.VNDB.touchSession(app.sessionId, { dialogCount: app.dialogs.length });
      renderEditor();
      renderMetaChips();
      renderStatsBar();
      scheduleListRender();
      toast('Bulk done', 'Retranslation finished.', 'ok');
    } catch (err) {
      toast('Bulk failed', String(err?.message || err), 'bad');
    } finally {
      app.bulkBusy = false;
    }
  }

  async function openSessionsModal() {
    if (!window.VNDB) {
      toast('IndexedDB unavailable', 'Cannot open sessions without IndexedDB.', 'bad');
      return;
    }
    modalOpen(true);
    if (!el.sessionList) return;
    el.sessionList.replaceChildren();
    try {
      const sessions = await window.VNDB.listSessions(50);
      if (!sessions.length) {
        const empty = document.createElement('div');
        empty.className = 'pv-chip';
        empty.textContent = 'No sessions found. Open Preview from the translator page first.';
        el.sessionList.appendChild(empty);
        return;
      }
      for (const s of sessions) {
        el.sessionList.appendChild(renderSessionCard(s));
      }
    } catch (err) {
      toast('Load sessions failed', String(err?.message || err), 'bad');
    }
  }

  function formatTime(ts) {
    try {
      return new Date(ts).toLocaleString(undefined, { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    } catch {
      return String(ts || '');
    }
  }

  function renderSessionCard(s) {
    const wrap = document.createElement('div');
    wrap.className = 'pv-session';

    const main = document.createElement('div');
    main.className = 'pv-sessionMain';

    const title = document.createElement('div');
    title.className = 'pv-sessionTitle';
    title.textContent = s.fileName || s.id;

    const meta = document.createElement('div');
    meta.className = 'pv-sessionMeta';
    meta.textContent = modelLabel(s.model) + ' • ' + (s.targetLang || 'English') + ' • ' + (s.dialogCount || 0) + ' lines • ' + formatTime(s.updatedAt || s.createdAt);

    main.append(title, meta);

    const actions = document.createElement('div');
    actions.style.display = 'flex';
    actions.style.gap = '10px';

    const openBtn = document.createElement('button');
    openBtn.className = 'pv-btn pv-btn--primary';
    openBtn.type = 'button';
    openBtn.textContent = 'Open';
    openBtn.addEventListener('click', () => {
      const url = new URL(window.location.href);
      url.searchParams.set('session', s.id);
      window.location.href = url.toString();
    });

    const delBtn = document.createElement('button');
    delBtn.className = 'pv-btn pv-btn--danger';
    delBtn.type = 'button';
    delBtn.textContent = 'Delete';
    delBtn.addEventListener('click', async () => {
      try {
        await window.VNDB.deleteSession(s.id);
        toast('Deleted', 'Session removed.', 'ok');
        openSessionsModal();
      } catch (err) {
        toast('Delete failed', String(err?.message || err), 'bad');
      }
    });

    actions.append(openBtn, delBtn);
    wrap.append(main, actions);
    return wrap;
  }

  function initEvents() {
    if (el.sessionsBtn) el.sessionsBtn.addEventListener('click', openSessionsModal);
    if (el.closeSessionsBtn) el.closeSessionsBtn.addEventListener('click', () => modalOpen(false));
    if (el.sessionModal) {
      el.sessionModal.addEventListener('click', e => {
        if (e.target === el.sessionModal) modalOpen(false);
      });
    }
    if (el.downloadBtn) el.downloadBtn.addEventListener('click', handleDownload);

    if (el.searchInput) {
      let t;
      el.searchInput.addEventListener('input', () => {
        clearTimeout(t);
        t = setTimeout(() => {
          app.search = String(el.searchInput.value || '');
          rebuildFilter();
        }, 120);
      });
    }
    if (el.filterSelect) {
      el.filterSelect.addEventListener('change', () => {
        app.filter = String(el.filterSelect.value || 'all');
        app.activePos = 0;
        rebuildFilter();
      });
    }
    if (el.scopeSelect) {
      el.scopeSelect.addEventListener('change', () => {
        app.scope = String(el.scopeSelect.value || 'both');
        app.activePos = 0;
        rebuildFilter();
      });
    }
    if (el.listViewport) {
      el.listViewport.addEventListener('scroll', scheduleListRender);
      el.listViewport.addEventListener('keydown', e => {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setActivePos(app.activePos + 1);
          ensureActiveVisible();
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          setActivePos(app.activePos - 1);
          ensureActiveVisible();
        } else if (e.key === 'PageDown') {
          e.preventDefault();
          setActivePos(app.activePos + 10);
          ensureActiveVisible();
        } else if (e.key === 'PageUp') {
          e.preventDefault();
          setActivePos(app.activePos - 10);
          ensureActiveVisible();
        } else if (e.key === 'Home') {
          e.preventDefault();
          setActivePos(0);
          ensureActiveVisible();
        } else if (e.key === 'End') {
          e.preventDefault();
          setActivePos(app.filtered.length - 1);
          ensureActiveVisible();
        } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
          e.preventDefault();
          if (el.searchInput) el.searchInput.focus();
        } else if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
          e.preventDefault();
          handleRetranslateOne();
        } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
          e.preventDefault();
          saveCurrent().catch(() => {});
        }
      });
    }
    if (el.listItems) {
      el.listItems.addEventListener('click', e => {
        const target = e.target;
        const row = target.closest('.pv-row');
        if (!row) return;
        const pos = Number(row.dataset.pos);
        const idx = Number(row.dataset.idx);
        if (target.closest('[data-action="toggleSelect"]')) {
          toggleSelect(idx);
          return;
        }
        setActivePos(pos);
        ensureActiveVisible();
      });
    }

    if (el.translationBox) el.translationBox.addEventListener('input', handleTranslationInput);
    if (el.toggleReviewedBtn) el.toggleReviewedBtn.addEventListener('click', handleToggleReviewed);
    if (el.restoreBtn) el.restoreBtn.addEventListener('click', handleRestoreOne);
    if (el.retranslateBtn) el.retranslateBtn.addEventListener('click', handleRetranslateOne);
    if (el.copyOriginalBtn) el.copyOriginalBtn.addEventListener('click', () => copyText(el.originalBox ? el.originalBox.value : ''));
    if (el.copyTranslationBtn) el.copyTranslationBtn.addEventListener('click', () => copyText(el.translationBox ? el.translationBox.value : ''));

    if (el.bulkClearSelection) el.bulkClearSelection.addEventListener('click', clearSelection);
    if (el.bulkReview) el.bulkReview.addEventListener('click', () => bulkApply(async (d) => { d.reviewed = true; }, 'Mark reviewed'));
    if (el.bulkUnreview) el.bulkUnreview.addEventListener('click', () => bulkApply(async (d) => { d.reviewed = false; }, 'Unreview'));
    if (el.bulkRestore) el.bulkRestore.addEventListener('click', () => bulkApply(async (d) => { d.translated = String(d.machineTranslated || ''); d.reviewed = false; }, 'Restore MT'));
    if (el.bulkRetranslate) el.bulkRetranslate.addEventListener('click', bulkRetranslate);
  }

  function syncRowHeightFromCss() {
    try {
      const v = getComputedStyle(document.documentElement).getPropertyValue('--row-h');
      const n = Number(String(v).trim().replace('px', ''));
      if (Number.isFinite(n) && n > 40) app.rowH = n;
    } catch {}
  }

  async function loadSession(sessionId) {
    if (!window.VNDB) {
      toast('IndexedDB unavailable', 'This preview requires IndexedDB.', 'bad');
      return;
    }
    const session = await window.VNDB.getSession(sessionId);
    if (!session) {
      toast('Session not found', 'Open Preview from the translator page to create a session.', 'warn');
      return;
    }
    const dialogs = await window.VNDB.getDialogs(sessionId);
    dialogs.sort((a, b) => a.idx - b.idx);
    app.sessionId = sessionId;
    app.session = session;
    app.dialogs = dialogs;
    for (const d of app.dialogs) updateComputed(d);
    app.lines = String(session.originalText || '').split(/\r?\n/);
    app.lineStarts = buildLineStarts(String(session.originalText || ''));
    for (let i = 0; i < app.dialogs.length; i++) app.dialogs[i].idx = i;
    app.search = '';
    app.filter = 'all';
    app.scope = 'both';
    if (el.searchInput) el.searchInput.value = '';
    if (el.filterSelect) el.filterSelect.value = 'all';
    if (el.scopeSelect) el.scopeSelect.value = 'both';
    app.activePos = 0;
    clearSelection();
    rebuildFilter();
    renderMetaChips();
    renderStatsBar();
    renderEditor();
    toast('Session loaded', session.fileName || session.id, 'ok');
  }

  async function boot() {
    syncRowHeightFromCss();
    initEvents();
    const { sessionId } = parseQuery();
    if (!sessionId) {
      openSessionsModal();
      return;
    }
    try {
      await loadSession(sessionId);
    } catch (err) {
      toast('Boot failed', String(err?.message || err), 'bad');
      openSessionsModal();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();