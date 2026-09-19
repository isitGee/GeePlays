# tools/ — building and verifying GeePlays

Everything here is development tooling. **None of it ships to visitors** — the
site itself is still plain HTML, CSS and JavaScript with no build step. These
scripts exist so the social share cards and the news feed can be regenerated
and checked without guessing.

## Share cards

```bash
python3 tools/make_share.py
```

Rebuilds all seven images in `assets/share/` (1200×630 JPEG, each well under
300 KB). It reads:

* **`tools/panels/`** — the model-generated background artwork, one PNG per
  card (see `tools/panels/README.md`);
* **`tools/.fonts/`** — Inter + JetBrains Mono, downloaded automatically on
  first run (both open-licensed, not committed);
* copy, colours and sizes from the `CARDS` list inside the script itself.

Override any path with `GEEPLAYS_PANELS`, `GEEPLAYS_FONTS` or
`GEEPLAYS_SHARE_OUT`. Requires Pillow (`pip install pillow`).

## Verifying

Start the site locally first:

```bash
python3 -m http.server 8000      # from the repo root
```

The jsdom-based checks need jsdom: `npm install --no-save jsdom`.

| Command | What it proves |
|---|---|
| `npm run check:js` | every script in `js/` parses |
| `node tools/verify_pages.js` | all six pages: every required og:*/twitter:* tag, absolute canonical, absolute og:image, and **every `<img>` in the rendered DOM has a real `src` + meaningful `alt` that actually loads** |
| `node tools/verify_dynamic.js` | the runtime part: per-game metadata (live RAWG + saved pick), the per-story news view, a stale story link, and a filtered catalog view |
| `node tools/test_news_proxy.js` | runs the real `api/news.js` against today's live publisher feeds and checks the result for video-as-image, leftover HTML entities, and images that don't resolve |
| `node tools/verify_news_end_to_end.js` | renders `news.html` against the **fixed** proxy served by `tools/local_news_proxy.js`, then checks every card image |
| `bash tools/verify_live.sh` | the **deployed** site after a push: every share image over the network (HTTP 200, `image/*`, 1200×630, size budget), all tags on all pages, both proxies healthy and still not leaking the RAWG key |

Before the news-proxy fix is redeployed to Vercel, the deployed
`/api/news` still returns the old (broken) image URLs. To exercise the fixed
version through the page anyway:

```bash
node tools/local_news_proxy.js 8899 &
NEWS_PROXY_LOCAL=http://127.0.0.1:8899/api/news node tools/verify_pages.js
```

Any check that fails on news images *only* under the deployed proxy is that
pending redeploy, not the site.

## Notes

* `local_news_proxy.js` runs the repo's own Vercel handler in a plain Node
  server, so what it returns is exactly what Vercel would return.
* The scripts deliberately allow upstream image 404s to be *reported* rather
  than treated as site failures: a publisher moving a picture is not a
  GeePlays bug, and the cards fall back to the branded placeholder.
