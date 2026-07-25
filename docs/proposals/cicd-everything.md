# CICD Everything — migrate the fleet off the Mac mini

**Status:** ACCEPTED and DELIVERED · proposed 2026-07-17 · closed 2026-07-25
**Outcome:** see [Outcome](#outcome) — WS0–WS5 complete; two cutovers and the Obsidian
Phase-1 gate tracked as follow-on issues.
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

---

# Outcome

Delivered 2026-07-17 → 2026-07-25. Every workstream is complete or reduced to a scheduled
cutover, and the whole effort was executed through the machinery it was building: PRs,
CI, and Discord approvals, with no hand-deploys.

## What shipped

| WS | Result |
|---|---|
| **WS0 Gate** | 6 repos flipped public after clean full-history secret scans (rgs#169). GitHub App `rgs-deploy-gate` + Discord app `deploy-gate`; the **deploy-gate Worker** is live and proven end-to-end (card in #dev → Approve → run resumes). Private repos, which can't use environment protection rules without Enterprise, get the same UX via an HMAC-nonce **`repository_dispatch` lane** (discobots#59). |
| **WS1 Terraform** | Every root (`infra/mapbox`, `infra/valkey`, `cloudflare-tfvend`) on **R2 remote state**; plan-on-PR, Discord-gated apply on the mini runner (infra#17, cloudflare-tfvend#6). The lane immediately paid for itself — it surfaced and fixed pre-existing valkey drift and two latent Mapbox `allowed_urls` rules (schemeless entries and IP addresses are both rejected, validated on every write). |
| **WS2 Bots** | Inventory found **no gateway-bound bots** (discobots#56). Lifted to Workers: github-heartbeat + daily check-in, transit-panel, skills-feed (+ a mini-side `skills-inventory` publisher, supervisor#30). Retirement was later made **durable** by pruning the roster in `ops/run.sh` + `ops/fleet.toml` (discobots#74) — stopping containers alone was not enough; the CD poller re-materialised them. |
| **WS3 Obsidian** | Re-scoped by the posture amendment (below). The reported "iCloud sync issues" were **not transport**: macOS `optimize-storage` evicted the shadow tree (11k dataless files) and the publisher `EDEADLK`-crashed under launchd. Hardened with an atomic rename-based publish, per-vault isolation and telemetry compaction (obsidian-automations#270); Phase 0 passed, Phase 1 (phone-lag) continues in obsidian-automations#263. |
| **WS4 Supervisor** | All 25 registry rows classified: 2 lifted, 1 lift-with-rework, **20 custodian-by-design**, 2 retired. rgs-wiki lifted to a Worker with byte-parity verified against the mini (supervisor#32); campsite shadow landed (supervisor#19). Influx-dead sweep removed in supervisor#33 + obsidian-automations#275. |
| **WS5 Observability** | Escalated when InfluxDB entered an OOM crash loop. The parked observability-config#149 collector was reborn as the **cicd-collector Worker** (5-min org-wide polls → Analytics Engine, red-CI alerts to #dev; observability-config#158). TIG then retired: Grafana, renderer, InfluxDB, 5 launchd collectors and 7 bot containers stopped, history archived to restic/R2 (snapshot `8fb399c2`) and 2.66 GB reclaimed. |

## Amendments to the original plan

- **Posture (2026-07-19).** The mini's end-state changed from *minimal appliance* to
  **custodian + agent-dev box**: it permanently owns git working sets, iCloud transport and
  Obsidian automation, and hosts long-running Claude sessions; the Air stays primary for
  interactive dev; production is Cloudflare. Consequently obsidian#30 and
  obsidian-automations#264 (note pipeline → durable Worker) were closed **not planned**, and
  fleet-sync stays mini-side. This amends the supervisor#1 appliance charter.
- **No GitHub Team upgrade.** Repos went public instead; environment protection is free there.
  Private repos ride the `repository_dispatch` lane.
- **Grafana was not migrated.** The CF-native collector + Discord alerting replaced it
  outright, so the "Grafana on Cloudflare Containers" fallback was never needed.

## Operating lessons worth keeping

- **Org-level secrets, one capture ceremony.** Repo-level write-only secrets forced repeated
  credential ceremonies; shared credentials now live at org level. Note the Free-plan caveat:
  org secrets do **not** reach private repos, which still need repo-level copies.
- **Nothing pending a human may sit in a chat window.** The gate Worker grew a `/notify`
  endpoint so agents post blockers to #dev; discobots#73 then made pending cards **re-raise
  themselves** after a deploy card sat unnoticed for two days.
- **Retirement means removing the thing from its roster**, not stopping the process.
- **The mini as a persistent session host works.** Proven 2026-07-25: a desktop SSH session
  ran **1h38m past the client disconnecting** and completed its tasks. File tools intermittently
  round-trip to the client (~5% retry tax, rgs#173); Bash does not.

## Still open (tracked elsewhere)

- Cutovers: rgs-wiki (supervisor#35), campsite burn-in → parity → flip (supervisor#36).
- Obsidian Phase-1 phone-lag gate, then two-way cutover (obsidian-automations#263).
- `MaterializeDatalessFiles` plist install at a quiet moment (supervisor#31).
- Host-vitals via Vector → Analytics Engine, which also re-sources the weather stack still
  reading the retired InfluxDB (observability-config#161).
- One human sitting: Full Disk Access for sshd, so iCloud paths are visible to remote
  sessions (rgs#172, rgs#130).
