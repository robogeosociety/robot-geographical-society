#!/bin/bash
# Robot Geographical Society - Service Runner for launchd

# Ensure common brew/node paths are in PATH for launchd
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

# Ensure we are in the project root
cd "$(dirname "$0")/.."
PROJECT_ROOT=$(pwd)

# Sync and Seed before starting
echo "Syncing data..."
node scripts/sync-geojson.js

echo "Seeding KV..."
cd backend
node scripts/generate-seed.cjs
npx wrangler kv bulk put kv-seed.json --binding CAMPSITES --local --preview false

# Start both services in the foreground
echo "Starting services..."
npx concurrently \
  --names "backend,frontend" \
  --prefix-colors "magenta,cyan" \
  "cd $PROJECT_ROOT/backend && npx wrangler dev --port 8787 --local --ip 0.0.0.0" \
  "cd $PROJECT_ROOT/web && npx vite --port 5173 --host 0.0.0.0"
