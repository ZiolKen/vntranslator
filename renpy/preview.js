let currentPage = 1;
const pageSize = 50;

const TRANSLATOR_CREDIT =
    '# Translated by VN Translator: https://vntranslator.vercel.app/ or https://vntranslator.pages.dev/';

function safeJsonParse(str, fallback = null) {
  try { return JSON.parse(str); } catch { return fallback; }
}

const dialogIndexes = safeJsonParse(localStorage.getItem('dialogIndexes'), []);
const detectedDialogs = safeJsonParse(localStorage.getItem('detectedDialogs'), []);
let translatedDialogs = safeJsonParse(localStorage.getItem('translatedDialogs'), []);
const apiKey = (sessionStorage.getItem('deepseekApiKey') || localStorage.getItem('deepseekApiKey') || '').trim();
const langTarget = localStorage.getItem('targetLang') || 'Bahasa Indonesia';
const translationModel = localStorage.getItem('translationModel') || 'deepseek';

document.addEventListener('DOMContentLoaded', function() {
  const listEl = document.getElementById('list');

  if (!Array.isArray(detectedDialogs) || detectedDialogs.length === 0) {
    listEl.replaceChildren();
    const box = document.createElement('div');
    box.className = 'text-center text-red-400 p-4 bg-gray-800 rounded-lg';
    box.textContent = "No translation data found! Please go back to the main page and process your file first.";
    listEl.appendChild(box);
    return;
  }

  renderModelBadge();
  renderList();
  injectWatermark();
});

function renderModelBadge() {
  const modelBadge = document.getElementById('model-badge');
  if (!modelBadge) return;

  modelBadge.replaceChildren();

  const pill = document.createElement('div');
  pill.className =
    'inline-block text-xs px-3 py-1 rounded-full mb-2 ' +
    (translationModel === 'deepseek'
      ? 'bg-blue-900 text-blue-300'
      : 'bg-amber-900 text-amber-300');

  const label = translationModel === 'deepseek' ? 'DEEPSEEK (API)' : 'LIBRE (Free)';
  pill.textContent = 'Using: ' + label;

  modelBadge.appendChild(pill);
}

const _saveDebounce = Object.create(null);

function renderList() {
  const listEl = document.getElementById('list');
  if (!listEl) return;

  const totalPages = Math.ceil(detectedDialogs.length / pageSize);
  const start = (currentPage - 1) * pageSize;
  const end = Math.min(start + pageSize, detectedDialogs.length);

  listEl.replaceChildren();

  const frag = document.createDocumentFragment();

  for (let i = start; i < end; i++) {
    const dialog = String(detectedDialogs[i] || '');
    const translation = String(translatedDialogs[i] || '');

    const card = document.createElement('div');
    card.className = 'bg-gray-800 rounded-xl p-4 shadow';

    const meta = document.createElement('div');
    meta.className = 'text-xs text-gray-400 mb-1';
    meta.textContent = `Dialog ${i + 1} (line ${(dialogIndexes[i]?.index || 0) + 1})`;

    const original = document.createElement('div');
    original.className = 'mb-2 text-blue-400 break-words';
    const originalLabel = document.createElement('span');
    originalLabel.className = 'font-semibold';
    originalLabel.textContent = 'Original: ';
    original.appendChild(originalLabel);
    original.appendChild(document.createTextNode(dialog));

    const textarea = document.createElement('textarea');
    textarea.id = 'trans_' + i;
    textarea.rows = 2;
    textarea.className =
      'w-full p-2 rounded bg-gray-900 border border-gray-700 text-gray-100 ' +
      'focus:outline-none focus:ring focus:border-blue-400 transition mb-2';
    textarea.value = translation;

    textarea.addEventListener('input', () => {
      clearTimeout(_saveDebounce[i]);
      _saveDebounce[i] = setTimeout(() => {
        saveEdit(i);
        updateWarning(i);
      }, 250);
    });

    const warnDiv = document.createElement('div');
    warnDiv.id = 'warn_' + i;
    warnDiv.className = 'text-xs mt-1 text-yellow-400';
    warnDiv.textContent = shouldWarn(translation) || '';

    const btnRow = document.createElement('div');
    btnRow.className = 'flex gap-2 mt-2';

    const restoreBtn = document.createElement('button');
    restoreBtn.type = 'button';
    restoreBtn.className =
      'bg-yellow-600 hover:bg-yellow-700 text-sm rounded px-4 py-1 font-medium transition';
    restoreBtn.textContent = 'Restore';
    restoreBtn.addEventListener('click', () => restore(i));

    const reBtn = document.createElement('button');
    reBtn.type = 'button';
    reBtn.className =
      'bg-blue-600 hover:bg-blue-700 text-sm rounded px-4 py-1 font-medium transition';
    reBtn.textContent = 'Retranslate';
    reBtn.addEventListener('click', () => retranslate(i));

    btnRow.append(restoreBtn, reBtn);

    const status = document.createElement('div');
    status.id = 'status_' + i;
    status.className = 'text-xs mt-1';

    card.append(meta, original, textarea, warnDiv, btnRow, status);
    frag.appendChild(card);
  }

  if (detectedDialogs.length > 0) {
    const pager = document.createElement('div');
    pager.className = 'flex justify-center gap-4 mt-4';

    const prev = document.createElement('button');
    prev.type = 'button';
    prev.disabled = currentPage === 1;
    prev.className =
      'bg-gray-700 hover:bg-gray-600 disabled:opacity-50 px-4 py-2 rounded';
    prev.textContent = 'Prev';
    prev.addEventListener('click', () => {
      currentPage--;
      renderList();
    });

    const info = document.createElement('div');
    info.className = 'text-gray-300 text-sm self-center';
    info.textContent = `Page ${currentPage} / ${totalPages}`;

    const next = document.createElement('button');
    next.type = 'button';
    next.disabled = currentPage === totalPages;
    next.className =
      'bg-gray-700 hover:bg-gray-600 disabled:opacity-50 px-4 py-2 rounded';
    next.textContent = 'Next';
    next.addEventListener('click', () => {
      currentPage++;
      renderList();
    });

    pager.append(prev, info, next);
    frag.appendChild(pager);
  }

  listEl.appendChild(frag);
}

