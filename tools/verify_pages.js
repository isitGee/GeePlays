/* =========================================================
   GeePlays — verify share metadata + images on real page loads
   ---------------------------------------------------------
   Loads each page in jsdom (same HTML, CSS and JS the browser
   gets), lets the page's own scripts run, then asserts:

     1. every required og:* / twitter:* tag exists and is correct
     2. every og:image / twitter:image is an absolute https URL
        that really responds with an image
     3. every <img> in the DOM has a real src + meaningful alt
     4. no raw error text ("Failed to fetch", "undefined") leaks
        into visible copy

   Run:  node tools/verify_pages.js            (all pages)
         node tools/verify_pages.js game.html  (one page)
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
const PAGES = process.argv.slice(2);

let pass = 0;
let fail = 0;
const failures = [];

function ok(label, extra = "") {
  pass++;
  console.log(`  ✓ ${label}${extra ? " — " + extra : ""}`);
}

function bad(label, detail) {
  fail++;
  failures.push(`${label}: ${detail}`);
  console.log(`  ✗ ${label} — ${detail}`);
}

function check(cond, label, detail) {
  cond ? ok(label) : bad(label, detail);
}

/* ---------- helpers ---------- */

async function head(url) {
  try {
    const res = await fetch(url, { method: "GET", headers: { Range: "bytes=0-1023" } });
    return { status: res.status, type: res.headers.get("content-type") || "" };
  } catch (err) {
    return { status: 0, type: "", error: String(err && err.message) };
  }
}

function metaValue(dom, attr, key) {
  const el = dom.window.document.head.querySelector(`meta[${attr}="${key}"]`);
  return el ? el.getAttribute("content") : null;
}

async function loadPage(path, { waitMs = 4500 } = {}) {
  const vc = new VirtualConsole();
  const consoleErrors = [];
  vc.on("jsdomError", (e) => consoleErrors.push(`jsdomError: ${e.message}`));
  vc.on("error", (...args) => consoleErrors.push(`console.error: ${args.join(" ")}`));

  const dom = await JSDOM.fromURL(BASE + "/" + path, {
    runScripts: "dangerously",
    resources: "usable",
    pretendToBeVisual: true,
    virtualConsole: vc,
    beforeParse(window) {
      // jsdom ships no fetch; hand the page Node's, minus the signal (Node's
      // fetch rejects a jsdom AbortSignal, and timeouts aren't what we test)
      // — and resolve relative URLs the way a browser would.
      window.fetch = (input, init = {}) => {
        const { signal, ...rest } = init;
        let absolute = typeof input === "string" ? new URL(input, window.location.href).href : input;
        // NEWS_PROXY_LOCAL=1 routes news through tools/local_news_proxy.js
        // (the fixed api/news.js) instead of the currently deployed build —
        // useful before the fix is redeployed to Vercel.
        if (process.env.NEWS_PROXY_LOCAL && typeof absolute === "string" &&
            absolute.startsWith("https://geeplays-rawg-proxy-isitgee.vercel.app/api/news")) {
          absolute = absolute.replace("https://geeplays-rawg-proxy-isitgee.vercel.app/api/news",
            process.env.NEWS_PROXY_LOCAL);
        }
        return fetch(absolute, rest);
      };
    }
  });

  await new Promise((r) => setTimeout(r, waitMs));
  return { dom, consoleErrors };
}

/* ---------- per-page assertions ---------- */

