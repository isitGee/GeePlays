# tools/panels/ — share-card background artwork

One 16:9 PNG per share card, generated with an image model and used as the
background for the matching card in `assets/share/`. `tools/make_share.py`
composites the real headline, eyebrow, wordmark and URL on top of these, so
the typography stays crisp and on-brand no matter what the model produced.

| Panel | Used for |
|---|---|
| `index_home.png` | `assets/share/index.jpg` — homepage |
| `games_catalog.png` | `assets/share/games.jpg` — catalog wall |
| `game_detail.png` | `assets/share/game.jpg` — game detail page |
| `news_feed.png` | `assets/share/news.jpg` — news feed |
| `support_pay.png` | `assets/share/support.jpg` — support page |
| `about_story.png` | `assets/share/about.jpg` — about page |
| `default_fallback.png` | `assets/share/default.jpg` — the fallback card |

## House style for these panels

Dark matte charcoal (`#0f1115`) ground, a single controlled Windows-11 blue
(`#2f9bf0`) accent light, the left third kept dark and empty for the text
overlay, `1200×630` output. Explicitly **no** text, letters, numbers, logos or
watermarks — all wording is added by the compositor.

## Replacing one

Drop a new PNG in with the same filename and re-run `python3
tools/make_share.py`. Anything 16:9 works: the compositor scale-and-crops to
exactly 1200×630 (and `CARDS` can zoom the crop via its `inset` value if a
panel has a decorative frame you want cropped past).
