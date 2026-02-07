let API_BASE = "https://vntl-renpy-compiler.onrender.com";
{
  const u = new URL(location.href);
  const api = u.searchParams.get("api");
  if (api) API_BASE = api.replace(/\/$/, "");
}

const $ = (id) => document.getElementById(id);
const el = {
  mode: $("mode"),
  tryHarder: $("tryHarder"),
  runBtn: $("runBtn"),
  saveBtn: $("saveBtn"),
  zipBtn: $("zipBtn"),
  fileBtn: $("fileBtn"),
  inputTab: $("inputTab"),
  outputTab: $("outputTab"),
  search: $("search"),
  tree: $("tree"),
  drop: $("drop"),
  fileInput: $("fileInput"),
  folderInput: $("folderInput"),
  err: $("err"),
  logs: $("logs"),
  jobBadge: $("jobBadge"),
  activeFile: $("activeFile"),
  preview: $("preview"),
  tabs: $("tabs"),
  apiInfo: $("apiInfo"),
  selectedFolder: $("selectedFolder"),
  packWhere: $("packWhere"),
  packPath: $("packPath"),
  packName: $("packName"),
  packVersion: $("packVersion"),
  packKey: $("packKey"),
  packPadding: $("packPadding"),
  useSelectedBtn: $("useSelectedBtn"),
  repackBtn: $("repackBtn"),
  diffBtn: $("diffBtn"),
  mkdirBtn: $("mkdirBtn"),
  renameBtn: $("renameBtn"),
  deleteBtn: $("deleteBtn"),
};

function apiUrl(path) {
  if (!API_BASE) return path;
  return API_BASE + path;
}

el.apiInfo.textContent = API_BASE ? `API: ${API_BASE}` : "API: same-origin";

let state = {
  jobId: null,
  inputTree: null,
  outputTree: null,
  where: "output",
  selectedDir: null,
  selectedNode: null,
  active: null,
  tabs: [],
  tabOriginal: {},
  editorText: "",
  isText: false,
  showDiff: false,
};

function showError(msg) {
  el.err.hidden = !msg;
  el.err.textContent = msg || "";
}

function setLogs(lines) {
  el.logs.textContent = (lines && lines.length) ? lines.join("\n") : "No logs yet.";
}

function setJobBadge() {
  el.jobBadge.textContent = state.jobId ? `Job: ${state.jobId.slice(0, 8)}…` : "No job";
}

function setSelectedFolderBadge() {
  el.selectedFolder.textContent = state.selectedDir ? `${state.selectedDir.where}:${state.selectedDir.path || "/"}` : "none";
}

function diffLines(oldText, newText) {
  const a = (oldText || "").replace(/\r\n/g, "\n").split("\n");
  const b = (newText || "").replace(/\r\n/g, "\n").split("\n");
  const n = a.length, m = b.length;
  const dp = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = (a[i] === b[j]) ? 1 + dp[i + 1][j + 1] : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { out.push({ kind: "same", text: a[i] }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push({ kind: "del", text: a[i] }); i++; }
    else { out.push({ kind: "add", text: b[j] }); j++; }
  }
  while (i < n) out.push({ kind: "del", text: a[i++] });
  while (j < m) out.push({ kind: "add", text: b[j++] });
  return out;
}

function tabKey(where, path) { return where + ":" + path; }


function updateOpsButtons() {
  const hasJob = !!state.jobId;
  el.zipBtn.disabled = !hasJob || !state.outputTree;
  el.fileBtn.disabled = !hasJob || !state.active;
  el.saveBtn.disabled = !hasJob || !state.active || !state.isText;
  el.diffBtn.disabled = !hasJob || !state.active || !state.isText;
  el.renameBtn.disabled = !hasJob || !state.selectedNode;
  el.deleteBtn.disabled = !hasJob || !state.selectedNode;
  el.mkdirBtn.disabled = !hasJob;
}


function guessKind(path) {
  const m = /\.([a-z0-9]+)$/i.exec(path || "");
  const ext = m ? m[1].toLowerCase() : "";
  const text = ["rpy","py","txt","md","json","js","ts","yaml","yml","ini","cfg","xml","csv","log"];
  const img = ["png","jpg","jpeg","gif","webp","bmp","svg"];
  const aud = ["mp3","ogg","wav","flac","m4a","aac"];
  const vid = ["mp4","webm","mkv","mov"];
  if (text.includes(ext)) return "text";
  if (img.includes(ext)) return "image";
  if (aud.includes(ext)) return "audio";
  if (vid.includes(ext)) return "video";
  return "binary";
}

