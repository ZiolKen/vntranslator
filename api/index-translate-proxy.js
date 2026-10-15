/**
 * Vercel serverless function - Index-Translate proxy.
 * Used only when the browser cannot call the public API directly (CORS).
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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const { payload, error } = buildUpstreamPayload(body);
    if (error) return res.status(400).json({ error });

    const upstream = await fetch(UPSTREAM_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'Index-Translate-Client/1.0' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(55000),
    });

    const text = await upstream.text();
    res.status(upstream.status).setHeader('Content-Type', 'application/json');
    return res.send(text);
  } catch (err) {
    console.error('Index-Translate proxy error:', err);
    return res.status(502).json({ error: 'Proxy to Index-Translate failed', detail: String(err?.message || err) });
  }
}
