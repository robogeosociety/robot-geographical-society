#!/usr/bin/env node
/**
 * campsite-codex.db → web/public/codex-data/*.json
 *
 * The codex artifact is a SQLite export of the Obsidian camping vault (192
 * campgrounds, 9,205 sites, 24 shared reference notes; 5.5 MB). The viewer
 * never reads SQLite: this script runs once per build and emits static JSON the
 * browser fetches on demand.
 *
 *   codex-data/index.json            campground metadata + the reference list
 *   codex-data/cg/<slug>.json        one article: body AST + ToC + loop roster
 *   codex-data/cg/<slug>.sites.json  that campground's site bodies
 *   codex-data/ref/<slug>.json       one shared reference article
 *
 * The artifact is a BUILD INPUT, not a source file. If it is absent (a fresh
 * clone, a contributor who has not fetched it) the script still succeeds and
 * writes an `available: false` index — the viewer then shows an honest "not
 * shipped in this build" state instead of the build exploding.
 *
 * Usage:
 *   npm run codex                 # from web/
 *   CODEX_DB=/path/to.db npm run codex
 *
 * Requires Node ≥ 22.5 for the built-in `node:sqlite` — but only when the
 * artifact is actually present, so the CI toolchain is unaffected.
 */

import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildCodex } from '../src/codex/build.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB = resolve(HERE, '..');
const REPO = resolve(WEB, '..');

const DB_PATH = process.env.CODEX_DB || join(REPO, 'data', 'campsite-codex.db');
const OUT_DIR = join(WEB, 'public', 'codex-data');

function writeJSON(relPath, data) {
  const full = join(OUT_DIR, relPath);
  mkdirSync(dirname(full), { recursive: true });
  const body = JSON.stringify(data);
  writeFileSync(full, body);
  return body.length;
}

/** Walk every inline node across a set of article maps. */
function walkArticles(maps, fn) {
  const walk = (nodes) => {
    for (const n of nodes || []) {
      fn(n);
      if (n.c) walk(n.c);
      if (n.caption) walk(n.caption);
      if (n.items) for (const it of n.items) { walk(it.c); walk(it.children); }
      if (n.head) for (const cell of n.head) walk(cell);
      if (n.rows) for (const row of n.rows) for (const cell of row) walk(cell);
    }
  };
  for (const map of maps) {
    for (const a of map.values()) { walk(a.body); walk(a.footnotes); }
  }
}

/**
 * The link-health report: how many wikilinks became real links, and which
 * targets fell through to plain text. This is the number that says whether
 * anything else is worth exporting.
 */
function linkReport(maps) {
  const dead = new Map();
  let resolved = 0;
  walkArticles(maps, (n) => {
    if (n.t === 'wikilink') resolved += 1;
    if (n.t === 'deadlink') dead.set(n.target, (dead.get(n.target) || 0) + 1);
  });
  const unresolved = [...dead.entries()].sort((a, b) => b[1] - a[1]);
  const deadTotal = unresolved.reduce((n, [, c]) => n + c, 0);
  return { resolved, deadTotal, unresolved };
}

function emptyIndex(reason) {
  return {
    available: false,
    reason,
    generated: new Date().toISOString(),
    counts: { campgrounds: 0, sites: 0, references: 0, agencies: [], hazards: [] },
    campgrounds: [],
    references: [],
  };
}

async function readRows(dbPath) {
  // Imported lazily so a toolchain without node:sqlite (CI runs Node 20) is
  // only a problem for someone who actually has the artifact to read.
  let DatabaseSync;
  try {
    ({ DatabaseSync } = await import('node:sqlite'));
  } catch (err) {
    throw new Error(
      `found ${dbPath} but this Node (${process.version}) has no node:sqlite — `
      + `Node >= 22.5 is required to build the codex. (${err.message})`,
    );
  }
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    const has = (t) => !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(t);
    return {
      campgrounds: db.prepare('SELECT * FROM codex_campground').all(),
      sites: db.prepare('SELECT * FROM codex_site').all(),
      // Optional on purpose: the reference table post-dates the first export,
      // and an artifact without it should still build.
      references: has('codex_reference') ? db.prepare('SELECT * FROM codex_reference').all() : [],
    };
  } finally {
    db.close();
  }
}

async function main() {
  rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(OUT_DIR, { recursive: true });

  if (!existsSync(DB_PATH)) {
    writeJSON('index.json', emptyIndex(`no artifact at ${DB_PATH.replace(REPO, '.')}`));
    console.log(`codex: no artifact at ${DB_PATH} — wrote an empty index (viewer shows the "not shipped" state).`);
    return;
  }

  console.log(`codex: reading ${DB_PATH}`);
  const raw = await readRows(DB_PATH);
  const { index, articles, siteBundles, referenceArticles } = buildCodex(raw);

  let bytes = writeJSON('index.json', index);
  let files = 1;
  let biggest = { slug: null, bytes: 0 };
  for (const [slug, article] of articles) {
    const n = writeJSON(join('cg', `${slug}.json`), article);
    bytes += n; files += 1;
    if (n > biggest.bytes) biggest = { slug, bytes: n };
  }
  for (const [slug, bundle] of siteBundles) {
    bytes += writeJSON(join('cg', `${slug}.sites.json`), bundle); files += 1;
  }
  for (const [slug, ref] of referenceArticles) {
    bytes += writeJSON(join('ref', `${slug}.json`), ref); files += 1;
  }

  const withGuid = index.campgrounds.filter((c) => c.guid).length;
  const { resolved, deadTotal, unresolved } = linkReport([articles, referenceArticles]);
  const total = resolved + deadTotal;
  const pct = total ? ((resolved / total) * 100).toFixed(1) : '0.0';
  const kb = (n) => `${(n / 1024).toFixed(0)} KB`;

  console.log(`codex: ${index.counts.campgrounds} campgrounds, ${index.counts.sites} sites, ${index.counts.references} references`);
  console.log(`codex: ${files} files, ${kb(bytes)} total; largest article ${biggest.slug} (${kb(biggest.bytes)})`);
  console.log(`codex: ${withGuid}/${index.counts.campgrounds} campgrounds carry an inventory guid`);
  console.log(`codex: wikilinks ${resolved} linked / ${deadTotal} plain text (${pct}% of ${total})`);
  if (unresolved.length) {
    const top = unresolved.slice(0, 12).map(([t, n]) => `${t} (${n})`).join(', ');
    console.log(`codex: ${unresolved.length} distinct unresolved targets — top: ${top}`);
  }
}

main().catch((err) => {
  console.error(`codex build failed: ${err.message}`);
  process.exit(1);
});
