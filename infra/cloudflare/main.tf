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

# (Removed 2026-09) cloudflare_pages_project.web — the RGS frontend Pages project.
# The project has already been deleted in Cloudflare, so this root no longer models
# it. If the resource is still in state, the next plan shows a no-op destroy; run
# `terraform state rm cloudflare_pages_project.web` if the API 404s on refresh.

# Shared Terraform remote-state bucket (S3-compatible R2). Created here because this root
# holds the rgs-infra R2 Storage Write token; the consumer roots (this one, ../access,
# ../dns, robogeosociety/infra/mapbox) keep their state under distinct keys in it. tfvend stays
# on local state (it vends the S3 creds for this bucket — see cloudflare-tfvend/state.tf).
resource "cloudflare_r2_bucket" "tfstate" {
  account_id = var.account_id
  name       = "tommyroar-tfstate"
}

# Retention on campsite-raw. The bucket holds ~23k objects and grew unbounded; the
# free R2 allowance is 10 GB, so the reduction (2026-09) caps history at 90 days:
#
#   - every object older than 90 days is deleted (whole bucket, empty prefix — that
#     covers raw/ · summary/ · sites/ · watch/ · dlq/ · scheduler/);
#   - incomplete multipart uploads are aborted after 7 days so they stop billing.
#
# TRADE-OFF: the ReadinessWorkflow scans ~60 days of `sites/` history, so it keeps
# working, but its `history_months` / `expected_accuracy` gauges plateau at ~3
# months and the `predict/` backtests lose anything older. Widen max_age here if a
# longer training window is wanted (and accept the storage).
resource "cloudflare_r2_bucket_lifecycle" "campsite_raw" {
  account_id  = var.account_id
  bucket_name = cloudflare_r2_bucket.campsite_raw.name

  rules = [{
    id         = "expire-after-90d"
    enabled    = true
    conditions = { prefix = "" }

    delete_objects_transition = {
      condition = {
        max_age = 7776000 # 90 days, in seconds
        type    = "Age"
      }
    }

    abort_multipart_uploads_transition = {
      condition = {
        max_age = 604800 # 7 days, in seconds
        type    = "Age"
      }
    }
  }]
}
