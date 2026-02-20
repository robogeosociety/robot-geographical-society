#!/bin/bash

# Robot Geographical Society - Local Development Stack Runner
# This script starts the Hono (Cloudflare Workers) backend and the React frontend.

set -e

# Colors for output
GREEN='\033[0,32m'
CYAN='\033[0,36m'
YELLOW='\033[1,33m'
NC='\033[0m' # No Color

echo -e "${CYAN}--- Starting Robot Geographical Society Dev Stack ---${NC}"

# 1. Sync GeoJSON and IDs
echo -e "${YELLOW}[1/5] Synchronizing campsite data and IDs...${NC}"
node scripts/sync-geojson.js

# 2. Prepare Backend
echo -e "${YELLOW}[2/5] Preparing backend...${NC}"
cd backend
npm install --silent

# 3. Seed Local KV Store
echo -e "${YELLOW}[3/5] Seeding local KV store...${NC}"
node scripts/generate-seed.cjs
npx wrangler kv bulk put kv-seed.json --binding CAMPSITES --local --preview false

# 4. Prepare Frontend
echo -e "${YELLOW}[4/5] Preparing frontend...${NC}"
cd ../web
npm install --silent

# 5. Start Services
echo -e "${YELLOW}[5/5] Starting services...${NC}"
echo -e "${GREEN}Backend starting on http://localhost:8787${NC}"
echo -e "${GREEN}Frontend starting on http://localhost:5173${NC}"

# Function to kill background processes on exit
cleanup() {
  echo -e "
${CYAN}--- Shutting down services ---${NC}"
  kill $BACKEND_PID $FRONTEND_PID 2>/dev/null || true
  exit
}

trap cleanup SIGINT SIGTERM

# Start Backend in background
cd ../backend
npx wrangler dev --port 8787 --local --ip 0.0.0.0 > /dev/null 2>&1 &
BACKEND_PID=$!

# Start Frontend in background
cd ../web
npm run dev -- --port 5173 --host > /dev/null 2>&1 &
FRONTEND_PID=$!

echo -e "${GREEN}Stack is running! Press Ctrl+C to stop.${NC}"

# Keep script alive to maintain background processes
wait
