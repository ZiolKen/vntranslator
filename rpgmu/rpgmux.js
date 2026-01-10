(() => {
"use strict";

const $ = (id) => document.getElementById(id);

const ui = {
  jsonUpload: $("json-upload"),
  txtUpload: $("txt-upload"),
  editor: $("editorArea"),
  exportBtn: $("exportTxtBtn"),
  importBtn: $("importTxtBtn"),
  saveBtn: $("saveBtn"),
  saveBtnText: $("saveBtnText"),
  status: $("step1Status"),
  fileTabs: $("fileTabs"),
  fileCountLabel: $("fileCountLabel"),
  wordWrapToggle: $("wordWrapToggle"),
};

const state = {
  filesData: [],
  textEntries: [],
  textGroups: new Map(),
  displayText: "",
};

function setStatus(msg) {
  ui.status.textContent = msg || "";
}

function setSaveButtonEnabled(enabled, multiFile) {
  ui.saveBtn.disabled = !enabled;
  ui.saveBtnText.textContent = multiFile ? " SAVE ZIP (DONE)" : " SAVE JSON (DONE)";

  ui.saveBtn.className = enabled
    ? "font-bold py-2 px-6 rounded shadow flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white"
    : "font-bold py-2 px-6 rounded shadow flex items-center gap-2 bg-gray-300 text-gray-500 cursor-not-allowed";
}

function renderTabs(files) {
  if (!files || files.length === 0) {
    ui.fileTabs.style.display = "none";
    ui.fileTabs.innerHTML = "";
    return;
  }
  ui.fileTabs.style.display = "block";
  ui.fileTabs.innerHTML = files.map(f => `<span class="tab">${escapeHtml(f.name)}</span>`).join("");
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function downloadFile(filename, content, type = "application/json") {
  const a = document.createElement("a");
  const blob = new Blob([content], { type });
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
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
  PLUGIN_CMD_MV: 356,
  COMMENT: 108,
  COMMENT_MORE: 408,
};

const SPECIAL_DB_FILES = new Set([
  "Actors.json",
  "Armors.json",
  "Classes.json",
  "Enemies.json",
  "Items.json",
  "Skills.json",
  "States.json",
  "Weapons.json",
  "System.json",
  "Tilesets.json",
  "MapInfos.json",
  "Troops.json",
]);

function looksLikeNonText(s) {
  const t = String(s);
  if (!t.trim()) return true;
  if (t.length <= 1) return true;

  if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(t)) return true;

  if (/\.(png|jpg|jpeg|webp|rpg|rpgm|js|css|html|ogg|m4a|mp3|mp4|otf|woff|avi|mov|ttf|webm|woff2|pfb|pfm|eot|svg|ps|wav|json)$/i.test(t)) return true;

  const letters = (t.match(/\p{L}/gu) || []).length;
  if (letters === 0 && t.length < 6) return true;

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

function pushEntryFactory(fileIndex, fileName, entries, startIdRef) {
  return function pushEntry(text, refObj, index, extra = null) {
    if (typeof text !== "string") return;
    if (!text.trim()) return;

    const entry = {
      id: startIdRef.value++,
      fileIndex,
      fileName,
      ref: refObj,
      index,
      original: text,
      extra,
    };
    entries.push(entry);
  };
}

function extractFromDatabaseFile(fileName, json, fileIndex, startIdRef) {
  const entries = [];
  const pushEntry = pushEntryFactory(fileIndex, fileName, entries, startIdRef);

  const data = unwrapMaybeArray(json);

  const extractFieldsFromArray = (arr, fields) => {
    if (!Array.isArray(arr)) return;
    arr.forEach((obj) => {
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
      extractFieldsFromArray(data, ["name"]);
      break;

    case "Enemies.json":
      extractFieldsFromArray(data, ["name"]);
      break;

    case "Skills.json":
      extractFieldsFromArray(data, ["name", "description", "message1", "message2"]);
      break;

    case "States.json":
      extractFieldsFromArray(data, ["name", "message1", "message2", "message3", "message4"]);
      break;

    case "Tilesets.json":
      extractFieldsFromArray(data, ["name"]);
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
        "armorTypes",
        "elements",
        "equipTypes",
        "skillTypes",
        "switches",
        "variables",
        "weaponTypes",
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

    case "Troops.json":
      extractFieldsFromArray(data, ["name"]);
      break;

    default:
      break;
  }

  return entries;
}

function extractEventCommandList(list, pushEntry) {
  if (!Array.isArray(list)) return;

  for (let i = 0; i < list.length; i++) {
    const cmd = list[i];
    if (!cmd || typeof cmd !== "object") continue;

    const code = cmd.code;
    const p = Array.isArray(cmd.parameters) ? cmd.parameters : [];

    if (code === CODES.SHOW_TEXT_LINE || code === CODES.SCROLL_TEXT_LINE) {
      if (typeof p[0] === "string" && p[0].trim() && !looksLikeNonText(p[0])) {
        pushEntry(p[0], cmd.parameters, 0, { type: "eventText", code });
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
      typeof p[1] === "string" &&
      p[1].trim() &&
      !looksLikeNonText(p[1])
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
    
/*

    if ((code === CODES.COMMENT || code === CODES.COMMENT_MORE) && typeof p[0] === "string") {
      if (p[0].trim() && !looksLikeNonText(p[0])) {
        pushEntry(p[0], cmd.parameters, 0, { type: "comment", code });
      }
    }
    
*/

  }
}

function extractFromAnyObject(root, pushEntry) {
  const seen = new WeakSet();

  function visit(obj) {
    if (!obj || typeof obj !== "object") return;
    if (seen.has(obj)) return;
    seen.add(obj);

    if (Array.isArray(obj)) {
      obj.forEach(visit);
      return;
    }

    if (
      Array.isArray(obj.list) &&
      obj.list.length > 0 &&
      obj.list[0] &&
      typeof obj.list[0] === "object" &&
      typeof obj.list[0].code === "number" &&
      Array.isArray(obj.list[0].parameters)
    ) {
      extractEventCommandList(obj.list, pushEntry);

      Object.keys(obj).forEach((k) => {
        if (k === "list") return;
        visit(obj[k]);
      });
      return;
    }

    Object.values(obj).forEach(visit);
  }

  visit(root);
}

ui.jsonUpload.addEventListener("change", async (e) => {
  const files = Array.from(e.target.files || []);
  if (!files.length) return;

  setStatus(`Reading ${files.length} file(s)...`);

  const readFile = (file) =>
    new Promise((resolve) => {
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

  const results = await Promise.all(files.map(readFile));
  const validFiles = results.filter(r => !r.error && r.json);
  const errorFiles = results.filter(r => r.error);

  if (!validFiles.length) {
    setStatus(`No valid JSON. Parse error: ${errorFiles.map(x => x.name).join(", ")}`);
    return;
  }

  state.filesData = validFiles;
  renderTabs(validFiles);
  ui.fileCountLabel.textContent = `${validFiles.length} file(s) is open.`;

  const allEntries = [];
  const idRef = { value: 0 };

  validFiles.forEach((fileData, fileIndex) => {
    const fileName = fileData.name;
    const json = fileData.json;

    if (SPECIAL_DB_FILES.has(fileName)) {
      const entries = extractFromDatabaseFile(fileName, json, fileIndex, idRef);
      allEntries.push(...entries);
    }

    const pushEntry = pushEntryFactory(fileIndex, fileName, allEntries, idRef);
    extractFromAnyObject(json, pushEntry);
  });

  if (!allEntries.length) {
    setStatus("No extractable text found (dialog/choices/system names).");
    ui.editor.value = "";
    setSaveButtonEnabled(false, validFiles.length > 1);
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
  state.displayText = txt;
  ui.editor.value = txt;

  setSaveButtonEnabled(true, validFiles.length > 1);

  const msg = `Loaded ${validFiles.length} file(s). Total refs: ${allEntries.length} | Unique lines: ${unique.length}` +
    (errorFiles.length ? ` | Parse errors: ${errorFiles.map(x => x.name).join(", ")}` : "");
  setStatus(msg);

  ui.jsonUpload.value = "";
});

ui.exportBtn.addEventListener("click", () => {
  if (!ui.editor.value.trim()) return;
  const name = state.filesData.length === 1
    ? state.filesData[0].name.replace(/\.json$/i, ".txt")
    : "merged_text.txt";
  downloadFile(name, ui.editor.value, "text/plain;charset=utf-8");
  setStatus("TXT extracted.");
});

ui.importBtn.addEventListener("click", () => ui.txtUpload.click());

ui.txtUpload.addEventListener("change", (e) => {
  const f = e.target.files && e.target.files[0];
  if (!f) return;

  const reader = new FileReader();
  reader.onload = () => {
    ui.editor.value = String(reader.result || "");
    setStatus("Loaded TXT.");
    ui.txtUpload.value = "";
  };
  reader.readAsText(f, "utf-8");
});

ui.wordWrapToggle.addEventListener("change", () => {
  const on = ui.wordWrapToggle.checked;
  ui.editor.classList.toggle("wrap-on", on);
  ui.editor.classList.toggle("wrap-off", !on);
});

function parseBlocksFromEditor(text) {
  const blocks = text.split(/(?=---------\d+)/g).filter(Boolean);
  const map = new Map();
  for (const block of blocks) {
    const lines = block.replace(/\r/g, "").split("\n");
    const header = lines.shift() || "";
    const m = header.match(/^---------\s*(\d+)\s*$/);
    if (!m) continue;
    const id = Number(m[1]);
    const body = lines.join("\n");
    map.set(id, body);
  }
  return map;
}

ui.saveBtn.addEventListener("click", async () => {
  if (!state.filesData.length || !state.textEntries.length) return;

  try {
    const editedMap = parseBlocksFromEditor(ui.editor.value);
    let updatedCount = 0;

    const idToEntry = new Map();
    for (const e of state.textEntries) idToEntry.set(e.id, e);

    for (const [id, newText] of editedMap.entries()) {
      const uniqueEntry = idToEntry.get(id);
      if (!uniqueEntry) continue;

      const oldText = uniqueEntry.original;
      if (newText === oldText) continue;

      const allRefs = state.textGroups.get(oldText) || [];
      for (const refEntry of allRefs) {
        refEntry.ref[refEntry.index] = newText;
        updatedCount++;
      }

      state.textGroups.delete(oldText);
      uniqueEntry.original = newText;
      state.textGroups.set(newText, allRefs);
    }

    if (state.filesData.length === 1) {
      downloadFile(
        `edited_${state.filesData[0].name}`,
        JSON.stringify(state.filesData[0].json, null, 2),
        "application/json; charset=utf-8"
      );
      setStatus(`JSON Saved. ${updatedCount} ref(s) updated.`);
      return;
    }

    const zip = new JSZip();
    state.filesData.forEach((f) => {
      zip.file(f.name, JSON.stringify(f.json, null, 2));
    });
    const blob = await zip.generateAsync({ type: "blob" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "edited_rpg_files.zip";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    setStatus(`ZIP Saved. ${updatedCount} ref(s) updated.`);
  } catch (err) {
    setStatus("Save error: " + err.message);
    console.error(err);
  }
});
})();