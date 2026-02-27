const logBox = document.getElementById("log");
let logBuffer = [];

function log(msg, type = "info") {
  logBuffer.push({ msg: String(msg), type });
  if (logBuffer.length >= 50) flushLog();
}

function flushLog() {
  if (!logBuffer.length) return;

  const colors = {
    success: "var(--neon-green)",
    error: "var(--neon-red)",
    warn: "var(--neon-yellow)",
    info: "var(--neon-cyan)",
  };

  const frag = document.createDocumentFragment();
  for (const item of logBuffer) {
    const line = document.createElement("div");
    line.style.color = colors[item.type] || colors.info;
    line.textContent = item.msg;
    frag.appendChild(line);
  }

  logBuffer = [];
  logBox.appendChild(frag);
  logBox.scrollTop = logBox.scrollHeight;
}

const RGX_ASSET_FILE = /\.(png|jpe?g|gif|webp|mp3|ogg|wav|mp4|webm|m4a|avi|mov|ttf|otf|pfb|pfm|ps|woff2?|eot|svg)["']?$/i;
const RGX_ASSET_PATH = /["'](images?|audio|music|voice|bg|sfx|movie|video|sounds?)\//i;

const RGX_FULL_STRING = /^"((?:\\.|[^"\\])*)"$/;      
const RGX_STRING_INSIDE = /"((?:\\.|[^"\\])*)"/;
const RGX_DICT = /{\s*dialog:\s*(?:"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)')\s*,\s*line:\s*(\d+)\s*}/g;
const RGX_ANY_STRING = /"([^"\\]|\\.)*"|'([^'\\]|\\.)*'/g;  

const DIALOG_BLACKLIST = [
    "screen", "background", "outlines", "outline_scaling", "easeout", "hovered", "unhovered",
    "font", "text", "text_font", "style", "key", "if", "else", "at", "def", "config", "size",
    "add", "action", "show", "play", "image", "sound", "align", "import", "with", "move"
];

