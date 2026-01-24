import { Renpy, maskTagsInText } from "./renpy.js";
import { normalizeWorkspace } from "./workspace.js";

const now = () => Date.now();

const uid = () => {
  if (crypto?.randomUUID) return crypto.randomUUID();
  const a = new Uint32Array(4);
  crypto.getRandomValues(a);
  return Array.from(a).map(x => x.toString(16).padStart(8, "0")).join("-");
};

const readFileText = (file) => file.text();

const buildFileFromRpy = (name, source, mode) => {
  Renpy.setMode(mode);
  const dialogs = Renpy.extractDialogs(source);

  const rows = dialogs.map((d, idx) => {
    const masked = maskTagsInText(d.quote || "");
    return {
      id: `${name}::${idx}::${uid()}`,
      original: d.quote || "",
      machine: "",
      manual: "",
      flag: "todo",
      meta: `line ${Number(d.lineIndex) + 1}`,
      span: {
        lineIndex: d.lineIndex,
        contentStart: d.contentStart,
        contentEnd: d.contentEnd,
        quoteChar: d.quoteChar,
        isTriple: d.isTriple
      },
      _mask: { masked: masked.masked, map: masked.map }
    };
  });

  return { id: `${name}::${uid()}`, name, updated: now(), source, rows };
};

const isJson = (name) => String(name || "").toLowerCase().endsWith(".json");
const isZip = (name) => String(name || "").toLowerCase().endsWith(".zip");
const isRpy = (name) => String(name || "").toLowerCase().endsWith(".rpy");

export const importWorkspaceFromProjectJson = (text) => {
  const raw = JSON.parse(String(text || "{}"));
  const ws = normalizeWorkspace(raw);
  ws._meta.updatedAt = now();
  return ws;
};

export const importWorkspaceFromZip = async (zipFile, mode) => {
  if (typeof JSZip === "undefined") throw new Error("JSZip not loaded.");

  const ab = await zipFile.arrayBuffer();
  const zip = await JSZip.loadAsync(ab);

  const entries = [];
  zip.forEach((path, file) => {
    if (!file.dir && isRpy(path)) entries.push(file);
  });

  if (!entries.length) throw new Error("ZIP contains no .rpy files.");

  const files = [];
  for (const entry of entries) {
    const source = await entry.async("string");
    const name = entry.name.split("/").pop() || entry.name;
    files.push(buildFileFromRpy(name, source, mode));
  }

  const ws = normalizeWorkspace({
    version: 3,
    projectName: zipFile.name?.replace(/\.zip$/i, "") || "Ren'Py Project",
    files
  });

  ws.activeFileId = ws.files[0]?.id || null;
  ws.selectedRowId = ws.files[0]?.rows?.[0]?.id || null;
  ws._meta.updatedAt = now();
  return ws;
};

export const importWorkspaceFromFiles = async (fileList, currentWorkspace) => {
  const arr = Array.from(fileList || []);
  if (!arr.length) throw new Error("No files selected.");

  const json = arr.find(f => isJson(f.name));
  const zip = arr.find(f => isZip(f.name));
  const rpy = arr.filter(f => isRpy(f.name));

  if (json && !rpy.length && !zip) {
    const text = await readFileText(json);
    return importWorkspaceFromProjectJson(text);
  }

  const mode = String(currentWorkspace?.settings?.mode || "safe");

  if (zip && !rpy.length) return importWorkspaceFromZip(zip, mode);

  if (!rpy.length) throw new Error("No .rpy files to import.");

  const files = [];
  for (const f of rpy) {
    const source = await readFileText(f);
    files.push(buildFileFromRpy(f.name, source, mode));
  }

  const ws = normalizeWorkspace({
    ...currentWorkspace,
    files,
    projectName: currentWorkspace?.projectName || "Ren'Py Project"
  });

  ws.activeFileId = ws.files[0]?.id || null;
  ws.selectedRowId = ws.files[0]?.rows?.[0]?.id || null;
  ws._meta.updatedAt = now();
  return ws;
};
