document.addEventListener("DOMContentLoaded", function () {
// ===================================
// GLOBAL STORAGE (frontend)
// ===================================
const OPEN_FILES = {};   // id -> {id, name, type, lines}
let ACTIVE_FILE_ID = null;

// ===================================
// HANDLE MULTI FILE UPLOAD
// ===================================
fileInput.addEventListener("change", async function(e) {

    const fd = new FormData();
    for (const f of fileInput.files) {
        fd.append("files", f);
    }

    PreLoadOn();
    const res = await fetch(API_BASE + "/Upload", {
        method: "POST",
        body: fd
    });
    const json = await res.json();
    PreLoadOff();

    json.files.forEach(f => {
        if (!f.id || f.error) return;
        OPEN_FILES[f.id] = f;
        addTab(f);
    });

    if (json.files.length > 0) {
        const first = json.files.find(x => x.id);
        if (first) switchTab(first.id);
    }
});

// ===================================
// ADD TAB TO TAB BAR
// ===================================
function addTab(fileObj) {
    const tabBar = document.getElementById("tabBar");

    const tab = document.createElement("div");
    tab.className = "tab";
    tab.dataset.id = fileObj.id;
    tab.textContent = fileObj.name;

    tab.onclick = () => switchTab(fileObj.id);

    tabBar.appendChild(tab);
}

// ===================================
// SWITCH TAB
// ===================================
function switchTab(id) {
    ACTIVE_FILE_ID = id;

    // highlight tab
    document.querySelectorAll(".tab").forEach(t => {
        t.classList.toggle("active", t.dataset.id === id);
    });

    // render editor
    renderEditor(OPEN_FILES[id]);
}

// ===================================
// RENDER EDITOR FOR CURRENT TAB
// ===================================
function renderEditor(fileData) {
    const container = document.getElementById("editorContainer");
    if (!container) {
        console.warn("editorContainer missing, retrying...");
        setTimeout(() => renderEditor(fileData), 30);
        return;
    }

    container.innerHTML = "";

    const title = document.createElement("h3");
    title.textContent = "Editing: " + fileData.name;
    container.appendChild(title);

    const ta = document.createElement("textarea");
    ta.id = "editorArea";
    ta.style.width = "100%";
    ta.style.height = "600px";
    ta.style.fontFamily = "monospace";

    if (!fileData.lines || fileData.lines.length === 0) {
        ta.value = "(No dialog extracted from this file)";
    } else {
        let txt = "";
        fileData.lines.forEach((line, i) => {
            txt += "---------" + i + "\n" + line + "\n";
        });
        ta.value = txt;
    }

    container.appendChild(ta);

    const saveBtn = document.createElement("button");
    saveBtn.className = "save-btn";
    saveBtn.textContent = "Save & Download";
    saveBtn.onclick = () => saveTextList(fileData.id);

    container.appendChild(saveBtn);
}

// ===================================
// SAVE & DOWNLOAD
// ===================================
async function saveTextList(id) {
    const file = OPEN_FILES[id];
    if (!file) return;

    let raw = document.getElementById("editorArea").value;

    let parts = raw.split(/---------\d+\s*\n/);
    let lines = parts.map(v => v.trim()).filter(v => v.length > 0);

    PreLoadOn();
    const res = await fetch(API_BASE + "/Edit/" + id, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
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
});