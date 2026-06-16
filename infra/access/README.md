# infra/access — Cloudflare Access boundary for the backend Worker

Terraform that defines the **trusted auth boundary** in front of the backend Worker.
This is a private project: the Worker must never be reachable without satisfying one
of these policies.

## What it manages

- A **self-hosted Access application** on `api.robogeosociety.xyz`.
- Two **policies**: owner SSO (email, via the account IdP / one-time PIN) and a
  **service token** for the local Vite dev proxy.
- The **service token** itself (its secret flows to `web/.env.local`).

The Worker custom-domain bind (`api.robogeosociety.xyz` → the Worker) is done with
**wrangler**, not here — Workers stay on the OAuth flow. Order matters: apply this
**first** (the gate), then bind the domain, so there is never an unauthenticated window.

## Auth

Uses the **vended** `rgs-access-admin` token from `../../../cloudflare-tfvend` (read
from its Terraform output — offline, no bootstrap token needed). State holds the
service-token secret and is gitignored.

## Use

```sh
terraform init
make plan
make apply        # creates the Access app + service token
make envfile      # writes ../../web/.env.local (BACKEND_URL + service token)
# then bind the domain:  cd ../../backend && wrangler ... (see PR)
```

## Recovering after a lost state file

State is local and gitignored, so a fresh clone (or a removed worktree) has no record
of the live Access app + service token. Don't `apply` blind — that creates duplicates.
Instead re-adopt the existing resources, then rotate the (unrecoverable) token secret:

```sh
terraform init
ACC=d7adee58513c1b2f770ccaac90cf114f
export CLOUDFLARE_API_TOKEN=$(terraform -chdir=../../../cloudflare-tfvend output -raw rgs_access_admin_token)
# Look up the live ids (one app, one service token):
curl -s -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  "https://api.cloudflare.com/client/v4/accounts/$ACC/access/apps" | jq '.result[]|{id,domain}'
curl -s -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  "https://api.cloudflare.com/client/v4/accounts/$ACC/access/service_tokens" | jq '.result[]|{id,name}'

terraform import cloudflare_zero_trust_access_application.backend "accounts/$ACC/<app-id>"
terraform import cloudflare_zero_trust_access_service_token.dev   "accounts/$ACC/<token-id>"

# Import can't recover the secret (Cloudflare emits it once), so rotate it. The
# create_before_destroy lifecycle mints the replacement and re-points the app policy
# before deleting the old token (Cloudflare won't delete a token a policy references):
terraform apply -replace=cloudflare_zero_trust_access_service_token.dev
make envfile
```
