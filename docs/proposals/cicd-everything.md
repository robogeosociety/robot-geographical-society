# CICD Everything — migrate the fleet off the Mac mini

**Status:** draft proposal · 2026-07-17
**Goal:** total remote lifecycle control — a Claude Code web session opens a PR, merges it,
and CI/CD deploys the live app. No SSH to the mini in any lifecycle.

## Context

Only four workflows use the mini's self-hosted runner today (all CD/fleet-sync:
`supervisor/deploy.yml`, `discobots/deploy.yml`, `obsidian-automations/deploy.yml`,
`pointcollector/deploy-scriptable.yml`, plus `supervisor/repo-sync.yml`), but the *runtimes*
and Terraform state are mini-bound, so remote sessions can't complete a lifecycle.

**Primary objectives: get discobots, obsidian (+ obsidian-automations), and supervisor off
the mini.** End-state:

- **Cloud-native by default** — apps deploy to Cloudflare (Workers/Pages/KV/R2/Containers)
  or GitHub Pages via GitHub-hosted Actions.
- **Mini = appliance for truly-local work only** (MLX, iCloud transport, camera capture, big
  local disk), deployed via Actions + the self-hosted runner, never by hand. The runner is
  also the trust boundary for private-repo deploy/apply jobs.
- robogeosociety/observability-config#149 (org CI/CD dashboard, parked) revived in cloud form.

### Rulings (Tommy, 2026-07-17)

