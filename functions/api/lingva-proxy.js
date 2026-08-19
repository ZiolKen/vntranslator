/**
 * Cloudflare Pages Function - Lingva Translate proxy.
 *
 * Same issue as functions/api/deepl-trans.js: this was a byte-for-byte
 * copy of api/lingva-proxy.js (Vercel's `(req, res)` signature), which
 * doesn't exist on the Cloudflare Workers runtime - `req.method` and
 * `res.status(...).json(...)` were both undefined, so every call threw
 * before doing anything. Rewritten to `onRequestPost` + `Response`.
 */

const BASES = [
  'https://lingva.lunar.icu',
  'https://lingva.dialectapp.org',
  'https://lingva.ml',
  'https://lingva.vercel.app',
  'https://translate.plausibility.cloud',
  'https://lingva.garudalinux.org',
];

async function tryOnce(base, source, target, text) {
  const url = base.replace(/\/$/, '') + '/api/v1/' + encodeURIComponent(source) + '/' + encodeURIComponent(target) + '/' + encodeURIComponent(text);
  const r = await fetch(url, { method: 'GET' });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const data = await r.json();
  const t = data?.translation;
  if (typeof t !== 'string') throw new Error('Missing translation');
  return t;
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function onRequestPost(context) {
  const { request } = context;

  try {
    let body;
    try {
      body = await request.json();
    } catch {
      body = {};
    }
    body = body || {};

    const source = String(body.source || 'auto');
    const target = String(body.target || 'en');
    const text = String(body.text || '');
    if (!text) {
      return json({ error: 'Missing text' }, 400);
    }

    let lastErr = null;
    for (const base of BASES) {
      try {
        const t = await tryOnce(base, source, target, text);
        return json({ translation: t, base }, 200);
      } catch (e) {
        lastErr = e;
      }
    }

    return json({ error: String(lastErr?.message || lastErr || 'Lingva failed') }, 502);
  } catch (e) {
    return json({ error: String(e?.message || e) }, 500);
  }
}
