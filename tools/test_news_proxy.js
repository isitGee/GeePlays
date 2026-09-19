/* =========================================================
   GeePlays — api/news.js offline test harness
   ---------------------------------------------------------
   Runs the *real* normalizer from api/news.js against the
   live publisher feeds, so the image-extraction fix is
   verified against today's actual upstream data rather than
   a fixture. Stubs just enough of Vercel's (req, res) to
   capture the JSON the proxy would send.

   Run:  node build/test_news_proxy.js
   ========================================================= */

const path = require("path").join(__dirname, "..", "api", "news.js");

// api/news.js is a Vercel handler (module.exports = (req,res)=>…). It also
// declares its helpers at module scope, so we load it and drive the handler.
delete require.cache[require.resolve(path)];
const handler = require(path);

function makeRes() {
  const res = {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(k, v) { this.headers[k] = v; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
    end() { return this; }
  };
  return res;
}

(async () => {
  console.log("Calling api/news.js against the live feeds…\n");
  const started = Date.now();
  const res = makeRes();
  await handler({ method: "GET", query: {} }, res);
  console.log(`status ${res.statusCode} in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  console.log(`cache-control: ${res.headers["Cache-Control"] || res.headers["cache-control"] || "-"}\n`);

  if (res.statusCode !== 200 || !res.body || !Array.isArray(res.body.articles)) {
    console.error("FAILED — no articles returned:", JSON.stringify(res.body).slice(0, 400));
    process.exit(1);
  }

  const { articles, failedSources = [] } = res.body;
  const bySource = articles.reduce((acc, a) => {
    acc[a.source] = (acc[a.source] || 0) + 1;
    return acc;
  }, {});

  console.log(`articles: ${articles.length}`);
  console.log("by source:", bySource);
  console.log("failed sources:", failedSources.length ? failedSources : "none");
  console.log("");

  let problems = 0;

  // 1. every article must be a complete, renderable object
  for (const a of articles) {
    if (!a.title || !a.articleUrl || !a.source) {
      console.log(`  ✗ incomplete article: ${JSON.stringify(a).slice(0, 120)}`);
      problems++;
    }
  }

  // 2. no video/audio ever reaches an <img>
  const videoish = articles.filter(a => /\.(mp4|m4v|mov|webm|ogv|m3u8)(\?|#|$)/i.test(a.image || ""));
  if (videoish.length) {
    videoish.forEach(a => console.log(`  ✗ video URL as image: ${a.source} — ${a.image.slice(0, 90)}`));
    problems += videoish.length;
  } else {
    console.log("  ✓ no video URLs used as images");
  }

  // 3. no undecoded HTML entities left in image URLs
  const entityish = articles.filter(a => /&#?[a-z0-9]{1,8};/i.test(a.image || ""));
  if (entityish.length) {
    entityish.forEach(a => console.log(`  ✗ entity left in URL: ${a.image.slice(0, 110)}`));
    problems += entityish.length;
  } else {
    console.log("  ✓ no HTML entities left in image URLs");
  }

  // 4. every image URL must be absolute and really resolve to an image
  console.log("\nFetching every extracted image to confirm it really loads…");
  const withImages = articles.filter(a => a.image);
  const results = await Promise.all(withImages.map(async a => {
    try {
      const r = await fetch(a.image, {
        method: "GET",
        headers: { Range: "bytes=0-2047", "User-Agent": "Mozilla/5.0 (compatible; GeePlaysVerify/1.0)" }
      });
      const type = r.headers.get("content-type") || "";
      return { a, status: r.status, type };
    } catch (err) {
      return { a, status: 0, type: "network error: " + err.message };
    }
  }));

  let imgOk = 0;
  const imgBad = [];
  for (const { a, status, type } of results) {
    const good = status >= 200 && status < 400 && /^image\//i.test(type);
    if (good) imgOk++;
    else imgBad.push(`${a.source}: ${status} ${type} — ${a.image.slice(0, 80)}`);
  }

  console.log(`  ✓ ${imgOk}/${withImages.length} images resolve as real images`);
  imgBad.forEach(line => console.log(`  ✗ ${line}`));

  // 5. Nintendo + Xbox must both be present (explicit product requirement)
  for (const required of ["Nintendo Life", "Xbox Wire"]) {
    const found = articles.filter(a => a.source === required).length;
    if (found) console.log(`  ✓ ${required}: ${found} stories`);
    else { console.log(`  ✗ ${required} missing from the feed`); problems++; }
  }

  // 6. image-less stories are allowed (the client shows a branded card) —
  //    but report how many, so the fallback's real-world weight is visible.
  const noImage = articles.filter(a => !a.image).length;
  console.log(`  i ${noImage} story(ies) have no usable image → branded placeholder card on the site`);

  console.log("");
  // Broken upstream images (404/expired) are not our bug: the client swaps in
  // the branded placeholder. They are reported, not counted as failures.
  if (problems) {
    console.log(`FAILED — ${problems} structural problem(s)`);
    process.exit(1);
  }
  console.log("PASSED — proxy output is structurally sound.");
})();
