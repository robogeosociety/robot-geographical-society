#!/bin/zsh
# Rebuild the RGS web bundle on the mini when main moves — Phase 3 of the tailnet
# migration. Run by the periodic nomad job rgs-web-build.hcl (every ~10 min).
#
# serve_web.py serves web/dist by absolute path, fresh per request, so a rebuilt dist
# is picked up LIVE — no serve restart. This job just: fast-forwards main, rebuilds
# dist if the source moved (content gate = the main commit SHA), and heartbeats to the
# InfluxDB `ops` bucket so Grafana / OpsBot see the loop run and the app's liveness.
#
# Build quirks (same as the hcl header): node 20 via volta; `npm ci --ignore-scripts`
# because miniflare's transitive `sharp` won't compile on the mini and vite doesn't
# need it, then `npm rebuild esbuild` (it DOES need its install script).
export PATH="/Users/tommydoerr/.volta/bin:/Users/tommydoerr/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
export HOME="/Users/tommydoerr"

REPO="$HOME/dev/robot-geographical-society"
WEB="$REPO/web"
STAMP="$WEB/dist/.built-sha"
PORT=5197
INFLUX_ENV="$HOME/.local/share/claude-channels/influx-ops.env"  # reuse the ops write token

heartbeat() {  # $1=rebuilt(0/1) $2=serve_up(0/1)
  [[ -r "$INFLUX_ENV" ]] || return 0
  source "$INFLUX_ENV"; [[ -n "${INFLUX_OPS_TOKEN:-}" ]] || return 0
  curl -s -m5 -XPOST "http://localhost:8086/api/v2/write?org=home&bucket=ops&precision=s" \
    -H "Authorization: Token ${INFLUX_OPS_TOKEN}" \
    --data-binary "rgs_web,host=tommys-mac-mini alive=1i,rebuilt=${1}i,serve_up=${2}i" >/dev/null || true
}

serve_up() {
  curl -s -m5 -o /dev/null -w "%{http_code}" "http://127.0.0.1:$PORT/" 2>/dev/null | grep -q 200 && echo 1 || echo 0
}

cd "$REPO" || { echo "repo missing"; exit 1; }
git fetch -q origin main || true
LOCAL="$(git rev-parse HEAD)"
REMOTE="$(git rev-parse origin/main)"
BUILT="$(cat "$STAMP" 2>/dev/null || echo none)"

if [[ "$LOCAL" == "$REMOTE" && "$BUILT" == "$REMOTE" && -f "$WEB/dist/index.html" ]]; then
  echo "$(date '+%F %T') rgs-web-build: up to date ($REMOTE) — no rebuild"
  heartbeat 0 "$(serve_up)"
  exit 0
fi

echo "$(date '+%F %T') rgs-web-build: main $LOCAL → $REMOTE — rebuilding"
git merge --ff-only origin/main 2>/dev/null || git reset --hard origin/main
cd "$WEB"
volta run --node 20 npm ci --ignore-scripts --no-audit --no-fund
volta run --node 20 npm rebuild esbuild
VITE_MAPBOX_ACCESS_TOKEN="$(terraform -chdir=/Volumes/dev/infra/mapbox output -raw rgs_web_token)" \
  volta run --node 20 npm run build
git rev-parse HEAD > "$STAMP"
echo "$(date '+%F %T') rgs-web-build: rebuilt dist at $(git rev-parse HEAD)"
heartbeat 1 "$(serve_up)"
