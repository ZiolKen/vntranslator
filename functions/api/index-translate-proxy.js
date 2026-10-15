/**
 * Cloudflare Pages Function - Index-Translate proxy.
 * Used only when the browser cannot call the public API directly (CORS).
 * Uses `onRequestPost` + `Response` (Workers runtime), not Vercel's (req, res).
 */

const UPSTREAM_URL = 'https://index-translate.bilibili.com/v1/chat/completions';
const DEFAULT_MODEL = 'Index-Translate-35B-A3B';
const MAX_TEXT_CHARS = 20000;

// Only forward a strict whitelist of fields to the upstream (this is not an open proxy).
function buildUpstreamPayload(input) {
  const b = input && typeof input === 'object' ? input : {};
  const model = String(b.model || DEFAULT_MODEL);
  if (!/^Index-Translate-/i.test(model)) return { error: 'Unsupported model' };

  const messages = Array.isArray(b.messages) ? b.messages : [];
  const content = messages.length === 1 ? messages[0]?.content : null;
  if (messages[0]?.role !== 'user' || typeof content !== 'string' || !content.trim()) {
    return { error: 'Expected exactly one non-empty user message' };
  }
  if (content.length > MAX_TEXT_CHARS) return { error: 'Text too long' };

  const temperature = Number.isFinite(Number(b.temperature)) ? Math.min(1, Math.max(0, Number(b.temperature))) : 0;
  const maxTokens = Number.isFinite(Number(b.max_tokens)) ? Math.min(4096, Math.max(1, Math.floor(Number(b.max_tokens)))) : 1024;

  return {
    payload: {
      model,
      messages: [{ role: 'user', content }],
      temperature,
      max_tokens: maxTokens,
      stream: false,
      chat_template_kwargs: { enable_thinking: false },
    },
  };
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

    const { payload, error } = buildUpstreamPayload(body);
    if (error) return json({ error }, 400);

    const upstream = await fetch(UPSTREAM_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'Index-Translate-Client/1.0' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(55000),
    });

    const text = await upstream.text();
    return new Response(text, {
      status: upstream.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Index-Translate proxy error:', err);
    return json({ error: 'Proxy to Index-Translate failed', detail: String(err?.message || err) }, 502);
  }
}
