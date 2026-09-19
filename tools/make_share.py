#!/usr/bin/env python3
"""
GeePlays — social share card compositor
=======================================

Takes the generated artwork panels in /home/user/raw and composites the real,
page-specific typography on top, producing 1200x630 JPEGs for assets/share/.

Brand rules are taken from the repo's own DESIGN.md:
  * background   #0f1115
  * text primary #f4f5f7, secondary #a6adb8, muted #6d7480
  * the only accent is the Windows 11 blue family (#2f9bf0 / #7cc6ff)
  * Inter (metrically Segoe-like) for text, JetBrains Mono for HUD labels
  * hairline + type hierarchy, no neon, no rainbow gradients, no glow
"""

import os
import sys
import urllib.request

from PIL import Image, ImageDraw, ImageFilter, ImageFont

TOOLS = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(TOOLS)

# The background panels are the model-generated artwork inputs (see
# tools/panels/README.md). Point GEEPLAYS_PANELS elsewhere to use others.
RAW = os.environ.get("GEEPLAYS_PANELS", os.path.join(TOOLS, "panels"))
FONTS = os.environ.get("GEEPLAYS_FONTS", os.path.join(TOOLS, ".fonts"))
OUT = os.environ.get("GEEPLAYS_SHARE_OUT", os.path.join(REPO, "assets", "share"))

# Fonts are fetched once into tools/.fonts (both are open-licensed: Inter is
# OFL, JetBrains Mono is OFL). They are not committed — just downloaded.
FONT_URLS = {
    "inter400.ttf": "https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfMZg.ttf",
    "inter600.ttf": "https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuGKYMZg.ttf",
    "inter700.ttf": "https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuFuYMZg.ttf",
    "jb.ttf": "https://fonts.gstatic.com/s/jetbrainsmono/v24/tDbY2o-flEEny0FZhsfKu5WU4zr3E_BX0PnT8RD8yKxjPVmUsaaDhw.ttf",
}


def ensure_fonts():
    os.makedirs(FONTS, exist_ok=True)
    for name, url in FONT_URLS.items():
        path = os.path.join(FONTS, name)
        if os.path.exists(path) and os.path.getsize(path) > 10000:
            continue
        print(f"fetching {name} …")
        try:
            urllib.request.urlretrieve(url, path)
        except Exception as err:  # offline: fall back to a system font
            print(f"  ! could not fetch {name} ({err})", file=sys.stderr)

W, H = 1200, 630
BG = (15, 17, 21)
TEXT = (244, 245, 247)
TEXT_2 = (166, 173, 184)
MUTED = (109, 116, 128)
ACCENT = (47, 155, 240)
ACCENT_SOFT = (124, 198, 255)

PAD_L = 72
PAD_T = 54

f_title = lambda s: ImageFont.truetype(os.path.join(FONTS, "inter700.ttf"), s)
f_body = lambda s: ImageFont.truetype(os.path.join(FONTS, "inter400.ttf"), s)
f_semi = lambda s: ImageFont.truetype(os.path.join(FONTS, "inter600.ttf"), s)
f_mono = lambda s: ImageFont.truetype(os.path.join(FONTS, "jb.ttf"), s)


# ----------------------------------------------------------------------
# helpers
# ----------------------------------------------------------------------
def cover_crop(img, w, h, inset=0.0):
    """Scale + center-crop to exactly w x h (no distortion).

    `inset` zooms in slightly (0.03 = 3%) — used to crop past decorative
    frames that some artwork panels carry along their own edges.
    """
    src_w, src_h = img.size
    scale = max(w / src_w, h / src_h) * (1 + inset)
    new = img.resize((round(src_w * scale), round(src_h * scale)), Image.LANCZOS)
    left = (new.width - w) // 2
    top = (new.height - h) // 2
    return new.crop((left, top, left + w, top + h))


def measure(draw, text, font):
    box = draw.textbbox((0, 0), text, font=font)
    return box[2] - box[0], box[3] - box[1]


def wrap(draw, text, font, max_w):
    words, lines, line = text.split(), [], ""
    for word in words:
        probe = f"{line} {word}".strip()
        if measure(draw, probe, font)[0] <= max_w or not line:
            line = probe
        else:
            lines.append(line)
            line = word
    if line:
        lines.append(line)
    return lines


def fit_block(draw, text, sizes, max_w, max_lines):
    """Pick the largest size that wraps into <= max_lines lines."""
    for size in sizes:
        font = f_title(size)
        lines = wrap(draw, text, font, max_w)
        if len(lines) <= max_lines:
            return font, lines
    font = f_title(sizes[-1])
    return font, wrap(draw, text, font, max_w)


def draw_tracked(draw, xy, text, font, fill, tracking, shadow=None):
    """Letter-spaced text (the HUD-eyebrow look) with optional soft shadow."""
    x, y = xy
    if shadow is not None:
        sx, sy, sfill = shadow
        cx = x
        for ch in text:
            draw.text((cx + sx, y + sy), ch, font=font, fill=sfill)
            cx += draw.textlength(ch, font=font) + tracking
    for ch in text:
        draw.text((x, y), ch, font=font, fill=fill)
        x += draw.textlength(ch, font=font) + tracking


