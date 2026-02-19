# GitHub Issue Lifecycle Protocol

This document defines the procedure for Claude when addressing GitHub issues in this repository.

## Phase 0: Workspace Isolation

Each session MUST use `git worktree` to prevent conflicts with simultaneous modifications.
- Create a new worktree in a temporary directory for the duration of the task.
- Remove the worktree on completion or session termination.

## Phase 1: Exploration & Understanding

Before proposing changes, understand the codebase:
- Use Grep/Glob to locate relevant components, logic, and tests.
- Read existing patterns, styling, and dependencies.
- Identify test and lint commands (`npm test -- --run`, `npm run lint` from `web/`).

## Phase 2: Implementation & Local Verification

1. **Develop** on a descriptive feature branch (never commit directly to `main`).
2. **Verify** locally from `web/`:
   - `npm test -- --run` — run unit tests.
   - `npm run lint` — run ESLint.
   - `npm run build` — confirm the production build succeeds.
3. **Iterate** until all checks pass.

## Phase 3: Pull Request

1. **Open a PR** targeting `main`, using `Fixes #N` or `Closes #N` keywords in the PR body so GitHub auto-closes the issue on merge.
2. **CI auto-runs**: `.github/workflows/ci.yaml` runs lint, tests, and build. A status comment is posted on the PR.
3. **Wait for review**: Push new commits to the same branch in response to feedback. **Do NOT merge** — keep the PR open until the human maintainer merges it.

## Phase 4: Merge & Closure

1. After the human merges to `main`, the issue is automatically closed by GitHub.
2. `/deploy-preview` is a **manual** command run by the maintainer whenever a preview build is desired — it is not part of the PR or merge workflow.
