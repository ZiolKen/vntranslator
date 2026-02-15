export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const { apiKey, ...deeplBody } = body;

    if (!apiKey || typeof apiKey !== "string") {
      return res.status(400).json({ error: "Missing apiKey" });
    }

    if (
      deeplBody.text == null ||
      !(
        typeof deeplBody.text === "string" ||
        (Array.isArray(deeplBody.text) && deeplBody.text.every(t => typeof t === "string"))
      )
    ) {
      return res.status(400).json({ error: "Invalid text" });
    }

    if (!deeplBody.target_lang) {
      return res.status(400).json({ error: "Missing target_lang" });
    }

    const key = apiKey.trim();

    const baseUrl = key.endsWith(":fx")
      ? "https://api-free.deepl.com"
      : "https://api.deepl.com";

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);

    const dlRes = await fetch(baseUrl + "/v2/translate", {
      method: "POST",
      headers: {
        "Authorization": "DeepL-Auth-Key " + key,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(deeplBody),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    const text = await dlRes.text();

    if (!dlRes.ok) {
      console.error("DeepL API error:", dlRes.status);
      return res.status(dlRes.status).send(text);
    }

    res.status(200).setHeader("Content-Type", "application/json");
    return res.send(text);

  } catch (err) {
    if (err.name === "AbortError") {
      return res.status(504).json({ error: "DeepL timeout" });
    }

    console.error("Proxy crash:", err);
    return res.status(500).json({
      error: "Proxy failed",
      detail: String(err),
    });
  }
}
