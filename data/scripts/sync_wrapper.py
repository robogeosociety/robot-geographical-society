#!/usr/bin/env node
/**
 * Wrapper for the new Python-based data generation logic.
 */
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, '..', 'data');

try {
  console.log('Detected new Python data pipeline. Running uv run generate...');
  execSync('uv run generate', { stdio: 'inherit', cwd: DATA_DIR });
} catch (err) {
  console.error('Failed to run new data pipeline. Falling back or exiting.');
  process.exit(1);
}
