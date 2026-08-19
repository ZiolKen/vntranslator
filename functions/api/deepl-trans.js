/**
 * Cloudflare Pages Function - DeepL translate proxy.
 *
 * This used to be a byte-for-byte copy of api/deepl-trans.js (the Vercel
 * serverless version, which uses the Node-style `(req, res)` signature
 * with `req.body` / `res.status().json()`). Cloudflare Pages Functions
 * run on the Workers runtime and don't have that API at all - only a
 * Fetch-standard `Request` (via `context.request`) and a `Response` you
 * construct and return. The old copy would throw on every call
 * (`req.method` / `res.status` are both undefined on `context`), so
 * `/api/deepl-trans` was completely dead on a Cloudflare deployment.
 * Rewritten below to the same logic using `onRequestPost` +
 * `onRequestOptions`, matching the working pattern already used in
 * functions/api/deepseek-proxy.js.
 */

const rateLimitStore = new Map();
const RATE_LIMIT_WINDOW = 60000;
const MAX_REQUESTS_PER_MINUTE = 100;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
};

function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS, ...extraHeaders },
  });
}

function checkRateLimit(apiKey) {
  const now = Date.now();
  const key = apiKey.substring(0, 8);

  if (!rateLimitStore.has(key)) {
    rateLimitStore.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return { allowed: true, remaining: MAX_REQUESTS_PER_MINUTE - 1 };
  }

  const record = rateLimitStore.get(key);

  if (now >= record.resetAt) {
    rateLimitStore.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return { allowed: true, remaining: MAX_REQUESTS_PER_MINUTE - 1 };
  }

  if (record.count >= MAX_REQUESTS_PER_MINUTE) {
    const resetIn = Math.ceil((record.resetAt - now) / 1000);
    return {
      allowed: false,
      remaining: 0,
      resetIn,
      message: `Rate limit exceeded. Resets in ${resetIn}s`,
    };
  }

  record.count++;
  return { allowed: true, remaining: MAX_REQUESTS_PER_MINUTE - record.count };
}

function validateRequest(body) {
  const errors = [];

  if (!body.apiKey || typeof body.apiKey !== 'string') {
    errors.push('Missing or invalid apiKey');
  }

  if (body.text == null) {
    errors.push('Missing text field');
  } else if (typeof body.text === 'string') {
    if (body.text.length === 0) errors.push('Text cannot be empty');
    if (body.text.length > 50000) errors.push('Text too long (max 50000 characters)');
  } else if (Array.isArray(body.text)) {
    if (body.text.length === 0) errors.push('Text array cannot be empty');
    if (body.text.length > 50) errors.push('Too many text items (max 50)');
    if (!body.text.every((t) => typeof t === 'string')) errors.push('All text array items must be strings');
  } else {
    errors.push('Text must be string or array of strings');
  }

  if (!body.target_lang || typeof body.target_lang !== 'string') {
    errors.push('Missing or invalid target_lang');
  }

  return errors;
}

async function callDeepLAPI(baseUrl, apiKey, deeplBody, timeoutMs = 60000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(baseUrl + '/v2/translate', {
      method: 'POST',
      headers: {
        Authorization: 'DeepL-Auth-Key ' + apiKey,
        'Content-Type': 'application/json',
        'User-Agent': 'VNTranslator/2.0',
      },
      body: JSON.stringify(deeplBody),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    const responseText = await response.text();

    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      text: responseText,
      headers: Object.fromEntries(response.headers.entries()),
    };
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') {
      throw new Error('Request timeout');
    }
    throw err;
  }
}

export async function onRequestOptions() {
  return new Response(null, { status: 200, headers: CORS_HEADERS });
}

