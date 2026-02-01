const el = (id) => document.getElementById(id)

const ui = {
  token: el("token"),
  toggleToken: el("toggleToken"),
  owner: el("owner"),
  repo: el("repo"),
  branch: el("branch"),
  basePath: el("basePath"),
  message: el("message"),
  pickFiles: el("pickFiles"),
  pickFolder: el("pickFolder"),
  filesInput: el("filesInput"),
  folderInput: el("folderInput"),
  uploadBtn: el("uploadBtn"),
  clearBtn: el("clearBtn"),
  dropzone: el("dropzone"),
  fileList: el("fileList"),
  warnings: el("warnings"),
  status: el("status"),
  selectedCount: el("selectedCount"),
  selectedBytes: el("selectedBytes")
}

ui.filesInput.accept = "*/*"
ui.folderInput.accept = "*/*"
ui.folderInput.setAttribute("webkitdirectory", "")
ui.folderInput.setAttribute("directory", "")

let tokenVisible = false
let busy = false
let selected = new Map()

function normalizeRepoPath(input) {
  const raw = String(input || "").replace(/\\/g, "/").trim()
  const parts = raw.split("/").filter(Boolean)
  const safe = []
  for (const p of parts) {
    if (p === "." || p === "..") continue
    safe.push(p.replace(/\u0000/g, ""))
  }
  return safe.join("/")
}

function joinRepoPath(a, b) {
  const left = normalizeRepoPath(a)
  const right = normalizeRepoPath(b)
  if (!left) return right
  if (!right) return left
  return left + "/" + right
}

function formatBytes(bytes) {
  const units = ["B", "KB", "MB", "GB"]
  let v = bytes
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(i === 0 ? 0 : 2)} ${units[i]}`
}

function fileRelPath(file) {
  const rel = file.webkitRelativePath ? String(file.webkitRelativePath) : ""
  return normalizeRepoPath(rel || file.name)
}

function addFiles(fileList) {
  const arr = Array.from(fileList || [])
  for (const f of arr) {
    const path = fileRelPath(f)
    if (!path) continue
    selected.set(path, f)
  }
  render()
}

function clearFiles() {
  selected = new Map()
  render()
}

function removeFile(path) {
  selected.delete(path)
  render()
}

function computeTotals() {
  let bytes = 0
  for (const f of selected.values()) bytes += f.size || 0
  return { count: selected.size, bytes }
}

function setWarnings() {
  const items = Array.from(selected.entries());
  const tooBig = items.filter(([, f]) => (f.size || 0) > 100 * 1024 * 1024);
  const big = items.filter(([, f]) => (f.size || 0) > 25 * 1024 * 1024 && (f.size || 0) <= 100 * 1024 * 1024);
  const many = items.length >= 200;

  ui.warnings.replaceChildren();

  const warnings = [];
  if (tooBig.length) warnings.push({ n: tooBig.length, tail: ' file(s) exceed 100 MB and will likely fail on GitHub API uploads.' });
  if (big.length) warnings.push({ n: big.length, tail: ' file(s) are above 25 MB. Uploading may be slow or fail depending on GitHub constraints.' });
  if (many) warnings.push({ n: items.length, tail: ' files selected. This will send many API requests and may hit rate limits.' });

  if (!warnings.length) {
    ui.warnings.classList.add("hidden");
    return;
  }

  for (const w of warnings) {
    const div = document.createElement("div");
    const strong = document.createElement("strong");
    strong.textContent = String(w.n);
    div.append(strong, document.createTextNode(w.tail));
    ui.warnings.appendChild(div);
  }

  ui.warnings.classList.remove("hidden");
}

function updateButtons() {
  const hasRepo = ui.owner.value.trim() && ui.repo.value.trim()
  const can = !busy && ui.token.value.trim() && hasRepo && selected.size > 0
  ui.uploadBtn.disabled = !can
  ui.clearBtn.disabled = busy || selected.size === 0
  ui.pickFiles.disabled = busy
  ui.pickFolder.disabled = busy
  ui.toggleToken.disabled = busy
}

function renderList() {
  const items = Array.from(selected.entries()).sort((a, b) => a[0].localeCompare(b[0]));

  if (!items.length) {
    ui.fileList.className = "list empty";
    ui.fileList.innerHTML = `
      <div class="emptyState">
        <div class="emptyIcon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none">
            <path d="M4 17.5V6.5A2.5 2.5 0 0 1 6.5 4H14l6 6v7.5A2.5 2.5 0 0 1 17.5 20h-11A2.5 2.5 0 0 1 4 17.5Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
            <path d="M14 4v6h6" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
          </svg>
        </div>
        <div class="emptyTitle">No files selected</div>
        <div class="emptySub">Choose files or a folder to begin.</div>
      </div>
    `;
    return;
  }

  ui.fileList.className = "list";
  ui.fileList.replaceChildren();

  const base = normalizeRepoPath(ui.basePath.value);
  const frag = document.createDocumentFragment();

  for (const [path, f] of items) {
    const finalPath = joinRepoPath(base, path);

    const row = document.createElement("div");
    row.className = "item";

    const main = document.createElement("div");
    main.className = "itemMain";

    const pathEl = document.createElement("div");
    pathEl.className = "itemPath";
    pathEl.title = finalPath;
    pathEl.textContent = finalPath;

    const meta = document.createElement("div");
    meta.className = "itemMeta";
    meta.textContent = formatBytes(f.size || 0);

    main.append(pathEl, meta);

    const btn = document.createElement("button");
    btn.className = "xbtn";
    btn.type = "button";
    btn.setAttribute("aria-label", "Remove");
    btn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none">
        <path d="M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        <path d="M18 6 6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      </svg>
    `;
    btn.addEventListener("click", () => removeFile(path));

    row.append(main, btn);
    frag.appendChild(row);
  }

  ui.fileList.appendChild(frag);
}

