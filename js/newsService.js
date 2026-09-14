/* =========================================================
   GeePlays — News Service
   ---------------------------------------------------------
   The UI (news.js) only ever calls getGamingNews(). It has no
   idea where the data actually comes from — that's the point.

   Primary source:  official publisher RSS feeds, parsed
                   server-side by the proxy (RSS feeds don't
                   send CORS headers, same as RAWG).
   Fallback:        data/news.json — saved stories shipped with
                   the site, so the News page never goes blank.

   Returns: { articles, source, degraded, message }
     source    — "live" | "local"
     degraded  — true when we fell back to the saved stories
   ========================================================= */

const NEWS_PROVIDER = "rss"; // "rss" | "api"

const NEWS_PROXY_BASE = window.GEEPLAYS_CONFIG.newsProxy;

const NEWS_CATEGORIES = ["Gaming", "Xbox", "PlayStation", "Nintendo", "PC"];

/* ---------- Public API ---------- */

async function getGamingNews() {
  try {
    const articles = await fetchFromRss();
    if (articles.length) {
      return { articles, source: "live", degraded: false, message: "" };
    }
    throw new Error("Empty live feed");
  } catch (err) {
    console.warn("GeePlays: live news feed unavailable, using saved stories.", err && err.message);
    const articles = await fetchLocalNews();
    return {
      articles,
      source: "local",
      degraded: true,
      message: "Live news is temporarily unavailable — showing saved stories instead."
    };
  }
}

/* ---------- Live RSS provider (via proxy) ---------- */

async function fetchFromRss() {
  const res = await fetch(NEWS_PROXY_BASE);
  if (!res.ok) throw new Error(`News proxy error ${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data.articles)) throw new Error("Unexpected news response shape");
  return data.articles.map(normalizeArticle);
}

/* ---------- Local fallback provider ---------- */

async function fetchLocalNews() {
  try {
    const res = await fetch(window.GEEPLAYS_CONFIG.localNews);
    if (!res.ok) throw new Error("Failed to load local news");
    const data = await res.json();
    if (!Array.isArray(data)) return [];
    return data.map(normalizeArticle);
  } catch (err) {
    console.error("GeePlays: could not load local news.", err);
    return [];
  }
}

/* ---------- Normalizer ----------
   Whatever the source, every article the UI receives has this
   exact shape: */

function normalizeArticle(a) {
  return {
    title: a.title || "Untitled",
    description: a.description || "",
    image: a.image || "",
    source: a.source || "GeePlays",
    sourceUrl: a.sourceUrl || "#",
    articleUrl: a.articleUrl || a.url || a.sourceUrl || "#",
    publishedAt: a.publishedAt || a.date || "",
    category: a.category || "Gaming"
  };
}
