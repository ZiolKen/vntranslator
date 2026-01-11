export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body = req.body || {};
    const { apiKey, ...deeplBody } = body;

    if (!apiKey || typeof apiKey !== "string") {
      return res.status(400).json({ error: "Missing apiKey in request body" });
    }

    if (
      deeplBody.text == null ||
      !(
        typeof deeplBody.text === "string" ||
        (Array.isArray(deeplBody.text) && deeplBody.text.every((x) => typeof x === "string"))
      )
    ) {
      return res.status(400).json({ error: "Missing text (string or string[]) in request body" });
    }

    if (!deeplBody.target_lang || typeof deeplBody.target_lang !== "string") {
      return res.status(400).json({ error: "Missing target_lang in request body" });
    }

    const key = apiKey.trim();
    const baseUrl = key.endsWith(":fx") ? "https://api-free.deepl.com" : "https://api.deepl.com";
    const url = baseUrl + "/v2/translate";

    const dlRes = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "DeepL-Auth-Key " + key,
      },
      body: JSON.stringify(deeplBody),
    });

    const text = await dlRes.text();

    if (!dlRes.ok) {
      console.error("DeepL error:", dlRes.status, text);
      return res.status(dlRes.status).send(text);
    }

    res.status(200).setHeader("Content-Type", "application/json");
    res.send(text);
  } catch (err) {
    console.error("DeepL proxy error:", err);
    res.status(500).json({
      error: "Proxy to DeepL failed",
      detail: String(err),
    });
  }
}