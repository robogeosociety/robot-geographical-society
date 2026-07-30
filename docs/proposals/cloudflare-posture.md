# Cloudflare Posture — stop expanding, finish what's started

**Status:** DECIDED · 2026-07-26 (all six open questions ruled; see [Decisions](#decisions-2026-07-26))
**Amends:** [`cicd-everything.md`](./cicd-everything.md) (rgs#167, ACCEPTED 2026-07-17,
posture amended 2026-07-19)
**Decommissions:** nothing. Every Worker, Pages project, bucket, namespace and dataset
listed here keeps running exactly as it is.

## TL;DR

| | |
| --- | --- |
| **The conflict** | rgs#167 set `cloud = production, mini = custodian` and delivered it. Tommy's stance as of 2026-07-25/26 is *"Cloudflare was a useful PoC, and should be useful in the future, but I'm on my local network now."* Both are on record; neither cites the other. |
| **The resolution** | **Stop expanding, finish what's started, keep what works.** Cloudflare stops being the **default target for new fleet-internal work** — but it is not being unwound: Analytics Engine stays, both in-flight cutovers were ruled on individually, and public surfaces may still use Workers. GitHub Actions is the rail for scheduled/CI work; the mini/LAN is the default home for fleet-internal work. |
| **What moves** | Nothing, now. This is a posture and documentation change, not a migration. |
| **What this fixes** | An agent reading the written record today is told to build toward Cloudflare. After this, the record says otherwise, in one citable place. |

---

## The resolved posture — three lanes

**1. Cloudflare — reserve for fleet-internal work, still first-class for public surfaces.**
Existing Workers, Pages, R2, KV, Analytics Engine, Access and Tunnel keep running.
**No new Cloudflare Workers for fleet-internal work** without an explicit ruling — that
scope is deliberate (ruling 5): a genuinely public product surface has no LAN answer, so
Workers remain the right choice there. Cloudflare is held, proven, and available, not retired.

**2. GitHub Actions — the rail for scheduled and CI work.**
Actions is *not* "more cloud" in the sense being stepped back from. It is where
scheduled jobs, CI, and LLM-driven automation belong.

> _"Actions won for LLM work for a structural reason, not a preference."_

Tommy's Claude access is a Max **subscription**, not metered API credits. Subscription
auth lives in the Claude CLI via `CLAUDE_CODE_OAUTH_TOKEN` — and **a Cloudflare Worker
cannot run a CLI.** The Workers' Anthropic API path failed with `400 — credit balance is
too low`, and that key has since been deleted from both Workers. Actions can run the CLI;
Workers structurally cannot. This is not recoverable by tuning.

**3. The mini / LAN — default home for fleet-internal work.**
Anything whose consumers are all inside the tailnet defaults here: host telemetry,
Obsidian automation, MLX inference, capture, the big disk, and the self-hosted runner as
the trust boundary for private-repo gated jobs.

### What this does *not* change

- The mini's **custodian + agent-dev box** role (the 2026-07-19 amendment) stands.
- The Air stays primary for interactive dev.
- The deploy-approval gate, the `repository_dispatch` lane, R2 remote state and the
  Discord-gated apply lane all stay. They are Actions-and-gate machinery, not a
  Cloudflare posture bet.

---

## Live Cloudflare surface

Inventoried 2026-07-26 against the account (`d7adee58513c1b2f770ccaac90cf114f`),
cross-referenced against every `wrangler.toml` in the org.

**One consequence of ruling 1 to keep visible.** The mini's own host telemetry and its
disk/memory alerting are now *permanently* Cloudflare-resident. That is an accepted
trade-off, not a gap — but it means a Cloudflare outage costs the fleet its health
monitoring, and there is no local fallback to reach for.

**A note on verification.** No single credential on this box can enumerate the whole
surface — by design. `cloudflare-tfvend` vends narrowly-scoped tokens, so Workers, R2 and
KV each need a different one, and no token holds account-wide Workers or R2 read. Workers
below are confirmed live by **HTTP probe**; KV by **key listing**; Pages by the Pages
token; Access, tokens and zones by the **bootstrap** (`~/.cf.tfn.token`). R2 buckets and
Analytics Engine datasets are enumerated **from code** and could not be confirmed against
the API. Least-privilege is working as intended; it just means "what is actually deployed"
is not answerable from one place — and that the one credential which *can* reach across
Access and token management is the bootstrap, which is its own finding (see one-way doors).

### Workers

| Worker | What it does | Depends on it | Cost to move to LAN |
| --- | --- | --- | --- |
| **deploy-gate** ✅ | Discord `/deploy approve` gate + `/notify` blocker lane; cron `17 * * * *` | Every gated deploy/apply lane (infra, tfvend, discobots, supervisor); agents posting blockers to #dev | **High** — needs a public endpoint to receive Discord interactions and GitHub webhooks; a LAN home means a tunnel, which is still Cloudflare |
| **robot-geographical-society-backend** ✅ | `api.robogeosociety.xyz`; read API + durable collector. KV `CAMPSITES`, R2 `campsite-raw`/`campsite-vault`, 5 AE datasets, 2 Workflows | The rgs product frontend; Access SSO boundary | **Very high** — public product surface; Workflows and AE have no LAN equivalent |
| **cicd-collector** ✅ | Org CI/CD telemetry → AE; red-CI alerts to #dev; **plus the mini's own disk/mem/swap alerting** off `host_vitals` | Org CI visibility; the mini's health alerting | **Medium-high** — moving it to the mini makes the watchdog co-resident with what it watches, which is the exact failure the retired `stack-watchdog` existed to avoid |
| **host-vitals** ✅ | Ingest for the mini's Vector agent → AE `host_vitals`, `weather_obs` | `com.tommy.vector` (running); Tempest weather feed | **Medium** — but **staying** (ruling 1): no LAN store will be rebuilt |
| **github-heartbeat** ✅ | Org GitHub activity + daily check-in → #dev; cron `*/30` | #dev signal | **Low** — an Actions cron does this natively |
| **skills-feed** ✅ | New Claude Code skills → #skills; cron `0 */3` + `33 16` | Mini-side `skills-inventory` publisher (supervisor#30) | **Low–medium** — already half mini-side |
| **transit-panel** ✅ | GTFS-Realtime per-line status, one #transit message edited in place; cron `* * * * *` | #transit | **Medium** — every-minute cron; Actions' floor is 5 min, so the mini is the better LAN home |
| **rgs-wiki** ✅ | Serves the wiki from KV `rgs-wiki-pages` (14 pages); `REQUIRE_KEY=0` since the cutover | `wiki.robogeosociety.xyz` behind the `RGS wiki` Access app | **Low** — but **cut over 2026-07-26** (ruling 3); the mini's build+serve rows are retired |
| **mountain-inference** ✅ | `*/15` inference; Cloudflare **Containers** + Durable Object + R2 `is-the-mountain-out-public` | `is-the-mountain-out` state feed | **Medium** — it replaced a mini job; the container could return, but Containers are a deeper commitment than a plain Worker |
| **campsite-supervisor** ⚠️ | Durable Object, Queues (`campsite-work` + DLQ), Workflow `campsite-inventory`, KV, R2 `campsite-artifacts`, AE. Shadow env deployed; shadow KV **empty** | Nothing — **PARKED** (ruling 2) | **N/A — deliberately not flipped.** Shadow stays up, KV stays empty |
| **tallest-tree** ❌ | Declared only: Worker + **D1** + Containers. `database_id` is still `REPLACE_WITH_D1_ID` | Nothing | Not deployed; no action |

✅ confirmed live · ⚠️ deployed, not cut over · ❌ declared in code, not deployed

### Everything else

| Surface | Items | Cost to move to LAN |
| --- | --- | --- |
| **Pages** (4) | `robot-geographical-society-web` (service-binds the backend), `dev-wiki` → `dev.robogeosociety.xyz`, `travel-wiki` → `atlas.robogeosociety.xyz`, `campsites-wiki` | **Low** for the three Access-gated wikis — read only by Tommy, and they were tailnet-served before. **Medium** for `rgs-web` (public product) |
| **KV** (7) | `CAMPSITES` (2 keys), `rgs-wiki-pages` (10), `cicd-collector-state`, `github-heartbeat-state`, `skills-feed-state`, `transit-panel-state` (1 each), `campsite-supervisor-shadow-state` (0) | **Low** — all small; each is one Worker's state |
| **R2** (7, from code) | `tommyroar-tfstate`, `campsite-raw`, `campsite-vault`, `campsite-artifacts`, `is-the-mountain-out-public`, `dev-backup`, `obsidian-backups` | **Low** for the two backup buckets (offsite is the point — keep them). **High** for `tommyroar-tfstate` — see one-way doors |
| **Analytics Engine** (11 datasets) | `campsite_collector`, `_runs`, `campsite_availability`, `_demand`, `_readiness`, `campsite_supervisor_tick`, `cicd_workflow_runs`, `_inventory`, `cicd_collector_polls`, `host_vitals`, `weather_obs` | **High** — see one-way doors |
| **Access** (5 apps) | The three wikis, plus `campsites-wiki` and `travel-wiki` Pages apps. SSO identity + a service token used by the rgs Vite dev proxy | **Medium** — Tailscale ACLs replace SSO for tailnet-only consumers, but the rgs service token needs a replacement |
| **Zones** (3) | `robogeosociety.xyz`, `walksheds.xyz`, `judkinsparkforpeople.org` | n/a — DNS stays |
| **Tunnel** | `com.tommydoerr.rgs-dev-tunnel` runs on the mini (token at `~/.config/rgs/dev-tunnel-token`). The legacy `cfd_tunnel` API lists **0** — it is on the newer connector model, or invisible to the vended token | Unverified; low stakes |
| **Queues / DO / Workflows / D1 / Containers** | Queues `campsite-work` + `campsite-work-dlq`; DOs `SupervisorDO`, `InferenceContainer`; Workflows `campsite-collector`, `campsite-hot-date-watch`, `campsite-inventory`; D1 `tallest-tree-db` (uncreated); Containers `mountain-inference` | **High** — no LAN equivalent for Queues/DO/Workflows |
| **Tokens** (18) | 16 vended by `cloudflare-tfvend`; 2 hand-made: **`floral-firefly-d65b`** — traced under ruling 4 to `~/.cf.tfn.token`, **this is the bootstrap**, the only token with `Account API Tokens Write` (see one-way doors) — and **`R2 Account Token`** (never used; `is-the-mountain-out` bucket item write only) | n/a — but the bootstrap's storage is an open decision |

`campsites.robogeosociety.xyz` **does not resolve.** The custom domain the migration plan
describes was never attached or has been removed; the frontend serves on
`robot-geographical-society-web.pages.dev`.

---

## The one-way doors

### 1. R2 Terraform state ↔ tfvend circularity

`cloudflare-tfvend` vends the `tfstate-r2` credentials for the bucket its **own** state
lives in (`tommyroar-tfstate`, key `tfvend/tfvend.tfstate`). `state.tf` already documents
this and records Tommy's 2026-07-18 override accepting it. Four roots now sit on that
bucket: `cloudflare-tfvend`, `infra/mapbox`, `infra/valkey`, and the rgs `infra/*` roots.

**Unwinding requires:** `terraform state pull` on each root → re-init with a local
backend → verify plans are empty → then, only if the bucket is being abandoned,
re-vend `tfstate-r2` from the bootstrap token.

**Corrected 2026-07-26 — the door is not the risk; the key's storage is.**
An earlier draft of this doc claimed the recovery path was blocked because the bootstrap
token lives in the mini's Keychain and the login keychain refuses non-interactive reads
(`User interaction is not allowed`). Both halves of that are true but the conclusion was
wrong: the Makefile's documented fallback is `TOKEN_FILE ?= $(HOME)/.cf.tfn.token`, and
**that file works headlessly.** It was used on 2026-07-26 to run a real
`terraform apply` against `cloudflare_account_token.supervisor_ci` from a remote session.
So headless recovery *is* possible, and ruling 6's rehearsal is a prudence exercise rather
than a rescue from a dead end.

The earlier draft also asserted that `~/.cf.tfn.token` is a *vended* token and "anything
assuming that file is the bootstrap is wrong." **That was backwards.** Traced under ruling 4:
the file is `floral-firefly-d65b`, and it is **the only token in the account holding
`Account API Tokens Write`** — which is precisely the bootstrap capability, and is what let
that apply modify a token at all.

**The real finding is a blast-radius one.** The account's most privileged credential is a
hand-minted, non-IaC, never-expiring token sitting in a plaintext file (mode 600) that any
agent session on the mini can read. It can:

- **mint, modify and revoke any account API token** — i.e. re-vend or destroy everything
  `cloudflare-tfvend` manages, including its own state credentials;
- **rewrite the Access boundary** (`Apps and Policies Revoke/Write`) — i.e. remove the gate
  in front of `wiki.`, `api.` and `atlas.robogeosociety.xyz`;
- **mint Access service tokens** (`Service Tokens Write`) — i.e. create bypass credentials.

The tension is real and is Tommy's to resolve: `make save-token` moves it into the Keychain
and prints *"You can now: rm $(TOKEN_FILE)"* — which is the safer posture, and is also
exactly what would make headless recovery impossible. Pick one deliberately; today the
account is running on the convenient end by default rather than by decision.

### 2. Analytics Engine history

AE is queryable only through the SQL API and has **no bulk export**. Every metric the
fleet has collected since TIG was retired — host vitals, weather, CI/CD runs, campsite
telemetry — exists only there, on a rolling retention window.

**Unwinding requires:** accepting the loss of that history, or writing a one-off
SQL-API-to-local dump before any retention boundary. There is no migration tool.

### 3. Public product surfaces

`api.robogeosociety.xyz` (Access-gated Worker) and the rgs Pages frontend are *public by
design*. Moving them to the LAN does not relocate them — it **withdraws them**. Same for
`atlas.` and the Access-gated wikis, though those have only one reader.

### 4. Durable Object / Queue / Workflow state

`campsite-supervisor`'s state lives in DO storage and in-flight queue messages. There is
no LAN equivalent and no export. The shadow's KV is empty, so **today the cost of not
flipping is zero** — that window closes once it carries real state.

---

## Documents reconciled

The written record contradicted the decision in ~13 places. Each gets a **dated pointer
to this doc**, not a deletion — history stays readable.

| Repo | Document | Change |
| --- | --- | --- |
| rgs | `docs/proposals/cicd-everything.md` | Second dated amendment: `cloud = production` superseded |
| observability | `Cloudflare-migration-plan.md` | Banner: delivered; no further Cloudflare moves |
| observability | `dex/README.md` | Banner: DEX is new Cloudflare surface — stays shelved |
| observability | `COORDINATION-PLAN.md` | Banner: its subject (Grafana provisioning) is retired |
| observability | `README.md`, `CLAUDE.md` | Banner: Grafana + InfluxDB are **gone**, not live |
| discobots | `README.md`, `AGENT.md`, `DISCORD.md`, `docs/infrastructure.md` | Banner: posture + InfluxDB-as-store correction |
| supervisor | `docs/cloudflare-workers/PLAN.md` | Frontmatter `status: proposed` → `on-hold`; **merged** once ruling 2 came back parked |

**Verified NOT stale:** `Cloudflare-endpoint-plan.md` already reconciled itself (status
RESOLVED, cites rgs#175). `robogeosociety/.github`'s README carries no Cloudflare posture
claim — it describes the PR framework and the mini-hosted `fleet-sync`, both consistent
with this posture. `rgs/README.md`'s deployment architecture is accurate and stays.

### Why the record drifted: fleet-sync has been dead for three weeks

`fleet-sync.yml` is the machinery that keeps the fleet's canonical files and labels in
compliance. **Its last successful run was 2026-07-07**; the two runs since failed, and the
weekly schedule has not fired successfully in ~3 weeks.

The cause is the Free-plan caveat rgs#167 itself wrote down as an operating lesson:
**org secrets do not reach private repos.** `fleet-sync` is hosted in the **private**
`supervisor` repo, and supervisor's repo-level secrets are `APP_ID`,
`CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, `DG_REQUEST_SECRET`,
`RGS_WIKI_SHADOW_KEY` — with **no `CLAUDE_CODE_OAUTH_TOKEN` and no `GH_TOKEN`**. The run
log shows both resolving to empty strings.

This matters twice over. It is a **mechanical cause of the drift this proposal
reconciles** — nothing has been propagating canonical files or labels since 7 July. And it
means the companion doc PRs here will land, but the propagation lane behind them stays
broken until the secret is added. Adding it is a credential ceremony and needs Tommy's
hands — filed as a `human-task`, not attempted.

### Out of scope, filed separately

**~30 documents across four repos still describe InfluxDB and Grafana as live.** They were
retired in WS5 — the containers are removed, no volumes remain, and
`com.tommy.observability-coordinator` and `com.tommydoerr.stack-watchdog` are no longer in
launchd. That drift is much wider than the posture question and reconciling it here would
bury the decision, so it is filed as its own sweep rather than folded in.

One live consequence worth flagging: `discobot-orbmem` and `discobot-heatmap` are
**running** and read InfluxDB credentials from `ask-dash/.env`. Their store no longer
exists. Their current behaviour is unverified.

**The discobots and supervisor loops were checked and are consistent.** Both were suspected
of running inconsistently after being moved off the dev disk while it was wedged. Verified
2026-07-26: the dev-disk checkouts are clean and at `origin/main`; the supervisor's
internal-disk runtime (`~/.local/share/obsidian-supervisor/code`) is at the same commit and
healthy (17h uptime, 480 ticks, 23 tasks, 2176/6144 MB); the discobots containers were
rebuilt today at 08:45. No inconsistency to repair.

The structural risk behind the suspicion is real, though, and worth recording: **moving the
runtimes off the dev disk did not remove the dependency on it.** Both `autodeploy` loops
still ff-merge `/Volumes/dev/<repo>` as the source of truth, and the supervisor's
`bootstrap.sh` re-syncs the internal copy from there on restart. Worse, `supervisor/ops/
autodeploy.sh` opens with `cd "$REPO" || exit 0` — so if the dev disk is unreachable it
**no-ops and reports success to launchd.** The failure mode is silent staleness, not
corruption, and nothing alerts on it. Filed as a `machine-task`.

---

## Decisions (2026-07-26)

All six were ruled the day this doc was written. They are **more permissive than the
original framing** — which is why the headline changed from a retreat to *stop expanding,
finish what's started*. Recorded as dated rulings so the record stops drifting.

**1. Local observability stays on Analytics Engine — accepted trade-off.**
The mini's host metrics and the Tempest weather feed leave the LAN, land in AE, and are
alerted on by the `cicd-collector` Worker. Grafana and InfluxDB are gone and **no local
dashboard remains**. This is recorded as an *explicit accepted trade-off*, not an
oversight: LAN telemetry and the mini's own disk/memory alerting are **permanently
Cloudflare-dependent** under this ruling. Rebuilding a LAN store was considered and
declined as not worth the work. Revisit if the AE path itself becomes a liability.

**2. supervisor#36 — PARKED. Do not advance.**
`campsite-supervisor` would be a genuinely *new* fleet-internal Worker, which is exactly
what ruling 5 targets. supervisor#39 stays open and unmerged (merging it deploys the shadow
Worker, creates the DO namespace and starts burn-in — merging *is* the parked action).
Shadow resources stay up; parked is not cancelled. The shadow KV remains at 0 keys, so the
cheap-cancellation window stays open. supervisor#47 (`status: on-hold` on the Workers plan)
is therefore correct and was merged.

**3. supervisor#35 — GRANDFATHERED, and shipped.**
The opposite call to #36, on three grounds: the Worker was not new (deployed since #32), an
Access-gated wiki is the kind of surface ruling 5 still permits, and the mini's serve job
had been dead since 2026-07-01 (`fails=23469`, exit 127) — so *not* cutting over left the
wiki broken. Delivered via tfvend#12 → supervisor#42 → #52 → #55.

The cutover produced one finding worth keeping: a probe of the live hostname returned the
Worker's own 403, proving **no Access app covered it**. Shipping both stages together would
have published the private wiki. The `RGS wiki` Access app was created first, re-probed, and
only then was the gate opened. The Pages wikis stay on Cloudflare.

**4. `floral-firefly-d65b` — trace it, then report. No credential change.**
Hand-minted, non-IaC, last used **2026-07-26** — actively load-bearing for something
unidentified. The ruling is explicitly *investigate before touching*: find the consumer and
bring back a plan rather than re-vending or revoking. `R2 Account Token` has never been used
and is a free revoke, but revoking is still a live-infrastructure change and stays out of
scope under the same ruling.

**5. "No new Workers" means no new *fleet-internal* Workers.**
Confirmed — this was the one place the doc admitted to guessing at intent, and the guess was
right. A genuinely public product surface (the next thing shaped like `walksheds` or the rgs
frontend) has no LAN answer, so Workers remain available there. Fleet-internal work defaults
to Actions or the mini.

**6. Rehearse the bootstrap recovery — yes, soon.**
The path in §1 has never been tested and needs Tommy at the machine (the login keychain
refuses non-interactive reads). A dry run takes minutes and converts the only R2-state
escape hatch from an assumption into a verified fact. Tracked as a `human-task`.

---

## What this does not do

- No `wrangler delete`, no Worker removal, no bucket or namespace deletion.
- No token revocation — including `R2 Account Token`, which is unused and would be a free
  revoke; ruling 4 keeps it out of scope.
- No teardown of the parked campsite shadow (ruling 2): parked is not cancelled.
- No migration of any workload beyond the supervisor#35 cutover that ruling 3 authorised.
