// ===================================
// CONFIG
// ===================================

window.OPEN_FILES = window.OPEN_FILES || {};
window.ACTIVE_FILE_ID = window.ACTIVE_FILE_ID || null;
window.MONACO_EDITOR = window.MONACO_EDITOR || null;
window.MONACO_MODELS = window.MONACO_MODELS || {};
window.MONACO_READY = window.MONACO_READY || false;
window.HIDE_TAGS = window.HIDE_TAGS || {};
window.HIDE_TAG_STATE = window.HIDE_TAG_STATE || {};
window.RPGM_TAG_STATE = window.RPGM_TAG_STATE || {};

// ================================
// TEXT HELPERS
// ================================

function getEditorLinesForFile(id) {
    const model = MONACO_MODELS[id];
    if (!model) return [];
    const raw = model.getValue().replace(/\r/g, "");
    const chunks = raw.split(/---------\d+\s*\n/);
    const lines = []; 
    for (let i = 1; i < chunks.length; i++) { 
        lines.push(chunks[i].replace(/\n/g, ""));
    }
    return lines;
}
function setEditorLinesForFile(id, lines) {
    const txt = lines
        .map((line, i) => `---------${i}\n${line}`)
        .join("\n");
    let model = MONACO_MODELS[id];
    if (model) {
        model.setValue(txt);
    } else {
        model = monaco.editor.createModel(txt, "plaintext");
        MONACO_MODELS[id] = model;
    }
    if (ACTIVE_FILE_ID === id && MONACO_EDITOR) {
        MONACO_EDITOR.setModel(model);
    }
}
function buildEditorTextFromLines(lines) {
    if (!Array.isArray(lines) || lines.length === 0) {
        return "(No dialog extracted)";
    }
    return lines
        .map((line, i) => `---------${i}\n${line}`)
        .join("\n");
}

// ===================================
// DOM READY
// ===================================

document.addEventListener("DOMContentLoaded", function () {
    const fileupload = document.getElementById("fileupload");
    function mapEngineName(type) {
        switch (type) {
            case "kag-ks": return "KIRIKIRI-KAG";
            case "tyrano-ks": return "TYRANOBUILD";
            case "renpy-script": return "RENPY";
            case "rpgmv-json": return "RPGM";
            default: return "UNKNOWN";
        }
    }
    window.MonacoEnvironment = window.MonacoEnvironment || {};
    window.MonacoEnvironment.getWorkerUrl = function (workerId, label) {
      const base = "https://cdn.jsdelivr.net/npm/monaco-editor@0.44.0/min/";
      const js = `
        self.MonacoEnvironment = { baseUrl: "${base}" };
        importScripts("${base}vs/base/worker/workerMain.js");
      `;
      return "data:text/javascript;charset=utf-8," + encodeURIComponent(js);
    };
    require.config({
        paths: {
            "vs": "https://cdn.jsdelivr.net/npm/monaco-editor@0.44.0/min/vs"
        }
    });
    require(["vs/editor/editor.main"], function () {
        const editorContainer = document.getElementById("editorContainer");
        if (editorContainer && editorContainer.offsetHeight < 50) {
          editorContainer.style.height = "60vh";
        }
        MONACO_EDITOR = monaco.editor.create(editorContainer, {
            value: "",
            language: "plaintext",
            theme: "vs-dark",
            automaticLayout: true,
            minimap: { enabled: true },
            fontSize: 14,
            wordWrap: "off",
            unicodeHighlight: {
                ambiguousCharacters: false,
                invisibleCharacters: false,
                nonBasicASCII: false,
            },
            accessibilitySupport: "off"
        });
        MONACO_READY = true;
        MONACO_EDITOR.onDidChangeCursorPosition(updateStatusBar);
        MONACO_EDITOR.onDidChangeModel(updateStatusBar);
        MONACO_EDITOR.onDidChangeModelContent(updateStatusBar);
        updateStatusBar();
        function updateStatusBar() {
            if (!MONACO_EDITOR) return;
            const pos = MONACO_EDITOR.getPosition();
            const model = MONACO_EDITOR.getModel();
            document.getElementById("cursorPos").textContent =
                `Ln ${pos.lineNumber}, Col ${pos.column}`;
            const indent = model.getOptions().indentSize;
            document.getElementById("indentInfo").textContent =
                `Spaces: ${indent}`;
            document.getElementById("encodingInfo").textContent = "UTF-8";
            const eol = model.getEOL() === "\n" ? "LF" : "CRLF";
            document.getElementById("eolInfo").textContent = eol;
            const lang = monaco.languages.getEncodedLanguageId(model.getLanguageId());
            const langName = model.getLanguageId();
            if (ACTIVE_FILE_ID && OPEN_FILES[ACTIVE_FILE_ID]) {
                const rawType = OPEN_FILES[ACTIVE_FILE_ID].type || "unknown";
                const displayType = mapEngineName(rawType);
                document.getElementById("langInfo").textContent = displayType;
            } else {
                document.getElementById("langInfo").textContent = "UNKNOWN";
            }
        }
        if (ACTIVE_FILE_ID && OPEN_FILES[ACTIVE_FILE_ID]) {
            renderEditor(OPEN_FILES[ACTIVE_FILE_ID]);
        }
    });
    function (err) {
      console.error("Monaco load failed:", err);
      MONACO_READY = false;
      MONACO_EDITOR = null;
      enableFallbackEditor(err);
    }
});

