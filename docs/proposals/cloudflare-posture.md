# Cloudflare Posture — proven capability, held in reserve

**Status:** PROPOSED · 2026-07-26
**Amends:** [`cicd-everything.md`](./cicd-everything.md) (rgs#167, ACCEPTED 2026-07-17,
posture amended 2026-07-19)
**Decommissions:** nothing. Every Worker, Pages project, bucket, namespace and dataset
listed here keeps running exactly as it is.

## TL;DR

| | |
| --- | --- |
| **The conflict** | rgs#167 set `cloud = production, mini = custodian` and delivered it. Tommy's stance as of 2026-07-25/26 is *"Cloudflare was a useful PoC, and should be useful in the future, but I'm on my local network now."* Both are on record; neither cites the other. |
| **The resolution** | Cloudflare stops being the **default target for new work** and becomes a **proven capability held in reserve**. GitHub Actions is the rail for scheduled/CI work. The mini/LAN is the default home for fleet-internal work. |
| **What moves** | Nothing, now. This is a posture and documentation change, not a migration. |
| **What this fixes** | An agent reading the written record today is told to build toward Cloudflare. After this, the record says otherwise, in one citable place. |

---

## The resolved posture — three lanes

**1. Cloudflare — reserve, not default.**
Existing Workers, Pages, R2, KV, Analytics Engine, Access and Tunnel keep running.
**No new Cloudflare Workers** without an explicit ruling. Cloudflare remains the right
answer for genuinely public product surfaces and for anything that must be reachable
from outside the tailnet — it is held, proven, and available, not retired.

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

**A note on verification.** No single credential on this box can enumerate the whole
surface — by design. `cloudflare-tfvend` vends narrowly-scoped tokens, so Workers, R2 and
KV each need a different one, and no token holds account-wide Workers or R2 read. Workers
below are confirmed live by **HTTP probe**; KV by **key listing**; Pages by the Pages
token; Access/tokens/zones by the vended Access-admin token. R2 buckets and Analytics
Engine datasets are enumerated **from code** and could not be confirmed against the API.
Least-privilege is working as intended; it just means "what is actually deployed" is not
answerable from one place.

### Workers

| Worker | What it does | Depends on it | Cost to move to LAN |
| --- | --- | --- | --- |
| **deploy-gate** ✅ | Discord `/deploy approve` gate + `/notify` blocker lane; cron `17 * * * *` | Every gated deploy/apply lane (infra, tfvend, discobots, supervisor); agents posting blockers to #dev | **High** — needs a public endpoint to receive Discord interactions and GitHub webhooks; a LAN home means a tunnel, which is still Cloudflare |
| **robot-geographical-society-backend** ✅ | `api.robogeosociety.xyz`; read API + durable collector. KV `CAMPSITES`, R2 `campsite-raw`/`campsite-vault`, 5 AE datasets, 2 Workflows | The rgs product frontend; Access SSO boundary | **Very high** — public product surface; Workflows and AE have no LAN equivalent |
| **cicd-collector** ✅ | Org CI/CD telemetry → AE; red-CI alerts to #dev; **plus the mini's own disk/mem/swap alerting** off `host_vitals` | Org CI visibility; the mini's health alerting | **Medium-high** — moving it to the mini makes the watchdog co-resident with what it watches, which is the exact failure the retired `stack-watchdog` existed to avoid |
| **host-vitals** ✅ | Ingest for the mini's Vector agent → AE `host_vitals`, `weather_obs` | `com.tommy.vector` (running); Tempest weather feed | **Medium** — needs a local time-series store again (see open question 1) |
| **github-heartbeat** ✅ | Org GitHub activity + daily check-in → #dev; cron `*/30` | #dev signal | **Low** — an Actions cron does this natively |
| **skills-feed** ✅ | New Claude Code skills → #skills; cron `0 */3` + `33 16` | Mini-side `skills-inventory` publisher (supervisor#30) | **Low–medium** — already half mini-side |
| **transit-panel** ✅ | GTFS-Realtime per-line status, one #transit message edited in place; cron `* * * * *` | #transit | **Medium** — every-minute cron; Actions' floor is 5 min, so the mini is the better LAN home |
| **rgs-wiki** ✅ | Serves the dev wiki from KV `rgs-wiki-pages` (10 keys); `REQUIRE_KEY=1` | `dev.robogeosociety.xyz` behind Access | **Low** — the mini already served this on `:5193`; cutover supervisor#35 currently points the other way |
| **mountain-inference** ✅ | `*/15` inference; Cloudflare **Containers** + Durable Object + R2 `is-the-mountain-out-public` | `is-the-mountain-out` state feed | **Medium** — it replaced a mini job; the container could return, but Containers are a deeper commitment than a plain Worker |
| **campsite-supervisor** ⚠️ | Durable Object, Queues (`campsite-work` + DLQ), Workflow `campsite-inventory`, KV, R2 `campsite-artifacts`, AE. Shadow env deployed; shadow KV **empty** | Nothing yet — flip pending supervisor#36 | **N/A — this is the one not to flip.** See open question 2 |
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
| **Tokens** (18) | 16 vended by `cloudflare-tfvend`; 2 hand-made survivors: **`floral-firefly-d65b`** (last used 2026-07-26 — actively in use, unowned by IaC) and **`R2 Account Token`** (never used) | n/a — but see open question 4 |

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

