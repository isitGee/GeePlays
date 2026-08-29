/* =========================================================
   GeePlays — shared script
   Loaded on every page. Handles navigation, data loading,
   reusable card/rating rendering, and small UI behaviors.
   ========================================================= */

const GEEPLAYS_GENRES = [
  "Action", "Adventure", "Racing", "RPG",
  "Sports", "Strategy", "Horror", "Multiplayer"
];

/* ---------- Data loading ---------- */

async function loadGames() {
  try {
    const res = await fetch("data/games.json");
    if (!res.ok) throw new Error("Failed to load games.json");
    return await res.json();
  } catch (err) {
    console.error("GeePlays: could not load game data.", err);
    return [];
  }
}

async function loadNews() {
  try {
    const res = await fetch("data/news.json");
    if (!res.ok) throw new Error("Failed to load news.json");
    return await res.json();
  } catch (err) {
    console.error("GeePlays: could not load news data.", err);
    return [];
  }
}

/* ---------- Cover art fallback ----------
   Every card image is given an onerror handler that swaps
   in a generated gradient + initials placeholder. This keeps
   the site fully functional before real artwork is added. */

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
  const filled = Math.round((rating / 10) * 10); // 10 segments
  let bars = "";
  for (let i = 0; i < 10; i++) {
    bars += `<i class="${i < filled ? "on" : ""}"></i>`;
  }
  return `
    <span class="rating ${size}">
      <span class="rating-bars">${bars}</span>
      <span class="rating-num">${rating.toFixed(1)}<small>/10</small></span>
    </span>`;
}

/* ---------- Game card ---------- */

function buildGameCard(game) {
  const isLive = game.source === "rawg";
  const card = document.createElement("a");
  card.href = isLive
    ? `game.html?rawg=${encodeURIComponent(game.rawgId)}`
    : `game.html?id=${encodeURIComponent(game.id)}`;
  card.className = "game-card fade-in";

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
  // Show immediately — these cards appear from typing/filtering, not from
  // scrolling to them, so they shouldn't wait for a scroll-triggered reveal.
  container.querySelectorAll(".fade-in").forEach(el => el.classList.add("in-view"));
}

/* ---------- Navbar ---------- */

function initNavbar() {
  const nav = document.querySelector(".navbar");
  if (!nav) return;
  const onScroll = () => {
    nav.classList.toggle("scrolled", window.scrollY > 12);
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  // Highlight current page link
  const path = window.location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll(".nav-links a, .mobile-menu a").forEach(a => {
    const href = a.getAttribute("href").split("?")[0];
    if (href === path || (path === "" && href === "index.html")) {
      a.classList.add("active");
    }
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
    const q = input.value.trim();
    window.location.href = `games.html?search=${encodeURIComponent(q)}`;
  });
}

/* ---------- Fade-in on scroll ---------- */

function observeFadeIns() {
  const els = document.querySelectorAll(".fade-in:not(.in-view)");
  if (!("IntersectionObserver" in window)) {
    els.forEach(el => el.classList.add("in-view"));
    return;
  }
  const io = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add("in-view");
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1 });
  els.forEach(el => io.observe(el));
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
  observeFadeIns();
});
