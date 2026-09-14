/* =========================================================
   GeePlays — single source of truth for runtime configuration
   ---------------------------------------------------------
   Everything that might need changing (proxy URL, timeouts,
   local data paths) lives here so it can be edited in one
   place. No API keys ever live in this file — keys stay on
   the server (see /api for the proxy functions).
   ========================================================= */

window.GEEPLAYS_CONFIG = {
  // Serverless proxy that fronts the RAWG API (holds the secret key
  // server-side and adds CORS headers). See /api/rawg.js.
  rawgProxy: "https://geeplays-rawg-proxy-isitgee.vercel.app/api/rawg",

  // Same proxy, news route (server-side RSS parsing). See /api/news.js.
  newsProxy: "https://geeplays-rawg-proxy-isitgee.vercel.app/api/news",

  // Local static fallback datasets (shipped with the site).
  localGames: "data/games.json",
  localNews: "data/news.json",

  // How long to wait on the proxy before declaring it unavailable.
  requestTimeoutMs: 8000,

  // In-memory cache lifetime for identical catalog requests.
  cacheTtlMs: 10 * 60 * 1000,

  // Public repo — used for the "View on GitHub" links.
  repoUrl: "https://github.com/isitGee/GeePlays"
};
