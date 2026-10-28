# infra/dns — DNS for robogeosociety.xyz

Terraform for the records left on `robogeosociety.xyz` after the Cloudflare
decommission (2026-10-28, robogeosociety/infra `docs/cloudflare-decommission.md`):

| Hostname | Record |
| --- | --- |
| `robogeosociety.xyz`, `www.robogeosociety.xyz` | proxied `A` → `192.0.2.1`, reserved for short URLs |
| `mountainisout.robogeosociety.xyz` | DNS-only `CNAME` → `robogeosociety.github.io` (is-the-mountain-out) |

Gone: the Pages frontend CNAMEs (`campsites.`, `collectors.`), `dev.` (dev wiki), `api.`
(the backend Worker) and `atlas.` (travel wiki, now on the tailnet).

## Auth

Uses the **vended** `rgs-frontend-dns` token from `cloudflare-tfvend` (zone DNS Write,
this zone only), read from its Terraform output on the mini. State is on R2
(`tommyroar-tfstate/rgs/dns.tfstate`); the backend creds are the vended `tfstate-r2` pair.

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
