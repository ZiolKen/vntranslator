import { clamp } from "./utils.js";

const now = () => Date.now();

const uid = () => {
  if (crypto?.randomUUID) return crypto.randomUUID();
  const a = new Uint32Array(4);
  crypto.getRandomValues(a);
  return Array.from(a).map(x => x.toString(16).padStart(8, "0")).join("-");
};

export const makeDefaultWorkspace = () => ({
  version: 3,
  projectName: "Ren'Py Project",
  activeFileId: null,
  selectedRowId: null,
  files: [],
  settings: {
    engine: "deepseek",
    lang: "vi",
    mode: "safe",
    batchSize: 24,
    concurrency: 2,
    retry: 4,
    proxyBase: ""
  },
  _meta: {
    createdAt: now(),
    updatedAt: now()
  }
});

export const normalizeWorkspace = (ws) => {
  const base = makeDefaultWorkspace();
  if (!ws || typeof ws !== "object") return base;

  const s = ws.settings || {};
  const out = {
    ...base,
    ...ws,
    settings: {
      ...base.settings,
      ...s,
      batchSize: clamp(Number(s.batchSize) || base.settings.batchSize, 1, 80),
      concurrency: clamp(Number(s.concurrency) || base.settings.concurrency, 1, 6),
      retry: clamp(Number(s.retry) || base.settings.retry, 0, 8),
      mode: ["safe","balanced","aggressive"].includes(String(s.mode)) ? String(s.mode) : base.settings.mode,
      engine: ["deepseek","deepl","lingva"].includes(String(s.engine)) ? String(s.engine) : base.settings.engine,
      lang: String(s.lang || base.settings.lang),
      proxyBase: String(s.proxyBase || "")
    },
    _meta: {
      createdAt: Number(ws?._meta?.createdAt) || base._meta.createdAt,
      updatedAt: Number(ws?._meta?.updatedAt) || now()
    }
  };

  out.files = Array.isArray(ws.files) ? ws.files : [];

  for (const f of out.files) {
    if (!f.id) f.id = uid();
    if (!f.name) f.name = "file.rpy";
    if (!f.updated) f.updated = now();
    if (!Array.isArray(f.rows)) f.rows = [];
    for (const r of f.rows) {
      if (!r.id) r.id = uid();
      r.original = String(r.original ?? "");
      r.machine = String(r.machine ?? "");
      r.manual = String(r.manual ?? "");
      r.flag = ["todo","review","done"].includes(String(r.flag)) ? String(r.flag) : "todo";
      r.meta = String(r.meta ?? "");
      if (r.span && typeof r.span === "object") {
        r.span.contentStart = Number(r.span.contentStart) || 0;
        r.span.contentEnd = Number(r.span.contentEnd) || 0;
        r.span.quoteChar = r.span.quoteChar === "'" ? "'" : '"';
        r.span.isTriple = Boolean(r.span.isTriple);
      } else {
        r.span = null;
      }
    }
  }

  if (out.files.length) {
    out.activeFileId = out.activeFileId || out.files[0].id;
    const af = out.files.find(x => x.id === out.activeFileId) || out.files[0];
    out.selectedRowId = out.selectedRowId || af.rows[0]?.id || null;
  } else {
    out.activeFileId = null;
    out.selectedRowId = null;
  }

  return out;
};

export const rebuildRowIndex = (ws) => {
  const idx = new Map();
  for (const f of ws.files) {
    for (const r of f.rows) idx.set(r.id, { fileId: f.id, row: r });
  }
  return idx;
};

export const fileProgress = (f) => {
  const total = Math.max(1, f.rows.length);
  const done = f.rows.reduce((acc, r) => acc + (r.flag === "done" ? 1 : 0), 0);
  return Math.round((done / total) * 100);
};

export const workspaceStats = (ws) => {
  const files = ws.files.length;
  let rows = 0;
  let done = 0;
  let review = 0;
  for (const f of ws.files) {
    rows += f.rows.length;
    for (const r of f.rows) {
      if (r.flag === "done") done++;
      else if (r.flag === "review") review++;
    }
  }
  return { files, rows, done, review };
};
