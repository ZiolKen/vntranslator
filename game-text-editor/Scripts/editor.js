document.addEventListener("DOMContentLoaded", function () {
    
// ===================================
// GLOBAL STORAGE (frontend)
// ===================================
    
const OPEN_FILES = {};  
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
	const res = await apiFetch("/Upload", {
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

    document.querySelectorAll(".tab").forEach(t => {
        t.classList.toggle("active", t.dataset.id === id);
    });

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
	saveBtn.textContent = "💾 Save & Download";
	saveBtn.onclick = () => saveTextList(fileData.id);
	container.appendChild(saveBtn);
	 
	const reloadBtn = document.createElement("button");
	reloadBtn.className = "save-btn";
	reloadBtn.style.marginLeft = "8px";
	reloadBtn.textContent = "🔄";
	reloadBtn.title = "Reload text from server";
	reloadBtn.onclick = () => switchTab(fileData.id);
	container.appendChild(reloadBtn);
	 
	const copyBtn = document.createElement("button");
	copyBtn.className = "save-btn";
	copyBtn.style.marginLeft = "8px";
	copyBtn.textContent = "📋";
	copyBtn.title = "Copy all text";
	copyBtn.onclick = () => {
	    navigator.clipboard.writeText(ta.value);
	    alert("Copied to clipboard!");
	};
	container.appendChild(copyBtn);
	 
	const dlBtn = document.createElement("button");
	dlBtn.className = "save-btn";
	dlBtn.style.marginLeft = "8px";
	dlBtn.textContent = "⬇️";
	dlBtn.title = "Download extracted text";
	dlBtn.onclick = () => {
	    const blob = new Blob([ta.value], { type: "text/plain" });
	    const a = document.createElement("a");
	    a.href = URL.createObjectURL(blob);
	    a.download = fileData.name + "_text.txt";
	    a.click();
	};
	container.appendChild(dlBtn);
	 
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
	
	uploadTxt.onchange = async function () {
	    const f = uploadTxt.files[0];
	    if (!f) return;
	
	    let txt = await f.text();
	 
	    txt = txt
	        .replace(/\r/g, "")
	        .trim()
	        .split("\n")
	        .map(t => t.trim())
	        .filter(t => t.length >= 0)
	        .map((t, i) => `---------${i}\n${t}`)
	        .join("\n");
	
	    document.getElementById("editorArea").value = txt;
	
	    alert("Loaded text from file!");
	};
	
	uploadLabel.appendChild(uploadInput);
	container.appendChild(uploadLabel);

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

});


