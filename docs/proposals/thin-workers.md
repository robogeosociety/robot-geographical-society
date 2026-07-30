# Proposal — Thin the Workers: the gate stays, the crons come home

**Status:** draft · **Date:** 2026-07-30 · **Partially reverses rgs#167 (2026-07-17)**

rgs#167 moved discobots, obsidian and supervisor infrastructure *onto* Cloudflare. This
proposal moves part of it back. That deserves an explicit justification rather than a
quiet reversal, so: the 07-17 migration was right about **where the public edge belongs**
and wrong about **where the scheduler belongs**. This corrects the second half only.

## What the code actually is

Four Workers run in the `tommy-b-doerr` account. Three of them serve nothing:

| Worker | Lines | HTTP routes | Cron | KV `STATE` |
| --- | --- | --- | --- | --- |
| `deploy-gate` | 1056 | `/interactions` `/github` `/notify` `/request` `/enrich` `/health` | `17 * * * *` | — |
| `github-heartbeat` | 471 | **none** | `*/30 * * * *` | ✅ |
| `skills-feed` | 188 | **none** | `0 */3`, `33 16` | ✅ |
| `transit-panel` | 361 | **none** | `* * * * *` | ✅ |

`github-heartbeat`, `skills-feed` and `transit-panel` export a `scheduled` handler and
nothing else. They are cron jobs in a Worker costume, paying a Worker's constraints —
no filesystem, no subprocess, no CLI — for a scheduler we already own twice over
(Nomad periodic and launchd, both already running the entire Obsidian ETL on the mini).

## The constraint that keeps biting

A Worker cannot run a CLI. This is not theoretical; it is already load-bearing damage:

Both `deploy-gate` and `github-heartbeat` still contain a `haiku()` function that calls
`api.anthropic.com`, guarded by `if (!env.ANTHROPIC_API_KEY) return null;`. There is no
working key. **Every call has silently returned null since it was written.** The
summarization those Workers were built to do now happens in GitHub Actions, reached by
firing `repository_dispatch` at ourselves and shipping the context along in
`client_payload` because `GITHUB_TOKEN` cannot read a private repo from inside a Worker.

That is three hops and a payload-smuggling workaround to run a model that a `claude` CLI
on the mini — already authenticated against the subscription — would run in one.

> _A webhook receiver that outsources all of its compute is not infrastructure. It is a
> shim with a deploy pipeline._

## The split

**Cloudflare keeps the public edge — `deploy-gate` only.**

Discord interactions require a public HTTPS endpoint that answers a signed request in
under three seconds. GitHub webhooks require a public endpoint. Those are real
requirements the mini cannot meet as well, tunnel or no tunnel.

More importantly: **`deploy-gate` is the gate.** rgs#180 made "do not gate the gate"
permanent — a broken gate must remain repairable. Move it to the mini and mini-down
means no deploys, no approval path, and no way to fix either. Cloudflare hosting is what
keeps the gate independent of the host it gates. It stays, and it stays stateless: it
holds no KV, because state lives in the Discord message.

**The mini takes the three schedulers.**

They are feeds and panels. If the mini is down, the transit panel goes stale and the
skills feed pauses. Nothing is gated, nothing is lost, nothing becomes unrepairable.
The blast radius of the mini's known failure modes lands exactly where it is affordable.

This produces a split that reads backwards at first glance and is correct: **the
critical path stays in the cloud, the routine work comes home.**

## Two things this must not gloss over

**KV `STATE` is bound to all three movers.** They are the stateful ones; `deploy-gate` is
not. Each migration has to carry its KV contents to a local store (SQLite or a state file
under the runtime dir) and cannot be a lift-and-shift of the handler alone. This is the
real work in each move, and it is why they go one at a time.

**`transit-panel` cannot go to GitHub Actions.** Its cron is `* * * * *`. Actions'
minimum schedule is five minutes and it is delayed under load — so this one must land as
a Nomad periodic or launchd job, not an Actions lane. The other two (`*/30`, `0 */3`) fit
Actions on the `mini-fleet` runner, which is already online and already serving seven
lanes.

## Rollout

| Phase | Move | Proves | Reversible by |
| --- | --- | --- | --- |
| 1 | `github-heartbeat` → `mini-fleet` Actions | the KV→local-state pattern, on the mover with the most valuable payoff (it can finally run the CLI) | re-deploying the Worker |
| 2 | `skills-feed` → `mini-fleet` Actions | the pattern generalises | same |
| 3 | `transit-panel` → Nomad periodic | the every-minute case, which Actions cannot serve | same |
| 4 | Delete the dead `haiku()` paths from `deploy-gate` | the edge is genuinely thin | revert |

Phase 1 first because it is the one that pays: `github-heartbeat` is where the dead
Haiku path does the most damage, and running it on the mini collapses the
`repository_dispatch` detour into a direct CLI call.

## What would falsify this

The mini's self-hosted lanes are currently over-represented among failures — `repo-sync`
failing, `deploy-exec` cancelled, `eval-weekly` timing out at 45 minutes and never once
completing unattended since it was enabled on 2026-07-25. If those turn out to share a
root cause in the runner or the host rather than in each lane, moving more work onto
`mini-fleet` is the wrong direction and this proposal should stop at Phase 1 until the
runner has a clean week.

That is the honest risk: the destination is the least reliable substrate we have. The
argument for proceeding anyway is that the three movers are precisely the workloads whose
failure costs nothing — and that the gate, which cannot afford it, is not moving.