async function createJob(files) {
  const fd = new FormData();
  for (const f of files) fd.append("files", f, f.webkitRelativePath || f.name);

  const res = await fetch(apiUrl("/api/jobs"), { method: "POST", body: fd });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function processJob(mode) {
  if (!state.jobId) return;
  const url = new URL(apiUrl(`/api/jobs/${state.jobId}/process`), location.origin);
  url.searchParams.set("mode", mode);
  if (el.tryHarder.checked) url.searchParams.set("try_harder", "true");

  url.searchParams.set("pack_source_where", el.packWhere.value);
  url.searchParams.set("pack_source_path", el.packPath.value || "");
  url.searchParams.set("pack_name", el.packName.value || "packed.rpa");
  url.searchParams.set("pack_version", el.packVersion.value || "3");
  url.searchParams.set("pack_key_hex", el.packKey.value || "0xDEADBEEF");
  url.searchParams.set("pack_padding", String(Number(el.packPadding.value || 0)));

  const res = await fetch(url.toString(), { method: "POST" });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function repackNow() {
  if (!state.jobId) return;
  const payload = {
    source_where: el.packWhere.value,
    source_path: el.packPath.value || "",
    name: el.packName.value || "repacked.rpa",
    version: Number(el.packVersion.value || 3),
    key_hex: el.packKey.value || "0xDEADBEEF",
    padding: Number(el.packPadding.value || 0),
  };
  const res = await fetch(apiUrl(`/api/jobs/${state.jobId}/repack`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function getTextFile(where, path) {
  const url = new URL(apiUrl(`/api/jobs/${state.jobId}/file`), location.origin);
  url.searchParams.set("where", where);
  url.searchParams.set("path", path);
  url.searchParams.set("as_text", "true");
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(await res.text());
  return res.text();
}

async function fsMove(where, src, dst, overwrite=false) {
  const res = await fetch(apiUrl(`/api/jobs/${state.jobId}/fs/move`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ where, src, dst, overwrite }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function fsMkdir(where, path) {
  const res = await fetch(apiUrl(`/api/jobs/${state.jobId}/fs/mkdir`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ where, path }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function fsDelete(where, path) {
  const url = new URL(apiUrl(`/api/jobs/${state.jobId}/fs`), location.origin);
  url.searchParams.set("where", where);
  url.searchParams.set("path", path);
  const res = await fetch(url.toString(), { method: "DELETE" });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}


async function saveTextFile(where, path, content) {
  const url = new URL(apiUrl(`/api/jobs/${state.jobId}/file`), location.origin);
  url.searchParams.set("where", where);
  url.searchParams.set("path", path);
  const res = await fetch(url.toString(), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function rawUrl(where, path) {
  const url = new URL(apiUrl(`/api/jobs/${state.jobId}/raw`), location.origin);
  url.searchParams.set("where", where);
  url.searchParams.set("path", path);
  return url.toString();
}

function downloadZipUrl(where) {
  const url = new URL(apiUrl(`/api/jobs/${state.jobId}/download`), location.origin);
  url.searchParams.set("where", where);
  url.searchParams.set("zip", "true");
  return url.toString();
}

function downloadFileUrl(where, path) {
  const url = new URL(apiUrl(`/api/jobs/${state.jobId}/download`), location.origin);
  url.searchParams.set("where", where);
  url.searchParams.set("path", path);
  return url.toString();
}

function renderTabs() {
  el.tabs.innerHTML = "";
  if (!state.tabs.length) {
    const d = document.createElement("div");
    d.className = "muted";
    d.textContent = "No file opened";
    el.tabs.appendChild(d);
    return;
  }
  for (const t of state.tabs) {
    const div = document.createElement("div");
    div.className = "tab" + (state.active && state.active.where === t.where && state.active.path === t.path ? " active" : "");
    div.title = `${t.where}:${t.path}`;
    div.onclick = () => openFile(t.where, t.path);

    const name = document.createElement("span");
    name.textContent = t.name;
    const x = document.createElement("span");
    x.className = "x";
    x.textContent = "×";
    x.onclick = (e) => {
      e.stopPropagation();
      state.tabs = state.tabs.filter(tt => !(tt.where === t.where && tt.path === t.path));
      if (state.active && state.active.where === t.where && state.active.path === t.path) {
        state.active = null;
        state.editorText = "";
        state.isText = false;
        el.activeFile.textContent = "No file";
        el.preview.innerHTML = `<div class="muted" style="padding:12px;">Select 1 file to preview.</div>`;
        el.saveBtn.disabled = true;
        el.fileBtn.disabled = true;
      }
      renderTabs();
    };

    div.appendChild(name);
    div.appendChild(x);
    el.tabs.appendChild(div);
  }
}

async function openFile(where, path) {
  try {
    showError("");
    const name = path.split("/").pop() || path;
    state.active = { where, path, name };
    if (!state.tabs.some(t => t.where === where && t.path === path)) state.tabs.push({ where, path, name });
    renderTabs();

    el.activeFile.textContent = `${where}:${path}`;
    el.fileBtn.disabled = false;

    const kind = guessKind(path);
    if (kind === "text") {
      const txt = await getTextFile(where, path);
      state.editorText = txt;
      state.isText = true;
      state.showDiff = false;
      const k = tabKey(where, path);
      if (!(k in state.tabOriginal)) state.tabOriginal[k] = txt;
      el.saveBtn.disabled = false;
      el.diffBtn.disabled = false;

      renderEditorOrDiff();
      return;
    }

    state.isText = false;
    state.showDiff = false;
    el.saveBtn.disabled = true;
    el.diffBtn.disabled = true;

    if (kind === "image") {
      el.preview.innerHTML = "";
      const img = document.createElement("img");
      img.className = "previewImg";
      img.src = rawUrl(where, path);
      img.alt = path;
      el.preview.appendChild(img);
      return;
    }
    if (kind === "audio") {
      el.preview.innerHTML = "";
      const a = document.createElement("audio");
      a.controls = true;
      a.src = rawUrl(where, path);
      a.style.width = "100%";
      el.preview.appendChild(a);
      return;
    }
    if (kind === "video") {
      el.preview.innerHTML = "";
      const v = document.createElement("video");
      v.controls = true;
      v.src = rawUrl(where, path);
      v.style.width = "100%";
      v.style.maxHeight = "60vh";
      el.preview.appendChild(v);
      return;
    }

    el.preview.innerHTML = `
      <div style="font-weight:800;margin-bottom:6px;">Binary file</div>
      <div class="muted" style="margin-bottom:10px;">This file cant preview as text. You can download to view.</div>
      <button onclick="window.open('${downloadFileUrl(where, path)}','_blank')">Download</button>
    `;
  } catch (e) {
    showError(String(e.message || e));
  }
}

function renderEditorOrDiff() {
  el.preview.innerHTML = "";
  if (!state.active) {
    el.preview.innerHTML = `<div class="muted" style="padding:12px;">Select 1 file to preview.</div>`;
    return;
  }
  if (!state.isText) return;

  const where = state.active.where, path = state.active.path;
  const k = tabKey(where, path);
  const orig = state.tabOriginal[k] || "";
  const cur = state.editorText || "";

  if (state.showDiff) {
    const box = document.createElement("div");
    box.className = "diffBox";
    const lines = diffLines(orig, cur);
    for (const d of lines) {
      const sp = document.createElement("span");
      sp.className = "diffLine" + (d.kind === "add" ? " add" : d.kind === "del" ? " del" : "");
      sp.textContent = (d.kind === "add" ? "+ " : d.kind === "del" ? "- " : "  ") + d.text;
      box.appendChild(sp);
    }
    el.preview.appendChild(box);
  } else {
    const ta = document.createElement("textarea");
    ta.className = "editor";
    ta.value = cur;
    ta.oninput = () => { state.editorText = ta.value; };
    el.preview.appendChild(ta);
  }
}


function filterTreeNode(node, q) {
  if (!q) return node;
  const qq = q.toLowerCase();
  const match = (s) => (s || "").toLowerCase().includes(qq);
  if (node.type === "file") {
    return (match(node.name) || match(node.path)) ? node : null;
  }
  const kids = (node.children || []).map(n => filterTreeNode(n, q)).filter(Boolean);
  if (kids.length) return { ...node, children: kids };
  if (match(node.name) || match(node.path)) return { ...node, children: [] };
  return null;
}

function renderTree() {
  const tree = state.where === "input" ? state.inputTree : state.outputTree;
  el.tree.innerHTML = "";
  if (!tree) {
    el.tree.innerHTML = `<div class="muted">No data.</div>`;
    return;
  }
  const q = el.search.value.trim();
  const filtered = tree.map(n => filterTreeNode(n, q)).filter(Boolean);

  const root = document.createElement("div");
  for (const n of filtered) root.appendChild(renderNode(n, 0));
  el.tree.appendChild(root);
}

function renderNode(node, depth) {
  const wrap = document.createElement("div");
  wrap.className = depth ? "indent" : "";

  const line = document.createElement("div");
  const isActive = node.type === "file" && state.active && state.active.where === state.where && state.active.path === node.path;
  const isSelDir = node.type === "dir" && state.selectedDir && state.selectedDir.where === state.where && state.selectedDir.path === node.path;
  line.className = "item" + ((isActive || isSelDir) ? " active" : "");

  if (node.type === "dir") {
    line.innerHTML = `📁 <span>${node.name}</span> <span class="muted">${isSelDir ? "(selected)" : ""}</span>`;
    line.onclick = () => {
      state.selectedDir = { where: state.where, path: node.path };
      state.selectedNode = { type:'dir', where: state.where, path: node.path };
      updateOpsButtons();
      setSelectedFolderBadge();
      autoPackNameFromSelection();
      renderTree();
    };
    wrap.appendChild(line);
    for (const c of (node.children || [])) wrap.appendChild(renderNode(c, depth + 1));
    return wrap;
  }

  line.innerHTML = `📄 <span>${node.name}</span> <span class="muted">(${Math.round((node.size||0)/1024)} KB)</span>`;
  line.onclick = () => { state.selectedNode = { type:'file', where: state.where, path: node.path }; updateOpsButtons(); openFile(state.where, node.path); };
  wrap.appendChild(line);
  return wrap;
}

async function refreshTree(where) {
  const url = new URL(apiUrl(`/api/jobs/${state.jobId}/tree`), location.origin);
  url.searchParams.set("where", where);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();
  if (where === "input") state.inputTree = data.tree;
  else state.outputTree = data.tree;
}


async function uploadFiles(files) {
  try {
    showError("");
    el.runBtn.disabled = true;
    const res = await createJob(files);
    state.jobId = res.job_id;
    state.inputTree = res.input_tree;
    state.outputTree = null;
    state.where = "input";
    state.selectedDir = null;
    state.active = null;
    state.tabs = [];
    state.editorText = "";
    state.isText = false;

    setJobBadge();
    setSelectedFolderBadge();
    renderTabs();
    renderTree();
    setLogs([]);
    updateOpsButtons();

    el.preview.innerHTML = `<div class="muted" style="padding:12px;">Select 1 file to preview.</div>`;
  } catch (e) {
    showError(String(e.message || e));
  } finally {
    el.runBtn.disabled = false;
  }
}

el.drop.addEventListener("click", () => el.fileInput.click());
el.drop.addEventListener("dragover", (e) => { e.preventDefault(); el.drop.style.outline = "2px solid rgba(98,209,255,.25)"; });
el.drop.addEventListener("dragleave", () => { el.drop.style.outline = "none"; });
el.drop.addEventListener("drop", (e) => {
  e.preventDefault();
  el.drop.style.outline = "none";
  const files = Array.from(e.dataTransfer.files || []);
  if (files.length) uploadFiles(files);
});

el.fileInput.addEventListener("change", (e) => {
  const files = Array.from(e.target.files || []);
  if (files.length) uploadFiles(files);
  e.target.value = "";
});

el.folderInput.addEventListener("change", (e) => {
  const files = Array.from(e.target.files || []);
  if (files.length) uploadFiles(files);
  e.target.value = "";
});

el.search.addEventListener("input", () => renderTree());

el.inputTab.onclick = () => { state.where = "input"; renderTree(); };
el.outputTab.onclick = () => { state.where = "output"; renderTree(); };

el.runBtn.onclick = async () => {
  try {
    if (!state.jobId) return;
    showError("");
    el.runBtn.disabled = true;
    const res = await processJob(el.mode.value);
    state.outputTree = res.output_tree;
    setLogs(res.logs || []);
    state.where = "output";
    renderTree();
    updateOpsButtons();

    const first = findFirstTextFile(state.outputTree);
    if (first) openFile("output", first);
  } catch (e) {
    showError(String(e.message || e));
  } finally {
    el.runBtn.disabled = false;
  }
};

function findFirstTextFile(tree) {
  const stack = [...(tree || [])];
  while (stack.length) {
    const n = stack.shift();
    if (n.type === "file") {
      const k = guessKind(n.path);
      if (k === "text") return n.path;
    } else if (n.children) {
      stack.unshift(...n.children);
    }
  }
  return null;
}

el.saveBtn.onclick = async () => {
  try {
    if (!state.jobId || !state.active || !state.isText) return;
    showError("");
    el.saveBtn.disabled = true;
    await saveTextFile(state.active.where, state.active.path, state.editorText);
    updateOpsButtons();
  } catch (e) {
    showError(String(e.message || e));
  } finally {
    el.saveBtn.disabled = false;
  }
};

el.zipBtn.onclick = () => {
  if (!state.jobId) return;
  window.open(downloadZipUrl("output"), "_blank");
};

el.fileBtn.onclick = () => {
  if (!state.jobId || !state.active) return;
  window.open(downloadFileUrl(state.active.where, state.active.path), "_blank");
};

function autoPackNameFromSelection() {
  if (!state.selectedDir) return;
  const p = state.selectedDir.path || "";
  const m = /^rpa_extract\/([^\/]+)$/i.exec(p);
  if (m) {
    el.packWhere.value = state.selectedDir.where;
    el.packPath.value = p;
    el.packName.value = `${m[1]}.rpa`;
    return;
  }
}


el.useSelectedBtn.onclick = () => {
  if (!state.selectedDir) return;
  el.packWhere.value = state.selectedDir.where;
  el.packPath.value = state.selectedDir.path || "";
  autoPackNameFromSelection();
};

el.repackBtn.onclick = async () => {
  try {
    if (!state.jobId) return;
    showError("");
    el.repackBtn.disabled = true;
    const res = await repackNow();
    state.outputTree = res.output_tree;
    state.where = "output";
    setLogs(res.logs || []);
    renderTree();
    el.zipBtn.disabled = false;
  } catch (e) {
    showError(String(e.message || e));
  } finally {
    el.repackBtn.disabled = false;
  }
};

setJobBadge();
setSelectedFolderBadge();
renderTabs();
renderTree();

el.diffBtn.onclick = () => {
  if (!state.active || !state.isText) return;
  state.showDiff = !state.showDiff;
  el.diffBtn.textContent = state.showDiff ? "Editor" : "Diff";
  renderEditorOrDiff();
};

el.mkdirBtn.onclick = async () => {
  try {
    if (!state.jobId) return;
    showError("");
    const baseWhere = state.where;
    const name = prompt("New folder path (relative):", "new_folder");
    if (!name) return;
    el.mkdirBtn.disabled = true;
    await fsMkdir(baseWhere, name);
    await refreshTree(baseWhere);
    renderTree();
  } catch (e) {
    showError(String(e.message || e));
  } finally {
    updateOpsButtons();
  }
};

el.renameBtn.onclick = async () => {
  try {
    if (!state.jobId || !state.selectedNode) return;
    showError("");
    const { where, path } = state.selectedNode;
    const cur = path;
    const dst = prompt("Rename/Move to (relative path):", cur);
    if (!dst || dst === cur) return;

    const overwrite = confirm("Overwrite if destination exists?");
    el.renameBtn.disabled = true;
    await fsMove(where, cur, dst, overwrite);
    await refreshTree(where);
    if (state.active && state.active.where === where && state.active.path === cur) {
      state.active.path = dst;
      state.active.name = dst.split("/").pop() || dst;
      el.activeFile.textContent = `${where}:${dst}`;
    }
    state.tabs = state.tabs.map(t => (t.where === where && t.path === cur) ? { ...t, path: dst, name: dst.split("/").pop() || dst } : t);
    const oldK = tabKey(where, cur);
    const newK = tabKey(where, dst);
    if (state.tabOriginal[oldK] && !state.tabOriginal[newK]) {
      state.tabOriginal[newK] = state.tabOriginal[oldK];
      delete state.tabOriginal[oldK];
    }

    renderTabs();
    renderTree();
  } catch (e) {
    showError(String(e.message || e));
  } finally {
    updateOpsButtons();
  }
};

el.deleteBtn.onclick = async () => {
  try {
    if (!state.jobId || !state.selectedNode) return;
    showError("");
    const { where, path, type } = state.selectedNode;
    if (!confirm(`Delete ${type} ${where}:${path} ?`)) return;
    el.deleteBtn.disabled = true;
    await fsDelete(where, path);
    await refreshTree(where);
    state.tabs = state.tabs.filter(t => !(t.where === where && t.path === path));
    if (state.active && state.active.where === where && state.active.path === path) {
      state.active = null;
      state.editorText = "";
      state.isText = false;
      state.showDiff = false;
      el.activeFile.textContent = "No file";
      el.preview.innerHTML = `<div class="muted" style="padding:12px;">Select 1 file to preview.</div>`;
    }
    state.selectedNode = null;
    renderTabs();
    renderTree();
  } catch (e) {
    showError(String(e.message || e));
  } finally {
    updateOpsButtons();
  }
};
