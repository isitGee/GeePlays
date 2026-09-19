/* =========================================================
   GeePlays — run the repo's api/news.js locally
   ---------------------------------------------------------
   Wraps the real Vercel handler in a plain Node HTTP server
   so the fixed news proxy can be exercised end-to-end
   against the pages, before it is deployed.

   Usage:  node build/local_news_proxy.js [port]     (default 8899)
   ========================================================= */

const http = require("http");
const handler = require(require("path").join(__dirname, "..", "api", "news.js"));

const port = Number(process.argv[2]) || 8899;

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${port}`);

  // Minimal Vercel-ish res shim
  const shim = {
    statusCode: 200,
    headers: {},
    setHeader(k, v) { this.headers[k] = v; },
    status(code) { this.statusCode = code; return this; },
    json(payload) {
      res.writeHead(this.statusCode, { "Content-Type": "application/json", ...this.headers });
      res.end(JSON.stringify(payload));
      return this;
    },
    end() { res.writeHead(this.statusCode, this.headers); res.end(); return this; }
  };

  const query = {};
  url.searchParams.forEach((v, k) => { query[k] = v; });

  try {
    await handler({ method: req.method, query, url: req.url }, shim);
  } catch (err) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: String(err && err.message) }));
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`GeePlays local news proxy (repo api/news.js) → http://127.0.0.1:${port}/api/news`);
});
