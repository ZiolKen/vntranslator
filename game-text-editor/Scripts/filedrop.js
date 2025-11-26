    const dropZone = document.getElementById("dropZone");
    const fileInput = document.getElementById("fileupload");

    dropZone.addEventListener("click", () => fileInput.click());

    dropZone.addEventListener("dragover", (e) => {
        e.preventDefault();
        dropZone.classList.add("dragover");
    });

    dropZone.addEventListener("dragleave", () => {
        dropZone.classList.remove("dragover");
    });

    fileInput.setAttribute("multiple", "multiple");

    dropZone.addEventListener("drop", (e) => {
        e.preventDefault();
        dropZone.classList.remove("dragover");

        fileInput.files = e.dataTransfer.files;

        const evt = new Event("change");
        fileInput.dispatchEvent(evt);
    });

    // ===================================
    // HANDLE MULTI FILE UPLOAD
    // ===================================

    fileupload.addEventListener("change", async function (e) {
        if (!fileupload.files || fileupload.files.length === 0) {
            console.log("User canceled file dialog.");
            PreLoadOff();
            return;
        }

        const fd = new FormData();
        for (const f of fileupload.files) {
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

        dropZone.addEventListener("drop", async function (e) {
            e.preventDefault();
            dropZone.classList.remove("drag-over");

            const items = e.dataTransfer.items;
            if (!items) return;

            const files = await getFilesFromItems(items);
            handleMultiFileUpload(files);
        });

        async function getFilesFromItems(items) {
            let result = [];

            async function traverseEntry(entry, path = "") {
                return new Promise(resolve => {
                    if (entry.isFile) {
                        entry.file(file => {
                            file.fullPath = path + file.name;
                            result.push(file);
                            resolve();
                        });
                    } else if (entry.isDirectory) {
                        const reader = entry.createReader();
                        reader.readEntries(async entries => {
                            for (const e of entries) {
                                await traverseEntry(e, path + entry.name + "/");
                            }
                            resolve();
                        });
                    }
                });
            }

            for (const item of items) {
                const entry = item.webkitGetAsEntry();
                if (entry) await traverseEntry(entry);
            }

            return result;
        }

        async function handleMultiFileUpload(fileList) {
            if (!fileList || fileList.length === 0) return;

            const fd = new FormData();
            for (const f of fileList) {
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
        }
    });
