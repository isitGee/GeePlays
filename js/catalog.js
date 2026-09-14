/* =========================================================
   GeePlays — catalog facade
   ---------------------------------------------------------
   The single data layer every page talks to. It tries the
   live RAWG catalog first and, if that is unavailable, falls
   back to the local dataset without the UI ever changing.

   Every result object carries two extra fields:
     source    — "rawg" | "local"  (where the data came from)
     degraded  — true when we fell back to local data
   so the UI can show a small, honest notice ("showing saved
   picks") instead of a broken or blank section.
   ========================================================= */

const DEGRADED_MESSAGE =
  "Live game data is temporarily unavailable — showing saved picks instead.";

async function catalogBrowse(opts = {}) {
  try {
    const live = await rawgBrowse(opts);
    return {
      results: live.results,
      count: live.count,
      hasMore: live.hasMore,
      source: "rawg",
      degraded: false,
      message: ""
    };
  } catch (err) {
    console.warn("GeePlays: live catalog unavailable, using saved picks.", err && err.message);
    const local = await localBrowse(opts);
    return {
      results: local.results,
      count: local.count,
      hasMore: local.hasMore,
      source: "local",
      degraded: true,
      message: DEGRADED_MESSAGE
    };
  }
}

async function catalogFeatured(limit = 4) {
  try {
    const live = await rawgBrowse({ ordering: "-added", pageSize: limit });
    return {
      results: live.results,
      source: "rawg",
      degraded: false,
      message: ""
    };
  } catch (err) {
    console.warn("GeePlays: live featured unavailable, using saved picks.", err && err.message);
    return {
      results: await localFeatured(limit),
      source: "local",
      degraded: true,
      message: DEGRADED_MESSAGE
    };
  }
}

async function catalogLatest(limit = 4) {
  const today = new Date();
  const ninetyDaysAgo = new Date(today.getTime() - 90 * 24 * 60 * 60 * 1000);
  const fmt = d => d.toISOString().slice(0, 10);
  const dates = `${fmt(ninetyDaysAgo)},${fmt(today)}`;

  try {
    const live = await rawgBrowse({ ordering: "-released", dates, pageSize: limit });
    return {
      results: live.results,
      source: "rawg",
      degraded: false,
      message: ""
    };
  } catch (err) {
    console.warn("GeePlays: live latest unavailable, using saved picks.", err && err.message);
    return {
      results: await localLatest(limit),
      source: "local",
      degraded: true,
      message: DEGRADED_MESSAGE
    };
  }
}

/**
 * Resolve a game detail page request.
 * @param {{id?: string, rawgId?: string}} ref
 */
async function catalogGetGame(ref = {}) {
  const { id, rawgId } = ref;

  if (rawgId) {
    try {
      const game = await rawgGetGame(rawgId);
      if (game) {
        return { game, source: "rawg", degraded: false, notFound: false };
      }
      // RAWG responded, but there is no such game.
      return { game: null, source: "rawg", degraded: false, notFound: true };
    } catch (err) {
      console.warn("GeePlays: live game lookup unavailable.", err && err.message);
      return {
        game: null,
        source: "local",
        degraded: true,
        notFound: true,
        message: "Live game data is temporarily unavailable, and this game isn't in the saved picks."
      };
    }
  }

  const game = await localGetGame(id);
  if (game) {
    return { game, source: "local", degraded: false, notFound: false };
  }
  return { game: null, source: "local", degraded: false, notFound: true };
}