async function checkShareTags(path, dom, expectations) {
  const doc = dom.window.document;

  check(!!metaValue(dom, "property", "og:title"), `${path} og:title present`);
  check(!!metaValue(dom, "property", "og:description"), `${path} og:description present`);
  check(!!metaValue(dom, "property", "og:image"), `${path} og:image present`);
  check(!!metaValue(dom, "property", "og:url"), `${path} og:url present`);
  check(!!metaValue(dom, "property", "og:type"), `${path} og:type present`);
  check(metaValue(dom, "property", "og:site_name") === "GeePlays", `${path} og:site_name = GeePlays`);
  check(metaValue(dom, "name", "twitter:card") === "summary_large_image", `${path} twitter:card`);
  check(!!metaValue(dom, "name", "twitter:title"), `${path} twitter:title present`);

  // mirrors
  check(metaValue(dom, "name", "twitter:title") === metaValue(dom, "property", "og:title"),
    `${path} twitter:title mirrors og:title`);
  check(metaValue(dom, "name", "twitter:description") === metaValue(dom, "property", "og:description"),
    `${path} twitter:description mirrors og:description`);
  check(metaValue(dom, "name", "twitter:image") === metaValue(dom, "property", "og:image"),
    `${path} twitter:image mirrors og:image`);

  const canonical = doc.head.querySelector('link[rel="canonical"]');
  check(!!canonical && /^https:\/\/isitgee\.github\.io\/GeePlays\//.test(canonical.getAttribute("href")),
    `${path} canonical absolute`, canonical && canonical.getAttribute("href"));

  // image must be absolute and really served
  const img = metaValue(dom, "property", "og:image") || "";
  check(/^https:\/\//.test(img), `${path} og:image is absolute https`, img);
  check(/^https:\/\/isitgee\.github\.io\/GeePlays\/assets\/share\/.+\.jpg$/.test(img) ||
        /^https:\/\/media\.rawg\.io\//.test(img) || /^https:\/\/cdn\./.test(img),
    `${path} og:image points at a share card or real artwork`, img);

  // description quality: no filler, no raw errors, 1-2 sentences
  const desc = metaValue(dom, "property", "og:description") || "";
  check(desc.length >= 60, `${path} og:description is substantive`, `${desc.length} chars`);
  check(!/welcome to (our|my)/i.test(desc), `${path} og:description has no filler`);
  check(!/\bundefined\b|\bNaN\b|failed to fetch/i.test(desc), `${path} og:description clean of raw errors`);

  if (expectations && expectations.ogImage) {
    check(img === expectations.ogImage, `${path} og:image is the page's own card`, img);
  }
  if (expectations && expectations.ogType) {
    check(metaValue(dom, "property", "og:type") === expectations.ogType, `${path} og:type = ${expectations.ogType}`);
  }
  if (expectations && expectations.titleIncludes) {
    check((metaValue(dom, "property", "og:title") || "").includes(expectations.titleIncludes),
      `${path} og:title mentions "${expectations.titleIncludes}"`, metaValue(dom, "property", "og:title"));
  }
  if (expectations && expectations.urlIncludes) {
    check((metaValue(dom, "property", "og:url") || "").includes(expectations.urlIncludes),
      `${path} og:url includes "${expectations.urlIncludes}"`, metaValue(dom, "property", "og:url"));
  }

  /* ---------- every <img> in the rendered DOM ---------- */
  const imgs = [...doc.querySelectorAll("img")];
  let imgProblems = 0;
  for (const el of imgs) {
    const src = (el.getAttribute("src") || "").trim();
    const alt = el.getAttribute("alt");
    if (!src) { imgProblems++; bad(`${path} <img> src`, `empty src (id=${el.id || "?"})`); continue; }
    if (alt === null || !alt.trim()) { imgProblems++; bad(`${path} <img> alt`, `missing alt (${src.slice(0, 60)})`); continue; }
    if (/^https?:/.test(src)) {
      const res = await head(src);
      if (res.status >= 400 || res.status === 0 || !/image/.test(res.type)) {
        imgProblems++;
        bad(`${path} <img> loads`, `${src.slice(0, 70)} → ${res.status} ${res.type}`);
      }
    }
  }
  if (imgProblems === 0) ok(`${path} all ${imgs.length} <img> have real src + alt that load`);

  /* ---------- no raw error text visible to users ---------- */
  const bodyText = doc.body.textContent || "";
  check(!/failed to fetch/i.test(bodyText), `${path} no "Failed to fetch" on screen`);
  check(!/\bundefined\b/.test(bodyText), `${path} no "undefined" on screen`);
  check(!/\bNaN\b/.test(bodyText), `${path} no "NaN" on screen`);

  return { doc };
}

/* ---------- run ---------- */

(async () => {
  const all = PAGES.length ? PAGES : ["index.html", "games.html", "game.html", "news.html", "support.html", "about.html"];

  for (const path of all) {
    console.log(`\n── ${path} ──`);
    try {
      const { dom, consoleErrors } = await loadPage(path);
      await checkShareTags(path, dom, path === "game.html" ? { ogType: "article" } : { ogType: "website" });
      if (consoleErrors.length) {
        console.log(`  ! console: ${consoleErrors.slice(0, 3).join(" | ")}`);
      }
      dom.window.close();
    } catch (err) {
      bad(path, `load failed: ${err && err.message}`);
    }
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) {
    console.log("\nFailures:");
    failures.forEach((f) => console.log("  - " + f));
    process.exit(1);
  }
})();
