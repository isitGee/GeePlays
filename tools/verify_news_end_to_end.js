/* =========================================================
   GeePlays — end-to-end news image verification
   ---------------------------------------------------------
   Renders news.html with its real scripts, but routes the
   news feed through the FIXED api/news.js running locally
   (tools/local_news_proxy.js) instead of the currently
   deployed build. Then checks what a visitor would actually
   receive:

     * no card image is a video or a non-image response
     * every card image that is used resolves as an image
     * cards with no usable image fall back to the branded
       placeholder (never a broken image icon)

   This is the proof that the two upstream bugs found in the
   deployed proxy — PlayStation trailer envelopes (video/mp4)
   and Xbox Wire's HTML-entity-encoded filenames — are gone.

   Run:  node tools/verify_news_end_to_end.js
   ========================================================= */

/* jsdom is a dev-only dependency. Resolve it from wherever it happens to be
   installed, so the harness works whether jsdom was installed in this repo,
   in a scratch folder, or alongside these tools. */
function requireJsdom() {
  const candidates = ["jsdom", "/tmp/node_modules/jsdom", "../node_modules/jsdom"];
  for (const c of candidates) {
    try { return require(c); } catch (e) { /* try the next one */ }
  }
  console.error("This check needs jsdom. Install it with:  npm install --no-save jsdom");
  process.exit(2);
}
const { JSDOM, VirtualConsole } = requireJsdom();

const { spawn } = require("child_process");
const path = require("path");

const BASE = process.env.GEEPLAYS_BASE || "http://127.0.0.1:8000";
const PORT = 8899;
const LOCAL_PROXY = `http://127.0.0.1:${PORT}/api/news`;
const DEPLOYED = "https://geeplays-rawg-proxy-isitgee.vercel.app/api/news";

let pass = 0, fail = 0;

function check(cond, label, detail = "") {
  if (cond) { pass++; console.log(`  ✓ ${label}${detail ? " — " + detail : ""}`); }
  else { fail++; console.log(`  ✗ ${label} — ${detail}`); }
}

async function imageStatus(url) {
  try {
    const res = await fetch(url, {
      headers: { Range: "bytes=0-2047", "User-Agent": "Mozilla/5.0 (compatible; GeePlaysVerify/1.0)" }
    });
    return { status: res.status, type: res.headers.get("content-type") || "" };
  } catch (err) {
    return { status: 0, type: "error: " + err.message };
  }
}

(async () => {
  console.log("Starting the fixed news proxy locally…\n");
  const proxy = spawn("node", [path.join(__dirname, "local_news_proxy.js"), String(PORT)], { stdio: "inherit" });
  await new Promise(r => setTimeout(r, 1200));

  try {
    console.log("\nRendering news.html with news requests routed to the fixed proxy…\n");

    const vc = new VirtualConsole();
    const errs = [];
    vc.on("jsdomError", e => errs.push(e.message));

    const dom = await JSDOM.fromURL(`${BASE}/news.html`, {
      runScripts: "dangerously",
      resources: "usable",
      pretendToBeVisual: true,
      virtualConsole: vc,
      beforeParse(window) {
        window.fetch = (input, init = {}) => {
          const { signal, ...rest } = init;
          let target = typeof input === "string" ? new URL(input, window.location.href).href : input;
          // The deployed proxy is the old build; use the fixed one.
          if (typeof target === "string" && target.startsWith(DEPLOYED)) target = LOCAL_PROXY;
          return fetch(target, rest);
        };
      }
    });

    await new Promise(r => setTimeout(r, 9000));

    const doc = dom.window.document;
    const cards = [...doc.querySelectorAll(".news-card")];
    check(cards.length > 3, "news feed rendered", `${cards.length} cards`);

    const imgs = [...doc.querySelectorAll(".news-card img, .news-featured img")];
    const placeholders = [...doc.querySelectorAll(".news-card .cover-fallback, .news-featured .cover-fallback")];

    check(imgs.length + placeholders.length >= cards.length,
      "every card has either an image or the branded placeholder",
      `${imgs.length} images + ${placeholders.length} placeholders for ${cards.length} cards`);

    const videoish = imgs.filter(i => /\.(mp4|m4v|mov|webm)(\?|#|$)/i.test(i.getAttribute("src") || ""));
    check(videoish.length === 0, "no card is pointing at a video file",
      videoish.length ? videoish[0].getAttribute("src") : "none");

    const entityish = imgs.filter(i => /&#?[a-z0-9]{1,8};/i.test(i.getAttribute("src") || ""));
    check(entityish.length === 0, "no card URL contains an undecoded HTML entity",
      entityish.length ? entityish[0].getAttribute("src") : "none");

    // What a visitor's browser would really request:
    console.log(`\n  Checking ${imgs.length} card images resolve as images…`);
    const statuses = await Promise.all(imgs.map(i => imageStatus(i.getAttribute("src"))));
    const broken = statuses.filter(s => !(s.status >= 200 && s.status < 400 && /^image\//i.test(s.type)));
    check(broken.length === 0, "all card images resolve as real images",
      broken.length ? `${broken.length} broken: ${broken[0].status} ${broken[0].type}` : `${imgs.length}/${imgs.length}`);

    const noImageStories = cards.length - imgs.length;
    console.log(`  i ${noImageStories} card(s) use the branded placeholder (source had no usable still image)`);

    if (errs.length) console.log(`  ! console: ${errs.slice(0, 2).join(" | ")}`);

    dom.window.close();
  } finally {
    proxy.kill();
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
