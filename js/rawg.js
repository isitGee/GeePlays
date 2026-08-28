/* =========================================================
   GeePlays — RAWG live catalog integration
   Calls a small proxy (see /rawg-proxy) instead of RAWG directly,
   since RAWG's API doesn't support browser CORS requests.
   Everything here fails quietly: if the proxy isn't configured yet,
   or a request fails, callers just get an empty result instead of
   a broken page.
   ========================================================= */

// Deployed proxy (see /rawg-proxy). This will 500 until RAWG_API_KEY is
// set in the Vercel project's Environment Variables — see the README.
const RAWG_PROXY_BASE = "https://geeplays-rawg-proxy-isitgee.vercel.app/api/rawg";

async function rawgFetch(path, params = {}) {
  if (!RAWG_PROXY_BASE) return null; // proxy not configured yet
  const url = new URL(RAWG_PROXY_BASE);
  url.searchParams.set("path", path);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, v);
  });
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`RAWG proxy error ${res.status}`);
  return res.json();
}

/* ---------- Public API ---------- */

async function rawgSearch(query, pageSize = 8) {
  try {
    const data = await rawgFetch("games", { search: query, page_size: pageSize });
    if (!data || !data.results) return [];
    return data.results.map(normalizeRawgListItem);
  } catch (err) {
    console.error("GeePlays: RAWG search failed.", err);
    return [];
  }
}

async function rawgGetGame(rawgId) {
  try {
    const [details, screenshotsRes, storesRes] = await Promise.all([
      rawgFetch(`games/${rawgId}`),
      rawgFetch(`games/${rawgId}/screenshots`).catch(() => null),
      rawgFetch(`games/${rawgId}/stores`).catch(() => null)
    ]);
    if (!details || details.detail) return null; // RAWG returns {detail:"Not found."} on 404
    const screenshots = (screenshotsRes && screenshotsRes.results) || [];
    const stores = (storesRes && storesRes.results) || [];
    return normalizeRawgDetail(details, screenshots, stores);
  } catch (err) {
    console.error("GeePlays: RAWG game lookup failed.", err);
    return null;
  }
}

/* ---------- Normalizers: RAWG shape -> GeePlays game shape ---------- */

function normalizeRawgListItem(g) {
  return {
    id: `rawg-${g.id}`,
    rawgId: g.id,
    source: "rawg",
    title: g.name,
    slug: g.slug,
    cover: g.background_image || "",
    shortDescription: (g.genres || []).map(x => x.name).join(" · ") || "Live result from RAWG",
    genre: (g.genres || []).map(x => x.name),
    platforms: (g.platforms || []).map(p => p.platform.name),
    rating: rawgRatingToTen(g.rating),
    tags: (g.tags || []).slice(0, 6).map(t => t.name)
  };
}

function normalizeRawgDetail(g, screenshots, stores) {
  const bestStore = pickBestStore(stores);
  const searchQuery = encodeURIComponent(`${g.name} official trailer`);
  return {
    id: `rawg-${g.id}`,
    rawgId: g.id,
    source: "rawg",
    title: g.name,
    slug: g.slug,
    cover: g.background_image || "",
    banner: g.background_image || "",
    shortDescription: stripHtml(g.description_raw || g.description || "").slice(0, 160),
    description: stripHtml(g.description_raw || g.description || "") || "No description available from RAWG.",
    genre: (g.genres || []).map(x => x.name),
    developer: (g.developers || []).map(x => x.name).join(", ") || "Unknown",
    publisher: (g.publishers || []).map(x => x.name).join(", ") || "Unknown",
    releaseDate: g.released || "",
    platforms: (g.platforms || []).map(p => p.platform.name),
    rating: rawgRatingToTen(g.rating),
    requirements: extractRequirements(g),
    screenshots: screenshots.map(s => s.image).filter(Boolean),
    youtube: null,
    youtubeSearchUrl: `https://www.youtube.com/results?search_query=${searchQuery}`,
    download: bestStore ? { label: "Get Game", url: bestStore.url } : null,
    tags: (g.tags || []).slice(0, 8).map(t => t.name)
  };
}

function rawgRatingToTen(rating) {
  // RAWG rates out of 5; GeePlays' rating bar expects out of 10.
  if (!rating) return 0;
  return Math.round(rating * 2 * 10) / 10;
}

const STORE_PRIORITY = ["steam", "gog", "epic-games", "playstation-store", "xbox-store", "nintendo", "itch"];

function pickBestStore(stores) {
  if (!stores || !stores.length) return null;
  const withUrl = stores.filter(s => s.url);
  if (!withUrl.length) return null;
  withUrl.sort((a, b) => {
    const ai = STORE_PRIORITY.indexOf(a.store?.slug);
    const bi = STORE_PRIORITY.indexOf(b.store?.slug);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });
  return withUrl[0];
}

function extractRequirements(g) {
  const pcEntry = (g.platforms || []).find(
    p => p.platform && p.platform.name === "PC" && p.requirements_en
  );
  if (!pcEntry) return {};
  const req = pcEntry.requirements_en;
  const out = {};
  if (req.minimum) out.minimum = { os: stripHtml(req.minimum) };
  if (req.recommended) out.recommended = { os: stripHtml(req.recommended) };
  return out;
}

function stripHtml(str) {
  if (!str) return "";
  return str.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}
