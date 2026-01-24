import { maskTagsInText } from "./renpy.js";
import { translateBatch, postProcessTranslation } from "./engines.js";
import { chunk, pool, sleep } from "./utils.js";

export const collectPendingRows = (ws, scope) => {
  const onlyPending = (r) => r.flag !== "done" && !(r.machine && r.machine.trim());

  const activeFile = ws.files.find(f => f.id === ws.activeFileId) || null;
  const selectedRow = activeFile?.rows?.find(r => r.id === ws.selectedRowId) || null;

  if (scope === "row") return (activeFile && selectedRow && onlyPending(selectedRow)) ? [selectedRow] : [];
  if (scope === "file") return activeFile ? activeFile.rows.filter(onlyPending) : [];
  return ws.files.flatMap(f => f.rows.filter(onlyPending));
};

const ensureMask = (row) => {
  if (row?._mask?.masked && row?._mask?.map) return row._mask;
  const masked = maskTagsInText(row?.original || "");
  row._mask = masked;
  return masked;
};

export const runTranslate = async (ws, rows, apiKey, { onProgress, signal } = {}) => {
  const settings = ws.settings || {};
  const engine = settings.engine;
  const lang = settings.lang;
  const retry = { attempts: settings.retry, minDelay: 400, signal };
  const proxyBase = settings.proxyBase;

  const total = rows.length;
  let done = 0;
  let failed = 0;

  const batches = chunk(rows, settings.batchSize);

  const report = () => {
    if (typeof onProgress === "function") onProgress({ total, done, failed });
  };

  report();

  const workOneBatch = async (batch) => {
    if (signal?.aborted) throw new Error("Aborted");

    const maskedLines = batch.map(r => ensureMask(r).masked);
    const maps = batch.map(r => ensureMask(r).map);

    const translated = await translateBatch(engine, maskedLines, lang, apiKey, retry, signal, proxyBase);

    for (let i = 0; i < batch.length; i++) {
      const r = batch[i];
      const raw = translated[i] ?? "";
      const pp = postProcessTranslation(raw, maps[i]);

      r.machine = pp.text;

      if (!pp.ok) {
        r.flag = "review";
        failed++;
      } else if (r.flag === "todo") {
        r.flag = "review";
      }
    }

    done += batch.length;
    report();
    await sleep(0);
  };

  await pool(settings.concurrency, batches, workOneBatch);

  return { total, done, failed };
};
