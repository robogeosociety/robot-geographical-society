# Proposal — Gates that hold: deploys, merges, and human steps

**Status:** draft · **Date:** 2026-07-27 · **Supersedes the accidental posture set on 2026-07-26**

Gating was relaxed to best-effort on 2026-07-26 — not on merit, but because
`protection_rules=0` made enforcement impossible while the org was on Free with private
repos. The Team upgrade (2026-07-27) removed that limit. This proposal re-implements
gating deliberately, having learned from the outage that immediately preceded it.

## What actually exists today

Every environment across the org carries **zero** protection rules, and no branch has
protection:

| Repo | Environments | Rules |
| --- | --- | --- |
| discobots | `production` | 0 |
| supervisor | `production` | 0 |
| observability-config | `production`, `tailscale-dev` | 0 |
| robot-geographical-society | `production`, `tailscale-dev` | 0 |
| walksheds | `staging`, `github-pages`, 3× `dev-vite` | 0 |

So this is a green field, not a repair.

## The two mechanisms, and why the choice matters

GitHub offers two ways to pause a deployment, and they differ in **who can approve**:

| | Custom deployment protection rule | Required reviewers |
| --- | --- | --- |
| Answered by | the **rgs-deploy-gate App**, via API | a **user or team**, in the GitHub UI |
| Discord Approve button | ✅ works — this is what we built | ❌ Apps cannot be environment reviewers |
| Approval from a phone | ✅ Discord | ⚠️ GitHub UI only |
| Bypass when broken | `/deploy approve` slash command | admin can approve in UI |

**Decided: use both, on the same environment.** The App's custom rule is what makes gating
survivable — approval from Discord is the difference between a gate you clear in ten seconds
and one that waits until you are at a laptop. A **required reviewer on the same environment**
is the floor underneath it: if the Worker is down, the run still pauses and is approvable in
the GitHub UI. Neither alone is enough; the App alone dies with the Worker, and reviewers
alone cost you the phone.

## What to gate — three tiers

Gating everything is how gates get resented and then switched off. Tier by blast radius:

**Tier 1 — always gate (irreversible or credential-bearing)**
- `terraform apply` in `infra` and `cloudflare-tfvend`
- token vending (tfvend), R2 bucket / KV namespace deletion
- anything that mutates the mini's host state

**Tier 2 — gate, but auto-approve self-dispatch**
- production Worker deploys: deploy-gate, github-heartbeat, cicd-collector, transit-panel,
  skills-feed, rgs-wiki
- `AUTO_APPROVE_ACTORS` already implements this: a `workflow_dispatch` you triggered is
  already an expression of intent, so demanding a second tap adds nothing

**Tier 3 — never gate**
- docs, wiki render, dashboards, evals, the enrichment lane

## PR approvals — and the solo-dev trap

Branch protection on `main` should require:

- a pull request before merging
- **status checks green** (`CI`, plus per-repo lanes)
- no force-push, no deletion

It should **not** require an approving review. GitHub forbids approving your own PR, so on a
solo org "require 1 approval" deadlocks every PR unless bypass actors are configured — a
rule that exists only to be bypassed teaches you to bypass rules.

The human step is already better served by the **merge gate**: a `🔀 ready to merge` card
appears only when CI is green and the PR is mergeable, and the Merge button performs a
squash merge through the App. Required checks make that card's promise enforceable rather
than advisory.

## Human approval inside a workflow

No separate environment. Any job that must stop for a person references **`production`**,
which carries both rule types:

```yaml
jobs:
  apply:
    environment: production   # App rule → Discord card; required reviewer → GitHub UI floor
```

The required reviewer is the part that must not depend on our own Worker — it is the lane
you want *because* something is broken. The accepted cost of folding it into `production`
is coupling: a change to that environment's config affects routine deploys and human steps
together, so changes there deserve more care than a per-lane toggle would.

## Failure modes this design must survive

Each of these actually happened on 2026-07-26:

1. **The gate could not post.** An empty secret overwrote the Discord token; runs would have
   hung forever with no card. → `require-secrets` (discobots#117) now fails a job rather
   than overwriting a live credential, and the `/deploy approve` slash command works
   independently of cards.
2. **Cards sank in a busy channel.** → the bump lane re-raises a pending card every
   `BUMP_AFTER_HOURS`, escalating to an @-mention on the last cycle.
3. **Nothing noticed a stuck gate.** → the daily check-in's stale sweep lists waiting
   approvals; add an explicit alert when anything has waited > 12 h.
4. **Do not gate the gate.** Gating deploy-gate's own deploy means a broken gate cannot be
   repaired without a bypass. deploy-gate's deploy stays Tier 3, permanently.

## Rollout

| Phase | Change | Reversible by |
| --- | --- | --- |
| 1 | Branch protection on `main` in discobots + supervisor: PR required, checks green | deleting the rule |
| 2 | Enable the App as a custom protection rule on `discobots/production`; verify a card posts and Approve works end to end | disabling the rule |
| 3 | Extend Tier 2 to the remaining Worker repos | per-environment toggle |
| 4 | Attach a required reviewer to `production` alongside the App rule; move `terraform apply` behind it | removing the reviewer |
| 5 | Alert on approvals waiting > 12 h | revert |

Phase 2 is the one to prove first: it is the exact configuration that was live before, and
the only one whose failure mode we have already seen in production.

## Decisions (2026-07-27)

1. **Branch protection lands on `discobots` + `supervisor` first.** Enough surface to find
   friction — active CI, a self-hosted-runner lane, the wiki render — while a bad rule stays
   a two-repo fix. Extend after a week of real PRs.
2. **Admins and the App keep a bypass.** Tonight is the argument: repairing a broken gate
   needed direct pushes and manual merges. A rule you cannot override during an incident
   *becomes* the incident. The merge gate's App path therefore stays viable even if a check
   lane is itself broken — which also settles the open question about App merges under
   required checks: it is allowed to bypass, so it cannot be locked out.
3. **No separate `human-gate`.** Tier 1 reuses `production`, carrying **both** an App custom
   rule and a required reviewer. Fewer moving parts; the accepted cost is coupling — a change
   to the environment's config affects routine deploys and human steps together.

   The required reviewer on `production` is what preserves the property `human-gate` existed
   for: approval that does not depend on the Discord Worker. If the Worker is down, the run
   still pauses and can be approved in the GitHub UI.

## Still to verify during rollout

- Whether a required reviewer on `production` changes the behaviour of the App's custom rule
  (both attached to one environment is the untested combination this decision creates).
- Whether `AUTO_APPROVE_ACTORS` self-dispatch still short-circuits when a required reviewer
  is also present — if not, Tier 2 gets a second tap it was designed to avoid.