export async function onRequestPost(context) {
  const { request } = context;
  const startTime = Date.now();

  try {
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'Validation failed', details: ['Request body is not valid JSON'] }, 400);
    }
    body = body || {};

    const validationErrors = validateRequest(body);
    if (validationErrors.length > 0) {
      return json({ error: 'Validation failed', details: validationErrors }, 400);
    }

    const { apiKey, ...deeplBody } = body;
    const trimmedKey = apiKey.trim();

    const rateLimit = checkRateLimit(trimmedKey);
    const rateHeaders = {
      'X-RateLimit-Limit': String(MAX_REQUESTS_PER_MINUTE),
      'X-RateLimit-Remaining': String(rateLimit.remaining),
    };

    if (!rateLimit.allowed) {
      return json(
        {
          error: 'Rate limit exceeded',
          message: rateLimit.message,
          retryAfter: rateLimit.resetIn,
        },
        429,
        { ...rateHeaders, 'X-RateLimit-Reset': String(rateLimit.resetIn) }
      );
    }

    const isFreeKey = trimmedKey.endsWith(':fx');
    const baseUrl = isFreeKey ? 'https://api-free.deepl.com' : 'https://api.deepl.com';

    console.log(`[DeepL] Request to ${baseUrl} (${isFreeKey ? 'free' : 'pro'} key)`);

    let lastError = null;
    const maxRetries = 3;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await callDeepLAPI(baseUrl, trimmedKey, deeplBody, 60000);

        console.log(`[DeepL] Attempt ${attempt}: Status ${result.status}`);

        if (!result.ok) {
          if (result.status === 403) {
            return json(
              { error: 'Authentication failed', message: 'Invalid API key or insufficient permissions', deeplStatus: result.status },
              403,
              rateHeaders
            );
          }

          if (result.status === 456) {
            return json(
              { error: 'Quota exceeded', message: 'Your DeepL API quota has been exceeded', deeplStatus: result.status },
              456,
              rateHeaders
            );
          }

          if (result.status === 429) {
            if (attempt < maxRetries) {
              const backoffMs = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
              console.log(`[DeepL] Rate limited, retrying in ${backoffMs}ms...`);
              await new Promise((resolve) => setTimeout(resolve, backoffMs));
              continue;
            }
            return json(
              { error: 'Too many requests', message: 'DeepL rate limit exceeded. Please try again later.', deeplStatus: result.status },
              429,
              rateHeaders
            );
          }

          if (result.status >= 500) {
            if (attempt < maxRetries) {
              const backoffMs = Math.min(2000 * Math.pow(2, attempt - 1), 15000);
              console.log(`[DeepL] Server error ${result.status}, retrying in ${backoffMs}ms...`);
              await new Promise((resolve) => setTimeout(resolve, backoffMs));
              continue;
            }
            return json(
              {
                error: 'DeepL service unavailable',
                message: 'DeepL service is temporarily unavailable',
                deeplStatus: result.status,
                details: result.text.substring(0, 500),
              },
              502,
              rateHeaders
            );
          }

          return json(
            {
              error: 'DeepL API error',
              message: result.statusText || 'Request failed',
              deeplStatus: result.status,
              details: result.text.substring(0, 500),
            },
            result.status,
            rateHeaders
          );
        }

        const elapsedMs = Date.now() - startTime;
        console.log(`[DeepL] Success in ${elapsedMs}ms`);

        return new Response(result.text, {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            ...CORS_HEADERS,
            ...rateHeaders,
            'X-Response-Time': String(elapsedMs),
          },
        });
      } catch (err) {
        lastError = err;

        if (err.message === 'Request timeout') {
          if (attempt < maxRetries) {
            console.log(`[DeepL] Timeout on attempt ${attempt}, retrying...`);
            continue;
          }
          return json({ error: 'Gateway timeout', message: 'Request to DeepL timed out after multiple attempts' }, 504, rateHeaders);
        }

        if (attempt < maxRetries) {
          const backoffMs = 1000 * attempt;
          console.log(`[DeepL] Network error, retrying in ${backoffMs}ms...`);
          await new Promise((resolve) => setTimeout(resolve, backoffMs));
          continue;
        }
      }
    }

    throw lastError || new Error('All retry attempts failed');
  } catch (err) {
    console.error('[DeepL] Fatal error:', err);
    const elapsedMs = Date.now() - startTime;
    return json(
      {
        error: 'Internal server error',
        message: 'An unexpected error occurred',
        details: err.message,
        timestamp: new Date().toISOString(),
        elapsed: elapsedMs,
      },
      500
    );
  }
}
