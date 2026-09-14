/* =========================================================
   GeePlays — local catalog (the offline fallback)
   ---------------------------------------------------------
   Loads data/games.json (a hand-curated set of games that
   ships with the site) and exposes the exact same browsing
   surface as the RAWG client, so the UI never has to care
   where a game came from.

   Every local game is normalized into the same shape as a
   RAWG result, so card and detail rendering are identical
   for both sources.
   ========================================================= */

let _localGamesPromise = null;

async function loadLocalGames() {
  if (!_localGamesPromise) {
    _localGamesPromise = fetch(window.GEEPLAYS_CONFIG.localGames)
      .then(res => {
        if (!res.ok) throw new Error(`Failed to load ${window.GEEPLAYS_CONFIG.localGames}`);
        return res.json();
      })
      .then(list => (Array.isArray(list) ? list.map(normalizeLocalGame) : []))
      .catch(err => {
        console.error("GeePlays: could not load local game data.", err);
        _localGamesPromise = null; // allow a retry next time
        return [];
      });
  }
  return _localGamesPromise;
}

/* ---------- Normalizer: local entry -> GeePlays game shape ---------- */

function normalizeLocalGame(g) {
  return {
    id: g.id,
    rawgId: null,
    source: "local",
    title: g.title,
    slug: g.slug || g.id,
    cover: g.cover || "",
    banner: g.banner || g.cover || "",
    shortDescription: g.shortDescription || "",
    description: g.description || g.shortDescription || "",
    genre: Array.isArray(g.genre) ? g.genre : [],
    developer: g.developer || "Unknown",
    publisher: g.publisher || "Unknown",
    releaseDate: g.releaseDate || "",
    platforms: Array.isArray(g.platforms) ? g.platforms : [],
    rating: Number(g.rating) || 0,
    requirements: g.requirements || {},
    screenshots: Array.isArray(g.screenshots) ? g.screenshots.filter(Boolean) : [],
    youtube: g.youtube || null,
    youtubeSearchUrl: g.youtubeSearchUrl ||
      `https://www.youtube.com/results?search_query=${encodeURIComponent(`${g.title} official trailer`)}`,
    download: g.download || null,
    tags: Array.isArray(g.tags) ? g.tags : []
  };
}

/* ---------- Genre label mapping ----------
   Local games carry free-form genre labels ("Action RPG",
   "Roguelike", "Co-op"…) while the filter UI exposes the eight
   GeePlays genres. This maps a filter choice to the local
   labels that satisfy it. */

const LOCAL_GENRE_MAP = {
  "Action": ["Action", "Action RPG", "Roguelike", "Souls-like", "Metroidvania", "Shooter"],
  "Adventure": ["Adventure", "Open World"],
  "Racing": ["Racing"],
  "RPG": ["RPG", "Action RPG", "JRPG"],
  "Sports": ["Sports"],
  "Strategy": ["Strategy", "4X", "Turn-Based"],
  "Horror": ["Horror", "Psychological"],
  "Multiplayer": ["Multiplayer", "Co-op"]
};

function genreSatisfies(localGenres, filterGenre) {
  const labels = LOCAL_GENRE_MAP[filterGenre] || [filterGenre];
  return localGenres.some(g => labels.some(l => g.toLowerCase() === l.toLowerCase()));
}

function platformMatches(localPlatforms, filterPlatform) {
  return localPlatforms.some(p => {
    const pp = p.toLowerCase();
    const fp = filterPlatform.toLowerCase();
    if (fp === "playstation") return pp.startsWith("playstation");
    if (fp === "xbox") return pp.startsWith("xbox");
    if (fp === "nintendo switch") return pp.includes("switch");
    return pp === fp;
  });
}

function matchesSearch(game, search) {
  if (!search) return true;
  const q = search.toLowerCase();
  const haystack = [
    game.title,
    game.developer,
    game.publisher,
    ...(game.genre || []),
    ...(game.tags || [])
  ].join(" ").toLowerCase();
  return haystack.includes(q);
}

/* ---------- Sorting ---------- */

function compareByReleasedDesc(a, b) {
  return (new Date(b.releaseDate || 0) - new Date(a.releaseDate || 0));
}

function compareByRatingDesc(a, b) {
  return (b.rating || 0) - (a.rating || 0);
}

/* ---------- Public API (same surface as rawg.js) ---------- */

/**
 * Browse the local catalog with the same filter options the RAWG
 * client accepts. Never throws — returns an empty result on failure.
 */
async function localBrowse(opts = {}) {
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

  const all = await loadLocalGames();

  let filtered = all.filter(g => {
    if (!matchesSearch(g, search)) return false;
    if (genres.length && !genres.some(genre => genreSatisfies(g.genre, genre))) return false;
    if (platforms.length && !platforms.some(p => platformMatches(g.platforms, p))) return false;
    if (tags.length && !tags.some(t => (g.tags || []).some(gt => gt.toLowerCase() === t.toLowerCase()))) return false;
    if (dates) {
      const [start, end] = dates.split(",");
      if (start || end) {
        const released = g.releaseDate;
        if (!released) return false;
        if (start && released < start) return false;
        if (end && released > end) return false;
      }
    }
    return true;
  });

  if (ordering === "-released") filtered.sort(compareByReleasedDesc);
  else filtered.sort(compareByRatingDesc);

  const total = filtered.length;
  const start = (page - 1) * pageSize;
  const results = filtered.slice(start, start + pageSize);

  return {
    results,
    count: total,
    hasMore: start + results.length < total
  };
}

async function localGetGame(idOrSlug) {
  const all = await loadLocalGames();
  return all.find(g => g.id === idOrSlug || g.slug === idOrSlug) || null;
}

async function localFeatured(limit = 4) {
  const all = await loadLocalGames();
  return [...all].sort(compareByRatingDesc).slice(0, limit);
}

async function localLatest(limit = 4, sinceDays = 90) {
  const all = await loadLocalGames();
  const cutoff = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000)
    .toISOString().slice(0, 10);
  const recent = all
    .filter(g => g.releaseDate && g.releaseDate >= cutoff)
    .sort(compareByReleasedDesc);
  return (recent.length ? recent : [...all].sort(compareByReleasedDesc)).slice(0, limit);
}
