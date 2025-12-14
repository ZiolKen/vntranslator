    const { useState, useEffect, useRef } = React;

const CMD_SHOW_TEXT = 401;
const CMD_SCROLL_TEXT = 405;
const CMD_SCRIPT = 355;
const CMD_SHOW_CHOICES = 102;
const CMD_WHEN_CHOICE = 402;
const CMD_CUSTOM_TEXT_108 = 108;
const CMD_CUSTOM_NAME_408 = 408;
const CMD_CHANGE_PROFILE = 325;

const excludedCodes = new Set([
    101, 103, 104, 109, 111, 112, 113, 115, 117, 118, 119,
    121, 122, 123, 124, 125, 126, 127, 128, 129, 132, 133, 134,
    135, 136, 137, 138, 139, 140, 201, 202, 203, 204, 205, 206,
    211, 212, 213, 214, 216, 217, 221, 222, 223, 224, 225, 230,
    231, 232, 233, 234, 235, 236, 241, 242, 243, 244, 245, 246,
    249, 250, 251, 261, 281, 282, 283, 284, 285, 301, 302, 303,
    311, 312, 313, 314, 315, 316, 317, 318, 319, 320, 321, 322,
    323, 324, 326, 331, 332, 333, 334, 335, 336, 337, 339,
    340, 342, 351, 352, 353, 354, 356, 357, 411, 413, 601, 602,
    603, 655
]);

const SPECIAL_FILES = new Set(['Actors.json', 'Armors.json', 'Items.json', 'Skills.json', 'System.json']);

function getCodeName(code) {
    const codeNames = {
        101: "Show Text", 103: "Number Input", 104: "Select Item", 109: "Skip",
        111: "If ...", 112: "Loop ...", 113: "Loop Break", 115: "Exit Event",
        117: "Common Event", 118: "Label", 119: "Jump to Label",
        121: "Switch Control", 122: "Variable Control", 123: "Self Switch Control",
        124: "Timer Control", 125: "Gold Change", 126: "Item Change",
        127: "Weapon Change", 128: "Armor Change", 129: "Party Change",
        132: "Battle BGM Change", 133: "Victory ME Change", 134: "Save Access Change",
        135: "Menu Access Change", 136: "Encounter Change", 137: "Formation Access Change",
        138: "Window Color Change", 139: "Defeat ME Change", 140: "Vehicle BGM Change",
        201: "Transfer Player", 202: "Set Vehicle Location", 203: "Set Event Location",
        204: "Scroll Map", 205: "Set Movement Route", 206: "Toggle Vehicle",
        211: "Transparency Change", 212: "Show Animation", 213: "Show Balloon Icon",
        214: "Erase Event", 216: "Change Player Followers", 217: "Gather Followers",
        221: "Fadeout Screen", 222: "Fadein Screen", 223: "Tint Screen",
        224: "Flash Screen", 225: "Shake Screen", 230: "Wait",
        231: "Show Picture", 232: "Move Picture", 233: "Rotate Picture",
        234: "Tint Picture", 235: "Erase Picture", 236: "Set Weather",
        241: "Play BGM", 242: "Fadeout BGM", 243: "Save BGM", 244: "Resume BGM",
        245: "Play BGS", 246: "Fadeout BGS", 249: "Play ME", 250: "Play SE",
        251: "Stop SE", 261: "Play Movie", 281: "Map Name Display Change",
        282: "Tileset Change", 283: "Battle Background Change", 284: "Parallax Change",
        285: "Get Location Info", 301: "Battle Processing", 302: "Shop Processing",
        303: "Name Input Processing", 311: "HP Change", 312: "MP Change",
        313: "State Change", 314: "Recover All", 315: "EXP Change",
        316: "LVL Change", 317: "Parameter Change", 318: "Skill Change",
        319: "Equipment Change", 320: "Name Change", 321: "Class Change",
        322: "Actor Image Change", 323: "Vehicle Image Change", 324: "Nickname Change",
        325: "Profile Change", 326: "TP Change", 331: "Enemy HP Change",
        332: "Enemy MP Change", 333: "Enemy State Change", 334: "Enemy Recover All",
        335: "Enemy Appear", 336: "Enemy Transform", 337: "Show Battle Animation",
        339: "Force Action", 340: "Abort Battle", 342: "Enemy TP Change",
        351: "Open Menu Screen", 352: "Open Save Screen", 353: "Game Over",
        354: "Return to Title Screen", 356: "Plugin Command (MV)", 357: "Plugin Command (MZ)",
        411: "Else ...", 413: "Repeat above...", 601: "If Battle Win",
        602: "If Battle Escape", 603: "If Battle Lose", 655: "Script Line"
    };
    return codeNames[code] || "Unknown";
}