function renderTop() {
  const { count, bytes } = computeTotals()
  ui.selectedCount.textContent = String(count)
  ui.selectedBytes.textContent = formatBytes(bytes)
}

function render() {
  setWarnings()
  renderTop()
  renderList()
  updateButtons()
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;")
}

function setStatus({ variant, label, pct, message, link }) {
  ui.status.className = "status";
  ui.status.replaceChildren();

  const top = document.createElement("div");
  top.className = "statusTop";

  const lab = document.createElement("div");
  lab.className = "statusLabel";
  lab.title = String(label || "");
  lab.textContent = String(label || "");

  const pctEl = document.createElement("div");
  pctEl.className = "statusPct";
  pctEl.textContent = `${String(pct ?? 0)}%`;

  top.append(lab, pctEl);

  const bar = document.createElement("div");
  bar.className = "bar";
  const inner = document.createElement("div");
  inner.style.width = `${Math.max(0, Math.min(100, Number(pct) || 0))}%`;
  bar.appendChild(inner);

  ui.status.append(top, bar);

  if (message) {
    const msg = document.createElement("div");
    msg.className = "statusMsg";
    msg.textContent = String(message);
    ui.status.appendChild(msg);
  }

  if (link) {
    const a = document.createElement("a");
    a.className = "link";
    a.target = "_blank";
    a.rel = "noreferrer";

    const href = String(link);
    a.href = href.startsWith("https://") ? href : "#";
    a.textContent = "Open commit on GitHub";

    ui.status.appendChild(a);
  }

  if (variant === "ok") ui.status.classList.add("statusOk");
  if (variant === "bad") ui.status.classList.add("statusBad");
  ui.status.classList.remove("hidden");
}

function hideStatus() {
  ui.status.classList.add("hidden");
  ui.status.replaceChildren();
}

async function fileToBase64(file) {
  const dataUrl = await new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onerror = () => reject(new Error("Failed to read file"))
    r.onload = () => resolve(String(r.result || ""))
    r.readAsDataURL(file)
  })
  const idx = dataUrl.indexOf(",")
  if (idx < 0) throw new Error("Invalid file encoding")
  return dataUrl.slice(idx + 1)
}

async function request(token, path, init) {
  const res = await fetch("https://api.github.com" + path, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      Authorization: `Bearer ${token}`,
      ...(init && init.headers ? init.headers : {})
    },
    cache: "no-store"
  })
  if (res.ok) return await res.json()
  let msg = `GitHub API error (${res.status})`
  try {
    const j = await res.json()
    if (j && j.message) msg = j.message
  } catch {}
  throw new Error(msg)
}

async function getDefaultBranch(token, owner, repo) {
  const info = await request(token, `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`)
  return info.default_branch
}

