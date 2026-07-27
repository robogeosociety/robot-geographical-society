#!/usr/bin/env node
/**
 * campsite-codex.db → web/public/codex-data/*.json
 *
 * The codex artifact is a SQLite export of the Obsidian camping vault (192
 * campgrounds, 9,205 sites, ~6.9 MB). The viewer never reads SQLite: this script
 * runs once per build and emits static JSON the browser fetches on demand.
 *
 *   codex-data/index.json            metadata for every campground (no bodies)
 *   codex-data/cg/<slug>.json        one article: body AST + ToC + loop roster
 *   codex-data/cg/<slug>.sites.json  that campground's site bodies
 *
 * The artifact is a BUILD INPUT, not a source file. If it is absent (a CI
 * checkout, a fresh clone, a contributor who has not fetched it) the script
 * still succeeds and writes an `available: false` index — the viewer then shows
 * an honest "not shipped in this build" state instead of the build exploding.
 *
 * Usage:
 *   npm run codex                 # from web/
 *   CODEX_DB=/path/to.db npm run codex
 *
 * Requires Node ≥ 22.5 for the built-in `node:sqlite` — but only when the
 * artifact is actually present, so the CI toolchain is unaffected.
 */

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildCodex, joinInventory } from '../src/codex/build.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB = resolve(HERE, '..');
const REPO = resolve(WEB, '..');

const DB_PATH = process.env.CODEX_DB || join(REPO, 'data', 'campsite-codex.db');
const OUT_DIR = join(WEB, 'public', 'codex-data');
const INVENTORY = join(REPO, 'backend', 'src', 'campsites-index.json');

function writeJSON(relPath, data) {
  const full = join(OUT_DIR, relPath);
  mkdirSync(dirname(full), { recursive: true });
  const body = JSON.stringify(data);
  writeFileSync(full, body);
  return body.length;
}

/** Walk every AST in the payload and tally the wikilinks that did NOT resolve. */
function unresolvedTargets(articles) {
  const tally = new Map();
  const walk = (nodes) => {
    for (const n of nodes || []) {
      if (n.t === 'deadlink') tally.set(n.target, (tally.get(n.target) || 0) + 1);
      if (n.c) walk(n.c);
      if (n.caption) walk(n.caption);
      if (n.items) for (const it of n.items) { walk(it.c); walk(it.children); }
      if (n.head) for (const cell of n.head) walk(cell);
      if (n.rows) for (const row of n.rows) for (const cell of row) walk(cell);
    }
  };
  for (const a of articles.values()) { walk(a.body); walk(a.footnotes); }
  return [...tally.entries()].sort((a, b) => b[1] - a[1]);
}

function emptyIndex(reason) {
  return {
    available: false,
    reason,
    generated: new Date().toISOString(),
    counts: { campgrounds: 0, sites: 0, agencies: [], hazards: [] },
    campgrounds: [],
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
    const campgrounds = db.prepare('SELECT * FROM codex_campground').all();
    const sites = db.prepare('SELECT * FROM codex_site').all();
    return { campgrounds, sites };
  } finally {
    db.close();
  }
}

function readInventory() {
  if (!existsSync(INVENTORY)) return [];
  try {
    const parsed = JSON.parse(readFileSync(INVENTORY, 'utf8'));
    return Array.isArray(parsed) ? parsed : (parsed.sites || parsed.campgrounds || []);
  } catch (err) {
    console.warn(`  ! inventory join skipped: ${err.message}`);
    return [];
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
  const joined = joinInventory(raw.campgrounds, readInventory());
  const { index, articles, siteBundles } = buildCodex({ campgrounds: joined.campgrounds, sites: raw.sites });

  let bytes = writeJSON('index.json', index);
  let biggest = { slug: null, bytes: 0 };
  for (const [slug, article] of articles) {
    const n = writeJSON(join('cg', `${slug}.json`), article);
    bytes += n;
    if (n > biggest.bytes) biggest = { slug, bytes: n };
  }
  for (const [slug, bundle] of siteBundles) {
    bytes += writeJSON(join('cg', `${slug}.sites.json`), bundle);
  }

  const unresolved = unresolvedTargets(articles);
  const kb = (n) => `${(n / 1024).toFixed(0)} KB`;

  console.log(`codex: ${index.counts.campgrounds} campgrounds, ${index.counts.sites} sites`);
  console.log(`codex: ${articles.size * 2 + 1} files, ${kb(bytes)} total; largest article ${biggest.slug} (${kb(biggest.bytes)})`);
  console.log(`codex: inventory guid join matched ${joined.matched}/${joined.total}`);
  if (unresolved.length) {
    const top = unresolved.slice(0, 8).map(([t, n]) => `${t} (${n})`).join(', ');
    console.log(`codex: ${unresolved.length} wikilink targets render as plain text — top: ${top}`);
  }
}

main().catch((err) => {
  console.error(`codex build failed: ${err.message}`);
  process.exit(1);
});
