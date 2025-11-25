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