def build_card(src_name, eyebrow, title, tagline, out_name, quality=86,
               title_max_w=540, quiet=False, inset=0.0):
    art = Image.open(os.path.join(RAW, src_name)).convert("RGB")
    card = cover_crop(art, W, H, inset).convert("RGBA")

    # --- left scrim: text always readable, artwork never washed out -------
    scrim = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    sd = ImageDraw.Draw(scrim)
    for x in range(0, 780):
        # solid over the text column, easing to nothing before mid-frame
        t = x / 780
        alpha = int(238 * (1 - t) ** 1.45)
        sd.line([(x, 0), (x, H)], fill=(BG[0], BG[1], BG[2], alpha))
    # gentle floor so the mono URL never sits on busy artwork
    for y in range(H - 150, H):
        t = (y - (H - 150)) / 150
        sd.line([(0, y), (W, y)], fill=(BG[0], BG[1], BG[2], int(120 * t * t)))

    card = Image.alpha_composite(card, scrim)
    draw = ImageDraw.Draw(card)

    # --- soft shadow layer for all type ----------------------------------
    shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    sh = ImageDraw.Draw(shadow)

    # --- wordmark --------------------------------------------------------
    wm_font = f_semi(34)
    sh.text((PAD_L + 1, PAD_T + 3), "GeePlays", font=wm_font, fill=(0, 0, 0, 150))
    draw.text((PAD_L, PAD_T), "GeePlays", font=wm_font, fill=TEXT)
    dot_x = PAD_L + draw.textlength("GeePlays", font=wm_font)
    sh.text((dot_x + 1, PAD_T + 3), ".", font=wm_font, fill=(0, 0, 0, 150))
    draw.text((dot_x, PAD_T), ".", font=wm_font, fill=ACCENT)

    # --- headline block --------------------------------------------------
    eyebrow_font = f_mono(13)
    tag_font = f_body(21 if not quiet else 23)
    title_font, title_lines = (f_title(56) if quiet else fit_block(
        draw, title, [62, 56, 50, 44, 38], title_max_w, 2))
    if quiet:
        title_lines = wrap(draw, title, title_font, title_max_w)
    tag_lines = wrap(draw, tagline, tag_font, title_max_w + 20)[:2]

    lead_title = title_font.size * 1.14
    lead_tag = tag_font.size * 1.42

    block_h = (6 + 20) + (len(title_lines) * lead_title) + 20 + (len(tag_lines) * lead_tag)
    top = 168 + max(0, (300 - block_h) // 2)  # sit the block in the optical centre

    # accent marker + eyebrow
    draw.rectangle([PAD_L, top, PAD_L + 46, top + 3], fill=ACCENT)
    draw_tracked(draw, (PAD_L, top + 18), eyebrow, eyebrow_font, ACCENT_SOFT, 3.0)

    y = top + 18 + 26
    for line in title_lines:
        sh.text((PAD_L + 1, y + 3), line, font=title_font, fill=(0, 0, 0, 160))
        draw.text((PAD_L, y), line, font=title_font, fill=TEXT)
        y += lead_title

    y += 14
    for line in tag_lines:
        sh.text((PAD_L + 1, y + 2), line, font=tag_font, fill=(0, 0, 0, 140))
        draw.text((PAD_L, y), line, font=tag_font, fill=TEXT_2)
        y += lead_tag

    # --- footer: the canonical URL, verbatim -----------------------------
    url_font = f_mono(15)
    draw.text((PAD_L, H - PAD_T - 4), "isitgee.github.io/GeePlays", font=url_font, fill=MUTED)

    shadow = shadow.filter(ImageFilter.GaussianBlur(7))
    card = Image.alpha_composite(card, shadow)

    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, out_name)
    card.convert("RGB").save(path, "JPEG", quality=quality, optimize=True,
                             progressive=True, subsampling=1)
    return path


CARDS = [
    # (art source, eyebrow, title, tagline, out file)
    ("index_home.png", "GEEPLAYS \u00b7 GAMING DISCOVERY HUB",
     "Find your next obsession.", "Browse the catalog, check the specs, watch real gameplay \u2014 then go play.",
     "index.jpg", 84),
    ("games_catalog.png", "GEEPLAYS \u00b7 THE CATALOG",
     "All Games", "Filter by genre, platform, rating and tag \u2014 live from RAWG, with saved picks offline.",
     "games.jpg", 84),
    ("game_detail.png", "GEEPLAYS \u00b7 GAME DETAILS",
     "Every game, in detail.", "Screenshots, PC requirements, ratings and platforms \u2014 plus where to get it.",
     "game.jpg", 84),
    ("news_feed.png", "GEEPLAYS \u00b7 NEWS FEED",
     "Gaming News", "Xbox, Nintendo, PlayStation and PC headlines from the official sources.",
     "news.jpg", 84, 0.05),
    ("support_pay.png", "GEEPLAYS \u00b7 SUPPORT",
     "Support GeePlays", "Send any amount you choose \u2014 M-Pesa, Airtel Money or NMB Bank.",
     "support.jpg", 84),
    ("about_story.png", "GEEPLAYS \u00b7 ABOUT",
     "A hub for finding your next game.", "No store, no downloads \u2014 just a good place to decide what to play.",
     "about.jpg", 84),
    ("default_fallback.png", "GEEPLAYS \u00b7 GAMING DISCOVERY HUB",
     "Discover what to play next", "Browse games, check requirements, watch gameplay, and find where to get them.",
     "default.jpg", 86),
]


if __name__ == "__main__":
    ensure_fonts()
    if not os.path.isdir(RAW):
        sys.exit(
            f"Panels not found in {RAW}.\n"
            "The background artwork panels are the inputs to this script — see\n"
            "tools/panels/README.md. Set GEEPLAYS_PANELS to point at another folder."
        )
    for item in CARDS:
        src, eyebrow, title, tagline, out, q = item[0], item[1], item[2], item[3], item[4], item[5]
        inset = item[6] if len(item) > 6 else 0.0
        path = build_card(src, eyebrow, title, tagline, out, quality=q, inset=inset)
        size_kb = os.path.getsize(path) / 1024
        print(f"{out:14s} {size_kb:7.1f} KB")
