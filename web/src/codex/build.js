/**
 * The codex build core — pure functions that turn `campsite-codex.db` rows into
 * the static JSON the viewer fetches. No sqlite, no filesystem, no React, so it
 * is unit-testable straight from row literals; `web/scripts/build-codex.js`
 * supplies the I/O around it.
 *
 * Output shape (served from `web/public/codex-data/`):
 *
 *   index.json            — every campground's METADATA (no bodies). ~200 rows,
 *                           the search/filter corpus for the index page.
 *   cg/<slug>.json        — one article: parsed body AST, ToC, footnotes, and
 *                           the loop → site roster (labels only).
 *   cg/<slug>.sites.json  — that campground's site bodies, keyed by site key.
 *
 * The split matters: the campground page never downloads several hundred site
 * bodies just to draw a roster, and the site page pulls exactly one extra file
 * that then serves every sibling site in the same campground.
 */

import { parseMarkdown, plainText, slugify, summarize } from './markdown.js';

/** Article href for a campground slug. Single source of truth for the URL shape. */
export function codexHref(slug) {
  return `/codex/${slug}`;
}

/** Article href for one site within a campground. */
export function siteHref(slug, key) {
  return `/codex/${slug}/site/${key}`;
}

/**
 * A wikilink resolver over a known set of campgrounds.
 *
 * Obsidian resolves `[[Adams Fork]]` by NOTE TITLE, and the exporter's slug is
 * derived from that same title — so matching is: exact slug, then slugified
 * title, then a punctuation-insensitive fold of the name (so `[[Heart O' the
 * Hills]]` and `[[Heart O the Hills]]` land in the same place). Anything with
 * no hit returns null and renders as plain text.
 *
 * Ambiguity is resolved by refusing: if two campgrounds fold to the same key we
 * drop the key entirely rather than send readers to a coin-flip article.
 */
