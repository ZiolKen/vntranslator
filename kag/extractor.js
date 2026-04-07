(function () {
  'use strict';
  const Parser = globalThis.VNKAGParserCore;
  const logBox = document.getElementById('log');

  function log(msg, type) {
    const line = document.createElement('div');
    line.textContent = String(msg || '');
    if (type === 'error') line.style.color = 'var(--neon-red)';
    else if (type === 'warn') line.style.color = 'var(--neon-yellow)';
    else if (type === 'success') line.style.color = 'var(--neon-green)';
    else line.style.color = 'var(--neon-cyan)';
    logBox.appendChild(line);
    logBox.scrollTop = logBox.scrollHeight;
  }

  async function readFileAsText(file) {
    const buffer = await file.arrayBuffer();
    const uint8 = new Uint8Array(buffer);
    const detected = (globalThis.Encoding && Encoding.detect(uint8)) || 'UTF8';
    const text = Encoding.codeToString(Encoding.convert(uint8, { to: 'UNICODE', from: detected }));
    return { text, detected: String(detected || 'UTF8').toUpperCase() };
  }

  function downloadText(name, text) {
    const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
    const anchor = document.createElement('a');
    anchor.href = URL.createObjectURL(blob);
    anchor.download = name;
    anchor.click();
  }

  function encodeText(text, outputEncoding) {
    const resolved = String(outputEncoding || 'UTF-8').toUpperCase();
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

  document.getElementById('extractBtn').addEventListener('click', async () => {
    const files = Array.from(document.getElementById('extractFile').files || []);
    if (!files.length) return alert('Select at least one KAG file.');
    for (const file of files) {
      const { text, detected } = await readFileAsText(file);
      const extracted = Parser.extractKAGTextAndMapping(text);
      const pack = {
        engine: 'kirikiri-kag',
        version: 2,
        sourceFile: file.name,
        sourceEncoding: detected,
        lines: extracted.lines,
        mapping: extracted.mapping,
      };
      downloadText(file.name.replace(/\.[^.]+$/, '') + '.kag-dialogs.json', JSON.stringify(pack, null, 2));
      log('Extracted ' + extracted.lines.length + ' dialogs from ' + file.name, 'success');
    }
  });

  document.getElementById('mergeBtn').addEventListener('click', async () => {
    const translated = document.getElementById('translatedFile').files[0];
    const original = document.getElementById('originalFile').files[0];
    const outputEncoding = document.getElementById('mergeEncoding').value;
    if (!translated || !original) return alert('Select translated JSON + original KAG script.');
    const pack = JSON.parse(await translated.text());
    const { text, detected } = await readFileAsText(original);
    const merged = Parser.insertKAGTextBack(text, pack.lines || [], pack.mapping || []);
    const blob = new Blob([encodeText(merged, outputEncoding === 'keep' ? (pack.sourceEncoding || detected) : outputEncoding)], { type: 'application/octet-stream' });
    const anchor = document.createElement('a');
    anchor.href = URL.createObjectURL(blob);
    anchor.download = original.name;
    anchor.click();
    log('Merged ' + original.name, 'success');
  });
})();