**The catch, verified 2026-07-26.** The documented recovery path is the bootstrap token in
the mini's Keychain (service `cloudflare-tfvend-bootstrap`). That item **exists and is
intact** — created 2026-06-07. But the login keychain refuses non-interactive reads
(`User interaction is not allowed`), so the recovery path **cannot be exercised from a
headless remote session** — which is precisely the mode rgs#167 was built to enable. It
needs Tommy at the machine, and it has never been rehearsed. That is the real risk here,
not the circularity itself.

Note also that `~/.cf.tfn.token` is a **vended** token (Access + tokens-read + zones), not
the bootstrap. Anything assuming that file is the bootstrap is wrong.

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
| supervisor | `docs/cloudflare-workers/PLAN.md` | Frontmatter `status: proposed` → superseded pending open question 2 |

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

## Open questions — Tommy's calls, not mine

**1. Does local observability come back?**
The mini's host metrics and the Tempest weather feed now leave the LAN, land in Cloudflare
AE, and are alerted on by a Worker. There is **no local dashboard at all** — Grafana and
InfluxDB are gone. This is the sharpest tension with "I'm on my local network now."
Options: (a) leave it — AE + Discord alerts work; (b) rebuild a LAN TSDB and keep AE as
the offsite copy; (c) rebuild and retire the AE path. Each is a real amount of work; (a)
is free but leaves LAN telemetry Cloudflare-dependent.

**2. Does supervisor#36 still flip?**
`campsite-supervisor` is a Worker that duplicates a mini supervisor job which still runs.
The burn-in → parity → flip plan is live and pointed at Cloudflare. Under "no new
Workers," is the flip cancelled (shadow stays a proven spike), or is it grandfathered as
already-in-flight? Its shadow KV is empty, so cancelling costs nothing today.

**3. Does supervisor#35 flip, or reverse?**
`rgs-wiki` was lifted to a Worker with byte-parity verified. The mini can serve it. Under
the new posture, is the cutover still wanted, or does the wiki return to the tailnet — and
if so, do the three Access-gated Pages wikis follow?

**4. What happens to `floral-firefly-d65b`?**
A hand-minted, non-IaC token, last used **2026-07-26** — actively load-bearing for
something, and nobody knows what. Options: trace the caller and re-vend it through tfvend,
or leave it. Related: `R2 Account Token` has never been used and is a free revoke, but
revoking is a change to live infrastructure and therefore not mine to make.

**5. Is "no new Workers" absolute, or "no new *fleet-internal* Workers"?**
A genuinely public product surface — the next thing shaped like `walksheds` or the rgs
frontend — has no LAN answer. Reading it as absolute blocks that; reading it as
fleet-internal-only keeps Cloudflare available where it is the only option. This doc
assumes the second reading. **Confirm or correct it** — it is the one place here that
guesses at intent.

**6. Should the one-way-door recovery be rehearsed?**
The bootstrap-token path (§1) has never been tested and needs Tommy at the machine.
A dry run would take minutes and would convert an assumption into a fact.

---

## What this proposal explicitly does not do

- No `wrangler delete`, no Worker removal, no bucket or namespace deletion.
- No migration of any workload, in either direction.
- No token revocation — including the unused one.
- No resolution of the open questions above.
