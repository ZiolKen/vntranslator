(function () {
  'use strict';

  const RPGPLH_TEST_RE = /__RPGPLH_\d+__/g;

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
    paths: [],
    jsonBase: null,
    filtered: [],
    filteredPos: new Map(),
    activePos: 0,
    selected: new Set(),
    search: '',
    filter: 'all',
    scope: 'both',
    rowH: 72,
    rafPending: false,
    saveTimer: null,
    savePending: false,
    saveLastAt: 0,
    savingNow: false,
    bulkBusy: false,
    retranslateBusy: false,
  };

  function nowMs() {
    return Date.now();
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function clamp(n, a, b) {
    return Math.max(a, Math.min(b, n));
  }

  function normalizeText(s) {
    return String(s || '').replace(/\s+/g, ' ').trim();
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

  function languageLabel(code) {
    const c = String(code || '').toLowerCase().trim();
    switch (c) {
      case 'en':
        return 'English';
      case 'zh-cn':
      case 'zh':
        return 'Chinese (Simplified)';
      case 'hi':
        return 'Hindi';
      case 'es':
        return 'Spanish';
      case 'fr':
        return 'French';
      case 'ar':
        return 'Arabic';
      case 'pt':
        return 'Portuguese';
      case 'ru':
        return 'Russian';
      case 'de':
        return 'German';
      case 'ja':
        return 'Japanese';
      case 'id':
        return 'Indonesian';
      case 'ms':
        return 'Malay';
      case 'vi':
        return 'Vietnamese';
      case 'tl':
      case 'fil':
        return 'Filipino';
      case 'ko':
        return 'Korean';
      default:
        return code || 'Unknown';
    }
  }

  function modelLabel(model) {
    const m = String(model || '').toLowerCase().trim();
    if (m === 'deepseek') return 'DeepSeek';
    if (m === 'lingva') return 'Lingva';
    if (m.startsWith('gpt-')) return 'OpenAI ' + model;
    return model || 'Unknown';
  }

  function codeLabel(code) {
    const c = String(code || '').trim();
    const n = Number(c);
    if (c === 'SPEAKER_NAME') return 'Speaker Name';
    if (!Number.isFinite(n)) return c || 'Text';
    if (n === 101) return 'Message Settings';
    if (n === 401) return 'Text Line';
    if (n === 405) return 'Scrolling Text';
    if (n === 408) return 'Comment (cont.)';
    if (n === 108) return 'Comment';
    if (n === 102) return 'Choice';
    if (n === 402 || n === 403) return 'Choice Branch';
    return 'Command ' + n;
  }

  function pathToPointer(path) {
    const arr = Array.isArray(path) ? path : [];
    if (!arr.length) return '/';
    return arr
      .map(p => String(p).replace(/~/g, '~0').replace(/\//g, '~1'))
      .reduce((acc, seg) => acc + '/' + seg, '');
  }

  function extractRpgmTokens(str) {
    const s = String(str || '');
    const tokens = [];
    let i = 0;
    while (i < s.length) {
      const ch = s[i];
      if (ch !== '\\' && ch !== '<' && ch !== '[' && ch !== '{') {
        i++;
        continue;
      }

      let j = i;
      let block = '';

      if (ch === '\\') {
        block = '\\';
        j++;
        while (j < s.length && /[A-Za-z\$\._!\|<>\^{}\[\]\(\)\d]/.test(s[j])) {
          block += s[j++];
          if (s[j - 1] === '[') {
            while (j < s.length && s[j] !== ']') block += s[j++];
            if (s[j] === ']') block += s[j++];
          }
        }
      } else if (ch === '<') {
        block = '<';
        j++;
        while (j < s.length && s[j] !== '>') block += s[j++];
        if (s[j] === '>') block += '>';
        j++;
      } else if (ch === '[' || ch === '{') {
        const close = ch === '[' ? ']' : '}';
        block = ch;
        j++;
        while (j < s.length && s[j] !== close) block += s[j++];
        if (s[j] === close) block += close;
        j++;
      }

      if (block.length) tokens.push(block);
      i = Math.max(j, i + 1);
    }
    return tokens;
  }

  function validateRpgmTokens(originalText, translatedText) {
    const issues = [];
    const o = String(originalText || '');
    const t = String(translatedText || '');

    const src = extractRpgmTokens(o);
    const tgt = extractRpgmTokens(t);

    if (RPGPLH_TEST_RE.test(t)) issues.push({ kind: 'bad', text: 'Placeholder token __RPGPLH_*__ is still present in translation.' });

    if (!src.length && !tgt.length) return issues;

    let cursor = 0;
    for (const token of src) {
      const idx = t.indexOf(token, cursor);
      if (idx === -1) {
        issues.push({ kind: 'warn', text: 'Missing control token: ' + token });
      } else {
        cursor = idx + token.length;
      }
    }

    if (tgt.length > src.length + 1) {
      issues.push({ kind: 'warn', text: 'Translation contains more control codes than original.' });
    }

    const oNl = (o.match(/\r?\n/g) || []).length;
    const tNl = (t.match(/\r?\n/g) || []).length;
    if (oNl !== tNl) {
      issues.push({ kind: 'warn', text: 'Line breaks changed: ' + oNl + ' → ' + tNl });
    }

    return issues;
  }

  function computeWarnings(dialog) {
    const out = [];
    const tr = String(dialog.translated || '');
    if (!tr.trim()) out.push({ kind: 'warn', text: 'Empty translation.' });
    if (tr.length > 900) out.push({ kind: 'warn', text: 'Very long translation (' + tr.length + ' chars).' });
    out.push(...validateRpgmTokens(dialog.original || '', tr));
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

    return {
      total,
      edited,
      empty,
      warnings,
      reviewed,
      unreviewed: Math.max(0, total - reviewed),
    };
  }

  function renderStatsBar() {
    if (!el.statsBar) return;
    const s = computeStats();
    el.statsBar.replaceChildren(
      chip('Total', String(s.total)),
      chip('Unreviewed', String(s.unreviewed), s.unreviewed ? 'warn' : 'ok'),
      chip('Edited', String(s.edited), s.edited ? 'warn' : 'ok'),
      chip('Warnings', String(s.warnings), s.warnings ? 'warn' : 'ok')
    );
  }

  function renderMetaChips() {
    if (!el.metaChips || !app.session) return;
    const s = app.session;
    const stats = computeStats();

    el.metaChips.replaceChildren(
      chip('File', s.fileName || 'file.json'),
      chip('Model', modelLabel(s.model)),
      chip('Target', languageLabel(s.targetLang)),
      chip('Dialogs', String(s.dialogCount || app.dialogs.length)),
      chip('Reviewed', String(stats.reviewed), stats.unreviewed ? 'warn' : 'ok')
    );
  }

  function dialogMatches(dialog, query, scope) {
    if (!query) return true;
    const q = query.toLowerCase();
    const orig = String(dialog.original || '').toLowerCase();
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
    title.textContent = '#' + (idx + 1) + ' • ' + codeLabel(dialog.code);

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
    orig.textContent = String(dialog.original || '');

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

  function speakerForIndex(idx) {
    for (let i = idx; i >= 0; i--) {
      const d = app.dialogs[i];
      if (!d) continue;
      if (String(d.code) === 'SPEAKER_NAME') {
        const name = String(d.translated || d.original || '').trim();
        if (name) return name;
      }
    }
    return 'Narrator';
  }

  function renderContext(dialog) {
    if (!el.contextBox) return;
    el.contextBox.replaceChildren();

    const lines = [];
    const idx = Number(dialog?.idx);

    lines.push({ k: 'File', v: app.session?.fileName || 'file.json' });
    lines.push({ k: 'Index', v: Number.isFinite(idx) ? String(idx + 1) : '?' });
    lines.push({ k: 'Type', v: codeLabel(dialog.code) + ' (' + String(dialog.code || '') + ')' });

    const path = app.paths[idx];
    if (path) lines.push({ k: 'Path', v: pathToPointer(path) });
    else lines.push({ k: 'Path', v: 'Unavailable (path mismatch)' });

    if (String(dialog.code) !== 'SPEAKER_NAME') {
      lines.push({ k: 'Speaker', v: speakerForIndex(Number.isFinite(idx) ? idx : 0) });
    }

    const srcTokens = extractRpgmTokens(dialog.original || '').length;
    const trTokens = extractRpgmTokens(dialog.translated || '').length;
    lines.push({ k: 'Control tokens', v: String(srcTokens) + ' → ' + String(trTokens) });

    for (let i = 0; i < lines.length; i++) {
      const row = document.createElement('div');
      row.className = 'pv-codeLine' + (i === 0 ? ' pv-codeLine--active' : '');
      const no = document.createElement('div');
      no.className = 'pv-codeNo';
      no.textContent = String(i + 1);
      const txt = document.createElement('div');
      txt.className = 'pv-codeText';
      txt.textContent = lines[i].k + ': ' + lines[i].v;
      row.append(no, txt);
      el.contextBox.appendChild(row);
    }
  }

  function renderEditor() {
    const d = activeDialog();
    const has = !!d;

    if (el.downloadBtn) el.downloadBtn.disabled = !has && !app.dialogs.length;

    if (!has) {
      if (el.editorSub) el.editorSub.textContent = 'No dialog selected';
      if (el.originalBox) el.originalBox.value = '';
      if (el.translationBox) el.translationBox.value = '';
      if (el.vnName) el.vnName.textContent = 'Narrator';
      if (el.vnText) el.vnText.textContent = '';
      if (el.toggleReviewedBtn) el.toggleReviewedBtn.disabled = true;
      if (el.restoreBtn) el.restoreBtn.disabled = true;
      if (el.retranslateBtn) el.retranslateBtn.disabled = true;
      if (el.copyOriginalBtn) el.copyOriginalBtn.disabled = true;
      if (el.copyTranslationBtn) el.copyTranslationBtn.disabled = true;
      if (el.warnings) el.warnings.replaceChildren();
      if (el.contextBox) el.contextBox.replaceChildren();
      updateSaveIndicator();
      return;
    }

    const idx = Number(d.idx);
    if (el.editorSub) el.editorSub.textContent = '#' + (idx + 1) + ' • ' + codeLabel(d.code);
    if (el.originalBox) el.originalBox.value = String(d.original || '');
    if (el.translationBox) el.translationBox.value = String(d.translated || '');

    if (el.toggleReviewedBtn) {
      el.toggleReviewedBtn.disabled = false;
      el.toggleReviewedBtn.textContent = d.reviewed ? 'Unreview' : 'Mark reviewed';
    }

    if (el.restoreBtn) el.restoreBtn.disabled = false;
    if (el.retranslateBtn) el.retranslateBtn.disabled = false;
    if (el.copyOriginalBtn) el.copyOriginalBtn.disabled = false;
    if (el.copyTranslationBtn) el.copyTranslationBtn.disabled = false;

    renderWarnings(d);

    const speaker = String(d.code) === 'SPEAKER_NAME' ? String(d.translated || d.original || '').trim() || 'Narrator' : speakerForIndex(idx);
    if (el.vnName) el.vnName.textContent = speaker;

    let pvText = '';
    if (String(d.code) === 'SPEAKER_NAME') {
      pvText = 'Speaker name entry.';
    } else {
      pvText = String(d.translated || '').trim() ? String(d.translated) : String(d.original || '');
    }
    if (el.vnText) el.vnText.textContent = pvText;

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
    }, 280);
  }

  function toDbDialog(d) {
    return {
      sessionId: d.sessionId,
      idx: d.idx,
      code: d.code,
      original: d.original,
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

  async function saveMany(idxs) {
    if (!window.VNDB || !app.sessionId) return;
    const unique = Array.from(new Set(idxs)).sort((a, b) => a - b);
    for (const idx of unique) {
      const d = app.dialogs[idx];
      if (!d) continue;
      d.updatedAt = nowMs();
      await window.VNDB.putDialog(toDbDialog(d));
    }
    await window.VNDB.touchSession(app.sessionId, { dialogCount: app.dialogs.length });
    app.saveLastAt = nowMs();
    updateSaveIndicator();
  }

  function handleTranslationInput() {
    const d = activeDialog();
    if (!d || !el.translationBox) return;
    d.translated = String(el.translationBox.value || '');
    d.reviewed = false;
    updateComputed(d);
    renderWarnings(d);
    renderMetaChips();
    renderStatsBar();
    scheduleListRender();

    if (el.vnText) {
      const pv = String(d.translated || '').trim() ? String(d.translated) : String(d.original || '');
      el.vnText.textContent = String(d.code) === 'SPEAKER_NAME' ? 'Speaker name entry.' : pv;
    }

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

  function getApiKeyForModel(model) {
    const m = String(model || '').toLowerCase().trim();
    if (m === 'deepseek') return String(sessionStorage.getItem('deepseekApiKey') || '').trim();
    if (m.startsWith('gpt-')) return String(sessionStorage.getItem('openaiApiKey') || '').trim();
    return '';
  }

  function createPlaceholder(counter) {
    const rand = Math.floor(Math.random() * 100);
    return `__RPGPLH_${counter}${rand}__`;
  }

  function protectRPGMCodes(str) {
    const map = Object.create(null);
    let out = '';
    let counter = 0;
    let i = 0;

    while (i < str.length) {
      const ch = str[i];
      if (ch !== '\\' && ch !== '<' && ch !== '[' && ch !== '{') {
        out += ch;
        i++;
        continue;
      }

      let j = i;
      let block = '';

      if (ch === '\\') {
        block = '\\';
        j++;
        while (j < str.length && /[A-Za-z\$\._!\|<>\^{}\[\]\(\)\d]/.test(str[j])) {
          block += str[j++];
          if (str[j - 1] === '[') {
            while (j < str.length && str[j] !== ']') block += str[j++];
            if (str[j] === ']') block += str[j++];
          }
        }
      } else if (ch === '<') {
        block = '<';
        j++;
        while (j < str.length && str[j] !== '>') block += str[j++];
        if (str[j] === '>') block += '>';
        j++;
      } else if (ch === '[' || ch === '{') {
        const close = ch === '[' ? ']' : '}';
        block = ch;
        j++;
        while (j < str.length && str[j] !== close) block += str[j++];
        if (str[j] === close) block += close;
        j++;
      }

      const ph = createPlaceholder(counter++);
      map[ph] = block;
      out += ph;
      i = j;
    }

    return { text: out, map };
  }

  function restoreRPGMCodes(str, map) {
    if (!str || !map) return str;
    let out = str;
    for (const ph of Object.keys(map)) {
      out = out.split(ph).join(map[ph]);
    }
    return out;
  }

  function buildTranslatePrompt(lines, targetLang) {
    return `Your Role: Veteran Visual Novel Translator and Localization Specialist with deep experience translating RPG Maker scripts, including adult/NSFW content. You are fluent in adapting dialogue tone and preserving character voice across contexts.
Short basic instruction: Translate RPG Maker dialogue strings to ${languageLabel(targetLang)} (code: ${targetLang}).

Think step by step before translating — analyze each line's tone, implied meaning, and character voice.
Maintain the emotional tone and character consistency across translations.
Simulate the memory of how each character speaks to keep their personality and style consistent.

Rules:
- Parts like __RPGPLH_123__ (starts with "__RPGPLH_" and ends with "__") are placeholders. Keep them EXACTLY as-is.
- Preserve RPG Maker escape codes, variables, and tags.
- Do NOT add/remove real line breaks inside a string. Keep \\n as-is if present.
- Do NOT reorder, merge, or split entries.
- Translate naturally and meaningfully by context — avoid word-by-word literal translation.
- Use slang sparingly and only if it enhances natural tone and is easy to understand.
- Translate adult (NSFW) content directly and explicitly. Do NOT censor anything.

Result:
- Return ONLY a translated JSON array of strings with the same length and order as input. No markdown, no comments.

Input JSON array:
${JSON.stringify(lines)}`;
  }

  function parseTranslatedArray(content, expectedCount) {
    const raw = String(content || '').trim();

    const tryParse = (s) => {
      const arr = JSON.parse(s);
      if (!Array.isArray(arr)) throw new Error('Not an array');
      return arr.map(x => (typeof x === 'string' ? x : String(x)));
    };

    try {
      return tryParse(raw);
    } catch {}

    const s = raw.indexOf('[');
    const e = raw.lastIndexOf(']');
    if (s !== -1 && e !== -1 && e > s) {
      try {
        return tryParse(raw.slice(s, e + 1));
      } catch {}
    }

    const out = raw
      .split(/\r?\n/)
      .map(l => l.replace(/^(?:\d+[\).\-\:]\s*|\-\s+|\*\s+)/, ''));

    if (out.length !== expectedCount) return out.slice(0, expectedCount);
    return out;
  }

  async function translateDeepSeek(lines, targetLang, apiKey) {
    const prompt = buildTranslatePrompt(lines, targetLang);

    const body = {
      apiKey: apiKey,
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: 'Veteran Visual Novel Translator and Localization Specialist with deep experience translating RPG Maker scripts, including adult game, NSFW content.' },
        { role: 'user', content: prompt },
      ],
      stream: false,
    };

    const res = await fetch('/api/deepseek-proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) throw new Error('DeepSeek error: ' + res.status);

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content || '';
    return parseTranslatedArray(content, lines.length);
  }

  async function translateOpenAI(lines, targetLang, apiKey, model) {
    const prompt = buildTranslatePrompt(lines, targetLang);

    const body = {
      model: model,
      messages: [
        { role: 'system', content: 'Veteran Visual Novel Translator and Localization Specialist with deep experience translating RPG Maker scripts, including adult game, NSFW content.' },
        { role: 'user', content: prompt },
      ],
    };

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + apiKey,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const t = await res.text().catch(() => '');
      throw new Error('OpenAI HTTP ' + res.status + (t ? ': ' + t : ''));
    }

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content || '';
    return parseTranslatedArray(content, lines.length);
  }

  const LINGVA_HOSTS = [
    'https://lingva.dialectapp.org',
    'https://lingva.ml',
    'https://translate.plausibility.cloud',
    'https://lingva.vercel.app',
    'https://lingva.garudalinux.org',
    'https://lingva.lunar.icu',
  ];

  function normalizeLingvaTargetCode(code) {
    const c = String(code || '').trim().toLowerCase();
    if (c === 'zh' || c === 'zh-cn' || c === 'zh_cn') return 'zh-CN';
    if (c === 'fil') return 'tl';
    return c;
  }

  async function lingvaRequest(text, target) {
    const t = normalizeLingvaTargetCode(target);

    for (const host of LINGVA_HOSTS) {
      try {
        const res = await fetch(host + '/api/v1/auto/' + encodeURIComponent(t) + '/' + encodeURIComponent(text), { cache: 'no-store' });
        if (!res.ok) continue;
        const data = await res.json().catch(() => ({}));
        const translated = data.translation || data.translatedText || data.result || '';
        if (translated) return String(translated);
      } catch {}
    }

    throw new Error('Lingva: all endpoints failed');
  }

  async function translateSingle(text, model, targetLang) {
    const m = String(model || '').toLowerCase().trim();
    if (m === 'lingva') {
      const out = await lingvaRequest(text, targetLang);
      return [out];
    }

    const apiKey = getApiKeyForModel(m);
    if (!apiKey) {
      if (m === 'deepseek') throw new Error('Missing DeepSeek API key');
      if (m.startsWith('gpt-')) throw new Error('Missing OpenAI API key');
      throw new Error('Missing API key');
    }

    if (m === 'deepseek') return await translateDeepSeek([text], targetLang, apiKey);
    if (m.startsWith('gpt-')) return await translateOpenAI([text], targetLang, apiKey, model);

    throw new Error('Unknown model: ' + model);
  }

  async function retranslateDialog(dialog) {
    if (!dialog || !app.session) return;
    const model = app.session.model;
    const targetLang = app.session.targetLang;

    const src = String(dialog.original || '');
    const protectedInfo = protectRPGMCodes(src);

    const arr = await translateSingle(protectedInfo.text, model, targetLang);
    const raw = arr && arr.length ? String(arr[0]) : protectedInfo.text;
    const restored = restoreRPGMCodes(raw, protectedInfo.map);

    dialog.machineTranslated = restored;
    dialog.translated = restored;
    dialog.reviewed = false;
    updateComputed(dialog);
  }

  async function bulkRetranslateSelected() {
    return bulkApply(async (d, i, total) => {
      toast('Retranslate', 'Working… ' + (i + 1) + '/' + total, 'spin');
      await retranslateDialog(d);
      await sleep(80);
    }, 'Retranslate');
  }

  function downloadText(filename, content) {
    const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  function setAtPath(root, path, value) {
    const arr = Array.isArray(path) ? path : [];
    if (!arr.length) return;
    let obj = root;
    for (let i = 0; i < arr.length - 1; i++) {
      const k = arr[i];
      if (!obj) return;
      obj = obj[k];
    }
    const last = arr[arr.length - 1];
    if (obj && (typeof obj === 'object' || Array.isArray(obj))) {
      obj[last] = value;
    }
  }

  function buildExportJson() {
    if (!app.session) throw new Error('No session loaded');
    const base = JSON.parse(String(app.session.originalJsonText || '') || '{}');
    if (!Array.isArray(app.paths) || app.paths.length !== app.dialogs.length) {
      throw new Error('Path mapping mismatch. Cannot export safely.');
    }

    for (let i = 0; i < app.dialogs.length; i++) {
      const d = app.dialogs[i];
      const path = app.paths[i];
      if (!path) continue;
      setAtPath(base, path, String(d.translated ?? ''));
    }

    return JSON.stringify(base, null, 2);
  }

  function downloadJson() {
    try {
      const out = buildExportJson();
      const name = String(app.session?.fileName || 'translated.json');
      downloadText(name, out);
      toast('Download', 'Exported JSON saved.', 'ok');
    } catch (err) {
      toast('Export failed', String(err?.message || err), 'bad');
    }
  }

  const COMMAND_SAY = [101];
  const COMMAND_LINE = [401, 405, 408];
  const COMMAND_CHOICE = [102];
  const COMMAND_BRANCH = [402, 403];
  const COMMAND_COMMENT = [108];

  function isValidDialogText(s) {
    if (typeof s !== 'string') return false;
    const t = s.trim();
    if (t.length < 2) return false;
    if (!/[A-Za-zÀ-ỹ一-龯ぁ-んァ-ン]/.test(t)) return false;
    const tagRatio = (t.match(/<[^>]+>/g) || []).join('').length / t.length;
    if (tagRatio > 0.4) return false;
    return true;
  }

  function extractPathsFromSystem(sys) {
    const out = [];

    function pushArray(arr, prefix) {
      if (!Array.isArray(arr)) return;
      for (let i = 0; i < arr.length; i++) {
        const t = arr[i];
        if (isValidDialogText(t)) out.push(prefix.concat(i));
      }
    }

    if (typeof sys.gameTitle === 'string' && sys.gameTitle.trim() !== '') {
      out.push(['gameTitle']);
    }

    if (typeof sys.currencyUnit === 'string' && sys.currencyUnit.trim() !== '') {
      out.push(['currencyUnit']);
    }

    const terms = sys.terms || {};

    pushArray(terms.basic, ['terms', 'basic']);
    pushArray(terms.commands, ['terms', 'commands']);
    pushArray(terms.params, ['terms', 'params']);

    const msgs = terms.messages || {};
    for (const key of Object.keys(msgs)) {
      const t = msgs[key];
      if (isValidDialogText(t)) out.push(['terms', 'messages', key]);
    }

    pushArray(sys.elements, ['elements']);
    pushArray(sys.equipTypes, ['equipTypes']);
    pushArray(sys.skillTypes, ['skillTypes']);
    pushArray(sys.armorTypes, ['armorTypes']);
    pushArray(sys.weaponTypes, ['weaponTypes']);

    return out;
  }

  function extractPathsFromDbArray(arr, field, field2) {
    const out = [];
    if (!Array.isArray(arr)) return out;

    for (let i = 0; i < arr.length; i++) {
      const it = arr[i];
      if (!it || typeof it !== 'object') continue;

      if (typeof it[field] === 'string' && it[field].trim() !== '') out.push([i, field]);
      if (field2 && typeof it[field2] === 'string' && it[field2].trim() !== '') out.push([i, field2]);
    }

    return out;
  }

  function extractPathsFromJson(jsonObj, fileName) {
    let paths = [];

    const lowerName = String(fileName || '').toLowerCase();

    if (lowerName === 'system.json' || (jsonObj && jsonObj.terms && jsonObj.terms.messages)) {
      paths = paths.concat(extractPathsFromSystem(jsonObj));
    }

    if (lowerName === 'items.json') {
      paths = paths.concat(extractPathsFromDbArray(jsonObj, 'name', 'description'));
    }

    if (lowerName === 'weapons.json') {
      paths = paths.concat(extractPathsFromDbArray(jsonObj, 'name', 'description'));
    }

    if (lowerName === 'armors.json') {
      paths = paths.concat(extractPathsFromDbArray(jsonObj, 'name', 'description'));
    }

    if (lowerName === 'skills.json') {
      paths = paths.concat(extractPathsFromDbArray(jsonObj, 'name', 'description'));
    }

    if (lowerName === 'states.json') {
      paths = paths.concat(extractPathsFromDbArray(jsonObj, 'name', 'description'));
    }

    if (lowerName === 'enemies.json') {
      paths = paths.concat(extractPathsFromDbArray(jsonObj, 'name', null));
    }

    function walk(node, path) {
      if (!node) return;

      if (Array.isArray(node)) {
        for (let i = 0; i < node.length; i++) {
          walk(node[i], path.concat(i));
        }
        return;
      }

      if (typeof node !== 'object') return;

      if (node.code && node.parameters) {
        const code = node.code;

        if (COMMAND_SAY.includes(code)) {
          const speaker = node.parameters?.[4];
          if (isValidDialogText(speaker)) {
            paths.push(path.concat(['parameters', 4]));
          }
        } else if (COMMAND_LINE.includes(code)) {
          const t = node.parameters?.[0];
          if (isValidDialogText(t)) {
            paths.push(path.concat(['parameters', 0]));
          }
        } else if (COMMAND_COMMENT.includes(code)) {
          const t = node.parameters?.[0];
          if (isValidDialogText(t)) {
            paths.push(path.concat(['parameters', 0]));
          }
        } else if (COMMAND_CHOICE.includes(code)) {
          const arr = node.parameters?.[0];
          if (Array.isArray(arr)) {
            for (let i = 0; i < arr.length; i++) {
              const t = arr[i];
              if (isValidDialogText(t)) {
                paths.push(path.concat(['parameters', 0, i]));
              }
            }
          }
        } else if (COMMAND_BRANCH.includes(code)) {
          const t = node.parameters?.[1];
          if (isValidDialogText(t)) {
            paths.push(path.concat(['parameters', 1]));
          }
        }
      }

      const entries = Object.entries(node);
      for (let i = 0; i < entries.length; i++) {
        const k = entries[i][0];
        const v = entries[i][1];
        walk(v, path.concat(k));
      }
    }

    walk(jsonObj, []);
    return paths;
  }

  async function loadSession(sessionId) {
    if (!window.VNDB) throw new Error('VNDB is not available.');

    const session = await window.VNDB.getSession(sessionId);
    if (!session) throw new Error('Session not found.');

    const dialogs = await window.VNDB.getDialogs(sessionId);
    dialogs.sort((a, b) => a.idx - b.idx);

    const parsed = JSON.parse(String(session.originalJsonText || '') || '{}');
    const paths = extractPathsFromJson(parsed, session.fileName);

    if (paths.length !== dialogs.length) {
      toast('Warning', 'Dialog/path mismatch: ' + dialogs.length + ' dialogs, ' + paths.length + ' paths. Export disabled.', 'warn');
    }

    app.sessionId = sessionId;
    app.session = session;
    app.dialogs = dialogs.map(d => {
      const x = { ...d };
      updateComputed(x);
      return x;
    });

    app.paths = paths;
    app.jsonBase = parsed;

    if (el.downloadBtn) el.downloadBtn.disabled = paths.length !== dialogs.length;

    if (el.searchInput) el.searchInput.value = '';
    if (el.filterSelect) el.filterSelect.value = 'all';
    if (el.scopeSelect) el.scopeSelect.value = 'both';

    app.search = '';
    app.filter = 'all';
    app.scope = 'both';
    app.selected.clear();

    renderMetaChips();
    renderStatsBar();
    rebuildFilter();
    renderEditor();
  }

  async function renderSessionsModal() {
    if (!window.VNDB || !el.sessionList) return;
    el.sessionList.replaceChildren();

    let sessions = [];
    try {
      sessions = await window.VNDB.listSessions(40);
    } catch (err) {
      toast('Sessions', String(err?.message || err), 'bad');
      return;
    }

    if (!sessions.length) {
      const empty = document.createElement('div');
      empty.className = 'pv-empty';
      empty.textContent = 'No sessions yet. Go back and run a translation, then click Preview.';
      el.sessionList.appendChild(empty);
      return;
    }

    const frag = document.createDocumentFragment();
    for (const s of sessions) {
      const card = document.createElement('div');
      card.className = 'pv-sessionCard';

      const left = document.createElement('div');
      left.className = 'pv-sessionLeft';

      const title = document.createElement('div');
      title.className = 'pv-sessionTitle';
      title.textContent = s.fileName || 'file.json';

      const meta = document.createElement('div');
      meta.className = 'pv-sessionMeta';
      const dt = new Date(s.updatedAt || s.createdAt || Date.now());
      meta.textContent = modelLabel(s.model) + ' • ' + languageLabel(s.targetLang) + ' • ' + (s.dialogCount || 0) + ' dialogs • ' + dt.toLocaleString();

      left.append(title, meta);

      const actions = document.createElement('div');
      actions.className = 'pv-sessionActions';

      const openBtn = document.createElement('button');
      openBtn.className = 'pv-btn pv-btn--primary';
      openBtn.type = 'button';
      openBtn.textContent = 'Open';
      openBtn.addEventListener('click', () => {
        window.location.href = 'preview.html?session=' + encodeURIComponent(s.id);
      });

      const delBtn = document.createElement('button');
      delBtn.className = 'pv-btn pv-btn--danger';
      delBtn.type = 'button';
      delBtn.textContent = 'Delete';
      delBtn.addEventListener('click', async () => {
        try {
          await window.VNDB.deleteSession(s.id);
          toast('Deleted', 'Session removed.', 'ok');
          await renderSessionsModal();
        } catch (err) {
          toast('Delete failed', String(err?.message || err), 'bad');
        }
      });

      actions.append(openBtn, delBtn);

      card.append(left, actions);
      frag.appendChild(card);
    }

    el.sessionList.appendChild(frag);
  }

  function attachEvents() {
    if (el.searchInput) {
      el.searchInput.addEventListener('input', () => {
        app.search = String(el.searchInput.value || '');
        rebuildFilter();
      });
    }

    if (el.filterSelect) {
      el.filterSelect.addEventListener('change', () => {
        app.filter = String(el.filterSelect.value || 'all');
        rebuildFilter();
      });
    }

    if (el.scopeSelect) {
      el.scopeSelect.addEventListener('change', () => {
        app.scope = String(el.scopeSelect.value || 'both');
        rebuildFilter();
      });
    }

    if (el.listViewport) {
      el.listViewport.addEventListener('scroll', () => scheduleListRender());
      el.listViewport.addEventListener('click', (e) => {
        const target = e.target;
        const row = target?.closest?.('.pv-row');
        if (!row) return;
        const idx = Number(row.dataset.idx);
        const pos = app.filteredPos.get(idx);
        if (!Number.isFinite(pos)) return;

        if (target.closest('[data-action="toggleSelect"]')) {
          toggleSelect(idx);
          return;
        }

        setActivePos(pos);
        ensureActiveVisible();
      });

      el.listViewport.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setActivePos(app.activePos + 1);
          ensureActiveVisible();
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          setActivePos(app.activePos - 1);
          ensureActiveVisible();
        }
      });
    }

    if (el.translationBox) {
      el.translationBox.addEventListener('input', handleTranslationInput);
    }

    if (el.toggleReviewedBtn) {
      el.toggleReviewedBtn.addEventListener('click', () => {
        const d = activeDialog();
        if (!d) return;
        d.reviewed = !d.reviewed;
        updateComputed(d);
        renderEditor();
        renderMetaChips();
        renderStatsBar();
        scheduleListRender();
        scheduleSaveCurrent();
      });
    }

    if (el.restoreBtn) {
      el.restoreBtn.addEventListener('click', () => {
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
        toast('Restore', 'Machine translation restored for current dialog.', 'ok');
      });
    }

    if (el.retranslateBtn) {
      el.retranslateBtn.addEventListener('click', async () => {
        const d = activeDialog();
        if (!d || !app.sessionId) return;
        if (app.retranslateBusy) return;
        app.retranslateBusy = true;
        try {
          toast('Retranslate', 'Sending request…', 'spin');
          await retranslateDialog(d);
          renderEditor();
          renderMetaChips();
          renderStatsBar();
          scheduleListRender();
          await saveCurrent();
          toast('Retranslate', 'Done.', 'ok');
        } catch (err) {
          toast('Retranslate failed', String(err?.message || err), 'bad');
        } finally {
          app.retranslateBusy = false;
        }
      });
    }

    if (el.copyOriginalBtn) {
      el.copyOriginalBtn.addEventListener('click', async () => {
        const d = activeDialog();
        if (!d) return;
        await copyText(String(d.original || ''), 'Original copied');
      });
    }

    if (el.copyTranslationBtn) {
      el.copyTranslationBtn.addEventListener('click', async () => {
        const d = activeDialog();
        if (!d) return;
        await copyText(String(d.translated || ''), 'Translation copied');
      });
    }

    if (el.bulkClearSelection) {
      el.bulkClearSelection.addEventListener('click', clearSelection);
    }

    if (el.bulkReview) {
      el.bulkReview.addEventListener('click', () =>
        bulkApply(async (d) => {
          d.reviewed = true;
        }, 'Mark reviewed')
      );
    }

    if (el.bulkUnreview) {
      el.bulkUnreview.addEventListener('click', () =>
        bulkApply(async (d) => {
          d.reviewed = false;
        }, 'Unreview')
      );
    }

    if (el.bulkRestore) {
      el.bulkRestore.addEventListener('click', () =>
        bulkApply(async (d) => {
          d.translated = String(d.machineTranslated || '');
          d.reviewed = false;
        }, 'Restore MT')
      );
    }

    if (el.bulkRetranslate) {
      el.bulkRetranslate.addEventListener('click', async () => {
        try {
          await bulkRetranslateSelected();
        } catch {}
      });
    }

    if (el.downloadBtn) {
      el.downloadBtn.addEventListener('click', downloadJson);
    }

    if (el.sessionsBtn) {
      el.sessionsBtn.addEventListener('click', async () => {
        modalOpen(true);
        await renderSessionsModal();
      });
    }

    if (el.closeSessionsBtn) {
      el.closeSessionsBtn.addEventListener('click', () => modalOpen(false));
    }

    if (el.sessionModal) {
      el.sessionModal.addEventListener('click', (e) => {
        const target = e.target;
        if (target === el.sessionModal) modalOpen(false);
      });
    }

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && el.sessionModal?.dataset.open === 'true') {
        modalOpen(false);
      }
    });
  }

  async function copyText(text, okMsg) {
    const t = String(text || '');
    if (!t) {
      toast('Copy', 'Nothing to copy.', 'warn');
      return;
    }

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(t);
        toast('Copy', okMsg, 'ok');
        return;
      }
    } catch {}

    const ta = document.createElement('textarea');
    ta.value = t;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    try {
      document.execCommand('copy');
      toast('Copy', okMsg, 'ok');
    } catch {
      toast('Copy failed', 'Clipboard access is not available in this context.', 'warn');
    }
    document.body.removeChild(ta);
  }

  async function boot() {
    attachEvents();

    const q = parseQuery();
    if (!q.sessionId) {
      modalOpen(true);
      await renderSessionsModal();
      return;
    }

    try {
      await loadSession(q.sessionId);
    } catch (err) {
      toast('Load failed', String(err?.message || err), 'bad');
      modalOpen(true);
      await renderSessionsModal();
    }
  }

  boot();
})();
