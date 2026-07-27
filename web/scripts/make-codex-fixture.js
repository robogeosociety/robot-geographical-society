#!/usr/bin/env node
/**
 * Build a small stand-in `campsite-codex.db` from the text seed in
 * `codex-fixture-data.js`, so the viewer can be developed, tested and
 * screenshotted before the real 6.9 MB vault export exists.
 *
 * The schema here is copied verbatim from the artifact contract — if the two
 * ever drift, this script is where the drift shows up first.
 *
 *   npm run codex:fixture     # writes ../data/campsite-codex.fixture.db AND
 *                             # derives web/public/codex-data/ from it
 *
 * Requires Node >= 22.5 (built-in `node:sqlite`).
 */

import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

import { fixtureRows } from './codex-fixture-data.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..');
// A DIFFERENT filename from the real artifact on purpose: `campsite-codex.db`
// is committed, and a fixture must never be able to masquerade as it.
const OUT = process.env.CODEX_DB || join(REPO, 'data', 'campsite-codex.fixture.db');

const SCHEMA = `
CREATE TABLE codex_campground (
    slug          TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    guid          TEXT,
    agency        TEXT,
    agency_full   TEXT,
    unit          TEXT,
    lat REAL, lng REAL,
    elev_m        REAL,
    reservable    INTEGER,
    hazards       TEXT,
    official_url  TEXT,
    body          TEXT NOT NULL,
    site_count    INTEGER NOT NULL DEFAULT 0,
    updated       TEXT NOT NULL
);

CREATE TABLE codex_site (
    id                INTEGER PRIMARY KEY,
    campground_slug   TEXT NOT NULL REFERENCES codex_campground(slug),
    site              TEXT NOT NULL,
    loop              TEXT,
    type              TEXT,
    use               TEXT,
    reservable        INTEGER,
    provider_site_id  TEXT,
    official_url      TEXT,
    body              TEXT NOT NULL,
    updated           TEXT NOT NULL
);
CREATE INDEX codex_site_cg ON codex_site (campground_slug, loop, site);
`;

if (existsSync(OUT)) rmSync(OUT);
mkdirSync(dirname(OUT), { recursive: true });

const db = new DatabaseSync(OUT);
db.exec(SCHEMA);

const { campgrounds, sites } = fixtureRows();

const insertCg = db.prepare(`INSERT INTO codex_campground
  (slug, name, guid, agency, agency_full, unit, lat, lng, elev_m, reservable, hazards, official_url, body, site_count, updated)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
for (const c of campgrounds) {
  insertCg.run(c.slug, c.name, c.guid, c.agency, c.agency_full, c.unit, c.lat, c.lng,
    c.elev_m, c.reservable, c.hazards, c.official_url, c.body, c.site_count, c.updated);
}

const insertSite = db.prepare(`INSERT INTO codex_site
  (id, campground_slug, site, loop, type, use, reservable, provider_site_id, official_url, body, updated)
  VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
for (const s of sites) {
  insertSite.run(s.id, s.campground_slug, s.site, s.loop, s.type, s.use, s.reservable,
    s.provider_site_id, s.official_url, s.body, s.updated);
}

db.close();
console.log(`codex fixture: ${campgrounds.length} campgrounds, ${sites.length} sites → ${OUT}`);
