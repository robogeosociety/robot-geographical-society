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
