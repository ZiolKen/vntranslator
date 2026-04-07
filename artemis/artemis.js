(function () {
  'use strict';

  const Parser = globalThis.VNArtemisParserCore;
  const Common = globalThis.VNTranslationCommon;
  if (!Parser || !Common) {
    throw new Error('Missing VNArtemisParserCore or VNTranslationCommon');
  }

  const TARGET_LANGUAGES = [
    ['en', 'English'],
    ['zh-CN', 'Chinese (Simplified)'],
    ['hi', 'Hindi'],
    ['es', 'Spanish'],
    ['fr', 'French'],
    ['ar', 'Arabic'],
    ['pt', 'Portuguese'],
    ['ru', 'Russian'],
    ['de', 'German'],
    ['ja', 'Japanese'],
    ['id', 'Indonesian'],
    ['ms', 'Malay'],
    ['vi', 'Vietnamese'],
    ['tl', 'Filipino'],
    ['ko', 'Korean']
  ];

  const el = {
    model: document.getElementById('translationModel'),
    apiKey: document.getElementById('apiKey'),
    openaiKey: document.getElementById('chatgptApiKey'),
    apiKeyGroup: document.getElementById('apiKeyGroup'),
    openaiKeyGroup: document.getElementById('chatgptApiKeyGroup'),
    target: document.getElementById('targetLanguage'),
    outputEncoding: document.getElementById('outputEncoding'),
    batchSize: document.getElementById('batchSize'),
    cacheInput: document.getElementById('cacheInput'),
    fileInput: document.getElementById('fileInput'),
    startBtn: document.getElementById('startBtn'),
    pauseBtn: document.getElementById('pauseBtn'),
    stopBtn: document.getElementById('stopBtn'),
    progressBar: document.getElementById('progressBar'),
    progressText: document.getElementById('progressText'),
    log: document.getElementById('log')
  };

  const state = {
    cache: Object.create(null),
    running: false,
    paused: false,
    stopRequested: false,
    cacheLoaded: false,
  };

  function log(message, type) {
    const line = document.createElement('div');
    line.textContent = String(message || '');
    if (type === 'error') line.style.color = 'rgba(248,113,113,.98)';
    else if (type === 'warn') line.style.color = 'rgba(251,191,36,.98)';
    else if (type === 'success') line.style.color = 'rgba(52,211,153,.98)';
    else if (type === 'ai') line.style.color = 'rgba(34,211,238,.98)';
    el.log.appendChild(line);
    el.log.scrollTop = el.log.scrollHeight;
  }

  function populateModels() {
    Common.fillEngineSelect(el.model, 'deepseek');
  }

  function populateTargets() {
    el.target.innerHTML = '';
    TARGET_LANGUAGES.forEach(([value, label]) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      if (value === 'vi') option.selected = true;
      el.target.appendChild(option);
    });
  }

  function updateEngineUi() {
    const engine = Common.normalizeEngineId(el.model.value);
    const provider = Common.getEngineProvider(engine);
    el.apiKeyGroup.style.display = provider === 'deepseek' ? '' : 'none';
    el.openaiKeyGroup.style.display = provider === 'openai' ? '' : 'none';
  }

  async function waitIfPaused() {
    while (state.paused && state.running && !state.stopRequested) {
      await new Promise((resolve) => setTimeout(resolve, 180));
    }
  }

  function setControls(running) {
    el.startBtn.disabled = running;
    el.pauseBtn.disabled = !running;
    el.stopBtn.disabled = !running;
  }

  function updateProgress(done, total) {
    const safeTotal = Math.max(1, Number(total) || 1);
    const pct = Math.max(0, Math.min(100, Math.round((done / safeTotal) * 100)));
    el.progressBar.value = pct;
    el.progressText.textContent = pct + '% (' + done + '/' + total + ')';
  }

  async function importCacheIfNeeded() {
    const file = el.cacheInput.files[0];
    if (!file || state.cacheLoaded) return;
    const parsed = JSON.parse(await file.text());
    if (!parsed || typeof parsed !== 'object') throw new Error('Invalid cache JSON');
    Object.assign(state.cache, parsed);
    state.cacheLoaded = true;
    log('Loaded ' + Object.keys(parsed).length + ' cached strings.', 'success');
  }

  function downloadBlob(blob, filename) {
    const anchor = document.createElement('a');
    const url = URL.createObjectURL(blob);
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
      anchor.remove();
    }, 0);
  }

  async function readFileAsText(file) {
    const buffer = await file.arrayBuffer();
    const uint8 = new Uint8Array(buffer);
    const detected = (globalThis.Encoding && Encoding.detect(uint8)) || 'UTF8';
    const unicode = Encoding.codeToString(Encoding.convert(uint8, { to: 'UNICODE', from: detected }));
    return { text: unicode, detected: String(detected || 'UTF8').toUpperCase() };
  }

  function encodeText(text, originalEncoding) {
    const targetEncoding = String(el.outputEncoding.value || 'keep');
    const resolved = targetEncoding === 'keep' ? String(originalEncoding || 'UTF-8').toUpperCase() : targetEncoding;
    if (resolved === 'UTF-16LE') {
      const body = Encoding.convert(Encoding.stringToCode(text), { to: 'UTF16LE', from: 'UNICODE' });
      const bom = new Uint8Array([0xFF, 0xFE]);
      const out = new Uint8Array(bom.length + body.length);
      out.set(bom, 0);
      out.set(body, bom.length);
      return out;
    }
    if (resolved === 'SJIS' || resolved === 'SHIFT_JIS') {
      return new Uint8Array(Encoding.convert(Encoding.stringToCode(text), { to: 'SJIS', from: 'UNICODE' }));
    }
    return new TextEncoder().encode(text);
  }

  function collectPendingTexts(files) {
    const seen = new Set();
    const out = [];
    files.forEach((file) => {
      file.lines.forEach((line) => {
        const key = String(line || '');
        if (!key) return;
        if (Object.prototype.hasOwnProperty.call(state.cache, key)) return;
        if (seen.has(key)) return;
        seen.add(key);
        out.push(key);
      });
    });
    return out;
  }

  function buildMessages(lines) {
    const targetLabel = Common.languageLabel(el.target.value);
    const targetCode = Common.normalizeTargetCode(el.target.value);
    const payload = JSON.stringify(lines, null, 2);
    return [
      { role: 'system', content: ['You are a veteran Artemis visual novel translator and localization specialist.',
      'Preserve all Artemis tags, placeholders, variables, escape sequences, quotes, and structural formatting exactly.',
      'Do not translate command names, locale keys, field names, script syntax, arrays, or braces. Only translate visible dialogue and UI text strings.',
      'Return only a valid JSON array of translated strings.',
      ].join(' ') },
      {
        role: 'user',
        content: [
          'Target language: ' + targetLabel + ' (' + targetCode + ')',
          'Translate every string in the JSON array.',
          'Keep the same order and the same array length.',
          'Preserve placeholders, tags, escape sequences, variables, and inline formatting exactly.',
          'Return only a valid JSON array of translated strings.',
          'Input JSON array:',
          payload,
        ].join('\n\n')
      }
    ];
  }

  function restoreOuterWhitespace(source, translated) {
    const original = String(source ?? '');
    const text = String(translated ?? '');
    const leading = original.match(/^\s*/)?.[0] || '';
    const trailing = original.match(/\s*$/)?.[0] || '';
    const core = text.replace(/^\s+|\s+$/g, '');
    return core ? leading + core + trailing : original;
  }

  async function translateBatch(lines) {
    const engine = Common.normalizeEngineId(el.model.value);
    const concurrency = Math.max(1, Math.min(12, Math.min(lines.length || 1, Number(el.batchSize.value) || 1)));

    if (engine === 'lingva') {
      const output = await Common.translateLingvaLines(lines, el.target.value, { concurrency });
      return lines.map((line, index) => restoreOuterWhitespace(line, output[index]));
    }

    if (engine === 'google') {
      const output = await Common.translateGoogleLines(lines, el.target.value, { source: 'auto', concurrency });
      return lines.map((line, index) => restoreOuterWhitespace(line, output[index]));
    }

    const messages = buildMessages(lines);
    let data;
    if (engine === 'deepseek') {
      data = await Common.requestDeepSeekChat({
        apiKey: el.apiKey.value,
        model: 'deepseek-chat',
        messages,
      });
    } else if (Common.isOpenAIEngine(engine)) {
      data = await Common.requestOpenAIChat({
        apiKey: el.openaiKey.value,
        model: engine,
        messages,
      });
    } else {
      throw new Error('Unsupported translation engine: ' + engine);
    }

    const parsed = Common.safeParseJsonArray(Common.getChatContent(data));
    if (!Array.isArray(parsed) || !parsed.length) {
      throw new Error('The model did not return a valid JSON array.');
    }

    if (parsed.length !== lines.length) {
      log('Model returned ' + parsed.length + ' items for a batch of ' + lines.length + '. Missing entries were kept as source text.', 'warn');
    }

    return lines.map((line, index) => restoreOuterWhitespace(line, parsed[index]));
  }

  async function start() {
    if (state.running) return;
    const files = Array.from(el.fileInput.files || []);
    if (!files.length) {
      log('Select at least one .ast/.asb/.txt file first.', 'error');
      return;
    }

    const engine = Common.normalizeEngineId(el.model.value);
    const provider = Common.getEngineProvider(engine);
    if (provider === 'deepseek' && !Common.sanitizeApiKey(el.apiKey.value)) {
      log('Missing DeepSeek API key.', 'error');
      return;
    }
    if (provider === 'openai' && !Common.sanitizeApiKey(el.openaiKey.value)) {
      log('Missing OpenAI API key.', 'error');
      return;
    }

    state.running = true;
    state.paused = false;
    state.stopRequested = false;
    setControls(true);
    updateProgress(0, 1);

    try {
      await importCacheIfNeeded();
      const parsedFiles = [];
      for (const file of files) {
        const { text, detected } = await readFileAsText(file);
        const extracted = Parser.extractArtemisTextAndMapping(text);
        parsedFiles.push({
          name: file.name,
          detectedEncoding: detected,
          source: text,
          lines: extracted.lines,
          mapping: extracted.mapping,
        });
        log('Parsed ' + file.name + ' → ' + extracted.lines.length + ' text entries.', 'success');
      }

      const pending = collectPendingTexts(parsedFiles);
      const batchSize = Math.max(1, Math.min(32, Number(el.batchSize.value) || 1));
      log('Engine: ' + Common.getEngineLabel(engine) + ' • Target: ' + Common.languageLabel(el.target.value), 'ai');
      log('Unique strings to translate: ' + pending.length, 'ai');
      updateProgress(0, pending.length || 1);

      let done = 0;
      for (let i = 0; i < pending.length; i += batchSize) {
        if (state.stopRequested) throw new Error('Translation stopped by user.');
        await waitIfPaused();
        const batch = pending.slice(i, i + batchSize);
        log('Translating batch ' + (Math.floor(i / batchSize) + 1) + ' (' + batch.length + ' strings)...', 'ai');
        const translated = await translateBatch(batch);
        batch.forEach((source, index) => {
          const next = typeof translated[index] === 'string' ? translated[index] : '';
          state.cache[source] = next || source;
        });
        done += batch.length;
        updateProgress(done, pending.length || 1);
      }

      log('Packaging translated files...', 'ai');
      const zip = new JSZip();
      parsedFiles.forEach((file) => {
        const translatedLines = file.lines.map((line) => state.cache[line] || line);
        const merged = Parser.insertArtemisTextBack(file.source, translatedLines, file.mapping);
        zip.file(file.name, encodeText(merged, file.detectedEncoding));
      });
      zip.file('translation_cache.json', JSON.stringify(state.cache, null, 2));
      const blob = await zip.generateAsync({ type: 'blob' });
      downloadBlob(blob, 'vntranslator-artemis-' + Date.now() + '.zip');
      log('Done. Exported translated Artemis ZIP.', 'success');
      updateProgress(pending.length, pending.length || 1);
    } catch (error) {
      log(error && error.message ? error.message : String(error), 'error');
    } finally {
      state.running = false;
      state.paused = false;
      state.stopRequested = false;
      setControls(false);
      el.pauseBtn.textContent = '⏸️ Pause';
    }
  }

  el.model.addEventListener('change', updateEngineUi);
  el.startBtn.addEventListener('click', start);
  el.pauseBtn.addEventListener('click', () => {
    if (!state.running) return;
    state.paused = !state.paused;
    el.pauseBtn.textContent = state.paused ? '▶️ Resume' : '⏸️ Pause';
    log(state.paused ? 'Paused.' : 'Resumed.', 'warn');
  });
  el.stopBtn.addEventListener('click', () => {
    if (!state.running) return;
    state.stopRequested = true;
    state.paused = false;
    el.pauseBtn.textContent = '⏸️ Pause';
    log('Stop requested. Waiting for the current request to finish...', 'warn');
  });

  populateModels();
  populateTargets();
  updateEngineUi();
  setControls(false);
  updateProgress(0, 0);
})();
