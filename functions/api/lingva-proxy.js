const BASES = [
  "https://lingva.lunar.icu",
  "https://lingva.dialectapp.org",
  "https://lingva.ml",
  "https://lingva.vercel.app",
  "https://translate.plausibility.cloud",
  "https://lingva.garudalinux.org",
];

async function tryOnce(base, source, target, text) {
  const url = base.replace(/\/$/, "") + "/api/v1/" + encodeURIComponent(source) + "/" + encodeURIComponent(target) + "/" + encodeURIComponent(text);
  const r = await fetch(url, { method: "GET" });
  if (!r.ok) throw new Error("HTTP " + r.status);
  const data = await r.json();
  const t = data?.translation;
  if (typeof t !== "string") throw new Error("Missing translation");
  return t;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const source = String(body.source || "auto");
    const target = String(body.target || "en");
    const text = String(body.text || "");
    if (!text) {
      res.status(400).json({ error: "Missing text" });
      return;
    }

    let lastErr = null;
    for (const base of BASES) {
      try {
        const t = await tryOnce(base, source, target, text);
        res.status(200).json({ translation: t, base });
        return;
      } catch (e) {
        lastErr = e;
      }
    }

    res.status(502).json({ error: String(lastErr?.message || lastErr || "Lingva failed") });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
}
