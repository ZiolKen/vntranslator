export async function onRequestPost(context) {
  const { request } = context;

  try {
    const body = await request.json();
    const { apiKey, ...deepseekBody } = body || {};

    if (!apiKey || typeof apiKey !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Missing apiKey in request body' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!deepseekBody.model) {
      deepseekBody.model = 'deepseek-chat';
    }
    if (!deepseekBody.messages || !Array.isArray(deepseekBody.messages)) {
      return new Response(
        JSON.stringify({ error: 'Missing messages array in request body' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const dsRes = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey,
      },
      body: JSON.stringify(deepseekBody),
    });

    const text = await dsRes.text();

    if (!dsRes.ok) {
      console.error('DeepSeek error:', dsRes.status, text);
      return new Response(text, {
        status: dsRes.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(text, {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('DeepSeek proxy error:', err);
    return new Response(
      JSON.stringify({
        error: 'Proxy to DeepSeek failed',
        detail: String(err),
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}