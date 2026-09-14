/* =========================================================
   GeePlays — game.html logic
   Reads ?id=<slug> or ?rawg=<id> from the URL and loads the
   game through the catalog facade: live RAWG first, saved
   picks as a graceful fallback.
   ========================================================= */

(async function initGamePage() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get("id");
  const rawgId = params.get("rawg");

  const loadingState = document.getElementById("loadingState");
  const errorState = document.getElementById("errorState");
  const content = document.getElementById("gameContent");

  function showError(title, message, actionHref, actionLabel) {
    loadingState.style.display = "none";
    content.style.display = "none";
    errorState.style.display = "block";
    document.getElementById("errorTitle").textContent = title;
    document.getElementById("errorMessage").textContent = message;

    const action = errorState.querySelector(".btn");
    if (action) {
      if (actionHref) {
        action.href = actionHref;
        action.textContent = actionLabel || "Browse All Games";
        action.style.display = "inline-flex";
      } else {
        action.style.display = "none";
      }
    }
  }

  // Missing game ID entirely
  if (!id && !rawgId) {
    showError("No game selected", "Pick a game from the catalog to see its details.");
    return;
  }

  const { game, degraded, notFound, message } = await catalogGetGame({ id, rawgId });

  if (!game) {
    if (degraded) {
      showError(
        "Live data is offline",
        message || "Live game data is temporarily unavailable, and this game isn't in the saved picks.",
        "./games.html",
        "Browse Saved Picks"
      );
    } else if (rawgId) {
      showError(
        "Game not found",
        "We couldn't find a live match for that game. It may have been removed from the database."
      );
    } else {
      showError(
        "Game not found",
        `We couldn't find a game matching "${id}".`
      );
    }
    return;
  }

  loadingState.style.display = "none";
  content.style.display = "block";
  document.getElementById("pageTitle").textContent = `${game.title} — GeePlays`;

  // Subtle note when this is a saved pick (live data unavailable).
  if (degraded && game.source === "local") {
    const hero = document.querySelector(".game-hero");
    if (hero) {
      const note = buildStatusNote(
        "Live game data is temporarily unavailable — showing the saved version of this game."
      );
      note.style.marginBottom = "16px";
      hero.parentElement.insertBefore(note, hero);
    }
  }

  /* ---------- Hero banner (falls back to gradient cover) ---------- */
  const bannerBg = document.getElementById("bannerBg");
  const bannerImg = new Image();
  bannerImg.onload = () => bannerBg.appendChild(bannerImg);
  bannerImg.onerror = () => {
    const fb = document.createElement("div");
    fb.className = `cover-fallback pal-${paletteIndex(game.title)}`;
    fb.style.height = "100%";
    fb.innerHTML = `<span class="initial" style="font-size:22px;">${escapeHtml(coverInitials(game.title))}</span>`;
    bannerBg.appendChild(fb);
  };
  bannerImg.src = game.banner || game.cover;
  bannerImg.alt = `${game.title} banner`;

  /* ---------- Hero content ---------- */
  document.getElementById("gameTitle").textContent = game.title;

  const heroTags = document.getElementById("heroTags");
  if (game.source === "rawg") {
    const livePill = document.createElement("span");
    livePill.className = "tag-pill";
    livePill.style.borderColor = "#6fc4ff";
    livePill.style.color = "#6fc4ff";
    livePill.textContent = "Live · via RAWG";
    heroTags.appendChild(livePill);
  } else {
    const pickPill = document.createElement("span");
    pickPill.className = "tag-pill";
    pickPill.textContent = "Saved Pick";
    heroTags.appendChild(pickPill);
  }
  (game.tags || []).slice(0, 5).forEach(tag => {
    const pill = document.createElement("span");
    pill.className = "tag-pill";
    pill.textContent = tag;
    heroTags.appendChild(pill);
  });

  const heroMeta = document.getElementById("heroMeta");
  heroMeta.innerHTML = `
    <span class="m-item">${ratingMarkup(game.rating || 0, "")}</span>
    <span class="m-item">${escapeHtml((game.genre || []).join(" · "))}</span>
    <span class="m-item">${escapeHtml(game.developer || "Unknown developer")}</span>
    <span class="m-item">${escapeHtml(formatDate(game.releaseDate))}</span>
    <span class="m-item">${escapeHtml((game.platforms || []).join(" / "))}</span>
  `;

  /* ---------- Buttons ---------- */
  const getBtn = document.getElementById("getGameBtn");
  if (game.download && game.download.url) {
    getBtn.href = game.download.url;
    getBtn.textContent = game.download.label || "Get Game";
  } else {
    getBtn.style.display = "none";
  }

  const watchBtn = document.getElementById("watchBtn");
  const watchUrl = game.youtube || game.youtubeSearchUrl;
  if (watchUrl) {
    watchBtn.href = watchUrl;
    watchBtn.textContent = game.youtube ? "Watch Gameplay" : "Search Gameplay on YouTube";
  } else {
    watchBtn.style.display = "none";
  }

  /* ---------- Description ---------- */
  document.getElementById("gameDescription").textContent =
    game.description || game.shortDescription || "No description available yet.";

  /* ---------- Screenshots + lightbox ---------- */
  const screenshots = (game.screenshots || []).filter(Boolean);
  const screensBlock = document.getElementById("screenshotsBlock");
  const screensGrid = document.getElementById("screensGrid");

  if (screenshots.length === 0) {
    screensBlock.style.display = "none";
  } else {
    let lightboxIndex = 0;
    screenshots.forEach((src, i) => {
      const thumb = document.createElement("div");
      thumb.className = "screen-thumb";
      const img = document.createElement("img");
      img.src = src;
      img.alt = `${game.title} screenshot ${i + 1}`;
      img.loading = "lazy";
      img.decoding = "async";
      img.onerror = () => {
        const fb = document.createElement("div");
        fb.className = `cover-fallback pal-${(paletteIndex(game.title) + i + 1) % 6}`;
        fb.style.height = "100%";
        fb.innerHTML = `<span class="initial">Screenshot ${i + 1}</span>`;
        thumb.replaceChildren(fb);
      };
      thumb.appendChild(img);
      thumb.addEventListener("click", () => openLightbox(i));
      thumb.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openLightbox(i);
        }
      });
      thumb.tabIndex = 0;
      thumb.setAttribute("role", "button");
      thumb.setAttribute("aria-label", `View screenshot ${i + 1} full size`);
      screensGrid.appendChild(thumb);
    });

    const lightbox = document.getElementById("lightbox");
    const lightboxImg = document.getElementById("lightboxImg");

    function openLightbox(i) {
      lightboxIndex = i;
      lightboxImg.src = screenshots[i];
      lightboxImg.alt = `${game.title} screenshot ${i + 1}`;
      lightbox.classList.add("open");
    }
    function closeLightbox() { lightbox.classList.remove("open"); }
    function stepLightbox(delta) {
      lightboxIndex = (lightboxIndex + delta + screenshots.length) % screenshots.length;
      openLightbox(lightboxIndex);
    }

    document.getElementById("lightboxClose").addEventListener("click", closeLightbox);
    document.getElementById("lightboxPrev").addEventListener("click", () => stepLightbox(-1));
    document.getElementById("lightboxNext").addEventListener("click", () => stepLightbox(1));
    lightbox.addEventListener("click", (e) => { if (e.target === lightbox) closeLightbox(); });
    document.addEventListener("keydown", (e) => {
      if (!lightbox.classList.contains("open")) return;
      if (e.key === "Escape") closeLightbox();
      if (e.key === "ArrowLeft") stepLightbox(-1);
      if (e.key === "ArrowRight") stepLightbox(1);
    });
  }

  /* ---------- Gameplay video embed ---------- */
  const gameplayBlock = document.getElementById("gameplayBlock");
  const videoEmbed = document.getElementById("videoEmbed");
  const videoId = extractYouTubeId(game.youtube);

  if (!videoId) {
    gameplayBlock.style.display = "none";
  } else {
    const iframe = document.createElement("iframe");
    iframe.src = `https://www.youtube.com/embed/${videoId}`;
    iframe.title = `${game.title} gameplay video`;
    iframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture";
    iframe.allowFullscreen = true;
    iframe.loading = "lazy";
    videoEmbed.appendChild(iframe);
  }

  /* ---------- Requirements ---------- */
  const req = game.requirements || {};
  const reqTable = document.getElementById("reqTable");
  const reqLabels = { os: "OS", processor: "Processor", memory: "Memory", graphics: "Graphics", storage: "Storage" };

  function renderRequirements(tier) {
    const data = req[tier];
    reqTable.replaceChildren();
    if (!data || !Object.keys(data).length) {
      const row = document.createElement("div");
      row.className = "req-row";
      row.innerHTML = `<dt>—</dt><dd>No ${tier} requirements listed for this game.</dd>`;
      reqTable.appendChild(row);
      return;
    }
    Object.entries(reqLabels).forEach(([key, label]) => {
      if (!data[key]) return;
      const row = document.createElement("div");
      row.className = "req-row";
      row.innerHTML = `<dt>${label}</dt><dd>${escapeHtml(data[key])}</dd>`;
      reqTable.appendChild(row);
    });
  }
  renderRequirements("minimum");

  document.querySelectorAll(".req-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".req-tab").forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      renderRequirements(tab.dataset.req);
    });
  });

  /* ---------- Info card ---------- */
  const infoRows = document.getElementById("infoRows");
  const infoData = [
    ["Developer", game.developer],
    ["Publisher", game.publisher],
    ["Release Date", formatDate(game.releaseDate)],
    ["Genre", (game.genre || []).join(", ")],
    ["Platforms", (game.platforms || []).join(", ")],
    ["Rating", game.rating ? `${game.rating.toFixed(1)} / 10` : "—"]
  ];
  infoData.forEach(([k, v]) => {
    const row = document.createElement("div");
    row.className = "info-row";
    row.innerHTML = `<span class="k">${escapeHtml(k)}</span><span class="v">${escapeHtml(v || "—")}</span>`;
    infoRows.appendChild(row);
  });

  /* ---------- Helpers ---------- */

  function formatDate(dateStr) {
    if (!dateStr) return "Unknown";
    const d = new Date(dateStr);
    if (isNaN(d)) return dateStr;
    return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  }

  function extractYouTubeId(url) {
    if (!url) return null;
    const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{6,})/);
    return match ? match[1] : null;
  }
})();
