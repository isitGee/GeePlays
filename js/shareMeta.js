/* =========================================================
   GeePlays — social share metadata helper (js/shareMeta.js)
   ---------------------------------------------------------
   Static pages author their Open Graph / Twitter tags directly
   in the HTML <head>. Pages that render their content at
   runtime (game.html, the per-article view on news.html) use
   this helper to rewrite those same tags once the real title,
   description and artwork are known, so a shared link unfurls
   with the right preview instead of the page's generic one.

   It also owns two things every page needs:
     * the absolute canonical URL for the current page
     * the single fallback share image (assets/share/default.jpg),
       used whenever a per-page image is missing or does not load

   Nothing here talks to a network except `verifyImage()`, which
   re-points a share image at the branded fallback if the real
   artwork is unreachable. That keeps the promise that a share
   preview is never a broken image.
   ========================================================= */

const GeePlaysShare = (function () {
  const CONFIG = window.GEEPLAYS_CONFIG || {};

  /* The production site lives on GitHub Pages under a project path, so a
     bare origin is not enough to build canonical URLs. This is the one
     place the hosting location is written down. */
  const SITE_ORIGIN = "https://isitgee.github.io";
  const SITE_BASE = SITE_ORIGIN + "/GeePlays/";
  const SITE_NAME = "GeePlays";

  // The single fallback image used when a per-page image is missing.
  const DEFAULT_SHARE_IMAGE =
    CONFIG.shareImageDefault || SITE_BASE + "assets/share/default.jpg";

  /* What the page's own HTML said, so a dynamic page can fall back to it
     instead of inventing something when its data never arrives. */
  const authored = {
    title: document.title || SITE_NAME,
    description: readMeta("name", "description"),
    image: readMeta("property", "og:image") || DEFAULT_SHARE_IMAGE,
    type: readMeta("property", "og:type") || "website"
  };

  /* ---------- low-level head helpers ---------- */

  function readMeta(attr, key) {
    const el = document.head.querySelector(`meta[${attr}="${key}"]`);
    return el ? el.getAttribute("content") || "" : "";
  }

  function ensureMeta(attr, key) {
    let el = document.head.querySelector(`meta[${attr}="${key}"]`);
    if (!el) {
      el = document.createElement("meta");
      el.setAttribute(attr, key);
      document.head.appendChild(el);
    }
    return el;
  }

  function setProperty(key, value) {
    if (value === undefined || value === null || value === "") return;
    ensureMeta("property", key).setAttribute("content", value);
  }

  function setName(key, value) {
    if (value === undefined || value === null || value === "") return;
    ensureMeta("name", key).setAttribute("content", value);
  }

  function setCanonical(url) {
    if (!url) return;
    let link = document.head.querySelector('link[rel="canonical"]');
    if (!link) {
      link = document.createElement("link");
      link.setAttribute("rel", "canonical");
      document.head.appendChild(link);
    }
    link.setAttribute("href", url);
  }

  /**
   * Turn any relative path or partial URL into a fully absolute one on the
   * canonical site. Returns "" when the input cannot be made absolute, so
   * callers can fall back rather than publish a broken og:image.
   */
  function absolute(url) {
    if (!url) return "";
    try {
      const resolved = new URL(url, SITE_BASE);
      if (resolved.protocol !== "https:" && resolved.protocol !== "http:") return "";
      return resolved.href;
    } catch {
      return "";
    }
  }

  /**
   * Absolute canonical URL for a page in the site, with optional query
   * parameters. Always https and always on the canonical host, so a link
   * shared from a preview deployment still points at the real site.
   */
  function canonical(page, params) {
    const path = String(page || "").replace(/^\/+/, "").replace(/^\.\//, "");
    const url = new URL(path, SITE_BASE);
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, v);
      });
    }
    return url.href;
  }

  /**
   * Update every share tag at once.
   * @param {{title?:string, description?:string, image?:string, imageAlt?:string,
   *          url?:string, type?:string}} opts
   */
  function apply(opts = {}) {
    const title = opts.title || authored.title;
    const description = opts.description || authored.description;
    const url = opts.url || "";
    const type = opts.type || authored.type || "website";
    const image = absolute(opts.image) || authored.image || DEFAULT_SHARE_IMAGE;

    document.title = title;

    setProperty("og:title", title);
    setProperty("og:description", description);
    setProperty("og:image", image);
    setProperty("og:image:alt", opts.imageAlt || title);
    setProperty("og:type", type);
    setProperty("og:site_name", SITE_NAME);
    if (url) setProperty("og:url", url);

    setName("twitter:card", "summary_large_image");
    setName("twitter:title", title);
    setName("twitter:description", description);
    setName("twitter:image", image);
    setName("twitter:image:alt", opts.imageAlt || title);
    setName("description", description);

    if (url) setCanonical(url);
    return { title, description, image, url, type };
  }

  /** Put the page back to the values its own HTML shipped with. */
  function reset() {
    return apply({
      title: authored.title,
      description: authored.description,
      image: authored.image,
      url: canonical(""),
      type: authored.type
    });
  }

  /**
   * Resolve when an image URL actually loads in this browser, reject when it
   * errors or takes too long. Used to guarantee that a share preview points
   * at artwork that exists, never at a 404.
   */
  function verifyImage(url, timeoutMs = 6000) {
    return new Promise((resolve, reject) => {
      if (!url) {
        reject(new Error("no url"));
        return;
      }
      const probe = new Image();
      const timer = setTimeout(() => {
        probe.onload = probe.onerror = null;
        probe.src = "";
        reject(new Error("timed out"));
      }, timeoutMs);
      probe.onload = () => {
        clearTimeout(timer);
        resolve(url);
      };
      probe.onerror = () => {
        clearTimeout(timer);
        reject(new Error("failed to load"));
      };
      probe.referrerPolicy = "no-referrer";
      probe.src = url;
    });
  }

  /**
   * Apply share tags immediately with the real artwork, then quietly swap to
   * the branded fallback if that artwork turns out to be unreachable. The
   * caller keeps the best-case preview and still never ships a broken one.
   */
  function applyWithVerifiedImage(opts = {}) {
    const fallback = absolute(opts.fallbackImage) || authored.image || DEFAULT_SHARE_IMAGE;
    const artwork = absolute(opts.image);
    const applied = apply({ ...opts, image: artwork || fallback });
    if (!artwork || artwork === fallback) return applied;

    // A later, better update (e.g. the visitor opened another article) must
    // win over this fallback: only rewrite the tag if the value is still the
    // artwork this call published.
    verifyImage(artwork).catch(() => {
      if (readMeta("property", "og:image") !== artwork) return;
      apply({ ...opts, image: fallback });
    });

    return applied;
  }

  return {
    SITE_ORIGIN,
    SITE_BASE,
    SITE_NAME,
    DEFAULT_SHARE_IMAGE,
    absolute,
    canonical,
    apply,
    applyWithVerifiedImage,
    reset,
    verifyImage
  };
})();

/* A top-level `const` in a classic script does NOT become a window
   property, and every caller guards with `window.GeePlaysShare` — so the
   helper is attached explicitly rather than left as a bare global. */
window.GeePlaysShare = GeePlaysShare;
