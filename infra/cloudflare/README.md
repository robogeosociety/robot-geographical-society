# infra/cloudflare — RGS data-plane resources (Terraform)

Terraform that owns the durable, previously click-ops'd Cloudflare **data-plane**
resources behind the RGS backend + frontend:

- `cloudflare_workers_kv_namespace.campsites` — the **CAMPSITES** KV namespace
  (id `aad9f04d…`; authoritative inventory `_inventory` + per-campsite detail).
- `cloudflare_r2_bucket.campsite_raw` — the **campsite-raw** R2 bucket (banked
  availability snapshots: `raw/ · summary/ · sites/ · watch/ · dlq/ · scheduler/`).
- `cloudflare_pages_project.web` — the **robot-geographical-society-web** Pages project.

## What this does NOT manage (by design)

- **Worker / Pages code** → `wrangler deploy` / `wrangler pages deploy` (OAuth). Terraform
  owns the resource shells; wrangler deploys code into them.
- **Worker + Pages custom-domain attachment** → wrangler OAuth (same split as the Worker
  domain bind). The DNS *records* live in `../dns`.
- **Access boundary** → `../access`. **Worker bindings / vars / AE datasets / Workflows**
  → `backend/wrangler.toml` (the deploy manifest — single source for those).

So `wrangler.toml` and this root must agree on **identity only** (the KV id and bucket
name); the outputs here surface them to keep the two from drifting.

## Auth

Uses the **vended** `rgs-infra` token from `../../../cloudflare-tfvend` (KV Write + R2
Storage Write + Pages Write, account-scoped — it cannot touch Access, DNS, or deploy
code). The Makefile reads it from that repo's Terraform output; no bootstrap needed.

## Import, never recreate

The KV namespace and R2 bucket hold **live production data**. These resources were
**imported**, not created — `terraform apply` must never recreate them.

```sh
terraform init
make import        # one-time adopt (idempotent on the cloud side — import only writes state)
make plan          # GATE: must report "No changes" / 0 to destroy
```

`make destroy` is intentionally disabled here; remove a resource from management with
`terraform state rm` instead.

## State (local) + re-adopting

State is **local and gitignored** (same as `../access`, `../dns`). A fresh clone or a
removed worktree therefore has no state — don't `apply` blind. Re-adopt with:

```sh
terraform init && make import && make plan   # plan must show "No changes"
```

Because the per-root local-state model is now repeated across several roots, migrating
these to a shared **R2 (S3) backend** is the planned hardening step (tfvend already
vends R2 S3 creds). Until then, re-import is the recovery path.
