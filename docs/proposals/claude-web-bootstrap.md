## Problem Statement

A local Claude Code session on the Air or the Mac mini inherits its world for free: `~/.claude/CLAUDE.md` carries the global agent context, `~/.local/bin` carries the tool allowlist, and `gh` is already authed with `project` scope. A **new Claude Code web session** (claude.ai/code) starts blind. It has none of that: no path to GitHub Project #7 "the board", no allowlist, and no copy of the CLAUDE.md-style standards that keep every session on-pattern.

Today a web session is bootstrapped by hand — someone pastes the standards, re-explains the allowlist, and hopes the `gh` token in the environment happens to carry `project` scope. That is slow, drifts the moment the standards change, and violates the master Idea's requirement (robot-geographical-society#163) that **every future session inherit the rules automatically**.

## Requirements

- [ ] A new web session reaches Project #7 read/write with zero manual setup (needs the `project` token scope).
- [ ] It inherits the **current** tool/command allowlist, not a stale paste.
- [ ] It inherits the **latest** global agent context (the CLAUDE.md-style standards) — sourced, not copied.
- [ ] Global context lives in a canonical, version-controlled home so "latest" is unambiguous.
- [ ] Prefer GitHub built-ins; flag explicitly where a paid GitHub Teams plan removes friction.

## Solution

**Canonical home for global context.** Promote the standards out of `~/.claude/CLAUDE.md` (machine-local, invisible to web) into a version-controlled `standard/` area of **robogeosociety/.github** — the repo that already vendors `PR_FRAMEWORK.md`, `standard/ruff.toml`, and the fleet-sync workflow templates. Add `standard/AGENT_CONTEXT.md` (the portable subset of the global CLAUDE.md) and `standard/ALLOWLIST.md` (the tool/command allowlist). Because `.github` is already the fleet's source of truth, "latest" becomes "whatever is on `main`" and fleet-sync propagates it.

**Bootstrap runbook (`docs/proposals/../BOOTSTRAP.md`, shipped by a follow-up task).** A new web session runs one documented step:

1. Confirm token scope: `gh auth status` must show `project`. If missing, the session cannot see board #7 — halt and surface the human step to re-auth.
2. Fetch context: `gh api repos/robogeosociety/.github/contents/standard/AGENT_CONTEXT.md` (+ `ALLOWLIST.md`) and read them into the working context. No clone required, no secrets.
3. Locate the board: `gh project view 7 --owner robogeosociety`.

All three steps are pure GitHub built-ins (`gh api`, `gh project`) — no new service, no webhook.

**Where GitHub Teams would simplify.** On the free plan, Projects v2 access and per-repo tokens are fiddly: `project` scope must be granted per PAT, and org-wide project visibility is limited. A paid **GitHub Teams** plan unlocks org-wide project roles (grant a team read/write on #7 once), finer-grained PATs, and SAML/SSO — turning per-session token juggling into a one-time org grant. Flagged as the paid-tier accelerator, not a blocker.

## Alternatives

- **Keep pasting context manually.** Rejected: drifts on every standards change; violates #163's auto-inherit requirement.
- **Store context in this tracker repo, not `.github`.** Rejected: `.github` already owns the fleet standards and has the sync rail; a second home splits the source of truth.
- **A custom MCP/webhook service to inject context.** Rejected as premature: GitHub built-ins (`gh api` + `gh project`) cover the need with zero new infrastructure. Revisit only if built-ins prove insufficient.

## Tasks

- [ ] Add `standard/AGENT_CONTEXT.md` + `standard/ALLOWLIST.md` to robogeosociety/.github (portable subset of the global CLAUDE.md + allowlist).
- [ ] Write `BOOTSTRAP.md` runbook: token-scope check → `gh api` context fetch → `gh project view 7`.
- [ ] Document the `project`-scope token requirement and the human re-auth step when it is missing.
- [ ] Wire the context files into fleet-sync so "latest on `main`" is authoritative.
- [ ] Evaluate GitHub Teams for org-wide project roles + finer PATs; record the cost/benefit.

## Further Reading

- Master Idea: robot-geographical-society#163
- PR framework: `robogeosociety/.github/PR_FRAMEWORK.md`
- Fleet standardization + `standard/`: `robogeosociety/.github/README.md`, `scripts/sync.sh`
- Board: [Projects v2 #7 "the board"](https://github.com/orgs/robogeosociety/projects/7)
