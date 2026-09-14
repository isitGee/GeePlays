/* =========================================================
   GeePlays — homepage logic
   Featured + Latest sections via the catalog facade (live
   RAWG first, saved picks as a graceful fallback), plus the
   genre chips. Never shows a blank section.
   ========================================================= */

(async function initHome() {
  const featuredGrid = document.getElementById("featuredGrid");
  const latestGrid = document.getElementById("latestGrid");
  const chipContainer = document.getElementById("genreChips");

  function attachNotice(container, result) {
    const host = container && container.parentElement;
    if (!host || !result.degraded) return;
    const existing = host.querySelector(".status-note");
    if (existing) return;
    const note = buildStatusNote(result.message, () => window.location.reload());
    host.insertBefore(note, container);
  }

  // Render skeletons immediately (already in HTML), then fill in.
  const [featured, latest] = await Promise.all([
    catalogFeatured(4),
    catalogLatest(4)
  ]);

  if (featuredGrid) {
    renderGameGrid(featuredGrid, featured.results);
    attachNotice(featuredGrid, featured);
  }
  if (latestGrid) {
    renderGameGrid(latestGrid, latest.results);
    attachNotice(latestGrid, latest);
  }

  if (chipContainer) {
    GEEPLAYS_GENRES.forEach(genre => {
      const a = document.createElement("a");
      a.className = "chip";
      a.href = `./games.html?genre=${encodeURIComponent(genre)}`;
      a.textContent = genre;
      chipContainer.appendChild(a);
    });
  }
})();
