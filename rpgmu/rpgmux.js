    const { useState, useEffect, useRef } = React;
 
    const RPGMVMZ_CODE_TABLE = {
        101: "Show Text",
        102: "Choices",
        103: "Number Input",
        104: "Select Item",
        105: "Scrolling Text",
        108: "Comment",
        109: "Skip",
        111: "If ...",
        112: "Loop ...",
        113: "Loop Break",
        115: "Exit Event",
        117: "Common Event",
        118: "Label",
        119: "Jump to Label",
        121: "Switch Control",
        122: "Variable Control",
        123: "Self Switch Control",
        124: "Timer Control",
        125: "Gold Change",
        126: "Item Change",
        127: "Weapon Change",
        128: "Armor Change",
        129: "Party Change",
        132: "Battle BGM Change",
        133: "Victory ME Change",
        134: "Save Access Change",
        135: "Menu Access Change",
        136: "Encounter Change",
        137: "Formation Access Change",
        138: "Window Color Change",
        139: "Defeat ME Change",
        140: "Vehicle BGM Change",
        201: "Transfer Player",
        202: "Set Vehicle Location",
        203: "Set Event Location",
        204: "Scroll Map",
        205: "Set Movement Route",
        206: "Toggle Vehicle",
        211: "Transparency Change",
        212: "Show Animation",
        213: "Show Balloon Icon",
        214: "Erase Event",
        216: "Change Player Followers",
        217: "Gather Followers",
        221: "Fadeout Screen",
        222: "Fadein Screen",
        223: "Tint Screen",
        224: "Flash Screen",
        225: "Shake Screen",
        230: "Wait",
        231: "Show Picture",
        232: "Move Picture",
        233: "Rotate Picture",
        234: "Tint Picture",
        235: "Erase Picture",
        236: "Set Weather",
        241: "Play BGM",
        242: "Fadeout BGM",
        243: "Save BGM",
        244: "Resume BGM",
        245: "Play BGS",
        246: "Fadeout BGS",
        249: "Play ME",
        250: "Play SE",
        251: "Stop SE",
        261: "Play Movie",
        281: "Map Name Display Change",
        282: "Tileset Change",
        283: "Battle Background Change",
        284: "Parallax Change",
        285: "Get Location Info",
        301: "Battle Processing",
        302: "Shop Processing",
        303: "Name Input Processing",
        311: "HP Change",
        312: "MP Change",
        313: "State Change",
        314: "Recover All",
        315: "EXP Change",
        316: "LVL Change",
        317: "Parameter Change",
        318: "Skill Change",
        319: "Equipment Change",
        320: "Name Change",
        321: "Class Change",
        322: "Actor Image Change",
        323: "Vehicle Image Change",
        324: "Nickname Change",
        325: "Profile Change",
        326: "TP Change",
        331: "Enemy HP Change",
        332: "Enemy MP Change",
        333: "Enemy State Change",
        334: "Enemy Recover All",
        335: "Enemy Appear",
        336: "Enemy Transform",
        337: "Show Battle Animation",
        339: "Force Action",
        340: "Abort Battle",
        342: "Enemy TP Change",
        351: "Open Menu Screen",
        352: "Open Save Screen",
        353: "Game Over",
        354: "Return to Title Screen",
        355: "Script",
        356: "Plugin Command (MV)",
        357: "Plugin Command (MZ)",
        401: "Text Line",
        402: "When ...",
        403: "When Cancel",
        405: "Scrolling Line",
        408: "Comment Line",
        411: "Else ...",
        413: "Repeat above...",
        601: "If Battle Win",
        602: "If Battle Escape",
        603: "If Battle Lose",
        655: "Script Line",
    };
 
    const downloadFile = (filename, content, type = 'application/json') => {
        const element = document.createElement('a');
        const file = new Blob([content], {type: type});
        element.href = URL.createObjectURL(file);
        element.download = filename;
        document.body.appendChild(element);
        element.click();
        document.body.removeChild(element);
    };
 
    function App() {
        const [filesData, setFilesData] = useState([]);
        const [textEntries, setTextEntries] = useState([]); 
        const [displayText, setDisplayText] = useState("");
        const [status, setStatus] = useState("");
        const [isWordWrap, setIsWordWrap] = useState(false);
        const txtInputRef = useRef(null);
 
        const extractFromObject = (data, fileIndex, startId) => {
            let currentId = startId;
            const entries = [];
            const traverse = (obj) => {
                if (!obj || typeof obj !== 'object') return;
                if (obj.code && Array.isArray(obj.parameters)) {
                    let text = null;
                    let paramIndex = -1;
                    const cmdName = RPGMVMZ_CODE_TABLE[obj.code] || obj.code.toString();
                    if (obj.code === 101 || obj.code === 105) {
                        const texts = obj.parameters[0] || [];
                        texts.forEach((t, subIdx) => {
                            if (typeof t === 'string' && t.trim() !== "") {
                                entries.push({
                                    id: currentId++,
                                    fileIndex: fileIndex,
                                    ref: obj.parameters[0],
                                    index: subIdx,
                                    original: t,
                                    code: obj.code,
                                    cmdName: cmdName,
                                    fileName: filesData[fileIndex]?.name || "" 
                                });
                            }
                        });
                    } else if (obj.code === 401 || obj.code === 108) {
                        text = obj.parameters[0];
                        paramIndex = 0;
                        if (text !== null && typeof text === 'string' && text.trim() !== "") {
                            entries.push({
                                id: currentId++,
                                fileIndex: fileIndex,
                                ref: obj.parameters,
                                index: paramIndex,
                                original: text,
                                code: obj.code,
                                cmdName: cmdName,
                                fileName: filesData[fileIndex]?.name || "" 
                            });
                        }
                    } else if (obj.code === 102) {
                        const choices = obj.parameters[0] || [];
                        choices.forEach((t, subIdx) => {
                            if (typeof t === 'string' && t.trim() !== "") {
                                entries.push({
                                    id: currentId++,
                                    fileIndex: fileIndex,
                                    ref: obj.parameters[0],
                                    index: subIdx,
                                    original: t,
                                    code: obj.code,
                                    cmdName: cmdName,
                                    fileName: filesData[fileIndex]?.name || "" 
                                });
                            }
                        });
                    } else if (obj.code === 402 || obj.code === 403) {
                        text = obj.parameters[1];
                        paramIndex = 1;
                        if (text !== null && typeof text === 'string' && text.trim() !== "") {
                            entries.push({
                                id: currentId++,
                                fileIndex: fileIndex,
                                ref: obj.parameters,
                                index: paramIndex,
                                original: text,
                                code: obj.code,
                                cmdName: cmdName,
                                fileName: filesData[fileIndex]?.name || "" 
                            });
                        }
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
            setStatus(`Reading ${files.length} file(s)...`);
            const readPromises = files.map(file => {
                return new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = (event) => {
                        try {
                            const json = JSON.parse(event.target.result);
                            resolve({ name: file.name, json: json });
                        } catch (err) {
                            resolve({ name: file.name, json: null, error: true });
                        }
                    };
                    reader.onerror = reject;
                    reader.readAsText(file);
                });
            });
 
            try {
                const results = await Promise.all(readPromises);
                const validFiles = results.filter(f => !f.error && f.json);
                if (validFiles.length === 0) { setStatus("Error: No valid JSON file."); return; }
                setFilesData(validFiles);
                let allEntries = [];
                let globalIdCounter = 0;
                validFiles.forEach((fileData, index) => {
                    const entries = extractFromObject(fileData.json, index, globalIdCounter);
                    if (entries.length > 0) {
                        globalIdCounter = entries[entries.length - 1].id + 1;
                        allEntries = allEntries.concat(entries);
                    }
                });
                setTextEntries(allEntries);
                const textBlock = allEntries.map(entry => `---------${entry.id} (${entry.cmdName})\n${entry.original}`).join('\n');
                setDisplayText(textBlock);
                setStatus(`Loaded ${validFiles.length} file(s). Total ${allEntries.length} dialog (including selection, scrolling text, comment, when...).`);
                e.target.value = null;
            } catch (err) { console.error(err); setStatus("File processing error."); }
        };
 
        const handleDownloadTxt = () => {
            if (!displayText) return;
            const name = filesData.length === 1 ? filesData[0].name.replace('.json', '.txt') : 'merged_text.txt';
            downloadFile(name, displayText, 'text/plain');
            setStatus("Exported .txt file! Use it in Step 2 below.");
        };
 
        const triggerTxtUpload = () => { if (txtInputRef.current) txtInputRef.current.click(); };
 
        const handleUploadTxt = (e) => {
            const uploadedTxt = e.target.files[0];
            if (!uploadedTxt) return;
            const reader = new FileReader();
            reader.onload = (event) => {
                setDisplayText(event.target.result);
                setStatus("TXT content has been loaded (Translation completed). Please click Save JSON.");
                e.target.value = '';
            };
            reader.readAsText(uploadedTxt);
        };
 
        const handleSaveJson = async () => {
            if (filesData.length === 0 || textEntries.length === 0) return;
            try {
                const rawText = displayText.trim();
                const blocks = rawText.split(/(?=---------\d+)/g);
                let updatedCount = 0;
                blocks.forEach(block => {
                    const match = block.match(/^---------(\d+)\s*\([^)]*\)\s*([\s\S]*)/);
                    if (match) {
                        const id = parseInt(match[1]);
                        let newText = match[2];
                        newText = newText.replace(/^\n/, '').replace(/\n$/, '');
                        const entry = textEntries.find(e => e.id === id);
                        if (entry) { 
                            entry.ref[entry.index] = newText; 
                            updatedCount++; 
                        }
                    }
                });
                if (filesData.length === 1) {
                    const jsonString = JSON.stringify(filesData[0].json, null, 2);
                    downloadFile(`edited_${filesData[0].name}`, jsonString);
                    setStatus(`JSON saved! Update ${updatedCount} line(s).`);
                } else {
                    setStatus("Zipping...");
                    const zip = new JSZip();
                    filesData.forEach(file => { zip.file(file.name, JSON.stringify(file.json, null, 2)); });
                    const content = await zip.generateAsync({type: "blob"});
                    const element = document.createElement('a');
                    element.href = URL.createObjectURL(content);
                    element.download = "edited_rpg_files.zip";
                    document.body.appendChild(element);
                    element.click();
                    document.body.removeChild(element);
                    setStatus(`ZIP saved! Update ${updatedCount} line(s).`);
                }
            } catch (err) { setStatus("Error saving file."); console.error(err); }
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
                        <p style={{ textAlign: "center", fontSize: "13px", color: "#666", marginBottom: "20px" }}>Select multiple files (hold Ctrl) from the game data folder (MapXXX.json, CommonEvents.json...)</p>
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
                            <textarea style={{height: "50px",}} readOnly>{status || "Waiting file..."}</textarea>
                            <label className="form-group">
                                <input type="checkbox" checked={isWordWrap} onChange={(e) => setIsWordWrap(e.target.checked)} className="rounded text-blue-500" />
                                Word Wrap
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