// ===================================
// ADD TAB WITH CLOSE + DRAGGABLE
// ===================================

function addTab(fileObj) {
    const tabBar = document.getElementById("tabBar");
    const tab = document.createElement("div");
    tab.className = "tab";
    tab.dataset.id = fileObj.id;
    tab.draggable = true;
    const title = document.createElement("span");
    title.textContent = fileObj.name;
    title.className = "tab-title";
    title.onclick = () => switchTab(fileObj.id);
    const closeBtn = document.createElement("span");
    closeBtn.className = "tab-close";
    closeBtn.textContent = "ｘ";
    closeBtn.title = "Close";
    closeBtn.onclick = (e) => {
        e.stopPropagation();
        closeTab(fileObj.id);
    };
    tab.appendChild(title);
    tab.appendChild(closeBtn);
    tabBar.appendChild(tab);
    enableTabDrag(tab);
}

// ===================================
// CLOSE TAB
// ===================================

function closeTab(id) {
    const tabEl = document.querySelector(`.tab[data-id="${id}"]`);
    if (tabEl) tabEl.remove();
    if (MONACO_MODELS[id]) {
        MONACO_MODELS[id].dispose();
        delete MONACO_MODELS[id];
    }
    delete OPEN_FILES[id];
    if (HIDE_TAG_STATE[id]) {
        delete HIDE_TAG_STATE[id];
    }
    if (ACTIVE_FILE_ID === id) {
        const remaining = document.querySelectorAll(".tab");
        if (remaining.length > 0) {
            switchTab(remaining[0].dataset.id);
        } else {
            ACTIVE_FILE_ID = null;
            if (MONACO_EDITOR) {
                MONACO_EDITOR.setValue("");
            } 
            const bar = document.getElementById("buttonBar");
            if (bar) bar.innerHTML = "";
        }
    }
}

// ===================================
// DRAG-REORDER TABS
// ===================================

function enableTabDrag(tab) {
    tab.addEventListener("dragstart", (e) => {
        e.dataTransfer.setData("text/plain", tab.dataset.id);
        tab.classList.add("dragging");
    });
    tab.addEventListener("dragend", () => {
        tab.classList.remove("dragging");
    });
    tab.addEventListener("dragover", (e) => {
        e.preventDefault();
        const dragging = document.querySelector(".tab.dragging");
        if (!dragging || dragging === tab) return;
        const tabBar = document.getElementById("tabBar");
        const rect = tab.getBoundingClientRect();
        const before = e.clientX < rect.left + rect.width / 2;
        tabBar.insertBefore(dragging, before ? tab : tab.nextSibling);
    });
}

