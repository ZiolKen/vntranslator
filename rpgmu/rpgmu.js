// ================================
// GOOGLE TRANSLATE SPEED BOOST
// ================================
const TRANSLATE_POOL_LIMIT = 10;
let activeRequests = 0;
const translateQueue = [];
const translateCache = new Map();

function runTranslateTask(task) {
  return new Promise((resolve, reject) => {
    translateQueue.push({ task, resolve, reject });
    processTranslateQueue();
  });
}

function processTranslateQueue() {
  if (activeRequests >= TRANSLATE_POOL_LIMIT) return;
  if (!translateQueue.length) return;

  const { task, resolve, reject } = translateQueue.shift();
  activeRequests++;

  task()
    .then(resolve)
    .catch(reject)
    .finally(() => {
      activeRequests--;
      processTranslateQueue();
    });
}

// ================================
// CONFIG
// ================================
const SEPARATOR_RE = /^---------\d+\s*$/; 
const RPGM_NAME_TAG_RE = /^(\\n<.*?>)/; 
const RPGM_CODE_RE = /(?:(?:\\\\N(?:\[(?:[0-9]{4})?\])?)|(?:\\N(?:\[(?:[0-9]{4})?\]|<(?:\\N\[(?:[0-9]{4})\])?>)?)|\\[a-zA-Z]+\[?[^\]]*\]?|\\n|\\\.|\\\||\\\!|\\\^|\\\$)/g;
const VIETNAMESE_REGEX = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;

const els = {
  input: document.getElementById('fileInput'),
  start: document.getElementById('startBtn'),
  stop: document.getElementById('stopBtn'),
  copy: document.getElementById('copyBtn'),
  dl: document.getElementById('downloadBtn'),
  out: document.getElementById('outputArea'),
  bar: document.getElementById('progressBar'),
  pt: document.getElementById('progressText'),
  log: document.getElementById('logConsole'),
  batch: document.getElementById('batchSize'),
  mode: document.getElementById('transMode'),
  skipVi: document.getElementById('skipVietnamese')
};

els.model = document.getElementById('transModel');
els.apiKey = document.getElementById('apiKey');
els.apiKeyGroup = document.getElementById('apiKeyGroup');

els.model.addEventListener('change', () => {
  const m = els.model.value;
  els.apiKeyGroup.style.display = m === 'deepseek' ? 'block' : 'none';

  if (m === 'lingva' || m === 'google') {
    showLingvaWarning();
  }
});

const lingvaModal = document.getElementById('lingvaWarningModal');
const confirmLingvaBtn = document.getElementById('confirmLingvaBtn');
const cancelLingvaBtn = document.getElementById('cancelLingvaBtn');

let pendingModel = null;

function showLingvaWarning() {
  pendingModel = els.model.value;
  lingvaModal.classList.remove('hidden');
}

confirmLingvaBtn.onclick = () => {
  lingvaModal.classList.add('hidden');
};

cancelLingvaBtn.onclick = () => {
  lingvaModal.classList.add('hidden');
  els.model.value = 'deepseek';
  els.apiKeyGroup.style.display = 'block';
};

let state = {
  blocks: [],
  total: 0,
  processed: 0,
  isRunning: false,
  abortCtrl: null
};

function languageLabel(code) {
  return {
    vi: "Vietnamese",
    en: "English",
    id: "Indonesian",
    ms: "Malay",
    tl: "Filipino"
  }[code] || code;
}

async function translateBatchDeepSeek(batch, targetLang, apiKey) {
  const lines = batch.map(d => d.protectedText);

  const prompt =
`Translate the following RPG Maker dialogue lines to ${languageLabel(targetLang)} (code: ${targetLang}).

RULES:
- Some parts are placeholders like __PH0__, __PH1__. Keep them EXACTLY as-is and do NOT translate them.
- Preserve RPGM syntax, variables, and tags.
- DO NOT remove or add \\n or any RPGM escape codes.
- Do NOT reorder, merge, or split lines.
- Do NOT change placeholders or variables.
- Return ONLY the translated lines, one per line, in the same order.
- Do NOT add numbering, quotes, prefixes, or extra commentary.

LINES:
${lines.join("\n")}`;

  const body = {
    apiKey,
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

  if (!res.ok) throw new Error("DeepSeek error " + res.status);

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content || "";

  const outLines = content
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean);

  return outLines;
}

