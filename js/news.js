/* =========================================================
   GeePlays — news.html logic
   Talks only to newsService.getGamingNews() — has no idea
   whether that's RSS, an API, or anything else underneath.
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

  let allArticles = [];
  let activeCategory = null;

  function showState(state) {
    loadingEl.style.display = state === "loading" ? "block" : "none";
    errorEl.style.display = state === "error" ? "block" : "none";
    emptyEl.style.display = state === "empty" ? "block" : "none";
    contentEl.style.display = state === "content" ? "block" : "none";
  }

  async function load() {
    showState("loading");
    try {
      allArticles = await getGamingNews();
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

  /* ---------- Card builders ---------- */

  function buildFeaturedCard(article) {
    const card = document.createElement("article");
    card.className = "news-featured";

    const imgWrap = document.createElement("div");
    imgWrap.className = "cover nf-image";
    imgWrap.style.borderRadius = "0";
    imgWrap.appendChild(buildArticleImage(article));
    card.appendChild(imgWrap);

    const body = document.createElement("div");
    body.className = "nf-body";
    body.innerHTML = `
      <span class="news-cat">${escapeHtml(article.category)}</span>
      <h2 style="font-size:24px; margin:12px 0 10px; line-height:1.3;">${escapeHtml(article.title)}</h2>
      <p style="color:var(--color-text-secondary); font-size:14.5px; margin-bottom:16px;">${escapeHtml(article.description)}</p>
      <div class="news-meta-row" style="margin-bottom:16px;">
        <span class="news-source">${escapeHtml(article.source)}</span>
        <span>${escapeHtml(formatDate(article.publishedAt))}</span>
      </div>
    `;
    const link = document.createElement("a");
    link.href = article.articleUrl;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.className = "btn btn-primary";
    link.textContent = "Read Article";
    body.appendChild(link);
    card.appendChild(body);

    return card;
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
      <div class="news-title">${escapeHtml(article.title)}</div>
      <p class="news-desc">${escapeHtml(article.description)}</p>
      <div class="news-meta-row">
        <span class="news-source">${escapeHtml(article.source)}</span>
        <span>${escapeHtml(formatDate(article.publishedAt))}</span>
      </div>
    `;
    const link = document.createElement("a");
    link.href = article.articleUrl;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.className = "news-read-link";
    link.innerHTML = `Read original article <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 17 17 7M7 7h10v10"/></svg>`;
    body.appendChild(link);
    card.appendChild(body);

    return card;
  }

  function buildArticleImage(article) {
    const img = document.createElement("img");
    img.src = article.image || "";
    img.alt = article.title;
    img.loading = "lazy";
    img.onerror = () => {
      const fb = document.createElement("div");
      fb.className = `cover-fallback pal-${paletteIndex(article.title || article.source)}`;
      fb.innerHTML = `<span class="initial">${escapeHtml(article.category || "News")}</span>`;
      img.replaceWith(fb);
    };
    return img;
  }

  function formatDate(dateStr) {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    if (isNaN(d)) return "";
    return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  }

  load();
})();
