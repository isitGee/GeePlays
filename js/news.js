/* =========================================================
   GeePlays — news.html logic
   ========================================================= */

(async function initNewsPage() {
  const news = await loadNews();
  const grid = document.getElementById("newsGrid");
  const empty = document.getElementById("newsEmpty");

  if (!news.length) {
    grid.style.display = "none";
    empty.style.display = "block";
    return;
  }

  const sorted = [...news].sort((a, b) => new Date(b.date) - new Date(a.date));
  grid.replaceChildren();

  sorted.forEach(item => {
    const card = document.createElement("a");
    card.className = "news-card fade-in";
    card.href = item.url || "#";

    const thumbWrap = document.createElement("div");
    thumbWrap.className = "cover news-thumb";
    const img = document.createElement("img");
    img.src = item.image || "";
    img.alt = item.title;
    img.loading = "lazy";
    img.onerror = () => {
      const fb = document.createElement("div");
      fb.className = `cover-fallback pal-${paletteIndex(item.title)}`;
      fb.innerHTML = `<span class="initial">${escapeHtml(item.category || "News")}</span>`;
      thumbWrap.replaceChildren(fb);
    };
    thumbWrap.appendChild(img);
    card.appendChild(thumbWrap);

    const body = document.createElement("div");
    body.className = "news-body";
    body.innerHTML = `
      <div class="news-cat">${escapeHtml(item.category || "News")}</div>
      <div class="news-title">${escapeHtml(item.title)}</div>
      <p class="news-desc">${escapeHtml(item.description || "")}</p>
      <div class="news-date">${escapeHtml(formatDate(item.date))}</div>
    `;
    card.appendChild(body);

    grid.appendChild(card);
  });

  observeFadeIns();

  function formatDate(dateStr) {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    if (isNaN(d)) return dateStr;
    return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  }
})();
