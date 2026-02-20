#!/usr/bin/env node
/**
 * sync-geojson.js
 *
 * Reads all campsite index.md files under data/{agency}/WA/
 * and regenerates data/campsites.json.
 *
 * Usage: node scripts/sync-geojson.js
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const OUTPUT = path.join(DATA_DIR, 'campsites.json');

const AGENCIES = ['blm', 'nps', 'usfs', 'wa-state-parks'];

const MONTH_MAP = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

// Parse "May 1" or "July 15" → month integer, or null
function parseOpenDate(val) {
  if (!val || val === 'null') return null;
  const month = val.trim().split(/\s+/)[0].toLowerCase();
  return MONTH_MAP[month] ?? null;
}

// Minimal YAML frontmatter parser for the known campsite schema
function parseFrontmatter(raw) {
  const match = raw.match(/^---\n([\s\S]*?)\n---/);
  if (!match) throw new Error('No frontmatter found');
  const block = match[1];
  const body = raw.slice(match[0].length).trim();

  const result = {};
  for (const line of block.split('\n')) {
    const colon = line.indexOf(':');
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim();
    let val = line.slice(colon + 1).trim();

    // Strip inline comments
    val = val.replace(/\s+#.*$/, '');

    // Types array: [tent, rv] or [tent,rv]
    if (val.startsWith('[') && val.endsWith(']')) {
      result[key] = val.slice(1, -1).split(',').map(v => v.trim()).filter(Boolean);
      continue;
    }

    // Quoted string
    if ((val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))) {
      result[key] = val.slice(1, -1);
      continue;
    }

    // Booleans / null / numbers
    if (val === 'true') { result[key] = true; continue; }
    if (val === 'false') { result[key] = false; continue; }
    if (val === 'null') { result[key] = null; continue; }
    const num = Number(val);
    if (!isNaN(num) && val !== '') { result[key] = num; continue; }

    result[key] = val;
  }

  result._body = body;
  return result;
}

function findIndexFiles(dir, results = []) {
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      findIndexFiles(full, results);
    } else if (entry.name === 'index.md') {
      results.push(full);
    }
  }
  return results;
}

function validate(fm, open_month, filePath) {
  const errors = [];
  const requiredFm = ['name', 'agency', 'agency_short', 'lat', 'lng', 'sites', 'types', 'reservable', 'year_round'];
  for (const f of requiredFm) {
    if (fm[f] == null) errors.push(`missing required field: ${f}`);
  }
  if (fm.lat != null && (fm.lat < 45.5 || fm.lat > 49.1)) errors.push(`lat out of WA range: ${fm.lat}`);
  if (fm.lng != null && (fm.lng < -124.9 || fm.lng > -116.9)) errors.push(`lng out of WA range: ${fm.lng}`);
  if (fm.year_round && open_month != null) errors.push('year_round:true but open_month is set');
  const validTypes = new Set(['tent', 'rv', 'walk-in', 'cabin', 'bike-in', 'parking']);
  for (const t of (fm.types || [])) {
    if (!validTypes.has(t)) errors.push(`unknown type: ${t}`);
  }
  if (errors.length) {
    console.error(`\nValidation errors in ${filePath}:`);
    errors.forEach(e => console.error(`  - ${e}`));
  }
  return errors.length === 0;
}

function buildFeature(fm, filePath) {
  const open_month = parseOpenDate(fm.open_date);
  const props = {
    name: fm.name,
    agency: fm.agency,
    agency_short: fm.agency_short,
    sites: fm.sites,
    types: fm.types,
    reservable: fm.reservable,
    year_round: fm.year_round,
    open_month,
    reservation_url: fm.reservation_url,
    notes: fm._body || null,
  };
  validate(fm, open_month, filePath);
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [fm.lng, fm.lat] },
    properties: props,
  };
}

// --- Main ---
let valid = 0;
let errors = 0;
const features = [];

for (const agency of AGENCIES) {
  const agencyDir = path.join(DATA_DIR, agency, 'WA');
  const files = findIndexFiles(agencyDir);
  for (const filePath of files) {
    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      const fm = parseFrontmatter(raw);
      features.push(buildFeature(fm, filePath));
      valid++;
    } catch (err) {
      console.error(`Error processing ${filePath}: ${err.message}`);
      errors++;
    }
  }
}

// Sort: agency_short, then name
features.sort((a, b) => {
  const as = a.properties.agency_short;
  const bs = b.properties.agency_short;
  if (as !== bs) return as.localeCompare(bs);
  return a.properties.name.localeCompare(b.properties.name);
});

const geojson = { type: 'FeatureCollection', features };
fs.writeFileSync(OUTPUT, JSON.stringify(geojson, null, 2));

console.log(`\n✓ ${valid} campsites written to data/campsites.json`);
if (errors) console.error(`✗ ${errors} files had errors`);
