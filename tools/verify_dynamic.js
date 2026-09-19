/* =========================================================
   GeePlays — verify the RUNTIME share metadata
   ---------------------------------------------------------
   The static tags are checked by verify_pages.js. This file
   checks the part that only exists once JavaScript has run:
   game.html and the per-story news view must rewrite every
   share tag to match what is actually on screen.

   Run:  node tools/verify_dynamic.js
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

const BASE = process.env.GEEPLAYS_BASE || "http://127.0.0.1:8000";
let pass = 0, fail = 0;
const failures = [];

function check(cond, label, detail = "") {
  if (cond) { pass++; console.log(`  ✓ ${label}${detail ? " — " + detail : ""}`); }
  else { fail++; failures.push(`${label} — ${detail}`); console.log(`  ✗ ${label} — ${detail}`); }
}

function meta(dom, attr, key) {
  const el = dom.window.document.head.querySelector(`meta[${attr}="${key}"]`);
  return el ? el.getAttribute("content") : null;
}

async function load(path, waitMs = 7000) {
  const vc = new VirtualConsole();
  const errs = [];
  vc.on("jsdomError", e => errs.push(e.message));
  vc.on("error", (...a) => errs.push(a.join(" ")));

  const dom = await JSDOM.fromURL(BASE + "/" + path, {
    runScripts: "dangerously",
    resources: "usable",
    pretendToBeVisual: true,
    virtualConsole: vc,
    beforeParse(window) {
      window.fetch = (input, init = {}) => {
        const { signal, ...rest } = init;
        const absolute = typeof input === "string" ? new URL(input, window.location.href).href : input;
        return fetch(absolute, rest);
      };
      // jsdom has no Clipboard API; stub it so the copy-link control (which
      // correctly hides itself when clipboard access is unavailable) can be
      // exercised the way a real browser exercises it.
      Object.defineProperty(window.navigator, "clipboard", {
        value: { writeText: async (t) => { window.__copied = t; } },
        configurable: true
      });
      // jsdom cannot decode images, so give the page a working Image stub.
      // (Otherwise every artwork verification would "fail" and mask what a
      // real browser does with a reachable URL.)
      window.Image = class {
        constructor() { this.onload = null; this.onerror = null; this._src = ""; }
        set src(value) {
          this._src = value;
          if (!value) return;
          fetch(value, { method: "GET", headers: { Range: "bytes=0-64" } })
            .then(r => (r.ok && /image/i.test(r.headers.get("content-type") || "")
              ? this.onload && this.onload()
              : this.onerror && this.onerror()))
            .catch(() => this.onerror && this.onerror());
        }
        get src() { return this._src; }
      };
    }
  });
  await new Promise(r => setTimeout(r, waitMs));
  return { dom, errs };
}

async function shareTagAudit(label, dom, expect) {
  const doc = dom.window.document;
  const ogTitle = meta(dom, "property", "og:title") || "";
  const ogDesc = meta(dom, "property", "og:description") || "";
  const ogImg = meta(dom, "property", "og:image") || "";
  const ogUrl = meta(dom, "property", "og:url") || "";
  const twTitle = meta(dom, "name", "twitter:title") || "";
  const twDesc = meta(dom, "name", "twitter:description") || "";
  const twImg = meta(dom, "name", "twitter:image") || "";
  const canonical = (doc.head.querySelector('link[rel="canonical"]') || {}).href || "";

  check(ogTitle.includes(expect.titleIncludes), `${label} og:title → "${expect.titleIncludes}"`, ogTitle);
  check(doc.title.includes(expect.titleIncludes), `${label} document.title updated`, doc.title);
  check(twTitle === ogTitle, `${label} twitter:title mirrors og:title`, twTitle);
  check(twDesc === ogDesc, `${label} twitter:description mirrors og:description`);
  check(twImg === ogImg, `${label} twitter:image mirrors og:image`);
  check(ogUrl.includes(expect.urlIncludes) && canonical.includes(expect.urlIncludes),
    `${label} og:url + canonical → "${expect.urlIncludes}"`, ogUrl);

  check(/^https:\/\/isitgee\.github\.io\/GeePlays\/assets\/share\//.test(ogImg) ||
        /^https:\/\/(media\.rawg\.io|cdn\.|live\.staticflickr\.com|.*\.(com|net|org))\//.test(ogImg),
    `${label} og:image absolute + plausible`, ogImg);

  check(ogDesc.length >= 60, `${label} og:description substantive`, `${ogDesc.length} chars`);
  check(!/\bundefined\b|\bNaN\b|failed to fetch/i.test(ogDesc), `${label} og:description clean`, ogDesc);
  check(!/\bundefined\b/.test(doc.body.textContent || ""), `${label} no "undefined" on screen`);

  // The share card must actually load. og:image is the canonical production
  // URL; before this branch is pushed that URL isn't deployed yet, so the
  // same path is fetched from the local server — that checks the file, which
  // iswhat this can control. (Live re-check after deploy: tools/verify_live.sh)
  const fetchable = ogImg.replace("https://isitgee.github.io/GeePlays/", BASE + "/");
  try {
    const r = await fetch(fetchable, { method: "GET", headers: { Range: "bytes=0-2047" } });
    const type = r.headers.get("content-type") || "";
    check(r.status >= 200 && r.status < 400 && /image/i.test(type),
      `${label} og:image really loads`, `${r.status} ${type} (${fetchable.includes(BASE) ? "local file" : "live URL"})`);
  } catch (err) {
    check(false, `${label} og:image really loads`, err.message);
  }
  return { ogTitle, ogDesc, ogImg, ogUrl };
}

(async () => {
  /* ---------- 1. Live game (RAWG) ---------- */
  console.log("\n── game.html?rawg=3498 (live RAWG game) ──");
  {
    const { dom, errs } = await load("game.html?rawg=3498");
    const doc = dom.window.document;
    if (errs.length) console.log(`  ! console: ${errs.slice(0, 2).join(" | ")}`);

    const heading = (doc.getElementById("gameTitle") || {}).textContent || "";
    check(heading.length > 0, "game rendered (not an error state)", `h1 = "${heading}"`);
    check((doc.getElementById("errorState") || {}).style.display === "none" ||
          (doc.getElementById("gameContent") || {}).style.display !== "none",
      "content state shown, error state hidden");

    if (heading) {
      await shareTagAudit("live game", dom, {
        titleIncludes: heading,
        urlIncludes: "game.html?rawg=3498"
      });
      const ogImg = meta(dom, "property", "og:image");
      check(/media\.rawg\.io/.test(ogImg) || /assets\/share\/game\.jpg/.test(ogImg),
        "live game og:image = real artwork or the branded game card", ogImg);
    }
    dom.window.close();
  }

  /* ---------- 2. Saved pick (local, offline path) ---------- */
  console.log("\n── game.html?id=hades (saved pick) ──");
  {
    const { dom, errs } = await load("game.html?id=hades");
    const doc = dom.window.document;
    if (errs.length) console.log(`  ! console: ${errs.slice(0, 2).join(" | ")}`);
    const heading = (doc.getElementById("gameTitle") || {}).textContent || "";
    check(/hades/i.test(heading), "saved pick rendered", `h1 = "${heading}"`);
    if (heading) {
      await shareTagAudit("saved pick", dom, { titleIncludes: heading, urlIncludes: "game.html?id=hades" });
      const ogDesc = meta(dom, "property", "og:description") || "";
      check(/hades/i.test(ogDesc), "description names the actual game", ogDesc.slice(0, 120));
      check(ogDesc.split(/[.!?]\s/).length <= 3, "description is 1–2 sentences", `${ogDesc.split(/[.!?]\s/).length - 1} sentences`);
    }
    dom.window.close();
  }

  /* ---------- 3. Per-story news view ---------- */
  console.log("\n── news.html?a=<slug> (single story) ──");
  let slug = null;
  let storyTitle = null;
  {
    // Find today's story the same way the page does.
    const feed = await (await fetch("https://geeplays-rawg-proxy-isitgee.vercel.app/api/news")).json();
    const first = feed.articles.find(a => a.image) || feed.articles[0];
    storyTitle = first.title;
    let hash = 0;
    const str = first.articleUrl || first.title;
    for (let i = 0; i < str.length; i++) hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
    const base = first.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 70);
    slug = `${base}-${hash.toString(36).slice(0, 6)}`;
    console.log(`  story: "${storyTitle.slice(0, 70)}"`);

    const { dom, errs } = await load(`news.html?a=${encodeURIComponent(slug)}`, 8000);
    const doc = dom.window.document;
    if (errs.length) console.log(`  ! console: ${errs.slice(0, 2).join(" | ")}`);

    const featured = doc.querySelector(".news-featured .nf-body h2, .news-featured h2");
    check(!!featured, "single-story view rendered");
    if (featured) {
      check(featured.textContent.includes(storyTitle.slice(0, 40)), "the right story is shown",
        featured.textContent.slice(0, 70));
      check((doc.getElementById("newsCategoryRow") || {}).style.display === "none",
        "category chips hidden in single-story view");
      const back = [...doc.querySelectorAll("a")].find(a => /all gaming news/i.test(a.textContent));
      check(!!back, "a link back to the full feed exists");
      const copyBtn = [...doc.querySelectorAll("button")].find(b => /copy link/i.test(b.textContent));
      check(!!copyBtn, "copy-share-link control present");
      if (copyBtn) {
        copyBtn.dispatchEvent(new dom.window.Event("click"));
        await new Promise(r => setTimeout(r, 60));
        check(/copied/i.test(copyBtn.textContent), "copy control reports success",
          `label now "${copyBtn.textContent}"`);
        check(String(dom.window.__copied || "").includes("news.html?a="),
          "clipboard received the story's canonical URL", String(dom.window.__copied).slice(0, 90));
      }
    }

    await shareTagAudit("single story", dom, {
      titleIncludes: storyTitle.slice(0, 40),
      urlIncludes: "news.html?a="
    });
    const ogImg = meta(dom, "property", "og:image");
    check(/assets\/share\/news\.jpg|^https:\/\//.test(ogImg), "single story og:image resolved", ogImg);
    dom.window.close();
  }

  /* ---------- 4. Story that has rotated out of the feed ---------- */
  console.log("\n── news.html?a=long-gone-story (stale link) ──");
  {
    const { dom, errs } = await load("news.html?a=some-story-from-last-year-abc123", 8000);
    const doc = dom.window.document;
    if (errs.length) console.log(`  ! console: ${errs.slice(0, 2).join(" | ")}`);
    const grid = doc.querySelectorAll(".news-card").length;
    check(grid > 0, "falls back to the full feed instead of an error", `${grid} stories shown`);

    // Existing behaviour must survive: every card still links out to the
    // publisher, and now also to its own shareable page on GeePlays.
    const externalLinks = [...doc.querySelectorAll(".news-read-link")]
      .filter(a => a.target === "_blank" && /^https?:/.test(a.href || ""));
    check(externalLinks.length === grid, "every card keeps its external publisher link",
      `${externalLinks.length}/${grid}`);
    const internalLinks = [...doc.querySelectorAll(".news-title-link")]
      .filter(a => /news\.html\?a=/.test(a.getAttribute("href") || ""));
    check(internalLinks.length === grid, "every card has a shareable GeePlays link",
      `${internalLinks.length}/${grid}`);
    check(!/failed|error/i.test((doc.getElementById("newsError") || {}).textContent || ""),
      "no error state shown to the visitor");
    check(meta(dom, "property", "og:title").includes("Gaming News"),
      "share tags restored to the feed default", meta(dom, "property", "og:title"));
    check(/news\.html$/.test(meta(dom, "property", "og:url")),
      "og:url back to the plain news page", meta(dom, "property", "og:url"));
    dom.window.close();
  }

  /* ---------- 5. Filtered catalog view ---------- */
  console.log("\n── games.html?genre=Horror (filtered view) ──");
  {
    const { dom } = await load("games.html?genre=Horror", 7000);
    const ogTitle = meta(dom, "property", "og:title") || "";
    check(/horror/i.test(ogTitle), "og:title reflects the active filter", ogTitle);
    check(/genre=Horror/.test(meta(dom, "property", "og:url") || ""), "og:url carries the filter",
      meta(dom, "property", "og:url"));
    dom.window.close();
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) {
    console.log("\nFailures:");
    failures.forEach(f => console.log("  - " + f));
    process.exit(1);
  }
})();
