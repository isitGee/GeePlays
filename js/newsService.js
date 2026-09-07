/* =========================================================
   GeePlays — News Service
   The UI (news.js) only ever calls getGamingNews(). It has no
   idea where the data actually comes from — that's the point.
   Swap NEWS_PROVIDER or the RSS_FEEDS list below and nothing
   in news.js needs to change.

   Providers:
     "rss"  — default. Reads official publisher RSS feeds through
              the GeePlays proxy (server-side parsed, since RSS
              feeds don't send CORS headers for browser fetches
              either — same problem as RAWG, same fix).
     "api"  — placeholder for a real gaming-news API in the future.
              Point API_ENDPOINT at your proxy route and implement
              fetchFromApi() to call it; getGamingNews() already
              routes here automatically once configured.
   ========================================================= */

const NEWS_PROVIDER = "rss"; // "rss" | "api"

// Same deployed proxy used for RAWG — see /rawg-proxy/api/news.js
const NEWS_PROXY_BASE = "https://geeplays-rawg-proxy-isitgee.vercel.app/api/news";

const NEWS_CATEGORIES = ["Gaming", "Xbox", "PlayStation", "Nintendo", "PC"];

/* ---------- Public API ---------- */

async function getGamingNews() {
  if (NEWS_PROVIDER === "api") {
    return fetchFromApi();
  }
  return fetchFromRss();
}

/* ---------- RSS provider (default) ---------- */

async function fetchFromRss() {
  const res = await fetch(NEWS_PROXY_BASE);
  if (!res.ok) throw new Error(`News proxy error ${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data.articles)) throw new Error("Unexpected news response shape");
  return data.articles.map(normalizeArticle);
}

/* ---------- API provider (placeholder for later) ---------- */

async function fetchFromApi() {
  // Example shape once a real gaming-news API is wired up:
  // const res = await fetch(`${NEWS_PROXY_BASE_API}?...`);
  // const data = await res.json();
  // return data.results.map(normalizeArticle);
  throw new Error("NEWS_PROVIDER is set to 'api' but no API integration is configured yet.");
}

/* ---------- Normalizer ----------
   Whatever the source, every article the UI receives has this
   exact shape: */

function normalizeArticle(a) {
  return {
    title: a.title || "Untitled",
    description: a.description || "",
    image: a.image || "",
    source: a.source || "Unknown source",
    sourceUrl: a.sourceUrl || "#",
    articleUrl: a.articleUrl || a.sourceUrl || "#",
    publishedAt: a.publishedAt || "",
    category: a.category || "Gaming"
  };
}
