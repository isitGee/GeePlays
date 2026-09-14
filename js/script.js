/* =========================================================
   GeePlays — shared script
   Loaded on every page. Handles navigation, theme, reusable
   card/rating rendering, loading skeletons, status notes and
   small UI behaviors.
   ========================================================= */

const GEEPLAYS_GENRES = [
  "Action", "Adventure", "Racing", "RPG",
  "Sports", "Strategy", "Horror", "Multiplayer"
];

/* ---------- Cover art fallback ----------
   Every card image is given an onerror handler that swaps
   in a generated gradient + initials placeholder. */

function coverInitials(title) {
  return title
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map(w => w[0])
    .join("")
    .toUpperCase();
}

function paletteIndex(title) {
  let hash = 0;
  for (let i = 0; i < title.length; i++) hash = (hash * 31 + title.charCodeAt(i)) >>> 0;
  return hash % 6;
}

function buildCoverEl(src, title, extraClass) {
  const wrap = document.createElement("div");
  wrap.className = "cover" + (extraClass ? " " + extraClass : "");

  const img = document.createElement("img");
  img.src = src;
  img.alt = `${title} cover art`;
  img.loading = "lazy";
  img.decoding = "async";
  img.onerror = () => {
    const fallback = document.createElement("div");
    fallback.className = `cover-fallback pal-${paletteIndex(title)}`;
    fallback.innerHTML = `<span class="initial">${escapeHtml(coverInitials(title))}</span>`;
    wrap.replaceChildren(fallback);
  };
  wrap.appendChild(img);
  return wrap;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

/* ---------- Rating bar (signature UI element) ---------- */

function ratingMarkup(rating, size = "") {
  const num = Number(rating) || 0;
  const filled = Math.round((num / 10) * 10); // 10 segments
  let bars = "";
  for (let i = 0; i < 10; i++) {
    bars += `<i class="${i < filled ? "on" : ""}"></i>`;
  }
  return `
    <span class="rating ${size}">
      <span class="rating-bars">${bars}</span>
      <span class="rating-num">${num.toFixed(1)}<small>/10</small></span>
    </span>`;
}

/* ---------- Game card ---------- */

function buildGameCard(game) {
  const isLive = game.source === "rawg";
  const card = document.createElement("a");
  card.href = isLive
    ? `game.html?rawg=${encodeURIComponent(game.rawgId)}`
    : `game.html?id=${encodeURIComponent(game.id)}`;
  card.className = "game-card";
  card.setAttribute("aria-label", `${game.title} — view details`);

  const cover = buildCoverEl(game.cover, game.title);
  if (isLive) {
    const badge = document.createElement("span");
    badge.className = "live-badge";
    badge.textContent = "Live";
    cover.appendChild(badge);
  }
  card.appendChild(cover);

  const genre = document.createElement("div");
  genre.className = "card-genre";
  genre.textContent = (game.genre || []).slice(0, 2).join(" · ");
  card.appendChild(genre);

  const title = document.createElement("div");
  title.className = "card-title";
  title.textContent = game.title;
  card.appendChild(title);

  const desc = document.createElement("p");
  desc.className = "card-desc";
  desc.textContent = game.shortDescription || "";
  card.appendChild(desc);

  const meta = document.createElement("div");
  meta.className = "card-meta";
  meta.innerHTML = ratingMarkup(game.rating || 0);
  const plat = document.createElement("span");
  plat.className = "card-platforms";
  plat.textContent = (game.platforms || []).slice(0, 2).join(" / ");
  meta.appendChild(plat);
  card.appendChild(meta);

  const btn = document.createElement("span");
  btn.className = "btn btn-ghost btn-sm btn-block";
  btn.textContent = "View Details";
  card.appendChild(btn);

  return card;
}

function renderGameGrid(container, games) {
  container.replaceChildren();
  games.forEach(g => container.appendChild(buildGameCard(g)));
}

/* ---------- Loading skeletons (content-aware) ---------- */

function buildSkeletonCards(container, count = 4) {
  container.replaceChildren();
  for (let i = 0; i < count; i++) {
    const card = document.createElement("div");
    card.className = "skeleton-card";
    card.setAttribute("aria-hidden", "true");
    card.innerHTML = `
      <div class="skeleton sk-cover"></div>
      <div class="skeleton sk-line" style="width:60%"></div>
      <div class="skeleton sk-line short"></div>`;
    container.appendChild(card);
  }
}

/* ---------- Status note (degraded data notice) ---------- */

function buildStatusNote(message, onRetry) {
  const note = document.createElement("div");
  note.className = "status-note";
  note.setAttribute("role", "status");

  const icon = document.createElement("span");
  icon.className = "status-icon";
  icon.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 8v4l2.5 2.5"/></svg>`;
  note.appendChild(icon);

  const text = document.createElement("span");
  text.innerHTML = `<strong>Heads up:</strong> ${escapeHtml(message)}`;
  note.appendChild(text);

  if (typeof onRetry === "function") {
    const retry = document.createElement("button");
    retry.type = "button";
    retry.className = "status-retry";
    retry.textContent = "Retry live data";
    retry.addEventListener("click", onRetry);
    const spacer = document.createTextNode(" ");
    text.appendChild(spacer);
    text.appendChild(retry);
  }

  return note;
}

/* ---------- Navbar ---------- */

function initNavbar() {
  const nav = document.querySelector(".navbar");
  if (!nav) return;

  const path = window.location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll(".nav-links a, .mobile-menu a").forEach(a => {
    const href = a.getAttribute("href").split("?")[0];
    if (href === path || (path === "" && href === "index.html")) {
      a.classList.add("active");
    }
  });
}

/* ---------- Theme (dark/light) ---------- */

function initTheme() {
  const toggle = document.querySelector("[data-theme-toggle]");
  if (!toggle) return;

  const root = document.documentElement;

  function apply(theme) {
    root.setAttribute("data-theme", theme);
    try { localStorage.setItem("geeplays-theme", theme); } catch (e) { /* private mode */ }
    updateLabel(theme);
  }

  function updateLabel(theme) {
    const next = theme === "dark" ? "light" : "dark";
    toggle.setAttribute("aria-label", `Switch to ${next} theme`);
    toggle.setAttribute("aria-pressed", String(theme === "light"));
    toggle.title = `Switch to ${next} theme`;
  }

  // The inline <head> script already set the initial theme.
  updateLabel(root.getAttribute("data-theme") || "dark");

  toggle.addEventListener("click", () => {
    const current = root.getAttribute("data-theme") === "light" ? "light" : "dark";
    apply(current === "light" ? "dark" : "light");
  });
}

function initMobileMenu() {
  const hamburger = document.querySelector(".hamburger");
  const menu = document.querySelector(".mobile-menu");
  const close = document.querySelector(".mobile-close");
  if (!hamburger || !menu) return;
  hamburger.addEventListener("click", () => menu.classList.add("open"));
  close?.addEventListener("click", () => menu.classList.remove("open"));
  menu.querySelectorAll("a").forEach(a => a.addEventListener("click", () => menu.classList.remove("open")));
}

function initSearchOverlay() {
  const trigger = document.querySelector("[data-search-trigger]");
  const overlay = document.querySelector(".search-overlay");
  const closeBtn = document.querySelector("[data-search-close]");
  const form = document.querySelector("[data-search-form]");
  const input = document.querySelector("[data-search-input]");
  if (!trigger || !overlay) return;

  const open = () => {
    overlay.classList.add("open");
    setTimeout(() => input?.focus(), 150);
  };
  const closeOverlay = () => overlay.classList.remove("open");

  trigger.addEventListener("click", open);
  closeBtn?.addEventListener("click", closeOverlay);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) closeOverlay(); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeOverlay();
    if ((e.key === "/" || (e.ctrlKey && e.key === "k")) && document.activeElement.tagName !== "INPUT") {
      e.preventDefault();
      open();
    }
  });

  form?.addEventListener("submit", (e) => {
    e.preventDefault();
    const q = (input?.value || "").trim();
    window.location.href = `games.html?search=${encodeURIComponent(q)}`;
  });
}

/* ---------- Footer year ---------- */

function initFooterYear() {
  const el = document.querySelector("[data-year]");
  if (el) el.textContent = new Date().getFullYear();
}

/* ---------- Genre chips (shared between home + games page) ---------- */

function renderGenreChips(container, activeGenre, onSelect) {
  container.replaceChildren();
  const all = document.createElement("button");
  all.className = "chip" + (!activeGenre ? " active" : "");
  all.textContent = "All Genres";
  all.addEventListener("click", () => onSelect(null));
  container.appendChild(all);

  GEEPLAYS_GENRES.forEach(genre => {
    const chip = document.createElement("button");
    chip.className = "chip" + (activeGenre === genre ? " active" : "");
    chip.textContent = genre;
    chip.addEventListener("click", () => onSelect(genre));
    container.appendChild(chip);
  });
}

/* ---------- Init on every page ---------- */

document.addEventListener("DOMContentLoaded", () => {
  initNavbar();
  initMobileMenu();
  initSearchOverlay();
  initFooterYear();
  initTheme();
});
