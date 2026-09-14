// GeePlays RAWG proxy
//
// This is the only piece of "backend" in the whole project. It exists for
// one reason: RAWG's API does not send an Access-Control-Allow-Origin
// header, so browsers block GeePlays (a static site) from calling RAWG
// directly. This tiny function sits in between, holds the secret API key
// server-side, and adds the header the browser needs.
//
// SECURITY NOTES — read before changing anything:
// * The key only ever lives in the server-side environment variable
//   RAWG_API_KEY. It is never written into any response.
// * RAWG echoes the key inside the `next` / `previous` pagination URLs in
//   its responses. Those fields are therefore *scrubbed* here (replaced
//   with plain booleans) before anything is sent to the browser — that
//   echo is how the key was leaking in an earlier version of this proxy.
// * Non-OK responses are replaced with a small, generic error object.
//   RAWG's raw body is never forwarded verbatim, so nothing upstream can
//   sneak a secret (or a scary message) through to visitors.
//
// IMPORTANT: this file must live at the ROOT of the Vercel project as
// /api/rawg.js so Vercel deploys it as a serverless function at /api/rawg.
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

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "GET") {
    res.setHeader("Cache-Control", "no-store");
    res.status(405).json({ error: "Only GET is supported." });
    return;
  }

  const apiKey = process.env.RAWG_API_KEY;
  if (!apiKey) {
    // Never reveal configuration details to visitors.
    res.setHeader("Cache-Control", "no-store");
    res.status(502).json({ error: "Game database temporarily unavailable." });
    return;
  }

  const { path, ...query } = req.query || {};

  if (!path || typeof path !== "string" || !SAFE_PATH.test(path)) {
    res.setHeader("Cache-Control", "no-store");
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
    let data;
    try {
      data = await rawgRes.json();
    } catch {
      data = null;
    }

    if (!rawgRes.ok) {
      // Forward the status code (the frontend uses 404 to mean "this game
      // doesn't exist") but NOT the upstream body — build our own message.
      res.setHeader("Cache-Control", "no-store");
      const message =
        rawgRes.status === 404
          ? "Not found."
          : rawgRes.status === 429
            ? "Upstream rate limit reached, try again shortly."
            : "Game database temporarily unavailable.";
      res.status(rawgRes.status).json({ error: message });
      return;
    }

    // Cache successful catalog reads at the edge for a short while — the
    // RAWG free tier is rate-limited, so this saves quota for everyone.
    res.setHeader("Cache-Control", "s-maxage=1800, stale-while-revalidate=3600");
    res.status(200).json(scrub(data));
  } catch (err) {
    console.error("GeePlays RAWG proxy: upstream fetch failed —", err && err.message);
    res.setHeader("Cache-Control", "no-store");
    res.status(502).json({ error: "Game database temporarily unavailable." });
  }
};

/**
 * Recursively remove RAWG pagination links (`next` / `previous`), which
 * embed the API key, replacing them with plain booleans so the frontend
 * can still tell whether more results exist. Anything else that looks
 * like a RAWG URL with a `key=` query parameter is dropped defensively.
 */
function scrub(data) {
  if (Array.isArray(data)) {
    return data.map(scrub);
  }
  if (data && typeof data === "object") {
    const out = {};
    for (const [k, v] of Object.entries(data)) {
      if (k === "next" || k === "previous") {
        out[k] = typeof v === "string" && v.length > 0 ? true : null;
      } else if (typeof v === "string" && v.includes("api.rawg.io/") && v.includes("key=")) {
        // Defensive: never let a key-bearing RAWG URL escape the proxy.
      } else {
        out[k] = scrub(v);
      }
    }
    return out;
  }
  return data;
}
