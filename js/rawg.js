/* =========================================================
   GeePlays — RAWG live catalog client
   ---------------------------------------------------------
   Calls the small serverless proxy (see /api/rawg.js) instead
   of RAWG directly, because RAWG's API does not send CORS
   headers that a browser can read.

   Unlike the previous version, this module now *throws* on
   failure. Callers should not call it directly — use the
   catalog facade (js/catalog.js), which catches the failure
   and transparently falls back to the local dataset.
   ========================================================= */

const RAWG_PROXY_BASE = window.GEEPLAYS_CONFIG.rawgProxy;

/* ---------- Genre / platform / tag mappings ----------
   GeePlays' genre chips map to RAWG's query vocabulary.
   RAWG uses fixed genre slugs plus a free-form "tags" vocab. */

const GENRE_QUERY_MAP = {
  "Action": { genres: "action" },
  "Adventure": { genres: "adventure" },
  "Racing": { genres: "racing" },
  "RPG": { genres: "rpg" },
  "Sports": { genres: "sports" },
  "Strategy": { genres: "strategy" },
  "Horror": { tags: "horror" },
  "Multiplayer": { tags: "multiplayer" }
};

const PLATFORM_QUERY_MAP = {
  "Windows": "4",
  "PlayStation": "187,18",
  "Xbox": "186,1",
  "Nintendo Switch": "7",
  "macOS": "5",
  "Linux": "6"
};

// A curated subset of RAWG's free-form tags, offered as filter checkboxes.
const BROWSE_TAGS = [
  "Singleplayer", "Co-op", "Open World", "Story Rich",
  "Atmospheric", "Great Soundtrack", "Difficult", "Funny",
  "Sci-fi", "Fantasy", "Retro"
];

const TAG_SLUG_MAP = {
  "Singleplayer": "singleplayer",
  "Co-op": "co-op",
  "Open World": "open-world",
  "Story Rich": "story-rich",
  "Atmospheric": "atmospheric",
  "Great Soundtrack": "great-soundtrack",
  "Difficult": "difficult",
  "Funny": "funny",
  "Sci-fi": "sci-fi",
  "Fantasy": "fantasy",
  "Retro": "retro"
};

/* ---------- Small in-memory cache (no duplicate requests) ---------- */

const _cache = new Map();

function cacheGet(key) {
  const hit = _cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.time > window.GEEPLAYS_CONFIG.cacheTtlMs) {
    _cache.delete(key);
    return null;
  }
  return hit.data;
}

function cacheSet(key, data) {
  _cache.set(key, { time: Date.now(), data });
  // Keep the cache from growing unbounded.
  if (_cache.size > 200) {
    const first = _cache.keys().next().value;
    _cache.delete(first);
  }
}

/* ---------- Low-level fetch ---------- */

async function rawgFetch(path, params = {}) {
  if (!RAWG_PROXY_BASE) throw new Error("No RAWG proxy configured.");

  const url = new URL(RAWG_PROXY_BASE);
  url.searchParams.set("path", path);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, v);
  });

  const key = url.toString();
  const cached = cacheGet(key);
  if (cached) return cached;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), window.GEEPLAYS_CONFIG.requestTimeoutMs);

  try {
    const res = await fetch(key, { signal: controller.signal });
    if (!res.ok) {
      // 404 is meaningful ("no such game"); 5xx/network issues mean the
      // live backend is unavailable and the catalog facade will fall back
      // to saved picks. The status rides on the error so callers can tell
      // the two apart without ever seeing the raw response.
      const err = new Error(`RAWG proxy error ${res.status}`);
      err.status = res.status;
      throw err;
    }
    const data = await res.json();
    cacheSet(key, data);
    return data;
  } finally {
    clearTimeout(timer);
  }
}

/* ---------- Public API (throws on failure) ---------- */

/**
 * Browse RAWG's catalog with GeePlays-shaped filters.
 * @returns {{results: object[], count: number, hasMore: boolean}}
 * @throws on network/proxy failure.
 */
async function rawgBrowse(opts = {}) {
  const {
    search = "",
    genres = [],
    platforms = [],
    tags = [],
    ordering = "-added",
    dates,
    page = 1,
    pageSize = 24
  } = opts;

  const params = { page, page_size: pageSize, ordering };
  if (search) params.search = search;
  if (dates) params.dates = dates;

  const genreSlugs = [];
  const tagSlugsFromGenre = [];
  genres.forEach(g => {
    const map = GENRE_QUERY_MAP[g];
    if (map?.genres) genreSlugs.push(map.genres);
    if (map?.tags) tagSlugsFromGenre.push(map.tags);
  });
  if (genreSlugs.length) params.genres = genreSlugs.join(",");

  if (platforms.length) {
    const ids = platforms.map(p => PLATFORM_QUERY_MAP[p]).filter(Boolean);
    if (ids.length) params.platforms = ids.join(",");
  }

  const tagSlugs = [...tagSlugsFromGenre, ...tags.map(t => TAG_SLUG_MAP[t]).filter(Boolean)];
  if (tagSlugs.length) params.tags = tagSlugs.join(",");

  const data = await rawgFetch("games", params);
  if (!data || !Array.isArray(data.results)) {
    const message = (data && data.error) ? data.error : "Unexpected response from the game database.";
    throw new Error(message);
  }
  return {
    results: data.results.map(normalizeRawgListItem),
    count: data.count || 0,
    hasMore: Boolean(data.next)
  };
}

async function rawgSearch(query, pageSize = 8) {
  const { results } = await rawgBrowse({ search: query, ordering: "-added", pageSize });
  return results;
}

/**
 * Fetch a single game's full details.
 * @returns {object|null} null when RAWG says the game doesn't exist.
 * @throws on network/proxy failure.
 */
async function rawgGetGame(rawgId) {
  let details;
  try {
    details = await rawgFetch(`games/${rawgId}`);
  } catch (err) {
    // 404 from the proxy means RAWG genuinely has no such game — report
    // "not found" rather than pretending the backend is down.
    if (err && err.status === 404) return null;
    throw err;
  }
  if (!details) return null;
  const [screenshotsRes, storesRes] = await Promise.all([
    rawgFetch(`games/${rawgId}/screenshots`).catch(() => null),
    rawgFetch(`games/${rawgId}/stores`).catch(() => null)
  ]);
  const screenshots = (screenshotsRes && screenshotsRes.results) || [];
  const stores = (storesRes && storesRes.results) || [];
  return normalizeRawgDetail(details, screenshots, stores);
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
    releaseDate: g.released || "",
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
