# GeePlays

A dark, glassmorphic gaming discovery hub. Browse games, check requirements,
flip through screenshots, watch gameplay, and follow a link to the official
store to get each game. GeePlays never hosts, mirrors, or proxies game files —
every "Get Game" button opens an external URL you control.

Built with plain HTML, CSS and vanilla JavaScript. No build step, no
frameworks, no backend. Works straight from the file system, a local dev
server, or GitHub Pages.

## Quick start

- **VS Code + Live Server:** open the folder, right-click `index.html`, choose
  "Open with Live Server."
- **Any static server:** `python3 -m http.server 8080` from the project root,
  then visit `http://localhost:8080`.
- **GitHub Pages:** push the folder to a repo and enable Pages on the `main`
  branch. All internal links use relative paths (`./css/...`, `./data/...`),
  so it works fine from a project subdirectory too.

Opening `index.html` directly via `file://` will *not* work in most browsers,
because the JSON fetches are blocked by CORS on the file protocol. Use a local
server instead.

## About the sample data

`data/games.json` ships with 12 real games as a working example, sourced from
public information and linked to their **official storefronts** (mostly
Steam, one on the Epic Games Store) — not to any third‑party download site.
Ratings are illustrative "GeePlays scores," not pulled from any review
aggregator. Requirements are reasonable approximations; swap in the exact
figures from each store page if you want them to be authoritative.

Screenshot and cover paths point at `assets/images/...` files that **don't
exist yet** — no copyrighted box art or screenshots are bundled with this
project. Until you add real images, every cover/screenshot automatically
falls back to a generated gradient card with the game's initials, so the site
looks intentional and works out of the box. Drop a matching image into the
right folder and it's used automatically — no code changes needed.

## Editing content

Everything the site displays comes from two JSON files. You should almost
never need to touch the HTML/CSS/JS to add or change a game.

### Add or edit a game — `data/games.json`

1. Copy an existing game object.
2. Change `id` and `slug` to something unique and URL-safe (e.g. `hades-2`).
3. Fill in the fields — see the table below.
4. Save. The game appears automatically on the homepage (if it's a top
   rating or the most recent release), on `games.html`, and its own page at
   `game.html?id=your-id`.

| Field | Notes |
|---|---|
| `cover` / `banner` | Path to an image in `assets/images/...`. Missing files fall back gracefully. |
| `download.url` | **The only thing that controls the "Get Game" button.** Point this at whatever store or page you want — Steam, Epic, GOG, your own site. Leave it out (or set `url` to `""`) to hide the button entirely. |
| `youtube` | Any `youtube.com/watch?v=` or `youtu.be/` link. Powers both the "Watch Gameplay" button and the embedded player. Leave blank to hide both. |
| `genre` / `platforms` / `tags` | Arrays of strings. Used for the filter checkboxes on `games.html` — new values you add show up as new filter options automatically for `platforms` and `tags`. `genre` filters are limited to the 8 categories used across the site (see `GEEPLAYS_GENRES` in `js/script.js`) so the homepage category chips stay consistent. |
| `rating` | A number from 0–10. Drives the segmented rating bar shown on cards and the detail page. |
| `requirements.minimum` / `.recommended` | Each is an object with `os`, `processor`, `memory`, `graphics`, `storage`. Omit a tier entirely and the page shows a friendly "not listed" message instead of breaking. |

### Add or edit news — `data/news.json`

Same idea: copy an entry, give it a unique `id`, and fill in `title`,
`description`, `image`, `date` (`YYYY-MM-DD`), `category`, and `url` (where
the card links to — an internal page, or an external article).

### Adding your own images

Drop files into:

```
assets/images/games/       → cover art (used on cards + fallback source)
assets/images/banners/     → wide banner for the game detail hero
assets/images/screenshots/ → screenshot gallery images
assets/images/news/        → news card thumbnails
```

Match the filename referenced in the JSON and it just works.

## Project structure

```
geeplays/
├── index.html          Homepage: hero, featured/latest games, genres, why-us
├── games.html           Full catalog with search + filters
├── game.html             Game detail template (populated via ?id=)
├── news.html              News grid
├── about.html              About page
├── css/style.css            All styling, incl. CSS variable theme tokens
├── js/
│   ├── script.js               Shared: nav, search, data loading, card/rating rendering
│   ├── games.js                 games.html search/filter logic
│   ├── game.js                    game.html detail-page logic
│   └── news.js                      news.html logic
├── data/
│   ├── games.json                    Edit this to add/change games
│   └── news.json                      Edit this to add/change news posts
└── assets/images/…                     Drop your own art here
```

## Re-theming

Every color, radius, and font is a CSS custom property at the top of
`css/style.css`:

```css
:root {
  --bg: #0a0a12;
  --accent: #8b6cff;
  --accent-2: #ff7a59;
  --font-display: "Space Grotesk", sans-serif;
  /* … */
}
```

Change these and the whole site re-skins — cards, buttons, the rating bars,
the hero glow, everything reads off the same tokens.

## Notes

- No React/Vue/Angular, no PHP, no database, no environment variables — this
  is intentionally a static site so it works anywhere.
- Search and filtering are 100% client-side (`js/games.js`), no backend
  required.
- Respects `prefers-reduced-motion`.
