// GeePlays News proxy
//
// Same reasoning as api/rawg.js: RSS feeds don't send an
// Access-Control-Allow-Origin header either, so a static site can't fetch
// them directly from the browser. This function fetches each feed
// server-side (where CORS doesn't apply), parses the RSS/XML, normalizes
// every article into the shape GeePlays' UI expects, and returns JSON.
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
    image: extractImage(item),
    source: feed.source,
    sourceUrl: safeOrigin(feed.url),
    articleUrl: item.link || feed.url,
    publishedAt: item.isoDate || item.pubDate || "",
    category: feed.category
  };
}

function extractImage(item) {
  if (item.enclosure && item.enclosure.url) return item.enclosure.url;
  if (item.mediaContent && item.mediaContent.$ && item.mediaContent.$.url) return item.mediaContent.$.url;
  const html = item.contentEncoded || item.content || "";
  const match = html.match(/<img[^>]+src="([^"]+)"/);
  return match ? match[1] : "";
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
