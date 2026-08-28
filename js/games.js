/* =========================================================
   GeePlays — games.html logic
   Search + filter (genre, platform, rating, tags) over the
   full game catalog loaded from data/games.json.
   ========================================================= */

(async function initGamesPage() {
  const games = await loadGames();

  const params = new URLSearchParams(window.location.search);

  const state = {
    search: params.get("search") || "",
    genres: new Set(params.get("genre") ? [params.get("genre")] : []),
    platforms: new Set(),
    tags: new Set(),
    minRating: 0
  };

  /* ---------- Build filter option lists from data ---------- */

  function uniqueSorted(values) {
    return [...new Set(values)].sort((a, b) => a.localeCompare(b));
  }

  const allPlatforms = uniqueSorted(games.flatMap(g => g.platforms || []));
  const allTags = uniqueSorted(games.flatMap(g => g.tags || []));

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

  buildCheckboxList(document.getElementById("genreFilters"), GEEPLAYS_GENRES, state.genres, applyFilters);
  buildCheckboxList(document.getElementById("platformFilters"), allPlatforms, state.platforms, applyFilters);
  buildCheckboxList(document.getElementById("tagFilters"), allTags, state.tags, applyFilters);

  /* ---------- Search field ---------- */

  const searchInput = document.getElementById("pageSearch");
  searchInput.value = state.search;
  searchInput.addEventListener("input", debounce(() => {
    state.search = searchInput.value.trim();
    applyFilters();
    updateLiveResults();
  }, 180));

  /* ---------- Rating slider ---------- */

  const ratingSlider = document.getElementById("ratingFilter");
  const ratingVal = document.getElementById("ratingFilterVal");
  ratingSlider.addEventListener("input", () => {
    state.minRating = parseFloat(ratingSlider.value);
    ratingVal.textContent = state.minRating.toFixed(1);
    applyFilters();
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
    applyFilters();
    updateLiveResults();
  }
  document.getElementById("clearFilters").addEventListener("click", resetAll);
  document.getElementById("emptyReset").addEventListener("click", resetAll);

  /* ---------- Mobile filter panel toggle ---------- */

  const panel = document.getElementById("filtersPanel");
  document.getElementById("filterToggle")?.addEventListener("click", () => panel.classList.add("open"));
  document.getElementById("filterClose")?.addEventListener("click", () => panel.classList.remove("open"));

  /* ---------- Filtering logic ---------- */

  function matches(game) {
    if (state.search) {
      const haystack = [
        game.title, game.developer, game.publisher,
        ...(game.genre || []), ...(game.tags || [])
      ].join(" ").toLowerCase();
      if (!haystack.includes(state.search.toLowerCase())) return false;
    }
    if (state.genres.size && !(game.genre || []).some(g => state.genres.has(g))) return false;
    if (state.platforms.size && !(game.platforms || []).some(p => state.platforms.has(p))) return false;
    if (state.tags.size && !(game.tags || []).some(t => state.tags.has(t))) return false;
    if ((game.rating || 0) < state.minRating) return false;
    return true;
  }

  function applyFilters() {
    const results = games.filter(matches);
    const grid = document.getElementById("gamesGrid");
    const empty = document.getElementById("emptyState");
    const count = document.getElementById("resultsCount");

    if (results.length === 0) {
      grid.style.display = "none";
      empty.style.display = "block";
      count.textContent = "0 games found";
    } else {
      grid.style.display = "grid";
      empty.style.display = "none";
      count.textContent = `${results.length} game${results.length === 1 ? "" : "s"} found`;
      renderGameGrid(grid, results);
    }
  }

  function debounce(fn, wait) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), wait);
    };
  }

  /* ---------- Live results (RAWG, via proxy) ---------- */

  const liveSection = document.getElementById("liveResultsSection");
  const liveGrid = document.getElementById("liveGrid");
  const liveLoading = document.getElementById("liveLoading");
  let liveRequestId = 0;

  async function updateLiveResults() {
    const query = state.search;
    if (!query || query.length < 2) {
      liveSection.style.display = "none";
      liveGrid.replaceChildren();
      return;
    }
    const thisRequest = ++liveRequestId;
    liveSection.style.display = "block";
    liveLoading.style.display = "block";
    liveGrid.replaceChildren();

    const results = await rawgSearch(query, 8);

    if (thisRequest !== liveRequestId) return; // a newer search superseded this one
    liveLoading.style.display = "none";

    if (!results.length) {
      liveSection.style.display = "none";
      return;
    }
    renderGameGrid(liveGrid, results);
  }

  applyFilters();
  updateLiveResults();
})();
