export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = req.body || {};
    const { apiKey, ...deepseekBody } = body;

    if (!apiKey || typeof apiKey !== 'string') {
      return res.status(400).json({ error: 'Missing apiKey in request body' });
    }

    if (!deepseekBody.model) {
      deepseekBody.model = 'deepseek-chat';
    }
    if (!deepseekBody.messages || !Array.isArray(deepseekBody.messages)) {
      return res.status(400).json({ error: 'Missing messages array in request body' });
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
      return res.status(dsRes.status).send(text);
    }

    res.status(200).setHeader('Content-Type', 'application/json');
    res.send(text);
  } catch (err) {
    console.error('DeepSeek proxy error:', err);
    res.status(500).json({
      error: 'Proxy to DeepSeek failed',
      detail: String(err),
    });
  }
}