async function tryGetHeadSha(token, owner, repo, branch) {
  try {
    const ref = await request(
      token,
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/ref/heads/${encodeURIComponent(branch)}`
    )
    return ref.object.sha
  } catch (e) {
    const m = String(e && e.message ? e.message : "")
    if (m.toLowerCase().includes("not found")) return null
    throw e
  }
}

async function getCommit(token, owner, repo, sha) {
  return await request(
    token,
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/commits/${encodeURIComponent(sha)}`
  )
}

async function createBlob(token, owner, repo, base64) {
  return await request(token, `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/blobs`, {
    method: "POST",
    body: JSON.stringify({ content: base64, encoding: "base64" })
  })
}

async function createTree(token, owner, repo, baseTreeSha, items) {
  const tree = items.map((i) => ({ path: i.path, mode: "100644", type: "blob", sha: i.sha }))
  const body = baseTreeSha ? { base_tree: baseTreeSha, tree } : { tree }
  return await request(token, `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees`, {
    method: "POST",
    body: JSON.stringify(body)
  })
}

async function createCommit(token, owner, repo, message, treeSha, parentSha) {
  const body = parentSha ? { message, tree: treeSha, parents: [parentSha] } : { message, tree: treeSha, parents: [] }
  return await request(token, `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/commits`, {
    method: "POST",
    body: JSON.stringify(body)
  })
}

async function updateRef(token, owner, repo, branch, sha) {
  return await request(
    token,
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/refs/heads/${encodeURIComponent(branch)}`,
    { method: "PATCH", body: JSON.stringify({ sha, force: false }) }
  )
}

async function createRef(token, owner, repo, branch, sha) {
  return await request(token, `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/refs`, {
    method: "POST",
    body: JSON.stringify({ ref: `refs/heads/${branch}`, sha })
  })
}

async function asyncPool(limit, array, iterator) {
  const ret = []
  const executing = []
  for (const item of array) {
    const p = Promise.resolve().then(() => iterator(item))
    ret.push(p)
    if (limit <= array.length) {
      const e = p.then(() => executing.splice(executing.indexOf(e), 1))
      executing.push(e)
      if (executing.length >= limit) await Promise.race(executing)
    }
  }
  return Promise.all(ret)
}

async function upload() {
  const token = ui.token.value.trim()
  const owner = ui.owner.value.trim()
  const repo = ui.repo.value.trim()
  const msg = ui.message.value.trim() || "Upload via GitHub Uploader"
  let branch = ui.branch.value.trim()
  const base = normalizeRepoPath(ui.basePath.value)

  if (!token || !owner || !repo || selected.size === 0) return

  busy = true
  render()
  hideStatus()

  const files = Array.from(selected.entries())
    .map(([path, file]) => ({ path: joinRepoPath(base, path), file }))
    .sort((a, b) => a.path.localeCompare(b.path))

  try {
    if (!branch) branch = await getDefaultBranch(token, owner, repo)

    setStatus({ variant: "info", label: `Preparing (${files.length} files)`, pct: 5, message: "" })

    const headSha = await tryGetHeadSha(token, owner, repo, branch)
    let baseTreeSha = null
    if (headSha) {
      const headCommit = await getCommit(token, owner, repo, headSha)
      baseTreeSha = headCommit.tree.sha
    }

    const maxPct = 80
    let done = 0

    const makeBlob = async ({ path, file }) => {
      const b64 = await fileToBase64(file)
      const blob = await createBlob(token, owner, repo, b64)
      done += 1
      const pct = 10 + Math.round((done / files.length) * maxPct)
      setStatus({
        variant: "info",
        label: `Uploading (${done}/${files.length}) ${path}`,
        pct,
        message: ""
      })
      return { path, sha: blob.sha }
    }

    const blobItems = await asyncPool(3, files, makeBlob)

    setStatus({ variant: "info", label: "Building tree", pct: 92, message: "" })
    const tree = await createTree(token, owner, repo, baseTreeSha, blobItems)

    setStatus({ variant: "info", label: "Creating commit", pct: 96, message: "" })
    const commit = await createCommit(token, owner, repo, msg, tree.sha, headSha)

    setStatus({ variant: "info", label: "Updating branch", pct: 98, message: "" })
    if (headSha) await updateRef(token, owner, repo, branch, commit.sha)
    else await createRef(token, owner, repo, branch, commit.sha)

    const link = `https://github.com/${owner}/${repo}/commit/${commit.sha}`
    setStatus({
      variant: "ok",
      label: "Done",
      pct: 100,
      message: `Commit SHA: <span style="font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace">${escapeHtml(commit.sha)}</span>`,
      link
    })
  } catch (e) {
    setStatus({
      variant: "bad",
      label: "Upload failed",
      pct: 100,
      message: escapeHtml(String(e && e.message ? e.message : "Unknown error"))
    })
  } finally {
    busy = false
    render()
  }
}

ui.toggleToken.addEventListener("click", () => {
  tokenVisible = !tokenVisible
  ui.token.type = tokenVisible ? "text" : "password"
  ui.toggleToken.lastChild.textContent = tokenVisible ? "Hide" : "Show"
})

ui.pickFiles.addEventListener("click", () => ui.filesInput.click())
ui.pickFolder.addEventListener("click", () => ui.folderInput.click())
ui.filesInput.addEventListener("change", (e) => e.target.files && addFiles(e.target.files))
ui.folderInput.addEventListener("change", (e) => e.target.files && addFiles(e.target.files))

ui.clearBtn.addEventListener("click", clearFiles)
ui.uploadBtn.addEventListener("click", upload)

for (const input of [ui.token, ui.owner, ui.repo, ui.branch, ui.basePath, ui.message]) {
  input.addEventListener("input", () => render())
}

ui.dropzone.addEventListener("click", () => ui.filesInput.click())
ui.dropzone.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") ui.filesInput.click()
})

ui.dropzone.addEventListener("dragenter", (e) => {
  e.preventDefault()
  ui.dropzone.classList.add("drag")
})
ui.dropzone.addEventListener("dragover", (e) => {
  e.preventDefault()
  ui.dropzone.classList.add("drag")
})
ui.dropzone.addEventListener("dragleave", () => ui.dropzone.classList.remove("drag"))
ui.dropzone.addEventListener("drop", (e) => {
  e.preventDefault()
  ui.dropzone.classList.remove("drag")
  const dt = e.dataTransfer
  if (dt && dt.files && dt.files.length) addFiles(dt.files)
})

render()