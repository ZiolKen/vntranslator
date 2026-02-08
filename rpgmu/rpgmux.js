(() => {
  "use strict";

  window.addEventListener("DOMContentLoaded", initStep1);

  const isMobile = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  const particleCount = isMobile ? 60 : 111;

  if (typeof particlesJS === "function") {
    particlesJS("particles-js", {
      particles: {
        number: { value: particleCount, density: { enable: true, value_area: 950 } },
        color: { value: "#a855f7" },
        shape: { type: "circle", stroke: { width: 0, color: "#000" } },
        opacity: { value: 0.4, random: true, anim: { enable: false } },
        size: { value: 2.2, random: true, anim: { enable: false } },
        line_linked: { enable: true, distance: 160, color: "#a855f7", opacity: 0.16, width: 1 },
        move: { enable: true, speed: 0.75, direction: "none", random: false, straight: false, out_mode: "out", bounce: false },
      },
      interactivity: {
        detect_on: "canvas",
        events: { onhover: { enable: true, mode: "repulse" }, onclick: { enable: false }, resize: true },
        modes: { repulse: { distance: 90, duration: 0.35 } },
      },
      retina_detect: true,
    });
  }

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

      editor: byId("editorArea") || document.querySelector("#step1Card textarea") || document.querySelector("textarea"),

      exportBtn: byId("exportTxtBtn") || document.querySelector("#step1Card #exportTxtBtn") || byId("exportTxtBtn"),
      importBtn: byId("importTxtBtn") || document.querySelector("#step1Card #importTxtBtn") || byId("importTxtBtn"),

      saveBtn: byId("saveBtn") || document.querySelector("#step1Card #saveBtn") || byId("saveBtn"),
      saveBtnText: byId("saveBtnText") || document.querySelector("#saveBtnText"),

      status:
        byId("step1Status") ||
        (byId("step1Card") ? byId("step1Card").querySelector(".log-container") : null) ||
        document.querySelector("#step1-root .log-container"),

      fileTabs: byId("fileTabs") || document.querySelector("#step1Card #fileTabs"),
      fileCountLabel: byId("fileCountLabel") || (byId("step1Card") ? byId("step1Card").querySelector(".label") : null),

      wordWrapToggle: byId("wordWrapToggle") || document.querySelector("#step1Card #wordWrapToggle"),
    };

    if (!ui.jsonUpload || !ui.editor || !ui.status || !ui.fileCountLabel || !ui.saveBtn) {
      console.error("[Step 1] Missing elements:", ui);
      if (ui.status) ui.status.textContent = "❌ Init failed: missing elements.";
      return;
    }

    const SETTINGS = {
      extractMode: "dialogue",
      io: {
        concurrency: isMobile ? 2 : Math.max(4, Math.min(8, (navigator.hardwareConcurrency || 8) - 2)),
        prettyJson: false,
        yieldEvery: isMobile ? 2500 : 9000,
      },
      extract: {
        eventText: true,
        choices: true,
        speakerName: true,
        scrollText: true,
        comments: {
          enabled: true,
          allowlistPrefixes: ["D_TEXT", "TEXT", "MSG", "MESSAGE"],
          dialogueLikeFallback: true,
        },
        pluginCommands: {
          mv356: true,
          mz357: true,
          allowlist: ["D_TEXT"],
        },
        scripts: {
          mode: "safe",
        },
      },
    };

    const state = {
      filesData: [],
      textEntries: [],
      textGroups: new Map(),
      loadToken: 0,
    };

    ui.status.textContent = "✅ READY - Awaiting file(s)…";

    ui.jsonUpload.addEventListener("change", (e) => onJsonPicked(e).catch(hardError));
    if (ui.exportBtn) ui.exportBtn.addEventListener("click", onExportTxt);
    if (ui.importBtn && ui.txtUpload) ui.importBtn.addEventListener("click", () => ui.txtUpload.click());
    if (ui.txtUpload) ui.txtUpload.addEventListener("change", onTxtPicked);
    ui.saveBtn.addEventListener("click", () => onSave().catch(hardError));

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

    function hardError(err) {
      console.error(err);
      setStatus("❌ Error: " + (err?.message || String(err)));
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

    const CODES = Object.freeze({
      SHOW_TEXT_START: 101,
      SHOW_TEXT_LINE: 401,
      SCROLL_TEXT_START: 105,
      SCROLL_TEXT_LINE: 405,
      SHOW_CHOICES: 102,
      WHEN_CHOICE: 402,
      COMMENT: 108,
      COMMENT_MORE: 408,
      SCRIPT: 355,
      SCRIPT_MORE: 655,
      PLUGIN_CMD_MV: 356,
      PLUGIN_CMD_MZ: 357,
    });

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

    const RE = {
      numeric: /^[+-]?\d+(?:\.\d+)?$/,
      range: /^\d+\s*-\s*\d+$/,
      fileExt: /\.(png|jpg|jpeg|js|html|css|otf|ttf|webp|ogg|m4a|mp3|wav|gif|mp4|webm|avi|woff|woff2|eot|svg|mov|json)$/i,
      varLike: /^[A-Za-z_][A-Za-z0-9_]*$/,
      pathLike: /^[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)+$/,
      allCapsCmd: /^[A-Z][A-Z0-9_]+(\s|$)/,
      keyValue: /^\w+\s*:\s*.+$/,
      rpgVar: /\\[VvNnPp]\[\d+\]/g,
      rpgColor: /\\[Cc]\[\d+\]/g,
      rpgIcon: /\\[Ii]\[\d+\]/g,
      rpgGold: /\\[Gg]/g,
      rpgOneChar: /\\[{}<>|.^!]/g,
      rpgBracket: /\\\w+\[[^\]]*\]/g,
      rpgWord: /\\\w+/g,
      spaces: /[ \t\u3000]+/g,
      commentPrefix: /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*(?::|\s)\s*([\s\S]*)$/,
      trailingNumber: /(\s+[+-]?\d+(?:\.\d+)?)\s*$/,
    };

    function stripRpgTextCodesForCheck(s) {
      let t = String(s ?? "");
      t = t.replace(RE.rpgVar, "");
      t = t.replace(RE.rpgColor, "");
      t = t.replace(RE.rpgIcon, "");
      t = t.replace(RE.rpgGold, "");
      t = t.replace(RE.rpgOneChar, "");
      t = t.replace(RE.rpgBracket, "");
      t = t.replace(RE.rpgWord, "");
      t = t.replace(RE.spaces, "");
      return t;
    }

    function isControlOnlyLine(s) {
      return stripRpgTextCodesForCheck(s).length === 0;
    }

    function looksLikeNonText(s) {
      const t = String(s ?? "");
      const trim = t.trim();
      if (!trim) return true;
      if (trim.length <= 1 && /^[A-Za-z0-9]$/.test(trim)) return true;
      if (RE.numeric.test(trim)) return true;
      if (RE.fileExt.test(trim)) return true;

      if (RE.varLike.test(trim)) {
        const isAllCaps = trim.toUpperCase() === trim;
        const hasDigit = /\d/.test(trim);
        const hasUnderscore = /_/.test(trim);
        if (hasUnderscore || hasDigit || isAllCaps) return true;
      }
      return false;
    }

    function looksLikeAssetOrCommandLine(s) {
      const t = String(s ?? "").trim();
      if (!t) return true;
      if (RE.pathLike.test(t)) return true;
      if (RE.allCapsCmd.test(t)) return true;
      if (RE.keyValue.test(t)) return true;
      if (RE.numeric.test(t)) return true;
      if (RE.range.test(t)) return true;
      if (RE.fileExt.test(t)) return true;
      return false;
    }

    function isLikelyHumanText(text, kind) {
      const t = String(text ?? "");
      if (!t.trim()) return false;
      if (isControlOnlyLine(t)) return false;

      if (kind === "speakerName" || kind === "eventText" || kind === "scrollText" || kind === "choice" || kind === "whenChoice") {
        return true;
      }

      if (kind === "commentText" || kind === "pluginText" || kind === "scriptLiteral") {
        if (looksLikeAssetOrCommandLine(t)) return false;
        const core = stripRpgTextCodesForCheck(t);
        if (!core) return false;
        if (core.length <= 1 && /^[A-Za-z0-9]$/.test(core)) return false;
        return true;
      }

      return !looksLikeAssetOrCommandLine(t);
    }

    function unwrapMaybeArray(data) {
      if (Array.isArray(data)) return data;
      if (data && typeof data === "object") {
        if (Array.isArray(data.data)) return data.data;
        if (Array.isArray(data.contents)) return data.contents;
      }
      return data;
    }

    function scanJsStringLiterals(src) {
      const s = String(src ?? "");
      const lits = [];
      let i = 0;
      let idx = 0;

      while (i < s.length) {
        const q = s[i];
        if (q !== "'" && q !== '"') {
          i++;
          continue;
        }
        let j = i + 1;
        let esc = false;
        while (j < s.length) {
          const c = s[j];
          if (esc) {
            esc = false;
            j++;
            continue;
          }
          if (c === "\\") {
            esc = true;
            j++;
            continue;
          }
          if (c === q) break;
          j++;
        }
        if (j >= s.length) break;
        lits.push({ literalIndex: idx++, quote: q, start: i, end: j + 1, inner: s.slice(i + 1, j) });
        i = j + 1;
      }
      return lits;
    }

    function unescapeJsStringInner(inner) {
      const x = String(inner ?? "");
      return x.replace(/\\(u\{[0-9a-fA-F]+\}|u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|n|r|t|b|f|v|\\|'|")/g, (_, esc) => {
        if (esc === "n") return "\n";
        if (esc === "r") return "\r";
        if (esc === "t") return "\t";
        if (esc === "b") return "\b";
        if (esc === "f") return "\f";
        if (esc === "v") return "\v";
        if (esc === "\\") return "\\";
        if (esc === "'") return "'";
        if (esc === '"') return '"';
        if (esc.startsWith("x")) return String.fromCharCode(parseInt(esc.slice(1), 16));
        if (esc.startsWith("u{")) return String.fromCodePoint(parseInt(esc.slice(2, -1), 16));
        if (esc.startsWith("u")) return String.fromCharCode(parseInt(esc.slice(1), 16));
        return esc;
      });
    }

    function escapeForJsString(text, quote) {
      let s = String(text ?? "");
      s = s.replace(/\\/g, "\\\\").replace(/\r/g, "\\r").replace(/\n/g, "\\n").replace(/\t/g, "\\t");
      if (quote === '"') s = s.replace(/"/g, '\\"');
      else s = s.replace(/'/g, "\\'");
      return s;
    }

    function replaceNthJsStringLiteral(src, n, newText) {
      const s = String(src ?? "");
      const lits = scanJsStringLiterals(s);
      const lit = lits[n];
      if (!lit) return s;
      const newInner = escapeForJsString(newText, lit.quote);
      return s.slice(0, lit.start + 1) + newInner + s.slice(lit.end - 1);
    }

    function isScriptLineLikelyAddsMessage(line, litStart, litEnd) {
      const s = String(line ?? "");
      const a = Math.max(0, litStart - 96);
      const b = Math.min(s.length, litEnd + 96);
      const around = s.slice(a, b);
      return /\$gameMessage\s*\.\s*add\s*\(/.test(around);
    }

    function parseCommentTextLine(line) {
      const s = String(line ?? "");
      const m = s.match(RE.commentPrefix);
      if (!m) return null;
      const key = String(m[1] || "").toUpperCase();
      const val = String(m[2] || "");
      const allow = SETTINGS.extract.comments.allowlistPrefixes.some((p) => key === String(p).toUpperCase());
      if (!allow) return null;
      return val;
    }

    function parseMvPluginText(full) {
      const s = String(full ?? "");
      const firstWs = s.search(/\s/);
      const cmd = firstWs === -1 ? s.trim() : s.slice(0, firstWs).trim();
      if (!cmd) return null;
      if (!SETTINGS.extract.pluginCommands.allowlist.includes(cmd)) return null;

      const lits = scanJsStringLiterals(s);
      if (lits.length) {
        const lit = lits[0];
        const text = unescapeJsStringInner(lit.inner);
        if (!text.trim()) return null;
        return { kind: "quoted", cmd, literalIndex: lit.literalIndex, text };
      }

      const suffixMatch = s.match(RE.trailingNumber);
      const suffix = suffixMatch ? suffixMatch[1] : "";
      const body = suffix ? s.slice(0, s.length - suffix.length) : s;
      const ws = body.search(/\s/);
      if (ws === -1) return null;
      const prefix = body.slice(0, ws).trimEnd() + body.slice(ws, ws + 1);
      const text = body.slice(ws).trim();
      if (!text) return null;
      return { kind: "raw", cmd, prefix, suffix, text };
    }

    function extractFromDatabaseFile(fileName, json, pushEntry) {
      const data = unwrapMaybeArray(json);

      const extractFieldsFromArray = (arr, fields) => {
        if (!Array.isArray(arr)) return;
        for (const obj of arr) {
          if (!obj || typeof obj !== "object") continue;
          for (const field of fields) {
            const val = obj[field];
            if (typeof val === "string" && val.trim() && !looksLikeNonText(val)) pushEntry(val, obj, field, { type: "dbText" });
          }
        }
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

          for (const k of ["gameTitle", "currencyUnit"]) {
            if (typeof sys[k] === "string" && sys[k].trim() && !looksLikeNonText(sys[k])) pushEntry(sys[k], sys, k, { type: "dbText" });
          }

          for (const k of ["armorTypes", "elements", "equipTypes", "skillTypes", "switches", "variables", "weaponTypes"]) {
            if (!Array.isArray(sys[k])) continue;
            const arr = sys[k];
            for (let i = 0; i < arr.length; i++) {
              const s = arr[i];
              if (typeof s === "string" && s.trim() && !looksLikeNonText(s)) pushEntry(s, arr, i, { type: "dbText" });
            }
          }

          if (sys.messages && typeof sys.messages === "object") {
            for (const k of Object.keys(sys.messages)) {
              const s = sys.messages[k];
              if (typeof s === "string" && s.trim() && !looksLikeNonText(s)) pushEntry(s, sys.messages, k, { type: "dbText" });
            }
          }

          if (sys.terms && typeof sys.terms === "object") {
            for (const subKey of Object.keys(sys.terms)) {
              const sub = sys.terms[subKey];
              if (!sub || typeof sub !== "object") continue;
              for (const k of Object.keys(sub)) {
                const s = sub[k];
                if (typeof s === "string" && s.trim() && !looksLikeNonText(s)) pushEntry(s, sub, k, { type: "dbText" });
              }
            }
          }
          break;
        }
        default:
          break;
      }
    }

    function pushEntryFactory(fileIndex, fileName, entries, idRef) {
      return function pushEntry(text, refObj, index, extra = null) {
        if (typeof text !== "string") return;
        if (!text.trim()) return;
        entries.push({ id: idRef.value++, fileIndex, fileName, ref: refObj, index, original: text, extra });
      };
    }

    function createLimiter(limit) {
      let active = 0;
      const queue = [];
      const runNext = () => {
        if (active >= limit) return;
        const item = queue.shift();
        if (!item) return;
        active++;
        Promise.resolve()
          .then(item.fn)
          .then(item.resolve, item.reject)
          .finally(() => {
            active--;
            runNext();
          });
      };
      return (fn) =>
        new Promise((resolve, reject) => {
          queue.push({ fn, resolve, reject });
          runNext();
        });
    }

    const decoder = new TextDecoder("utf-8", { fatal: false });

    async function readJsonFileFast(file) {
      try {
        const buf = await file.arrayBuffer();
        let text = decoder.decode(buf);
        if (text && text.charCodeAt(0) === 0xfeff) text = text.slice(1);
        const json = JSON.parse(text);
        return { name: file.name, json, error: false };
      } catch (err) {
        return { name: file.name, json: null, error: true, errMsg: err?.message || String(err) };
      }
    }

    function compileText(entries) {
      let out = "";
      for (let i = 0; i < entries.length; i++) {
        const e = entries[i];
        out += `---------${e.id}\n${e.original}`;
        if (i !== entries.length - 1) out += "\n";
      }
      return out;
    }

    function parseBlocksFromEditor(text) {
      const s = String(text ?? "").replace(/\r/g, "");
      const map = new Map();
      const re = /---------\s*(\d+)\s*\n([\s\S]*?)(?=(?:\n---------\s*\d+\s*\n)|$)/g;
      let m;
      while ((m = re.exec(s))) {
        const id = Number(m[1]);
        const body = m[2] ?? "";
        map.set(id, body);
      }
      return map;
    }

    async function onJsonPicked(e) {
      const token = ++state.loadToken;
      const files = Array.from(e.target.files || []);
      if (!files.length) return;

      setSaveEnabled(false, files.length > 1);
      ui.editor.value = "";
      ui.fileCountLabel.textContent = `${files.length} file(s) selected…`;
      setStatus(`Selected ${files.length} file(s). Reading…`);

      const limit = createLimiter(SETTINGS.io.concurrency);
      let done = 0;
      const results = await Promise.all(
        files.map((f) =>
          limit(async () => {
            const r = await readJsonFileFast(f);
            done++;
            if (token === state.loadToken) setStatus(`Reading ${done}/${files.length}: ${f.name}`);
            return r;
          })
        )
      );

      if (token !== state.loadToken) return;

      const validFiles = results.filter((r) => !r.error && r.json);
      const errorFiles = results.filter((r) => r.error);

      if (!validFiles.length) {
        ui.fileCountLabel.textContent = `0 file(s) is open.`;
        setStatus(`❌ No valid JSON. Parse errors: ${errorFiles.map((x) => x.name).join(", ")}`);
        ui.jsonUpload.value = "";
        return;
      }

      state.filesData = validFiles;
      renderTabs(validFiles);
      ui.fileCountLabel.textContent = `${validFiles.length} file(s) is open.`;

      setStatus("Extracting text…");

      const allEntries = [];
      const idRef = { value: 0 };
      let ticks = 0;
      const yieldToUI = () => new Promise((r) => requestAnimationFrame(() => r()));
      const maybeYield = async () => {
        ticks++;
        if (ticks % SETTINGS.io.yieldEvery === 0) await yieldToUI();
      };

      for (let fileIndex = 0; fileIndex < validFiles.length; fileIndex++) {
        if (token !== state.loadToken) return;
        const fileData = validFiles[fileIndex];
        const fileName = fileData.name;
        const json = fileData.json;
        const pushEntry = pushEntryFactory(fileIndex, fileName, allEntries, idRef);

        if (SPECIAL_DB_FILES.has(fileName)) extractFromDatabaseFile(fileName, json, pushEntry);
        await extractEventListsFast(fileName, json, pushEntry, maybeYield);
      }

      if (!allEntries.length) {
        ui.editor.value = "";
        state.textEntries = [];
        state.textGroups = new Map();
        setSaveEnabled(false, validFiles.length > 1);
        setStatus("No extractable in-game text found.");
        ui.jsonUpload.value = "";
        return;
      }

      const groups = new Map();
      for (const entry of allEntries) {
        const key = entry.original;
        let arr = groups.get(key);
        if (!arr) {
          arr = [];
          groups.set(key, arr);
        }
        arr.push(entry);
      }

      const unique = Array.from(groups.values(), (g) => g[0]);
      state.textEntries = unique;
      state.textGroups = groups;

      ui.editor.value = compileText(unique);
      setSaveEnabled(true, validFiles.length > 1);

      setStatus(
        `✅ Loaded ${validFiles.length} file(s). Refs: ${allEntries.length} | Unique: ${unique.length}` +
          (errorFiles.length ? ` | Parse errors: ${errorFiles.map((x) => x.name).join(", ")}` : "")
      );

      ui.jsonUpload.value = "";
    }

    async function extractEventListsFast(fileName, json, pushEntry, maybeYield) {
      if (/^Map\d+\.json$/i.test(fileName)) {
        const map = json;
        if (!map || typeof map !== "object") return;
        if (!Array.isArray(map.events)) return;
        for (const ev of map.events) {
          if (!ev || typeof ev !== "object") continue;
          if (!Array.isArray(ev.pages)) continue;
          for (const page of ev.pages) {
            if (!page || typeof page !== "object") continue;
            await extractEventCommandList(page.list, pushEntry, maybeYield);
          }
        }
        return;
      }

      if (fileName === "CommonEvents.json") {
        const arr = unwrapMaybeArray(json);
        if (!Array.isArray(arr)) return;
        for (const ce of arr) {
          if (!ce || typeof ce !== "object") continue;
          await extractEventCommandList(ce.list, pushEntry, maybeYield);
        }
        return;
      }

      if (fileName === "Troops.json") {
        const arr = unwrapMaybeArray(json);
        if (!Array.isArray(arr)) return;
        for (const troop of arr) {
          if (!troop || typeof troop !== "object") continue;
          if (!Array.isArray(troop.pages)) continue;
          for (const page of troop.pages) await extractEventCommandList(page.list, pushEntry, maybeYield);
        }
      }
    }

    async function extractEventCommandList(list, pushEntry, maybeYield) {
      if (!Array.isArray(list)) return;

      for (let i = 0; i < list.length; i++) {
        const cmd = list[i];
        if (!cmd || typeof cmd !== "object") continue;

        const code = cmd.code;
        const p = Array.isArray(cmd.parameters) ? cmd.parameters : [];

        if (SETTINGS.extract.speakerName && code === CODES.SHOW_TEXT_START) {
          const speaker = p[4];
          if (typeof speaker === "string" && speaker.trim() && isLikelyHumanText(speaker, "speakerName")) {
            pushEntry(speaker, cmd.parameters, 4, { type: "speakerName", code });
          }
        } else if (SETTINGS.extract.eventText && code === CODES.SHOW_TEXT_LINE) {
          const line = p[0];
          if (typeof line === "string" && line.trim() && isLikelyHumanText(line, "eventText")) {
            pushEntry(line, cmd.parameters, 0, { type: "eventText", code });
          }
        } else if (SETTINGS.extract.scrollText && code === CODES.SCROLL_TEXT_LINE) {
          const line = p[0];
          if (typeof line === "string" && line.trim() && isLikelyHumanText(line, "scrollText")) {
            pushEntry(line, cmd.parameters, 0, { type: "scrollText", code });
          }
        } else if (SETTINGS.extract.choices && code === CODES.SHOW_CHOICES && Array.isArray(p[0])) {
          const arr = p[0];
          for (let j = 0; j < arr.length; j++) {
            const choice = arr[j];
            if (typeof choice === "string" && choice.trim() && isLikelyHumanText(choice, "choice")) {
              pushEntry(choice, arr, j, { type: "choice", code });
            }
          }
        } else if (SETTINGS.extract.choices && code === CODES.WHEN_CHOICE && typeof p[1] === "string") {
          const s = p[1];
          if (s.trim() && isLikelyHumanText(s, "whenChoice")) pushEntry(s, cmd.parameters, 1, { type: "whenChoice", code });
        } else if (SETTINGS.extract.comments.enabled && (code === CODES.COMMENT || code === CODES.COMMENT_MORE)) {
          const raw = p[0];
          if (typeof raw === "string" && raw.trim()) {
            const allowText = parseCommentTextLine(raw);
            if (typeof allowText === "string" && allowText.trim() && isLikelyHumanText(allowText, "commentText")) {
              pushEntry(allowText, cmd.parameters, 0, { type: "commentText", code, wrap: "prefixKey" });
            } else if (SETTINGS.extract.comments.dialogueLikeFallback) {
              const t = raw.trim();
              if (isLikelyHumanText(t, "commentText") && !looksLikeAssetOrCommandLine(t)) pushEntry(t, cmd.parameters, 0, { type: "commentTextRaw", code });
            }
          }
        } else if (SETTINGS.extract.pluginCommands.mv356 && code === CODES.PLUGIN_CMD_MV) {
          const full = p[0];
          if (typeof full === "string" && full.trim()) {
            const parsed = parseMvPluginText(full);
            if (parsed && isLikelyHumanText(parsed.text, "pluginText")) {
              if (parsed.kind === "quoted") {
                pushEntry(parsed.text, cmd.parameters, 0, { type: "pluginTextMVQuoted", code, literalIndex: parsed.literalIndex });
              } else {
                pushEntry(parsed.text, cmd.parameters, 0, { type: "pluginTextMV", code, prefix: parsed.prefix, suffix: parsed.suffix });
              }
            }
          }
        } else if (SETTINGS.extract.pluginCommands.mz357 && code === CODES.PLUGIN_CMD_MZ) {
          const pluginName = p[0];
          const commandName = p[1];
          const args = p[2];
          if (typeof commandName === "string" && SETTINGS.extract.pluginCommands.allowlist.includes(commandName) && args && typeof args === "object") {
            for (const k of Object.keys(args)) {
              const v = args[k];
              if (typeof v === "string" && v.trim() && isLikelyHumanText(v, "pluginText")) {
                pushEntry(v, args, k, { type: "pluginTextMZArg", code, pluginName, commandName, key: k });
              }
            }
          }
        } else if ((code === CODES.SCRIPT || code === CODES.SCRIPT_MORE) && SETTINGS.extract.scripts.mode !== "off") {
          const line = p[0];
          if (typeof line === "string" && line.trim()) {
            const lits = scanJsStringLiterals(line);
            for (const lit of lits) {
              const text = unescapeJsStringInner(lit.inner);
              if (!text.trim()) continue;
              if (SETTINGS.extract.scripts.mode === "safe") {
                if (!isScriptLineLikelyAddsMessage(line, lit.start, lit.end)) continue;
              }
              if (isLikelyHumanText(text, "scriptLiteral")) {
                pushEntry(text, cmd.parameters, 0, { type: "scriptLiteral", code, literalIndex: lit.literalIndex });
              }
            }
          }
        }

        if ((i & 1023) === 0) await maybeYield();
      }
    }

    function onExportTxt() {
      const text = ui.editor.value || "";
      if (!text.trim()) return;
      const name = state.filesData.length === 1 ? state.filesData[0].name.replace(/\.json$/i, ".txt") : "merged_text.txt";
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

    async function onSave() {
      if (!state.filesData.length || !state.textEntries.length) return;

      const editedMap = parseBlocksFromEditor(ui.editor.value);
      const idToEntry = new Map(state.textEntries.map((e) => [e.id, e]));

      let updated = 0;

      for (const [id, newTextRaw] of editedMap.entries()) {
        const uniqueEntry = idToEntry.get(id);
        if (!uniqueEntry) continue;

        const newText = String(newTextRaw ?? "");
        const oldText = uniqueEntry.original;
        if (newText === oldText) continue;

        const refs = state.textGroups.get(oldText) || [];
        for (const r of refs) {
          if (r.extra?.type === "scriptLiteral") {
            const current = String(r.ref[r.index] ?? "");
            r.ref[r.index] = replaceNthJsStringLiteral(current, r.extra.literalIndex, newText);
          } else if (r.extra?.type === "pluginTextMVQuoted") {
            const current = String(r.ref[r.index] ?? "");
            r.ref[r.index] = replaceNthJsStringLiteral(current, r.extra.literalIndex, newText);
          } else if (r.extra?.type === "pluginTextMV") {
            r.ref[r.index] = String(r.extra.prefix ?? "") + newText + String(r.extra.suffix ?? "");
          } else {
            r.ref[r.index] = newText;
          }
          updated++;
        }

        state.textGroups.delete(oldText);
        uniqueEntry.original = newText;
        state.textGroups.set(newText, refs);
      }

      const stringify = (obj) => (SETTINGS.io.prettyJson ? JSON.stringify(obj, null, 2) : JSON.stringify(obj));

      if (state.filesData.length === 1) {
        downloadFile(`edited_${state.filesData[0].name}`, stringify(state.filesData[0].json), "application/json; charset=utf-8");
        setStatus(`✅ JSON Saved. Updated ${updated} ref(s).`);
        return;
      }

      if (typeof JSZip === "undefined") {
        setStatus("❌ JSZip not found. Check jszip script include.");
        return;
      }

      const zip = new JSZip();
      for (const f of state.filesData) zip.file(f.name, stringify(f.json));
      const blob = await zip.generateAsync({ type: "blob" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "edited_rpg_files.zip";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      setStatus(`✅ ZIP Saved. Updated ${updated} ref(s).`);
    }
  }
})();