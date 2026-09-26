# infra/access — the account's GitHub Access IdP (all that is left)

> **This root no longer gates the backend Worker.** As of the 2026-09 reduction it
> manages exactly one resource: the account-level **GitHub identity provider** used by
> the surviving `atlas.robogeosociety.xyz` Access app. Everything else — the
> `api.robogeosociety.xyz` gate, the two frontend gates, the `*.pages.dev` wildcard
> gate, the dev-wiki gate, the local-dev service token and the Google IdP — was
> removed from the configuration.

## Read this before you run `apply`

The resources above were deleted from the **configuration**, not from Cloudflare. They
are still in this root's remote state (R2, `rgs/access.tfstate`), so **the next
`make apply` here plans their destruction.** That is the intended rollout — but it has
two consequences, in order of severity:

1. **The api Worker loses its only authentication.** `backend/src/auth.ts` derives
   identity from the Access JWT (`Cf-Access-Jwt-Assertion`). With the Access app gone,
   every read route on `api.robogeosociety.xyz` is **public**, and no caller can reach
   the `admin` role, so `/collect/*`, `/readiness/start` and the subscription
   mutations all fail closed with 403. Land an in-Worker credential first (the
   consolidation plan calls it `RGS_KEY`).
2. The local-dev service token disappears, so `web/.env.local` stops working. The web
   frontend's Pages project is already deleted, so this only affects local dev.

The GitHub IdP is deliberately **kept**: it is account-scoped and the atlas app is not
managed by Terraform anywhere, so nothing in code proves atlas does not log in through
it. Verify in the dashboard (Zero Trust → Settings → Authentication) before touching
it. See the comment block in `idp-github.tf`.

## Auth

Uses the **vended** `rgs-access-admin` token from `../../../cloudflare-tfvend` (read
from its Terraform output — offline, no bootstrap token needed). State is remote (R2);
credentials come from the vended `tfstate-r2` token, both exported by the Makefile.

## Use

```sh
terraform init
make plan     # expect: destroy the retired apps/token/IdP, no change to the GitHub IdP
make apply    # only after item 1 above is resolved
```

Applying with an empty `TF_VAR_github_client_secret` would overwrite the live GitHub
OAuth secret — the long-standing stomp gotcha. Always read the plan first.
