# Durable RGS data-plane resources, brought under Terraform by IMPORT (never
# recreated — they hold live production data: the KV inventory and months of R2
# snapshots). wrangler.toml keeps referencing these by id/name; `wrangler deploy`
# still deploys the code into them. See README.md for the import commands.

# The CAMPSITES KV namespace — authoritative campsite inventory (`_inventory`) plus
# per-campsite detail. wrangler.toml binds it by id (aad9f04d…); CI writes `_inventory`
# via the rgs-kv-write token.
resource "cloudflare_workers_kv_namespace" "campsites" {
  account_id = var.account_id
  title      = var.kv_namespace_title
}

# The campsite-raw R2 bucket — banked availability snapshots
# (raw/ · summary/ · sites/ · watch/ · dlq/ · scheduler/). Read by the Worker's
# read-api; written by the collector Workflows.
resource "cloudflare_r2_bucket" "campsite_raw" {
  account_id = var.account_id
  name       = var.r2_bucket_name
}

# The RGS frontend Pages project. Terraform owns the project shell (name + production
# branch); `wrangler pages deploy` / CI still pushes the built assets, and the
# custom-domain attachments (campsites/collectors) stay on the wrangler OAuth flow,
# matching the Worker custom-domain split.
resource "cloudflare_pages_project" "web" {
  account_id        = var.account_id
  name              = var.pages_project_name
  production_branch = var.pages_production_branch
}

# Shared Terraform remote-state bucket (S3-compatible R2). Created here because this root
# holds the rgs-infra R2 Storage Write token; the consumer roots (this one, ../access,
# ../dns, robogeosociety/infra/mapbox) keep their state under distinct keys in it. tfvend stays
# on local state (it vends the S3 creds for this bucket — see cloudflare-tfvend/state.tf).
resource "cloudflare_r2_bucket" "tfstate" {
  account_id = var.account_id
  name       = "tommyroar-tfstate"
}