// ===================================
// SWITCH TAB
// ===================================

function switchTab(id) {
    ACTIVE_FILE_ID = id;
    document.querySelectorAll(".tab").forEach(t => {
        t.classList.toggle("active", t.dataset.id === id);
    });
    if (OPEN_FILES[id]) {
        renderEditor(OPEN_FILES[id]);
    }
}

// ===================================
// RENDER EDITOR  
// ===================================

function renderEditor(fileData) {
    if (!MONACO_READY || !MONACO_EDITOR) {
        setTimeout(() => renderEditor(fileData), 50);
        return;
    }
    if (!MONACO_MODELS[fileData.id]) {
        const txt = buildEditorTextFromLines(fileData.lines || []);
        MONACO_MODELS[fileData.id] = monaco.editor.createModel(txt, "plaintext");
    }
    MONACO_EDITOR.setModel(MONACO_MODELS[fileData.id]);
    renderButtons(fileData);
}

// ===================================
// BUTTON BAR
// ===================================

function renderButtons(fileData) {
    const bar = document.getElementById("buttonBar");
    if (!bar) return;
    bar.innerHTML = "";
    const saveBtn = document.createElement("button");
    saveBtn.className = "save-btn";
    saveBtn.textContent = "💾 Save & Download";
    saveBtn.onclick = () => saveTextList(fileData.id);
    bar.appendChild(saveBtn);
    const reloadBtn = document.createElement("button");
    reloadBtn.className = "save-btn";
    reloadBtn.style.marginLeft = "8px";
    reloadBtn.textContent = "🔄";
    reloadBtn.title = "Reload text from server";
    reloadBtn.onclick = () => reloadFile(fileData.id);
    bar.appendChild(reloadBtn);
    const copyBtn = document.createElement("button");
    copyBtn.className = "save-btn";
    copyBtn.style.marginLeft = "8px";
    copyBtn.textContent = "📋";
    copyBtn.title = "Copy all text";
    copyBtn.onclick = () => {
        navigator.clipboard.writeText(MONACO_EDITOR.getValue());
        alert("Copied to clipboard!");
    };
    bar.appendChild(copyBtn);
    const dlBtn = document.createElement("button");
    dlBtn.className = "save-btn";
    dlBtn.style.marginLeft = "8px";
    dlBtn.textContent = "⬇️";
    dlBtn.title = "Download extracted text";
    dlBtn.onclick = () => {
        const blob = new Blob([MONACO_EDITOR.getValue()], { type: "text/plain" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = fileData.name + "_text.txt";
        a.click();
    };
    bar.appendChild(dlBtn);
    const uploadLabel = document.createElement("label");
    uploadLabel.className = "save-btn";
    uploadLabel.style.marginLeft = "8px";
    uploadLabel.style.cursor = "pointer";
    uploadLabel.textContent = "⬆️";
    uploadLabel.title = "Upload text file";
    const uploadInput = document.createElement("input");
    uploadInput.type = "file";
    uploadInput.accept = ".txt";
    uploadInput.style.display = "none";
    uploadInput.onchange = async function () {
        const f = uploadInput.files[0];
        if (!f) return;
        const txt = await f.text();
        const model = MONACO_MODELS[fileData.id];
        if (model) {
            model.setValue(txt);
        } else {
            MONACO_MODELS[fileData.id] = monaco.editor.createModel(txt, "plaintext");
            MONACO_EDITOR.setModel(MONACO_MODELS[fileData.id]);
        }
        alert("Loaded text from file!");
    };
    uploadLabel.appendChild(uploadInput);
    bar.appendChild(uploadLabel);
    const wrapBtn = document.createElement("button");
    wrapBtn.className = "save-btn";
    wrapBtn.style.marginLeft = "8px";
    let wrapState = MONACO_EDITOR.getOption(monaco.editor.EditorOption.wordWrap);
    if (wrapState === "on") {
        wrapBtn.textContent = "🔀 Word Wrap: ON"; 
    } else {
        wrapBtn.textContent = "🔀 Word Wrap: OFF"; 
    }
    wrapBtn.onclick = () => {
        let current = MONACO_EDITOR.getOption(monaco.editor.EditorOption.wordWrap);
        if (current === "off") { 
            MONACO_EDITOR.updateOptions({ wordWrap: "on" });
            wrapBtn.textContent = "🔀 Word Wrap: ON";
        } else { 
            MONACO_EDITOR.updateOptions({ wordWrap: "off" });
            wrapBtn.textContent = "🔀 Word Wrap: OFF";
        }
    };
    bar.appendChild(wrapBtn);
    if (fileData.type === "rpgmv-json") {
        const hideBtn = document.createElement("button");
        hideBtn.className = "save-btn";
        hideBtn.style.marginLeft = "8px";
        const st = RPGM_TAG_STATE[fileData.id];
        const isHidden = st && st.hidden;
        hideBtn.textContent = isHidden ? "🏷️ Hide Tags: ON" : "🏷️ Hide Tags: OFF";
        hideBtn.title = "For machine translation";
        hideBtn.onclick = () => {
            const currentState = RPGM_TAG_STATE[fileData.id] && RPGM_TAG_STATE[fileData.id].hidden;
            if (currentState) {
                disableHideTagsRpgm(fileData.id);
            } else {
                enableHideTagsRpgm(fileData.id);
            } 
            renderButtons(fileData);
        };
        bar.appendChild(hideBtn);
    }
}

// ===================================
// RELOAD TEXT FROM SERVER 
// ===================================

async function reloadFile(id) {
    const file = OPEN_FILES[id];
    if (!file) return;
    delete RPGM_TAG_STATE[id];
    const fileData = OPEN_FILES[id];
    if (!fileData.lines) return;
    let txt = buildEditorTextFromLines(fileData.lines || []);
    if (MONACO_MODELS[id]) {
        MONACO_MODELS[id].setValue(txt);
    } else {
        MONACO_MODELS[id] = monaco.editor.createModel(txt, "plaintext");
    }
    if (ACTIVE_FILE_ID === id) {
        MONACO_EDITOR.setModel(MONACO_MODELS[id]);
    }
}

// ===================================
// PARSE EDITOR TEXT TO LINES
// ===================================

function parseEditorBlocks(raw, expectedCount) {
    const result = new Array(expectedCount).fill("");
    const text = raw.replace(/\r/g, "");
    const lines = text.split("\n");
    let currentIndex = null;
    let buffer = [];
    function flush() {
        if (currentIndex === null) return;
        if (currentIndex >= 0 && currentIndex < expectedCount) {
            result[currentIndex] = buffer.join("\n");
        }
        buffer = [];
    }
    for (const line of lines) {
        const m = line.match(/^---------([0-9]+)/);
        if (m) {
            flush();
            currentIndex = parseInt(m[1], 10);
        } else if (currentIndex !== null) {
            buffer.push(line);
        }
    }
    flush();
    return result;
}

// ===================================
// SAVE & DOWNLOAD
// ===================================

async function saveTextList(id) {
    const file = OPEN_FILES[id];
    if (!file) return;
    const model = MONACO_MODELS[id];
    if (!model) {
        alert("No editor model for this file.");
        return;
    }
    const expectedCount = (file.lines && file.lines.length) || 0;
    const raw = model.getValue();
    const editedLines = expectedCount > 0
        ? parseEditorBlocks(raw, expectedCount)
        : [];
    let linesToSend = editedLines;
    const tagState = RPGM_TAG_STATE[id];
    if (file.type === "rpgmv-json" && tagState) {
        if (tagState.hidden) { 
            linesToSend = editedLines.map((plain, idx) => {
                const info = tagState.lines[idx];
                if (!info) return plain; 
                const full = reapplyTagsToLine(info, plain);
                tagState.lines[idx] = parseRpgmLineForTags(full);
                return full;
            });
        } else { 
            tagState.lines = editedLines.map(parseRpgmLineForTags);
        }
        file.lines = linesToSend.slice();
    } else { 
        file.lines = editedLines.slice();
    }
    PreLoadOn();
    const res = await apiFetch("/Edit/" + id, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lines: linesToSend })
    });
    PreLoadOff();
    if (!res.ok) {
        alert("Save failed: " + res.status);
        return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    a.click();
    URL.revokeObjectURL(url);
}

