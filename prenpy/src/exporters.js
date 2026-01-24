import { Renpy, buildReplacementsFromRows, CREDIT_LINE } from "./renpy.js";
import { downloadBlob } from "./utils.js";

const safeName = (s) => String(s || "project").trim().replace(/\s+/g, "_").replace(/[^A-Za-z0-9_\-\.]/g, "_");

export const exportProjectJson = async (ws) => {
  const snap = {
    version: ws.version,
    projectName: ws.projectName,
    activeFileId: ws.activeFileId,
    selectedRowId: ws.selectedRowId,
    files: ws.files.map(f => ({
      id: f.id,
      name: f.name,
      updated: f.updated,
      source: f.source,
      rows: f.rows.map(r => ({
        id: r.id,
        original: r.original,
        machine: r.machine,
        manual: r.manual,
        flag: r.flag,
        meta: r.meta,
        span: r.span
      }))
    })),
    settings: { ...ws.settings, apiKey: "" },
    _meta: ws._meta
  };

  const blob = new Blob([JSON.stringify(snap, null, 2)], { type: "application/json" });
  downloadBlob(blob, safeName(ws.projectName) + ".json");
};

const hasSpans = (file) => file?.rows?.length && file.rows.every(r => r?.span?.contentStart >= 0 && r?.span?.contentEnd >= 0);

export const exportZipTranslated = async (ws) => {
  if (!ws.files.length) throw new Error("No files.");
  if (typeof JSZip === "undefined") throw new Error("JSZip not loaded.");

  const zip = new JSZip();
  const folder = zip.folder("translated");

  for (const f of ws.files) {
    const source = String(f.source || "");

    let reps = null;

    if (hasSpans(f)) {
      reps = buildReplacementsFromRows(f.rows);
    } else {
      Renpy.setMode(ws.settings?.mode || "safe");
      const dialogs = Renpy.extractDialogs(source);
      const tmpRows = dialogs.map((d, i) => {
        const r = f.rows[i] || {};
        return {
          manual: r.manual,
          machine: r.machine,
          span: { contentStart: d.contentStart, contentEnd: d.contentEnd, quoteChar: d.quoteChar, isTriple: d.isTriple }
        };
      });
      reps = buildReplacementsFromRows(tmpRows);
    }

    const out = Renpy.applyTranslations(source, reps, CREDIT_LINE);
    folder.file(f.name, out);
  }

  folder.file("_CREDITS.txt", CREDIT_LINE + "\n");
  folder.file("_PROJECT.json", JSON.stringify({ projectName: ws.projectName, exportedAt: Date.now() }, null, 2));

  const blob = await zip.generateAsync({ type: "blob" });
  downloadBlob(blob, safeName(ws.projectName) + "_translated.zip");
};
