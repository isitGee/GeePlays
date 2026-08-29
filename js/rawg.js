/* =========================================================
   GeePlays — RAWG live catalog integration
   Calls a small proxy (see /rawg-proxy) instead of RAWG directly,
   since RAWG's API doesn't support browser CORS requests.
   Everything here fails quietly: if the proxy isn't configured yet,
   or a request fails, callers just get an empty result instead of
   a broken page.

   This module now powers full catalog browsing (games.html, the
   homepage, and game.html) — not just the search box — so GeePlays
   can show RAWG's whole 500,000+ game library instead of a small
   hand-picked list.
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

/* ---------- Genre / platform / tag mappings ----------
   GeePlays' genre chips map to RAWG's actual query vocabulary.
   RAWG uses fixed genre slugs (action, adventure, rpg, etc.) plus a much
   larger free-form "tags" vocabulary. A couple of GeePlays' genres
   (Horror, Multiplayer) aren't canonical RAWG genres, so those go through
   `tags` instead — the browse function below merges both transparently. */

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

// A fixed set of popular RAWG tags, offered as extra filter checkboxes
// (RAWG's real tag list has thousands of free-form entries, so GeePlays
// only surfaces a curated, useful subset here).
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

/* ---------- Public API ---------- */

/**
 * Browse RAWG's catalog with GeePlays-shaped filters. Powers the homepage
 * sections, the Games page default listing, and search-within-filters.
 *
 * @param {object} opts
 * @param {string} [opts.search] - free text search
 * @param {string[]} [opts.genres] - GeePlays genre labels, e.g. ["Action"]
 * @param {string[]} [opts.platforms] - GeePlays platform labels
 * @param {string[]} [opts.tags] - GeePlays tag labels (from BROWSE_TAGS)
 * @param {string} [opts.ordering] - RAWG ordering param, default "-added"
 * @param {string} [opts.dates] - "YYYY-MM-DD,YYYY-MM-DD" release window
 * @param {number} [opts.page]
 * @param {number} [opts.pageSize]
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

  try {
    const data = await rawgFetch("games", params);
    if (!data || !data.results) return { results: [], count: 0, hasMore: false };
    return {
      results: data.results.map(normalizeRawgListItem),
      count: data.count || 0,
      hasMore: Boolean(data.next)
    };
  } catch (err) {
    console.error("GeePlays: RAWG browse failed.", err);
    return { results: [], count: 0, hasMore: false };
  }
}

async function rawgSearch(query, pageSize = 8) {
  const { results } = await rawgBrowse({ search: query, ordering: "-added", pageSize });
  return results;
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
