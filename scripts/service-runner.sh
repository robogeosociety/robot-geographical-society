#!/bin/bash
# Robot Geographical Society - Service Runner for launchd

# Ensure common brew/node paths are in PATH for launchd
export PATH="/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

NODE=/opt/homebrew/bin/node
NPX=/opt/homebrew/bin/npx

# Ensure we are in the project root
cd "$(dirname "$0")/.."
PROJECT_ROOT=$(pwd)

# Sync and Seed before starting
echo "Syncing data..."
$NODE scripts/sync-geojson.js

echo "Seeding KV..."
cd backend
$NODE scripts/generate-seed.cjs
$NPX wrangler kv bulk put kv-seed.json --binding CAMPSITES --local --preview false

# Start both services in the foreground
echo "Starting services..."
$NPX concurrently --names "backend,frontend" --prefix-colors "magenta,cyan" "cd $PROJECT_ROOT/backend && $NPX wrangler dev --port 8787 --local --ip 0.0.0.0" "cd $PROJECT_ROOT/web && $NPX vite --port 5173 --host 0.0.0.0"
