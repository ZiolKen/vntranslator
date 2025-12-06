            const output = document.getElementById('output');
 
            // ==================== KS → JSON ====================          
            document.getElementById('ksFile').addEventListener('change', function(e) {
                const files = Array.from(e.target.files);
                if (!files.length) return;
 
                output.value = "🔄 Processing " + files.length + " file(s)...\n";
                let index = 0;
 
                function processNextFile() {
                    if (index >= files.length) {
                        output.value += "✅ Converted All Files!\n";
                        return;
                    }
 
                    const file = files[index];
                    const reader = new FileReader();
 
                    reader.onload = function(ev) {
                        const lines = ev.target.result.split(/\r?\n/);
                        const data = [];
                        let inIscript = false;
 
                        lines.forEach((line, idx) => {
                            let textValue = "";
                            const t = line.trim();
 
                            if (t.startsWith("[iscript]")) {
                                inIscript = true;
                                return;
                            }
                            if (t.startsWith("[endscript]")) {
                                inIscript = false;
                                return;
                            }
                            if (inIscript) return;
 
                            const evalMatch = t.match(/@eval\s+exp=sf\.(?:name\d?|hnam\d?)="(.*?)"/);
                            if (evalMatch) {
                                textValue = evalMatch[1];
                            }      
                            else {
                                const match = t.match(/text=(["'])(.*?)\1/);
                                if (match) {
                                    textValue = match[2];
                                }     
                                else {
                                    const quoteMatch = t.match(/「(.*?)」/);
                                    if (quoteMatch) {
                                        textValue = quoteMatch[1];
                                    }  
                                    else if (
                                        /emb\s+exp="sf\.hnam\d?"/.test(t) ||
                                        /。$/.test(t)
                                    ) {
                                        textValue = t.replace(/^;　?/, "");
                                    }     
                                    else if (/^\[cname\s+chara=.*?\]/.test(t)) {
                                        textValue = t.replace(/^\[cname\s+chara=.*?\]/, "")
                                            .replace(/\[np\]/gi, "")
                                            .trim();
                                    }     
                                    else if (
                                        t !== "" &&
                                        !t.startsWith("[") &&
                                        !t.startsWith("*") &&
                                        !t.startsWith(";") &&
                                        !t.startsWith("@")
                                    ) {
                                        textValue = line;
                                    }
                                }
                            }
 
                            if (
                                /^;?【.*?】$/.test(t) ||
                                /^;?「§」$/.test(t) ||
                                /^「§」$/.test(t) ||
                                textValue === "§"
                            ) {
                                textValue = "";
                            }
 
                            if (textValue) {
                                data.push({
                                    id: (data.length + 1).toString().padStart(4, '0'),
                                    text: textValue,
                                    lineIndex: idx
                                });
                            }
                        });
 
                        const jsonStr = JSON.stringify({
                            texts: data
                        }, null, 2);
                        const blob = new Blob(["\ufeff" + jsonStr], {
                            type: 'application/json;charset=utf-8'
                        });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = file.name.replace(/\.ks$/i, '.json');
                        document.body.appendChild(a);
                        setTimeout(() => {
                            a.click();
                            document.body.removeChild(a);
                            URL.revokeObjectURL(url);
                        }, 80);
 
                        output.value += "✅ Converted: " + file.name + " → " + a.download + "\n";
                        index++;
                        processNextFile();
                    };
 
                    reader.readAsText(file, 'UTF-8');
                }
 
                processNextFile();
            });
 
            // ==================== JSON + KS ====================          
            document.getElementById('mergeBtn').addEventListener('click', function() {
                const jsonFile = document.getElementById('jsonFile').files[0];
                const ksFile = document.getElementById('ksOriginFile').files[0];
                if (!jsonFile || !ksFile) {
                    alert("⚠️ Please select both translated JSON and original KS!");
                    return;
                }
 
                const readerJSON = new FileReader();
                readerJSON.onload = function(e) {
                    let jsonData;
                    try {
                        jsonData = JSON.parse(e.target.result);
                    } catch (err) {
                        alert("⚠️ Invalid JSON!");
                        return;
                    }
 
                    const readerKS = new FileReader();
                    readerKS.onload = function(ev2) {
                        const lines = ev2.target.result.split(/\r?\n/);
                        const finalLines = lines.map((line, idx) => {
                            let updatedLine = line;
                            const item = jsonData.texts.find(t => t.lineIndex === idx);
                            if (!item) return line;
 
                            const newText = item.text?.trim() || "";
   
                            if (/text=(["'])(.*?)\1/.test(line)) {
                                updatedLine = line.replace(/text=(["'])(.*?)\1/, match => {
                                    const safeText = newText.replace(/"/g, '\\"');
                                    return `text="${safeText}"`;
                                });
                            }  
                            else if (/@eval\s+exp=sf\.(?:name\d?|hnam\d?)="(.*?)"/.test(line)) {
                                updatedLine = line.replace(/"(.*?)"/, `"${newText}"`);
                            }   
                            else if (/「(.*?)」/.test(line)) {
                                updatedLine = line.replace(/「(.*?)」/, `「${newText}」`);
                            }     
                            else if (/emb\s+exp="sf\.hnam\d?"/.test(line) || /。$/.test(line)) {
                                if (/^;/.test(line)) {
                                    updatedLine = line.replace(/^;　?.*$/, `;　${newText}`);
                                } else {
                                    updatedLine = newText;
                                }
                            }      
                            else if (/^\[cname\s+chara=.*?\]/.test(line)) {
                                updatedLine = line.replace(/^\[cname\s+chara=.*?\].*$/, `[cname chara=""]${newText}[np]`);
                            }    
                            else if (
                                line.trim() !== "" &&
                                !line.trim().startsWith("[") &&
                                !line.trim().startsWith("*") &&
                                !line.trim().startsWith(";") &&
                                !line.trim().startsWith("@")
                            ) {
                                updatedLine = newText;
                            }
 
                            return updatedLine;
                        });
 
                        const ksContent = finalLines.join("\n");
                        output.value = ksContent;
 
                        const blob = new Blob([ksContent], {
                            type: 'application/octet-stream'
                        });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = ksFile.name;
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        URL.revokeObjectURL(url);
                    };
                    readerKS.readAsText(ksFile, 'UTF-8');
                };
                readerJSON.readAsText(jsonFile, 'UTF-8');
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