const downloadFile = (filename, content, type = 'application/json') => {
    const element = document.createElement('a');
    const file = new Blob([content], { type: type });
    element.href = URL.createObjectURL(file);
    element.download = filename;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
};

function App() {
    const [filesData, setFilesData] = useState([]);
    const [textEntries, setTextEntries] = useState([]);
    const [textGroups, setTextGroups] = useState(new Map());
    const [displayText, setDisplayText] = useState("");
    const [status, setStatus] = useState("");
    const [isWordWrap, setIsWordWrap] = useState(false);
    const txtInputRef = useRef(null);

    const escapeForJS = (str, quoteChar) => {
        if (quoteChar === '"') {
            return str
                .replace(/\\/g, '\\\\')
                .replace(/"/g, '\\"')
                .replace(/\n/g, '\\n')
                .replace(/\r/g, '\\r')
                .replace(/\t/g, '\\t')
                .replace(/\v/g, '\\v')
                .replace(/\f/g, '\\f')
                .replace(/\x08/g, '\\b')
                .replace(/'/g, "\\'");
        } else {
            return str
                .replace(/\\/g, '\\\\')
                .replace(/'/g, "\\'")
                .replace(/\n/g, '\\n')
                .replace(/\r/g, '\\r')
                .replace(/\t/g, '\\t')
                .replace(/\v/g, '\\v')
                .replace(/\f/g, '\\f')
                .replace(/\x08/g, '\\b')
                .replace(/"/g, '\\"');
        }
    };

    const extractStringsFromScript = (script) => {
        if (typeof script !== 'string') return [];
        const regex = /(['"`])((?:\\[\s\S]|(?!\1)[\s\S])*?)\1/g;
        const strings = [];
        let match;
        while ((match = regex.exec(script)) !== null) {
            const quoteChar = match[1];
            let inner = match[2]
                .replace(/\\n/g, '\n')
                .replace(/\\\\/g, '\\')
                .replace(/\\'/g, "'")
                .replace(/\\"/g, '"')
                .replace(/\\`/g, '`')
                .replace(/\\\\c\[(\d+)\]/g, '\\c[$1]');
            
            const trimmed = inner.trim();
            const fullQuoted = match[0];

            if (trimmed && 
                !trimmed.startsWith('\\c[') && 
                !trimmed.includes('addText') &&
                trimmed.length > 5 &&
                !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(trimmed)
            ) {
                strings.push({
                    text: trimmed,
                    fullQuoted: fullQuoted,
                    quoteChar: quoteChar
                });
            }
        }
        return strings;
    };

    const extractFromDatabase = (data, fileIndex, startId, fileName) => {
        console.log(`Extracting from ${fileName}:`, { type: typeof data, isArray: Array.isArray(data), keys: data ? Object.keys(data) : [] });
        let currentId = startId;
        const entries = [];

        let processData = data;
        if (!Array.isArray(data) && data && typeof data === 'object') {
            if (data.data && Array.isArray(data.data)) {
                processData = data.data;
                console.log(`Using wrapped data.data for ${fileName}`);
            } else if (data.contents && Array.isArray(data.contents)) {
                processData = data.contents;
                console.log(`Using wrapped data.contents for ${fileName}`);
            } else {
                console.warn(`Data for ${fileName} is not array:`, Object.keys(data));
                processData = data;
            }
        }

        const pushEntry = (text, refObj, paramIndex, extra = null) => {
            if (typeof text === "string" && text.trim() !== "") {
                console.log(`Pushed entry from ${fileName}: "${text.substring(0, 50)}..."`);
                const entry = {
                    id: currentId++,
                    fileIndex: fileIndex,
                    ref: refObj,
                    index: paramIndex,
                    original: text.trim(),
                    fileName: fileName
                };
                if (extra) {
                    entry.extra = extra;
                }
                entries.push(entry);
            }
        };

        if (fileName === 'Actors.json') {
            processData.forEach((actor, idx) => {
                if (!actor || typeof actor !== 'object') return;
                ['name', 'nickname', 'profile'].forEach(field => {
                    const val = actor[field];
                    if (typeof val === 'string' && val.trim()) {
                        pushEntry(val, actor, field);
                    }
                });
            });
        } else if (fileName === 'Armors.json' || fileName === 'Items.json') {
            processData.forEach((item, idx) => {
                if (!item || typeof item !== 'object') return;
                ['name', 'description'].forEach(field => {
                    const val = item[field];
                    if (typeof val === 'string' && val.trim()) {
                        pushEntry(val, item, field);
                    }
                });
            });
        } else if (fileName === 'Skills.json') {
            processData.forEach((skill, idx) => {
                if (!skill || typeof skill !== 'object') return;
                ['name', 'description', 'message'].forEach(field => {
                    const val = skill[field];
                    if (typeof val === 'string' && val.trim()) {
                        pushEntry(val, skill, field);
                    }
                });
            });
        } else if (fileName === 'System.json') {
            const sys = processData;
            console.log('System.json keys:', Object.keys(sys));

            const simpleStrings = ['gameTitle', 'currencyUnit', 'version', 'gameId'];
            simpleStrings.forEach(field => {
                if (typeof sys[field] === 'string' && sys[field].trim()) {
                    pushEntry(sys[field], sys, field);
                }
            });

            const simpleArrays = ['armorTypes', 'elements', 'equipTypes', 'skillTypes', 'switches', 'params', 'variables', 'weaponTypes'];
            simpleArrays.forEach(arrKey => {
                console.log(`Checking array ${arrKey}:`, Array.isArray(sys[arrKey]) ? sys[arrKey].length : 0);
                if (Array.isArray(sys[arrKey])) {
                    sys[arrKey].forEach((str, strIdx) => {
                        if (typeof str === 'string' && str.trim()) {
                            pushEntry(str, sys[arrKey], strIdx);
                        }
                    });
                }
            });

            if (Array.isArray(sys.commands)) {
                console.log('Commands array length:', sys.commands.length);
                sys.commands.forEach((cmd, idx) => {
                    if (typeof cmd === 'string' && cmd.trim()) {
                        pushEntry(cmd, sys.commands, idx);
                    }
                });
            }

            if (sys.messages && typeof sys.messages === 'object') {
                console.log('Messages keys:', Object.keys(sys.messages));
                Object.keys(sys.messages).forEach(key => {
                    if (typeof sys.messages[key] === 'string' && sys.messages[key].trim()) {
                        pushEntry(sys.messages[key], sys.messages, key);
                    }
                });
            }

            if (sys.terms && typeof sys.terms === 'object') {
                console.log('Terms subkeys:', Object.keys(sys.terms));
                Object.keys(sys.terms).forEach(subKey => {
                    const sub = sys.terms[subKey];
                    if (typeof sub === 'object' && sub !== null) {
                        Object.keys(sub).forEach(key => {
                            if (typeof sub[key] === 'string' && sub[key].trim()) {
                                pushEntry(sub[key], sub, key);
                            }
                        });
                    }
                });
            }
        }

        console.log(`Extracted ${entries.length} entries from ${fileName}`);
        return entries;
    };

    const extractFromObject = (data, fileIndex, startId) => {
        let currentId = startId;
        const entries = [];

        const pushEntry = (text, refObj, paramIndex, extra = null) => {
            if (typeof text === "string" && text.trim() !== "") {
                const entry = {
                    id: currentId++,
                    fileIndex: fileIndex,
                    ref: refObj,
                    index: paramIndex,
                    original: text.trim(),
                    fileName: filesData[fileIndex]?.name || ""
                };
                if (extra) {
                    entry.extra = extra;
                }
                entries.push(entry);
            }
        };

        const traverse = (obj) => {
            if (!obj || typeof obj !== "object") return;

            if (obj.code && Array.isArray(obj.parameters)) {
                
                if (excludedCodes.has(obj.code)) {
                    console.log(`Skip code excluded: ${obj.code} (${getCodeName(obj.code)})`);
                    return;
                }

                if (obj.code === CMD_SHOW_TEXT || obj.code === CMD_SCROLL_TEXT) {
                    const messageContent = obj.parameters[0];
                    if (Array.isArray(messageContent)) {
                        messageContent.forEach((line, lineIdx) => {
                            if (typeof line === 'string' && line.trim() !== '') {
                                pushEntry(line, messageContent, lineIdx);
                            }
                        });
                    } else if (typeof messageContent === 'string' && messageContent.trim() !== '') {
                        pushEntry(messageContent, obj.parameters, 0);
                    }
                } else if (obj.code === CMD_SCRIPT) {
                    const scriptTexts = extractStringsFromScript(obj.parameters[0]);
                    scriptTexts.forEach(({text, fullQuoted, quoteChar}, subIdx) => {
                        pushEntry(text, obj.parameters[0], 0, {fullQuoted, quoteChar});
                    });
                } else if (obj.code === CMD_SHOW_CHOICES) {
                    if (Array.isArray(obj.parameters[0])) {
                        obj.parameters[0].forEach((choice, choiceIdx) => {
                            let choiceText = '';
                            let extra = null;
                            if (typeof choice === 'string') {
                                choiceText = choice;
                            } else if (Array.isArray(choice) && choice.length > 0 && typeof choice[0] === 'string') {
                                choiceText = choice[0];
                                extra = { type: 'choice', value: choice[1] || null, wasArray: true };
                            }
                            if (choiceText) {
                                pushEntry(choiceText, obj.parameters[0], choiceIdx, extra);
                            }
                        });
                    }
                } else if (obj.code === CMD_WHEN_CHOICE) {
                    if (obj.parameters.length > 1 && typeof obj.parameters[1] === 'string') {
                        pushEntry(obj.parameters[1], obj.parameters, 1);
                    }
                } else if (obj.code === CMD_CUSTOM_TEXT_108) {
                    if (obj.parameters.length > 0 && typeof obj.parameters[0] === 'string') {
                        pushEntry(obj.parameters[0], obj.parameters, 0);
                    }
                } else if (obj.code === CMD_CUSTOM_NAME_408) {
                    if (obj.parameters.length > 0 && typeof obj.parameters[0] === 'string') {
                        pushEntry(obj.parameters[0], obj.parameters, 0);
                    }
                } else if (obj.code === CMD_CHANGE_PROFILE) {
                    if (obj.parameters.length > 1 && typeof obj.parameters[1] === 'string') {
                        pushEntry(obj.parameters[1], obj.parameters, 1);
                    }
                } else {
                    console.log(`The code was not processed: ${obj.code} (not a text command)`);
                }
            }
            
            if (Array.isArray(obj)) {
                obj.forEach(item => traverse(item));
            } else {
                Object.values(obj).forEach(val => traverse(val));
            }
        };

        traverse(data);
        return entries;
    };

    const handleFileUpload = async (e) => {
        const files = Array.from(e.target.files);
        if (!files || files.length === 0) return;
        setStatus(`Reading ${files.length} file...`);
        console.log('Uploading files:', files.map(f => f.name));

        const readPromises = files.map(file => {
            return new Promise((resolve) => {
                const reader = new FileReader();
                reader.onload = (event) => {
                    try {
                        let content = event.target.result;
                        if (content.charCodeAt(0) === 0xFEFF) {
                            content = content.substring(1);
                        }
                        const json = JSON.parse(content);
                        console.log(`Parsed ${file.name} successfully, type: ${typeof json}, isArray: ${Array.isArray(json)}`);
                        resolve({ name: file.name, json });
                    } catch (err) {
                        console.error(`Parse error ${file.name}:`, err, event.target.result.substring(0, 100));
                        resolve({ name: file.name, json: null, error: true, errMsg: err.message });
                    }
                };
                reader.readAsText(file, 'utf-8');
            });
        });

        try {
            const results = await Promise.all(readPromises);
            const validFiles = results.filter(f => !f.error && f.json);
            const errorFiles = results.filter(f => f.error);

            if (errorFiles.length > 0) {
                const errorMsg = `Parse error: ${errorFiles.map(f => f.name).join(', ')}. Check the UTF-8 encoding or JSON structure.`;
                setStatus(errorMsg);
                console.error(errorMsg);
                if (validFiles.length === 0) return;
            }

            if (validFiles.length === 0) {
                setStatus("No valid JSON file found. Check the console for debugging.");
                return;
            }

            setFilesData(validFiles);
            let allEntries = [];
            let globalIdCounter = 0;

            validFiles.forEach((fileData, index) => {
                try {
                    let entries;
                    if (SPECIAL_FILES.has(fileData.name)) {
                        entries = extractFromDatabase(fileData.json, index, globalIdCounter, fileData.name);
                    } else {
                        entries = extractFromObject(fileData.json, index, globalIdCounter);
                    }
                    console.log(`Entries from ${fileData.name}: ${entries.length}`);
                    if (entries.length > 0) {
                        globalIdCounter = entries[entries.length - 1].id + 1;
                        allEntries = allEntries.concat(entries);
                    }
                } catch (err) {
                    console.error(`Extract error from ${fileData.name}:`, err);
                    setStatus(`Content processing error ${fileData.name}: ${err.message}. Check console.`);
                }
            });

            if (allEntries.length === 0) {
                setStatus("No text could be extracted. Check the JSON structure (it should be an array for database files) and console logs.");
                return;
            }

            const textToEntries = new Map();
            allEntries.forEach(e => {
                const key = e.original;
                if (!textToEntries.has(key)) {
                    textToEntries.set(key, []);
                }
                textToEntries.get(key).push(e);
            });

            const unique = Array.from(textToEntries.values()).map(group => group[0]);

            setTextEntries(unique);
            setTextGroups(textToEntries);

            const textBlock = unique
                .map(entry => `---------${entry.id}\n${entry.original}`)
                .join('\n');

            setDisplayText(textBlock);

            setStatus(`Loaded ${validFiles.length} file. Total ${allEntries.length} dialog line(s) (unique: ${unique.length}).${errorFiles.length > 0 ? ` (Skip ${errorFiles.length} error file(s))` : ''}`);
            e.target.value = null;

        } catch (err) {
            const errorMsg = `File processing error: ${err.message}`;
            setStatus(errorMsg);
            console.error(errorMsg, err);
        }
    };

    const handleDownloadTxt = () => {
        if (!displayText) return;
        const name = filesData.length === 1
            ? filesData[0].name.replace('.json', '.txt')
            : "merged_text.txt";
        downloadFile(name, displayText, "text/plain");
        setStatus("TXT extracted.");
    };

    const triggerTxtUpload = () => txtInputRef.current?.click();

    const handleUploadTxt = (e) => {
        const uploadedTxt = e.target.files[0];
        if (!uploadedTxt) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            setDisplayText(event.target.result);
            setStatus("Loaded TXT.");
            e.target.value = "";
        };
        reader.readAsText(uploadedTxt, 'utf-8');
    };

    const handleSaveJson = async () => {
        if (filesData.length === 0 || textEntries.length === 0) return;

        try {
            const blocks = displayText.split(/(?=---------\d+)/g);
            let updatedCount = 0;

            blocks.forEach(block => {
                const match = block.match(/^---------(\d+)\s*([\s\S]*)/);
                if (match) {
                    const id = parseInt(match[1]);
                    let newText = match[2].trim();
                    const uniqueEntry = textEntries.find(e => e.id === id);
                    if (uniqueEntry && newText !== uniqueEntry.original) {
                        const allMatchingEntries = textGroups.get(uniqueEntry.original) || [];
                        allMatchingEntries.forEach(entry => {
                            if (entry.extra && entry.extra.fullQuoted) {
                                const script = entry.ref;
                                if (typeof script === 'string') {
                                    const escapedInner = escapeForJS(newText, entry.extra.quoteChar);
                                    const newQuoted = entry.extra.quoteChar + escapedInner + entry.extra.quoteChar;
                                    entry.ref = script.replace(entry.extra.fullQuoted, newQuoted);
                                }
                            } else if (entry.extra && entry.extra.type === 'choice') {
                                entry.ref[entry.index] = entry.extra.wasArray ? [newText, entry.extra.value] : newText;
                            } else {
                                if (typeof entry.index === 'string' || typeof entry.index === 'number') {
                                    entry.ref[entry.index] = newText;
                                }
                            }
                        });
                        updatedCount += allMatchingEntries.length;
                    }
                }
            });

            if (filesData.length === 1) {
                downloadFile(`edited_${filesData[0].name}`, JSON.stringify(filesData[0].json, null, 2), 'application/json; charset=utf-8');
                setStatus(`JSON Saved. ${updatedCount} line(s) updated (all instances).`);
            } else {
                const zip = new JSZip();
                filesData.forEach(file => {
                    zip.file(file.name, JSON.stringify(file.json, null, 2));
                });
                const content = await zip.generateAsync({ type: "blob" });
                const element = document.createElement("a");
                element.href = URL.createObjectURL(content);
                element.download = "edited_rpg_files.zip";
                document.body.appendChild(element);
                element.click();
                document.body.removeChild(element);

                setStatus(`ZIP Saved. ${updatedCount} line(s) updated (all instances).`);
            }

        } catch (err) {
            setStatus("JSON Save error: " + err.message);
            console.error(err);
        }
    };

        return (
            <div className="card cyber-grid">
                <div className="form-group">
                    <div className="form-group">
                        <h2>STEP 1: EXTRACTION & PACKAGING</h2>
                    </div>
                    <label className="label">{filesData.length} file(s) is open.</label>
                </div>
 
                <div className="form-group">
                    {/* Upload Area */}
                    <div className="form-group">
                         <label htmlFor="json-upload" className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-8 rounded-full cursor-pointer inline-flex items-center gap-3 shadow-lg transition transform hover:-translate-y-1">
                            <i className="fas fa-folder-open"></i>
                            <span>SELECT ORIGINAL JSON FILE(s)</span>
                         <input id="json-upload" type="file" accept=".json" multiple onChange={handleFileUpload} />
                        </label>
                        <p style={{ textAlign: "center", fontSize: "13px", color: "#666", marginBottom: "20px" }}>Select multiple files (hold Ctrl) from the game data folder (Actors.json, Armors.json, Items.json, CommonEvents.json, MapXXX.json, Skills.json, System.json)</p>
                         {filesData.length > 0 && (
                            <div className="tab-bar">
                                {filesData.map((f, i) => <span key={i} className="tab">{f.name}</span>)}
                            </div>
                        )}
                    </div>
 
                    {/* Editor & Tools */}
                    <div className="form-group">
                        <div className="form-group">
                        <textarea
                            value={displayText}
                            onChange={(e) => setDisplayText(e.target.value)}
                            className={`editor-textarea w-full h-[500px] p-4 text-sm text-gray-800 bg-transparent focus:bg-white focus:outline-none transition ${isWordWrap ? 'wrap-on' : 'wrap-off'}`}
                            placeholder="The JSON data will appear here..."
                            spellCheck="false"
                        />
                            <div className="button-group" style={{
                                display: "grid",
                                gridTemplateColumns: "1fr 1fr",
                                gap: "20px",
                                textAlign: "center"
                            }}>
                                <button onClick={handleDownloadTxt} className="p-2 hover:bg-purple-100 text-gray-600 hover:text-purple-700 rounded transition" title="1. Export to TXT for translation">
                                    <i className="fas fa-file-export fa-lg"></i>
                                </button>
                                <button onClick={triggerTxtUpload} className="p-2 hover:bg-green-100 text-gray-600 hover:text-green-700 rounded transition" title="2. Import translated TXT">
                                    <i className="fas fa-file-import fa-lg"></i>
                                </button>
                            </div>
                            <input type="file" accept=".txt" ref={txtInputRef} onChange={handleUploadTxt} className="hidden" />
                        </div>
                    </div>
 
                    {/* Footer Controls */}
                    <div className="form-group">
                        <div className="form-group">
                            <span className="log-container" style={{textAlign: "center", marginBottom: "12px", display: "block"}}>{status || "Waiting file..."}</span>
                            <label className="custom-checkbox">
                                <input type="checkbox" checked={isWordWrap} onChange={(e) => setIsWordWrap(e.target.checked)} />
                                <span class="checkmark"></span>
                                <span>Word Wrap</span>
                            </label>
                        </div>
                        <button 
                            onClick={handleSaveJson}
                            disabled={filesData.length === 0}
                            className={`font-bold py-2 px-6 rounded shadow flex items-center gap-2 ${filesData.length === 0 ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700 text-white'}`}
                        >
                            <i className="fas fa-save"></i>
                            <span>{filesData.length > 1 ? " SAVE ZIP (DONE)" : " SAVE JSON (DONE)"}</span>
                        </button>
                    </div>
                </div>
            </div>
        );
    }
 
    const root = ReactDOM.createRoot(document.getElementById('react-root'));
    root.render(<App />);