export function buildResolver(campgrounds) {
  const bySlug = new Map();
  const byFold = new Map();
  const ambiguous = new Set();

  const fold = (s) => slugify(String(s).replace(/['’]/g, ''));

  for (const cg of campgrounds) {
    bySlug.set(cg.slug, cg.slug);
    for (const key of [fold(cg.slug), fold(cg.name)]) {
      if (!key) continue;
      if (byFold.has(key) && byFold.get(key) !== cg.slug) ambiguous.add(key);
      else byFold.set(key, cg.slug);
    }
  }
  for (const key of ambiguous) byFold.delete(key);

  return (target) => {
    if (!target) return null;
    const raw = String(target).trim();
    // Obsidian links may carry a folder path — only the leaf is the note title.
    const leaf = raw.split('/').pop();
    const slug = bySlug.get(leaf) || byFold.get(fold(leaf));
    return slug ? codexHref(slug) : null;
  };
}

/**
 * `codex_campground.guid` is NULL in the artifact by design — `campsite_inventory`
 * owns that identity in `backend/src/campsites-index.json`. Rather than invent
 * one, we JOIN to the inventory (read-only; that file belongs to another
 * automation and is never written here) so an article can state which inventory
 * entry it describes.
 *
 * Match order: `official_url`, then a folded name. Anything unmatched keeps a
 * null guid — the article renders fine without one.
 */
export function joinInventory(campgrounds, inventory = []) {
  const fold = (s) => slugify(String(s || '').replace(/['’]/g, ''));
  const byUrl = new Map();
  const byName = new Map();
  for (const e of inventory) {
    const guid = e.guid || null;
    if (!guid) continue;
    for (const u of [e.reservation_url, e.official_url, e.url]) {
      if (u) byUrl.set(String(u).replace(/\/+$/, ''), guid);
    }
    const key = fold(e.name);
    if (key && !byName.has(key)) byName.set(key, guid);
  }

  let matched = 0;
  const out = campgrounds.map((cg) => {
    const url = cg.official_url ? String(cg.official_url).replace(/\/+$/, '') : null;
    const guid = cg.guid || (url && byUrl.get(url)) || byName.get(fold(cg.name)) || null;
    if (guid) matched += 1;
    return { ...cg, guid };
  });
  return { campgrounds: out, matched, total: campgrounds.length };
}

/**
 * Compare two site labels.
 *
 * Labels are zero-padded strings (`002`, `011`), so plain text order is already
 * right; numeric-aware collation is a superset that also keeps un-padded or
 * alphanumeric labels (`A1` before `A2`, `2` before `10`) in human order.
 */
export function compareSiteLabels(a, b) {
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

/**
 * The URL key for a site.
 *
 * The schema's site labels are only unique per (campground, loop), so a bare
 * `011` can collide across loops. We key on the label when it is unique in the
 * campground and fall back to `<label>--<loop-slug>` when it is not — stable,
 * readable, and computed once at build time so the router never has to
 * disambiguate at read time.
 */
export function siteKeys(sites) {
  const counts = new Map();
  for (const s of sites) counts.set(s.site, (counts.get(s.site) || 0) + 1);
  const keys = new Map();
  for (const s of sites) {
    const base = slugify(s.site) || String(s.id);
    const key = counts.get(s.site) > 1 ? `${base}--${slugify(s.loop || 'loop')}` : base;
    keys.set(s.id, key);
  }
  return keys;
}

function parseHazards(raw) {
  if (Array.isArray(raw)) return raw;
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    // Tolerate a comma-joined string rather than losing the facet entirely.
    return String(raw).split(',').map((s) => s.trim()).filter(Boolean);
  }
}

function meta(cg) {
  return {
    slug: cg.slug,
    name: cg.name,
    guid: cg.guid ?? null,
    agency: cg.agency ?? null,
    agency_full: cg.agency_full ?? null,
    unit: cg.unit ?? null,
    lat: cg.lat ?? null,
    lng: cg.lng ?? null,
    elev_m: cg.elev_m ?? null,
    reservable: cg.reservable == null ? null : Boolean(cg.reservable),
    hazards: parseHazards(cg.hazards),
    official_url: cg.official_url ?? null,
    site_count: cg.site_count ?? 0,
    updated: cg.updated ?? null,
  };
}

/** Group a campground's sites into loops, in label order. */
export function groupLoops(sites, keys) {
  const loops = new Map();
  for (const s of sites) {
    const name = s.loop || 'Ungrouped';
    if (!loops.has(name)) loops.set(name, { name, slug: slugify(name) || 'ungrouped', sites: [] });
    loops.get(name).sites.push({
      key: keys.get(s.id),
      site: s.site,
      type: s.type ?? null,
      use: s.use ?? null,
      reservable: s.reservable == null ? null : Boolean(s.reservable),
    });
  }
  const out = [...loops.values()];
  for (const l of out) l.sites.sort((a, b) => compareSiteLabels(a.site, b.site));
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

/**
 * Build the full static payload.
 *
 * @param {{campgrounds: object[], sites: object[]}} rows  raw table rows
 * @returns {{index: object, articles: Map<string, object>, siteBundles: Map<string, object>}}
 */
export function buildCodex({ campgrounds = [], sites = [] }, { generated = new Date().toISOString() } = {}) {
  const resolve = buildResolver(campgrounds);

  const byCg = new Map();
  for (const s of sites) {
    if (!byCg.has(s.campground_slug)) byCg.set(s.campground_slug, []);
    byCg.get(s.campground_slug).push(s);
  }

  const articles = new Map();
  const siteBundles = new Map();
  const indexRows = [];

  for (const cg of [...campgrounds].sort((a, b) => a.name.localeCompare(b.name))) {
    const m = meta(cg);
    const { blocks, toc, footnotes } = parseMarkdown(cg.body, { resolve, dropTitle: true });
    const mine = byCg.get(cg.slug) || [];
    const keys = siteKeys(mine);
    const loops = groupLoops(mine, keys);

    articles.set(cg.slug, {
      ...m,
      // The stored `site_count` is the exporter's number; `sites` is what we
      // actually carry. Showing both keeps a partial export honest.
      sites_present: mine.length,
      body: blocks,
      toc,
      footnotes,
      loops,
    });

    const bundle = {};
    for (const s of mine) {
      const parsed = parseMarkdown(s.body, { resolve, dropTitle: true });
      bundle[keys.get(s.id)] = {
        key: keys.get(s.id),
        site: s.site,
        loop: s.loop ?? null,
        type: s.type ?? null,
        use: s.use ?? null,
        reservable: s.reservable == null ? null : Boolean(s.reservable),
        provider_site_id: s.provider_site_id ?? null,
        official_url: s.official_url ?? null,
        updated: s.updated ?? null,
        body: parsed.blocks,
        footnotes: parsed.footnotes,
      };
    }
    siteBundles.set(cg.slug, { slug: cg.slug, name: cg.name, sites: bundle });

    indexRows.push({
      ...m,
      sites_present: mine.length,
      loops: loops.length,
      summary: summarize(blocks),
      headings: toc.filter((h) => h.depth === 2).map((h) => h.text),
    });
  }

  const index = {
    available: true,
    generated,
    counts: {
      campgrounds: indexRows.length,
      sites: sites.length,
      agencies: [...new Set(indexRows.map((r) => r.agency).filter(Boolean))].sort(),
      hazards: [...new Set(indexRows.flatMap((r) => r.hazards))].sort(),
    },
    campgrounds: indexRows,
  };

  return { index, articles, siteBundles };
}

/** The index page's client-side filter. Exported so it can be tested directly. */
export function filterCampgrounds(rows, { q = '', agency = null, hazard = null, reservable = null } = {}) {
  const needle = q.trim().toLowerCase();
  return rows.filter((r) => {
    if (agency && r.agency !== agency) return false;
    if (hazard && !r.hazards.includes(hazard)) return false;
    if (reservable != null && Boolean(r.reservable) !== reservable) return false;
    if (!needle) return true;
    const hay = [r.name, r.unit, r.agency_full, r.summary, ...(r.headings || [])]
      .filter(Boolean).join(' ').toLowerCase();
    return hay.includes(needle);
  });
}

export { plainText, slugify };
