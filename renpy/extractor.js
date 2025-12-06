        const logBox = document.getElementById("log");
        let logBuffer = [];
        
        function log(msg, type = "info") {
            const color = {
                success: "var(--neon-green)",
                error: "var(--neon-red)",
                warn: "var(--neon-yellow)",
                info: "var(--neon-cyan)",
            }[type] || "var(--neon-cyan)";
        
            logBuffer.push(`<span style="color:${color}">${msg}</span><br>`);
        
            if (logBuffer.length >= 20) flushLog();
        }
        
        function flushLog() {
            if (!logBuffer.length) return;
            logBox.innerHTML += logBuffer.join("");
            logBuffer = [];
            logBox.scrollTop = logBox.scrollHeight;
        }
        
        const RGX_ASSET_FILE = /\.(png|jpe?g|gif|webp|mp3|ogg|wav|mp4|webm|m4a|avi|mov|ttf|otf|pfb|pfm|ps|woff2?|eot|svg)["']?$/i;
        const RGX_ASSET_PATH = /["'](images?|audio|music|voice|bg|sfx|movie|video|sounds?)\//i;
        
        const RGX_FULL_STRING = /^"((?:\\.|[^"\\])*)"$/;      
        const RGX_STRING_INSIDE = /"((?:\\.|[^"\\])*)"/;
        const RGX_DICT = /{\s*dialog:\s*["']([\s\S]*?)["']\s*,\s*line:\s*(\d+)\s*}/g;
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
        
        function escapeDialog(str) {
            return str
                .replace(/\\/g, "\\\\")
                .replace(/"/g, '\\"')
                .replace(/\r?\n/g, "\\n");
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
                        dialog: escapeDialog(m[1]),
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
        
            const dialogs = [...transText.matchAll(RGX_DICT)].map(m => ({
                dialog: escapeDialog(m[1]),
                line: parseInt(m[2])
            }));
        
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