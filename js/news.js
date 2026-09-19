/* =========================================================
   GeePlays — news.html logic
   Talks only to newsService.getGamingNews() — which returns
   { articles, source, degraded, message }. The page renders
   the same either way and shows a small notice when the live
   feed is unavailable and saved stories are shown instead.
   ========================================================= */

(function initNewsPage() {
  const loadingEl = document.getElementById("newsLoading");
  const errorEl = document.getElementById("newsError");
  const errorDetail = document.getElementById("newsErrorDetail");
  const emptyEl = document.getElementById("newsEmpty");
  const contentEl = document.getElementById("newsContent");
  const categoryRow = document.getElementById("newsCategoryRow");
  const featuredWrap = document.getElementById("featuredStoryWrap");
  const grid = document.getElementById("newsGrid");
  const retryBtn = document.getElementById("newsRetryBtn");
  const statusHost = document.getElementById("newsStatus");

  let allArticles = [];
  let activeCategory = null;

  /* A single story can be linked to directly: news.html?a=<slug>. Those
     links are shareable — js/shareMeta.js rewrites the page's share tags
     to that story's own headline, summary and image. */
  let requestedSlug = new URLSearchParams(window.location.search).get("a");

  const DEFAULT_META = {
    title: "Gaming News — Xbox, Nintendo, PlayStation & PC",
    description:
      "Headlines from Xbox Wire, Nintendo Life, PlayStation Blog and PC Gamer, updated through the day. Every card links straight to the publisher's own article.",
    image: window.GeePlaysShare && window.GeePlaysShare.canonical("assets/share/news.jpg"),
    url: window.GeePlaysShare && window.GeePlaysShare.canonical("news.html")
  };

  function showState(state) {
    loadingEl.style.display = state === "loading" ? "block" : "none";
    errorEl.style.display = state === "error" ? "block" : "none";
    emptyEl.style.display = state === "empty" ? "block" : "none";
    contentEl.style.display = state === "content" ? "block" : "none";
  }

  async function load() {
    showState("loading");
    if (statusHost) statusHost.replaceChildren();
    try {
      const result = await getGamingNews();
      allArticles = result.articles || [];

      if (statusHost && result.degraded) {
        statusHost.appendChild(buildStatusNote(result.message, load));
      }

      if (!allArticles.length) {
        showState("empty");
        return;
      }
      renderCategories();
      render();
      showState("content");
    } catch (err) {
      console.error("GeePlays: failed to load news.", err);
      errorDetail.textContent = "Something went wrong reaching the news sources. Please try again in a moment.";
      showState("error");
    }
  }

  retryBtn.addEventListener("click", load);

  function renderCategories() {
    const present = NEWS_CATEGORIES.filter(c => allArticles.some(a => a.category === c));
    categoryRow.replaceChildren();

    const allChip = document.createElement("button");
    allChip.className = "chip" + (activeCategory === null ? " active" : "");
    allChip.textContent = "All";
    allChip.addEventListener("click", () => { activeCategory = null; renderCategories(); render(); });
    categoryRow.appendChild(allChip);

    present.forEach(cat => {
      const chip = document.createElement("button");
      chip.className = "chip" + (activeCategory === cat ? " active" : "");
      chip.textContent = cat;
      chip.addEventListener("click", () => { activeCategory = cat; renderCategories(); render(); });
      categoryRow.appendChild(chip);
    });
  }

  function render() {
    /* ---------- Single story view (news.html?a=<slug>) ---------- */
    if (requestedSlug) {
      const story = findArticleBySlug(requestedSlug);
      if (story) {
        renderSingleArticle(story);
        return;
      }
      // The story has rotated out of the live feed. Fall back to the full
      // feed and say so plainly — never an error, never a blank page.
      requestedSlug = null;
      if (statusHost) {
        statusHost.replaceChildren(
          buildStatusNote("That story has moved off the live feed — here's the latest news instead.", null)
        );
      }
    }
    categoryRow.style.display = "";
    applyDefaultMeta();

    const filtered = activeCategory
      ? allArticles.filter(a => a.category === activeCategory)
      : allArticles;

    if (!filtered.length) {
      featuredWrap.replaceChildren();
      grid.replaceChildren();
      showState("empty");
      return;
    }
    showState("content");

    const [featured, ...rest] = filtered;
    featuredWrap.replaceChildren(buildFeaturedCard(featured));
    grid.replaceChildren();
    rest.forEach(a => grid.appendChild(buildNewsCard(a)));
  }

  /* ---------- Single-story view + per-story share metadata ---------- */

  function slugify(text) {
    return String(text || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 70);
  }

  function shortHash(text) {
    let hash = 0;
    const str = String(text || "");
    for (let i = 0; i < str.length; i++) hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
    return hash.toString(36).slice(0, 6);
  }

  /** Stable, human-readable id for one story: "<headline-slug>-<hash>". */
  function articleSlug(article) {
    const base = slugify(article.title) || "story";
    return `${base}-${shortHash(article.articleUrl || article.title)}`;
  }

  /** Absolute canonical URL — what goes in og:url and on the clipboard. */
  function shareUrlFor(article) {
    const canonical = window.GeePlaysShare && window.GeePlaysShare.canonical;
    return canonical ? canonical("news.html", { a: articleSlug(article) }) : "";
  }

  /** Relative URL — what the page links to internally, so it also works
      when the site is opened from a local server or a fork. */
  function internalUrlFor(article) {
    return `./news.html?a=${encodeURIComponent(articleSlug(article))}`;
  }

  function findArticleBySlug(slug) {
    if (!slug) return null;
    const needle = String(slug).trim();
    // Accept either the generated slug or the publisher's own URL.
    return (
      allArticles.find(a => articleSlug(a) === needle) ||
      allArticles.find(a => (a.articleUrl || "").toLowerCase() === needle.toLowerCase()) ||
      null
    );
  }

  function firstSentence(text) {
    const t = String(text || "").replace(/\s+/g, " ").trim();
    if (!t) return "";
    // A real sentence, or the first chunk if the summary has no full stop.
    const match = t.match(/^[^.?!]{15,}[.?!]/);
    return match ? match[0] : t.slice(0, 170).replace(/\s+\S*$/, "") + "…";
  }

  function applyArticleMeta(article) {
    if (!window.GeePlaysShare) return;
    const source = article.source || "GeePlays News";
    // Exactly two sentences: the story's own summary (or a plain honest
    // line), then where to read it — with the publisher named either way.
    const summary = firstSentence(article.description);
    const description = summary
      ? `${summary} Read the full story at ${source}.`
      : `A gaming story from ${source}, gathered on GeePlays. Read the full story at the publisher.`;

    GeePlaysShare.applyWithVerifiedImage({
      title: `${article.title} — GeePlays`,
      description,
      image: article.image,
      imageAlt: article.title,
      fallbackImage: DEFAULT_META.image,
      url: shareUrlFor(article),
      type: "article"
    });
  }

  /** The feed's own share tags — restores them when no single story is open. */
  function applyDefaultMeta() {
    if (!window.GeePlaysShare) return;
    GeePlaysShare.apply({
      title: DEFAULT_META.title,
      description: DEFAULT_META.description,
      image: DEFAULT_META.image,
      imageAlt: "A stack of news cards, headed “Gaming News”.",
      url: DEFAULT_META.url,
      type: "website"
    });
  }

  function renderSingleArticle(article) {
    categoryRow.style.display = "none";
    grid.replaceChildren();

    const wrap = document.createElement("div");
    wrap.appendChild(buildFeaturedCard(article));

    const row = document.createElement("div");
    row.className = "news-share-row";

    const back = document.createElement("a");
    back.className = "btn btn-ghost btn-sm";
    back.href = "./news.html";
    back.textContent = "← All gaming news";
    row.appendChild(back);

    if (navigator.clipboard && navigator.clipboard.writeText && shareUrlFor(article)) {
      const copy = document.createElement("button");
      copy.type = "button";
      copy.className = "btn btn-ghost btn-sm";
      copy.textContent = "Copy link";
      copy.setAttribute("aria-label", `Copy the GeePlays link to “${article.title}”`);
      copy.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(shareUrlFor(article));
          copy.textContent = "Copied ✓";
          setTimeout(() => (copy.textContent = "Copy link"), 1600);
        } catch (err) {
          console.error("GeePlays: clipboard unavailable.", err);
        }
      });
      row.appendChild(copy);
    }

    wrap.appendChild(row);
    featuredWrap.replaceChildren(wrap);
    showState("content");
    applyArticleMeta(article);
  }

  /* ---------- Card builders ---------- */

  function buildFeaturedCard(article) {
    const card = document.createElement("article");
    card.className = "news-featured";

    const imgWrap = document.createElement("div");
    imgWrap.className = "cover nf-image";
    imgWrap.appendChild(buildArticleImage(article));
    card.appendChild(imgWrap);

    const body = document.createElement("div");
    body.className = "nf-body";
    body.innerHTML = `
      <span class="news-cat">${escapeHtml(article.category)}</span>
      <h2 style="font-size:24px; margin:12px 0 10px; line-height:1.3;"></h2>
      <p style="color:var(--text-secondary); font-size:14.5px; margin-bottom:16px;">${escapeHtml(article.description)}</p>
      <div class="news-meta-row" style="margin-bottom:16px;">
        <span class="news-source">${escapeHtml(article.source)}</span>
        <span>${escapeHtml(formatDate(article.publishedAt))}</span>
      </div>
    `;
    // The headline opens the story's own shareable page on GeePlays
    // (news.html?a=<slug>), which carries that story's preview metadata.
    body.querySelector("h2").appendChild(buildInternalTitleLink(article, "news-featured-title-link"));

    const link = document.createElement("a");
    link.href = article.articleUrl || "#";
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.className = "btn btn-primary";
    link.textContent = "Read Article";
    body.appendChild(link);
    card.appendChild(body);

    return card;
  }

  /** Headline → the GeePlays page for this one story. */
  function buildInternalTitleLink(article, className) {
    const a = document.createElement("a");
    a.href = internalUrlFor(article);
    a.className = className;
    a.textContent = article.title;
    return a;
  }

  function buildNewsCard(article) {
    const card = document.createElement("article");
    card.className = "news-card";

    const imgWrap = document.createElement("div");
    imgWrap.className = "cover news-thumb";
    imgWrap.appendChild(buildArticleImage(article));
    card.appendChild(imgWrap);

    const body = document.createElement("div");
    body.className = "news-body";
    body.innerHTML = `
      <span class="news-cat">${escapeHtml(article.category)}</span>
      <div class="news-title"></div>
      <p class="news-desc">${escapeHtml(article.description)}</p>
      <div class="news-meta-row">
        <span class="news-source">${escapeHtml(article.source)}</span>
        <span>${escapeHtml(formatDate(article.publishedAt))}</span>
      </div>
    `;
    body.querySelector(".news-title").appendChild(buildInternalTitleLink(article, "news-title-link"));

    const link = document.createElement("a");
    link.href = article.articleUrl || "#";
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.className = "news-read-link";
    link.innerHTML = `Read original article <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 17 17 7M7 7h10v10"/></svg>`;
    body.appendChild(link);
    card.appendChild(body);

    return card;
  }

  function usableImageUrl(u) {
    // Only absolute http(s) URLs are worth trying — a relative path from
    // an RSS feed is meaningless on our origin, and data:/javascript:
    // URIs must never reach src.
    if (typeof u !== "string") return "";
    const t = u.trim();
    if (/^https:\/\//i.test(t)) return t;
    if (/^http:\/\//i.test(t)) return t;
    if (/^\/\/[^/]+\//i.test(t)) return "https:" + t; // protocol-relative
    return "";
  }

  function buildArticleImage(article) {
    // Returns either an <img> or a placeholder, so callers can drop it
    // directly into their single .cover wrapper. Every card looks
    // complete either way — the placeholder matches the card surface.
    const src = usableImageUrl(article.image);
    if (src) {
      const img = document.createElement("img");
      img.alt = article.title;
      img.loading = "lazy";
      img.decoding = "async";
      // Fixed intrinsic size so a slow publisher image can't shift the
      // card layout, and no referrer so hot-link checks never blank a card.
      img.width = 800;
      img.height = 450;
      img.referrerPolicy = "no-referrer";
      img.onerror = () => {
        // Publisher image failed (blocked, moved, or offline): the card
        // keeps its shape with the branded placeholder instead of a
        // broken-image icon.
        img.replaceWith(buildPlaceholder(article));
      };
      img.src = src;
      return img;
    }
    return buildPlaceholder(article);
  }

  function buildPlaceholder(article) {
    const fb = document.createElement("div");
    fb.className = `cover-fallback pal-${paletteIndex(article.title || article.source)}`;
    fb.innerHTML = `<span class="initial">${escapeHtml(article.category || "News")}</span>`;
    return fb;
  }

  function formatDate(dateStr) {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    if (isNaN(d)) return "";
    return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  }

  load();
})();
