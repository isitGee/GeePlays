#!/usr/bin/env bash
# =========================================================
#  GeePlays — verify the live site AFTER you push
# =========================================================
#  Checks the real thing, over the network, exactly the way
#  a link unfurler would:
#
#    1. does every share image URL return HTTP 200 + image/*?
#    2. is the file actually 1200x630 and under ~300 KB?
#    3. does every page serve the required og:*/twitter:* tags?
#    4. is the fallback image reachable too?
#
#  Usage:  bash tools/verify_live.sh
#  Requires: curl (and python3, only for the size/dimension check)
# =========================================================
set -u

SITE="https://isitgee.github.io/GeePlays"
PAGES="index.html games.html game.html news.html support.html about.html"
IMAGES="index.jpg games.jpg game.jpg news.jpg support.jpg about.jpg default.jpg"

ok=0
bad=0
green() { printf '  \033[32m✓\033[0m %s\n' "$1"; ok=$((ok+1)); }
red()   { printf '  \033[31m✗\033[0m %s\n' "$1"; bad=$((bad+1)); }

echo "GeePlays live verification — $SITE"
echo

echo "── Share images ──"
for img in $IMAGES; do
  url="$SITE/assets/share/$img"
  read -r code type size <<<"$(curl -sSL -m 30 -o /tmp/_gp.jpg -w '%{http_code} %{content_type} %{size_download}' "$url")"
  if [ "$code" = "200" ] && [[ "$type" == image/* ]]; then
    kbs=$((size / 1024))
    dims="$(python3 -c "
from PIL import Image
try:
    im = Image.open('/tmp/_gp.jpg')
    print(f'{im.width}x{im.height}')
except Exception:
    print('unreadable')
" 2>/dev/null || echo "unknown")"
    if [ "$dims" = "1200x630" ]; then
      green "$img — 200 $type, ${kbs} KB, 1200x630"
    else
      red "$img — 200 but dimensions are $dims (expected 1200x630)"
    fi
    if [ "$kbs" -gt 300 ]; then red "$img — ${kbs} KB is over the 300 KB budget"; fi
  else
    red "$img — HTTP $code ${type:-no type} (expected 200 image/*)"
  fi
done

echo
echo "── Per-page share tags ──"
for page in $PAGES; do
  url="$SITE/$page"
  html="$(curl -sSL -m 30 "$url")"
  if [ -z "$html" ]; then red "$page — no response"; continue; fi
  missing=""
  for tag in 'property="og:title"' 'property="og:description"' 'property="og:image"' \
             'property="og:url"' 'property="og:type"' 'property="og:site_name"' \
             'name="twitter:card"' 'name="twitter:title"' 'name="twitter:description"' \
             'name="twitter:image"' 'rel="canonical"'; do
    grep -q "$tag" <<<"$html" || missing="$missing $tag"
  done
  if [ -z "$missing" ]; then
    og_title="$(grep -o 'property="og:title" content="[^"]*"' <<<"$html" | head -1 | sed 's/.*content="//;s/"$//')"
    green "$page — all share tags present (og:title: ${og_title:0:60})"
  else
    red "$page — missing:$missing"
  fi
  # every og:image on the page must resolve
  while IFS= read -r imgurl; do
    [ -z "$imgurl" ] && continue
    code="$(curl -sSL -m 30 -o /dev/null -w '%{http_code}' "$imgurl")"
    if [ "$code" = "200" ]; then
      green "$page og:image reachable — ${imgurl##*/}"
    else
      red "$page og:image $imgurl — HTTP $code"
    fi
  done < <(grep -o 'property="og:image" content="[^"]*"' <<<"$html" | sed 's/.*content="//;s/"$//' | sort -u)
done

echo
echo "── Proxy endpoints ──"
rawg="$(curl -sS -m 30 -o /tmp/_rawg.json -w '%{http_code}' 'https://geeplays-rawg-proxy-isitgee.vercel.app/api/rawg?path=games&page_size=1')"
if [ "$rawg" = "200" ] && grep -q '"next":true\|"next":null\|"next":false' /tmp/_rawg.json; then
  green "/api/rawg — 200, pagination scrubbed (no API key echoed)"
else
  red "/api/rawg — HTTP $rawg (or 'next' still a raw URL carrying the key)"
fi
grep -q 'key=' /tmp/_rawg.json && red "/api/rawg — API key found in the response body!" || green "/api/rawg — no key in the response body"

news="$(curl -sS -m 40 -o /tmp/_news.json -w '%{http_code}' 'https://geeplays-rawg-proxy-isitgee.vercel.app/api/news')"
if [ "$news" = "200" ]; then
  green "/api/news — 200"
  grep -q '\.mp4' /tmp/_news.json && red "/api/news — still returning video URLs as article images (redeploy api/news.js)" \
    || green "/api/news — no video URLs used as article images"
  grep -qE '&#[0-9a-fx]+;' /tmp/_news.json && red "/api/news — still returning HTML entities inside URLs (redeploy api/news.js)" \
    || green "/api/news — no undecoded HTML entities in URLs"
else
  red "/api/news — HTTP $news"
fi

echo
if [ "$bad" -eq 0 ]; then
  printf '\033[32mAll %d checks passed.\033[0m Social previews are live.\n' "$ok"
else
  printf '\033[31m%d checks passed, %d failed.\033[0m\n' "$ok" "$bad"
  exit 1
fi
