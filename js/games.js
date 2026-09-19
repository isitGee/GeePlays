/* =========================================================
   GeePlays — games.html logic
   Browses the catalog through the facade (js/catalog.js):
   live RAWG first, saved picks as an automatic fallback.
   Genre/platform/tag filters translate to query params for
   live data and to local matching for saved picks.
   ========================================================= */

(function initGamesPage() {
  const params = new URLSearchParams(window.location.search);

  const state = {
    search: params.get("search") || "",
    genres: new Set(params.get("genre") ? [params.get("genre")] : []),
    platforms: new Set(),
    tags: new Set(),
    minRating: 0,
    page: 1,
    hasMore: false,
    totalCount: 0,
    allResults: [],
    source: "rawg",
    degraded: false
  };

  /* ---------- DOM ---------- */

  const grid = document.getElementById("gamesGrid");
  const empty = document.getElementById("emptyState");
  const count = document.getElementById("resultsCount");
  const loadMoreWrap = document.getElementById("loadMoreWrap");
  const loadMoreBtn = document.getElementById("loadMoreBtn");
  const statusHost = document.getElementById("catalogStatus");
  const searchInput = document.getElementById("pageSearch");

  /* ---------- Filter checkboxes ---------- */

  function buildCheckboxList(container, values, activeSet, onChange) {
    container.replaceChildren();
    values.forEach(value => {
      const label = document.createElement("label");
      label.className = "filter-check";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = activeSet.has(value);
      input.addEventListener("change", () => {
        input.checked ? activeSet.add(value) : activeSet.delete(value);
        onChange();
      });
      label.appendChild(input);
      label.appendChild(document.createTextNode(value));
      container.appendChild(label);
    });
  }

  buildCheckboxList(document.getElementById("genreFilters"), GEEPLAYS_GENRES, state.genres, refresh);
  buildCheckboxList(document.getElementById("platformFilters"), Object.keys(PLATFORM_QUERY_MAP), state.platforms, refresh);
  buildCheckboxList(document.getElementById("tagFilters"), BROWSE_TAGS, state.tags, refresh);

  /* ---------- Search field ---------- */

  searchInput.value = state.search;
  searchInput.addEventListener("input", debounce(() => {
    state.search = searchInput.value.trim();
    refresh();
  }, 300));

  /* ---------- Rating slider (client-side; neither source has min-rating) ---------- */

  const ratingSlider = document.getElementById("ratingFilter");
  const ratingVal = document.getElementById("ratingFilterVal");
  ratingSlider.addEventListener("input", () => {
    state.minRating = parseFloat(ratingSlider.value);
    ratingVal.textContent = state.minRating.toFixed(1);
    render();
  });

  /* ---------- Clear filters ---------- */

  function resetAll() {
    state.search = "";
    state.genres.clear();
    state.platforms.clear();
    state.tags.clear();
    state.minRating = 0;
    searchInput.value = "";
    ratingSlider.value = 0;
    ratingVal.textContent = "0.0";
    document.querySelectorAll(".filter-check input").forEach(cb => (cb.checked = false));
    refresh();
  }
  document.getElementById("clearFilters").addEventListener("click", resetAll);
  document.getElementById("emptyReset").addEventListener("click", resetAll);

  /* ---------- Mobile filter panel ---------- */

  const panel = document.getElementById("filtersPanel");
  document.getElementById("filterToggle")?.addEventListener("click", () => panel.classList.add("open"));
  document.getElementById("filterClose")?.addEventListener("click", () => panel.classList.remove("open"));

  /* ---------- Status note (degraded fallback) ---------- */

  function renderStatus() {
    if (!statusHost) return;
    statusHost.replaceChildren();
    if (state.degraded) {
      statusHost.appendChild(buildStatusNote(
        "Live game data is temporarily unavailable — showing saved picks instead.",
        refresh
      ));
    }
  }

  /* ---------- Fetching ---------- */

  let requestId = 0;

  async function fetchPage(page) {
    return catalogBrowse({
      search: state.search,
      genres: [...state.genres],
      platforms: [...state.platforms],
      tags: [...state.tags],
      ordering: state.search ? undefined : "-added",
      page,
      pageSize: 24
    });
  }

  async function refresh() {
    const thisRequest = ++requestId;
    state.page = 1;
    state.allResults = [];
    count.textContent = "Loading…";
    grid.style.display = "grid";
    empty.style.display = "none";
    loadMoreWrap.style.display = "none";
    statusHost && statusHost.replaceChildren();
    buildSkeletonCards(grid, 8);

    const result = await fetchPage(1);
    if (thisRequest !== requestId) return; // superseded by a newer change

    state.allResults = result.results;
    state.totalCount = result.count;
    state.hasMore = result.hasMore;
    state.source = result.source;
    state.degraded = result.degraded;
    renderStatus();
    render();
  }

  async function loadMore() {
    state.page += 1;
    loadMoreBtn.disabled = true;
    loadMoreBtn.textContent = "Loading…";
    const result = await fetchPage(state.page);
    state.allResults = state.allResults.concat(result.results);
    state.hasMore = result.hasMore;
    loadMoreBtn.disabled = false;
    loadMoreBtn.textContent = "Load More Games";
    render();
  }
  loadMoreBtn.addEventListener("click", loadMore);

  /* ---------- Render ---------- */

  function render() {
    const visible = state.allResults.filter(g => (g.rating || 0) >= state.minRating);

    if (visible.length === 0) {
      grid.style.display = "none";
      empty.style.display = "block";
      loadMoreWrap.style.display = "none";
      count.textContent = "0 games found";
      return;
    }

    grid.style.display = "grid";
    empty.style.display = "none";
    const sourceLabel = state.degraded ? "saved picks" : "live catalog";
    count.textContent =
      `Showing ${visible.length.toLocaleString()} of ${state.totalCount.toLocaleString()} games · ${sourceLabel}`;
    renderGameGrid(grid, visible);
    loadMoreWrap.style.display = state.hasMore ? "flex" : "none";
  }

  function debounce(fn, wait) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), wait);
    };
  }

  /* ---------- Share preview for a filtered view ----------
     A genre or search link (games.html?genre=Horror, ?search=hades) is a
     link people actually share, so the tags should describe what the page
     is showing rather than the whole catalog. The URL in the address bar is
     normalised to the same canonical form at the same time. */
  function syncShareMeta() {
    if (!window.GeePlaysShare) return;

    const genre = [...state.genres][0] || "";
    const search = state.search || "";
    if (!genre && !search) {
      // Plain catalog — the HTML already carries the right tags.
      return;
    }

    const params = genre ? { genre } : { search };
    const url = GeePlaysShare.canonical("games.html", params);
    try {
      if (window.location.href !== url) window.history.replaceState(null, "", url);
    } catch (e) {
      // History is restricted in some embedded browsers — harmless.
    }

    const title = genre
      ? `${genre} Games — Browse the GeePlays Catalog`
      : `“${search}” — GeePlays Catalog Search`;
    const description = genre
      ? `Every ${genre.toLowerCase()} game in the GeePlays catalog, live from RAWG — artwork first, with ratings, platforms and a detail page behind each one.`
      : `Search results for “${search}” across the GeePlays catalog, live from RAWG — artwork first, with ratings and platforms for each game.`;

    GeePlaysShare.apply({
      title,
      description,
      image: GeePlaysShare.canonical("assets/share/games.jpg"),
      imageAlt: `GeePlays catalog — ${genre ? genre + " games" : search}`,
      url,
      type: "website"
    });
  }

  refresh();
  syncShareMeta();
})();
