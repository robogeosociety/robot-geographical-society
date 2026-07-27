/**
 * The codex build core — pure functions that turn `campsite-codex.db` rows into
 * the static JSON the viewer fetches. No sqlite, no filesystem, no React, so it
 * is unit-testable straight from row literals; `web/scripts/build-codex.js`
 * supplies the I/O around it.
 *
 * Output shape (served from `web/public/codex-data/`):
 *
 *   index.json            — every campground's METADATA (no bodies) + the
 *                           reference list. The search/filter corpus.
 *   cg/<slug>.json        — one campground article: body AST, ToC, footnotes,
 *                           and the loop → site roster (labels only).
 *   cg/<slug>.sites.json  — that campground's site bodies, keyed by site_slug.
 *   ref/<slug>.json       — one shared reference article.
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

/** Article href for one site within a campground (keyed on `codex_site.site_slug`). */
export function siteHref(slug, siteSlug) {
  return `/codex/${slug}/site/${siteSlug}`;
}

/** Article href for a shared reference note. */
export function refHref(slug) {
  return `/codex/reference/${slug}`;
}

/**
 * Reference rows that are not articles.
 *
 * `campsite-template` is the blank note new campground pages are stamped from —
 * it lives beside the real reference notes and therefore rides along in the
 * export, but it has no reader-facing content. Dropping it here removes it from
 * the index AND from the resolver, so a stray `[[Campsite template]]` link
 * degrades to plain text rather than opening a page of empty headings.
 */
export const NON_ARTICLE_REFERENCES = new Set(['campsite-template']);

/**
 * A wikilink resolver over the codex's two article tables.
 *
 * Obsidian resolves `[[Adams Fork]]` by NOTE TITLE, and the exporter's slug is
 * derived from that same title — so matching is: exact slug, then slugified
 * title, then a punctuation-insensitive fold of the name (so `[[Heart O' the
 * Hills]]` and `[[Heart O the Hills]]` land in the same place).
 *
 * Campgrounds are matched first and references second: a campground is the more
 * specific thing, and a reference note is named for a unit or a topic. Anything
 * with no hit in either table returns null and renders as plain text.
 *
 * Ambiguity is resolved by refusing: if two entries in the same tier fold to
 * the same key we drop the key rather than send readers to a coin-flip article.
 * (The shipped corpus has no duplicate campground names, so this branch is dead
 * today — it is kept because a future export cannot promise that.)
 */
export function buildResolver(campgrounds, references = []) {
  const fold = (s) => slugify(String(s).replace(/['’]/g, ''));

  const tier = (rows, href) => {
    const bySlug = new Map();
    const byFold = new Map();
    const ambiguous = new Set();
    for (const row of rows) {
      bySlug.set(row.slug, row.slug);
      for (const key of [fold(row.slug), fold(row.name)]) {
        if (!key) continue;
        if (byFold.has(key) && byFold.get(key) !== row.slug) ambiguous.add(key);
        else byFold.set(key, row.slug);
      }
    }
    for (const key of ambiguous) byFold.delete(key);
    return (leaf) => {
      const slug = bySlug.get(leaf) || byFold.get(fold(leaf));
      return slug ? href(slug) : null;
    };
  };

  const tiers = [
    tier(campgrounds, codexHref),
    tier(references.filter((r) => !NON_ARTICLE_REFERENCES.has(r.slug)), refHref),
  ];

  return (target) => {
    if (!target) return null;
    // Obsidian links may carry a folder path — only the leaf is the note title.
    const leaf = String(target).trim().split('/').pop();
    for (const t of tiers) {
      const href = t(leaf);
      if (href) return href;
    }
    return null;
  };
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

/**
 * Group a campground's sites into loops, in label order.
 *
 * `site_slug` is the artifact's own routing key — unique per campground under a
 * UNIQUE INDEX — so the viewer routes on it directly and never has to
 * disambiguate labels that repeat across loops.
 */
export function groupLoops(sites) {
  const loops = new Map();
  for (const s of sites) {
    const name = s.loop || 'Ungrouped';
    if (!loops.has(name)) loops.set(name, { name, slug: slugify(name) || 'ungrouped', sites: [] });
    loops.get(name).sites.push({
      key: s.site_slug,
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
 * @param {{campgrounds: object[], sites: object[], references: object[]}} rows
 * @returns {{index, articles: Map, siteBundles: Map, referenceArticles: Map}}
 */
export function buildCodex(
  { campgrounds = [], sites = [], references = [] },
  { generated = new Date().toISOString() } = {},
) {
  const articleRefs = references.filter((r) => !NON_ARTICLE_REFERENCES.has(r.slug));
  const resolve = buildResolver(campgrounds, articleRefs);

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
    const loops = groupLoops(mine);

    articles.set(cg.slug, {
      ...m,
      // The stored `site_count` is the exporter's number; `sites_present` is
      // what we actually carry. Showing both keeps a partial export honest.
      sites_present: mine.length,
      body: blocks,
      toc,
      footnotes,
      loops,
    });

    const bundle = {};
    for (const s of mine) {
      const parsed = parseMarkdown(s.body, { resolve, dropTitle: true });
      bundle[s.site_slug] = {
        key: s.site_slug,
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

  const referenceArticles = new Map();
  const referenceRows = [];
  for (const ref of [...articleRefs].sort((a, b) => a.name.localeCompare(b.name))) {
    const { blocks, toc, footnotes } = parseMarkdown(ref.body, { resolve, dropTitle: true });
    referenceArticles.set(ref.slug, {
      slug: ref.slug,
      name: ref.name,
      updated: ref.updated ?? null,
      body: blocks,
      toc,
      footnotes,
    });
    referenceRows.push({
      slug: ref.slug,
      name: ref.name,
      updated: ref.updated ?? null,
      summary: summarize(blocks, 160),
    });
  }

  const index = {
    available: true,
    generated,
    counts: {
      campgrounds: indexRows.length,
      sites: sites.length,
      references: referenceRows.length,
      agencies: [...new Set(indexRows.map((r) => r.agency).filter(Boolean))].sort(),
      hazards: [...new Set(indexRows.flatMap((r) => r.hazards))].sort(),
    },
    campgrounds: indexRows,
    references: referenceRows,
  };

  return { index, articles, siteBundles, referenceArticles };
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
