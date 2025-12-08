        // --- CONFIG ---
        const SEPARATOR_RE = /^---------\d+\s*\([^)]*\)\s*$/;
        const RPGM_NAME_TAG_RE = /^(\\n<.*?>)/;
        const RPGM_CODE_RE = /(\\[a-zA-Z]+\[?[^\]]*\]?|\\n|\\\.|\\\||\\\!|\\\^|\\\$)/g;
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
 
        let state = {
            blocks: [],
            total: 0,
            processed: 0,
            isRunning: false,
            abortCtrl: null
        };
 
        function addLog(type, line, extra = "") {
            const div = document.createElement('div');
            div.className = 'log-item';
            let badge = `<span class="tag tag-skip">LOG</span>`;
 
            if (type === 'ok') badge = `<span class="tag tag-ok">OK</span>`;
            else if (type === 'bridge') badge = `<span class="tag tag-ja">JA>EN>VI</span>`;
            else if (type === 'skip') badge = `<span class="tag tag-skip">SKIP</span>`;
            else if (type === 'exist') badge = `<span class="tag tag-exist">EXIST</span>`;
            else if (type.startsWith('tag-')) badge = `<span class="tag ${type}">${type.replace('tag-','').toUpperCase()}</span>`;
 
            const shortLine = line.length > 40 ? line.substring(0, 40) + "..." : line;
            const shortExtra = extra.length > 40 ? extra.substring(0, 40) + "..." : extra;
            div.innerHTML = `${badge} <span style="color:#aaa">${shortLine}</span> <span style="margin:0 5px; color:#555">➔</span> <span style="color:#fff">${shortExtra}</span>`;
            els.log.prepend(div);
            if (els.log.children.length > 100) els.log.lastChild.remove();
        }
 
        els.input.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            els.out.value = "Analyzing...";
            const text = await file.text();
            const lines = text.split(/\r?\n/);
            state.blocks = [];
            let currentBlock = null;
 
            for (let line of lines) {
                if (SEPARATOR_RE.test(line)) {
                    if (currentBlock) state.blocks.push(currentBlock);
                    currentBlock = {
                        header: line.trim(),
                        lines: [],
                        translated: []
                    };
                } else {
                    if (!currentBlock) currentBlock = {
                        header: '',
                        lines: [],
                        translated: []
                    };
                    currentBlock.lines.push(line);
                }
            }
            if (currentBlock) state.blocks.push(currentBlock);
            state.total = state.blocks.length;
            els.pt.textContent = `0%`;
            els.log.innerHTML = "";
            addLog('skip', `File: ${file.name}`, `Total ${state.total} blocks`);
            els.start.disabled = false;
            els.out.value = "";
        });
 
        els.start.addEventListener('click', async () => {
            state.isRunning = true;
            state.abortCtrl = new AbortController();
            state.processed = 0;
            els.start.disabled = true;
            els.stop.disabled = false;
            const batchSize = parseInt(els.batch.value) || 20;
            const mode = els.mode.value;
 
            for (let i = 0; i < state.blocks.length; i += batchSize) {
                if (!state.isRunning) break;
                const chunk = state.blocks.slice(i, i + batchSize);
                await Promise.all(chunk.map(b => translateBlock(b, mode, state.abortCtrl.signal)));
                state.processed += chunk.length;
                updateUI();
                if (state.processed % 50 === 0) els.out.value = buildResultText();
            }
            finish();
        });
 
        async function translateBlock(block, mode, signal) {
            const resLines = [];
            const isSkipVi = els.skipVi.checked;
 
            for (let line of block.lines) {
                let trimLine = line.trim();
                if (!trimLine) {
                    resLines.push(line);
                    continue;
                }
 
                let nameTag = "";
                let content = line;
                const nameMatch = line.match(RPGM_NAME_TAG_RE);
                if (nameMatch) {
                    nameTag = nameMatch[1];
                    content = line.substring(nameTag.length);
                }
 
                if (!content.trim()) {
                    resLines.push(line);
                    continue;
                }
 
                if (isSkipVi) {
                    if (VIETNAMESE_REGEX.test(content)) {
                        resLines.push(line);
                        addLog('exist', content, 'Keep unchanged');
                        continue;
                    }
                }
 
                const phMap = new Map();
                let pid = 0;
                const protectedContent = content.replace(RPGM_CODE_RE, (m) => {
                    const key = `__PH${pid++}__`;
                    phMap.set(key, m);
                    return key;
                });
 
                try {
                    let trans = "";
 
                    if (mode === 'ja_en_vi') {
                        const enText = await googleTranslate(protectedContent, 'ja', 'en', signal);
                        trans = await googleTranslate(enText, 'en', 'vi', signal);
                        addLog('bridge', content, trans);
                    } else {
                        let sourceLang = 'auto';
                        let logTag = 'tag-auto';
 
                        if (mode === 'en_vi') {
                            sourceLang = 'en';
                            logTag = 'tag-en';
                        } else if (mode === 'ja_vi') {
                            sourceLang = 'ja';
                            logTag = 'tag-ja';
                        } else if (mode === 'zh_vi') {
                            sourceLang = 'zh-CN';
                            logTag = 'tag-zh';
                        } else if (mode === 'ko_vi') {
                            sourceLang = 'ko';
                            logTag = 'tag-ko';
                        } else if (mode === 'auto_vi') {
                            sourceLang = 'auto';
                            logTag = 'tag-auto';
                        }
 
                        trans = await googleTranslate(protectedContent, sourceLang, 'vi', signal);
                        addLog(logTag, content, trans);
                    }
 
                    let final = trans;
                    phMap.forEach((v, k) => final = final.replace(k, v));
                    if (nameTag) final = nameTag + (content.startsWith(' ') ? ' ' : '') + final.trim();
                    resLines.push(final);
                } catch (e) {
                    resLines.push(line);
                }
            }
            block.translated = resLines;
        }
 
        async function googleTranslate(text, sl, tl, signal) {
            if (!text.trim()) return text;
            const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sl}&tl=${tl}&dt=t&q=${encodeURIComponent(text)}`;
            const res = await fetch(url, {
                signal
            });
            const data = await res.json();
            return data[0].map(x => x[0]).join('');
        }
 
        function buildResultText() {
            return state.blocks.map(b => {
                const h = b.header ? b.header + '\n' : '';
                const c = (b.translated.length ? b.translated : b.lines).join('\n');
                return h + c;
            }).join('\n');
        }
 
        function updateUI() {
            const pct = Math.round((state.processed / state.total) * 100);
            els.bar.style.width = pct + '%';
            els.pt.textContent = `${pct}%`;
        }
 
        function finish() {
            state.isRunning = false;
            els.out.value = buildResultText();
            els.start.disabled = false;
            els.stop.disabled = true;
            els.copy.disabled = false;
            els.dl.disabled = false;
            addLog('ok', 'DONE', 'All files processed.');
        }
        els.stop.addEventListener('click', () => {
            if (state.abortCtrl) state.abortCtrl.abort();
            finish();
        });
        els.copy.addEventListener('click', () => {
            els.out.select();
            navigator.clipboard.writeText(els.out.value);
            alert("Copied!");
        });
        els.dl.addEventListener('click', () => {
            const blob = new Blob([els.out.value], {
                type: "text/plain;charset=utf-8"
            });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = els.input.files[0] ? els.input.files[0].name.replace('.txt', '_vi.txt') : 'translated.txt';
            a.click();
        });