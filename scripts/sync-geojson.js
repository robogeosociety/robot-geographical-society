#!/usr/bin/env node
/**
 * Wrapper for the new Python-based data generation logic.
 */
const { execSync } = require('child_process');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');

try {
  console.log('Running python data generator via uv...');
  // Ensure we are in the data directory where pyproject.toml is
  execSync('uv run generate', { stdio: 'inherit', cwd: DATA_DIR });
} catch (err) {
  console.error('Data generation failed:', err.message);
  process.exit(1);
}
