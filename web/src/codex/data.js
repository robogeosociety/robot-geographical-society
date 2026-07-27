/**
 * Codex data layer.
 *
 * Everything the viewer reads is a static JSON file emitted by
 * `web/scripts/build-codex.js` into `public/codex-data/`, so there is no API,
 * no auth, and no backend call on this path — the codex renders even when the
 * Worker is unreachable.
 *
 * Four kinds of fetch, at most two per page:
 *   index       once, 192 metadata rows + 23 references — powers search
 *   article     per campground — body AST, ToC, loop roster
 *   siteBundle  per campground — every site body, fetched only on a site page
 *   reference   per shared reference note (unit / hazard / booking primers)
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

/** One shared reference note. */
export function loadReference(slug) {
  return once(`ref:${slug}`, () => getJSON(`${base()}/ref/${encodeURIComponent(slug)}.json`));
}

/** Test-only — drop the memoised promises. */
export function _resetCodexCache() {
  cache.clear();
}
