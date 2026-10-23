// pool.js — multi-key / multi-model round-robin scheduler for the AIO translator.
//
//   slot  = one (model, api key) pair. Every request picks the next healthy slot
//           in round-robin order, so load is spread evenly across keys AND models.
//   job   = one batch of dialogs. `runBatches` runs `concurrency` jobs at once.
//
// Failure handling:
//   auth   (401/403/invalid key)  -> slot is disabled for the rest of the run
//   model  (404 / model not found)-> every slot using that model is disabled
//   rate   (429 / quota)          -> slot cools down (exponential, honours "retry in Ns")
//   server (5xx / network)        -> short cooldown
//   format (bad JSON / wrong len) -> no cooldown; after 2 failed tries the batch is split in half
//
// No DOM / globals here, so it can be unit-tested in Node.

const KNOWN_PROVIDERS = ['deepseek', 'deepl', 'gemini', 'openai', 'openrouter'];

export function parseKeys(text) {
  const seen = new Set();
  const out = [];
  for (const part of String(text || '').split(/[\r\n,;]+/)) {
    const k = part
      .trim()
      .replace(/^authorization\s*:\s*bearer\s+/i, '')
      .replace(/^bearer\s+/i, '')
      .replace(/^['"]+|['"]+$/g, '')
      .trim();
    if (!k || k.startsWith('#') || seen.has(k)) continue;
    seen.add(k);
    out.push(k);
  }
  return out;
}

export function maskKey(key) {
  const s = String(key || '');
  if (!s) return '—';
  return s.length <= 10 ? '••••' : `${s.slice(0, 4)}…${s.slice(-4)}`;
}

function guessProvider(modelId) {
  const m = String(modelId || '').toLowerCase();
  if (/^(gemini|gemma)/.test(m)) return 'gemini';
  if (/^(gpt|o\d|chatgpt)/.test(m)) return 'openai';
  if (m.includes('/')) return 'openrouter';
  if (/^deepseek/.test(m)) return 'deepseek';
  return 'openai';
}

// "gemini:gemini-2.5-flash" / "openrouter:vendor/model:free" / "gpt-4.1" (provider guessed)
export function parseCustomModels(text) {
  const out = [];
  const seen = new Set();
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;

    let provider = '';
    let model = line;
    const c = line.indexOf(':');
    if (c > 0) {
      const head = line.slice(0, c).trim().toLowerCase();
      if (KNOWN_PROVIDERS.includes(head)) {
        provider = head;
        model = line.slice(c + 1).trim();
      }
    }
    if (!model) continue;
    if (!provider) provider = guessProvider(model);
    if (provider === 'deepl') continue; // DeepL has no model id

    const id = `${provider}:${model}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ id, provider, model, label: model, custom: true });
  }
  return out;
}

export function kindForProvider(provider) {
  if (provider === 'deepseek') return 'deepseek';
  if (provider === 'deepl') return 'deepl';
  if (provider === 'free') return 'free';
  return 'chat'; // openai / gemini / openrouter (OpenAI-compatible chat)
}

// models: [{ id, provider, model, label }]   keysByProvider: { gemini: ['k1','k2'], ... }
// Slots are interleaved (round r: every model's r-th key) so consecutive requests hit
// different models/keys before any single key is reused.
export function buildSlots(models, keysByProvider) {
  const perModel = [];
  const skipped = [];

  for (const m of models) {
    const kind = kindForProvider(m.provider);
    const keys = kind === 'free' ? [''] : (keysByProvider?.[m.provider] || []);
    if (!keys.length) {
      skipped.push(m);
      continue;
    }
    perModel.push({ m, kind, keys });
  }

  const slots = [];
  const rounds = perModel.reduce((n, x) => Math.max(n, x.keys.length), 0);
  for (let r = 0; r < rounds; r++) {
    for (const { m, kind, keys } of perModel) {
      if (r >= keys.length) continue;
      slots.push({
        modelId: m.id,
        provider: m.provider,
        model: m.model || m.id,
        label: m.label || m.model || m.id,
        kind,
        key: keys[r],
        keyLabel: kind === 'free' ? 'no key' : maskKey(keys[r]),
      });
    }
  }
  return { slots, skipped };
}

// ---------------------------------------------------------------- errors ----

export function classifyError(err) {
  const msg = String(err?.message || err || '') + ' ' + String(err?.detail || '');
  if (err?.kind === 'format') return { kind: 'format', retryAfterMs: 0 };

  const retryAfter = (() => {
    let m = /retry[- ]?after\D{0,6}(\d+(?:\.\d+)?)\s*(ms|s|sec)?/i.exec(msg)
      || /retry(?:ing)?\s+in\s+(\d+(?:\.\d+)?)\s*(ms|s)?/i.exec(msg)
      || /"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)(s|ms)?"/i.exec(msg);
    if (!m) return 0;
    const n = Number(m[1]);
    return /^ms$/i.test(m[2] || '') ? n : n * 1000;
  })();

  if (/\b429\b|rate.?limit|quota|resource_exhausted|too many requests/i.test(msg)) {
    return { kind: 'rate', retryAfterMs: retryAfter };
  }
  if (/\b(401|403)\b|invalid api key|api key not valid|api_key_invalid|incorrect api key|unauthori[sz]ed|permission denied|missing .* api key/i.test(msg)) {
    return { kind: 'auth', retryAfterMs: 0 };
  }
  if (/\b404\b|model.{0,40}not found|does not exist|no endpoints found|unknown model|not a valid model/i.test(msg)) {
    return { kind: 'model', retryAfterMs: 0 };
  }
  if (/\b5\d\d\b|network error|failed to fetch|timeout|timed out|econn|overloaded|unavailable/i.test(msg)) {
    return { kind: 'server', retryAfterMs: retryAfter };
  }
  return { kind: 'server', retryAfterMs: retryAfter };
}

// ------------------------------------------------------------------ pool ----

export class SlotPool {
  constructor(slots, opts = {}) {
    this.now = opts.now || Date.now;
    this.rateBaseMs = opts.rateBaseMs ?? 10_000;
    this.rateCapMs = opts.rateCapMs ?? 300_000;
    this.serverBaseMs = opts.serverBaseMs ?? 3_000;
    this.serverCapMs = opts.serverCapMs ?? 60_000;
    this.slots = slots.map((s, idx) => ({
      ...s, idx, fails: 0, cooldownUntil: 0, dead: false, deadReason: '', ok: 0, errors: 0, inflight: 0,
    }));
    this.ptr = 0;
  }

  get size() { return this.slots.length; }
  alive() { return this.slots.filter((s) => !s.dead); }

  // -> { slot, waitMs }. slot === null when every slot is dead.
  acquire(avoid) {
    const n = this.slots.length;
    const t = this.now();
    const ready = (s) => !s.dead && s.cooldownUntil <= t;

    for (const honourAvoid of [true, false]) {
      for (let i = 0; i < n; i++) {
        const s = this.slots[(this.ptr + i) % n];
        if (!ready(s)) continue;
        if (honourAvoid && avoid && avoid.has(s.idx)) continue;
        this.ptr = (s.idx + 1) % n;
        s.inflight++;
        return { slot: s, waitMs: 0 };
      }
    }

    // Everything alive is cooling down: take the one that recovers first.
    let best = null;
    for (const s of this.slots) {
      if (s.dead) continue;
      if (!best || s.cooldownUntil < best.cooldownUntil) best = s;
    }
    if (!best) return { slot: null, waitMs: 0 };
    this.ptr = (best.idx + 1) % n;
    best.inflight++;
    return { slot: best, waitMs: Math.max(0, best.cooldownUntil - t) };
  }

  release(slot) { slot.inflight = Math.max(0, slot.inflight - 1); }

  success(slot) {
    slot.fails = 0;
    slot.cooldownUntil = 0;
    slot.ok++;
  }

  failure(slot, cls) {
    slot.errors++;
    const t = this.now();

    if (cls.kind === 'auth') {
      slot.dead = true;
      slot.deadReason = 'invalid key / no permission';
      return;
    }
    if (cls.kind === 'model') {
      for (const s of this.slots) {
        if (s.modelId === slot.modelId) { s.dead = true; s.deadReason = 'model not available'; }
      }
      return;
    }
    if (cls.kind === 'format') return; // the model answered, just badly — no cooldown

    slot.fails++;
    const base = cls.kind === 'rate' ? this.rateBaseMs : this.serverBaseMs;
    const cap = cls.kind === 'rate' ? this.rateCapMs : this.serverCapMs;
    const backoff = Math.min(base * 2 ** (slot.fails - 1), cap);
    slot.cooldownUntil = t + Math.max(backoff, cls.retryAfterMs || 0);
  }

  stats() {
    return this.slots.map((s) => ({
      label: s.label, keyLabel: s.keyLabel, ok: s.ok, errors: s.errors, dead: s.dead, deadReason: s.deadReason,
    }));
  }
}

// ---------------------------------------------------------------- runner ----

const realSleep = (ms) => new Promise((r) => setTimeout(r, ms));

// jobs: [{ items: [...] }]   call(slot, items) -> Promise<string[]>   (length must equal items.length)
// onResult(job, outputs, slot)  — called as soon as a batch succeeds
// onError(job, error)           — called when a batch is given up on
export async function runBatches({
  jobs,
  pool,
  call,
  concurrency = 3,
  maxAttempts = 5,
  onResult,
  onError,
  onLog,
  shouldStop,
  sleep = realSleep,
  splitOnFormat = true,
}) {
  const queue = jobs.map((j) => ({ items: j.items, attempts: 0, tried: new Set(), lastError: null }));
  let active = 0;
  const summary = { ok: 0, failed: 0, split: 0, cancelled: false };

  const waitInterruptible = async (ms) => {
    let left = ms;
    while (left > 0) {
      if (shouldStop?.()) return;
      const step = Math.min(left, 500);
      await sleep(step);
      left -= step;
    }
  };

  async function processJob(job) {
    while (job.attempts < maxAttempts) {
      if (shouldStop?.()) { summary.cancelled = true; return; }

      const { slot, waitMs } = pool.acquire(job.tried);
      if (!slot) {
        summary.failed++;
        onError?.(job, job.lastError || new Error('No usable API key / model left.'));
        return;
      }

      if (waitMs > 0) {
        onLog?.(`All slots cooling down — waiting ${(waitMs / 1000).toFixed(1)}s (${slot.label} · ${slot.keyLabel})`, 'warn');
        await waitInterruptible(waitMs);
        if (shouldStop?.()) { pool.release(slot); summary.cancelled = true; return; }
      }

      job.attempts++;
      job.tried.add(slot.idx);

      try {
        const out = await call(slot, job.items);
        if (!Array.isArray(out) || out.length !== job.items.length) {
          const e = new Error(`${slot.label} returned ${Array.isArray(out) ? out.length : 'no'} items, expected ${job.items.length}.`);
          e.kind = 'format';
          throw e;
        }
        pool.release(slot);
        pool.success(slot);
        summary.ok++;
        await onResult?.(job, out, slot);
        return;
      } catch (err) {
        pool.release(slot);
        job.lastError = err;
        const cls = classifyError(err);
        pool.failure(slot, cls);
        onLog?.(`${slot.label} · ${slot.keyLabel}: ${cls.kind} — ${String(err?.message || err).slice(0, 160)}`, cls.kind === 'auth' ? 'err' : 'warn');

        if (cls.kind === 'format' && splitOnFormat && job.items.length > 1 && job.attempts >= 2) {
          const mid = Math.ceil(job.items.length / 2);
          queue.unshift(
            { items: job.items.slice(0, mid), attempts: 0, tried: new Set(), lastError: null },
            { items: job.items.slice(mid), attempts: 0, tried: new Set(), lastError: null },
          );
          summary.split++;
          onLog?.(`Splitting batch of ${job.items.length} into ${mid} + ${job.items.length - mid}`, 'warn');
          return;
        }
      }
    }

    summary.failed++;
    onError?.(job, job.lastError || new Error('Failed after retries.'));
  }

  async function worker() {
    while (true) {
      if (shouldStop?.()) { summary.cancelled = true; return; }
      const job = queue.shift();
      if (!job) {
        if (active === 0) return;
        await sleep(15); // another worker may still push split jobs
        continue;
      }
      active++;
      try { await processJob(job); } finally { active--; }
    }
  }

  const n = Math.max(1, Math.min(Number(concurrency) || 1, Math.max(1, queue.length)));
  await Promise.all(Array.from({ length: n }, () => worker()));
  return summary;
}
