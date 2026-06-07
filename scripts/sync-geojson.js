#!/usr/bin/env node
/**
 * Wrapper for the new Python-based data generation logic.
 */
const { execSync } = require('child_process');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');

try {
  console.log('Running python data generator via uv...');
  // Metaflow requires a username; fall back to "ci" when none is set.
  const env = { ...process.env, USER: process.env.USER || process.env.USERNAME || 'ci' };
  execSync('uv run refresh run', { stdio: 'inherit', cwd: DATA_DIR, env });
} catch (err) {
  console.error('Data generation failed:', err.message);
  process.exit(1);
}