// ===================================
// RPGM TAG SPLITTER
// ===================================
 
const RPGM_TAG_REGEX = /\\[A-Za-z]+(?:\[[0-9]+\]|<[^>]+>)?|<[^>]+>/g;
function isWordChar(ch) {
    return /[A-Za-z0-9\u00C0-\u1EF9\u3040-\u30FF\u4E00-\u9FFF]/.test(ch);
}
function isBoundary(pos, s) {
    const n = s.length;
    if (pos <= 0 || pos >= n) return true;
    return !(isWordChar(s[pos - 1]) && isWordChar(s[pos]));
}
function adjustPosLeft(pos, s) {
    const n = s.length;
    pos = Math.max(0, Math.min(n, pos));
    if (isBoundary(pos, s)) return pos;
    for (let p = pos - 1; p >= 0; p--) {
        if (isBoundary(p, s)) return p;
    }
    return pos;
}
function adjustPosRight(pos, s) {
    const n = s.length;
    pos = Math.max(0, Math.min(n, pos));
    if (isBoundary(pos, s)) return pos;
    for (let p = pos + 1; p <= n; p++) {
        if (isBoundary(p, s)) return p;
    }
    return pos;
}
function adjustPosAny(pos, s) {
    const n = s.length;
    pos = Math.max(0, Math.min(n, pos));
    if (isBoundary(pos, s)) return pos;
    const MAX_SCAN = 40;
    let best = pos;
    let bestScore = Infinity;
    for (let d = 1; d <= MAX_SCAN; d++) {
        for (const p of [pos - d, pos + d]) {
            if (p < 0 || p > n) continue;
            if (!isBoundary(p, s)) continue;
            const before = p > 0 ? s[p - 1] : "";
            const after = p < n ? s[p] : "";
            let score = d;
            if (/\s/.test(before) || /\s/.test(after)) {
                score -= 0.5;
            } else if (!before || !after || /[.,!?;:]/.test(before) || /[.,!?;:]/.test(after)) {
                score -= 0.2;
            }
            if (score < bestScore) {
                bestScore = score;
                best = p;
            }
        }
        if (bestScore < Infinity) break;
    }
    return best;
}
function mapOffset(oldPos, oldLen, newPlain, mode = "any") {
    const newLen = newPlain.length;
    if (oldLen <= 0) return 0;
    const raw = Math.round(newLen * (oldPos / oldLen));
    if (mode === "left") return adjustPosLeft(raw, newPlain);
    if (mode === "right") return adjustPosRight(raw, newPlain);
    return adjustPosAny(raw, newPlain);
}
function parseRpgmLineForTags(line) {
    const tags = [];
    const colorRegions = [];
    const colorStack = [];
    let plainIndex = 0;
    let lastIndex = 0;
    RPGM_TAG_REGEX.lastIndex = 0;
    let m;
    while ((m = RPGM_TAG_REGEX.exec(line)) !== null) {
        const tag = m[0];
        const before = line.slice(lastIndex, m.index);
        if (before) plainIndex += before.length;
        const entry = {
            tag,
            oldOffset: plainIndex, 
            role: "single",
            regionIndex: null
        };
        const colorMatch = tag.match(/^\\c\[(\d+)]$/);
        if (colorMatch) {
            const num = parseInt(colorMatch[1], 10);
            if (num === 0) { 
                if (colorStack.length > 0) {
                    const open = colorStack.pop();
                    const regionIndex = colorRegions.length;
                    colorRegions.push({
                        start: open.oldOffset,
                        end: plainIndex,
                        openTagIndex: open.tagIndex,
                        closeTagIndex: tags.length
                    });
                    tags[open.tagIndex].role = "colorOpen";
                    tags[open.tagIndex].regionIndex = regionIndex;
                    entry.role = "colorClose";
                    entry.regionIndex = regionIndex;
                } else {
                    entry.role = "colorResetOrphan";
                }
            } else { 
                const tagIndex = tags.length;
                colorStack.push({
                    color: num,
                    oldOffset: plainIndex,
                    tagIndex
                });
                entry.role = "colorOpenPending";
            }
        }
        tags.push(entry);
        lastIndex = m.index + tag.length;
    }
    const tail = line.slice(lastIndex);
    if (tail) plainIndex += tail.length;
    const plain = line.replace(RPGM_TAG_REGEX, "");
    return {
        original: line,
        plain,
        tags,
        colorRegions,
        oldLen: plainIndex
    };
}
function reapplyTagsToLine(info, newPlain) {
    const oldPlain = info.plain;
    if (newPlain === oldPlain) {
        return info.original;
    }
    const oldLen = info.oldLen;
    const tags = info.tags;
    const colorRegions = info.colorRegions;
    const placements = [];
    const usedTagIdx = new Set();
    colorRegions.forEach((reg) => {
        let startPos = mapOffset(reg.start, oldLen, newPlain, "left");
        let endPos = mapOffset(reg.end, oldLen, newPlain, "right");
        if (endPos < startPos) endPos = startPos;
        placements.push({
            tag: tags[reg.openTagIndex].tag,
            pos: startPos,
            order: reg.openTagIndex
        });
        placements.push({
            tag: tags[reg.closeTagIndex].tag,
            pos: endPos,
            order: reg.closeTagIndex
        });
        usedTagIdx.add(reg.openTagIndex);
        usedTagIdx.add(reg.closeTagIndex);
    });
    tags.forEach((tag, i) => {
        if (usedTagIdx.has(i)) return;
        const pos = mapOffset(tag.oldOffset, oldLen, newPlain, "any");
        placements.push({
            tag: tag.tag,
            pos,
            order: i
        });
    });
    placements.sort((a, b) => {
        if (a.pos !== b.pos) return a.pos - b.pos;
        return a.order - b.order;
    });
    let out = "";
    let last = 0;
    for (const pl of placements) {
        if (pl.pos > last) {
            out += newPlain.slice(last, pl.pos);
            last = pl.pos;
        }
        out += pl.tag;
    }
    out += newPlain.slice(last);
    return out;
}

