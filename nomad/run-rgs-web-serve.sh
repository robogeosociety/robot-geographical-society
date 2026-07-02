#!/bin/zsh
# Serve the RGS web app over the tailnet — Phase 1 of the tailnet migration.
#
# Serves web/dist (Vite build) + /api reverse proxy via nomad/serve_web.py on loopback
# :5197, fronted by `sudo tailscale serve --https=8443` at its own tailnet port
# https://tommys-mac-mini.tail59a169.ts.net:8443/ (root — the SPA fetches absolute /api
# paths, so root serving; same reasoning as the wikis' dedicated ports). The /api proxy
# injects the vended Cloudflare Access service-token headers server-side (rgs-vend);
# Phase 2 swaps them for the X-RGS-Key wall secret.
#
# Run under nomad/rgs-web-serve.hcl. Prereqs: tailscale-serve NOPASSWD sudoers rule
# (already on the mini), ~/.local/bin/rgs-vend, a built web/dist (see the build step in
# the hcl header; Phase 3 automates rebuilds).
export PATH="/Users/tommydoerr/.volta/bin:/Users/tommydoerr/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
export HOME="/Users/tommydoerr"

PORT=5197            # loopback HTTP (serve_web.py)
TSPORT=8443          # tailnet HTTPS (tailscale serve)
REPO="$HOME/dev/robot-geographical-society"
DIST="$REPO/web/dist"
TAILNET="tommys-mac-mini.tail59a169.ts.net"

# Vend the /api credentials: the 404-wall key (RGS_KEY → X-RGS-Key) and, during the
# Phase-2 transition, the legacy Access service-token headers if still vendable.
# Hard-fail if nothing vends — a serve without a working /api is worse than a restart.
eval "$($HOME/.local/bin/rgs-vend env)" || true
[[ -n "$RGS_KEY" || ( -n "$CF_ACCESS_CLIENT_ID" && -n "$CF_ACCESS_CLIENT_SECRET" ) ]] \
  || { echo "rgs-vend produced no credentials (no RGS_KEY, no Access token)"; exit 1; }

[[ -f "$DIST/index.html" ]] || echo "$(date '+%F %T') warning: $DIST/index.html missing — build web/dist first"

_cleaned=0
cleanup() {
  [[ $_cleaned == 1 ]] && return 0
  _cleaned=1
  echo "$(date '+%F %T') rgs-web-serve stopping — freeing :$PORT (the :$TSPORT tailnet serve persists)"
  [[ -n "$SRV_PID" ]] && kill "$SRV_PID" 2>/dev/null
  for _ in 1 2 3 4 5 6; do
    local pids
    pids=$(lsof -ti "tcp:$PORT" 2>/dev/null)
    [[ -z "$pids" ]] && break
    echo "$pids" | xargs kill -9 2>/dev/null
    sleep 0.5
  done
}
trap 'cleanup; exit 0' INT TERM

python3 "$REPO/nomad/serve_web.py" "$PORT" "$DIST" &
SRV_PID=$!

# Idempotent: re-asserting the same route is a no-op; the route persists in tailscaled
# across restarts of this job. NEVER `tailscale serve --https=443 off` (nukes the wikis).
sudo tailscale serve --bg --https="$TSPORT" "http://127.0.0.1:$PORT" \
  || echo "$(date '+%F %T') warning: tailscale serve registration failed (route may already exist)"

echo "$(date '+%F %T') rgs-web up on :$PORT (pid $SRV_PID) — https://$TAILNET:$TSPORT/"
wait "$SRV_PID"
rc=$?
cleanup
echo "$(date '+%F %T') rgs-web server exited (rc=$rc)"
exit $rc
