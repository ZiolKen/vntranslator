        (function () {
          'use strict';
        
          const el = {
            fileInput: document.getElementById('fileInput'),
            translateBtn: document.getElementById('translateBtn'),
            translateLabel: document.getElementById('translateLabel'),
            spinner: document.getElementById('spinner'),
            progressBar: document.getElementById('progressBar'),
            progressText: document.getElementById('progressText'),
            logBox: document.getElementById('logBox'),
            previewBtn: document.getElementById('previewBtn'),
            downloadFinal: document.getElementById('downloadFinal'),
            downloadProgress: document.getElementById('downloadProgress'),
            modelSelect: document.getElementById('modelSelect'),
            apiKeyContainer: document.getElementById('apiKeyContainer'),
            apiKey: document.getElementById('apiKey'),
            controlBtns: document.getElementById('controlBtns'),
            stopBtn: document.getElementById('stopBtn'),
            resumeBtn: document.getElementById('resumeBtn'),
            libreWarningModal: document.getElementById('libreWarningModal'),
            libreWarningClose: document.querySelector('#libreWarningModal .close-modal'),
            confirmLibre: document.getElementById('confirmLibre'),
            langTarget: document.getElementById('langTarget'),
          };
        
          const state = {
            fileName: null,
            originalText: '',
            originalLines: [],
            dialogs: [],
            batches: [],
            isTranslating: false,
            isPaused: false,
            currentBatchIndex: 0,
            logEntries: [],
          };
        
          function delay(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
          }
        
          function languageLabel(codeOrName) {
            const v = String(codeOrName || '').toLowerCase();
        
            if (['id', 'indonesian', 'bahasa indonesia'].includes(v)) return 'Indonesian';
            if (['en', 'english', 'en-us', 'en-gb'].includes(v)) return 'English';
            if (['ms', 'malay', 'ms-my'].includes(v)) return 'Malay';
            if (['vi', 'vietnamese', 'vi-vn'].includes(v)) return 'Vietnamese';
            if (['tl', 'fil', 'filipino', 'tagalog'].includes(v)) return 'Filipino';
        
            return codeOrName || '';
          }
        
          function escapeHtml(str) {
            const div = document.createElement('div');
            div.innerText = str;
            return div.innerHTML;
          }
        
          function estimateTokens(text) {
            if (typeof TextEncoder === 'undefined') {
              return Math.ceil(text.length / 4);
            }
            const bytes = new TextEncoder().encode(text);
            return Math.ceil(bytes.length / 4);
          }
        
          function createBatches(dialogs, options) {
            const maxLines = options.maxLines ?? 64;
            const maxTokens = options.maxTokens ?? 2000;
            const batches = [];
        
            let currentBatch = [];
            let currentTokens = 0;
        
            for (const dialog of dialogs) {
              const text = dialog.quote || '';
              const tokens = estimateTokens(text) + 8; 
        
              if (currentBatch.length > 0 &&
                  (currentBatch.length >= maxLines || currentTokens + tokens > maxTokens)) {
                batches.push(currentBatch);
                currentBatch = [];
                currentTokens = 0;
              }
        
              currentBatch.push(dialog);
              currentTokens += tokens;
            }
        
            if (currentBatch.length > 0) {
              batches.push(currentBatch);
            }
        
            return batches;
          }
        
          function log(message, level = 'info') {
            const entryText = message;
        
            state.logEntries.push(entryText);
        
            if (!el.logBox) return;
            const p = document.createElement('p');
            p.textContent = entryText;
            switch (level) {
              case 'error':
                p.style.color = '#ff1b1b';
                break;
              case 'warn':
                p.style.color = '#f1f759';
                break;
              case 'success':
                p.style.color = '#39ff14';
                break;
              default:
                p.style.color = '#00ffff';
                break;
            }
            el.logBox.appendChild(p);
            el.logBox.scrollTop = el.logBox.scrollHeight;
          }
        
          function setTranslateButtonBusy(isBusy, labelWhenBusy = '🔁 Translating...') {
            if (!el.translateBtn || !el.translateLabel || !el.spinner) return;
        
            if (isBusy) {
              el.translateBtn.disabled = true;
              el.translateLabel.textContent = labelWhenBusy;
              el.spinner.style.display = 'inline-block';
            } else {
              el.translateBtn.disabled = false;
              el.translateLabel.textContent = '▶️ Start Translating';
              el.spinner.style.display = 'none';
            }
          }
        
          function resetTranslateUIAfterFinish() {
            state.isTranslating = false;
            state.isPaused = false;
            setTranslateButtonBusy(false);
            if (el.controlBtns) el.controlBtns.style.display = 'none';
            if (el.stopBtn) el.stopBtn.disabled = true;
            if (el.resumeBtn) el.resumeBtn.disabled = true;
          }
        
          function updateProgress() {
            const total = state.dialogs.length;
            const done = state.dialogs.filter(d => d.translated != null).length;
        
            if (el.progressBar) {
              el.progressBar.max = total || 1;
              el.progressBar.value = done;
            }
        
            if (el.progressText) {
              el.progressText.textContent = `${done} / ${total || 0} lines translated`;
            }
          }
        
          function updateControlButtons() {
            if (!el.controlBtns || !el.stopBtn || !el.resumeBtn) return;
        
            if (!state.isTranslating) {
              el.controlBtns.style.display = 'none';
              el.stopBtn.disabled = true;
              el.resumeBtn.disabled = true;
              return;
            }
        
            el.controlBtns.style.display = 'flex';
            el.stopBtn.disabled = state.isPaused;
            el.resumeBtn.disabled = !state.isPaused;
          }
        
          function isDialogLine(line) {
              const trimmed = line.trim();
              if (trimmed === '') return false;
              if (/#/.test(trimmed)) return false;
              if (/^(#|label\s|key\s|style\s|text_font\s|font\s|$\s|if\s|else\s|at\s|align\s|easeout\s|size\s|hovered\s|unhovered\s|import\s|config\s|with\s|def\s|move\s|background\s|text\s|add\s|action\s|screen\s|sound\s|outlines\s|outline_scaling\s|menu\s|jump\s|scene\s|init\s|show\s|hide\s|stop\s|play\s|queue\s|transform\s|define\s|image\s|window\s|voice\s|pause\s|call\s|return\s|renpy\s|python\s)/i.test(trimmed)) return false;
              if (/^[\w\s]*=[^"]/.test(trimmed)) return false;
              if (/\.(png|jpg|jpeg|webp|gif|ogg|mp3|wav|mp4|webm|m4a|avi|mov|ttf|otf|pfb|pfm|ps|woff|woff2|eot|svg)["']?/i.test(trimmed)) return false;
              if (/["'](images?|audio|music|voice|bg|sfx|movie|video|sounds?)\//i.test(trimmed)) return false;
              const keywords = ["screen", "$", "background", "outlines", "outline_scaling", "easeout", "hovered", "unhovered", "font", "text", "text_font", "style", "key", "elif", "==", "=", "else", "at", "def", "config", "size", "add", "action", "show", "play", "image", "sound", "align", "import", "with", "move"];
              const outsideQuotes = trimmed.replace(/"[^"]*"|'[^']*'/g, "");
              if (keywords.some(kw => new RegExp(`\\b${kw}\\b`, "i").test(outsideQuotes))) return false;
              if (/^[\w\s]*:\s*["'].*["']/.test(trimmed)) return true;
              if (/^["'].*["']/.test(trimmed)) return true;
              const q = trimmed.match(/(['"])(.*)\1/);
              if (q) {
                  const t = q[2].trim();
                  if (t === "" || /^[.\s]+$/.test(t)) return false;
              }
              if (/{.*?}/.test(trimmed) && /[\w\-\?!'"]/i.test(trimmed)) return true;
              if (/^[\w\s]*\s*".+?"\s*$/.test(trimmed)) return true;
              return false;
          }
            
          function extractDialogsFromLines(lines) {
            const dialogs = [];
        
            lines.forEach((line, index) => {
              if (!isDialogLine(line)) return;
        
              const match = line.match(/"((?:\\.|[^"\\])*)"/);
              if (!match) return;
        
              const dialogText = match[1];
              if (dialogText.trim() === "" || /^[.\s]+$/.test(dialogText)) return;
        
              dialogs.push({
                index,
                originalLine: line,
                quote: dialogText,
                translated: null,
              });
            });
        
            return dialogs;
          }
        
          async function translateBatchDeepSeek(batchDialogs, targetLang, apiKey) {
            const lines = batchDialogs.map(d => d.quote);
            const languageName = languageLabel(targetLang);
        
            const userPromptLines = [
              `Translate the following Ren'Py dialogue lines to ${languageName} (language code: ${targetLang}).`,
              '',
              'Rules:',
              '- Preserve Ren\'Py syntax, variables, and tags (e.g. {color}, {size}, [variable], etc.).',
              '- Do NOT change placeholders or variables.',
              '- Do NOT reorder, merge, or split lines.',
              '- Return ONLY the translated lines, one per line, in the same order.',
              '- Do NOT add numbering, quotes, prefixes, or extra commentary.',
              '',
              'Lines:'
            ];
        
            const prompt = userPromptLines.concat(lines).join('\n');
        
            const body = {
              model: 'deepseek-chat',
              messages: [
                {
                  role: 'system',
                  content: 'You are a professional game localization translator specializing in Ren\'Py visual novels.'
                },
                {
                  role: 'user',
                  content: prompt
                }
              ]
            };
        
            const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + apiKey
              },
              body: JSON.stringify(body)
            });
        
            if (!response.ok) {
              const text = await response.text();
              throw new Error(`*️⃣ DeepSeek API error ${response.status}: ${text}`);
            }
        
            const data = await response.json();
            const content =
              data &&
              data.choices &&
              data.choices[0] &&
              data.choices[0].message &&
              data.choices[0].message.content;
        
            if (!content) {
              throw new Error('*️⃣ DeepSeek response did not contain any content.');
            }
        
            const outLines = content
              .split(/\r?\n/)
              .map(l => l.trim())
              .filter(l => l !== '');
        
            if (outLines.length !== lines.length) {
              log(
                `*️⃣ Warning: expected ${lines.length} lines from DeepSeek but got ${outLines.length}. Mapping by order anyway.`,
                'warn'
              );
            }
        
            return outLines;
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
          };
        
          function getLingvaLangCode(lang) {
            if (!lang) return 'en';
        
            const trimmed = String(lang).trim();
        
            if (/^[a-z]{2}(-[A-Za-z0-9]+)?$/i.test(trimmed)) {
              return trimmed.toLowerCase();
            }
        
            const key = Object.keys(LINGVA_LANG_MAP).find(
              (k) => k.toLowerCase() === trimmed.toLowerCase()
            );
        
            return key ? LINGVA_LANG_MAP[key] : trimmed;
          }
          
          const LINGVA_BASE_URLS = [
            'https://lingva.lunar.icu',
            'https://lingva.ml',
            'https://lingva.vercel.app',
            'https://translate.plausibility.cloud',
            'https://lingva.garudalinux.org',
          ];
          
          async function lingvaFetch(path, init) {
            let lastError;
        
            for (const base of LINGVA_BASE_URLS) {
              const url = base.replace(/\/+$/, '') + path;
        
              try {
                console.info('[Lingva] Trying:', url);
                const res = await fetch(url, init);
        
                if (!res.ok) {
                  console.warn(
                    '[Lingva] HTTP error',
                    res.status,
                    res.statusText,
                    'at',
                    base
                  );
                  lastError = new Error(`*️⃣ HTTP ${res.status} from ${base}`);
                  continue;
                }
        
                return res;
              } catch (err) {
                console.warn('*️⃣ [Lingva] Network error at', base, err);
                lastError = err;
              }
            }
        
            throw lastError || new Error('*️⃣ All Lingva endpoints failed');
          }
        
          async function translateBatchLingva(batchDialogs, targetLang) {
            const results = [];
        
            for (const dialog of batchDialogs) {
              const text = dialog.quote || '';
              if (!text.trim()) {
                results.push(text);
                continue;
              }
        
              const langCode = getLingvaLangCode(targetLang);
              
              const path =
                '/api/v1/auto/' +
                encodeURIComponent(langCode) +
                '/' +
                encodeURIComponent(text);
        
              const response = await lingvaFetch(path);
              if (!response.ok) {
                const t = await response.text();
                throw new Error(`*️⃣ Lingva error ${response.status}: ${t}`);
              }
        
              const data = await response.json();
              const translated =
                data.translation ||
                data.translatedText ||
                data.result ||
                '';
        
              if (!translated) {
                throw new Error('*️⃣ Lingva response did not contain a translation string.');
              }
        
              results.push(translated);
        
              await delay(100);
            }
        
            return results;
          }
        
          async function waitWhilePaused() {
            while (state.isPaused && state.isTranslating) {
              await delay(100);
            }
          }
        
          async function runTranslationLoop() {
            const model = el.modelSelect ? el.modelSelect.value : 'deepseek';
            const apiKey = (el.apiKey && el.apiKey.value.trim()) || '';
            const targetLang = el.langTarget ? el.langTarget.value : 'id';
        
            updateControlButtons();
        
            while (
              state.currentBatchIndex < state.batches.length &&
              state.isTranslating
            ) {
              if (state.isPaused) {
                log('⏸ Translation paused.', 'info');
                await waitWhilePaused();
                if (!state.isTranslating) {
                  log('ℹ️ Translation cancelled while paused.', 'warn');
                  return;
                }
                log('▶️ Resuming translation...', 'info');
              }
        
              const batchNum = state.currentBatchIndex + 1;
              const totalBatches = state.batches.length;
              const batchDialogs = state.batches[state.currentBatchIndex];
        
              log(
                `🔄 Translating batch ${batchNum}/${totalBatches} (${batchDialogs.length} lines)...`,
                'info'
              );
        
              let translatedLines;
              try {
                if (model === 'deepseek') {
                  translatedLines = await translateBatchDeepSeek(
                    batchDialogs,
                    targetLang,
                    apiKey
                  );
                } else {
                  translatedLines = await translateBatchLingva(
                    batchDialogs,
                    targetLang
                  );
                }
              } catch (err) {
                log(
                  `*️⃣ Error while translating batch ${batchNum}: ${err.message || err}`,
                  'error'
                );
                throw err;
              }
        
              for (let i = 0; i < batchDialogs.length; i++) {
                const dialog = batchDialogs[i];
                const translated = translatedLines[i];
                const realIndex = dialog.index + 1;
               
                if (translated) {
                  dialog.translated = translated;
        
                  const original = state.dialogs.find(x => x.index === dialog.index);
                  if (original) original.translated = translated;
        
                  log(`✅ [${realIndex}] ${translated}`, "success");
                } else {
                  log(`*️⃣ [${realIndex}] Cannot translate`, "warn");
                }
              }
        
              state.currentBatchIndex++;
              updateProgress();
            }
        
            if (state.currentBatchIndex >= state.batches.length) {
              log('✅ Translation complete. You can now download the result.', 'success');
              if (el.downloadFinal) el.downloadFinal.disabled = false;
              if (el.previewBtn) el.previewBtn.disabled = false;
            }
        
            resetTranslateUIAfterFinish();
          }
        
          async function startTranslation() {
            if (state.isTranslating) {
              log('ℹ️ A translation is already in progress.', 'warn');
              return;
            }
        
            if (!state.fileName || !state.originalLines.length) {
              log('*️⃣ No .rpy file loaded. Please upload a file first.', 'error');
              return;
            }
        
            const model = el.modelSelect ? el.modelSelect.value : 'deepseek';
            const apiKey = (el.apiKey && el.apiKey.value.trim()) || '';
            const targetLang = el.langTarget ? el.langTarget.value : 'id';
        
            if (model === 'deepseek' && !apiKey) {
              log('*️⃣ Please provide your DeepSeek API key.', 'error');
              return;
            }
        
            log(
              `ℹ️ Preparing translation using model "${model}" to ${languageLabel(
                targetLang
              )}...`,
              'info'
            );
        
            state.dialogs = extractDialogsFromLines(state.originalLines);
        
            if (!state.dialogs.length) {
              log('*️⃣ No dialog lines were detected in this .rpy file.', 'error');
              return;
            }
        
            log(
              `ℹ️ Detected ${state.dialogs.length} dialog lines. Creating translation batches...`,
              'info'
            );
        
            state.batches = createBatches(state.dialogs, {
              maxLines: 48,
              maxTokens: 1800,
            });
        
            log(
              `ℹ️ Created ${state.batches.length} batches for translation.`,
              'info'
            );
        
            state.currentBatchIndex = 0;
            state.isTranslating = true;
            state.isPaused = false;
        
            if (el.downloadFinal) el.downloadFinal.disabled = false;
        
            if (el.progressBar) {
              el.progressBar.value = 0;
              el.progressBar.max = state.dialogs.length;
            }
            updateProgress();
        
            setTranslateButtonBusy(true, '🔁 Translating...');
            if (el.controlBtns) el.controlBtns.style.display = 'flex';
            updateControlButtons();
        
            try {
              await runTranslationLoop();
            } catch (err) {
              log('*️⃣ Translation stopped due to an error.', 'error');
              resetTranslateUIAfterFinish();
            }
          }
        
          function buildOutputText() {
            const map = new Map();
            for (const d of state.dialogs) {
              if (d.translated != null) {
                map.set(d.index, d);
              }
            }
        
            const outLines = state.originalLines.map((line, idx) => {
              const dialog = map.get(idx);
              if (!dialog) return line;
              if (dialog.translated == null) return line;
        
              const firstQuote = line.indexOf('"');
              const lastQuote = line.lastIndexOf('"');
              if (firstQuote === -1 || lastQuote <= firstQuote) return line;
        
              return (
                line.slice(0, firstQuote + 1) +
                dialog.translated +
                line.slice(lastQuote)
              );
            });
        
            return outLines.join('\n');
          }
        
          function handleDownloadFinal() {
            const lines = [...state.originalLines];
        
            for (const d of state.dialogs) {
                if (!d.translated) continue;
        
                let line = d.originalLine;
                const idx = d.index;
        
                const first = line.indexOf('"');
                const last = line.lastIndexOf('"');
                if (first === -1 || last <= first) continue;
        
                const newLine =
                    line.slice(0, first + 1) +
                    d.translated +
                    line.slice(last);
        
                lines[idx] = newLine;
            }
        
            const blob = new Blob([lines.join("\n")], {
                type: "text/plain;charset=utf-8"
            });
        
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
        
            const base = (state.fileName || "translated").replace(/\.rpy$/i, "");
            a.download = base + "_translated.rpy";
        
            a.click();
        
            log("⬇️ Downloaded translated file.", "success");
          }
        
          function handleDownloadProgress() {
            const logText = state.logEntries.join('\n');
            const blob = new Blob([logText], { type: 'text/plain;charset=utf-8' });
            const url = URL.createObjectURL(blob);
        
            const a = document.createElement('a');
            a.download = 'translation_log.txt';
            a.href = url;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        
            log('⬇️ Downloaded translation log.', 'success');
          }
        
          function handlePreview() {
            if (!state.originalLines.length || !state.dialogs.length) {
              alert('*️⃣ There is no data to preview yet. Please finish translating (or at least partially translate) first.');
              return;
            }
        
            const originalLines = state.originalLines.slice();
        
            const dialogIndexes = state.dialogs.map(d => {
              const index = d.index;
              const line = originalLines[index] || '';
        
              const indentMatch = line.match(/^\s*/);
              const indent = indentMatch ? indentMatch[0] : '';
              const withoutIndent = line.slice(indent.length);
        
              const m = withoutIndent.match(/(["'])(.*)\1/);
              let pre = '';
              let quoteChar = '"';
              let post = '';
        
              if (m) {
                quoteChar = m[1];
                const before = withoutIndent.slice(0, m.index);
                const after = withoutIndent.slice(m.index + m[0].length);
                pre = before.trim();
                post = after.trim();
              }
        
              return {
                index,
                pre,
                quote: quoteChar,
                post,
              };
            });
        
            const detectedDialogs = state.dialogs.map(d => d.quote || '');
            const translatedDialogs = state.dialogs.map(d => d.translated || '');
        
            try {
              localStorage.setItem('originalLines', JSON.stringify(originalLines));
              localStorage.setItem('dialogIndexes', JSON.stringify(dialogIndexes));
              localStorage.setItem('detectedDialogs', JSON.stringify(detectedDialogs));
              localStorage.setItem('translatedDialogs', JSON.stringify(translatedDialogs));
        
              if (el.apiKey) {
                localStorage.setItem('deepseekApiKey', el.apiKey.value.trim() || '');
              }
              if (el.langTarget) {
                localStorage.setItem('targetLang', el.langTarget.value);
              }
              if (el.modelSelect) {
                localStorage.setItem('translationModel', el.modelSelect.value || 'deepseek');
              }
            } catch (err) {
              console.error('Failed to write preview data to localStorage:', err);
              alert('*️⃣ Unable to save preview data to localStorage (maybe due to quota or incognito mode).');
              return;
            }
        
            window.location.href = 'preview.html';
          }
        
          function handleFileChange(evt) {
            const file = evt.target.files && evt.target.files[0];
            if (!file) return;
        
            if (!file.name.toLowerCase().endsWith('.rpy')) {
              log('*️⃣ Please upload a .rpy file.', 'error');
              evt.target.value = '';
              if (el.translateBtn) el.translateBtn.disabled = true;
              return;
            }
        
            const reader = new FileReader();
            reader.onload = e => {
              state.fileName = file.name;
              state.originalText = e.target.result || '';
              state.originalLines = state.originalText.split(/\r?\n/);
              state.dialogs = [];
              state.batches = [];
              state.isTranslating = false;
              state.isPaused = false;
              state.currentBatchIndex = 0;
              state.logEntries = [];
        
              log(
                `ℹ️ Loaded file "${file.name}" (${state.originalLines.length} lines).`,
                'info'
              );
        
              if (el.translateBtn) el.translateBtn.disabled = false;
              if (el.downloadFinal) el.downloadFinal.disabled = true;
              if (el.previewBtn) el.previewBtn.disabled = true;
        
              if (el.progressBar) {
                el.progressBar.value = 0;
                el.progressBar.max = 1;
              }
              if (el.progressText) {
                el.progressText.textContent = '0 / 0 lines translated';
              }
            };
            reader.onerror = () => {
              log('*️⃣ Failed to read file.', 'error');
            };
            reader.readAsText(file, 'utf-8');
          }
        
          function showLibreModal() {
            if (!el.libreWarningModal) return;
            el.libreWarningModal.style.display = 'flex';
          }
        
          function hideLibreModal() {
            if (!el.libreWarningModal) return;
            el.libreWarningModal.style.display = 'none';
          }
        
          function setupModelSelectBehavior() {
            if (!el.modelSelect) return;
        
            const apply = () => {
              const value = el.modelSelect.value;
              if (value === 'deepseek') {
                if (el.apiKeyContainer) el.apiKeyContainer.style.display = 'block';
              } else {
                if (el.apiKeyContainer) el.apiKeyContainer.style.display = 'none';
                showLibreModal();
              }
            };
        
            el.modelSelect.addEventListener('change', apply);
            apply();
          }
        
          function setupModalBehavior() {
            if (el.libreWarningClose) {
              el.libreWarningClose.addEventListener('click', hideLibreModal);
            }
            if (el.confirmLibre) {
              el.confirmLibre.addEventListener('click', hideLibreModal);
            }
            if (el.libreWarningModal) {
              el.libreWarningModal.addEventListener('click', e => {
                if (e.target === el.libreWarningModal) {
                  hideLibreModal();
                }
              });
            }
          }
        
          function init() {
            if (el.fileInput) {
              el.fileInput.addEventListener('change', handleFileChange);
            }
        
            if (el.translateBtn) {
              el.translateBtn.addEventListener('click', startTranslation);
              el.translateBtn.disabled = true;
            }
        
            if (el.stopBtn) {
              el.stopBtn.addEventListener('click', () => {
                if (!state.isTranslating) return;
                state.isPaused = true;
                updateControlButtons();
              });
            }
        
            if (el.resumeBtn) {
              el.resumeBtn.addEventListener('click', () => {
                if (!state.isTranslating) return;
                state.isPaused = false;
                updateControlButtons();
              });
            }
        
            if (el.downloadFinal) {
              el.downloadFinal.addEventListener('click', handleDownloadFinal);
              el.downloadFinal.disabled = true;
            }
        
            if (el.downloadProgress) {
              el.downloadProgress.addEventListener('click', handleDownloadProgress);
            }
        
            if (el.previewBtn) {
              el.previewBtn.addEventListener('click', handlePreview);
              el.previewBtn.disabled = true;
            }
        
            setupModelSelectBehavior();
            setupModalBehavior();
            updateControlButtons();
            updateProgress();
          }
        
          if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', init);
          } else {
            init();
          }
        })();

        document.addEventListener("contextmenu", e => e.preventDefault());

        document.addEventListener("keydown", e => {
          if (
            e.key === "F12" ||
            (e.ctrlKey && e.shiftKey && ["I", "J", "C"].includes(e.key)) ||
            (e.ctrlKey && e.key === "U")
          ) {
            e.preventDefault();
          }
        });

        console.log('%c░██████╗████████╗░█████╗░██████╗░██╗\n██╔════╝╚══██╔══╝██╔══██╗██╔══██╗██║\n╚█████╗░░░░██║░░░██║░░██║██████╔╝██║\n░╚═══██╗░░░██║░░░██║░░██║██╔═══╝░╚═╝\n██████╔╝░░░██║░░░╚█████╔╝██║░░░░░██╗\n╚═════╝░░░░╚═╝░░░░╚════╝░╚═╝░░░░░╚═╝', 'color: red; font-weight: bold;');