// ===================================
// HIDE TAGS (RPGM only)
// ===================================

function enableHideTagsRpgm(fileId) {
    const state = RPGM_TAG_STATE[fileId] || { hidden: false, lines: {} };
    const linesNow = getEditorLinesForFile(fileId);
    const newLines = [];
    const lineState = {};
    linesNow.forEach((line, idx) => {
        const info = parseRpgmLineForTags(line);
        lineState[idx] = info;
        newLines.push(info.plain);
    });
    state.hidden = true;
    state.lines = lineState;
    RPGM_TAG_STATE[fileId] = state;
    setEditorLinesForFile(fileId, newLines);
    if (OPEN_FILES[fileId]) {
        OPEN_FILES[fileId].lines = newLines;
    }
}
function disableHideTagsRpgm(fileId) {
    const state = RPGM_TAG_STATE[fileId];
    if (!state || !state.hidden) return;
    const plainLinesNow = getEditorLinesForFile(fileId);
    const restored = [];
    plainLinesNow.forEach((plain, idx) => {
        const info = state.lines[idx];
        if (!info) {
            restored.push(plain);
            return;
        }
        const newFull = reapplyTagsToLine(info, plain);
        restored.push(newFull);
        state.lines[idx] = parseRpgmLineForTags(newFull);
    });
    state.hidden = false;
    RPGM_TAG_STATE[fileId] = state;
    setEditorLinesForFile(fileId, restored);
    if (OPEN_FILES[fileId]) {
        OPEN_FILES[fileId].lines = restored;
    }
}