function shouldWarn(text) {
  const t = String(text || '');
  if (!t.trim()) return '⚠ Empty translation';
  if (t.includes('[WARNING')) return '⚠ Warning token present';
  if (t.length > 500) return '⚠ Very long translation';
  return '';
}

function saveEdit(index) {
  const el = document.getElementById('trans_' + index);
  if (!el) return;
  translatedDialogs[index] = String(el.value || '');
  localStorage.setItem('translatedDialogs', JSON.stringify(translatedDialogs));
}

function updateWarning(index) {
  const el = document.getElementById('trans_' + index);
  const w = document.getElementById('warn_' + index);
  if (!el || !w) return;
  w.textContent = shouldWarn(String(el.value || '')) || '';
}

function restore(i) {
  const el = document.getElementById('trans_' + i);
  if (!el) return;
  el.value = '';
  saveEdit(i);
  updateWarning(i);
}

async function retranslate(i) {
  const status = document.getElementById('status_' + i);
  if (status) status.textContent = 'Translating...';

  try {
    const src = String(detectedDialogs[i] || '');
    if (!src.trim()) throw new Error('No text');

    const translated = await translateText(src);
    translatedDialogs[i] = translated;
    localStorage.setItem('translatedDialogs', JSON.stringify(translatedDialogs));

    const el = document.getElementById('trans_' + i);
    if (el) el.value = translated;
    updateWarning(i);

    if (status) status.textContent = '✓ Success';
  } catch (e) {
    if (status) status.textContent = '✗ ' + (e?.message || 'Failed');
  }
}

async function translateText(text) {
  if (translationModel === 'deepseek') {
    if (!apiKey) throw new Error('Missing DeepSeek API key');
    const res = await fetch('/api/deepseek-proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey, messages: [{ role: 'user', content: text }], targetLang: langTarget })
    });
    if (!res.ok) throw new Error('API error ' + res.status);
    const data = await res.json();
    return String(data?.translation || data?.text || '').trim();
  } else {
    const res = await fetch('/api/lingva-proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, target: langTarget })
    });
    if (!res.ok) throw new Error('API error ' + res.status);
    const data = await res.json();
    return String(data?.translation || data?.text || '').trim();
  }
}

function downloadFile() {
  const lines = [];
  for (let i = 0; i < detectedDialogs.length; i++) {
    const originalIndex = dialogIndexes[i]?.index;
    const t = translatedDialogs[i] || '';
    if (typeof originalIndex === 'number') {
      lines.push({ index: originalIndex, text: t });
    }
  }
  lines.sort((a, b) => a.index - b.index);

  const contentLines = [];
  contentLines.push(TRANSLATOR_CREDIT);
  for (const l of lines) {
    contentLines.push(l.text);
  }

  const content = contentLines.join('\n');
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'translated.rpy';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
}

function injectWatermark() {
  const place = document.getElementById('watermark-place');
  if (!place) return;
  place.replaceChildren();
  const el = document.createElement('div');
  el.className = 'fixed bottom-2 right-2 opacity-60 text-xs text-white select-none z-50 font-mono px-4 py-1 rounded-xl bg-gray-700/60 shadow';
  el.textContent = '© Translated with VN Translator';
  document.getElementById('watermark-place').appendChild(el);
}
