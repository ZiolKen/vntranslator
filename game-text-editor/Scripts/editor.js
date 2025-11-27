// ===================================
// GLOBAL STORAGE
// ===================================

const OPEN_FILES = {};   
let ACTIVE_FILE_ID = null;  

// Monaco system
let MONACO_EDITOR = null;  
const MONACO_MODELS = {};  
let MONACO_READY = false; 

const HIDE_TAGS = {};

// ================================
// TEXT HELPERS
// ================================

function stripSpeakerPrefix(text) {
    if (typeof text !== "string") return text; 
    return text.replace(/^\s*(?:[A-Za-z]{2,8}|NPC|Npc|npc)\.\s*/, "");
}
 
function stripTagsForMachineTranslation(text) {
    if (typeof text !== "string") return text;

    let s = text;
 
    s = stripSpeakerPrefix(s);
 
    s = s.replace(/\\n/g, " ");
 
    s = s.replace(/\\fn<[^>]*>/gi, "");
    s = s.replace(/\\[Cc]\[\d+]/g, "");     
    s = s.replace(/\\[a-zA-Z]+\[[^\]]*]/g, "");   
 
    s = s.replace(/\\[a-zA-Z]+/g, "");
 
    s = s.replace(/<[^>]+>/g, "");
 
    s = s.replace(/\[[^\]]+]/g, "");
 
    s = s.replace(/\s+/g, " ").trim();

    return s;
}

function parseEditorLines(raw) {
    if (!raw) return [];
    const parts = raw.split(/---------\d+\s*\n/);
    return parts
        .map(v => v.trim())
        .filter(v => v.length > 0);
}

function buildEditorTextFromLines(lines) {
    if (!Array.isArray(lines) || lines.length === 0) {
        return "(No dialog extracted)";
    }
    return lines
        .map((line, i) => `---------${i}\n${line}`)
        .join("\n");
}

function isHideTagsOn(fileId) {
    return !!(HIDE_TAGS[fileId] && HIDE_TAGS[fileId].on);
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

    // ================================
    // INIT MONACO 
    // ================================
    require.config({
        paths: {
            "vs": "https://cdn.jsdelivr.net/npm/monaco-editor@0.44.0/min/vs"
        }
    });

    require(["vs/editor/editor.main"], function () {
        const editorContainer = document.getElementById("editorContainer");

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

    // SAVE
    const saveBtn = document.createElement("button");
    saveBtn.className = "save-btn";
    saveBtn.textContent = "💾 Save & Download";
    saveBtn.onclick = () => saveTextList(fileData.id);
    bar.appendChild(saveBtn);

    // RELOAD
    const reloadBtn = document.createElement("button");
    reloadBtn.className = "save-btn";
    reloadBtn.style.marginLeft = "8px";
    reloadBtn.textContent = "🔄";
    reloadBtn.title = "Reload text from server";
    reloadBtn.onclick = () => reloadFile(fileData.id);
    bar.appendChild(reloadBtn);

    // COPY
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

    // DOWNLOAD TXT
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

    // UPLOAD TXT
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

        let txt = await f.text();
        txt = txt
            .replace(/\r/g, "")
            .trim()
            .split("\n")
            .map(t => t.trim())
            .map((t, i) => `---------${i}\n${t}`)
            .join("\n");

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

    // WORD WRAP TOGGLE
    const wrapBtn = document.createElement("button");
    wrapBtn.className = "save-btn";
    wrapBtn.style.marginLeft = "8px";
    
    let wrapState = MONACO_EDITOR.getOption(monaco.editor.EditorOption.wordWrap);

    if (wrapState === "on") {
        wrapBtn.textContent = "🔀 Word Wrap: ON";
        wrapBtn.style.background = "#2a7a2a"; 
    } else {
        wrapBtn.textContent = "🔀 Word Wrap: OFF";
        wrapBtn.style.background = "#181818"; 
    }

    wrapBtn.onclick = () => {

        let current = MONACO_EDITOR.getOption(monaco.editor.EditorOption.wordWrap);

        if (current === "off") { 
            MONACO_EDITOR.updateOptions({ wordWrap: "on" });
            wrapBtn.textContent = "🔀 Word Wrap: ON";
            wrapBtn.style.background = "#2a7a2a";
        } else { 
            MONACO_EDITOR.updateOptions({ wordWrap: "off" });
            wrapBtn.textContent = "🔀 Word Wrap: OFF";
            wrapBtn.style.background = "#181818";
        }
    };

    bar.appendChild(wrapBtn);

    // HIDE TAGS (for machine translation) - RPGM ONLY
    if (fileData.type === "rpgmv-json") {
        const hideBtn = document.createElement("button");
        hideBtn.className = "save-btn";
        hideBtn.style.marginLeft = "8px";
        hideBtn.title = "Hide tags, keep only dialog text for machine translation";

        updateHideTagButtonLabel(hideBtn, fileData.id);

        hideBtn.onclick = () => {
            toggleHideTags(fileData.id, hideBtn);
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
 
    const fileData = OPEN_FILES[id];
    if (!fileData.lines) return;

    let txt = buildEditorTextFromLines(fileData.lines || []);

    if (MONACO_MODELS[id]) {
        MONACO_MODELS[id].setValue(txt);
    } else {
        MONACO_MODELS[id] = monaco.editor.createModel(txt, "plaintext");
    }

    HIDE_TAGS[id] = { on: false, originalRaw: "" };

    if (ACTIVE_FILE_ID === id) {
        MONACO_EDITOR.setModel(MONACO_MODELS[id]);
    }
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

    let raw = model.getValue();

    let parts = raw.split(/---------\d+\s*\n/);
    let lines = parts.map(v => v.trim()).filter(v => v.length > 0);

    PreLoadOn();
    const res = await apiFetch("/Edit/" + id, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lines })
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

function updateHideTagButtonLabel(btn, fileId) {
    if (isHideTagsOn(fileId)) {
        btn.textContent = "🏷️ Hide Tags: ON";
        btn.style.background = "#2a7a2a";
    } else {
        btn.textContent = "🏷️ Hide Tags: OFF";
        btn.style.background = "#181818";
    }
}

function toggleHideTags(fileId, btn) {
    const model = MONACO_MODELS[fileId];
    if (!model) return;

    const current = HIDE_TAGS[fileId] || { on: false, originalRaw: "" };

    if (!current.on) { 
        const raw = model.getValue();
        current.originalRaw = raw;

        const lines = parseEditorLines(raw);
        const cleaned = lines.map(stripTagsForMachineTranslation);
        const newRaw = buildEditorTextFromLines(cleaned);

        model.setValue(newRaw);

        current.on = true;
        HIDE_TAGS[fileId] = current;
    } else { 
        if (current.originalRaw) {
            model.setValue(current.originalRaw);
        }
        current.on = false;
        HIDE_TAGS[fileId] = current;
    }

    if (btn) updateHideTagButtonLabel(btn, fileId);
}