function isDialogLine(line) {
    const raw = line;
    const trimmed = raw.trim();
    if (!trimmed) return false;

    let lineNoComment = "";
    {
        let inS = false, inD = false;
        for (let i = 0; i < trimmed.length; i++) {
            const c = trimmed[i];
            const prev = i > 0 ? trimmed[i - 1] : null;

            if (c === "'" && !inD && prev !== "\\") inS = !inS;
            else if (c === '"' && !inS && prev !== "\\") inD = !inD;
            else if (c === "#" && !inS && !inD) break;

            lineNoComment += c;
        }
    }

    const t = lineNoComment.trim();
    if (!t) return false;

    if (/^(label|key|style|text_font|font|$|if|else|at|align|easeout|size|hovered|unhovered|import|config|with|def|move|background|text|add|action|screen|sound|outlines|outline_scaling|menu|jump|scene|init|show|hide|stop|play|queue|transform|define|image|window|voice|pause|call|return|renpy|python)\b/i.test(t))
        return false;

    if (/^[\w\s]*=[^"'`]/.test(t)) return false;

    if (RGX_ASSET_FILE.test(t)) return false;
    if (RGX_ASSET_PATH.test(t)) return false;

    const outsideQuotes = t.replace(RGX_ANY_STRING, "");
    for (const kw of DIALOG_BLACKLIST) {
        if (new RegExp(`\\b${kw}\\b`, "i").test(outsideQuotes)) {
            if (!/^[a-zA-Z_][\w]*\s+["']/.test(t)) return false;
        }
    }

    if (/^[\w\s]+:\s*["'].*["']/.test(t)) return true;

    if (RGX_FULL_STRING.test(t)) return true;

    if (/^[\w_]+\s+"(.+?)"/.test(t)) return true;

    if (RGX_STRING_INSIDE.test(t)) {
        const m = t.match(RGX_STRING_INSIDE);
        if (!m) return false;

        const text = m[1].trim();
        if (!text) return false;
        if (/^[.\s]+$/.test(text)) return false;

        return true;
    }

    if (/{.*?}/.test(t) && /[A-Za-z0-9\u00C0-\u1EF9]/.test(t))
        return true;

    return false;
}

function normalizeRenpyNewlines(text) {
    return String(text ?? '').replace(/[\r\n\u2028\u2029]/g, (m) => {
        if (m === "\r") return "";
        return "\\n";
    });
}

function ensureEvenTrailingBackslashes(text) {
    const s = String(text ?? '');
    let trail = 0;
    for (let i = s.length - 1; i >= 0 && s[i] === "\\"; i--) trail++;
    return (trail % 2 === 1) ? (s + "\\") : s;
}

function sanitizeBackslashEscapes(text, original) {
    const s = String(text ?? '');
    const o = String(original ?? '');

    let out = '';
    for (let i = 0; i < s.length; i++) {
        const c = s[i];
        if (c !== "\\") {
            out += c;
            continue;
        }

        const next = s[i + 1];
        if (next == null) {
            out += "\\\\";
            continue;
        }

        if (next === 'u') {
            const hex = s.slice(i + 2, i + 6);
            if (/^[0-9a-fA-F]{4}$/.test(hex)) {
                out += "\\u" + hex;
                i += 5;
            } else {
                if (/\\u[0-9a-fA-F]{0,3}$/.test(o.slice(Math.max(0, i), Math.min(o.length, i + 6)))) out += "\\u";
                else out += "\\\\u";
                i += 1;
            }
            continue;
        }

        if (next === 'U') {
            const hex = s.slice(i + 2, i + 10);
            if (/^[0-9a-fA-F]{8}$/.test(hex)) {
                out += "\\U" + hex;
                i += 9;
            } else {
                if (/\\U[0-9a-fA-F]{0,7}$/.test(o.slice(Math.max(0, i), Math.min(o.length, i + 10)))) out += "\\U";
                else out += "\\\\U";
                i += 1;
            }
            continue;
        }

        if (next === 'x') {
            const hex = s.slice(i + 2, i + 4);
            if (/^[0-9a-fA-F]{2}$/.test(hex)) {
                out += "\\x" + hex;
                i += 3;
            } else {
                if (/\\x[0-9a-fA-F]{0,1}$/.test(o.slice(Math.max(0, i), Math.min(o.length, i + 4)))) out += "\\x";
                else out += "\\\\x";
                i += 1;
            }
            continue;
        }

        if (next === 'N') {
            if (s[i + 2] === '{') {
                const end = s.indexOf('}', i + 3);
                if (end !== -1) {
                    out += s.slice(i, end + 1);
                    i = end;
                    continue;
                }
            }
            out += "\\\\N";
            i += 1;
            continue;
        }

        out += "\\" + next;
        i += 1;
    }

    return ensureEvenTrailingBackslashes(out);
}

function escapeDelimiterQuotes(text, quoteChar) {
    const s = String(text ?? '');
    const q = quoteChar === "'" ? "'" : '"';
    let out = '';
    let bs = 0;

    for (let i = 0; i < s.length; i++) {
        const c = s[i];
        if (c === "\\") {
            bs++;
            out += c;
            continue;
        }
        if (c === q) {
            if (bs % 2 === 0) out += "\\";
            out += c;
            bs = 0;
            continue;
        }
        bs = 0;
        out += c;
    }

    return ensureEvenTrailingBackslashes(out);
}

function validateEscapedRenpyContent(text, quoteChar) {
    const s = String(text ?? '');
    const q = quoteChar === "'" ? "'" : '"';

    if (/[\r\n\u2028\u2029]/.test(s)) return false;

    let trail = 0;
    for (let i = s.length - 1; i >= 0 && s[i] === "\\"; i--) trail++;
    if (trail % 2 === 1) return false;

    let bs = 0;
    for (let i = 0; i < s.length; i++) {
        const c = s[i];
        if (c === "\\") {
            bs++;
            continue;
        }
        if (c === q && (bs % 2 === 0)) return false;
        bs = 0;
    }

    return true;
}

function escapeFallback(text, quoteChar) {
    const q = quoteChar === "'" ? "'" : '"';
    let s = String(text ?? '');
    s = normalizeRenpyNewlines(s);
    s = s.replace(/\\/g, "\\\\");
    s = s.replaceAll(q, "\\" + q);
    return ensureEvenTrailingBackslashes(s);
}

function escapeForRenpyString(text, quoteChar, original) {
    const q = quoteChar === "'" ? "'" : '"';
    let out = String(text ?? '');

    out = normalizeRenpyNewlines(out);
    out = sanitizeBackslashEscapes(out, original);
    out = escapeDelimiterQuotes(out, q);

    if (validateEscapedRenpyContent(out, q)) return out;

    const fb = escapeFallback(text, q);
    if (validateEscapedRenpyContent(fb, q)) return fb;

    return fb;
}

/* ============================================================
    EXTRACT
============================================================ */
document.getElementById("extractBtn").addEventListener("click", async () => {
    const files = document.getElementById("extractFile").files;
    if (!files.length) return alert("⚠️ Select atleast 1 .rpy file!");

    log(`🔄 Processing ${files.length} file(s)...`, "info");

    let total = 0;

    for (const file of files) {
        const text = await file.text();
        const lines = text.split(/\r?\n/);
        const dialogs = [];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (!isDialogLine(line)) continue;

            const m = line.match(RGX_STRING_INSIDE);
            if (!m) continue;

            const cleaned = m[1].trim();
            if (!cleaned || /^[.\s]+$/.test(cleaned)) continue;

            dialogs.push({
                dialog: escapeForRenpyString(m[1], '"', m[1]),
                line: i + 1
            });

            log(`✅ Extract: ${m[1]}`, "success");
        }

        total += dialogs.length;
        
        log(`✅ ${file.name}: Extracted ${dialogs.length} dialogs`, "success");

        const output =
            `texts = [\n` +
            dialogs.map(d => `    { dialog: "${d.dialog}", line: ${d.line} }`).join(",\n") +
            `\n]`;

        const blob = new Blob([output], { type: "text/plain;charset=utf-8" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `${file.name.replace(".rpy", "")}_extracted.rpy`;
        a.click();
    }

    flushLog();
    log(`✅ Done: ${total} dialog extracted.`, "success");
});

/* ============================================================
    MERGE
============================================================ */
document.getElementById("mergeBtn").addEventListener("click", async () => {
    const translated = document.getElementById("translatedFile").files[0];
    const original = document.getElementById("originalFile").files[0];

    if (!translated || !original)
        return alert("⚠️ Select both translated + original!");

    log(`🔄 Merging...`, "info");

    const transText = await translated.text();
    const origText = await original.text();

    const dialogs = [...transText.matchAll(RGX_DICT)].map(m => {
        const raw = (m[1] ?? m[2] ?? '');
        return {
            dialog: escapeForRenpyString(raw, '"', raw),
            line: parseInt(m[3])
        };
    });

    const origLines = origText.split(/\r?\n/);

    let mergedCount = 0;
    dialogs.forEach(d => {
        const i = d.line - 1;

        if (!origLines[i]) {
            log(`⚠️ Missing line: ${d.line}`, "warn");
            return;
        }

        origLines[i] = origLines[i].replace(
            RGX_STRING_INSIDE,
            `"${d.dialog}"`
        );

        log(`✅ Line ${d.line} merged`, "success");
        mergedCount++;
    });

    const merged = origLines.join("\n");
    const blob = new Blob([merged], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${original.name.replace(".rpy", "")}_merged.rpy`;
    a.click();

    flushLog();
    log(`✅ Merge Completed: ${mergedCount} dialogs!`, "success");
});

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