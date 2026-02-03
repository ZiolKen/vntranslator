(() => {
"use strict";

window.addEventListener("DOMContentLoaded", initStep1);

const isMobile = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
const particleCount = isMobile ? 60 : 111;

particlesJS("particles-js", {
  "particles": {
    "number": { "value": particleCount, "density": { "enable": true, "value_area": 950 } },
    "color": { "value": "#a855f7" },
    "shape": { "type": "circle", "stroke": { "width": 0, "color": "#000" } },
    "opacity": { "value": 0.40, "random": true, "anim": { "enable": false } },
    "size": { "value": 2.2, "random": true, "anim": { "enable": false } },
    "line_linked": { "enable": true, "distance": 160, "color": "#a855f7", "opacity": 0.16, "width": 1 },
    "move": { "enable": true, "speed": 0.75, "direction": "none", "random": false, "straight": false, "out_mode": "out", "bounce": false }
  },
  "interactivity": {
    "detect_on": "canvas",
    "events": { "onhover": { "enable": true, "mode": "repulse" }, "onclick": { "enable": false }, "resize": true },
    "modes": { "repulse": { "distance": 90, "duration": 0.35 } }
  },
  "retina_detect": true
});

function initStep1() {
  const byId = (id) => document.getElementById(id);

  const ui = {
    card: byId("step1Card") || document.querySelector("#step1-root .card") || document.body,

    jsonUpload:
      byId("json-upload") ||
      document.querySelector('#step1Card input[type="file"][accept*=".json"]') ||
      document.querySelector('input[type="file"][accept*=".json"]'),

    txtUpload:
      byId("txt-upload") ||
      document.querySelector('#step1Card input[type="file"][accept*=".txt"]') ||
      document.querySelector('input[type="file"][accept*=".txt"]'),

    editor:
      byId("editorArea") ||
      document.querySelector("#step1Card textarea") ||
      document.querySelector("textarea"),

    exportBtn: byId("exportTxtBtn") || document.querySelector("#step1Card #exportTxtBtn") || byId("exportTxtBtn"),
    importBtn: byId("importTxtBtn") || document.querySelector("#step1Card #importTxtBtn") || byId("importTxtBtn"),

    saveBtn: byId("saveBtn") || document.querySelector("#step1Card #saveBtn") || byId("saveBtn"),
    saveBtnText: byId("saveBtnText") || document.querySelector("#saveBtnText"),

    status:
      byId("step1Status") ||
      (byId("step1Card") ? byId("step1Card").querySelector(".log-container") : null) ||
      document.querySelector("#step1-root .log-container"),

    fileTabs: byId("fileTabs") || document.querySelector("#step1Card #fileTabs"),
    fileCountLabel:
      byId("fileCountLabel") ||
      (byId("step1Card") ? byId("step1Card").querySelector(".label") : null),

    wordWrapToggle: byId("wordWrapToggle") || document.querySelector("#step1Card #wordWrapToggle"),
  };

  if (!ui.jsonUpload || !ui.editor || !ui.status || !ui.fileCountLabel || !ui.saveBtn) {
    console.error("[Step 1] Missing elements:", ui);
    if (ui.status) {
      ui.status.textContent =
        "❌ Init failed: missing elements.";
    }
    return;
  }

  ui.status.textContent = "✅ READY - Awaiting file(s)…";
  console.log("[RPGMU]: Loaded");

  const state = {
    filesData: [],
    textEntries: [],
    textGroups: new Map(),
  };

  ui.jsonUpload.addEventListener("change", (e) => onJsonPicked(e).catch(err => hardError(err)));
  if (ui.exportBtn) ui.exportBtn.addEventListener("click", onExportTxt);
  if (ui.importBtn && ui.txtUpload) ui.importBtn.addEventListener("click", () => ui.txtUpload.click());
  if (ui.txtUpload) ui.txtUpload.addEventListener("change", onTxtPicked);
  ui.saveBtn.addEventListener("click", () => onSave().catch(err => hardError(err)));

  if (ui.wordWrapToggle) {
    ui.wordWrapToggle.addEventListener("change", () => {
      const on = ui.wordWrapToggle.checked;
      ui.editor.classList.toggle("wrap-on", on);
      ui.editor.classList.toggle("wrap-off", !on);
    });
  }

  setSaveEnabled(false, false);

  function setStatus(msg) {
    ui.status.textContent = msg;
  }

  function setSaveEnabled(enabled, multi) {
    ui.saveBtn.disabled = !enabled;
    if (ui.saveBtnText) ui.saveBtnText.textContent = multi ? " SAVE ZIP (DONE)" : " SAVE JSON (DONE)";

    ui.saveBtn.className = enabled
      ? "font-bold py-2 px-6 rounded shadow flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white"
      : "font-bold py-2 px-6 rounded shadow flex items-center gap-2 bg-gray-300 text-gray-500 cursor-not-allowed";
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function renderTabs(files) {
    if (!ui.fileTabs) return;
  
    if (!files || !files.length) {
      ui.fileTabs.style.display = "none";
      ui.fileTabs.replaceChildren();
      return;
    }
  
    ui.fileTabs.style.display = "block";
    ui.fileTabs.replaceChildren();
  
    const frag = document.createDocumentFragment();
    for (const f of files) {
      const tab = document.createElement("span");
      tab.className = "tab";
      tab.textContent = String(f?.name || "");
      frag.appendChild(tab);
    }
    ui.fileTabs.appendChild(frag);
  }

  function downloadFile(filename, content, type) {
    const a = document.createElement("a");
    const blob = new Blob([content], { type: type || "application/octet-stream" });
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  function hardError(err) {
    console.error(err);
    setStatus("❌ Error: " + (err?.message || String(err)));
  }

  const CODES = {
    SHOW_TEXT_LINE: 401,
    SCROLL_TEXT_LINE: 405,
    SHOW_CHOICES: 102,
    WHEN_CHOICE: 402,
    NAME_CHANGE: 320,
    NICKNAME_CHANGE: 324,
    PROFILE_CHANGE: 325,
    PLUGIN_CMD_MZ: 357,
  };

  const SPECIAL_DB_FILES = new Set([
    "Actors.json", "Armors.json", "Classes.json", "Enemies.json",
    "Items.json", "Skills.json", "States.json", "Weapons.json",
    "System.json", "Tilesets.json", "MapInfos.json", "Troops.json"
  ]);

  function looksLikeNonText(s) {
    const t = String(s);
    if (!t.trim()) return true;
    if (t.length <= 1) return true;
    if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(t)) return true;
    if (/\.(png|jpg|jpeg|webp|ogg|m4a|mp3|wav|json)$/i.test(t)) return true;
    return false;
  }

  function unwrapMaybeArray(data) {
    if (Array.isArray(data)) return data;
    if (data && typeof data === "object") {
      if (Array.isArray(data.data)) return data.data;
      if (Array.isArray(data.contents)) return data.contents;
    }
    return data;
  }

  function extractEventCommandList(list, pushEntry) {
    if (!Array.isArray(list)) return;

    for (const cmd of list) {
      if (!cmd || typeof cmd !== "object") continue;
      const code = cmd.code;
      const p = Array.isArray(cmd.parameters) ? cmd.parameters : [];

      if (code === CODES.SHOW_TEXT_LINE || code === CODES.SCROLL_TEXT_LINE) {
        const line = p[0];
        if (typeof line === "string" && line.trim() && !looksLikeNonText(line)) {
          pushEntry(line, cmd.parameters, 0, { type: "eventText", code });
        }
        continue;
      }

      if (code === CODES.SHOW_CHOICES && Array.isArray(p[0])) {
        p[0].forEach((choice, idx) => {
          if (typeof choice === "string" && choice.trim() && !looksLikeNonText(choice)) {
            pushEntry(choice, p[0], idx, { type: "choice", code });
          }
        });
        continue;
      }

      if (code === CODES.WHEN_CHOICE && typeof p[1] === "string") {
        if (p[1].trim() && !looksLikeNonText(p[1])) {
          pushEntry(p[1], cmd.parameters, 1, { type: "whenChoice", code });
        }
        continue;
      }

      if (
        (code === CODES.NAME_CHANGE || code === CODES.NICKNAME_CHANGE || code === CODES.PROFILE_CHANGE) &&
        typeof p[1] === "string" && p[1].trim() && !looksLikeNonText(p[1])
      ) {
        pushEntry(p[1], cmd.parameters, 1, { type: "actorText", code });
        continue;
      }

      if (code === CODES.PLUGIN_CMD_MZ) {
        const args = p.find(v => v && typeof v === "object" && !Array.isArray(v));
        if (args && typeof args === "object") {
          Object.keys(args).forEach((k) => {
            const v = args[k];
            if (typeof v === "string" && v.trim() && !looksLikeNonText(v)) {
              pushEntry(v, args, k, { type: "pluginArg", code, key: k });
            }
          });
        }
        continue;
      }
    }
  }

  function extractFromDatabaseFile(fileName, json, pushEntry) {
    const data = unwrapMaybeArray(json);

    const extractFieldsFromArray = (arr, fields) => {
      if (!Array.isArray(arr)) return;
      arr.forEach(obj => {
        if (!obj || typeof obj !== "object") return;
        fields.forEach((field) => {
          const val = obj[field];
          if (typeof val === "string" && val.trim() && !looksLikeNonText(val)) {
            pushEntry(val, obj, field);
          }
        });
      });
    };

    switch (fileName) {
      case "Actors.json":
        extractFieldsFromArray(data, ["name", "nickname", "profile"]);
        break;
      case "Armors.json":
      case "Items.json":
      case "Weapons.json":
        extractFieldsFromArray(data, ["name", "description"]);
        break;
      case "Classes.json":
      case "Enemies.json":
      case "Tilesets.json":
        extractFieldsFromArray(data, ["name"]);
        break;
      case "Skills.json":
        extractFieldsFromArray(data, ["name", "description", "message1", "message2"]);
        break;
      case "States.json":
        extractFieldsFromArray(data, ["name", "message1", "message2", "message3", "message4"]);
        break;
      case "MapInfos.json":
        extractFieldsFromArray(data, ["name", "displayName"]);
        break;

      case "System.json": {
        const sys = data;
        if (!sys || typeof sys !== "object") break;

        ["gameTitle", "currencyUnit"].forEach((k) => {
          if (typeof sys[k] === "string" && sys[k].trim() && !looksLikeNonText(sys[k])) {
            pushEntry(sys[k], sys, k);
          }
        });

        [
          "armorTypes", "elements", "equipTypes", "skillTypes",
          "switches", "variables", "weaponTypes",
        ].forEach((k) => {
          if (Array.isArray(sys[k])) {
            sys[k].forEach((s, i) => {
              if (typeof s === "string" && s.trim() && !looksLikeNonText(s)) {
                pushEntry(s, sys[k], i);
              }
            });
          }
        });

        if (sys.messages && typeof sys.messages === "object") {
          Object.keys(sys.messages).forEach((k) => {
            const s = sys.messages[k];
            if (typeof s === "string" && s.trim() && !looksLikeNonText(s)) {
              pushEntry(s, sys.messages, k);
            }
          });
        }

        if (sys.terms && typeof sys.terms === "object") {
          Object.keys(sys.terms).forEach((subKey) => {
            const sub = sys.terms[subKey];
            if (sub && typeof sub === "object") {
              Object.keys(sub).forEach((k) => {
                const s = sub[k];
                if (typeof s === "string" && s.trim() && !looksLikeNonText(s)) {
                  pushEntry(s, sub, k);
                }
              });
            }
          });
        }
        break;
      }

      default:
        break;
    }
  }

  function extractEventListsFast(fileName, json, pushEntry) {
    if (/^Map\d+\.json$/i.test(fileName)) {
      const map = json;
      if (!map || typeof map !== "object") return;
      if (!Array.isArray(map.events)) return;
      for (const ev of map.events) {
        if (!ev || typeof ev !== "object") continue;
        if (!Array.isArray(ev.pages)) continue;
        for (const page of ev.pages) {
          if (!page || typeof page !== "object") continue;
          extractEventCommandList(page.list, pushEntry);
        }
      }
      return;
    }

    if (fileName === "CommonEvents.json") {
      const arr = unwrapMaybeArray(json);
      if (!Array.isArray(arr)) return;
      for (const ce of arr) {
        if (!ce || typeof ce !== "object") continue;
        extractEventCommandList(ce.list, pushEntry);
      }
      return;
    }

    if (fileName === "Troops.json") {
      const arr = unwrapMaybeArray(json);
      if (!Array.isArray(arr)) return;
      for (const troop of arr) {
        if (!troop || typeof troop !== "object") continue;
        if (Array.isArray(troop.pages)) {
          for (const page of troop.pages) {
            extractEventCommandList(page.list, pushEntry);
          }
        }
      }
      return;
    }
  }

  function pushEntryFactory(fileIndex, fileName, entries, idRef) {
    return function pushEntry(text, refObj, index, extra = null) {
      if (typeof text !== "string") return;
      if (!text.trim()) return;
      entries.push({
        id: idRef.value++,
        fileIndex,
        fileName,
        ref: refObj,
        index,
        original: text,
        extra,
      });
    };
  }

  async function onJsonPicked(e) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    ui.fileCountLabel.textContent = `${files.length} file(s) selected…`;
    setStatus(`Selected ${files.length} file(s). Parsing…`);

    await new Promise(requestAnimationFrame);

    const results = [];
    for (let i = 0; i < files.length; i++) {
      setStatus(`Reading ${i + 1}/${files.length}: ${files[i].name}`);
      await new Promise(requestAnimationFrame);
      results.push(await readJsonFile(files[i]));
      await new Promise(r => setTimeout(r, 0));
    }

    const validFiles = results.filter(r => !r.error && r.json);
    const errorFiles = results.filter(r => r.error);

    if (!validFiles.length) {
      ui.fileCountLabel.textContent = `0 file(s) is open.`;
      setStatus(`❌ No valid JSON. Parse errors: ${errorFiles.map(x => x.name).join(", ")}`);
      return;
    }

    state.filesData = validFiles;
    renderTabs(validFiles);
    ui.fileCountLabel.textContent = `${validFiles.length} file(s) is open.`;

    setStatus("Extracting text…");
    await new Promise(requestAnimationFrame);

    const allEntries = [];
    const idRef = { value: 0 };

    for (let fileIndex = 0; fileIndex < validFiles.length; fileIndex++) {
      const fileData = validFiles[fileIndex];
      const fileName = fileData.name;
      const json = fileData.json;

      const pushEntry = pushEntryFactory(fileIndex, fileName, allEntries, idRef);

      if (SPECIAL_DB_FILES.has(fileName)) {
        extractFromDatabaseFile(fileName, json, pushEntry);
      }

      extractEventListsFast(fileName, json, pushEntry);
    }

    if (!allEntries.length) {
      ui.editor.value = "";
      state.textEntries = [];
      state.textGroups = new Map();
      setSaveEnabled(false, validFiles.length > 1);
      setStatus("No extractable in-game text found (dialog/choices/system names).");
      return;
    }

    const groups = new Map();
    for (const entry of allEntries) {
      const key = entry.original;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(entry);
    }

    const unique = Array.from(groups.values()).map(g => g[0]);
    state.textEntries = unique;
    state.textGroups = groups;

    const txt = unique.map((entry) => `---------${entry.id}\n${entry.original}`).join("\n");
    ui.editor.value = txt;

    setSaveEnabled(true, validFiles.length > 1);

    setStatus(
      `✅ Loaded ${validFiles.length} file(s). Refs: ${allEntries.length} | Unique: ${unique.length}` +
      (errorFiles.length ? ` | Parse errors: ${errorFiles.map(x => x.name).join(", ")}` : "")
    );

    ui.jsonUpload.value = "";
  }

  function onExportTxt() {
    const text = ui.editor.value || "";
    if (!text.trim()) return;
    const name = state.filesData.length === 1
      ? state.filesData[0].name.replace(/\.json$/i, ".txt")
      : "merged_text.txt";
    downloadFile(name, text, "text/plain;charset=utf-8");
    setStatus("TXT extracted.");
  }

  function onTxtPicked(e) {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      ui.editor.value = String(reader.result || "");
      setStatus("Loaded TXT.");
      ui.txtUpload.value = "";
    };
    reader.readAsText(f, "utf-8");
  }

  function parseBlocksFromEditor(text) {
    const blocks = text.split(/(?=---------\d+)/g).filter(Boolean);
    const map = new Map();
    for (const block of blocks) {
      const lines = block.replace(/\r/g, "").split("\n");
      const header = lines.shift() || "";
      const m = header.match(/^---------\s*(\d+)\s*$/);
      if (!m) continue;
      map.set(Number(m[1]), lines.join("\n"));
    }
    return map;
  }

  async function onSave() {
    if (!state.filesData.length || !state.textEntries.length) return;

    const editedMap = parseBlocksFromEditor(ui.editor.value);
    const idToEntry = new Map(state.textEntries.map(e => [e.id, e]));

    let updated = 0;
    for (const [id, newText] of editedMap.entries()) {
      const uniqueEntry = idToEntry.get(id);
      if (!uniqueEntry) continue;
      const oldText = uniqueEntry.original;
      if (newText === oldText) continue;

      const refs = state.textGroups.get(oldText) || [];
      for (const r of refs) {
        r.ref[r.index] = newText;
        updated++;
      }

      state.textGroups.delete(oldText);
      uniqueEntry.original = newText;
      state.textGroups.set(newText, refs);
    }

    if (state.filesData.length === 1) {
      downloadFile(
        `edited_${state.filesData[0].name}`,
        JSON.stringify(state.filesData[0].json, null, 2),
        "application/json; charset=utf-8"
      );
      setStatus(`✅ JSON Saved. Updated ${updated} ref(s).`);
      return;
    }

    if (typeof JSZip === "undefined") {
      setStatus("❌ JSZip not found. Check jszip script include.");
      return;
    }

    const zip = new JSZip();
    state.filesData.forEach((f) => zip.file(f.name, JSON.stringify(f.json, null, 2)));
    const blob = await zip.generateAsync({ type: "blob" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "edited_rpg_files.zip";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    setStatus(`✅ ZIP Saved. Updated ${updated} ref(s).`);
  }

  function readJsonFile(file) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          let content = reader.result;
          if (typeof content === "string" && content.charCodeAt(0) === 0xFEFF) {
            content = content.slice(1);
          }
          const json = JSON.parse(content);
          resolve({ name: file.name, json, error: false });
        } catch (err) {
          resolve({ name: file.name, json: null, error: true, errMsg: err.message });
        }
      };
      reader.readAsText(file, "utf-8");
    });
  }
}
})();