// GeePlays RAWG proxy
//
// This is the only piece of "backend" in the whole project. It exists for
// one reason: RAWG's API does not send an Access-Control-Allow-Origin
// header, so browsers block GeePlays (a static site) from calling RAWG
// directly. This tiny function sits in between, holds the secret API key
// server-side, and adds the header the browser needs.
//
// Set RAWG_API_KEY as an Environment Variable in the Vercel project
// dashboard — never put the real key in this file.
//
// Usage from the site:
//   /api/rawg?path=games&search=hades&page_size=12
//   /api/rawg?path=games/58175/screenshots
//   /api/rawg?path=games/58175/stores

const RAWG_BASE = "https://api.rawg.io/api";

// Restrict which RAWG endpoints this proxy is willing to forward to.
const SAFE_PATH = /^[a-zA-Z0-9/_-]+$/;

module.exports = async (req, res) => {
  const allowedOrigin = process.env.ALLOWED_ORIGIN || "*";
  res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "s-maxage=1800, stale-while-revalidate=3600");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "GET") {
    res.status(405).json({ error: "Only GET is supported." });
    return;
  }

  const apiKey = process.env.RAWG_API_KEY;
  if (!apiKey) {
    res.status(500).json({
      error: "Server misconfigured: RAWG_API_KEY environment variable is not set."
    });
    return;
  }

  const { path, ...query } = req.query || {};

  if (!path || typeof path !== "string" || !SAFE_PATH.test(path)) {
    res.status(400).json({ error: "Missing or invalid 'path' query parameter." });
    return;
  }

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (Array.isArray(value)) {
      value.forEach((v) => params.append(key, v));
    } else if (value !== undefined) {
      params.append(key, String(value));
    }
  }
  params.set("key", apiKey);

  const url = `${RAWG_BASE}/${path}?${params.toString()}`;

  try {
    const rawgRes = await fetch(url);
    const data = await rawgRes.json();
    res.status(rawgRes.status).json(data);
  } catch (err) {
    res.status(502).json({ error: "Failed to reach RAWG API.", detail: String(err) });
  }
};