// ================================
// LOG
// ================================
function addLog(type, line, extra = "") {
  const div = document.createElement('div');
  div.className = 'log-item';

  let badge = `<span class="tag tag-skip">LOG</span>`;
  if (type === 'ok') badge = `<span class="tag tag-ok">OK</span>`;
  else if (type === 'exist') badge = `<span class="tag tag-exist">EXIST</span>`;
  else if (type.startsWith('tag-'))
    badge = `<span class="tag ${type}">${type.replace('tag-','').toUpperCase()}</span>`;

  div.innerHTML = `
    ${badge}
    <span style="color:#aaa">${line.slice(0,40)}</span>
    <span style="margin:0 5px;color:#555">➔</span>
    <span style="color:#fff">${extra.slice(0,40)}</span>
  `;

  els.log.prepend(div);
  if (els.log.children.length > 60) els.log.lastChild.remove();
}

// ================================
// LOAD FILE
// ================================
els.input.addEventListener('change', async e => {
  const file = e.target.files[0];
  if (!file) return;

  const text = await file.text();
  const lines = text.split(/\r?\n/);

  state.blocks = [];
  let current = null;

  for (let line of lines) {
    if (SEPARATOR_RE.test(line)) {
      if (current) state.blocks.push(current);
      current = { header: line.trim(), lines: [], translated: [] };
    } else {
      if (!current) current = { header: '', lines: [], translated: [] };
      current.lines.push(line);
    }
  }
  if (current) state.blocks.push(current);

  state.total = state.blocks.length;
  els.out.value = "";
  els.log.innerHTML = "";
  els.pt.textContent = "0%";
  els.start.disabled = false;

  addLog("ok", "File loaded", `${state.total} blocks`);
});

// ================================
// START TRANSLATE
// ================================
els.start.addEventListener('click', async () => {
  state.isRunning = true;
  state.abortCtrl = new AbortController();
  state.processed = 0;

  els.start.disabled = true;
  els.stop.disabled = false;

  const batchSize = parseInt(els.batch.value) || 200;
  const targetLang = els.mode.value;

  for (let i = 0; i < state.blocks.length; i += batchSize) {
    if (!state.isRunning) break;

    const chunk = state.blocks.slice(i, i + batchSize);
    await Promise.all(chunk.map(b =>
      translateBlock(b, targetLang, state.abortCtrl.signal)
    ));

    state.processed += chunk.length;
    updateUI();
  }
  finish();
});

