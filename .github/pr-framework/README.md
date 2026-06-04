# PR newspaper framework (vendored)

Portable copy of the "newspaper / information-pyramid" PR-description framework, so it
travels with the repo and works anywhere Claude Code runs — **including claude.ai/code
(web) and cloud agents**, which clone this repo but do **not** have a developer's local
`~/.claude/` setup or git hooks.

## Files
- **`PR_FRAMEWORK.md`** — the rules, voice, and copy-paste template.
- **`validate_pr.py`** — readability + length validator (no dependencies, stdlib only).

## How any agent should use it
1. Read `PR_FRAMEWORK.md` and write the PR body to a file.
2. Validate: `python3 .github/pr-framework/validate_pr.py <body.md> [--max-pages N]`
   (default 2 pages; 4 for very complex *code* changes).
3. Apply: `gh pr edit <n> --body-file <body.md>` and set the title to the headline,
   prefixed with the change type (e.g. `feat: <headline>`).
4. **Regenerate the whole description from the full diff** on every push and on any
   readability feedback — never append a comment or an "Update" section.

## Local vs. web
On a developer machine a global git pre-push hook (in `~/.claude/pr-framework/`)
regenerates the description automatically. That hook does **not** run in web/cloud — there,
follow the steps above by hand. A `pull_request` GitHub Action could automate it later
(regenerate → validate → `gh pr edit`), gated on a Claude/Anthropic repo secret.

## Note for this (private) repo
Inline images only render from GitHub **user-attachments**, not from committed files.
Link figures by their `blob/<sha>/…` URL with a caption instead of embedding.
