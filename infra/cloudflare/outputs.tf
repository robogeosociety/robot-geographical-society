# The ids/names wrangler.toml references, surfaced so the deploy manifest and this
# Terraform root never drift on identity.
output "kv_namespace_id" {
  description = "CAMPSITES KV namespace id (matches wrangler.toml [[kv_namespaces]].id)."
  value       = cloudflare_workers_kv_namespace.campsites.id
}

output "r2_bucket_name" {
  description = "campsite-raw R2 bucket name (matches wrangler.toml [[r2_buckets]].bucket_name)."
  value       = cloudflare_r2_bucket.campsite_raw.name
}

output "pages_project_name" {
  description = "RGS frontend Pages project name."
  value       = cloudflare_pages_project.web.name
}
