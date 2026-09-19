// GeePlays News proxy
//
// Same reasoning as api/rawg.js: RSS feeds don't send an
// Access-Control-Allow-Origin header either, so a static site can't fetch
// them directly from the browser. This function fetches each feed
// server-side (where CORS doesn't apply), parses the RSS/XML, normalizes
// every article into the shape GeePlays' UI expects, and returns JSON.
//
// IMPORTANT: this file must live at the ROOT of the Vercel project as
// /api/news.js so Vercel deploys it as a serverless function at /api/news.
//
// This deliberately reads from each publisher's own official RSS feed
// rather than scraping or republishing full articles: every article keeps
// its real source name, a link back to the original, and only a short
// excerpt — never the full text.
//
// To add/remove a source, just edit the FEEDS list below. Nothing in the
// frontend (newsService.js / news.js) needs to change.

const Parser = require("rss-parser");

const parser = new Parser({
  timeout: 8000,
  customFields: {
    item: [
      ["content:encoded", "contentEncoded"],
      ["media:content", "mediaContent"]
    ]
  }
});

const FEEDS = [
  { url: "https://news.xbox.com/en-us/feed", source: "Xbox Wire", category: "Xbox" },
  { url: "https://blog.playstation.com/feed", source: "PlayStation Blog", category: "PlayStation" },
  { url: "https://www.nintendolife.com/feeds/latest", source: "Nintendo Life", category: "Nintendo" },
  { url: "https://www.pcgamer.com/rss/", source: "PC Gamer", category: "PC" }
];

const ARTICLES_PER_FEED = 10;
const MAX_ARTICLES = 40;

module.exports = async (req, res) => {
  const allowedOrigin = process.env.ALLOWED_ORIGIN || "*";
  res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Cache-Control", "s-maxage=900, stale-while-revalidate=1800");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  const settled = await Promise.allSettled(FEEDS.map(fetchFeed));
  const articles = [];
  const failedSources = [];

  settled.forEach((result, i) => {
    if (result.status === "fulfilled") {
      articles.push(...result.value);
    } else {
      failedSources.push(FEEDS[i].source);
      console.error(`GeePlays news proxy: ${FEEDS[i].source} failed —`, result.reason?.message);
    }
  });

  if (articles.length === 0) {
    res.status(502).json({
      error: "Could not load any gaming news feeds right now.",
      failedSources
    });
    return;
  }

  articles.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));

  res.status(200).json({
    articles: articles.slice(0, MAX_ARTICLES),
    partial: failedSources.length > 0,
    failedSources
  });
};

async function fetchFeed(feed) {
  const parsed = await parser.parseURL(feed.url);
  return (parsed.items || [])
    .slice(0, ARTICLES_PER_FEED)
    .map(item => normalizeItem(item, feed));
}

function normalizeItem(item, feed) {
  return {
    title: stripHtml(item.title || "Untitled"),
    description: stripHtml(item.contentSnippet || item.summary || item.contentEncoded || "").slice(0, 220),
    image: extractImage(item, feed),
    source: feed.source,
    sourceUrl: safeOrigin(feed.url),
    articleUrl: item.link || feed.url,
    publishedAt: item.isoDate || item.pubDate || "",
    category: feed.category
  };
}

/**
 * Pick the best real <img>-able picture for an article.
 *
 * Two upstream traps this deliberately avoids (both seen in the wild on the
 * feeds GeePlays reads):
 *   1. Video enclosures. PlayStation Blog attaches `video/mp4` enclosures to
 *      trailer posts — taken blindly, that URL lands in an <img>, so the card
 *      is broken *and* the browser is asked for a ~21 MB video it can never
 *      render. Only `image/*` assets are ever considered.
 *   2. HTML entities inside URLs. Xbox Wire writes `&#x2122;` for ™ inside
 *      its image filenames; used literally the request 404s, so entities are
 *      decoded before the URL is resolved and re-encoded.
 *
 * Candidates are tried in order of trustworthiness: an image enclosure /
 * media asset first, then every <img> in the article body.
 */
