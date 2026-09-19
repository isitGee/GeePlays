# Building GeePlays: What I Learned Getting a Static Site to Talk to a Live Game Database

## Current status: resilient by design

GeePlays now has a **two-layer data architecture** so it never dies when a
third-party API fails:

1. **Primary source — RAWG** (live), fetched through a tiny serverless proxy
   (`/api/rawg.js`) that holds the secret key and adds CORS headers.
2. **Fallback — saved picks**, a hand-curated static catalog
   (`data/games.json`, 22 games with official Steam artwork) plus saved news
   stories (`data/news.json`) that ship with the site.
3. **Graceful failure** — if the proxy is unreachable, the same pages render
   the saved picks and show a small, honest notice ("Live game data is
   temporarily unavailable — showing saved picks instead"). Search, filters,
   and details all keep working offline. Nothing ever shows a raw error or a
   blank section to a normal visitor.

### What was actually broken (and the fix)

When I checked the deployed proxy at
`geeplays-rawg-proxy-isitgee.vercel.app/api/rawg`, it returned Vercel's
`404 NOT_FOUND` — and the root of that domain now serves *this static site*.
The proxy functions had been written into a subfolder
(`geeplays-proxy-with-news/api/`) instead of the project-root `api/`, so when
the repo was deployed to Vercel the functions were never picked up. RAWG
itself was fine; the frontend just had no live backend to talk to.

The fix has two parts:

- **Proxy corrected** — the functions now live at the repo root in `api/`
  (`api/rawg.js`, `api/news.js`) with the `rss-parser` dependency at the root
  `package.json`, which is exactly where Vercel looks for them.
- **Frontend hardened** — a new catalog facade (`js/catalog.js`) tries live
  data first and falls back to the local dataset automatically, so the site
  works today even while the proxy is not yet redeployed.

### Live status (checked 2026-09-14, re-checked 2026-09-20)

Both proxies were verified working from the deployed
`geeplays-rawg-proxy-isitgee.vercel.app`: `/api/rawg` returns live RAWG data
and `/api/news` returns current stories from Xbox Wire, PlayStation Blog,
Nintendo Life, and PC Gamer. The GitHub Pages site is serving this tree.

**Re-checked 2026-09-20:** `/api/rawg` is still serving live RAWG data
(`count` ~900k, `next` returned as a boolean, no key in the body) and
`/api/news` is still returning all four sources — 10 stories each, none of
the feeds failing. So RAWG itself was never broken and the proxy *routing*
was fine; the two problems worth fixing were inside the news normalizer
(video-as-image and entity-encoded URLs — see the share-preview section
below).

**But the check found a real problem: the RAWG key was leaking to every
visitor.** RAWG's API echoes the key inside its `next` / `previous`
pagination URLs, and the proxy was forwarding RAWG's body verbatim — so the
key sat in plain text in the JSON that every browser (and anyone who curls
the proxy) can read. The fix, in `api/rawg.js`:

- `next` / `previous` are **scrubbed server-side** and replaced with plain
  booleans (the frontend only ever needs "are there more pages?").
- Non-OK responses are replaced with a small generic error object — the
  upstream body is never forwarded verbatim, so nothing upstream can ever
  sneak a secret or a scary message to a visitor.
- Error responses get `Cache-Control: no-store` so a transient 429/5xx
  doesn't stick at Vercel's CDN for 30 minutes.

> ⚠️ **Action item:** because the old key was exposed to the public internet
> for a while, treat it as compromised. Generate a new key on your RAWG
> dashboard (https://rawg.io/apidocs → your account) and update the
> `RAWG_API_KEY` environment variable in the Vercel project. Everything else
> keeps working with the new key — no code change needed.

### What else got fixed in this round

- **Hero video, real compression** — `assets/hero.mp4` went from 8 MB /
  1080p to ~1.9 MB / 720p H.264 (2-pass, `+faststart`), with a matching
  720p poster frame. The poster shows instantly, and the (now tiny) file
  starts playing fast instead of sitting on a spinner. The glass overlay
  over the video was lightened so the footage actually reads.
- **Payment cards are now full-surface brand cards** — each card's
  background is the exact dominant color sampled from its logo file (PIL):
  Vodacom `#E90004` red, Airtel `#FFFFFF` white (red `#E20010` "Pay Now"),
  NMB `#2056AE` blue. The logo sits on the card with no box or border, so
  logo and card are one continuous surface. NMB gets a real "Pay Now" that
  dials the verified NMB Mkononi USSD (`*150*66#`, from nmbbank.co.tz).
  Still no preset amounts — the amount is always chosen by the person
  paying.
- **News images** — the proxy now resolves relative/protocol-relative image
  URLs from RSS feeds and skips `data:` URIs; the UI only ever tries
  absolute `http(s)` images and falls back to a placeholder that matches
  the card surface, so a dead external image never leaves a broken card.
- **Game detail page** — "game doesn't exist" (404 from RAWG) is now told
  apart from "proxy is down", so a deleted game shows a proper
  not-found state instead of a false "live data offline" banner.
- Light/dark theme syncs the mobile browser chrome color too
  (`theme-color` meta).

## Social share previews (added 2026-09-20)

When any page of GeePlays is shared now, the link unfurls with a real image
and real copy instead of a blank box or the default GitHub Pages placeholder.

### One real share card per page

Every page has its own 1200×630 image in `assets/share/`, built from a dark
gaming panel plus that page's actual headline, set in the site's own type.
All are well under the 300 KB budget that some unfurlers enforce.

| Page | Image | Headline on the card | Size |
|---|---|---|---|
| `index.html` | `assets/share/index.jpg` | Find your next obsession. | 66 KB |
| `games.html` | `assets/share/games.jpg` | All Games | 101 KB |
| `game.html` | `assets/share/game.jpg` | Every game, in detail. | 53 KB |
| `news.html` | `assets/share/news.jpg` | Gaming News | 67 KB |
| `support.html` | `assets/share/support.jpg` | Support GeePlays | 47 KB |
| `about.html` | `assets/share/about.jpg` | A hub for finding your next game. | 64 KB |
| *(fallback)* | `assets/share/default.jpg` | Discover what to play next | 58 KB |

They are generated by `tools/make_share.py` (Pillow): the background panels
come from an image model, the typography is composited on top with the exact
palette from `DESIGN.md` — `#0f1115` ground, `#f4f5f7` headings, the one blue
accent `#2f9bf0`, Inter for text and a mono face for the HUD-style labels.
Re-run `python3 tools/make_share.py` after editing the copy in that file.

All the tooling — the generator, the audit scripts and the post-deploy
checker — is documented in [tools/README.md](./tools/README.md) and never
ships to visitors.

### The tags themselves

Each page writes its own block into `<head>` by hand — no JS required for the
six main pages:

* `og:title`, `og:description`, `og:image`, `og:url`, `og:type`, `og:site_name`
* `twitter:card` = `summary_large_image`, plus `twitter:title`,
  `twitter:description`, `twitter:image`
* `<link rel="canonical">` (absolute), `og:image:width/height/alt`, `og:locale`
* a `theme-color` pair (dark `#0f1115` / light `#eef1f6`) so the mobile
  browser chrome matches the visitor's theme before any JS runs

Every `og:image` is an absolute URL on the canonical origin
(`https://isitgee.github.io/GeePlays/assets/share/…`), so previews work no
matter which URL a share came in through. `default.jpg` is the single
fallback: `js/config.js` names it once (`shareImageDefault`) and
`js/shareMeta.js` falls back to it whenever a page or game image is missing
**or fails to load**.

### Pages that render at runtime

`game.html` and the per-story news view rewrite all of those tags as soon as
the real content is known (`js/shareMeta.js`, driven by `js/game.js`,
`js/news.js` and the filtered view in `js/games.js`):

* a game link previews that game's name, genre, developer, release year and
  its **actual cover artwork** — verified in-browser first, and swapped for
  the branded card if that artwork is unreachable, so the preview is never a
  broken image;
* a story link (`news.html?a=<slug>` — the headline on every news card is now
  that link, next to the existing publisher link) previews that headline,
  its summary and its picture, with a "Copy link" button for sharing it;
* a filtered catalog link (`games.html?genre=Horror`) previews the filter;
* `history.replaceState` keeps the address bar on the same canonical URL that
  `og:url` advertises, so what someone copies is what gets previewed.

**One honest limitation.** The big unfurlers — WhatsApp, Discord, Facebook,
Slack — read the HTML and do **not** run JavaScript. On a static GitHub Pages
site with no build step there is nothing server-side to render per-game meta,
so a per-game link previews with the generic game card
(`assets/share/game.jpg`) and a per-story link with the news card. The
runtime rewrite covers everything that does run JS (browsers, and previewers
that execute scripts). If per-game previews for every unfurler ever matter
enough, the zero-cost path is a tiny Vercel function that returns HTML with
the right tags for crawlers — the same free project the proxies already use.

### News images: two real bugs in the proxy, found and fixed

While verifying the share cards, the news cards were checked image by image,
and two upstream traps turned up in `api/news.js`:

1. **Video enclosures were being used as card images.** PlayStation Blog
   attaches a `video/mp4` enclosure to its trailer posts. The old code took
   `item.enclosure.url` blindly, so an `<img>` was pointed at a ~21 MB video:
   a broken card *and* a pointless download. Only `image/*` assets are
   considered now.
2. **HTML entities inside URLs.** Xbox Wire writes `&#x2122;` for ™ inside
   its image filenames. Used literally, the request 404s. URLs are now
   entity-decoded before they are resolved and re-encoded.

Verified against the live feeds: **37 of 37 extracted images resolve as real
images**, no video URLs, no entities left. Stories whose source has no usable
still image (some PlayStation trailer posts) get the branded placeholder
card instead. Both fixes need the Vercel project to redeploy before they
reach the live site — until then the browser-side placeholder fallback
already keeps those cards from looking broken.

### How to verify it

```bash
npm run check:js                     # syntax check every script
python3 -m http.server 8000
node tools/verify_pages.js           # every page's tags + every <img> in the DOM
node tools/verify_dynamic.js         # per-game and per-story runtime metadata
node tools/test_news_proxy.js        # runs api/news.js against the live feeds
node tools/verify_news_end_to_end.js # news page against the fixed proxy
bash tools/verify_live.sh            # the deployed site, after you push
```

`tools/verify_live.sh` is the one to run after pushing: it checks each share
image over the network (HTTP 200, `image/*`, 1200×630, under 300 KB), checks
all eleven tags on all six pages, and confirms the proxies are healthy and
still not leaking the RAWG key.

### To reconnect live RAWG data

1. Redeploy this repo to the **same Vercel project** (root = repo root).
2. Set (or **rotate**) the `RAWG_API_KEY` environment variable in the
   Vercel dashboard — see the action item above.
3. Confirm `https://<your-project>.vercel.app/api/rawg?path=games&page_size=1`
   returns JSON, and that the `next` field is a boolean, **not a URL**. If
   you rename the project, update the two URLs in `js/config.js`.

No key is ever committed — it stays server-side. This whole site still runs
for **zero cost** on GitHub Pages + Vercel's free tier.

## Why I started this
 
I wanted to build GeePlays as a place to discover games. Browse a catalog, check requirements, watch trailers, and get sent to the actual official store to buy or download. Nothing fancy under the hood. Plain HTML, CSS, and JavaScript, hosted for free on GitHub Pages. No backend, no database, no build step. Just files.
 
I started with 12 games I added by hand into a JSON file. It worked, but pretty quickly I realized there was no way I was going to sit there typing out entries for hundreds of games one at a time. That frustration is basically the whole story of everything that came after.
 
## First instinct: just call an API from the browser
 
My first thought was simple. There are free game databases out there (I went with RAWG, which has over 500,000 games). Why not just have my site call it directly from the browser and pull in whatever I need?
 
Turns out browsers do not let you do that so easily, and figuring out why taught me more about how the web actually works than anything else in this project.
 
## Learning about CORS the hard way
 
When I tried calling RAWG's API straight from my site's JavaScript, I kept getting blocked. Not because my code was wrong, but because of something called CORS (that stands for Cross Origin Resource Sharing).
 
Here is the plain English version. Browsers have a built in security rule that says JavaScript running on my site is not allowed to read responses from a different site's server, unless that server explicitly says "yes, sites like this one are allowed to read my data." RAWG's API never says that. So no matter how correct my code was, the browser itself was refusing to let the data through. That is not a bug in my site. It is true for basically anyone trying to do this from a plain static site.
 
This was the first real "oh, that is how the internet works" moment of the project.
 
## Building my first serverless proxy
 
The fix was something I had never actually built before: a proxy. A small piece of server side code that sits between my site and RAWG. My site talks to it, it talks to RAWG, and it hands the answer back. Since it is not a browser, CORS does not apply to it at all.
 
I deployed this as a serverless function on Vercel, basically one small JavaScript file that runs on demand, without me having to manage an actual server. It does three things:
 
1. Takes a request from my site (like "search for zelda")
2. Forwards it to RAWG's real API, attaching my secret API key
3. Sends the answer back, with a header added that tells the browser "yes, this site is allowed to read this"
This also solved a second problem I had not even thought about yet: keeping my API key secret. Anything in a file GitHub Pages serves can be read by literally anyone who opens their browser's dev tools. My key had to live somewhere only server side code could see it, which is what environment variables are for. I set `RAWG_API_KEY` in Vercel's dashboard, not in any file that ships to visitors, and the proxy reads it at runtime.
 
## The bugs that actually taught me something
 
Getting this working was not one clean shot. It was three separate, very real bugs, each teaching me a different lesson.
 
### Bug one: a redirect pretending to be a CORS error
 
Even after building the proxy correctly, I was still getting blocked. The error looked like a CORS problem, but there was a second clue buried in the console: a 302 status, which means a redirect.
 
What was actually happening: Vercel has a feature called Deployment Protection that puts an authentication wall in front of your project, and it had defaulted to on. Every request, even from my own site, was quietly being redirected to a Vercel login page instead of reaching my function. A redirect response does not carry the CORS header I had added, so the browser reported it as a CORS failure, even though the real problem was the authentication wall in front of it.
 
The fix was one toggle: turning off Vercel Authentication for that project.
 
### Bug two: data that existed but I could not see
 
This one was the strangest. The network request was succeeding. I could literally print the exact HTML of my results section and see real games with real images sitting right there in the page. But visually, nothing. Blank.
 
The cause: every card had a CSS class meant for a nice scroll triggered fade in effect. Elements start invisible and only become visible once you scroll down to them. That is a nice touch for a static homepage section. But search results appear the instant you type, not by scrolling, so the trigger that was supposed to reveal them never fired. The data was completely there. It was just sitting at zero opacity, forever, waiting for a scroll event that made no sense for that kind of content.
 
The fix: make search results visible immediately instead of waiting on a scroll trigger that only makes sense for static page sections.
 
### Bug three: one missing line
 
Later, after rewriting my homepage to pull live data instead of a fixed list, the page just hung, showing loading skeletons that never went away.
 
Turns out I had updated the actual logic but forgotten to add a single script tag loading the file that logic depended on. The browser hit a function that simply did not exist yet, threw an error immediately, and the rest of the code never got a chance to run. No dramatic bug. Just one missing line, in the wrong order.
 
## What actually solved these, and what I would tell someone starting out
 
Every single one of these got solved the same way. Opening the browser's DevTools and actually looking. The Console for errors, the Network tab for what requests were really happening and what status code they came back with, and View Page Source to see exactly what the server sent, with no assumptions. Guessing harder never worked. Looking at what the browser actually did, every time, did.
 
If I had one piece of advice for someone starting a project like this, it would be this: do not be afraid of a red error message. It is usually not vague. It is the browser handing you the answer, if you read the whole thing instead of skimming it.
 
## A note on how this actually got built
 
I want to be upfront about this part. I used AI (Claude) heavily throughout this project, for planning the architecture, writing the code for the site and the proxy, and walking through each bug with me.
 
But it was not "type a prompt, get a working site." I made the real decisions about what GeePlays should be and look like. I did the actual clicking through of the Vercel dashboard myself, added my own real API key, ran the console commands and read the results myself, and pushed every commit. When things broke, the redirect, the invisible cards, the missing script tag, I was the one staring at my actual browser and reporting back what it showed, and that back and forth is genuinely how each bug got solved. I came away understanding why each fix worked, not just that it did.
 
I think that is a fair way to describe it: assisted by AI, not replaced by AI. I could not have explained CORS, serverless functions, or environment variables in my own words before this project. I can now.
 
## The stack, for anyone curious

* HTML, CSS, and vanilla JavaScript. No frameworks, no build step.
* GitHub Pages for free static hosting, straight from my repo.
* The RAWG API as the live game database powering search and browsing.
* A hand-curated static catalog (`data/games.json`) as the offline fallback,
  with official Steam artwork so cards never look broken.
* Vercel for hosting the two serverless proxy functions (`/api`) that make the
  RAWG and RSS connections possible.
* Git and GitHub for version control, and the thing that actually pushes changes live.
* A light/dark theme (saved to `localStorage`) and a "View on GitHub" link,
  matching the rest of the Gee* family of sites.

The UI design rules live in [DESIGN.md](./DESIGN.md) — dark, gaming-first,
Windows-11 blue as the single accent, glass kept to the navbar and overlays.

If you are building something similar and hit the same CORS wall I did, that is not a sign you are doing something wrong. It is just how browsers work, and a small proxy is the normal way around it.
 
