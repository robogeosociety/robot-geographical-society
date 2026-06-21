# infra/dns — DNS for the rgs frontend custom domains

Terraform that manages the **DNS records** for the deployed frontend custom domains:

| Hostname | Record |
| --- | --- |
| `campsites.robogeosociety.xyz` | proxied `CNAME` → `robot-geographical-society-web.pages.dev` |
| `collectors.robogeosociety.xyz` | proxied `CNAME` → `robot-geographical-society-web.pages.dev` |

Both are **gated by Cloudflare Access** (`../access/frontend.tf`). This is a private
project — every hostname must require an Owner SSO login. **Apply the Access gate
first**, so a record never resolves to an unauthenticated app.

## Division of labour (why DNS is the only thing here)

- **Access boundary** → `../access` (Terraform, vended `rgs-access-admin` token).
- **Pages custom-domain attachment** → done on the **wrangler OAuth flow** (like the
  Worker custom-domain bind), because OAuth carries Pages Write.
- **DNS record** → here. OAuth has zone *read* but not DNS *write*, so the record is
  managed with the least-privilege vended **`rgs-frontend-dns`** token (zone DNS Write,
  `robogeosociety.xyz` only — nothing else).

## Auth

Uses the **vended** `rgs-frontend-dns` token from `../../../cloudflare-tfvend` (read
from its Terraform output — offline, no bootstrap token needed). State is local and
gitignored.

## Use

```sh
terraform init
make plan
make apply        # creates the two proxied CNAMEs
```

## Adding a frontend domain

1. Add the hostname to `frontend_hostnames` here **and** to `frontend_hostnames` in
   `../access/frontend.tf` (the gate) — keep them in lockstep.
2. Attach it to the Pages project on the OAuth flow (Cloudflare API
   `POST /accounts/{acc}/pages/projects/{project}/domains`).
3. `make apply` here for the record.
