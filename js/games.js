/* =========================================================
   GeePlays — games.html logic (RAWG-powered)
   Browses RAWG's full catalog directly — genre/platform/tag filters
   translate into RAWG query params, and results page in via "Load More"
   instead of being limited to a small local list.
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
    allResults: []
  };

  /* ---------- Build filter checkboxes (fixed lists — RAWG-driven) ---------- */

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
        refresh();
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

  const searchInput = document.getElementById("pageSearch");
  searchInput.value = state.search;
  searchInput.addEventListener("input", debounce(() => {
    state.search = searchInput.value.trim();
    refresh();
  }, 300));

  /* ---------- Rating slider (applied client-side; RAWG has no min-rating param) ---------- */

  const ratingSlider = document.getElementById("ratingFilter");
  const ratingVal = document.getElementById("ratingFilterVal");
  ratingSlider.addEventListener("input", () => {
    state.minRating = parseFloat(ratingSlider.value);
    ratingVal.textContent = state.minRating.toFixed(1);
    render(); // client-side only — no need to re-fetch from RAWG
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

  /* ---------- Mobile filter panel toggle ---------- */

  const panel = document.getElementById("filtersPanel");
  document.getElementById("filterToggle")?.addEventListener("click", () => panel.classList.add("open"));
  document.getElementById("filterClose")?.addEventListener("click", () => panel.classList.remove("open"));

  /* ---------- Fetching ---------- */

  const grid = document.getElementById("gamesGrid");
  const empty = document.getElementById("emptyState");
  const count = document.getElementById("resultsCount");
  const loadMoreWrap = document.getElementById("loadMoreWrap");
  const loadMoreBtn = document.getElementById("loadMoreBtn");

  let requestId = 0;

  async function fetchPage(page) {
    return rawgBrowse({
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
    grid.replaceChildren();
    for (let i = 0; i < 8; i++) {
      const sk = document.createElement("div");
      sk.className = "skeleton";
      sk.style.aspectRatio = "3/4";
      grid.appendChild(sk);
    }

    const { results, count: total, hasMore } = await fetchPage(1);
    if (thisRequest !== requestId) return; // superseded by a newer filter change

    state.allResults = results;
    state.totalCount = total;
    state.hasMore = hasMore;
    render();
  }

  async function loadMore() {
    state.page += 1;
    loadMoreBtn.disabled = true;
    loadMoreBtn.textContent = "Loading…";
    const { results, hasMore } = await fetchPage(state.page);
    state.allResults = state.allResults.concat(results);
    state.hasMore = hasMore;
    loadMoreBtn.disabled = false;
    loadMoreBtn.textContent = "Load More Games";
    render();
  }
  loadMoreBtn.addEventListener("click", loadMore);

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
    count.textContent = `Showing ${visible.length.toLocaleString()} of ${state.totalCount.toLocaleString()} games`;
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

  refresh();
})();