function extractImage(item, feed) {
  const candidates = [];
  collectMedia(candidates, item.enclosure);
  collectMedia(candidates, item.mediaContent);
  collectMedia(candidates, item.mediaThumbnail);

  const html = item.contentEncoded || item.content || "";
  // Some feeds use double quotes, some single — match both. Every <img> in
  // document order, so an exact first-choice image is still preferred.
  for (const match of html.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)) {
    candidates.push({ url: match[1] });
  }
  // A few feeds inline their og:image as a meta tag instead.
  for (const match of html.matchAll(/<meta[^>]+(?:property|name)=["']og:image["'][^>]+content=["']([^"']+)["']/gi)) {
    candidates.push({ url: match[1] });
  }

  for (const candidate of candidates) {
    // An explicit non-image type (video/mp4, audio/…) is never an <img>.
    if (candidate.type && !/^image\//i.test(candidate.type)) continue;
    const url = safeImageUrl(decodeEntities(candidate.url), feed);
    if (!url) continue;
    // Even inside an <img> tag, a video file is a video file.
    if (VIDEO_EXT.test(url)) continue;
    return url;
  }
  return "";
}

/** Normalize one rss-parser media shape (object, array, or { $: {…} }). */
function collectMedia(out, media) {
  if (!media) return;
  if (Array.isArray(media)) {
    media.forEach(m => collectMedia(out, m));
    return;
  }
  const url = media.url || (media.$ && media.$.url);
  if (!url) return;
  const type = media.type || (media.$ && media.$.type) || "";
  out.push({ url, type });
}

const VIDEO_EXT = /\.(mp4|m4v|mov|webm|ogv|avi|mkv|m3u8|mpd|ts)(\?|#|$)/i;

/**
 * Decode HTML entities that appear *inside* an extracted URL
 * (`&#x2122;`, `&amp;`, …). Without this, Xbox Wire's `…FC™-27_Social…jpg`
 * becomes a literal `&#x2122;` in the request and 404s. `&amp;` is decoded
 * last so an encoded ampersand is not double-decoded.
 */
function decodeEntities(str) {
  return String(str)
    .replace(/&#x([0-9a-f]{1,6});/gi, (_, hex) => codePoint(parseInt(hex, 16)))
    .replace(/&#(\d{1,7});/g, (_, dec) => codePoint(parseInt(dec, 10)))
    .replace(/&quot;/gi, '"')
    .replace(/&apos;|&#0?39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&");
}

function codePoint(value) {
  if (!Number.isFinite(value) || value < 0 || value > 0x10ffff) return "";
  if (value >= 0xd800 && value <= 0xdfff) return ""; // lone surrogate
  try {
    return String.fromCodePoint(value);
  } catch {
    return "";
  }
}

/**
 * Make an extracted image URL actually loadable in a visitor's browser:
 * resolve relative/protocol-relative URLs against the feed we came from,
 * and drop anything that isn't plain http(s) (data: URIs, javascript:, …).
 * Returns "" when nothing usable is found — the UI then renders its
 * branded placeholder instead of a broken image.
 */
function safeImageUrl(src, feed) {
  if (!src) return "";
  const candidate = String(src).trim();
  if (/^(data|javascript|blob|vbscript):/i.test(candidate)) return "";
  // An <img> in the markup whose src is a page, not a picture.
  if (/(youtube\.com|youtu\.be|vimeo\.com)\//i.test(candidate) && !/\.(jpe?g|png|gif|webp|avif)(\?|$)/i.test(candidate)) return "";
  if (/^\/\//i.test(candidate)) return "https:" + candidate;
  if (/^https?:\/\//i.test(candidate)) {
    try { return new URL(candidate).href; } catch { return ""; }
  }
  // Relative URL — resolve it against the feed's own URL (relative to
  // the article link would usually land on a nonexistent article path).
  const base = feed && feed.url;
  if (!base) return "";
  try {
    const u = new URL(candidate, base);
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : "";
  } catch {
    return "";
  }
}

function stripHtml(str) {
  return String(str).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function safeOrigin(url) {
  try {
    return new URL(url).origin;
  } catch {
    return url;
  }
}
