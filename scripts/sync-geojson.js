#!/usr/bin/env node
/**
 * Derive data/campsites.json from the authoritative campsite inventory
 * (backend/src/campsites-index.json) via the `geojson` doit task.
 */
const { execSync } = require('child_process');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');

try {
  console.log('Deriving campsites.json from the inventory (uv run doit geojson)...');
  execSync('uv run doit geojson', { stdio: 'inherit', cwd: DATA_DIR });
} catch (err) {
  console.error('GeoJSON derivation failed:', err.message);
  process.exit(1);
}