1. **Discobots move to the cloud immediately — no shadow phase.** Supervisor jobs may
   shadow-migrate (robogeosociety/supervisor#19 pattern); discobots is a straight lift.
2. **Observability**: Cloudflare-native (Workers cron + Analytics Engine/D1) if it can fully
   replace the TIG stack; **headless Grafana migrated into Cloudflare** is the fallback.
   Decision checkpoint after the collector migrates.
3. **Terraform**: R2 remote state + Actions-driven. No GitHub Team upgrade — **audit which
   private repos can go public** (environment gates are free on public repos); the truly
   private ones run gated jobs on the mini runner.
4. **Deploy approvals**: a **discobot slash-command approval gate** (`/deploy approve`).
5. **Obsidian**: fold in the Obsidian Sync → eventually-consistent iCloud cutover (Phase-0
   shadow merged: robogeosociety/obsidian-automations#233, robogeosociety/supervisor#12) and
   the robogeosociety/obsidian#30 spike (note pipeline as a durable Cloudflare Worker).
6. **Edge posture**: split — public surfaces native Cloudflare; internal-only (dev wiki)
   stays tailnet.

### Prior decisions superseded or extended

- robogeosociety/observability-config#145 "Pilot Light" (keep-most-on-mini): **superseded** —
  the CI-gate work stays valid for what remains on the mini; the org default flips cloud-first.
- robogeosociety/observability-config#139 Grafana→asyncio: **re-scoped to Cloudflare**
  (Workers-cron collector; Grafana retained only if CF-native dashboards fall short).
  Parked #151/#152/#153 re-target Workers.
- robogeosociety/supervisor#1 appliance charter / observability-config#144 CD-only runner:
  still stand; this plan shrinks the appliance further.
- Shadow-first for discobots: overruled by ruling 1.

## Workstreams

### WS0 — Prerequisites: visibility audit, secrets, approval gate

1. **Public/private audit** (human task): recommend flipping public — observability-config,
   discobots, wikipedia-local, discord-maps, RealityCapture, robot-geographical-society —
   after a blocking full-history secret scan each. Stay private: infra, cloudflare-tfvend,
   obsidian, obsidian-automations, tommybot, supervisor; their gated jobs run on the mini
   runner.
2. **Discobot deploy-approval gate** — the first new cloud discobot and the org approval UX.
   CF Worker (Discord interactions endpoint) posts pending deploys to #dev;
   `/deploy approve|reject <repo> <run>`. Public repos: GitHub "review pending deployments"
   API; private repos: `repository_dispatch` the waiting workflow consumes. GitHub App
   credentials scoped to deployments.
3. Secrets plumbing already tracked: robot-geographical-society#162 `PROJECT_SYNC_TOKEN`,
   supervisor#17 `CLAUDE_CODE_OAUTH_TOKEN`.
4. One last on-mini `/tf-vend` run: scoped CF tokens for CI (R2 state, per-repo Workers
   deploy) into GitHub secrets — the WS1 bootstrap.

### WS1 — Terraform: R2 state, plan-in-CI, gated apply

`infra` + `cloudflare-tfvend` (both stay private). Pattern: robot-geographical-society#157.

1. Last local applies: add R2 backend, `terraform init -migrate-state` both roots. Mapbox
   secret → repo secrets.
2. `terraform plan` on every PR (GitHub-hosted, plan posted as PR comment).
3. `terraform apply` on merge runs on the **mini runner** (potent secrets never leave the
   tailnet), gated by discobot approval. Fully remote-drivable.
4. tfvend becomes PR-driven vending: merged token `.tf` → apply mints → `gh secret set` into
   the target repo (the GH-secrets rail). `/tf-vend` skill opens PRs instead of SSHing.
5. Archive (don't delete) local state until two clean remote applies.

### WS2 — Discobots to Cloudflare, immediately (primary objective)

1. Inventory bots by transport. Interactions/webhook bots → CF Workers now (router Worker or
   per-bot); state → KV/Durable Objects; valkey bus → Queues/DO. Deploy via `wrangler deploy`
   on GitHub-hosted Actions.
2. Gateway-websocket bots: port to interactions model where the feature set allows; a
   genuinely gateway-dependent bot stays on the mini under bundle CD as an explicit exception.
3. Cut Discord application endpoints over, verify in a test guild, then delete the mini
   containers + the self-hosted deploy job. #dev heartbeat (discobots#47) re-homes to a
   Workers cron.

### WS3 — Obsidian off the mini: iCloud cutover + pipeline to Workers (primary objective)

1. **Finish Obsidian Sync → iCloud**: continue from the merged Phase-0 shadow
   (obsidian-automations#233 / supervisor#12 `obsidian-icloud-shadow`): evaluate shadow
   metrics → two-way eventual consistency → cut vaults over → drop the Sync subscription.
2. **Pipeline off the mini** per obsidian#30: note pipeline as a durable Cloudflare Worker.
   Git stays the agent-edit transport; the Worker operates on the git mirror / R2 copy;
   iCloud is the device transport with the mini as a small CD-deployed iCloud↔git bridge —
   the one truly mini-bound piece.
3. Derived-artifact regeneration (geojson, punch-lists, daily/weekly notes, wikis) moves to
   Workers cron/queue jobs wherever vault access can come from the git mirror; the ~40 Nomad
   jobs shrink to the bridge set. Folds in obsidian-automations#218, #258, #238.

### WS4 — Supervisor shrinks to a watchdog (primary objective)

1. Lift supervisor jobs to Workers shadow-first per supervisor#19 (campsite pipeline first);
   repeat until the registry has no cloud-liftable jobs.
2. Fleet-sync (`repo-sync.yml`) moves to a GitHub-hosted cron workflow; `/Volumes/dev`
   mirroring retires with the appliance role.
3. Remainder on the mini: thin watchdog (launchd/Nomad health, disk, iCloud bridge, capture),
   deployed via sealed-bundle blue/green CD (finish supervisor#11, #20; tommybot#90).

### WS5 — Observability to Cloudflare (TIG stack retired or re-homed)

1. Port the #149 cicd-collector (branch head f9ab362, kept) to a Workers cron writing to
   Analytics Engine (D1 for history). Same idempotent overlap-window design.
2. Alerting (#151/#152/#153 re-targeted): Workers cron checks → Discord webhooks.
3. **Dashboard checkpoint**: build the CI/CD view CF-native (Pages app on the Analytics
   Engine SQL API). If inadequate, migrate **Grafana itself into Cloudflare** (headless,
   provisioned from observability-config, on Cloudflare Containers; datasource → Analytics
   Engine/D1). Either way the mini hosts no TIG stack.
4. Decommission on the mini at parity: Grafana + InfluxDB containers, launchd coordinator,
   `com.tommy.*` collectors — frees most of the 8 GB (relieves tommybot#96). Folds in
   observability-config#147.

## Sequencing

Paperwork (this PR + tasks) → WS0 → WS1 → **WS2 immediately** (dogfoods the approval gate) →
WS3 + WS4 in parallel → WS5 last. WS4's bundle-CD items proceed continuously.

## Verification

- WS0: gate end-to-end on a dummy workflow — pending deploy → Discord prompt →
  `/deploy approve` → job proceeds; reject withholds.
- WS1: test PR to `infra` shows a plan comment; merge → Discord approve → apply on the mini
  runner; `terraform state pull` from Actions matches.
- WS2: bots verified in a test guild; mini containers stopped a week before deletion;
  heartbeat continues from Workers cron.
- WS3: shadow metrics clean before two-way cutover; render-verify passes on
  Worker-regenerated notes; an agent edit lands via git and appears on-device via iCloud
  with Obsidian Sync off.
- WS4: supervisor#19 parity diff clean; Monday fleet-sync green from a GitHub-hosted runner.
- WS5: a week of Analytics Engine `workflow_run` rows matches GitHub's runs list; forced-red
  workflow fires the Discord alert; dashboard checkpoint recorded on the board.
- **End-state**: from a Claude Code web session, one full lifecycle each on (a) a Cloudflare
  app, (b) a private-repo Terraform change, (c) a mini-bound app — touching nothing but
  GitHub + Discord approval.

## Open questions

- Which discobots (if any) are irreducibly gateway-bound?
- Analytics Engine retention limits vs. D1 for long CI history — pick during WS5.
- Does the iCloud↔git bridge stay a launchd job or fold into the watchdog supervisor?
