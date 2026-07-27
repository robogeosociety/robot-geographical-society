/**
 * Codex data layer.
 *
 * Everything the viewer reads is a static JSON file emitted by
 * `web/scripts/build-codex.js` into `public/codex-data/`, so there is no API,
 * no auth, and no backend call on this path — the codex renders even when the
 * Worker is unreachable.
 *
 * Three fetches at most for any page:
 *   index       once, ~200 metadata rows — powers search and the index page
 *   article     per campground — body AST, ToC, loop roster
 *   siteBundle  per campground — every site body, fetched only on a site page
 *
 * Each is memoised as a PROMISE, so concurrent callers share one request and a
 * re-visit is free. Failures are evicted so a retry actually retries.
 */

const base = () => `${import.meta.env.BASE_URL || '/'}codex-data`;

const cache = new Map();

function once(key, load) {
  if (cache.has(key)) return cache.get(key);
  const p = load().catch((err) => { cache.delete(key); throw err; });
  cache.set(key, p);
  return p;
}

async function getJSON(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${path} → HTTP ${res.status}`);
  return res.json();
}

/** The whole-codex index: `{ available, generated, counts, campgrounds[] }`. */
export function loadIndex() {
  return once('index', () => getJSON(`${base()}/index.json`));
}

/** One campground article. */
export function loadCampground(slug) {
  return once(`cg:${slug}`, () => getJSON(`${base()}/cg/${encodeURIComponent(slug)}.json`));
}

/** Every site body for one campground, keyed by site key. */
export function loadSiteBundle(slug) {
  return once(`sites:${slug}`, () => getJSON(`${base()}/cg/${encodeURIComponent(slug)}.sites.json`));
}

/** Test-only — drop the memoised promises. */
export function _resetCodexCache() {
  cache.clear();
}
