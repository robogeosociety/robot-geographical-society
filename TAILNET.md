# RGS on the tailnet (private-by-default)

The human-facing site moved off the public internet into Tommy's Tailscale tailnet;
the Cloudflare **data pipelines stayed** (Workers workflows, R2, KV, AE). The public
domain is a **blank 404 wall**. Migration done 2026-07-02 in three phases.

## What serves what

| Surface | Where | Auth |
|---|---|---|
| Web UI | mini, `https://tommys-mac-mini.tail59a169.ts.net:8443/` | tailnet membership |
| `/api/*` (from the UI) | mini reverse proxy → the Worker | proxy injects `X-RGS-Key` server-side |
| Backend Worker (read API, admin, workflows) | Cloudflare, `api.robogeosociety.xyz` | **the 404 wall** — `X-RGS-Key` or blank 404 |
| `robogeosociety.xyz` / `www` / `api` (public) | Worker zone routes | blank **404** to everyone |
| `POST /discord/interactions` | Worker | the one carve-out — Ed25519-verified, public |
| `atlas.robogeosociety.xyz` | Cloudflare Pages | deliberately public (travel wiki) |
| Data pipelines (collector, watchers, VaultMarkdownLoop, readiness) | Cloudflare | unchanged |

## The wall

The backend Worker is its own auth boundary — Cloudflare Access is **retired**. Middleware
in `backend/src/index.ts` returns a blank `404` for any request without the `X-RGS-Key`
header (wrangler secret `RGS_KEY`; constant-time compare in `auth.ts`; a valid key = admin).
Zone routes in `backend/wrangler.toml` make it answer the whole domain, not just `api.*`.
Unset key (local `wrangler dev`) leaves the wall open.

**The key** lives only on the mini: `~/.config/rgs/wall-key` (0600) = the `RGS_KEY` secret.
Vend it with `rgs-vend env` / `rgs-admin env` (see the token-vendor memory). Consumers that
carry it: the mini's `/api` proxy (`nomad/serve_web.py`), `rgs-admin`, `web/` local dev.

## Serving on the mini

- `nomad/serve_web.py` — static `web/dist` (SPA fallback) + `/api` reverse proxy (adds the
  key). Serves `dist/` by absolute path, fresh per request.
- `nomad/rgs-web-serve.hcl` — Nomad service; `sudo tailscale serve --https=8443` fronts
  loopback `:5197`. (Needs the one-time `tailscale-serve` NOPASSWD sudoers rule.)
- `nomad/rgs-web-build.hcl` + `build-web.sh` — periodic (~10 min) rebuild of `dist` when
  `main` moves (rebuild-in-place, no serve restart), heartbeat → InfluxDB `ops` bucket.
  Build quirks: node 20 via volta; `npm ci --ignore-scripts` (miniflare's `sharp` won't
  compile and vite doesn't need it) + `npm rebuild esbuild`.

## Infra

- `infra/access` — the Access apps + dev service token were deleted; only the account-level
  social IdPs remain (destroy the apps with a **targeted** apply — a full apply stomps the
  IdP client secrets in state).
- `infra/dns` — the `campsites.`/`collectors.` Pages CNAMEs are gone; apex + `www` are proxied
  parking records so the Worker zone route answers.
- CI (`.github/workflows/ci.yaml`) deploys the backend Worker only; the frontend is no longer
  shipped to Pages (the Pages project was deleted).

## Gotchas

- `wrangler secret put/list` refuses OAuth over SSH (piped stdin) — export
  `CLOUDFLARE_API_TOKEN=$(cd /Volumes/dev/cloudflare-tfvend && make -s output T=rgs_deploy_token)`.
  That token also covers deploys with the apex/www **zone routes** (needs Workers Routes Write).
- Never `tailscale serve --https=443 off` on the mini — it nukes every path mount (the wikis).
- The Mapbox `rgs_web` token allowlist already includes the ts.net host (`infra/mapbox`).
