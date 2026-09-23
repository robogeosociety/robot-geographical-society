# infra/dns — the one Terraform root left for robogeosociety.xyz

After the 2026-09 reduction this is the **only** TF root that still describes live
intent (`../cloudflare` holds imported data-plane resources; `../access` holds a single
IdP). It manages one record:

| Hostname | Record |
| --- | --- |
| `mountainisout.robogeosociety.xyz` | **DNS-only** (grey cloud) `CNAME` → `robogeosociety.github.io` |

DNS-only is the point: is-the-mountain-out is served directly by GitHub Pages, with no
Worker, Container or R2 in the path. Pages terminates TLS for the custom domain itself,
which only works unproxied. The record already exists in the dashboard — **import it**
before the first apply (the command is in `dns.tf`).

## Removed in the reduction

- `campsites.` and `collectors.` — proxied CNAMEs to the deleted
  `robot-geographical-society-web` Pages project. Dead records.
- `dev.` — the rgs-dev-wiki Cloudflare Tunnel target, retired with `infra/tunnel`.

## Apex and www

`robogeosociety.xyz` / `www.robogeosociety.xyz` stay as they are (dashboard-managed).
Once the apex/www **Worker routes** are removed they will serve **522/1016**, because
they are proxied records with nothing behind them. The proposed follow-up is a free
**Bulk Redirect** to a live destination rather than deleting the records. See the
comment block at the bottom of `dns.tf`.

## Auth

Uses the **vended** `rgs-frontend-dns` token from `../../../cloudflare-tfvend` (zone
DNS Write, `robogeosociety.xyz` only), read from that repo's Terraform output.

## Use

```sh
terraform init
make plan
make apply
```