// ================================
// TRANSLATE BLOCK
// ================================
async function translateBlock(block, targetLang, signal) {
  const model = els.model.value;
  const apiKey = els.apiKey?.value || "";
  const isSkipVi = els.skipVi.checked;

  // =========================
  // DEEPSEEK MODE
  // =========================
  if (model === "deepseek") {
    if (!apiKey) throw new Error("DeepSeek API key is required");

    const batch = [];
    const meta = [];

    for (let line of block.lines) {
      if (!line.trim()) {
        meta.push({ type: "empty", raw: line });
        continue;
      }

      if (isSkipVi && VIETNAMESE_REGEX.test(line)) {
        meta.push({ type: "skip", raw: line });
        continue;
      }

      let nameTag = "";
      let content = line;

      const nameMatch = line.match(RPGM_NAME_TAG_RE);
      if (nameMatch) {
        nameTag = nameMatch[1];
        content = line.slice(nameTag.length);
      }

      const ph = new Map();
      let pid = 0;

      const safe = content.replace(RPGM_CODE_RE, m => {
        const k = `__PH${pid++}__`;
        ph.set(k, m);
        return k;
      });

      batch.push({ protectedText: safe });
      meta.push({ type: "translated", nameTag, placeholders: ph });
    }

    if (batch.length === 0) {
      block.translated = block.lines.slice();
      return;
    }

    const translatedLines = await translateBatchDeepSeek(
      batch,
      targetLang,
      apiKey
    );

    let tIndex = 0;
    const result = [];

    for (let i = 0; i < meta.length; i++) {
      const m = meta[i];

      if (m.type === "empty" || m.type === "skip") {
        result.push(m.raw);
        continue;
      }

      let out = translatedLines[tIndex++] || "";

      m.placeholders.forEach((v, k) => {
        out = out.replace(k, v);
      });

      if (m.nameTag) {
        out = m.nameTag + (out.startsWith(" ") ? "" : " ") + out.trim();
      }

      result.push(out);
      addLog(`tag-${targetLang}`, "", out);
    }

    block.translated = result;
    return;
  }

  // =========================
  // GOOGLE / LINGVA
  // =========================
  const res = [];

  for (let line of block.lines) {
    if (!line.trim()) {
      res.push(line);
      continue;
    }

    let nameTag = "";
    let content = line;

    const nameMatch = line.match(RPGM_NAME_TAG_RE);
    if (nameMatch) {
      nameTag = nameMatch[1];
      content = line.slice(nameTag.length);
    }

    if (!content.trim()) {
      res.push(line);
      continue;
    }

    if (isSkipVi && VIETNAMESE_REGEX.test(content)) {
      res.push(line);
      addLog("exist", content, "SKIP");
      continue;
    }

    const ph = new Map();
    let pid = 0;

    const safe = content.replace(RPGM_CODE_RE, m => {
      const k = `__PH${pid++}__`;
      ph.set(k, m);
      return k;
    });

    try {
      const trans = await googleTranslate(
        safe,
        "auto",
        targetLang,
        signal
      );

      let final = trans;
      ph.forEach((v, k) => {
        final = final.replace(k, v);
      });

      if (nameTag)
        final = nameTag + (content.startsWith(" ") ? " " : "") + final.trim();

      res.push(final);
      addLog(`tag-${targetLang}`, content, final);
    } catch {
      res.push(line);
    }
  }

  block.translated = res;
}

// ================================
// GOOGLE TRANSLATE
// ================================
async function googleTranslate(text, sl, tl, signal) {
  if (!text.trim()) return text;

  const cacheKey = `${sl}->${tl}::${text}`;
  if (translateCache.has(cacheKey))
    return translateCache.get(cacheKey);

  return runTranslateTask(async () => {
    const url =
      `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sl}&tl=${tl}&dt=t&q=${encodeURIComponent(text)}`;
    const res = await fetch(url, { signal });
    const data = await res.json();
    const out = data[0].map(x => x[0]).join('');
    translateCache.set(cacheKey, out);
    return out;
  });
}

// ================================
// UI / FINISH
// ================================
function updateUI() {
  const pct = Math.round((state.processed / state.total) * 100);
  els.bar.style.width = pct + "%";
  els.pt.textContent = pct + "%";
}

function buildResultText() {
  return state.blocks.map(b =>
    (b.header ? b.header + "\n" : "") +
    (b.translated.length ? b.translated : b.lines).join("\n")
  ).join("\n");
}

function finish() {
  state.isRunning = false;
  els.out.value = buildResultText();
  els.start.disabled = false;
  els.stop.disabled = true;
  els.copy.disabled = false;
  els.dl.disabled = false;
  addLog("ok", "DONE", "All files processed");
}

// ================================
// BUTTONS
// ================================
els.stop.addEventListener('click', () => {
  if (state.abortCtrl) state.abortCtrl.abort();
  finish();
});

els.copy.addEventListener('click', async () => {
  if (!els.out.value.trim()) return alert("There is no content to copy.");
  await navigator.clipboard.writeText(els.out.value);
  alert("Copied!");
});

els.dl.addEventListener('click', () => {
  const lang = els.mode.value;
  const blob = new Blob([els.out.value], { type: "text/plain;charset=utf-8" });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = els.input.files[0]
    ? els.input.files[0].name.replace('.txt', `_${lang}.txt`)
    : `translated_${lang}.txt`;
  a.click();
});