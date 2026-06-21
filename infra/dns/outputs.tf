output "frontend_records" {
  description = "The managed frontend CNAMEs (hostname → target)."
  value       = { for h, r in cloudflare_dns_record.frontend : h => "${r.type} → ${r.content} (proxied=${r.proxied})" }
}
